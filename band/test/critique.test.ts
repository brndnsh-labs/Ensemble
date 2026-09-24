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
): Take[] {
    const takes: Take[] = [];
    for (const chart of CHARTS) {
        const timeline = compileTimeline(FIXTURES[chart]);
        for (const seed of SEEDS) {
            let memory: PassMemory | undefined;
            for (let pass = 0; pass < 2; pass++) {
                const settings = { ...DEFAULT_SETTINGS, style, comp, seed, swing: 0, intensity };
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
    /** Of the bass notes under dominant 7th chords, the share on the major 6th (the boogie's). */
    bassSixthOnDominants: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const e of events) {
                if (e.lane !== 'bass' || e.muted) {
                    continue;
                }
                const chord = chordAt(t, e.tick);
                if (chord?.family !== 'dominant' || chord.seventh !== 10) {
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
    blues: [
        ['snareBackbeat', 0.95, 1, 'the backbeat on 2 and 4, every bar'],
        ['kickOnOneAndThree', 0.95, 1, 'the kick grounds 1 and 3'],
        ['cymbalEighths', 0.9, 1, 'the shuffle: the cymbal on every eighth, never a sixteenth'],
        ['kickConsistency', 0.75, 1, 'a section keeps its shuffle'],
        ['bassArrivesOnBass', 0.8, 1, 'the box starts on the root (a 2nd bar turns from the b7)'],
        ['bassSixthOnDominants', 0.1, 0.35, 'the boogie box rocks through the 6th'],
        [
            'bassRepeatedNotes',
            0.1,
            0.5,
            'the lope re-strikes the beat; it never moves on the "and"',
        ],
        ['compColour', 0.5, 1, 'rootless 9ths and 13ths over the dominants'],
        ['compOffbeatShare', 0.3, 0.8, 'stabs and pushes on the "and"s'],
        ['compTopVoiceMotion', 0, 3.5, 'smooth voice leading'],
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
    blues: [
        ['bassNotesPerBeat', 0.45, 0.75, 'two-feel: root and fifth, an approach on 4 now and then'],
        ['bassRepeatedNotes', 0, 0.05, 'no lope at low energy'],
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
    blues: [
        ['compOnBackbeat', 0.5, 0.9, 'the chop sits on 2 and 4 with the snare'],
        ['compColour', 0, 0.2, "plain 7th and 6th grips, not the piano's 9ths and 13ths"],
    ],
};

/** Quiet sections, where nothing (no scratch, no busy pattern) hides how a stab is played. */
const GUITAR_LOW_CLAIMS: Partial<Record<StyleId, Claim[]>> = {
    funk: [['compShort', 0.9, 1, 'stabs stay staccato with no scratch between them']],
    jazz: [['compRootLowest', 0.8, 1, 'the sparse comp keeps the root on the bottom']],
    blues: [['compShort', 0.9, 1, 'the chop on 2 and 4 is damped at once, never let ring']],
};

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
