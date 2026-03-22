/**
 * @typedef {Object} MidiEvent
 * @property {number} time - Delta time in MIDI ticks or absolute seconds.
 * @property {number[]} data - Array of MIDI bytes (uint8).
 */

/**
 * Binary MIDI writing utilities.
 */
/**
 * @param {number} value
 */
export function writeVarInt(value) {
    const buffer = [];
    if (value === 0) {
        return [0];
    }
    while (value > 0) {
        let byte = value & 0x7f;
        value >>= 7;
        if (buffer.length > 0) {
            byte |= 0x80;
        }
        buffer.push(byte);
    }
    return buffer.reverse();
}

/**
 * @param {string} str
 */
export function writeString(str) {
    return str.split('').map((/** @type {any} */ c) => c.charCodeAt(0));
}

/**
 * @param {number} val
 */
export function writeInt32(val) {
    return [(val >> 24) & 0xff, (val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff];
}

/**
 * @param {number} val
 */
export function writeInt16(val) {
    return [(val >> 8) & 0xff, val & 0xff];
}

/**
 * Maps an internal velocity (0.0 to ~1.5) to a MIDI velocity (0-127).
 * Uses a compression curve to ensure high-intensity accents don't just slam into 127.
 * @param {number} internalVel
 * @param {number} [sensitivity=1.0]
 * @returns {number} 0-127
 */
export function normalizeMidiVelocity(internalVel, sensitivity = 1.0) {
    if (internalVel <= 0.01) {
        return 1; // Minimum audibility for non-zero internal
    }

    // We treat 1.5 as the "theoretical maximum" for internal accents.
    // We apply a slight curve (0.8) to boost the "meat" of the signal (0.5-1.0 range)
    // so it sits comfortably in the MIDI 60-100 range.
    const curve = 0.8 / sensitivity;

    const normalized = (Math.min(1.5, internalVel) / 1.5) ** curve;

    // DAWs often treat < 20 as "ghost notes" or barely audible.
    // We lift the floor to 20 for better translation.
    return Math.max(20, Math.min(127, Math.floor(normalized * 127)));
}

/**
 * Simple MIDI Track representation for binary export.
 */
export class MidiTrack {
    constructor() {
        /** @type {MidiEvent[]} */
        this.events = [];
    }

    /**
     * @param {number} time
     * @param {number[]} data
     */
    addEvent(time, data) {
        this.events.push({ time: Math.round(time), data });
    }

    /**
     * @param {number} time
     * @param {number} ch
     * @param {number} note
     * @param {number} vel
     */
    noteOn(time, ch, note, vel) {
        if (ch === 9) {
        }
        this.addEvent(time, [0x90 | ch, note, vel]);
    }

    /**
     * @param {number} time
     * @param {number} ch
     * @param {number} note
     */
    noteOff(time, ch, note) {
        this.addEvent(time, [0x80 | ch, note, 0]);
    }

    /**
     * @param {number} time
     * @param {number} ch
     * @param {number} ctrl
     * @param {number} val
     */
    cc(time, ch, ctrl, val) {
        this.addEvent(time, [0xb0 | ch, ctrl, val]);
    }

    /**
     * @param {number} time
     * @param {number} ch
     * @param {number} prog
     */
    programChange(time, ch, prog) {
        this.addEvent(time, [0xc0 | ch, prog]);
    }

    /**
     * @param {number} time
     * @param {number} ch
     * @param {number} val
     */
    pitchBend(time, ch, val) {
        // val is -8192 to 8191
        const normalized = Math.max(0, Math.min(16383, val + 8192));
        this.addEvent(time, [0xe0 | ch, normalized & 0x7f, (normalized >> 7) & 0x7f]);
    }

    /**
     * Sets the pitch bend range using RPN 0.
     * @param {number} time
     * @param {number} ch
     * @param {number} semitones
     */
    setPitchBendRange(time, ch, semitones) {
        // RPN 0: Pitch Bend Sensitivity
        this.cc(time, ch, 101, 0); // RPN MSB
        this.cc(time, ch, 100, 0); // RPN LSB
        this.cc(time, ch, 6, semitones); // Data Entry MSB (semitones)
        this.cc(time, ch, 38, 0); // Data Entry LSB (cents)
        // Close RPN
        this.cc(time, ch, 101, 127);
        this.cc(time, ch, 100, 127);
    }

    /**
     * @param {number} time
     * @param {string} name
     */
    setName(time, name) {
        const bytes = writeString(name);
        this.addEvent(time, [0xff, 0x03, ...writeVarInt(bytes.length), ...bytes]);
    }

    /**
     * @param {number} time
     * @param {string} text
     */
    text(time, text) {
        const bytes = writeString(text);
        this.addEvent(time, [0xff, 0x01, ...writeVarInt(bytes.length), ...bytes]);
    }

    /**
     * @param {number} time
     * @param {string} text
     */
    marker(time, text) {
        const bytes = writeString(text);
        this.addEvent(time, [0xff, 0x06, ...writeVarInt(bytes.length), ...bytes]);
    }

    /**
     * @param {number} time
     * @param {string} text
     */
    lyric(time, text) {
        const bytes = writeString(text);
        this.addEvent(time, [0xff, 0x05, ...writeVarInt(bytes.length), ...bytes]);
    }

    /**
     * @param {number} time
     * @param {number} bpm
     */
    setTempo(time, bpm) {
        const mspb = Math.round(60000000 / bpm);
        const bytes = [(mspb >> 16) & 0xff, (mspb >> 8) & 0xff, mspb & 0xff];
        this.addEvent(time, [0xff, 0x51, 0x03, ...bytes]);
    }

    /**
     * @param {number} time
     * @param {number} num
     * @param {number} denom
     */
    setTimeSig(time, num, denom) {
        let dp = 2;
        if (denom === 8) {
            dp = 3;
        }
        this.addEvent(time, [0xff, 0x58, 0x04, num, dp, 24, 8]);
    }

    /**
     * @param {number} time
     * @param {string} root
     * @param {boolean} isMinor
     */
    setKeySig(time, root, isMinor) {
        const keyMap = {
            C: 0,
            G: 1,
            D: 2,
            A: 3,
            E: 4,
            B: 5,
            Gb: -6,
            Db: -5,
            Ab: -4,
            Eb: -3,
            Bb: -2,
            F: -1,
        };
        const rootLookup = root === 'F#' ? 'Gb' : root === 'C#' ? 'Db' : root;
        let sf = /** @type {any} */ (keyMap)[rootLookup] || 0;
        if (isMinor) {
            const KEY_ORDER = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
            const relMajor = KEY_ORDER[(KEY_ORDER.indexOf(rootLookup) + 3) % 12];
            sf = /** @type {any} */ (keyMap)[relMajor] || 0;
        }
        this.addEvent(time, [0xff, 0x59, 0x02, sf < 0 ? 256 + sf : sf, isMinor ? 0x01 : 0x00]);
    }

    /**
     * @param {number} time
     */
    endOfTrack(time) {
        this.addEvent(time, [0xff, 0x2f, 0x00]);
    }

    compile() {
        this.events.sort((a, b) => {
            if (a.time !== b.time) {
                return a.time - b.time;
            }
            const typeA = a.data[0] & 0xf0;
            const typeB = b.data[0] & 0xf0;
            if (typeA === 0x80 && typeB === 0x90) {
                return -1;
            }
            if (typeA === 0x90 && typeB === 0x80) {
                return 1;
            }
            return 0;
        });

        const binary = [];
        let lastTime = 0;
        for (const event of this.events) {
            const delta = Math.max(0, event.time - lastTime);
            binary.push(...writeVarInt(delta));
            binary.push(...event.data);
            lastTime = event.time;
        }

        const len = writeInt32(binary.length);
        return new Uint8Array([...writeString('MTrk'), ...len, ...binary]);
    }
}
