/**
 * The guide-tone head's metrics and claims (#2111, #2122): what a known standard's head, sung
 * as its changes' guide tones in a tune's rhythm, is judged on in every style. The metrics are
 * in the shared library (`METRICS`); `guideTonesTake` is the standard take a style's claims
 * file adds in one call.
 */
import { leadRole } from '../../arrange/cycle.js';
import { type FormRole, formRole, sectionRoleOf } from '../../arrange/plan.js';
import type { BandEvent, PitchedNote } from '../../core/types.js';
import { type Bar, chordAt, sectionKey, spanIndexAt, type Timeline } from '../../form/timeline.js';
import { STEP } from '../../players/grid.js';
import { guidePitchClasses, headForm } from '../../players/lead/guide-tones.js';
import { chordPcs } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';
import type { Metric, Take } from './harness.js';

const ratio = (hits: number, total: number) => (total ? hits / total : 0);

/**
 * Each 4/4 bar of the takes in form role `role` (#2018), as the plan reads it: the lead's job
 * there (the same `leadRole` the plan asks, with the bar's chorus added to the pass) and the
 * head's bridge. With the bar's events.
 */
export function barsIn(takes: Take[], role: FormRole) {
    const out: { take: Take; index: number; events: BandEvent[] }[] = [];
    for (const take of takes) {
        const { timeline: t, events, pass = 0, trade } = take;
        for (const bar of t.bars) {
            const lead = leadRole(t, bar.index, pass + bar.visit.chorus, trade ?? null);
            if (bar.meter.name === '4/4' && formRole(t, bar.index, lead) === role) {
                out.push({
                    take,
                    index: bar.index,
                    events: events.filter((e) => e.bar === bar.index),
                });
            }
        }
    }
    return out;
}

/** The lead notes struck in a bar, as the sixteenth each starts on: the bar's rhythm. */
function onsetSteps(take: Take, bar: Bar): string {
    return take.events
        .filter((e): e is PitchedNote => e.lane === 'lead' && e.bar === bar.index)
        .map((e) => Math.round((e.tick - bar.start) / STEP))
        .join(' ');
}

/**
 * Each chorus of the head (#2111) as the guide-tone head reads it, by the engine's own form
 * (`headForm`, #2140), so the critique judges the sections the line is sung in: its first A (the
 * form's first visit; an intro and an outro are around the form, not in it), the visits after
 * it with the same letter (an A again), its contrast (the bridge, or with none the chorus's last
 * visit in another letter: an A B tune's B, an A B A C's C) and the rest of the form, every
 * visit but the contrast. Only the visits the plan gives the head (its A sections or its
 * bridge) count. The contrast is `headForm`'s one visit: before #2140 every visit the plan
 * called a bridge counted, which no fixture tells apart (none has two).
 */
function headForms(take: Take) {
    const { timeline: t, pass = 0, trade } = take;
    const roleOf = (index: number) =>
        formRole(t, index, leadRole(t, index, pass + t.bars[index].visit.chorus, trade ?? null));
    const choruses = new Map<number, Timeline['visits']>();
    for (const visit of t.visits) {
        const role = roleOf(visit.firstBar);
        const around = sectionRoleOf(visit.label);
        if ((role === 'head' || role === 'bridge') && around !== 'Intro' && around !== 'Outro') {
            choruses.set(visit.chorus, [...(choruses.get(visit.chorus) ?? []), visit]);
        }
    }
    return [...choruses.values()].flatMap((visits) => {
        const form = headForm(t, visits[0].firstBar);
        const first = visits.find((v) => v.firstBar === form.firstBar);
        if (!first || roleOf(first.firstBar) !== 'head') {
            return [];
        }
        const key = sectionKey(first);
        const again = visits.filter((v) => v !== first && sectionKey(v) === key);
        const contrast = visits.filter((v) => v.ordinal === form.contrast);
        const rest = visits.filter((v) => v.ordinal !== form.contrast);
        return [{ first, again, contrast, rest }];
    });
}

/**
 * Share of the bars of `which` visits (an A again, or the contrast) whose rhythm — the steps
 * the lead strikes on — is the first A's, bar for bar (a contrast longer than the A is read
 * against it from its top again). 4/4 bars only; 0 with none to judge.
 */
function rhythmMatch(takes: Take[], which: 'again' | 'contrast'): number {
    let n = 0;
    let hit = 0;
    for (const take of takes) {
        const { bars } = take.timeline;
        for (const form of headForms(take)) {
            for (const visit of form[which]) {
                for (let j = 0; j < visit.barCount; j++) {
                    const bar = bars[visit.firstBar + j];
                    const a1 = bars[form.first.firstBar + (j % form.first.barCount)];
                    if (bar.meter.name !== '4/4' || a1.meter.name !== '4/4') {
                        continue;
                    }
                    if (which === 'again' && j >= form.first.barCount) {
                        continue;
                    }
                    n++;
                    hit += onsetSteps(take, bar) === onsetSteps(take, a1) ? 1 : 0;
                }
            }
        }
    }
    return ratio(hit, n);
}

