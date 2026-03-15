import { STYLE_CONFIG } from '../soloist-config.js';
import { generateExtraNotes, generateMelodicDevice } from '../soloist-devices.js';
import { getScaleForChord } from '../theory-scales.js';
import { calculateTimingOffset, getFrequency } from '../utils.js';

const CANDIDATE_WEIGHTS = new Float32Array(128);

export function selectPitchAndDevices(
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
) {
    if (!currentChord) {
        return null;
    }

    const config = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.scalar;

    // Derived from the Rhythm Engine node
    const { velocity, durationSteps, isStrongBeat, vibrato } = rhythmNode;

    let targetChord = currentChord;

    // Anticipation (Lookahead)
    const isLateInChord = stepInChord >= currentChord.beats * stepsPerBeat - 2;
    if (nextChord && isLateInChord && Math.random() < (config.anticipationProb || 0)) {
        targetChord = nextChord;
    }

    const minMidi = 60; // C4
    const maxMidi = 96; // C7
    const lastMidi = soloistState.lastMidiPlayed || 72;

    // Determine context
    const remainingSteps = coordination.sectionEnd - step;
    const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;
    const isSectionDownbeat =
        step === coordination.sectionStart && soloistState.transitionState === 'lead_in';
    const isBeatStart = isStrongBeat;

    // Helper to finalize note (formerly inline in getSoloistNote)
    const finalizeNote = (res) => {
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

        if (activeStyle === 'blues') {
            const relativeInterval = ((primary.midi % 12) - (currentChord.rootMidi % 12) + 12) % 12;
            if (
                (relativeInterval === 3 || relativeInterval === 6) &&
                primary.bendStartInterval === 0
            ) {
                primary.bendStartInterval = Math.random() < 0.6 ? -0.5 : 0.5;
            }
        }

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

    const scaleIntervals = getScaleForChord(targetChord, null, activeStyle);
    let scaleMask = 0;
    for (let i = 0; i < scaleIntervals.length; i++) {
        scaleMask |= 1 << scaleIntervals[i];
    }
    const rootMidi = targetChord.rootMidi;
    let totalWeight = 0;

    const dynamicCenter = 64 + intensity * 12;
    const searchMin = Math.max(minMidi, lastMidi - 14);
    const searchMax = Math.min(maxMidi, lastMidi + 14);

    // Optimization: Pre-compute stylistic boolean checks to avoid allocating arrays and calling .includes() inside the hot loop
    const isBluesOrJazz = activeStyle === 'blues' || activeStyle === 'jazz';
    const isGreatsProfileEnabled = ['blues', 'jazz', 'rock', 'scalar'].includes(activeStyle);
    const hasGreatsProfile = isGreatsProfileEnabled && soloistState.phraseContext?.profile;
    const isCallResponse =
        isGreatsProfileEnabled && soloistState.phraseContext?.role === 'response';
    const isFunkOrSka = activeStyle === 'funk' || activeStyle === 'ska';

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

        // --- Greats Stylistic Profiles ---
        if (hasGreatsProfile) {
            const profile = soloistState.phraseContext.profile;
            switch (profile) {
                case 'srv':
                    // SRV: High energy, favors pentatonic/blues notes
                    if ([0, 3, 5, 6, 7, 10].includes(interval)) {
                        weight *= 1.2;
                    }
                    break;
                case 'gilmour':
                    // Gilmour: Melodic, Root and 5th stability for singsong leads
                    if ([0, 7].includes(interval)) {
                        weight *= 1.4;
                    }
                    break;
                case 'slash':
                    // Slash: Classic rock, targets 3rds and 6ths
                    if ([4, 9].includes(interval)) {
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
                    if ([2, 5, 9].includes(interval)) {
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
                    if ([2, 5, 6, 9].includes(interval)) {
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

        const dist = Math.abs(m - lastMidi);
        if (dist === 0) {
            if (isFunkOrSka) {
                weight *= 0.5;
            } else {
                continue;
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
        CANDIDATE_WEIGHTS[m] = weight;
        totalWeight += weight;
    }

    let selectedMidi = -1;
    if (totalWeight > 0) {
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

    // --- Melodic Devices ---
    const deviceBaseProb = config.deviceProb * (0.5 + intensity);
    const isPolyphonic =
        soloistState.mode !== 'monophonic' &&
        (soloistState.doubleStopProb ?? 1.0) > 0 &&
        config.doubleStopProb > 0;

    // --- Structural Awareness: Turnaround Handling ---
    if (activeStyle === 'blues' && coordination.isTurnaround && Math.random() < 0.6) {
        const deviceBuffer = generateMelodicDevice('bluesTurnaround', {
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
            isPiano: soloistState.mode === 'piano',
            dynamicCenter: 72,
            scaleMask,
        });

        if (deviceBuffer && deviceBuffer.length > 0) {
            soloistState.embellishmentBuffer = deviceBuffer.slice(1); // @worker-mutation
            const first = deviceBuffer[0];
            soloistState.busySteps =
                (Array.isArray(first) ? first[0].durationSteps : first.durationSteps || 1) - 1; // @worker-mutation
            return finalizeNote(first);
        }
    }

    if (isBeatStart && Math.random() < deviceBaseProb) {
        let allowed = [...(config.allowedDevices || [])];

        // --- Greats Profiles: Device Priority ---
        if (
            ['blues', 'jazz', 'rock', 'scalar'].includes(activeStyle) &&
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
            } else if (profile === 'gilmour' && durationSteps >= 4) {
                allowed = ['slide', ...allowed];
            }
        }

        if (soloistState.mode === 'piano') {
            allowed = allowed.filter(
                (d) => !['slide', 'countryBend', 'graceSlide', 'chickenPick'].includes(d),
            );
            if (!allowed.includes('graceNote')) {
                allowed.push('graceNote');
            }
        }

        const deviceType =
            allowed.length > 0 ? allowed[Math.floor(Math.random() * allowed.length)] : null;
        if (deviceType) {
            const deviceBuffer = generateMelodicDevice(deviceType, {
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
                isPiano: soloistState.mode === 'piano',
                dynamicCenter: 72,
                scaleMask,
            });

            if (deviceBuffer && deviceBuffer.length > 0) {
                // If a device generates multiple notes, those will bypass rhythm logic by setting busySteps
                soloistState.deviceBuffer = deviceBuffer.slice(1); // @worker-mutation
                const first = deviceBuffer[0];
                soloistState.busySteps =
                    (Array.isArray(first) ? first[0].durationSteps : first.durationSteps || 1) - 1; // @worker-mutation
                // Note: The device handles its own durations, but we ensure the first note gets returned
                return finalizeNote(first);
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
            soloistState.mode === 'guitar' && durationSteps >= 4 && Math.random() < 0.3
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
    if (
        isPolyphonic &&
        Math.random() < config.doubleStopProb * intensity * (soloistState.doubleStopProb ?? 1.0)
    ) {
        const extra = generateExtraNotes({
            soloist: soloistState,
            currentChord,
            activeStyle,
            effectiveIntensity: intensity,
            selectedMidi,
        });
        if (extra && extra.length > 0) {
            // Optimization: Replace spread and map with pre-allocated loop to avoid closure overhead and intermediate arrays
            const polyResult = new Array(extra.length + 1);
            for (let i = 0; i < extra.length; i++) {
                polyResult[i] = { ...result, ...extra[i] };
            }
            polyResult[extra.length] = result;

            // We set busy steps for polyResult because they are playing simultaneously? No, wait.
            // In the original code, `soloist.busySteps = result.durationSteps - 1` was done for polyphony too,
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
