import { getScaleForChord } from './theory-scales.js';

/**
 * Soloist Melodic Devices Module
 * Contains procedural algorithms for generating embellishments, runs, and licks.
 */

/**
 * Generates a sequence of notes for a specific melodic device.
 * @param {string} deviceType - The ID of the device to generate (e.g., 'bluesLick', 'run').
 * @param {Object} ctx - Context object containing necessary state for generation.
 * @param {number} ctx.selectedMidi - The target MIDI pitch for the device.
 * @param {Object} ctx.targetChord - Current chord object.
 * @param {string} ctx.activeStyle - Style ID (e.g., 'bird', 'blues').
 * @param {number} ctx.effectiveIntensity - Normalized intensity (0.0 - 1.0).
 * @param {number} ctx.minMidi - Minimum allowed MIDI pitch.
 * @param {number} ctx.maxMidi - Maximum allowed MIDI pitch.
 * @param {number} ctx.lastMidi - Previously played MIDI pitch.
 * @param {Object} ctx.playback - Global playback state.
 * @param {Object} ctx.soloist - Global soloist state.
 * @param {boolean} ctx.isPolyphonic - Whether double stops are permitted.
 * @param {boolean} ctx.isPiano - Whether the current instrument is a piano.
 * @param {number} ctx.dynamicCenter - The current melodic center pitch.
 * @param {number} ctx.scaleMask - Bitmask of valid scale tones.
 * @returns {Object[]|null} An array of note objects for the device buffer, or null if none generated.
 */
