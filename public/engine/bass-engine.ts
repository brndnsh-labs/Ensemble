import type { Chord, EnsembleState, Mutable, StepInfo } from '../types.js';
import { getFrequency, getMidi } from '../utils.js';
import { createBassPump } from './bass-pump.js';
import { getBandPocket } from './coordination-engine.js';
import { scrambleHash, stringHash33 } from './hash-utils.js';
import { getScaleForChord } from './theory-scales.js';
import { BASS_AUTHORING_CEILING, BASS_VELOCITY_DOMAIN_MAX } from './velocity-shaping.js';

// #1005: the bass's band-relative micro-timing = the single per-genre band pocket
// (getBandPocket), the same lean bass+comp+harmony+soloist all add relative to the
// drums' grid. Pre-#1005 the bass carried its own fixed +5 ms feel constant; that
// scattered per-lane value is now replaced by the one-authority per-genre palette
// in coordination-engine.ts, so the whole band leans by exactly one per-genre
// amount instead of each lane guessing its own (docs/design/timing-model.md).

// #1006 — within-phrase velocity envelope test seam (§4.6). The bass envelope is a
// pure function of metric POSITION (distance to the nearest strong beat), so there is
// no production input that turns it off; this module-level flag is the clean A/B toggle
// the critique test flips to measure the shaped path against the flat baseline. Mirrors
// SOLOIST_VELOCITY_ENVELOPE. Production NEVER touches it — the envelope is always on in
// normal playback (default `true`). Kept off the state slice deliberately: it isn't
// persisted, synced, or user-settable, just a test hook.
export const BASS_VELOCITY_ENVELOPE = { enabled: true };

/**
 * BASS ENGINE - Procedural Line Generation
 *
 * Logic flow:
 * 1. Determine register based on genre/intensity.
 * 2. Identify target notes (Root/5th/Approach).
 * 3. Generate rhythm cell.
 * 4. Select pitches with voice-leading constraints.
 */

// (Old getScaleForBass removed, using imported version)
import { resolveMappedStyle, SMART_BASS_STYLE_MAP, TIME_SIGNATURES } from '../config.js';
import { INTRO_MUTES, OUTRO_MUTES } from './arrangement-layering.js';
import {
    approachBend,
    checkBassActiveStyle,
    EVEN_ACCENT_BASS_STYLES,
    GESTURE_ACCENT_BASS_STYLES,
    getBassNoteStyle,
    isChordChangeApproach,
} from './bass-styles.js';

// why: Genres where bass-doubles-kick is the musical intent. Other styles
// (jazz/dub/country/blues/bossa/acoustic/neo/walking-ska/hiphop)
// phrase against the kick and choose their own active lane. Hip-hop is independent
// — 808 sub-bass sustains across the kick pattern rather than re-articulating with
// every hi-hat-locked kick burst.
const KICK_LOCK_STYLES = new Set(['rock', 'funk', 'metal', 'disco']);

// why: section-transition anticipation gate. The chromatic-approach branch inside
// getBassNote (~line 407) fires at step `sectionEnd - stepsPerBeat/2`, but tick-logic
// only calls getBassNote when isBassActive returns true. For styles like jazz/walking
// that play on quarter notes, the half-beat anticipation step is otherwise inactive —
// so isBassActive must also recognize the gate, otherwise the anticipation note is
// dead code in production (and the critique test sees a 50%+ failure rate).
//
// Set membership: limited to genres that idiomatically use chromatic-approach
// 16th-note passing tones into chord changes. Rock and disco are intentionally
// EXCLUDED — rock typically locks-to-kick on a riff (real rock transition lives
// in the drum fill, not a bass passing tone), disco rides a signature octave-pump
// pattern that a chromatic walk-in would disrupt. Country is excluded for now
// pending a `country-walking` style key (boom-chick country shouldn't anticipate;
// bluegrass walking should).
// Source: form-arranger.md P0 #2; epic-coordination-contract.md S3.
const ANTICIPATION_STYLES = new Set(['jazz', 'walking', 'funk', 'blues', 'bossa', 'neo']);

/**
 * Resets the internal generative state of the bass.
 */
export function resetBassState(state: EnsembleState): void {
    const { bass } = state;
    (bass as Mutable<typeof bass>).busySteps = 0; // @worker-mutation
    (bass as Mutable<typeof bass>).lastFreq = null; // @worker-mutation
    (bass as Mutable<typeof bass>).lastMidiPlayed = null; // @worker-mutation
}

export function isBassActive(
    state: EnsembleState,
    style: string,
    step: number,
    stepInChord: number,
    stepInfo?: StepInfo,
    coordination?: any,
): boolean {
    const { playback, groove, arranger } = state;

    if (style === 'smart') {
        style = resolveMappedStyle(SMART_BASS_STYLE_MAP, groove.genreFeel, groove.lastDrumPreset);
    }

    // Rhythmic Yielding: lock to kick only for styles where bass-doubles-kick
    // is the musical intent. Independent styles must choose their own lane.
    if (coordination?.kickHit && KICK_LOCK_STYLES.has(style)) {
        return true;
    }

    const signatures: any = TIME_SIGNATURES;
    const ts = signatures[arranger.timeSignature] || signatures['4/4'];

    // Section-transition anticipation: force-activate on the half-beat before a
    // section boundary so getBassNote's chromatic-approach gate (~line 407) can
    // fire. Without this, isBassActive's per-style gate (e.g. jazz plays on
    // quarter notes only) would skip the call entirely and the anticipation
    // would be dead code. See ANTICIPATION_STYLES at module top.
    // Reads `coordination.{upcomingSectionFirstChord,sectionEnd}` written by the
    // chord-data preamble in tick-logic.ts.
    const upcomingForActivation = coordination?.upcomingSectionFirstChord;
    const coordSectionEnd = coordination?.sectionEnd ?? null;
    if (
        upcomingForActivation &&
        coordSectionEnd !== null &&
        step === coordSectionEnd - Math.floor(ts.stepsPerBeat / 2) &&
        ANTICIPATION_STYLES.has(style)
    ) {
        return true;
    }

    // why: epic-coordination-consistency S2.b — reggae bass conversational fill.
    // Reggae bass is normally locked into the riddim tables; on a soloist
    // phrase-end (≥3 notes then rest) we permit a single approach note at the
    // anticipation point of the bar so the bass answers the soloist's exhale
    // with a pickup into the next downbeat. Without this force-activation, dub's
    // riddim-only gate (checkBassActiveStyle line ~212) would skip the anticipation
    // step on every riddim except 54-46, and the conversational gesture would be
    // dead code. The actual approach-note emission lives in getBassNote's reggae
    // coordination block (just before the call to getBassNoteStyle).
    //
    // Gate: step is at `isAnticipation` (stepsPerBar - 2 in 4/4; stepsPerBar - 1
    // in 6/8 — see compound-meter S5) AND coordination signals a phrase-end.
    // Tension-chord-change approach (the second branch in the audit-doc sketch)
    // is also gated here via upcomingSectionFirstChord when present, but
    // bar-to-bar nextChord cases are handled inside getBassNote where the
    // nextChord argument is in scope. ANTICIPATION_STYLES already covers
    // section-boundary anticipation for jazz/walking/etc.; reggae gets its own
    // narrower force-activation so non-section-boundary phrase-end fills still
    // fire.
    const isReggaeStyle = style === 'dub' || (groove.genreFeel || '') === 'Reggae';
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    // why: in 6/8 the natural anticipation is the final eighth before the downbeat
    // (step 11 of 12, "and of 6"); in 4/4 it is the "and of 4" (step 14 of 16,
    // stepsPerBar - 2). Compound meters use stepsPerBar - 1; simple meters keep
    // stepsPerBar - 2 (unchanged behavior).
    const anticipationOffset = ts.isCompound ? 1 : 2;
    const isAnticipation = step % stepsPerBar === stepsPerBar - anticipationOffset;
    const soloistRestingForFill = coordination?.soloistResting === true;
    const notesInPhraseForFill = coordination?.soloistNotesInPhrase ?? 0;
    if (isReggaeStyle && isAnticipation && soloistRestingForFill && notesInPhraseForFill >= 3) {
        return true;
    }

    // why: epic-form-arrangement S4 — force-activate on the downbeat of the
    // form's final measure so getBassNote's `isFinalMeasureBass` short-circuit
    // can fire its sustained-tonic gesture. Without this, styles whose normal
    // gate would skip the downbeat (e.g. an offbeat-only funk pattern) would
    // silently miss the resolution cadence.
    const isFinalMeasureCoord = coordination?.isFinalMeasure === true;
    const isMeasureStart = stepInfo
        ? stepInfo.isMeasureStart
        : step % (ts.beats * ts.stepsPerBeat) === 0;
    if (isFinalMeasureCoord && isMeasureStart) {
        return true;
    }

    // why: epic-form-arrangement S5 — Intro/Outro instrument layering. The
    // bass enters at bar `INTRO_MUTES.bass` of an Intro section and drops out
    // `OUTRO_MUTES.bass` bars before an Outro section ends. Gate `isBassActive`
    // here so the kick-lock and section-anticipation early-activations above
    // can't smuggle a note past the layering gate. (`getBassNote` defends in
    // depth at its top so any direct-call test or future caller also honors
    // the mute.)
    //
    // Precedence: the final-bar return above already fired for `isFinalMeasure`
    // — so the bass's S4 cadence still lands even when `outroBarsRemaining`
    // would otherwise mute the bar. Order matters; do not move this block
    // above the isFinalMeasure check.
    const introElapsed = coordination?.introBarsElapsed ?? -1;
    if (introElapsed >= 0 && introElapsed < INTRO_MUTES.bass) {
        return false;
    }
    const outroRemaining = coordination?.outroBarsRemaining ?? -1;
    if (outroRemaining >= 0 && outroRemaining <= OUTRO_MUTES.bass) {
        return false;
    }

    // why: arrangement-by-subtraction (story #1008). The seeded per-(section,
    // occurrence) instrumentation plan may rest the bass on a given pass. Reuses
    // the same intro/outro precedence path — sits AFTER the isFinalMeasure early
    // return above so the S4 cadence still lands. The starter table never rests
    // the bass (bass is a "bone"), but the gate is wired so a future table entry
    // works without re-plumbing.
    const subtractionMutes = coordination?.subtractionMutedLanes;
    if (Array.isArray(subtractionMutes) && subtractionMutes.includes('bass')) {
        return false;
    }

    const intBeat = stepInfo
        ? stepInfo.beatIndex
        : Math.floor((step % (ts.beats * ts.stepsPerBeat)) / ts.stepsPerBeat);
    const isQuarter = stepInfo ? stepInfo.isBeatStart : step % ts.stepsPerBeat === 0;
    // why: epic-1-compound-meter S2 — the old formula (step % (stepsPerBeat / 2) === 0)
    // degenerates to step % 1 === 0 (always-true) for 6/8 (stepsPerBeat=2). Use the
    // named isEighthBoundary field from getStepInfo when available; partial test
    // mocks may omit the field, so fall back to the per-meter eighth grid.
    const isEighthBoundary =
        stepInfo?.isEighthBoundary ?? (ts.stepsPerBeat >= 4 ? step % 2 === 0 : true);

    return checkBassActiveStyle(
        style,
        step,
        stepInChord,
        stepInfo || null,
        ts,
        intBeat,
        isQuarter,
        isEighthBoundary,
        playback,
        groove,
    );
}

