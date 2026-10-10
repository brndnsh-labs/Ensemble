import { useMemo } from 'react';
import type { BandChart, BandChartChord } from '../lib/band-chart';
import {
    fingerMoves,
    GUITAR,
    type InstrumentDef,
    rootMove,
    type ShellPrefs,
    UKULELE,
    UKULELE_LOW_G,
    type VoicedBandChord,
    voiceBandChart,
} from '../lib/shells';
import { useShellPrefs } from './use-shell-prefs';

// The neck view's follow logic (#1587): which grip sounds on a performed slot, which one comes
// next, and the sentence that walks the hand between them. Pure functions over the band's chart
// (`lib/band-chart.ts`), so the stand's per-frame `active` slot is all the view needs.

export const SHELL_INSTRUMENTS: Record<ShellPrefs['instrument'], InstrumentDef> = {
    guitar: GUITAR,
    uke: UKULELE,
    'uke-low-g': UKULELE_LOW_G,
};

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

/** A written event's letter-name symbol, as the chart prints it in letter notation. */
export function writtenName(chord: BandChartChord): string {
    const name = chord.display?.name;
    if (!name) {
        return chord.absName;
    }
    return `${name.root}${name.suffix}${name.bass ? `/${name.bass}` : ''}`;
}

const holdsPhrase = (fingers: number[]): string =>
    fingers.length === 1
        ? `Finger ${fingers[0]} stays down`
        : `Fingers ${fingers.slice(0, -1).join(', ')} and ${fingers.at(-1)} stay down`;

/**
 * How the hand gets from `from` to `to`, in one sentence group: the root's move, then which
 * fingers stay down and where each moving finger goes. Lifts are left out — the strong preview
 * already dims the dots that come off, and naming them is noise.
 */
export function narrateChange(
    instrument: InstrumentDef,
    from: VoicedBandChord,
    to: VoicedBandChord,
): string {
    const root = rootMove(instrument, from, to);
    const rootLine = `root ${root.text}${root.geometry ? ` — ${root.geometry}` : ''}.`;
    const { moves } = fingerMoves(instrument, from, to);
    const holds = moves.filter((m) => m.kind === 'hold').map((m) => m.finger);
    const parts = [
        ...(holds.length ? [holdsPhrase(holds)] : []),
        ...moves.filter((m) => m.kind === 'move').map((m) => `finger ${m.finger} ${m.text}`),
    ];
    if (!parts.length) {
        return rootLine;
    }
    const fingers = parts.join('; ');
    return `${rootLine} ${fingers[0].toUpperCase()}${fingers.slice(1)}.`;
}

const capitalise = (s: string): string => s[0].toUpperCase() + s.slice(1);

export interface NeckModel {
    /** The grip on the neck: the sounding chord, or the held one under a hold or N.C. */
    grip: VoicedBandChord | null;
    next: VoicedBandChord | null;
    /** What the chart says at the playhead: a chord's symbol, `N.C.`, or the held chord's. */
    name: string;
    /** The playhead is on a hold (the grip rings on) or an N.C. (the grip is shown, not played). */
    held: 'hold' | 'no-chord' | null;
    nextName: string | null;
    /** The narration line under the names. */
    narration: string;
    /** The chart's own symbol for an approximated grip ("the chart says C"), else null. */
    approximatedFrom: string | null;
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
    const name = held === 'no-chord' ? 'N.C.' : writtenName(soundingChord);
    const nextName = nextChord ? writtenName(nextChord) : null;
    const change = grip && next ? narrateChange(instrument, grip, next) : null;
    let narration = '';
    if (active === null) {
        narration = `Starts on ${name}.${nextName && change ? ` Then ${nextName}: ${change}` : ''}`;
    } else if (nextName && change) {
        narration = `Next: ${nextName}. ${capitalise(change)}`;
    }
    return {
        grip,
        next,
        name,
        held,
        nextName,
        narration,
        approximatedFrom: grip?.approximation ? writtenName(soundingChord) : null,
    };
}

/**
 * The shell's neck voicing: the per-device prefs, and the whole chart voiced once per loaded
 * chart + prefs — keyed by written index, never per frame. Voices nothing while the neck is not
 * showing.
 */
export function useNeckVoicing(band: BandChart | null, showing: boolean) {
    const { prefs, setPrefs } = useShellPrefs();
    const voiced = useMemo(
        () =>
            band && showing
                ? new Map(voiceBandChart(band, prefs).map((v) => [v.globalIndex, v] as const))
                : null,
        [band, showing, prefs],
    );
    return { prefs, setPrefs, voiced };
}
