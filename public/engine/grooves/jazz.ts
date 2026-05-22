import {
    applyStandardBase,
    binaryTier,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
    getPhraseSeed,
    INTENSITY_BANDS,
    makeMotifSelector,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.05,
    // why: jazz at low intensity is intentional ride emptiness — a ballad ride
    // pattern with "space" between hits. The entropy phase's ~4% random snare
    // sprinkle at intensity 0.3 contaminates that emptiness with phantom hits
    // that no jazz drummer would play. 0.45 lets medium-tempo swing (strictly
    // above 0.45) keep its conversational comping chatter, while quiet ballad
    // sections at or below 0.45 breathe. (Worth revisiting at 0.5 if a 0.46–0.5
    // ballad still feels too speckled — see drums.md P0 #2 follow-up.)
    // (drums.md P0 #2)
    suppressEntropyBelow: 0.45,
};

/**
 * Jazz motifs: 0=Relaxed Swing, 1=Swinging, 2=Driving, 3=Bebop, 4=Hard Bop
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.6, 0.75),
    {
        maxIntensity: INTENSITY_BANDS.HIGH,
        picks: [[0.3, 0], [0.6, 1], [0.85, 2], 3],
    },
    {
        picks: [[0.2, 0], [0.4, 1], [0.6, 2], [0.8, 3], 4],
    },
]);

export function applyOverrides(context: GrooveContext, state: DrumStepBase): DrumStepBase {
    const result = applyStandardBase(context, state);
    if (result.muted) {
        return result.base;
    }
    const { base } = result;

    const {
        isBeatStart,
        isBackbeat,
        isOffbeat,
        beatIndex,
        barIndex,
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

    // In compound meters, the "skip" beat is typically the last beat of a grouping
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

        if (context.playback.bpm && context.playback.bpm > 180 && isSkipBeat && roll(0.4)) {
            shouldPlay = false;
        }
    } else if (context.inst.name === 'HiHat') {
        shouldPlay = false;
        if (isBackbeat) {
            shouldPlay = true;
            // why: a foot "chick" is a soft timekeeping undercurrent, not an
            // accent — the ride leads, the pedal supports. Held at ~0.6 so it
            // sits under the ride rather than punching through (the old 1.0
            // was a stick-hat velocity, too loud for a foot articulation).
            velocity = 0.6;
            // The foot "chick" — the hi-hat closed by the pedal on 2 & 4, the
            // backbone of swing time. Epic 4 S3 gives it a real pedal-chick
            // voice; before, this step emitted a plain stick-closed hat
            // despite being a foot articulation.
            soundName = 'HiHatPedal';
            // Humanize the foot chick: slightly ahead of the beat for driving
            // energy. Seeded on (barIndex, beatIndex) — deterministic phrasing
            // so looped playback and critique tests reproduce exactly, rather
            // than a raw Math.random() jitter.
            const chickSeed = getPhraseSeed(sectionSeed, barIndex, 1, beatIndex);
            instTimeOffset -= 0.005 + chickSeed * 0.005;
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
                if (context.playback.bpm && context.playback.bpm > 175) {
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
                if (context.playback.bpm && context.playback.bpm > 175) {
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

        // why: capture velocity before the Sidestick trim so the Brush branch below can
        // restore it without depending on the exact `*0.8` factor. Prevents silent breakage
        // if a future patch adds another velocity edit between these two branches.
        const preTrimVelocity = velocity;
        if (shouldPlay && intensity < 0.4) {
            soundName = 'Sidestick';
            velocity *= 0.8;
        }

        // why: jazz ballad / quiet swing under intensity 0.35 and BPM < 130 should read as
        // brushwork, not sidestick. Real brush playing has a sweep texture that sidestick
        // (a hard wood-on-rim click) completely misses. drums.md P1 #7 fix sketch:
        // route the snare lane through Brush when intensity < 0.35 && bpm < 130.
        // BPM gate keeps fast bebop (>=130) on sidestick so the rhythmic placement stays crisp.
        const bpm = context.playback.bpm;
        if (shouldPlay && intensity < 0.35 && bpm !== undefined && bpm < 130) {
            soundName = 'Brush';
            // why: brush voice has its own internal velocity floor; restore the pre-trim
            // velocity (the Sidestick branch's *0.8 doesn't apply when Brush wins).
            velocity = preTrimVelocity;
        }

        // THE BIG FINISH (Ending Signaling)
        if (context.playback.songMode && context.playback.isEndingPending) {
            if (isOffbeat && beatIndex === lastBeatIndex && roll(0.7)) {
                shouldPlay = true;
                velocity = 1.1;
                instTimeOffset -= 0.005;
            }
        }
    }

    if (shouldPlay && context.inst.name === 'Snare' && intensity < 0.35) {
        // why: preserve the Brush routing decided above — only fall back to Sidestick
        // when Brush wasn't selected (e.g. bpm >= 130 fast ballad-but-driving case).
        if (soundName !== 'Brush') {
            soundName = 'Sidestick';
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
