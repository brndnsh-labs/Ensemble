import { transposeKey } from '@engine/controllers/arranger-controller';
import {
    flushBuffers,
    loadDrumPreset,
    togglePower,
} from '@engine/controllers/instrument-controller';
import {
    loopSection as armSectionLoop,
    clearPracticeLoop,
    getSectionStepBounds,
} from '@engine/controllers/practice-controller';
import { autoVoiceForGenre } from '@engine/data/genre-sound-map';
import { GENRE_NAMES, SMART_GENRES } from '@engine/data/smart-genres';
import { registerScorePlaybackRenderer, validateProgression } from '@engine/engine/chords-engine';
import { analyzeFormUI } from '@engine/engine/conductor';
import { initAudio, playNote, restoreGains, syncBusReverbSend } from '@engine/engine/engine';
import { scheduler } from '@engine/engine/scheduler-core';
import { isSoloistMonophonicMode } from '@engine/engine/soloist-mode-policy';
import { transposeChordText } from '@engine/engine/transpose';
import { exportToMidi } from '@engine/export/midi-export';
import {
    prepareScorePlayback,
    renderScorePlayback,
    scoreArrangement,
} from '@engine/songbook/score-playback';
import type { SemanticScore } from '@engine/songbook/score-types';
import type {
    ChartContent,
    ChartLaneMix,
    ChartNotation,
    SoloistMode,
} from '@engine/songbook/types';
import { dispatch, getState, subscribe } from '@engine/state';
import {
    deriveSoloistModeOnBoot,
    handleEffects,
    reconcileUrlGenreOnBoot,
} from '@engine/state/state-effects';
import {
    ACTIONS,
    type ChordDensity,
    type EnsembleState,
    type InstrumentModule,
    type InstrumentVoice,
    type SwingSub,
} from '@engine/types';
import { transposeKeyName } from '@engine/utils';
import { initWorker, syncWorker } from '@engine/worker-client';
import { type ChartDocument, type DocumentContent, validateDocument } from './documents';
import { masterVolumePreference, rememberMasterVolume } from './session';
import { initializeSounds, prepareSound, prepareSounds, validateVoice } from './sounds';

export type { ChartContent, ChartDocument };
export { GENRE_NAMES };

let boot: Promise<void> | undefined;
let loading = false;
let playIntent = 0;
/** Lanes whose voice follows the feel while they are left on Auto (#675). */
const AUTO_LANES = ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const;
/**
 * Ceiling on waiting for the scheduler to swap in a staged feel (#1185). One bar
 * at the engine's slowest tempo is ~6s; past this the audio clock is not running
 * (a suspended context, a hidden tab) and waiting longer only strands the UI.
 */
const STAGED_FEEL_TIMEOUT_MS = 12_000;
// Authored source belongs to the host document, never to generated runtime state.
let currentScore: SemanticScore | null = null;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const param = (module: string, name: string, value: unknown) =>
    dispatch(ACTIONS.SET_PARAM, { module, param: name, value });

function mix(lane: ChartLaneMix): ChartLaneMix {
    return {
        enabled: lane.enabled,
        voice: lane.voice,
        autoSound: lane.autoSound,
        volume: lane.volume,
        reverb: lane.reverb,
    };
}

/** Explicit semantic projection, never a clone of the live/audio state tree. */
export function captureContent(): ChartContent {
    const {
        arranger: a,
        playback: p,
        chords: c,
        bass: b,
        soloist: s,
        harmony: h,
        groove: g,
    } = getState();
    return clone({
        arrangement: {
            sections: a.sections,
            key: a.key,
            timeSignature: a.timeSignature,
            grouping: a.grouping,
            isMinor: a.isMinor,
            notation: a.notation,
            lastChordPreset: a.lastChordPreset,
        },
        performance: {
            bpm: p.rampBpmTarget > 0 ? p.rampBpmTarget : p.bpm,
            complexity: p.complexity,
            seed: a.seed,
            randomizeSeed: a.randomizeSeed,
        },
        band: {
            chords: {
                ...mix(c),
                style: c.style,
                instrument: (c as unknown as { instrument?: string }).instrument,
                octave: c.octave,
                density: c.density,
            },
            bass: { ...mix(b), style: b.style, octave: b.octave },
            soloist: {
                ...mix(s),
                style: s.style,
                preset: s.preset,
                octave: s.octave,
                mode: s.mode,
                autoMode: s.autoMode,
                phrasingIntensity: s.phrasingIntensity,
                tradeMode: s.tradeMode,
            },
            harmony: { ...mix(h), style: h.style, octave: h.octave, complexity: h.complexity },
            groove: {
                ...mix(g),
                measures: g.measures,
                swing: g.swing,
                swingSub: g.swingSub,
                humanize: g.humanize,
                lastDrumPreset: g.lastDrumPreset,
                genreFeel: g.genreFeel,
                lastSmartGenre: g.lastSmartGenre,
                pattern: g.instruments.map((i) => ({ name: i.name, steps: i.steps })),
            },
        },
    } as ChartContent);
}

