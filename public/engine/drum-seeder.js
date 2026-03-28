import { TIME_SIGNATURES } from '../config.js';
import { createPRNG, generateRandomSeed } from '../utils.js';
import { unrollArrangement } from './arranger-utils.js';
import { generateDeterministicFill } from './fills.js';

/**
 * Drum Seeder Module (Phase 1, 2 & 3)
 * Generates an orchestration map, fill map, and accent map for the entire song arrangement.
 */

/**
 * @typedef {Object} OrchestrationMapEntry
 * @property {number} start - Global start step.
 * @property {number} end - Global end step.
 * @property {string} rideVoice - Cymbal/Timekeeping voice ('HiHat-Closed', 'HiHat-Open', 'Ride', 'Ride-Bell', 'Tom-Groove').
 * @property {string} snareVoice - Snare voicing ('Sidestick', 'Snare', 'None').
 * @property {number} motifComplexity - Rhythmic density (0-3).
 * @property {number} energyLevel - Pre-calculated section energy (0.0 - 1.0).
 */

/**
 * @typedef {Object} FillMapEntry
 * @property {Record<number, {name: string, vel: number}[]>} steps
 * @property {number} length
 * @property {boolean} crash
 */

/**
 * @typedef {Object} AccentCatch
 * @property {string} type - Catch type ('crash-catch', 'snare-stab', 'hat-bark').
 * @property {number} velocity - Drum velocity.
 */

/**
 * Generates a song-wide orchestration map for the drummer.
 * @param {import('../types.js').EnsembleState} _state
 * @param {import('../state/arranger.js').ArrangerState} arranger
 * @param {string} _style
 * @param {number} intensity
 * @param {string} [seedStr]
 * @returns {OrchestrationMapEntry[]}
 */
export function generateDrumOrchestration(_state, arranger, _style, intensity, seedStr) {
    const unrolled = unrollArrangement(arranger, 128);
    const { sectionMap } = unrolled;

    if (!sectionMap || sectionMap.length === 0) {
        return [];
    }

    const prng = createPRNG(seedStr || generateRandomSeed());
    /** @type {OrchestrationMapEntry[]} */
    const orchestrationMap = [];

    sectionMap.forEach((sectionRange, index) => {
        const label = (sectionRange.label || 'Verse').toLowerCase();
        const sourceLabels = Array.isArray(sectionRange.sourceLabels)
            ? /** @type {string[]} */ (sectionRange.sourceLabels)
            : [sectionRange.label || ''];
        const hasActualIntroLikeLabel = sourceLabels.some((sourceLabel) => {
            const normalized = String(sourceLabel).toLowerCase();
            return (
                normalized.includes('intro') ||
                normalized.includes('break') ||
                normalized.includes('breakdown')
            );
        });
        const role = label.includes('intro')
            ? 'Intro'
            : label.includes('chorus') || label.includes('drop')
              ? 'Chorus'
              : label.includes('outro') || label.includes('end')
                ? 'Outro'
                : label.includes('bridge')
                  ? 'Bridge'
                  : 'Verse';

        // 1. Calculate Section Energy Level
        let energyLevel = intensity;
        if (role === 'Intro') {
            energyLevel -= 0.2;
        }
        if (role === 'Chorus') {
            energyLevel += 0.2;
        }
        if (role === 'Outro') {
            energyLevel -= 0.3;
        }
        energyLevel = Math.max(0.1, Math.min(1.0, energyLevel));

        // 2. Select Ride Voice
        let rideVoice = 'HiHat-Closed';
        if (role === 'Chorus') {
            const r = prng();
            // At higher intensities, prefer ride definition over fully open wash.
            if (energyLevel > 0.82) {
                rideVoice = r > 0.15 ? 'Ride' : 'Open';
            } else if (energyLevel > 0.7) {
                rideVoice = r > 0.25 ? 'Ride' : 'HiHat-Closed';
            } else {
                rideVoice = r > 0.7 ? 'Ride' : 'HiHat-Closed';
            }
        } else if (role === 'Bridge') {
            rideVoice = prng() > 0.5 ? 'Tom-Groove' : 'HiHat-Closed';
        } else if (role === 'Verse' && energyLevel > 0.6) {
            rideVoice = prng() > 0.7 ? 'Ride' : 'HiHat-Closed';
        }

        // 3. Select Snare Voice
        let snareVoice = 'Snare';
        const isRockFeel =
            _style === 'Rock' ||
            _style === 'Metal' ||
            _style === 'Ska-Punk' ||
            _style === 'Country';

        if (isRockFeel) {
            // Rock almost ALWAYS uses a full snare for the backbeat.
            // Only use Sidestick in very quiet ACTUAL intros or breakdowns,
            // not just because the macro-form treats the first pass as an intro.
            if (energyLevel <= 0.12 && hasActualIntroLikeLabel) {
                snareVoice = 'Sidestick';
            }
        } else if (_style === 'Disco') {
            // Even at medium energy, Disco needs a clear snare backbeat.
            // Reserve sidestick only for truly low-energy intros.
            if (energyLevel < 0.2 && role === 'Intro') {
                snareVoice = 'Sidestick';
            }
        } else {
            // Standard logic for Jazz/Bossa/Funk/Acoustic
            if (energyLevel < 0.4 && (role === 'Intro' || role === 'Verse')) {
                snareVoice = 'Sidestick';
            } else if (role === 'Intro' && energyLevel < 0.3) {
                snareVoice = 'None';
            }
        }

        // 4. Calculate Motif Complexity
        let motifComplexity = 1; // Standard
        if (energyLevel < 0.3) {
            motifComplexity = 0; // Pocket
        }
        if (energyLevel > 0.7) {
            motifComplexity = 2; // Active
        }
        if (energyLevel > 0.85) {
            motifComplexity = 3; // Busy
        }

        // --- POCKET DISCIPLINE (Metronome First) ---
        // For the first iteration (The Head), cap complexity at 'Standard' (1)
        // to ensure a rock-solid foundation for the user.
        if (index < (arranger.sectionMap?.length || 1)) {
            motifComplexity = Math.min(motifComplexity, 1);
        }

        orchestrationMap.push({
            start: sectionRange.start,
            end: sectionRange.end,
            rideVoice,
            snareVoice,
            motifComplexity,
            energyLevel,
        });
    });

    return orchestrationMap;
}

