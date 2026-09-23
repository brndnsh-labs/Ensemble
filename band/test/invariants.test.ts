/**
 * The invariants every style must keep on every chart. One table-driven run over
 * style × fixture × seed; a new style is covered the moment it is registered.
 * These are the rules no amount of musical taste may break — the idiom-specific "does it
 * sound like the genre" claims live in `critique.test.ts`.
 */
import {
    type BandEvent,
    type BandSettings,
    DEFAULT_SETTINGS,
    type PitchedNote,
} from '../core/types.js';
import { MAX_CHARACTER_MS } from '../feel/feel.js';
import { compileTimeline, type Timeline } from '../form/timeline.js';
import { performPass } from '../perform.js';
import { STEP } from '../players/grid.js';
import { STYLE_IDS, STYLES } from '../styles/index.js';
import { chordPcs } from '../theory/chord.js';
import { mod12 } from '../theory/pitch.js';
import { FIXTURES } from './scores.js';

const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const REGISTER = { bass: [23, 57], keys: [52, 84] } as const;

describe.each(STYLE_IDS)('%s invariants', (styleId) => {
    const style = STYLES[styleId];
    for (const [name, score] of Object.entries(FIXTURES)) {
        const timeline = compileTimeline(score);
        for (const looping of [true, false]) {
            it(`${name}${looping ? ' (looping)' : ' (ending)'}`, () => {
                for (const seed of SEEDS) {
                    const settings: BandSettings = { ...DEFAULT_SETTINGS, style: styleId, seed };
                    const first = performPass(timeline, settings, { pass: 0, looping });
                    const again = performPass(timeline, settings, { pass: 0, looping });
                    expect(JSON.stringify(again.events)).toBe(JSON.stringify(first.events));
                    checkPass(
                        timeline,
                        first.events,
                        style.feel.lean,
                        `${styleId}/${name}/${seed}`,
                    );
                    // The second time round continues from the first pass's memory.
                    const second = performPass(timeline, settings, {
                        pass: 1,
                        looping,
                        memory: first.memory,
                    });
                    checkPass(
                        timeline,
                        second.events,
                        style.feel.lean,
                        `${styleId}/${name}/${seed}/pass1`,
                    );
                }
            });
        }
    }
});

function checkPass(
    timeline: Timeline,
    events: BandEvent[],
    lean: Record<'bass' | 'keys', number>,
    where: string,
) {
    expect(events.length, where).toBeGreaterThan(0);
    const lastPitch = new Map<string, PitchedNote>();
    for (const e of events) {
        const bar = timeline.bars[e.bar];
        const tag = `${where} bar ${e.bar} ${e.lane}@${e.tick}`;
        // Inside its own bar and the song.
        expect(e.tick, tag).toBeGreaterThanOrEqual(bar.start);
        expect(e.tick, tag).toBeLessThan(bar.start + bar.meter.barTicks);
        expect(Number.isInteger(e.velocity) && e.velocity >= 1 && e.velocity <= 127, tag).toBe(
            true,
        );
        // Timing tiers: drums are the clock (character only); melodic lanes add their lean.
        const centre = e.lane === 'drums' ? 0 : lean[e.lane];
        expect(Math.abs(e.offsetMs - centre), tag).toBeLessThanOrEqual(MAX_CHARACTER_MS + 1e-9);
        if (e.lane === 'drums') {
            continue;
        }
        const [lo, hi] = REGISTER[e.lane];
        expect(e.midi, tag).toBeGreaterThanOrEqual(lo);
        expect(e.midi, tag).toBeLessThanOrEqual(hi);
        expect(e.dur, tag).toBeGreaterThan(0);
        // No pitched onset under N.C. (the chord at this beat is null).
        const onset = e.tick;
        const span = bar.spans.find((s) => s.start <= onset && onset < s.end + STEP);
        const beatSpan = bar.spans.find(
            (s) =>
                s.start <= Math.floor(onset / 120) * 120 && Math.floor(onset / 120) * 120 < s.end,
        );
        expect(beatSpan?.chord ?? span?.chord ?? 'N.C.', `${tag} under N.C.`).not.toBe('N.C.');
        // No same-pitch overlap within a lane (a re-strike cuts the previous note).
        const key = `${e.lane}:${e.midi}`;
        const prev = lastPitch.get(key);
        if (prev) {
            expect(prev.tick + prev.dur, `${tag} overlaps`).toBeLessThanOrEqual(e.tick + 1);
        }
        lastPitch.set(key, e);
    }

    // Chord arrivals: the bass lands on a chord tone; keys chords carry the guide tones.
    const bass = events.filter((e): e is PitchedNote => e.lane === 'bass');
    const keys = events.filter((e): e is PitchedNote => e.lane === 'keys');
    for (const span of timeline.spans) {
        const chord = span.chord;
        if (!chord) {
            continue;
        }
        const arrival = bass.find((n) => Math.abs(n.tick - span.start) < 1 && !n.muted);
        if (arrival) {
            expect(
                chordPcs(chord),
                `${where} bass arrival ${chord.symbol}@${span.start}`,
            ).toContain(mod12(arrival.midi));
        }
    }
    const clusters = new Map<number, PitchedNote[]>();
    for (const n of keys) {
        clusters.set(n.tick, [...(clusters.get(n.tick) ?? []), n]);
    }
    for (const [tick, notes] of clusters) {
        const bar = timeline.bars[notes[0].bar];
        const index = bar.spans.findIndex((s) => s.start <= tick && tick < s.end);
        const here = bar.spans[index]?.chord;
        // An anticipation may play the next chord early: the next one in the bar, or the
        // next bar's first (wrapping at the end of the song).
        const nextInBar = bar.spans[index + 1]?.chord;
        const next =
            timeline.bars[notes[0].bar + 1]?.spans[0]?.chord ?? timeline.bars[0].spans[0]?.chord;
        const pcs = new Set(notes.map((n) => mod12(n.midi)));
        const carries = (c: typeof here) =>
            !!c && c.guides.every((g) => pcs.has(mod12(c.root + g)));
        expect(
            carries(here) || carries(nextInBar) || carries(next),
            `${where} keys guide tones @${tick} ${here?.symbol}`,
        ).toBe(true);
    }
}
