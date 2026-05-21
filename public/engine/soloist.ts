import { TIME_SIGNATURES } from '../config.js';
import type { SoloistState } from '../state/instruments.js';
import type {
    Chord,
    EnsembleState,
    FormArcEntry,
    FormArcOccurrenceEntry,
    Mutable,
    SectionRecallEntry,
    StepInfo,
} from '../types.js';
import { applyBluesBends, calculateTimingOffset, getFrequency } from '../utils.js';
import { getSectionContext, normalizeLoopStep } from './arranger-utils.js';
import { scrambleHash, stringHash31 } from './hash-utils.js';
import {
    INFLUENCE_POOLS,
    resolveSoloistStyle,
    SOLOIST_INTENTS,
    STYLE_CONFIG,
} from './soloist-config.js';
import { selectPitchAndDevices } from './soloist-pitch-engine.js';
import { generateRhythmPlan } from './soloist-rhythm-engine.js';
import { getScaleForChord } from './theory-scales.js';

type PhraseResponseSource = 'free' | 'form' | 'seed' | 'section' | 'recent';

// Deterministic PRNG helpers: `scrambleHash` (single-shot) and
// `makeSeededStream` (advancing stream) are imported from the canonical
// `hash-utils.ts`. Epic 12 S1 migrated every un-seeded `Math.random()` in the
// soloist engine onto these — see `soloistSeedBase` below for the per-call
// seed-keying scheme. (Before S1 this file carried a byte-identical local
// `scrambleHash` copy that Epic 11 S9a deliberately left for this story.)

/**
 * soloistSeedBase — fold a soloist call's stable identity into a single
 * integer seed for `scrambleHash` / `makeSeededStream`.
 *
 * why: every soloist decision must replay identically when the same
 * `(step, section, loop)` recurs — looped playback stays coherent and the
 * engine-determinism critique test can assert byte-reproducibility WITHOUT
 * stubbing `Math.random`. The seed folds:
 *   - `step` — the absolute timeline step (distinguishes every grid position);
 *   - the section label + occurrence — so Verse-1 and Verse-2 at the same
 *     bar-relative step get independent streams (no cross-section echo);
 *   - `loopCount` — so successive choruses of the SAME section step still
 *     differ (the Chorus-Evolution arc needs per-loop variation).
 * Callers add a small per-draw discriminator constant so two draws at one
 * step don't collide. The result is run through `scrambleHash`'s mulberry32
 * avalanche by the consumer, so adjacent seeds never sawtooth.
 */
function soloistSeedBase(
    step: number,
    sectionLabel: string,
    sectionOccurrence: number,
    loopCount: number,
): number {
    return (
        (step * 2749 +
            stringHash31(sectionLabel) * 17 +
            (sectionOccurrence | 0) * 131 +
            Math.max(0, loopCount) * 5471) |
        0
    );
}

const MOTIVIC_RESPONSE_STYLES = new Set([
    'blues',
    'jazz',
    'bird',
    'rock',
    'scalar',
    'neo',
    'bossa',
]);

/**
 * Resets the internal generative state of the soloist.
 * Called when the transport is flushed or reset.
 *
 * @worker-mutation — clears the `session` sub-tree and the `audio` runtime
 * (`lastMidiPlayed` / `lastFreq` etc.) to their initial shape. `session.seed`
 * is owned by `state-effects.generateSessionSeed()` and is not touched here.
 */
export function resetSoloistState(state: EnsembleState): void {
    const session = state.soloist.session as Mutable<typeof state.soloist.session>;
    const phrasing = session.phrasing as Mutable<typeof session.phrasing>;
    const memory = session.memory as Mutable<typeof session.memory>;
    const currentPhrase = session.currentPhrase as Mutable<typeof session.currentPhrase>;
    const rhythm = session.rhythm as Mutable<typeof session.rhythm>;
    const context = currentPhrase.context as Mutable<typeof currentPhrase.context>;

    session.sessionSteps = 0;

    phrasing.state = 'rest';
    phrasing.isResting = true;
    phrasing.transitionState = null;
    phrasing.restSteps = 0;
    phrasing.activeSteps = 0;
    phrasing.busySteps = 0;

    currentPhrase.startStep = null;
    currentPhrase.loopCount = null;
    currentPhrase.sectionLabel = null;
    currentPhrase.sectionOccurrence = 0;

    context.role = 'call';
    context.skeleton = [];
    context.lastInterval = null;
    context.signature = null;
    context.responseSignature = null;
    context.restatementEcho = null;
    context.responseMode = 'free';
    context.responseSource = 'free';
    context.sectionLabel = null;
    context.sectionOccurrence = 0;

    memory.rhythmicMotif = [];
    memory.recentNotes = [];
    memory.hookBuffer = [];
    memory.sharedHookBuffer = [];
    memory.sectionRecall = {};
    memory.sectionRecallLoop = null;
    memory.formArcRecall = {};

    rhythm.deviceBuffer = [];

    // why: the `audio` runtime carries cross-call voice-leading state —
    // `lastMidiPlayed` feeds the pitch engine's interval decision. A reset that
    // left it stale made the first note after a transport flush voice-lead off
    // the previous session's final pitch. activeVoices/buffer are main-thread
    // synth voice tracking — owned by the synth lifecycle, not cleared here.
    const audio = state.soloist.audio as Mutable<typeof state.soloist.audio>;
    audio.lastFreq = null;
    audio.lastMidiPlayed = null;
    audio.lastRenderedFreq = null;
    audio.lastPlayedFreq = null;
    audio.lastNoteEnd = 0;
}

// getSectionContext + normalizeLoopStep moved to ./arranger-utils.ts (S2,
// Imperfect Symmetry — single source of truth for both soloist's SRDC and
// the coordination-context preamble that publishes sectionOccurrence).

// SRDC phase derivation (Statement / Restatement / Departure / Conclusion).
// Mirrors the seeder's logic at soloist-seeder.ts:1602-1603 so live phrase
// pitch selection and the seeded head motif agree on where in the form we are.
// Departure categories follow soloist-seeder.ts:isDepartureCategory.
const DEPARTURE_LABEL_KEYWORDS = ['chorus', 'bridge', 'prechorus', 'drop'];
function deriveSrdcPhase(
    sectionContext: ReturnType<typeof getSectionContext>,
    step: number,
    stepsPerMeasure: number,
): 'statement' | 'restatement' | 'departure' | 'conclusion' {
    const label = (sectionContext.label || '').toLowerCase();
    const isOutro = label.includes('outro') || label.includes('end');
    const isLastMeasureOfSection =
        sectionContext.sectionEnd > 0 && sectionContext.sectionEnd - step <= stepsPerMeasure * 2;
    if (isOutro || (sectionContext.isLastSection && isLastMeasureOfSection)) {
        return 'conclusion';
    }
    if (DEPARTURE_LABEL_KEYWORDS.some((k) => label.includes(k))) {
        return 'departure';
    }
    if (sectionContext.isRestatement) {
        return 'restatement';
    }
    return 'statement';
}

function ensureSectionRecallLoop(soloist: SoloistState, loopCount: number): void {
    if (
        !soloist.session.memory.sectionRecall ||
        typeof soloist.session.memory.sectionRecall !== 'object' ||
        Array.isArray(soloist.session.memory.sectionRecall)
    ) {
        (soloist.session.memory as Mutable<typeof soloist.session.memory>).sectionRecall = {}; // @worker-mutation
    }
    if (
        !Number.isFinite(soloist.session.memory.sectionRecallLoop as number) ||
        soloist.session.memory.sectionRecallLoop !== loopCount
    ) {
        (soloist.session.memory as Mutable<typeof soloist.session.memory>).sectionRecall = {}; // @worker-mutation
        (soloist.session.memory as Mutable<typeof soloist.session.memory>).sectionRecallLoop =
            loopCount; // @worker-mutation
    }
}

function ensureFormArcRecall(soloist: SoloistState): void {
    if (
        !soloist.session.memory.formArcRecall ||
        typeof soloist.session.memory.formArcRecall !== 'object' ||
        Array.isArray(soloist.session.memory.formArcRecall)
    ) {
        (soloist.session.memory as Mutable<typeof soloist.session.memory>).formArcRecall = {}; // @worker-mutation
    }
}

function storeSectionRecallSignature(
    soloist: SoloistState,
    loopCount: number,
    signature: any,
): void {
    if (!signature?.notes?.length || !soloist.session.currentPhrase.sectionLabel) {
        return;
    }

    ensureSectionRecallLoop(soloist, loopCount);

    const label = soloist.session.currentPhrase.sectionLabel;
    const occurrence = Math.max(1, soloist.session.currentPhrase.sectionOccurrence || 1);
    signature.sectionLabel = label;
    signature.sectionOccurrence = occurrence;

    const existingEntry: SectionRecallEntry =
        soloist.session.memory.sectionRecall &&
        typeof soloist.session.memory.sectionRecall[label] === 'object'
            ? soloist.session.memory.sectionRecall[label]
            : {};
    if (!existingEntry.firstSignature || occurrence <= 1) {
        existingEntry.firstSignature = signature;
        existingEntry.firstOccurrence = occurrence;
    }
    existingEntry.latestSignature = signature;
    existingEntry.latestOccurrence = occurrence;
    soloist.session.memory.sectionRecall[label] = existingEntry; // @worker-mutation
}