export function getBassNote(
    state: EnsembleState,
    chord: Chord,
    nextChord: Chord | null | undefined,
    _beatInMeasure: number,
    prevFreq: number | null,
    centerMidi: number,
    style: string,
    _chordIndex: number,
    step: number,
    stepInChord: number,
    context: any = {},
    stepInfo?: StepInfo,
): any {
    const { playback, groove, soloist, arranger } = state;
    if (!chord) {
        return null;
    }

    if (style === 'smart') {
        style = resolveMappedStyle(SMART_BASS_STYLE_MAP, groove.genreFeel, groove.lastDrumPreset);
    }

    const signatures: any = TIME_SIGNATURES;
    const ts = signatures[arranger.timeSignature] || signatures['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    const stepInMeasure = stepInfo ? stepInfo.mStep : step % stepsPerMeasure;
    const intBeat = Math.floor(stepInMeasure / ts.stepsPerBeat);
    const isDownbeat = stepInfo ? stepInfo.isMeasureStart : stepInMeasure === 0;

    // --- Intensity Mapping ---
    const globalIntensity = playback.bandIntensity || 0.5;
    const intensity = globalIntensity;

    let safeCenterMidi = centerMidi || 38; // Standard bass register anchor (Meat of the neck)

    // --- Genre-Specific Register Offsets ---
    if (style === 'dub' || (groove.genreFeel || '') === 'Reggae') {
        safeCenterMidi = 32;
    } else if (style === 'disco' || (groove.genreFeel || '') === 'Disco') {
        safeCenterMidi = 36;
    } else if (style === 'neo' || (groove.genreFeel || '') === 'Neo-Soul') {
        safeCenterMidi = 24; // Deep Neo-Soul register
    }

    // Shift center up as intensity builds
    // Rules of Taste: Cap intensity drift for grounding-heavy genres
    const isGroundingGenre = ['Reggae', 'Neo-Soul', 'Dub'].includes(groove.genreFeel || style);
    const registerShift = isGroundingGenre
        ? 0 // Neo-Soul/Reggae stay deep regardless of intensity
        : Math.floor(intensity * 7);
    safeCenterMidi += registerShift;

    // --- ENSEMBLE COORDINATION: Proactive Register Clamping ---
    const isExtendedRangeGenre = ['Reggae', 'Neo-Soul', 'Metal'].includes(groove.genreFeel);
    const softMax = isExtendedRangeGenre ? 57 : 51;
    const softMin = isExtendedRangeGenre ? 23 : 28;

    while (safeCenterMidi > softMax) {
        safeCenterMidi -= 12;
    }
    while (safeCenterMidi < softMin) {
        safeCenterMidi += 12;
    }

    const prevMidi = prevFreq ? getMidi(prevFreq) : null;

    // Register Definitions (Rules of Taste)
    const absMin = 23; // Low B on 5-string
    const absMax = 57; // High A fill
    const comfortMin = 28; // Low E
    const comfortMax = 51; // Standard ceiling

    // #923 — context.sectionStart is already loop-relative (getChordAtStep wraps
    // targetStep by arranger.totalSteps before deriving it), but `step` here is
    // the raw monotonic global transport counter, which never resets on a loop
    // boundary (scheduler-core.ts's LOOP_BOUNDARY only notifies the worker, it
    // doesn't zero playback.step). Comparing them unwrapped means this only
    // ever matches during the very first lap of playback — wrap `step` first,
    // same pattern #921/#922 applied to barIndex.
    const wrappedStepForSectionStart = arranger.totalSteps > 0 ? step % arranger.totalSteps : step;
    const isSectionStart = context && wrappedStepForSectionStart === context.sectionStart;
    const allowSubRange = isDownbeat || isSectionStart;

    const clampAndNormalize = (
        midi: number,
        referenceMidi: number | null = null,
    ): { midi: number; weight: number } => {
        if (!Number.isFinite(midi)) {
            return { midi: safeCenterMidi, weight: 1.0 };
        }
        const pc = ((midi % 12) + 12) % 12;
        const targetRef = referenceMidi !== null ? referenceMidi : safeCenterMidi;
        const octaveBase = Math.floor(targetRef / 12) * 12;
        const currentRootPC = chord.rootMidi % 12;

        const candidates: { midi: number; weight: number }[] = [];
        for (let o = -24; o <= 24; o += 12) {
            const c = octaveBase + o + pc;
            if (c >= absMin && c <= absMax) {
                let weight = 1.0;

                // 1. Distance from Anchor
                const distFromCenter = Math.abs(c - safeCenterMidi);
                weight *= 1.0 - distFromCenter / 48;

                // 2. Hand Position Bonus
                if (referenceMidi !== null) {
                    const stepDist = Math.abs(c - referenceMidi);
                    // Single Position Bonus (±5 semitones)
                    if (stepDist <= 5) {
                        weight *= 1.5;
                    }
                    // Stepwise Bonus (±2 semitones)
                    if (stepDist <= 2 && stepDist > 0) {
                        weight *= 2.0; // Stronger stepwise bonus for voice leading
                    }
                    // Jump Penalty
                    if (stepDist > 12) {
                        weight *= 0.4;
                    }

                    // Asymmetric Gravity: Penalize upward leaps specifically if above center
                    if (c > safeCenterMidi && c > referenceMidi) {
                        weight *= 0.7; // Downward gravity to pull back to the "Meat"
                    }
                }

                // 3. Comfort Zone vs Extended Range
                const inComfortZone = c >= comfortMin && c <= comfortMax;
                const isGroundingStyleInside =
                    ['Reggae', 'Neo-Soul', 'Dub'].includes(groove.genreFeel) ||
                    style === 'neo' ||
                    style === 'dub';

                if (isGroundingStyleInside && c < comfortMin) {
                    weight *= 5.0; // Extremely strong basement bonus
                } else if (!inComfortZone) {
                    if (c < comfortMin) {
                        const subPenalty = allowSubRange ? 0.2 : 0.8;
                        weight *= 1.0 - subPenalty;
                    } else {
                        // More aggressive Attic Penalty for MIDI > 51
                        const highPenalty = intensity > 0.85 ? 0.2 : 0.9;
                        weight *= 1.0 - highPenalty;
                    }
                }

                // 4. Interval Stability Bonus (Target Root/5th)
                if (pc === currentRootPC || pc === (currentRootPC + 7) % 12) {
                    const isGrounding = ['neo', 'dub'].includes(style);
                    weight *= isGrounding ? 1.1 : 1.5;
                }

                // 5. Style Priority Boost
                if (c === midi) {
                    weight *= 5.0;
                }

                if (weight > 0) {
                    candidates.push({ midi: c, weight });
                }
            }
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => b.weight - a.weight);
            return candidates[0];
        }

        return { midi: Math.max(absMin, Math.min(absMax, octaveBase + pc)), weight: 0.1 };
    };

    const clampAndNormalizeMidi = (midi: number, referenceMidi: number | null = null): number => {
        return clampAndNormalize(midi, referenceMidi).midi;
    };

    const normalizeToRange = (midi: number): number => {
        if (!Number.isFinite(midi)) {
            return safeCenterMidi;
        }

        // Neck Drift Prevention: Balance previous position with intended center
        const isGrounding = ['Reggae', 'Neo-Soul', 'Dub'].includes(groove.genreFeel || style);
        const centerWeight = isGrounding ? 0.8 : 0.4;
        const targetRef =
            prevMidi !== null
                ? prevMidi * (1.0 - centerWeight) + safeCenterMidi * centerWeight
                : safeCenterMidi;

        const pc = ((midi % 12) + 12) % 12;
        const octaves = [
            Math.floor(targetRef / 12) * 12,
            Math.floor(targetRef / 12) * 12 - 12,
            Math.floor(targetRef / 12) * 12 + 12,
            Math.floor(targetRef / 12) * 12 - 24,
            Math.floor(targetRef / 12) * 12 + 24,
        ];

        let bestCandidate = octaves[0] + pc;
        let minDiff = Math.abs(bestCandidate - targetRef);
        // Initial gravity check for the first candidate
        if (bestCandidate > targetRef) {
            minDiff += 3.0; // Asymmetrical gravity penalty for going up
        }

        for (let i = 1; i < octaves.length; i++) {
            const cand = octaves[i] + pc;
            let diff = Math.abs(cand - targetRef);

            // Asymmetrical Gravity: Penalize jumping up to break "staircase" progressions
            if (cand > targetRef) {
                diff += 3.0;
            }

            // Grounding Bias: heavily favor the lower candidate if it's in the basement (<= 35)
            if (isGrounding && cand <= 35 && cand >= absMin && bestCandidate > 35) {
                diff -= 12;
            }

            if (diff < minDiff) {
                minDiff = diff;
                bestCandidate = cand;
            }
        }

        return clampAndNormalizeMidi(bestCandidate, prevMidi);
    };

    const scale = getScaleForChord(state, chord, nextChord, style);
    const beatsInChord = Math.round(chord.beats);
    // #1335: was a genre-neutral `intBeat % 2 === 1 ? 1.15 : 1.0` for every
    // style. A walking jazz line's drive comes from note-length consistency
    // and the quarter pulse, not level accents; a bossa's own downbeat/
    // anticipation hierarchy (bass-styles.ts) was getting inverted by this
    // same accent multiplying through the shared `result()` closure — see
    // `EVEN_ACCENT_BASS_STYLES` for the full reasoning on both.
    //
    // #1342 added the second opt-out set. `intBeat % 2 === 1` is beats 2 and 4
    // — a rock/pop BACKBEAT. Funk's own accents sit on beats 1 and 3 (the
    // thumb slap on The One below, the secondary slap in `bass-styles.ts`), so
    // for funk this generic accent didn't reinforce the idiom, it inverted it:
    // measured, the "and" pop rendered LOUDER than The One from i≈0.1 to
    // i≈0.65. Funk opts out entirely rather than moving to a 1&3 accent,
    // because it authors a per-gesture velocity on every note it emits and a
    // blanket per-beat multiplier re-orders that ladder whichever pair of beats
    // it lands on — see `GESTURE_ACCENT_BASS_STYLES` for the full call.
    const velocity =
        EVEN_ACCENT_BASS_STYLES.has(style) || GESTURE_ACCENT_BASS_STYLES.has(style)
            ? 1.0
            : intBeat % 2 === 1
              ? 1.15
              : 1.0;

    // --- Imperfect Symmetry: per-phrase octave displacement on repeat passes ---
    // why: epic-form-arrangement S2 — when a section repeats (Verse 2 vs Verse 1),
    // the bass would otherwise produce an identical line, making the band sound
    // mechanical on repeated form. On the restatement we shift the note at ONE
    // seeded beat per 4-bar phrase by ±12 semitones (pitch class preserved).
    //
    // Audible effect — read before tuning: although only ONE step is directly
    // shifted, the shift cascades through `prevMidi`'s Hand-Position (×1.5 within
    // ±5 semitones) and Stepwise (×2.0 within ±2) bonuses in `clampAndNormalize`,
    // so the rest of the phrase migrates into the new register. Measured ~44%
    // step-level divergence between Verse 1 and Verse 2. This is the intended
    // gesture, not a leak: a real bassist who jumps an octave at beat 3 typically
    // commits — they don't snap back to the old register on beat 4. Treat this
    // helper as "seed a register migration for the remainder of the phrase," not
    // "displace a single note." Capping the cascade would un-musical-ify it.
    //
    // Seeded by `(sectionId-hash, occurrence, phraseIndex)`. Direction is also
    // hash-seeded (NOT parity) so Verse 2, 3, 4 each pick independently — V4 ≠ V2.
    // The headroom-forced branch (28-51 comfort range, 23-57 absolute clamp)
    // overrides the hash only when one direction is out of range.
    //
    // Source: docs/audit/form-arranger.md P1 #7; docs/audit/epic-form-arrangement.md S2.
    //
    // #924 — barIndexEarly (and phraseIndex/barInPhrase below) must be
    // loop-relative, not the raw monotonic global step. The #921/#922 diff
    // assumed Imperfect Symmetry needed the TRUE global bar count to
    // distinguish Verse 2 from Verse 4, but that distinction is already
    // carried independently by `sectionOccurrence` (getSectionContext wraps
    // step by totalFormSteps internally). barIndexEarly's only actual
    // consumers are phraseIndex/barInPhrase, baked into the target-beat hash
    // below — left unwrapped, "same phrase → same target beat" (this file's
    // own documented contract, see targetSeed below) only holds within a
    // single pass of the arrangement, not lap-to-lap on a looped playback.
    // Wrap it the same way #921/#922 wrapped barIndex for withOctaveJump.
    const inLoopStepForBarIndex =
        arranger.totalSteps > 0
            ? (((step % arranger.totalSteps) + arranger.totalSteps) % arranger.totalSteps) | 0
            : step;
    const barIndexEarly = Math.floor(inLoopStepForBarIndex / stepsPerMeasure);
    const isBeatStartEarly = stepInfo?.isBeatStart ?? step % ts.stepsPerBeat === 0;
    const isSoloistBusyEarly = (soloist.session.phrasing.busySteps || 0) > 0;
    const sectionOccurrence: number = context?.stepCoordination?.sectionOccurrence ?? 1;
    const isRepeatPass = sectionOccurrence >= 2;
    // Hash the sectionId (string) into a 32-bit int so different sections of the
    // same occurrence-index get different phrase-target patterns. Cheap djb2
    // (×33-from-5381) — canonical helper, see hash-utils.ts.
    const sectionIdStr: string = (chord as any)?.sectionId || '';
    const sectionIdHash = stringHash33(sectionIdStr);
    const PHRASE_BARS = 4; // why: standard 4-bar phrase in pop/rock/jazz.
    const phraseIndex = Math.floor(barIndexEarly / PHRASE_BARS);
    const barInPhrase = barIndexEarly % PHRASE_BARS;

    // #1291 — the fixed-anchor octave pump, as one object rather than ~31 scattered
    // `isPumpAnchorStyle` predicates. `bass-pump.ts` owns the anchor, the target beat, the
    // variation draw and its resolution; this file asks it four questions and nothing else.
    // The context is assembled once, here, because everything it needs is loop-relative
    // position that only `getBassNote` knows — see `BassPumpContext` for why it is a record
    // rather than a parameter list.
    const pump = createBassPump({
        style,
        comfortMin,
        beatsPerBar: ts.beats,
        stepsPerBeat: ts.stepsPerBeat,
        barsPerPhrase: PHRASE_BARS,
        stepInMeasure,
        barInPhrase,
        phraseIndex,
        stepInChord,
        wrappedStep: wrappedStepForSectionStart,
        sectionStartStep: typeof context?.sectionStart === 'number' ? context.sectionStart : null,
        sectionIdHash,
        sectionOccurrence,
        intensity,
        isSoloistBusy: isSoloistBusyEarly,
        chordQuality: chord?.quality,
        chordRootMidi: chord.rootMidi,
        chordBassMidi: chord.bassMidi ?? null,
    });

    // The chord's low root. A pump style pins it to a fixed anchor (pitch-class only, never
    // dragged by `prevMidi`); every other style resolves it through the ordinary
    // neck-drift-aware normalization.
    //
    // Note which pitch this is on a SLASH chord: the pedal, not the chord root. That is
    // right for the anchor (the bass plays what the chart says it plays) and it is why the
    // pump is handed the root as well — an interval measured up from `baseRoot` is not an
    // interval above the chord unless the two coincide. See `canFifth` in `bass-pump.ts`.
    const rootToNormalize =
        chord.bassMidi !== null && chord.bassMidi !== undefined ? chord.bassMidi : chord.rootMidi;
    const baseRoot = pump.anchorFor(rootToNormalize) ?? normalizeToRange(rootToNormalize);

    // why: 16 candidate beats per 4-bar phrase (4 beats × 4 bars in 4/4). Pick
    // exactly one. Seeded by (sectionIdHash, occurrence, phraseIndex) so:
    //   - same section + same occurrence + same phrase → same target beat (deterministic)
    //   - occurrence 2 vs occurrence 3 → different target beats (variation per repeat)
    //   - different sectionIds at same occurrence → different patterns (Verse-2 ≠ Chorus-2)
    //
    // #1271 lifted this out of `withImperfectSymmetry` so the pump path could gate on the
    // identical beat. #1276 gave the pump its OWN selection and this is now the generic
    // path's alone — deliberately, not by drift. The #1271 concern was the two branches
    // INSIDE `withImperfectSymmetry` disagreeing about which beat they act on, and those two
    // are mutually exclusive at runtime (`pump.isAnchorStyle` short-circuits before the
    // generic path ever runs), so there is nothing left for them to disagree about. Don't
    // "restore" the sharing: the pump needs a phrase-INVARIANT target and the generic path
    // needs a phrase-varying one, for the musical reasons stated at each. #1291 put the
    // pump's half in `bass-pump.ts` (`isTargetBeat`), which makes the separation structural
    // rather than a convention held by two adjacent closures.
    const isSymmetryTargetBeat = (): boolean => {
        const BEATS_PER_PHRASE = PHRASE_BARS * ts.beats;
        const targetSeed = scrambleHash(
            (sectionIdHash ^ (sectionOccurrence * 0x9e3779b1) ^ (phraseIndex * 0x85ebca77)) | 0,
        );
        const targetBeatInPhrase = Math.floor(targetSeed * BEATS_PER_PHRASE);
        const currentBeatInPhrase = barInPhrase * ts.beats + intBeat;
        return currentBeatInPhrase === targetBeatInPhrase;
    };

    // why: force direction from headroom (canonical rule from
    // feedback_seeded_prng_mulberry32) — hash-seeded only when BOTH directions fit, so
    // V2 / V3 / V4 / V5 each pick independently. An earlier draft used `occurrence % 2`
    // parity, but that collapses to two values (V4 ≡ V2 in direction); reviewer P1-3.
    // The hash is XOR'd with a third constant so it doesn't correlate with `targetSeed`.
    //
    // #1291 — the generic (non-pump) caller is now the ONLY caller. The pump used to reach
    // this through a `pumpOctaveDelta` helper, but it always arrived with the two headroom
    // tests mutually exclusive (an anchor cannot satisfy both ≤ 33 and ≥ 35), so the
    // hash-seeded branch was structurally unreachable from there; the pair displacement that
    // needed it is gone and the pump gets its per-repeat independence from a menu draw
    // instead — see `createBassPump` in `bass-pump.ts`.
    const symmetryDirection = (canGoUp: boolean, canGoDown: boolean): number => {
        if (canGoUp && canGoDown) {
            const dirSeed = scrambleHash(
                (sectionIdHash ^ (sectionOccurrence * 0xc2b2ae35) ^ (phraseIndex * 0x27d4eb2f)) | 0,
            );
            return dirSeed < 0.5 ? -12 : 12;
        }
        if (canGoUp) {
            return 12;
        }
        if (canGoDown) {
            return -12;
        }
        return 0; // No headroom either direction.
    };

    const withImperfectSymmetry = (note: number): number => {
        // Gate conditions:
        //   - sectionOccurrence ≥ 2 (occurrence=1 is the "Statement", left untouched)
        //   - musical guards: not during soloist busy, intensity ≥ 0.25 so the
        //     quietest ambient passages aren't disrupted by an unexpected octave
        //     jolt. Floor lowered from 0.4 → 0.25 (Epic 12 S6 / LISTEN_TESTS B1):
        //     ballad-style verses (~0.30) are exactly where the mechanical-loop
        //     feel is most exposed, so this is where Imperfect Symmetry earns
        //     its keep. 0.25 still suppresses true sub-ambient passages where
        //     any octave jump would read as a glitch rather than a phrasing
        //     choice.
        //   - current step is at a beat-start (sub-beat 16ths/8ths stay in-register;
        //     a mid-beat octave jump would sound like a glitch, not phrasing)
        //   - exactly one target beat per 4-bar phrase, seeded so Verse 2 ≠ Verse 1
        if (!isRepeatPass || isSoloistBusyEarly || intensity < 0.25) {
            return note;
        }
        // A pump style takes its own branch and never reaches the generic gesture below.
        // That gesture leans on a single displaced note cascading through `prevMidi`'s
        // hand-position bonuses so the rest of the phrase migrates with it (see the "Audible
        // effect" note above), and a pump has no such cascade by design — its anchor ignores
        // `prevMidi`. #1271 shipped a whole-BEAT pair displacement to compensate; #1291
        // retired that gesture (see `createBassPump` in `bass-pump.ts` for why it was
        // key-determined rather than intent-determined), so what the pump does on its target
        // beat is now a re-voicing of the lift — inherently a one-note edit, needing no
        // cascade at all. `revoice` is the identity everywhere the gesture isn't live.
        if (pump.isAnchorStyle) {
            return pump.revoice(note, baseRoot);
        }
        if (!isBeatStartEarly) {
            return note;
        }
        if (!isSymmetryTargetBeat()) {
            return note;
        }
        // Comfort range (28-51) rather than absolute (23-57) keeps the generic
        // displacement in the bass's idiomatic neck range — the extreme attic /
        // sub-basement would sound out-of-character for a walking or melodic line even
        // when in-range. The pump path above never leaves 28-51 either, by construction
        // rather than by test: since #1291 its only pitches are `baseRoot`, `baseRoot + 7`
        // and `baseRoot + 12`, and `pumpAnchorFor` pins `baseRoot` to [28, 39].
        return note + symmetryDirection(note + 12 <= 51, note - 12 >= 28);
    };

    /**
     * @param muted - Palm-mute amount: 0 (open) to 1 (fully muted).
     */
    const result = (
        freq: number,
        durationMultiplier: number | null = null,
        velocityParam: number = 1.0,
        muted: number = 0,
        bendStartInterval: number = 0,
        // Test-observability only: the engine-computed chromatic-approach
        // target (`normalizeToRange(nextTarget)`). Set on the two
        // chord-change-approach return paths so a critique test can measure
        // landing distance against the SAME single octave the engine aimed at,
        // rather than re-folding across all octaves (which hides ±12 octave
        // jumps). Undefined on every other return path; inert in production —
        // the scheduler / MIDI export never read it.
        approachTargetRoot?: number,
    ) => {
        // #1064: the current section's label keys the energy modulation of the lean.
        let timingOffset = getBandPocket(groove.genreFeel, chord?.sectionLabel ?? null);
        if (style === 'neo' || groove.genreFeel === 'Neo-Soul') {
            // #1005: getBandPocket('Neo-Soul') already supplies the +25ms band pocket;
            // this residual is the EXTRA Dilla drag that sits the bass deeper than the
            // 25ms comp (deliberate neo-soul split, ~33-35ms bass total). Retuned from
            // 0.01+int*0.015 — that was tuned against the old 5ms bass base, and folding
            // in the 25ms palette without retuning stacked to a ~44-50ms over-drag.
            timingOffset += 0.005 + intensity * 0.005;
        }

        let durationSteps: number = 1;
        if (durationMultiplier !== null) {
            durationSteps = durationMultiplier;
        } else {
            if (style === 'rock') {
                durationSteps = ts.stepsPerBeat * 0.45;
            } else if (style === 'funk') {
                durationSteps = 0.8;
            } else if (
                style === 'disco' ||
                style === 'metal' ||
                style === 'neo' ||
                style === 'walking-ska' ||
                style === 'quarter' ||
                style === 'blues'
            ) {
                durationSteps =
                    style === 'quarter' || style === 'blues'
                        ? ts.stepsPerBeat * 0.4
                        : style === 'neo'
                          ? ts.stepsPerBeat * 0.5
                          : 0.8;
            } else {
                durationSteps = ts.stepsPerBeat;
            }
        }

        if (intensity < 0.4) {
            if (style === 'rock') {
                durationSteps = ts.stepsPerBeat * 0.4;
            } else if (style === 'funk') {
                durationSteps = 0.7;
            } else if (style === 'bossa') {
                durationSteps = durationMultiplier
                    ? durationMultiplier * (ts.stepsPerBeat / 4)
                    : ts.stepsPerBeat;
            }
        }

        // #941 — the generic `intensityFactor` (`0.6 + intensity * 0.7`) that used
        // to sit in this product is GONE. It was one of three multiplicative
        // intensity terms on the bass velocity (style token × intensityFactor ×
        // the band-wide conductor velocity), and their product railed against the
        // emission clamp: at chorus intensity every style's downbeat came out at
        // one identical velocity. The conductor now owns the lane's macro dynamic
        // law as a single term (`bassMacroGain` in `velocity-shaping.ts`), applied
        // FINAL-STAGE downstream of this clamp — see that function for why the
        // swell cannot live inside the emission domain. Everything left in this
        // product is intensity-FREE and expresses relative ARTICULATION only.

        // #1006 — WITHIN-PHRASE velocity envelope (design §4.6). The bass had NO
        // note-to-note dynamic shape: `velocity` (odd-beat accent) × a slow macro
        // term left every note in a bar at essentially one weight. A
        // real bassist swells INTO the metric anchors (the downbeat and the bar
        // midpoint) and eases off the step right after. This is a distance-to-target
        // shaping term applied FINAL-STAGE — a `* envelope` AFTER the accent × token
        // product — per the final-stage-multiplier rule; folded into the accent it would
        // wash out against the other factors. Genre-neutral first pass (no per-genre
        // contour tables yet). `stepInMeasure` is already measure-relative, so no #923
        // wrap is needed. KNOWN LIMITATION (#1006): multiplicative-then-clamped, so the
        // swell fades when the base is already hot — same tradeoff as the soloist envelope.
        // Note the envelope anchors beats 1 & 3 (metric). For styles still carrying
        // the generic backbeat accent (2 & 4) the combined per-beat weight reads
        // 1.05 / 1.15 / 1.05 / 1.15 — a coherent metric-under-backbeat interplay,
        // intentional for the genre-neutral pass. For the accent-exempt styles
        // (`EVEN_ACCENT_BASS_STYLES` since #1335, `GESTURE_ACCENT_BASS_STYLES`
        // since #1342) this envelope is the ONLY per-beat weight left — for funk
        // its 1.05-vs-1.025 strong-beat lean is what keeps The One on top of the
        // same-token "and" pop at all.
        const spb = ts.stepsPerBeat;
        const spBar = ts.beats * spb;
        const midBeatStepB = Math.floor(ts.beats / 2) * spb;
        const isStrongBeatB = stepInMeasure === 0 || stepInMeasure === midBeatStepB;
        const approachWindowB = Math.max(1, Math.floor(spb / 2)); // last eighth into a beat
        let bassEnvelope = 1.0;
        if (BASS_VELOCITY_ENVELOPE.enabled) {
            if (isStrongBeatB) {
                bassEnvelope = 1.05; // why: lean into the downbeat / bar midpoint — the pocket anchors
            } else {
                // Distance to the next strong beat (bar midpoint if before it, else the
                // next downbeat), and steps since the last one.
                const toStrongB =
                    stepInMeasure < midBeatStepB
                        ? midBeatStepB - stepInMeasure
                        : spBar - stepInMeasure;
                const lastStrongB = stepInMeasure >= midBeatStepB ? midBeatStepB : 0;
                const sinceStrongB = stepInMeasure - lastStrongB;
                if (toStrongB <= approachWindowB) {
                    // why: a pickup/passing note swells INTO the coming strong beat —
                    // louder the closer it is (an eighth out ≈ +1%, right before ≈ +5%).
                    const closenessB = 1 - (toStrongB - 1) / approachWindowB; // 0..1
                    bassEnvelope = 1.0 + 0.05 * closenessB;
                } else if (sinceStrongB >= 1 && sinceStrongB <= approachWindowB) {
                    // why: release — the step right after a strong beat eases off (−7%),
                    // recovering toward neutral.
                    const recoveryB = (sinceStrongB - 1) / approachWindowB; // 0..1
                    bassEnvelope = 0.93 + 0.07 * recoveryB;
                }
            }
        }
        // why: clamp to the DOMAIN ceiling (1.5), not the authoring ceiling (1.25)
        // — #1331. The product below is three ARTICULATION terms (style token ×
        // odd-beat accent × metric envelope); clamping it at the loudest value a
        // style is allowed to *author* would rail the accent even with the macro
        // term gone (1.25 × 1.15 × 1.05 = 1.51). Since #941 removed the stacked
        // intensity terms this clamp is effectively never reached — see
        // `BASS_VELOCITY_DOMAIN_MAX` for the split and why it stays anyway.
        const finalVel = Math.min(
            BASS_VELOCITY_DOMAIN_MAX,
            velocityParam * velocity * bassEnvelope,
        );
        const isLongStyle = ['acoustic'].includes(style);
        const maxSafeDuration =
            style === 'quarter'
                ? ts.stepsPerBeat * 0.45
                : isLongStyle
                  ? ts.stepsPerBeat * 1.95
                  : ts.stepsPerBeat * 0.95;
        const safeDuration = Math.min(durationSteps, maxSafeDuration);

        // why: Imperfect Symmetry (S2) — applied here so EVERY return path through
        // the bass engine inherits the repeat-pass octave displacement on its target
        // beat. The wrap is a no-op (returns the original note) when sectionOccurrence
        // is 1 or when the gate conditions don't match. Pitch class is preserved.
        const baseMidi = getMidi(freq);
        let outFreq = freq;
        let outMidi = baseMidi;
        if (baseMidi !== null) {
            const shiftedMidi = withImperfectSymmetry(baseMidi);
            if (shiftedMidi !== baseMidi) {
                outMidi = shiftedMidi;
                outFreq = getFrequency(shiftedMidi);
            }
        }

        return {
            freq: outFreq,
            midi: outMidi,
            velocity: finalVel,
            durationSteps: safeDuration,
            timingOffset,
            muted,
            bendStartInterval,
            approachTargetRoot,
        };
    };

    const isSoloistBusy = (soloist.session.phrasing.busySteps || 0) > 0;

    // --- Structural gate for withOctaveJump ---
    // why: bass.md P2 #12 / epic-deterministic-phrasing S4 — replace bare
    //   Math.random() in withOctaveJump with a (barIndex, sectionStart)-seeded
    //   hash and restrict firing to structural downbeats (bar 1 of a section
    //   or section start), per CLAUDE.md § Deterministic phrasing.
    // `isBeatStartLocal` reuses the value computed earlier (isBeatStartEarly)
    // for Imperfect Symmetry. `scrambleHash` is the shared mulberry32 declared
    // above the result() wrapper.
    //
    // #921/#924 — barIndex reuses barIndexEarly directly: both are now the
    // same loop-relative bar count (see the #924 comment where barIndexEarly
    // is defined), so there's a single wrap computed once, not two.
    const barIndex = barIndexEarly;
    const sectionSeedInt =
        typeof context?.sectionStart === 'number' ? Math.abs(context.sectionStart) | 0 : 0;
    const isBeatStartLocal = isBeatStartEarly;
    const isStructuralJumpPoint = isBeatStartLocal && (isDownbeat || isSectionStart);

    const withOctaveJump = (note: number): number => {
        if (isSoloistBusy || intensity < 0.4) {
            return note;
        }
        // #1271 — a pump style has no use for this. The gesture's premise (see below) is
        // that an octave displacement at a structural downbeat reads as an intentional
        // "dig-in"; that only works in a line whose ordinary vocabulary ISN'T octaves. A
        // pump already leaps the octave twice per beat, so displacing its anchor doesn't
        // add an accent — it removes one. The audible result is the pump stopping for a
        // beat: the "and" is computed from the anchor as it stood, so a jumped downbeat
        // lands on the same pitch as its own upbeat (unison) or above it (an inverted,
        // descending pump). Measured on the disco path before this guard: 6 of 128 measure
        // downbeats, every one of them a unison or a descent — the only remaining source
        // of either once the fixed anchor landed.
        //
        // Note disco reaches this via the generic `isStraightStyle` return below, NOT its
        // own style branch — that path claims every `stepInChord === 0` downbeat before
        // `getBassNoteStyle` runs. Grep `isStraightStyle` before assuming a style's
        // downbeat comes from its own branch.
        //
        // Disco's phrase-level variation is not lost: Imperfect Symmetry still fires, and
        // (per `createBassPump` in `bass-pump.ts`) either voices the lift as a 5th or drops
        // the beat outright — so the pump survives whichever outcome it picks.
        if (pump.isAnchorStyle) {
            return note;
        }
        // why: bass.md P2 #12 — bare RNG fires on 2-10% of ALL notes regardless
        //   of position, producing mid-line jolts in walking lines. Restricting
        //   to structural points makes octave displacement feel like an
        //   intentional "dig-in" at a section arrival or phrase downbeat.
        if (!isStructuralJumpPoint) {
            return note;
        }
        // Trigger and direction decisions are seeded from independently
        // scrambled hashes of (barIndex, sectionSeedInt). The probability
        // budget (2-10%) is preserved from the original; structural rarity
        // reduces effective all-note density to ~0.1-0.6%.
        const triggerHash = scrambleHash(barIndex * 0x9e3779b1 + sectionSeedInt * 0x85ebca77);
        if (triggerHash < 0.02 + intensity * 0.08) {
            const ceiling = style === 'neo' || groove.genreFeel === 'Neo-Soul' ? 42 : 55;
            // Force direction from available headroom: if a +12 jump would clear
            // the ceiling, must descend; if a -12 jump would underflow 36, must
            // ascend. Without this, an asymmetric clamp pre-S4 was silently
            // wiping ~50% of would-be jumps (review P0).
            // why: review found that at baseRoot 48, +12 = 60 > 55 ceiling and
            //   every UP fire was clamped to no-op. Decide direction by where
            //   the room is, then use the seed only for the symmetric case.
            const canGoUp = note + 12 <= ceiling;
            const canGoDown = note - 12 >= 36;
            let direction: number;
            if (canGoUp && !canGoDown) {
                direction = 1;
            } else if (canGoDown && !canGoUp) {
                direction = -1;
            } else if (canGoUp && canGoDown) {
                // Both fit — use a second scrambled hash to pick.
                const dirHash = scrambleHash(triggerHash * 0xffffffff + 0x27d4eb2d);
                direction = dirHash < 0.5 ? -1 : 1;
            } else {
                return note; // No headroom either direction.
            }
            return note + 12 * direction;
        }
        return note;
    };

    // --- Final-Bar Resolution Cascade (epic-form-arrangement S4) ---
    // why: form-arranger.md P1 #6 — when song-mode playback is ending, the band
    // should land together on the form's final downbeat. Today only the soloist
    // senses the form's end (SRDC `conclusion` phase); the bass hits
    // the loop boundary cold. On the final bar, play the tonic on beat 1 with
    // sustained duration (held through the bar) and emit nothing on subsequent
    // sub-beats — the "and we're done" gesture.
    //
    // Implementation:
    //   - Downbeat of final bar (isDownbeat && isFinalMeasure): emit a sustained
    //     root note (tonic of the current chord, normalized to bass range) with
    //     `durationSteps = stepsPerMeasure` so it rings through the bar.
    //   - Any subsequent step in the final bar: return null. Silence on those
    //     sub-beats lets the sustained tonic ring (and avoids the rock/funk
    //     8th-note pattern continuing to fire underneath the held note).
    //
    // Precedence: this short-circuit runs BEFORE the per-genre lanes and
    // bypasses result() entirely — we construct the note dict directly so
    // none of result()'s scaffolding interferes: no Imperfect-Symmetry wrap
    // (a 2nd+ occurrence outro must NOT see its tonic displaced ±12 by S2's
    // IS gesture — reviewer P1-1), no per-style duration clamp (the cadence
    // requests the full measure, intentionally exceeding short-style's
    // maxSafeDuration), no withOctaveJump.
    //
    // Musical intent: "land hard on the tonic, no variation theatre on the
    // way out." Velocity 1.1 — clear accent above the default 1.0 — signals
    // arrival without reaching the 1.25 authoring ceiling. Muted=0 (open) so the
    // note sustains cleanly.
    //
    // Source: docs/audit/form-arranger.md P1 #6;
    //         docs/audit/epic-form-arrangement.md S4.
    const isFinalMeasureBass = context?.stepCoordination?.isFinalMeasure === true;
    if (isFinalMeasureBass) {
        if (isDownbeat) {
            // why: same domain-vs-authoring split as `result()` above (#1331) —
            // the cadence's 1.1 token times the accent must stay free to swell
            // instead of railing at the authoring ceiling. #941 removed this
            // path's own copy of the generic `intensityFactor` for the same
            // reason `result()` lost it: the lane's macro swell is one term,
            // applied downstream (`bassMacroGain`), so the cadence rides the
            // band's dynamic exactly like every other bass note instead of
            // double-counting intensity here.
            const finalVel = Math.min(BASS_VELOCITY_DOMAIN_MAX, 1.1 * velocity);
            let timingOffset = getBandPocket(groove.genreFeel, chord?.sectionLabel ?? null);
            if (style === 'neo' || groove.genreFeel === 'Neo-Soul') {
                // #1005: see the main timing block — residual retuned against the 25ms
                // palette base so the neo-soul bass lands ~33-35ms deep (deeper than the
                // comp's 25ms), not the ~44-50ms the un-retuned stack produced.
                timingOffset += 0.005 + intensity * 0.005;
            }
            return {
                freq: getFrequency(baseRoot),
                midi: baseRoot,
                velocity: finalVel,
                // why: hold for the full measure — "the bassist landed and
                // let it ring." Bypassing result()'s maxSafeDuration clamp
                // is intentional; the cadence is a one-shot sustain, not the
                // per-style picking duration that clamp was designed for.
                durationSteps: stepsPerMeasure,
                timingOffset,
                muted: 0,
                bendStartInterval: 0,
            };
        }
        // why: subsequent steps in the final bar emit nothing. This is the
        // "ring out" half of the gesture — the tonic from beat 1 sustains; the
        // rock/funk 8th-note pattern doesn't undercut it with offbeat root hits.
        return null;
    }

    // --- #1276: the dropped beat (the pump's `drop` variation) ---
    // why: a `drop` silences its whole target beat — the downbeat, the "and", and any
    // gallop 16ths between them. That has to happen here rather than inside `result()`,
    // because `result()` returns a note dict that three call sites mutate in place
    // (`res.timingOffset += …` on the funk slap ghost and both reggae paths); making it
    // nullable would push a null guard onto every one of them for a gesture only an
    // anchor style can ever fire.
    //
    // #1291 moved the decision into `bass-pump.ts` but NOT this gate. Its position in
    // `getBassNote` is load-bearing (see below) and belongs to this function's control flow,
    // so the pump answers "is this beat dropped?" and the engine still owns "and therefore
    // return null, here".
    //
    // Placement is load-bearing in both directions:
    //   - AFTER the Final-Bar Resolution Cascade above, which bypasses `result()` to hold
    //     a sustained tonic through the form's last bar. An outro downbeat must never be
    //     silenced by a phrasing gesture — the same reason #1271's review (P1-1) kept
    //     Imperfect Symmetry off that cascade entirely.
    //   - BEFORE every remaining emission path (the `isStraightStyle` downbeat claim, the
    //     reggae fill, `getBassNoteStyle`'s disco branch, and the generic fallbacks), so a
    //     single gate covers every route a disco note can leave this function by. Verified
    //     by reading: nothing above this point emits for a pump style.
    //
    // One gate silences the whole beat because the pump's target-beat test compares against
    // `barInPhrase * beatsPerBar + intBeat`, and `intBeat` is
    // `floor(stepInMeasure / stepsPerBeat)` — constant across every sub-step of a beat. The
    // two `canDrop` terms inside `createBassPump`'s `variation` are beat-quantized for the
    // same reason.
    //
    // KNOWN LIMIT, compound meter. The "the kit still marks the spot" argument rests on
    // disco's kick being strict 4-on-the-floor, and in 4/4 it is on both drum paths. The
    // groove strategy's Kick lane (`grooves/disco.ts`) is `shouldPlay = isBeatStart` and
    // THEN `if (shouldPlay && !compoundKickAllowed(context)) shouldPlay = false` — a no-op
    // in 4/4, but in 6/8 it trims the kick to the two dotted-quarter pulses per bar while
    // this gesture's target beat still ranges over all six beats. So in compound meter a
    // dropped beat CAN land where the kick was trimmed, and there the hole is unmarked.
    // Deliberately not vetoed here: disco-in-6/8 is already an unusual reinterpretation
    // (see that lane's own comment), the bass gesture is not what makes it unusual, and a
    // meter-specific veto in the bass would encode a drum-lane detail in the wrong engine.
    // Characterized rather than asserted in `disco-bass-critique.test.ts`.
    if (pump.variation() === 'drop') {
        return null;
    }

    // #1293 — `half-drop`: the same gate, restricted to a single sub-step. Every sub-step of
    // the target beat EXCEPT the lift silences the way a full `drop` silences all of them;
    // the lift itself (`pump.isLiftStep()`) is spared and falls through to the ordinary
    // emission path below, where `forcesLift` guarantees it actually sounds and `revoice`
    // leaves it unmodified — this gesture is entirely about what goes silent, not about
    // re-voicing what remains. Same placement reasoning as the `drop` gate above: after the
    // Final-Bar cascade, before every remaining emission path.
    if (pump.variation() === 'half-drop' && !pump.isLiftStep()) {
        return null;
    }

    // --- Intro/Outro layering mute (epic-form-arrangement S5) ---
    // why: form-arranger.md P1 #4 — during the first `INTRO_MUTES.bass` bars of
    // an Intro section, AND during the last `OUTRO_MUTES.bass` bars of an Outro
    // section, the bass should be silent. The drums establish the groove first
    // (intro) and ring out the last bar (outro). `isBassActive` already mirrors
    // this gate; defense-in-depth here protects direct-call tests and any
    // future caller that bypasses `isBassActive`.
    //
    // Precedence: the isFinalMeasure short-circuit ABOVE already fired the S4
    // cadence on the form's final bar, so this mute cannot suppress the
    // resolution. Verified by reading: S4 returns BEFORE this block.
    const bassIntroElapsed = context?.stepCoordination?.introBarsElapsed ?? -1;
    if (bassIntroElapsed >= 0 && bassIntroElapsed < INTRO_MUTES.bass) {
        return null;
    }
    const bassOutroRemaining = context?.stepCoordination?.outroBarsRemaining ?? -1;
    if (bassOutroRemaining >= 0 && bassOutroRemaining <= OUTRO_MUTES.bass) {
        return null;
    }
    // why: arrangement-by-subtraction (story #1008) — defense-in-depth mirror of
    // the `isBassActive` subtraction gate, so any direct `getBassNote` caller or
    // future bypass also honors the seeded instrumentation plan. AFTER the S4
    // isFinalMeasure short-circuit above so the cadence is never suppressed.
    const bassSubtractionMutes = context?.stepCoordination?.subtractionMutedLanes;
    if (Array.isArray(bassSubtractionMutes) && bassSubtractionMutes.includes('bass')) {
        return null;
    }

    // --- Section-Transition Chromatic Anticipation ---
    // why: "The transition feels like the drummer is leading a band that didn't get
    // the chart" (form-arranger.md P0 #2). When the upcoming section's first chord
    // is known, land a chromatic approach note (±1 semitone) exactly at the half-beat
    // before the section downbeat so the bass walks into the new tonic.
    //
    // Gate conditions (all must hold):
    //   1. coordination.upcomingSectionFirstChord is published (last measure of section).
    //   2. We're at exactly sectionEnd - stepsPerBeat/2 (the "and-of-4" of the last beat).
    //   3. Style is in the melodic-walk set — `ANTICIPATION_STYLES` at module top, which
    //      is jazz/walking/funk/blues/bossa/neo. Dub and country are excluded: these
    //      styles favor root-hold or sparse patterns where a chromatic tail would feel
    //      forced. So are ROCK and DISCO, both of which this comment used to claim were
    //      included — rock's transition lives in the drum fill and disco rides the octave
    //      pump (see the module-top note on the set). Naming the set rather than
    //      re-listing it keeps the two from drifting apart again; the stale list sent a
    //      #1271 reviewer hunting for a disco register-drift source that isn't there.
    //
    // This is a direct pitch override (gate), not a weight multiplier — the
    // anticipation must fire deterministically at the correct step so the listener
    // hears it every time. One step per section boundary, nothing more.
    //
    // Source: form-arranger.md P0 #2; epic-coordination-contract.md S3.
    // (ANTICIPATION_STYLES is module-level so isBassActive sees the same gate.)
    const upcomingSectionChord = context?.stepCoordination?.upcomingSectionFirstChord;
    const bassAnticipationSectionEnd = context?.sectionEnd ?? null;
    const anticipationStep =
        bassAnticipationSectionEnd !== null
            ? bassAnticipationSectionEnd - Math.floor(ts.stepsPerBeat / 2)
            : -1;

    if (
        upcomingSectionChord &&
        bassAnticipationSectionEnd !== null &&
        step === anticipationStep &&
        ANTICIPATION_STYLES.has(style)
    ) {
        // Normalize the upcoming root into bass register using the same register
        // logic as the current chord.
        const nextRoot = upcomingSectionChord.bassMidi ?? upcomingSectionChord.rootMidi;
        const targetRoot = normalizeToRange(nextRoot);

        // Pick ±1 approach direction: prefer the smaller motion from the current
        // position. If no prevMidi, approach from below (half-step below is the
        // canonical "leading tone" walk-in).
        const fromBelow = targetRoot - 1;
        const fromAbove = targetRoot + 1;
        let approachMidi: number;
        if (prevMidi !== null) {
            const distBelow = Math.abs(fromBelow - prevMidi);
            const distAbove = Math.abs(fromAbove - prevMidi);
            // why: prefer smaller interval for smooth voice-leading; tie-break to below
            approachMidi = distBelow <= distAbove ? fromBelow : fromAbove;
        } else {
            // why: half-step below is the most idiomatic chromatic walk-in
            approachMidi = fromBelow;
        }

        // Clamp into bass register (23-57).
        while (approachMidi < absMin) {
            approachMidi += 12;
        }
        while (approachMidi > absMax) {
            approachMidi -= 12;
        }

        return result(
            getFrequency(approachMidi),
            // why: duration=1 (one sub-beat step) — short, punchy approach note that
            // doesn't blur into the new downbeat.
            1,
            // why: slight accent so the anticipation "pops" audibly before the new
            // section lands. (The ×1.15 inside `velocity` is the generic BACKBEAT
            // accent — beats 2 & 4 — not a downbeat accent; accent-carrying styles
            // land this walk-in on an odd beat and render it at 1.15 × 1.05 ≈ 1.21.)
            // Funk opts out of the per-beat accent (`GESTURE_ACCENT_BASS_STYLES`,
            // #1342), which left this walk-in — funk's one velocity-derived
            // emission — at a bare 1.05, the quietest full note in its bar at the
            // exact moment the comment above says it should pop (#942 review).
            // Authored explicitly instead: above the ornament band so the lead-in
            // reads, below the slap family so it doesn't rival the downbeat it
            // resolves into.
            //
            // why 1.02 (#947): was 1.15, which sat inside the slap family's own
            // 1.15-1.25 huddle and helped flatten the bar. This is a FRETTED
            // walk-in with no percussive attack, so it belongs on the lead-in rung
            // of funk's articulation ladder — the same rung as the chord-change
            // harmonic approach in `bass-styles.ts`, where the canonical ladder
            // table lives. 0.81 dB under the secondary slap, 0.90 dB over the
            // ornament band.
            style === 'funk' ? 1.02 : velocity * 1.05,
        );
    }

    if (style === 'neo' || groove.genreFeel === 'Neo-Soul') {
        const isUpbeat = step % ts.stepsPerBeat !== 0;
        const isSecondaryAnchor = stepInMeasure / ts.stepsPerBeat === 2;
        if (isDownbeat || isSecondaryAnchor) {
            // why (#941): was `1.15 + intensity * 0.1`. The intensity term was macro
            // loudness, not articulation — neo-soul's anchors are a fixed +15% over
            // the upbeat chatter whether the room is quiet or roaring. The lane's
            // swell is `bassMacroGain`'s job now; 1.15 is the anchor's articulation.
            return result(getFrequency(baseRoot), 0.9, 1.15);
        }
        if (isUpbeat) {
            // why: base 20% upbeat-chatter floor, +40% at full band intensity and
            // +30% at full arrangement complexity — Neo-Soul's between-the-anchors
            // fills should thicken with both energy and busyness, not fire at a
            // flat rate regardless of context.
            const hitProb = 0.2 + intensity * 0.4 + (playback.complexity || 0.5) * 0.3;
            // why: CLAUDE.md "Deterministic phrasing" — seed off the IN-LOOP step
            // (not the monotonic global `step`) so this repeats loop-to-loop
            // instead of just being reproducible at a fixed absolute step (was bare
            // Math.random(), diverging bar-to-bar on every replay).
            const inLoopStep =
                arranger.totalSteps > 0
                    ? (((step % arranger.totalSteps) + arranger.totalSteps) % arranger.totalSteps) |
                      0
                    : step;
            const hitHash = scrambleHash(inLoopStep * 0x9e3779b1 + sectionSeedInt * 0x85ebca77);
            if (hitHash < hitProb && !isSoloistBusy) {
                const pitchHash = scrambleHash(hitHash * 0xffffffff + 0x27d4eb2d);
                let note = baseRoot;
                let isGhost = false;
                let dur = 0.4;
                // why: top 30% of the draw — a 5th above root (a "reaching" upper
                // neighbor); next 30% (only when complexity > 0.6, i.e. a busier
                // arrangement) — a scale-degree passing tone (2nd if diatonic, else
                // the b7); remaining share — a muted ghost note (rhythmic chatter
                // with no clear pitch, the Neo-Soul pocket's default): 40% when
                // complexity > 0.6, 70% otherwise (the passing-tone band falls
                // through to ghost when the complexity gate isn't met).
                if (pitchHash > 0.7) {
                    note = baseRoot + 7;
                } else if (pitchHash > 0.4 && (playback.complexity || 0.5) > 0.6) {
                    note = scale.includes(2) ? baseRoot + 2 : baseRoot + 10;
                    dur = 0.2;
                } else {
                    isGhost = true;
                }
                const res = result(
                    getFrequency(clampAndNormalizeMidi(note, prevMidi)),
                    dur,
                    velocity * (isGhost ? 0.6 : 0.9),
                    isGhost ? 1 : 0,
                );
                res.timingOffset += 0.01 + intensity * 0.01;
                return res;
            }
        }
        return null;
    }

    const isSameAsPrev = (midi: number | null) => !!prevMidi && midi === prevMidi;
    const kickInst = (groove.instruments || []).find((i: any) => i.name === 'Kick');
    const hasKickTrigger = !!(
        kickInst?.steps && kickInst.steps[step % (groove.measures * stepsPerMeasure)] > 0
    );

    if (
        (style === 'rock' || style === 'funk') &&
        hasKickTrigger &&
        // #942 review: funk's chord-start slap ("The One") must not be intercepted
        // by the generic kick-lock. The shipped Funk preset has a kick ON step 0,
        // so this early return was intercepting the authored downbeat slap below and
        // handing The One `kickVel * (0.7 + 0.3i)` (~1.06 at i=0.5) — under
        // `popVel`, re-creating in the kick layer the exact inversion #1342 fixed
        // in the accent layer, invisible to any kickless harness. A slap player
        // locking to the kick digs the slap in HARDER, they don't drop to a
        // generic lock level: let funk's chord start fall through to its authored
        // gesture (which also owns the #1295 register fold this path lacks).
        // Kick-lock keeps every OTHER funk kick-coincident step — locking the line
        // to the syncopated kick is this branch's actual job.
        !(style === 'funk' && stepInChord === 0)
    ) {
        const kickVel =
            kickInst.steps[step % (groove.measures * stepsPerMeasure)] === 2 ? 1.25 : 1.15;
        // why (#941): was `kickVel * (0.7 + intensity * 0.3)`. The `0.7` survives as
        // the articulation offset — a kick-locked note DOUBLES the drummer, it
        // doesn't lead, so it sits a fixed notch under the authored downbeat tokens
        // — while the intensity slope moved to `bassMacroGain`. The 0.8 floor stays:
        // even the softest lock has to read as a played note, not a ghost.
        const dynamicKickVel = Math.max(0.8, kickVel * 0.7);
        return result(getFrequency(withOctaveJump(baseRoot)), null, dynamicKickVel);
    } else if (
        (style === 'rock' || style === 'funk') &&
        !hasKickTrigger &&
        intensity < 0.4 &&
        !isDownbeat
    ) {
        // Quiet rock/funk off-beats (low intensity): mostly lay out — 60% skip, else a
        // soft ghost 30% of the time for a breathing, human feel. Raw Math.random here
        // (not this file's scrambleHash sites) is deliberate: per-loop variety on this
        // ornament is wanted; loop-stable repetition is intentionally NOT (#1083).
        if (isSoloistBusy || Math.random() < 0.6) {
            return null;
        }
        if (Math.random() < 0.3) {
            return result(getFrequency(baseRoot), 1, 0.4, 1);
        }
    }

    if (style === 'blues') {
        const isUpbeat = stepInfo?.isOffbeat;
        if (hasKickTrigger) {
            const kickStepVal = kickInst.steps[step % (groove.measures * stepsPerMeasure)];
            const kickVel = kickStepVal === 2 ? 1.25 : 1.15;
            // why (#941): same de-stacking as the generic kick-lock above — the
            // `0.7` is the "doubling the drummer" articulation offset, the
            // intensity slope now lives once, in `bassMacroGain`.
            return result(getFrequency(baseRoot), null, Math.max(0.8, kickVel * 0.7));
        }
        if (stepInMeasure % ts.stepsPerBeat === 0 && !isUpbeat) {
            const beatInPattern = intBeat % 4;
            let targetInterval = 0;
            if (beatInPattern === 1) {
                targetInterval = scale.includes(7) ? 7 : 6;
            } else if (beatInPattern === 2) {
                targetInterval = scale.includes(9) ? 9 : 7;
            } else if (beatInPattern === 3) {
                targetInterval = scale.includes(10) ? 10 : 9;
            }
            // High-energy blues (intensity > 0.7): 40% of the time break the predictable
            // walk-up with a random scale tone for an improvised, live feel. Raw
            // Math.random (not scrambleHash) on purpose — per-loop variety is the point (#1083).
            if (intensity > 0.7 && Math.random() < 0.4) {
                targetInterval = scale[Math.floor(Math.random() * scale.length)];
            }
            return result(
                getFrequency(clampAndNormalizeMidi(baseRoot + targetInterval, prevMidi)),
                ts.stepsPerBeat * 0.45,
                velocity,
            );
        }
        if (isUpbeat) {
            const res = result(
                getFrequency(clampAndNormalizeMidi(prevMidi || baseRoot, prevMidi)),
                0.8,
                velocity * 0.8,
                1,
            );
            res.timingOffset += 0.005;
            return res;
        }
    }

    const isStraightStyle = ['rock', 'quarter', 'disco', 'neo'].includes(style);
    if (
        stepInChord === 0 &&
        (isStraightStyle || style === 'funk') &&
        groove.genreFeel !== 'Reggae'
    ) {
        // why: #1295 — this is the site that actually emits funk's "The One": it
        // intercepts stepInChord === 0 ahead of getBassNoteStyle, so that function's
        // own (redundant) isOne arm never runs for funk. A funk downbeat is played
        // KNOWING a slap-pop follows on the "and" 60-100% of the time
        // (bass-styles.ts's funk popProb branch) — a real player leaves headroom for
        // that octave-up snap by choosing the lower hand position rather than
        // stranding the pop against the register ceiling. `normalizeToRange`'s own
        // register drift (not `withOctaveJump`'s deliberate rare structural jump —
        // see below) is what pushes the downbeat there: measured #1295: 93/128
        // downbeats resolve to MIDI 48 at bandIntensity 0.9, against absMax 57.
        // Fold BEFORE `withOctaveJump`, not its output: an earlier version folded
        // `withOctaveJump`'s result, which silently cancelled every Imperfect
        // Symmetry structural jump for funk (measured: collapsed 128/128 downbeats
        // to a single fixed pitch on a 128-bar sweep — a real musical regression,
        // caught in review). `withOctaveJump` already has its own headroom-aware
        // direction logic (`canGoUp`/`canGoDown`, ceiling 55) and is rare (~2-10% of
        // structural points), so it's left free to fire and occasionally still land
        // a downbeat too high for the pop to lift off of — on those rare bars the
        // pop's own existing `note > absMax ? slappedRoot : note` fallback holds a
        // unison, which is a far smaller musical cost than flattening every
        // downbeat's register for the whole performance.
        const safeBaseRoot = style === 'funk' && baseRoot > absMax - 12 ? baseRoot - 12 : baseRoot;
        const slapNote = withOctaveJump(safeBaseRoot);
        return result(
            getFrequency(slapNote),
            null,
            // #1334: was a flat 1.25 (BASS_AUTHORING_CEILING) — funk was the
            // only branch here with no intensity term, so the downbeat slap
            // didn't respond to the band's dynamic build at all. `1.25 +
            // intensity*0.2` matches `popVel`'s exact slope/base (`bass-
            // styles.ts`) and sits 0.05 above the beat-3 "secondary slap"'s
            // `slapVel` (`1.2 + intensity*0.2`, same gesture class per that
            // file's own "The One (and Beat 3) - Primary Slaps" grouping) —
            // preserving The One as the loudest of the two rather than making
            // them identical.
            //
            // Measured effect: the downbeat gets measurably louder through
            // the verse->chorus build (i≈0.4-0.7, +0.2 to +0.5dB over the old
            // flat value there).
            //
            // #941 FOLLOW-THROUGH: the `+ intensity * 0.2` slope is gone from
            // both this token and `popVel` — they are now flat 1.25 and 1.2,
            // the same 0.05 apart as before, and the lane's macro swell is the
            // single downstream `bassMacroGain` term. The saturation this
            // paragraph described is what that change removed: at i≥0.7 the two
            // used to saturate `BASS_VELOCITY_DOMAIN_MAX` and render identically
            // regardless of either one's own slope — a structural ceiling, not a
            // tuning problem. Below that ceiling The One is now never out-rendered by
            // any other note — an ORDERING claim, not audible dominance: the
            // margin over the same-token "and" pop is only the metric
            // envelope's 1.05 vs 1.025 (~0.1-0.19 dB rendered, under the ~1 dB
            // JND), because this token deliberately equals `popVel`.
            //
            // #947 DECISION (2026-08-07): ordering is the intended contract and
            // this token STAYS at the ceiling alongside `popVel`. "On The One" is
            // a structural idea, not a loudness ranking — in real slap bass the
            // pop is very often the brightest event in the bar — so The One is
            // an anchor, not a mandatory loudness winner, and nothing here should
            // push it above the pop. What #947 fixed instead was the bar's total
            // dynamic RANGE: the rungs BELOW this one (secondary slap, fingered
            // lead-ins, the "a" flick-pop, the hammer-on) were bunched within
            // ~1.1 dB of it and were re-spaced downward. Canonical ladder table:
            // the top of the `style === 'funk'` branch in `bass-styles.ts`.
            // #1342 removed the generic +15%
            // backbeat accent from funk
            // (`GESTURE_ACCENT_BASS_STYLES`), which until then rode the "and"
            // pop (odd `intBeat`) and not The One (even `intBeat`) and made the
            // pop measurably louder from i≈0.1 to i≈0.65. Guarded by the
            // #1342 assertions in `tests/standards/funk-bass-critique.test.ts`.
            //
            // #1340: 'quarter' (jazz walking) gets flat 1.0 here, not the
            // `1.0 + intensity*0.25` rock/disco/neo share. `isStraightStyle`
            // is reused above purely to decide which styles emit their
            // downbeat through THIS branch (a rhythmic/entry-gate question);
            // this velocity literal is a separate, dynamics-only decision,
            // and jazz walking's drive is note-length + the quarter pulse,
            // not a downbeat accent — same reasoning #1335 already applied to
            // the generic backbeat accent (`EVEN_ACCENT_BASS_STYLES`). Every
            // OTHER quarter-note step in the bar already reaches `result()`
            // (via `getBassNoteStyle`, downstream of this early-return) at
            // 1.0 or an intentionally SOFTER literal (path/pickup notes are
            // `velocity * 0.9`/`0.85` in `bass-styles.ts`) — never a boosted
            // one — so 1.0 here just makes the downbeat consistent with the
            // rest of the walking line, not louder than any of it. It
            // still gets the genre-neutral +5% strong-beat swell from
            // `bassEnvelope` (`#1006`, `isStrongBeatB` above), same as every
            // other style's downbeat. rock/disco/neo are unchanged pending a
            // by-ear call on whether they want this too (out of scope here).
            // #941: `1.0 + intensity*0.25` became a flat 1.1 for rock/disco/neo.
            // The slope was pure macro loudness (the token IS 1.0 — i.e. no accent
            // at all — at low intensity, and only becomes an anchor accent at
            // chorus), which is precisely the "louder when the band is louder"
            // shape that now belongs to `bassMacroGain` alone. But collapsing it to
            // a bare 1.0 would have erased #1340's deliberate rock-vs-jazz-walking
            // distinction AND left rock's downbeat permanently quieter than its own
            // 1.15 backbeat accent — a rock bassist digs into The One at every
            // dynamic, not only at chorus. 1.1 is that accent expressed as
            // articulation: the old token's value at the reference mid intensity
            // (1.125) rounded onto the file's existing accent vocabulary, so the
            // rendered mid-intensity downbeat moves +0.4 dB (under the ~1 dB JND)
            // while the accent now holds at i=0.1 as well as i=1.0.
            style === 'funk' ? BASS_AUTHORING_CEILING : style === 'quarter' ? 1.0 : 1.1,
        );
    }

    // --- Reggae Coordination Fill (epic-coordination-consistency S2.b) ---
    // why: bass-engine.ts previously read only kickHit for reggae lock-in. On a
    // soloist phrase-end (≥3 notes then rest) OR a real chord change at the bar
    // boundary, the dub bassist can answer with a single approach note at the
    // bar's anticipation slot — a conversational gesture during the soloist's
    // exhale, then drop straight back into the riddim on the next downbeat. The
    // reggae bass is locked-in by default; these are ADDITIONS on specific
    // gated steps, not a replacement of the kick-lock pattern.
    //
    // Gate conditions (all must hold for the block to fire at all):
    //   1. style === 'dub' OR genre === 'Reggae'.
    //   2. step is at the meter-aware anticipation slot: stepsPerMeasure - 2
    //      in simple meters (the "and-of-4" in 4/4) and stepsPerMeasure - 1
    //      in compound meters (the final eighth in 6/8 = step 11). Matches
    //      the ANTICIPATION_STYLES site for jazz/walking so the gesture lands
    //      in the same rhythmic place across meters.
    //
    // Then EITHER trigger fires the fill (ORed; we don't double-emit — one
    // approach note per step, period):
    //   A. Phrase-end: coordination.soloistResting === true AND
    //      soloistNotesInPhrase >= 3. Approach the CURRENT chord's root (we're
    //      not changing chord — the soloist breathed; we put a melodic comma
    //      under the rest by walking back into the next bar's root downbeat
    //      from a chromatic neighbor below).
    //   B. Chord-change approach: isChordChangeApproach(nextChord, chord) — a
    //      bar-to-bar root change. Walk into the upcoming root chromatically
    //      from below or above (pick smaller motion from prevMidi).
    //
    // Don't double-fire: B takes precedence when both apply (a real chord
    // change is the stronger musical signal; the phrase-end fill is a
    // conversational gesture, the chord-change approach is functional voice-
    // leading). Returning early bypasses the riddim table's hit at this step
    // (only 54-46 has a step-14 entry; on other riddims the slot was silent
    // and we're adding a new attack; on 54-46 we're replacing the lock-in
    // riddim note with a more musical approach — same single attack, just a
    // different pitch).
    //
    // Source: docs/audit/epic-coordination-consistency.md S2.b;
    //         FOLLOWUPS §D (reggae bass).
    const reggaeFillStyle = style === 'dub' || groove.genreFeel === 'Reggae';
    // why: compound-meter S5 — anticipation is the final eighth before the
    // downbeat; in 6/8 (stepsPerMeasure=12) that's step 11, in 4/4 it's
    // step 14 ("and of 4"). Stays paired with isAnticipation at line ~122.
    const reggaeFillStep = stepInMeasure === stepsPerMeasure - (ts.isCompound ? 1 : 2);
    if (reggaeFillStyle && reggaeFillStep) {
        const reggaeSoloistResting = context?.stepCoordination?.soloistResting === true;
        const reggaeNotesInPhrase = context?.stepCoordination?.soloistNotesInPhrase ?? 0;
        const reggaePhraseEnd = reggaeSoloistResting && reggaeNotesInPhrase >= 3;
        const reggaeChordChange = isChordChangeApproach(nextChord, chord);
        if (reggaePhraseEnd || reggaeChordChange) {
            // why: target the NEXT chord's root when there's a real chord change
            // (functional voice-leading into the new tonic); fall back to the
            // current chord's root on phrase-end-only fills (the soloist's
            // exhale doesn't change the chord, so we walk back into our own
            // downbeat).
            const targetSource = reggaeChordChange
                ? (nextChord?.bassMidi ?? nextChord?.rootMidi)
                : (chord.bassMidi ?? chord.rootMidi);
            const targetRoot = normalizeToRange(targetSource as number);

            // why: choose the approach pitch by trigger type.
            //  - Chord-change approach: a chromatic half-step neighbor of the
            //    NEW root is functional voice-leading into a different chord —
            //    the canonical reggae/dub walk-in (kept as-is).
            //  - Phrase-end-only: the chord is NOT changing, so a chromatic
            //    half-step against the SAME chord is a jazz-style chromatic
            //    rub, not a reggae idiom. The 54-46 riddim already fills
            //    step 14 with a clean lock-in root, and substituting a b9/maj7
            //    rub there reads as a different player. Walk in from a
            //    SCALE TONE adjacent to the root instead (typically the 7 or
            //    b7 below / the 2 above) — a diatonic walk-in that lands the
            //    root cleanly on the downbeat.
            // why: scale tones adjacent to PC 0. `scale` is the chord's
            // diatonic interval set including 0; scale[1] is the step above
            // the root, scale[last]-12 is the step below.
            const scaleStepAbove = scale.length > 1 ? scale[1] : 2;
            const scaleStepBelow = scale.length > 1 ? scale[scale.length - 1] - 12 : -2;
            const fromBelow = reggaeChordChange
                ? targetRoot - 1 // chromatic leading tone into the NEW root
                : targetRoot + scaleStepBelow; // diatonic walk-in below same root
            const fromAbove = reggaeChordChange
                ? targetRoot + 1 // chromatic upper neighbor into the NEW root
                : targetRoot + scaleStepAbove; // diatonic walk-in above same root
            let approachMidi: number;
            if (prevMidi !== null) {
                const distBelow = Math.abs(fromBelow - prevMidi);
                const distAbove = Math.abs(fromAbove - prevMidi);
                approachMidi = distBelow <= distAbove ? fromBelow : fromAbove;
            } else {
                approachMidi = fromBelow;
            }

            // why: keep the approach in reggae's grounded basement register
            // — the dub branch in getBassNoteStyle forces finalDeepRoot ≤ 38;
            // mirror that here so the fill doesn't pop above the riddim's
            // natural register and feel like a different instrument joined.
            while (approachMidi > 38) {
                approachMidi -= 12;
            }
            while (approachMidi < absMin) {
                approachMidi += 12;
            }

            // why: mirror dub style's velocity envelope so the fill lives in
            // the same dynamic pocket as the riddim hits — the dub style
            // handler in bass-styles.ts (tunedVel) scales the riddim's stored
            // velocity by 0.8 and jitters by (0.95 + rand * 0.1).
            // Without this mirror, the fill pops out as a different voice
            // (Epic 9 S2.b review P1 #4). The ×1.05 accent on top encodes
            // the "deliberate gesture" reading.
            // #941: the mirrored term lost its `+ intensity * 0.3` slope at the
            // same time `tunedVel` did — this is a PAIRED SITE, and the two have
            // to keep matching or the fill stops sitting in the riddim's pocket.
            const reggaeFillVel = velocity * 0.8 * (0.95 + Math.random() * 0.1) * 1.05;
            const reggaeFillRes = result(
                getFrequency(approachMidi),
                // why: short duration (1 step) — pickup into the next downbeat,
                // not a sustained note. Matches the section-anticipation
                // duration at line ~810.
                1,
                reggaeFillVel,
            );
            // why: dub style adds (0.01 + intensity * 0.01) timing offset for
            // the lazy reggae lay-back (the dub style handler in bass-styles.ts). The fill is part
            // of the same riddim conversation; without the offset it sits
            // rhythmically ahead of the surrounding hits and reads as a
            // different player. (Epic 9 S2.b review P1 #4.)
            reggaeFillRes.timingOffset += 0.01 + intensity * 0.01;
            return reggaeFillRes;
        }
    }

    const styleResult = getBassNoteStyle(
        style,
        chord,
        nextChord ?? null,
        step,
        stepInChord,
        stepInfo || null,
        {
            withOctaveJump,
            isSameAsPrev,
            clampAndNormalize: clampAndNormalizeMidi,
            normalizeToRange,
            // #1292 — the pump's say in the EMISSION, not just in the post-hoc `revoice`.
            // A drawn `fifth` re-voices a lift, so there has to be a lift for it to act on.
            pumpForcesLift: pump.forcesLift(),
        },
        ts,
        stepsPerMeasure,
        intBeat,
        step % ts.stepsPerBeat === 0,
        stepInMeasure % ts.stepsPerBeat === 0,
        isDownbeat,
        stepInMeasure,
        step % ts.stepsPerBeat,
        baseRoot,
        prevFreq || 0,
        prevMidi || baseRoot,
        centerMidi,
        absMin,
        absMax,
        scale,
        playback,
        groove,
        soloist,
        intensity,
        velocity,
        isSoloistBusy,
        beatsInChord,
        result,
        stepInMeasure % ((ts.grouping?.[0] || ts.beats) * ts.stepsPerBeat) === 0,
        hasKickTrigger,
        kickInst ?? null,
        // why: epic-deferred-followups S2 — section-gated rock anticipation push.
        // Pass the section-boundary distance so the rock branch can cluster the
        // push gesture at structural boundaries rather than firing uniformly on
        // every chord change. undefined when no coordination context is available
        // (e.g. test mocks that don't supply stepCoordination); the rock branch
        // treats undefined identically to -1 (no boundary known → 0.15× residual).
        context?.stepCoordination?.barsUntilSectionChange,
    );
    if (styleResult !== undefined) {
        return styleResult;
    }

    const isLastBeatOfMeasure = intBeat === ts.beats - 1;
    const isEndOfChord = intBeat === beatsInChord - 1;
    const isEighthSkip = stepInMeasure % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat * 0.5);
    const isApproachPoint =
        (stepInMeasure % ts.stepsPerBeat === 0 && (isLastBeatOfMeasure || isEndOfChord)) ||
        isEighthSkip ||
        // why: compound-meter S5 — meter-aware anticipation slot (final eighth
        // in compound = step 11 of 12, "and of 4" in simple = step 14 of 16).
        step % stepsPerMeasure === stepsPerMeasure - (ts.isCompound ? 1 : 2);

    if (isApproachPoint && isChordChangeApproach(nextChord, chord)) {
        const nextTarget = nextChord.bassMidi ?? nextChord.rootMidi;
        const targetRoot = normalizeToRange(nextTarget);
        let chromaticProb =
            (isSoloistBusy ? 0.4 : 0.6) +
            ((soloist.session.tension || 0) +
                intensity * 0.3 +
                (playback.complexity || 0.5) * 0.2) *
                0.3;
        if (intensity > 0.75 && ['Jazz', 'Blues'].includes(groove.genreFeel)) {
            // why: jazz/blues idiomatic — chromatic leading tones are the primary
            // approach vocabulary at high intensity; raise to near-certain.
            chromaticProb = 0.95;
        } else if (!['Jazz', 'Blues'].includes(groove.genreFeel)) {
            // why: rock/funk/pop/country/soul/gospel all use chromatic approaches but
            // less frequently than jazz/blues — half the base probability preserves the
            // idiom without over-jazzing non-jazz genres (bass.md P1 #4).
            chromaticProb *= 0.5;
        }

        if (Math.random() < chromaticProb) {
            const choices = [
                { midi: targetRoot - 5, weight: 0.5 },
                { midi: targetRoot - 1, weight: 1.0 },
                { midi: targetRoot + 1, weight: 1.0 },
            ];
            let tw = 0;
            for (let i = 0; i < choices.length; i++) {
                tw += choices[i].weight;
            }
            let r = Math.random() * tw;
            let approach = targetRoot - 1;
            for (const c of choices) {
                r -= c.weight;
                if (r <= 0) {
                    approach = c.midi;
                    break;
                }
            }
            // why: approach notes must sit within ±5 semitones of their target;
            // withOctaveJump would add ±12, contradicting the chromatic leading-tone
            // intent (F#2→G2 becomes F#3→G2 — a dissonant leap, not a half-step).
            // Reserve octave displacement for downbeat root statements only (bass.md P0 #2).
            approach = clampAndNormalizeMidi(approach, prevMidi);
            return result(
                getFrequency(approach),
                1,
                velocity,
                0,
                approachBend(groove.genreFeel, approach, targetRoot, isSoloistBusy),
                targetRoot,
            );
        } else {
            const valid = [targetRoot - 5, targetRoot + 7, targetRoot + 5, targetRoot - 7].filter(
                (n) => n >= absMin && n <= absMax && !isSameAsPrev(n) && n % 12 !== baseRoot % 12,
            );
            // why: candidates are already filtered to absMin–absMax (bass register 23–57),
            // so they're in range. withOctaveJump would add ±12 and turn the intended
            // perfect-fourth below (−5) into an octave-displaced leap. Approach notes
            // must stay close to their target — reserve octave jumps for downbeat roots.
            return result(
                getFrequency(
                    valid.length > 0
                        ? valid[Math.floor(Math.random() * valid.length)]
                        : targetRoot - 5,
                ),
                null,
                velocity,
                0,
                0,
                targetRoot,
            );
        }
    }

    if (intBeat > 0) {
        let candidates: { midi: number; weight: number }[] = scale
            .map((pc: number) => clampAndNormalize(baseRoot + pc, prevMidi))
            .filter((n) => !isSameAsPrev(n.midi));
        if (isSoloistBusy) {
            candidates = candidates.filter((n) => {
                const pc = n.midi % 12,
                    rpc = baseRoot % 12;
                return pc === rpc || pc === (rpc + 7) % 12;
            });
            if (candidates.length === 0) {
                candidates = [baseRoot, baseRoot + 7, baseRoot - 5].map((n) =>
                    clampAndNormalize(n, prevMidi),
                );
            }
        }
        if (candidates.length > 0) {
            // Priority 1: Hand position (Weight already includes stepwise bonus)
            // Priority 2: Proximity to Center
            candidates.sort((a, b) => b.weight - a.weight);

            // Target-aware bias (beats 2-3-4): walking lines should lean toward the
            // next chord's root so the line has directional momentum. A real walking
            // bassist's pull toward the target is beat-asymmetric — beat 4 is the
            // approach (strongest pull), beat 3 a directional pass (moderate), beat 2
            // is mostly about leaving the root (weakest). Scaling by (intBeat / 3) on
            // the proximity term encodes that pedagogy: beat 2 gets ~1/3 the lift,
            // beat 3 ~2/3, beat 4 full. (In practice beat 4 is usually intercepted by
            // the chromatic-approach branch above, but on held chords where that
            // branch doesn't fire this preserves the right shape.)
            // Final-stage weight *= multiplier (not additive) so it dominates over the
            // hand-position / center-proximity ranking already embedded in each weight.
            // why: bass.md P1 #10 (target-awareness) — generic fallback had no pull
            //   toward the next chord's root; this multiplier is the fix. P2 #15
            //   (deterministic phrasing) is addressed by the seedBit pick below.
            // Uses the outer `barIndex` declared near withOctaveJump (S4); same value.
            // why: isChordChangeApproach uses bassMidi ?? rootMidi, catching slash-chord
            //   changes (e.g. C → C/E) that this inline `rootMidi !== rootMidi` check
            //   would miss. Source: FOLLOWUPS §C — slash-chord-blind predicate migration.
            if (nextChord && isChordChangeApproach(nextChord, chord)) {
                const nextTarget = normalizeToRange(nextChord.bassMidi ?? nextChord.rootMidi);
                // why: 7-semitone (perfect-fifth) approach window. A candidate within
                //   a fifth of the target gets meaningful lift; beyond a fifth, the
                //   note is too distant to feel like an approach and the lift falls
                //   off to zero.
                // why: APPROACH_STRENGTH = 8. The candidate weights coming out of
                //   clampAndNormalize stack hand-position (×1.5–3) × style-priority
                //   (×5) × root/5th stability (×1.5), so a top candidate routinely
                //   sits at ~15–20× over a peripheral scale tone. A bare
                //   `1 + proximity * beatScale` multiplier (max 1.33× at beat 2,
                //   2× at beat 4) gets washed out — verified by the Epic-12 S5
                //   discriminating test that the multiplier had no measurable
                //   effect on the picked-note distribution at beat 2. ×8 lifts
                //   beat 2 to max 3.67×, beat 3 to 6.33×, beat 4 to 9× — enough
                //   to push a target-adjacent candidate (5th-of-current that's
                //   one step from next-root) past the original root in the
                //   top-2 ranking while still preserving the beat-asymmetric
                //   pedagogy beat 4 > beat 3 > beat 2.
                const APPROACH_WINDOW = 7;
                const APPROACH_STRENGTH = 8;
                const beatScale = intBeat / 3;
                for (const c of candidates) {
                    const dist = Math.abs(c.midi - nextTarget);
                    const proximity = Math.max(0, 1 - dist / APPROACH_WINDOW);
                    c.weight *= 1 + proximity * beatScale * APPROACH_STRENGTH;
                }
                // Re-sort after target-distance bias applied.
                candidates.sort((a, b) => b.weight - a.weight);
            }

            // Deterministic parity pick between the top two candidates. Replaces the
            // old `Math.random() * 2` (same "vary between the two best" intent) with
            // a seeded boolean so the same bar produces the same note across loops,
            // per CLAUDE.md § Deterministic phrasing.
            // Why parity over modulo-3-of-sorted-list: after target-distance re-sort,
            // candidates[0] is always closest to the target. A `% 3` cycle would walk
            // closest→2nd→3rd in monotonic order every chord-change bar, producing a
            // robotic phrase and frequently landing the next root *on* the passing
            // beat (killing its character). Binary parity preserves the original
            // top-2 variety without imposing a fixed sequence.
            // why: bass.md P2 #15 — raw Math.random() makes loops diverge; reviewer
            //   flagged %3 as monotone-robotic; parity restores idiomatic phrasing.
            const seedBit = (barIndex * 7 + intBeat * 11) & 1;
            const pickIndex = candidates.length > 1 ? seedBit : 0;
            return result(getFrequency(withOctaveJump(candidates[pickIndex].midi)), null, velocity);
        }
    }
    return result(getFrequency(withOctaveJump(baseRoot)), null, velocity);
}
