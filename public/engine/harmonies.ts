import { TIME_SIGNATURES } from '../config.js';
import type { EnsembleState, StepInfo } from '../types.js';
import { getFrequency } from '../utils.js';
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
    chord: any;
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
    isResponse: boolean;
    isChordStart: boolean;
}

// Internal memory for motif consistency
const motifCache = new Map<string, MotifCacheEntry>();
let lastPlayedStep = -1;

/**
 * Clears the internal motif memory.
 */
export function clearHarmonyMemory(state: EnsembleState | null): void {
    if (!state) {
        return;
    }
    const { harmony } = state;
    motifCache.clear();
    harmony.lastMidis = []; // @worker-mutation
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
        pattern[getBeatStep(0, 1, 0)] = 1;
        pattern[getBeatStep(0, 3, 0)] = 1;
        pattern[getBeatStep(1, 1, 0)] = 1;
        pattern[getBeatStep(1, 3, 0)] = 1;
        if (pseudoRandom() < 0.3) {
            pattern[getBeatStep(0, 1, 2)] = 4;
            pattern[getBeatStep(1, 1, 2)] = 4;
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
        if (Math.random() < responseProb) {
            return { type: 'reinforce', isResponse: true, duration: 2 };
        }
    }

    // B. Shared Hook Reinforcement (Ska-Punk)
    if (feel === 'Ska-Punk' && soloist.sharedHookBuffer) {
        const hookMatch = soloist.sharedHookBuffer.find((h: any) => h.step === step);
        if (hookMatch) {
            return { type: 'reinforce', isLatched: true, duration: 1 };
        }
    }

    // C. Melodic Shadowing
    const seed = soloist.sessionSeed;
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

            if (Math.random() < reinforceProb) {
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
                const pushProb = loopCount === 0 ? 0.8 : 0.3;
                if (Math.random() < pushProb) {
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

    const isSoloistBusy = coordination.soloistBusy || (soloist.enabled && !soloist.isResting);

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
            // Higher penalty for medium/light hits when busy
            if (val > 1 && Math.random() > 0.4) {
                needed = 2.0;
            }
        }

        if (playback.bandIntensity >= needed) {
            // Yielding: Protect downbeats in comping-heavy genres
            const isDownbeatHit = val === 1 && measureStep % ts.stepsPerBeat === 0;
            if (!isDownbeatHit) {
                if (coordination.accompanimentHit && Math.random() < 0.6) {
                    return null;
                }
                if (coordination.bassHit && Math.random() < 0.3) {
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
    chord: any,
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
        coordination.soloistBusy ||
        (soloist.enabled && (!soloist.isResting || soloist.notesInPhrase > 3));
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
            soloist.notesInPhrase > 3 ||
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
    if (isLatched && anchorMidi && playback.bandIntensity > 0.8 && Math.random() < 0.5) {
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

    // Safety Floor: Always stay above 52 (E3) to reserve space for the bass.
    const safetyFloor = 52;

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
    const soloistMidi = coordination.soloistMidi || coordination.avgSoloistMidi || 0;
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
        false,
        targetOctave,
        safetyFloor,
        100,
        styleConfig.rhythmicStyle,
    );

    if (currentMidis.length === 0) {
        return [];
    }

    const polyphonyComp = Math.max(0.7, 1.0 - currentMidis.length * 0.05);
    const notes: HarmonyNote[] = [];
    const finalMidisForMemory: number[] = [];

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
        let offset =
            (coordination.pocketOffset || 0) +
            stagger +
            Math.random() * (styleConfig.timingJitter || 0.008);
        if (feel === 'Neo-Soul') {
            offset += 0.02; // Dilla lag
        }

        notes.push({
            midi,
            freq: getFrequency(midi),
            velocity: baseVol * polyphonyComp,
            durationSteps: Math.max(0.1, duration),
            timingOffset: offset,
            style: styleConfig.activeStyle,
            isLatched: !!isLatched,
            isBloom: !!isBloom,
            isResponse: !!isResponse,
            isChordStart: true,
        });
        finalMidisForMemory.push(midi);
    }

    harmony.lastMidis = finalMidisForMemory; // @worker-mutation
    lastPlayedStep = step; // @worker-mutation
    return notes;
}

// --- MAIN DISPATCHER ---

export function getHarmonyNotes(
    state: EnsembleState | null,
    chord: any,
    _nextChord: any,
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
    if (playback.bandIntensity < 0.22) {
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
    if (!motifCache.has(chord.sectionId)) {
        const seed = Math.abs(
            chord.sectionId
                ?.split('')
                .reduce((a: number, b: string) => (a << 5) - a + b.charCodeAt(0), 0) || 0,
        );
        const pattern = generateCompingPattern(feel, seed, ts);

        // Calculate a broad rhythmic mask for UI/Consistency based on "Base" hits only
        let rhythmicMask = 0;
        // Use first 16 steps for UI mask to maintain grid alignment
        for (let i = 0; i < Math.min(16, pattern.length); i++) {
            if (pattern[i] > 0) {
                rhythmicMask |= 1 << i;
            }
        }

        motifCache.set(chord.sectionId, {
            seed,
            rhythmicMask,
            pattern,
        });
    }

    const motif = motifCache.get(chord.sectionId)!;
    if (harmony.rhythmicMask !== motif.rhythmicMask) {
        harmony.rhythmicMask = motif.rhythmicMask; // @worker-mutation
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
    if (!behavior) {
        if (config.rhythmicStyle === 'pads' || (playback.bandIntensity < 0.4 && feel !== 'Jazz')) {
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
