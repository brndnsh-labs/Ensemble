import { useMemo } from 'react';
import type { BandChart, BandChartChord } from '../lib/band-chart';
import { placeNeckHand } from '../lib/session';
import {
    chartHomeKey,
    fingerMoves,
    type InstrumentDef,
    inversionOf,
    type Note,
    rootMove,
    type SharedNote,
    sharedNotes,
    spokenDegree,
    type VoicedBandChord,
    voiceBandChart,
} from '../lib/voicings';
import { useNeckPrefs } from './use-neck-prefs';

// The neck view's follow logic (#1587): which grip sounds on a performed slot, which one comes
// next, and the headline and finger detail between them. Pure functions over the band's chart
// (`lib/band-chart.ts`), so the stand's per-frame `active` slot is all the view needs.

/** A written event the voicer made a grip for: a chord, never a hold or N.C. */
function isVoiced(chord: BandChartChord | undefined): boolean {
    return chord !== undefined && chord.kind === 'chord' && chord.chord !== null;
}

const slotChord = (band: BandChart, slot: number): BandChartChord | undefined =>
    band.chords[band.slots[slot]?.display ?? -1];

/** The first performed slot with a grip, or null when the chart has none (all N.C.). */
export function firstVoicedSlot(band: BandChart): number | null {
    const k = band.slots.findIndex((_, i) => isVoiced(slotChord(band, i)));
    return k < 0 ? null : k;
}

/**
 * The slot whose grip is under the fingers at `slot`: the slot itself for a chord; for a hold
 * or N.C., the last chord performed before it (walking back in performance order, wrapping, so
 * a hold at the top of a repeat holds the chord the repeat came from).
 */
export function soundingSlot(band: BandChart, slot: number): number | null {
    const n = band.slots.length;
    if (slot < 0 || slot >= n) {
        return null;
    }
    for (let step = 0; step < n; step += 1) {
        const k = (slot - step + n) % n;
        if (isVoiced(slotChord(band, k))) {
            return k;
        }
    }
    return null;
}

/**
 * The next performed slot whose chord differs from the one sounding at `slot` — performance
 * order, so a repeat wraps back and the form's end wraps to the top. Unlike the chart's next-BAR
 * cue (`nextBarIndex`), a second chord inside the same bar counts: the hand has to change for it.
 * Holds and N.C. are skipped (nothing new to finger), and so is the same chord again — the same
 * written event performed again (`display` is its `globalIndex`) or another bar of the same
 * symbol, which keeps the same grip. Null when nothing else is ever played.
 */
export function nextVoicedSlot(band: BandChart, slot: number): number | null {
    const n = band.slots.length;
    const sounding = soundingSlot(band, slot);
    if (sounding === null) {
        return null;
    }
    const held = band.slots[sounding].display;
    const heldName = band.chords[held].absName;
    for (let step = 1; step <= n; step += 1) {
        const k = (slot + step) % n;
        const chord = slotChord(band, k);
        if (isVoiced(chord) && band.slots[k].display !== held && chord!.absName !== heldName) {
            return k;
        }
    }
    return null;
}

/**
 * Does the chord sounding at `slot` give way when `slot` ends — is the very next performed slot
 * (wrapping at the loop, as `nextVoicedSlot` does) the next different chord? False inside a run:
 * before another bar of the same chord, a hold or an N.C. the hand stays where it is, so the
 * last beat of such a slot is not the last beat before a change (#1590), and the strong preview
 * waits for the run's last slot. False too when nothing else is ever played. "Different" is
 * `nextVoicedSlot`'s own rule, so an unvoiced chord in between is part of the run it rings under.
 */
export function endsRun(band: BandChart, slot: number): boolean {
    const next = nextVoicedSlot(band, slot);
    return next !== null && (slot + 1) % band.slots.length === next;
}

