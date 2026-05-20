import type { Chord, EnsembleState, Mutable, StepInfo } from '../types.js';
import { calculateTimingOffset, getFrequency, getMidi } from '../utils.js';
import { getScaleForChord } from './theory-scales.js';

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
import { checkBassActiveStyle, getBassNoteStyle, isChordChangeApproach } from './bass-styles.js';

// why: Genres where bass-doubles-kick is the musical intent. Other styles
// (jazz/dub/country/blues/bossa/acoustic/neo/walking-ska/hiphop/whole/half/arp)
// phrase against the kick and choose their own active lane. Hip-hop is independent
// — 808 sub-bass sustains across the kick pattern rather than re-articulating with
// every hi-hat-locked kick burst.
const KICK_LOCK_STYLES = new Set(['rock', 'funk', 'rocco', 'metal', 'disco']);

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
const ANTICIPATION_STYLES = new Set(['jazz', 'walking', 'funk', 'blues', 'bossa', 'rocco', 'neo']);

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
    // "and-of-4" of the bar so the bass answers the soloist's exhale with a
    // pickup into the next downbeat. Without this force-activation, dub's
    // riddim-only gate (checkBassActiveStyle line ~212) would skip step 14 on
    // every riddim except 54-46, and the conversational gesture would be dead
    // code. The actual approach-note emission lives in getBassNote's reggae
    // coordination block (just before the call to getBassNoteStyle).
    //
    // Gate: step is at stepsPerMeasure - 2 (step 14 in 4/4) AND coordination
    // signals a phrase-end. Tension-chord-change approach (the second branch
    // in the audit-doc sketch) is also gated here via upcomingSectionFirstChord
    // when present, but bar-to-bar nextChord cases are handled inside getBassNote
    // where the nextChord argument is in scope. ANTICIPATION_STYLES already
    // covers section-boundary anticipation for jazz/walking/etc.; reggae gets
    // its own narrower force-activation so non-section-boundary phrase-end
    // fills still fire.
    const isReggaeStyle = style === 'dub' || (groove.genreFeel || '') === 'Reggae';
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const isAndOfFour = step % stepsPerBar === stepsPerBar - 2;
    const soloistRestingForFill = coordination?.soloistResting === true;
    const notesInPhraseForFill = coordination?.soloistNotesInPhrase ?? 0;
    if (isReggaeStyle && isAndOfFour && soloistRestingForFill && notesInPhraseForFill >= 3) {
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

    const intBeat = stepInfo
        ? stepInfo.beatIndex
        : Math.floor((step % (ts.beats * ts.stepsPerBeat)) / ts.stepsPerBeat);
    const isQuarter = stepInfo ? stepInfo.isBeatStart : step % ts.stepsPerBeat === 0;
    const is8th = step % (ts.stepsPerBeat / 2) === 0;

    return checkBassActiveStyle(
        style,
        step,
        stepInChord,
        stepInfo || null,
        ts,
        intBeat,
        isQuarter,
        is8th,
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
    } else if (style === 'rocco') {
        safeCenterMidi = 45; // Prefer A/D strings area
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

    const isSectionStart = context && step === context.sectionStart;
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

    const rootToNormalize =
        chord.bassMidi !== null && chord.bassMidi !== undefined ? chord.bassMidi : chord.rootMidi;
    const baseRoot = normalizeToRange(rootToNormalize);
    const scale = getScaleForChord(state, chord, nextChord, style);
    const beatsInChord = Math.round(chord.beats);
    const velocity = intBeat % 2 === 1 ? 1.15 : 1.0;

    // --- Shared seeded RNG (used by both Imperfect Symmetry and withOctaveJump) ---
    // mulberry32 — 32-bit scrambled hash. Hoisted up here so the result() wrapper
    // (defined just below) can apply Imperfect-Symmetry post-processing without
    // duplicating the hash function.
    const scrambleHash = (seed: number): number => {
        let t = (seed + 0x6d2b79f5) | 0;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };

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
    const barIndexEarly = Math.floor(step / stepsPerMeasure);
    const isBeatStartEarly = stepInfo?.isBeatStart ?? step % ts.stepsPerBeat === 0;
    const isSoloistBusyEarly = (soloist.session.phrasing.busySteps || 0) > 0;
    const sectionOccurrence: number = context?.stepCoordination?.sectionOccurrence ?? 1;
    const isRepeatPass = sectionOccurrence >= 2;
    // Hash the sectionId (string) into a 32-bit int so different sections of the
    // same occurrence-index get different phrase-target patterns. Cheap djb2.
    const sectionIdStr: string = (chord as any)?.sectionId || '';
    let sectionIdHash = 5381 | 0;
    for (let i = 0; i < sectionIdStr.length; i++) {
        sectionIdHash = (Math.imul(sectionIdHash, 33) + sectionIdStr.charCodeAt(i)) | 0;
    }
    const PHRASE_BARS = 4; // why: standard 4-bar phrase in pop/rock/jazz.
    const phraseIndex = Math.floor(barIndexEarly / PHRASE_BARS);
    const barInPhrase = barIndexEarly % PHRASE_BARS;

    const withImperfectSymmetry = (note: number): number => {
        // Gate conditions:
        //   - sectionOccurrence ≥ 2 (occurrence=1 is the "Statement", left untouched)
        //   - musical guards: not during soloist busy, intensity ≥ 0.4 so quiet
        //     ballad passages aren't disrupted by an unexpected octave jolt
        //   - current step is at a beat-start (sub-beat 16ths/8ths stay in-register;
        //     a mid-beat octave jump would sound like a glitch, not phrasing)
        //   - exactly one target beat per 4-bar phrase, seeded so Verse 2 ≠ Verse 1
        if (!isRepeatPass || isSoloistBusyEarly || intensity < 0.4) {
            return note;
        }
        if (!isBeatStartEarly) {
            return note;
        }
        // why: 16 candidate beats per 4-bar phrase (4 beats × 4 bars in 4/4). Pick
        // exactly one. Seeded by (sectionIdHash, occurrence, phraseIndex) so:
        //   - same section + same occurrence + same phrase → same target beat (deterministic)
        //   - occurrence 2 vs occurrence 3 → different target beats (variation per repeat)
        //   - different sectionIds at same occurrence → different patterns (Verse-2 ≠ Chorus-2)
        const BEATS_PER_PHRASE = PHRASE_BARS * ts.beats;
        const targetSeed = scrambleHash(
            (sectionIdHash ^ (sectionOccurrence * 0x9e3779b1) ^ (phraseIndex * 0x85ebca77)) | 0,
        );
        const targetBeatInPhrase = Math.floor(targetSeed * BEATS_PER_PHRASE);
        const currentBeatInPhrase = barInPhrase * ts.beats + intBeat;
        if (currentBeatInPhrase !== targetBeatInPhrase) {
            return note;
        }
        // why: force direction from headroom (canonical rule from
        // feedback_seeded_prng_mulberry32). Comfort range (28-51) rather than absolute
        // (23-57) keeps the displacement in the bass's idiomatic neck range — the
        // extreme attic / sub-basement would sound out-of-character even when in-range.
        const canGoUp = note + 12 <= 51;
        const canGoDown = note - 12 >= 28;
        if (canGoUp && canGoDown) {
            // why: both directions fit — hash-seeded choice so V2 / V3 / V4 / V5
            // each pick independently. Earlier draft used `occurrence % 2` parity,
            // but that collapses to two values (V4 ≡ V2 in direction); reviewer
            // P1-3. Reuse a derived hash of the same seed components but XOR'd
            // with a third constant so we don't correlate with `targetSeed`.
            const dirSeed = scrambleHash(
                (sectionIdHash ^ (sectionOccurrence * 0xc2b2ae35) ^ (phraseIndex * 0x27d4eb2f)) | 0,
            );
            return note + (dirSeed < 0.5 ? -12 : 12);
        }
        if (canGoUp) {
            return note + 12;
        }
        if (canGoDown) {
            return note - 12;
        }
        return note; // No headroom either direction.
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
        let timingOffset = calculateTimingOffset('bass', groove.pocket, intensity);
        if (style === 'neo' || groove.genreFeel === 'Neo-Soul') {
            timingOffset += 0.01 + intensity * 0.015;
        }

        let durationSteps: number = 1;
        if (durationMultiplier !== null) {
            durationSteps = durationMultiplier;
        } else {
            if (style === 'whole') {
                durationSteps = chord.beats * ts.stepsPerBeat;
            } else if (style === 'half') {
                durationSteps = stepsPerMeasure / 2;
            } else if (style === 'arp') {
                durationSteps = ts.stepsPerBeat;
            } else if (style === 'rock') {
                durationSteps = ts.stepsPerBeat * 0.45;
            } else if (style === 'funk') {
                durationSteps = 0.8;
            } else if (
                (style as any) === 'disco' ||
                style === 'rocco' ||
                style === 'metal' ||
                style === 'neo' ||
                style === 'walking-ska' ||
                style === 'quarter'
            ) {
                durationSteps =
                    style === 'quarter' || (style as any) === 'blues'
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

        const intensityFactor = 0.6 + intensity * 0.7;
        const finalVel = Math.min(1.25, velocityParam * velocity * intensityFactor);
        const isLongStyle = ['acoustic', 'whole', 'half'].includes(style);
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
    // `barIndex` and `isBeatStartLocal` reuse the values computed earlier
    // (barIndexEarly, isBeatStartEarly) for Imperfect Symmetry. `scrambleHash`
    // is the shared mulberry32 declared above the result() wrapper.
    const barIndex = barIndexEarly;
    const sectionSeedInt =
        typeof context?.sectionStart === 'number' ? Math.abs(context.sectionStart) | 0 : 0;
    const isBeatStartLocal = isBeatStartEarly;
    const isStructuralJumpPoint = isBeatStartLocal && (isDownbeat || isSectionStart);

    const withOctaveJump = (note: number): number => {
        if (isSoloistBusy || intensity < 0.4) {
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
    // senses the form's end (`soloist.ts` SRDC `conclusion` phase); the bass hits
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
    // arrival without overshooting the 1.25 cap. Muted=0 (open) so the note
    // sustains cleanly.
    //
    // Source: docs/audit/form-arranger.md P1 #6;
    //         docs/audit/epic-form-arrangement.md S4.
    const isFinalMeasureBass = context?.stepCoordination?.isFinalMeasure === true;
    if (isFinalMeasureBass) {
        if (isDownbeat) {
            const intensityFactor = 0.6 + intensity * 0.7;
            const finalVel = Math.min(1.25, 1.1 * velocity * intensityFactor);
            let timingOffset = calculateTimingOffset('bass', groove.pocket, intensity);
            if (style === 'neo' || groove.genreFeel === 'Neo-Soul') {
                timingOffset += 0.01 + intensity * 0.015;
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

    // --- Section-Transition Chromatic Anticipation ---
    // why: "The transition feels like the drummer is leading a band that didn't get
    // the chart" (form-arranger.md P0 #2). When the upcoming section's first chord
    // is known, land a chromatic approach note (±1 semitone) exactly at the half-beat
    // before the section downbeat so the bass walks into the new tonic.
    //
    // Gate conditions (all must hold):
    //   1. coordination.upcomingSectionFirstChord is published (last measure of section).
    //   2. We're at exactly sectionEnd - stepsPerBeat/2 (the "and-of-4" of the last beat).
    //   3. Style is in the melodic-walk set (jazz/walking/funk/rock/blues/bossa/rocco/neo/disco).
    //      Dub, minimal, whole, half, and country are excluded: these styles favor
    //      root-hold or sparse patterns where a chromatic tail would feel forced.
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
            // why: slight accent (×1.05) so the anticipation "pops" audibly before
            // the new section lands; subtler than a downbeat accent (×1.15).
            velocity * 1.05,
        );
    }

    if (style === 'neo' || groove.genreFeel === 'Neo-Soul') {
        const isUpbeat = step % ts.stepsPerBeat !== 0;
        const isSecondaryAnchor = stepInMeasure / ts.stepsPerBeat === 2;
        if (isDownbeat || isSecondaryAnchor) {
            return result(getFrequency(baseRoot), 0.9, 1.15 + intensity * 0.1);
        }
        if (isUpbeat) {
            const hitProb = 0.2 + intensity * 0.4 + (playback.complexity || 0.5) * 0.3;
            if (Math.random() < hitProb && !isSoloistBusy) {
                const rand = Math.random();
                let note = baseRoot;
                let isGhost = false;
                let dur = 0.4;
                if (rand > 0.7) {
                    note = baseRoot + 7;
                } else if (rand > 0.4 && (playback.complexity || 0.5) > 0.6) {
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

    if ((style === 'rock' || style === 'funk') && hasKickTrigger) {
        const kickVel =
            kickInst.steps[step % (groove.measures * stepsPerMeasure)] === 2 ? 1.25 : 1.15;
        const dynamicKickVel = Math.max(0.8, kickVel * (0.7 + intensity * 0.3));
        return result(getFrequency(withOctaveJump(baseRoot)), null, dynamicKickVel);
    } else if (
        (style === 'rock' || style === 'funk') &&
        !hasKickTrigger &&
        intensity < 0.4 &&
        !isDownbeat
    ) {
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
            return result(
                getFrequency(baseRoot),
                null,
                Math.max(0.8, kickVel * (0.7 + intensity * 0.3)),
            );
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

    const isStraightStyle = ['rock', 'half', 'whole', 'arp', 'quarter', 'disco', 'neo'].includes(
        style,
    );
    if (
        stepInChord === 0 &&
        (isStraightStyle || style === 'funk') &&
        groove.genreFeel !== 'Reggae'
    ) {
        return result(
            getFrequency(withOctaveJump(baseRoot)),
            null,
            style === 'funk' ? 1.25 : 1.0 + intensity * 0.25,
        );
    }

    // --- Reggae Coordination Fill (epic-coordination-consistency S2.b) ---
    // why: bass-engine.ts previously read only kickHit for reggae lock-in. On a
    // soloist phrase-end (≥3 notes then rest) OR a real chord change at the bar
    // boundary, the dub bassist can answer with a single approach note at the
    // "and-of-4" of the bar — a conversational gesture during the soloist's
    // exhale, then drop straight back into the riddim on the next downbeat. The
    // reggae bass is locked-in by default; these are ADDITIONS on specific
    // gated steps, not a replacement of the kick-lock pattern.
    //
    // Gate conditions (all must hold for the block to fire at all):
    //   1. style === 'dub' OR genre === 'Reggae'.
    //   2. step is at stepsPerMeasure - 2 (the "and-of-4" in 4/4 — universally
    //      the pickup slot, and matches the existing ANTICIPATION_STYLES site
    //      for jazz/walking so the gesture lands in the same rhythmic place).
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
    const reggaeFillStep = stepInMeasure === stepsPerMeasure - 2;
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

            // why: pick ±1 semitone direction by smaller motion from prevMidi
            // for smooth voice-leading; tie-break to BELOW (the half-step
            // leading tone is the canonical chromatic walk-in across genres,
            // and reggae bass favors deep grounded approaches from below into
            // the downbeat).
            const fromBelow = targetRoot - 1;
            const fromAbove = targetRoot + 1;
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
            // the same dynamic pocket as the riddim hits — dub at
            // bass-styles.ts:973 scales the riddim's stored velocity by
            // (0.8 + intensity * 0.3) and jitters by (0.95 + rand * 0.1).
            // Without this mirror, the fill pops out as a different voice
            // (Epic 9 S2.b review P1 #4). The ×1.05 accent on top encodes
            // the "deliberate gesture" reading.
            const reggaeFillVel =
                velocity * (0.8 + intensity * 0.3) * (0.95 + Math.random() * 0.1) * 1.05;
            const reggaeFillRes = result(
                getFrequency(approachMidi),
                // why: short duration (1 step) — pickup into the next downbeat,
                // not a sustained note. Matches the section-anticipation
                // duration at line ~810.
                1,
                reggaeFillVel,
            );
            // why: dub style adds (0.01 + intensity * 0.01) timing offset for
            // the lazy reggae lay-back (bass-styles.ts:981). The fill is part
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
        },
        ts,
        stepsPerMeasure,
        intBeat,
        step % ts.stepsPerBeat === 0,
        step % (ts.stepsPerBeat / 2) === 0,
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
        step % 16 === 14;

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
                Math.random() < 0.2 && !isSoloistBusy ? (approach < targetRoot ? -1 : 1) : 0,
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
            // why: bass.md P2 #15 / epic-deterministic-phrasing S3 — generic fallback
            //   had no target awareness; uniform bias was also musically wrong shape.
            // Uses the outer `barIndex` declared near withOctaveJump (S4); same value.
            // why: isChordChangeApproach uses bassMidi ?? rootMidi, catching slash-chord
            //   changes (e.g. C → C/E) that this inline `rootMidi !== rootMidi` check
            //   would miss. Source: FOLLOWUPS §C — slash-chord-blind predicate migration.
            if (nextChord && isChordChangeApproach(nextChord, chord)) {
                const nextTarget = normalizeToRange(nextChord.bassMidi ?? nextChord.rootMidi);
                // why: 7-semitone (perfect-fifth) approach window. A candidate within
                //   a fifth of the target gets meaningful lift; beyond a fifth, the
                //   note is too distant to feel like an approach and the lift falls
                //   off to zero. /12 was too gentle — a fifth-away candidate kept
                //   ~0.42 proximity, washing out the bias against hand-position score.
                const APPROACH_WINDOW = 7;
                const beatScale = intBeat / 3;
                for (const c of candidates) {
                    const dist = Math.abs(c.midi - nextTarget);
                    const proximity = Math.max(0, 1 - dist / APPROACH_WINDOW);
                    c.weight *= 1 + proximity * beatScale;
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
