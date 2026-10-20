/**
 * A whole chart voiced (#1585): one grip per written chord (a shell or a triad grip), voiced in
 * one pass so the hand stays put across the song. The stand (#1587) looks a slot's grip up by
 * `globalIndex`, the written event the slot performs, so a repeat or a D.C. reuses the grip it
 * was voiced with.
 */
import { notePc } from '@band/index';
import type { BandChart } from '../band-chart';
import { type VoicingChord, voicingChord } from './adapter';
import type { HomeKey } from './home-window';
import { GUITAR, UKULELE, UKULELE_LOW_G } from './instruments';
import type { HomeWindow, InstrumentDef, VoicedChord } from './types';
import { voiceChart } from './voicing';

export interface NeckPrefs {
    instrument: 'guitar' | 'uke' | 'uke-low-g';
    /** Inclusive fret window the hand stays in, or null for anywhere on the neck. */
    home: HomeWindow | null;
    /** `classic` keeps guitar roots on the 6th and 5th strings; a uke ignores it. */
    rootStrings: 'all' | 'classic';
}

/** A chord to voice, with its index into `BandChart.chords`. */
type BandVoicingChord = VoicingChord & { globalIndex: number };

export type VoicedBandChord = VoicedChord<BandVoicingChord>;

/**
 * The neck's instruments by pref id: the one table every caller reads. A plain literal is safe
 * here — its key is only ever an already-validated pref (`lib/session.ts` checks a stored value
 * against these keys), never a raw stored or shared value.
 */
export const NECK_INSTRUMENTS: Record<NeckPrefs['instrument'], InstrumentDef> = {
    guitar: GUITAR,
    uke: UKULELE,
    'uke-low-g': UKULELE_LOW_G,
};

/**
 * The key a chart's hand position is chosen for (#1598): the key it OPENS in, read off its first
 * written event (a chord, hold or N.C. — each carries its bar's key), or null for an empty chart.
 * A chart that changes key keeps this one window: the home window is where the hand stays for
 * the whole tune, and a player reading a bridge in another key reaches for it from the position
 * they are in rather than re-seating the hand.
 */
export function chartHomeKey(chart: BandChart): HomeKey | null {
    const first = chart.chords[0];
    return first ? { tonic: notePc(first.key), minor: first.keyIsMinor === true } : null;
}

/** Voice every written chord of a chart, in written order; holds and N.C. have nothing to voice. */
export function voiceBandChart(chart: BandChart, prefs: NeckPrefs): VoicedBandChord[] {
    const instrument = NECK_INSTRUMENTS[prefs.instrument];
    const chords: BandVoicingChord[] = [];
    for (const written of chart.chords) {
        if (written.kind !== 'chord' || written.chord === null) {
            continue;
        }
        // Each chord carries its own key, so a key change mid-chart spells by the new key.
        const read = voicingChord(
            written.chord,
            written.key,
            written.keyIsMinor === true,
            written.display?.name.root ?? '',
            instrument,
        );
        chords.push({ ...read, globalIndex: written.globalIndex });
    }
    return voiceChart(chords, {
        instrument,
        home: prefs.home,
        rootStrings: prefs.rootStrings === 'classic' && instrument === GUITAR ? [6, 5] : undefined,
    });
}