/**
 * The previous performed slot whose chord differs from the one sounding at `slot`, at the START
 * of that chord's run: `nextVoicedSlot` walked backwards, so stepping back and then forward lands
 * where it began. Performance order with wrapping (the top steps back to the form's last change);
 * holds, N.C. and the same chord again are part of the run they ring under. Null when nothing
 * else is ever played.
 */
export function prevVoicedSlot(band: BandChart, slot: number): number | null {
    const n = band.slots.length;
    const sounding = soundingSlot(band, slot);
    if (sounding === null) {
        return null;
    }
    const heldName = slotChord(band, sounding)!.absName;
    let found: number | null = null;
    for (let step = 1; step < n; step += 1) {
        const k = (slot - step + n) % n;
        const chord = slotChord(band, k);
        if (!isVoiced(chord)) {
            continue;
        }
        if (found === null) {
            if (chord!.absName !== heldName) {
                found = k;
            }
        } else if (chord!.absName === slotChord(band, found)!.absName) {
            // Still the previous chord: its run started earlier.
            found = k;
        } else {
            break;
        }
    }
    return found;
}

/**
 * Every chord change in performance order, read straight through the form once: the first grip,
 * then each slot whose chord differs from the last one played. The stopped neck's position
 * readout (#1595) counts along it. Stepping itself goes by `nextVoicedSlot`/`prevVoicedSlot`, the
 * band's own loop — so when the form ends on the chord it starts on, the step past the end lands
 * on the second change (the band never changes chord at the top), and position 1 is the
 * "Starts on" grip alone.
 */
export function chordChanges(band: BandChart): number[] {
    const changes: number[] = [];
    let last: string | null = null;
    band.slots.forEach((_, k) => {
        const chord = slotChord(band, k);
        if (isVoiced(chord) && chord!.absName !== last) {
            changes.push(k);
            last = chord!.absName;
        }
    });
    return changes;
}

/** `slot`'s 1-based place among `changes` (`chordChanges`): the change whose run it sits in. */
export function changePosition(changes: readonly number[], slot: number): number {
    const after = changes.findIndex((k) => k > slot);
    // Past the last change, or before the first (an N.C. intro, still ringing from the form's
    // last chord): the last.
    return after <= 0 ? changes.length : after;
}

const list = (items: Array<string | number>): string =>
    items.length === 1 ? `${items[0]}` : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

const holdsPhrase = (fingers: number[]): string =>
    fingers.length === 1 ? `Finger ${fingers[0]} stays down` : `Fingers ${list(fingers)} stay down`;

/**
 * A common tone the narration can name (#1618): one with a name and two jobs a student would
 * recognise on the dots. A diminished 7th (`spokenDegree`) or a double-flat or double-sharp
 * spelling is left out, and that note is narrated as before.
 */
const nameable = (s: SharedNote): boolean =>
    spokenDegree(s.from.degree) !== null &&
    spokenDegree(s.to.degree) !== null &&
    !/♭♭|♯♯/.test(s.name);

/** One entry per note name: an octave doubling is the same note with the same two jobs. */
const byName = (notes: SharedNote[]): SharedNote[] =>
    notes.filter((s, i) => notes.findIndex((t) => t.name === s.name) === i);

const changesJob = (s: SharedNote): boolean =>
    spokenDegree(s.from.degree) !== spokenDegree(s.to.degree);

/**
 * How many common tones get their change of job spelled out. One is the lesson ("the 3rd becomes
 * the 7th") and two still fit a clause ("C becomes the 3rd and E the 5th"); three is a list, and
 * the notes are then named without it.
 */
const JOBS_TOLD = 2;

/**
 * What the notes become, or '' when there is nothing to say: one of them is the same degree in
 * both chords (Cmaj7 to C7 keeps the root a root), or there are more than `JOBS_TOLD`.
 */
function jobs(notes: SharedNote[], told: boolean): string {
    if (!told || !notes.length || !notes.every(changesJob)) {
        return '';
    }
    const [first, ...rest] = notes;
    if (!rest.length) {
        return `the ${spokenDegree(first.from.degree)} becomes the ${spokenDegree(first.to.degree)}`;
    }
    return `${first.name} becomes the ${spokenDegree(first.to.degree)} and ${rest
        .map((s) => `${s.name} the ${spokenDegree(s.to.degree)}`)
        .join(' and ')}`;
}

