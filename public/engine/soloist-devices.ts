import { isSoloistGuitarMode, resolveSoloistMode } from './soloist-mode-policy.js';
import { getScaleForChord } from './theory-scales.js';

const JAZZ_GUITAR_STYLES = new Set(['jazz', 'bird', 'bossa']);
const GROOVE_GUITAR_STYLES = new Set(['funk', 'reggae', 'ska']);
const HIGH_ENERGY_GUITAR_STYLES = new Set(['metal', 'shred', 'scalar']);

/**
 * Soloist Melodic Devices Module
 * Contains procedural algorithms for generating embellishments, runs, and licks.
 */

/**
 * Worst-case step span for each melodic device. Used by the pitch engine to gate
 * device firings against the rhythm plan: a 12-step `bluesLick` dropped onto a
 * planned phrase with attacks 3 steps apart silently buries 3-4 planned attacks
 * (the consumer at soloist.ts:1497 shifts them off as "step > stepTarget"). The
 * gate keeps long, phrase-substitute devices to positions where the plan has
 * room for them instead of letting them eat the rest of the phrase.
 *
 * Spans are upper bounds across the device's branches (e.g. `bluesLick` has a
 * 3-note short branch and a 5-note long branch; we use the long branch).
 */
export const DEVICE_SPAN_STEPS: Record<string, number> = {
    // Ornaments (≤ 3 steps): expand a single attack — fire freely
    chickenPick: 1,
    quartal: 1,
    guitarDouble: 1,
    slide: 2,
    graceSlide: 2,
    graceNote: 3,
    run: 3,
    enclosure: 3,
    // Medium (4-5 steps): borderline. Allowed to bury at most one planned attack
    // so they read as "expanded ornament," not a full sub-phrase.
    bluesCurl: 4,
    chromaticEnclosure: 4,
    banjoRoll: 4,
    birdFlurry: 4,
    bebopScale: 4,
    quartalStack: 4,
    sheetsOfSound: 4,
    countryBend: 4,
    chromaticFall: 5,
    // Phrase substitutes (≥ 6 steps): only fire when the plan is clear ahead.
    // `bluesTurnaround` is already gated to turnaround steps in a separate path.
    bluesLick: 12,
    bluesTurnaround: 16,
};

/**
 * Computes a bitmask of intervals present in the current chord.
 */
