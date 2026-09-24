/**
 * The critique: each style's musical claims, as numbers over whole performances. One
 * runner, one metric library, one table of claims per style — this replaces the old
 * engine's per-file `simulatePerformance` harnesses. Ranges are statistical (they hold
 * across seeds and charts), never snapshots. A failing claim prints the measured value.
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
} from '../core/types.js';
import { chordAt, compileTimeline, type Timeline } from '../form/timeline.js';
import { type PassMemory, performPass } from '../perform.js';
import { STEP } from '../players/grid.js';
import { chordPcs, fifthOf } from '../theory/chord.js';
import { mod12 } from '../theory/pitch.js';
import { FIXTURES } from './scores.js';

const CHARTS = ['blues', 'rhythmChanges', 'popSong', 'minorFunk', 'bossa', 'romanNumerals'];
const SEEDS = ['one', 'two', 'three', 'four'];

interface Take {
    timeline: Timeline;
    events: BandEvent[];
}

function perform(
    style: StyleId,
    intensity: number | null = null,
    comp: CompInstrument = 'piano',
    bass = true,
): Take[] {
    const takes: Take[] = [];
    const lanes = { ...DEFAULT_SETTINGS.lanes, bass };
    for (const chart of CHARTS) {
        const timeline = compileTimeline(FIXTURES[chart]);
        for (const seed of SEEDS) {
            let memory: PassMemory | undefined;
            for (let pass = 0; pass < 2; pass++) {
                const settings = { ...DEFAULT_SETTINGS, style, comp, seed, swing: 0, intensity };
                settings.lanes = lanes;
                const result = performPass(timeline, settings, { pass, looping: true, memory });
                memory = result.memory;
                takes.push({ timeline, events: result.events });
            }
        }
    }
    return takes;
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

type Metric = (takes: Take[]) => number;

const METRICS: Record<string, Metric> = {
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
};

// ---------------------------------------------------------------- the claims
type Claim = [metric: keyof typeof METRICS, min: number, max: number, why: string];

const CLAIMS: Record<StyleId, Claim[]> = {
    rock: [
        ['snareBackbeat', 0.9, 1, 'the backbeat is the song'],
        ['kickOnOne', 0.95, 1, 'the kick owns the one'],
        ['kickConsistency', 0.75, 1, 'a section keeps its groove; it does not re-roll every bar'],
        ['bassArrivesOnBass', 0.9, 1, 'rock bass states the root (or slash note) on every change'],
        ['bassNotesPerBeat', 1.2, 2.2, 'driving eighths at normal energy'],
        ['bassSixteenthSyncopation', 0, 0.05, 'no sixteenth syncopation in a rock bass'],
        ['compOffbeatShare', 0, 0.35, 'the comp sits on the beat'],
        ['compColour', 0, 0.15, 'triads and sevenths, not jazz extensions'],
    ],
    jazz: [
        ['rideOnBeats', 0.9, 1, 'the ride carries the time on every beat'],
        ['hatPedal24', 0.9, 1, 'hi-hat foot on 2 and 4'],
        ['bassNotesPerBeat', 0.85, 1.05, 'a walking line: one note per beat'],
        ['bassArrivesOnBass', 0.75, 1, 'the walk lands on the chord (a 3rd now and then)'],
        ['bassChromaticApproach', 0.3, 0.8, 'half-step approaches lead into changes'],
        ['bassRepeatedNotes', 0, 0.02, 'the walk keeps moving: no repeated pitches'],
        ['bassMeanLeap', 1.5, 4.5, 'mostly stepwise, not arpeggio leaps'],
        ['compOffbeatShare', 0.4, 1, 'comping pushes on the "and"s'],
        ['compColour', 0.6, 1, 'rootless voicings carry 9ths and 13ths'],
        ['compTopVoiceMotion', 0, 3.5, 'smooth voice leading'],
    ],
    funk: [
        ['snareBackbeat', 0.9, 1, 'the backbeat is hit hard'],
        ['kickOnOne', 0.95, 1, 'on the One'],
        ['ghostsPerBar', 1, 5, 'ghost notes around the backbeat'],
        ['kickConsistency', 0.75, 1, 'the groove repeats'],
        ['bassSixteenthSyncopation', 0.1, 0.6, 'sixteenth-note syncopation in the bass'],
        ['bassKickUnison', 0.35, 1, 'bass and kick lock together'],
        ['compOffbeatShare', 0.6, 1, 'stabs live off the beat'],
        ['compShort', 0.9, 1, 'stabs are short'],
    ],
    bossa: [
        ['claveRim', 0.9, 1, 'the cross-stick plays the bossa clave'],
        ['kickOnOne', 0.95, 1, 'the surdo on one'],
        ['bassKickUnison', 0.7, 1, 'the bass doubles the surdo rhythm'],
        ['bassArrivesOnBass', 0.9, 1, 'root on the arrival'],
        ['compColour', 0.5, 1, 'ninths on the comp'],
        ['compTopVoiceMotion', 0, 3.5, 'smooth voice leading'],
    ],
    reggae: [
        ['dropOnThree', 0.9, 1, 'kick and cross-stick land together on 3 in every riddim'],
        ['kickOnOne', 0, 0.35, 'the One is a hole: only the high-energy riddims fill it'],
        ['bassOnOne', 0.15, 0.75, 'the bass leaves the One open as often as it plays it'],
        ['bassMeanPitch', 32, 42, 'a heavy line in the lowest octave'],
        ['bassSilence', 0.2, 0.6, 'melodic, with space: the rests are part of the line'],
        ['bassArrivesOnBass', 0.9, 1, 'a chord that gets a note on its arrival gets its root'],
        ['compOnOneAndThree', 0, 0.05, 'the skank leaves 1 and 3 to the bass and the drop'],
        ['compShort', 0.9, 1, 'the skank is a chop, damped at once'],
        ['compColour', 0, 0.15, 'triads and sevenths, no extensions'],
    ],
    blues: [
        ['snareBackbeat', 0.95, 1, 'the backbeat on 2 and 4, every bar'],
        ['kickOnOneAndThree', 0.95, 1, 'the kick grounds 1 and 3'],
        ['cymbalEighths', 0.9, 1, 'the shuffle: the cymbal on every eighth, never a sixteenth'],
        ['kickConsistency', 0.75, 1, 'a section keeps its shuffle'],
        ['bassArrivesOnBass', 0.8, 1, 'the box starts on the root (a 2nd bar turns from the b7)'],
        ['bassSixthOnDominants', 0.15, 0.35, 'the boogie box rocks through the 6th'],
        [
            'bassLopeRepeatsBeat',
            0.95,
            1,
            'the lope re-strikes the beat; it never moves on the "and"',
        ],
        [
            'bassChromaticApproach',
            0.15,
            0.4,
            'a change resolves by a half step in pitch, not just pitch class (B1)',
        ],
        ['compColour', 0.5, 1, 'rootless 9ths and 13ths over the dominants'],
        ['compOffbeatShare', 0.3, 0.8, 'stabs and pushes on the "and"s'],
        ['compTopVoiceMotion', 0, 3.5, 'smooth voice leading'],
    ],
    country: [
        ['snareBackbeat', 0.9, 1, 'the chick on 2 and 4 (snare, or cross-stick when quiet)'],
        ['kickOnOne', 0.95, 1, 'the boom on the One'],
        ['ghostsPerBar', 1, 5, 'train-beat sections keep the snare going between backbeats'],
        ['bassRootFifth', 0.9, 1, 'boom-chick bass: the root on 1, the fifth on 3'],
        ['bassWalkUps', 0.2, 0.6, 'walk-ups step into the new root at many changes'],
        ['bassArrivesOnBass', 0.95, 1, 'every change arrives on its bass note'],
        ['bassNotesPerBeat', 0.5, 0.75, 'two booms a bar, plus walks'],
        ['compBackbeatShare', 0.6, 1, 'the piano answers the boom on 2 and 4'],
        ['compColour', 0, 0.1, 'triads and sixths, not jazz ninths'],
    ],
    hiphop: [
        ['snareBackbeat', 0.95, 1, 'a hard snare on 2 and 4, every bar'],
        ['kickOnOne', 0.95, 1, 'the kick owns the One'],
        ['kickSyncopation', 1, 2.75, 'boom-bap: kicks between the beats, never a busy double time'],
        ['drumLoopRepeat', 0.9, 1, 'a beat is a loop: bars in a section repeat'],
        ['bassKickUnison', 0.75, 1, 'the sub is struck with the kick'],
        ['bassMeanPitch', 30, 38, 'a sub line in the lowest octave'],
        ['bassMeanSteps', 3, 16, 'long sub notes, held to the next kick'],
        ['bassArrivesOnBass', 0.95, 1, 'every change arrives on its root (or slash note)'],
        ['compColour', 0.6, 1, 'the sampled-jazz Rhodes: 9ths and 13ths'],
        ['compStrikesPerBar', 1, 3, 'a sparse loop: a chord or two a bar, never a pulse'],
    ],
    disco: [
        ['kickFourOnFloor', 0.98, 1, 'four on the floor: the kick on every beat, every bar'],
        ['kickFourOnFloorInFills', 0.98, 1, 'the floor keeps dancing through every fill'],
        ['snareBackbeat', 0.95, 1, 'the snare cracks 2 and 4'],
        ['openHatOnAnds', 0.85, 1, 'the open hat barks every "and" (only a quiet band closes it)'],
        ['bassArrivesOnBass', 0.95, 1, 'every chord arrives on its root, or its slash note'],
        [
            'bassOctavePumpPerBeat',
            0.5,
            0.9,
            'the pump: the octave pops on the "and" above the beat',
        ],
        [
            'bassChromaticApproach',
            0.25,
            0.6,
            'passing tones lead into many changes by a half step in pitch',
        ],
        ['bassMeanPitch', 34, 42, 'the root down low, its octave on the neck above it'],
        ['compOffbeatShare', 0.9, 1, 'the stabs live on the "and"s and the sixteenths around them'],
        ['compOnOneAndThree', 0, 0.05, "the stabs leave the kick's beats alone"],
        ['compShort', 0.85, 1, 'a stab is a sixteenth, damped at once'],
        ['compColour', 0.6, 1, 'lush 9ths (and 6/9s) on the Rhodes stabs from mid energy'],
    ],
};

// A second take at low energy, for the styles whose feel actually changes there — a walk
// relaxing into a two-feel (jazz, blues), a quiet one drop, a ballad two-beat (country).
const LOW_CLAIMS: Partial<Record<StyleId, Claim[]>> = {
    reggae: [
        ['kickOnOne', 0, 0.02, 'a quiet one drop never kicks the One'],
        ['dropOnThree', 0.9, 1, 'the drop stays, softer'],
    ],
    jazz: [
        ['bassNotesPerBeat', 0.45, 0.75, 'two-feel: half notes, with an occasional approach on 4'],
        [
            'bassHeldNotesAreChordTones',
            0.97,
            1,
            'a held half note is a chord tone, never a passing tone',
        ],
    ],
    blues: [
        ['bassNotesPerBeat', 0.45, 0.75, 'two-feel: root and fifth, an approach on 4 now and then'],
        ['bassRepeatedNotes', 0, 0.05, 'no lope at low energy'],
    ],
    country: [
        // T11: the old bracket just pinned the constructed 0.5 of two half notes a bar — a
        // regression guard on the ballad's note count, kept honest as that (not as "no walks":
        // the real claim for that is `bassWalkUps` below, which the tier gate keeps at exactly
        // 0 by construction — a walk needs a beat-3/4 pair that low energy never writes).
        ['bassNotesPerBeat', 0.45, 0.55, 'regression guard: two half notes a bar, nothing else'],
        ['bassWalkUps', 0, 0, 'the ballad two-beat: the energy gate keeps walk-ups out'],
    ],
    disco: [
        ['kickFourOnFloor', 0.98, 1, 'the kick never stops, only softens'],
        ['openHatOnAnds', 0, 0.02, 'a quiet band keeps the hat closed'],
        [
            'bassOctavePumpPerBeat',
            0,
            0.2,
            'quarter-note roots: the pump waits for the band to build',
        ],
        ['compColour', 0, 0.1, 'plain triads and sevenths when quiet, the 9ths come later'],
    ],
};

/**
 * The same styles with a guitar on the comp: the harmony stays the style's, the hand is the
 * guitarist's. Bossa is heard on its own nylon; the rest on a picked electric.
 */
