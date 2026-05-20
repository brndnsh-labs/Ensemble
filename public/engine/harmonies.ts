import { TIME_SIGNATURES } from '../config.js';
import type { Chord, EnsembleState, Mutable, StepInfo } from '../types.js';
import { getFrequency } from '../utils.js';
import { INTRO_MUTES, OUTRO_MUTES } from './arrangement-layering.js';
import { getBestInversion } from './chords-engine.js';
import {
    isTensionChordQuality,
    shouldPreferGroundedPracticeVoicing,
    shouldReserveBassSpace,
} from './voicing-policy.js';
import { getWorkerState } from './worker-orchestrator.js';

/**
 * HARMONIES.JS (v3 - Behavioral Strategy Architecture)
 */

// mulberry32 — 32-bit scrambled hash. Replaces raw Math.random() at per-step
// decision sites so antiphonal response, reinforcement, and timing-jitter are
// deterministic and reproducible across loops (epic-deterministic-phrasing S5).
// DO NOT use a simple LCG on small integer seeds; mulberry32 scrambles small
// linear inputs into well-distributed uint32 outputs.
// why: identical to the scrambleHash in bass-engine.ts (S4); copied as a
// local to avoid a cross-file refactor in this story.
const scrambleHash = (seed: number): number => {
    let t = (seed + 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
};

interface TimeSignatureConfig {
    beats: number;
    stepsPerBeat: number;
}

interface MotifCacheEntry {
    seed: number;
    rhythmicMask: number;
    pattern: number[];
}

interface HarmonyBehavior {
    type: 'reinforce' | 'comp' | 'pad';
    duration: number;
    isLatched?: boolean;
    isBloom?: boolean;
    isResponse?: boolean;
    isGhost?: boolean;
    anchorMidi?: number;
}

interface StyleConfig {
    density: number;
    rhythmicStyle: string;
    timingJitter: number;
    velocity: number;
    octaveOffset: number;
    activeStyle?: string;
}

interface HarmonyContext {
    step: number;
    soloist: any;
    coordination: any;
    playback: any;
    chord: Chord;
    feel: string;
    ts: TimeSignatureConfig;
    measureStep: number;
    stepsPerMeasure: number;
    stepInChord: number;
    motif: MotifCacheEntry;
}

interface HarmonyNote {
    midi: number;
    freq: number;
    velocity: number;
    durationSteps: number;
    timingOffset: number;
    style: string | undefined;
    isLatched: boolean;
    isBloom: boolean;
    isChordStart: boolean;
    /**
     * True when this note is a legato continuation of a voice that was already
     * sounding at this exact MIDI on the previous harmony emission (pad mode,
     * common-tone carryover). Synth uses this to skip the re-attack envelope
     * and to extend the existing voice's release rather than choking + starting
     * a new voice. See epic-harmony-polish.md S1.
     */
    isLegato?: boolean;
}

// Internal memory for motif consistency
const motifCache = new Map<string, MotifCacheEntry>();
let lastPlayedStep = -1;

// --- Band-intensity policy for the harmony layer (epic-harmony-polish S5) ---
// why: `playback.bandIntensity` is a 0..1 dial driving the whole band's energy.
// Three tiers govern when and how the harmony layer is heard:
//   < HARMONY_MUTE_FLOOR        : silence. The band is below ballad floor —
//                                 harmony adds clutter rather than support.
//   HARMONY_MUTE_FLOOR..HARMONY_PAD_CEILING
//                               : default pad mode (sparse organ/string swells,
//                                 one held tone per chord change via
//                                 playSeaMode). Applies to ALL feels including
//                                 Jazz — ballad-intensity Jazz wants pads, not
//                                 comping, to match the audit-doc acceptance
//                                 criterion in epic-harmony-polish S5.
//                                 Soloist-driven shadow-mode (response,
//                                 melodic latch, hype-man at harmonies.ts:997)
//                                 preempts this default and still fires in
//                                 this band when a live soloist is present.
//   >= HARMONY_PAD_CEILING      : comping behavior is unlocked
//                                 (playComperMode) for comping genres; pads
//                                 still selected for pad-style configs.
// Lowered from the previous undocumented 0.22 floor: 0.18-0.22 ballad
// intensity now plays sparse swells instead of going silent.
const HARMONY_MUTE_FLOOR = 0.15;
const HARMONY_PAD_CEILING = 0.4;

/**
 * Clears the internal motif memory.
 */
export function clearHarmonyMemory(state: EnsembleState | null): void {
    if (!state) {
        return;
    }
    const { harmony } = state;
    motifCache.clear();
    (harmony as Mutable<typeof harmony>).lastMidis = []; // @worker-mutation
    lastPlayedStep = -1;
}

/**
 * Extracts 3rds and 7ths (Guide Tones).
 */
export function getGuideTones(intervals: number[]): number[] {
    return intervals.filter((i) => {
        const iMod = i % 12;
        return iMod === 3 || iMod === 4 || iMod === 10 || iMod === 11;
    });
}

/**
 * Filters intervals to avoid clashing with soloist.
 */
export function getSafeVoicings(intervals: number[], rootless = false): number[] {
    return intervals.filter((i) => {
        const iMod = i % 12;
        if (rootless && iMod === 0) {
            return false;
        }
        // Allow Root(0), 5th(7), 3rds(3/4), 7ths(10/11), 6ths(9)
        return [0, 7, 3, 4, 10, 11, 9].includes(iMod);
    });
}

function selectGroundedIntervals(intervals: number[], targetCount = 4): number[] {
    const unique = [...new Set(intervals)];
    if (unique.length <= targetCount) {
        return unique;
    }

    const roots: number[] = [];
    const guides: number[] = [];
    const colors: number[] = [];
    const fifths: number[] = [];
    const others: number[] = [];

    unique.forEach((interval) => {
        const intervalClass = ((interval % 12) + 12) % 12;
        if (intervalClass === 0) {
            roots.push(interval);
            return;
        }
        if ([3, 4, 10, 11].includes(intervalClass)) {
            guides.push(interval);
            return;
        }
        if ([1, 2, 5, 6, 8, 9].includes(intervalClass)) {
            colors.push(interval);
            return;
        }
        if (intervalClass === 7) {
            fifths.push(interval);
            return;
        }
        others.push(interval);
    });

    // why: order is [roots, guides, colors, fifths, others] — NOT R-3-5-7.
    // This function is reached only when `shouldPreferGroundedPracticeVoicing`
    // gates the call (see voicing-policy.ts `PRACTICE_GROUNDING_QUALITIES`:
    // halfdim, dim, 7b5, aug, augmaj7, 7alt, 7#9, 7b9). Plain 7/maj7/m7 never
    // reach here. For tension/altered qualities the characteristic alteration
    // (e.g. b9 in 7b9 = interval 13, color-class) IS the chord identity — a
    // 4-note slice that drops the alteration in favor of a fifth would emit a
    // plain dominant 7. Colors before fifths is therefore correct. See
    // harmony-coordination.md P2 #14 + epic-harmony-polish.md S3 review.
    return [...roots, ...guides, ...colors, ...fifths, ...others].slice(0, targetCount);
}

/**
 * Tension bars sound best when harmony behaves like a slim color layer instead of
 * a second accompanist. Favor guide tones and keep the stack compact.
 */
function selectTensionSupportIntervals(intervals: number[], includeRoot: boolean): number[] {
    const safe = getSafeVoicings(intervals, !includeRoot);
    const guides = getGuideTones(safe);
    const fallback = safe.filter((interval) => interval !== 7);

    if (!includeRoot) {
        return (guides.length > 0 ? guides : fallback).slice(0, 2);
    }

    return [...new Set([...(guides.length > 0 ? guides : fallback), 0])].slice(0, 3);
}

/**
 * Procedural Rhythmic Patterns.
 */
export function generateCompingPattern(
    feel: string,
    seed: number,
    tsConfig?: TimeSignatureConfig,
    activeStyle?: string,
): number[] {
    const ts = tsConfig || (TIME_SIGNATURES as any)['4/4'];
    const spm = ts.beats * ts.stepsPerBeat;
    const length = spm * 2;
    const pattern = new Array(length).fill(0);
    const pseudoRandom = (): number => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };

    const getBeatStep = (bar: number, beatIdx: number, offsetSteps = 0): number =>
        bar * spm + beatIdx * ts.stepsPerBeat + offsetSteps;

    if (feel === 'Jazz') {
        // Bar 1: Charleston
        pattern[getBeatStep(0, 0)] = 1;
        pattern[getBeatStep(0, 1, Math.floor(ts.stepsPerBeat * 0.75))] = 1;
        if (pseudoRandom() < 0.5) {
            pattern[getBeatStep(1, 0)] = 1;
            pattern[getBeatStep(1, 1, Math.floor(ts.stepsPerBeat * 0.75))] = 2;
        } else {
            const lastBeat = ts.beats - 1;
            pattern[getBeatStep(0, lastBeat, Math.floor(ts.stepsPerBeat * 0.75))] = 3;
            pattern[getBeatStep(1, lastBeat, Math.floor(ts.stepsPerBeat * 0.75))] = 3;
        }
    } else if (feel === 'Bossa Nova') {
        // Authentic Bossa Nova Pattern (Bar 1: 0, 6, 12; Bar 2: 18, 24, 30)
        pattern[0] = 1;
        pattern[6] = 1;
        pattern[12] = 1;
        pattern[18] = 1;
        pattern[24] = 1;
        pattern[30] = 1;
    } else if (feel === 'Funk' || feel === 'Disco' || feel === 'Afrobeat') {
        pattern[getBeatStep(0, 0, 0)] = 1;
        pattern[getBeatStep(0, 0, 3)] = 3; // Added: 'a' of 1
        pattern[getBeatStep(0, 1, 2)] = 2;
        pattern[getBeatStep(0, 2, 0)] = 1;
        pattern[getBeatStep(0, 3, 2)] = 3;
        pattern[getBeatStep(1, 0, 0)] = 1;
        pattern[getBeatStep(1, 1, 1)] = 2; // Added: 'e' of 2
        pattern[getBeatStep(1, 1, 3)] = 3; // Added: 'a' of 2
        pattern[getBeatStep(1, 2, 1)] = 2; // Added: 'e' of 3
        pattern[getBeatStep(1, 2, 2)] = 3;
        pattern[getBeatStep(1, 3, 0)] = 2;
    } else if (feel === 'Reggae' || feel === 'Ska') {
        // why: Reggae organ-bubble vs harmony-channel skank (epic-
        // coordination-consistency S1.b). On Reggae the chord channel
        // (accompaniment.ts) plays the keyboardist's skank on beats 2 & 4;
        // letting the harmony channel ALSO hit beats 2 & 4 reproduces the
        // double-stack bug that Epic 6 S5 deleted from the chord channel.
        //
        // When the harmony route lands on 'organ' (the smart-style default
        // for Reggae — see getHarmonyNotes:873-874), play the **organ
        // bubble** instead: eighth-note offbeats on chord tones (steps 2,
        // 6, 10, 14 per bar). The bubble is the organist's idiom — it sits
        // BETWEEN the keyboardist's skank hits, filling the offbeat grid
        // where the skank is silent, no double-stack.
        //
        // Tag 1 (strong base) is the cleanest existing tag for a sustained
        // chord-tone single voice in playComperMode (val===1 → needed=0,
        // duration=1 at off-downbeats). An occasional tag-2 hit (medium)
        // creates the "occasional dyad on the higher voice" texture by
        // landing a denser voicing on a subset of offbeats.
        //
        // For Ska (and any non-organ Reggae user override), keep the
        // original backbeat skank — that's the keyboardist's idiom when
        // the harmony channel is acting as a horn-stab layer, not an
        // organ-bubble layer.
        if (feel === 'Reggae' && activeStyle === 'organ') {
            // Bar 1: offbeat-eighths
            pattern[getBeatStep(0, 0, 2)] = 1; // step 2
            pattern[getBeatStep(0, 1, 2)] = 1; // step 6
            pattern[getBeatStep(0, 2, 2)] = 1; // step 10
            pattern[getBeatStep(0, 3, 2)] = 1; // step 14
            // Bar 2: same offbeat-eighths
            pattern[getBeatStep(1, 0, 2)] = 1; // step 18
            pattern[getBeatStep(1, 1, 2)] = 1; // step 22
            pattern[getBeatStep(1, 2, 2)] = 1; // step 26
            pattern[getBeatStep(1, 3, 2)] = 1; // step 30
            // Occasional dyad accents on a sparse subset (~30% of bars).
            // Tag 2 → playComperMode treats as medium; finalize layer adds
            // a higher voice. Deterministic via the same pseudoRandom seed
            // the rest of the function uses.
            if (pseudoRandom() < 0.3) {
                pattern[getBeatStep(0, 2, 2)] = 2; // accent step 10
                pattern[getBeatStep(1, 2, 2)] = 2; // accent step 26
            }
        } else {
            pattern[getBeatStep(0, 1, 0)] = 1;
            pattern[getBeatStep(0, 3, 0)] = 1;
            pattern[getBeatStep(1, 1, 0)] = 1;
            pattern[getBeatStep(1, 3, 0)] = 1;
            if (pseudoRandom() < 0.3) {
                pattern[getBeatStep(0, 1, 2)] = 4;
                pattern[getBeatStep(1, 1, 2)] = 4;
            }
        }
    } else if (feel === 'Neo-Soul') {
        pattern[getBeatStep(0, 0, 1)] = 1;
        pattern[getBeatStep(0, 1, 3)] = 2;
        pattern[getBeatStep(0, 2, 1)] = 3;
        pattern[getBeatStep(1, 0, 1)] = 1;
        pattern[getBeatStep(1, 3, 3)] = 2;
    } else if (feel === 'Ska-Punk') {
        pattern[getBeatStep(0, 0, 2)] = 1;
        pattern[getBeatStep(0, 1, 2)] = 1;
        pattern[getBeatStep(0, 2, 2)] = 1;
        pattern[getBeatStep(0, 3, 2)] = 1;
        pattern[getBeatStep(1, 0, 2)] = 1;
        pattern[getBeatStep(1, 1, 2)] = 1;
        pattern[getBeatStep(1, 2, 2)] = 1;
        pattern[getBeatStep(1, 3, 2)] = 1;
    } else {
        pattern[getBeatStep(0, 0, 0)] = 1;
        pattern[getBeatStep(0, 2, 0)] = 2;
        pattern[getBeatStep(1, 0, 0)] = 1;
        pattern[getBeatStep(1, 2, 0)] = 2;
    }

    return pattern;
}

