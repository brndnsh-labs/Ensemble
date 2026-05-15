import type { EnsembleState, StepInfo } from '../types.js';
import { calculateTimingOffset, getFrequency, getMidi } from '../utils.js';
import { getScaleForChord } from './theory-scales.js';

/**
 * BASS ENGINE - Procedural Line Generation
 *
 * Logic flow:
 * 1. Determine register based on genre/intensity.
 * 2. Identify target notes (Root/5th/Approach).
 * 3. Generate rhythm cell.
 * 4. Select pitches with voice-leading constraints.
 */

// (Old getScaleForBass removed, using imported version)
import { resolveMappedStyle, SMART_BASS_STYLE_MAP, TIME_SIGNATURES } from '../config.js';
import { checkBassActiveStyle, getBassNoteStyle } from './bass-styles.js';

/**
 * Resets the internal generative state of the bass.
 */
export function resetBassState(state: EnsembleState): void {
    const { bass } = state;
    bass.busySteps = 0; // @worker-mutation
    bass.lastFreq = null; // @worker-mutation
    bass.lastMidiPlayed = null; // @worker-mutation
}

export function isBassActive(
    state: EnsembleState,
    style: string,
    step: number,
    stepInChord: number,
    stepInfo?: StepInfo,
    coordination?: any,
): boolean {
    const { playback, groove, arranger } = state;

    // Rhythmic Yielding: Lock to Kick if available
    if (coordination?.kickHit) {
        return true;
    }

    if (style === 'smart') {
        style = resolveMappedStyle(SMART_BASS_STYLE_MAP, groove.genreFeel, groove.lastDrumPreset);
    }

    const signatures: any = TIME_SIGNATURES;
    const ts = signatures[arranger.timeSignature] || signatures['4/4'];
    const intBeat = stepInfo
        ? stepInfo.beatIndex
        : Math.floor((step % (ts.beats * ts.stepsPerBeat)) / ts.stepsPerBeat);
    const isQuarter = stepInfo ? stepInfo.isBeatStart : step % ts.stepsPerBeat === 0;
    const is8th = step % (ts.stepsPerBeat / 2) === 0;

    return checkBassActiveStyle(
        style,
        step,
        stepInChord,
        stepInfo || null,
        ts,
        intBeat,
        isQuarter,
        is8th,
        playback,
        groove,
    );
}