export function getChordMask(currentChord: any): number {
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
 * @param deviceType - The ID of the device to generate (e.g., 'bluesLick', 'run').
 * @param ctx - Context object containing necessary state for generation.
 * @returns An array of note objects for the device buffer, or null if none generated.
 */
export function generateMelodicDevice(deviceType: string, ctx: any): any[] | null {
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
        responseSignature,
        responseSource = 'free',
        responseMode = 'free',
        responseDirection = 0,
        responseEntryTarget = false,
        responseCadenceTarget = false,
    } = ctx;

    const devBaseVel = 0.5 + effectiveIntensity * 0.6;
    let deviceBuffer: any[] = [];
    const canUseMotifShape = ['blues', 'jazz', 'bird', 'neo', 'bossa', 'scalar'].includes(
        activeStyle,
    );
    const shouldFollowMotifShape =
        canUseMotifShape &&
        (responseSource !== 'free' ||
            responseDirection !== 0 ||
            responseCadenceTarget ||
            responseEntryTarget);
    const motifApproach = shouldFollowMotifShape
        ? responseDirection > 0
            ? -1
            : responseDirection < 0
              ? 1
              : responseCadenceTarget
                ? 1
                : -1
        : -1;
    const motifSlideDirection = shouldFollowMotifShape
        ? responseDirection !== 0
            ? responseDirection
            : responseCadenceTarget
              ? -1
              : responseEntryTarget
                ? 1
                : 0
        : 0;
    const prefersCompactAnswer =
        shouldFollowMotifShape &&
        (responseSource === 'section' ||
            responseSource === 'form' ||
            responseMode === 'paraphrase');
    const carriesTripletMemory = shouldFollowMotifShape && Boolean(responseSignature?.tripletCarry);

    if (deviceType === 'bluesLick') {
        const root = targetChord.rootMidi;
        const relInt = (selectedMidi - root + 120) % 12;
        let lick: any[] = [];
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
        const graceInterval = motifApproach;
        deviceBuffer = [
            {
                midi: selectedMidi + graceInterval,
                velocity: devBaseVel * 0.8,
                durationSteps: 1,
                style: activeStyle,
            },
            {
                midi: selectedMidi,
                velocity: devBaseVel * 1.1,
                durationSteps: carriesTripletMemory && prefersCompactAnswer ? 1 : 2,
                style: activeStyle,
            },
        ];
    } else if (deviceType === 'banjoRoll') {
        const root = targetChord.rootMidi;
        const rollPitches = [0, 4, 7, 9].map((i: any) => root + i);
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
        let curr = selectedMidi + (responseDirection < 0 ? 1 : 3);
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
        const upperNeighbor = selectedMidi + 1;
        const lowerNeighbor = selectedMidi - 1;
        if (deviceType === 'run') {
            deviceBuffer = [
                {
                    midi: selectedMidi + motifApproach * 2,
                    velocity: devBaseVel * 0.9,
                    durationSteps: 1,
                    style: activeStyle,
                },
                {
                    midi: selectedMidi + motifApproach,
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
        } else {
            const firstNeighbor = motifApproach > 0 ? upperNeighbor : lowerNeighbor;
            const secondNeighbor = motifApproach > 0 ? lowerNeighbor : upperNeighbor;
            deviceBuffer = [
                {
                    midi: firstNeighbor,
                    velocity: devBaseVel * 0.9,
                    durationSteps: 1,
                    style: activeStyle,
                },
                {
                    midi: secondNeighbor,
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
        }
    } else if (deviceType === 'slide') {
        const dir =
            motifSlideDirection !== 0
                ? motifSlideDirection
                : (isSoloistGuitarMode(soloist.mode) || activeStyle === 'bird') &&
                    Math.random() < 0.3
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
        const firstNeighbor = motifApproach > 0 ? selectedMidi + 1 : selectedMidi - 1;
        const secondNeighbor = motifApproach > 0 ? selectedMidi - 1 : selectedMidi + 1;
        deviceBuffer = [
            {
                midi: firstNeighbor,
                durationSteps: 1,
                velocity: devBaseVel * 0.8,
                style: activeStyle,
            },
            {
                midi: secondNeighbor,
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
        const targetMidi = soloist.session.phrasing.isResting ? dynamicCenter : lastMidi;
        const octaveShift = Math.round((targetMidi - startMidi) / 12) * 12;

        return deviceBuffer.map((n: any) => {
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

interface GuitarIntervalPaletteOptions {
    activeStyle: string;
    supportHint?: any;
}

function getGuitarIntervalPalette(options: GuitarIntervalPaletteOptions): number[] {
    const { activeStyle, supportHint } = options;
    const palette = supportHint?.intervalPalette;

    if (palette === 'blues' || activeStyle === 'blues') {
        return [3, 4, 5, 7, 6];
    }
    if (palette === 'open' || activeStyle === 'country') {
        return [7, 5, 9, 4, 3];
    }
    if (JAZZ_GUITAR_STYLES.has(activeStyle)) {
        return [3, 4, 7, 5];
    }
    if (GROOVE_GUITAR_STYLES.has(activeStyle)) {
        return [4, 5, 3, 7];
    }
    if (activeStyle === 'neo') {
        return [5, 7, 4, 3, 9];
    }
    if (activeStyle === 'rock') {
        return [4, 5, 3, 7, 8];
    }
    if (HIGH_ENERGY_GUITAR_STYLES.has(activeStyle)) {
        return [5, 7, 4, 3];
    }
    return [3, 4, 5, 7, 8, 9];
}

interface GuitarSupportMidiOptions {
    currentChord: any;
    activeStyle: string;
    selectedMidi: number;
    supportHint?: any;
}

/**
 * Choose a supportive lower voice that sounds like a guitarist reinforcing the melody,
 * not like a generic chord-stack algorithm filling space.
 */
function selectGuitarSupportMidi(options: GuitarSupportMidiOptions): number {
    const { currentChord, activeStyle, selectedMidi, supportHint } = options;
    const currentRoot = currentChord.rootMidi;
    const chordMask = getChordMask(currentChord);
    const intervalPalette = getGuitarIntervalPalette({ activeStyle, supportHint });
    const supportRole = supportHint?.role || 'line';
    const isJazzStyle = JAZZ_GUITAR_STYLES.has(activeStyle);
    const isGrooveStyle = GROOVE_GUITAR_STYLES.has(activeStyle);
    const isHighEnergyStyle = HIGH_ENERGY_GUITAR_STYLES.has(activeStyle);
    const supportFloor = Math.max(
        isJazzStyle ? 57 : isGrooveStyle ? 55 : 52,
        selectedMidi - (isJazzStyle ? 10 : 12),
    );

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
        if (activeStyle === 'rock' && (dsInt === 4 || dsInt === 5 || dsInt === 7)) {
            score += 1.2;
        }
        if (isJazzStyle) {
            if (dsInt === 3 || dsInt === 4) {
                score += 3.2;
            } else if (dsInt === 7) {
                score += 1.8;
            } else if (dsInt >= 8) {
                score -= 2.4;
            }
        }
        if (isGrooveStyle) {
            if (dsInt === 4 || dsInt === 5) {
                score += 2.4;
            }
            if (dsInt >= 7) {
                score -= 1.8;
            }
        }
        if (isHighEnergyStyle) {
            if (dsInt === 5 || dsInt === 7) {
                score += 2.1;
            } else if (dsInt >= 8) {
                score -= 2.2;
            }
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
            if (isGrooveStyle || isHighEnergyStyle) {
                score -= 0.8;
            }
            if (isJazzStyle && dsInt >= 7) {
                score -= 1.1;
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
 */
export function generateExtraNotes(ctx: any) {
    const { soloist, currentChord, activeStyle, effectiveIntensity, selectedMidi, seedNote } = ctx;
    const extraNotes = [];
    const soloistMode = resolveSoloistMode(soloist.mode);
    const supportHint = seedNote?.supportHints?.guitar;
    const supportRole = ctx.supportRole || seedNote?.supportHints?.role || 'line';
    const sustainBias = ctx.sustainBias ?? seedNote?.supportHints?.sustainBias ?? 0;

    if (activeStyle === 'country') {
        let supportDurationScale = 0.7;
        if (supportRole === 'pickup' || supportRole === 'line') {
            supportDurationScale = 0.52;
        } else if (supportRole === 'accent') {
            supportDurationScale = 0.64;
        } else if (supportRole === 'anchor' || supportRole === 'cadence') {
            supportDurationScale = 0.8 + sustainBias * 0.12;
        } else if (supportRole === 'sustain') {
            supportDurationScale = 0.76 + sustainBias * 0.12;
        }
        const dsInt = [8, 9][Math.floor(Math.random() * 2)];
        extraNotes.push({
            midi: selectedMidi + dsInt,
            velocity: (0.5 + effectiveIntensity * 0.6) * 0.95,
            isDoubleStop: true,
            durationScale: Math.min(0.95, supportDurationScale),
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
        if (JAZZ_GUITAR_STYLES.has(activeStyle)) {
            supportDurationScale =
                supportRole === 'anchor' || supportRole === 'cadence'
                    ? Math.min(supportDurationScale, 0.72)
                    : Math.min(supportDurationScale, 0.56);
        } else if (GROOVE_GUITAR_STYLES.has(activeStyle)) {
            supportDurationScale =
                supportRole === 'accent'
                    ? Math.min(supportDurationScale, 0.58)
                    : Math.min(supportDurationScale, 0.5);
        } else if (HIGH_ENERGY_GUITAR_STYLES.has(activeStyle)) {
            supportDurationScale =
                supportRole === 'anchor' || supportRole === 'cadence'
                    ? Math.min(supportDurationScale, 0.68)
                    : Math.min(supportDurationScale, 0.46);
        } else if (activeStyle === 'rock') {
            supportDurationScale =
                supportRole === 'line'
                    ? Math.min(supportDurationScale, 0.54)
                    : supportDurationScale;
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