function rebuild(): void {
    validateProgression(getState(), dispatch);
    if (!getState().arranger.progression.length) {
        throw new Error('The chart has no playable chords. Check your chord text.');
    }
    analyzeFormUI(getState().arranger);
    syncWorker();
    flushBuffers();
    restoreGains(getState());
    for (const lane of ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const) {
        syncBusReverbSend(getState(), lane);
    }
}

function captureSessionContent(): DocumentContent {
    const content = captureContent();
    return currentScore
        ? { score: clone(currentScore), performance: content.performance, band: content.band }
        : content;
}

export function captureDocument(document: ChartDocument): ChartDocument {
    return validateDocument({ ...document, chart: captureSessionContent() });
}

/** Display-only maps for bars bypassed by navigation; never installed in live state. */
export function writtenChart() {
    const state = getState();
    const plan = state.arranger.scorePlan;
    if (!plan) {
        return state.arranger;
    }
    const detached = {
        ...state,
        arranger: {
            ...state.arranger,
            scorePlan: {
                ...plan,
                visits: plan.sections.flatMap((entry, sectionIndex) =>
                    entry.measures.map((_, measureIndex) => ({
                        sectionIndex,
                        measureIndex,
                        sectionPass: 0,
                        repeatPasses: [],
                    })),
                ),
            },
        },
    };
    validateProgression(detached);
    return detached.arranger;
}

/** Uses the same buffer ownership and monophonic guard as the current page bootstrap. */
function receiveNotes(notes: unknown[], resolution: true | undefined): void {
    const state = getState();
    if (state.playback.resolutionTriggered && !resolution) {
        return;
    }
    const bassSteps = new Set<number>();
    const soloSteps = new Set<number>();
    for (const value of notes) {
        const note = value as { module: InstrumentModule; step: number };
        if (note.module === 'bass') {
            if (!bassSteps.has(note.step)) {
                state.bass.buffer.set(note.step, []);
                bassSteps.add(note.step);
            }
            state.bass.buffer.get(note.step)!.push(value as never);
        } else if (note.module === 'soloist') {
            if (
                isSoloistMonophonicMode(state.soloist.mode) &&
                state.soloist.audio.buffer.has(note.step)
            ) {
                continue;
            }
            if (!soloSteps.has(note.step)) {
                state.soloist.audio.buffer.set(note.step, []);
                soloSteps.add(note.step);
            }
            state.soloist.audio.buffer.get(note.step)!.push(value as never);
        } else if (
            note.module === 'chords' ||
            note.module === 'harmony' ||
            note.module === 'groove'
        ) {
            const buffer = state[note.module].buffer;
            if (!buffer.has(note.step)) {
                buffer.set(note.step, []);
            }
            buffer.get(note.step)!.push(value as never);
        }
    }
    if (state.playback.isPlaying) {
        scheduler(state, dispatch);
    }
}

