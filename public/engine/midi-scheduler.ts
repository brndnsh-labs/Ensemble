import {
    panic,
    sendMIDICC,
    sendMIDIDrum,
    sendMIDINote,
    sendMIDITransport,
} from '../midi-controller.js';
import type { EnsembleState, StepInfo } from '../types.js';
import { getMidi } from '../utils.js';
import { normalizeMidiVelocity } from './midi-utils.js';

export function stopMidiTransport(_state: EnsembleState, time: number): void {
    panic(true);
    sendMIDITransport('stop', time);
}

export function startMidiTransport(_state: EnsembleState, time: number): void {
    panic(true);
    sendMIDITransport('start', time);
}

export function dispatchMidiCountInSoloist(state: EnsembleState, res: any, time: number): void {
    const { midi } = state;
    if (!midi) {
        return;
    }
    sendMIDINote(midi.soloistChannel, res.midi, res.velocity, time, res.duration || 0.25);
}

export function dispatchMidiDrum(
    state: EnsembleState,
    soundName: string,
    playTime: number,
    velocity: number,
): void {
    const { midi } = state;
    sendMIDIDrum(soundName, playTime, Math.min(1.0, velocity), midi.drumsOctave);
}

export function dispatchMidiBass(
    state: EnsembleState,
    midiNum: number,
    finalVel: number,
    adjustedTime: number,
    duration: number,
): void {
    const { midi } = state;
    sendMIDINote(
        midi.bassChannel,
        midiNum + midi.bassOctave * 12,
        normalizeMidiVelocity(finalVel, midi.velocitySensitivity),
        adjustedTime,
        duration,
        true, // isMono
    );
}

export function dispatchMidiSoloist(
    state: EnsembleState,
    midiNum: number,
    vel: number,
    playTime: number,
    duration: number,
    bendStartInterval: number,
    isMono: boolean,
): void {
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
        normalizeMidiVelocity(vel, midi.velocitySensitivity),
        playTime,
        duration,
        { isMono, bend },
    );
}

export function dispatchMidiChordSustain(
    state: EnsembleState,
    value: number,
    ccTime: number,
): void {
    const { midi } = state;
    sendMIDICC(midi.chordsChannel, 64, value, ccTime);
}

export function dispatchMidiChordNote(
    state: any,
    freq: number,
    velocity: number,
    playTime: number,
    duration: number,
): void {
    if (!state?.midi) {
        return;
    }
    const midiNote = getMidi(freq);
    if (midiNote === null) {
        return;
    }

    sendMIDINote(
        state.midi.chordsChannel,
        midiNote + state.midi.chordsOctave * 12,
        normalizeMidiVelocity(velocity, state.midi.velocitySensitivity),
        playTime,
        duration,
    );
}

export function dispatchMidiHarmonyNote(
    state: EnsembleState,
    m: number,
    finalVel: number,
    playTime: number,
    duration: number,
): void {
    const { midi } = state;
    if (!midi) {
        return;
    }
    sendMIDINote(
        midi.harmonyChannel,
        m + midi.harmonyOctave * 12,
        normalizeMidiVelocity(finalVel, midi.velocitySensitivity),
        playTime,
        duration,
    );
}

export function dispatchMidiAutomation(
    state: EnsembleState,
    stepInfo: StepInfo,
    swungTime: number,
): void {
    const { midi, playback, soloist } = state;
    if (midi.enabled && midi.selectedOutputId && stepInfo.isBeatStart) {
        const intensityCC = Math.floor(playback.bandIntensity * 127);
        const soloistTensionCC = Math.floor(soloist.session.tension * 127);

        sendMIDICC(midi.soloistChannel, 1, soloistTensionCC, swungTime);
        sendMIDICC(midi.soloistChannel, 11, intensityCC, swungTime);
        sendMIDICC(midi.chordsChannel, 11, intensityCC, swungTime);
        sendMIDICC(midi.bassChannel, 11, intensityCC, swungTime);
    }
}