const GUITAR_CLAIMS: Record<StyleId, Claim[]> = {
    rock: [
        ['compUpstrokeShare', 0.1, 0.5, 'the strumming hand swings: some strokes come up'],
        ['compColour', 0, 0.15, 'open triads and sevenths, not jazz extensions'],
    ],
    jazz: [
        ['compOffbeatShare', 0, 0.2, 'four to the bar: the guitar marks the beats'],
        ['compLongShort', 1.5, 3, 'long-short: 1 and 3 held a little, 2 and 4 crisp'],
        ['compStrikesPerBar', 3, 4.2, 'one stroke per beat'],
        ['compRootLowest', 0.8, 1, 'the root on the bottom string, doubling the walking bass'],
        ['compMeanLowest', 40, 52, 'the chunk sits low (roots on the 6th and 5th strings)'],
    ],
    funk: [
        ['compScratchShare', 0.3, 0.8, 'the hand never stops: scratches between the stabs'],
        ['compStrikesPerBar', 8, 16, 'a sixteenth-note hand'],
        ['compOffbeatShare', 0.6, 1, 'the stabs live off the beat'],
        ['compColour', 0.5, 1, 'the 3-7-9 grip where a seventh chord allows'],
        ['compShort', 0.9, 1, 'a chank is staccato: the hand lets go at once'],
    ],
    bossa: [
        ['compColour', 0.5, 1, 'ninths in the grips'],
        ['compTopVoiceMotion', 0, 3.5, 'the grips move by step, not by leap'],
    ],
    reggae: [
        ['compOnOneAndThree', 0, 0.05, 'the skank never chops on 1 or 3'],
        ['compShort', 0.9, 1, 'the fretting hand damps the chop at once'],
        ['compMeanLowest', 55, 67, 'a small grip on the top strings, far above the bass'],
        ['compStrikesPerBar', 1.8, 4.5, 'two chops a bar, doubled or on every "and" when it lifts'],
        ['compColour', 0, 0.15, 'triads and sevenths, no extensions'],
    ],
    blues: [
        ['compOnBackbeat', 0.5, 0.9, 'the chop sits on 2 and 4 with the snare'],
        ['compColour', 0, 0.2, "plain 7th and 6th grips, not the piano's 9ths and 13ths"],
    ],
    country: [
        ['compBackbeatShare', 0.6, 1, 'the chick: strums on 2 and 4'],
        ['compMeanLowest', 50, 56, 'open-position grips on the top four strings, off the bass'],
        ['compColour', 0, 0.1, 'open triads, not jazz extensions'],
    ],
    hiphop: [
        ['compStrikesPerBar', 1, 3.5, 'minimal: a couple of damped hits a bar, rarely strummed'],
        ['compShort', 0.9, 1, 'every hit is damped at once, never let ring'],
        ['compColour', 0.5, 1, 'the jazzy 3-7-9 grip where a seventh chord allows'],
        ['compMeanLowest', 55, 67, 'a small grip on the top strings, far above the sub'],
    ],
    disco: [
        ['compScratchShare', 0.6, 0.85, 'mostly muted scratches, the chord only where it chops'],
        ['compStrikesPerBar', 14, 16, 'the hand never stops: a stroke on nearly every sixteenth'],
        ['compOffbeatShare', 0.9, 1, 'the chops land off the beat; the beat is scratched'],
        ['compMeanLowest', 60, 68, "small grips high on the neck, above funk's (~57)"],
        [
            'compUpstrokeShare',
            0.03,
            0.2,
            'a sixteenth pendulum: chops come down, only the light pickups come up',
        ],
    ],
};