/** One runtime per browser page, independent of React mount/unmount and route views. */
export function initialize(): Promise<void> {
    if (!boot) {
        registerScorePlaybackRenderer(renderScorePlayback);
        boot = (async () => {
            initializeSounds();
            initWorker(
                () => scheduler(getState(), dispatch),
                (notes, _sent, _duration, resolution) => receiveNotes(notes, resolution),
            );
            await loadDrumPreset('Basic Rock');
            // Guest startup must not download audio without an install/selection gesture.
            for (const module of ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const) {
                param(module, 'autoSound', false);
            }
            subscribe((action, state, context) => {
                if (loading) {
                    return;
                }
                syncWorker(action.type, action.payload);
                // The async genre effect is awaited explicitly by setGenre below.
                if (action.type !== ACTIONS.SET_GENRE_FEEL) {
                    handleEffects(action, state, context);
                }
            });
            // #1276 — `playback.masterVolume` is `preferences`-owned (never part of a
            // saved chart), so it's hydrated from its own device-local key here rather
            // than from `apply()`. `initAudio()` reads `playback.masterVolume` straight
            // off state at graph-build time (`engine.ts`), so setting it this early is
            // enough even though guest startup defers `initAudio()` past this point.
            const storedMasterVolume = masterVolumePreference();
            if (storedMasterVolume !== null) {
                param('playback', 'masterVolume', storedMasterVolume);
            }
            rebuild();
            document.addEventListener('visibilitychange', () => {
                const { playback } = getState();
                if (
                    document.visibilityState === 'visible' &&
                    playback.isPlaying &&
                    playback.audio?.state === 'suspended'
                ) {
                    void playback.audio.resume().catch(() => {});
                }
            });
            window.addEventListener('pagehide', stop);
        })();
    }
    return boot;
}

export function stop(): void {
    playIntent++;
    // #1211 — Stop always releases an armed/live practice loop; the drill is a
    // performance-mode overlay on the transport, not a setting that survives it.
    clearPracticeLoop();
    if (getState().playback.isPlaying) {
        dispatch(ACTIONS.TOGGLE_PLAY);
    }
}

/**
 * Arm a section-practice loop (#1211). Wraps the practice controller so the app
 * shell never imports `@engine/controllers/*` directly. Returns false (and
 * changes nothing) when the section id doesn't resolve to a step span — e.g. a
 * stale id from a chart that changed shape after this render.
 */
export function loopSection(sectionId: string): boolean {
    if (!getSectionStepBounds(sectionId)) {
        return false;
    }
    armSectionLoop(sectionId);
    return true;
}

/** Drop out of a running or armed practice loop (#1211). */
export function clearLoop(): void {
    clearPracticeLoop();
}

/**
 * The id of the section currently armed/looping, or null when no loop is set.
 * Maps `playback.loopStartStep/loopEndStep` back to the `arranger.sectionMap`
 * entry with the matching span — using `getSectionStepBounds` so a section with
 * more than one map entry (a written repeat) resolves the same collapsed span
 * `loopSection` armed it with, rather than a single raw map row (#1211).
 */
export function loopedSection(): string | null {
    const { playback, arranger } = getState();
    if (playback.loopStartStep < 0) {
        return null;
    }
    const ids = new Set(arranger.sectionMap.map((entry) => entry.id));
    for (const id of ids) {
        const bounds = getSectionStepBounds(id);
        if (
            bounds &&
            bounds.start === playback.loopStartStep &&
            bounds.end === playback.loopEndStep
        ) {
            return id;
        }
    }
    return null;
}

export async function toggle(progress: (text: string) => void): Promise<void> {
    if (getState().playback.isPlaying) {
        stop();
        return;
    }
    // Keep AudioContext creation on the gesture stack for mobile Safari.
    initAudio(getState());
    const intent = ++playIntent;
    await prepareSounds(captureContent(), progress);
    if (intent !== playIntent) {
        return;
    }
    dispatch(ACTIONS.TOGGLE_PLAY);
}

export async function setVoice(
    module: InstrumentModule,
    voice: InstrumentVoice,
    progress: (text: string) => void,
    auto = false,
): Promise<void> {
    validateVoice(module, voice);
    if (voice !== 'synth') {
        await prepareSound(voice.slice(5), progress);
    }
    // Keep the old selection throughout download/failure. Dispatch through the
    // established effects and worker delta (including crunch chord voicing).
    dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module, voice, auto });
    if (auto && module === 'soloist') {
        // Auto dispatch normally runs inside genre resolution; this explicit
        // picker also needs its established voice-to-phrasing reconciliation.
        deriveSoloistModeOnBoot(getState(), dispatch);
    }
    rebuild();
}

/** Live bus gain — mirrors `InstrumentSettings.tsx`'s `updateInstrumentAudio`. */
export function setVolume(module: InstrumentModule, value: number): void {
    dispatch(ACTIONS.SET_VOLUME, { module, value });
}

/** Live reverb send — the `SET_REVERB` sibling of `setVolume`. */
export function setReverb(module: InstrumentModule, value: number): void {
    dispatch(ACTIONS.SET_REVERB, { module, value });
}

