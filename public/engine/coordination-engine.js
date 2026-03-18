// public/engine/coordination-engine.js

/**
 * Coordination Context Management and Contract Enforcement
 * This module ensures the "Musical Coordination Contract" is satisfied.
 */

/**
 * @param {number} step
 * @param {import('../types.js').StepInfo|null} [stepInfo=null]
 */
export function createCoordinationContext(step, stepInfo = null) {
    // Initial context derived from the "anchor" (Groove)
    const ts = /** @type {any} */ (stepInfo)?.tsConfig || { beats: 4, stepsPerBeat: 4 };
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const mStep = stepInfo ? stepInfo.mStep : step % stepsPerBar;

    return {
        step,
        mStep,
        isMeasureStart: stepInfo ? stepInfo.isMeasureStart : mStep === 0,
        isMeasureEnd: mStep >= stepsPerBar - (ts.stepsPerBeat || 4), // Last beat of measure
        kickHit: false, // Set during pre-calculation
        snareHit: false, // Set during pre-calculation
        pocketOffset: 0, // To be set from groove-engine
        soloistBusy: false, // Set by soloist turn
        soloistMidi: 0, // Set by soloist turn
        avgSoloistMidi: 0,
        bassHit: false, // Set by bass turn
        bassMidi: 0, // Set by bass turn
        accompanimentHit: false,
        accompanimentMidis: [],
        avgChordMidi: 0,
        upcomingSectionFirstChord: null,
    };
}

/**
 * @param {any} context
 * @param {string} module
 * @param {any} result
 */
export function updateCoordinationContext(context, module, result) {
    if (!result) {
        return;
    }

    switch (module) {
        case 'soloist': {
            const results = Array.isArray(result) ? result : [result];
            // Optimization: Replace filter/reduce/find chain with single loop to avoid allocations
            let sum = 0;
            let count = 0;
            let mainResult = null;

            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                if (r.midi > 0) {
                    sum += r.midi;
                    count++;
                    if (!mainResult || (!r.isDoubleStop && mainResult.isDoubleStop)) {
                        mainResult = r;
                    }
                }
            }

            if (mainResult) {
                context.soloistActive = true;
                context.soloistMidi = mainResult.midi;
                if (mainResult.isBusy) {
                    context.soloistBusy = true;
                }

                // Calculate average for harmony slotting
                context.avgSoloistMidi = sum / count;
            }
            break;
        }
        case 'bass':
            if (result.midi > 0) {
                context.bassHit = true;
                context.bassMidi = result.midi;
            }
            break;
        case 'chords': {
            const notes = Array.isArray(result) ? result : [result];
            // Optimization: Replace map/filter/reduce chain with standard for loop to avoid intermediate array allocations
            const activeMidis = [];
            let sum = 0;
            for (let i = 0; i < notes.length; i++) {
                const m = notes[i].midi;
                if (m > 0) {
                    activeMidis.push(m);
                    sum += m;
                }
            }

            if (activeMidis.length > 0) {
                context.accompanimentHit = true;
                context.accompanimentMidis = activeMidis;
                context.avgChordMidi = sum / activeMidis.length;
            }
            break;
        }
    }
}

/**
 * Enforces the "Strict Register Slotting" rules defined in ENSEMBLE_COORDINATION.md.
 * If a note is outside its designated slot, it is transposed to the nearest octave within range.
 * @param {string} module
 * @param {number} midi
 * @param {any} _context
 * @param {number|null} [targetMidi=null]
 */
export function enforceRegisterSlotting(module, midi, _context, targetMidi = null) {
    if (midi <= 0) {
        return midi;
    }

    switch (module) {
        case 'bass':
            // Bass: MIDI 28 to 51
            return smoothOctaveClamp(midi, 28, 51, targetMidi);

        case 'chords':
            // Chords: 52 to 84 (when Bass is present/active)
            return smoothOctaveClamp(midi, 52, 84, targetMidi);

        case 'soloist':
            // Soloist: Priority 60 to 90, but has free range.
            // We only clamp if it's hitting extremely low bass frequencies.
            if (midi < 40) {
                return smoothOctaveClamp(midi, 60, 90, targetMidi);
            }
            return midi;

        default:
            return midi;
    }
}

/**
 * @param {number} midi
 * @param {number} min
 * @param {number} max
 * @param {number|null} [target=null]
 */
function smoothOctaveClamp(midi, min, max, target = null) {
    let current = midi;

    // If we have a target (e.g. previous note), try to get as close as possible
    // while staying within [min, max]
    if (target !== null) {
        // First get into range
        while (current < min) {
            current += 12;
        }
        while (current > max) {
            current -= 12;
        }

        // Then try to match target octave
        const octaves = [-12, 12];
        for (const shift of octaves) {
            const shifted = current + shift;
            if (shifted >= min && shifted <= max) {
                if (Math.abs(shifted - target) < Math.abs(current - target)) {
                    current = shifted;
                }
            }
        }
    } else {
        while (current < min) {
            current += 12;
        }
        while (current > max) {
            current -= 12;
        }
    }

    return Math.max(min, Math.min(max, current));
}
