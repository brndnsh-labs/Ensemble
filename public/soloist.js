import { TIME_SIGNATURES } from './config.js';
import { getState } from './state.js';
import { getScaleForChord } from './theory-scales.js';
import { calculateTimingOffset, getFrequency, getMidi } from './utils.js';

const CANDIDATE_WEIGHTS = new Float32Array(128);
const HIST_COUNTS = new Float32Array(128);
const PC_COUNTS = new Float32Array(12);

const RHYTHMIC_CELLS = [
    [1, 1, 1, 1], // 0: 16ths
    [1, 0, 1, 0], // 1: 8ths
    [1, 0, 0, 0], // 2: Quarter
    [1, 1, 1, 0], // 3: Gallop
    [1, 0, 1, 1], // 4: Reverse gallop
    [0, 1, 1, 1], // 5: Offbeat start
    [1, 0, 0, 1], // 6: Syncopated
    [1, 1, 0, 1], // 7: Bebop-esque 1
    [0, 1, 1, 0], // 8: Offbeat syncopation
    [1, 0, 1, 1], // 9: Syncopated 2
    [0, 1, 0, 1], // 10: Pure offbeats (16th offbeats)
    [1, 0, 0, 0, 0, 0, 0, 0], // 11: Half note (if 8 steps used)
    [0, 0, 1, 0], // 12: Single Offbeat 8th (the "And")
    [1, 0, 1, 0, 1, 0], // 13: Triplet-esque (Feel)
    [0, 1, 0, 0], // 14: Single Syncopated 16th (the "e")
    [1, 0, 0, 1, 0, 0, 1, 0], // 15: 3-3-2 Syncopation (Dotted 8ths)
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 16: 16th triplets (if 12 steps used)
];

const STYLE_CONFIG = {
    scalar: {
        restBase: 0.25,
        restGrowth: 0.07,
        cells: [2, 11, 1, 6],
        registerSoar: 10,
        tensionScale: 0.6,
        timingJitter: 8,
        maxNotesPerPhrase: 16,
        minNotesPerPhrase: 2,
        doubleStopProb: 0.1,
        anticipationProb: 0.1,
        targetExtensions: [2, 9],
        deviceProb: 0.12,
        allowedDevices: ['run', 'slide', 'guitarDouble'],
        motifProb: 0.3,
        hookProb: 0.1,
    },
    shred: {
        restBase: 0.1,
        restGrowth: 0.02,
        cells: [1, 3, 4, 7, 0],
        registerSoar: 16,
        tensionScale: 0.3,
        timingJitter: 4,
        maxNotesPerPhrase: 32,
        minNotesPerPhrase: 8,
        doubleStopProb: 0.05,
        anticipationProb: 0.05,
        targetExtensions: [2],
        deviceProb: 0.4,
        allowedDevices: ['run', 'guitarDouble'],
        motifProb: 0.1,
        hookProb: 0.05,
    },
    blues: {
        restBase: 0.6,
        restGrowth: 0.15,
        cells: [2, 11, 0, 12, 6],
        registerSoar: 4,
        tensionScale: 0.8,
        timingJitter: 25,
        maxNotesPerPhrase: 5,
        minNotesPerPhrase: 2,
        doubleStopProb: 0.35,
        anticipationProb: 0.3,
        targetExtensions: [9, 10],
        deviceProb: 0.4,
        allowedDevices: ['bluesLick', 'slide', 'guitarDouble'],
        motifProb: 0.5,
        hookProb: 0.3,
    },
    neo: {
        restBase: 0.35,
        restGrowth: 0.08,
        cells: [11, 2, 6, 10, 12, 14],
        registerSoar: 6,
        tensionScale: 0.7,
        timingJitter: 25,
        maxNotesPerPhrase: 12,
        minNotesPerPhrase: 2,
        doubleStopProb: 0.15,
        anticipationProb: 0.45,
        targetExtensions: [2, 6, 9, 11],
        deviceProb: 0.25,
        allowedDevices: ['quartal', 'slide', 'guitarDouble'],
        motifProb: 0.4,
        hookProb: 0.2,
    },
    funk: {
        restBase: 0.35,
        restGrowth: 0.08,
        cells: [1, 10, 14, 0, 6],
        registerSoar: 5,
        tensionScale: 0.4,
        timingJitter: 5,
        maxNotesPerPhrase: 16,
        minNotesPerPhrase: 3,
        doubleStopProb: 0.15,
        anticipationProb: 0.2,
        targetExtensions: [9, 13],
        deviceProb: 0.2,
        allowedDevices: ['slide', 'run'],
        motifProb: 0.3,
        hookProb: 0.15,
    },
    hiphop: {
        restBase: 0.45,
        restGrowth: 0.08,
        cells: [1, 6, 10, 12, 14],
        registerSoar: 4,
        tensionScale: 0.6,
        timingJitter: 20,
        maxNotesPerPhrase: 8,
        minNotesPerPhrase: 2,
        doubleStopProb: 0.1,
        anticipationProb: 0.3,
        targetExtensions: [2, 9, 11],
        deviceProb: 0.3,
        allowedDevices: ['bluesLick', 'slide', 'quartal'],
        motifProb: 0.4,
        hookProb: 0.2,
    },
    minimal: {
        restBase: 0.75,
        restGrowth: 0.15,
        cells: [11, 2, 12, 14],
        registerSoar: 6,
        tensionScale: 0.95,
        timingJitter: 35,
        maxNotesPerPhrase: 3,
        minNotesPerPhrase: 1,
        doubleStopProb: 0.0,
        anticipationProb: 0.25,
        targetExtensions: [2, 9, 11],
        deviceProb: 0.15,
        allowedDevices: ['slide', 'enclosure'],
        motifProb: 0.7,
        hookProb: 0.5,
    },
    bird: {
        restBase: 0.05, // Highly dense to match transcription
        restGrowth: 0.01,
        cells: [1, 7, 8, 0, 5, 6, 15], // 16ths, Syncopated 8ths, bebop cells, ties
        registerSoar: 8,
        tensionScale: 0.9,
        timingJitter: 12,
        maxNotesPerPhrase: 48,
        minNotesPerPhrase: 4,
        doubleStopProb: 0.15,
        anticipationProb: 0.8, // Play over the changes heavily
        targetExtensions: [2, 5, 6, 9],
        deviceProb: 0.4,
        allowedDevices: ['enclosure', 'run', 'birdFlurry', 'guitarDouble', 'chromaticFall'],
        motifProb: 0.2,
        hookProb: 0.1,
    },
    disco: {
        restBase: 0.25,
        restGrowth: 0.06,
        cells: [0, 2, 5, 10],
        registerSoar: 8,
        tensionScale: 0.5,
        timingJitter: 8,
        maxNotesPerPhrase: 12,
        minNotesPerPhrase: 3,
        doubleStopProb: 0.05,
        anticipationProb: 0.2,
        targetExtensions: [2, 9],
        deviceProb: 0.1,
        allowedDevices: ['run'],
        motifProb: 0.4,
        hookProb: 0.2,
    },
    bossa: {
        restBase: 0.35,
        restGrowth: 0.08,
        cells: [11, 2, 0, 6, 8],
        registerSoar: 4,
        tensionScale: 0.7,
        timingJitter: 15,
        maxNotesPerPhrase: 12,
        minNotesPerPhrase: 2,
        doubleStopProb: 0.08,
        anticipationProb: 0.35,
        targetExtensions: [2, 6, 9],
        deviceProb: 0.2,
        allowedDevices: ['enclosure', 'slide', 'guitarDouble'],
        motifProb: 0.5,
        hookProb: 0.25,
    },
    country: {
        restBase: 0.12,
        restGrowth: 0.08,
        cells: [1, 3, 4, 12, 14, 6],
        registerSoar: 6,
        tensionScale: 0.5,
        timingJitter: 4,
        maxNotesPerPhrase: 16,
        minNotesPerPhrase: 3,
        doubleStopProb: 0.5,
        anticipationProb: 0.2,
        targetExtensions: [2, 4, 9],
        deviceProb: 0.45,
        allowedDevices: [
            'guitarDouble',
            'slide',
            'countryBend',
            'chickenPick',
            'banjoRoll',
            'graceSlide',
        ],
        motifProb: 0.4,
        hookProb: 0.2,
    },
    metal: {
        restBase: 0.1,
        restGrowth: 0.05,
        cells: [1, 3, 0],
        registerSoar: 14,
        tensionScale: 0.4,
        timingJitter: 2,
        maxNotesPerPhrase: 32,
        minNotesPerPhrase: 6,
        doubleStopProb: 0.05,
        anticipationProb: 0.05,
        targetExtensions: [2, 7],
        deviceProb: 0.5,
        allowedDevices: ['run'],
        motifProb: 0.1,
        hookProb: 0.05,
    },
    reggae: {
        restBase: 0.35,
        restGrowth: 0.1,
        cells: [2, 6, 12, 14],
        registerSoar: 3,
        tensionScale: 0.6,
        timingJitter: 20,
        maxNotesPerPhrase: 10,
        minNotesPerPhrase: 2,
        doubleStopProb: 0.2,
        anticipationProb: 0.1,
        targetExtensions: [2, 6, 9],
        deviceProb: 0.15,
        allowedDevices: ['guitarDouble'],
        motifProb: 0.6,
        hookProb: 0.4,
    },
    acoustic: {
        restBase: 0.5,
        restGrowth: 0.12,
        cells: [2, 11, 1, 13],
        registerSoar: 4,
        tensionScale: 0.4,
        timingJitter: 15,
        maxNotesPerPhrase: 8,
        minNotesPerPhrase: 2,
        doubleStopProb: 0.1,
        anticipationProb: 0.15,
        targetExtensions: [2, 9],
        deviceProb: 0.1,
        allowedDevices: ['slide', 'run'],
        motifProb: 0.5,
        hookProb: 0.3,
    },
    ska: {
        restBase: 0.2,
        restGrowth: 0.05,
        cells: [15, 6, 8, 10, 1], // Syncopated 8ths, ties, straight 8ths/16ths
        registerSoar: 10,
        tensionScale: 0.5,
        timingJitter: 5,
        maxNotesPerPhrase: 24,
        minNotesPerPhrase: 4,
        doubleStopProb: 0.2,
        anticipationProb: 0.3, // Higher anticipation for the "push" feel
        targetExtensions: [2, 4, 9], // Major / Lydian / Mixolydian feel
        deviceProb: 0.35,
        allowedDevices: ['run', 'slide', 'guitarDouble', 'enclosure', 'chromaticFall'],
        motifProb: 0.4,
        hookProb: 0.2,
    },
};