/**
 * Bass/chords/harmony/soloist all read `<lane>.style` live at note-generation
 * time (see `instrument-styles.ts`); this is the one manual style picker each
 * of those four lanes has ever had in either app. Flush the worker's
 * lookahead buffer afterward so the new style is audible at the next
 * scheduled note rather than waiting for the pre-generated buffer to drain —
 * `InstrumentSettings.tsx`'s chords-style handler does the same
 * (`refreshArrangerUI`) for the one style picker v1 exposes.
 */
export function setStyle(module: InstrumentModule, style: string): void {
    dispatch(ACTIONS.SET_STYLE, { module, style });
    rebuild();
}

/** Chords-only: `SET_DENSITY`'s reducer writes `chords.density` unconditionally. */
export function setDensity(density: ChordDensity): void {
    dispatch(ACTIONS.SET_DENSITY, density);
}

/** Soloist phrasing mode — mirrors `InstrumentSettings.tsx`'s Auto/Monophonic/Guitar group. */
export function setSoloistMode(mode: 'auto' | SoloistMode): void {
    if (mode === 'auto') {
        dispatch(ACTIONS.SET_SOLOIST_AUTO_MODE, true);
    } else {
        dispatch(ACTIONS.SET_SOLOIST_MODE, mode);
        dispatch(ACTIONS.SET_SOLOIST_AUTO_MODE, false);
    }
}

// #1276 — Feel sheet. `groove.swing`/`swingSub`/`humanize` and `playback.complexity`
// are `document`-owned (`STATE_OWNERSHIP_MANIFEST`): they ride `captureContent()`'s
// existing `band.groove`/`performance` projection already, so no codec change is
// needed here, only the dispatch — same shape as `setStyle` above minus the
// worker-buffer flush, since none of these change note *selection*, only feel
// parameters the worker already re-reads live (`SET_SWING`/`SET_SWING_SUB`/
// `SET_COMPLEXITY` all have their own delta case in `worker-client.ts`).

/** `SET_SWING`'s reducer stores the raw 0-100 shuffle amount, not a 0-1 fraction. */
export function setSwing(value: number): void {
    dispatch(ACTIONS.SET_SWING, value);
}

/** `SET_SWING_SUB`'s reducer ignores an unrecognized grid rather than defaulting it. */
export function setSwingSub(sub: SwingSub): void {
    dispatch(ACTIONS.SET_SWING_SUB, sub);
}

/** Also a raw 0-100 value, like `setSwing` — not the 0-1 scale `setVolume`/`setReverb` use. */
export function setHumanize(value: number): void {
    dispatch(ACTIONS.SET_HUMANIZE, value);
}

/** 0-1 document field; the conductor's own opinion lives in the sibling runtime-derived
 * `playback.conductorDensity`/`conductorHarmonyComplexity` fields (#1064) and never
 * writes here. */
export function setComplexity(value: number): void {
    dispatch(ACTIONS.SET_COMPLEXITY, value);
}

// `playback.bandIntensity`/`autoIntensity`/`metronome` are `runtime-derived` —
// session-only by design (`docs/design/write-ownership.md` §3), never part of
// `ChartContent` or a preferences key. A user dispatch onto them is fine (the law
// only forbids a *runtime system* writing a document/preferences field); they
// simply reset to their engine defaults on next boot, same as v1.

/** Manual band-energy override; ignored by the engine while `autoIntensity` is on. */
export function setBandIntensity(value: number): void {
    dispatch(ACTIONS.SET_BAND_INTENSITY, value);
}

/** Hands band energy to the conductor's own ramp, mirroring `InstrumentRail.tsx`. */
export function setAutoIntensity(auto: boolean): void {
    dispatch(ACTIONS.SET_AUTO_INTENSITY, auto);
}

/** Click track on/off — session-only, like the two above. */
export function setMetronome(enabled: boolean): void {
    dispatch(ACTIONS.SET_METRONOME, enabled);
}

/**
 * `preferences`-owned: persists to its own device-local key (`session.ts`)
 * immediately, independent of the chart's own Save — mirrors v1's
 * `debounceSaveState` persisting `masterVolume` outside the chart-dirty flow
 * (`state/persistence.ts`). The live bus ramp itself is `state-effects.ts`'s
 * `SET_PARAM(masterVolume)` case, run by the `handleEffects` call already wired
 * into this module's dispatch subscriber.
 */
