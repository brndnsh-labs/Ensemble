import { useMemo } from 'react';
import type { BandChart, BandChartChord } from '../lib/band-chart';
import { placeNeckHand } from '../lib/session';
import {
    chartHomeKey,
    fingerMoves,
    type InstrumentDef,
    inversionOf,
    rootMove,
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

const holdsPhrase = (fingers: number[]): string =>
    fingers.length === 1
        ? `Finger ${fingers[0]} stays down`
        : `Fingers ${fingers.slice(0, -1).join(', ')} and ${fingers.at(-1)} stay down`;

/**
 * The root's move from `from` to `to`, for the headline: the interval, then where it lands on
 * the neck ("root up a 4th, same fret, one string over").
 */
export function rootLine(
    instrument: InstrumentDef,
    from: VoicedBandChord,
    to: VoicedBandChord,
): string {
    const root = rootMove(instrument, from, to);
    return `root ${root.text}${root.geometry ? `, ${root.geometry}` : ''}`;
}

/**
 * The finger-by-finger detail of the change, as one sentence: which fingers stay down, then where
 * each moving finger goes, or '' when nothing moves. Lifts are left out — the strong preview
 * already dims the dots that come off, and naming them is noise.
 */
export function fingersLine(
    instrument: InstrumentDef,
    from: VoicedBandChord,
    to: VoicedBandChord,
): string {
    const { moves } = fingerMoves(instrument, from, to);
    const holds = moves.filter((m) => m.kind === 'hold').map((m) => m.finger);
    const parts = [
        ...(holds.length ? [holdsPhrase(holds)] : []),
        ...moves.filter((m) => m.kind === 'move').map((m) => `finger ${m.finger} ${m.text}`),
    ];
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
     * The one-line headline under the names: stopped, `Starts on Dm7 · then G7: root up a 4th,
     * …`; playing, `Next: G7 · root up a 4th, …`; '' while playing with no next chord.
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
    const change = grip && next && nextName ? rootLine(instrument, grip, next) : null;
    let headline = '';
    if (active === null) {
        headline = `Starts on ${name}${change ? ` · then ${nextName}: ${change}` : ''}`;
    } else if (change) {
        headline = `Next: ${nextName} · ${change}`;
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