/**
 * Preserve section signatures across chorus changes so later loops can answer with longer-form memory.
 */
function storeFormArcRecallSignature(
    soloist: SoloistState,
    sourceLoop: number,
    signature: any,
): void {
    if (!signature?.notes?.length || !soloist.session.currentPhrase.sectionLabel) {
        return;
    }

    ensureFormArcRecall(soloist);

    const label = soloist.session.currentPhrase.sectionLabel;
    const occurrence = Math.max(1, soloist.session.currentPhrase.sectionOccurrence || 1);
    const loop = Number.isFinite(sourceLoop) ? sourceLoop : 0;
    const existingEntry: FormArcEntry =
        soloist.session.memory.formArcRecall &&
        typeof soloist.session.memory.formArcRecall[label] === 'object'
            ? soloist.session.memory.formArcRecall[label]
            : { byOccurrence: {} };
    const byOccurrence: Record<string, FormArcOccurrenceEntry> =
        existingEntry.byOccurrence &&
        typeof existingEntry.byOccurrence === 'object' &&
        !Array.isArray(existingEntry.byOccurrence)
            ? existingEntry.byOccurrence
            : {};
    const occurrenceKey = String(occurrence);
    const occurrenceEntry: FormArcOccurrenceEntry =
        byOccurrence[occurrenceKey] && typeof byOccurrence[occurrenceKey] === 'object'
            ? byOccurrence[occurrenceKey]
            : {};

    if (!occurrenceEntry.firstSignature || !Number.isFinite(occurrenceEntry.firstLoop)) {
        occurrenceEntry.firstSignature = signature;
        occurrenceEntry.firstLoop = loop;
    }
    occurrenceEntry.latestSignature = signature;
    occurrenceEntry.latestLoop = loop;
    byOccurrence[occurrenceKey] = occurrenceEntry;
    existingEntry.byOccurrence = byOccurrence;

    if (!existingEntry.firstSignature || !Number.isFinite(existingEntry.firstLoop)) {
        existingEntry.firstSignature = signature;
        existingEntry.firstLoop = loop;
        existingEntry.firstOccurrence = occurrence;
    }
    existingEntry.latestSignature = signature;
    existingEntry.latestLoop = loop;
    existingEntry.latestOccurrence = occurrence;
    soloist.session.memory.formArcRecall[label] = existingEntry; // @worker-mutation
}

function getFormArcRecallCandidate(
    soloist: SoloistState,
    sectionContext: { label: string; occurrence: number },
    loopCount: number,
): { signature: any; source: 'form'; sameOccurrence: boolean } | null {
    if (!Number.isFinite(loopCount) || loopCount <= 0) {
        return null;
    }

    ensureFormArcRecall(soloist);

    const labelEntry =
        soloist.session.memory.formArcRecall &&
        typeof soloist.session.memory.formArcRecall[sectionContext.label] === 'object'
            ? soloist.session.memory.formArcRecall[sectionContext.label]
            : null;
    if (!labelEntry) {
        return null;
    }

    const occurrenceKey = String(Math.max(1, sectionContext.occurrence || 1));
    const occurrenceEntry =
        labelEntry.byOccurrence && typeof labelEntry.byOccurrence[occurrenceKey] === 'object'
            ? labelEntry.byOccurrence[occurrenceKey]
            : null;

    if (
        occurrenceEntry?.latestSignature?.notes?.length &&
        (occurrenceEntry.latestLoop ?? Infinity) < loopCount
    ) {
        return {
            signature: occurrenceEntry.latestSignature,
            source: 'form',
            sameOccurrence: true,
        };
    }
    if (
        occurrenceEntry?.firstSignature?.notes?.length &&
        (occurrenceEntry.firstLoop ?? Infinity) < loopCount
    ) {
        return {
            signature: occurrenceEntry.firstSignature,
            source: 'form',
            sameOccurrence: true,
        };
    }
    if (
        labelEntry.latestSignature?.notes?.length &&
        (labelEntry.latestLoop ?? Infinity) < loopCount
    ) {
        return {
            signature: labelEntry.latestSignature,
            source: 'form',
            sameOccurrence: false,
        };
    }
    if (
        labelEntry.firstSignature?.notes?.length &&
        (labelEntry.firstLoop ?? Infinity) < loopCount
    ) {
        return {
            signature: labelEntry.firstSignature,
            source: 'form',
            sameOccurrence: false,
        };
    }

    return null;
}

function buildPhraseSignatureFromEvents(
    noteEvents: any[],
    phraseStartStep: number | null,
    sourceLoop: number,
    sourceKind: 'performed' | 'seed' = 'performed',
): any {
    const orderedEvents = [...noteEvents]
        .filter((event) => Number.isFinite(event?.midi) && Number.isFinite(event?.step))
        .sort((a, b) => a.step - b.step || a.midi - b.midi);
    if (orderedEvents.length === 0) {
        return null;
    }

    const startStep =
        Number.isFinite(phraseStartStep) && phraseStartStep !== null
            ? phraseStartStep
            : orderedEvents[0].step;
    const notes: any[] = [];

    for (const event of orderedEvents) {
        const pitchClass = normalizeLoopStep(event.midi, 12);
        const stepOffset = Math.max(0, event.step - startStep);
        const previous = notes[notes.length - 1] || null;
        if (
            previous &&
            previous.stepOffset === stepOffset &&
            previous.pitchClass === pitchClass &&
            previous.midi === event.midi
        ) {
            continue;
        }
        notes.push({
            stepOffset,
            durationSteps: Math.max(1, Math.round(event.durationSteps || 1)),
            pitchClass,
            midi: Math.round(event.midi),
            velocity: event.velocity ?? 0.8,
            isStrongBeat: Boolean(event.isStrongBeat),
            tripletPlacement: event.tripletPlacement || null,
            timingOffset: Number.isFinite(event.timingOffset) ? event.timingOffset : 0,
            direction:
                previous && Number.isFinite(previous.midi)
                    ? Math.sign(Math.round(event.midi) - previous.midi)
                    : 0,
            isAnchor: Boolean(event.isAnchor),
        });
    }

    if (notes.length === 0) {
        return null;
    }

    const finalNote = notes[notes.length - 1];
    const anchorPitchClasses = [
        ...new Set(
            notes
                .filter(
                    (note, index) =>
                        note.isAnchor ||
                        note.isStrongBeat ||
                        index === 0 ||
                        index === notes.length - 1,
                )
                .map((note) => note.pitchClass),
        ),
    ].slice(0, 4);

    return {
        sourceKind,
        sourceLoop,
        spanSteps: finalNote.stepOffset + finalNote.durationSteps,
        entryPitchClass: notes[0].pitchClass,
        cadencePitchClass: finalNote.pitchClass,
        anchorPitchClasses,
        tripletCarry: notes.some((note) => Boolean(note.tripletPlacement)),
        notes,
    };
}

function buildSeedPhraseSignature(
    sessionSeed: any,
    step: number,
    activeSteps: number,
    stepsPerMeasure: number,
    stepsPerBeat: number,
    loopCount: number,
): any {
    const loopLength = sessionSeed?.loopLengthSteps || 0;
    if (!loopLength || !sessionSeed?.notes?.length) {
        return null;
    }

    const stepInLoop = normalizeLoopStep(step, loopLength);
    const windowLength = Math.max(
        stepsPerMeasure,
        Math.min(loopLength, activeSteps > 0 ? activeSteps : stepsPerMeasure * 2),
    );
    const orderedNotes = sessionSeed.notes
        .filter((note: any) => Number.isFinite(note?.step) && note.step >= 0)
        .map((note: any) => ({
            ...note,
            relativeStep: normalizeLoopStep(note.step - stepInLoop, loopLength),
            measureStep: normalizeLoopStep(note.step, loopLength) % stepsPerMeasure,
        }))
        .sort((a: any, b: any) => a.relativeStep - b.relativeStep || a.midi - b.midi);
    const windowNotes = orderedNotes.filter((note: any) => note.relativeStep < windowLength);
    const sourceNotes = (windowNotes.length > 0 ? windowNotes : orderedNotes.slice(0, 8)).slice(
        0,
        8,
    );
    if (sourceNotes.length === 0) {
        return null;
    }

    const rebaseStart = sourceNotes[0].relativeStep;
    return buildPhraseSignatureFromEvents(
        sourceNotes.map((note: any) => ({
            step: note.relativeStep - rebaseStart,
            durationSteps: note.durationSteps || 1,
            midi: note.midi,
            velocity: note.velocity || 0.8,
            isStrongBeat: note.measureStep % stepsPerBeat === 0 || note.measureStep === 0,
            tripletPlacement: note.tripletPlacement || null,
            timingOffset: note.timingOffset || 0,
            isAnchor: Boolean(note.isAnchor),
        })),
        0,
        Math.max(0, loopCount - 1),
        'seed',
    );
}