/**
 * The organ: reggae's bubble is its own idiom, chopped rather than held. Blues checks the
 * opposite claim — that with `prefers: 'piano'` (I1), the organ still plays, but as a held
 * pad that drops the shuffle piano's struck figure, rather than pumping it.
 */
const ORGAN_CLAIMS: Partial<Record<StyleId, Claim[]>> = {
    reggae: [
        // Was [0.95, 1]: a tautology once the 2-and-4 chop (T1) is deliberately ON the beat.
        // The bubble itself is still almost entirely offbeat; the chop is the one exception,
        // so this drops but stays high, and a regression either way (an on-beat bubble, or a
        // missing chop pushing it back toward 1) would fail it.
        [
            'compOffbeatShare',
            0.75,
            0.95,
            'the bubble lives between the beats; the 2-and-4 chop is its one exception',
        ],
        ['compShort', 0.9, 1, 'the bubble is chopped, never held'],
        // Replaces the old compStrikesPerBar range (a tautology: it just restated the count
        // the code already produced, and would have failed the correct e-&-a bubble anyway).
        ['compOnOneAndThree', 0, 0.05, 'nothing on 1 and 3, same as the skank'],
    ],
    blues: [
        [
            'compStrikesPerBar',
            1,
            1.6,
            'a held pad strikes only on a chord change or push, not the shuffle figure',
        ],
    ],
};

