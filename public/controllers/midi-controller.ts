import { DRUM_MAP } from '../engine/midi-constants.js';
import { normalizeMidiVelocity } from '../engine/midi-utils.js';
import { dispatch, getState } from '../state.js';
import type { ActionPayloadSetMidiConfig, MidiState } from '../types.js';
import { ACTIONS } from '../types.js';
import { getFrequency } from '../utils.js';
import { stopSoloist, triggerDrumSound, triggerSoloNote } from './performance-controller.js';

let midiAccess: MIDIAccess | null = null;

// Reverse of DRUM_MAP for incoming Note On → drum-name lookup (play-along).
// Several instrument names share one GM note (e.g. HiHat/HiHatQuarter both
// 42); the first name declared in DRUM_MAP wins, so the mapping stays stable
// and deterministic rather than depending on object-iteration happenstance.
const REVERSE_DRUM_MAP: Record<number, string> = {};
for (const [name, note] of Object.entries(DRUM_MAP)) {
    if (!(note in REVERSE_DRUM_MAP)) {
        REVERSE_DRUM_MAP[note] = name;
    }
}

// Notes currently held on the play-along input, so releasing one key of a
// chord/legato run doesn't cut the soloist voice — only the last release does.
const heldSoloNotes = new Set<number>();

// A generous upfront ceiling for a MIDI-triggered solo note: the player, not a
// fixed clock, decides when it ends. Note Off truncates early via
// stopSoloist() (killSoloistNote's fast release), so this is a max sustain,
// not an expected note length.
const PLAY_ALONG_SUSTAIN_SECONDS = 4.0;

/**
 * Dispatches SET_MIDI_CONFIG for the play-along input fields
 * (`inputs`/`selectedInputId`/`inputEnabled`). A thin named wrapper so the
 * input-config call sites read as clear intent.
 */
export function dispatchMidiInputConfig(payload: ActionPayloadSetMidiConfig): void {
    dispatch(ACTIONS.SET_MIDI_CONFIG, payload);
}

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
function handleMIDIMessage(event: MIDIMessageEvent, inputId?: string): void {
    const { midi } = getState();
    // `MIDIMessageEvent.data` is `Uint8Array | null` — a null-data message
    // would throw at the destructure below, so it no-ops here instead.
    if (!midi.enabled || !event.data) {
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
        return;
    }

    // Note On (0x90 w/ velocity>0) / Note Off (0x80, or 0x90 w/ velocity 0) — play-along.
    if (type === 0x90 || type === 0x80) {
        const midiExt = midi as MidiState;
        if (!midiExt.inputEnabled) {
            return;
        }
        // Once a specific input is selected, only it drives play-along; with no
        // selection, any connected keyboard works (the common single-device case).
        if (midiExt.selectedInputId && inputId && midiExt.selectedInputId !== inputId) {
            return;
        }

        const isNoteOn = type === 0x90 && data2 > 0;
        const note = data1;
        const velocity = data2;
        const channel = (status & 0x0f) + 1;

        if (channel === midiExt.drumsChannel) {
            handleDrumNoteMessage(isNoteOn, note, velocity, midiExt);
        } else {
            handleSoloNoteMessage(isNoteOn, note, velocity, midiExt);
        }
    }
}

/**
 * Routes an incoming Note On/Off on the play-along drums channel to the
 * one-shot drum trigger. Drums have no sustain, so Note Off is a no-op —
 * mirrors `sendMIDIDrum`'s one-shot behavior on the output side.
 */
function handleDrumNoteMessage(
    isNoteOn: boolean,
    note: number,
    velocity: number,
    midi: MidiState,
): void {
    if (!isNoteOn) {
        return;
    }
    const name = REVERSE_DRUM_MAP[note];
    if (!name) {
        return;
    }
    const { playback } = getState();
    const time = playback.audio?.currentTime || 0;
    const vol = Math.min(1, (velocity / 127) * (midi.velocitySensitivity || 1));
    triggerDrumSound(name, time, vol);
}

/**
 * Routes an incoming Note On/Off on any non-drum channel to the chord-aware
 * soloist play-along voice. Note On triggers with a generous sustain ceiling;
 * Note Off truncates it early via `stopSoloist()` once the LAST held note
 * (not necessarily the one released) is off, so holding a chord/legato run
 * doesn't choke the voice mid-phrase when one key lifts before another.
 */