export function setMasterVolume(value: number): void {
    dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'masterVolume', value });
    rememberMasterVolume(value);
}

/**
 * Chord-notation preference — `document`-owned, but the ONE Feel-sheet field split
 * across the dual chart schema: a schemaVersion-1 chart keeps it on `arranger.notation`
 * directly (what `dispatch` below writes, and what `captureContent()`'s `arrangement`
 * projection reads), while a schemaVersion-2 (score) chart's saved copy lives on the
 * authored `currentScore.notation` instead — `captureSessionContent()` clones
 * `currentScore` verbatim for that schema and never reads `arranger.notation` for it.
 * Patch both so either schema's next `captureDocument()` reflects the change. No
 * `rebuild()`/`editScore()`: notation is a pure display selector over the chord's
 * already-precomputed `display: FormattedChordNames` (all three notations are always
 * present), so it never touches arrangement layout, generation, or the worker.
 */
export function setNotation(notation: ChartNotation): void {
    dispatch(ACTIONS.SET_NOTATION, notation);
    if (currentScore) {
        currentScore = { ...currentScore, notation };
    }
}

/**
 * The voice an Auto lane resolves to. `genre`/`chordStyle` default to the live
 * setup; pass them to resolve against a feel that has not been applied yet.
 */
export function recommendedVoice(
    module: InstrumentModule,
    genre?: string,
    chordStyle?: string,
): InstrumentVoice {
    const state = getState();
    // Resolve the intended mapping, not a temporary synth fallback based on RAM.
    // Every caller prepares these files before committing the choice or playing.
    return autoVoiceForGenre(
        genre ?? state.groove.lastSmartGenre,
        module,
        () => true,
        chordStyle ?? state.chords.style,
    );
}

/** Called only after the explicit bulk install has fully succeeded. */
export async function applyGenreSounds(progress: (text: string) => void): Promise<void> {
    for (const module of AUTO_LANES) {
        const voice = recommendedVoice(module);
        if (voice !== 'synth') {
            await prepareSound(voice.slice(5), progress);
        }
    }
    for (const module of ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const) {
        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, {
            module,
            voice: recommendedVoice(module),
            auto: true,
        });
    }
    deriveSoloistModeOnBoot(getState(), dispatch);
    rebuild();
}

function apply(content: DocumentContent): void {
    const score = 'score' in content ? clone(content.score) : null;
    const plan = score ? prepareScorePlayback(score) : null;
    const arrangement =
        score && plan ? scoreArrangement(score, plan) : (content as ChartContent).arrangement;
    param('arranger', 'scorePlan', plan);
    currentScore = score;
    for (const [key, value] of Object.entries(arrangement)) {
        param('arranger', key, value);
    }
    param('arranger', 'seed', content.performance.seed);
    param('arranger', 'randomizeSeed', content.performance.randomizeSeed);
    param('playback', 'bpm', content.performance.bpm);
    param('playback', 'complexity', content.performance.complexity);
    for (const module of ['chords', 'bass', 'soloist', 'harmony', 'groove'] as const) {
        for (const [key, value] of Object.entries(content.band[module])) {
            if (key !== 'pattern') {
                param(module, key, value);
            }
        }
    }
    // Optional legacy source selector must not leak from the outgoing chart.
    param('chords', 'instrument', content.band.chords.instrument);
    param(
        'groove',
        'instruments',
        getState().groove.instruments.map((instrument) => ({
            ...instrument,
            muted: false,
            steps: [
                ...(content.band.groove.pattern.find((p) => p.name === instrument.name)?.steps ||
                    []),
            ],
        })),
    );
    dispatch(ACTIONS.SET_PRACTICE_LOOP, null);
    dispatch(ACTIONS.SET_START_STEP, 0);
    param('arranger', 'history', []);
}

export function load(document: ChartDocument): void {
    const checked = validateDocument(document);
    if (checked.schemaVersion === 2) {
        prepareScorePlayback(checked.chart.score);
    }
    stop();
    const previous = captureSessionContent();
    loading = true;
    try {
        apply(checked.chart);
        rebuild();
    } catch (error) {
        apply(previous);
        rebuild();
        throw error;
    } finally {
        loading = false;
    }
}

