import { DRUM_MAP } from './engine/midi-constants.js';
import { normalizeMidiVelocity } from './engine/midi-utils.js';
import type { MidiState } from './state/midi.js';
import { dispatch, getState } from './state.js';
import { ACTIONS } from './types.js';

let midiAccess: any = null;

// Track pending Note Offs to handle overlaps/legato properly.
// Key: `${channel}_${note}`, Value: timeoutId
const activeNoteOffs = new Map<string, { id: ReturnType<typeof setTimeout>; endTime: number }>();

// Track currently active ("On") notes to send explicit Offs during panic.
// Key: `${channel}_${note}`
const activeNotes = new Set<string>();

// Cache for redundant message filtering to prevent flooding the MIDI stream.
// Key: `${channel}_${controller}` -> value
const sentCCValues = new Map<string, number>();
// Key: `${channel}` -> value
const sentBendValues = new Map<number, number>();

/**
 * Handles incoming MIDI messages from controllers.
 */
function handleMIDIMessage(event: any): void {
    const { midi } = getState();
    if (!midi.enabled) {
        return;
    }

    const [status, data1, data2] = event.data;
    const type = status & 0xf0;

    // CC Messages (0xB0)
    if (type === 0xb0) {
        // Controller 11 (Expression) or 1 (Modulation) maps to Band Intensity
        if (data1 === 11 || data1 === 1) {
            const intensity = data2 / 127;
            dispatch(ACTIONS.SET_BAND_INTENSITY, intensity);
        }
    }
}

/**
 * Initializes Web MIDI access and populates available outputs.
 */
export async function initMIDI(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) {
        console.warn('Web MIDI API not supported in this browser.');
        return false;
    }

    try {
        midiAccess = await navigator.requestMIDIAccess();
        midiAccess.onstatechange = () => {
            syncMIDIOutputs();
        };

        // Setup input listeners
        if (midiAccess.inputs) {
            for (const input of midiAccess.inputs.values()) {
                input.onmidimessage = handleMIDIMessage;
            }
        }

        syncMIDIOutputs();
        return true;
    } catch (err) {
        console.error('Failed to get MIDI access', err);
        return false;
    }
}

/**
 * Updates the state with current list of MIDI outputs.
 */
function syncMIDIOutputs(): void {
    if (!midiAccess) {
        return;
    }
    const outputs: { id: string; name: string }[] = [];
    for (const output of midiAccess.outputs.values()) {
        outputs.push({ id: output.id, name: output.name });
    }
    dispatch(ACTIONS.SET_MIDI_CONFIG, { outputs });
}

/**
 * Internal helper to get active MIDI output and calculated timestamp.
 */
function getMIDIOutputAndTimestamp(
    time: number,
): { output: any; midiTime: number; midiState: MidiState } | null {
    const { playback, midi } = getState();
    if (!midi.enabled || !midi.selectedOutputId || !midiAccess) {
        return null;
    }
    const output = midiAccess.outputs.get(midi.selectedOutputId);
    if (!output) {
        return null;
    }

    const midiTime =
        (time - (playback.audio?.currentTime || 0)) * 1000 + performance.now() + midi.latency;

    return { output, midiTime, midiState: midi };
}

/**
 * Sends a MIDI Note On message.
 * @param channel - 1-16
 * @param note - MIDI note number 0-127
 * @param velocity - 0-127
 * @param time - AudioContext time
 */
function sendMIDINoteOn(channel: number, note: number, velocity: number, time: number): void {
    const res = getMIDIOutputAndTimestamp(time);
    if (!res) {
        return;
    }
    const { output, midiTime } = res;
    const status = 0x90 | (channel - 1);
    output.send([status, note, velocity], midiTime);

    activeNotes.add(`${channel}_${note}`);
}

/**
 * Sends a MIDI Note Off message.
 * @param channel - 1-16
 * @param note - MIDI note number 0-127
 * @param time - AudioContext time
 */
function sendMIDINoteOff(channel: number, note: number, time: number): void {
    const res = getMIDIOutputAndTimestamp(time);
    if (!res) {
        return;
    }
    const { output, midiTime } = res;
    const status = 0x80 | (channel - 1);
    output.send([status, note, 0], midiTime);

    activeNotes.delete(`${channel}_${note}`);
}

