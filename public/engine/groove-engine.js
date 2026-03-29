import {
    binarySearchMap,
    calculateTimingOffset,
    getStepsPerMeasure,
    isSectionTurnaround,
} from '../utils.js';
import * as acoustic from './grooves/acoustic.js';
import * as blues from './grooves/blues.js';
import * as country from './grooves/country.js';
import * as disco from './grooves/disco.js';
import * as funk from './grooves/funk.js';
import * as hiphop from './grooves/hiphop.js';
import * as jazz from './grooves/jazz.js';
import * as latin from './grooves/latin.js';
import * as metal from './grooves/metal.js';
import * as minimal from './grooves/minimal.js';
import * as neoSoul from './grooves/neo-soul.js';
import * as reggae from './grooves/reggae.js';
import * as rock from './grooves/rock.js';
import * as shred from './grooves/shred.js';
import * as skaPunk from './grooves/ska-punk.js';
import { DEFAULT_CONFIG } from './grooves/utils.js';

/** @type {Record<string, any>} */
const strategies = {
    Jazz: jazz,
    Blues: blues,
    Rock: rock,
    Funk: funk,
    'Neo-Soul': neoSoul,
    'Hip Hop': hiphop,
    Acoustic: acoustic,
    Disco: disco,
    Reggae: reggae,
    'Bossa Nova': latin,
    Latin: latin,
    'Ska-Punk': skaPunk,
    Country: country,
    Metal: metal,
    Minimal: minimal,
    Shred: shred,
};

/** @param {any} groove */
/** @param {any} groove */
function getStrategy(groove) {
    const isLatinStyle =
        groove.genreFeel === 'Bossa Nova' ||
        ['Bossa Nova', 'Latin/Salsa', 'Afro-Cuban 6/8', 'Samba'].includes(groove.lastDrumPreset) ||
        groove.lastSmartGenre === 'Bossa';
    if (isLatinStyle) {
        return latin;
    }

    return strategies[groove.genreFeel] || null;
}

/**
 * @param {number} vel
 * @param {number} [amount=0.05]
 */
/**
 * @param {number} vel
 * @param {number} [amount=0.05]
 */
function humanizeVelocity(vel, amount = 0.05) {
    return vel * (1.0 + (Math.random() - 0.5) * amount);
}

/**
 * @param {any} state
 * @param {any} options
 */
/**
 * @param {any} state
 * @param {any} options
 */
