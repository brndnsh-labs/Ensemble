/**
 * The invariants every style must keep on every chart. One table-driven run over
 * style × fixture × seed; a new style is covered the moment it is registered.
 * These are the rules no amount of musical taste may break — the idiom-specific "does it
 * sound like the genre" claims live in `critique.test.ts`.
 */
import {
    type BandEvent,
    type BandSettings,
    type CompInstrument,
    DEFAULT_SETTINGS,
    type PitchedNote,
} from '../core/types.js';
import { MAX_CHARACTER_MS } from '../feel/feel.js';
import { compileTimeline, type Timeline } from '../form/timeline.js';
import { performPass } from '../perform.js';
import { isPlayable } from '../players/comp/fretboard.js';
import { COMP_INSTRUMENTS } from '../players/comp/instruments.js';
import { STEP } from '../players/grid.js';
import { STYLE_IDS, STYLES } from '../styles/index.js';
import { chordPcs } from '../theory/chord.js';
import { mod12 } from '../theory/pitch.js';
import { FIXTURES } from './scores.js';

const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const BASS_REGISTER = [23, 57] as const;
/**
 * The comp instruments that play differently (a keyboard, a sustaining organ, a picked and
 * a finger-plucked guitar). Rhodes and clav play the keyboard book exactly as the piano does.
 */
const INSTRUMENTS: CompInstrument[] = ['piano', 'organ', 'guitar', 'nylon'];
/** With a bassist in the band, a guitar grip stays off the low strings. */
const GUITAR_FLOOR_WITH_BASS = 48;

describe.each(STYLE_IDS)('%s invariants', (styleId) => {
    const style = STYLES[styleId];
    for (const [name, score] of Object.entries(FIXTURES)) {
        const timeline = compileTimeline(score);
        for (const comp of INSTRUMENTS) {
            for (const looping of [true, false]) {
                it(`${name} on ${comp}${looping ? ' (looping)' : ' (ending)'}`, () => {
                    const problems: string[] = [];
                    for (const seed of SEEDS) {
                        const settings: BandSettings = {
                            ...DEFAULT_SETTINGS,
                            style: styleId,
                            comp,
                            seed,
                        };
                        const first = performPass(timeline, settings, { pass: 0, looping });
                        const again = performPass(timeline, settings, { pass: 0, looping });
                        if (JSON.stringify(again.events) !== JSON.stringify(first.events)) {
                            problems.push(`${seed}: not deterministic`);
                        }
                        checkPass(timeline, first.events, style.feel.lean, comp, seed, problems);
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
                            comp,
                            `${seed}/pass1`,
                            problems,
                        );
                    }
                    expect(problems.slice(0, 10), `${styleId}/${name}/${comp}`).toEqual([]);
                });
            }
        }
    }
});

/**
 * Checks one pass, pushing a readable line per broken rule onto `problems` (collected
 * rather than asserted one by one: the suite checks millions of facts, and building an
 * assertion message for each passing one is most of the cost).
 */