// --- BEHAVIORAL MODES ---

/**
 * Mode 1: The Shadow (Melodic Support)
 * Strictly reinforces the soloist's seeded melody or real-time playing.
 */
function playShadowMode(context: HarmonyContext): HarmonyBehavior | null {
    const { step, soloist, coordination, playback, feel } = context;
    const loopCount = playback.currentLoopCount || 0;

    // A. Antiphony (Response)
    if (coordination.soloistPhraseEnd && !coordination.soloistActive) {
        const responseProb = 0.4 + playback.bandIntensity * 0.5;
        // why: tag 1 — response trigger. Seeded from motif.seed (section hash)
        // and step so the same phrase-end position fires the same way each loop.
        if (scrambleHash(context.motif.seed + step * 31 + 1) < responseProb) {
            return { type: 'reinforce', isResponse: true, duration: 2 };
        }
    }

    // B. Shared Hook Reinforcement (Ska-Punk)
    if (feel === 'Ska-Punk' && soloist.session.memory.sharedHookBuffer) {
        const hookMatch = soloist.session.memory.sharedHookBuffer.find((h: any) => h.step === step);
        if (hookMatch) {
            return { type: 'reinforce', isLatched: true, duration: 1 };
        }
    }

    // C. Melodic Shadowing
    const seed = soloist.session.seed;
    if (seed?.notes && seed.notes.length > 0) {
        const stepInLoop = step % seed.loopLengthSteps;
        const seedNote = seed.notes.find((n: any) => n.step === stepInLoop);

        if (seedNote) {
            let reinforceProb = 0;
            if (seedNote.isAnchor) {
                reinforceProb = loopCount === 0 ? 1.0 : 0.4 + playback.bandIntensity * 0.55;
            } else if (loopCount === 0) {
                reinforceProb = 0.8; // Thickener Mode
            } else if (playback.bandIntensity > 0.4) {
                reinforceProb = (playback.bandIntensity - 0.4) * 0.8;
            }

            // why: tag 2 — melodic-shadowing reinforce trigger.
            if (scrambleHash(context.motif.seed + step * 31 + 2) < reinforceProb) {
                return {
                    type: 'reinforce',
                    isLatched: true,
                    isBloom: seedNote.isAnchor,
                    anchorMidi: seedNote.midi,
                    duration: 1,
                };
            }
        }

        // D. Hype Man (Anticipation)
        if (playback.bandIntensity > 0.4) {
            const nextStepInLoop = (step + 2) % seed.loopLengthSteps;
            const nextSeedNote = seed.notes.find((n: any) => n.step === nextStepInLoop);
            // Assuming 8 steps means half-measure in 4/4. Let's make it robust.
            const spm = seed.loopLengthSteps; // Actually this is loop length. If loop is 1 measure, spm=loopLength.
            // A strong downbeat or half-bar downbeat
            if (nextSeedNote?.isAnchor && nextSeedNote.step % Math.floor(spm / 2) === 0) {
                // why: Loop 0 is The Head — Loop-0 doctrine (CLAUDE.md
                // "Dynamic Head / Chorus Evolution") makes anchor support
                // unconditional (see Melodic-Shadowing reinforceProb=1.0 at
                // line 389). The anticipation push that *sets up* that
                // anchor is the same Head gesture — the band locks into the
                // soloist's downbeat one 8th early — and must fire with the
                // same certainty. Loop 1+ keeps a probabilistic push
                // intensity-coupled the way Antiphony (tag 1) is, so the
                // gesture thins as the form evolves rather than vanishing.
                // Previous values (0.8 / 0.3) predated the May 2026
                // Math.random → scrambleHash migration; under deterministic
                // hashing the 0.8 ceiling was unreachable for common
                // sectionId seeds and the branch became effectively dead.
                const pushProb = loopCount === 0 ? 1.0 : 0.2 + playback.bandIntensity * 0.4;
                // why: tag 3 — hype-man push trigger.
                if (scrambleHash(context.motif.seed + step * 31 + 3) < pushProb) {
                    return { type: 'reinforce', isLatched: true, isBloom: true, duration: 1 };
                }
            }
        }
    }

    return null;
}

