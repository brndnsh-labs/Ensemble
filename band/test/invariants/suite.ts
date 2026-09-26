/**
 * The invariants every style must keep on every chart. One table-driven run over
 * style × fixture × seed; a new style is covered the moment it is registered. The run is
 * split across the `shard-*.test.ts` files beside this one (by style) only so the test runner
 * can spread it over its workers; each shard is the same suite over a quarter of the styles.
 * These are the rules no amount of musical taste may break — the idiom-specific "does it
 * sound like the genre" claims live in `critique.test.ts`.
 */

import { CYCLE } from '../../arrange/cycle.js';
import {
    type BandEvent,
    type BandSettings,
    type CompInstrument,
    DEFAULT_SETTINGS,
    type PitchedNote,
    type StyleId,
    type TradeSettings,
} from '../../core/types.js';
import { MAX_CHARACTER_MS } from '../../feel/feel.js';
import { compileTimeline, type Timeline } from '../../form/timeline.js';
import { type PassMemory, performPass } from '../../perform.js';
import { isPlayable } from '../../players/comp/fretboard.js';
import { COMP_INSTRUMENTS } from '../../players/comp/instruments.js';
import { STEP } from '../../players/grid.js';
import { LEAD_INSTRUMENTS } from '../../players/lead/instruments.js';
import { feelFor, STYLE_IDS, STYLES } from '../../styles/index.js';
import type { Feel } from '../../styles/types.js';
import { type ChordFacts, chordPcs, fifthOf } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';
import { FIXTURES } from '../scores.js';

const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const BASS_REGISTER = [23, 57] as const;
/**
 * The comp instruments that play differently (a keyboard, a sustaining organ, a picked and
 * a finger-plucked guitar). Rhodes and clav play the keyboard book exactly as the piano does.
 */
const INSTRUMENTS: CompInstrument[] = ['piano', 'organ', 'guitar', 'nylon'];
/**
 * With a bassist in the band, a guitar stays off the low strings (below C3) — except for a
 * note that doubles the bass's own job: the chord's bass, root or fifth, in a grip whose
 * lowest note is the root or the bass. That one shape rule covers the swing shell's root on
 * the low strings, the metal and punk power chord (E2, A2), and the open-position acoustic
 * chord (Am x02210), while a third, seventh or tension down there still fails.
 */
const GUITAR_FLOOR_WITH_BASS = 48;

/**
 * The chords a comp strike at `tick` may be playing: the one sounding, or — an anticipation
 * plays the next chord early — the next one in the bar, or the next bar's first (wrapping at
 * the end of the song).
 */
function strikeChords(timeline: Timeline, barIndex: number, tick: number) {
    const bar = timeline.bars[barIndex];
    const index = bar.spans.findIndex((s) => s.start <= tick && tick < s.end);
    return {
        here: bar.spans[index]?.chord,
        nextInBar: bar.spans[index + 1]?.chord,
        next: timeline.bars[barIndex + 1]?.spans[0]?.chord ?? timeline.bars[0].spans[0]?.chord,
    };
}

/** Whether a guitar note below the floor doubles the bass's job (see the floor above). */
function doublesTheBass(midi: number, grip: number[], chord: ChordFacts | null | undefined) {
    if (!chord) {
        return false;
    }
    const lowest = mod12(Math.min(...grip, midi));
    const pc = mod12(midi);
    const fifth = mod12(chord.root + fifthOf(chord));
    return (
        (lowest === chord.root || lowest === chord.bass) &&
        (pc === chord.bass || pc === chord.root || pc === fifth)
    );
}
/**
 * The styles whose comp plays power chords on purpose, and so the only ones where a power
 * chord (`isPowerChord`) is exempt from the guide-tone rule:
 * - **the guide tones**: a power chord has no third by design. Under distortion a third
 *   beating against root and fifth turns to mud, so metal states a chord by its root and its
 *   own fifth (the tritone for a diminished chord, the #5 for an augmented one) and leaves
 *   the quality to the melody — the old engine's `power-metal` comp did the same. A punk
 *   chorus (ska-punk) is the same distorted guitar, under someone else's third.
 * Scoped by style *and* shape so the exemption can't hide a voicing bug anywhere else: a
 * style that dropped its thirds by accident still fails.
 */
const POWER_CHORD_STYLES: ReadonlySet<StyleId> = new Set(['metal', 'skapunk']);