export function getBassNote(
    state: EnsembleState,
    chord: any,
    nextChord: any,
    _beatInMeasure: number,
    prevFreq: number | null,
    centerMidi: number,
    style: string,
    _chordIndex: number,
    step: number,
    stepInChord: number,
    context: any = {},
    stepInfo?: StepInfo,
): any {
    const { playback, groove, soloist, arranger } = state;
    if (!chord) {
        return null;
    }

    if (style === 'smart') {
        style = resolveMappedStyle(SMART_BASS_STYLE_MAP, groove.genreFeel, groove.lastDrumPreset);
    }

    const signatures: any = TIME_SIGNATURES;
    const ts = signatures[arranger.timeSignature] || signatures['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    const stepInMeasure = stepInfo ? stepInfo.mStep : step % stepsPerMeasure;
    const intBeat = Math.floor(stepInMeasure / ts.stepsPerBeat);
    const isDownbeat = stepInfo ? stepInfo.isMeasureStart : stepInMeasure === 0;

    // --- Intensity Mapping ---
    const globalIntensity = playback.bandIntensity || 0.5;
    const intensity = globalIntensity;

    let safeCenterMidi = centerMidi || 38; // Standard bass register anchor (Meat of the neck)

    // --- Genre-Specific Register Offsets ---
    if (style === 'dub' || (groove.genreFeel || '') === 'Reggae') {
        safeCenterMidi = 32;
    } else if (style === 'disco' || (groove.genreFeel || '') === 'Disco') {
        safeCenterMidi = 36;
    } else if (style === 'rocco') {
        safeCenterMidi = 45; // Prefer A/D strings area
    } else if (style === 'neo' || (groove.genreFeel || '') === 'Neo-Soul') {
        safeCenterMidi = 24; // Deep Neo-Soul register
    }

    // Shift center up as intensity builds
    // Rules of Taste: Cap intensity drift for grounding-heavy genres
    const isGroundingGenre = ['Reggae', 'Neo-Soul', 'Dub'].includes(groove.genreFeel || style);
    const registerShift = isGroundingGenre
        ? 0 // Neo-Soul/Reggae stay deep regardless of intensity
        : Math.floor(intensity * 7);
    safeCenterMidi += registerShift;

    // --- ENSEMBLE COORDINATION: Proactive Register Clamping ---
    const isExtendedRangeGenre = ['Reggae', 'Neo-Soul', 'Metal'].includes(groove.genreFeel);
    const softMax = isExtendedRangeGenre ? 57 : 51;
    const softMin = isExtendedRangeGenre ? 23 : 28;

    while (safeCenterMidi > softMax) {
        safeCenterMidi -= 12;
    }
    while (safeCenterMidi < softMin) {
        safeCenterMidi += 12;
    }

    const prevMidi = prevFreq ? getMidi(prevFreq) : null;

    // Register Definitions (Rules of Taste)
    const absMin = 23; // Low B on 5-string
    const absMax = 57; // High A fill
    const comfortMin = 28; // Low E
    const comfortMax = 51; // Standard ceiling

    const isSectionStart = context && step === context.sectionStart;
    const allowSubRange = isDownbeat || isSectionStart;

    const clampAndNormalize = (
        midi: number,
        referenceMidi: number | null = null,
    ): { midi: number; weight: number } => {
        if (!Number.isFinite(midi)) {
            return { midi: safeCenterMidi, weight: 1.0 };
        }
        const pc = ((midi % 12) + 12) % 12;
        const targetRef = referenceMidi !== null ? referenceMidi : safeCenterMidi;
        const octaveBase = Math.floor(targetRef / 12) * 12;
        const currentRootPC = chord.rootMidi % 12;

        const candidates: { midi: number; weight: number }[] = [];
        for (let o = -24; o <= 24; o += 12) {
            const c = octaveBase + o + pc;
            if (c >= absMin && c <= absMax) {
                let weight = 1.0;

                // 1. Distance from Anchor
                const distFromCenter = Math.abs(c - safeCenterMidi);
                weight *= 1.0 - distFromCenter / 48;

                // 2. Hand Position Bonus
                if (referenceMidi !== null) {
                    const stepDist = Math.abs(c - referenceMidi);
                    // Single Position Bonus (±5 semitones)
                    if (stepDist <= 5) {
                        weight *= 1.5;
                    }
                    // Stepwise Bonus (±2 semitones)
                    if (stepDist <= 2 && stepDist > 0) {
                        weight *= 2.0; // Stronger stepwise bonus for voice leading
                    }
                    // Jump Penalty
                    if (stepDist > 12) {
                        weight *= 0.4;
                    }

                    // Asymmetric Gravity: Penalize upward leaps specifically if above center
                    if (c > safeCenterMidi && c > referenceMidi) {
                        weight *= 0.7; // Downward gravity to pull back to the "Meat"
                    }
                }

                // 3. Comfort Zone vs Extended Range
                const inComfortZone = c >= comfortMin && c <= comfortMax;
                const isGroundingStyleInside =
                    ['Reggae', 'Neo-Soul', 'Dub'].includes(groove.genreFeel) ||
                    style === 'neo' ||
                    style === 'dub';

                if (isGroundingStyleInside && c < comfortMin) {
                    weight *= 5.0; // Extremely strong basement bonus
                } else if (!inComfortZone) {
                    if (c < comfortMin) {
                        const subPenalty = allowSubRange ? 0.2 : 0.8;
                        weight *= 1.0 - subPenalty;
                    } else {
                        // More aggressive Attic Penalty for MIDI > 51
                        const highPenalty = intensity > 0.85 ? 0.2 : 0.9;
                        weight *= 1.0 - highPenalty;
                    }
                }

                // 4. Interval Stability Bonus (Target Root/5th)
                if (pc === currentRootPC || pc === (currentRootPC + 7) % 12) {
                    const isGrounding = ['neo', 'dub'].includes(style);
                    weight *= isGrounding ? 1.1 : 1.5;
                }

                // 5. Style Priority Boost
                if (c === midi) {
                    weight *= 5.0;
                }

                if (weight > 0) {
                    candidates.push({ midi: c, weight });
                }
            }
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => b.weight - a.weight);
            return candidates[0];
        }

        return { midi: Math.max(absMin, Math.min(absMax, octaveBase + pc)), weight: 0.1 };
    };

    const clampAndNormalizeMidi = (midi: number, referenceMidi: number | null = null): number => {
        return clampAndNormalize(midi, referenceMidi).midi;
    };

    const normalizeToRange = (midi: number): number => {
        if (!Number.isFinite(midi)) {
            return safeCenterMidi;
        }

        // Neck Drift Prevention: Balance previous position with intended center
        const isGrounding = ['Reggae', 'Neo-Soul', 'Dub'].includes(groove.genreFeel || style);
        const centerWeight = isGrounding ? 0.8 : 0.4;
        const targetRef =
            prevMidi !== null
                ? prevMidi * (1.0 - centerWeight) + safeCenterMidi * centerWeight
                : safeCenterMidi;

        const pc = ((midi % 12) + 12) % 12;
        const octaves = [
            Math.floor(targetRef / 12) * 12,
            Math.floor(targetRef / 12) * 12 - 12,
            Math.floor(targetRef / 12) * 12 + 12,
            Math.floor(targetRef / 12) * 12 - 24,
            Math.floor(targetRef / 12) * 12 + 24,
        ];

        let bestCandidate = octaves[0] + pc;
        let minDiff = Math.abs(bestCandidate - targetRef);
        // Initial gravity check for the first candidate
        if (bestCandidate > targetRef) {
            minDiff += 3.0; // Asymmetrical gravity penalty for going up
        }

        for (let i = 1; i < octaves.length; i++) {
            const cand = octaves[i] + pc;
            let diff = Math.abs(cand - targetRef);

            // Asymmetrical Gravity: Penalize jumping up to break "staircase" progressions
            if (cand > targetRef) {
                diff += 3.0;
            }

            // Grounding Bias: heavily favor the lower candidate if it's in the basement (<= 35)
            if (isGrounding && cand <= 35 && cand >= absMin && bestCandidate > 35) {
                diff -= 12;
            }

            if (diff < minDiff) {
                minDiff = diff;
                bestCandidate = cand;
            }
        }

        return clampAndNormalizeMidi(bestCandidate, prevMidi);
    };

    const rootToNormalize =
        chord.bassMidi !== null && chord.bassMidi !== undefined ? chord.bassMidi : chord.rootMidi;
    const baseRoot = normalizeToRange(rootToNormalize);
    const scale = getScaleForChord(state, chord, nextChord, style);
    const beatsInChord = Math.round(chord.beats);
    const velocity = intBeat % 2 === 1 ? 1.15 : 1.0;

    /**
     * @param muted - Palm-mute amount: 0 (open) to 1 (fully muted).
     */
    const result = (
        freq: number,
        durationMultiplier: number | null = null,
        velocityParam: number = 1.0,
        muted: number = 0,
        bendStartInterval: number = 0,
    ) => {
        let timingOffset = calculateTimingOffset('bass', groove.pocket, intensity);
        if (style === 'neo' || groove.genreFeel === 'Neo-Soul') {
            timingOffset += 0.01 + intensity * 0.015;
        }

        let durationSteps: number = 1;
        if (durationMultiplier !== null) {
            durationSteps = durationMultiplier;
        } else {
            if (style === 'whole') {
                durationSteps = chord.beats * ts.stepsPerBeat;
            } else if (style === 'half') {
                durationSteps = stepsPerMeasure / 2;
            } else if (style === 'arp') {
                durationSteps = ts.stepsPerBeat;
            } else if (style === 'rock') {
                durationSteps = ts.stepsPerBeat * 0.45;
            } else if (style === 'funk') {
                durationSteps = 0.8;
            } else if (
                (style as any) === 'disco' ||
                style === 'rocco' ||
                style === 'metal' ||
                style === 'neo' ||
                style === 'walking-ska' ||
                style === 'quarter'
            ) {
                durationSteps =
                    style === 'quarter' || (style as any) === 'blues'
                        ? ts.stepsPerBeat * 0.4
                        : style === 'neo'
                          ? ts.stepsPerBeat * 0.5
                          : 0.8;
            } else {
                durationSteps = ts.stepsPerBeat;
            }
        }

        if (intensity < 0.4) {
            if (style === 'rock') {
                durationSteps = ts.stepsPerBeat * 0.4;
            } else if (style === 'funk') {
                durationSteps = 0.7;
            } else if (style === 'bossa') {
                durationSteps = durationMultiplier
                    ? durationMultiplier * (ts.stepsPerBeat / 4)
                    : ts.stepsPerBeat;
            }
        }

        const intensityFactor = 0.6 + intensity * 0.7;
        const finalVel = Math.min(1.25, velocityParam * velocity * intensityFactor);
        const isLongStyle = ['acoustic', 'whole', 'half'].includes(style);
        const maxSafeDuration =
            style === 'quarter'
                ? ts.stepsPerBeat * 0.45
                : isLongStyle
                  ? ts.stepsPerBeat * 1.95
                  : ts.stepsPerBeat * 0.95;
        const safeDuration = Math.min(durationSteps, maxSafeDuration);

        return {
            freq,
            midi: getMidi(freq),
            velocity: finalVel,
            durationSteps: safeDuration,
            timingOffset,
            muted,
            bendStartInterval,
        };
    };

    const isSoloistBusy = (soloist.busySteps || 0) > 0;

    const withOctaveJump = (note: number): number => {
        if (isSoloistBusy || intensity < 0.4) {
            return note;
        }
        if (Math.random() < 0.02 + intensity * 0.08) {
            const direction = note > 48 ? -1 : Math.random() < 0.5 ? 1 : -1;
            const shifted = note + 12 * direction;
            const ceiling = style === 'neo' || groove.genreFeel === 'Neo-Soul' ? 42 : 55;
            if (shifted >= 36 && shifted <= ceiling) {
                return shifted;
            }
        }
        return note;
    };

    if (style === 'neo' || groove.genreFeel === 'Neo-Soul') {
        const isUpbeat = step % ts.stepsPerBeat !== 0;
        const isSecondaryAnchor = stepInMeasure / ts.stepsPerBeat === 2;
        if (isDownbeat || isSecondaryAnchor) {
            return result(getFrequency(baseRoot), 0.9, 1.15 + intensity * 0.1);
        }
        if (isUpbeat) {
            const hitProb = 0.2 + intensity * 0.4 + (playback.complexity || 0.5) * 0.3;
            if (Math.random() < hitProb && !isSoloistBusy) {
                const rand = Math.random();
                let note = baseRoot;
                let isGhost = false;
                let dur = 0.4;
                if (rand > 0.7) {
                    note = baseRoot + 7;
                } else if (rand > 0.4 && (playback.complexity || 0.5) > 0.6) {
                    note = scale.includes(2) ? baseRoot + 2 : baseRoot + 10;
                    dur = 0.2;
                } else {
                    isGhost = true;
                }
                const res = result(
                    getFrequency(clampAndNormalizeMidi(note, prevMidi)),
                    dur,
                    velocity * (isGhost ? 0.6 : 0.9),
                    isGhost ? 1 : 0,
                );
                res.timingOffset += 0.01 + intensity * 0.01;
                return res;
            }
        }
        return null;
    }

    const isSameAsPrev = (midi: number | null) => !!prevMidi && midi === prevMidi;
    const kickInst = (groove.instruments || []).find((i: any) => i.name === 'Kick');
    const hasKickTrigger = !!(
        kickInst?.steps && kickInst.steps[step % (groove.measures * stepsPerMeasure)] > 0
    );

    if ((style === 'rock' || style === 'funk') && hasKickTrigger) {
        const kickVel =
            kickInst.steps[step % (groove.measures * stepsPerMeasure)] === 2 ? 1.25 : 1.15;
        const dynamicKickVel = Math.max(0.8, kickVel * (0.7 + intensity * 0.3));
        return result(getFrequency(withOctaveJump(baseRoot)), null, dynamicKickVel);
    } else if (
        (style === 'rock' || style === 'funk') &&
        !hasKickTrigger &&
        intensity < 0.4 &&
        !isDownbeat
    ) {
        if (isSoloistBusy || Math.random() < 0.6) {
            return null;
        }
        if (Math.random() < 0.3) {
            return result(getFrequency(baseRoot), 1, 0.4, 1);
        }
    }

    if (style === 'blues') {
        const isUpbeat = stepInfo?.isOffbeat;
        if (hasKickTrigger) {
            const kickStepVal = kickInst.steps[step % (groove.measures * stepsPerMeasure)];
            const kickVel = kickStepVal === 2 ? 1.25 : 1.15;
            return result(
                getFrequency(baseRoot),
                null,
                Math.max(0.8, kickVel * (0.7 + intensity * 0.3)),
            );
        }
        if (stepInMeasure % ts.stepsPerBeat === 0 && !isUpbeat) {
            const beatInPattern = intBeat % 4;
            let targetInterval = 0;
            if (beatInPattern === 1) {
                targetInterval = scale.includes(7) ? 7 : 6;
            } else if (beatInPattern === 2) {
                targetInterval = scale.includes(9) ? 9 : 7;
            } else if (beatInPattern === 3) {
                targetInterval = scale.includes(10) ? 10 : 9;
            }
            if (intensity > 0.7 && Math.random() < 0.4) {
                targetInterval = scale[Math.floor(Math.random() * scale.length)];
            }
            return result(
                getFrequency(clampAndNormalizeMidi(baseRoot + targetInterval, prevMidi)),
                ts.stepsPerBeat * 0.45,
                velocity,
            );
        }
        if (isUpbeat) {
            const res = result(
                getFrequency(clampAndNormalizeMidi(prevMidi || baseRoot, prevMidi)),
                0.8,
                velocity * 0.8,
                1,
            );
            res.timingOffset += 0.005;
            return res;
        }
    }

    const isStraightStyle = ['rock', 'half', 'whole', 'arp', 'quarter', 'disco', 'neo'].includes(
        style,
    );
    if (
        stepInChord === 0 &&
        (isStraightStyle || style === 'funk') &&
        groove.genreFeel !== 'Reggae'
    ) {
        return result(
            getFrequency(withOctaveJump(baseRoot)),
            null,
            style === 'funk' ? 1.25 : 1.0 + intensity * 0.25,
        );
    }

    const styleResult = getBassNoteStyle(
        style,
        chord,
        nextChord,
        step,
        stepInChord,
        stepInfo || null,
        {
            withOctaveJump,
            isSameAsPrev,
            clampAndNormalize: clampAndNormalizeMidi,
            normalizeToRange,
        },
        ts,
        stepsPerMeasure,
        intBeat,
        step % ts.stepsPerBeat === 0,
        step % (ts.stepsPerBeat / 2) === 0,
        stepInMeasure % ts.stepsPerBeat === 0,
        isDownbeat,
        stepInMeasure,
        step % ts.stepsPerBeat,
        baseRoot,
        prevFreq || 0,
        prevMidi || baseRoot,
        centerMidi,
        absMin,
        absMax,
        scale,
        playback,
        groove,
        soloist,
        intensity,
        velocity,
        isSoloistBusy,
        beatsInChord,
        result,
        stepInMeasure % ((ts.grouping?.[0] || ts.beats) * ts.stepsPerBeat) === 0,
        hasKickTrigger,
        kickInst ?? null,
    );
    if (styleResult !== undefined) {
        return styleResult;
    }

    const isLastBeatOfMeasure = intBeat === ts.beats - 1;
    const isEndOfChord = intBeat === beatsInChord - 1;
    const isEighthSkip = stepInMeasure % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat * 0.5);
    const isApproachPoint =
        (stepInMeasure % ts.stepsPerBeat === 0 && (isLastBeatOfMeasure || isEndOfChord)) ||
        isEighthSkip ||
        step % 16 === 14;

    if (isApproachPoint && nextChord) {
        const nextTarget = nextChord.bassMidi ?? nextChord.rootMidi;
        const targetRoot = normalizeToRange(nextTarget);
        let chromaticProb =
            (isSoloistBusy ? 0.4 : 0.6) +
            ((soloist.tension || 0) + intensity * 0.3 + (playback.complexity || 0.5) * 0.2) * 0.3;
        if (intensity > 0.75 && ['Jazz', 'Blues'].includes(groove.genreFeel)) {
            chromaticProb = 0.95;
        }

        if (
            Math.random() < chromaticProb &&
            (['Jazz', 'Blues'].includes(groove.genreFeel) ||
                (soloist.tension || 0) + intensity * 0.3 > 0.7)
        ) {
            const choices = [
                { midi: targetRoot - 5, weight: 0.5 },
                { midi: targetRoot - 1, weight: 1.0 },
                { midi: targetRoot + 1, weight: 1.0 },
            ];
            let tw = 0;
            for (let i = 0; i < choices.length; i++) {
                tw += choices[i].weight;
            }
            let r = Math.random() * tw;
            let approach = targetRoot - 1;
            for (const c of choices) {
                r -= c.weight;
                if (r <= 0) {
                    approach = c.midi;
                    break;
                }
            }
            approach = clampAndNormalizeMidi(withOctaveJump(approach), prevMidi);
            return result(
                getFrequency(approach),
                1,
                velocity,
                0,
                Math.random() < 0.2 && !isSoloistBusy ? (approach < targetRoot ? -1 : 1) : 0,
            );
        } else {
            const valid = [targetRoot - 5, targetRoot + 7, targetRoot + 5, targetRoot - 7].filter(
                (n) => n >= absMin && n <= absMax && !isSameAsPrev(n) && n % 12 !== baseRoot % 12,
            );
            return result(
                getFrequency(
                    withOctaveJump(
                        valid.length > 0
                            ? valid[Math.floor(Math.random() * valid.length)]
                            : targetRoot - 5,
                    ),
                ),
                null,
                velocity,
            );
        }
    }

    if (intBeat > 0) {
        let candidates: { midi: number; weight: number }[] = scale
            .map((pc: number) => clampAndNormalize(baseRoot + pc, prevMidi))
            .filter((n) => !isSameAsPrev(n.midi));
        if (isSoloistBusy) {
            candidates = candidates.filter((n) => {
                const pc = n.midi % 12,
                    rpc = baseRoot % 12;
                return pc === rpc || pc === (rpc + 7) % 12;
            });
            if (candidates.length === 0) {
                candidates = [baseRoot, baseRoot + 7, baseRoot - 5].map((n) =>
                    clampAndNormalize(n, prevMidi),
                );
            }
        }
        if (candidates.length > 0) {
            // Priority 1: Hand position (Weight already includes stepwise bonus)
            // Priority 2: Proximity to Center
            candidates.sort((a, b) => b.weight - a.weight);
            return result(
                getFrequency(
                    withOctaveJump(
                        candidates[Math.floor(Math.random() * Math.min(2, candidates.length))].midi,
                    ),
                ),
                null,
                velocity,
            );
        }
    }
    return result(getFrequency(withOctaveJump(baseRoot)), null, velocity);
}