export function generateMelodicDevice(deviceType, ctx) {
    const {
        selectedMidi,
        targetChord,
        activeStyle,
        effectiveIntensity,
        minMidi,
        maxMidi,
        lastMidi,
        playback,
        soloist,
        isPolyphonic,
        isPiano,
        dynamicCenter,
        scaleMask,
    } = ctx;

    const devBaseVel = 0.5 + effectiveIntensity * 0.6;
    let deviceBuffer = [];

    if (deviceType === 'bluesLick') {
        const root = targetChord.rootMidi;
        const relInt = (selectedMidi - root + 120) % 12;
        let lick = [];
        const duration = 2; // 8th notes

        if (relInt === 0) {
            if (Math.random() < 0.5) {
                lick = [
                    { midi: selectedMidi, durationSteps: duration },
                    { midi: selectedMidi + 3, durationSteps: duration },
                    { midi: selectedMidi + 5, durationSteps: duration },
                    { midi: selectedMidi + 6, durationSteps: duration },
                    { midi: selectedMidi + 7, durationSteps: duration * 2 },
                ];
            } else {
                lick = [
                    { midi: selectedMidi, durationSteps: duration },
                    { midi: selectedMidi - 2, durationSteps: duration },
                    { midi: selectedMidi - 5, durationSteps: duration * 2 },
                ];
            }
        } else if (relInt === 3) {
            if (Math.random() < 0.5) {
                lick = [
                    { midi: selectedMidi + 1, durationSteps: duration, bendStartInterval: 1 },
                    { midi: selectedMidi + 4, durationSteps: duration },
                    { midi: selectedMidi + 7, durationSteps: duration },
                    { midi: selectedMidi + 9, durationSteps: duration * 2 },
                ];
            } else {
                lick = [
                    { midi: selectedMidi, durationSteps: duration },
                    { midi: selectedMidi - 3, durationSteps: duration },
                    { midi: selectedMidi - 5, durationSteps: duration },
                    { midi: selectedMidi - 8, durationSteps: duration * 2 },
                ];
            }
        } else if (relInt === 5) {
            lick = [
                { midi: selectedMidi, durationSteps: duration },
                { midi: selectedMidi + 1, durationSteps: duration },
                { midi: selectedMidi + 2, durationSteps: duration },
                { midi: selectedMidi + 5, durationSteps: duration * 2 },
            ];
        } else if (relInt === 7) {
            lick = [
                { midi: selectedMidi, durationSteps: duration },
                { midi: selectedMidi - 2, durationSteps: duration },
                { midi: selectedMidi - 4, durationSteps: duration },
                { midi: selectedMidi - 7, durationSteps: duration * 2 },
            ];
        } else if (relInt === 10) {
            lick = [
                { midi: selectedMidi, durationSteps: duration },
                { midi: selectedMidi - 3, durationSteps: duration },
                { midi: selectedMidi - 5, durationSteps: duration },
                { midi: selectedMidi - 7, durationSteps: duration },
                { midi: selectedMidi - 10, durationSteps: duration * 2 },
            ];
        }

        if (lick.length > 0) {
            const lickStart = lick[0].midi;
            const octaveShift = Math.round((lastMidi - lickStart) / 12) * 12;
            deviceBuffer = lick.map((n, idx) => ({
                ...n,
                midi: Math.max(minMidi, Math.min(maxMidi, n.midi + octaveShift)),
                velocity: devBaseVel * (idx === 0 ? 1.15 : 0.9 + Math.random() * 0.15),
                style: activeStyle,
            }));
        }
    } else if (deviceType === 'chromaticFall') {
        const steps = Math.floor(Math.random() * 3) + 3;
        const duration = 1;
        for (let i = 0; i < steps; i++) {
            deviceBuffer.push({
                midi: Math.max(minMidi, selectedMidi - i),
                durationSteps: duration,
                velocity: devBaseVel * (1.1 - i * 0.1),
                style: activeStyle,
            });
        }
    } else if (deviceType === 'graceNote') {
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
    } else if (deviceType === 'banjoRoll') {
        const root = targetChord.rootMidi;
        const rollPitches = [0, 4, 7, 9].map((i) => root + i);
        for (let i = 0; i < 4; i++) {
            deviceBuffer.push({
                midi: rollPitches[i % rollPitches.length],
                velocity: devBaseVel * (i === 0 ? 1.1 : 0.9),
                durationSteps: 1,
                style: activeStyle,
            });
        }
    } else if (deviceType === 'graceSlide') {
        deviceBuffer = [
            {
                midi: selectedMidi,
                velocity: devBaseVel * 1.2,
                durationSteps: 2,
                style: activeStyle,
                bendStartInterval: 1,
            },
        ];
    } else if (deviceType === 'countryBend' && isPolyphonic && !isPiano) {
        const rootMidi = targetChord.rootMidi;
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
    } else if (deviceType === 'chickenPick') {
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
    } else if (deviceType === 'birdFlurry') {
        if (playback.bpm > 180 && Math.random() < 0.8) {
            return null;
        }
        const rootMidi = targetChord.rootMidi;
        let curr = selectedMidi + 3;
        for (let i = 0; i < 4; i++) {
            let n = curr - 1;
            while (!((scaleMask >> ((n - rootMidi + 120) % 12)) & 1) && n > curr - 5) {
                n--;
            }
            deviceBuffer.push({
                midi: n,
                velocity: devBaseVel * 1.05,
                durationSteps: 1,
                style: activeStyle,
            });
            curr = n;
        }
    } else if (deviceType === 'run' || deviceType === 'enclosure') {
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
    } else if (deviceType === 'slide') {
        const dir =
            (soloist.mode === 'guitar' || activeStyle === 'bird') && Math.random() < 0.3 ? 1 : -1;
        deviceBuffer = [
            {
                midi: selectedMidi,
                velocity: devBaseVel * 1.15,
                durationSteps: 2,
                style: activeStyle,
                bendStartInterval: -dir,
            },
        ];
    } else if (deviceType === 'bluesCurl') {
        // Quick bend up and down (half-step)
        deviceBuffer = [
            {
                midi: selectedMidi,
                velocity: devBaseVel,
                durationSteps: 1,
                style: activeStyle,
                bendStartInterval: 0,
            },
            {
                midi: selectedMidi,
                velocity: devBaseVel * 0.9,
                durationSteps: 1,
                style: activeStyle,
                bendStartInterval: 0.5,
            },
            {
                midi: selectedMidi,
                velocity: devBaseVel * 0.8,
                durationSteps: 2,
                style: activeStyle,
                bendStartInterval: 0,
            },
        ];
    } else if (deviceType === 'bluesTurnaround') {
        const root = targetChord.rootMidi;
        // Iconic V-IV-I resolution lick
        deviceBuffer = [
            { midi: root + 7, durationSteps: 2, style: activeStyle },
            { midi: root + 6, durationSteps: 2, style: activeStyle },
            { midi: root + 5, durationSteps: 4, style: activeStyle },
            { midi: root + 3, durationSteps: 2, style: activeStyle, bendStartInterval: -0.5 },
            { midi: root, durationSteps: 6, style: activeStyle },
        ];
    } else if ((deviceType === 'quartal' || deviceType === 'guitarDouble') && isPolyphonic) {
        const dsInt = activeStyle === 'blues' || activeStyle === 'scalar' ? 5 : 4;
        deviceBuffer = [
            [
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
            ],
        ];
    }

    if (deviceBuffer.length > 0) {
        const firstNote = Array.isArray(deviceBuffer[0]) ? deviceBuffer[0][0] : deviceBuffer[0];
        const startMidi = firstNote.midi;
        const targetMidi = soloist.isResting ? dynamicCenter : lastMidi;
        const octaveShift = Math.round((targetMidi - startMidi) / 12) * 12;

        return deviceBuffer.map((n) => {
            const notes = Array.isArray(n) ? n : [n];
            const shifted = notes.map((note) => ({
                ...note,
                midi: Math.max(minMidi, Math.min(maxMidi, note.midi + octaveShift)),
            }));
            return shifted.length === 1 ? shifted[0] : shifted;
        });
    }

    return null;
}

/**
 * Generates additional notes for double stops based on style and mode.
 */
export function generateExtraNotes(ctx) {
    const { soloist, currentChord, activeStyle, effectiveIntensity, selectedMidi } = ctx;
    const extraNotes = [];

    if (soloist.mode === 'piano') {
        const currentRoot = currentChord.rootMidi;
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
            // Fallback for piano if no chord tones found nearby
            if (count === 0) {
                const dsInt = [3, 4, 5, 7][Math.floor(Math.random() * 4)];
                extraNotes.push({
                    midi: selectedMidi - dsInt,
                    velocity: (0.5 + effectiveIntensity * 0.6) * 0.95,
                    isDoubleStop: true,
                });
            }
        }
    } else if (activeStyle === 'country') {
        const dsInt = [8, 9][Math.floor(Math.random() * 2)];
        extraNotes.push({
            midi: selectedMidi + dsInt,
            velocity: (0.5 + effectiveIntensity * 0.6) * 0.95,
            isDoubleStop: true,
        });
    } else if (soloist.mode === 'guitar') {
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
        const dsInt = [5, 7, 9, 12][Math.floor(Math.random() * 4)];
        extraNotes.push({
            midi: selectedMidi + dsInt,
            velocity: (0.5 + effectiveIntensity * 0.6) * 0.95,
            isDoubleStop: true,
        });
    }

    return extraNotes;
}
