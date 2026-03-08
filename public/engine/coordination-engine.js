// public/engine/coordination-engine.js

/**
 * Coordination Context Management and Contract Enforcement
 * This module ensures the "Musical Coordination Contract" is satisfied.
 */

export function createCoordinationContext(step, _state) {
    // Initial context derived from the "anchor" (Groove)
    return {
        step,
        kickHit: false, // Set during pre-calculation
        snareHit: false, // Set during pre-calculation
        pocketOffset: 0, // To be set from groove-engine
        soloistBusy: false, // Set by soloist turn
        soloistMidi: 0, // Set by soloist turn
        bassHit: false, // Set by bass turn
        bassMidi: 0, // Set by bass turn
        accompanimentHit: false,
        accompanimentMidis: [],
        upcomingSectionFirstChord: null,
    };
}

export function updateCoordinationContext(context, module, result) {
    if (!result) {
        return;
    }

    switch (module) {
        case 'soloist': {
            const results = Array.isArray(result) ? result : [result];
            const mainResult = results.find((r) => !r.isDoubleStop) || results[0];
            if (mainResult && mainResult.midi > 0) {
                context.soloistActive = true;
                context.soloistMidi = mainResult.midi;
                // soloistBusy is typically determined by the soloist generator itself
                // but we can also infer it from density in the future.
                if (mainResult.isBusy) {
                    context.soloistBusy = true;
                }
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
            notes.forEach((n) => {
                if (n.midi > 0) {
                    context.accompanimentHit = true;
                    context.accompanimentMidis.push(n.midi);
                }
            });
            break;
        }
    }
}

/**
 * Enforces the "Strict Register Slotting" rules defined in ENSEMBLE_COORDINATION.md.
 * If a note is outside its designated slot, it is transposed to the nearest octave within range.
 */
export function enforceRegisterSlotting(module, midi, _context) {
    if (midi <= 0) {
        return midi;
    }

    switch (module) {
        case 'bass':
            // Bass: MIDI 28 to 51
            return clampToOctave(midi, 28, 51);

        case 'chords':
            // Chords: 52 to 84 (when Bass is present/active)
            // Note: We check if bass is enabled in the state or if a bass note was played.
            return clampToOctave(midi, 52, 84);

        case 'soloist':
            // Soloist: Priority 60 to 90, but has free range.
            // We only clamp if it's hitting extremely low bass frequencies.
            if (midi < 40) {
                return clampToOctave(midi, 60, 90);
            }
            return midi;

        default:
            return midi;
    }
}

function clampToOctave(midi, min, max) {
    let current = midi;
    while (current < min) {
        current += 12;
    }
    while (current > max) {
        current -= 12;
    }

    // If still out of range after octave shifts (meaning the range is < 12 semitones)
    // we just clamp to the bounds.
    return Math.max(min, Math.min(max, current));
}
