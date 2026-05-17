import { REGGAE_RIDDIMS } from '../config.js';
import type { EnsembleState, StepInfo } from '../types.js';
import { getFrequency } from '../utils.js';

type ChordChangeShape = {
    rootMidi: number;
    bassMidi?: number | null;
};

/**
 * Type-guard returning true only when nextChord represents an actual chord
 * change vs the current chord — i.e. the bass target on the next bar is
 * different from now.
 *
 * why: every "approach note" callsite previously gated on `nextChord && ...`,
 * which fires inside held chords too — producing stumbling chromatic leans on
 * non-change bars. The audit (bass.md P1 #5, P2 #13) named this as the
 * highest-leverage architectural fix in the bass engine. Type-predicate form
 * lets call sites use `nextChord.rootMidi` directly after the guard.
 */
export function isChordChangeApproach<T extends ChordChangeShape>(
    nextChord: T | null | undefined,
    chord: ChordChangeShape,
): nextChord is T {
    if (!nextChord) {
        return false;
    }
    const nextTarget = nextChord.bassMidi ?? nextChord.rootMidi;
    const currentTarget = chord.bassMidi ?? chord.rootMidi;
    return nextTarget !== currentTarget;
}

export function checkBassActiveStyle(
    style: string,
    step: number,
    stepInChord: number,
    stepInfo: StepInfo | null,
    ts: { stepsPerBeat: number; beats: number },
    intBeat: number,
    isQuarter: boolean,
    is8th: boolean,
    playback: EnsembleState['playback'],
    groove: EnsembleState['groove'],
) {
    if (style === 'whole') {
        return stepInChord === 0;
    }
    if (style === 'half') {
        return stepInChord % (ts.stepsPerBeat * 2) === 0;
    }
    if (style === 'arp') {
        return stepInChord % ts.stepsPerBeat === 0;
    }
    if (style === 'rock') {
        return is8th;
    }
    if (style === 'bossa') {
        // Semantic Bossa: 1, 2&, 3, 4&
        if (stepInfo) {
            const isOffbeatAnd =
                stepInfo.mStep % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat / 2);
            // In 4/4: Steps 0, 6, 8, 14
            return (
                stepInfo.isMeasureStart || // Step 0
                (stepInfo.isBeatStart && intBeat === 2) || // Step 8
                (isOffbeatAnd && (intBeat === 1 || intBeat === 3)) // Steps 6, 14
            );
        }
        return false;
    }
    if (style === 'quarter' || groove.genreFeel === 'Jazz') {
        if (isQuarter) {
            return true;
        }

        const isEighthSkip = step % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat * 0.5); // The 'and'

        // Probabilistic eighth-note "skips" for walking bass feel
        let skipProb = 0.1 + playback.bandIntensity * 0.25 + playback.complexity * 0.2;

        if (playback.bpm > 165) {
            skipProb = 0;
        }

        if (isEighthSkip && Math.random() < skipProb) {
            return true;
        }

        return false;
    }
    if (style === 'funk') {
        // Semantic: On beats or specific syncopations
        const isPopTarget = stepInfo ? stepInfo.isBackbeat : isQuarter && intBeat % 2 !== 0;
        const isFoundational = isQuarter || isPopTarget;
        let ghostProb = 0.5 + playback.bandIntensity * 0.3;

        if (playback.bpm > 150) {
            ghostProb *= 0.5;
        }

        if (isFoundational) {
            return true;
        }
        if (Math.random() < ghostProb) {
            return true;
        }
        return false;
    }
    if (style === 'rocco') {
        return true;
    }
    if (style === 'disco') {
        return true;
    }
    if (style === 'hiphop') {
        // Lower intensity = Grounded half notes
        if (playback.bandIntensity < 0.4) {
            return stepInChord % (ts.stepsPerBeat * 2) === 0;
        }
        // Higher intensity = Standard foundations (1, 2&, 3, 4&)
        return isQuarter || step % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat / 2);
    }

    if (style === 'acoustic') {
        // Lower intensity = Half notes (Roots)
        if (playback.bandIntensity < 0.4) {
            return stepInChord % (ts.stepsPerBeat * 2) === 0;
        }
        // Higher intensity = Quarter notes (Supportive)
        return isQuarter;
    }

    if (style === 'neo') {
        // Foundation: 1, 2&, 3, 4& (classic Dilla-esque placements)
        if (stepInfo) {
            return (
                stepInfo.isBeatStart ||
                stepInfo.mStep % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat / 2)
            );
        }
        return false;
    }
    if (style === 'country') {
        return step % (ts.stepsPerBeat * 2) === 0; // Alternating beats (1 and 3 in 4/4)
    }
    if (style === 'metal') {
        if (is8th) {
            return true;
        }
        // Gallop/Chug: 16th note subdivisions at higher intensity/complexity
        const gallopProb = (playback.bandIntensity > 0.6 ? 0.5 : 0.1) + playback.complexity * 0.4;
        return Math.random() < gallopProb;
    }
    if (style === 'blues') {
        // Foundation: Always play on quarter notes
        if (isQuarter) {
            return true;
        }

        // The Lope: Play on the swung offbeat (shuffle)
        if (stepInfo?.isOffbeat) {
            // Steeper sensitivity curve: Intensity is the primary driver
            // Add a threshold gate to ensure low intensity is strictly quarter-note based
            if (playback.bandIntensity < 0.3) {
                return false;
            }
            const intensityWeight = playback.bandIntensity ** 1.2;
            const complexityWeight = playback.complexity * 0.3;
            // High consistency (>90%) at high levels, very sparse at low levels
            const shuffleProb = intensityWeight + complexityWeight;
            if (Math.random() < shuffleProb) {
                return true;
            }
        }
        return false;
    }
    if (style === 'walking-ska') {
        if (playback.bpm > 185 && !isQuarter && Math.random() < 0.3) {
            return false;
        }
        return is8th;
    }
    if (style === 'dub') {
        // why: dub fires at riddim positions selected by intensity. Same band thresholds
        // as getBassNoteStyle — keep both sites in sync. Beat-1 presence is controlled
        // entirely by the riddim tables (One Drop has no step-0 entry; others do).
        const intensity = playback.bandIntensity;
        let selectedRiddim: keyof typeof REGGAE_RIDDIMS = 'One Drop';
        if (intensity > 0.85) {
            selectedRiddim = 'Steppers';
        } else if (intensity > 0.65) {
            selectedRiddim = 'Stalag';
        } else if (intensity > 0.45) {
            selectedRiddim = '54-46';
        }
        const riddim = REGGAE_RIDDIMS[selectedRiddim] as [number, number, number, number][];
        const stepsPerBar = ts.beats * ts.stepsPerBeat;
        const mStep = stepInfo ? stepInfo.mStep : step % stepsPerBar;
        return riddim.some((r) => r[0] === mStep);
    }

    return false;
}