function commitTrackedPhraseSignature(soloist: SoloistState, loopCount: number): void {
    if (
        !Array.isArray(soloist.session.memory.recentNotes) ||
        soloist.session.memory.recentNotes.length === 0
    ) {
        return;
    }

    const sourceLoop = Number.isFinite(soloist.session.currentPhrase.loopCount)
        ? Number(soloist.session.currentPhrase.loopCount)
        : loopCount;

    const signature = buildPhraseSignatureFromEvents(
        soloist.session.memory.recentNotes,
        soloist.session.currentPhrase.startStep,
        sourceLoop,
        'performed',
    );
    if (soloist.session.currentPhrase.context && signature) {
        signature.sectionLabel = soloist.session.currentPhrase.sectionLabel || null;
        signature.sectionOccurrence = Math.max(
            1,
            soloist.session.currentPhrase.sectionOccurrence || 1,
        );
        soloist.session.currentPhrase.context.signature = signature; // @worker-mutation
    }
    storeSectionRecallSignature(soloist, sourceLoop, signature);
    storeFormArcRecallSignature(soloist, sourceLoop, signature);
    (soloist.session.memory as Mutable<typeof soloist.session.memory>).recentNotes = []; // @worker-mutation
    (soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>).startStep =
        null; // @worker-mutation
    (soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>).loopCount =
        null; // @worker-mutation
    (soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>).sectionLabel =
        null; // @worker-mutation
    (
        soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>
    ).sectionOccurrence = 0; // @worker-mutation
}

function trackPhraseNote(
    soloist: SoloistState,
    step: number,
    result: any,
    sourceNode: any,
    loopCount: number,
    stepsPerBeat: number,
    stepsPerMeasure: number,
): void {
    if (!result || !sourceNode) {
        return;
    }

    const results = Array.isArray(result) ? result : [result];
    const primary = results[results.length - 1];
    if (!primary || !Number.isFinite(primary.midi)) {
        return;
    }

    if (!Array.isArray(soloist.session.memory.recentNotes)) {
        (soloist.session.memory as Mutable<typeof soloist.session.memory>).recentNotes = []; // @worker-mutation
    }
    if (
        !Number.isFinite(soloist.session.currentPhrase.startStep) ||
        soloist.session.currentPhrase.startStep === null
    ) {
        (soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>).startStep =
            step; // @worker-mutation
        (soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>).loopCount =
            loopCount; // @worker-mutation
    }
    if (sourceNode.sectionLabel && !soloist.session.currentPhrase.sectionLabel) {
        (
            soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>
        ).sectionLabel = sourceNode.sectionLabel; // @worker-mutation
        (
            soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>
        ).sectionOccurrence = Math.max(1, sourceNode.sectionOccurrence || 1); // @worker-mutation
    }

    const lastTracked =
        soloist.session.memory.recentNotes[soloist.session.memory.recentNotes.length - 1] || null;
    if (lastTracked) {
        const gap = step - (lastTracked.step + Math.max(1, lastTracked.durationSteps || 1));
        const phraseSpan = step - (soloist.session.currentPhrase.startStep ?? step);
        if (gap >= stepsPerBeat || phraseSpan >= stepsPerMeasure * 2) {
            commitTrackedPhraseSignature(soloist, loopCount);
            (
                soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>
            ).startStep = step; // @worker-mutation
            (
                soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>
            ).loopCount = loopCount; // @worker-mutation
            if (sourceNode.sectionLabel) {
                (
                    soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>
                ).sectionLabel = sourceNode.sectionLabel; // @worker-mutation
                (
                    soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>
                ).sectionOccurrence = Math.max(1, sourceNode.sectionOccurrence || 1); // @worker-mutation
            }
        }
    }

    soloist.session.memory.recentNotes.push({
        step,
        durationSteps: Math.max(
            1,
            Math.round(primary.durationSteps || sourceNode.durationSteps || 1),
        ),
        midi: Math.round(primary.midi),
        velocity: primary.velocity ?? sourceNode.velocity ?? 0.8,
        isStrongBeat: Boolean(sourceNode.isStrongBeat),
        tripletPlacement:
            primary.tripletPlacement ||
            sourceNode.tripletPlacement ||
            sourceNode.seedNote?.tripletPlacement ||
            null,
        timingOffset:
            primary.timingOffset ||
            sourceNode.timingOffset ||
            sourceNode.seedNote?.timingOffset ||
            0,
        isAnchor: Boolean(
            sourceNode.seedNote?.isAnchor ||
                sourceNode.responseCadenceTarget ||
                sourceNode.responseEntryTarget,
        ),
    }); // @worker-mutation
}

function preparePhraseResponseContext(
    soloist: SoloistState,
    activeStyle: string,
    sessionSeed: any,
    step: number,
    activeSteps: number,
    loopCount: number,
    stepsPerMeasure: number,
    stepsPerBeat: number,
    arranger: any,
): void {
    if (!soloist.session.currentPhrase.context) {
        return;
    }

    commitTrackedPhraseSignature(soloist, loopCount);
    ensureSectionRecallLoop(soloist, loopCount);

    const styleConfig: any = (STYLE_CONFIG as any)[activeStyle] || STYLE_CONFIG.scalar;
    const responseConfig = styleConfig.motivicResponse || null;
    const hasDynamicHeadSeed = Boolean(sessionSeed?.notes?.length);
    const canUseMotivicResponse = Boolean(
        responseConfig?.enabled && MOTIVIC_RESPONSE_STYLES.has(activeStyle) && hasDynamicHeadSeed,
    );
    const sectionContext = getSectionContext(arranger, step);
    const sectionEntry =
        sectionContext.isRestatement &&
        soloist.session.memory.sectionRecall &&
        typeof soloist.session.memory.sectionRecall[sectionContext.label] === 'object'
            ? soloist.session.memory.sectionRecall[sectionContext.label]
            : null;
    const sectionSignature = sectionEntry?.firstSignature?.notes?.length
        ? sectionEntry.firstSignature
        : null;
    const formArcCandidate = getFormArcRecallCandidate(soloist, sectionContext, loopCount);

    // why: seed the call/response role roll deterministically (Epic 12 S1).
    // Keyed on (step, section, loopCount); the two branches below are mutually
    // exclusive so they can share discriminator +1 — only one fires per call.
    const roleSeedBase = soloistSeedBase(
        step,
        sectionContext.label,
        sectionContext.occurrence,
        loopCount,
    );
    let nextRole = 'call';
    if (canUseMotivicResponse) {
        const wasCall = (soloist.session.currentPhrase.context.role || 'call') === 'call';
        const responseProb = loopCount <= 1 ? (wasCall ? 0.88 : 0.28) : wasCall ? 0.7 : 0.24;
        nextRole = scrambleHash(roleSeedBase + 1) < responseProb ? 'response' : 'call';
    } else if (['blues', 'jazz', 'rock', 'scalar'].includes(activeStyle)) {
        const wasCall = (soloist.session.currentPhrase.context.role || 'call') === 'call';
        const responseProb = wasCall ? 0.7 : 0.2;
        nextRole = scrambleHash(roleSeedBase + 1) < responseProb ? 'response' : 'call';
    }

    soloist.session.currentPhrase.context.role = nextRole; // @worker-mutation
    soloist.session.currentPhrase.context.responseMode =
        nextRole === 'response' ? (loopCount <= 1 ? 'paraphrase' : 'development') : 'free'; // @worker-mutation
    soloist.session.currentPhrase.context.sectionLabel = sectionContext.label; // @worker-mutation
    soloist.session.currentPhrase.context.sectionOccurrence = sectionContext.occurrence; // @worker-mutation

    // SRDC Restatement motif-echo (Epic 11 S4). `srdcState` still holds the
    // PREVIOUS phrase's phase at this point — capture it before the overwrite
    // so we can detect a Statement→Restatement transition. `context.signature`
    // was just refreshed by commitTrackedPhraseSignature above and now holds
    // the just-finished phrase's signature.
    const previousSrdcPhase = soloist.session.currentPhrase.context.srdcState;
    const lastSignature = soloist.session.currentPhrase.context.signature;
    const nextSrdcPhase = deriveSrdcPhase(sectionContext, step, stepsPerMeasure);
    soloist.session.currentPhrase.context.srdcState = nextSrdcPhase; // @worker-mutation

    // why: a Restatement is the player saying "yeah, I meant that" — it should
    // ECHO the Statement's rhythm + contour, not generate a fresh idea. We only
    // arm the echo when the *immediately prior* phrase was a Statement and it
    // produced a usable signature (≥3 notes — a phrase shorter than that has no
    // contour worth echoing). The rhythm engine reuses this signature's attack
    // grid; the pitch picker reuses its contour directions with looser landings
    // (see soloist-pitch-engine.ts srdcChordToneMult). Cleared on every other
    // transition so a stale echo never leaks into a non-Restatement phrase.
    soloist.session.currentPhrase.context.restatementEcho =
        nextSrdcPhase === 'restatement' &&
        previousSrdcPhase === 'statement' &&
        (lastSignature?.notes?.length ?? 0) >= 3
            ? lastSignature
            : null; // @worker-mutation
    const formArcSignature = formArcCandidate?.signature || null;
    let responseSignature: any = null;
    let responseSource: PhraseResponseSource = 'free';
    if (nextRole === 'response' && canUseMotivicResponse) {
        const seedSignature = buildSeedPhraseSignature(
            sessionSeed,
            step,
            activeSteps,
            stepsPerMeasure,
            stepsPerBeat,
            loopCount,
        );
        const shouldPreferSectionRecall = Boolean(
            sectionSignature &&
                sectionContext.isRestatement &&
                // why: discriminator +2 — distinct from the role roll (+1) so
                // the recall preference doesn't correlate with the role choice.
                scrambleHash(roleSeedBase + 2) < (responseConfig.sectionRecall || 0),
        );
        const canUseFormArcRecall = Boolean(
            formArcSignature?.notes?.length &&
                loopCount > 1 &&
                (responseConfig.formArcRecall || 0) > 0,
        );
        const shouldPreferFormArcRecall = Boolean(
            canUseFormArcRecall &&
                // why: discriminator +3 — distinct stream from the role roll
                // (+1) and the section-recall preference (+2).
                scrambleHash(roleSeedBase + 3) <
                    Math.min(
                        0.96,
                        (responseConfig.formArcRecall || 0) *
                            (formArcCandidate?.sameOccurrence ? 1 : 0.78) *
                            (sectionContext.isRestatement ? 1.08 : 0.94),
                    ),
        );
        if (shouldPreferSectionRecall) {
            responseSignature = sectionSignature;
            responseSource = 'section';
        } else if (shouldPreferFormArcRecall) {
            responseSignature = formArcSignature;
            responseSource = 'form';
        } else if (loopCount > 1 && lastSignature?.notes?.length) {
            responseSignature = lastSignature;
            responseSource = 'recent';
        } else if (canUseFormArcRecall) {
            responseSignature = formArcSignature;
            responseSource = 'form';
        } else if (seedSignature?.notes?.length) {
            responseSignature = seedSignature;
            responseSource = 'seed';
        } else if (sectionSignature) {
            responseSignature = sectionSignature;
            responseSource = 'section';
        } else if (formArcSignature?.notes?.length) {
            responseSignature = formArcSignature;
            responseSource = 'form';
        } else if (lastSignature?.notes?.length) {
            responseSignature = lastSignature;
            responseSource = 'recent';
        }
    } else if (nextRole === 'response' && sectionSignature) {
        responseSignature = sectionSignature;
        responseSource = 'section';
    } else if (
        nextRole === 'response' &&
        formArcSignature?.notes?.length &&
        (responseConfig?.formArcRecall || 0) > 0
    ) {
        responseSignature = formArcSignature;
        responseSource = 'form';
    } else if (nextRole === 'response') {
        responseSignature =
            buildSeedPhraseSignature(
                sessionSeed,
                step,
                activeSteps,
                stepsPerMeasure,
                stepsPerBeat,
                loopCount,
            ) ||
            lastSignature ||
            null;
        responseSource =
            responseSignature?.sourceKind === 'seed'
                ? 'seed'
                : responseSignature?.sourceKind === 'performed'
                  ? 'recent'
                  : 'free';
    }

    soloist.session.currentPhrase.context.responseSignature = responseSignature; // @worker-mutation
    soloist.session.currentPhrase.context.responseSource = responseSignature
        ? responseSource
        : 'free'; // @worker-mutation
    (soloist.session.memory as Mutable<typeof soloist.session.memory>).recentNotes = []; // @worker-mutation
    (soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>).startStep =
        step; // @worker-mutation
    (soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>).loopCount =
        loopCount; // @worker-mutation
    (soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>).sectionLabel =
        sectionContext.label; // @worker-mutation
    (
        soloist.session.currentPhrase as Mutable<typeof soloist.session.currentPhrase>
    ).sectionOccurrence = sectionContext.occurrence; // @worker-mutation
}

