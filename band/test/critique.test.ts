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
    DEFAULT_SETTINGS,
    type DrumHit,
    type PitchedNote,
    type StyleId,
} from '../core/types.js';
import { compileTimeline, type Timeline } from '../form/timeline.js';
import { type PassMemory, performPass } from '../perform.js';
import { STEP } from '../players/grid.js';
import { mod12 } from '../theory/pitch.js';
import { FIXTURES } from './scores.js';

const CHARTS = ['blues', 'rhythmChanges', 'popSong', 'minorFunk', 'bossa', 'romanNumerals'];
const SEEDS = ['one', 'two', 'three', 'four'];

interface Take {
    timeline: Timeline;
    events: BandEvent[];
}

function perform(style: StyleId, intensity: number | null = null): Take[] {
    const takes: Take[] = [];
    for (const chart of CHARTS) {
        const timeline = compileTimeline(FIXTURES[chart]);
        for (const seed of SEEDS) {
            let memory: PassMemory | undefined;
            for (let pass = 0; pass < 2; pass++) {
                const settings = { ...DEFAULT_SETTINGS, style, seed, swing: 0, intensity };
                const result = performPass(timeline, settings, { pass, looping: true, memory });
                memory = result.memory;
                takes.push({ timeline, events: result.events });
            }
        }
    }
    return takes;
}

// ---------------------------------------------------------------- metric library
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
    bassNotesPerBeat: (takes) => {
        let notes = 0;
        let beats = 0;
        for (const { timeline: t, events } of takes) {
            beats += t.bars.reduce((sum, b) => sum + b.meter.barTicks / 480, 0);
            notes += events.filter((e) => e.lane === 'bass' && !(e as PitchedNote).muted).length;
        }
        return ratio(notes, beats);
    },
    /** Of the notes one beat before a chord change, the share a half step from the arrival. */
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
    keysOffbeatShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const onsets = new Set(
                events.filter((e) => e.lane === 'keys').map((e) => `${e.bar}:${stepOf(t, e)}`),
            );
            for (const o of onsets) {
                n++;
                hit += Number(o.split(':')[1]) % 4 !== 0 ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Mean movement of the top voice between consecutive keys chords, in semitones. */
    keysTopVoiceMotion: (takes) => {
        let n = 0;
        let sum = 0;
        for (const { events } of takes) {
            const tops = new Map<number, number>();
            for (const e of events) {
                if (e.lane === 'keys') {
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
    /** Share of keys chords no longer than an eighth note. */
    keysShort: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { events } of takes) {
            const seen = new Set<number>();
            for (const e of events) {
                if (e.lane === 'keys' && !seen.has(e.tick)) {
                    seen.add(e.tick);
                    n++;
                    hit += e.dur <= 240 ? 1 : 0;
                }
            }
        }
        return ratio(hit, n);
    },
    /** Share of keys chords that carry a colour tone (9th or 13th above the root). */
    keysColour: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const clusters = new Map<number, PitchedNote[]>();
            for (const e of events) {
                if (e.lane === 'keys') {
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
        ['keysOffbeatShare', 0, 0.35, 'keys sit on the beat'],
        ['keysColour', 0, 0.15, 'triads and sevenths, not jazz extensions'],
    ],
    jazz: [
        ['rideOnBeats', 0.9, 1, 'the ride carries the time on every beat'],
        ['hatPedal24', 0.9, 1, 'hi-hat foot on 2 and 4'],
        ['bassNotesPerBeat', 0.85, 1.05, 'a walking line: one note per beat'],
        ['bassArrivesOnBass', 0.75, 1, 'the walk lands on the chord (a 3rd now and then)'],
        ['bassChromaticApproach', 0.3, 0.8, 'half-step approaches lead into changes'],
        ['bassRepeatedNotes', 0, 0.02, 'the walk keeps moving: no repeated pitches'],
        ['bassMeanLeap', 1.5, 4.5, 'mostly stepwise, not arpeggio leaps'],
        ['keysOffbeatShare', 0.4, 1, 'comping pushes on the "and"s'],
        ['keysColour', 0.6, 1, 'rootless voicings carry 9ths and 13ths'],
        ['keysTopVoiceMotion', 0, 3.5, 'smooth voice leading'],
    ],
    funk: [
        ['snareBackbeat', 0.9, 1, 'the backbeat is hit hard'],
        ['kickOnOne', 0.95, 1, 'on the One'],
        ['ghostsPerBar', 1, 5, 'ghost notes around the backbeat'],
        ['kickConsistency', 0.75, 1, 'the groove repeats'],
        ['bassSixteenthSyncopation', 0.1, 0.6, 'sixteenth-note syncopation in the bass'],
        ['bassKickUnison', 0.35, 1, 'bass and kick lock together'],
        ['keysOffbeatShare', 0.6, 1, 'stabs live off the beat'],
        ['keysShort', 0.9, 1, 'stabs are short'],
    ],
    bossa: [
        ['claveRim', 0.9, 1, 'the cross-stick plays the bossa clave'],
        ['kickOnOne', 0.95, 1, 'the surdo on one'],
        ['bassKickUnison', 0.7, 1, 'the bass doubles the surdo rhythm'],
        ['bassArrivesOnBass', 0.9, 1, 'root on the arrival'],
        ['keysColour', 0.5, 1, 'ninths on the comp'],
        ['keysTopVoiceMotion', 0, 3.5, 'smooth voice leading'],
    ],
};

// A second jazz take at low energy, where the walk relaxes into a two-feel.
const LOW_CLAIMS: Partial<Record<StyleId, Claim[]>> = {
    jazz: [
        ['bassNotesPerBeat', 0.45, 0.75, 'two-feel: half notes, with an occasional approach on 4'],
        [
            'bassHeldNotesAreChordTones',
            0.97,
            1,
            'a held half note is a chord tone, never a passing tone',
        ],
    ],
};

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