/**
 * Verify — downloading only if a file is missing — every sound the incoming feel
 * will select for a lane still on Auto. Deliberately runs before any engine state
 * changes: nothing is committed while this is in flight, so a failure has nothing
 * to undo and a band that is already playing keeps its time straight through it.
 */
async function prepareFeelSounds(name: string, progress: (text: string) => void): Promise<void> {
    const state = getState();
    // `resolveAutoVoices` reads the style the feel is about to install, so resolve
    // the chords lane against that rather than the outgoing style.
    const chordStyle = SMART_GENRES[name].chord ?? state.chords.style;
    for (const module of AUTO_LANES) {
        if (!state[module].autoSound) {
            continue;
        }
        const voice = recommendedVoice(module, name, chordStyle);
        if (voice !== 'synth') {
            await prepareSound(voice.slice(5), progress);
        }
    }
}

/**
 * Resolve once the scheduler has swapped in a feel that was staged for the next
 * measure start, or `false` if it never will. Polling is deliberate: the swap
 * happens inside `applyPendingGenre` in the audio scheduling loop, which offers no
 * completion signal to subscribe to, and a stopped scheduler never reaches a bar.
 */
function awaitStagedFeel(): Promise<boolean> {
    const deadline = Date.now() + STAGED_FEEL_TIMEOUT_MS;
    return new Promise((resolve) => {
        const check = () => {
            const { groove, playback } = getState();
            if (!groove.pendingGenreFeel) {
                resolve(true);
            } else if (!playback.isPlaying || Date.now() > deadline) {
                resolve(false);
            } else {
                setTimeout(check, 25);
            }
        };
        check();
    });
}

export async function setGenre(
    name: string,
    progress: (text: string) => void = () => {},
): Promise<void> {
    if (!Object.hasOwn(SMART_GENRES, name)) {
        throw new Error('Unknown genre.');
    }
    const wasPlaying = getState().playback.isPlaying;
    const previous = captureSessionContent();
    const payload = { genreName: name, ...SMART_GENRES[name] };
    // Captured before anything can stop the transport, so a Stop pressed during
    // preparation is still detectable as a cancellation further down.
    const intent = playIntent;
    try {
        // #1185 — prepare first, commit second. The old order stopped the band up
        // front so that preparation could not fail into a half-changed engine; the
        // same protection comes free from mutating nothing until the sounds are
        // verified, and the band plays on through the check.
        await prepareFeelSounds(name, progress);
        // Read before the dispatch, not after: the reducer only stages a feel when
        // the transport is already running, and the scheduler can make the swap
        // during the await below — so the state afterwards cannot tell the two
        // paths apart.
        const staged = getState().playback.isPlaying;
        dispatch(ACTIONS.SET_GENRE_FEEL, payload);
        // While playing, that reducer stages the feel and the scheduler swaps it in
        // at the next measure start (`applyPendingGenre`), re-anchoring the beat and
        // flushing the worker itself. So this dispatch plus the auto-voice effects
        // are the entire engine change: no teardown, no rebuild, no restart. A
        // `rebuild()` here would kill the notes the swap has just scheduled.
        await reconcileUrlGenreOnBoot(getState(), name, null, dispatch);
        if (!staged) {
            rebuild();
            return;
        }
        progress('Switching feel at the next bar…');
        if (await awaitStagedFeel()) {
            if (payload.drum && getState().groove.lastDrumPreset !== payload.drum) {
                // The swap fires its drum preset without awaiting it. Settle that
                // here so the document the caller captures next cannot pair the new
                // feel with the outgoing genre's pattern.
                await loadDrumPreset(payload.drum);
            }
        } else {
            // Stopped before the bar line (or the audio clock stalled), so the swap
            // will never happen on its own. Finish it here: with the transport
            // stopped the same payload applies immediately and brings its drum
            // preset with it, leaving the engine and the captured document
            // describing one setup rather than half of each.
            stop();
            dispatch(ACTIONS.SET_GENRE_FEEL, payload);
            await reconcileUrlGenreOnBoot(getState(), name, null, dispatch);
            rebuild();
        }
    } catch (error) {
        // A Stop that landed while we were preparing cancels the change outright:
        // the musician asked for silence, not for a band that resurrects itself.
        const cancelled = intent !== playIntent;
        stop();
        const resumeIntent = playIntent;
        loading = true;
        try {
            // A failure after the dispatch on line ~482 can leave a staged feel
            // behind: `apply()` restores the previous *document* content, but
            // `pendingGenreFeel` is runtime-derived and not part of that content,
            // so nothing else clears it. Left set, the scheduler would apply the
            // very feel we just failed to verify at the next measure start once
            // playback resumes below — landing the band on the failed genre while
            // `groove.genreFeel`/the UI still (correctly) read the previous one.
            param('groove', 'pendingGenreFeel', null);
            apply(previous);
            rebuild();
        } finally {
            loading = false;
        }
        if (wasPlaying && !cancelled) {
            // A failed new feel must not strand a still-playable old band. Recheck
            // its files too: an evicted old pack cannot earn silent synth fallback.
            try {
                await prepareSounds(previous, progress);
            } catch {
                throw new Error(
                    'Could not change feel or resume the previous sounds. Reconnect and press Play.',
                );
            }
            if (resumeIntent === playIntent) {
                dispatch(ACTIONS.TOGGLE_PLAY);
            }
        }
        throw error;
    }
}