/**
 * Mode 2: The Comper (Rhythmic Stabs)
 * Standard procedural rhythmic comping.
 */
function playComperMode(context: HarmonyContext): HarmonyBehavior | null {
    const { step, motif, playback, coordination, ts, measureStep, soloist } = context;

    const isSoloistBusy =
        // why: soloistResting is published to the coordination context by tick-logic.ts
        // soloist producer block (S4); reading from the contract surface rather than
        // private session state directly ensures mocked tests exercise this branch.
        coordination.soloistBusy || (soloist.enabled && !coordination.soloistResting);

    // Coordination: Yield to soloist if not reinforcing
    if (lastPlayedStep !== -1 && step === lastPlayedStep + 1 && coordination.soloistActive) {
        return null;
    }

    const patternStep = step % motif.pattern.length;
    const val = motif.pattern[patternStep];

    if (val > 0) {
        let needed = val === 1 ? 0.0 : val === 2 ? 0.4 : 0.7;
        const isGhost = val === 4;
        if (isGhost) {
            needed = 0.5;
        }

        if (isSoloistBusy || coordination.accompanimentHit) {
            needed += 0.25;
            // Higher penalty for medium/light hits when busy.
            // why: tag 4 — busy-suppression gate. Preserves original 0.4 floor.
            if (val > 1 && scrambleHash(motif.seed + step * 31 + 4) > 0.4) {
                needed = 2.0;
            }
        }

        if (playback.bandIntensity >= needed) {
            // Yielding: Protect downbeats in comping-heavy genres
            const isDownbeatHit = val === 1 && measureStep % ts.stepsPerBeat === 0;
            if (!isDownbeatHit) {
                // why: tag 5 — accompaniment-collision yield.
                if (
                    coordination.accompanimentHit &&
                    scrambleHash(motif.seed + step * 31 + 5) < 0.6
                ) {
                    return null;
                }
                // why: tag 6 — bass-collision yield.
                if (coordination.bassHit && scrambleHash(motif.seed + step * 31 + 6) < 0.3) {
                    return null;
                }
            }

            // Duration
            const isDownbeat = measureStep % ts.stepsPerBeat === 0;
            let dur = isDownbeat ? 3 : 1;
            if (isGhost) {
                dur = 0.5;
            }

            return { type: 'comp', duration: dur, isGhost };
        }
    }
    return null;
}

