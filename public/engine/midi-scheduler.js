import {
    normalizeMidiVelocity,
    panic,
    sendMIDICC,
    sendMIDIDrum,
    sendMIDINote,
    sendMIDITransport,
} from '../midi-controller.js';
import { getMidi } from '../utils.js';

/**
 * Stops MIDI transport and sends panic.
 * @param {import('../types.js').EnsembleState} _state - Global ensemble state
 * @param {number} time - AudioContext time
 */
export function stopMidiTransport(_state, time) {
    panic(true);
    sendMIDITransport('stop', time);
}

/**
 * Starts MIDI transport and sends panic.
 * @param {import('../types.js').EnsembleState} _state - Global ensemble state
 * @param {number} time - AudioContext time
 */
export function startMidiTransport(_state, time) {
    panic(true);
    sendMIDITransport('start', time);
}

/**
 * Dispatches a MIDI count-in note for the soloist.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state
 * @param {any} res - Resolution object
 * @param {number} time - AudioContext time
 */
export function dispatchMidiCountInSoloist(state, res, time) {
    const { midi } = state;
    if (!midi) {
        return;
    }
    sendMIDINote(midi.soloistChannel, res.midi, res.velocity, time, res.duration || 0.25);
}

/**
 * Dispatches a MIDI drum note.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state
 * @param {string} soundName - Drum sound name
 * @param {number} playTime - AudioContext time
 * @param {number} velocity - Drum velocity
 */
export function dispatchMidiDrum(state, soundName, playTime, velocity) {
    const { midi } = state;
    sendMIDIDrum(soundName, playTime, Math.min(1.0, velocity), midi.drumsOctave);
}

/**
 * Dispatches a MIDI bass note.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state
 * @param {number} midiNum - MIDI note number
 * @param {number} finalVel - Final velocity
 * @param {number} adjustedTime - Adjusted AudioContext time
 * @param {number} duration - Note duration
 */
export function dispatchMidiBass(state, midiNum, finalVel, adjustedTime, duration) {
    const { midi } = state;
    sendMIDINote(
        midi.bassChannel,
        midiNum + midi.bassOctave * 12,
        normalizeMidiVelocity(finalVel),
        adjustedTime,
        duration,
        true, // isMono
    );
}

/**
 * Dispatches a MIDI soloist note with pitch bend support.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state
 * @param {number} midiNum - MIDI note number
 * @param {number} vel - Final velocity
 * @param {number} playTime - AudioContext time
 * @param {number} duration - Note duration
 * @param {number} bendStartInterval - Bend start interval in semitones
 * @param {boolean} isMono - Whether to force monophonic output
 */
export function dispatchMidiSoloist(
    state,
    midiNum,
    vel,
    playTime,
    duration,
    bendStartInterval,
    isMono,
) {
    const { midi } = state;
    // Support Pitch Bend for MIDI scoops
    let bend = 0;
    if (bendStartInterval !== 0) {
        // Map semitones to 14-bit value (-8192 to 8191)
        // Assuming standard 2-semitone range.
        bend = Math.round(-(bendStartInterval / 2) * 8192);
    }

    sendMIDINote(
        midi.soloistChannel,
        midiNum + midi.soloistOctave * 12,
        normalizeMidiVelocity(vel),
        playTime,
        duration,
        { isMono, bend },
    );
}

/**
 * Dispatches a MIDI sustain pedal event.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state
 * @param {number} value - CC value
 * @param {number} ccTime - AudioContext time
 */
export function dispatchMidiChordSustain(state, value, ccTime) {
    const { midi } = state;
    sendMIDICC(midi.chordsChannel, 64, value, ccTime);
}

/**
 * Dispatches a MIDI chord note.
 * @param {any} state - Global ensemble state
 * @param {number} freq - Note frequency
 * @param {number} velocity - Note velocity
 * @param {number} playTime - AudioContext time
 * @param {number} duration - Note duration
 */
export function dispatchMidiChordNote(state, freq, velocity, playTime, duration) {
    if (!state || !state.midi) {
        return;
    }
    const midiNote = getMidi(freq);
    if (midiNote === null) {
        return;
    }

    sendMIDINote(
        state.midi.chordsChannel,
        midiNote + state.midi.chordsOctave * 12,
        normalizeMidiVelocity(velocity),
        playTime,
        duration,
    );
}

/**
 * Dispatches a MIDI harmony note.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state
 * @param {number} m - MIDI note number
 * @param {number} finalVel - Note velocity
 * @param {number} playTime - AudioContext time
 * @param {number} duration - Note duration
 */
export function dispatchMidiHarmonyNote(state, m, finalVel, playTime, duration) {
    const { midi } = state;
    if (!midi) {
        return;
    }
    sendMIDINote(
        midi.harmonyChannel,
        m + midi.harmonyOctave * 12,
        normalizeMidiVelocity(finalVel),
        playTime,
        duration,
    );
}

/**
 * Dispatches MIDI automation CC messages.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state
 * @param {import('../types.js').StepInfo} stepInfo - Global step info
 * @param {number} swungTime - AudioContext time
 */
export function dispatchMidiAutomation(state, stepInfo, swungTime) {
    const { midi, playback, soloist } = state;
    if (midi.enabled && midi.selectedOutputId && stepInfo.isBeatStart) {
        const intensityCC = Math.floor(playback.bandIntensity * 127);
        const soloistTensionCC = Math.floor(soloist.tension * 127);

        sendMIDICC(midi.soloistChannel, 1, soloistTensionCC, swungTime);
        sendMIDICC(midi.soloistChannel, 11, intensityCC, swungTime);
        sendMIDICC(midi.chordsChannel, 11, intensityCC, swungTime);
        sendMIDICC(midi.bassChannel, 11, intensityCC, swungTime);
    }
}