const GENRE_STYLE_MAPPING = {
    Rock: 'scalar',
    Jazz: 'bird',
    Funk: 'funk',
    Blues: 'blues',
    'Neo-Soul': 'neo',
    'Hip Hop': 'hiphop',
    Disco: 'disco',
    Bossa: 'bossa',
    'Bossa Nova': 'bossa',
    Afrobeat: 'funk',
    Acoustic: 'acoustic',
    Reggae: 'reggae',
    Country: 'country',
    'Ska-Punk': 'ska',
    Ska: 'ska',
};

// Optimization: Pre-calculate rhythmic cell pools for each style
for (const key in STYLE_CONFIG) {
    const conf = STYLE_CONFIG[key];
    conf.cellPool = RHYTHMIC_CELLS.filter((_, idx) => conf.cells.includes(idx));
}

/**
 * Checks for a lead sheet melody note at the given step.
 * @param {Array} melody - The leadSheetMelody array.
 * @param {number} step - The global step to check.
 * @returns {Object|null} The note if found, otherwise null.
 */
export function getMelodyAtStep(melody, step) {
    if (!melody || melody.length === 0) {
        return null;
    }
    // Simple linear find for now, can be optimized if needed
    return melody.find((n) => n.globalStep === step);
}

/**
 * Generates a soloist note (or notes for double stops) for a specific step.
 * Implements phrasing logic, rhythmic cell selection, melodic contour resolution,
 * and probabilistic melodic devices (runs, enclosures, flurry).
 *
 * @param {Object} currentChord - The chord active at the current step.
 * @param {Object} nextChord - The upcoming chord for anticipation logic.
 * @param {number} step - The global step counter.
 * @param {number|null} prevFreq - The frequency of the previously generated note.
 * @param {number} octave - The base MIDI octave for the soloist.
 * @param {string} style - The soloing style ID.
 * @param {number} stepInChord - The relative step index within the current chord.
 * @param {boolean} [isPriming=false] - Whether the engine is in a context-building priming phase.
 * @returns {Object|Object[]|null} A note object, an array of note objects (for double stops), or null if resting.
 */