/**
 * Only the chord's root and its fifth (in any octaves), with the root lowest: R-5-8. An
 * augmented fifth (or an altered dominant's b13 in the fifth's seat) has no clean fifth to
 * voice — root+#5 reads as another chord's root+third — so `voicingTones`' power-chord rule
 * plays root and octave alone there. That's still the idiom's "no third" statement, just with
 * an empty fifth's seat, so a root-only octave counts as a power chord for that one case.
 */
function isPowerChord(midis: number[], chord: ChordFacts | null | undefined): boolean {
    if (!chord || midis.length < 2) {
        return false;
    }
    const lowest = Math.min(...midis);
    if (mod12(lowest) !== chord.root) {
        return false;
    }
    if (fifthOf(chord) === 8) {
        return midis.every((m) => mod12(m) === chord.root);
    }
    const fifth = mod12(chord.root + fifthOf(chord));
    return (
        midis.some((m) => mod12(m) === fifth) &&
        midis.every((m) => mod12(m) === chord.root || mod12(m) === fifth)
    );
}

/** How many shard files split the styles between them. */
const SHARDS = 4;

/** The invariant suite over the styles of one shard (every `SHARDS`th style, from `shard`). */
export function invariantSuite(shard: number): void {
    const styles = STYLE_IDS.filter((_, i) => i % SHARDS === shard);
    defineStyles(styles);
    defineLeads(styles.filter((id) => STYLES[id].lead));
}