describe.each(Object.keys(ORGAN_CLAIMS) as StyleId[])('%s critique on organ', (style) => {
    const takes = perform(style, null, 'organ');
    it.each(ORGAN_CLAIMS[style] ?? [])('%s in [%d, %d] — %s', (metric, min, max) => {
        const value = METRICS[metric](takes);
        expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeGreaterThanOrEqual(min);
        expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeLessThanOrEqual(max);
    });
});

/**
 * The organ bubble's own cell, checked at mid energy specifically: low energy drops the e/a
 * touches on purpose (a quiet band plays only the "and"), and a blended default take mixes
 * tiers, so neither shows whether the e-&-a motion is really there (T9).
 */
const ORGAN_MID_CLAIMS: Partial<Record<StyleId, Claim[]>> = {
    reggae: [
        ['compEAndAMotion', 0.95, 1, 'every beat gets the full e-&-a cell: felt, chord, felt'],
    ],
};

describe.each(Object.keys(ORGAN_MID_CLAIMS) as StyleId[])(
    '%s critique on organ at mid energy',
    (style) => {
        const takes = perform(style, 0.6, 'organ');
        it.each(ORGAN_MID_CLAIMS[style] ?? [])('%s in [%d, %d] — %s', (metric, min, max) => {
            const value = METRICS[metric](takes);
            expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeGreaterThanOrEqual(min);
            expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeLessThanOrEqual(max);
        });
    },
);

