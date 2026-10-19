import { useMemo } from 'react';
import type { BandChart, BandChartChord } from '../lib/band-chart';
import { placeNeckHand } from '../lib/session';
import {
    COUNT_WORDS,
    chartHomeKey,
    type FingerMove,
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
    fingers.length === 1 ? `finger ${fingers[0]} stays down` : `fingers ${list(fingers)} stay down`;

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

/** One note name said `n` times: "the two D♭s", or "the two D♭/C♯ notes" for a two-way name. */
const several = (name: string, n: number): string =>
    `the ${COUNT_WORDS[n] ?? n} ${name.includes('/') ? `${name} notes` : `${name}s`}`;

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
 * both chords (Cmaj7 to C7 keeps the root a root), or there are more than `JOBS_TOLD`. One
 * note's job leaves its name to the clause before ("…on B: the 3rd becomes the 7th") unless
 * `named` asks for it.
 */
function jobs(notes: SharedNote[], told: boolean, named = false): string {
    if (!told || !notes.length || !notes.every(changesJob)) {
        return '';
    }
    const [first, ...rest] = notes;
    if (!rest.length && named) {
        return `${first.name} becomes the ${spokenDegree(first.to.degree)}`;
    }
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
 * the 7th"; under another, "F is in both chords: the 3rd becomes the 7th; finger 2 takes it
 * over", which stands in for that finger's own move. (It read "F stays: …; re-finger it with 2"
 * until #1683, which told the hand to stay and to change in one breath.) A change with no such
 * note reads as it always did.
 *
 * Where a barre takes one of several such notes, only the notes that go to a fingertip are
 * handed to it (#1683): Dm x-5-3-2-x-x (4-2-1) to B♭ x-5-3-3-x-x (3-1-1) is "finger 3 takes
 * over D", and the F is under the barre, which says its own fret and strings.
 */
export function fingersLine(
    instrument: InstrumentDef,
    from: VoicedBandChord,
    to: VoicedBandChord,
): string {
    const { moves } = fingerMoves(instrument, from, to);
    // A barre that stays on only some of its strings is said apart (`partial`, below).
    const holds = moves.filter((m) => m.kind === 'hold' && !m.on).map((m) => m.finger);
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
    // A barre that stays down on only some of its strings (`FingerMove.on`, #1691) says
    // where: on the note it keeps, where that is one note both chords share ("finger 1 stays
    // down on A: the root becomes the 5th", A5 x-0-2-2-x-x to D5 x-x-0-2-3-x), else on its
    // strings, with what the notes it keeps there become ("finger 1 stays down on the 4th and
    // 3rd strings: E becomes the 5th and A the root", Esus4 x-2-2-2-x-x to A5).
    const partial = moves.filter((m) => m.kind === 'hold' && m.on);
    const keeps = (m: FingerMove): SharedNote[] =>
        common.filter(
            (s) =>
                s.string >= m.on![0] &&
                s.string <= m.on![1] &&
                s.from.finger === m.finger &&
                s.to.finger === m.finger,
        );
    const told = byName([...held, ...swapped, ...partial.flatMap(keeps)]).length <= JOBS_TOLD;
    const barring = new Set(moves.filter((m) => m.kind === 'move' && m.barre).map((m) => m.finger));
    // The notes the held part names: none unless it says what they become.
    const heldNames = new Set<string>();
    // The fingers that stay, said from finger 1 up as a teacher counts them: those that stay
    // whole together, and each barre that stays on part of its strings on its own.
    const holding: Array<[finger: number, said: string]> = [];
    if (holds.length) {
        const notes = byName(held);
        // Only when every finger that stays is on a note the line can name.
        const all = holds.every((f) => held.some((s) => s.to.finger === f));
        const become = all ? jobs(notes, told) : '';
        const on = become && notes.length === 1 ? ` on ${notes[0].name}` : '';
        holding.push([holds[0], `${holdsPhrase(holds)}${on}${become && `: ${become}`}`]);
        if (become) {
            for (const s of notes) {
                heldNames.add(s.name);
            }
        }
    }
    for (const m of partial) {
        const notes = byName(keeps(m));
        const one = m.on![0] === m.on![1] && notes.length === 1;
        // Across several strings one kept note is named in its job ("…on the 4th and 3rd
        // strings: A becomes the root"), so a later "the other A" has it to point back to.
        const become = jobs(notes, told, !one);
        holding.push([
            m.finger,
            `finger ${m.finger} ${one ? `stays down on ${notes[0].name}` : m.text}${become && `: ${become}`}`,
        ]);
        if (become || one) {
            for (const s of notes) {
                heldNames.add(s.name);
            }
        }
    }
    const parts = holding.sort((x, y) => x[0] - y[0]).map(([, said]) => said);
    if (swapped.length) {
        // A name the held part has said is the same note an octave away, with the same job:
        // "the other C", never said twice (#1691).
        const fresh = swapped.filter((s) => !heldNames.has(s.name));
        const times = (name: string) => fresh.filter((s) => s.name === name).length;
        const notes = byName(fresh);
        if (notes.length) {
            const become = jobs(notes, told);
            // One name on two strings is two notes: "the two D♭s", so "them" has its plural.
            const named = notes.map((s) =>
                times(s.name) > 1 ? several(s.name, times(s.name)) : s.name,
            );
            parts.push(
                `${list(named)} ${fresh.length === 1 ? 'is' : 'are'} in both chords${become && `: ${become}`}`,
            );
        }
        // A barre laid over the note says its own fret and strings below: that is the finger.
        // So only the notes a fingertip takes are handed to one, by name when they are not
        // all of them, or when the name alone would not say which.
        const taken = swapped.filter((s) => !barring.has(s.to.finger!));
        const fingers = [...new Set(taken.map((s) => s.to.finger!))];
        if (fingers.length) {
            const who =
                fingers.length === 1
                    ? `finger ${fingers[0]} takes`
                    : `fingers ${list(fingers)} take`;
            // No grip holds one note name three times (the most is two, on either
            // instrument), so a held name has one other, and a name said twice here is two
            // notes the string tells apart.
            const which = (s: SharedNote): string => {
                if (heldNames.has(s.name)) {
                    return `the other ${s.name}`;
                }
                // A D♭ under the barre and a D♭ under a fingertip: the string says which.
                return times(s.name) > 1
                    ? `the ${s.name} on the ${instrument.strName(s.string)}`
                    : s.name;
            };
            const byNote =
                taken.length < swapped.length || taken.some((s) => heldNames.has(s.name));
            // A name reads better after the verb ("takes over D"); a pronoun inside it.
            parts.push(
                byNote
                    ? `${who} over ${list([...new Set(taken.map(which))])}`
                    : `${who} ${swapped.length === 1 ? 'it' : 'them'} over`,
            );
        }
    }
    // "Finger 2 takes it over" is finger 2's move, so it is not said twice.
    const said = (finger: number, at: Note | undefined) =>
        swapped.some(
            (s) => s.to.finger === finger && s.string === at?.string && s.fret === at?.fret,
        );
    for (const m of moves) {
        if (m.kind === 'move' && (m.barre || !said(m.finger, m.to))) {
            parts.push(`finger ${m.finger} ${m.text}`);
        }
    }
    const skip = skippedStrings(instrument, from, to);
    if (skip) {
        parts.push(skip);
    }
    if (!parts.length) {
        return '';
    }
    const sentence = parts.join('; ');
    return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
}

/** The strings of a ukulele grip it leaves out, by name from the G string: `['G', 'A']`. */
function leftOut(instrument: InstrumentDef, v: VoicedBandChord): string[] {
    return Array.from({ length: instrument.strings }, (_, i) => instrument.strings - i)
        .filter((s) => !v.notes.some((n) => n.string === s))
        .map((s) => instrument.strShort(s));
}

/** "skip the G and A strings", "skip the A string". */
const skipPhrase = (strings: string[]): string =>
    `skip the ${list(strings)} string${strings.length > 1 ? 's' : ''}`;

/**
 * What a ukulele player strums, said where it changes (#1809), as the line's last clause. A
 * ukulele strums all four strings, so the power chords that sound two or three of them (F♯5
 * x-1-2-x, B5 x-x-2-2, G5 0-2-3-x) are played by not strumming the others, as the chord charts
 * say ("skip the g and A strings"); left to ring, the open C over B5 is a ♭9. When the strings
 * left out change, every one the next grip leaves out is named ("skip the G and A strings",
 * B♭5 x-x-1-1 to F5 x-0-1-x, the C string back in), and a grip on all four after one that left
 * some out says so ("strum all four strings"). The same strings left out (B5 to B♭5) is no
 * change, and nothing is said. Not on a guitar, whose grips leave strings out all the time and
 * are muted by the fretting hand, never said in this line.
 */
function skippedStrings(
    instrument: InstrumentDef,
    from: VoicedBandChord,
    to: VoicedBandChord,
): string {
    if (instrument.id !== 'uke') {
        return '';
    }
    const was = leftOut(instrument, from);
    const now = leftOut(instrument, to);
    if (was.join() === now.join()) {
        return '';
    }
    return now.length
        ? skipPhrase(now)
        : `strum all ${COUNT_WORDS[instrument.strings] ?? instrument.strings} strings`;
}

/**
 * The opening grip's own strings (#1809): a chart that starts on B5 x-x-2-2 has no change into
 * it to say "skip the G and C strings", so the line shown before Play says it first ("On B5,
 * skip the G and C strings."). A ukulele grip on all four strings, and every guitar grip, says
 * nothing.
 */
function openingSkip(instrument: InstrumentDef, grip: VoicedBandChord, name: string): string {
    const now = instrument.id === 'uke' ? leftOut(instrument, grip) : [];
    return now.length ? `On ${name}, ${skipPhrase(now)}.` : '';
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
    const moving = grip && next ? fingersLine(instrument, grip, next) : '';
    // Before Play, the opening grip's own strings come first: no change leads into it.
    const opening = active === null && grip ? openingSkip(instrument, grip, name) : '';
    const fingers = [opening, moving].filter(Boolean).join(' ');
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