/**
 * The mean of `of` over the lead's notes in the head's bridge, less its mean over the head's A
 * sections, averaged over the takes that have a bridge; NaN (a failed claim) with none.
 */
function bridgeOverHead(takes: Take[], of: (note: PitchedNote) => number): number {
    const lifts: number[] = [];
    for (const take of takes) {
        const mean = (role: FormRole) => {
            const notes = barsIn([take], role).flatMap((b) =>
                b.events.filter((e): e is PitchedNote => e.lane === 'lead'),
            );
            return notes.length ? notes.reduce((s, e) => s + of(e), 0) / notes.length : Number.NaN;
        };
        const lift = mean('bridge') - mean('head');
        if (!Number.isNaN(lift)) {
            lifts.push(lift);
        }
    }
    return lifts.length ? lifts.reduce((s, x) => s + x, 0) / lifts.length : Number.NaN;
}

/** The lead's notes in a take, in order. */
const leadOf = (take: Take) => take.events.filter((e): e is PitchedNote => e.lane === 'lead');

/**
 * Semitones each head's contrast (`headForms`: the bridge, or a two-section tune's B, whatever
 * its form role) sits over the rest of its head, mean pitch against mean pitch: one value a
 * chorus that has a contrast. 4/4 bars only, as `barsIn` reads them.
 */
function contrastRegisters(take: Take): number[] {
    const { bars } = take.timeline;
    const notes = leadOf(take).filter((e) => bars[e.bar].meter.name === '4/4');
    const mean = (visits: Timeline['visits']) => {
        const ordinals = new Set(visits.map((v) => v.ordinal));
        const inside = notes.filter((e) => ordinals.has(bars[e.bar].visit.ordinal));
        return inside.length ? inside.reduce((s, e) => s + e.midi, 0) / inside.length : Number.NaN;
    };
    return headForms(take)
        .filter((form) => form.contrast.length)
        .map((form) => mean(form.contrast) - mean(form.rest))
        .filter((lift) => !Number.isNaN(lift));
}

/**
 * The seams of each contrast (`headForms`): the lead's last note before it and its first in
 * it, and its last in it and the first after (#2111). Pairs a breath of two bars or more apart
 * are not a seam.
 */
function contrastSeams(take: Take): [PitchedNote, PitchedNote][] {
    const { bars } = take.timeline;
    const notes = leadOf(take);
    const out: [PitchedNote, PitchedNote][] = [];
    const across = (tick: number) => {
        const k = notes.findIndex((n) => n.tick >= tick);
        const [a, b] = [notes[k - 1], notes[k]];
        if (k > 0 && b && b.tick - (a.tick + a.dur) < bars[0].meter.barTicks * 2) {
            out.push([a, b]);
        }
    };
    for (const form of headForms(take)) {
        for (const visit of form.contrast) {
            across(bars[visit.firstBar].start);
            const after = bars[visit.firstBar + visit.barCount];
            if (after) {
                across(after.start);
            }
        }
    }
    return out;
}