export function applyGrooveOverrides(
    state,
    {
        stepVal,
        step,
        inst,
        playback,
        groove,
        isDownbeat,
        isBeatStart,
        isPulse,
        isPulseStart,
        isGroupStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        tsConfig,
        mStep,
        isCompound,
        stepInGroup,
        groupIndex,
    },
) {
    const { soloist, arranger } = state;
    const arrangerState = arranger || { timeSignature: '4/4' };
    const stepsPerBar = getStepsPerMeasure(arrangerState.timeSignature);
    const loopStep = step % stepsPerBar;

    let currentState = {
        shouldPlay: stepVal > 0,
        velocity: stepVal === 2 ? 1.25 : 0.9,
        soundName: inst.name,
        instTimeOffset: 0,
    };

    const strategy = getStrategy(groove);
    const config = strategy ? strategy.config : DEFAULT_CONFIG;

    let pulseWeight = 1.0;
    if ((inst.name === 'HiHat' || inst.name === 'Open') && !config.exemptFromPulseShaping) {
        const isSyncopated = loopStep % 2 === 1;
        if (isOffbeat) {
            pulseWeight = 0.85;
        } else if (isSyncopated) {
            pulseWeight = 0.7;
        }
    }

    const drumComplexity = groove.creativity ? 0.8 : 0.3;

    const barIndex = Math.floor(step / stepsPerBar);
    const prevBarIndex = Math.floor((step - 1) / stepsPerBar);
    const isFirstStepOfNewBar = loopStep === 0 && barIndex !== prevBarIndex;
    const seedTimelineStartStep = groove.seedTimelineStartStep || 0;
    const timelineStep = step - seedTimelineStartStep;

    const orchestration = groove.orchestrationMap
        ? binarySearchMap(groove.orchestrationMap, timelineStep)
        : null;
    const effectiveComplexity =
        orchestration?.motifComplexity !== undefined
            ? orchestration.motifComplexity / 3
            : drumComplexity;

    // Calculate current section length to determine turnarounds dynamically instead of hardcoded 4 bars
    const isTurnaround =
        groove.creativity && isSectionTurnaround(step, arrangerState.sectionMap, stepsPerBar, 1);

    // Check if the PREVIOUS bar was a turnaround to determine if we should crash now
    const prevStep = step - stepsPerBar;
    const prevWasTurnaround =
        groove.creativity &&
        isSectionTurnaround(prevStep, arrangerState.sectionMap, stepsPerBar, 1);

    const justFinishedTurnaround = prevWasTurnaround && isFirstStepOfNewBar;

    const chordEntry = binarySearchMap(arrangerState.stepMap || [], step);
    const sectionId = chordEntry?.chord?.sectionId;
    let sectionSeed = groove.sectionSeedMap?.[sectionId];
    if (sectionSeed === undefined) {
        // Latin/Bossa requires 2-bar stability for authentic Clave motifs
        const seedBarIndex = config.isLatin ? Math.floor(barIndex / 2) * 2 : barIndex;
        sectionSeed = ((seedBarIndex * 137 + (groove.creativity ? 42 : 0)) % 256) / 256;
    }

    if (justFinishedTurnaround && isDownbeat) {
        if (inst.name === 'Kick') {
            currentState.shouldPlay = true;
            currentState.velocity = 1.35;
        } else if (inst.name === 'HiHat' || inst.name === 'Open') {
            currentState.shouldPlay = true;
            // Use Open hats only at higher intensities for the section-start crash
            if (playback.bandIntensity > 0.45) {
                currentState.soundName = 'Open';
                currentState.velocity = 1.2;
            } else {
                currentState.soundName = 'HiHat';
                currentState.velocity = 1.1;
            }
        }
    }

    const context = {
        step,
        inst,
        stepVal,
        playback,
        groove,
        isDownbeat,
        isBeatStart,
        isPulse,
        isPulseStart,
        isGroupStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        tsConfig,
        mStep,
        isCompound,
        stepInGroup,
        groupIndex,
        stepsPerBar,
        loopStep,
        drumComplexity: effectiveComplexity,
        orchestration,
        barIndex,
        isFirstStepOfNewBar,
        sectionSeed,
        isTurnaround,
        isSoloistBusy: soloist.enabled && soloist.busySteps > 0,
    };

    if (strategy) {
        currentState = strategy.applyOverrides(context, currentState);
    }

    // --- Phase 3: Soloist Accent Catching ---
    const accent = timelineStep >= 0 ? groove.accentMap?.[timelineStep] : null;
    if (accent) {
        if (accent.type === 'crash-catch') {
            if (inst.name === 'Kick') {
                currentState.shouldPlay = true;
                currentState.velocity = 1.3;
            } else if (inst.name === 'HiHat' || inst.name === 'Open') {
                currentState.shouldPlay = true;
                currentState.soundName = 'Open';
                currentState.velocity = 1.25;
            }
        } else if (accent.type === 'snare-stab') {
            if (inst.name === 'Snare') {
                currentState.shouldPlay = true;
                currentState.soundName = 'Snare';
                currentState.velocity = 1.2;
            } else if (inst.name === 'Kick') {
                currentState.shouldPlay = true;
                currentState.velocity = 1.1;
            }
        } else if (accent.type === 'hat-bark') {
            if (inst.name === 'HiHat' || inst.name === 'Open') {
                currentState.shouldPlay = true;
                currentState.soundName = 'Open';
                currentState.velocity = 1.1;
            }
        }
    }

    // --- Entropy Phase (Random Expressivity) ---
    // Suppress entropy during the first iteration to establish a solid 'Pocket'
    const firstIterationSuppression = step < (arrangerState.totalSteps || 0) ? 0.3 : 1.0;

    if (
        groove.creativity &&
        !currentState.shouldPlay &&
        Math.random() <
            playback.bandIntensity *
                config.entropyMultiplier *
                firstIterationSuppression *
                (config.blockAdjacentSnare && groove.genreFeel !== 'Rock' ? 0.7 : 1.0)
    ) {
        const isSyncopated = loopStep % 2 === 1;
        const subdivision = stepsPerBar / (arrangerState.timeSignature.includes('/8') ? 2 : 4);
        const isHeavySync = loopStep % subdivision === Math.floor(subdivision / 2);

        // Simple hardcoded checks adapted to dynamic offset from backbeat
        let isBackbeatAdjacent = false;
        let isEOfBeatCheck = false;

        if (arrangerState.timeSignature === '4/4') {
            isBackbeatAdjacent = [3, 5, 11, 13].includes(loopStep);
            isEOfBeatCheck = [1, 9].includes(loopStep);
        }
        const blockSnare = config.blockAdjacentSnare && (isBackbeatAdjacent || isEOfBeatCheck);

        if (inst.name === 'Snare' && isSyncopated && !blockSnare && !config.isLatin) {
            currentState.shouldPlay = true;
            currentState.velocity = 0.1 + Math.random() * 0.15;
            currentState.soundName = playback.bandIntensity < 0.4 ? 'Sidestick' : 'Snare';
        } else if (
            (inst.name === 'HiHat' || inst.name === 'Open') &&
            isHeavySync &&
            !config.blockAdjacentSnare &&
            // Respect phrase-release lane ownership: when the strategy has routed this
            // step to the Open articulation (soundName='Open', shouldPlay=false on the
            // HiHat lane), entropy must not reclaim it as a closed-hat hit.
            currentState.soundName !== 'Open'
        ) {
            currentState.shouldPlay = true;
            currentState.velocity = 0.2 + Math.random() * 0.2;
            currentState.soundName = 'HiHat';
        }
    }

    if (currentState.shouldPlay && !inst.muted) {
        if (inst.name === 'HiHat' || inst.name === 'Open') {
            currentState.velocity *= pulseWeight;
        }

        if (inst.name === 'Snare' && isBackbeat && config.backbeatCrack) {
            currentState.velocity *= 1.15;
        }

        const jitterAmount = inst.name === 'Kick' ? 0.04 : 0.08;
        currentState.velocity = humanizeVelocity(currentState.velocity, jitterAmount);
    }

    return currentState;
}

