/**
 * The critique harness: how a style is performed for judging, and the metric library its
 * claims measure. Claims live one file per style in `../claims/`; the runner is
 * `../critique.test.ts`. Ranges are statistical (they hold across seeds and charts), never
 * snapshots.
 *
 * Swing is forced straight here so positions read on the grid; `feel.test.ts` owns swing.
 */
import {
    type BandEvent,
    type CompInstrument,
    DEFAULT_SETTINGS,
    type DrumHit,
    type PitchedNote,
    type StyleId,
} from '../../core/types.js';
import { chordAt, compileTimeline, type Timeline } from '../../form/timeline.js';
import { type PassMemory, performPass } from '../../perform.js';
import { STEP } from '../../players/grid.js';
import { CYCLE } from '../../players/lead/form.js';
import { STYLES } from '../../styles/index.js';
import { chordPcs, fifthOf } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';
import { FIXTURES } from '../scores.js';

const CHARTS = ['blues', 'rhythmChanges', 'popSong', 'minorFunk', 'bossa', 'romanNumerals'];
const SEEDS = ['one', 'two', 'three', 'four'];

export interface Take {
    timeline: Timeline;
    events: BandEvent[];
}

export function perform(
    style: StyleId,
    intensity: number | null = null,
    comp: CompInstrument = 'piano',
    bass = true,
    lead?: 'head' | 'solo',
): Take[] {
    const takes: Take[] = [];
    const lanes = { ...DEFAULT_SETTINGS.lanes, bass, lead: lead !== undefined };
    const instrument = STYLES[style].lead?.prefers ?? DEFAULT_SETTINGS.lead;
    // The lead's form spans a cycle: the head is pass 0, the solo choruses passes 1–3.
    const passes = lead ? CYCLE : 2;
    for (const chart of CHARTS) {
        const timeline = compileTimeline(FIXTURES[chart]);
        for (const seed of SEEDS) {
            let memory: PassMemory | undefined;
            for (let pass = 0; pass < passes; pass++) {
                const settings = {
                    ...DEFAULT_SETTINGS,
                    style,
                    comp,
                    seed,
                    swing: 0,
                    intensity,
                    lead: instrument,
                };
                settings.lanes = lanes;
                const result = performPass(timeline, settings, { pass, looping: true, memory });
                memory = result.memory;
                if (!lead || (lead === 'head') === (pass === 0)) {
                    takes.push({ timeline, events: result.events });
                }
            }
        }
    }
    return takes;
}

// ---------------------------------------------------------------- lead helpers
/** The lead's notes in a take, in order, each with the gap since the note before it. */
function leadNotes(events: BandEvent[]): PitchedNote[] {
    return events.filter((e): e is PitchedNote => e.lane === 'lead');
}

/** Consecutive pairs of lead notes inside one phrase (no rest of a beat or more between). */
function leadPairs(events: BandEvent[]): [PitchedNote, PitchedNote][] {
    const notes = leadNotes(events);
    const pairs: [PitchedNote, PitchedNote][] = [];
    for (let i = 1; i < notes.length; i++) {
        const [a, b] = [notes[i - 1], notes[i]];
        if (b.tick - (a.tick + a.dur) < STEP * 4) {
            pairs.push([a, b]);
        }
    }
    return pairs;
}

/** The lead notes struck on a real chord change (a different chord from the span before). */
function leadLandings(t: Timeline, events: BandEvent[]) {
    const notes = leadNotes(events);
    const out: {
        note: PitchedNote;
        chord: NonNullable<ReturnType<typeof chordAt>>;
        before?: PitchedNote;
    }[] = [];
    t.spans.forEach((span, i) => {
        if (!span.chord || t.spans[i - 1]?.chord?.symbol === span.chord.symbol) {
            return;
        }
        const k = notes.findIndex((n) => Math.abs(n.tick - span.start) < 1);
        if (k >= 0) {
            out.push({ note: notes[k], chord: span.chord, before: notes[k - 1] });
        }
    });
    return out;
}

/** The last note of each phrase: followed by a rest of a beat or more (or nothing). */
function phraseEnds(events: BandEvent[]): PitchedNote[] {
    const notes = leadNotes(events);
    return notes.filter((n, i) => {
        const next = notes[i + 1];
        return !next || next.tick - (n.tick + n.dur) >= STEP * 4;
    });
}

// ---------------------------------------------------------------- metric library
/** Sounding (not scratched) comp notes grouped into chords by onset. */
function compChords(events: BandEvent[]): Map<number, PitchedNote[]> {
    const chords = new Map<number, PitchedNote[]>();
    for (const e of events) {
        if (e.lane === 'comp' && !e.muted) {
            chords.set(e.tick, [...(chords.get(e.tick) ?? []), e]);
        }
    }
    return chords;
}
const stepOf = (t: Timeline, e: BandEvent) => Math.round((e.tick - t.bars[e.bar].start) / STEP);
const ratio = (hits: number, total: number) => (total ? hits / total : 0);

/** Bars a groove metric should judge: 4/4, no fill, not a section's first bar (crash). */
function grooveBars(t: Timeline, events: BandEvent[]) {
    return t.bars.filter((b) => {
        if (b.meter.name !== '4/4') {
            return false;
        }
        const drums = events.filter((e) => e.bar === b.index && e.lane === 'drums') as DrumHit[];
        const hasTom = drums.some((d) => d.piece.startsWith('tom'));
        const lastPhraseBar = b.phrase.bar === b.phrase.length - 1;
        return drums.length > 0 && !hasTom && !lastPhraseBar && b.barInVisit > 0;
    });
}

