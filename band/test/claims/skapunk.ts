// cspell:ignore skapunk
/**
 * Ska-Punk's claims. The genre is a switch — ska verses, punk choruses — so most metrics here
 * judge one side of it, split by the section's *label* (a chorus is punk by the genre's own
 * definition) or by a take's fixed energy (a driving band goes punk everywhere). The style's
 * own switch is never consulted: a metric that asked `modeOf` would only restate the code.
 */
import type { BandEvent, DrumHit, PitchedNote } from '../../core/types.js';
import type { Bar, Timeline } from '../../form/timeline.js';
import { STEP } from '../../players/grid.js';
import { mod12 } from '../../theory/pitch.js';
import { defineClaims, type Take } from '../critique/harness.js';

const CHORUS = /^(chorus|hook|refrain)/i;
const isChorus = (b: Bar) => CHORUS.test(b.visit.label.trim());
const stepOf = (t: Timeline, e: BandEvent) => Math.round((e.tick - t.bars[e.bar].start) / STEP);
const ratio = (hits: number, total: number) => (total ? hits / total : 0);
type Side = 'verse' | 'chorus';
const onSide = (b: Bar, side: Side) =>
    b.meter.name === '4/4' && isChorus(b) === (side === 'chorus');

/** Sounding comp strikes (one per onset) in 4/4 bars on one side of the switch. */
function strikes(takes: Take[], side: Side): { t: Timeline; notes: PitchedNote[] }[] {
    const out: { t: Timeline; notes: PitchedNote[] }[] = [];
    for (const { timeline: t, events } of takes) {
        const byTick = new Map<number, PitchedNote[]>();
        for (const e of events) {
            if (e.lane === 'comp' && !e.muted && onSide(t.bars[e.bar], side)) {
                byTick.set(e.tick, [...(byTick.get(e.tick) ?? []), e]);
            }
        }
        for (const notes of byTick.values()) {
            out.push({ t, notes });
        }
    }
    return out;
}

/** Groove bars on one side: 4/4, not a section's first bar (crash) or a phrase's last (fill). */
function grooveBars(takes: Take[], side: Side) {
    const out: { t: Timeline; bar: Bar; drums: DrumHit[] }[] = [];
    for (const { timeline: t, events } of takes) {
        for (const bar of t.bars) {
            if (
                !onSide(bar, side) ||
                bar.barInVisit === 0 ||
                bar.phrase.bar === bar.phrase.length - 1
            ) {
                continue;
            }
            const drums = events.filter(
                (e): e is DrumHit => e.lane === 'drums' && e.bar === bar.index,
            );
            if (drums.length) {
                out.push({ t, bar, drums });
            }
        }
    }
    return out;
}

const pieceSteps = (t: Timeline, drums: DrumHit[], pieces: string[]) =>
    new Set(drums.filter((d) => pieces.includes(d.piece)).map((d) => stepOf(t, d)));

/** Bass notes in 4/4 bars on one side, in order, per take. */
function bassLines(takes: Take[], side: Side) {
    return takes.map(({ timeline: t, events }) => ({
        t,
        notes: events.filter(
            (e): e is PitchedNote => e.lane === 'bass' && !e.muted && onSide(t.bars[e.bar], side),
        ),
    }));
}

const onBeatShare = (takes: Take[], side: Side, beat: (step: number) => boolean) => {
    const all = strikes(takes, side);
    return ratio(all.filter(({ t, notes }) => beat(stepOf(t, notes[0]))).length, all.length);
};