/**
 * @param {number} step
 * @param {number} bpm
 * @param {any} ts
 * @param {any} groove
 */
export function calculateStepDuration(step, bpm, ts, groove) {
    const sixteenthSec = 0.25 * (60.0 / bpm);
    let duration = sixteenthSec;

    if (groove.swing > 0) {
        if (ts.stepsPerBeat === 4) {
            const shift = (sixteenthSec / 3) * (groove.swing / 100);
            if (groove.swingSub === '16th') {
                duration += step % 2 === 0 ? shift : -shift;
            } else {
                // 8th note swing logic: Weighted 'Loping' distribution across 4 subdivisions
                const subIndex = step % ts.stepsPerBeat;
                const weights = [1.5, 0.5, -0.5, -1.5];
                duration += shift * weights[subIndex];
            }
        } else if (ts.stepsPerBeat === 3) {
            const shift = (sixteenthSec / 3) * (groove.swing / 100);
            duration +=
                groove.swingSub === '16th'
                    ? step % 2 === 0
                        ? shift
                        : -shift // 16th note swing over compound meters doesn't map exactly to '8th note' logic the same way
                    : step % ts.stepsPerBeat === 0
                      ? shift // on macro beat
                      : step % ts.stepsPerBeat === 2
                        ? -shift // 3rd triplet part
                        : 0; // middle triplet stays same or slightly nudged based on deeper logic, simple offset for now
        }
    }

    return duration;
}

/**
 * @param {any} playback
 * @param {any} groove
 */
export function calculatePocketOffset(playback, groove) {
    let pocketOffset = calculateTimingOffset('drums', groove.pocket, playback.bandIntensity);
    const strategy = getStrategy(groove);
    if (strategy?.config.dillaFeel) {
        pocketOffset += 0.015;
    }
    return pocketOffset;
}

/**
 * @param {number} seed
 * @param {string} genreFeel
 * @param {number} complexity
 * @param {number} [intensity=1.0]
 */
/**
 * @param {number} seed
 * @param {string} genreFeel
 * @param {number} complexity
 * @param {number} [intensity=1.0]
 */
export function getDrumMotif(seed, genreFeel, complexity, intensity = 1.0) {
    const mockGroove = { genreFeel };
    const strategy = getStrategy(mockGroove);
    if (strategy?.getMotif) {
        return strategy.getMotif(seed, complexity, intensity);
    }
    return 0;
}