/**
 * Mode 3: The Sea (Atmospheric Pads)
 */
function playSeaMode(context: HarmonyContext): HarmonyBehavior | null {
    const { stepInChord, measureStep, ts, stepsPerMeasure, chord } = context;

    if (stepInChord === 0 || measureStep === 0) {
        const dur = Math.min(stepsPerMeasure, chord.beats * ts.stepsPerBeat);
        return { type: 'pad', duration: dur };
    }
    return null;
}

/**
 * Final Note Generation logic (Voicing, Transposition, Offset).
 */
function finalizeHarmonyNotes(
    activeState: EnsembleState,
    chord: Chord,
    step: number,
    behavior: HarmonyBehavior,
    styleConfig: StyleConfig,
    coordination: any,
    octave: number,
): HarmonyNote[] {
    const { playback, harmony, groove, soloist, chords } = activeState;
    const {
        duration: baseDuration,
        isLatched,
        isBloom,
        isResponse,
        isGhost,
        anchorMidi,
    } = behavior;
    let duration = baseDuration;

    let intervals: number[] =
        chord.intervals && chord.intervals.length > 0 ? chord.intervals : [0, 4, 7];
    const feel = groove.genreFeel;

    const isSoloistBusy =
        // why: soloistResting and soloistNotesInPhrase are published via coordination
        // context by the tick-logic soloist producer block (S4); reading from the
        // contract surface rather than private session state keeps the contract honest.
        coordination.soloistBusy ||
        (soloist.enabled &&
            (!coordination.soloistResting || coordination.soloistNotesInPhrase > 3));
    const accompanimentCrowding = coordination.accompanimentHit && !isLatched && !isBloom;

    // --- VOICING REFINEMENT (Musical Taste) ---
    const reserveBassSpace = shouldReserveBassSpace(activeState);
    const isCompingGenre = ['Jazz', 'Funk', 'Neo-Soul', 'Blues'].includes(feel);
    const groundingRequired = shouldPreferGroundedPracticeVoicing(activeState, chord.quality, feel);
    const isTensionChord = isTensionChordQuality(chord.quality);
    const rootlessComping = reserveBassSpace && isCompingGenre && !groundingRequired;

    // Apply rootless reduction if practice mode is on or bass is enabled
    if (rootlessComping) {
        intervals = getSafeVoicings(intervals, true);
    } else if (groundingRequired) {
        intervals = selectGroundedIntervals(intervals, 4);
    }

    if (!groundingRequired && (isSoloistBusy || coordination.accompanimentHit)) {
        intervals = getSafeVoicings(intervals, rootlessComping);
        if (
            // why: soloistNotesInPhrase published via coordination context (S4).
            coordination.soloistNotesInPhrase > 3 ||
            coordination.accompanimentHit ||
            harmony.complexity < 0.4
        ) {
            const guides = getGuideTones(intervals);
            if (guides.length > 0) {
                // Higher preference for pure guide tones in Jazz/Funk
                const useRoot = rootlessComping || feel === 'Jazz' ? [] : [0];
                intervals = useRoot.concat(guides);
            } else {
                intervals = rootlessComping ? [7] : [0, 7];
            }
        }

        // If BOTH are hitting, drop root, play ONLY guides or extensions
        if (coordination.accompanimentHit && isSoloistBusy && intervals.length > 2) {
            intervals = getGuideTones(intervals);
        }
    } else if (!groundingRequired) {
        if (harmony.complexity < 0.4 || playback.bandIntensity < 0.4 || feel === 'Jazz') {
            const guides = getGuideTones(intervals);
            if (guides.length > 0) {
                intervals = guides;
            }
        }
    }

    if (isTensionChord && !groundingRequired && !isLatched && !isBloom) {
        intervals = selectTensionSupportIntervals(intervals, !(rootlessComping || feel === 'Jazz'));
    }

    // --- REINFORCEMENT: Tutti/Shadow logic ---
    // why: tag 7 — anchor-tutti latch coin. Seeded from (chord.rootMidi, step) since
    // finalizeHarmonyNotes doesn't carry a motif handle — chord+step is the next-best
    // stable key for "same beat in the same chart fires the same way each loop."
    if (
        isLatched &&
        anchorMidi &&
        playback.bandIntensity > 0.8 &&
        scrambleHash(chord.rootMidi * 100 + step * 31 + 7) < 0.5
    ) {
        const relativeSeedInterval = (anchorMidi - chord.rootMidi + 120) % 12;
        if (!intervals.includes(relativeSeedInterval)) {
            intervals = [...intervals, relativeSeedInterval];
        }
    }

    if (isBloom && intervals.length < 3) {
        // Ensure at least 3 voices for bloom highlights
        const filler = [7, 12, 10, 4];
        for (const f of filler) {
            if (!intervals.includes(f)) {
                intervals.push(f);
                if (intervals.length >= 3) {
                    break;
                }
            }
        }
    }

    // Safety Floor: maintain >= P5 gap above bass to avoid muddy low-register clusters.
    // why: harmony slot starts at 52 (E3); when bass walks high (e.g. MIDI 55 = G3),
    // sitting harmony at 52 creates an E3-G3 minor-third mud cluster. Lifting the floor
    // to bassMidi + 7 reserves a perfect fifth of separation. Fallback to 52 when
    // bassMidi is 0/undefined (bass not running or producer order has not yet fired).
    const safetyFloor = Math.max(52, (coordination.bassMidi || 0) + 7);

    // Polyphony Scaling: Bloom hits are thicker. Manually slice intervals to control density.
    let targetIntervals = intervals;
    const baseDensity = isBloom ? Math.max(styleConfig.density || 2, 3) : styleConfig.density || 2;
    const maxDensity = groundingRequired
        ? Math.max(baseDensity, Math.min(4, intervals.length))
        : baseDensity;
    const tensionDensityCap =
        isTensionChord && !groundingRequired && !isBloom
            ? coordination.accompanimentHit && isSoloistBusy
                ? 1
                : 2
            : null;
    const accompanimentDensityCap =
        accompanimentCrowding && !groundingRequired
            ? playback.bandIntensity > 0.62 || feel === 'Jazz' || feel === 'Blues'
                ? 1
                : 2
            : null;
    const densityCap = [maxDensity, tensionDensityCap, accompanimentDensityCap]
        .filter((cap): cap is number => Number.isFinite(cap as number))
        .reduce((minCap, cap) => Math.min(minCap, cap), maxDensity);

    // --- Accompaniment PC-Overlap Avoidance ---
    // why: when a separate chord stab is hitting on the same tick
    // (accompanimentCrowding), stacking the same pitch-class in the harmony voicing
    // creates a muddy unison rather than a complementary color. Reorder
    // `targetIntervals` (still equal to `intervals` — the slice below hasn't run yet)
    // so intervals whose resulting PC is NOT in `accompanimentMidis` come first; the
    // density cap then preferentially keeps the non-overlapping voices.
    //
    // Stable partition (not a sort) — preserves the existing interval ordering within
    // each bucket so guide-tone selection, rootless reduction, and tension support all
    // remain authoritative for "which voices matter"; this pass only adjusts the
    // priority WITHIN the already-curated set when the chord stab is competing.
    //
    // Producer order: harmony runs after chords this tick (tick-logic.ts), so
    // `accompanimentMidis` is fresh — reflecting the voicing the chord engine just
    // emitted, exactly what we want to avoid stacking against. Story
    // coordination-contract/S5.
    const accompMidisHarmony = coordination.accompanimentMidis;
    if (
        accompanimentCrowding &&
        accompMidisHarmony &&
        accompMidisHarmony.length > 0 &&
        targetIntervals.length > densityCap
    ) {
        const accompPCs = new Set<number>();
        for (let i = 0; i < accompMidisHarmony.length; i++) {
            accompPCs.add(((accompMidisHarmony[i] % 12) + 12) % 12);
        }
        const rootPc = ((chord.rootMidi % 12) + 12) % 12;
        const nonOverlap: number[] = [];
        const overlap: number[] = [];
        for (let i = 0; i < targetIntervals.length; i++) {
            const iv = targetIntervals[i];
            const ivPc = ((((rootPc + iv) % 12) + 12) % 12) as number;
            if (accompPCs.has(ivPc)) {
                overlap.push(iv);
            } else {
                nonOverlap.push(iv);
            }
        }
        // Only reorder if there's something to push down — otherwise leave the
        // existing ordering untouched so other priorities (guide tones, tension
        // support) remain visible at the top.
        if (nonOverlap.length > 0 && overlap.length > 0) {
            targetIntervals = nonOverlap.concat(overlap);
        }
    }

    if (targetIntervals.length > densityCap) {
        targetIntervals = targetIntervals.slice(0, densityCap);
    }
    if (accompanimentCrowding) {
        duration = Math.max(
            0.1,
            duration * (playback.bandIntensity > 0.65 || feel === 'Jazz' ? 0.78 : 0.86),
        );
    }

    // Spectral Gaps: Register Awareness
    // Use a realistic base if octave is 0 (default)
    let targetOctave = (octave || chords.octave || 60) + (styleConfig.octaveOffset || 0);
    // why: harmony stabs usually fire on steps where the soloist is RESTING (harmony
    // yields to soloist-active steps at :335/:349/:364), so current-tick soloistMidi is
    // almost always 0 in production. Fall back to lastActiveSoloistMidi — the most
    // recent non-rest soloist note — so the octave-shift branch actually engages.
    //
    // Ordering: avgSoloistMidi first because for spectral-gap reasoning we want "where
    // is the soloist's mass right now," which is the centroid across same-tick notes
    // (matters for double-stops); falls back to the single picked main note, then to
    // the sticky last-active value when the soloist is resting.
    //
    // Age cap: the sticky is gated by lastActiveSoloistStep — values older than
    // SOLOIST_STICKY_STALE_STEPS (~2 bars at 4/4 16th-step) are treated as 0 so a
    // soloist who played one note and went silent doesn't steer harmony forever.
    const SOLOIST_STICKY_STALE_STEPS = 32;
    const lastStep = coordination.lastActiveSoloistStep || 0;
    const stickyAge = (coordination.step || 0) - lastStep;
    const stickyMidi =
        lastStep > 0 && stickyAge <= SOLOIST_STICKY_STALE_STEPS
            ? coordination.lastActiveSoloistMidi || 0
            : 0;
    const soloistMidi = coordination.avgSoloistMidi || coordination.soloistMidi || stickyMidi || 0;
    if (soloistMidi > 72 && targetOctave > 48) {
        targetOctave -= 12;
    } else if (soloistMidi > 0 && soloistMidi < 60 && targetOctave < 72) {
        targetOctave += 12;
    }

    const currentMidis = getBestInversion(
        activeState,
        chord.rootMidi,
        targetIntervals,
        harmony.lastMidis,
        {
            anchor: targetOctave,
            min: safetyFloor,
            max: 100,
            style: styleConfig.rhythmicStyle,
        },
    );

    if (currentMidis.length === 0) {
        return [];
    }

    const polyphonyComp = Math.max(0.7, 1.0 - currentMidis.length * 0.05);
    const notes: HarmonyNote[] = [];
    const finalMidisForMemory: number[] = [];

    // Legato continuation: in pad mode, a voice at the same MIDI as one in the
    // previous emission is a held tone, not a re-attack. Build a quick lookup
    // of prior MIDIs so per-voice flagging below is O(1).
    // why: "The Sea"/strings pad currently re-attacks every chord change even
    // when common tones carry, producing a stab-stab-stab feel instead of a
    // sustained pad. Gated by `behavior.type === 'pad'` only — `reinforce`
    // (Shadow) and `comp` (Comper) behaviors stay articulated. Voicing styles
    // that route to playSeaMode at low intensity (Comper, smart) inherit
    // legato as a side effect, which is correct: a low-intensity comp IS a
    // held pad.
    // Cross-midi (octave-shifted same-PC) is intentionally NOT treated as
    // legato — the synth holds an exact MIDI voice; a different octave would
    // require pitch-bending an existing voice, which the synth graph doesn't
    // support. Exact-midi match is the truthful definition for sustain.
    const priorMidiSet = new Set<number>(
        behavior.type === 'pad' && harmony.lastMidis && harmony.lastMidis.length > 0
            ? harmony.lastMidis
            : [],
    );

    for (let i = 0; i < currentMidis.length; i++) {
        let midi = currentMidis[i];
        if (midi < safetyFloor) {
            continue;
        }
        if (midi > 100) {
            midi -= 12;
        }

        // --- VELOCITY SCALING ---
        let baseVol =
            (styleConfig.velocity || 0.75) *
            (0.6 + playback.bandIntensity * 0.4) *
            (harmony.volume || 0.5);
        if (isGhost) {
            baseVol *= 0.4;
        }
        if (isBloom || isLatched) {
            baseVol *= 1.8; // Boost highlights to clear test thresholds
        }
        if (accompanimentCrowding) {
            baseVol *= 0.9;
        }

        const stagger = (i - (currentMidis.length - 1) / 2) * 0.005;
        // why: tag 8 — per-voice timing jitter. Seeded by (chord.rootMidi, step,
        // voice index i) so each voice gets a distinct but reproducible offset.
        // Original Math.random() * jitter produced [0, jitter] (asymmetric, always
        // pushes notes late); preserved literally for behavioral parity.
        let offset =
            (coordination.pocketOffset || 0) +
            stagger +
            scrambleHash(chord.rootMidi * 100 + step * 31 + i * 7 + 8) *
                (styleConfig.timingJitter || 0.008);
        if (feel === 'Neo-Soul') {
            offset += 0.02; // Dilla lag
        }
        // why: epic-harmony-polish S4 — `isResponse` marks an antiphonal answer
        // fired after the soloist's phrase ends (playShadowMode tag 1). A
        // call-and-response answer sits a hair behind the beat — that's what
        // makes it sound conversational rather than as if the harmony was
        // tracking the soloist. 5 ms is within the per-voice jitter range
        // (timingJitter defaults to 0.008 → [0, 8 ms]) but as a *consistent*
        // additive offset it accumulates into a perceptible backbeat lag,
        // while still well under the ~20 ms Dilla lag so it stays musical.
        // Folded into `offset` (not a synth-side path) because `timingOffset`
        // is the established schedule accumulator (pocketOffset, stagger,
        // jitter, Neo-Soul lag); keeping one source of truth means
        // `note.isResponse` does not need to ship on the schema.
        if (isResponse) {
            offset += 0.005;
        }

        const isLegato = priorMidiSet.has(midi);
        notes.push({
            midi,
            freq: getFrequency(midi),
            velocity: baseVol * polyphonyComp,
            durationSteps: Math.max(0.1, duration),
            timingOffset: offset,
            style: styleConfig.activeStyle,
            isLatched: !!isLatched,
            isBloom: !!isBloom,
            isChordStart: true,
            isLegato,
        });
        finalMidisForMemory.push(midi);
    }

    (harmony as Mutable<typeof harmony>).lastMidis = finalMidisForMemory; // @worker-mutation
    lastPlayedStep = step; // @worker-mutation
    return notes;
}

