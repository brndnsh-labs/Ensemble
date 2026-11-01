import { DEFAULT_SETTINGS, PPQ } from '../core/types.js';
import { compileTimeline } from '../form/timeline.js';
import { performPass } from '../perform.js';
import { STYLE_IDS } from '../styles/index.js';
import { FIXTURES, score } from '../test/scores.js';
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

/** The conductor track's meta events: [tick, type, data bytes]. */
function conductorMeta(bytes: Uint8Array): [number, number, number[]][] {
    const out: [number, number, number[]][] = [];
    let i = 22;
    const end = i + ((bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21]);
    let tick = 0;
    const vl = () => {
        let n = 0;
        let b: number;
        do {
            b = bytes[i++];
            n = (n << 7) | (b & 0x7f);
        } while (b & 0x80);
        return n;
    };
    while (i < end) {
        tick += vl();
        expect(bytes[i++]).toBe(0xff);
        const type = bytes[i++];
        const len = vl();
        out.push([tick, type, [...bytes.slice(i, i + len)]]);
        i += len;
    }
    return out;
}

const words = (data: number[]) => String.fromCharCode(...data);

describe('toMidi conductor track', () => {
    const autumn = score(
        [
            { label: 'A', bars: 'Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7 | Gm7 | Gm7' },
            { label: 'A', bars: 'Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7 | Gm7 | Gm7' },
            { label: 'B', bars: 'Am7b5 | D7 | Gm7 | Gm7 | Cm7 | F7 | Bbmaj7 | Ebmaj7' },
            { label: 'C', bars: 'Am7b5 | D7 | Gm7 Gb7 | Fm7 E7 | Ebmaj7 | Am7b5 D7 | Gm7 | Gm7' },
        ],
        { key: 'G', isMinor: true },
    );

    it('Autumn Leaves: section markers, every chord at its tick, the key signature', () => {
        const timeline = compileTimeline(autumn);
        const { events } = performPass(timeline, DEFAULT_SETTINGS, { pass: 0, looping: false });
        const meta = conductorMeta(toMidi(events, timeline, { bpm: 140 }));

        const markers = meta.filter(([, type]) => type === 0x06);
        expect(markers.map(([tick, , data]) => [tick, words(data)])).toEqual(
            ['A', 'A2', 'B', 'C'].map((label, v) => [
                timeline.bars[timeline.visits[v].firstBar].start,
                label,
            ]),
        );

        const chords = meta.filter(([, type]) => type === 0x01).map(([t, , d]) => [t, words(d)]);
        expect(chords).toEqual(timeline.spans.map((span) => [span.start, span.chord?.symbol]));
        expect(chords).toHaveLength(35);
        expect(chords.slice(0, 3)).toEqual([
            [0, 'Cm7'],
            [PPQ * 4, 'F7'],
            [PPQ * 8, 'Bbmaj7'],
        ]);

        // G minor: two flats, minor flag set.
        expect(meta.filter(([, type]) => type === 0x59)).toEqual([[0, 0x59, [254, 1]]]);
    });

    it('a repeated section sounds each chord at the tick it plays', () => {
        const timeline = compileTimeline(
            score([{ label: 'A', bars: 'D | G', repeat: 2 }], { key: 'D' }),
        );
        const meta = conductorMeta(toMidi([], timeline, { bpm: 120 }));
        const chords = meta.filter(([, type]) => type === 0x01).map(([t, , d]) => [t, words(d)]);
        expect(chords).toEqual([
            [0, 'D'],
            [PPQ * 4, 'G'],
            [PPQ * 8, 'D'],
            [PPQ * 12, 'G'],
        ]);
        expect(meta.find(([, type]) => type === 0x59)?.[2]).toEqual([2, 0]);
    });
});
