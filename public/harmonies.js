import { getBestInversion } from './chords-engine.js';
import { TIME_SIGNATURES } from './config.js';
import { getState } from './state.js';
import { calculateTimingOffset } from './utils.js';

/**
 * HARMONIES.JS
 */

// Internal memory for motif consistency
const motifCache = new Map();
let lastPlayedStep = -1;

/**
 * Clears the internal motif memory. Used for section changes or testing.
 */
export function clearHarmonyMemory() {
    const { harmony } = getState();
    motifCache.clear();
    harmony.lastMidis = []; // @worker-mutation
    lastPlayedStep = -1;
}

/**
 * Extracts 3rds and 7ths (Guide Tones) from a set of intervals.
 * Critical for "supportive" harmony that defines quality without clutter.
 * @param {number[]} intervals
 * @returns {number[]}
 */
export function getGuideTones(intervals) {
    return intervals.filter((/** @type {any} */ i) => {
        const iMod = i % 12;
        return iMod === 3 || iMod === 4 || iMod === 10 || iMod === 11;
    });
}

/**
 * Filters intervals to remove high extensions (9, 11, 13) to avoid clashing with soloist.
 * @param {number[]} intervals
 * @param {boolean} [rootless] - If true, remove the root (0) from the voicing.
 * @returns {number[]}
 */
export function getSafeVoicings(intervals, rootless = false) {
    return intervals.filter((/** @type {any} */ i) => {
        const iMod = i % 12;
        if (rootless && iMod === 0) {
            return false;
        }
        // Allow Root(0), 5th(7), 3rds(3/4), 7ths(10/11), 6ths(9)
        // Exclude b9(1), 9(2), 11(5), #11(6), b13(8) unless they are essentially 3/7
        return [0, 7, 3, 4, 10, 11, 9].includes(iMod);
    });
}

/**
 * Generates a procedural rhythmic pattern based on genre feel.
 * Values indicate intensity threshold: 1=Always, 2=Medium(>0.4), 3=High(>0.7)
 * @param {string} feel - The genre feel
 * @param {number} seed - Random seed
 * @param {any} [tsConfig] - Time signature config
 * @returns {number[]} pattern matching total measure length (or 2 bars)
 */
