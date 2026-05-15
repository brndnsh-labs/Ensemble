export interface MidiEvent {
    time: number;
    data: number[];
}

/**
 * Binary MIDI writing utilities.
 */
export function writeVarInt(value: number): number[] {
    const buffer: number[] = [];
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

export function writeString(str: string): number[] {
    return str.split('').map((c) => c.charCodeAt(0));
}

export function writeInt32(val: number): number[] {
    return [(val >> 24) & 0xff, (val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff];
}

export function writeInt16(val: number): number[] {
    return [(val >> 8) & 0xff, val & 0xff];
}

/**
 * Maps an internal velocity (0.0 to ~1.5) to a MIDI velocity (0-127).
 * Uses a compression curve to ensure high-intensity accents don't just slam into 127.
 */
export function normalizeMidiVelocity(internalVel: number, sensitivity = 1.0): number {
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
    events: MidiEvent[] = [];

    addEvent(time: number, data: number[]): void {
        this.events.push({ time: Math.round(time), data });
    }

    noteOn(time: number, ch: number, note: number, vel: number): void {
        this.addEvent(time, [0x90 | ch, note, vel]);
    }

    noteOff(time: number, ch: number, note: number): void {
        this.addEvent(time, [0x80 | ch, note, 0]);
    }

    cc(time: number, ch: number, ctrl: number, val: number): void {
        this.addEvent(time, [0xb0 | ch, ctrl, val]);
    }

    programChange(time: number, ch: number, prog: number): void {
        this.addEvent(time, [0xc0 | ch, prog]);
    }

    pitchBend(time: number, ch: number, val: number): void {
        // val is -8192 to 8191
        const normalized = Math.max(0, Math.min(16383, val + 8192));
        this.addEvent(time, [0xe0 | ch, normalized & 0x7f, (normalized >> 7) & 0x7f]);
    }

    /** Sets the pitch bend range using RPN 0. */
    setPitchBendRange(time: number, ch: number, semitones: number): void {
        // RPN 0: Pitch Bend Sensitivity
        this.cc(time, ch, 101, 0); // RPN MSB
        this.cc(time, ch, 100, 0); // RPN LSB
        this.cc(time, ch, 6, semitones); // Data Entry MSB (semitones)
        this.cc(time, ch, 38, 0); // Data Entry LSB (cents)
        // Close RPN
        this.cc(time, ch, 101, 127);
        this.cc(time, ch, 100, 127);
    }

    setName(time: number, name: string): void {
        const bytes = writeString(name);
        this.addEvent(time, [0xff, 0x03, ...writeVarInt(bytes.length), ...bytes]);
    }

    text(time: number, text: string): void {
        const bytes = writeString(text);
        this.addEvent(time, [0xff, 0x01, ...writeVarInt(bytes.length), ...bytes]);
    }

    marker(time: number, text: string): void {
        const bytes = writeString(text);
        this.addEvent(time, [0xff, 0x06, ...writeVarInt(bytes.length), ...bytes]);
    }

    lyric(time: number, text: string): void {
        const bytes = writeString(text);
        this.addEvent(time, [0xff, 0x05, ...writeVarInt(bytes.length), ...bytes]);
    }

    setTempo(time: number, bpm: number): void {
        const mspb = Math.round(60000000 / bpm);
        const bytes = [(mspb >> 16) & 0xff, (mspb >> 8) & 0xff, mspb & 0xff];
        this.addEvent(time, [0xff, 0x51, 0x03, ...bytes]);
    }

    setTimeSig(time: number, num: number, denom: number): void {
        let dp = 2;
        if (denom === 8) {
            dp = 3;
        }
        this.addEvent(time, [0xff, 0x58, 0x04, num, dp, 24, 8]);
    }

    setKeySig(time: number, root: string, isMinor: boolean): void {
        const keyMap: Record<string, number> = {
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

    endOfTrack(time: number): void {
        this.addEvent(time, [0xff, 0x2f, 0x00]);
    }

    compile(): Uint8Array {
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

        const binary: number[] = [];
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