function handleSoloNoteMessage(
    isNoteOn: boolean,
    note: number,
    velocity: number,
    midi: MidiState,
): void {
    const { playback } = getState();
    const time = playback.audio?.currentTime || 0;

    if (isNoteOn) {
        heldSoloNotes.add(note);
        const vol = Math.min(1, (velocity / 127) * (midi.velocitySensitivity || 1));
        triggerSoloNote(getFrequency(note), time, PLAY_ALONG_SUSTAIN_SECONDS, vol);
    } else {
        heldSoloNotes.delete(note);
        if (heldSoloNotes.size === 0) {
            stopSoloist();
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
            syncMIDIInputs();
            attachInputListeners();
        };

        attachInputListeners();
        syncMIDIOutputs();
        // Only the initial sync validates a (possibly stale, freshly-hydrated)
        // selectedInputId against the live device list — a later hot-plug
        // resync (onstatechange, e.g. a momentary disconnect/reconnect of
        // the selected keyboard) must NOT clear it, or a transient dropout
        // would permanently fall back to "any input" mid-session (#1038).
        syncMIDIInputs(true);
        return true;
    } catch (err) {
        console.error('Failed to get MIDI access', err);
        return false;
    }
}

/**
 * (Re)attaches the message handler to every currently known MIDI input.
 * Re-run on `onstatechange` too, so a hot-plugged keyboard starts routing
 * without requiring the user to re-toggle MIDI in Settings.
 */
function attachInputListeners(): void {
    if (!midiAccess?.inputs) {
        return;
    }
    for (const input of midiAccess.inputs.values()) {
        input.onmidimessage = (event: MIDIMessageEvent) => handleMIDIMessage(event, input.id);
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
        // `MIDIPort.name` is spec'd `string | null`; the picker needs a label.
        outputs.push({ id: output.id, name: output.name ?? 'Unknown Device' });
    }
    dispatch(ACTIONS.SET_MIDI_CONFIG, { outputs });
}

/**
 * Updates the state with the current list of MIDI inputs (for the play-along
 * device picker in Settings).
 *
 * @param validateSelection Only true for the initial sync in `initMIDI()`
 * (covers both a fresh page load and re-enabling MIDI). A persisted (or
 * otherwise stale) `selectedInputId` that isn't among the live devices would
 * otherwise silently filter out every play-along note (#1038) — drop it so
 * play-along falls back to "any input" instead of looking dead. NOT applied
 * on later `onstatechange` hot-plug resyncs, or a momentary disconnect of the
 * selected keyboard would permanently reset the selection mid-session.
 */
function syncMIDIInputs(validateSelection = false): void {
    if (!midiAccess) {
        return;
    }
    const inputs: { id: string; name: string }[] = [];
    for (const input of midiAccess.inputs.values()) {
        // `MIDIPort.name` is spec'd `string | null`; the picker needs a label.
        inputs.push({ id: input.id, name: input.name ?? 'Unknown Device' });
    }
    const payload: ActionPayloadSetMidiConfig = { inputs };
    if (validateSelection) {
        const { midi } = getState();
        const midiExt = midi as MidiState;
        if (midiExt.selectedInputId && !inputs.some((i) => i.id === midiExt.selectedInputId)) {
            payload.selectedInputId = null;
        }
    }
    dispatchMidiInputConfig(payload);
}

/**
 * Internal helper to get active MIDI output and calculated timestamp.
 */
function getMIDIOutputAndTimestamp(
    time: number,
): { output: MIDIOutput; midiTime: number; midiState: MidiState } | null {
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

    return { output, midiTime, midiState: midi as MidiState };
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
    const isMono = typeof options === 'boolean' ? options : !!options.isMono;
    const bend = typeof options === 'object' ? (options.bend ?? 0) : 0;

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
    const gmNote = (DRUM_MAP as Record<string, number>)[instrumentName];
    // #1321: an unmapped name used to fall back to Kick (36) — playing the
    // wrong instrument is worse than not sounding one, and DRUM_MAP is now
    // complete against every name the drum engine actually emits, so this is
    // a genuine "can't happen today" guard, not an active fallback.
    if (gmNote === undefined) {
        return;
    }
    const note = gmNote + octaveOffset * 12;
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