function checkPass(
    timeline: Timeline,
    events: BandEvent[],
    lean: Record<'bass' | 'comp', number>,
    comp: CompInstrument,
    where: string,
    problems: string[],
) {
    const fail = (e: BandEvent, rule: string) =>
        problems.push(`${where} bar ${e.bar} ${e.lane}@${e.tick}: ${rule}`);
    if (!events.length) {
        problems.push(`${where}: silent`);
    }
    const instrument = COMP_INSTRUMENTS[comp];
    const strummed = strumRanks(events);
    const lastPitch = new Map<string, PitchedNote>();
    for (const e of events) {
        const bar = timeline.bars[e.bar];
        // Inside its own bar and the song.
        if (e.tick < bar.start || e.tick >= bar.start + bar.meter.barTicks) {
            fail(e, 'outside its bar');
        }
        if (!Number.isInteger(e.velocity) || e.velocity < 1 || e.velocity > 127) {
            fail(e, `velocity ${e.velocity}`);
        }
        // Timing tiers: drums are the clock (character only); melodic lanes add their lean,
        // and a strummed chord rolls later by its place in the strum.
        const centre =
            e.lane === 'drums' ? 0 : lean[e.lane] + (strummed.get(e) ?? 0) * instrument.strumMs;
        if (Math.abs(e.offsetMs - centre) > MAX_CHARACTER_MS + 1e-9) {
            fail(e, `offset ${e.offsetMs.toFixed(1)}ms from ${centre}`);
        }
        if (e.lane === 'drums') {
            continue;
        }
        const [lo, hi] = e.lane === 'bass' ? BASS_REGISTER : instrument.range;
        if (e.midi < lo || e.midi > hi) {
            fail(e, `midi ${e.midi} outside ${lo}–${hi}`);
        }
        if (
            e.lane === 'comp' &&
            instrument.family === 'guitar' &&
            e.midi < GUITAR_FLOOR_WITH_BASS
        ) {
            fail(e, `guitar ${e.midi} in the bass's register`);
        }
        if (!(e.dur > 0)) {
            fail(e, `dur ${e.dur}`);
        }
        // No pitched onset under N.C. (the chord at this beat is null).
        const onset = e.tick;
        const beat = Math.floor(onset / 120) * 120;
        const span = bar.spans.find((s) => s.start <= onset && onset < s.end + STEP);
        const beatSpan = bar.spans.find((s) => s.start <= beat && beat < s.end);
        if (!(beatSpan?.chord ?? span?.chord)) {
            fail(e, 'under N.C.');
        }
        // No same-pitch overlap within a lane (a re-strike cuts the previous note).
        const key = `${e.lane}:${e.midi}`;
        const prev = lastPitch.get(key);
        if (prev && prev.tick + prev.dur > e.tick + 1) {
            fail(e, `overlaps the ${e.midi} at ${prev.tick}`);
        }
        lastPitch.set(key, e);
    }

    // Chord arrivals: the bass lands on a chord tone; comp chords carry the guide tones.
    const bass = events.filter((e): e is PitchedNote => e.lane === 'bass');
    const chords = events.filter((e): e is PitchedNote => e.lane === 'comp' && !e.muted);
    for (const span of timeline.spans) {
        const chord = span.chord;
        if (!chord) {
            continue;
        }
        const arrival = bass.find((n) => Math.abs(n.tick - span.start) < 1 && !n.muted);
        if (arrival && !chordPcs(chord).includes(mod12(arrival.midi))) {
            fail(arrival, `bass arrival not a tone of ${chord.symbol}`);
        }
    }
    const clusters = new Map<number, PitchedNote[]>();
    for (const n of chords) {
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
        // A single note is a bossa thumb (the bass role), not a chord.
        if (notes.length > 1 && !(carries(here) || carries(nextInBar) || carries(next))) {
            fail(notes[0], `comp chord lacks the guide tones of ${here?.symbol}`);
        }
        // Every guitar chord is one a hand can fret.
        const grip = notes.filter((n) => n.midi >= GUITAR_FLOOR_WITH_BASS).map((n) => n.midi);
        if (instrument.family === 'guitar' && grip.length > 1 && !isPlayable(grip)) {
            fail(notes[0], `unplayable grip ${grip.join(',')}`);
        }
    }
}

/** Each stroked comp note's place in its strum, as the feel layer orders it. */
function strumRanks(events: BandEvent[]): Map<BandEvent, number> {
    const chords = new Map<number, PitchedNote[]>();
    for (const e of events) {
        if (e.lane === 'comp' && e.stroke) {
            chords.set(e.tick, [...(chords.get(e.tick) ?? []), e]);
        }
    }
    const ranks = new Map<BandEvent, number>();
    for (const notes of chords.values()) {
        const sorted = [...notes].sort((a, b) => a.midi - b.midi);
        if (notes[0].stroke === 'up') {
            sorted.reverse();
        }
        sorted.forEach((n, i) => ranks.set(n, i));
    }
    return ranks;
}
