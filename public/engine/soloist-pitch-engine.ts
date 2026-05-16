import type { GlobalContext } from '../state/playback.js';
import type { EnsembleState } from '../types.js';
import { applyBluesBends, calculateTimingOffset, getFrequency } from '../utils.js';
import type { SoloistIntent } from './soloist-config.js';
import { getSoloistRegisterProfile, STYLE_CONFIG } from './soloist-config.js';
import { generateExtraNotes, generateMelodicDevice } from './soloist-devices.js';
import {
    allowsSoloistPolyphony,
    isSoloistGuitarMode,
    isSoloistMonophonicMode,
    resolveSoloistMode,
} from './soloist-mode-policy.js';
import { getScaleForChord } from './theory-scales.js';

export interface DeviceBufferResult {
    buffer: any[];
    first: any;
    busySteps: number;
}

/**
 * Utility to generate a device buffer and compute busy steps.
 */
function applyDeviceBuffer(deviceType: string, contextOptions: any): DeviceBufferResult | null {
    const deviceBuffer = generateMelodicDevice(deviceType, contextOptions);
    if (deviceBuffer && deviceBuffer.length > 0) {
        const first: any = deviceBuffer[0];
        const busySteps =
            (Array.isArray(first) ? first[0].durationSteps : first.durationSteps || 1) - 1;
        return { buffer: deviceBuffer.slice(1), first, busySteps };
    }
    return null;
}

const CANDIDATE_WEIGHTS = new Float32Array(128);

// Stylistic interval arrays (hoisted to module scope to avoid re-allocation on every function call)
const srvIntervals = new Set([0, 3, 5, 6, 7, 10]);
const gilmourIntervals = new Set([0, 7]);
const slashIntervals = new Set([4, 9]);
const milesIntervals = new Set([2, 5, 9]);
const evansIntervals = new Set([2, 5, 6, 9]);
const alteredHookIntervals = new Set([1, 3, 6, 8]);

function pushUniqueDevice(devices: string[], device: string | null | undefined): void {
    if (device && !devices.includes(device)) {
        devices.push(device);
    }
}

export interface MotifDevicePrioritiesOptions {
    activeStyle: string;
    responseMode: string;
    responseSource: string;
    responseDirection: number;
    responseSignature: any;
    isResponseEntryTarget: boolean;
    isResponseCadenceTarget: boolean;
    intensity: number;
    isLineStyle: boolean;
    supportRole: string;
    seedNote: any;
}

/**
 * Bias later-loop devices toward phrase commentary instead of generic flourish.
 */
function buildMotifDevicePriorities(options: MotifDevicePrioritiesOptions): string[] {
    const {
        activeStyle,
        responseMode,
        responseSource,
        responseDirection,
        responseSignature,
        isResponseEntryTarget,
        isResponseCadenceTarget,
        intensity,
        isLineStyle,
        supportRole,
        seedNote,
    } = options;
    const priorities: string[] = [];
    if (activeStyle === 'rock' || activeStyle === 'shred') {
        return priorities;
    }
    const isLongArcRecall = responseSource === 'section' || responseSource === 'form';
    const hasTripletCarry = Boolean(responseSignature?.tripletCarry || seedNote?.tripletPlacement);
    const isCadenceComment = isResponseCadenceTarget || supportRole === 'cadence';
    const isEntryComment = isResponseEntryTarget || supportRole === 'anchor';

    if (isCadenceComment) {
        if (activeStyle === 'blues') {
            pushUniqueDevice(priorities, 'bluesCurl');
            pushUniqueDevice(priorities, 'slide');
        } else if (activeStyle === 'neo') {
            pushUniqueDevice(priorities, 'quartal');
            pushUniqueDevice(priorities, 'graceNote');
        } else if (activeStyle === 'bossa') {
            pushUniqueDevice(priorities, 'enclosure');
            pushUniqueDevice(priorities, 'slide');
        } else if (activeStyle === 'rock' || activeStyle === 'scalar') {
            pushUniqueDevice(priorities, 'slide');
            pushUniqueDevice(priorities, 'graceNote');
        } else {
            pushUniqueDevice(priorities, 'enclosure');
            pushUniqueDevice(priorities, 'chromaticEnclosure');
        }
    }

    if (hasTripletCarry && isLineStyle) {
        pushUniqueDevice(priorities, 'enclosure');
        pushUniqueDevice(priorities, 'run');
        if (activeStyle === 'jazz') {
            pushUniqueDevice(priorities, 'bebopScale');
        }
    }

    if (isEntryComment && !isCadenceComment) {
        if (activeStyle === 'neo') {
            pushUniqueDevice(priorities, 'graceNote');
            pushUniqueDevice(priorities, 'quartal');
        } else if (isLineStyle) {
            pushUniqueDevice(priorities, 'graceNote');
            pushUniqueDevice(priorities, 'enclosure');
        } else {
            pushUniqueDevice(priorities, 'graceNote');
            pushUniqueDevice(priorities, 'slide');
        }
    }

    if (responseMode === 'development' && !isCadenceComment) {
        if (isLineStyle) {
            pushUniqueDevice(priorities, 'run');
        }
        if (activeStyle === 'neo') {
            pushUniqueDevice(priorities, 'quartal');
        }
        if (activeStyle === 'blues') {
            pushUniqueDevice(priorities, 'slide');
        }
        if (
            activeStyle === 'bird' &&
            intensity > 0.82 &&
            !isLongArcRecall &&
            responseDirection !== 0
        ) {
            pushUniqueDevice(priorities, 'birdFlurry');
        }
    }

    if (responseDirection < 0 && isLineStyle) {
        pushUniqueDevice(priorities, 'chromaticFall');
    }

    return priorities;
}