export function getSoloistNote(
    currentChord,
    nextChord,
    step,
    prevFreq,
    _octave,
    style,
    stepInChord,
    isPriming,
    coordination = {},
) {
    const { playback, groove, soloist, arranger } = getState();
    if (!currentChord) {
        return null;
    }

    let activeStyle = style;
    if (activeStyle === 'smart') {
        activeStyle = GENRE_STYLE_MAPPING[groove.genreFeel] || 'scalar';
    }

    const intensity = playback.bandIntensity || 0.5;

    /**
     * Internal helper to finalize a note, updating history and session tracking.
     */
    const finalizeNote = (res) => {
        if (!res) {
            return null;
        }
        const primary = Array.isArray(res) ? res[0] : res;

        // --- Holistic Pocket Implementation ---
        const timingOffset = calculateTimingOffset(
            'soloist',
            groove.pocket,
            playback.bandIntensity || 0.5,
        );
        primary.timingOffset = (primary.timingOffset || 0) + timingOffset;

        // Update Global Pitch History
        if (soloist.pitchHistory) {
            soloist.pitchHistory.push(primary.midi);
            if (soloist.pitchHistory.length > 128) {
                soloist.pitchHistory.shift();
            }
        }

        // Update session tracking for continuity
        if (!primary.isDoubleStop) {
            soloist.lastFreq = getFrequency(primary.midi); // @worker-mutation
        }
        soloist.notesInPhrase++; // @worker-mutation

        // --- Blues Micro-Bend Inflections ---
        if (activeStyle === 'blues' && !soloist.isReplayingMotif) {
            const pc = primary.midi % 12;
            const rootPC = currentChord.rootMidi % 12;
            const relativeInterval = (pc - rootPC + 12) % 12;

            // Blue Notes: b3 (3) and b5 (6)
            if (
                (relativeInterval === 3 || relativeInterval === 6) &&
                primary.bendStartInterval === 0
            ) {
                // Procedural "curl" or "scoop"
                // Quarter-tone approximation using small bendStartInterval (-0.5 or +0.5)
                primary.bendStartInterval = Math.random() < 0.6 ? -0.5 : 0.5;
            }
        }

        // -- Shared Hook Logic --
        // If in Ska-Punk mode and replaying a motif, sync to shared buffer for band reinforcement
        if (groove.genreFeel === 'Ska-Punk' && soloist.isReplayingMotif) {
            if (!soloist.sharedHookBuffer) {
                soloist.sharedHookBuffer = []; // @worker-mutation
            }
            // Use a sliding window of the last few notes for reinforcement
            soloist.sharedHookBuffer.push({ step, res });
            if (soloist.sharedHookBuffer.length > 16) {
                soloist.sharedHookBuffer.shift();
            }
        }

        return res;
    };

    // --- Coordination Logic ---
    const bassHit = coordination.bassHit || false;

    let targetChord = currentChord;
    const config = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.scalar;
    const tsConfig = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;
    const measureStep = step % stepsPerMeasure;
    const stepInBeat = measureStep % stepsPerBeat;

    // --- Dynamic Register Control & Soar Lift ---
    // registerSoar adds extra melodic "lift" at high intensity to prevent sticking.
    const isDeparture = soloist.srdcState === 'Departure';
    const isConclusion = soloist.srdcState === 'Conclusion';
    const isBird = activeStyle === 'bird';

    // Soften SRDC for Jazz/Bird to keep it fluid
    const srdcIntensity = isBird ? 0.5 : 1.0;

    const srdcRegisterOffset = (isDeparture ? 6 : isConclusion ? -4 : 0) * srdcIntensity;
    const soarValue = (config.registerSoar || 8) * (isDeparture ? 1.0 + 0.25 * srdcIntensity : 1.0);
    const soarOffset = intensity > 0.5 || isDeparture ? (intensity - 0.4) * soarValue : 0;

    // Absolute melodic ceiling to prevent piercing whistle tones
    const ABSOLUTE_MAX_MIDI = 96; // C7 (Top of Soprano range)

    let centerMidi = 60 + intensity * 15 + soarOffset + srdcRegisterOffset;
    centerMidi = Math.min(ABSOLUTE_MAX_MIDI - 12, centerMidi);

    const MIN_GUITAR_MIDI = 55; // G3
    const MAX_GUITAR_MIDI = Math.min(
        ABSOLUTE_MAX_MIDI,
        65 + intensity * 25 + (isDeparture ? 8 * srdcIntensity : 0),
    );

    // --- Range & Continuity Logic ---
    // Moved to top to support Seed/Motif replay clamping consistently
    const dynamicCenter = centerMidi;
    const lastMidi = prevFreq && !soloist.isResting ? getMidi(prevFreq) : Math.round(dynamicCenter);

    // Reggae and Minimal should be more constrained in range
    const rangeLimit = activeStyle === 'reggae' || activeStyle === 'minimal' ? 12 : 14;
    const minMidi = Math.max(MIN_GUITAR_MIDI, Math.min(dynamicCenter - 12, lastMidi - rangeLimit));
    const maxMidi = Math.min(MAX_GUITAR_MIDI, Math.max(dynamicCenter + 12, lastMidi + rangeLimit));

    if (!isPriming) {
        soloist.sessionSteps = (soloist.sessionSteps || 0) + 1; // @worker-mutation
    }

    let maturityFactor = 0;

    // --- Song Arc Logic ---
    // If a session timer is active, use the song progress to drive maturity/intensity
    if (playback.sessionTimer > 0 && playback.sessionStartTime > 0) {
        const elapsedMins = (performance.now() - playback.sessionStartTime) / 60000;
        const progress = Math.min(1.0, elapsedMins / playback.sessionTimer);

        // Arc: Warmup -> Development -> Climax -> Cooldown
        if (progress < 0.15) {
            maturityFactor = (progress / 0.15) * 0.2; // 0.0 -> 0.2
        } else if (progress < 0.65) {
            maturityFactor = 0.2 + ((progress - 0.15) / 0.5) * 0.6; // 0.2 -> 0.8
        } else if (progress < 0.85) {
            maturityFactor = 0.8 + ((progress - 0.65) / 0.2) * 0.2; // 0.8 -> 1.0
        } else {
            maturityFactor = 1.0 - ((progress - 0.85) / 0.15) * 0.8; // 1.0 -> 0.2 (Cooldown)
        }
    } else {
        // Fallback: Linear ramp based on steps (but slower/capped)
        maturityFactor = Math.min(1.0, (soloist.sessionSteps || 0) / 2048);
    }

    // Warmup Factor: We want a sparse start for the first loop, building up
    // and maxing out around the start of the 3rd loop (loopCount >= 2).
    // We blend loopCount and step progress to make it smooth.
    let loopProgress = 0;
    if (arranger && arranger.totalSteps > 0) {
        // Calculate progress through the current loop (0.0 to 1.0)
        loopProgress = (step % arranger.totalSteps) / arranger.totalSteps;
    }
    const smoothLoopCount = (playback.currentLoopCount || 0) + loopProgress;
    const isHeadLoop = (playback.currentLoopCount || 0) === 0;
    const headFactor = Math.max(0, 1.0 - smoothLoopCount); // 1.0 at start, 0.0 by end of loop 1

    const evoEnabled = soloist.evolutionEnabled !== false;
    // Raise the floor of warmupFactor so the soloist isn't quite as sparse initially
    let warmupFactor = isPriming ? 1.0 : Math.min(1.0, 0.4 + (smoothLoopCount / 2.0) * 0.6); // Hits 1.0 right at the start of loop 3 (index 2)
    if (activeStyle === 'bird') {
        warmupFactor = 1.0;
    }
    const effectiveIntensity =
        activeStyle === 'bird'
            ? 1.0
            : Math.min(
                  1.0,
                  intensity +
                      maturityFactor * 0.05 +
                      smoothLoopCount * 0.01 +
                      (playback.intent.soloistMod || 0),
              );
    const lyricalBias =
        activeStyle === 'bird'
            ? 0.6 * headFactor // Jazz starts VERY lyrical (the "Head") and transitions to shred (0.0)
            : playback.lyricalBias !== undefined
              ? Math.min(1.0, playback.lyricalBias + 0.3 * headFactor)
              : 0.5 + 0.3 * headFactor;
    const complexity =
        activeStyle === 'bird'
            ? 1.0
            : soloist.complexity !== undefined
              ? soloist.complexity
              : playback.complexity;

    if (!soloist.isResting) {
        soloist.currentPhraseSteps = (soloist.currentPhraseSteps || 0) + 1; // @worker-mutation
    }

    // --- 0. Lead Sheet Melody ---
    if (activeStyle === 'lead_sheet') {
        if (soloist.leadSheetMelody && soloist.leadSheetMelody.length > 0) {
            const totalFormSteps = arranger.totalSteps > 0 ? arranger.totalSteps : 999999;
            const stepInForm = step % totalFormSteps;
            const note = soloist.leadSheetMelody.find((n) => n.globalStep === stepInForm);

            if (note) {
                const res = {
                    midi: note.midi,
                    durationSteps: note.durationSteps,
                    velocity: 0.8,
                    style: activeStyle,
                };

                // Motif Seeding: "Teach" the generative engine these themes
                if (!soloist.motifBuffer) {
                    soloist.motifBuffer = []; // @worker-mutation
                }
                const motifEntry = {
                    pc: res.midi % 12,
                    step: step % 16,
                    dur: res.durationSteps,
                };
                soloist.motifBuffer.push(motifEntry); // @worker-mutation
                if (soloist.motifBuffer.length > 16) {
                    soloist.motifBuffer.shift(); // @worker-mutation
                }

                soloist.busySteps = Math.max(0, (res.durationSteps || 1) - 1); // @worker-mutation
                return finalizeNote(res);
            }

            // FALL-THROUGH: If no written note, continue to procedural logic
            // But we must respect the busySteps from the previous written note
            if (soloist.busySteps > 0) {
                soloist.busySteps--; // @worker-mutation
                return null;
            }
        }
    }

    // --- 1. Busy/Device Handling ---
    if (soloist.embellishmentBuffer && soloist.embellishmentBuffer.length > 0) {
        const embNote = soloist.embellishmentBuffer.shift();
        const primaryNote = Array.isArray(embNote) ? embNote[0] : embNote;
        soloist.busySteps = (primaryNote.durationSteps || 1) - 1; // @worker-mutation
        return finalizeNote(embNote);
    }
    if (soloist.deviceBuffer && soloist.deviceBuffer.length > 0) {
        const devNote = soloist.deviceBuffer.shift();
        const primaryNote = Array.isArray(devNote) ? devNote[0] : devNote;
        soloist.busySteps = (primaryNote.durationSteps || 1) - 1; // @worker-mutation
        return finalizeNote(devNote);
    }
    if (soloist.busySteps > 0) {
        soloist.busySteps--;
        return null;
    }

    // --- Natural Exit Logic ---
    // If we are yielding (pending stop), and we are currently resting,
    // it means we finished our last phrase. Stop completely.
    if (soloist.isYielding && soloist.isResting) {
        // SAFETY: If we have been yielding for more than 4 measures, and we are in a long section,
        // force a re-entry attempt to prevent permanent silence bugs.
        const yieldProgress = soloist.currentPhraseSteps / stepsPerMeasure;
        if (yieldProgress > 4.0 && Math.random() < 0.1) {
            soloist.isYielding = false; // @worker-mutation
            soloist.isResting = true; // Still resting, but allowed to start now
        } else {
            return null;
        }
    }

    // --- 2. Phrasing & History Analysis ---
    if (typeof soloist.currentPhraseSteps === 'undefined' || (step === 0 && !soloist.isResting)) {
        soloist.currentPhraseSteps = 0;
        soloist.notesInPhrase = 0;
        soloist.qaState = 'Question';
        soloist.srdcState = 'Conclusion';
        soloist.isResting = true;
        soloist.currentCell = null; // @worker-mutation
        if (!soloist.pitchHistory) {
            soloist.pitchHistory = []; // @worker-mutation
        }
        return null;
    }

    HIST_COUNTS.fill(0);
    PC_COUNTS.fill(0);
    const historyCounts = HIST_COUNTS;
    const pcCounts = PC_COUNTS;
    const history = soloist.pitchHistory || [];
    const fullLen = history.length;
    const windowSize = 32; // Use a fixed window for repetition statistics
    const historyLen = Math.min(fullLen, windowSize);
    if (historyLen > 0) {
        for (let i = fullLen - historyLen; i < fullLen; i++) {
            const p = history[i];
            if (p >= 0 && p < 128) {
                historyCounts[p]++;
            }
            pcCounts[((p % 12) + 12) % 12]++;
        }
    }

    const phraseBars = soloist.currentPhraseSteps / stepsPerMeasure;

    const effectiveLyricalBias = activeStyle === 'bird' ? lyricalBias * 0.25 : lyricalBias;
    const effectiveMaxNotes = Math.max(
        2,
        Math.round(config.maxNotesPerPhrase * (1.5 - effectiveLyricalBias)),
    );

    // Intensity Linearization: Lower the floor of restBase as intensity increases
    // Scales more aggressively. At intensity 1.0, restBase is multiplied by 0.5. At 0.0, by 2.0.
    const intensityDamping = 2.0 - effectiveIntensity * 1.5;
    let restProb = config.restBase * intensityDamping + phraseBars * config.restGrowth;

    // Apply lyrical bias: Higher bias = more rests, shorter phrases
    restProb += effectiveLyricalBias * 0.2;

    // Session Maturity: Reduce rest probability over time to simulate a warming up soloist
    restProb -= maturityFactor * 0.15 + smoothLoopCount * 0.02;

    // High BPM Damping (Anti-Shred Safety)
    if (playback.bpm > 150) {
        restProb += 0.15;
        if (playback.bpm > 185) {
            restProb += activeStyle === 'bird' ? 0.25 : 0.15;
        }
    }

    restProb =
        activeStyle === 'bird'
            ? Math.max(0.02, restProb)
            : Math.max(0.05, restProb - maturityFactor * 0.15);

    // SAFETY: Ensure minimum notes per phrase are played before resting
    const minNotes = config.minNotesPerPhrase || 2;
    if (soloist.notesInPhrase < minNotes) {
        restProb = 0;
    }

    if (soloist.notesInPhrase >= effectiveMaxNotes) {
        restProb += activeStyle === 'bird' ? 0.1 : 0.4;
    }

    // -- Antiphonal Phrasing (Ska-Punk Call & Response) --
    // Removed: Soloist should be its own thing in Ska-Punk, not suppressed by the horn section.
    const isSuppressedByAntiphony = false;

    // High Intensity Re-entry Logic (Anti-Dead-Air)
    const restBars = soloist.currentPhraseSteps / stepsPerMeasure;
    const isHighEnergyStyle =
        activeStyle === 'bird' || activeStyle === 'shred' || activeStyle === 'ska';

    if (soloist.isResting) {
        if (isSuppressedByAntiphony) {
            return null;
        }

        // --- Musical Entry Improvement ---
        if (soloist.isWaitingForEntry) {
            if (measureStep === 0) {
                soloist.isWaitingForEntry = false; // @worker-mutation
            } else {
                return null;
            }
        }

        // --- Assertive Re-entry ---
        // If we are a high energy style and we've rested for more than 1/2 measure,
        // allow re-entry on any 8th note division if intensity is high.
        const is8thNote = measureStep % (stepsPerBeat / 2) === 0;
        const isAssertiveReentry =
            isHighEnergyStyle && intensity > 0.7 && restBars > 0.5 && is8thNote;

        const isDownbeat = measureStep === 0;
        const isPickupZone = measureStep >= stepsPerMeasure - stepsPerBeat; // Last beat of measure

        let startProb =
            (0.05 + effectiveIntensity * 0.1) * (0.5 + (evoEnabled ? warmupFactor : 1.0) * 0.5); // Scaled base prob

        if (activeStyle === 'bird' || isAssertiveReentry) {
            // BEBOP HEAD IMPROVEMENT: Parker (Ornithology) heavily favors pickups (66%)
            if (activeStyle === 'bird' && headFactor > 0.5 && isPickupZone) {
                startProb = 0.95;
            } else {
                startProb = 1.0;
            }
        } else if (isDownbeat) {
            startProb =
                (0.6 + effectiveIntensity * 0.3) * (0.4 + (evoEnabled ? warmupFactor : 1.0) * 0.6); // High chance to start on '1'
        } else if (isPickupZone) {
            startProb =
                (0.4 + effectiveIntensity * 0.4) * (0.3 + (evoEnabled ? warmupFactor : 1.0) * 0.7); // Good chance to play a pickup
        }

        // SAFETY: If we have been resting for more than 4 measures, force re-entry
        if (restBars > 4.0) {
            startProb = Math.max(startProb, 0.5 + (restBars - 4.0) * 0.2);
        }

        // Assertive entry: Force start on the '1' if we just enabled or traded in
        const isInitialEntry = measureStep === 0 && soloist.sessionSteps < stepsPerMeasure;

        if (isInitialEntry || Math.random() < startProb) {
            soloist.isResting = false;
            soloist.currentPhraseSteps = 0;
            soloist.notesInPhrase = 0; // @worker-mutation

            // --- SRDC State Machine ---
            const srdcOrder = ['Statement', 'Restatement', 'Departure', 'Conclusion'];
            const currentIndex = srdcOrder.indexOf(soloist.srdcState || 'Conclusion');
            soloist.srdcState = srdcOrder[(currentIndex + 1) % 4]; // @worker-mutation

            // Sync legacy QA state for compatibility (S/D = Question, R/C = Answer)
            soloist.qaState =
                soloist.srdcState === 'Statement' || soloist.srdcState === 'Departure'
                    ? 'Question'
                    : 'Answer'; // @worker-mutation

            // Clear shared hook buffer on phrase start to ensure reinforcement is fresh
            if (soloist.sharedHookBuffer) {
                soloist.sharedHookBuffer = []; // @worker-mutation
            }

            // Seed vs Motif Decision
            const currentRoot = currentChord.rootMidi % 12;
            const motifRoot = soloist.motifRoot !== undefined ? soloist.motifRoot : currentRoot;
            const isSignificantShift =
                Math.abs(currentRoot - motifRoot) > 0 &&
                Math.abs(currentRoot - motifRoot) !== 5 &&
                Math.abs(currentRoot - motifRoot) !== 7;
            const isStale =
                evoEnabled &&
                (soloist.motifReplayCount || 0) > 3 + Math.floor(effectiveIntensity * 4);
            const isOverwhelmed = evoEnabled && effectiveIntensity > 0.7 && Math.random() < 0.5;

            let distinctPitchesCount = 0;
            let pitchRange = 0;
            if (soloist.motifBuffer && soloist.motifBuffer.length > 0) {
                const pitches = soloist.motifBuffer.map((n) =>
                    Array.isArray(n) ? n[0].midi : n.midi,
                );
                const distinct = new Set(pitches);
                distinctPitchesCount = distinct.size;
                pitchRange = Math.max(...pitches) - Math.min(...pitches);
            }
            const isInteresting = distinctPitchesCount > 2 || pitchRange > 2;
            const isRestatement = soloist.srdcState === 'Restatement';
            const motifProb = isRestatement ? 0.95 : config.motifProb;

            // Higher chance to use the THEMATIC SEED during Restatement or later in the solo
            const useSeedProb =
                (isRestatement ? 0.6 : 0.2) +
                (soloist.sessionSteps > stepsPerMeasure * 16 ? 0.3 : 0);

            if (
                soloist.thematicSeed &&
                soloist.thematicSeed.length > 0 &&
                Math.random() < useSeedProb &&
                !isStale
            ) {
                soloist.isReplayingSeed = true; // @worker-mutation
                soloist.motifReplayCount = (soloist.motifReplayCount || 0) + 1; // @worker-mutation
                // Limit octave jumps at high BPMs to prevent erratic interval averages
                const allowOctaveJump = playback.bpm < 160 && Math.random() < 0.2;
                soloist.seedOctaveOffset = allowOctaveJump ? (Math.random() < 0.5 ? 12 : -12) : 0; // @worker-mutation
            } else if (
                soloist.motifBuffer &&
                soloist.motifBuffer.length > 0 &&
                isInteresting &&
                Math.random() < motifProb &&
                !isSignificantShift &&
                !isStale &&
                !isOverwhelmed
            ) {
                soloist.isReplayingMotif = true; // @worker-mutation
                soloist.motifReplayIndex = 0; // @worker-mutation
                soloist.motifReplayCount = (soloist.motifReplayCount || 0) + 1; // @worker-mutation
            } else {
                soloist.isReplayingMotif = false; // @worker-mutation
                soloist.isReplayingSeed = false; // @worker-mutation
                soloist.motifBuffer = []; // @worker-mutation
                soloist.motifRoot = currentRoot; // @worker-mutation
                soloist.motifReplayCount = 0; // @worker-mutation
            }
        } else {
            return null;
        }
    }
    let breakProb = restProb;
    if (activeStyle === 'bird') {
        breakProb = soloist.notesInPhrase >= effectiveMaxNotes ? 0.4 : 0.05;
    }

    if (!soloist.isResting && soloist.currentPhraseSteps > 4 && Math.random() < breakProb) {
        // --- Seed Capture ---
        // If we don't have a thematic seed yet, and we just finished a decent phrase
        // in the first 16 measures, capture it as the solo's "DNA".
        // Extended from 8 to 16 since early loops are more sparse now.
        if (
            (!soloist.thematicSeed || soloist.thematicSeed.length === 0) &&
            soloist.notesInPhrase >= 3 &&
            soloist.sessionSteps < stepsPerMeasure * 16
        ) {
            soloist.thematicSeed = [...soloist.motifBuffer]; // @worker-mutation
            soloist.thematicSeedRoot = soloist.motifRoot; // @worker-mutation
        }

        soloist.isResting = true;
        soloist.currentPhraseSteps = 0;
        soloist.currentCell = null; // @worker-mutation
        if (soloist.sharedHookBuffer) {
            soloist.sharedHookBuffer = []; // @worker-mutation
        }
        return null;
    }

    // --- 3. Seed Replay ---
    if (soloist.isReplayingSeed && soloist.thematicSeed && soloist.thematicSeed.length > 0) {
        const seedNote = soloist.thematicSeed.find((n) => {
            const primary = Array.isArray(n) ? n[0] : n;
            return primary && primary.phraseStep === soloist.currentPhraseSteps;
        });

        if (seedNote) {
            const currentRoot = currentChord.rootMidi % 12;
            const seedRoot =
                soloist.thematicSeedRoot !== undefined ? soloist.thematicSeedRoot : currentRoot;
            const shift = (currentRoot - seedRoot + 12) % 12;

            // Variation: Occasional octave jump for interest
            const octaveShift =
                (soloist.seedOctaveOffset || 0) + (shift > 6 ? -12 : shift < -6 ? 12 : 0);

            let res = seedNote;
            if (Array.isArray(seedNote)) {
                res = seedNote.map((n) => ({ ...n, midi: n.midi + shift + octaveShift }));
            } else {
                res = { ...seedNote, midi: seedNote.midi + shift + octaveShift };
            }

            // Clamp to Melodic Range
            if (Array.isArray(res)) {
                res = res.map((n) => ({
                    ...n,
                    midi: Math.max(minMidi, Math.min(maxMidi, n.midi)),
                }));
            } else {
                res.midi = Math.max(minMidi, Math.min(maxMidi, res.midi));
            }

            let primary = Array.isArray(res) ? res[0] : res;
            const scaleIntervals = getScaleForChord(currentChord, null, style);
            const relPC = (primary.midi - currentChord.rootMidi + 120) % 12;

            if (!scaleIntervals.includes(relPC)) {
                const nearest = scaleIntervals.reduce((prev, curr) =>
                    Math.abs(curr - relPC) < Math.abs(prev - relPC) ? curr : prev,
                );
                const nudge = nearest - relPC;
                if (Array.isArray(res)) {
                    res = res.map((n) => ({ ...n, midi: n.midi + nudge, bendStartInterval: 0 }));
                } else {
                    res.midi += nudge;
                    res.bendStartInterval = 0;
                }
                primary = Array.isArray(res) ? res[0] : res;
            }

            // Stale check on actual played note (transposed)
            if (historyLen > 12) {
                const count = historyCounts[primary.midi] || 0;
                const pcCount = pcCounts[primary.midi % 12] || 0;
                if (count / historyLen > 0.3 || pcCount / historyLen > 0.4) {
                    soloist.isReplayingSeed = false; // @worker-mutation
                    // Fall through to normal generation
                }
            }

            if (soloist.isReplayingSeed) {
                const lastSeedNote = soloist.thematicSeed[soloist.thematicSeed.length - 1];
                const lastPrimary = Array.isArray(lastSeedNote) ? lastSeedNote[0] : lastSeedNote;
                if (lastPrimary && soloist.currentPhraseSteps >= lastPrimary.phraseStep) {
                    soloist.isReplayingSeed = false; // @worker-mutation
                }

                soloist.busySteps = (primary.durationSteps || 1) - 1; // @worker-mutation
                return finalizeNote(res);
            }
        }

        if (soloist.isReplayingSeed && !seedNote) {
            const lastSeedNote = soloist.thematicSeed[soloist.thematicSeed.length - 1];
            const lastPrimary = Array.isArray(lastSeedNote) ? lastSeedNote[0] : lastSeedNote;
            if (lastPrimary && soloist.currentPhraseSteps >= lastPrimary.phraseStep) {
                soloist.isReplayingSeed = false; // @worker-mutation
            }
            return null;
        }
    }

    // --- 4. Motif Replay ---
    if (soloist.isReplayingMotif) {
        const motifNote = soloist.motifBuffer.find((n) => {
            const primary = Array.isArray(n) ? n[0] : n;
            return primary && primary.phraseStep === soloist.currentPhraseSteps;
        });

        if (motifNote) {
            const currentRoot = currentChord.rootMidi % 12;
            const motifRoot = soloist.motifRoot !== undefined ? soloist.motifRoot : currentRoot;
            const shift = (currentRoot - motifRoot + 12) % 12;
            const octaveShift = shift > 6 ? -12 : shift < -6 ? 12 : 0;

            let res = motifNote;
            if (Array.isArray(motifNote)) {
                res = motifNote.map((n) => ({ ...n, midi: n.midi + shift + octaveShift }));
            } else {
                res = { ...motifNote, midi: motifNote.midi + shift + octaveShift };
            }

            // Clamp to Melodic Range
            if (Array.isArray(res)) {
                res = res.map((n) => ({
                    ...n,
                    midi: Math.max(minMidi, Math.min(maxMidi, n.midi)),
                }));
            } else {
                res.midi = Math.max(minMidi, Math.min(maxMidi, res.midi));
            }

            let primary = Array.isArray(res) ? res[0] : res;
            const scaleIntervals = getScaleForChord(currentChord, null, style);
            const relPC = (primary.midi - currentChord.rootMidi + 120) % 12;

            if (!scaleIntervals.includes(relPC)) {
                const nearest = scaleIntervals.reduce((prev, curr) =>
                    Math.abs(curr - relPC) < Math.abs(prev - relPC) ? curr : prev,
                );
                const nudge = nearest - relPC;
                if (Array.isArray(res)) {
                    res = res.map((n) => ({ ...n, midi: n.midi + nudge, bendStartInterval: 0 }));
                } else {
                    res.midi += nudge;
                    res.bendStartInterval = 0;
                }
                primary = Array.isArray(res) ? res[0] : res;
            }

            // Stale check on actual played note (transposed)
            if (historyLen > 12) {
                const count = historyCounts[primary.midi] || 0;
                const pcCount = pcCounts[primary.midi % 12] || 0;
                if (count / historyLen > 0.3 || pcCount / historyLen > 0.4) {
                    soloist.isReplayingMotif = false; // @worker-mutation
                    soloist.motifBuffer = []; // @worker-mutation
                    // Abort immediately? Or fall through to normal generation?
                    // Fall through effectively cancels replay for this step and future steps
                }
            }

            if (soloist.isReplayingMotif) {
                const lastNote = soloist.motifBuffer[soloist.motifBuffer.length - 1];
                const lastPrimary = Array.isArray(lastNote) ? lastNote[0] : lastNote;
                if (lastPrimary && soloist.currentPhraseSteps >= lastPrimary.phraseStep) {
                    soloist.isReplayingMotif = false; // @worker-mutation
                }

                soloist.busySteps = (primary.durationSteps || 1) - 1; // @worker-mutation
                return finalizeNote(res);
            }
        }

        // If replaying but current step is a rest in the motif
        if (soloist.isReplayingMotif && !motifNote) {
            const lastNote = soloist.motifBuffer[soloist.motifBuffer.length - 1];
            const lastPrimary = Array.isArray(lastNote) ? lastNote[0] : lastNote;
            if (lastPrimary && soloist.currentPhraseSteps >= lastPrimary.phraseStep) {
                soloist.isReplayingMotif = false; // @worker-mutation
            }
            return null;
        }
    }

    // --- 5. Rhythmic Density ---

    if (
        stepInBeat === 0 ||
        !soloist.currentCell ||
        (activeStyle === 'bird' && stepInBeat % 2 === 0)
    ) {
        let pool = [...config.cellPool];

        // Lyrical/Syllable Seeding
        const currentSection = arranger.sectionMap
            ? arranger.sectionMap.find((s) => step >= s.start && step < s.end)
            : null;
        let syllableCount = 0;
        if (currentSection?.syllables) {
            const relativeStep = step - currentSection.start;
            const measureIndex = Math.floor(relativeStep / stepsPerMeasure);
            syllableCount = currentSection.syllables[measureIndex] || 0;
        }

        if (syllableCount > 0) {
            const syllablePool = pool.filter((c) => {
                let hits = 0;
                for (let j = 0; j < c.length; j++) {
                    hits += c[j];
                }
                return Math.abs(hits - syllableCount) <= 1; // Allow +/- 1 for variety
            });
            if (syllablePool.length > 0) {
                pool = syllablePool;
            }
        }

        // SRDC Density Filtering: Departure is busier, Conclusion is sparse
        if (soloist.srdcState === 'Departure') {
            const busyPool = pool.filter((c) => {
                let h = 0;
                for (let j = 0; j < c.length; j++) {
                    h += c[j];
                }
                return h >= 3;
            });
            if (busyPool.length > 0) {
                pool = busyPool;
            }
        } else if (soloist.srdcState === 'Conclusion') {
            const sparsePool = pool.filter((c) => {
                let h = 0;
                for (let j = 0; j < c.length; j++) {
                    h += c[j];
                }
                return h <= 2;
            });
            if (sparsePool.length > 0) {
                pool = sparsePool;
            }
        }

        // Lyrical Bias: Remove busy 16th-based patterns if lyrical
        if (lyricalBias > 0.6 && activeStyle !== 'bird') {
            pool = pool.filter((c) => {
                const idx = RHYTHMIC_CELLS.indexOf(c);
                // Indices for 16ths and gallops
                return ![0, 3, 4, 7, 10, 16].includes(idx);
            });
            if (pool.length === 0) {
                pool = [RHYTHMIC_CELLS[1], RHYTHMIC_CELLS[2]]; // Fallback to 8ths/quarters
            }
        }

        if (complexity > 0.7 && !config.cells.includes(1)) {
            pool.push(RHYTHMIC_CELLS[1]);
        }

        // Lyrical Head Mode: Remove busy cells (16ths, gallops) during the first loop
        if (headFactor > 0.5) {
            pool = pool.filter((c) => {
                const idx = RHYTHMIC_CELLS.indexOf(c);
                return ![0, 3, 10, 14, 15, 16].includes(idx); // Remove 16th-heavy and syncopated cells
            });
            if (pool.length === 0) {
                pool = [RHYTHMIC_CELLS[1], RHYTHMIC_CELLS[2]]; // Fallback to 8ths/quarters
            }
        }

        // Intensity/Maturity Expansion: Inject busy cells at high climax
        if ((effectiveIntensity > 0.8 || maturityFactor > 0.9) && headFactor < 0.2) {
            // Add 16ths (0), Gallops (3), and 16th Offbeats (10)
            if (!pool.includes(RHYTHMIC_CELLS[0])) {
                pool.push(RHYTHMIC_CELLS[0]);
            }
            if (!pool.includes(RHYTHMIC_CELLS[3])) {
                pool.push(RHYTHMIC_CELLS[3]);
            }
            if (!pool.includes(RHYTHMIC_CELLS[10])) {
                pool.push(RHYTHMIC_CELLS[10]);
            }
        }

        // Intensity-based filtering
        if (intensity < 0.4 && activeStyle !== 'bird') {
            pool = pool.filter((c) => c[1] === 0 && c[3] === 0);
        }

        // Very low intensity: Restrict to quarter notes (no 8th notes) for non-busy styles
        if (intensity < 0.25 && activeStyle !== 'bird') {
            pool = pool.filter((c) => c[2] === 0);
        }

        // High BPM Filtering: Reduce busy 16th patterns
        if ((activeStyle === 'bird' || activeStyle === 'ska') && playback.bpm > 160) {
            // Remove 0 (16ths), 3 (Gallop), 10 (16th Off), 14, 15, 16
            // Keep 1 (8ths), 2 (Quarters), 6 (Sync 8ths), 8 (Offbeat 8ths), 7 (Bebop)
            pool = pool.filter((c) => ![0, 3, 10, 14, 15, 16].includes(RHYTHMIC_CELLS.indexOf(c)));

            // Ensure we have something left
            if (pool.length === 0) {
                pool = [RHYTHMIC_CELLS[1]]; // Fallback to 8ths
            }

            // Add quarters for breathing room if really fast
            if (playback.bpm > 200 && activeStyle !== 'bird') {
                pool.push(RHYTHMIC_CELLS[2]);
            }
        }

        // Start Step Logic: When picking a new phrase cell, ensure it actually triggers on the start step
        if (soloist.currentPhraseSteps === 0 || stepInBeat > 0) {
            const playable = pool.filter((c) => c[stepInBeat] === 1);
            if (playable.length > 0) {
                pool = playable;
            }
        }

        soloist.currentCell = pool[Math.floor(Math.random() * pool.length)]; // @worker-mutation
    }
    if (soloist.currentCell && soloist.currentCell[stepInBeat] === 1) {
        /* hit */
    } else {
        // --- Embellishment: Approach Note Filling ---
        // Fill rests during a phrase with melodic motion at high intensity
        const fillerProb = evoEnabled ? Math.max(0, (effectiveIntensity - 0.75) * 2.0) : 0;
        // Bird style is hyper-active by default, but reduce filler during the Head loop for melody clarity
        const activeFillerProb =
            activeStyle === 'bird' ? 0.8 - headFactor * 0.6 : fillerProb;

        if (!soloist.isResting && Math.random() < activeFillerProb) {
            const scaleIntervals = getScaleForChord(targetChord, null, style);
            const neighborDir = Math.random() > 0.5 ? 1 : -1;
            let neighborMidi = lastMidi;
            let neighborPC = (neighborMidi + neighborDir + 120) % 12;
            let tries = 0;
            while (!scaleIntervals.includes(neighborPC) && tries < 3) {
                neighborMidi += neighborDir;
                neighborPC = (neighborMidi + 120) % 12;
                tries++;
            }
            const fillerNote = {
                midi: neighborMidi,
                durationSteps: 1,
                velocity: 0.7 * (0.5 + effectiveIntensity * 0.5),
                style: activeStyle,
                isLegato: true,
            };
            return finalizeNote(fillerNote);
        }
        return null;
    }

    // --- 6. Pitch Selection ---
    CANDIDATE_WEIGHTS.fill(0);
    const isLateInChord = stepInChord >= currentChord.beats * stepsPerBeat - 2;
    // Enhanced Anticipation for Voice Leading
    const anticipationWindow = activeStyle === 'bird' ? 4 : 2;
    const isApproachingChange =
        stepInChord >= currentChord.beats * stepsPerBeat - anticipationWindow;

    if (nextChord && isLateInChord && Math.random() < (config.anticipationProb || 0)) {
        targetChord = nextChord;
    }

    const scaleIntervals = getScaleForChord(targetChord, null, style);

    // Optimization: Pre-calculate scale intervals lookup table (bitmask) for O(1) access
    let scaleMask = 0;
    for (let i = 0; i < scaleIntervals.length; i++) {
        scaleMask |= 1 << scaleIntervals[i];
    }

    const rootMidi = targetChord.rootMidi;
    // Optimization: avoid allocating scaleTones and chordTones arrays.
    // Instead check intervals directly against scaleIntervals and targetChord.intervals.
    // Note: chordTones check logic updated to use targetChord instead of currentChord for consistency during anticipation.

    let totalWeight = 0;
    CANDIDATE_WEIGHTS.fill(0);
    const lastInterval = soloist.lastInterval || 0;
    const isResolvingSkip = Math.abs(lastInterval) > 4;

    if (Math.abs(lastInterval) < 3) {
        soloist.stagnationCount = (soloist.stagnationCount || 0) + 1; // @worker-mutation
    } else {
        soloist.stagnationCount = 0; // @worker-mutation
    }
    const isStagnant = soloist.stagnationCount > 4;

    // Voice Leading Target Calculation (Lookahead)
    let voiceLeadingTarget = null;
    if (isApproachingChange && nextChord) {
        // Find the nearest chord tone in the NEXT chord to our current position
        const nextChordTones = nextChord.intervals.map((i) => nextChord.rootMidi + i);
        // Normalize to nearest octave relative to lastMidi
        let bestTarget = null;
        let minTargetDist = 999;

        for (const tone of nextChordTones) {
            const pc = tone % 12;
            // Check octaves around lastMidi
            const octaves = [
                Math.floor(lastMidi / 12) * 12,
                (Math.floor(lastMidi / 12) - 1) * 12,
                (Math.floor(lastMidi / 12) + 1) * 12,
            ];
            for (const oct of octaves) {
                const candidate = oct + pc;
                const d = Math.abs(candidate - lastMidi);
                if (d < minTargetDist) {
                    minTargetDist = d;
                    bestTarget = candidate;
                }
            }
        }
        voiceLeadingTarget = bestTarget;
    }

    for (let m = Math.floor(minMidi); m <= Math.ceil(maxMidi); m++) {
        if (m < 0 || m > 127) {
            continue;
        }
        const pc = ((m % 12) + 12) % 12;
        const interval = (pc - (rootMidi % 12) + 12) % 12;
        let weight = 1.0;

        const dist = Math.abs(m - lastMidi);

        const isScaleTone = (scaleMask >> interval) & 1;
        if (!isScaleTone) {
            // Allow chromatic passing tones/neighbors for specific styles
            const allowsChromatic = ['bird', 'blues', 'neo', 'bossa'].includes(activeStyle);
            if (allowsChromatic && dist === 1) {
                weight = activeStyle === 'bird' ? 80 : 40; // Moderated for non-jazz styles
            } else {
                CANDIDATE_WEIGHTS[m] = 0;
                continue;
            }
        }
        // Bonuses
        if (
            isResolvingSkip &&
            ((lastInterval > 0 && m < lastMidi) || (lastInterval < 0 && m > lastMidi)) &&
            dist <= 2
        ) {
            weight += 1000;
        }
        const isGuideTone = [3, 4, 10, 11].includes(interval);
        const isRoot = interval === 0;
        const isPentatonicColor = [2, 9].includes(interval);
        const isBlueNote = [3, 6].includes(interval);

        if (isGuideTone) {
            weight += 30;
        }
        if (isRoot) {
            weight += 15;
        }
        if (activeStyle === 'country' && isPentatonicColor) {
            weight += 800;
        }

        // Stepwise Motion Bonus (Melodic Integrity)
        const isSmoothStyle = ['blues', 'jazz', 'bird', 'acoustic', 'reggae'].includes(activeStyle);
        if (dist > 0 && dist <= 4 && activeStyle !== 'country') {
            if (activeStyle === 'bird') {
                if (dist === 1) {
                    weight += 400; // Extra chromatic preference for Bird style
                } else if (dist === 2) {
                    weight += 10; // Very small bonus for whole-steps
                } else if (dist === 3) {
                    weight += 80; // Bonus for minor thirds (common in bebop skips)
                }
            } else {
                if (dist <= 2) {
                    weight += isSmoothStyle ? 100 : 50;
                }
            }
        }
        if (activeStyle === 'bird' || activeStyle === 'bossa') {
            weight += 100;
        }
        if (activeStyle === 'blues' || activeStyle === 'acoustic') {
            weight += 125;
        }
        if (activeStyle === 'reggae') {
            weight += 250; // Very strong stepwise preference for Reggae
        }

        // Voice Leading Bonus
        if (voiceLeadingTarget !== null) {
            // Check if this note leads smoothly to the target (stepwise)
            const distToTarget = Math.abs(m - voiceLeadingTarget);
            if (distToTarget <= 2 && distToTarget > 0) {
                weight += 500; // Strong pull towards voice leading target
            }
        }

        // --- Lead Sheet Melodic Anchoring ---
        if (activeStyle === 'lead_sheet' && soloist.leadSheetMelody?.length > 0) {
            const isThemePC = soloist.leadSheetMelody.some((n) => n.midi % 12 === pc);
            if (isThemePC) {
                weight += 200; // Strong preference for thematic pitch classes
            }

            // Register damping: Prefer notes near the theme's center
            const avgMidi = soloist.leadSheetMelody[0]?.midi || 60; // Simple estimate
            const distToCenter = Math.abs(m - avgMidi);
            if (distToCenter <= 7) {
                weight += 100;
            }
        }

        // --- Distance Scaling for Bonuses ---
        // We damp bonuses for notes that are far away to prevent "teleportation"
        // Adaptive: Only apply damping to styles that need strict smoothness
        let distDamping = 1.0;
        if (isSmoothStyle) {
            distDamping = dist > 4 ? 1.0 / (1.0 + (dist - 4) * 0.05) : 1.0;
        }

        if (activeStyle === 'blues' && isBlueNote) {
            weight += 250 * distDamping; // Authentic emphasis on Blue Notes, smoothed
        }

        // SRDC Tension & Resolution Bonuses
        if (soloist.srdcState === 'Departure') {
            const tensionBonus = 250 * effectiveIntensity * distDamping;
            // Favor 2nds, #11/b5, b6, and 7ths for tension
            if ([1, 2, 6, 8, 11].includes(interval)) {
                weight += tensionBonus;
            }
        }

        if (soloist.srdcState === 'Conclusion') {
            const baseRes = isSmoothStyle ? 500 : 400;
            const resolutionBonus = baseRes * effectiveIntensity * distDamping;
            const isChordTone = targetChord.intervals?.some(
                (i) => ((i % 12) + 12) % 12 === interval,
            );
            // Strong preference for Root and 5th for finality
            if (interval === 0 || interval === 7) {
                weight += resolutionBonus;
            }
            // Preference for other chord tones
            if (isChordTone) {
                weight += resolutionBonus * 0.5;
            }
        }

        if (soloist.qaState === 'Answer') {
            const qaBonus =
                (activeStyle === 'minimal' ? 100 : 250) * effectiveIntensity * distDamping;
            if (isRoot) {
                weight += qaBonus;
            }
            if (isGuideTone) {
                weight += qaBonus * 0.5;
            }
        }

        // Check if interval matches target chord tones (handling extended intervals > 12)
        if (targetChord.intervals.some((i) => ((i % 12) + 12) % 12 === interval)) {
            const headChordBonus = headFactor > 0.5 ? 8000 : 0; // Even stronger bonus for Head
            weight += (isSmoothStyle ? 400 : 100 + headChordBonus) * distDamping;
        }

        // Lyrical Head Bonus: Favor 1, 3, 5, 7 during the Head loop even more
        if (headFactor > 0.3 && [0, 4, 7, 11, 3, 10].includes(interval)) {
            weight += 1000 * headFactor;
        }

        if (activeStyle === 'country' && isPentatonicColor) {
            weight += 1000;
        }

        // Penalties (Multiplicative)
        if (dist === 0) {
            if (activeStyle === 'bird') {
                // BEBOP HEAD IMPROVEMENT: Parker uses repeated notes (15%) for rhythmic emphasis
                const headRepeatedMultiplier = headFactor > 0.5 ? 1.5 : 1.0;
                weight *= 0.65 * headRepeatedMultiplier; // Allow repeated notes more for Parker rhythmic style
            } else {
                weight *= 0.0001; // Force a move
            }
            if (isStagnant && activeStyle !== 'bird') {
                weight = 0;
            }
        }

        // Continuous interval penalty to keep lines smooth (Exponential for large leaps)
        if (dist > 2 && isSmoothStyle) {
            let penaltyBase = ['shred', 'metal', 'bird'].includes(activeStyle) ? 0.85 : 0.6;
            // BEBOP HEAD IMPROVEMENT: Favor stepwise motion (44%) even more during the head
            if (activeStyle === 'bird' && headFactor > 0.5) {
                penaltyBase *= 0.8;
            }
            weight *= penaltyBase ** (dist - 2);
        }

        if (activeStyle === 'reggae' && dist > 2) {
            weight *= 0.01;
        }
        if (['bird', 'bossa', 'acoustic'].includes(activeStyle) && dist > 4) {
            weight *= 0.1;
        }
        if (activeStyle === 'country' && dist > 7) {
            weight *= 0.1;
        }
        if (['blues', 'funk', 'neo', 'disco'].includes(activeStyle) && dist > 6) {
            weight *= 0.2;
        }

        // High BPM Interval Control (Prevent erratic jumps)
        if (playback.bpm > 160 && dist > 4) {
            weight *= 0.1; // Heavy penalty for jumps at high speeds
        }
        if (playback.bpm > 180 && dist > 3) {
            weight *= 0.01; // Stricter
        }

        if (historyLen > 12) {
            const count = historyCounts[m] || 0;
            const pcCount = pcCounts[pc] || 0;
            const pct = count / historyLen;
            const pcPct = pcCount / historyLen;
            if (pct > 0.35 || pcPct > 0.45) {
                weight = 0; // Hard ban magnets
            } else if (pct > 0.2 || pcPct > 0.3) {
                weight *= 0.01;
            }
        }
        if (isStagnant && dist < 3) {
            weight *= 0.01;
        }
        const dCenter = Math.abs(m - dynamicCenter);
        if (dCenter > 7) {
            weight *= Math.max(0.01, 1.0 - (dCenter - 7) * 0.1);
        }

        weight = Math.max(0.01, weight);

        // Absolute hard ban on large intervals at very high BPM (after min weight clamp)
        if (playback.bpm > 195 && dist > 2) {
            weight = 0;
        }

        CANDIDATE_WEIGHTS[m] = weight;
        totalWeight += weight;
    }

    let selectedMidi = -1;
    const startM = Math.floor(minMidi);
    const endM = Math.ceil(maxMidi);

    if (totalWeight > 0) {
        let randomVal = Math.random() * totalWeight;
        for (let m = startM; m <= endM; m++) {
            if (m < 0 || m > 127) {
                continue;
            }
            const w = CANDIDATE_WEIGHTS[m];
            if (w > 0) {
                randomVal -= w;
                if (randomVal <= 0) {
                    selectedMidi = m;
                    break;
                }
            }
        }
    }

    if (selectedMidi === -1 || selectedMidi === lastMidi) {
        const fallbacks = [];
        for (let m = startM; m <= endM; m++) {
            if (m < 0 || m > 127) {
                continue;
            }
            const pc = ((m % 12) + 12) % 12;
            const interval = (pc - (rootMidi % 12) + 12) % 12;
            if ((scaleMask >> interval) & 1 && m !== lastMidi) {
                const dist = Math.abs(m - lastMidi);
                let weight = 1.0;
                if (dist <= 2) {
                    weight += 10;
                }
                if (activeStyle === 'reggae' && dist > 4) {
                    weight *= 0.1;
                }

                if (soloist.srdcState === 'Conclusion') {
                    const resolutionBonus = 400 * effectiveIntensity;
                    const isChordTone = targetChord.intervals?.some(
                        (i) => ((i % 12) + 12) % 12 === interval,
                    );
                    if (interval === 0 || interval === 7) {
                        weight += resolutionBonus;
                    }
                    if (isChordTone) {
                        weight += resolutionBonus * 0.5;
                    }
                }

                fallbacks.push({ midi: m, weight });
            }
        }
        if (fallbacks.length > 0) {
            const totalW = fallbacks.reduce((sum, f) => sum + f.weight, 0);
            let rand = Math.random() * totalW;
            for (const f of fallbacks) {
                rand -= f.weight;
                if (rand <= 0) {
                    selectedMidi = f.midi;
                    break;
                }
            }
            if (selectedMidi === -1) {
                selectedMidi = fallbacks[0].midi;
            }
        } else {
            selectedMidi = lastMidi;
        }
    }

    soloist.lastInterval = selectedMidi - lastMidi; // @worker-mutation

    // --- 7. Melodic Devices ---
    const allowFlash = intensity > 0.5;
    const deviceBaseProb =
        config.deviceProb *
        (0.5 + complexity * 1.0) *
        (1.2 - lyricalBias) *
        (0.2 + effectiveIntensity * 0.8) *
        (1.0 - headFactor * 0.7); // Reduce devices by up to 70% during the Head loop
    const isPiano = soloist.mode === 'piano';
    // Certain styles MUST allow double stops even in monophonic mode for authentic character,
    // but ONLY if the configuration (global or local) actually allows them.
    const isPolyphonic =
        (soloist.doubleStopProb ?? 1.0) > 0 &&
        config.doubleStopProb > 0 &&
        (soloist.mode !== 'monophonic' ||
            ['country', 'reggae', 'blues', 'ska'].includes(activeStyle));

    // Throttle devices at high BPM
    let bpmDeviceThrottle = playback.bpm > 160 ? 0.3 : 1.0;
    if (playback.bpm > 185) {
        bpmDeviceThrottle = 0.05; // Almost no devices at 200 BPM to prevent 16th bursts
    }

    if (
        allowFlash &&
        stepInBeat === 0 &&
        Math.random() < deviceBaseProb * 0.7 * warmupFactor * bpmDeviceThrottle
    ) {
        let allowed = [...(config.allowedDevices || [])];
        if (isPiano) {
            allowed = allowed.filter(
                (d) => !['slide', 'countryBend', 'graceSlide', 'chickenPick'].includes(d),
            );
            // Piano-specific devices
            if (!allowed.includes('graceNote')) {
                allowed.push('graceNote');
            }
        }

        const deviceType =
            allowed.length > 0 ? allowed[Math.floor(Math.random() * allowed.length)] : null;
        const devBaseVel = 0.5 + effectiveIntensity * 0.6;

        let deviceBuffer = [];

        if (deviceType === 'bluesLick') {
            const root = targetChord.rootMidi;
            const relInt = (selectedMidi - root + 120) % 12;
            let lick = [];
            const duration = 2; // 8th notes

            // 1. From Root (0)
            if (relInt === 0) {
                if (Math.random() < 0.5) {
                    // Ascending Walk: R -> b3 -> 4 -> #4 -> 5
                    lick = [
                        { midi: selectedMidi, durationSteps: duration },
                        { midi: selectedMidi + 3, durationSteps: duration },
                        { midi: selectedMidi + 5, durationSteps: duration },
                        { midi: selectedMidi + 6, durationSteps: duration },
                        { midi: selectedMidi + 7, durationSteps: duration * 2 },
                    ];
                } else {
                    // Fall to 5: R -> b7 -> 5
                    lick = [
                        { midi: selectedMidi, durationSteps: duration },
                        { midi: selectedMidi - 2, durationSteps: duration },
                        { midi: selectedMidi - 5, durationSteps: duration * 2 },
                    ];
                }
            }
            // 2. From b3 (3)
            else if (relInt === 3) {
                if (Math.random() < 0.5) {
                    // Major/Minor Clash: b3 (slide) -> 3 -> 5 -> 6 -> R
                    lick = [
                        {
                            midi: selectedMidi + 1,
                            durationSteps: duration,
                            bendStartInterval: 1, // Slide up from b3 to 3
                        }, // 3 (Major)
                        { midi: selectedMidi + 4, durationSteps: duration }, // 5
                        { midi: selectedMidi + 7, durationSteps: duration }, // b7
                        { midi: selectedMidi + 9, durationSteps: duration * 2 }, // Root
                    ];
                } else {
                    // Resolution: b3 -> R -> b7 -> 5
                    lick = [
                        { midi: selectedMidi, durationSteps: duration },
                        { midi: selectedMidi - 3, durationSteps: duration },
                        { midi: selectedMidi - 5, durationSteps: duration },
                        { midi: selectedMidi - 8, durationSteps: duration * 2 },
                    ];
                }
            }
            // 3. From 4 (5)
            else if (relInt === 5) {
                // Chromatic Walkup: 4 -> #4 -> 5 -> b7
                lick = [
                    { midi: selectedMidi, durationSteps: duration },
                    { midi: selectedMidi + 1, durationSteps: duration },
                    { midi: selectedMidi + 2, durationSteps: duration },
                    { midi: selectedMidi + 5, durationSteps: duration * 2 },
                ];
            }
            // 4. From 5 (7)
            else if (relInt === 7) {
                // Classic Descent: 5 -> 4 -> b3 -> R
                lick = [
                    { midi: selectedMidi, durationSteps: duration },
                    { midi: selectedMidi - 2, durationSteps: duration },
                    { midi: selectedMidi - 4, durationSteps: duration },
                    { midi: selectedMidi - 7, durationSteps: duration * 2 },
                ];
            }
            // 5. From b7 (10)
            else if (relInt === 10) {
                // Turnaround: b7 -> 5 -> 4 -> b3 -> R
                lick = [
                    { midi: selectedMidi, durationSteps: duration },
                    { midi: selectedMidi - 3, durationSteps: duration },
                    { midi: selectedMidi - 5, durationSteps: duration },
                    { midi: selectedMidi - 7, durationSteps: duration },
                    { midi: selectedMidi - 10, durationSteps: duration * 2 },
                ];
            }

            if (lick.length > 0) {
                // Melodic Continuity: Nudge entire lick to the octave nearest to lastMidi
                const lickStart = lick[0].midi;
                const octaveShift = Math.round((lastMidi - lickStart) / 12) * 12;

                deviceBuffer = lick.map((n, idx) => ({
                    ...n,
                    midi: Math.max(minMidi, Math.min(maxMidi, n.midi + octaveShift)),
                    velocity: devBaseVel * (idx === 0 ? 1.15 : 0.9 + Math.random() * 0.15),
                    style: activeStyle,
                }));
            }
        }

        if (deviceType === 'chromaticFall') {
            const steps = Math.floor(Math.random() * 3) + 3; // 3-5 steps
            const duration = 1; // 16ths
            for (let i = 0; i < steps; i++) {
                deviceBuffer.push({
                    midi: Math.max(minMidi, selectedMidi - i),
                    durationSteps: duration,
                    velocity: devBaseVel * (1.1 - i * 0.1),
                    style: activeStyle,
                });
            }
        }

        if (deviceType === 'graceNote') {
            // ... (rest of device logic remains similar, but using deviceBuffer)
        }

        // Finalize device buffer and return
        if (deviceBuffer.length > 0) {
            soloist.deviceBuffer = deviceBuffer.slice(1); // @worker-mutation
            const first = deviceBuffer[0];
            soloist.busySteps = (first.durationSteps || 1) - 1; // @worker-mutation
            soloist.currentCell = null; // @worker-mutation
            return finalizeNote(first);
        }

        if (deviceType === 'graceNote') {
            // Half-step or scale-step below, very fast
            deviceBuffer = [
                {
                    midi: selectedMidi - 1,
                    velocity: devBaseVel * 0.8,
                    durationSteps: 1,
                    style: activeStyle,
                },
                {
                    midi: selectedMidi,
                    velocity: devBaseVel * 1.1,
                    durationSteps: 2,
                    style: activeStyle,
                },
            ];
        }
        if (deviceType === 'banjoRoll') {
            // Arpeggiated 16th notes using chord tones + 2nd/6th
            const root = targetChord.rootMidi;
            const rollPitches = [0, 4, 7, 9].map((i) => root + i);
            const roll = [];
            for (let i = 0; i < 4; i++) {
                const midi = rollPitches[i % rollPitches.length];
                roll.push({
                    midi,
                    velocity: devBaseVel * (i === 0 ? 1.1 : 0.9),
                    durationSteps: 1,
                    style: activeStyle,
                });
            }
            deviceBuffer = roll;
        }
        if (deviceType === 'graceSlide') {
            // Half-step slide into a chord tone (usually minor 3rd to major 3rd)
            deviceBuffer = [
                {
                    midi: selectedMidi,
                    velocity: devBaseVel * 1.2,
                    durationSteps: 2,
                    style: activeStyle,
                    bendStartInterval: 1, // Slide up from -1 semitone
                },
            ];
        }
        if (deviceType === 'countryBend' && isPolyphonic && !isPiano) {
            // Pedal Steel style: Hold one note, bend the other into a chord tone
            const topNote =
                selectedMidi + ([3, 4, 7].includes((selectedMidi - rootMidi + 12) % 12) ? 0 : 2);
            const bottomNote = selectedMidi - 5;
            deviceBuffer = [
                [
                    {
                        midi: topNote,
                        velocity: devBaseVel * 1.2,
                        durationSteps: 4,
                        style: activeStyle,
                        bendStartInterval: -1,
                        isDoubleStop: true,
                    },
                    {
                        midi: bottomNote,
                        velocity: devBaseVel * 0.9,
                        durationSteps: 4,
                        style: activeStyle,
                        isDoubleStop: false,
                    },
                ],
            ];
        }
        if (deviceType === 'chickenPick') {
            // Snappy, short rhythmic hits, often a double stop
            const dsInt = Math.random() < 0.5 ? 3 : 4;
            deviceBuffer = [
                [
                    {
                        midi: selectedMidi + dsInt,
                        velocity: 1.25,
                        durationSteps: 1,
                        style: activeStyle,
                        isDoubleStop: true,
                    },
                    {
                        midi: selectedMidi,
                        velocity: 1.2,
                        durationSteps: 1,
                        style: activeStyle,
                        isDoubleStop: false,
                    },
                ],
            ];
        }
        if (deviceType === 'birdFlurry') {
            // Throttle flurry at high BPM
            if (playback.bpm > 180 && Math.random() < 0.8) {
                return null;
            }

            const flurry = [];
            let curr = selectedMidi + 3;
            for (let i = 0; i < 4; i++) {
                let n = curr - 1;
                while (!((scaleMask >> ((n - rootMidi + 120) % 12)) & 1) && n > curr - 5) {
                    n--;
                }
                flurry.push({
                    midi: n,
                    velocity: devBaseVel * 1.05,
                    durationSteps: 1,
                    style: activeStyle,
                });
                curr = n;
            }
            deviceBuffer = flurry;
        }
        if (deviceType === 'run' || deviceType === 'enclosure') {
            deviceBuffer = [
                {
                    midi: selectedMidi + (deviceType === 'run' ? -2 : 1),
                    velocity: devBaseVel * 0.9,
                    durationSteps: 1,
                    style: activeStyle,
                },
                {
                    midi: selectedMidi - 1,
                    velocity: devBaseVel * 1.1,
                    durationSteps: 1,
                    style: activeStyle,
                },
                {
                    midi: selectedMidi,
                    velocity: devBaseVel * 1.2,
                    durationSteps: 1,
                    style: activeStyle,
                },
            ];
        }
        if (deviceType === 'slide') {
            // Favor sliding from below, but guitar/jazz often slide from above
            const dir =
                (soloist.mode === 'guitar' || activeStyle === 'bird') && Math.random() < 0.3
                    ? 1
                    : -1;
            deviceBuffer = [
                {
                    midi: selectedMidi,
                    velocity: devBaseVel * 1.15,
                    durationSteps: 2,
                    style: activeStyle,
                    bendStartInterval: -dir, // dir -1 -> slide UP (bend 1), dir 1 -> slide DOWN (bend -1)
                },
            ];
        }

        // --- Finalize and Smooth Device Buffer ---
        if (deviceBuffer.length > 0) {
            // Melodic Continuity: Nudge entire buffer to the octave nearest to lastMidi
            // unless we're just starting a phrase
            const firstNote = Array.isArray(deviceBuffer[0]) ? deviceBuffer[0][0] : deviceBuffer[0];
            const startMidi = firstNote.midi;
            const targetMidi = soloist.isResting ? dynamicCenter : lastMidi;
            const octaveShift = Math.round((targetMidi - startMidi) / 12) * 12;

            const finalBuffer = deviceBuffer.map((n) => {
                const notes = Array.isArray(n) ? n : [n];
                const shifted = notes.map((note) => ({
                    ...note,
                    midi: Math.max(minMidi, Math.min(maxMidi, note.midi + octaveShift)),
                }));
                return shifted.length === 1 ? shifted[0] : shifted;
            });

            soloist.deviceBuffer = finalBuffer.slice(1); // @worker-mutation
            const first = finalBuffer[0];
            soloist.busySteps =
                (Array.isArray(first) ? first[0].durationSteps : first.durationSteps || 1) - 1; // @worker-mutation
            soloist.currentCell = null; // @worker-mutation
            return finalizeNote(first);
        }
        if ((deviceType === 'quartal' || deviceType === 'guitarDouble') && isPolyphonic) {
            const dsInt = activeStyle === 'blues' || activeStyle === 'scalar' ? 5 : 4;
            const res = [
                {
                    midi: selectedMidi + dsInt,
                    velocity: devBaseVel * 1.05,
                    durationSteps: 1,
                    style: activeStyle,
                    isDoubleStop: true,
                },
                {
                    midi: selectedMidi,
                    velocity: devBaseVel * 1.2,
                    durationSteps: 1,
                    style: activeStyle,
                    isDoubleStop: false,
                },
            ];
            soloist.busySteps = 0; // @worker-mutation
            return finalizeNote(res);
        }
    }

    const extraNotes = [];
    const dsChance =
        (config.doubleStopProb + maturityFactor * 0.2) *
        (stepInBeat === 2 ? 1.2 : 0.6) *
        warmupFactor *
        (0.4 + effectiveIntensity * 0.6) *
        (soloist.doubleStopProb ?? 1.0);

    if (isPolyphonic && Math.random() < dsChance) {
        // Mode-specific voicing differentiation
        if (soloist.mode === 'piano') {
            const currentRoot = currentChord.rootMidi;
            // Modern Jazz/Neo: Use Quartal voicings (4ths)
            if ((activeStyle === 'neo' || activeStyle === 'bird') && Math.random() < 0.6) {
                extraNotes.push({
                    midi: selectedMidi - 5,
                    velocity: (0.4 + effectiveIntensity * 0.5) * 0.8,
                    isDoubleStop: true,
                });
                if (Math.random() < 0.4) {
                    extraNotes.push({
                        midi: selectedMidi - 10,
                        velocity: (0.3 + effectiveIntensity * 0.5) * 0.7,
                        isDoubleStop: true,
                    });
                }
            } else {
                // Classic Block Chord Logic: Add two chord tones immediately below the melody
                let count = 0;
                for (let m = selectedMidi - 1; m > selectedMidi - 13 && count < 2; m--) {
                    const pc = ((m % 12) + 12) % 12;
                    if (
                        currentChord.intervals.some(
                            (i) => i % 12 === (pc - (currentRoot % 12) + 12) % 12,
                        )
                    ) {
                        extraNotes.push({
                            midi: m,
                            velocity: (0.5 + effectiveIntensity * 0.6) * 0.85,
                            isDoubleStop: true,
                        });
                        count++;
                    }
                }
            }
        } else if (activeStyle === 'country') {
            // Country specific: Exclusively use Sixths (8 or 9)
            const dsInt = [8, 9][Math.floor(Math.random() * 2)];
            extraNotes.push({
                midi: selectedMidi + dsInt,
                velocity: (0.5 + effectiveIntensity * 0.6) * 0.95,
                isDoubleStop: true,
            });
        } else if (soloist.mode === 'guitar') {
            // Hendrix-style: favor 4ths and 5ths with potential for ornaments
            const dsInt =
                activeStyle === 'blues' || activeStyle === 'neo'
                    ? [5, 7, 5, 4][Math.floor(Math.random() * 4)]
                    : [3, 4, 5, 8, 9][Math.floor(Math.random() * 5)];
            extraNotes.push({
                midi: selectedMidi + dsInt,
                velocity: (0.5 + effectiveIntensity * 0.6) * 0.95,
                isDoubleStop: true,
            });
        } else {
            // Default generic double stop
            const dsInt = [5, 7, 9, 12][Math.floor(Math.random() * 4)];
            extraNotes.push({
                midi: selectedMidi + dsInt,
                velocity: (0.5 + effectiveIntensity * 0.6) * 0.95,
                isDoubleStop: true,
            });
        }
    }

    // --- 8. Dynamic Duration & Bending ---
    let durationSteps = 1;
    let bendStartInterval = 0;

    const isImportantStep = stepInBeat === 0 || (stepInBeat === 2 && Math.random() < 0.3);
    const baseVelocity = 0.5 + effectiveIntensity * 0.7;
    let stepVelocity = isImportantStep ? baseVelocity * 1.15 : baseVelocity;

    // --- ENSEMBLE CLARITY: Yield to Bass ---
    // If we are playing in the lower soloist register and the bass is hitting,
    // reduce velocity slightly to avoid low-mid mud.
    if (bassHit && selectedMidi < 60) {
        stepVelocity *= 0.85;
    }

    // --- Legato Logic ---
    let isLegato = false;
    const LEGATO_STYLES = ['neo', 'shred', 'bird', 'blues', 'metal', 'scalar'];
    if (
        LEGATO_STYLES.includes(activeStyle) &&
        Math.abs(selectedMidi - lastMidi) <= 2 &&
        durationSteps <= 2
    ) {
        let legatoProb = activeStyle === 'shred' || activeStyle === 'bird' ? 0.7 : 0.4;

        // Boost legato significantly for monophonic lead instruments
        if (soloist.mode === 'monophonic') {
            legatoProb = 0.85;
        }

        if (Math.random() < legatoProb && !soloist.isResting && soloist.notesInPhrase > 1) {
            isLegato = true;
        }
    }

    if (activeStyle === 'bird') {
        // Tune bird to start more melodic (8th notes) at low intensity or during warmup
        // NEW: Force 8th notes during the "Head" (first loop) to establish melody
        const birdEighthProb =
            0.9 - (effectiveIntensity - 0.5) * 0.3 - warmupFactor * 0.2 + headFactor * 0.5;
        durationSteps = Math.random() < Math.min(1.0, birdEighthProb) ? 2 : 1;
    } else if (intensity < 0.4 && activeStyle !== 'bird') {
        durationSteps = Math.random() < 0.6 ? 4 : 8;
    } else if (
        isImportantStep &&
        (activeStyle === 'neo' ||
            activeStyle === 'blues' ||
            activeStyle === 'minimal' ||
            activeStyle === 'bossa')
    ) {
        durationSteps = Math.random() < 0.4 + maturityFactor * 0.2 ? 8 : 4;
    } else if (
        activeStyle === 'scalar' &&
        stepInBeat === 0 &&
        Math.random() < 0.15 + maturityFactor * 0.1
    ) {
        durationSteps = 4;
    }

    const pc = selectedMidi % 12;
    const isRoot = pc === targetChord.rootMidi % 12;
    const isGuideTone = [3, 4, 10, 11].includes((pc - (targetChord.rootMidi % 12) + 12) % 12);

    // Guitar mode favors bending UP into notes (pre-bends)
    const guitarBendProb = soloist.mode === 'guitar' ? 0.35 + (isGuideTone ? 0.2 : 0) : 0;

    if (
        ((isRoot || isGuideTone) &&
            Math.abs(lastMidi - selectedMidi) <= 2 &&
            Math.random() < 0.4 + intensity * 0.3) ||
        Math.random() < guitarBendProb
    ) {
        // Bend up from 1 or 2 semitones below
        bendStartInterval = -1;
        if (Math.random() < 0.4 || (soloist.mode === 'guitar' && Math.random() < 0.5)) {
            bendStartInterval = -2;
        }
    } else if (durationSteps >= 4 && Math.random() < 0.3 + maturityFactor * 0.2) {
        // Natural release/vibrato bend (up)
        bendStartInterval = Math.random() < 0.7 ? 1 : 2;
    }

    if (isPiano) {
        bendStartInterval = 0;
        isLegato = false;
    }

    const result = {
        midi: selectedMidi,
        velocity: Math.min(1.25, stepVelocity),
        durationSteps,
        bendStartInterval,
        ccEvents: [],
        timingOffset: 0,
        style: activeStyle,
        isDoubleStop: false,
        isLegato,
    };

    // --- Unified Embellishment: Rhythmic Diminution ---
    // Splitting longer notes into runs based on intensity and loop progress
    let embellishmentProb = evoEnabled
        ? Math.max(
              0,
              (effectiveIntensity - 0.5) * 1.5 +
                  (soloist.motifReplayCount || 0) * 0.1 +
                  smoothLoopCount * 0.05,
          )
        : 0;

    // Reduce embellishments significantly during the Head loop to keep melody clean
    if (headFactor > 0.5) {
        embellishmentProb *= 0.2;
    }

    // Bird style is already dense via cells, reduce auto-embellishment to keep 8th note flow
    if (activeStyle === 'bird') {
        embellishmentProb *= 0.3;
    }

    if (durationSteps > 1 && Math.random() < embellishmentProb * 0.8) {
        result.durationSteps = 1;
        if (!soloist.embellishmentBuffer) {
            soloist.embellishmentBuffer = []; // @worker-mutation
        }
        const scaleIntervals = getScaleForChord(targetChord, null, style);
        const neighborDir = Math.random() > 0.5 ? 1 : -1;
        let neighborMidi = selectedMidi;
        let neighborPC = (neighborMidi + neighborDir + 120) % 12;
        let tries = 0;
        while (!scaleIntervals.includes(neighborPC) && tries < 3) {
            neighborMidi += neighborDir;
            neighborPC = (neighborMidi + 120) % 12;
            tries++;
        }
        soloist.embellishmentBuffer.push({
            midi: neighborMidi,
            durationSteps: durationSteps - 1,
            velocity: 0.8 * result.velocity,
            style: activeStyle,
            isLegato: true,
        }); // @worker-mutation
    }

    if (result.durationSteps > 1) {
        soloist.busySteps = result.durationSteps - 1; // @worker-mutation
    }

    const finalResult =
        extraNotes.length > 0 && isPolyphonic
            ? [...extraNotes.map((n) => ({ ...result, ...n })), result]
            : result;

    if (!soloist.isReplayingMotif) {
        const motifEntry = Array.isArray(finalResult)
            ? finalResult.map((n) => ({ ...n, phraseStep: soloist.currentPhraseSteps }))
            : { ...finalResult, phraseStep: soloist.currentPhraseSteps };

        soloist.motifBuffer.push(motifEntry);
        if (soloist.motifBuffer.length > 16) {
            soloist.motifBuffer.shift();
        }
        soloist.motifRoot = targetChord.rootMidi % 12; // @worker-mutation
    }

    return finalizeNote(finalResult);
}