export function generateCompingPattern(feel, seed, tsConfig) {
    const ts = tsConfig || TIME_SIGNATURES['4/4'];
    const spm = ts.beats * ts.stepsPerBeat;
    const length = spm * 2; // Always generate 2 bars
    const pattern = new Array(length).fill(0);
    const pseudoRandom = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };

    /**
     * @param {number} bar
     * @param {number} beatIdx
     * @param {number} [offsetSteps]
     */
    const getBeatStep = (bar, beatIdx, offsetSteps = 0) => {
        return bar * spm + beatIdx * ts.stepsPerBeat + offsetSteps;
    };

    if (feel === 'Jazz') {
        // Bar 1: Charleston
        pattern[getBeatStep(0, 0)] = 1;
        pattern[getBeatStep(0, 1, Math.floor(ts.stepsPerBeat * 0.75))] = 1;

        // Bar 2: Displaced Charleston or Anticipations
        if (pseudoRandom() < 0.5) {
            pattern[getBeatStep(1, 0)] = 1;
            pattern[getBeatStep(1, 1, Math.floor(ts.stepsPerBeat * 0.75))] = 2;
        } else {
            const lastBeat = ts.beats - 1;
            pattern[getBeatStep(0, lastBeat, Math.floor(ts.stepsPerBeat * 0.75))] = 3; // Anticipation into Bar 2
            pattern[getBeatStep(1, lastBeat, Math.floor(ts.stepsPerBeat * 0.75))] = 3; // Anticipation into next Bar 1
        }
    } else if (feel === 'Bossa Nova') {
        // Bar 1: 1, (and-of-2), 4
        pattern[getBeatStep(0, 0)] = 1;
        pattern[getBeatStep(0, 1, Math.floor(ts.stepsPerBeat / 2))] = 1;
        if (ts.beats >= 4) {
            pattern[getBeatStep(0, 3)] = 2;
        }
        // Bar 2: (and-of-1), 3, (and-of-4)
        pattern[getBeatStep(1, 0, Math.floor(ts.stepsPerBeat / 2))] = 1;
        if (ts.beats >= 3) {
            pattern[getBeatStep(1, 2)] = 2;
        }
        const lastBeat = ts.beats - 1;
        pattern[getBeatStep(1, lastBeat, Math.floor(ts.stepsPerBeat / 2))] = 1;
    } else if (feel === 'Funk') {
        const spb = ts.stepsPerBeat;
        for (let b = 0; b < ts.beats * 2; b++) {
            const bar = Math.floor(b / ts.beats);
            const beatInBar = b % ts.beats;
            [1, spb - 1].forEach((sub) => {
                const s = getBeatStep(bar, beatInBar, sub);
                const r = pseudoRandom();
                if (r < 0.2) {
                    pattern[s] = 1;
                } else if (r < 0.4) {
                    pattern[s] = 2;
                }
            });
        }
        pattern[getBeatStep(0, 0)] = 1;
        pattern[getBeatStep(1, 0)] = 1;
    } else if (feel === 'Neo-Soul') {
        pattern[0] = 1;
        const lastBeat = ts.beats - 1;
        pattern[getBeatStep(0, lastBeat, Math.floor(ts.stepsPerBeat * 0.75))] = 3; // Anticipation
        pattern[getBeatStep(1, 1, Math.floor(ts.stepsPerBeat / 2))] = 1; // Lazy hit in Bar 2

        // Ghost notes (val 4) on the "a" of each beat
        for (let b = 0; b < ts.beats * 2; b++) {
            const bar = Math.floor(b / ts.beats);
            const beatInBar = b % ts.beats;
            if (pseudoRandom() < 0.4) {
                pattern[getBeatStep(bar, beatInBar, ts.stepsPerBeat - 1)] = 4;
            }
        }
    } else if (feel === 'Disco') {
        for (let b = 0; b < ts.beats * 2; b++) {
            pattern[
                getBeatStep(Math.floor(b / ts.beats), b % ts.beats, Math.floor(ts.stepsPerBeat / 2))
            ] = 2;
        }
    } else if (feel === 'Rock' || feel === 'Metal') {
        for (let b = 0; b < ts.beats * 2; b++) {
            pattern[getBeatStep(Math.floor(b / ts.beats), b % ts.beats)] = 1;
            pattern[
                getBeatStep(Math.floor(b / ts.beats), b % ts.beats, Math.floor(ts.stepsPerBeat / 2))
            ] = 3;
        }
    } else if (feel === 'Reggae') {
        const backbeats = ts.backbeat || [1, 3];
        backbeats.forEach((/** @type {number} */ b) => {
            pattern[getBeatStep(0, b)] = 1;
            pattern[getBeatStep(1, b)] = 1;
        });
    } else if (feel === 'Ska') {
        for (let b = 0; b < ts.beats * 2; b++) {
            pattern[
                getBeatStep(Math.floor(b / ts.beats), b % ts.beats, Math.floor(ts.stepsPerBeat / 2))
            ] = 1;
            if (pseudoRandom() < 0.3) {
                pattern[
                    getBeatStep(
                        Math.floor(b / ts.beats),
                        b % ts.beats,
                        Math.floor(ts.stepsPerBeat * 0.75),
                    )
                ] = 2;
            }
        }
    } else {
        pattern[0] = 1;
        if (ts.beats >= 3) {
            pattern[getBeatStep(0, 2)] = 1;
        }
        pattern[getBeatStep(1, 0)] = 2;
        if (ts.beats >= 3) {
            pattern[getBeatStep(1, 2)] = 2;
        }
    }

    return pattern;
}

/**
 * Generates harmony notes for a given step.
 * @param {import('./types.js').EnsembleState} state
 * @param {any} chord
 * @param {any} _nextChord
 * @param {number} step
 * @param {number} octave
 * @param {string} style
 * @param {number} stepInChord
 * @param {any} [soloistResult]
 * @param {any} [coordination]
 * @param {import('./types.js').StepInfo} [stepInfo]
 * @returns {Array<any>}
 */