/**
 * The root's move from `from` to `to`, for the headline: what it does on the neck ("root moves
 * one string over, same fret"), or '' for a grip with no root to follow.
 */
export function rootLine(
    instrument: InstrumentDef,
    from: VoicedBandChord,
    to: VoicedBandChord,
): string {
    const root = rootMove(instrument, from, to);
    return root.geometry ? `root ${root.geometry}` : '';
}

/**
 * The finger-by-finger detail of the change, as one sentence: which fingers stay down, then any
 * note that stays under another finger, then where each moving finger goes; '' when nothing
 * moves. Lifts are left out — the strong preview already dims the dots that come off, and naming
 * them is noise.
 *
 * A note both grips fret in the same place is said as a teacher says it (#1618): the note stays
 * and its job changes. Under the same finger that is "Finger 3 stays down on B: the 3rd becomes
 * the 7th"; under another, "F stays: the 3rd becomes the 7th; re-finger it with 2", which stands
 * in for that finger's own move. A change with no such note reads as it always did.
 */
export function fingersLine(
    instrument: InstrumentDef,
    from: VoicedBandChord,
    to: VoicedBandChord,
): string {
    const { moves } = fingerMoves(instrument, from, to);
    const holds = moves.filter((m) => m.kind === 'hold').map((m) => m.finger);
    const common = sharedNotes(from, to).filter(nameable);
    // A staying note is narrated under the finger that holds it or the one that takes it over.
    // An open string that rings in both chords has neither, so it is not said: nothing is asked
    // of the hand, and a strummed ukulele chord shares one with nearly every neighbour — naming
    // them would bury the fingers the line is for. A barre that changes its strings keeps its
    // finger on the note but is not a hold: it is narrated as the barre it becomes.
    const held = common
        .filter((s) => s.from.finger === s.to.finger && holds.includes(s.to.finger ?? 0))
        .sort((x, y) => x.to.finger! - y.to.finger!);
    const swapped = common
        .filter((s) => s.from.finger && s.to.finger && s.from.finger !== s.to.finger)
        .sort((x, y) => x.to.finger! - y.to.finger!);
    const told = byName([...held, ...swapped]).length <= JOBS_TOLD;
    const barring = new Set(moves.filter((m) => m.kind === 'move' && m.barre).map((m) => m.finger));
    const parts: string[] = [];
    if (holds.length) {
        const notes = byName(held);
        // Only when every finger that stays is on a note the line can name.
        const all = holds.every((f) => held.some((s) => s.to.finger === f));
        const become = all ? jobs(notes, told) : '';
        const on = become && notes.length === 1 ? ` on ${notes[0].name}` : '';
        parts.push(`${holdsPhrase(holds)}${on}${become && `: ${become}`}`);
    }
    if (swapped.length) {
        const notes = byName(swapped);
        const become = jobs(notes, told);
        parts.push(
            `${list(notes.map((s) => s.name))} ${notes.length === 1 ? 'stays' : 'stay'}${become && `: ${become}`}`,
        );
        // A barre laid over the note says its own fret and strings below: that is the finger.
        const fingers = [...new Set(swapped.map((s) => s.to.finger!))].filter(
            (f) => !barring.has(f),
        );
        if (fingers.length) {
            parts.push(`re-finger ${swapped.length === 1 ? 'it' : 'them'} with ${list(fingers)}`);
        }
    }
    // "Re-finger it with 2" is finger 2's move, so it is not said twice.
    const said = (finger: number, at: Note | undefined) =>
        swapped.some(
            (s) => s.to.finger === finger && s.string === at?.string && s.fret === at?.fret,
        );
    for (const m of moves) {
        if (m.kind === 'move' && (m.barre || !said(m.finger, m.to))) {
            parts.push(`finger ${m.finger} ${m.text}`);
        }
    }
    if (!parts.length) {
        return '';
    }
    const sentence = parts.join('; ');
    return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
}