// --- MAIN DISPATCHER ---

export function getHarmonyNotes(
    state: EnsembleState | null,
    chord: Chord,
    _nextChord: Chord | null | undefined,
    step: number,
    octave: number,
    style: string,
    stepInChord: number,
    _soloistResult: any = null,
    coordination: any = {},
    _stepInfo?: StepInfo,
): HarmonyNote[] {
    if (!chord) {
        return [];
    }

    const activeState = state || getWorkerState();
    if (!activeState) {
        return [];
    }

    const { playback, groove, harmony, soloist, arranger } = activeState;
    // why: below HARMONY_MUTE_FLOOR (0.15) the band is at a sub-ballad
    // whisper — adding harmony at that level smears the chord layer rather
    // than supporting it. Lowered from the previous undocumented 0.22 so
    // 0.18-0.22 (ballad) intensity reaches playSeaMode below and produces
    // sparse organ/string swells. See epic-harmony-polish S5.
    if (playback.bandIntensity < HARMONY_MUTE_FLOOR) {
        return [];
    }

    // --- Intro/Outro layering mute (epic-form-arrangement S5) ---
    // why: form-arranger.md P1 #4 — harmony enters LAST on the intro (after
    // drums, bass, and chord comp have established) and drops out FIRST on
    // the outro (so the harmonic-color layer thins the texture before the
    // chord foundation does). With `INTRO_MUTES.harmony = 4` and
    // `OUTRO_MUTES.harmony = 4`, a typical 8-bar outro hears harmony silent
    // for the back half — a clear arc.
    //
    // No precedence concern with S4 final-bar: harmony has no final-bar
    // cadence gesture (intentional — drums + bass + chords carry the
    // resolution). If outroBarsRemaining is 1 (the final bar), harmony was
    // already muted starting 4 bars earlier; the cadence the listener hears
    // is the bass+chords+drums trio, which matches the audit-doc framing.
    const harmIntroElapsed = coordination?.introBarsElapsed ?? -1;
    if (harmIntroElapsed >= 0 && harmIntroElapsed < INTRO_MUTES.harmony) {
        return [];
    }
    const harmOutroRemaining = coordination?.outroBarsRemaining ?? -1;
    if (harmOutroRemaining >= 0 && harmOutroRemaining <= OUTRO_MUTES.harmony) {
        return [];
    }

    const feel = groove.genreFeel;
    const tsConfigs: any = TIME_SIGNATURES;
    const ts = tsConfigs[arranger.timeSignature] || tsConfigs['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    const measureStep = step % stepsPerMeasure;
    const isTensionChord = isTensionChordQuality(chord.quality);

    // 1. STYLE SELECTION
    let activeStyle = style;
    if (style === 'smart') {
        if (feel === 'Blues' || feel === 'Reggae' || feel === 'Neo-Soul') {
            activeStyle = 'organ';
        } else if (feel === 'Jazz' || feel === 'Bossa Nova') {
            activeStyle = 'strings';
        } else if (feel === 'Disco' || feel === 'Hip Hop') {
            activeStyle = 'plucks';
        } else if (['Funk', 'Metal', 'Afrobeat', 'Ska'].includes(feel)) {
            activeStyle = 'horns';
        } else {
            activeStyle = 'strings';
        }
    }
    if ((feel === 'Jazz' || feel === 'Funk') && activeStyle === 'strings') {
        activeStyle = 'organ';
    }

    const STYLE_CONFIGS: Record<string, StyleConfig> = {
        horns: {
            density: 2,
            rhythmicStyle: 'stabs',
            timingJitter: 0.005,
            velocity: 0.85,
            octaveOffset: 0,
        },
        strings: {
            density: 2,
            rhythmicStyle: 'pads',
            timingJitter: 0.02,
            velocity: 0.6,
            octaveOffset: 0,
        },
        organ: {
            density: 3,
            rhythmicStyle: 'stabs',
            timingJitter: 0.015,
            velocity: 0.85,
            octaveOffset: 0,
        },
        plucks: {
            density: 2,
            rhythmicStyle: 'stabs',
            timingJitter: 0.002,
            velocity: 0.7,
            octaveOffset: 12,
        },
        disco: {
            density: 2,
            rhythmicStyle: 'stabs',
            timingJitter: 0.005,
            velocity: 0.75,
            octaveOffset: 12,
        },
        counter: {
            density: 1,
            rhythmicStyle: 'pads',
            timingJitter: 0.03,
            velocity: 0.75,
            octaveOffset: -12,
        },
        smart: {
            density: 2,
            rhythmicStyle: 'auto',
            timingJitter: 0.008,
            velocity: 0.75,
            octaveOffset: 0,
        },
    };

    const config: StyleConfig = {
        ...(STYLE_CONFIGS[activeStyle] || STYLE_CONFIGS.smart),
        activeStyle,
    };
    if (config.rhythmicStyle === 'auto') {
        config.rhythmicStyle = feel === 'Rock' || feel === 'Acoustic' ? 'pads' : 'stabs';
    }
    if (['Jazz', 'Funk', 'Bossa Nova', 'Neo-Soul', 'Reggae', 'Ska'].includes(feel)) {
        config.rhythmicStyle = 'stabs';
    }

    // 2. CONTEXT OBJECT
    // why: key on every input that branches generateCompingPattern's body.
    //   - feel: the top-level feel branches produce completely different
    //     patterns (Jazz Charleston vs Funk 16ths vs Reggae bubble vs …).
    //   - activeStyle: Reggae organ-bubble (S1.b) branches on activeStyle.
    //   - bandIntensity tier: defensive — any future generateCompingPattern
    //     extension that gates on intensity will need the tier in the key.
    //   - complexity: same defensive rationale as bandIntensity tier.
    // Without feel in the key, switching genre mid-session would serve the
    // previous feel's pattern until the sectionId changes.
    const intensityTier =
        playback.bandIntensity < 0.4 ? 'lo' : playback.bandIntensity < 0.7 ? 'mid' : 'hi';
    const complexityTier =
        playback.complexity < 0.4 ? 'lo' : playback.complexity < 0.7 ? 'mid' : 'hi';
    const sectionKey = `${chord.sectionId ?? ''}|${feel}|${activeStyle}|${intensityTier}|${complexityTier}`;
    if (!motifCache.has(sectionKey)) {
        const seed = Math.abs(
            chord.sectionId
                ?.split('')
                .reduce((a: number, b: string) => (a << 5) - a + b.charCodeAt(0), 0) || 0,
        );
        const pattern = generateCompingPattern(feel, seed, ts, activeStyle);

        // Calculate a broad rhythmic mask for UI/Consistency based on "Base" hits only
        let rhythmicMask = 0;
        // Use first 16 steps for UI mask to maintain grid alignment
        for (let i = 0; i < Math.min(16, pattern.length); i++) {
            if (pattern[i] > 0) {
                rhythmicMask |= 1 << i;
            }
        }

        motifCache.set(sectionKey, {
            seed,
            rhythmicMask,
            pattern,
        });
    }

    const motif = motifCache.get(sectionKey)!;
    if (harmony.rhythmicMask !== motif.rhythmicMask) {
        (harmony as Mutable<typeof harmony>).rhythmicMask = motif.rhythmicMask; // @worker-mutation
    }

    const context: HarmonyContext = {
        step,
        soloist,
        coordination,
        playback,
        chord,
        feel,
        ts,
        measureStep,
        stepsPerMeasure,
        stepInChord,
        motif,
    };

    // 3. MODE DISPATCHER
    let behavior: HarmonyBehavior | null = null;

    // Mode A: The Shadow (High Priority)
    behavior = playShadowMode(context);

    if (
        !behavior &&
        isTensionChord &&
        (coordination.accompanimentHit || coordination.soloistActive || coordination.soloistBusy)
    ) {
        return [];
    }

    // Mode B: The Comper or The Sea (Standard Priority)
    // why: below HARMONY_PAD_CEILING (0.4) the whole band is in ballad
    // territory — every feel, including Jazz, wants sparse held swells, not
    // comping. The previous `feel !== 'Jazz'` carve-out had Jazz comping
    // through ballad intensities, which conflicted with the
    // epic-harmony-polish S5 acceptance criterion ("ballad-intensity jazz
    // plays sparse organ swells"). At >= HARMONY_PAD_CEILING the comp/sea
    // split is driven by the configured rhythmic style.
    if (!behavior) {
        if (config.rhythmicStyle === 'pads' || playback.bandIntensity < HARMONY_PAD_CEILING) {
            behavior = playSeaMode(context);
        } else {
            behavior = playComperMode(context);
        }
    }

    if (!behavior) {
        return [];
    }

    // 4. GENERATION
    return finalizeHarmonyNotes(activeState, chord, step, behavior, config, coordination, octave);
}
