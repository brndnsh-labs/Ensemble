import { TIME_SIGNATURES } from '../config.js';
import { getState } from '../state.js';
import { calculateTimingOffset, getStepsPerMeasure } from '../utils.js';
import * as acoustic from './grooves/acoustic.js';
import * as blues from './grooves/blues.js';
import * as disco from './grooves/disco.js';
import * as funk from './grooves/funk.js';
import * as jazz from './grooves/jazz.js';
import * as latin from './grooves/latin.js';
import * as neoSoul from './grooves/neo-soul.js';
import * as reggae from './grooves/reggae.js';
import * as rock from './grooves/rock.js';
import * as skaPunk from './grooves/ska-punk.js';
import { DEFAULT_CONFIG } from './grooves/utils.js';

const strategies = {
    Jazz: jazz,
    Blues: blues,
    Rock: rock,
    Funk: funk,
    'Neo-Soul': neoSoul,
    'Hip Hop': neoSoul,
    Acoustic: acoustic,
    Disco: disco,
    Reggae: reggae,
    'Bossa Nova': latin,
    Latin: latin,
    'Ska-Punk': skaPunk,
};

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

function humanizeVelocity(vel, amount = 0.05) {
    return vel * (1.0 + (Math.random() - 0.5) * amount);
}

export function applyGrooveOverrides({
    step,
    inst,
    stepVal,
    playback,
    groove,
    isDownbeat,
    isQuarter,
    isBackbeat,
    isGroupStart,
    beatIndex,
}) {
    const { soloist } = getState();
    const stateObj = getState();
    const arrangerState = stateObj?.arranger || { timeSignature: '4/4' };
    const ts = TIME_SIGNATURES[arrangerState.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBar = getStepsPerMeasure(arrangerState.timeSignature);
    const loopStep = step % stepsPerBar;

    // Semantic abstractions
    const isBeatStart = ts.isCompound ? isGroupStart : isQuarter;
    const isOffbeat = loopStep % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat / 2);
    const activeBeatIndex = ts.isCompound
        ? Math.floor(loopStep / (ts.stepsPerBeat * ts.grouping[0]))
        : beatIndex;

    // 16th note subdivisions
    const isEOfBeat = loopStep % ts.stepsPerBeat === 1;
    const isAOfBeat = loopStep % ts.stepsPerBeat === ts.stepsPerBeat - 1;

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

    // Calculate current section length to determine turnarounds dynamically instead of hardcoded 4 bars
    const entry = arrangerState.stepMap?.find((e) => step >= e.start && step < e.end);
    let measuresInSection = 4; // default
    if (entry) {
        measuresInSection = Math.max(1, (entry.end - entry.start) / stepsPerBar);
    }
    const barInSection = Math.floor((step - (entry ? entry.start : 0)) / stepsPerBar);

    const justFinishedTurnaround = groove.creativity && barInSection === 0 && isFirstStepOfNewBar;
    const isTurnaround = groove.creativity && barInSection === measuresInSection - 1;

    if (justFinishedTurnaround && isDownbeat) {
        if (inst.name === 'Kick') {
            currentState.shouldPlay = true;
            currentState.velocity = 1.35;
        } else if (inst.name === 'HiHat' || inst.name === 'Open') {
            currentState.shouldPlay = true;
            currentState.soundName = 'Open';
            currentState.velocity = 1.2;
        }
    }

    const sectionId = entry?.chord?.sectionId;
    let sectionSeed = groove.sectionSeedMap?.[sectionId];
    if (sectionSeed === undefined) {
        sectionSeed = ((barIndex * 137 + (groove.creativity ? 42 : 0)) % 256) / 256;
    }

    const context = {
        step,
        inst,
        stepVal,
        playback,
        groove,
        isDownbeat,
        isBeatStart,
        isGroupStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex: activeBeatIndex,
        stepsPerBar,
        loopStep,
        drumComplexity,
        barIndex,
        isFirstStepOfNewBar,
        justFinishedTurnaround,
        sectionSeed,
        isTurnaround,
        isSoloistBusy: soloist.enabled && soloist.busySteps > 0,
    };

    if (strategy) {
        currentState = strategy.applyOverrides(context, currentState);
    }

    if (
        groove.creativity &&
        !inst.muted &&
        !currentState.shouldPlay &&
        Math.random() <
            playback.bandIntensity *
                config.entropyMultiplier *
                (config.blockAdjacentSnare ? 0.7 : 1.0)
    ) {
        const isSyncopated = loopStep % 2 === 1;
        const subdivision = stepsPerBar / (arrangerState.timeSignature.includes('/8') ? 2 : 4);
        const isHeavySync = loopStep % subdivision === Math.floor(subdivision / 2);

        // Simple hardcoded checks adapted to dynamic offset from backbeat
        let isBackbeatAdjacent = false;
        let isEOfBeat = false;

        if (arrangerState.timeSignature === '4/4') {
            isBackbeatAdjacent = [3, 5, 11, 13].includes(loopStep);
            isEOfBeat = [1, 9].includes(loopStep);
        }
        const blockSnare = config.blockAdjacentSnare && (isBackbeatAdjacent || isEOfBeat);

        if (inst.name === 'Snare' && isSyncopated && !blockSnare && !config.isLatin) {
            currentState.shouldPlay = true;
            currentState.velocity = 0.1 + Math.random() * 0.15;
            currentState.soundName = playback.bandIntensity < 0.4 ? 'Sidestick' : 'Snare';
        } else if (
            (inst.name === 'HiHat' || inst.name === 'Open') &&
            isHeavySync &&
            !config.blockAdjacentSnare
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

export function calculatePocketOffset(playback, groove) {
    let pocketOffset = calculateTimingOffset('drums', groove.pocket, playback.bandIntensity);
    const strategy = getStrategy(groove);
    if (strategy?.config.dillaFeel) {
        pocketOffset += 0.015;
    }
    return pocketOffset;
}

export function getDrumMotif(seed, genreFeel, complexity, intensity = 1.0) {
    const mockGroove = { genreFeel };
    const strategy = getStrategy(mockGroove);
    if (strategy?.getMotif) {
        return strategy.getMotif(seed, complexity, intensity);
    }
    return 0;
}