export interface NeckModel {
    /** The grip on the neck: the sounding chord, or the held one under a hold or N.C. */
    grip: VoicedBandChord | null;
    next: VoicedBandChord | null;
    /** What the chart says at the playhead: a chord's symbol, `N.C.`, or the held chord's. */
    name: string;
    /** The playhead is on a hold (the grip rings on) or an N.C. (the grip is shown, not played). */
    held: 'hold' | 'no-chord' | null;
    nextName: string | null;
    /**
     * The one-line headline under the names: stopped, `Starts on Dm7 · then G7: root moves
     * to …`; playing, `Next: G7 · root moves to …`; '' while playing with no next chord.
     */
    headline: string;
    /** The finger-by-finger detail of the change to the next grip (`fingersLine`), or ''. */
    fingers: string;
    /** The chart's own symbol for an approximated grip ("the chart says C"), else null. */
    approximatedFrom: string | null;
    /** The grip's inversion (#1588): 0 root position (and every shell), 1 first, 2 second. */
    inversion: 0 | 1 | 2;
}

/**
 * What the neck shows at performed slot `active` (null while stopped: the first chord, previewing
 * the second, so the view is never empty).
 */
export function neckModel(
    band: BandChart,
    voiced: ReadonlyMap<number, VoicedBandChord>,
    active: number | null,
    instrument: InstrumentDef,
): NeckModel | null {
    const at = active ?? firstVoicedSlot(band);
    if (at === null) {
        return null;
    }
    const sounding = soundingSlot(band, at);
    if (sounding === null) {
        return null;
    }
    const nextSlot = nextVoicedSlot(band, at);
    const written = slotChord(band, at)!;
    const soundingChord = slotChord(band, sounding)!;
    const grip = voiced.get(soundingChord.globalIndex) ?? null;
    const nextChord = nextSlot === null ? null : slotChord(band, nextSlot)!;
    const next = nextChord ? (voiced.get(nextChord.globalIndex) ?? null) : null;
    const held = written.kind === 'hold' ? 'hold' : written.kind === 'no-chord' ? 'no-chord' : null;
    const name = held === 'no-chord' ? 'N.C.' : soundingChord.absName;
    const nextName = nextChord ? nextChord.absName : null;
    const ahead = grip && next && nextName ? nextName : null;
    const change = grip && next ? rootLine(instrument, grip, next) : '';
    let headline = '';
    if (active === null) {
        headline = `Starts on ${name}${ahead ? ` · then ${ahead}${change && `: ${change}`}` : ''}`;
    } else if (ahead) {
        headline = `Next: ${ahead}${change && ` · ${change}`}`;
    }
    const fingers = grip && next ? fingersLine(instrument, grip, next) : '';
    return {
        grip,
        next,
        name,
        held,
        nextName,
        headline,
        fingers,
        approximatedFrom: grip?.approximation ? soundingChord.absName : null,
        inversion: grip ? inversionOf(instrument, grip) : 0,
    };
}

/**
 * The stand's neck voicing: the per-device prefs with the hand placed for this chart's key
 * (`placeNeckHand`: a window the musician has not chosen follows the key, #1598), and the whole
 * chart voiced once per loaded chart + prefs — keyed by written index, never per frame. Voices
 * nothing while the neck is not showing.
 */
export function useNeckVoicing(band: BandChart | null, showing: boolean) {
    const { prefs: stored, setPrefs } = useNeckPrefs();
    const prefs = useMemo(
        () => placeNeckHand(stored, band ? chartHomeKey(band) : null),
        [stored, band],
    );
    const voiced = useMemo(
        () =>
            band && showing
                ? new Map(voiceBandChart(band, prefs).map((v) => [v.globalIndex, v] as const))
                : null,
        [band, showing, prefs],
    );
    return { prefs, setPrefs, voiced };
}