/**
 * Simplified soloist engine.
 * Focuses on lively, probabilistic phrasing with form and meter awareness.
 * Uses a two-phase Rhythm and Pitch engine.
 */
export function getSoloistNote(
    state: EnsembleState,
    currentChord: Chord,
    nextChord: Chord | null,
    step: number,
    _prevFreq: number | null,
    _octave: number,
    style: string,
    stepInChord: number,
    coordination: any = {},
    stepInfo?: StepInfo,
): any {
    const { playback, groove, soloist, arranger } = state;
    if (!currentChord) {
        return null;
    }

    // Hoisted mutable views — every nested write below targets these.
    // (Reads still go through `soloist.session.*` so tsc narrowing isn't defeated;
    // see feedback_ts_cast_narrowing.)
    const phr = soloist.session.phrasing as Mutable<typeof soloist.session.phrasing>;
    const rhy = soloist.session.rhythm as Mutable<typeof soloist.session.rhythm>;
    const mSession = soloist.session as Mutable<typeof soloist.session>;

    const activeStyle = resolveSoloistStyle(style, groove.genreFeel);

    let intensity = playback.bandIntensity || 0.5;

    // --- Greats Profiles: Intensity/Density Overrides ---
    if (activeStyle === 'blues' && soloist.session.currentPhrase.context?.profile === 'miles') {
        intensity *= 0.6; // Miles uses much more space
    }

    // Loop-Aware Intensity Nudge: Subtle boost per loop (+0.05) to build energy
    const loopCount = playback.currentLoopCount !== undefined ? playback.currentLoopCount : -1;
    const effectiveIntensity = Math.min(1.0, intensity + Math.max(0, loopCount) * 0.05);

    const logDebug = (msg: string) => {
        if (playback.debugSoloist) {
            console.log(`[Soloist Debug] Step ${step} (mStep: ${measureStep}): ${msg}`);
        }
    };

    /**
     * Evaluates the performance intent (Conservative, Conversational, Exploratory)
     * based on intensity and genre.
     */
    const calculateSoloistIntent = (i: number, s: string) => {
        let profile = SOLOIST_INTENTS.CONSERVATIVE;
        if (i > 0.75) {
            profile = SOLOIST_INTENTS.EXPLORATORY;
        } else if (i > 0.35) {
            profile = SOLOIST_INTENTS.CONVERSATIONAL;
        }

        const res = { ...profile };
        // Musical Style Overrides: Jazz/Bossa are inherently syncopated
        if (s === 'jazz' || s === 'bossa' || s === 'bird') {
            res.syncopationBias = Math.max(res.syncopationBias, 0.7);
        }
        return res;
    };

    const intentBehavior = calculateSoloistIntent(effectiveIntensity, activeStyle);

    const config: any = (STYLE_CONFIG as any)[activeStyle] || STYLE_CONFIG.scalar;
    const tsConfig: any =
        (TIME_SIGNATURES as any)[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;

    const hasSessionSeed = Boolean(soloist.session.seed && soloist.session.seed.notes.length > 0);
    const headSessionSeed = hasSessionSeed ? soloist.session.seed : null;
    const headNotes = headSessionSeed
        ? headSessionSeed.notes.filter((n: any) => {
              if (step < 0 && n.step === step) {
                  return true;
              }
              const wrappedNoteStep =
                  ((n.step % headSessionSeed.loopLengthSteps) + headSessionSeed.loopLengthSteps) %
                  headSessionSeed.loopLengthSteps;
              const stepInLoop =
                  ((step % headSessionSeed.loopLengthSteps) + headSessionSeed.loopLengthSteps) %
                  headSessionSeed.loopLengthSteps;
              return wrappedNoteStep === stepInLoop;
          })
        : [];
    const getNextSeedStepInfo = (currentSeedStep: number): { gap: number; nextSeedNote: any } => {
        if (!headSessionSeed?.notes?.length) {
            return {
                gap: Number.POSITIVE_INFINITY,
                nextSeedNote: null,
            };
        }

        const loopLength = headSessionSeed.loopLengthSteps;
        const normalizedCurrent = ((currentSeedStep % loopLength) + loopLength) % loopLength;
        let minGap = loopLength;
        let nextSeedNote = null;

        for (const seedNote of headSessionSeed.notes) {
            const normalizedStep = ((seedNote.step % loopLength) + loopLength) % loopLength;
            let diff = normalizedStep - normalizedCurrent;
            if (diff <= 0) {
                diff += loopLength;
            }
            if (diff < minGap) {
                minGap = diff;
                nextSeedNote = seedNote;
            }
        }

        return { gap: minGap, nextSeedNote };
    };

    // We only force strict head playback on loop 0, AND if there is actually a seed to play.
    const isStrictHeadPlayback = loopCount === 0 && hasSessionSeed;
    const isFirstRestatementLoop = loopCount === 1 && hasSessionSeed;

    // Later loops should always acknowledge seed-note moments, but the spaces between those moments
    // belong to the generative engine. This keeps anchors intelligible without making every future
    // chorus a rigid replay.
    const isThemedImprov = hasSessionSeed && (isFirstRestatementLoop || headNotes.length > 0);

    const isHeadPerformanceMode = isStrictHeadPlayback || isThemedImprov;

    // why: per-call deterministic seed base (Epic 12 S1). Every `Math.random()`
    // in the phrasing layer below is migrated onto `scrambleHash(callSeedBase
    // + <discriminator>)`. Computed once here so all draw sites key off the
    // same (step, section, loop) identity; `getSectionContext` is the canonical
    // (label, occurrence) source and reads only `arranger` + `step` — no
    // new worker-synced state.
    const callSectionContext = getSectionContext(arranger, step);
    const callSeedBase = soloistSeedBase(
        step,
        callSectionContext.label,
        callSectionContext.occurrence,
        loopCount,
    );

    // Use stepInfo for all meter-aware timing calculations
    const measureStep = stepInfo
        ? stepInfo.mStep
        : ((step % stepsPerMeasure) + stepsPerMeasure) % stepsPerMeasure;
    const isBeatStart = stepInfo
        ? stepInfo.isBeatStart
        : ((measureStep % stepsPerBeat) + stepsPerBeat) % stepsPerBeat === 0;
    const isDownbeat = stepInfo ? stepInfo.isMeasureStart : measureStep === 0;
    const isBackbeat = stepInfo ? stepInfo.isBackbeat : false;

    mSession.sessionSteps = (soloist.session.sessionSteps || 0) + 1; // @worker-mutation

    const finalizeNote = (res: any): any => {
        if (!res) {
            return null;
        }
        const results = Array.isArray(res) ? res : [res];
        const primary = results[results.length - 1];

        // why: Epic 10 S2 (c) — this finalizeNote only handles embellishment /
        // device buffer drains, so every note it emits is device-sourced.
        // Tag it (test-mode only) so critique tests measuring picker-vs-device
        // chromatism don't see these as "untagged" attacks. isPhraseEnd is
        // carried from the buffered node if present.
        if (playback.debugSoloist === true) {
            primary.source = 'device';
            primary.isPhraseEnd = primary.isPhraseEnd === true;
        }

        // Coordination: Mark as busy if playing short durations or dense phrases
        primary.isBusy =
            (soloist.session.phrasing.busySteps || 0) > 0 || (primary.durationSteps || 1) < 1.0;

        (soloist.audio as Mutable<typeof soloist.audio>).lastMidiPlayed = primary.midi; // @worker-mutation

        // why: discriminator 11 — seeded jitter source for the shared
        // pocket-timing util so the head-bypass note's micro-timing is
        // deterministic per (step, section, loop).
        let timingOffset = calculateTimingOffset(
            'soloist',
            groove.pocket,
            playback.bandIntensity || 0.5,
            () => scrambleHash(callSeedBase + 11),
        );
        timingOffset += config.genreGravityOffset || 0;

        const stepInBeat = ((measureStep % stepsPerBeat) + stepsPerBeat) % stepsPerBeat;
        const isSyncopated = stepInBeat % (stepsPerBeat / 2) !== 0;
        if (isSyncopated) {
            timingOffset += 0.007;
        }

        if (primary.velocity < 0.7) {
            timingOffset += 0.005;
        }

        if (config.timingJitter !== undefined) {
            const tightness = playback.bandIntensity || 0.5;
            const jitterScale = 1.0 - tightness;
            const jitterMs = config.timingJitter * jitterScale;
            // why: discriminator 10 — micro-timing jitter. Deterministic per
            // (step, section, loop) so the same note replays the same push/pull.
            timingOffset += (scrambleHash(callSeedBase + 10) - 0.5) * (jitterMs / 1000);
        }

        // Apply rhythmic entropy for themed improvisation
        if (isThemedImprov) {
            const entropyTimingScale = isFirstRestatementLoop ? 0.5 : 1.0;
            timingOffset += (soloist.session.rhythm.entropy || 0) * 0.02 * entropyTimingScale;
        }

        primary.timingOffset = (primary.timingOffset || 0) + timingOffset;

        if (!primary.isDoubleStop) {
            (soloist.audio as Mutable<typeof soloist.audio>).lastFreq = getFrequency(primary.midi); // @worker-mutation
        }

        // why: discriminator 12 — seeded source for the blues bend direction.
        applyBluesBends(primary, activeStyle, currentChord, () => scrambleHash(callSeedBase + 12));
        return res;
    };

    // --- 1. Busy/Device Handling ---
    // why: a cadential device (e.g. bluesTurnaround, a 16-step deviceBuffer) fired
    // near the end of loop 0 can still have queued tail steps when loop 1 begins.
    // Draining that stale tail here — before the head-bypass path runs — would
    // clobber the loop-1 head anchor with a leftover turnaround pitch. Musically a
    // turnaround is a setup gesture that must resolve INTO the next chorus's
    // downbeat, never bleed PAST it. So when the current step is a loop-1
    // (paraphrase) head anchor, discard any carried-over device/embellishment
    // buffer rather than draining it: the head's opening anchor wins outright. A
    // turnaround that overruns the chorus boundary is already wrong; cutting its
    // tail is the correct resolution, not a regression.
    if (isFirstRestatementLoop && headNotes.some((n: any) => n?.isAnchor)) {
        const rhythm = soloist.session.rhythm as Mutable<typeof soloist.session.rhythm>;
        const staleBuffers =
            (rhythm.deviceBuffer && rhythm.deviceBuffer.length > 0) ||
            (rhythm.embellishmentBuffer && rhythm.embellishmentBuffer.length > 0);
        // why: a carried device tail clobbers the anchor two ways — its queued
        // notes drain on top of the anchor step, AND a long device note drained
        // on the PRECEDING step leaves busySteps > 0 which silences the anchor
        // entirely (returns null below). Clear both so the loop-1 head anchor is
        // guaranteed to emit its exact seed pitch regardless of where the loop-0
        // turnaround happened to land relative to the chorus boundary.
        if (staleBuffers || (soloist.session.phrasing.busySteps || 0) > 0) {
            if (staleBuffers) {
                logDebug(
                    '[Head Anchor] Discarding stale device/embellishment buffer carried across the loop boundary so the loop-1 head anchor emits its exact seed pitch.',
                );
                rhythm.deviceBuffer = []; // @worker-mutation
                rhythm.embellishmentBuffer = []; // @worker-mutation
            }
            phr.busySteps = 0; // @worker-mutation
        }
    }
    if (
        soloist.session.rhythm.embellishmentBuffer &&
        soloist.session.rhythm.embellishmentBuffer.length > 0
    ) {
        const embNote = soloist.session.rhythm.embellishmentBuffer.shift();
        const primaryNote = Array.isArray(embNote) ? embNote[0] : embNote;
        phr.busySteps = (primaryNote?.durationSteps || 1) - 1; // @worker-mutation
        logDebug(
            `Playing embellishment note, busySteps remaining: ${soloist.session.phrasing.busySteps}`,
        );
        return finalizeNote(embNote);
    }
    if (soloist.session.rhythm.deviceBuffer && soloist.session.rhythm.deviceBuffer.length > 0) {
        const devNote = soloist.session.rhythm.deviceBuffer.shift();
        const primaryNote = Array.isArray(devNote) ? devNote[0] : devNote;
        phr.busySteps = (primaryNote?.durationSteps || 1) - 1; // @worker-mutation
        logDebug(`Playing device note, busySteps remaining: ${soloist.session.phrasing.busySteps}`);
        return finalizeNote(devNote);
    }
    if ((soloist.session.phrasing.busySteps || 0) > 0) {
        phr.busySteps = (soloist.session.phrasing.busySteps || 0) - 1; // @worker-mutation
        logDebug(
            `Silenced because busy holding previous note. busySteps remaining: ${soloist.session.phrasing.busySteps}`,
        );
        return null;
    }

    // --- Natural Exit Logic ---
    if (
        soloist.session.phrasing.isYielding &&
        (soloist.session.phrasing.isResting || soloist.session.phrasing.state === 'rest')
    ) {
        if (soloist.tradeMode === 'manual' && soloist.enabled) {
            phr.isYielding = false; // @worker-mutation
        } else {
            return null;
        }
    }

    // --- Head Mode / Themed Improv Direct Playback Bypass ---
    if (isHeadPerformanceMode && headSessionSeed) {
        // While playing the head/themed improv, the soloist is technically actively phrasing,
        // so we must force isResting = false to prevent the global orchestrator from giving
        // the solo away to comping instruments due to assumed inactivity.
        phr.isResting = false; // @worker-mutation
        phr.state = 'active'; // @worker-mutation
        const sessionSeed = headSessionSeed;
        let shouldFallThrough = false;

        if (headNotes.length > 0) {
            const headNote = headNotes[0];

            // HYBRID PHRASING PERFORMANCE ENGINE (v2)
            // 1. Macro-Phrasing (Duty Cycle)
            // Determine if we are in a "Breath Zone" (e.g., end of 8-measure block)
            const sectionMap = arranger?.sectionMap || [
                { start: 0, end: stepsPerMeasure * 8, label: 'Default' },
            ];
            const headFormSteps =
                Number.isFinite(arranger?.totalSteps) && arranger.totalSteps > 0
                    ? arranger.totalSteps
                    : sectionMap[sectionMap.length - 1]?.end || stepsPerMeasure * 8;
            const headStepInForm = normalizeLoopStep(step, headFormSteps);
            const currentSection =
                sectionMap.find(
                    (s: { start: number; end: number }) =>
                        headStepInForm >= s.start && headStepInForm < s.end,
                ) || sectionMap[0];
            const measuresInSection = Math.floor(
                (headStepInForm - currentSection.start) / stepsPerMeasure,
            );
            const sectionTotalMeasures = Math.floor(
                (currentSection.end - currentSection.start) / stepsPerMeasure,
            );
            const sectionContext = getSectionContext(arranger, step);
            const sectionRecallSource =
                sectionContext.isRestatement &&
                soloist.session.memory.sectionRecall?.[sectionContext.label]?.firstSignature?.notes
                    ?.length
                    ? 'section'
                    : soloist.session.currentPhrase.context?.responseSource || 'free';
            const isMacroRestZone =
                sectionTotalMeasures > 4 && measuresInSection >= sectionTotalMeasures - 2;

            // 2. Micro-Phrasing (Probability Gate)
            // Survival Probability:
            // The seeder has already spaced the notes. We don't apply densityBase here to avoid double-penalizing the melody.
            const isProtectedSeedTone =
                headNote.isAnchor ||
                isDownbeat ||
                measureStep >= stepsPerMeasure - stepsPerBeat ||
                (headNote.durationSteps || 0) >= stepsPerBeat;

            let survivalProb = 1.0;

            if (headNote.isAnchor) {
                survivalProb = 1.0; // Anchors always play unless macro-rest overrules
            } else {
                if (isStrictHeadPlayback) {
                    // Loop 0: Play exactly as composed. Guaranteed density for the head.
                    survivalProb = 1.0;
                } else if (isFirstRestatementLoop) {
                    // Loop 1: Preserve the head as a paraphrase, especially at cadence tones.
                    survivalProb = isProtectedSeedTone
                        ? 1.0
                        : Math.min(0.98, 0.82 + intentBehavior.thematicAnchorScale * 0.12);
                } else {
                    // Later loops: keep structural notes audible, but let non-anchors become
                    // springboards for more generative motion instead of simply disappearing.
                    survivalProb = isProtectedSeedTone
                        ? Math.min(0.96, 0.84 + intentBehavior.thematicAnchorScale * 0.12)
                        : 0.55 + effectiveIntensity * 0.28;
                }
            }

            // Macro-rest overrides:
            // High intensity soloists "push through" structural boundaries to build tension,
            // while low intensity soloists respect the "Breath Zone" to leave space.
            // why: discriminators 20/21 — the macro-rest bridge gate and the
            // survival roll. `headNote.step * 53` disambiguates multiple head
            // notes folded onto one timeline step so they don't share a draw.
            const headDrawBase = (callSeedBase + headNote.step * 53) | 0;
            if (
                isMacroRestZone &&
                !headNote.isAnchor &&
                !isStrictHeadPlayback &&
                !isFirstRestatementLoop &&
                scrambleHash(headDrawBase + 20) > intentBehavior.phrasingBridgeProb
            ) {
                survivalProb = 0; // Force "Breath"
            }

            if (scrambleHash(headDrawBase + 21) < survivalProb) {
                // Duration protection: Mark soloist as busy for the duration of the note minus 1.
                // This ensures we hold the note but don't block the immediately adjacent step.
                const durationBusySteps = Math.max(0, Math.ceil(headNote.durationSteps || 1) - 1);
                const nextSeedInfo = getNextSeedStepInfo(headNote.step);
                const shouldCapBusyToSpacing = Boolean(
                    headNote.tripletPlacement || nextSeedInfo.nextSeedNote?.tripletPlacement,
                );
                const spacingBusySteps =
                    shouldCapBusyToSpacing && Number.isFinite(nextSeedInfo.gap)
                        ? Math.max(0, nextSeedInfo.gap - 1)
                        : durationBusySteps;
                phr.busySteps = Math.min(durationBusySteps, spacingBusySteps); // @worker-mutation

                logDebug(
                    `[Head/Themed Performance] Playing seeded note: MIDI ${headNote.midi}. (Prob: ${survivalProb.toFixed(2)}, isAnchor: ${headNote.isAnchor})`,
                );

                // --- Improvisation Layer (Phase 3) ---
                let targetMidi = headNote.midi;
                if (isThemedImprov && !isProtectedSeedTone) {
                    // Keep the first paraphrase close to the tune: only light offbeat nudges.
                    const jitterRange = isFirstRestatementLoop
                        ? 1
                        : effectiveIntensity > 0.75
                          ? 3
                          : effectiveIntensity > 0.5
                            ? 2
                            : 1;
                    const jitterProb = isFirstRestatementLoop ? 0.16 : 0.32;
                    // why: seed the jitter PRNG deterministically (Epic 10 S2.a).
                    // Keyed by (barIndex, sectionId) so the same head note in the
                    // same bar of the same section occurrence always jitters the
                    // same way — loops stay coherent and critique tests can assert
                    // determinism. sectionId folds the section label's char codes
                    // with the occurrence so Verse-1 and Verse-2 get distinct
                    // jitter streams. headNote.step disambiguates multiple seed
                    // notes within one bar; +0 / +1 offsets separate the two
                    // draws (gate vs. step-offset).
                    const jitterBarIndex = Math.floor(headStepInForm / stepsPerMeasure);
                    let sectionId = sectionContext.occurrence * 131;
                    for (let c = 0; c < sectionContext.label.length; c++) {
                        sectionId = (sectionId * 31 + sectionContext.label.charCodeAt(c)) | 0;
                    }
                    const jitterSeedBase =
                        (jitterBarIndex * 2749 + sectionId * 17 + headNote.step * 7) | 0;
                    if (scrambleHash(jitterSeedBase) < jitterProb) {
                        // why: chromatic ±N jitter can turn a 5th into a b5 or a 3 into a b3,
                        // producing out-of-key pitches that sound like mistakes. Walk by
                        // scale-degree steps instead — collect every scale-tone MIDI in a
                        // ±2-octave window around the seed and pick an N-step neighbor.
                        const scaleIntervals = getScaleForChord(
                            state,
                            currentChord,
                            nextChord,
                            activeStyle,
                        );
                        const rootPc = ((currentChord.rootMidi % 12) + 12) % 12;
                        const scalePcSet = new Set<number>(
                            scaleIntervals.map((i: number) => (((rootPc + i) % 12) + 12) % 12),
                        );
                        const scaleNeighbors: number[] = [];
                        for (let m = headNote.midi - 24; m <= headNote.midi + 24; m++) {
                            if (scalePcSet.has(((m % 12) + 12) % 12)) {
                                scaleNeighbors.push(m);
                            }
                        }
                        if (scaleNeighbors.length > 0) {
                            let seedIdx = 0;
                            let minDist = Number.POSITIVE_INFINITY;
                            for (let i = 0; i < scaleNeighbors.length; i++) {
                                const d = Math.abs(scaleNeighbors[i] - headNote.midi);
                                if (d < minDist) {
                                    minDist = d;
                                    seedIdx = i;
                                }
                            }
                            const stepOffset =
                                Math.floor(
                                    scrambleHash(jitterSeedBase + 1) * (jitterRange * 2 + 1),
                                ) - jitterRange;
                            const targetIdx = Math.max(
                                0,
                                Math.min(scaleNeighbors.length - 1, seedIdx + stepOffset),
                            );
                            targetMidi = scaleNeighbors[targetIdx];
                        }
                    }
                }

                const pseudoRhythmNode = {
                    velocity: headNote.velocity || 0.8,
                    durationSteps: headNote.durationSteps,
                    isStrongBeat: isBeatStart,
                    vibrato: headNote.durationSteps > 4,
                    isSustained: headNote.durationSteps > 4,
                    isHeadBypass: true,
                    targetMidi: targetMidi,
                    seedNote: headNote, // Pass the original seed note for context
                    responsePitchClass: normalizeLoopStep(headNote.midi, 12),
                    responseDirection: nextSeedInfo.nextSeedNote
                        ? Math.sign(nextSeedInfo.nextSeedNote.midi - headNote.midi)
                        : 0,
                    responseEntryTarget: headNote.isAnchor || measureStep === 0,
                    responseCadenceTarget:
                        headNote.isAnchor || measureStep >= stepsPerMeasure - stepsPerBeat,
                    responseMode: isFirstRestatementLoop ? 'paraphrase' : 'development',
                    responseSource: sectionRecallSource,
                    sectionLabel: sectionContext.label,
                    sectionOccurrence: sectionContext.occurrence,
                };

                phr.lastAttackStep = step; // @worker-mutation

                const result = selectPitchAndDevices(
                    state,
                    step,
                    pseudoRhythmNode,
                    currentChord,
                    nextChord,
                    activeStyle,
                    effectiveIntensity,
                    stepInChord,
                    coordination,
                    playback,
                    soloist,
                    groove,
                    arranger,
                    stepsPerMeasure,
                    stepsPerBeat,
                    intentBehavior,
                );
                trackPhraseNote(
                    soloist,
                    step,
                    result,
                    pseudoRhythmNode,
                    loopCount,
                    stepsPerBeat,
                    stepsPerMeasure,
                );
                return result;
            } else {
                logDebug(
                    `[Head/Themed Performance] Gated/Skipped seeded note for phrasing. (Prob: ${survivalProb.toFixed(2)})`,
                );
                const canSubstituteGeneratively =
                    loopCount > 1 && !headNote.isAnchor && !isProtectedSeedTone;
                if (canSubstituteGeneratively) {
                    shouldFallThrough = true;
                } else if (coordination) {
                    coordination.soloistYield = true;
                }
            }
        }
        if ((soloist.session.phrasing.busySteps || 0) > 0) {
            phr.busySteps = (soloist.session.phrasing.busySteps || 0) - 1; // @worker-mutation
            return null;
        }

        // --- Gap-Fill Improvisation ---
        // If we are in themed improv, have no seeded note here, and aren't busy,
        // see if the gap to the next note is large enough to warrant a generative fill.
        if (
            isThemedImprov &&
            headNotes.length === 0 &&
            (soloist.session.phrasing.activeSteps || 0) <= 0
        ) {
            const stepInLoop =
                ((step % sessionSeed.loopLengthSteps) + sessionSeed.loopLengthSteps) %
                sessionSeed.loopLengthSteps;
            let minGap = sessionSeed.loopLengthSteps;
            let nextSeedNote = null;
            for (let i = 0; i < sessionSeed.notes.length; i++) {
                let nStep = sessionSeed.notes[i].step;
                if (nStep < 0) {
                    nStep += sessionSeed.loopLengthSteps;
                }
                let diff = nStep - stepInLoop;
                if (diff <= 0) {
                    diff += sessionSeed.loopLengthSteps;
                }
                if (diff < minGap) {
                    minGap = diff;
                    nextSeedNote = sessionSeed.notes[i];
                }
            }

            const fillGapThreshold = isFirstRestatementLoop
                ? Math.max(stepsPerBeat * 2, Math.floor(stepsPerMeasure * 0.5))
                : stepsPerBeat;
            const gapFillProb = isFirstRestatementLoop
                ? Math.min(0.85, 0.25 + effectiveIntensity * 0.45)
                : Math.min(0.9, 0.4 + effectiveIntensity * 0.4);
            const isCadenceGap = measureStep >= stepsPerMeasure - stepsPerBeat;
            const leavesRunwayIntoAnchor = nextSeedNote?.isAnchor && minGap <= stepsPerBeat * 2;

            // Loop 1 should only fill long interior gaps; later loops can be more talkative.
            if (
                !isCadenceGap &&
                !leavesRunwayIntoAnchor &&
                minGap >= fillGapThreshold &&
                // why: discriminator 30 — gap-fill gate, one roll per call.
                scrambleHash(callSeedBase + 30) < gapFillProb
            ) {
                shouldFallThrough = true;
                // Keep the first restatement's fills short so the next seed note still feels inevitable.
                const gapFillSteps = isFirstRestatementLoop
                    ? Math.max(2, Math.floor(stepsPerBeat / 2), Math.floor(minGap / 3))
                    : Math.floor(minGap / 2);
                phr.activeSteps = gapFillSteps; // @worker-mutation
                phr.isResting = false; // @worker-mutation
                logDebug(
                    `[Gap-Fill] Found gap of ${minGap} steps. Waking generative engine for ${soloist.session.phrasing.activeSteps} steps.`,
                );
            }
        }

        if (!shouldFallThrough) {
            return null;
        }
    }

    // --- Form Awareness & Phrasing States ---
    const totalFormSteps = arranger.totalSteps > 0 ? arranger.totalSteps : 999999;
    const stepInForm = ((step % totalFormSteps) + totalFormSteps) % totalFormSteps;
    const remainingSteps = coordination.sectionEnd - stepInForm;
    // why: per-section name (final measure of THIS section) — distinct from
    // `coordination.isFinalMeasure` (per-song, last measure of the whole arrangement)
    // which is plumbed by tick-logic and consumed by drums/bass cadence gates.
    const isLastSectionMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;

    // --- Structural Structural Influence Rotation ---
    // At the start of a section, the soloist adopts a new "state of mind" (influence)
    // PRE-HEAT: Also trigger rotation at the start of the count-in (e.g., step -16)
    if (stepInForm === coordination.sectionStart || (step < 0 && step === -stepsPerMeasure)) {
        const pools: any = INFLUENCE_POOLS;
        const pool = pools[activeStyle] || [];
        if (pool.length > 0) {
            // High intensity sections might shift influence more frequently (probabilistically)
            // why: discriminators 40/41 — section-boundary influence rotation.
            // 40 gates whether to shift, 41 picks the pool index. Keyed on
            // (step, section, loop) so the same section boundary always rotates
            // to the same influence — section recall stays coherent across loops.
            const shouldShift =
                soloist.session.phraseCount === 0 || scrambleHash(callSeedBase + 40) < 0.8;
            if (shouldShift) {
                const nextInfluence =
                    pool[Math.floor(scrambleHash(callSeedBase + 41) * pool.length)];
                soloist.session.currentPhrase.context.profile = nextInfluence; // @worker-mutation
                logDebug(`New section influence: ${nextInfluence}`);
            }
        }

        // PRE-HEAT: Force a lead-in transition at the start of the song to ensure count-in pick-ups
        if (step < 0 && effectiveIntensity > 0.3) {
            phr.transitionState = 'lead_in'; // @worker-mutation
            logDebug(`Forcing START-OF-SONG lead-in`);
        }
    }

    // Transition evaluation at structural points (Downbeat of final measure)
    if (isLastSectionMeasure && isDownbeat) {
        // PRE-HEAT: If we are at the start of the song, preserve the forced lead_in
        const isStartOfSong = step < 0 && step === -stepsPerMeasure;
        if (!isStartOfSong || soloist.session.phrasing.transitionState === null) {
            // why: discriminator 42 — final-measure transition-state choice.
            phr.transitionState =
                scrambleHash(callSeedBase + 42) < 0.6 - effectiveIntensity * 0.4
                    ? 'rest'
                    : 'lead_in'; // @worker-mutation
            logDebug(`Selected transition state: ${soloist.session.phrasing.transitionState}`);
        }

        // Mutate rhythmic entropy at section boundaries based on intensity
        // This locks the variation for the next section, preserving micro-level predictability
        const shiftScale = 0.2 + effectiveIntensity * 0.4; // Max 0.6 shift at high intensity
        // why: discriminator 43 — section-boundary rhythmic-entropy shift.
        rhy.entropy = (scrambleHash(callSeedBase + 43) * 2 - 1) * shiftScale; // @worker-mutation
    } else if (!isLastSectionMeasure && stepInForm !== coordination.sectionStart) {
        phr.transitionState = null; // @worker-mutation
    }

    // --- 2. Simplified Phrasing State Machine ---
    if (soloist.session.phrasing.isResting === undefined) {
        phr.isResting =
            soloist.session.phrasing.state === 'rest' ||
            soloist.session.phrasing.state === undefined; // @worker-mutation
        if (soloist.session.phrasing.restSteps === undefined) {
            phr.restSteps = soloist.session.phrasing.isResting ? stepsPerMeasure : 0; // @worker-mutation
        }
        if (soloist.session.phrasing.activeSteps === undefined) {
            phr.activeSteps = soloist.session.phrasing.isResting ? 0 : stepsPerMeasure * 2; // @worker-mutation
        }
    }

    if (
        isLastSectionMeasure &&
        (soloist.session.phrasing.transitionState || null) === 'rest' &&
        !isStrictHeadPlayback
    ) {
        const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
        const restBeatStart = tsConfig.beats >= 4 ? 2 : 1;
        if (beatInMeasure >= restBeatStart) {
            phr.isResting = true; // @worker-mutation
            phr.state = 'rest'; // @worker-mutation
            phr.restSteps = remainingSteps; // @worker-mutation
        }
    }

    if (soloist.session.phrasing.isResting) {
        phr.restSteps = (soloist.session.phrasing.restSteps || 0) - 1; // @worker-mutation

        // --- Proactive Lead-in Wake-up ---
        if ((soloist.session.phrasing.transitionState || null) === 'lead_in') {
            const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
            // If we are in the last beat of the measure, force wake up to play pick-ups
            if (beatInMeasure === tsConfig.beats - 1) {
                phr.restSteps = 0; // @worker-mutation
                logDebug(`Forced proactive wake-up for lead-in pickups (last beat of measure).`);
            }
        }

        if (
            (soloist.session.phrasing.restSteps || 0) <= 0 ||
            coordination.bypassRhythm ||
            isStrictHeadPlayback
        ) {
            const isGoodEntry =
                isBeatStart ||
                (measureStep % (stepsPerBeat / 2) === 0 &&
                    // why: discriminator 50 — syncopated wake-up entry gate.
                    scrambleHash(callSeedBase + 50) < intentBehavior.syncopationBias);
            const preventBreakout =
                isLastSectionMeasure &&
                (soloist.session.phrasing.transitionState || null) === 'rest' &&
                Math.floor(measureStep / stepsPerBeat) >= 2;

            if (
                !preventBreakout &&
                (isGoodEntry ||
                    isStrictHeadPlayback ||
                    coordination.bypassRhythm ||
                    (soloist.session.phrasing.restSteps || 0) < -stepsPerMeasure)
            ) {
                phr.isResting = false; // @worker-mutation
                phr.state = 'active'; // @worker-mutation
                mSession.phraseCount = (soloist.session.phraseCount || 0) + 1; // @worker-mutation

                const baseLength = config.maxNotesPerPhrase * (0.3 + effectiveIntensity * 0.7);
                // why: discriminator 51 — phrase active-length roll.
                let _nextActiveSteps = Math.floor(
                    baseLength * stepsPerBeat * (0.3 + scrambleHash(callSeedBase + 51) * 1.2),
                );

                if (isStrictHeadPlayback && soloist.session.seed) {
                    _nextActiveSteps = soloist.session.seed.loopLengthSteps;
                }

                phr.activeSteps = _nextActiveSteps; /* @worker-mutation */
                logDebug(
                    `Waking up for ~${soloist.session.phrasing.activeSteps} steps${isStrictHeadPlayback ? ' (Head Mode)' : ''}. Generating new rhythm plan.`,
                );

                preparePhraseResponseContext(
                    soloist,
                    activeStyle,
                    soloist.session.seed,
                    step,
                    soloist.session.phrasing.activeSteps || 0,
                    loopCount,
                    stepsPerMeasure,
                    stepsPerBeat,
                    arranger,
                );

                // GENERATE RHYTHM PLAN FOR THE PHRASE
                // why: pass loopCount so the rhythm engine's S6 density+jitter
                // escalation fires; Math.max(0, ...) clamps the no-playback
                // sentinel (-1) to "Loop 0 Head" semantics.
                const nextRhythmPlan = generateRhythmPlan(
                    step,
                    soloist.session.phrasing.activeSteps || 0,
                    activeStyle,
                    effectiveIntensity,
                    stepsPerMeasure,
                    stepsPerBeat,
                    coordination,
                    soloist.session.sessionSteps || 0,
                    soloist,
                    stepInfo,
                    Math.max(0, loopCount),
                );
                rhy.plan = nextRhythmPlan; // @worker-mutation

                logDebug(`Generated rhythm plan of length: ${soloist.session.rhythm.plan.length}`);

                // Capture skeleton for future responses.
                // why: epic-soloist-idiom S5 — the response branch in
                // soloist-rhythm-engine used to read the skeleton as bare step
                // offsets and emit `durationSteps: 1` per attack, flattening
                // every "long-long-short-short" call into "tick-tick-tick-tick".
                // We now preserve the call's per-attack durationSteps, velocity,
                // and isStrongBeat so the response can paraphrase the call's
                // *rhythmic shape*, not just its grid positions. The skeleton
                // is intentionally a coarse copy (no triplet placement, no
                // pitch class) — pitch + ornament decisions still get re-rolled
                // in the response phrase; only the duration/velocity contour
                // is mirrored. (Richer copies live on `responseSignature`.)
                if (nextRhythmPlan.length > 0) {
                    // @worker-mutation
                    soloist.session.currentPhrase.context.skeleton = nextRhythmPlan.map(
                        (n: any) => ({
                            stepOffset: n.stepTarget - step,
                            durationSteps: Math.max(1, n.durationSteps || 1),
                            velocity: n.velocity || 0.72,
                            isStrongBeat: Boolean(n.isStrongBeat),
                        }),
                    );
                }
            }
        }
        if (soloist.session.phrasing.isResting) {
            return null;
        }
    } else {
        phr.activeSteps = (soloist.session.phrasing.activeSteps || 0) - 1; // @worker-mutation

        const isStrongResolution =
            measureStep === stepsPerMeasure - 1 || (isBackbeat && effectiveIntensity > 0.5);

        if (
            (soloist.session.phrasing.activeSteps || 0) <= 0 &&
            isStrongResolution &&
            !coordination.bypassRhythm &&
            !isStrictHeadPlayback
        ) {
            phr.isResting = true; // @worker-mutation
            phr.state = 'rest'; // @worker-mutation
            if (coordination) {
                coordination.soloistPhraseEnd = true;
            }
            const restMultiplier = config.restBase * (2.0 - effectiveIntensity * 1.5);
            // Fatigue Decay: Shorten breaths as song progresses (0.9x per loop)
            const fatigueMultiplier = Math.max(0.5, 1.0 - Math.max(0, loopCount) * 0.1);
            // why: discriminator 52 — rest-length roll on phrase resolution.
            const nextRestSteps = Math.floor(
                stepsPerMeasure *
                    restMultiplier *
                    fatigueMultiplier *
                    (0.5 + scrambleHash(callSeedBase + 52) * 1.5),
            );
            phr.restSteps = nextRestSteps; // @worker-mutation

            const minimumRestSteps =
                activeStyle === 'bird'
                    ? 0
                    : activeStyle === 'jazz'
                      ? 3
                      : activeStyle === 'blues'
                        ? 3
                        : 4;
            if (soloist.session.phrasing.restSteps < minimumRestSteps) {
                phr.restSteps = minimumRestSteps; // @worker-mutation
            }
            logDebug(
                `Active steps expired on strong resolution. Entering 'rest' state for ~${soloist.session.phrasing.restSteps} steps. (Fatigue: ${fatigueMultiplier.toFixed(2)})`,
            );
            // Clear rhythm plan just in case
            commitTrackedPhraseSignature(soloist, loopCount);
            rhy.plan = []; // @worker-mutation
            return null;
        }
    }

    // --- 3. Rhythm Plan Execution & Pitch Selection ---
    if (
        !soloist.session.rhythm.plan ||
        (soloist.session.rhythm.plan.length === 0 &&
            !soloist.session.phrasing.isResting &&
            (soloist.session.phrasing.activeSteps <= 0 || coordination.bypassRhythm))
    ) {
        // If plan is uninitialized or exhausted but test forces active state, generate it
        if (!soloist.session.phrasing.isResting) {
            const baseLength = config.maxNotesPerPhrase * (0.3 + effectiveIntensity * 0.7);
            // why: discriminator 53 — fallback plan-length roll (test-forced
            // active state with no prior activeSteps).
            const planSteps =
                soloist.session.phrasing.activeSteps && soloist.session.phrasing.activeSteps > 0
                    ? soloist.session.phrasing.activeSteps
                    : Math.floor(
                          baseLength * stepsPerBeat * (0.5 + scrambleHash(callSeedBase + 53) * 0.5),
                      );
            preparePhraseResponseContext(
                soloist,
                activeStyle,
                soloist.session.seed,
                step,
                planSteps,
                loopCount,
                stepsPerMeasure,
                stepsPerBeat,
                arranger,
            );
            // why: pass loopCount so the rhythm engine's S6 density+jitter
            // escalation fires; same clamp as the primary call site above.
            const nextRhythmPlan = generateRhythmPlan(
                step,
                planSteps,
                activeStyle,
                effectiveIntensity,
                stepsPerMeasure,
                stepsPerBeat,
                coordination,
                soloist.session.sessionSteps,
                soloist,
                stepInfo,
                Math.max(0, loopCount),
            );
            rhy.plan = nextRhythmPlan; // @worker-mutation
            if (
                soloist.session.phrasing.activeSteps === undefined ||
                soloist.session.phrasing.activeSteps <= 0
            ) {
                phr.activeSteps = planSteps; /* @worker-mutation */
            }
        } else {
            rhy.plan = []; // @worker-mutation
        }
    }

    if (soloist.session.rhythm.plan.length > 0) {
        while (
            soloist.session.rhythm.plan.length > 0 &&
            step > soloist.session.rhythm.plan[0].stepTarget
        ) {
            soloist.session.rhythm.plan.shift(); // @worker-mutation
        }
        if (
            soloist.session.rhythm.plan.length > 0 &&
            step >= soloist.session.rhythm.plan[0].stepTarget
        ) {
            const rhythmNode = soloist.session.rhythm.plan.shift(); // @worker-mutation

            phr.lastAttackStep = step; // @worker-mutation

            const result = selectPitchAndDevices(
                state,
                step,
                rhythmNode,
                currentChord,
                nextChord,
                activeStyle,
                effectiveIntensity,
                stepInChord,
                coordination,
                playback,
                soloist,
                groove,
                arranger,
                stepsPerMeasure,
                stepsPerBeat,
                intentBehavior,
            );
            trackPhraseNote(
                soloist,
                step,
                result,
                rhythmNode,
                loopCount,
                stepsPerBeat,
                stepsPerMeasure,
            );
            return result;
        }
    }

    return null; // Idle waiting for next attack or resting
}
