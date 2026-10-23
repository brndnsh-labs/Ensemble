/**
 * A whole chart voiced (#1585): one grip per written chord (a shell or a triad grip), voiced in
 * one pass so the hand stays put across the song. The stand (#1587) looks a slot's grip up by
 * `globalIndex`, the written event the slot performs, so a repeat or a D.C. reuses the grip it
 * was voiced with.
 */
import type { BandChart } from '../band-chart';
import { type VoicingChord, voicingChord } from './adapter';
import { GUITAR } from './instruments';
import { NECK_INSTRUMENTS, type NeckPrefs } from './neck-instruments';
import type { VoicedChord } from './types';
import { voiceChart } from './voicing';

/** A chord to voice, with its index into `BandChart.chords`. */
type BandVoicingChord = VoicingChord & { globalIndex: number };

export type VoicedBandChord = VoicedChord<BandVoicingChord>;

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