/**
 * Generates a song-wide fill map for the drummer.
 * @param {import('../types.js').EnsembleState} state
 * @param {import('../state/arranger.js').ArrangerState} arranger
 * @param {string} genre
 * @param {number} intensity
 * @param {string} [seedStr]
 * @returns {Record<number, FillMapEntry>}
 */
export function generateDrumFills(state, arranger, genre, intensity, seedStr) {
    const unrolled = unrollArrangement(arranger, 128);
    const { sectionMap } = unrolled;

    if (!sectionMap || sectionMap.length === 0) {
        return {};
    }

    const prng = createPRNG(seedStr || generateRandomSeed());
    /** @type {Record<number, FillMapEntry>} */
    const fillMap = {};
    const isVirtualMacroForm = unrolled.totalSteps !== unrolled.originalSteps;

    const tsConfig =
        /** @type {any} */ (TIME_SIGNATURES)[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = tsConfig.beats * tsConfig.stepsPerBeat;

    // Orchestration is needed to check energy levels for the "Crash Contract"
    const orchestrationMap = generateDrumOrchestration(state, arranger, genre, intensity, seedStr);

    sectionMap.forEach((sectionRange, index) => {
        // Keep the generated "Outro" quiet at the end of virtual macro form.
        if (isVirtualMacroForm && index === sectionMap.length - 1) {
            return;
        }

        const nextIndex = index === sectionMap.length - 1 ? 0 : index + 1;
        const nextSection = sectionMap[nextIndex];
        const currentOrch = orchestrationMap[index];
        const nextOrch = orchestrationMap[nextIndex];

        if (!currentOrch || !nextOrch || !nextSection) {
            return;
        }

        const nextArrangerSection = arranger.sections?.find(
            (/** @type {any} */ section) => section.id === nextSection.id,
        );
        if (nextArrangerSection?.seamless) {
            return;
        }

        // 1. Decide if we need a fill
        // Probability scales with overall intensity and "creativity" setting (if passed)
        const fillProb = 0.4 + intensity * 0.4;
        if (prng() > fillProb) {
            return;
        }

        // 2. Identify fill start step (Start of the last measure of the current section)
        const measuresInSection = (sectionRange.end - sectionRange.start) / stepsPerMeasure;
        if (measuresInSection < 1) {
            return; // Too short for a proper fill
        }

        const fillStartStep = sectionRange.end - stepsPerMeasure;

        // 3. Generate the fill
        // Fills are generated for the last measure of the section.
        // We use the energy level of the CURRENT section for the fill's intensity.
        const fillSteps = generateDeterministicFill(
            genre,
            currentOrch.energyLevel,
            stepsPerMeasure,
            prng,
        );

        // 4. Determine "Crash Contract"
        // Only crash if energy is rising or it's a major structural return (e.g. into Chorus)
        const energyRising = nextOrch.energyLevel > currentOrch.energyLevel;
        const isStructuralChorus =
            (nextSection.label || '').toLowerCase().includes('chorus') ||
            (nextSection.label || '').toLowerCase().includes('drop');
        const pendingCrash = energyRising || (isStructuralChorus && nextOrch.energyLevel > 0.4);

        fillMap[fillStartStep] = {
            steps: fillSteps,
            length: stepsPerMeasure,
            crash: pendingCrash,
        };
    });

    return fillMap;
}

/**
 * Generates a song-wide accent map for catching soloist peaks.
 * @param {import('../types.js').EnsembleState} _state
 * @param {import('../state/arranger.js').ArrangerState} arranger
 * @param {{notes: any[]}} soloistSeed
 * @param {string} genre
 * @param {number} intensity
 * @param {string} [seedStr]
 * @returns {Record<number, AccentCatch>}
 */
export function generateSoloistAccents(_state, arranger, soloistSeed, genre, intensity, seedStr) {
    if (!soloistSeed?.notes || soloistSeed.notes.length === 0) {
        return {};
    }

    const prng = createPRNG(seedStr || generateRandomSeed());
    /** @type {Record<number, AccentCatch>} */
    const accentMap = {};

    const tsConfig =
        /** @type {any} */ (TIME_SIGNATURES)[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;

    let lastCatchStep = -100;
    const catchCooldown = stepsPerBeat * 4; // Max 1 catch every 4 beats (1 bar in 4/4)

    soloistSeed.notes.forEach((note) => {
        // --- POCKET DISCIPLINE ---
        // Skip accents during the first iteration (The Head) to keep the initial groove metronomic.
        if (note.step < (arranger.totalSteps || 0)) {
            return;
        }

        // 1. Filter for valid accents
        // - Peak velocity (> 0.85)
        // - OR Highly syncopated (not on a main beat start)
        const isOffbeat = note.step % stepsPerBeat !== 0;
        const isStrongAccent = note.velocity > 0.85;

        if (isStrongAccent || (isOffbeat && note.velocity > 0.75 && intensity > 0.6)) {
            // Apply cooldown to prevent clutter
            if (note.step - lastCatchStep < catchCooldown) {
                return;
            }

            // Probability check based on overall intensity
            if (prng() > 0.3 + intensity * 0.4) {
                return;
            }

            // 2. Select catch type based on genre
            let type = 'snare-stab';
            if (genre === 'Jazz' || genre === 'Blues') {
                type = 'snare-stab'; // Jazz catching is usually snare+kick, no crash
            } else if (genre === 'Funk' || genre === 'Disco' || genre === 'Bossa') {
                type = prng() > 0.5 ? 'hat-bark' : 'snare-stab';
            } else {
                // Rock / Ska / Metal: Use Crash for high-velocity peaks
                type = isStrongAccent ? 'crash-catch' : 'snare-stab';
            }

            accentMap[note.step] = {
                type,
                velocity: Math.min(1.2, note.velocity + 0.2),
            };
            lastCatchStep = note.step;
        }
    });

    return accentMap;
}