/** The guide-tone head's metrics (#2111, #2122), in the shared library. */
export const GUIDE_METRICS = {
    /**
     * Share of the lead's consecutive notes inside a phrase (less than a beat apart) that strike
     * the same pitch again over the same chord, the second sung for that chord too (no change
     * between the first's onset and an eighth into the second): a tone stuttered with nothing
     * new under it (#2122: the bridge's hand-back turn sang G4 ... G4 over Ebmaj7). A common
     * tone struck again for a new chord is not one.
     */
    leadSameChordRestrike: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const notes = events.filter((e): e is PitchedNote => e.lane === 'lead');
            for (let i = 1; i < notes.length; i++) {
                const [a, b] = [notes[i - 1], notes[i]];
                if (b.tick - (a.tick + a.dur) >= STEP * 4) {
                    continue;
                }
                n++;
                const one = spanIndexAt(t, a.tick) === spanIndexAt(t, b.tick + STEP * 2);
                hit += a.midi === b.midi && one ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * Share of the lead's notes struck on a sixteenth between the eighths (the "e" or "a" of a
     * beat): how much of a line sits on the sixteenth grid, not the eighth one. Shared by the
     * sixteenth-feel heads (funk, neo-soul, hip hop, #2122).
     */
    leadSixteenthOffbeats: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const e of events) {
                if (e.lane === 'lead') {
                    n++;
                    hit += Math.round((e.tick - t.bars[e.bar].start) / STEP) % 2;
                }
            }
        }
        return ratio(hit, n);
    },
    /**
     * Share of the lead's notes held a bar less a beat or more (a whole note, less the beat
     * it breathes before the next phrase, #2024): the long arrivals (#2111). It counted to
     * a bar less an eighth until the head took a beat's breath at every phrase end; held
     * that strictly every arrival now reads short (0), so it counts the arrival's three beats.
     */
    leadWholeNoteShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const e of events) {
                if (e.lane === 'lead') {
                    n++;
                    hit += e.dur >= t.bars[e.bar].meter.barTicks - STEP * 4 ? 1 : 0;
                }
            }
        }
        return ratio(hit, n);
    },
    /** Share of an A section's bars, played again, that keep the first A's rhythm (#2111). */
    leadHeadRhythmRecurs: (takes) => rhythmMatch(takes, 'again'),
    /** Share of the contrast's bars (the bridge, or a last B or C) on the A's rhythm. */
    leadHeadContrastDiffers: (takes) => rhythmMatch(takes, 'contrast'),
    /**
     * Semitones the lead's first note in the bridge sits over its last note before it, on
     * average (#2111): the lift is measured from where the A's line ended, not a home.
     * NaN (a failed claim) with no bridge.
     */
    leadBridgeLift: (takes) => {
        const lifts: number[] = [];
        for (const take of takes) {
            const { bars } = take.timeline;
            const notes = leadOf(take);
            for (const visit of take.timeline.visits) {
                const bar = bars[visit.firstBar];
                if (barsIn([take], 'bridge').every((b) => b.index !== bar.index)) {
                    continue;
                }
                const k = notes.findIndex((n) => n.tick >= bar.start);
                if (k > 0) {
                    lifts.push(notes[k].midi - notes[k - 1].midi);
                }
            }
        }
        return lifts.length ? lifts.reduce((s, x) => s + x, 0) / lifts.length : Number.NaN;
    },
    /**
     * The widest move at a seam into or out of the contrast, in semitones (#2111): the
     * bridge lifts, and the last A comes back, by a 4th at most.
     */
    leadContrastSeamLeap: (takes) =>
        Math.max(
            0,
            ...takes.flatMap((take) =>
                contrastSeams(take).map(([a, b]) => Math.abs(b.midi - a.midi)),
            ),
        ),
    /**
     * Share of the lead's notes held a quarter or longer that are not tones of their chord
     * (#2111): its chord tones, the 3rd and 7th the guide-tone line hears in it
     * (`guidePitchClasses`: a triad's 7th), and under a half note its natural 9th. An
     * anticipation is judged against the chord it arrives on as well.
     */
    leadHeldNonChordShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const take of takes) {
            const { timeline: t } = take;
            for (const e of leadOf(take)) {
                if (e.dur < STEP * 4) {
                    continue;
                }
                const key = t.bars[e.bar].key;
                const fits = [chordAt(t, e.tick), chordAt(t, e.tick + STEP * 2)].some(
                    (c) =>
                        !!c &&
                        [
                            ...chordPcs(c),
                            ...guidePitchClasses(c, key),
                            ...(e.dur < STEP * 8 && c.scale.includes(2) ? [mod12(c.root + 2)] : []),
                        ].includes(mod12(e.midi)),
                );
                n++;
                hit += fits ? 0 : 1;
            }
        }
        return ratio(hit, n);
    },
    /**
     * Share of the head's bars (its A sections and its bridge) where the lead holds a note
     * three beats or more (#2111): how often the head sounds like whole notes. A note
     * belongs to the bar it starts in.
     */
    leadLongNoteBars: (takes) => {
        const bars = [...barsIn(takes, 'head'), ...barsIn(takes, 'bridge')];
        const long = bars.filter((b) =>
            b.events.some((e) => e.lane === 'lead' && e.dur >= STEP * 12),
        );
        return ratio(long.length, bars.length);
    },
    /**
     * Share of the lead's moves across a barline, inside a phrase (less than a beat apart),
     * that strike the same pitch again (#2111): a common tone stuttered rather than tied.
     */
    leadRepeatAcrossBarline: (takes) => {
        let n = 0;
        let hit = 0;
        for (const take of takes) {
            const notes = leadOf(take);
            for (let i = 1; i < notes.length; i++) {
                const [a, b] = [notes[i - 1], notes[i]];
                if (a.bar === b.bar || b.tick - (a.tick + a.dur) >= STEP * 4) {
                    continue;
                }
                n++;
                hit += a.midi === b.midi ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** How much louder the lead plays its bridge than its A sections, in velocity. */
    leadBridgeLouder: (takes) => bridgeOverHead(takes, (e) => e.velocity),
    /**
     * Semitones the lead's head contrast sits over the rest of its head, mean pitch against
     * mean pitch, averaged over the contrasts (`contrastRegisters`); NaN (a failed claim) with
     * none. `leadBridgeLift` reads one pair of notes a bridge, the seam; this reads the whole
     * contrast, so a line that steps up at the seam and then sinks under the A fails it (#2123).
     * Any contrast counts, not only a bridge: the bossa chart's B, whose seam falls a half step,
     * sank 4 to 7 under its A unread (#2140).
     */
    leadContrastRegister: (takes) => {
        const lifts = takes.flatMap(contrastRegisters);
        return lifts.length ? lifts.reduce((s, x) => s + x, 0) / lifts.length : Number.NaN;
    },
} satisfies Record<string, Metric>;