/**
 * Primary entry point for pitch selection.
 */
export function selectPitchAndDevices(
    state: EnsembleState,
    step: number,
    rhythmNode: any,
    currentChord: any,
    nextChord: any,
    activeStyle: string,
    intensity: number,
    stepInChord: number,
    coordination: any,
    playback: GlobalContext,
    soloistState: any,
    groove: any,
    _arranger: any,
    stepsPerMeasure: number,
    stepsPerBeat: number,
    intent: SoloistIntent | null = null,
): any {
    if (!currentChord) {
        return null;
    }

    const styleConfigAny: any = STYLE_CONFIG;
    const config = { ...(styleConfigAny[activeStyle] || STYLE_CONFIG.scalar) };
    const registerProfile = getSoloistRegisterProfile(activeStyle);

    // Musical Intent Scaling:
    // Scale stylistic flourishes based on the performance intent (Conservative vs. Exploratory)
    if (intent) {
        config.deviceProb = (config.deviceProb || 0.1) * intent.embellishmentProb;
        config.doubleStopProb = (config.doubleStopProb || 0.1) * (0.5 + intensity * 0.5);
    }

    // Derived from the Rhythm Engine node
    const { velocity, durationSteps, isStrongBeat, vibrato } = rhythmNode;
    const isHeadBypass = Boolean(rhythmNode.isHeadBypass);
    const targetMidi = Number.isFinite(rhythmNode.targetMidi)
        ? Math.round(rhythmNode.targetMidi)
        : null;
    const seedNote = rhythmNode.seedNote || null;
    const sessionSeed = soloistState.session.seed;
    const loopCount = playback.currentLoopCount || 0;
    const soloistMode = resolveSoloistMode(soloistState.mode);
    const isGuitarMode = isSoloistGuitarMode(soloistMode);
    const isMonophonicMode = isSoloistMonophonicMode(soloistMode);
    const supportRole =
        seedNote?.supportHints?.role ||
        (rhythmNode.responseCadenceTarget
            ? 'cadence'
            : rhythmNode.responseEntryTarget
              ? 'anchor'
              : durationSteps >= stepsPerBeat * 2
                ? 'sustain'
                : isStrongBeat
                  ? 'accent'
                  : 'line');
    const sustainBias =
        seedNote?.supportHints?.sustainBias ??
        (supportRole === 'accent'
            ? 0.65
            : supportRole === 'sustain'
              ? 0.88
              : supportRole === 'anchor' || supportRole === 'cadence'
                ? 1.0
                : 0.4);

    let targetChord = currentChord;

    // Anticipation (Lookahead)
    const isLateInChord = stepInChord >= currentChord.beats * stepsPerBeat - 2;
    if (nextChord && isLateInChord && Math.random() < (config.anticipationProb || 0)) {
        targetChord = nextChord;
    }

    const minMidi = registerProfile.liveFloor;
    const maxMidi = registerProfile.liveCeiling;
    const lastMidi = soloistState.audio.lastMidiPlayed || 72;

    // Determine context
    const remainingSteps = coordination.sectionEnd - step;
    const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;
    const isSectionDownbeat =
        step === coordination.sectionStart &&
        soloistState.session.phrasing.transitionState === 'lead_in';
    const isBeatStart = isStrongBeat;
    const isProtectedSeedTone = Boolean(
        seedNote?.isAnchor ||
            isStrongBeat ||
            durationSteps >= stepsPerBeat ||
            (seedNote?.durationSteps || 0) >= stepsPerBeat,
    );
    const headMeasureHasTripletSeed = Boolean(
        isHeadBypass &&
            loopCount === 0 &&
            sessionSeed?.notes?.some((note: any) => {
                if (!note.tripletPlacement || sessionSeed.loopLengthSteps <= 0) {
                    return false;
                }
                const stepInLoop =
                    ((step % sessionSeed.loopLengthSteps) + sessionSeed.loopLengthSteps) %
                    sessionSeed.loopLengthSteps;
                const measureStart = stepInLoop - (stepInLoop % stepsPerMeasure);
                const noteStep =
                    ((note.step % sessionSeed.loopLengthSteps) + sessionSeed.loopLengthSteps) %
                    sessionSeed.loopLengthSteps;
                return noteStep >= measureStart && noteStep < measureStart + stepsPerMeasure;
            }),
    );

    // Helper to finalize note (formerly inline in getSoloistNote)
    const finalizeNote = (res: any): any => {
        if (!res) {
            return null;
        }
        const primary = Array.isArray(res) ? res[res.length - 1] : res;

        soloistState.audio.lastMidiPlayed = primary.midi; // @worker-mutation

        // Store interval for call & response tracking
        if (activeStyle === 'blues' && soloistState.session.currentPhrase.context) {
            soloistState.session.currentPhrase.context.lastInterval =
                ((primary.midi % 12) - (currentChord.rootMidi % 12) + 12) % 12; // @worker-mutation
        }

        let timingOffset = isHeadBypass
            ? seedNote?.timingOffset || 0
            : rhythmNode.timingOffset || 0;
        timingOffset += calculateTimingOffset('soloist', groove.pocket, intensity);

        // --- Greats Profiles: Timing ---
        if (activeStyle === 'blues' && soloistState.session.currentPhrase.context?.profile) {
            const profile = soloistState.session.currentPhrase.context.profile;
            if (profile === 'armstrong' && isBeatStart) {
                timingOffset += 0.015; // Louis drags behind the beat
            }
            if (profile === 'monk' && Math.random() < 0.3) {
                timingOffset += (Math.random() - 0.5) * 0.025; // Monk displacement
            }
        }

        // 1. Genre Gravity
        timingOffset += config.genreGravityOffset || 0;

        // 2. Rhythmic Rolling (Syncopation Lag)
        const stepInBeat = step % stepsPerBeat;
        const isSyncopated = stepInBeat % (stepsPerBeat / 2) !== 0;
        if (isSyncopated) {
            timingOffset += 0.007; // 7ms lag for 'e' and 'a'
        }

        // Ghost notes drag slightly more
        if (primary.velocity < 0.7) {
            timingOffset += 0.005; // 5ms drag
        }

        // 3. Style-Specific Jitter & Intensity-Driven Tightness
        if (config.timingJitter !== undefined) {
            const tightness = intensity;
            const jitterScale = 1.0 - tightness;
            const jitterMs = config.timingJitter * jitterScale;
            timingOffset += (Math.random() - 0.5) * (jitterMs / 1000);
        }

        primary.timingOffset = (primary.timingOffset || 0) + timingOffset;
        const carriedTripletPlacement = isHeadBypass
            ? seedNote?.tripletPlacement
            : rhythmNode.tripletPlacement;
        if (carriedTripletPlacement && !primary.tripletPlacement) {
            primary.tripletPlacement = carriedTripletPlacement;
        }

        if (!primary.isDoubleStop) {
            soloistState.audio.lastFreq = getFrequency(primary.midi); // @worker-mutation
        }

        applyBluesBends(primary, activeStyle, currentChord);

        return res;
    };

    // Harmonic Anticipation for final measures
    if (
        isFinalMeasure &&
        soloistState.session.phrasing.transitionState === 'lead_in' &&
        remainingSteps <= 2 &&
        coordination.stepCoordination?.upcomingSectionFirstChord
    ) {
        targetChord = coordination.stepCoordination.upcomingSectionFirstChord;
    }

    // --- Pitch Selection ---
    CANDIDATE_WEIGHTS.fill(0);

    const scaleIntervals = getScaleForChord(state, targetChord, null, activeStyle);
    let scaleMask = 0;
    for (let i = 0; i < scaleIntervals.length; i++) {
        scaleMask |= 1 << scaleIntervals[i];
    }
    const rootMidi = targetChord.rootMidi;
    let totalWeight = 0;

    const loopLift = Math.min(playback.currentLoopCount || 0, 3) * registerProfile.liveLoopLift;
    const dynamicCenter = registerProfile.liveCenter + intensity * 8 + loopLift;
    const searchMin = Math.max(minMidi, lastMidi - 14);
    const searchMax = Math.min(maxMidi, lastMidi + 14);

    // Optimization: Pre-compute stylistic boolean checks and common tone arrays to avoid allocating inside the hot loop
    const isBluesOrJazz = activeStyle === 'blues' || activeStyle === 'jazz';
    const isGreatsProfileEnabled =
        activeStyle === 'blues' ||
        activeStyle === 'jazz' ||
        activeStyle === 'rock' ||
        activeStyle === 'scalar';
    const isDissonantStyle =
        activeStyle === 'jazz' || activeStyle === 'bird' || activeStyle === 'blues';
    const isJazzGuitarStyle =
        activeStyle === 'jazz' || activeStyle === 'bird' || activeStyle === 'bossa';
    const isGrooveGuitarStyle =
        activeStyle === 'funk' || activeStyle === 'reggae' || activeStyle === 'ska';
    const isHighEnergyGuitarStyle =
        activeStyle === 'metal' || activeStyle === 'shred' || activeStyle === 'scalar';
    const stationaryScale = intent?.stationaryScale ?? 0.5;
    const prefersStationaryHook = stationaryScale > 0.7;
    const isJazzHookStyle = activeStyle === 'jazz' || activeStyle === 'bird';
    const isAlteredHookQuality = targetChord.quality === '7alt' || targetChord.quality === '7#9';
    const responseConfig = config.motivicResponse || null;
    const hasDynamicHeadSeed = Boolean(sessionSeed?.notes?.length);
    const responseSignature = soloistState.session.currentPhrase.context?.responseSignature || null;
    const responseMode =
        rhythmNode.responseMode ||
        soloistState.session.currentPhrase.context?.responseMode ||
        (isHeadBypass && loopCount > 0 ? (loopCount === 1 ? 'paraphrase' : 'development') : 'free');
    const responseSource =
        rhythmNode.responseSource ||
        soloistState.session.currentPhrase.context?.responseSource ||
        'free';
    const responsePitchClass = Number.isInteger(rhythmNode.responsePitchClass)
        ? rhythmNode.responsePitchClass
        : null;
    const responseDirection = Number.isFinite(rhythmNode.responseDirection)
        ? rhythmNode.responseDirection
        : 0;
    const isResponseEntryTarget = Boolean(rhythmNode.responseEntryTarget);
    const isResponseCadenceTarget = Boolean(rhythmNode.responseCadenceTarget);
    const isMotivicHeadBypass = Boolean(
        hasDynamicHeadSeed &&
            responseConfig?.enabled &&
            isHeadBypass &&
            loopCount > 0 &&
            (responsePitchClass !== null || isResponseEntryTarget || isResponseCadenceTarget),
    );
    const isResponseGuided = Boolean(
        hasDynamicHeadSeed &&
            responseConfig?.enabled &&
            (responsePitchClass !== null || isResponseEntryTarget || isResponseCadenceTarget) &&
            ((soloistState.session.currentPhrase.context?.role === 'response' &&
                responseSignature?.notes?.length) ||
                isMotivicHeadBypass),
    );
    const isRecallSource = responseSource === 'section' || responseSource === 'form';

    const hasGreatsProfile =
        isGreatsProfileEnabled && soloistState.session.currentPhrase.context?.profile;
    const isCallResponse =
        isGreatsProfileEnabled && soloistState.session.currentPhrase.context?.role === 'response';
    const _isFunkOrSka = activeStyle === 'funk' || activeStyle === 'ska';

    // Optimization: Pre-compute chord tones into a bitmask to avoid O(N) .some() checks and closure creation in hot loop
    let chordMask = 0;
    for (let i = 0; i < targetChord.intervals.length; i++) {
        const intv = ((targetChord.intervals[i] % 12) + 12) % 12;
        chordMask |= 1 << intv;
    }

    for (let m = searchMin; m <= searchMax; m++) {
        const pc = ((m % 12) + 12) % 12;
        const interval = (pc - (rootMidi % 12) + 12) % 12;
        let weight = 1.0;

        const isScaleTone = (scaleMask >> interval) & 1;
        const isChordTone = (chordMask >> interval) & 1;
        let isBlueNote = false;
        if (isBluesOrJazz && (interval === 3 || interval === 6 || interval === 10)) {
            isBlueNote = true;
        }
        if (!isScaleTone && !isBlueNote) {
            continue;
        }

        const dist = Math.abs(m - lastMidi);
        let repetitionPenalty = 1.0;

        // --- Common Tone Repetition Logic (Additive phase) ---
        if (dist === 0) {
            const isStableTone = isChordTone || interval === 7 || interval === 2;

            if (stationaryScale > 0) {
                // Dissonance Protection check
                if ((interval === 1 || interval === 6) && !isDissonantStyle) {
                    repetitionPenalty = 0.01;
                }

                // Reward common tones with a stronger base
                const boost =
                    (config.commonToneWeight || 200) * stationaryScale * (isStableTone ? 2.0 : 0.5);
                weight += boost;
            }

            const isAlteredHookCenter =
                prefersStationaryHook &&
                isJazzHookStyle &&
                isAlteredHookQuality &&
                !isChordTone &&
                alteredHookIntervals.has(interval) &&
                (isStrongBeat ||
                    supportRole === 'accent' ||
                    supportRole === 'sustain' ||
                    durationSteps >= stepsPerBeat);
            if (isAlteredHookCenter) {
                // Let altered tensions function like a bebop hook center on accented conservative phrases.
                weight += (config.commonToneWeight || 200) * 0.2;
            }
        }

        // --- Greats Stylistic Profiles ---
        if (hasGreatsProfile) {
            const profile = soloistState.session.currentPhrase.context.profile;
            switch (profile) {
                case 'srv':
                    // SRV: High energy, favors pentatonic/blues notes
                    if (srvIntervals.has(interval)) {
                        weight *= 1.2;
                    }
                    break;
                case 'gilmour':
                    // Gilmour: Melodic, Root and 5th stability for singsong leads
                    if (gilmourIntervals.has(interval)) {
                        weight *= 1.4;
                    }
                    break;
                case 'slash':
                    // Slash: Classic rock, targets 3rds and 6ths
                    if (slashIntervals.has(interval)) {
                        weight *= 1.3;
                    }
                    break;
                case 'hendrix':
                    // Hendrix: Double stop focus (handled below) and bluesy 3rds
                    if (interval === 3 || interval === 10) {
                        weight *= 1.4;
                    }
                    break;
                case 'evh': {
                    // EVH: Wide intervals, intense
                    const evhDist = Math.abs(m - lastMidi);
                    if (evhDist > 5) {
                        weight *= 1.5;
                    }
                    break;
                }
                case 'beck':
                    // Jeff Beck: Unpredictable intervals, targets #4/b5 for tension
                    if (interval === 6) {
                        weight *= 1.5;
                    }
                    if (interval === 1) {
                        weight *= 1.3;
                    }
                    break;
                case 'monk':
                    // Monk: Dissonant, targets #4 and b2
                    if (interval === 6) {
                        weight *= 1.5;
                    }
                    if (interval === 1) {
                        weight *= 1.3;
                    }
                    break;
                case 'armstrong':
                    // Armstrong: Classic, Major 3rd and 6th
                    if (interval === 4 || interval === 9) {
                        weight *= 1.4;
                    }
                    break;
                case 'miles':
                    // Miles: Modal, targets extensions (9, 11, 13)
                    if (milesIntervals.has(interval)) {
                        weight *= 1.3;
                    }
                    break;
                case 'bird':
                    // Bird: Bebop, high chromaticism
                    if (!isScaleTone) {
                        weight *= 1.5;
                    }
                    break;
                case 'evans':
                    // Bill Evans: Upper Extensions (9, 11, #11, 13)
                    if (evansIntervals.has(interval)) {
                        weight += 500; // Final boost to reliably exceed 40% target
                        weight *= 10.0;
                    }
                    if (interval === 0) {
                        weight *= 0.01; // Avoid roots almost entirely
                    }
                    break;
                case 'coltrane': {
                    // Coltrane: Wide intervals, intense
                    const coltraneDist = Math.abs(m - lastMidi);
                    if (coltraneDist > 7) {
                        weight *= 1.5;
                    }
                    break;
                }
            }
        }

        // --- Call & Response: Melodic Resolution ---
        if (isCallResponse) {
            const isResolutionTone = interval === 0 || interval === 7; // Root and 5th
            if (isResolutionTone) {
                weight *= 8.0; // Aggressively favor strong resolution
            }
            if (interval === soloistState.session.currentPhrase.context.lastInterval) {
                weight *= 0.5; // Avoid stagnation
            }
        }

        if (isResponseGuided) {
            const responseReuseScale = responseMode === 'paraphrase' ? 1 : 0.78;
            if (responsePitchClass !== null && pc === responsePitchClass) {
                weight += 160 + (responseConfig.pitchReuse || 0) * 320 * responseReuseScale;
                if (dist <= 5) {
                    weight *= 1.18;
                }
            }
            if (responseSignature?.anchorPitchClasses?.includes(pc)) {
                weight += 80 + (responseConfig.contourReuse || 0) * 120;
            }
            if (isResponseEntryTarget && responseSignature?.entryPitchClass === pc) {
                weight += 140 + (responseConfig.pitchReuse || 0) * 180;
            }
            if (isResponseCadenceTarget && responseSignature?.cadencePitchClass === pc) {
                weight += 180 + (responseConfig.cadenceWeight || 0) * 220;
            }
            if (isResponseCadenceTarget && !(isChordTone || interval === 0 || interval === 7)) {
                weight *= 0.88;
            }
            if (responseDirection !== 0) {
                const motionDirection = Math.sign(m - lastMidi);
                if (motionDirection === responseDirection) {
                    weight *= 1 + (responseConfig.contourReuse || 0) * 0.22;
                } else if (motionDirection !== 0) {
                    weight *= 1 - (responseConfig.contourReuse || 0) * 0.14;
                }
            }
        }

        if (dist <= 2) {
            weight += 100;
        }
        if (dist <= 4) {
            weight += 50;
        }

        if (isChordTone) {
            weight += 150;
        }

        // Prioritize chord tones on strong beats or sustained notes
        if (isStrongBeat || durationSteps >= 4) {
            if (isChordTone) {
                weight += 300;
            }
        } else if (durationSteps <= 2 && !isStrongBeat) {
            // Passing tone on weak beat/short duration
            if (!isChordTone) {
                weight += 100; // boost scale notes that aren't chord tones
            }
        }
        if (isMonophonicMode) {
            if (supportRole === 'pickup' || supportRole === 'line') {
                if (dist <= 2) {
                    weight *= 1.18;
                } else if (dist > 5) {
                    weight *= 0.72;
                }
            }
            if (
                supportRole === 'anchor' ||
                supportRole === 'cadence' ||
                supportRole === 'sustain'
            ) {
                if (isChordTone) {
                    weight += 180;
                }
                if (dist <= 4) {
                    weight *= 1.14;
                } else if (dist > 7) {
                    weight *= 0.72;
                }
            }
            if (
                (isSectionDownbeat || isFinalMeasure || supportRole === 'cadence') &&
                (isChordTone || interval === 0 || interval === 7)
            ) {
                weight += 120;
            }
        }

        const resolutionChord = isSectionDownbeat
            ? targetChord
            : coordination.stepCoordination?.upcomingSectionFirstChord;
        if (
            (isFinalMeasure || isSectionDownbeat) &&
            (soloistState.session.phrasing.transitionState === 'lead_in' || isSectionDownbeat) &&
            resolutionChord
        ) {
            const upcomingRoot = resolutionChord.rootMidi;
            const upcoming3rd =
                resolutionChord.intervals.length > 1 ? resolutionChord.intervals[1] : 4;
            const upcomingInterval = (pc - (upcomingRoot % 12) + 12) % 12;
            if (upcomingInterval === 0 || upcomingInterval === upcoming3rd % 12) {
                if (isSectionDownbeat) {
                    weight += 500;
                } else {
                    weight += 100 + (stepsPerMeasure - remainingSteps) * 10;
                }
            }
        }

        if (dist > 7) {
            weight *= 0.4;
        }
        // Gently encourage stepwise motion and penalize large leaps
        if (dist <= 2) {
            weight *= 1.5;
        } else if (dist <= 4) {
            weight *= 1.2;
        } else if (dist > 7 && dist !== 12) {
            weight *= 0.1; // Moderate penalty for large leaps (not octaves)
        } else if (dist > 5 && dist !== 12) {
            weight *= 0.5; // Slight penalty for medium leaps
        }

        // FINAL REPETITION ADJUSTMENTS
        if (dist === 0) {
            weight *= repetitionPenalty;
            // If intent is stationary AND it's not a penalized note, apply multiplier
            if (stationaryScale > 0.7 && repetitionPenalty >= 1.0) {
                weight *= 1.5 + stationaryScale;
            }
        }

        const distFromCenter = Math.abs(m - dynamicCenter);
        if (distFromCenter <= 7) {
            weight += 100;
        } else if (distFromCenter <= 14) {
            weight += 40;
        }

        if (m >= 84 && intensity < 0.75) {
            weight *= 0.05;
        } else if (m >= 72 && intensity < 0.35) {
            weight *= 0.2;
        }

        if (isBlueNote) {
            weight += 80;
            if (interval === 3) {
                // Temper the minor 3rd during responses to allow for clearer resolution to Root/5th
                if (soloistState.session.currentPhrase.context?.role === 'response') {
                    weight += 100;
                } else {
                    weight += 500;
                }
            }
        }

        // --- Dynamic Head: Pitch Weighting (Thematic Consistency) ---
        const seed = soloistState.session.seed;
        if (seed?.notes && seed.notes.length > 0) {
            const { notes, loopLengthSteps } = seed;
            const loopCount = playback.currentLoopCount || 0;
            const stepInLoop = step % loopLengthSteps;
            const seedNote = notes.find((n: any) => n.step === stepInLoop);

            if (seedNote) {
                const pcMatch = m % 12 === seedNote.midi % 12;
                const exactMatch = m === seedNote.midi;

                if (pcMatch) {
                    let seedBoost = 0;
                    if (loopCount === 0) {
                        // Chorus 1: The Head. Direct adherence.
                        seedBoost = exactMatch ? 5000 : 1000;
                    } else if (loopCount === 1) {
                        // Chorus 2: Embellished.
                        seedBoost = exactMatch ? 2000 : 500;
                    } else if (loopCount === 2) {
                        // Chorus 3: Departure.
                        seedBoost = exactMatch ? 800 : 200;
                    } else {
                        // Chorus 4+: Thematic Pull.
                        seedBoost = exactMatch ? 300 : 100;
                    }
                    weight += seedBoost;
                }
            }
        }

        CANDIDATE_WEIGHTS[m] = weight;
        totalWeight += weight;
    }

    let selectedMidi = -1;
    if (isHeadBypass && targetMidi !== null) {
        selectedMidi = targetMidi;
    } else if (totalWeight > 0) {
        let randomVal = Math.random() * totalWeight;
        for (let m = searchMin; m <= searchMax; m++) {
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
    if (selectedMidi === -1) {
        selectedMidi = lastMidi;
    }

    const canUseHeadGuitarSupport =
        isGuitarMode && isHeadBypass && seedNote?.supportHints?.guitar?.allowDoubleStop === true;

    // --- Melodic Devices ---
    let deviceBaseProb = config.deviceProb * (0.5 + intensity);
    const isLaterHeadBypass = isHeadBypass && loopCount > 0;
    const isLineStyle = ['jazz', 'bird', 'bossa'].includes(activeStyle);
    const isResponseGuidedPhrase = isResponseGuided && (!isHeadBypass || loopCount > 0);

    // Progressive Ornamentation: Increase device probability by 20% per loop
    deviceBaseProb *= 1.0 + loopCount * 0.2;
    if (isLineStyle) {
        deviceBaseProb *= isLaterHeadBypass ? 0.54 : 0.66;
    }

    if (loopCount === 0 && sessionSeed && sessionSeed.notes.length > 0) {
        deviceBaseProb *= 0.2; // Clean head
    }
    if (isHeadBypass && loopCount === 0) {
        deviceBaseProb = 0;
    }
    if (isLaterHeadBypass) {
        const thematicBoost = isLineStyle
            ? loopCount === 1
                ? 1.4
                : 1.7
            : loopCount === 1
              ? 2.4
              : 3.1;
        deviceBaseProb *= thematicBoost;
    }
    if (activeStyle === 'neo' && isLaterHeadBypass && !isResponseGuidedPhrase) {
        deviceBaseProb *= 0.58;
    }
    if (loopCount > 1 && !isHeadBypass) {
        deviceBaseProb *= isLineStyle ? 0.95 + intensity * 0.2 : 1.15 + intensity * 0.35;
    }
    if (seedNote?.isAnchor) {
        deviceBaseProb *= 0.35;
    }
    if (
        (activeStyle === 'rock' || activeStyle === 'shred') &&
        loopCount > 0 &&
        seedNote?.isAnchor
    ) {
        deviceBaseProb = 0;
    }
    if (isResponseGuidedPhrase) {
        const deviceDamp =
            responseMode === 'paraphrase'
                ? responseConfig?.deviceDamp || 0.5
                : Math.min(0.88, (responseConfig?.deviceDamp || 0.5) + 0.14);
        deviceBaseProb *= deviceDamp;
        if (responseSource === 'section') {
            deviceBaseProb *= 1 - Math.min(0.22, (responseConfig?.spaceBias || 0) * 0.4);
        } else if (responseSource === 'form') {
            deviceBaseProb *= 1 - Math.min(0.16, (responseConfig?.spaceBias || 0) * 0.28);
        }
        if (isResponseEntryTarget || isResponseCadenceTarget || responsePitchClass !== null) {
            deviceBaseProb *= 0.68;
        }
    }
    deviceBaseProb = Math.min(loopCount === 0 ? 0.4 : isLineStyle ? 0.58 : 0.85, deviceBaseProb);
    const isPolyphonic =
        allowsSoloistPolyphony(soloistMode) &&
        (soloistState.doubleStopProb ?? 1.0) > 0 &&
        config.doubleStopProb > 0 &&
        (loopCount > 0 ||
            !sessionSeed ||
            sessionSeed.notes.length === 0 ||
            canUseHeadGuitarSupport);

    const deviceContextOptions = {
        state,
        selectedMidi,
        targetChord,
        activeStyle,
        effectiveIntensity: intensity,
        minMidi,
        maxMidi,
        lastMidi,
        playback,
        soloist: soloistState,
        isPolyphonic,
        isPiano: false,
        dynamicCenter: 72,
        scaleMask,
        seedNote,
        supportRole,
        sustainBias,
        responseSignature,
        responseSource,
        responseMode,
        responseDirection,
        responseEntryTarget: isResponseEntryTarget,
        responseCadenceTarget: isResponseCadenceTarget,
    };

    // --- Structural Awareness: Turnaround Handling ---
    if (
        activeStyle === 'blues' &&
        (coordination as any).isTurnaround &&
        !headMeasureHasTripletSeed &&
        !isResponseGuidedPhrase &&
        Math.random() < 0.6
    ) {
        const res = applyDeviceBuffer('bluesTurnaround', deviceContextOptions);
        if (res) {
            soloistState.session.rhythm.embellishmentBuffer = res.buffer; // @worker-mutation
            soloistState.session.phrasing.busySteps = res.busySteps; // @worker-mutation
            return finalizeNote(res.first);
        }
    }

    const canTriggerDevice =
        isBeatStart ||
        (isLaterHeadBypass &&
            !isProtectedSeedTone &&
            (!isLineStyle || durationSteps >= stepsPerBeat / 2)) ||
        (loopCount > 1 && !isStrongBeat && durationSteps <= stepsPerBeat && !isLineStyle);
    if (canTriggerDevice && Math.random() < deviceBaseProb) {
        let allowed: string[] = [...(config.allowedDevices || [])];

        if (isLaterHeadBypass && !isProtectedSeedTone) {
            const thematicDevices: string[] = [];
            if (!allowed.includes('graceNote')) {
                thematicDevices.push('graceNote');
            }
            if (
                ['jazz', 'bird', 'bossa', 'funk', 'neo', 'scalar'].includes(activeStyle) &&
                !allowed.includes('enclosure')
            ) {
                thematicDevices.push('enclosure');
            }
            if (intensity > 0.7 && (!isLineStyle || isStrongBeat) && !allowed.includes('run')) {
                thematicDevices.push('run');
            }
            if (
                ['rock', 'blues', 'funk', 'scalar'].includes(activeStyle) &&
                !allowed.includes('slide')
            ) {
                thematicDevices.push('slide');
            }
            allowed = [...thematicDevices, ...allowed];
        }

        if (isLineStyle && !isStrongBeat) {
            allowed = allowed.filter(
                (device) =>
                    device !== 'run' && device !== 'birdFlurry' && device !== 'sheetsOfSound',
            );
        }
        const allowHeavyRecallDevice =
            responseMode === 'development' &&
            intensity > 0.82 &&
            (activeStyle === 'bird' || activeStyle === 'jazz') &&
            !isRecallSource;
        if (isResponseGuidedPhrase && (responseMode === 'paraphrase' || isRecallSource)) {
            allowed = allowed.filter(
                (device) =>
                    allowHeavyRecallDevice ||
                    (device !== 'birdFlurry' && device !== 'sheetsOfSound'),
            );
        }
        if (isResponseGuidedPhrase && (isResponseCadenceTarget || supportRole === 'cadence')) {
            allowed = allowed.filter((device) => device !== 'quartalStack');
        }

        // --- Greats Profiles: Device Priority ---
        if (
            (activeStyle === 'blues' ||
                activeStyle === 'jazz' ||
                activeStyle === 'rock' ||
                activeStyle === 'scalar') &&
            soloistState.session.currentPhrase.context?.profile
        ) {
            const profile = soloistState.session.currentPhrase.context.profile;
            const relativeInterval = (selectedMidi - targetChord.rootMidi + 120) % 12;

            if (
                (profile === 'srv' || profile === 'armstrong' || profile === 'slash') &&
                relativeInterval === 3 &&
                intensity > 0.5
            ) {
                allowed = ['bluesCurl', ...allowed]; // Prioritize the curl
            } else if (profile === 'monk' || profile === 'beck') {
                allowed = ['graceNote', ...allowed]; // Prioritize crushed notes
            } else if (profile === 'gilmour' && (durationSteps as any) >= 4) {
                allowed = ['slide', ...allowed];
            }
        }
        if (isResponseGuidedPhrase || (isLaterHeadBypass && loopCount > 0)) {
            const motifPriorities = buildMotifDevicePriorities({
                activeStyle,
                responseMode,
                responseSource,
                responseDirection,
                responseSignature,
                isResponseEntryTarget,
                isResponseCadenceTarget,
                intensity,
                isLineStyle,
                supportRole,
                seedNote,
            });
            const prioritized: string[] = [];
            motifPriorities.forEach((device) => pushUniqueDevice(prioritized, device));
            allowed.forEach((device) => pushUniqueDevice(prioritized, device));
            allowed = prioritized;
        }

        const deviceType =
            allowed.length > 0 ? allowed[Math.floor(Math.random() * allowed.length)] : null;
        if (deviceType) {
            const res = applyDeviceBuffer(deviceType, deviceContextOptions);
            if (res) {
                soloistState.session.rhythm.deviceBuffer = res.buffer; // @worker-mutation
                soloistState.session.phrasing.busySteps = res.busySteps; // @worker-mutation
                return finalizeNote(res.first);
            }
        }
    }

    // Base Result without polyphony
    const result: any = {
        midi: selectedMidi,
        velocity: velocity,
        durationSteps: durationSteps,
        vibrato: vibrato,
        isSustained: rhythmNode.isSustained,
        bendStartInterval:
            isGuitarMode && durationSteps >= 4 && Math.random() < 0.3
                ? Math.random() < 0.5
                    ? -1
                    : 1
                : 0,
        ccEvents: [],
        timingOffset: 0,
        style: activeStyle,
        isDoubleStop: false,
        isLegato: false,
    };

    // Polyphony check (Double Stops)
    let doubleStopChance = config.doubleStopProb * intensity * (soloistState.doubleStopProb ?? 1.0);
    if (isGuitarMode) {
        doubleStopChance =
            config.doubleStopProb *
            (soloistState.doubleStopProb ?? 1.0) *
            (0.35 + intensity * 0.45);

        if (durationSteps >= stepsPerBeat) {
            doubleStopChance *= 1.35;
        }
        if (isStrongBeat) {
            doubleStopChance *= 1.15;
        }
        if (selectedMidi < 64) {
            doubleStopChance *= 0.45;
        }
        if (!isStrongBeat && durationSteps < Math.max(2, stepsPerBeat / 2)) {
            doubleStopChance *= 0.18;
        }
        if (isLineStyle) {
            doubleStopChance *= durationSteps >= stepsPerBeat * 1.5 ? 0.45 : 0.12;
        }
        if (activeStyle === 'country') {
            doubleStopChance *= durationSteps >= stepsPerBeat ? 1.75 : 1.15;
        } else if (activeStyle === 'blues') {
            doubleStopChance *= durationSteps >= stepsPerBeat ? 2.9 : 2.05;
            if (supportRole === 'line' || supportRole === 'accent') {
                doubleStopChance *= 1.5;
            } else if (supportRole === 'anchor' || supportRole === 'cadence') {
                doubleStopChance *= 1.8;
            }
        } else if (isJazzGuitarStyle) {
            doubleStopChance *= durationSteps >= stepsPerBeat * 1.5 ? 0.4 : 0.08;
            if (supportRole === 'anchor' || supportRole === 'cadence') {
                doubleStopChance *= 1.48;
            } else if (supportRole === 'line') {
                doubleStopChance *= 0.5;
            }
        } else if (isGrooveGuitarStyle) {
            doubleStopChance *= durationSteps >= stepsPerBeat ? 0.82 : 0.28;
            if (!isStrongBeat) {
                doubleStopChance *= 0.65;
            }
            if (supportRole === 'line') {
                doubleStopChance *= 0.45;
            }
        } else if (isHighEnergyGuitarStyle) {
            doubleStopChance *= durationSteps >= stepsPerBeat * 1.5 ? 0.58 : 0.18;
            if (supportRole === 'line') {
                doubleStopChance *= 0.38;
            }
        } else if (activeStyle === 'rock') {
            doubleStopChance *= durationSteps >= stepsPerBeat ? 1.2 : 0.92;
        } else if (activeStyle === 'neo') {
            doubleStopChance *= durationSteps >= stepsPerBeat ? 1.08 : 0.68;
        } else if (supportRole === 'line') {
            doubleStopChance *= durationSteps >= stepsPerBeat ? 0.55 : 0.22;
        } else if (supportRole === 'accent') {
            doubleStopChance *= 0.9;
        } else if (supportRole === 'anchor' || supportRole === 'cadence') {
            doubleStopChance *= 1.2;
        }
        if (sustainBias >= 0.85) {
            doubleStopChance *= 1.12;
        }

        if (isHeadBypass) {
            if (seedNote?.supportHints?.guitar?.allowDoubleStop !== true) {
                doubleStopChance = 0;
            } else {
                doubleStopChance *= 0.45 + (seedNote.supportHints.sustainBias || 0.6) * 0.75;
                if (seedNote.isAnchor) {
                    doubleStopChance *= 1.15;
                }
            }
        } else if (loopCount === 0 && sessionSeed?.notes?.length) {
            doubleStopChance = 0;
        }
    }

    if (isPolyphonic && Math.random() < Math.min(0.98, doubleStopChance)) {
        const extra = generateExtraNotes({
            soloist: soloistState,
            currentChord,
            activeStyle,
            effectiveIntensity: intensity,
            selectedMidi,
            seedNote,
            supportRole,
            sustainBias,
        });
        if (extra && extra.length > 0) {
            // Optimization: Replace spread and map with pre-allocated loop to avoid closure overhead and intermediate arrays
            const polyResult: any[] = new Array(extra.length + 1);
            for (let i = 0; i < extra.length; i++) {
                const durationScale = extra[i].durationScale ?? 1;
                const leadDuration = result.durationSteps || 1;
                let supportDuration = Math.max(1, Math.round(leadDuration * durationScale));
                if (durationScale < 1) {
                    supportDuration = Math.min(leadDuration - 1, supportDuration);
                }
                supportDuration = Math.max(1, supportDuration);
                polyResult[i] = {
                    ...result,
                    ...extra[i],
                    durationSteps: supportDuration,
                    isLegato: false,
                };
            }
            polyResult[extra.length] = result;

            // We set busy steps for polyResult because they are playing simultaneously? No, wait.
            // In the original code, we assigned busySteps to result.durationSteps - 1 for polyphony too,
            // but we want to let rhythm node handle timing, EXCEPT polyResult needs busySteps to block if duration > 1?
            // Actually, wait: we said busySteps is obsolete for normal note generation.
            // If the rhythmPlan is handling timing, we shouldn't set busySteps for standard or poly notes
            // unless we want them to block the rhythm plan?
            // "busySteps must be retained exclusively for the melodic devices and embellishments"
            // Wait, double stops are a melodic device of sort (playing two notes at once). Do they block?
            // If they are played simultaneously, their duration doesn't affect the next rhythm plan execution.
            // But if the next rhythm plan step targets the middle of this duration, we just let it interrupt or something?
            // Actually, the rhythm plan already spaced the notes by 'gap', so the next attack is at least 'durationSteps' away.
            // So we don't need to set busySteps for regular single notes or double stops here!
            return finalizeNote(polyResult);
        }
    }

    return finalizeNote(result);
}