const metrics = {
    /** Share of the verses' comp strikes on an "and" (the skank's only place). */
    verseCompOnAnds: (takes: Take[]) => onBeatShare(takes, 'verse', (s) => s % 4 === 2),
    /** Share of the choruses' comp strikes on a beat (where the skank never plays). */
    chorusCompOnBeats: (takes: Take[]) => onBeatShare(takes, 'chorus', (s) => s % 4 === 0),
    /** Share of the verses' sounding comp strikes that are upstrokes. */
    verseUpstrokes: (takes: Take[]) => {
        const all = strikes(takes, 'verse');
        return ratio(all.filter(({ notes }) => notes[0].stroke === 'up').length, all.length);
    },
    /** Share of the choruses' sounding comp strikes that are downstrokes. */
    chorusDownstrokes: (takes: Take[]) => {
        const all = strikes(takes, 'chorus');
        return ratio(all.filter(({ notes }) => notes[0].stroke === 'down').length, all.length);
    },
    /** Share of the verses' comp chords no longer than a sixteenth (a damped chop). */
    verseCompChopped: (takes: Take[]) => {
        const all = strikes(takes, 'verse');
        return ratio(all.filter(({ notes }) => notes[0].dur <= STEP).length, all.length);
    },
    /** Mean length of a chorus comp chord, in ticks (a sixteenth is 120, an eighth 240). */
    chorusCompLength: (takes: Take[]) => {
        const all = strikes(takes, 'chorus');
        return ratio(
            all.reduce((sum, { notes }) => sum + notes[0].dur, 0),
            all.length,
        );
    },
    /** Share of the choruses' comp chords (two notes or more) with the chord's bass lowest. */
    chorusCompRootLowest: (takes: Take[]) => {
        const all = strikes(takes, 'chorus').filter(({ notes }) => notes.length > 1);
        return ratio(
            all.filter(({ t, notes }) => {
                const chord = t.spans.find(
                    (s) => s.start <= notes[0].tick && notes[0].tick < s.end,
                )?.chord;
                return chord && mod12(Math.min(...notes.map((n) => n.midi))) === chord.bass;
            }).length,
            all.length,
        );
    },
    /** Verse groove bars with the backbeat on 2 and 4 and nothing on the "and"s: ska's snare. */
    verseBackbeat: (takes: Take[]) => {
        const bars = grooveBars(takes, 'verse');
        return ratio(
            bars.filter(({ t, drums }) => {
                const s = pieceSteps(t, drums, ['snare', 'rim']);
                return s.has(4) && s.has(12) && ![2, 6, 10, 14].some((x) => s.has(x));
            }).length,
            bars.length,
        );
    },
    /** Chorus groove bars with the snare on every "and" and off 2 and 4: the skate beat. */
    chorusSnareOnAnds: (takes: Take[]) => {
        const bars = grooveBars(takes, 'chorus');
        return ratio(
            bars.filter(({ t, drums }) => {
                const s = pieceSteps(t, drums, ['snare']);
                return [2, 6, 10, 14].every((x) => s.has(x)) && !s.has(4) && !s.has(12);
            }).length,
            bars.length,
        );
    },
    /** Verse groove bars whose hat leans on the "and"s: louder there than on the beats. */
    verseHatOnAnds: (takes: Take[]) => {
        const bars = grooveBars(takes, 'verse');
        return ratio(
            bars.filter(({ t, drums }) => {
                const hats = drums.filter((d) => d.piece === 'hat');
                const mean = (xs: DrumHit[]) =>
                    ratio(
                        xs.reduce((sum, d) => sum + d.velocity, 0),
                        xs.length,
                    );
                const ands = hats.filter((d) => stepOf(t, d) % 4 === 2);
                const beats = hats.filter((d) => stepOf(t, d) % 4 === 0);
                return ands.length === 4 && (!beats.length || mean(ands) > mean(beats) * 1.2);
            }).length,
            bars.length,
        );
    },
    /** Crashes per chorus bar. */
    chorusCrashes: (takes: Take[]) => {
        let bars = 0;
        let crashes = 0;
        for (const { timeline: t, events } of takes) {
            bars += t.bars.filter((b) => onSide(b, 'chorus')).length;
            crashes += events.filter(
                (e) => e.lane === 'drums' && e.piece === 'crash' && onSide(t.bars[e.bar], 'chorus'),
            ).length;
        }
        return ratio(crashes, bars);
    },
    /**
     * Section-end bars in 4/4 whose fill ends in a sixteenth snare roll (the last two
     * sixteenths both on the snare) with no toms anywhere in the bar.
     */
    fillSnareRolls: (takes: Take[]) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const bar of t.bars) {
                if (bar.meter.name !== '4/4' || bar.barInVisit !== bar.visit.barCount - 1) {
                    continue;
                }
                const drums = events.filter(
                    (e): e is DrumHit => e.lane === 'drums' && e.bar === bar.index,
                );
                n++;
                const snare = pieceSteps(t, drums, ['snare']);
                const toms = drums.some((d) => d.piece.startsWith('tom'));
                hit += snare.has(14) && snare.has(15) && !toms ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of the verses' bass notes on a quarter-note beat (a walk, not a riff). */
    verseBassOnBeats: (takes: Take[]) => {
        let n = 0;
        let hit = 0;
        for (const { t, notes } of bassLines(takes, 'verse')) {
            n += notes.length;
            hit += notes.filter((e) => stepOf(t, e) % 4 === 0).length;
        }
        return ratio(hit, n);
    },
    /** Bass notes per beat in the verses. */
    verseBassPerBeat: (takes: Take[]) => {
        let beats = 0;
        let notes = 0;
        for (const { timeline: t, events } of takes) {
            beats += t.bars.filter((b) => onSide(b, 'verse')).length * 4;
            notes += events.filter(
                (e) =>
                    e.lane === 'bass' &&
                    !(e as PitchedNote).muted &&
                    onSide(t.bars[e.bar], 'verse'),
            ).length;
        }
        return ratio(notes, beats);
    },
    /** Of consecutive verse bass notes, the share a step apart (one or two semitones). */
    verseBassSteps: (takes: Take[]) => {
        let n = 0;
        let hit = 0;
        for (const { notes } of bassLines(takes, 'verse')) {
            for (let i = 1; i < notes.length; i++) {
                if (notes[i].bar - notes[i - 1].bar > 1) {
                    continue;
                }
                const d = Math.abs(notes[i].midi - notes[i - 1].midi);
                n++;
                hit += d === 1 || d === 2 ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * Chorus bars where the bass drives: a note on every eighth, all but the last on the
     * sounding chord's bass note.
     */
    chorusBassDrive: (takes: Take[]) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const bar of t.bars) {
                if (!onSide(bar, 'chorus') || bar.spans.length !== 1 || !bar.spans[0].chord) {
                    continue;
                }
                const bass = events.filter(
                    (e): e is PitchedNote => e.lane === 'bass' && e.bar === bar.index,
                );
                if (!bass.length) {
                    continue;
                }
                n++;
                const steps = new Set(bass.map((e) => stepOf(t, e)));
                const eighths = [0, 2, 4, 6, 8, 10, 12, 14].every((s) => steps.has(s));
                const roots = bass.filter((e) => mod12(e.midi) === bar.spans[0].chord?.bass);
                hit += eighths && bass.length === 8 && roots.length >= 7 ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
};

export const skapunk = defineClaims({
    metrics,
    takes: [
        {
            take: {},
            claims: [
                ['verseCompOnAnds', 0.97, 1, 'the verse skank chops on every "and", never a beat'],
                [
                    'chorusCompOnBeats',
                    0.4,
                    0.6,
                    'the chorus drives straight eighths, the beats the skank left empty',
                ],
                ['verseBackbeat', 0.95, 1, 'ska: the backbeat on 2 and 4'],
                ['verseHatOnAnds', 0.9, 1, 'the hat pushes the skank: loudest on the "and"s'],
                [
                    'chorusSnareOnAnds',
                    0.95,
                    1,
                    'a driving chorus is the skate beat: the snare on every "and"',
                ],
                ['chorusCrashes', 0.4, 0.7, 'a driving punk chorus crashes every other bar'],
                ['fillSnareRolls', 0.95, 1, 'fills are fast snare rolls, not tom runs'],
                ['verseBassOnBeats', 0.97, 1, 'the ska bass walks in quarter notes'],
                ['verseBassPerBeat', 0.85, 1.05, 'a note on (nearly) every beat'],
                ['verseBassSteps', 0.55, 0.95, 'the walk moves by step'],
                [
                    'chorusBassDrive',
                    0.9,
                    1,
                    'the punk bass drives root eighths, leading out on the last',
                ],
                [
                    'bassChromaticApproach',
                    0.75,
                    1,
                    'nearly every change is led into by a half step in pitch',
                ],
                ['bassArrivesOnBass', 0.95, 1, 'every chord arrives on its bass note'],
                ['compColour', 0, 0.15, 'triads and sevenths, no extensions'],
            ],
        },
        {
            take: { intensity: 0.2 },
            claims: [
                ['verseCompOnAnds', 0.97, 1, 'a quiet verse still skanks'],
                ['chorusCompOnBeats', 0.4, 0.6, 'the chorus goes punk even when quiet'],
                ['chorusSnareOnAnds', 0, 0.05, 'a quiet chorus drives with the rock beat instead'],
                ['verseBassPerBeat', 0.5, 0.8, 'a quiet ska bass walks in two'],
            ],
        },
        {
            take: { intensity: 0.9 },
            claims: [
                [
                    'verseCompOnAnds',
                    0.4,
                    0.6,
                    'a driving band goes punk in every section: the verse drives eighths too',
                ],
                ['chorusSnareOnAnds', 0.95, 1, 'the chorus is the skate beat'],
                [
                    'verseBackbeat',
                    0.95,
                    1,
                    'a punk verse drives the rock beat, keeping the skate beat for the chorus',
                ],
            ],
        },
        {
            take: { comp: 'guitar' },
            claims: [
                ['verseCompOnAnds', 0.97, 1, 'the skank: every "and"'],
                ['verseUpstrokes', 0.97, 1, 'the skank is an upstroke on the eighth pendulum'],
                ['chorusDownstrokes', 0.97, 1, 'the punk hand down-picks every eighth'],
                ['verseCompChopped', 0.9, 1, 'the fretting hand damps the chop at once'],
                ['compMeanLowest', 52, 67, 'small grips, high on the neck, above the bass'],
                ['compColour', 0, 0.15, 'triads and sevenths, no extensions'],
            ],
        },
        {
            take: { comp: 'guitar', intensity: 0.4 },
            claims: [
                ['chorusDownstrokes', 0.97, 1, 'the chorus is punk at mid energy too'],
                [
                    'chorusCompLength',
                    100,
                    140,
                    'palm-muted in the middle: each chord choked to a sixteenth',
                ],
            ],
        },
        {
            take: { comp: 'guitar', intensity: 0.9 },
            claims: [
                [
                    'chorusCompLength',
                    200,
                    250,
                    'open at full tilt: each downstroke rings the whole eighth',
                ],
            ],
        },
        {
            take: { comp: 'guitar', bass: false },
            claims: [
                [
                    'chorusCompRootLowest',
                    0.9,
                    1,
                    'alone, the punk guitar plays root-position chords on the low strings',
                ],
                ['verseUpstrokes', 0.97, 1, 'the skank stays a chop up the neck'],
            ],
        },
        {
            take: { comp: 'organ' },
            claims: [
                ['verseCompOnAnds', 0.97, 1, 'the Hammond skank: every "and"'],
                ['compShort', 0.9, 1, 'the organ chops in both gears (the part is percussive)'],
                ['chorusCompOnBeats', 0.4, 0.6, 'and drives chopped eighths in the chorus'],
            ],
        },
        {
            take: { comp: 'piano' },
            claims: [
                ['verseCompOnAnds', 0.97, 1, 'the piano doubles the skank'],
                ['verseCompChopped', 0.9, 1, 'damped at once'],
            ],
        },
    ],
});
