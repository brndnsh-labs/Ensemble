import { ACTIONS } from './types.js';
import { getState, dispatch } from './state.js';

let midiAccess = null;

// Track pending Note Offs to handle overlaps/legato properly.
// Key: `${channel}_${note}`, Value: timeoutId
const activeNoteOffs = new Map();

// Track currently active ("On") notes to send explicit Offs during panic.
// Key: `${channel}_${note}`
const activeNotes = new Set();

// Cache for redundant message filtering to prevent flooding the MIDI stream.
// Key: `${channel}_${controller}` -> value
const sentCCValues = new Map();
// Key: `${channel}` -> value
const sentBendValues = new Map();

/**
 * Handles incoming MIDI messages from controllers.
 */
function handleMIDIMessage(event) {
    const { midi } = getState();
    if (!midi.enabled) return;
    
    const [status, data1, data2] = event.data;
    const type = status & 0xF0;

    // CC Messages (0xB0)
    if (type === 0xB0) {
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
export async function initMIDI() {
    if (!navigator.requestMIDIAccess) {
        console.warn("Web MIDI API not supported in this browser.");
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
        console.error("Failed to get MIDI access", err);
        return false;
    }
}

/**
 * Updates the state with current list of MIDI outputs.
 */
export function syncMIDIOutputs() {
    if (!midiAccess) return;
    const outputs = [];
    for (const output of midiAccess.outputs.values()) {
        outputs.push({ id: output.id, name: output.name });
    }
    dispatch(ACTIONS.SET_MIDI_CONFIG, { outputs });
}

/**
 * Sends a MIDI Note On message.
 * @param {number} channel - 1-16
 * @param {number} note - MIDI note number 0-127
 * @param {number} velocity - 0-127
 * @param {number} time - AudioContext time
 */
export function sendMIDINoteOn(channel, note, velocity, time) {
    const { playback, midi } = getState();
    if (!midi.enabled || !midi.selectedOutputId || !midiAccess) return;
    const output = midiAccess.outputs.get(midi.selectedOutputId);
    if (!output) return;

    const midiTime = (time - playback.audio.currentTime) * 1000 + performance.now() + midi.latency;
    const status = 0x90 | (channel - 1);
    output.send([status, note, velocity], midiTime);
    
    activeNotes.add(`${channel}_${note}`);
}

/**
 * Sends a MIDI Note Off message.
 * @param {number} channel - 1-16
 * @param {number} note - MIDI note number 0-127
 * @param {number} time - AudioContext time
 */
export function sendMIDINoteOff(channel, note, time) {
    const { playback, midi } = getState();
    if (!midi.enabled || !midi.selectedOutputId || !midiAccess) return;
    const output = midiAccess.outputs.get(midi.selectedOutputId);
    if (!output) return;

    const midiTime = (time - playback.audio.currentTime) * 1000 + performance.now() + midi.latency;
    const status = 0x80 | (channel - 1);
    output.send([status, note, 0], midiTime);

    activeNotes.delete(`${channel}_${note}`);
}

/**
 * Sends a MIDI Control Change message.
 * @param {number} channel - 1-16
 * @param {number} controller - CC number 0-127
 * @param {number} value - 0-127
 * @param {number} time - AudioContext time
 */
export function sendMIDICC(channel, controller, value, time) {
    const { playback, midi } = getState();
    if (!midi.enabled || !midi.selectedOutputId || !midiAccess) return;
    const output = midiAccess.outputs.get(midi.selectedOutputId);
    if (!output) return;

    // Deduplication: Don't resend if value hasn't changed
    const key = `${channel}_${controller}`;
    if (sentCCValues.get(key) === value) return;
    sentCCValues.set(key, value);

    const midiTime = (time - playback.audio.currentTime) * 1000 + performance.now() + midi.latency;
    const status = 0xB0 | (channel - 1);
    output.send([status, controller, value], midiTime);
}

/**
 * Maps an internal velocity (0.0 to ~1.5) to a MIDI velocity (0-127).
 * Uses a compression curve to ensure high-intensity accents don't just slam into 127.
 * @param {number} internalVel 
 * @returns {number} 0-127
 */
export function normalizeMidiVelocity(internalVel) {
    const { midi } = getState();
    if (internalVel <= 0.01) return 1; // Minimum audibility for non-zero internal

    // We treat 1.5 as the "theoretical maximum" for internal accents.
    // We apply a slight curve (0.8) to boost the "meat" of the signal (0.5-1.0 range)
    // so it sits comfortably in the MIDI 60-100 range.
    const sensitivity = midi.velocitySensitivity || 1.0;
    const curve = 0.8 / sensitivity; 
    
    const normalized = Math.pow(Math.min(1.5, internalVel) / 1.5, curve);
    
    // DAWs often treat < 20 as "ghost notes" or barely audible.
    // We lift the floor to 20 for better translation.
    return Math.max(20, Math.min(127, Math.floor(normalized * 127)));
}

/**
 * Sends a MIDI Pitch Bend message.
 * @param {number} channel - 1-16
 * @param {number} value - -8192 to 8191 (Center 0)
 * @param {number} time - AudioContext time
 */
export function sendMIDIPitchBend(channel, value, time) {
    const { playback, midi } = getState();
    if (!midi.enabled || !midi.selectedOutputId || !midiAccess) return;
    const output = midiAccess.outputs.get(midi.selectedOutputId);
    if (!output) return;

    // Deduplication
    if (sentBendValues.get(channel) === value) return;
    sentBendValues.set(channel, value);

    const midiTime = (time - playback.audio.currentTime) * 1000 + performance.now() + midi.latency;
    const status = 0xE0 | (channel - 1);
    
    const normalized = Math.max(0, Math.min(16383, value + 8192));
    const lsb = normalized & 0x7F;
    const msb = (normalized >> 7) & 0x7F;
    
    output.send([status, lsb, msb], midiTime);
}

/**
 * Convenience helper to send a note with a duration.
 * Includes a small safety gap to ensure Note Offs occur before the next Note On.
 * intelligently handles overlaps by truncating previous notes if they overlap with new ones.
 * @param {number} channel 
 * @param {number} note 
 * @param {number} velocity 
 * @param {number} time 
 * @param {number} duration 
 * @param {boolean|Object} [options=false] - If true, enforces monophony. Or pass object { isMono, bend }
 */
export function sendMIDINote(channel, note, velocity, time, duration, options = false) {
    const { playback, midi } = getState();
    const isMono = typeof options === 'boolean' ? options : !!options.isMono;
    const bend = typeof options === 'object' ? options.bend : 0;

    const key = `${channel}_${note}`;
    const now = playback.audio.currentTime;

    // 0. Strict Monophony Enforcement (Voice Stealing at MIDI level)
    if (isMono) {
        for (const activeKey of activeNotes) {
            const [chStr, nStr] = activeKey.split('_');
            const activeCh = parseInt(chStr);
            const activeNote = parseInt(nStr);

            if (activeCh === channel && activeNote !== note) {
                const output = midiAccess?.outputs.get(midi.selectedOutputId);
                if (output) {
                    const status = 0x80 | (channel - 1);
                    if (activeNoteOffs.has(activeKey)) {
                        const prev = activeNoteOffs.get(activeKey);
                        if (prev.endTime > time) {
                            clearTimeout(prev.id);
                            const cutoffTime = Math.max(now, time - 0.005);
                            const delayToCutoff = Math.max(0, (cutoffTime - now) * 1000);
                            const out = output;
                            const ak = activeKey;
                            setTimeout(() => {
                                if (activeNotes.has(ak)) {
                                    out.send([status, activeNote, 0], (cutoffTime - playback.audio.currentTime) * 1000 + performance.now() + midi.latency);
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
        const prev = activeNoteOffs.get(key);
        if (prev.endTime > time) {
            // Cancel the original late Off
            clearTimeout(prev.id);
            
            // Send Off IMMEDIATELY (synchronously) to ensure it arrives before the new On
            // We use the new note's start time minus epsilon as the timestamp
            const cutoffTime = Math.max(now, time - 0.005);
            
            // We manually send the Off here instead of using setTimeout
            // This ensures the driver receives Off -> On sequence
            if (midiAccess && midi.selectedOutputId) {
                const output = midiAccess.outputs.get(midi.selectedOutputId);
                if (output) {
                    // Calculate MIDI timestamp for cutoff
                    // time param is AudioContext time.
                    // midiTime = (cutoffTime - playback.audio.currentTime) * 1000 + performance.now()
                    const midiTime = (cutoffTime - playback.audio.currentTime) * 1000 + performance.now() + midi.latency;
                    const status = 0x80 | (channel - 1);
                    output.send([status, note, 0], midiTime);
                    activeNotes.delete(key);
                }
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
        sendMIDINoteOff(channel, note, playback.audio.currentTime); 
        // Only delete if it's THIS timeout (in case we overwrote it, but we cleared before, so it's fine)
        const current = activeNoteOffs.get(key);
        if (current && current.id === timeoutId) {
            activeNoteOffs.delete(key);
        }
    }, delayMs);

    // We track it for collision detection and panic
    activeNoteOffs.set(key, { id: timeoutId, endTime });
}

/**
 * Maps drum instrument names to standard MIDI drum notes (General MIDI).
 */
const DRUM_MAP = {
    'Kick': 36,
    'Snare': 38,
    'HiHat': 42,
    'Open': 46,
    'Crash': 49,
    'Ride': 51,
    'Rim': 37,
    'Clap': 39,
    'Cowbell': 56,
    'Shaker': 70,
    'Clave': 75,
    'Conga': 63,
    'Bongo': 60,
    'Perc': 67,
    'Guiro': 74,
    'High Tom': 50,
    'Mid Tom': 47,
    'Low Tom': 43
};

/**
 * Specifically handles drum scheduling for MIDI.
 */
export function sendMIDIDrum(instrumentName, time, velocity, octaveOffset = 0) {
    const { midi } = getState();
    const note = (DRUM_MAP[instrumentName] || 36) + (octaveOffset * 12);
    const vel = normalizeMidiVelocity(velocity);
    // Drums are usually short triggers, so we'll send a note off shortly after
    sendMIDINote(midi.drumsChannel, note, vel, time, 0.05);
}

/**
 * Sends a MIDI Transport message (Start/Stop).
 * @param {string} type - 'start' (0xFA) or 'stop' (0xFC)
 * @param {number} time - AudioContext time
 */
export function sendMIDITransport(type, time) {
    const { playback, midi } = getState();
    if (!midi.enabled || !midi.selectedOutputId || !midiAccess) return;
    const output = midiAccess.outputs.get(midi.selectedOutputId);
    if (!output) return;

    const midiTime = (time - playback.audio.currentTime) * 1000 + performance.now() + midi.latency;
    const msg = type === 'start' ? 0xFA : 0xFC;
    output.send([msg], midiTime);
}

/**
 * All Notes Off for all channels.
 * @param {boolean} resetAll - If true, sends Reset All Controllers (CC 121) to all channels.
 */
export function panic(resetAll = false) {
    const { midi } = getState();
    // 1. Clear future Note Offs (they are no longer needed as we'll kill now)
    for (const [, value] of activeNoteOffs) {
        clearTimeout(value.id);
    }
    activeNoteOffs.clear();

    if (!midi.selectedOutputId || !midiAccess) return;
    const output = midiAccess.outputs.get(midi.selectedOutputId);
    if (!output) return;

    // 2. Explicitly kill currently active notes
    for (const key of activeNotes) {
        const [chStr, noteStr] = key.split('_');
        const ch = parseInt(chStr);
        const note = parseInt(noteStr);
        
        const status = 0x80 | (ch - 1);
        output.send([status, note, 0]); // Immediate
    }
    activeNotes.clear();
    
    // Clear caches so next update forces send
    sentCCValues.clear();
    sentBendValues.clear();

    // 3. Send All Notes Off / Reset Controllers as backup
    for (let ch = 0; ch < 16; ch++) {
        output.send([0xB0 | ch, 123, 0]); // All Notes Off
        if (resetAll) {
            output.send([0xB0 | ch, 121, 0]); // Reset All Controllers
            output.send([0xB0 | ch, 64, 0]);  // Sustain Off
            output.send([0xB0 | ch, 1, 0]);   // Mod Wheel Zero
        }
    }
}