function drumSteps(t: Timeline, events: BandEvent[], bar: number, pieces: string[]) {
    return new Set(
        events
            .filter(
                (e): e is DrumHit =>
                    e.lane === 'drums' && e.bar === bar && pieces.includes(e.piece),
            )
            .map((e) => stepOf(t, e)),
    );
}

/** 4/4 bars holding one chord for the whole bar, struck on the One: [bar, its chord]. */
function wholeBarChords(t: Timeline) {
    return t.bars.flatMap((b) => {
        const span = b.spans[0];
        return b.meter.name === '4/4' && b.spans.length === 1 && span.attack && span.chord
            ? [[b, span.chord] as const]
            : [];
    });
}

/** Per bar, onset step → the sounding notes a lane plays there. */
function onsetsByBar(t: Timeline, events: BandEvent[], lane: 'bass' | 'comp') {
    const out = new Map<number, Map<number, PitchedNote[]>>();
    for (const e of events) {
        if (e.lane === lane && !e.muted) {
            const bar = out.get(e.bar) ?? new Map<number, PitchedNote[]>();
            const step = stepOf(t, e);
            bar.set(step, [...(bar.get(step) ?? []), e]);
            out.set(e.bar, bar);
        }
    }
    return out;
}

export type Metric = (takes: Take[]) => number;