/**
 * Sends a MIDI Control Change message.
 * @param channel - 1-16
 * @param controller - CC number 0-127
 * @param value - 0-127
 * @param time - AudioContext time
 */
export function sendMIDICC(channel: number, controller: number, value: number, time: number): void {
    const res = getMIDIOutputAndTimestamp(time);
    if (!res) {
        return;
    }
    const { output, midiTime } = res;

    // Deduplication: Don't resend if value hasn't changed
    const key = `${channel}_${controller}`;
    if (sentCCValues.get(key) === value) {
        return;
    }
    sentCCValues.set(key, value);

    const status = 0xb0 | (channel - 1);
    output.send([status, controller, value], midiTime);
}

/**
 * Sends a MIDI Pitch Bend message.
 * @param channel - 1-16
 * @param value - -8192 to 8191 (Center 0)
 * @param time - AudioContext time
 */
export function sendMIDIPitchBend(channel: number, value: number, time: number): void {
    const res = getMIDIOutputAndTimestamp(time);
    if (!res) {
        return;
    }
    const { output, midiTime } = res;

    // Deduplication
    if (sentBendValues.get(channel) === value) {
        return;
    }
    sentBendValues.set(channel, value);

    const status = 0xe0 | (channel - 1);

    const normalized = Math.max(0, Math.min(16383, value + 8192));
    const lsb = normalized & 0x7f;
    const msb = (normalized >> 7) & 0x7f;

    output.send([status, lsb, msb], midiTime);
}

/**
 * Convenience helper to send a note with a duration.
 * Includes a small safety gap to ensure Note Offs occur before the next Note On.
 * Intelligently handles overlaps by truncating previous notes if they overlap with new ones.
 */
export function sendMIDINote(
    channel: number,
    note: number,
    velocity: number,
    time: number,
    duration: number,
    options: boolean | { isMono?: boolean; bend?: number } = false,
): void {
    const { playback } = getState();
    const isMono = typeof options === 'boolean' ? options : !!(options as any).isMono;
    const bend = typeof options === 'object' ? (options as any).bend : 0;

    const key = `${channel}_${note}`;
    const now = playback.audio?.currentTime || 0;

    // 0. Strict Monophony Enforcement (Voice Stealing at MIDI level)
    if (isMono) {
        for (const activeKey of activeNotes) {
            const [chStr, nStr] = activeKey.split('_');
            const activeCh = parseInt(chStr, 10);
            const activeNote = parseInt(nStr, 10);

            if (activeCh === channel && activeNote !== note) {
                const res = getMIDIOutputAndTimestamp(time);
                if (res) {
                    const { output, midiState } = res;
                    const status = 0x80 | (channel - 1);
                    if (activeNoteOffs.has(activeKey)) {
                        const prev = activeNoteOffs.get(activeKey)!;
                        if (prev.endTime > time) {
                            clearTimeout(prev.id);
                            const cutoffTime = Math.max(now, time - 0.005);
                            const delayToCutoff = Math.max(0, (cutoffTime - now) * 1000);
                            const ak = activeKey;
                            setTimeout(() => {
                                if (activeNotes.has(ak)) {
                                    output.send(
                                        [status, activeNote, 0],
                                        (cutoffTime - (playback.audio?.currentTime || 0)) * 1000 +
                                            performance.now() +
                                            midiState.latency,
                                    );
                                    activeNotes.delete(ak);
                                }
                            }, delayToCutoff);
                            activeNoteOffs.delete(ak);
                        }
                    }
                }
            }
        }
    }

    // Support Pitch Bend
    if (bend !== 0) {
        sendMIDIPitchBend(channel, bend, time);
        // Reset bend after a short duration (e.g. 100ms)
        sendMIDIPitchBend(channel, 0, time + 0.1);
    }

    // 1. Check for overlapping previous note on the same channel/pitch
    if (activeNoteOffs.has(key)) {
        const prev = activeNoteOffs.get(key)!;
        if (prev.endTime > time) {
            // Cancel the original late Off
            clearTimeout(prev.id);

            // Send Off IMMEDIATELY (synchronously) to ensure it arrives before the new On
            // We use the new note's start time minus epsilon as the timestamp
            const cutoffTime = Math.max(now, time - 0.005);

            // We manually send the Off here instead of using setTimeout
            // This ensures the driver receives Off -> On sequence
            const res = getMIDIOutputAndTimestamp(cutoffTime);
            if (res) {
                const { output, midiTime } = res;
                const status = 0x80 | (channel - 1);
                output.send([status, note, 0], midiTime);
                activeNotes.delete(key);
            }
        }
        activeNoteOffs.delete(key);
    }

    // 2. Send the Note On immediately (scheduled)
    sendMIDINoteOn(channel, note, velocity, time);

    // 3. Schedule the Note Off
    // We apply a tiny "safety gap" (Gate < 100%) to ensure that if the next note
    // starts exactly when this one ends, the Off message is sent slightly *before* the new On.
    // This guarantees retriggering on monophonic synths and prevents "tied" notes.
    // Min duration 20ms, Safety gap 15ms.
    const safeDuration = Math.max(0.02, duration - 0.015);

    // Calculate delay relative to now
    const startTime = time;
    const endTime = startTime + safeDuration;

    const delaySeconds = endTime - now;
    const delayMs = Math.max(0, delaySeconds * 1000);

    const timeoutId = setTimeout(() => {
        sendMIDINoteOff(channel, note, playback.audio?.currentTime || 0);
        const current = activeNoteOffs.get(key);
        if (current && current.id === timeoutId) {
            activeNoteOffs.delete(key);
        }
    }, delayMs);

    // We track it for collision detection and panic
    activeNoteOffs.set(key, { id: timeoutId, endTime });
}

