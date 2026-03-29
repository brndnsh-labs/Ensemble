import { isSoloistGuitarMode, resolveSoloistMode } from './soloist-mode-policy.js';
import { getScaleForChord } from './theory-scales.js';

/**
 * Soloist Melodic Devices Module
 * Contains procedural algorithms for generating embellishments, runs, and licks.
 */

/**
 * Computes a bitmask of intervals present in the current chord.
 * @param {any} currentChord
 * @returns {number}
 */
export function getChordMask(currentChord) {
    let mask = 0;
    if (currentChord?.intervals) {
        for (let i = 0; i < currentChord.intervals.length; i++) {
            const intv = ((currentChord.intervals[i] % 12) + 12) % 12;
            mask |= 1 << intv;
        }
    }
    return mask;
}

/**
 * Generates a sequence of notes for a specific melodic device.
 * @param {string} deviceType - The ID of the device to generate (e.g., 'bluesLick', 'run').
 * @param {any} ctx - Context object containing necessary state for generation.
 * @returns {any[]|null} An array of note objects for the device buffer, or null if none generated.
 */
export function generateMelodicDevice(deviceType, ctx) {
    const {
        state,
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
        /** @type {any[]} */
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
        const rollPitches = [0, 4, 7, 9].map((/** @type {any} */ i) => root + i);
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
            (isSoloistGuitarMode(soloist.mode) || activeStyle === 'bird') && Math.random() < 0.3
                ? 1
                : -1;
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
            { midi: root + 7, durationSteps: 2, velocity: devBaseVel, style: activeStyle },
            { midi: root + 6, durationSteps: 2, velocity: devBaseVel * 0.9, style: activeStyle },
            { midi: root + 5, durationSteps: 4, velocity: devBaseVel, style: activeStyle },
            {
                midi: root + 3,
                durationSteps: 2,
                velocity: devBaseVel * 0.8,
                style: activeStyle,
                bendStartInterval: -0.5,
            },
            { midi: root, durationSteps: 6, velocity: devBaseVel * 1.1, style: activeStyle },
        ];
    } else if (deviceType === 'chromaticEnclosure') {
        // Enclosure: One above, one below, target
        deviceBuffer = [
            {
                midi: selectedMidi + 1,
                durationSteps: 1,
                velocity: devBaseVel * 0.8,
                style: activeStyle,
            },
            {
                midi: selectedMidi - 1,
                durationSteps: 1,
                velocity: devBaseVel * 0.8,
                style: activeStyle,
            },
            { midi: selectedMidi, durationSteps: 2, velocity: devBaseVel, style: activeStyle },
        ];
    } else if (deviceType === 'bebopScale') {
        // Run with chromatic passing tone
        const _scale = getScaleForChord(state, targetChord, null, activeStyle);
        const root = targetChord.rootMidi;
        const bebopNote = root + 11; // Major 7 passing tone for dominant

        deviceBuffer = [
            { midi: root + 12, durationSteps: 1, velocity: devBaseVel, style: activeStyle },
            { midi: bebopNote, durationSteps: 1, velocity: devBaseVel * 0.9, style: activeStyle },
            { midi: root + 10, durationSteps: 1, velocity: devBaseVel * 0.8, style: activeStyle },
            { midi: root + 9, durationSteps: 1, velocity: devBaseVel * 0.7, style: activeStyle },
        ];
    } else if (deviceType === 'quartalStack' && isPolyphonic) {
        // Stack of 4ths
        deviceBuffer = [
            [
                { midi: selectedMidi, velocity: devBaseVel, durationSteps: 4, style: activeStyle },
                {
                    midi: selectedMidi + 5,
                    velocity: devBaseVel * 0.9,
                    durationSteps: 4,
                    style: activeStyle,
                },
                {
                    midi: selectedMidi + 10,
                    velocity: devBaseVel * 0.8,
                    durationSteps: 4,
                    style: activeStyle,
                },
            ],
        ];
    } else if (deviceType === 'sheetsOfSound') {
        // Fast multi-octave run
        const scale = getScaleForChord(state, targetChord, null, activeStyle);
        deviceBuffer = [];
        const startMidi = selectedMidi - 12;
        for (let i = 0; i < 8; i++) {
            const interval = scale[i % scale.length];
            const octaveShift = Math.floor(i / scale.length) * 12;
            deviceBuffer.push({
                midi: startMidi + interval + octaveShift,
                durationSteps: 0.5, // 32nd notes
                velocity: devBaseVel * (0.7 + Math.random() * 0.3),
                style: activeStyle,
            });
        }
    } else if ((deviceType === 'quartal' || deviceType === 'guitarDouble') && isPolyphonic) {
        const dsInt = activeStyle === 'blues' || activeStyle === 'scalar' ? 5 : 4;
        deviceBuffer = [
            [
                {
                    midi: selectedMidi - dsInt,
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

        return deviceBuffer.map((/** @type {any} */ n) => {
            const notes = Array.isArray(n) ? n : [n];
            const shifted = notes.map((note) => ({
                ...note,
                device: note.device || deviceType,
                midi: Math.max(minMidi, Math.min(maxMidi, note.midi + octaveShift)),
            }));
            return shifted.length === 1 ? shifted[0] : shifted;
        });
    }

    return null;
}

/**
 * @param {{ activeStyle: string, supportHint?: any }} options
 * @returns {number[]}
 */
function getGuitarIntervalPalette(options) {
    const { activeStyle, supportHint } = options;
    const palette = supportHint?.intervalPalette;

    if (palette === 'blues' || activeStyle === 'blues') {
        return [3, 4, 5, 7, 6];
    }
    if (palette === 'open' || activeStyle === 'country') {
        return [7, 5, 9, 4, 3];
    }
    if (activeStyle === 'neo') {
        return [5, 7, 4, 3, 9];
    }
    if (activeStyle === 'rock') {
        return [4, 5, 3, 7, 8];
    }
    return [3, 4, 5, 7, 8, 9];
}

/**
 * Choose a supportive lower voice that sounds like a guitarist reinforcing the melody,
 * not like a generic chord-stack algorithm filling space.
 * @param {{ currentChord: any, activeStyle: string, selectedMidi: number, supportHint?: any }} options
 * @returns {number}
 */
function selectGuitarSupportMidi(options) {
    const { currentChord, activeStyle, selectedMidi, supportHint } = options;
    const currentRoot = currentChord.rootMidi;
    const chordMask = getChordMask(currentChord);
    const intervalPalette = getGuitarIntervalPalette({ activeStyle, supportHint });
    const supportFloor = Math.max(52, selectedMidi - 12);
    const supportRole = supportHint?.role || 'line';

    let bestMidi = Number.NaN;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < intervalPalette.length; i++) {
        const dsInt = intervalPalette[i];
        const candidateMidi = selectedMidi - dsInt;
        if (candidateMidi < supportFloor || candidateMidi >= selectedMidi) {
            continue;
        }

        const pc = ((candidateMidi % 12) + 12) % 12;
        const interval = (pc - (currentRoot % 12) + 12) % 12;
        const isChordTone = Boolean((chordMask >> interval) & 1);

        let score = isChordTone ? 6 : -2.5;

        if (dsInt === 3 || dsInt === 4) {
            score += activeStyle === 'blues' ? 4 : 3;
        } else if (dsInt === 5) {
            score += 2.5;
        } else if (dsInt === 7) {
            score += supportHint?.intervalPalette === 'open' ? 3.5 : 1.5;
        } else if (dsInt >= 8) {
            score += supportHint?.intervalPalette === 'open' ? 2 : -1;
        }

        if (activeStyle === 'neo' && (dsInt === 5 || dsInt === 7)) {
            score += 1.5;
        }
        if (supportRole === 'cadence' && isChordTone) {
            score += 2;
        }
        if ((supportHint?.sustainBias || 0) >= 0.85 && (dsInt === 5 || dsInt === 7)) {
            score += 1.4;
        }
        if (supportRole === 'anchor' || supportRole === 'cadence') {
            if (dsInt === 4 || dsInt === 5) {
                score += 1.5;
            }
            if (dsInt >= 8) {
                score -= 0.75;
            }
        }
        if (supportRole === 'accent') {
            if (dsInt === 3 || dsInt === 4) {
                score += 0.8;
            }
            if (dsInt === 7) {
                score += 0.5;
            }
        }
        if (supportRole === 'line') {
            if (dsInt >= 7) {
                score -= 1.5;
            }
            if (dsInt === 3 || dsInt === 4 || dsInt === 5) {
                score += 0.8;
            }
        }
        if (candidateMidi < 57) {
            score -= 1;
        }
        if (candidateMidi < 60 && supportRole === 'line') {
            score -= 1.25;
        }
        if (selectedMidi - candidateMidi > 9 && supportRole !== 'cadence') {
            score -= 1;
        }

        if (score > bestScore) {
            bestScore = score;
            bestMidi = candidateMidi;
        }
    }

    if (!Number.isFinite(bestMidi)) {
        return selectedMidi - (activeStyle === 'blues' ? 5 : 4);
    }

    return bestMidi;
}

/**
 * Generates additional notes for double stops based on style and mode.
 * @param {any} ctx
 */
export function generateExtraNotes(ctx) {
    const { soloist, currentChord, activeStyle, effectiveIntensity, selectedMidi, seedNote } = ctx;
    const extraNotes = [];
    const soloistMode = resolveSoloistMode(soloist.mode);
    const supportHint = seedNote?.supportHints?.guitar;
    const supportRole = ctx.supportRole || seedNote?.supportHints?.role || 'line';
    const sustainBias = ctx.sustainBias ?? seedNote?.supportHints?.sustainBias ?? 0;

    if (activeStyle === 'country') {
        const dsInt = [8, 9][Math.floor(Math.random() * 2)];
        extraNotes.push({
            midi: selectedMidi + dsInt,
            velocity: (0.5 + effectiveIntensity * 0.6) * 0.95,
            isDoubleStop: true,
        });
    } else if (isSoloistGuitarMode(soloistMode)) {
        const foundMidi = selectGuitarSupportMidi({
            currentChord,
            activeStyle,
            selectedMidi,
            supportHint: supportHint
                ? {
                      ...supportHint,
                      role: supportRole,
                      sustainBias,
                  }
                : null,
        });
        let supportDurationScale = 0.72;
        if (supportRole === 'pickup' || supportRole === 'line') {
            supportDurationScale = 0.48;
        } else if (supportRole === 'accent') {
            supportDurationScale = 0.62;
        } else if (supportRole === 'anchor' || supportRole === 'cadence') {
            supportDurationScale = 0.8 + sustainBias * 0.15;
        } else if (supportRole === 'sustain') {
            supportDurationScale = 0.7 + sustainBias * 0.18;
        }
        extraNotes.push({
            midi: foundMidi,
            velocity: (0.5 + effectiveIntensity * 0.6) * 0.95,
            isDoubleStop: true,
            durationScale: Math.min(0.95, supportDurationScale),
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