export const METRICS = {
    snareBackbeat: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                const s = drumSteps(t, events, b.index, ['snare', 'rim']);
                hit += s.has(4) && s.has(12) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    hatPedal24: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                const s = drumSteps(t, events, b.index, ['hatPedal']);
                hit += s.has(4) && s.has(12) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    rideOnBeats: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                const s = drumSteps(t, events, b.index, ['ride']);
                hit += [0, 4, 8, 12].every((x) => s.has(x)) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    kickOnOne: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                hit += drumSteps(t, events, b.index, ['kick']).has(0) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of bars where kick and cross-stick (or snare) land together on beat 3: the drop. */
    dropOnThree: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                const kick = drumSteps(t, events, b.index, ['kick']);
                const stick = drumSteps(t, events, b.index, ['rim', 'snare']);
                hit += kick.has(8) && stick.has(8) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of bars whose rim part is one of the two bars of the bossa clave. */
    claveRim: (takes) => {
        const clave = ['0,6,12', '4,10'];
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                const s = [...drumSteps(t, events, b.index, ['rim'])]
                    .sort((x, y) => x - y)
                    .join(',');
                hit += clave.includes(s) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of groove bars with the kick on both 1 and 3 (the shuffle's ground). */
    kickOnOneAndThree: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                const s = drumSteps(t, events, b.index, ['kick']);
                hit += s.has(0) && s.has(8) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of groove bars whose cymbals play every eighth and nothing between (a shuffle's time). */
    cymbalEighths: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                const s = drumSteps(t, events, b.index, ['hat', 'hatOpen', 'ride', 'crash']);
                const eighths = [0, 2, 4, 6, 8, 10, 12, 14].every((x) => s.has(x));
                hit += eighths && [...s].every((x) => x % 2 === 0) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    ghostsPerBar: (takes) => {
        let n = 0;
        let ghosts = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                ghosts += events.filter(
                    (e) => e.lane === 'drums' && e.bar === b.index && e.piece === 'ghost',
                ).length;
            }
        }
        return ratio(ghosts, n);
    },
    /** Within a section visit, how often a bar's kick matches the visit's usual kick. */
    kickConsistency: (takes) => {
        let n = 0;
        let same = 0;
        for (const { timeline: t, events } of takes) {
            const byVisit = new Map<number, string[]>();
            for (const b of grooveBars(t, events)) {
                const k = [...drumSteps(t, events, b.index, ['kick'])]
                    .sort((x, y) => x - y)
                    .join(',');
                byVisit.set(b.visit.ordinal, [...(byVisit.get(b.visit.ordinal) ?? []), k]);
            }
            for (const kicks of byVisit.values()) {
                const counts = new Map<string, number>();
                for (const k of kicks) {
                    counts.set(k, (counts.get(k) ?? 0) + 1);
                }
                n += kicks.length;
                same += Math.max(...counts.values());
            }
        }
        return ratio(same, n);
    },
    bassArrivesOnBass: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const span of t.spans) {
                const note = events.find(
                    (e): e is PitchedNote => e.lane === 'bass' && Math.abs(e.tick - span.start) < 1,
                );
                if (!span.chord || !note) {
                    continue;
                }
                n++;
                hit += mod12(note.midi) === span.chord.bass ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of 4/4 bars (with a bass part) where the bass plays on the One. */
    bassOnOne: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const bars = new Map<number, Set<number>>();
            for (const e of events) {
                if (e.lane === 'bass' && t.bars[e.bar].meter.name === '4/4') {
                    bars.set(e.bar, (bars.get(e.bar) ?? new Set()).add(stepOf(t, e)));
                }
            }
            for (const steps of bars.values()) {
                n++;
                hit += steps.has(0) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of the time in 4/4 bars with a bass part when no bass note sounds (its rests). */
    bassSilence: (takes) => {
        let total = 0;
        let sounding = 0;
        for (const { timeline: t, events } of takes) {
            const bars = new Map<number, [number, number][]>();
            for (const e of events) {
                if (e.lane === 'bass' && t.bars[e.bar].meter.name === '4/4') {
                    bars.set(e.bar, [...(bars.get(e.bar) ?? []), [e.tick, e.tick + e.dur]]);
                }
            }
            for (const [index, notes] of bars) {
                const bar = t.bars[index];
                const end = bar.start + bar.meter.barTicks;
                total += bar.meter.barTicks;
                // The union of the notes' spans, clipped to the bar.
                let reach = bar.start;
                for (const [from, to] of notes.sort((a, b) => a[0] - b[0])) {
                    const lo = Math.max(from, reach);
                    const hi = Math.min(to, end);
                    if (hi > lo) {
                        sounding += hi - lo;
                        reach = hi;
                    }
                }
            }
        }
        return ratio(total - sounding, total);
    },
    /** Mean pitch (MIDI) of the sounding bass notes. */
    bassMeanPitch: (takes) => {
        let n = 0;
        let sum = 0;
        for (const { events } of takes) {
            for (const e of events) {
                if (e.lane === 'bass' && !e.muted) {
                    n++;
                    sum += e.midi;
                }
            }
        }
        return ratio(sum, n);
    },
    bassNotesPerBeat: (takes) => {
        let notes = 0;
        let beats = 0;
        for (const { timeline: t, events } of takes) {
            beats += t.bars.reduce((sum, b) => sum + b.meter.barTicks / 480, 0);
            notes += events.filter((e) => e.lane === 'bass' && !(e as PitchedNote).muted).length;
        }
        return ratio(notes, beats);
    },
    /** At each real chord change, the share where the note before is a half step from the arrival. */
    bassChromaticApproach: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const bass = events.filter((e): e is PitchedNote => e.lane === 'bass' && !e.muted);
            for (const [k, span] of t.spans.entries()) {
                const before = t.spans[k - 1]?.chord;
                if (!span.chord || !before || before.bass === span.chord.bass) {
                    continue;
                }
                const i = bass.findIndex((e) => Math.abs(e.tick - span.start) < 1);
                if (i < 1) {
                    continue;
                }
                n++;
                hit += Math.abs(bass[i].midi - bass[i - 1].midi) === 1 ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of consecutive bass notes that repeat a pitch (a walking line keeps moving). */
    bassRepeatedNotes: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { events } of takes) {
            const bass = events.filter((e): e is PitchedNote => e.lane === 'bass' && !e.muted);
            for (let i = 1; i < bass.length; i++) {
                n++;
                hit += bass[i].midi === bass[i - 1].midi ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * The blues shuffle's lope: of the bass notes on a swung "and" (an offbeat eighth), the
     * share that repeat the pitch of the beat just before it. This is the claim itself — the
     * lope re-strikes the beat, it never moves on the "and" — not `bassRepeatedNotes`'s much
     * broader count of any two consecutive notes sharing a pitch anywhere in the line.
     */
    bassLopeRepeatsBeat: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const bass = onsetsByBar(t, events, 'bass');
            for (const steps of bass.values()) {
                for (const [step, notes] of steps) {
                    if (step % 4 !== 2) {
                        continue;
                    }
                    const beat = steps.get(step - 2);
                    if (!beat) {
                        continue;
                    }
                    n++;
                    hit += notes[0].midi === beat[0].midi ? 1 : 0;
                }
            }
        }
        return ratio(hit, n);
    },
    /** Share of bass notes lasting two beats or more that are chord tones (no held passing tones). */
    bassHeldNotesAreChordTones: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const e of events) {
                if (e.lane !== 'bass' || e.dur < 800) {
                    continue;
                }
                const chord = t.spans.find((s) => s.start <= e.tick && e.tick < s.end)?.chord;
                if (!chord) {
                    continue;
                }
                n++;
                hit += chord.intervals.some((i) => mod12(chord.root + i) === mod12(e.midi)) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * Of the bass notes under dominant 7th chords whose scale actually has a natural 6/13
     * (excluding a secondary dominant resolving to minor, which takes an implied b13 and has
     * no 6th to rock to — B2), the share on the major 6th (the boogie's).
     */
    bassSixthOnDominants: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const e of events) {
                if (e.lane !== 'bass' || e.muted) {
                    continue;
                }
                const chord = chordAt(t, e.tick);
                if (
                    chord?.family !== 'dominant' ||
                    chord.seventh !== 10 ||
                    !chord.scale.includes(9)
                ) {
                    continue;
                }
                n++;
                hit += mod12(e.midi - chord.root) === 9 ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    bassMeanLeap: (takes) => {
        let n = 0;
        let sum = 0;
        for (const { events } of takes) {
            const bass = events.filter((e): e is PitchedNote => e.lane === 'bass' && !e.muted);
            for (let i = 1; i < bass.length; i++) {
                n++;
                sum += Math.abs(bass[i].midi - bass[i - 1].midi);
            }
        }
        return ratio(sum, n);
    },
    bassKickUnison: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { events } of takes) {
            const kicks = new Set(
                events
                    .filter((e) => e.lane === 'drums' && e.piece === 'kick')
                    .map((e) => Math.round(e.tick)),
            );
            for (const e of events) {
                if (e.lane === 'bass' && !e.muted) {
                    n++;
                    hit += kicks.has(Math.round(e.tick)) ? 1 : 0;
                }
            }
        }
        return ratio(hit, n);
    },
    /** Share of bass onsets on a sixteenth "e" or "a". */
    bassSixteenthSyncopation: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const e of events) {
                if (e.lane === 'bass') {
                    n++;
                    hit += stepOf(t, e) % 2 === 1 ? 1 : 0;
                }
            }
        }
        return ratio(hit, n);
    },
    compOffbeatShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const onsets = new Set(
                events
                    .filter((e) => e.lane === 'comp' && !e.muted)
                    .map((e) => `${e.bar}:${stepOf(t, e)}`),
            );
            for (const o of onsets) {
                n++;
                hit += Number(o.split(':')[1]) % 4 !== 0 ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of sounding comp onsets in 4/4 bars that fall on beat 1 or beat 3. */
    compOnOneAndThree: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const onsets = new Set(
                events
                    .filter(
                        (e) => e.lane === 'comp' && !e.muted && t.bars[e.bar].meter.name === '4/4',
                    )
                    .map((e) => `${e.bar}:${stepOf(t, e)}`),
            );
            for (const o of onsets) {
                n++;
                hit += Number(o.split(':')[1]) % 8 === 0 ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of sounding 4/4 comp strikes on beats 2 and 4. */
    compOnBackbeat: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const notes of compChords(events).values()) {
                if (t.bars[notes[0].bar].meter.name !== '4/4') {
                    continue;
                }
                n++;
                hit += stepOf(t, notes[0]) % 8 === 4 ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Mean movement of the top voice between consecutive comp chords, in semitones. */
    compTopVoiceMotion: (takes) => {
        let n = 0;
        let sum = 0;
        for (const { events } of takes) {
            const tops = new Map<number, number>();
            for (const e of events) {
                if (e.lane === 'comp' && !e.muted) {
                    tops.set(e.tick, Math.max(tops.get(e.tick) ?? 0, e.midi));
                }
            }
            const list = [...tops.values()];
            for (let i = 1; i < list.length; i++) {
                n++;
                sum += Math.abs(list[i] - list[i - 1]);
            }
        }
        return ratio(sum, n);
    },
    /** Share of comp chords no longer than an eighth note. */
    compShort: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { events } of takes) {
            const seen = new Set<number>();
            for (const e of events) {
                if (e.lane === 'comp' && !e.muted && !seen.has(e.tick)) {
                    seen.add(e.tick);
                    n++;
                    hit += e.dur <= 240 ? 1 : 0;
                }
            }
        }
        return ratio(hit, n);
    },
    /** Share of comp chords that carry a colour tone (9th or 13th above the root). */
    compColour: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const clusters = new Map<number, PitchedNote[]>();
            for (const e of events) {
                if (e.lane === 'comp' && !e.muted) {
                    clusters.set(e.tick, [...(clusters.get(e.tick) ?? []), e]);
                }
            }
            for (const [tick, notes] of clusters) {
                const chord = t.spans.find((s) => s.start <= tick && tick < s.end)?.chord;
                if (!chord || chord.family === 'power') {
                    continue;
                }
                n++;
                const pcs = notes.map((x) => mod12(x.midi - chord.root));
                hit += pcs.some((p) => p === 2 || (p === 9 && chord.seventh !== null)) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of comp onsets (per strike, not per note) that are muted scratches. */
    compScratchShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { events } of takes) {
            const strikes = new Map<number, boolean>();
            for (const e of events) {
                if (e.lane === 'comp') {
                    strikes.set(e.tick, !!e.muted);
                }
            }
            for (const muted of strikes.values()) {
                n++;
                hit += muted ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of sounding comp strikes that are upstrokes. */
    compUpstrokeShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { events } of takes) {
            const strikes = new Map<number, string | undefined>();
            for (const e of events) {
                if (e.lane === 'comp' && !e.muted) {
                    strikes.set(e.tick, e.stroke);
                }
            }
            for (const stroke of strikes.values()) {
                n++;
                hit += stroke === 'up' ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of sounding comp chords whose lowest note is the chord's bass (root position). */
    compRootLowest: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const notes of compChords(events).values()) {
                const chord = chordAt(t, notes[0].tick);
                if (!chord || notes.length < 2) {
                    continue;
                }
                n++;
                const lowest = Math.min(...notes.map((x) => x.midi));
                hit += mod12(lowest) === chord.bass ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Mean lowest note (MIDI) of the sounding comp chords. */
    compMeanLowest: (takes) => {
        let n = 0;
        let sum = 0;
        for (const { events } of takes) {
            for (const notes of compChords(events).values()) {
                n++;
                sum += Math.min(...notes.map((x) => x.midi));
            }
        }
        return ratio(sum, n);
    },
    /** Mean length of 4/4 comp chords on beats 1 and 3 over those on 2 and 4 (long-short). */
    compLongShort: (takes) => {
        const sum = { down: 0, back: 0 };
        const n = { down: 0, back: 0 };
        for (const { timeline: t, events } of takes) {
            for (const notes of compChords(events).values()) {
                const bar = t.bars[notes[0].bar];
                const step = stepOf(t, notes[0]);
                if (bar.meter.name !== '4/4' || step % 4 !== 0) {
                    continue;
                }
                const beat = step % 8 === 0 ? 'down' : 'back';
                sum[beat] += notes[0].dur;
                n[beat]++;
            }
        }
        return ratio(ratio(sum.down, n.down), ratio(sum.back, n.back));
    },
    /** Comp strikes (sounding or scratched) per bar played. */
    compStrikesPerBar: (takes) => {
        let bars = 0;
        let strikes = 0;
        for (const { events } of takes) {
            const played = new Set<number>();
            const onsets = new Set<number>();
            for (const e of events) {
                played.add(e.bar);
                if (e.lane === 'comp') {
                    onsets.add(e.tick);
                }
            }
            bars += played.size;
            strikes += onsets.size;
        }
        return ratio(strikes, bars);
    },
    /**
     * Boom-chick: in bars holding one root-position chord and not walking (nothing on beat 4),
     * the share with the root on 1 and the fifth on 3.
     */
    bassRootFifth: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const bass = onsetsByBar(t, events, 'bass');
            for (const [b, chord] of wholeBarChords(t)) {
                const notes = bass.get(b.index);
                if (chord.bass !== chord.root || chord.fifth === null || notes?.has(12)) {
                    continue;
                }
                n++;
                const one = notes?.get(0)?.[0];
                const three = notes?.get(8)?.[0];
                const fifth = mod12(chord.root + chord.fifth);
                hit +=
                    one && three && mod12(one.midi) === chord.root && mod12(three.midi) === fifth
                        ? 1
                        : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * Of the chord changes at a barline after a whole-bar chord, the share walked into: notes
     * on beats 3 and 4 stepping (1–2 semitones each, one direction) onto the new chord's bass,
     * where beat 4 — the note the ear judges right before the landing (T8) — is either a tone
     * of the chord it's walking away from, or a half step from where it lands. A contour-only
     * check let a walk clash straight through this: A7's altered scale can produce a
     * contour-clean A-Bb-C run into Dm whose C natural fights the chord's own C# (B4).
     */
    bassWalkUps: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const bass = onsetsByBar(t, events, 'bass');
            for (const [b, chord] of wholeBarChords(t)) {
                const next = t.bars[b.index + 1]?.spans[0];
                if (!next?.attack || !next.chord || next.chord.bass === chord.bass) {
                    continue;
                }
                n++;
                const three = bass.get(b.index)?.get(8)?.[0]?.midi;
                const four = bass.get(b.index)?.get(12)?.[0]?.midi;
                const land = bass.get(b.index + 1)?.get(0)?.[0]?.midi;
                if (three === undefined || four === undefined || land === undefined) {
                    continue;
                }
                const [a, c] = [four - three, land - four];
                const steps = [1, 2].includes(Math.abs(a)) && [1, 2].includes(Math.abs(c));
                const lands = mod12(land) === next.chord.bass;
                const leadsIn =
                    chordPcs(chord).includes(mod12(four)) || Math.abs(land - four) === 1;
                hit += steps && Math.sign(a) === Math.sign(c) && lands && leadsIn ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of sounding 4/4 comp chords (two notes or more) struck on beat 2 or 4. */
    compBackbeatShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const notes of compChords(events).values()) {
                if (notes.length < 2 || t.bars[notes[0].bar].meter.name !== '4/4') {
                    continue;
                }
                n++;
                const step = stepOf(t, notes[0]);
                hit += step === 4 || step === 12 ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * A guitar's own boom (no bass in the band): in bars holding one root-position chord, the
     * share with a lone low note (below E3) on 1 that is the root, and on 3 the fifth. Same
     * exclusion as `bassRootFifth`: a bar the walk-up (I3) claims for its approach into the
     * next chord isn't a boom-chick bar to judge here — `compWalkUps` judges those.
     */
    compBoomChick: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const comp = onsetsByBar(t, events, 'comp');
            for (const [b, chord] of wholeBarChords(t)) {
                const walked = comp
                    .get(b.index)
                    ?.get(12)
                    ?.some((x) => x.midi < 52);
                if (chord.bass !== chord.root || chord.fifth === null || walked) {
                    continue;
                }
                n++;
                const low = (step: number, pc: number) => {
                    const notes = comp.get(b.index)?.get(step);
                    return notes?.length === 1 && notes[0].midi < 52 && mod12(notes[0].midi) === pc;
                };
                hit += low(0, chord.root) && low(8, mod12(chord.root + chord.fifth)) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * Reggae organ bubble: of the 4/4 beats with a chord sounding, the share with the full
     * e-&-a cell — a felt touch on the "e", another on the "a", and something on the "and"
     * between them. Checks the actual three-hit motion (T1), not just a generic offbeat share
     * that a two-hit "and plus a" figure would also pass.
     */
    compEAndAMotion: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const comp = onsetsByBar(t, events, 'comp');
            for (const b of t.bars) {
                if (b.meter.name !== '4/4') {
                    continue;
                }
                const onsets = comp.get(b.index);
                for (const beat of [0, 4, 8, 12]) {
                    const chord = chordAt(t, b.start + beat * STEP);
                    if (!chord) {
                        continue;
                    }
                    n++;
                    const has = (s: number) => !!onsets?.get(s)?.length;
                    hit += has(beat + 1) && has(beat + 2) && has(beat + 3) ? 1 : 0;
                }
            }
        }
        return ratio(hit, n);
    },
    /**
     * Mean velocity of 4/4 comp chops on beat 2/4 against everywhere else the comp plays.
     * Reggae's accented chop must never be the quiet stroke (B5): a lift makes the whole hand
     * louder, but 2 and 4 stay on top of it.
     */
    compBackbeatVelocityRatio: (takes) => {
        let n24 = 0;
        let sum24 = 0;
        let nOther = 0;
        let sumOther = 0;
        for (const { timeline: t, events } of takes) {
            for (const e of events) {
                if (e.lane !== 'comp' || e.muted || t.bars[e.bar].meter.name !== '4/4') {
                    continue;
                }
                const step = stepOf(t, e);
                if (step === 4 || step === 12) {
                    n24++;
                    sum24 += e.velocity;
                } else {
                    nOther++;
                    sumOther += e.velocity;
                }
            }
        }
        const meanOther = ratio(sumOther, nOther);
        return meanOther === 0 ? 1 : ratio(sum24, n24) / meanOther;
    },
    /**
     * Share of struck 4/4 bars where both beat 2 and beat 4 get a chop: the genre's one
     * non-negotiable gesture, present whichever skank figure the section picked.
     */
    compBackbeat24Coverage: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const comp = onsetsByBar(t, events, 'comp');
            for (const b of t.bars) {
                if (b.meter.name !== '4/4') {
                    continue;
                }
                const onsets = comp.get(b.index);
                if (!onsets || onsets.size === 0) {
                    continue;
                }
                n++;
                hit += onsets.has(4) && onsets.has(12) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * The guitar-alone analogue of `bassWalkUps` (I3): with no bassist, the pick's own low
     * strings (below E3, same threshold as `compBoomChick`) are the only voice that can play
     * the walk-up into a change — same contour-and-chord-tone check as the bass's.
     */
    compWalkUps: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const comp = onsetsByBar(t, events, 'comp');
            const low = (bar: number, step: number) =>
                comp
                    .get(bar)
                    ?.get(step)
                    ?.find((x) => x.midi < 52)?.midi;
            for (const [b, chord] of wholeBarChords(t)) {
                const next = t.bars[b.index + 1]?.spans[0];
                if (!next?.attack || !next.chord || next.chord.bass === chord.bass) {
                    continue;
                }
                n++;
                const three = low(b.index, 8);
                const four = low(b.index, 12);
                const land = low(b.index + 1, 0);
                if (three === undefined || four === undefined || land === undefined) {
                    continue;
                }
                const [a, c] = [four - three, land - four];
                const steps = [1, 2].includes(Math.abs(a)) && [1, 2].includes(Math.abs(c));
                const lands = mod12(land) === next.chord.bass;
                const leadsIn =
                    chordPcs(chord).includes(mod12(four)) || Math.abs(land - four) === 1;
                hit += steps && Math.sign(a) === Math.sign(c) && lands && leadsIn ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * The Jimmy Reed boogie dyad (guitar alone, no bass): in bars holding one root-position,
     * plain-5th chord, the share of its beats where the lower note is the root and the upper
     * is the chord's plain 5th on 1 and 3, its major 6th (or the b7 where the chord's scale
     * has no 6th — B2) on 2 and 4.
     */
    compBoogieDyads: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const comp = onsetsByBar(t, events, 'comp');
            for (const [b, chord] of wholeBarChords(t)) {
                if (chord.bass !== chord.root || chord.fifth !== 7) {
                    continue;
                }
                const dyadOn = (step: number, upperPcs: Set<number>) => {
                    const notes = comp.get(b.index)?.get(step);
                    if (notes?.length !== 2) {
                        return null;
                    }
                    const [lo, hi] = [...notes].sort((x, y) => x.midi - y.midi);
                    return mod12(lo.midi) === chord.root && upperPcs.has(mod12(hi.midi));
                };
                const fifthPcs = new Set([mod12(chord.root + fifthOf(chord))]);
                const sixthOrB7 = new Set([9, 10].map((iv) => mod12(chord.root + iv)));
                for (const [step, upperPcs] of [
                    [0, fifthPcs],
                    [8, fifthPcs],
                    [4, sixthOrB7],
                    [12, sixthOrB7],
                ] as const) {
                    const beat = dyadOn(step, upperPcs);
                    if (beat === null) {
                        continue;
                    }
                    n++;
                    hit += beat ? 1 : 0;
                }
            }
        }
        return ratio(hit, n);
    },
    /** Kicks per groove bar that land between the beats (off steps 0, 4, 8 and 12). */
    kickSyncopation: (takes) => {
        let n = 0;
        let off = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                off += [...drumSteps(t, events, b.index, ['kick'])].filter((s) => s % 4).length;
            }
        }
        return ratio(off, n);
    },
    /**
     * A beat is a loop: the share of groove bars whose drum part (every piece and step, but
     * the crash and the cymbal it replaces on the One) is the same as two bars before in the
     * same section visit — a two-bar loop repeats exactly, a groove that re-rolls does not.
     */
    drumLoopRepeat: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const signature = (bar: number) =>
                (
                    events.filter(
                        (e) => e.lane === 'drums' && e.bar === bar && e.piece !== 'crash',
                    ) as DrumHit[]
                )
                    .map((e) => `${e.piece}:${stepOf(t, e)}`)
                    .filter((s) => !/^(hat|hatOpen|ride):0$/.test(s))
                    .sort()
                    .join(',');
            const groove = new Set(grooveBars(t, events).map((b) => b.index));
            for (const index of groove) {
                const b = t.bars[index];
                const before = t.bars[index - 2];
                if (!before || before.visit.ordinal !== b.visit.ordinal || !groove.has(index - 2)) {
                    continue;
                }
                n++;
                hit += signature(index) === signature(index - 2) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Mean written length of the sounding bass notes, in sixteenths. */
    bassMeanSteps: (takes) => {
        let n = 0;
        let sum = 0;
        for (const { events } of takes) {
            for (const e of events) {
                if (e.lane === 'bass' && !e.muted) {
                    n++;
                    sum += e.dur / STEP;
                }
            }
        }
        return ratio(sum, n);
    },
    /** Share of groove bars with the kick on all four beats (four on the floor). */
    kickFourOnFloor: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                const s = drumSteps(t, events, b.index, ['kick']);
                hit += [0, 4, 8, 12].every((x) => s.has(x)) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * Share of groove bars where every "and" is the open hat and none of them a closed one:
     * the disco "tss" on each offbeat eighth (one hand, one cymbal).
     */
    openHatOnAnds: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                const open = drumSteps(t, events, b.index, ['hatOpen']);
                const closed = drumSteps(t, events, b.index, ['hat']);
                hit += [2, 6, 10, 14].every((x) => open.has(x) && !closed.has(x)) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * The octave pump's density: per 4/4 beat with a bass note on it, the share whose "and"
     * sounds exactly an octave *above* that beat's note. Directional, so a pump folded down
     * into an inversion scores as a miss (the old engine's #1271).
     */
    bassOctavePumpPerBeat: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const [bar, steps] of onsetsByBar(t, events, 'bass')) {
                if (t.bars[bar].meter.name !== '4/4') {
                    continue;
                }
                for (const beat of [0, 4, 8, 12]) {
                    const on = steps.get(beat)?.[0];
                    if (!on) {
                        continue;
                    }
                    n++;
                    hit += steps.get(beat + 2)?.[0]?.midi === on.midi + 12 ? 1 : 0;
                }
            }
        }
        return ratio(hit, n);
    },
    /**
     * Share of fill bars (4/4 bars with toms, or a phrase's last bar) whose kick still plays
     * all four beats: `kickFourOnFloor` judges only groove bars, so this is the claim that the
     * floor keeps going *through* the fills.
     */
    kickFourOnFloorInFills: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const groove = new Set(grooveBars(t, events).map((b) => b.index));
            for (const b of t.bars) {
                const drums = events.some((e) => e.lane === 'drums' && e.bar === b.index);
                if (b.meter.name !== '4/4' || !drums || groove.has(b.index) || b.barInVisit === 0) {
                    continue;
                }
                n++;
                const s = drumSteps(t, events, b.index, ['kick']);
                hit += [0, 4, 8, 12].every((x) => s.has(x)) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * Share of groove bars with the backbeat on 2, and on 4 or a sixteenth after it — the
     * neo-soul drag puts the 4 late in some bars, but never drops it.
     */
    snareBackbeatOrLate: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                const s = drumSteps(t, events, b.index, ['snare', 'rim']);
                hit += s.has(4) && (s.has(12) || s.has(13)) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of groove bars whose backbeat on 4 lands a sixteenth late (on 13, nothing on 12). */
    snareLateFour: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of grooveBars(t, events)) {
                n++;
                const s = drumSteps(t, events, b.index, ['snare', 'rim']);
                hit += s.has(13) && !s.has(12) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * Share of sounding comp notes inside the chord scale of the chord they voice: one chord
     * authority, so a colour tone the scale lacks (a natural 9 over a phrygian iii7, a major 6th
     * over an aeolian vi) counts against it. The voiced chord is the one whose guide tones the
     * strike carries — the span's own, the next in the bar, or the next bar's first (an
     * anticipation) — else the span's own. A partial strike (a double-stop) often carries only
     * one guide tone, so within an eighth of a change — where `compIdiom` may play the next
     * chord early — it voices the chord ahead when that chord's scale holds all of it.
     */
    compNotesInScale: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const [tick, notes] of compChords(events)) {
                const bar = t.bars[notes[0].bar];
                const index = bar.spans.findIndex((s) => s.start <= tick && tick < s.end);
                const pcs = new Set(notes.map((x) => mod12(x.midi)));
                const nextBarFirst =
                    t.bars[bar.index + 1]?.spans[0]?.chord ?? t.bars[0].spans[0]?.chord;
                const candidates = [
                    bar.spans[index]?.chord,
                    bar.spans[index + 1]?.chord,
                    nextBarFirst,
                ];
                const change = bar.spans[index + 1]?.start ?? bar.start + bar.meter.barTicks;
                const ahead = bar.spans[index + 1] ? bar.spans[index + 1].chord : nextBarFirst;
                const early =
                    change - tick <= 2 * STEP &&
                    ahead &&
                    [...pcs].every((pc) => ahead.scale.includes(mod12(pc - ahead.root)))
                        ? ahead
                        : null;
                const chord =
                    candidates.find((c) => c?.guides.every((g) => pcs.has(mod12(c.root + g)))) ??
                    early ??
                    candidates[0];
                if (!chord) {
                    continue;
                }
                for (const x of notes) {
                    n++;
                    hit += chord.scale.includes(mod12(x.midi - chord.root)) ? 1 : 0;
                }
            }
        }
        return ratio(hit, n);
    },
    /** Share of sounding comp strikes that are double-stops (exactly two notes). */
    compDoubleStopShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { events } of takes) {
            for (const notes of compChords(events).values()) {
                n++;
                hit += notes.length === 2 ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },

    // ---- the lead
    /** Lead notes per bar, across the takes. */
    leadNotesPerBar: (takes) => {
        let notes = 0;
        let bars = 0;
        for (const { timeline: t, events } of takes) {
            notes += leadNotes(events).length;
            bars += t.bars.length;
        }
        return ratio(notes, bars);
    },
    /** Share of bars the lead leaves empty: the space it breathes in. */
    leadRestShare: (takes) => {
        let empty = 0;
        let bars = 0;
        for (const { timeline: t, events } of takes) {
            const played = new Set(leadNotes(events).map((n) => n.bar));
            empty += t.bars.filter((b) => !played.has(b.index)).length;
            bars += t.bars.length;
        }
        return ratio(empty, bars);
    },
    /** Share of lead notes on a beat that are tones of the chord sounding. */
    leadChordToneOnBeats: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const note of leadNotes(events)) {
                const chord = chordAt(t, note.tick);
                if (stepOf(t, note) % 4 !== 0 || !chord) {
                    continue;
                }
                n++;
                hit += chordPcs(chord).includes(mod12(note.midi)) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of chord-change landings on a guide tone (the 3rd or 7th, a 6 chord's 6th). */
    leadChangeGuideTones: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const { note, chord } of leadLandings(t, events)) {
                n++;
                const pcs = [chord.third, chord.seventh ?? (chord.sixth ? 9 : null)]
                    .filter((i): i is NonNullable<typeof i> => i !== null)
                    .map((i) => mod12(chord.root + i));
                hit += pcs.includes(mod12(note.midi)) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of chord-change landings approached by half step from the note just before. */
    leadChromaticApproach: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const { note, before } of leadLandings(t, events)) {
                if (!before || note.tick - before.tick > STEP * 2) {
                    continue;
                }
                n++;
                hit += Math.abs(note.midi - before.midi) === 1 ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of moves inside a phrase that are steps (a whole step or less). */
    leadStepShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { events } of takes) {
            for (const [a, b] of leadPairs(events)) {
                n++;
                hit += Math.abs(b.midi - a.midi) <= 2 && a.midi !== b.midi ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Mean interval between consecutive notes of a phrase, in semitones. */
    leadMeanInterval: (takes) => {
        let n = 0;
        let sum = 0;
        for (const { events } of takes) {
            for (const [a, b] of leadPairs(events)) {
                n++;
                sum += Math.abs(b.midi - a.midi);
            }
        }
        return ratio(sum, n);
    },
    /** Share of moves inside a phrase wider than a fifth. */
    leadLeapShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { events } of takes) {
            for (const [a, b] of leadPairs(events)) {
                n++;
                hit += Math.abs(b.midi - a.midi) > 7 ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of moves inside a phrase that repeat the same pitch. */
    leadRepeatedNotes: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { events } of takes) {
            for (const [a, b] of leadPairs(events)) {
                n++;
                hit += a.midi === b.midi ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of phrase-ending notes that are tones of their chord. */
    leadPhraseEndsOnChordTone: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const note of phraseEnds(events)) {
                const chord = chordAt(t, note.tick);
                if (!chord) {
                    continue;
                }
                n++;
                hit += chordPcs(chord).includes(mod12(note.midi)) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of lead notes an eighth or shorter: how much of the playing is running lines. */
    leadShortShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { events } of takes) {
            for (const note of leadNotes(events)) {
                n++;
                hit += note.dur <= STEP * 2 ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of lead notes bent or scooped into from below. */
    leadBendShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { events } of takes) {
            for (const note of leadNotes(events)) {
                n++;
                hit += note.bendIn ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Mean span of each take's lead, lowest to highest note (semitones). */
    leadRange: (takes) => {
        let n = 0;
        let sum = 0;
        for (const { events } of takes) {
            const midis = leadNotes(events).map((e) => e.midi);
            if (midis.length) {
                n++;
                sum += Math.max(...midis) - Math.min(...midis);
            }
        }
        return ratio(sum, n);
    },
} satisfies Record<string, Metric>;

// ---------------------------------------------------------------- claims
/** How a take is performed: the comp instrument, a fixed energy, whether the bass plays. */
export interface TakeSpec {
    comp?: CompInstrument;
    intensity?: number;
    bass?: boolean;
    /** Judge the lead: its head (the first pass) or its solo choruses (passes 1–3). */
    lead?: 'head' | 'solo';
}

type MetricName = keyof typeof METRICS;

/** [metric, min, max, the musical claim it measures]. */
export type Claim<M extends string = MetricName> = [
    metric: M,
    min: number,
    max: number,
    why: string,
];

export interface StyleClaims {
    /** Metrics only this style needs, beside the shared library. */
    metrics: Record<string, Metric>;
    takes: { take: TakeSpec; claims: Claim<string>[] }[];
}

/**
 * A style's claims, typed so every metric named is either in the shared library or one the
 * style defines itself.
 */
export function defineClaims<M extends Record<string, Metric> = Record<never, Metric>>(spec: {
    metrics?: M;
    takes: { take: TakeSpec; claims: Claim<MetricName | (keyof M & string)>[] }[];
}): StyleClaims {
    return { metrics: spec.metrics ?? {}, takes: spec.takes };
}
