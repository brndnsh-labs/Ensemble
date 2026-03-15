/**
 * Binary MIDI writing utilities.
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

export function writeString(str) {
    return str.split('').map((c) => c.charCodeAt(0));
}

export function writeInt32(val) {
    return [(val >> 24) & 0xff, (val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff];
}

export function writeInt16(val) {
    return [(val >> 8) & 0xff, val & 0xff];
}

/**
 * Simple MIDI Track representation for binary export.
 */
export class MidiTrack {
    constructor() {
        this.events = [];
    }

    addEvent(time, data) {
        this.events.push({ time: Math.round(time), data });
    }

    noteOn(time, ch, note, vel) {
        if (ch === 9) {
        }
        this.addEvent(time, [0x90 | ch, note, vel]);
    }

    noteOff(time, ch, note) {
        this.addEvent(time, [0x80 | ch, note, 0]);
    }

    cc(time, ch, ctrl, val) {
        this.addEvent(time, [0xb0 | ch, ctrl, val]);
    }

    programChange(time, ch, prog) {
        this.addEvent(time, [0xc0 | ch, prog]);
    }

    pitchBend(time, ch, val) {
        // val is -8192 to 8191
        const normalized = Math.max(0, Math.min(16383, val + 8192));
        this.addEvent(time, [0xe0 | ch, normalized & 0x7f, (normalized >> 7) & 0x7f]);
    }

    setName(time, name) {
        const bytes = writeString(name);
        this.addEvent(time, [0xff, 0x03, ...writeVarInt(bytes.length), ...bytes]);
    }

    text(time, text) {
        const bytes = writeString(text);
        this.addEvent(time, [0xff, 0x01, ...writeVarInt(bytes.length), ...bytes]);
    }

    marker(time, text) {
        const bytes = writeString(text);
        this.addEvent(time, [0xff, 0x06, ...writeVarInt(bytes.length), ...bytes]);
    }

    lyric(time, text) {
        const bytes = writeString(text);
        this.addEvent(time, [0xff, 0x05, ...writeVarInt(bytes.length), ...bytes]);
    }

    setTempo(time, bpm) {
        const mspb = Math.round(60000000 / bpm);
        const bytes = [(mspb >> 16) & 0xff, (mspb >> 8) & 0xff, mspb & 0xff];
        this.addEvent(time, [0xff, 0x51, 0x03, ...bytes]);
    }

    setTimeSig(time, num, denom) {
        let dp = 2;
        if (denom === 8) {
            dp = 3;
        }
        this.addEvent(time, [0xff, 0x58, 0x04, num, dp, 24, 8]);
    }

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
        let sf = keyMap[rootLookup] || 0;
        if (isMinor) {
            const KEY_ORDER = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
            const relMajor = KEY_ORDER[(KEY_ORDER.indexOf(rootLookup) + 3) % 12];
            sf = keyMap[relMajor] || 0;
        }
        this.addEvent(time, [0xff, 0x59, 0x02, sf < 0 ? 256 + sf : sf, isMinor ? 0x01 : 0x00]);
    }

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
