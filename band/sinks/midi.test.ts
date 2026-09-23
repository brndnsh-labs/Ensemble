import { DEFAULT_SETTINGS } from '../core/types.js';
import { compileTimeline } from '../form/timeline.js';
import { performPass } from '../perform.js';
import { STYLE_IDS } from '../styles/index.js';
import { FIXTURES } from '../test/scores.js';
import { toMidi } from './midi.js';

/** Read back what `toMidi` writes (no running status): per track, [tick, status, data1]. */
function readTracks(bytes: Uint8Array) {
    const text = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4));
    expect(text(0)).toBe('MThd');
    const count = (bytes[10] << 8) | bytes[11];
    const tracks: [number, number, number][][] = [];
    let at = 14;
    for (let t = 0; t < count; t++) {
        expect(text(at)).toBe('MTrk');
        const length =
            (bytes[at + 4] << 24) | (bytes[at + 5] << 16) | (bytes[at + 6] << 8) | bytes[at + 7];
        const end = at + 8 + length;
        let i = at + 8;
        let tick = 0;
        const events: [number, number, number][] = [];
        while (i < end) {
            let delta = 0;
            let b: number;
            do {
                b = bytes[i++];
                delta = (delta << 7) | (b & 0x7f);
            } while (b & 0x80);
            tick += delta;
            const status = bytes[i++];
            if (status === 0xff) {
                const type = bytes[i++];
                let len = 0;
                do {
                    b = bytes[i++];
                    len = (len << 7) | (b & 0x7f);
                } while (b & 0x80);
                i += len;
                events.push([tick, 0xff, type]);
            } else {
                const data1 = bytes[i++];
                if ((status & 0xf0) !== 0xc0) {
                    i++;
                }
                events.push([tick, status, data1]);
            }
        }
        expect(i).toBe(end);
        expect(events.at(-1)).toEqual([tick, 0xff, 0x2f]);
        tracks.push(events);
        at = end;
    }
    return tracks;
}

describe('toMidi', () => {
    it.each(STYLE_IDS)(
        '%s: a well-formed file where every note ends before its pitch strikes again',
        (style) => {
            const timeline = compileTimeline(FIXTURES.rhythmChanges);
            const { events } = performPass(
                timeline,
                { ...DEFAULT_SETTINGS, style, humanize: 100, seed: 'm' },
                { pass: 0, looping: false },
            );
            const tracks = readTracks(toMidi(events, timeline, { bpm: 140 }));
            expect(tracks).toHaveLength(4);
            let notes = 0;
            for (const track of tracks.slice(1)) {
                const sounding = new Set<number>();
                for (const [, status, pitch] of track) {
                    if ((status & 0xf0) === 0x90) {
                        expect(
                            sounding.has(pitch),
                            `pitch ${pitch} struck while still sounding`,
                        ).toBe(false);
                        sounding.add(pitch);
                        notes++;
                    } else if ((status & 0xf0) === 0x80) {
                        sounding.delete(pitch);
                    }
                }
                expect(sounding.size).toBe(0);
            }
            expect(notes).toBe(events.length);
        },
    );
});