export function setTempo(bpm: number): void {
    dispatch(ACTIONS.SET_BPM, Math.max(40, Math.min(240, Math.round(bpm))));
}
export function setEnabled(module: InstrumentModule, enabled: boolean): void {
    if (getState()[module].enabled !== enabled) {
        togglePower(module);
    }
}
export function transpose(delta: number): void {
    if (currentScore) {
        const score = clone(currentScore);
        score.key = transposeKeyName(score.key, delta);
        for (const section of score.sections) {
            if (section.key) {
                section.key = transposeKeyName(section.key, delta);
            }
            for (const measure of section.measures) {
                if (measure.key) {
                    measure.key = transposeKeyName(measure.key, delta);
                }
                if (measure.content.kind === 'events') {
                    for (const event of measure.content.events) {
                        if (event.kind === 'chord') {
                            event.symbol = transposeChordText(event.symbol, delta);
                            if (event.alternates) {
                                event.alternates = event.alternates.map((symbol) =>
                                    transposeChordText(symbol, delta),
                                );
                            }
                        }
                    }
                }
            }
        }
        const wasPlaying = getState().playback.isPlaying;
        editScore(score);
        if (wasPlaying) {
            dispatch(ACTIONS.TOGGLE_PLAY);
        }
        return;
    }
    transposeKey(delta);
}
export function editScore(score: SemanticScore): void {
    prepareScorePlayback(score);
    const before = captureSessionContent();
    stop();
    loading = true;
    try {
        const { performance, band } = before;
        apply({ score, performance, band });
        rebuild();
    } catch (error) {
        apply(before);
        rebuild();
        throw error;
    } finally {
        loading = false;
    }
}
export function editSections(sections: ChartContent['arrangement']['sections']): void {
    if (currentScore) {
        throw new Error('Use the measure editor for this chart.');
    }
    const before = captureSessionContent();
    stop();
    loading = true;
    try {
        param('arranger', 'sections', clone(sections));
        rebuild();
    } catch (error) {
        apply(before);
        rebuild();
        throw error;
    } finally {
        loading = false;
    }
}
export function audition(index: number): void {
    if (getState().playback.isPlaying) {
        return;
    }
    initAudio(getState());
    const state = getState();
    const chord = state.arranger.progression[index];
    if (!chord || !state.playback.audio) {
        return;
    }
    for (const frequency of chord.freqs) {
        playNote(state, frequency, state.playback.audio.currentTime, 0.65, {
            vol: 0.12,
            instrument: 'Piano',
            ignoreSustain: true,
        });
    }
}
/**
 * Downloads a multi-track `.mid` of the current arrangement (#1277). Delegates
 * to the shared `exportToMidi` entry point — the same detached-worker realm v1's
 * ShareModal uses, so there is no second MIDI code path (root CLAUDE.md's "MIDI
 * has three interpretation paths" rule: live, MIDI-out, `.mid` — never a fourth).
 * The export clones state via `cloneStateForDetachedGeneration` and generates in
 * a fresh Worker, so it never touches the live scheduler/audio graph — safe to
 * call while the band is playing.
 */
export function exportMidi(filename: string): Promise<void> {
    return exportToMidi({ filename });
}
export function state(): EnsembleState {
    return getState();
}
