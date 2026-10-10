/**
 * A whole chart as shells (#1585): one grip per written chord, voiced in one pass so the hand
 * stays put across the song. The stand (#1587) looks a slot's grip up by `globalIndex`, the
 * written event the slot performs, so a repeat or a D.C. reuses the grip it was voiced with.
 */
import type { BandChart } from '../band-chart';
import { shellChord } from './adapter';
import { GUITAR, UKULELE, UKULELE_LOW_G } from './instruments';
import type { HomeWindow, InstrumentDef, Quality, Spelled, VoicedChord } from './types';
import { voiceChart } from './voicing';

export interface ShellPrefs {
    instrument: 'guitar' | 'uke' | 'uke-low-g';
    /** Inclusive fret window the hand stays in, or null for anywhere on the neck. */
    home: HomeWindow | null;
    /** `classic` keeps guitar roots on the 6th and 5th strings; a uke ignores it. */
    rootStrings: 'all' | 'classic';
}

// A type alias, not an interface: `ChartChord`'s extra-fields index signature needs one.
type BandShellChord = {
    root: Spelled;
    quality: Quality;
    /** Index into `BandChart.chords`. */
    globalIndex: number;
    approximation: string | null;
};

export type VoicedBandChord = VoicedChord<BandShellChord>;

const INSTRUMENTS: Record<ShellPrefs['instrument'], InstrumentDef> = {
    guitar: GUITAR,
    uke: UKULELE,
    'uke-low-g': UKULELE_LOW_G,
};

/** Voice every written chord of a chart, in written order; holds and N.C. have nothing to voice. */
export function voiceBandChart(chart: BandChart, prefs: ShellPrefs): VoicedBandChord[] {
    const instrument = INSTRUMENTS[prefs.instrument];
    const shells: BandShellChord[] = [];
    for (const written of chart.chords) {
        if (written.kind !== 'chord' || written.chord === null) {
            continue;
        }
        // Each chord carries its own key, so a key change mid-chart spells by the new key.
        const shell = shellChord(
            written.chord,
            written.key,
            written.keyIsMinor === true,
            written.display?.name.root ?? '',
        );
        shells.push({ ...shell, globalIndex: written.globalIndex });
    }
    return voiceChart(shells, {
        instrument,
        home: prefs.home,
        rootStrings: prefs.rootStrings === 'classic' && instrument === GUITAR ? [6, 5] : undefined,
    });
}
