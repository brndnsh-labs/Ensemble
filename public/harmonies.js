import { getBestInversion } from './chords.js';
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
    const { harmony, soloist } = getState();
    motifCache.clear();
    harmony.lastMidis = []; // @worker-mutation
    lastPlayedStep = -1;
    soloist.motifBuffer = []; // @worker-mutation
    soloist.isReplayingMotif = false; // @worker-mutation
}

/**
 * Extracts 3rds and 7ths (Guide Tones) from a set of intervals.
 * Critical for "supportive" harmony that defines quality without clutter.
 */
export function getGuideTones(intervals) {
    return intervals.filter((i) => {
        const iMod = i % 12;
        return iMod === 3 || iMod === 4 || iMod === 10 || iMod === 11;
    });
}

/**
 * Filters intervals to remove high extensions (9, 11, 13) to avoid clashing with soloist.
 */
export function getSafeVoicings(intervals) {
    return intervals.filter((i) => {
        const iMod = i % 12;
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
 * @returns {number[]} 32-step pattern (2 bars)
 */
export function generateCompingPattern(feel, seed) {
    const pattern = new Array(32).fill(0);
    const pseudoRandom = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };

    if (feel === 'Jazz') {
        // Bar 1: Charleston (0, 6)
        pattern[0] = 1;
        pattern[6] = 1;
        // Bar 2: Displaced Charleston or Anticipations
        if (pseudoRandom() < 0.5) {
            pattern[16] = 1;
            pattern[22] = 2; // Delayed "And"
        } else {
            pattern[14] = 3; // Anticipation into Bar 2
            pattern[30] = 3; // Anticipation into next Bar 1
        }
        // Random sparse fillers
        [4, 10, 20, 26].forEach((s) => {
            if (pseudoRandom() < 0.3) {
                pattern[s] = 2;
            }
        });
    } else if (feel === 'Bossa Nova') {
        // Authentic 2-Bar Bossa Pattern
        // Bar 1: 1, (and-of-2), 4
        pattern[0] = 1;
        pattern[6] = 1;
        pattern[12] = 2;
        // Bar 2: (and-of-1), 3, (and-of-4)
        pattern[18] = 1;
        pattern[24] = 2;
        pattern[30] = 1;
    } else if (feel === 'Funk') {
        // Percussive 16ths focus (Clavinet style)
        // Focus on "e" and "a" of the beat
        [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31].forEach((s) => {
            const r = pseudoRandom();
            if (r < 0.2) {
                pattern[s] = 1;
            } else if (r < 0.4) {
                pattern[s] = 2;
            }
        });
        pattern[0] = 1; // Always the "One"
        pattern[16] = 1;
    } else if (feel === 'Neo-Soul') {
        // "Dilla" feel / Ghost notes
        pattern[0] = 1;
        pattern[14] = 3; // Anticipation
        pattern[18] = 1; // Late hit in Bar 2
        // Ghost notes (val 4 as special marker for low-velocity)
        [3, 7, 11, 19, 23, 27].forEach((s) => {
            if (pseudoRandom() < 0.4) {
                pattern[s] = 4;
            }
        });
    } else if (feel === 'Disco') {
        // Off-beat stabs (And of every beat)
        [2, 6, 10, 14, 18, 22, 26, 30].forEach((s) => {
            pattern[s] = 2;
        });
    } else if (feel === 'Rock' || feel === 'Metal') {
        // Driving 8ths
        [0, 4, 8, 12, 16, 20, 24, 28].forEach((s) => {
            pattern[s] = 1;
        });
        [2, 6, 10, 14, 18, 22, 26, 30].forEach((s) => {
            pattern[s] = 3;
        });
    } else if (feel === 'Reggae') {
        // Skank: Off-beats (Beats 2 and 4)
        [4, 12, 20, 28].forEach((s) => {
            pattern[s] = 1;
        });
    } else if (feel === 'Ska') {
        // Off-beat stabs (And of 1, 2, 3, 4)
        [2, 6, 10, 14, 18, 22, 26, 30].forEach((s) => {
            pattern[s] = 1;
        });
        // Occasional punchy syncopation
        [3, 7, 11, 15, 19, 23, 27, 31].forEach((s) => {
            if (pseudoRandom() < 0.3) {
                pattern[s] = 2;
            }
        });
    } else {
        // Default / Pop
        pattern[0] = 1;
        pattern[8] = 1;
        pattern[16] = 2;
        pattern[24] = 2;
    }

    return pattern;
}

/**
 * Generates harmony notes for a given step.
 */
export function getHarmonyNotes(
    chord,
    _nextChord,
    step,
    octave,
    style,
    stepInChord,
    soloistResult = null,
    coordination = {},
) {
    if (!chord) {
        return [];
    }

    // Destructure state here to avoid ReferenceError during evaluation
    const { playback, groove, harmony, soloist, arranger } = getState();

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
    const soloistActive = coordination.soloistActive || false;
    const accompanimentHit = coordination.accompanimentHit || false;
    const accMidis = coordination.accompanimentMidis || [];

    const notes = [];
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
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

    const config = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.smart;
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
    if (isSoloistBusy || accompanimentHit) {
        intervals = getSafeVoicings(intervals);
        // Thin out if very busy
        if (soloist.notesInPhrase > 3 || accompanimentHit || harmony.complexity < 0.4) {
            const guides = getGuideTones(intervals);
            if (guides.length > 0) {
                intervals = [0, ...guides];
            } else {
                intervals = [0, 7];
            }
        }

        // If BOTH are hitting, drop root, play ONLY guides or extensions
        if (accompanimentHit && soloistActive && intervals.length > 2) {
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
        const pattern = generateCompingPattern(feel, seed);

        // Calculate a broad rhythmic mask for UI/Consistency based on "Base" hits only
        let rhythmicMask = 0;
        // Use first 16 steps for UI mask to maintain grid alignment
        for (let i = 0; i < 16; i++) {
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
        if (soloist.isReplayingMotif) {
            reinforce = true;
        }

        // -- Shared Hook Reinforcement --
        if (!reinforce && feel === 'Ska-Punk' && soloist.sharedHookBuffer) {
            // Check if the soloist is currently playing a known shared hook
            const hookMatch = soloist.sharedHookBuffer.find((h) => h.step === step);
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
            const patternStep = step % 32;
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
                        const isDownbeat = measureStep % 4 === 0;
                        const isAnticipation = measureStep === 14 || measureStep === 6;

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
        const nonGuides = finalIntervals.filter((i) => !guides.includes(i));
        const selected = [...guides];
        const needed = polyphony - selected.length;
        if (needed < 0) {
            finalIntervals = guides.slice(0, polyphony);
        } else {
            finalIntervals = [...guides, ...nonGuides.slice(0, needed)];
        }
    }

    // Increased minimums to avoid bass mud (MIDI 57 = A3, MIDI 53 = F3)
    const rangeMin = activeStyle === 'organ' ? 57 : 53;
    const currentMidis = getBestInversion(
        rootMidi,
        finalIntervals,
        harmony.lastMidis,
        stepInChord === 0,
        octave,
        rangeMin,
        79,
        activeStyle,
    );

    if (currentMidis.length > 0) {
        lastPlayedStep = step;
    }
    const polyphonyComp = 1 / Math.sqrt(currentMidis.length || 1);

    // --- Holistic Pocket Implementation ---
    const intensity = playback.bandIntensity;
    const basePocketOffset = calculateTimingOffset('chords', groove.pocket, intensity); // Harmonies share Chord gravity

    const styleOffset = config.octaveOffset || 0;
    const finalMidisForMemory = [];

    for (let i = 0; i < currentMidis.length; i++) {
        const midi = currentMidis[i];
        let finalMidi = midi + styleOffset;

        // Safety Filter: Hard cut below G3 (55) for most styles to prevent muddy collisions with bass
        if (finalMidi < 55 && activeStyle !== 'counter' && activeStyle !== 'plucks') {
            continue;
        }

        // Safety Filter: Hard cut above MIDI 100 (E7) to avoid piercing high frequencies
        if (finalMidi > 100) {
            finalMidi -= 12; // Shift down an octave if too high
        }

        // --- ENSEMBLE CLARITY: Slotting ---
        // 1. Avoid Accompaniment: If accompaniment is hitting, Harmony shifts UP
        if (accompanimentHit && accMidis.length > 0) {
            const avgAccMidi = accMidis.reduce((a, b) => a + b, 0) / accMidis.length;
            if (finalMidi < avgAccMidi + 7) {
                finalMidi += 12;
            }
        }

        // 2. Avoid Soloist: If soloist is active and high, Harmony shifts DOWN
        if (soloistActive && coordination.soloistMidi > 84) {
            if (finalMidi > 72) {
                finalMidi -= 12;
            }
        }

        if (finalMidi > 100) {
            continue; // Skip if still too high (rare)
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

        let baseVol = config.velocity * (0.6 + intensity * 0.4);
        if (isGhost) {
            baseVol *= 0.4; // Ghost notes are much softer
        }

        const stagger = (i - (currentMidis.length - 1) / 2) * 0.005;
        let finalOffset = basePocketOffset + stagger + Math.random() * config.timingJitter;

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
