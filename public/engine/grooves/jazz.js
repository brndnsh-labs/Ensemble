import {
    applyStandardBase,
    DEFAULT_CONFIG,
    INTENSITY_BANDS,
    makeMotifSelector,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.05,
};

/**
 * Jazz motifs: 0=Relaxed Swing, 1=Swinging, 2=Driving, 3=Bebop, 4=Hard Bop
 * @type {(seed: number, complexity: number, intensity?: number) => number}
 */
export const getMotif = makeMotifSelector([
    {
        maxIntensity: 0.6,
        picks: [
            [0.75, 0],
            [1.0, 1],
        ],
    },
    {
        maxIntensity: INTENSITY_BANDS.HIGH,
        picks: [
            [0.3, 0],
            [0.6, 1],
            [0.85, 2],
            [1.0, 3],
        ],
    },
    {
        picks: [
            [0.2, 0],
            [0.4, 1],
            [0.6, 2],
            [0.8, 3],
            [1.0, 4],
        ],
    },
]);

/**
 * @param {any} context
 * @param {import('../../types.js').EnsembleState & any} state
 * @returns {any}
 */
export function applyOverrides(context, state) {
    const { base, muted } = applyStandardBase(context, state);
    if (muted) {
        return base;
    }

    const {
        isBeatStart,
        isBackbeat,
        isOffbeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isSoloistBusy,
        stepsPerBar,
        loopStep,
        mStep,
        tsConfig,
        isCompound,
        stepInGroup,
        groupIndex,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity, halfBarStep } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const lastBeatIndex = Math.max(1, Math.round(stepsPerBar / 4) - 1);
    const isPulse = tsConfig?.pulse?.includes(mStep);

    // In compound meters, the "skip" beat is typically the last beat of a grouping (e.g., step 4 in a 6/8 where grouping is [3,3] and stepsPerBeat=2, so mStep 4 is the third 8th note)
    let isSkipBeat = false;
    let isRideStep = false;

    if (isCompound) {
        const groupSteps = (tsConfig?.grouping?.[groupIndex] || 3) * (tsConfig?.stepsPerBeat || 2);
        isSkipBeat = stepInGroup === groupSteps - 1; // Last step of the group
        isRideStep = isPulse || isSkipBeat;
    } else {
        isSkipBeat = isOffbeat && beatIndex % 2 !== 0;
        isRideStep = isBeatStart || isSkipBeat;
    }

    if (context.inst.name === 'Open') {
        shouldPlay = false;
        soundName = 'Ride';

        if (isTurnaround && loopStep >= halfBarStep) {
            // Drop ride for fill
        } else if (isRideStep) {
            const rideProb = isSkipBeat ? 0.6 + drumComplexity * 0.3 : 1.0;

            if (roll(rideProb)) {
                shouldPlay = true;
                if (isBackbeat) {
                    velocity = scaleVelocity(0.9, intensity, 0.2);
                } else if (
                    (isCompound && isPulse && groupIndex % 2 === 0) ||
                    (!isCompound && isBeatStart && beatIndex % 2 === 0)
                ) {
                    velocity = scaleVelocity(0.8, intensity, 0.15);
                } else {
                    velocity = 0.6 + drumComplexity * 0.1;
                }
            }
        }

        if (!isCompound) {
            if (
                (activeMotif === 1 && isOffbeat && beatIndex === 1) ||
                (activeMotif === 2 && isBeatStart && beatIndex === 2) ||
                (activeMotif === 3 && isOffbeat && beatIndex === lastBeatIndex)
            ) {
                velocity *= 1.2;
            }
        }

        if (context.playback.bpm > 180 && isSkipBeat && roll(0.4)) {
            shouldPlay = false;
        }
    } else if (context.inst.name === 'HiHat') {
        shouldPlay = false;
        if (isBackbeat) {
            shouldPlay = true;
            velocity = 1.0;
            // Humanize the foot chick: slightly ahead of the beat for driving energy
            instTimeOffset -= 0.005 + Math.random() * 0.005;
        }
    } else if (context.inst.name === 'Kick') {
        shouldPlay = false;
        const isFeatherStep = isCompound ? isPulse : isBeatStart;
        if (isFeatherStep) {
            shouldPlay = true;
            // Kick feathering: almost inaudible but felt
            velocity = scaleVelocity(0.12, intensity, 0.08);
        }

        if (
            isTurnaround &&
            ((isCompound && isPulse && groupIndex === (tsConfig?.grouping?.length || 2) - 1) ||
                (!isCompound && isBeatStart && beatIndex === lastBeatIndex))
        ) {
            shouldPlay = true;
            velocity = 0.95;
        } else if (!isCompound) {
            if (activeMotif === 1 && isOffbeat && beatIndex === 1 && sectionSeed > 0.5) {
                shouldPlay = true;
                velocity = scaleVelocity(0.75, intensity, 0.2);
            } else if (activeMotif === 4 && isOffbeat && beatIndex >= 2) {
                shouldPlay = true;
                velocity = scaleVelocity(0.85, Math.random(), 0.2);
            } else {
                // General Kick Bombs
                let bombProb = intensity * 0.12;
                if (isSoloistBusy) {
                    bombProb *= 1.4;
                }
                if (context.playback.bpm > 175) {
                    bombProb *= 0.3;
                }

                if (roll(bombProb) && isOffbeat && beatIndex % 2 !== 0) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.85, Math.random(), 0.25);
                }
            }
        } else {
            // Compound meter general kick bombs
            let bombProb = intensity * 0.12;
            if (isSoloistBusy) {
                bombProb *= 1.4;
            }
            if (roll(bombProb) && isSkipBeat) {
                shouldPlay = true;
                velocity = scaleVelocity(0.85, Math.random(), 0.25);
            }
        }
    } else if (context.inst.name === 'Snare') {
        shouldPlay = false;

        if (isTurnaround) {
            if (
                ((isBeatStart || isOffbeat) && beatIndex === lastBeatIndex - 1) ||
                (isOffbeat && beatIndex === lastBeatIndex)
            ) {
                if (roll(0.7)) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.6, Math.random(), 0.4);
                    if (isOffbeat && beatIndex === lastBeatIndex) {
                        velocity = 1.1;
                    }
                }
            }
        } else {
            if (activeMotif === 1 && isOffbeat && beatIndex === 1) {
                shouldPlay = true;
                velocity = scaleVelocity(0.7, intensity, 0.3);
            } else if (
                activeMotif === 2 &&
                ((isOffbeat && beatIndex === 0) || (isBeatStart && beatIndex === 2))
            ) {
                shouldPlay = true;
                velocity = scaleVelocity(0.6, intensity, 0.3);
            } else if (activeMotif === 3 && isOffbeat && beatIndex === lastBeatIndex) {
                shouldPlay = true;
                velocity = scaleVelocity(0.8, intensity, 0.3);
            } else if (activeMotif === 4 && isOffbeat && beatIndex < lastBeatIndex) {
                shouldPlay = true;
                velocity = scaleVelocity(0.5, Math.random(), 0.3);
            } else {
                let compProb = 0.1 + drumComplexity * 0.3;
                if (!isSoloistBusy) {
                    compProb += 0.2;
                }
                if (context.playback.bpm > 175) {
                    compProb *= 0.5;
                }

                if (
                    (isOffbeat && beatIndex === lastBeatIndex && roll(0.5 + compProb)) ||
                    (isOffbeat && beatIndex === 1 && roll(0.3 + compProb)) ||
                    (isOffbeat && beatIndex !== 1 && roll(compProb * 0.4))
                ) {
                    shouldPlay = true;
                    velocity = 0.25 + Math.random() * 0.3 + intensity * 0.2;
                }
            }
        }

        if (shouldPlay && intensity < 0.4) {
            soundName = 'Sidestick';
            velocity *= 0.8;
        }

        // 3. THE BIG FINISH (Ending Signaling)
        if (context.playback.songMode && context.playback.isEndingPending) {
            if (isOffbeat && beatIndex === lastBeatIndex && roll(0.7)) {
                shouldPlay = true;
                velocity = 1.1;
                instTimeOffset -= 0.005;
            }
        }
    }

    if (shouldPlay && context.inst.name === 'Snare' && intensity < 0.35) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