function defineStyles(styles: StyleId[]): void {
    describe.each(styles)('%s invariants', (styleId) => {
        const style = STYLES[styleId];
        for (const [name, score] of Object.entries(FIXTURES)) {
            const timeline = compileTimeline(score);
            for (const comp of INSTRUMENTS) {
                // Guitars also play without a bassist: the grips come down, the bossa thumb plays.
                const bassless =
                    COMP_INSTRUMENTS[comp].family === 'guitar' ? [false, true] : [false];
                for (const [looping, noBass] of [true, false].flatMap((l) =>
                    bassless.map((b) => [l, b] as const),
                )) {
                    const label = `${name} on ${comp}${noBass ? ' without bass' : ''}`;
                    it(`${label}${looping ? ' (looping)' : ' (ending)'}`, () => {
                        const problems: string[] = [];
                        for (const seed of SEEDS) {
                            const settings: BandSettings = {
                                ...DEFAULT_SETTINGS,
                                style: styleId,
                                comp,
                                seed,
                                // A style with a lead plays it here too, so its first pass (the head)
                                // is held to every rule below alongside the band.
                                lanes: {
                                    drums: true,
                                    bass: !noBass,
                                    comp: true,
                                    lead: !!style.lead,
                                },
                                lead: style.lead?.prefers ?? DEFAULT_SETTINGS.lead,
                            };
                            const first = performPass(timeline, settings, { pass: 0, looping });
                            const again = performPass(timeline, settings, { pass: 0, looping });
                            if (JSON.stringify(again.events) !== JSON.stringify(first.events)) {
                                problems.push(`${seed}: not deterministic`);
                            }
                            checkPass(
                                timeline,
                                first.events,
                                feelFor(style, COMP_INSTRUMENTS[comp].family).lean,
                                settings,
                                seed,
                                problems,
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
                                feelFor(style, COMP_INSTRUMENTS[comp].family).lean,
                                settings,
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
     * The lead through a whole cycle — the head, three solo choruses, the head again — on every
     * fixture: each pass keeps every rule, and the head comes back note for note. Then trading:
     * with the soloist in fours and twos, and with the drummer where the style's drummer solos.
     */
}

function defineLeads(styles: StyleId[]): void {
    describe.each(styles)('%s lead', (styleId) => {
        const style = STYLES[styleId];
        for (const [name, score] of Object.entries(FIXTURES)) {
            const timeline = compileTimeline(score);
            it(`${name}: a cycle keeps the rules, and the head returns`, () => {
                const problems: string[] = [];
                for (const seed of SEEDS.slice(0, 4)) {
                    const settings: BandSettings = {
                        ...DEFAULT_SETTINGS,
                        style: styleId,
                        seed,
                        lanes: { drums: true, bass: true, comp: true, lead: true },
                        lead: style.lead?.prefers ?? DEFAULT_SETTINGS.lead,
                    };
                    const lean = feelFor(style, COMP_INSTRUMENTS[settings.comp].family).lean;
                    const heads: string[] = [];
                    const cycle = CYCLE;
                    let memory: PassMemory | undefined;
                    for (let pass = 0; pass <= cycle; pass++) {
                        const result = performPass(timeline, settings, {
                            pass,
                            looping: true,
                            memory,
                        });
                        memory = result.memory;
                        checkPass(
                            timeline,
                            result.events,
                            lean,
                            settings,
                            `${seed}/pass${pass}`,
                            problems,
                        );
                        if (pass % cycle === 0) {
                            heads.push(
                                JSON.stringify(
                                    result.events
                                        .filter((e) => e.lane === 'lead')
                                        .map((e) => [
                                            e.tick,
                                            e.lane === 'lead' && e.midi,
                                            e.lane === 'lead' && e.dur,
                                        ]),
                                ),
                            );
                        }
                    }
                    if (heads[0] !== heads[1]) {
                        problems.push(`${seed}: the head changed when it came back`);
                    }
                    const trades: TradeSettings[] = [
                        { with: 'lead', bars: 4 },
                        { with: 'lead', bars: 2 },
                        ...(style.drums.solos
                            ? ([
                                  { with: 'drums', bars: 4 },
                                  { with: 'drums', bars: 8 },
                              ] as const)
                            : []),
                    ];
                    for (const trade of trades) {
                        let traded: PassMemory | undefined;
                        for (let pass = 0; pass < 3; pass++) {
                            const result = performPass(
                                timeline,
                                { ...settings, trade },
                                { pass, looping: true, memory: traded },
                            );
                            traded = result.memory;
                            checkPass(
                                timeline,
                                result.events,
                                lean,
                                settings,
                                `${seed}/trade ${trade.with} ${trade.bars}/pass${pass}`,
                                problems,
                            );
                        }
                    }
                }
                expect(problems.slice(0, 10), `${styleId}/${name}`).toEqual([]);
            });
        }
    });
}

/**
 * Checks one pass, pushing a readable line per broken rule onto `problems` (collected
 * rather than asserted one by one: the suite checks millions of facts, and building an
 * assertion message for each passing one is most of the cost).
 */
function checkPass(
    timeline: Timeline,
    events: BandEvent[],
    lean: Feel['lean'],
    settings: BandSettings,
    where: string,
    problems: string[],
) {
    const fail = (e: BandEvent, rule: string) =>
        problems.push(`${where} bar ${e.bar} ${e.lane}@${e.tick}: ${rule}`);
    if (!events.length) {
        problems.push(`${where}: silent`);
    }
    const instrument = COMP_INSTRUMENTS[settings.comp];
    const powerChords = POWER_CHORD_STYLES.has(settings.style);
    // Every comp note sounding at a tick (palm-muted ones too: a chug is the grip, damped).
    const compAt = new Map<number, number[]>();
    for (const e of events) {
        if (e.lane === 'comp') {
            compAt.set(e.tick, [...(compAt.get(e.tick) ?? []), e.midi]);
        }
    }
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
            e.lane === 'drums'
                ? 0
                : e.lane === 'lead'
                  ? (lean.lead ?? lean.bass)
                  : lean[e.lane] + (strummed.get(e) ?? 0) * instrument.strumMs;
        if (Math.abs(e.offsetMs - centre) > MAX_CHARACTER_MS + 1e-9) {
            fail(e, `offset ${e.offsetMs.toFixed(1)}ms from ${centre}`);
        }
        if (e.lane === 'drums') {
            continue;
        }
        const [lo, hi] =
            e.lane === 'bass'
                ? BASS_REGISTER
                : e.lane === 'lead'
                  ? LEAD_INSTRUMENTS[settings.lead].range
                  : instrument.range;
        if (e.midi < lo || e.midi > hi) {
            fail(e, `midi ${e.midi} outside ${lo}–${hi}`);
        }
        if (
            e.lane === 'comp' &&
            instrument.family === 'guitar' &&
            settings.lanes.bass &&
            e.midi < GUITAR_FLOOR_WITH_BASS &&
            // Judged against the chord the strike plays: an anticipated open G7 (3x0001)
            // doubles the bass note that is about to arrive.
            !Object.values(strikeChords(timeline, e.bar, e.tick)).some((chord) =>
                doublesTheBass(e.midi, compAt.get(e.tick) ?? [], chord),
            )
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

    // The lead is one voice: a note ends before the next begins.
    const lead = events.filter((e): e is PitchedNote => e.lane === 'lead');
    for (let i = 1; i < lead.length; i++) {
        if (lead[i - 1].tick + lead[i - 1].dur > lead[i].tick + 1) {
            fail(lead[i], `lead overlaps the note at ${lead[i - 1].tick}`);
        }
    }
    // Chord arrivals: the bass lands on a chord tone; comp chords carry the guide tones.
    const bass = events.filter((e): e is PitchedNote => e.lane === 'bass');
    const chords = events.filter((e): e is PitchedNote => e.lane === 'comp' && !e.muted);
    timeline.spans.forEach((span, spanIndex) => {
        const chord = span.chord;
        if (!chord) {
            return;
        }
        const arrival = bass.find((n) => Math.abs(n.tick - span.start) < 1 && !n.muted);
        if (arrival && !chordPcs(chord).includes(mod12(arrival.midi))) {
            fail(arrival, `bass arrival not a tone of ${chord.symbol}`);
        }
        // A lead note struck on a chord change is one of the chord's tones: a target, by rule.
        // (The same chord again in the next bar is no change: the line may pass through it.)
        const changed = timeline.spans[spanIndex - 1]?.chord?.symbol !== chord.symbol;
        const landing = changed && lead.find((n) => Math.abs(n.tick - span.start) < 1);
        if (landing && !chordPcs(chord).includes(mod12(landing.midi))) {
            fail(landing, `lead lands on a non-tone of ${chord.symbol}`);
        }
        // A lead note held into a change is heard against the new chord: an anticipation, so
        // one of its tones. (A note struck earlier stops at the change instead.)
        const held =
            changed && lead.find((n) => n.tick < span.start - 1 && n.tick + n.dur > span.start + 1);
        if (held && !chordPcs(chord).includes(mod12(held.midi))) {
            fail(held, `lead holds a non-tone into ${chord.symbol}`);
        }
    });
    const clusters = new Map<number, PitchedNote[]>();
    for (const n of chords) {
        clusters.set(n.tick, [...(clusters.get(n.tick) ?? []), n]);
    }
    for (const [tick, notes] of clusters) {
        // An anticipation may play the next chord early (`strikeChords`).
        const { here, nextInBar, next } = strikeChords(timeline, notes[0].bar, tick);
        const pcs = new Set(notes.map((n) => mod12(n.midi)));
        // A picked pair is a double-stop — two strings of the grip the hand holds (the soul
        // guitar's 3rds and 6ths), a line over the chord rather than the chord itself — so it
        // names its chord with one guide tone, not all of them.
        const pair = notes.length === 2 && !!notes[0].stroke;
        const carries = (c: typeof here) => {
            const held = c?.guides.filter((g) => pcs.has(mod12(c.root + g))) ?? [];
            return !!c && (pair ? held.length > 0 : held.length === c.guides.length);
        };
        // A single note is a bossa thumb (the bass role), not a chord; an upstroke catches
        // only the top strings — the downstroke before it carried the chord.
        const up = notes[0].stroke === 'up';
        // With no bassist, a boogie dyad on the chord's bass — the bass note with its 5th, b6,
        // 6th or b7 above (the blues boogie's R5/R6/Rb7) — is the guitar playing the bass role,
        // not a chord short of its guide tones.
        const [lowNote, highNote] = notes.map((n) => n.midi).sort((a, b) => a - b);
        const bassRole =
            !settings.lanes.bass &&
            notes.length === 2 &&
            mod12(lowNote) === here?.bass &&
            [7, 8, 9, 10].includes(highNote - lowNote);
        // A power chord on a power-chord style states the chord by root and fifth alone.
        const power =
            powerChords &&
            isPowerChord(
                notes.map((n) => n.midi),
                here,
            );
        if (
            notes.length > 1 &&
            !up &&
            !bassRole &&
            !power &&
            !(carries(here) || carries(nextInBar) || carries(next))
        ) {
            fail(notes[0], `comp chord lacks the guide tones of ${here?.symbol}`);
        }
        // Every guitar chord — thumb and fingers together — is one a hand can fret.
        const grip = notes.map((n) => n.midi);
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