/**
 * Specifically handles drum scheduling for MIDI.
 */
export function sendMIDIDrum(
    instrumentName: string,
    time: number,
    velocity: number,
    octaveOffset = 0,
): void {
    const { midi } = getState();
    const note = ((DRUM_MAP as Record<string, number>)[instrumentName] || 36) + octaveOffset * 12;
    const vel = normalizeMidiVelocity(velocity, midi.velocitySensitivity);
    // Drums are usually short triggers, so we'll send a note off shortly after
    sendMIDINote(midi.drumsChannel, note, vel, time, 0.05);
}

/**
 * Sends a MIDI Transport message (Start/Stop).
 * @param type - 'start' (0xFA) or 'stop' (0xFC)
 * @param time - AudioContext time
 */
export function sendMIDITransport(type: string, time: number): void {
    const res = getMIDIOutputAndTimestamp(time);
    if (!res) {
        return;
    }
    const { output, midiTime } = res;
    const msg = type === 'start' ? 0xfa : 0xfc;
    output.send([msg], midiTime);
}

/**
 * All Notes Off for all channels.
 * @param resetAll - If true, sends Reset All Controllers (CC 121) to all channels.
 */
export function panic(resetAll = false): void {
    const { midi } = getState();
    // 1. Clear future Note Offs (they are no longer needed as we'll kill now)
    for (const [, value] of activeNoteOffs) {
        clearTimeout(value.id);
    }
    activeNoteOffs.clear();

    if (!midi.selectedOutputId || !midiAccess) {
        return;
    }
    const output = midiAccess.outputs.get(midi.selectedOutputId);
    if (!output) {
        return;
    }

    // 2. Explicitly kill currently active notes
    for (const key of activeNotes) {
        const [chStr, noteStr] = key.split('_');
        const ch = parseInt(chStr, 10);
        const note = parseInt(noteStr, 10);

        const status = 0x80 | (ch - 1);
        output.send([status, note, 0]); // Immediate
    }
    activeNotes.clear();

    // Clear caches so next update forces send
    sentCCValues.clear();
    sentBendValues.clear();

    // 3. Send All Notes Off / Reset Controllers as backup
    for (let ch = 0; ch < 16; ch++) {
        output.send([0xb0 | ch, 123, 0]); // All Notes Off
        if (resetAll) {
            output.send([0xb0 | ch, 121, 0]); // Reset All Controllers
            output.send([0xb0 | ch, 64, 0]); // Sustain Off
            output.send([0xb0 | ch, 1, 0]); // Mod Wheel Zero
        }
    }
}