/** Quiet sections, where nothing (no scratch, no busy pattern) hides how a stab is played. */
const GUITAR_LOW_CLAIMS: Partial<Record<StyleId, Claim[]>> = {
    funk: [['compShort', 0.9, 1, 'stabs stay staccato with no scratch between them']],
    jazz: [['compRootLowest', 0.8, 1, 'the sparse comp keeps the root on the bottom']],
    blues: [['compShort', 0.9, 1, 'the chop on 2 and 4 is damped at once, never let ring']],
};

/** With the bass lane off: the guitarist is the band's bottom. */
const GUITAR_ALONE_CLAIMS: Partial<Record<StyleId, Claim[]>> = {
    country: [
        ['compBoomChick', 0.9, 1, 'bass-strum: the pick plays root on 1, fifth on 3, down low'],
        ['compBackbeatShare', 0.6, 1, 'and strums the chick on 2 and 4'],
        // I3: with no bassist the pick is the only voice left to play the walk-up (measured
        // ~0.21 — lower than the bass's own ~0.3, since the guitar has no "new section"
        // probability bump and the low-register read can miss a walk note that climbs near 52).
        ['compWalkUps', 0.15, 0.45, 'walks lead into at least some changes when there is no bass'],
    ],
    blues: [
        [
            'compBoogieDyads',
            0.8,
            1,
            'Jimmy Reed: root under the 5th on 1 and 3, the 6th (or b7) on 2 and 4',
        ],
    ],
};

