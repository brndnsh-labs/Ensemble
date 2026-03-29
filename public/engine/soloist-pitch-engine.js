import { applyBluesBends, calculateTimingOffset, getFrequency } from '../utils.js';
import { getSoloistRegisterProfile, STYLE_CONFIG } from './soloist-config.js';
import { generateExtraNotes, generateMelodicDevice } from './soloist-devices.js';
import {
    allowsSoloistPolyphony,
    isSoloistGuitarMode,
    isSoloistPianoMode,
    resolveSoloistMode,
} from './soloist-mode-policy.js';
import { getScaleForChord } from './theory-scales.js';

/**
 * Utility to generate a device buffer and compute busy steps.
 * @param {string} deviceType
 * @param {any} contextOptions
 * @returns {{ buffer: any[], first: any, busySteps: number }|null}
 */
function applyDeviceBuffer(deviceType, contextOptions) {
    const deviceBuffer = generateMelodicDevice(deviceType, contextOptions);
    if (deviceBuffer && deviceBuffer.length > 0) {
        /** @type {any} */
        const first = deviceBuffer[0];
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

/**
 * Primary entry point for pitch selection.
 * @param {import('../types.js').EnsembleState} state
 * @param {number} step
 * @param {any} rhythmNode
 * @param {any} currentChord
 * @param {any} nextChord
 * @param {string} activeStyle
 * @param {number} intensity
 * @param {number} stepInChord
 * @param {any} coordination
 * @param {import('../state/playback.js').GlobalContext} playback
 * @param {import('../state/instruments.js').SoloistState} soloistState
 * @param {import('../state/groove.js').GrooveState} groove
 * @param {import('../state/arranger.js').ArrangerState} _arranger
 * @param {number} stepsPerMeasure
 * @param {number} stepsPerBeat
 * @param {any} [intent]
 */
export function selectPitchAndDevices(
    state,
    step,
    rhythmNode,
    currentChord,
    nextChord,
    activeStyle,
    intensity,
    stepInChord,
    coordination,
    playback,
    soloistState,
    groove,
    _arranger,
    stepsPerMeasure,
    stepsPerBeat,
    intent = null,
) {
    if (!currentChord) {
        return null;
    }

    /** @type {any} */
    const styleConfigAny = STYLE_CONFIG;
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
    const soloistMode = resolveSoloistMode(soloistState.mode);
    const isGuitarMode = isSoloistGuitarMode(soloistMode);
    const isPianoMode = isSoloistPianoMode(soloistMode);

    let targetChord = currentChord;

    // Anticipation (Lookahead)
    const isLateInChord = stepInChord >= currentChord.beats * stepsPerBeat - 2;
    if (nextChord && isLateInChord && Math.random() < (config.anticipationProb || 0)) {
        targetChord = nextChord;
    }

    const minMidi = registerProfile.liveFloor;
    const maxMidi = registerProfile.liveCeiling;
    const lastMidi = soloistState.lastMidiPlayed || 72;

    // Determine context
    const remainingSteps = coordination.sectionEnd - step;
    const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;
    const isSectionDownbeat =
        step === coordination.sectionStart && soloistState.transitionState === 'lead_in';
    const isBeatStart = isStrongBeat;
    const isProtectedSeedTone = Boolean(
        seedNote?.isAnchor ||
            isStrongBeat ||
            durationSteps >= stepsPerBeat ||
            (seedNote?.durationSteps || 0) >= stepsPerBeat,
    );

    // Helper to finalize note (formerly inline in getSoloistNote)
    const finalizeNote = (/** @type {any} */ res) => {
        if (!res) {
            return null;
        }
        const primary = Array.isArray(res) ? res[res.length - 1] : res;

        soloistState.lastMidiPlayed = primary.midi; // @worker-mutation

        // Store interval for call & response tracking
        if (activeStyle === 'blues' && soloistState.phraseContext) {
            soloistState.phraseContext.lastInterval =
                ((primary.midi % 12) - (currentChord.rootMidi % 12) + 12) % 12; // @worker-mutation
        }

        let timingOffset = calculateTimingOffset('soloist', groove.pocket, intensity);

        // --- Greats Profiles: Timing ---
        if (activeStyle === 'blues' && soloistState.phraseContext?.profile) {
            const profile = soloistState.phraseContext.profile;
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

        if (!primary.isDoubleStop) {
            soloistState.lastFreq = getFrequency(primary.midi); // @worker-mutation
        }

        applyBluesBends(primary, activeStyle, currentChord);

        return res;
    };

    // Harmonic Anticipation for final measures
    if (
        isFinalMeasure &&
        soloistState.transitionState === 'lead_in' &&
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

    const hasGreatsProfile = isGreatsProfileEnabled && soloistState.phraseContext?.profile;
    const isCallResponse =
        isGreatsProfileEnabled && soloistState.phraseContext?.role === 'response';
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
            const isStableTone = (chordMask >> interval) & 1 || interval === 7 || interval === 2;
            const stationaryScale = intent?.stationaryScale ?? 0.5;

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
        }

        // --- Greats Stylistic Profiles ---
        if (hasGreatsProfile) {
            const profile = soloistState.phraseContext.profile;
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
            if (interval === soloistState.phraseContext.lastInterval) {
                weight *= 0.5; // Avoid stagnation
            }
        }

        if (dist <= 2) {
            weight += 100;
        }
        if (dist <= 4) {
            weight += 50;
        }

        const isChordTone = (chordMask >> interval) & 1;

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

        const resolutionChord = isSectionDownbeat
            ? targetChord
            : coordination.stepCoordination?.upcomingSectionFirstChord;
        if (
            (isFinalMeasure || isSectionDownbeat) &&
            (soloistState.transitionState === 'lead_in' || isSectionDownbeat) &&
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
            const stationaryScale = intent?.stationaryScale ?? 0.5;
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
                if (soloistState.phraseContext?.role === 'response') {
                    weight += 100;
                } else {
                    weight += 500;
                }
            }
        }

        // --- Dynamic Head: Pitch Weighting (Thematic Consistency) ---
        const seed = soloistState.sessionSeed;
        if (seed?.notes && seed.notes.length > 0) {
            const { notes, loopLengthSteps } = seed;
            const loopCount = playback.currentLoopCount || 0;
            const stepInLoop = step % loopLengthSteps;
            const seedNote = notes.find((/** @type {any} */ n) => n.step === stepInLoop);

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

    const sessionSeed = soloistState.sessionSeed;
    const loopCount = playback.currentLoopCount || 0;
    const canUseHeadGuitarSupport =
        isGuitarMode && isHeadBypass && seedNote?.supportHints?.guitar?.allowDoubleStop === true;

    // --- Melodic Devices ---
    let deviceBaseProb = config.deviceProb * (0.5 + intensity);
    const isLaterHeadBypass = isHeadBypass && loopCount > 0;
    const isLineStyle = ['jazz', 'bird', 'bossa'].includes(activeStyle);

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
    if (loopCount > 1 && !isHeadBypass) {
        deviceBaseProb *= isLineStyle ? 0.95 + intensity * 0.2 : 1.15 + intensity * 0.35;
    }
    if (seedNote?.isAnchor) {
        deviceBaseProb *= 0.35;
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
        isPiano: isPianoMode,
        dynamicCenter: 72,
        scaleMask,
    };

    // --- Structural Awareness: Turnaround Handling ---
    if (
        activeStyle === 'blues' &&
        /** @type {any} */ (coordination).isTurnaround &&
        Math.random() < 0.6
    ) {
        const res = applyDeviceBuffer('bluesTurnaround', deviceContextOptions);
        if (res) {
            soloistState.embellishmentBuffer = res.buffer; // @worker-mutation
            soloistState.busySteps = res.busySteps; // @worker-mutation
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
        let allowed = [...(config.allowedDevices || [])];

        if (isLaterHeadBypass && !isProtectedSeedTone) {
            const thematicDevices = [];
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

        // --- Greats Profiles: Device Priority ---
        if (
            (activeStyle === 'blues' ||
                activeStyle === 'jazz' ||
                activeStyle === 'rock' ||
                activeStyle === 'scalar') &&
            soloistState.phraseContext?.profile
        ) {
            const profile = soloistState.phraseContext.profile;
            const relativeInterval = (selectedMidi - targetChord.rootMidi + 120) % 12;

            if (
                (profile === 'srv' || profile === 'armstrong' || profile === 'slash') &&
                relativeInterval === 3 &&
                intensity > 0.5
            ) {
                allowed = ['bluesCurl', ...allowed]; // Prioritize the curl
            } else if (profile === 'monk' || profile === 'beck') {
                allowed = ['graceNote', ...allowed]; // Prioritize crushed notes
            } else if (profile === 'gilmour' && /** @type {any} */ (durationSteps) >= 4) {
                allowed = ['slide', ...allowed];
            }
        }

        if (isPianoMode) {
            allowed = allowed.filter(
                (d) =>
                    d !== 'slide' &&
                    d !== 'countryBend' &&
                    d !== 'graceSlide' &&
                    d !== 'chickenPick',
            );
            if (!allowed.includes('graceNote')) {
                allowed.push('graceNote');
            }
        }

        const deviceType =
            allowed.length > 0 ? allowed[Math.floor(Math.random() * allowed.length)] : null;
        if (deviceType) {
            const res = applyDeviceBuffer(deviceType, deviceContextOptions);
            if (res) {
                soloistState.deviceBuffer = res.buffer; // @worker-mutation
                soloistState.busySteps = res.busySteps; // @worker-mutation
                return finalizeNote(res.first);
            }
        }
    }

    // Base Result without polyphony
    const result = {
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
        const supportRole = seedNote?.supportHints?.role || 'line';
        const sustainBias = seedNote?.supportHints?.sustainBias || 0;

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
        });
        if (extra && extra.length > 0) {
            // Optimization: Replace spread and map with pre-allocated loop to avoid closure overhead and intermediate arrays
            const polyResult = new Array(extra.length + 1);
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