export function getBassNoteStyle(
    style: string,
    chord: {
        rootMidi: number;
        quality: string;
        intervals: number[];
        bassMidi?: number | null;
    },
    nextChord: { rootMidi: number; quality: string; bassMidi?: number | null } | null,
    step: number,
    stepInChord: number,
    _stepInfo: StepInfo | null,
    context: {
        withOctaveJump: (midi: number) => number;
        isSameAsPrev: (midi: number) => boolean;
        clampAndNormalize: (midi: number) => number;
        normalizeToRange: (midi: number) => number;
    },
    ts: { stepsPerBeat: number; beats: number },
    stepsPerMeasure: number,
    intBeat: number,
    _isQuarter: boolean,
    _is8th: boolean,
    isBeatStart: boolean,
    isDownbeat: boolean,
    stepInMeasure: number,
    _stepInBeat: number,
    baseRoot: number,
    _prevFreq: number,
    prevMidi: number | null,
    _centerMidi: number,
    absMin: number,
    absMax: number,
    scale: number[],
    playback: EnsembleState['playback'],
    groove: EnsembleState['groove'],
    soloist: EnsembleState['soloist'],
    intensity: number,
    velocity: number,
    isSoloistBusy: boolean,
    beatsInChord: number,
    result: (
        freq: number,
        dur?: number | null,
        vel?: number,
        ghost?: number,
        bend?: number,
    ) => { timingOffset: number; [key: string]: unknown },
    isGroupStart: boolean,
    hasKickTrigger: boolean,
    kickInst: { steps: number[] } | null,
) {
    const { withOctaveJump, isSameAsPrev, clampAndNormalize, normalizeToRange } = context;
    if (style === 'whole') {
        return result(getFrequency(withOctaveJump(baseRoot)));
    }

    // --- HALF NOTE STYLE ---
    if (style === 'half') {
        const halfStep = Math.floor(stepsPerMeasure / 2);
        if (stepInChord % halfStep === 0) {
            if (stepInChord === 0) {
                return result(getFrequency(withOctaveJump(baseRoot)));
            }
            const hasFlat5 = chord.quality === 'dim' || chord.quality === 'halfdim';
            const hasSharp5 = chord.quality === 'aug' || chord.quality === 'augmaj7';
            const fifth = baseRoot + (hasFlat5 ? 6 : hasSharp5 ? 8 : 7);
            return result(getFrequency(clampAndNormalize(withOctaveJump(fifth))));
        }
        return null;
    }

    // --- ARP STYLE ---
    if (style === 'arp') {
        if (!isDownbeat) {
            return null;
        }
        const beatInMeasureInside = Math.floor(stepInMeasure / ts.stepsPerBeat);
        const beatInPattern = beatInMeasureInside % 4;
        if (beatInPattern === 0 || isGroupStart) {
            return result(getFrequency(withOctaveJump(baseRoot)));
        }
        const intervals = chord.intervals;
        const targetInterval =
            beatInPattern === 1 || beatInPattern === 3 ? intervals[1] || 4 : intervals[2] || 7;
        return result(getFrequency(clampAndNormalize(withOctaveJump(baseRoot + targetInterval))));
    }

    // --- COUNTRY STYLE (Root-Five) ---
    if (style === 'country') {
        // Strictly Root on 1 & 3, Fifth on 2 & 4 (in 4/4)
        if (!isBeatStart) {
            return null;
        }

        // Simplify to just Root on 1 at very low intensity
        if (intensity < 0.2 && !isDownbeat) {
            return null;
        }

        const _isRootBeat = intBeat === 0 || intBeat === 2;
        const isFifthBeat = intBeat === 1 || intBeat === 3;

        let note = baseRoot;
        if (isFifthBeat) {
            // Authentic Country: Prefer the fifth BELOW the root if possible
            note = normalizeToRange(baseRoot - 5); // Perfect 4th down = Perfect 5th interval
            if (note > baseRoot) {
                note -= 12; // Force below
            }
            // Dynamic floor check
            if (note < absMin) {
                note += 12;
            }
        }

        // Occasional walk-up on the last beat of a section
        const isLastBeat = intBeat === ts.beats - 1;
        if (isLastBeat && intensity > 0.5 && nextChord && nextChord.rootMidi !== chord.rootMidi) {
            if (Math.random() < 0.4) {
                const nextTarget = normalizeToRange(nextChord.rootMidi);
                const approach = normalizeToRange(nextTarget - 1);
                return result(getFrequency(approach), 1, 1.1);
            }
        }

        const pluckVel = 0.95 + intensity * 0.3;
        return result(getFrequency(note), 2, pluckVel); // Plucky duration
    }

    // --- HIP HOP STYLE (Sub-Bass / 808) ---
    if (style === 'hiphop') {
        const deepRoot = clampAndNormalize(baseRoot - 12);
        // Force ultra-deep register for Hip Hop (Strictly 24-36 if possible)
        let finalDeepRoot = deepRoot;
        while (finalDeepRoot > 36) {
            finalDeepRoot -= 12;
        }
        // Timing: Heavy lazy lag
        const lag = 0.01 + intensity * 0.01;

        let note = finalDeepRoot;
        let dur = ts.stepsPerBeat * 0.9; // Warm, long sustain

        if (intensity < 0.4) {
            dur = ts.stepsPerBeat * 1.95; // Extreme sustain for sub-chugs
        } else {
            // High complexity: Probabilistic 808-style melodic glides
            if (playback.complexity > 0.7 && !isBeatStart && Math.random() < 0.5) {
                const glideNote = Math.random() < 0.6 ? finalDeepRoot + 12 : finalDeepRoot + 7;
                note = clampAndNormalize(glideNote);
                dur = 0.5;
            }
        }

        const res = result(getFrequency(note), dur, 1.0 + intensity * 0.2);
        res.timingOffset += lag;
        return res;
    }
    if (style === 'acoustic') {
        // Lay-back timing for acoustic feel
        const lag = 0.01 + intensity * 0.005;

        // Note Logic: Root on downbeats, 5th/8th on secondary beats
        let note = baseRoot;
        let dur = ts.stepsPerBeat * 0.8; // Warm sustain

        if (intensity < 0.4) {
            dur = ts.stepsPerBeat * 1.8; // Long half-note sustain
        } else {
            const isSecondary = intBeat === 1 || intBeat === 3;
            if (isSecondary) {
                // Occasional 5th or Octave at higher intensity
                if (Math.random() < 0.4 + intensity * 0.3) {
                    const fifthOffset =
                        chord.quality.includes('dim') || chord.quality.includes('halfdim') ? 6 : 7;
                    note = Math.random() < 0.6 ? baseRoot + fifthOffset : baseRoot + 12;
                    dur = ts.stepsPerBeat * 0.6; // Slightly shorter for secondary hits
                }
            }
        }

        const res = result(getFrequency(clampAndNormalize(note)), dur, 0.95 + intensity * 0.15);
        res.timingOffset += lag;
        return res;
    }
    if (style === 'metal') {
        const stepInBeat = step % ts.stepsPerBeat;
        const isEighth = stepInBeat % 2 === 0;

        // 1. The "One" (and Beat 3) - Heavy Anchor
        if (isDownbeat || (isBeatStart && intBeat === 2)) {
            return result(getFrequency(baseRoot), 0.9, 1.25 + intensity * 0.1);
        }

        // 2. Rhythmic Foundation: 8th Note Roots (Pedal)
        if (isEighth && !isBeatStart) {
            return result(getFrequency(baseRoot), 0.7, 1.1 + intensity * 0.1);
        }

        // 3. The "Gallop" (16-16-8 feel)
        // Occurs on 'e' and 'a' subdivisions at medium-high intensity
        if (!isEighth) {
            const gallopProb = (intensity > 0.6 ? 0.6 : 0.2) + playback.complexity * 0.3;
            if (Math.random() < gallopProb) {
                // Choice: Chug on root or chromatic approach to next beat
                let note = baseRoot;
                let isGhost = false;

                // Chromatic Leading Note
                if (intensity > 0.75 && Math.random() < 0.4) {
                    const target = baseRoot;
                    note = Math.random() < 0.5 ? target - 1 : target + 1;
                } else {
                    isGhost = intensity < 0.8;
                }

                const res = result(
                    getFrequency(clampAndNormalize(note)),
                    0.3,
                    velocity * (isGhost ? 0.7 : 1.0),
                    isGhost ? 1 : 0,
                );
                // Tight, aggressive timing
                res.timingOffset -= 0.002;
                return res;
            }
        }

        // 4. Fill Logic: Fast 16th runs at max intensity
        if (intensity > 0.9 && Math.random() < 0.3) {
            const idx = Math.floor(Math.random() * scale.length);
            const walkNote = baseRoot + scale[idx];
            return result(getFrequency(clampAndNormalize(walkNote)), 0.2, 1.1);
        }

        return null;
    }

    // --- ROCK STYLE (Driving 8ths) ---
    if (style === 'rock') {
        const is8th = step % Math.floor(ts.stepsPerBeat / 2) === 0;
        if (!is8th) {
            return null;
        }

        // 1. Kick Locking: Mirror the drummer's kick pattern at high complexity
        if (hasKickTrigger && kickInst && (playback.complexity > 0.6 || intensity > 0.7)) {
            const kickStepVal = kickInst.steps[step % (groove.measures * stepsPerMeasure)];
            if (kickStepVal > 0) {
                const kickVel = kickStepVal === 2 ? 1.25 : 1.1;
                return result(getFrequency(baseRoot), 0.8, kickVel * (0.8 + intensity * 0.2));
            }
        }

        // 2. Fundamental Pulse: Quarter notes are solid roots
        if (isBeatStart) {
            const isPushPoint = intBeat === ts.beats - 1 && Math.random() < 0.4 + intensity * 0.3;
            if (isPushPoint && nextChord && nextChord.rootMidi !== chord.rootMidi) {
                // Harmonic Anticipation: Play the NEXT root early
                const nextRoot = normalizeToRange(nextChord.rootMidi);
                return result(getFrequency(nextRoot), 0.8, 1.2, 1);
            }
            return result(getFrequency(baseRoot), 0.8, 1.1 + intensity * 0.1);
        }

        // 3. Syncopation: Eighth note "ands"
        // Low Intensity: Switch to Quarter Notes
        if (intensity < 0.35) {
            return null;
        }

        // High Intensity: Add variation (5ths or Octaves)
        let note = baseRoot;
        let vel = 0.95 + intensity * 0.15;
        if (intensity > 0.65 && Math.random() < 0.3 + intensity * 0.2 && !isSoloistBusy) {
            const hasFlat5 = chord.quality === 'dim' || chord.quality === 'halfdim';
            const fifthOffset = hasFlat5 ? 6 : 7;
            note = Math.random() < 0.5 ? baseRoot + 12 : baseRoot + fifthOffset;
            note = clampAndNormalize(note);
            vel *= 1.1;
        }

        return result(getFrequency(note), 0.7, vel);
    }

    // --- BOSSA NOVA / SAMBA STYLE ---
    if (style === 'bossa') {
        const root = baseRoot;
        const hasFlat5 = chord.quality.includes('dim') || chord.quality.includes('halfdim');
        const fifthInterval = hasFlat5 ? 6 : 7;
        const fifthUp = clampAndNormalize(root + fifthInterval);
        const fifthDown = clampAndNormalize(root - (12 - fifthInterval)); // same pitch class, octave lower
        const rootOctaveUp = clampAndNormalize(root + 12);

        // 1. Foundation: 1, 2&, 3, 4&
        const isOne = isBeatStart && intBeat === 0;
        const isThree = isBeatStart && intBeat === 2;
        const isOffbeatTwo =
            step % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat / 2) && intBeat === 1;
        const isOffbeatFour =
            step % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat / 2) && intBeat === 3;

        // Bossa Timing: Subtle lay-back
        const lag = 0.01 + intensity * 0.005;

        // Per-bar voicing variation: real bossa players octave-displace the root or fifth
        // every few bars even on a static chord, so the line breathes rather than looping.
        // Deterministic from barIndex per CLAUDE.md (no raw Math.random) so loops stay coherent
        // and critique tests don't depend on RNG. Pitch classes are preserved, only octave shifts.
        const barIndex = Math.floor(step / stepsPerMeasure);
        const variationSeed = ((barIndex * 37 + 13) % 100) / 100;
        const useOctaveUpOnThree = variationSeed < 0.2; // ~20% of bars: beat-3 root jumps up an octave
        const useDeepFifthOnTwoAnd = variationSeed >= 0.35 && variationSeed < 0.5; // ~15%: deeper pedal "& of 2"
        const useDeepFifthOnFourAnd = variationSeed >= 0.7 && variationSeed < 0.85; // ~15%: deeper pedal "& of 4"

        // Note Logic: Root on downbeats, Fifth on upbeats (with octave variations)
        if (isOne) {
            const res = result(getFrequency(root), ts.stepsPerBeat * 0.6, 1.1 + intensity * 0.1);
            res.timingOffset += lag;
            return res;
        }

        if (isThree) {
            const pitch = useOctaveUpOnThree ? rootOctaveUp : root;
            const res = result(getFrequency(pitch), ts.stepsPerBeat * 0.6, 1.1 + intensity * 0.1);
            res.timingOffset += lag;
            return res;
        }

        if (isOffbeatTwo) {
            const pitch = useDeepFifthOnTwoAnd ? fifthDown : fifthUp;
            const res = result(getFrequency(pitch), 0.8, 1.0 + intensity * 0.15);
            res.timingOffset += lag + 0.005; // Upbeats often lag even more
            return res;
        }

        if (isOffbeatFour) {
            const pitch = useDeepFifthOnFourAnd ? fifthDown : fifthUp;
            const res = result(getFrequency(pitch), 0.8, 1.0 + intensity * 0.15);
            res.timingOffset += lag + 0.005;
            return res;
        }

        return null;
    }

    // --- FUNK STYLE (Slap & Pop) ---
    if (style === 'funk') {
        const stepInBeat = step % ts.stepsPerBeat;
        const isOne = stepInChord === 0;
        const isSecondarySlap = isBeatStart && intBeat === 2; // Beat 3

        // 1. "The One" (and Beat 3) - Primary Slaps
        if (isOne || isSecondarySlap) {
            const slapVel = 1.2 + intensity * 0.2;
            return result(getFrequency(withOctaveJump(baseRoot)), 0.9, slapVel);
        }

        // 2. The "And" (8th notes) - Aggressive Pops
        if (stepInBeat === Math.floor(ts.stepsPerBeat / 2)) {
            // Higher octave pop probability than before
            const popProb = 0.6 + intensity * 0.4;
            if (Math.random() < popProb) {
                const note = baseRoot + 12;
                // Pop velocity: triggers bright, snappy tone
                const popVel = 1.25 + intensity * 0.2;
                return result(getFrequency(clampAndNormalize(note)), 0.3, popVel);
            }
        }

        // 3. Syncopated "Pushes" & "Gallops" (16ths)
        if (stepInBeat % 2 !== 0) {
            const isSoloistBusyLocal =
                soloist.enabled && (soloist.session.phrasing.busySteps || 0) > 0;

            // High complexity "Pop" on the 'a'
            if (
                stepInBeat === 3 &&
                playback.complexity > 0.7 &&
                Math.random() < 0.3 + intensity * 0.3 &&
                !isSoloistBusyLocal
            ) {
                const note = baseRoot + 12;
                const finalNote = note > absMax ? baseRoot : note;
                return result(getFrequency(finalNote), 0.2, 1.15);
            }

            // Dead-note/Ghost chucks to maintain engine
            const chuckProb = (isSoloistBusyLocal ? 0.1 : 0.2) + intensity * 0.4;
            if (Math.random() < chuckProb && !isSoloistBusyLocal) {
                // Usually repeat root or previous note as a ghost
                return result(getFrequency(prevMidi || baseRoot), 0.2, 0.5, 1);
            }

            // High complexity melodic "Double Slap" or "Hammer-on"
            if (
                playback.complexity > 0.7 &&
                intensity > 0.6 &&
                Math.random() < 0.3 &&
                !isSoloistBusyLocal
            ) {
                const hammerNote = scale.includes(2) ? baseRoot + 2 : baseRoot + 1;
                return result(getFrequency(clampAndNormalize(hammerNote)), 0.2, 1.1);
            }
        }

        // 4. Harmonic Approaches — only on real chord changes (audit: bass.md P2 #13)
        if (
            intensity > 0.75 &&
            stepInBeat === ts.stepsPerBeat - 1 &&
            isChordChangeApproach(nextChord, chord) &&
            Math.random() < 0.6
        ) {
            const target = normalizeToRange(nextChord.rootMidi);
            const approach = Math.random() < 0.5 ? target - 1 : target + 1;
            return result(getFrequency(clampAndNormalize(approach)), 0.4, 1.1);
        }

        return null;
    }

    // --- ROCCO STYLE (Machine-Gun 16ths) ---
    if (style === 'rocco') {
        const stepInBeat = step % ts.stepsPerBeat;
        // Rocco Prestia style: Staccato 16th notes, mostly Root, heavily muted (ghosts).
        // Driving, percussive, disciplined.

        // 1. The "One" is always strong.
        if (stepInChord === 0) {
            return result(getFrequency(baseRoot), 0.7, 1.2);
        }

        // 2. Downbeats
        if (isBeatStart) {
            // Almost always play the root, tight.
            return result(getFrequency(baseRoot), 0.7, 1.15);
        }

        // 3. The "And" (8th notes) - Often Root or Octave or 5th
        if (stepInBeat === Math.floor(ts.stepsPerBeat / 2)) {
            // 60% chance of playing
            if (Math.random() < 0.4 + intensity * 0.4) {
                // Occasional octave jump or 5th for flavor, but mostly root
                let note = baseRoot;
                const rnd = Math.random();
                if (rnd < 0.15) {
                    note += 12; // Octave pop
                } else if (rnd < 0.25) {
                    note += 7; // 5th
                }

                // Manual clamping to preserve interval direction where possible
                if (note > absMax) {
                    note -= 12;
                }
                if (note < absMin) {
                    note += 12;
                }
                if (note > absMax || note < absMin) {
                    note = baseRoot;
                }

                return result(getFrequency(note), 0.7, 1.1);
            }
            // If not playing a tone, play a ghost note
            return result(getFrequency(baseRoot), 0.6, 0.7, 1);
        }

        // 4. The "e" and "a" (16th notes) - The chug engine
        if (stepInBeat % 2 !== 0) {
            // High probability of ghost notes to propel groove
            // Probability increases with intensity, but base is high (Rocco is busy)
            let ghostProb = 0.6 + intensity * 0.3;

            // High BPM Safety
            if (playback.bpm > 150) {
                ghostProb *= 0.6;
            }

            if (Math.random() < ghostProb) {
                // Mostly muted/ghosts
                // At very high intensity, some might become short staccato tones
                const isTone = intensity > 0.8 && Math.random() < 0.3;
                return result(getFrequency(baseRoot), 0.5, isTone ? 0.9 : 0.6, isTone ? 0 : 1);
            }
        }
        return null;
    }

    // --- DISCO STYLE (Dynamic Octaves / Pulse) ---
    if (style === 'disco') {
        const stepInBeat = step % ts.stepsPerBeat;
        const isOffbeatAnd = stepInBeat === Math.floor(ts.stepsPerBeat / 2);

        // 1. Downbeats (1, 2, 3, 4) -> Solid Root
        if (isBeatStart) {
            return result(getFrequency(baseRoot), 0.9, 1.25);
        }

        // 2. Upbeats (&) -> Dynamic Octave
        if (isOffbeatAnd) {
            // Probability of octave increases with intensity
            const octaveProb = 0.4 + intensity * 0.6;
            if (Math.random() < octaveProb) {
                let note = baseRoot + 12;
                // Smart Octave Flipping: stay within bass slot
                if (note > absMax) {
                    note = baseRoot - 12;
                }
                // Final safety
                if (note < absMin) {
                    note = baseRoot;
                }

                return result(getFrequency(note), 0.8, 1.15);
            }
            // Fallback to repeating root
            return result(getFrequency(baseRoot), 0.8, 1.0);
        }

        // 3. The "Gallop" (16th skips on 'e' or 'a')
        if (stepInBeat % 2 !== 0) {
            // Only at higher complexity and intensity
            const gallopProb = intensity ** 2 * 0.4 + playback.complexity * 0.3;
            if (Math.random() < gallopProb - 0.1) {
                // Usually repeat the root or octave ghosted
                const note = Math.random() < 0.7 ? baseRoot : baseRoot + 12;
                const finalNote = note > absMax ? baseRoot : note;
                return result(getFrequency(finalNote), 0.5, 0.6, 1);
            }
        }

        return null;
    }

    // --- DUB STYLE (Reggae) ---
    if (style === 'dub') {
        // why: the old "One Drop silencer" block was removed here. It mislabeled the
        // affected riddims — at intensity 0.45-0.7 the active riddim is 54-46 or Stalag
        // (both have a step-0 entry), yet the silencer was randomly suppressing beat 1
        // 80% of the time on those riddims. One Drop itself (intensity < 0.45) has no
        // step-0 entry, so the silencer was a no-op there anyway. Beat-1 presence is
        // now fully controlled by the riddim tables below. (bass.md P0 #3)
        const deepRoot = clampAndNormalize(baseRoot - 12);
        // Force deep register for Dub (Stay within safe sub-bass range)
        let finalDeepRoot = deepRoot;
        while (finalDeepRoot > 38) {
            finalDeepRoot -= 12;
        }
        while (finalDeepRoot < absMin) {
            finalDeepRoot += 12;
        }

        let selectedRiddim = 'One Drop';
        if (intensity > 0.85) {
            selectedRiddim = 'Steppers';
        } else if (intensity > 0.65) {
            selectedRiddim = 'Stalag';
        } else if (intensity > 0.45) {
            selectedRiddim = '54-46';
        } else {
            selectedRiddim = 'One Drop';
        }

        const riddim = (
            REGGAE_RIDDIMS as unknown as Record<string, [number, number, number, number][]>
        )[selectedRiddim];
        const match = riddim.find((r) => r[0] === stepInMeasure);

        if (match) {
            const [, interval, vel, dur] = match;
            const tunedVel = vel * (0.8 + intensity * 0.3);

            // Add extra 'lay-back' for the lazy Reggae feel
            const res = result(
                getFrequency(clampAndNormalize(finalDeepRoot + interval)),
                dur,
                tunedVel * (0.95 + Math.random() * 0.1),
            );
            res.timingOffset += 0.01 + intensity * 0.01;
            return res;
        }
        return null;
    }

    // --- WALKING SKA STYLE (Fast 8ths / Bouncy) ---
    if (style === 'walking-ska') {
        const is8th = step % Math.floor(ts.stepsPerBeat / 2) === 0;
        if (!is8th) {
            return null;
        }

        // Bouncy Pattern Logic (Root, 5th, 6th, Octave)
        const patternIndex = intBeat % 4;
        let targetInterval = 0; // Default Root

        if (patternIndex === 1) {
            targetInterval = 7; // 5th
        } else if (patternIndex === 2) {
            targetInterval = 9; // 6th
        } else if (patternIndex === 3) {
            targetInterval = 12; // Octave
        }

        // High Intensity: Add melodic variation and chromatic runs
        if (intensity > 0.6 && Math.random() < 0.4) {
            const randomScaleNote = scale[Math.floor(Math.random() * scale.length)];
            targetInterval = randomScaleNote;
        }

        // Chromatic approach to next chord on the last eighth note
        const isLastEighth =
            _stepInfo?.mStep ===
            (_stepInfo?.tsConfig?.beats || 4) * (_stepInfo?.tsConfig?.stepsPerBeat || 4) - 2;
        if (isLastEighth && nextChord && nextChord.rootMidi !== chord.rootMidi && intensity > 0.5) {
            const nextTarget = normalizeToRange(nextChord.rootMidi);
            const approach = Math.random() < 0.5 ? nextTarget - 1 : nextTarget + 1;
            const res = result(getFrequency(clampAndNormalize(approach)), 0.8, 1.2);
            res.timingOffset -= 0.005; // Rush the transition
            return res;
        }

        // Fundamental Pulse
        const res = result(
            getFrequency(clampAndNormalize(baseRoot + targetInterval)),
            0.8,
            1.0 + intensity * 0.2,
        );

        // Micro-timing: Rush slightly at high intensity to drive the energy
        res.timingOffset -= 0.004 + intensity * 0.004;
        return res;
    }

    const isEighthSkip = stepInMeasure % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat * 0.5);

    // --- QUARTER NOTE (WALKING) STYLE ---
    if (style === 'quarter') {
        const isJazz = groove.genreFeel === 'Jazz' || groove.lastDrumPreset === 'Jazz';
        if (isJazz && intensity < 0.3) {
            if (!isBeatStart || intBeat % 2 !== 0) {
                return null;
            }
            if (isDownbeat) {
                return result(getFrequency(withOctaveJump(baseRoot)), 2, 1.05);
            }
            const hasFlat5 = chord.quality === 'dim' || chord.quality === 'halfdim';
            const hasSharp5 = chord.quality === 'aug' || chord.quality === 'augmaj7';
            return result(
                getFrequency(
                    clampAndNormalize(
                        withOctaveJump(baseRoot + (hasFlat5 ? 6 : hasSharp5 ? 8 : 7)),
                    ),
                ),
                2,
                1.05,
            );
        }

        if (!isBeatStart && !isEighthSkip) {
            return null;
        }

        if (isDownbeat) {
            return result(
                getFrequency(clampAndNormalize(baseRoot)),
                isEighthSkip ? 0.4 : ts.stepsPerBeat * 0.45,
                velocity,
            );
        }

        if (intBeat === 2 && isBeatStart && !isSoloistBusy) {
            // Beat 3: High preference for 5th or Octave
            const hasFlat5 = chord.quality === 'dim' || chord.quality === 'halfdim';
            const fifthOffset = hasFlat5 ? 6 : 7;
            const targetInterval = Math.random() < 0.7 ? fifthOffset : 0;
            return result(
                getFrequency(clampAndNormalize(baseRoot + targetInterval)),
                isEighthSkip ? 0.4 : ts.stepsPerBeat * 0.45,
                velocity,
            );
        }

        // --- Jazz Path-Note Logic (Beat 2) ---
        if (isJazz && isBeatStart && intBeat === 1) {
            const nextTarget = nextChord ? nextChord.rootMidi : baseRoot;
            const targetRoot = normalizeToRange(nextTarget);

            // Find a scale note that moves towards the target
            const candidates = scale
                .map((ivl) => normalizeToRange(baseRoot + ivl))
                .filter((midiNote) => {
                    const diff = Math.abs(midiNote - (prevMidi || baseRoot));
                    return diff > 0 && diff <= 5; // Within a reasonable distance
                });

            if (candidates.length > 0) {
                // Score candidates by distance to targetRoot AND proximity to prevMidi
                candidates.sort((a, b) => {
                    const ivlA = (a - chord.rootMidi + 120) % 12;
                    const ivlB = (b - chord.rootMidi + 120) % 12;

                    // Bonus for 3rd or 7th (Defining tones)
                    const bonusA =
                        ivlA === 3 || ivlA === 4 || ivlA === 10 || ivlA === 11 ? -1.5 : 0;
                    const bonusB =
                        ivlB === 3 || ivlB === 4 || ivlB === 10 || ivlB === 11 ? -1.5 : 0;

                    const scoreA =
                        Math.abs(a - targetRoot) +
                        Math.abs(a - (prevMidi || baseRoot)) * 0.5 +
                        bonusA;
                    const scoreB =
                        Math.abs(b - targetRoot) +
                        Math.abs(b - (prevMidi || baseRoot)) * 0.5 +
                        bonusB;
                    return scoreA - scoreB;
                });
                return result(
                    getFrequency(clampAndNormalize(candidates[0])),
                    ts.stepsPerBeat * 0.45,
                    velocity * 0.9,
                );
            }
        }

        // For intermediate beats, return undefined to let the Generic Fallback and Approach Logic
        // handle scale tone picking with proper voice-leading and soloist awareness.
        return undefined;
    }

    // Chromatic Approach Logic — universal across genres; Jazz/Blues retain higher probability
    const isLastBeatOfMeasure = intBeat === ts.beats - 1;
    const isEndOfChord = intBeat === beatsInChord - 1;
    const isLastEighth = _stepInfo?.mStep === ts.beats * ts.stepsPerBeat - 2;
    const isApproachPoint =
        (isBeatStart && (isLastBeatOfMeasure || isEndOfChord)) || isEighthSkip || isLastEighth;

    // Use a slightly more aggressive chromatic probability for the critique to ensure it triggers
    if (isApproachPoint && isChordChangeApproach(nextChord, chord)) {
        const nextTarget =
            nextChord.bassMidi !== null && nextChord.bassMidi !== undefined
                ? nextChord.bassMidi
                : nextChord.rootMidi;
        const targetRoot = normalizeToRange(nextTarget);
        const pullTension =
            (soloist.session.tension || 0) + intensity * 0.3 + playback.complexity * 0.2;
        let chromaticProb = (isSoloistBusy ? 0.4 : 0.6) + pullTension * 0.3;

        // Force very high probability for Jazz/Blues at high levels
        if (intensity > 0.75 && (groove.genreFeel === 'Jazz' || groove.genreFeel === 'Blues')) {
            // why: jazz/blues idiomatic — chromatic leading tones are the primary
            // approach vocabulary at high intensity; raise to near-certain.
            chromaticProb = 0.95;
        } else if (groove.genreFeel !== 'Jazz' && groove.genreFeel !== 'Blues') {
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
            // Optimization: Replace Array.prototype.reduce with a standard for loop to avoid closure overhead in hot audio path
            let totalWeight = 0;
            for (let i = 0; i < choices.length; i++) {
                totalWeight += choices[i].weight;
            }
            let r = Math.random() * totalWeight;
            let approach = targetRoot - 1;
            for (const c of choices) {
                r -= c.weight;
                if (r <= 0) {
                    approach = c.midi;
                    break;
                }
            }
            // why: approach notes must sit within ±5 semitones of their target;
            // withOctaveJump would add ±12, turning a smooth half-step approach into
            // a dissonant octave leap — contradicts voice-leading intent (bass.md P0 #2).
            // Octave displacement is reserved for downbeat root statements only.
            approach = clampAndNormalize(approach);
            const bend =
                Math.random() < 0.2 && !isSoloistBusy ? (approach < targetRoot ? -1 : 1) : 0;
            return result(getFrequency(approach), 1, velocity, 0, bend);
        } else {
            const candidates = [targetRoot - 5, targetRoot + 7, targetRoot + 5, targetRoot - 7];
            const valid = candidates.filter(
                (n) => n >= absMin && n <= absMax && !isSameAsPrev(n) && n % 12 !== baseRoot % 12,
            );
            const approach =
                valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : targetRoot - 5;
            // why: candidates already filtered to absMin–absMax (bass register 23–57);
            // withOctaveJump would displace the perfect-fourth approach (−5) by ±12,
            // producing a leap instead of a smooth landing. Reserve for downbeat roots.
            return result(getFrequency(approach), null, velocity);
        }
    }

    return undefined;
}