describe.each(Object.keys(GUITAR_ALONE_CLAIMS) as StyleId[])(
    '%s critique on guitar without a bass',
    (style) => {
        const takes = perform(style, null, 'guitar', false);
        it.each(GUITAR_ALONE_CLAIMS[style] ?? [])('%s in [%d, %d] — %s', (metric, min, max) => {
            const value = METRICS[metric](takes);
            expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeGreaterThanOrEqual(min);
            expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeLessThanOrEqual(max);
        });
    },
);

describe.each(Object.keys(GUITAR_LOW_CLAIMS) as StyleId[])(
    '%s critique on guitar at low energy',
    (style) => {
        const takes = perform(style, 0.2, 'guitar');
        it.each(GUITAR_LOW_CLAIMS[style] ?? [])('%s in [%d, %d] — %s', (metric, min, max) => {
            const value = METRICS[metric](takes);
            expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeGreaterThanOrEqual(min);
            expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeLessThanOrEqual(max);
        });
    },
);

/**
 * High energy, where the "ands" skank can get picked. Pins B5: a lift used to turn the 2-and-4
 * chop into the quiet stroke (every hit lowercase, ~78 against the plain skank's 108) and drop
 * it off the backbeat entirely. The chop must stay the loudest hit in the bar and never miss it.
 */
const GUITAR_HIGH_CLAIMS: Partial<Record<StyleId, Claim[]>> = {
    reggae: [
        // Bracketed near the real ~1.22 rather than left slack down to 1: the "ands" skank is
        // only 2 of 5 weight at high tier, so a regression that quiets just its own 2-and-4
        // chop is diluted by the still-correct plain/double bars and would slip past a claim
        // that only demanded "at least as loud" (>= 1).
        [
            'compBackbeatVelocityRatio',
            1.15,
            1.4,
            '2 and 4 are louder than the rest of the hand, not just tied with it',
        ],
        ['compBackbeat24Coverage', 0.9, 1, '2 and 4 are chopped in nearly every bar'],
    ],
};

describe.each(Object.keys(GUITAR_HIGH_CLAIMS) as StyleId[])(
    '%s critique on guitar at high energy',
    (style) => {
        const takes = perform(style, 0.9, 'guitar');
        it.each(GUITAR_HIGH_CLAIMS[style] ?? [])('%s in [%d, %d] — %s', (metric, min, max) => {
            const value = METRICS[metric](takes);
            expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeGreaterThanOrEqual(min);
            expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeLessThanOrEqual(max);
        });
    },
);

describe.each(Object.keys(GUITAR_CLAIMS) as StyleId[])('%s critique on guitar', (style) => {
    const takes = perform(style, null, style === 'bossa' ? 'nylon' : 'guitar');
    const report: string[] = [];
    it.each(GUITAR_CLAIMS[style])('%s in [%d, %d] — %s', (metric, min, max) => {
        const value = METRICS[metric](takes);
        report.push(`${metric.padEnd(26)} ${value.toFixed(3)}  [${min}, ${max}]`);
        expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeGreaterThanOrEqual(min);
        expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeLessThanOrEqual(max);
    });
    afterAll(() => {
        console.log(`\n${style} on guitar\n  ${report.join('\n  ')}`);
    });
});

describe.each(Object.keys(LOW_CLAIMS) as StyleId[])('%s critique at low energy', (style) => {
    const takes = perform(style, 0.2);
    it.each(LOW_CLAIMS[style] ?? [])('%s in [%d, %d] — %s', (metric, min, max) => {
        const value = METRICS[metric](takes);
        expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeGreaterThanOrEqual(min);
        expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeLessThanOrEqual(max);
    });
});

describe.each(Object.keys(CLAIMS) as StyleId[])('%s critique', (style) => {
    const takes = perform(style);
    const report: string[] = [];
    it.each(CLAIMS[style])('%s in [%d, %d] — %s', (metric, min, max) => {
        const value = METRICS[metric](takes);
        report.push(`${metric.padEnd(26)} ${value.toFixed(3)}  [${min}, ${max}]`);
        expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeGreaterThanOrEqual(min);
        expect(value, `${style} ${metric} = ${value.toFixed(3)}`).toBeLessThanOrEqual(max);
    });
    afterAll(() => {
        console.log(`\n${style} critique\n  ${report.join('\n  ')}`);
    });
});