export function getHarmonyNotes(
    state,
    chord,
    _nextChord,
    step,
    octave,
    style,
    stepInChord,
    soloistResult = null,
    coordination = {},
    stepInfo,
) {
    if (!chord) {
        return [];
    }

    // Destructure state here to avoid ReferenceError during evaluation
    const { playback, groove, harmony, soloist, arranger, bass } = state;

    // Internal Style Config
    const STYLE_CONFIG = {
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

    if (playback.bandIntensity < 0.22) {
        return [];
    }
    const isChordStart = stepInChord === 0;
    // Don't play if we just played a note and soloist is active (avoid stepping on toes)
    if (lastPlayedStep !== -1 && step === lastPlayedStep + 1 && soloistResult) {
        return [];
    }

    // -- ENSEMBLE COORDINATION --
    const bassHit = coordination.bassHit || false;
    const _soloistActive = coordination.soloistActive || false;
    const accompanimentHit = coordination.accompanimentHit || false;
    const _accMidis = coordination.accompanimentMidis || [];

    const notes = [];
    /** @type {any} */
    const signatures = TIME_SIGNATURES;
    const ts = signatures[arranger.timeSignature] || signatures['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    const measureStep = step % stepsPerMeasure;
    const sectionId = chord.sectionId || 'default';
    const feel = groove.genreFeel;

    // 1. Determine Style
    let activeStyle = style;
    if (style === 'smart') {
        if (feel === 'Blues') {
            activeStyle = 'organ';
        } else if (feel === 'Jazz' || feel === 'Bossa Nova') {
            activeStyle = 'strings';
        } else if (feel === 'Disco' || feel === 'Hip Hop') {
            activeStyle = 'plucks';
        } else if (feel === 'Funk' || feel === 'Metal' || feel === 'Afrobeat' || feel === 'Ska') {
            activeStyle = 'horns';
        } else if (feel === 'Reggae') {
            activeStyle = 'organ';
        } else if (feel === 'Neo-Soul') {
            activeStyle = 'organ';
        } else if (feel === 'Country' || feel === 'Acoustic') {
            activeStyle = 'strings';
        } else {
            activeStyle = 'strings';
        }
    }

    // Override for Comping in Jazz/Funk (User Request 1: Comping vs Pads)
    if ((feel === 'Jazz' || feel === 'Funk') && activeStyle === 'strings') {
        activeStyle = 'organ';
    }

    const config = /** @type {any} */ (STYLE_CONFIG)[activeStyle] || STYLE_CONFIG.smart;
    let rhythmicStyle = config.rhythmicStyle;

    if (rhythmicStyle === 'auto') {
        const isPadGenre = feel === 'Rock' || feel === 'Acoustic';
        rhythmicStyle = isPadGenre ? 'pads' : 'stabs';
    }

    // Force rhythmic stabs for comping-heavy genres
    if (['Jazz', 'Funk', 'Bossa Nova', 'Neo-Soul', 'Reggae', 'Ska'].includes(feel)) {
        rhythmicStyle = 'stabs';
    }

    // 2. Determine Intervals (Note Selection)
    let intervals = chord.intervals || [0, 4, 7];
    const isSoloistBusy = soloist.enabled && !soloist.isResting;

    // RHYTHMIC VARIANCE: Transition to pads only at extreme intensity if soloist is shredding
    if (isSoloistBusy && playback.bandIntensity > 0.9 && activeStyle === 'strings') {
        rhythmicStyle = 'pads';
    }

    // -- COORDINATION: Thin out if others are busy --
    const reserveBassSpace = playback.practiceMode || bass?.enabled || false;
    const isCompingGenre = ['Jazz', 'Funk', 'Neo-Soul', 'Blues'].includes(feel);

    if (isSoloistBusy || accompanimentHit) {
        // Back off entirely if soloist is actively playing notes
        if (isSoloistBusy && (soloist.notesInPhrase > 1 || playback.bandIntensity < 0.8)) {
            // Drop out occasionally when soloist is active to prevent stepping on toes,
            // but not so much that it feels like the harmony is 'scared' of the soloist.
            if (Math.random() < 0.6) {
                return [];
            }
        }

        intervals = getSafeVoicings(intervals, reserveBassSpace && isCompingGenre);
        // Thin out if very busy
        if (soloist.notesInPhrase > 3 || accompanimentHit || harmony.complexity < 0.4) {
            const guides = getGuideTones(intervals);
            if (guides.length > 0) {
                const root = reserveBassSpace && isCompingGenre ? [] : [0];
                intervals = [...root, ...guides];
            } else {
                intervals = reserveBassSpace && isCompingGenre ? [7] : [0, 7];
            }
        }

        // If BOTH are hitting, drop root, play ONLY guides or extensions
        if (accompanimentHit && isSoloistBusy && intervals.length > 2) {
            intervals = getGuideTones(intervals);
        }
    } else {
        if (harmony.complexity < 0.4 || playback.bandIntensity < 0.4) {
            const guides = getGuideTones(intervals);
            if (guides.length > 0) {
                intervals = guides;
            }
        }
    }

    // 3. Procedural Pattern Generation
    if (!motifCache.has(sectionId)) {
        let hash = 0;
        for (let i = 0; i < sectionId.length; i++) {
            hash = (hash << 5) - hash + sectionId.charCodeAt(i);
            hash |= 0;
        }
        const seed = Math.abs(hash);

        // Generate and cache the base pattern structure (independent of intensity)
        const pattern = generateCompingPattern(feel, seed, ts);

        // Calculate a broad rhythmic mask for UI/Consistency based on "Base" hits only
        let rhythmicMask = 0;
        // Use first 16 steps for UI mask to maintain grid alignment
        for (let i = 0; i < Math.min(16, pattern.length); i++) {
            if (pattern[i] > 0) {
                rhythmicMask |= 1 << i;
            }
        }

        motifCache.set(sectionId, {
            seed,
            rhythmicMask,
            pattern,
        });
    }

    const motif = motifCache.get(sectionId);
    if (harmony.rhythmicMask !== motif.rhythmicMask) {
        harmony.rhythmicMask = motif.rhythmicMask; // @worker-mutation
    }

    // -- Antiphonal Phrasing (Ska-Punk Call & Response) --
    let isSuppressedByAntiphony = false;
    if (feel === 'Ska-Punk' && playback.bandIntensity < 0.7) {
        const measureIdx = Math.floor(step / stepsPerMeasure);
        // Harmony plays on even measures (0, 2, 4...) -> Response
        // Soloist plays on odd measures (1, 3, 5...) -> Call
        if (measureIdx % 2 !== 0) {
            isSuppressedByAntiphony = true;
        }
    }

    // 4. Decision: Should we play?
    let shouldPlay = false;
    let durationSteps = 1;
    let isLatched = false;
    let isGhost = false;

    // Latching Logic (Soloist Hook Reinforcement)
    if (soloist.enabled && soloistResult && playback.bandIntensity > 0.6) {
        let reinforce = false;

        // -- Shared Hook Reinforcement --
        if (feel === 'Ska-Punk' && soloist.sharedHookBuffer) {
            // Check if the soloist is currently playing a known shared hook
            const hookMatch = soloist.sharedHookBuffer.find(
                (/** @type {any} */ h) => h.step === step,
            );
            if (hookMatch) {
                reinforce = true;
            }
        }

        if (reinforce) {
            shouldPlay = true;
            isLatched = true;
            durationSteps = 1;
            rhythmicStyle = 'stabs';
        }
    }

    if (!isLatched && isSuppressedByAntiphony) {
        return [];
    }

    if (!isLatched) {
        // -- Pads Logic --
        if (rhythmicStyle === 'pads') {
            if (isChordStart || measureStep === 0) {
                shouldPlay = true;
                durationSteps = Math.min(stepsPerMeasure, chord.beats * ts.stepsPerBeat);
            }
            if (stepInChord === 0 && !shouldPlay) {
                shouldPlay = true;
                durationSteps = Math.min(
                    stepsPerMeasure - measureStep,
                    chord.beats * ts.stepsPerBeat,
                );
            }
        }
        // -- Comping / Stabs Logic --
        else {
            const patternStep = step % motif.pattern.length;
            const val = motif.pattern[patternStep];
            if (val > 0) {
                // Sparse Comping: If soloist is busy, only play "Base" hits (val=1)
                // or have a 50% chance of playing others, and only if intensity is high enough.
                let needed = val === 1 ? 0.0 : val === 2 ? 0.4 : 0.7;
                if (val === 4) {
                    needed = 0.5; // Ghost notes medium threshold
                    isGhost = true;
                }

                if (isSoloistBusy || accompanimentHit) {
                    needed += 0.25;
                    if (val > 1 && Math.random() > 0.4) {
                        needed = 2.0;
                    }
                }

                if (playback.bandIntensity >= needed) {
                    shouldPlay = true;

                    // Yield to Accompaniment: 60% chance to drop if accompanist is hitting
                    if (accompanimentHit && Math.random() < 0.6) {
                        shouldPlay = false;
                    }

                    // Yield to Bass: 30% chance to drop on heavy bass hits
                    if (shouldPlay && bassHit && Math.random() < 0.3) {
                        shouldPlay = false;
                    }

                    if (shouldPlay) {
                        // Variable Durations: Downbeats are longer, syncopations are shorter
                        const isDownbeat = stepInfo
                            ? stepInfo.isBeatStart
                            : measureStep % ts.stepsPerBeat === 0;

                        // Align syncopation ratio with genre swing type
                        const is8thSwingGenre = ['Jazz', 'Blues', 'Acoustic'].includes(feel);
                        const syncRatio = is8thSwingGenre ? 0.5 : 0.75;

                        const isAnticipation = stepInfo
                            ? stepInfo.mStep % ts.stepsPerBeat ===
                              Math.floor(ts.stepsPerBeat * syncRatio)
                            : measureStep % 4 === (is8thSwingGenre ? 2 : 3);

                        if (isDownbeat) {
                            durationSteps = 3;
                        } else if (isAnticipation) {
                            durationSteps = 1.5;
                        } else {
                            durationSteps = 1;
                        }

                        // Neo-Soul/Jazz "Lag": Shorter, more detached stabs for a "cooler" feel
                        if (feel === 'Neo-Soul' || feel === 'Jazz') {
                            durationSteps *= 0.7;
                        }
                        if (isGhost) {
                            durationSteps = 0.5;
                        }
                    }
                }
            }

            // Call and Response
            if (
                !shouldPlay &&
                soloist.enabled &&
                soloist.isResting &&
                soloist.notesInPhrase > 0 &&
                !accompanimentHit
            ) {
                if (Math.random() < 0.3 * harmony.complexity) {
                    shouldPlay = true;
                    durationSteps = 1.5;
                }
            }
        }
    }

    if (!shouldPlay) {
        return [];
    }

    // 5. Generate Notes
    const rootMidi = chord.rootMidi;
    let finalIntervals = [...intervals];

    let polyphony = Math.floor(1 + playback.bandIntensity * 3 * harmony.complexity);
    if (activeStyle === 'organ' || activeStyle === 'strings') {
        polyphony = Math.max(2, polyphony);
    }
    if (polyphony > finalIntervals.length) {
        polyphony = finalIntervals.length;
    }
    if (polyphony < 1) {
        polyphony = 1;
    }

    if (finalIntervals.length > polyphony) {
        const guides = getGuideTones(finalIntervals);
        const nonGuides = finalIntervals.filter((/** @type {number} */ i) => !guides.includes(i));
        const selected = [...guides];
        const needed = polyphony - selected.length;
        if (needed < 0) {
            finalIntervals = guides.slice(0, polyphony);
        } else {
            finalIntervals = [...guides, ...nonGuides.slice(0, needed)];
        }
    }

    // --- ENSEMBLE CLARITY: Proactive Slotting ---
    const soloistMidi = coordination.soloistMidi || 0;
    const _avgChordMidi = coordination.avgChordMidi || 60;

    // Increased minimums to avoid bass mud (MIDI 57 = A3, MIDI 53 = F3)
    // If space is NOT reserved, allow it to drop to 43 (G2) to fill the gap.
    let rangeMin = reserveBassSpace ? (activeStyle === 'organ' ? 57 : 53) : 43;
    if (reserveBassSpace) {
        rangeMin = Math.max(rangeMin, 52); // Never drop below E3 in practice mode
    }
    let rangeMax = 79;

    // Spectral Hole Filling: target the gap between chords and soloist
    if (soloistMidi > 75) {
        // Soloist is high, target lower-mid (52-65)
        rangeMax = Math.min(rangeMax, soloistMidi - 10);
    } else if (soloistMidi > 0 && soloistMidi < 65) {
        // Soloist is low, target upper-mid (70-84)
        rangeMin = Math.max(rangeMin, soloistMidi + 7);
        rangeMax = 84;
    }

    const currentMidis = getBestInversion(
        state,
        rootMidi,
        finalIntervals,
        harmony.lastMidis,
        stepInChord === 0,
        octave,
        rangeMin,
        rangeMax,
        activeStyle,
    );

    if (currentMidis.length > 0) {
        lastPlayedStep = step;
    }
    const polyphonyComp = 1 / Math.sqrt(currentMidis.length || 1);

    // --- Holistic Pocket Implementation ---
    const intensity = playback.bandIntensity;
    const basePocketOffset = calculateTimingOffset('chords', groove.pocket, intensity); // Harmonies share Chord gravity

    const styleOffset = /** @type {any} */ (config).octaveOffset || 0;
    const finalMidisForMemory = [];

    for (let i = 0; i < currentMidis.length; i++) {
        const midi = currentMidis[i];
        let finalMidi = midi + styleOffset;

        // Safety Filter: Hard cut below G3 (55) for most styles to prevent muddy collisions with bass
        // If in practice mode, ensure we stay above E3 (52) even for plucks/counter
        // If space is NOT reserved, allow it to drop to G2 (43) to fill the gap.
        const safetyFloor = reserveBassSpace
            ? 52
            : activeStyle !== 'counter' && activeStyle !== 'plucks'
              ? 43
              : 0;
        if (finalMidi < safetyFloor) {
            continue;
        }

        // Safety Filter: Hard cut above MIDI 100 (E7) to avoid piercing high frequencies
        if (finalMidi > 100) {
            finalMidi -= 12; // Shift down an octave if too high
        }

        let slideInterval = 0,
            slideDuration = 0,
            vibrato = { rate: 0, depth: 0 };

        // Neo-Soul Slide
        if (feel === 'Neo-Soul' && Math.random() < 0.3 && !isGhost) {
            slideInterval = Math.random() > 0.5 ? -1 : -2;
            slideDuration = 0.1;
        }

        // Disco Fall
        if (feel === 'Disco' && intensity > 0.7 && Math.random() < 0.4) {
            slideInterval = 2; // Start 2 semitones up
            slideDuration = 0.15;
        }

        if (activeStyle === 'strings' && durationSteps > 4) {
            vibrato = { rate: 5.0, depth: 10 * intensity };
        }

        let baseVol = /** @type {any} */ (config.velocity || 0.75) * (0.6 + intensity * 0.4);
        if (isGhost) {
            baseVol *= 0.4; // Ghost notes are much softer
        }

        const stagger = (i - (currentMidis.length - 1) / 2) * 0.005;
        let finalOffset =
            basePocketOffset +
            stagger +
            Math.random() * /** @type {any} */ (config.timingJitter || 0.008);

        // Neo-Soul "Dilla" Pocket (Late): Layered on top
        if (feel === 'Neo-Soul') {
            finalOffset += 0.015;
        }

        notes.push({
            midi: finalMidi,
            velocity: baseVol * polyphonyComp,
            durationSteps: Math.max(0.1, durationSteps),
            timingOffset: finalOffset,
            style: activeStyle,
            isLatched: isLatched,
            isChordStart: true,
            slideInterval,
            slideDuration,
            vibrato,
        });
        finalMidisForMemory.push(finalMidi);
    }

    harmony.lastMidis = finalMidisForMemory; // @worker-mutation
    return notes;
}
