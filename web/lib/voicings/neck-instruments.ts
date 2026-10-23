/**
 * The neck's settings shape and its instrument table, apart from the voicer (#1877): the
 * stand's eager code (`lib/session.ts` validates stored prefs against these keys) reads them
 * without pulling `voicing.ts`/`fingering.ts`, which load only when the neck opens.
 */
import { GUITAR, UKULELE, UKULELE_LOW_G } from './instruments';
import type { HomeWindow, InstrumentDef } from './types';

export interface NeckPrefs {
    instrument: 'guitar' | 'uke' | 'uke-low-g';
    /** Inclusive fret window the hand stays in, or null for anywhere on the neck. */
    home: HomeWindow | null;
    /** `classic` keeps guitar roots on the 6th and 5th strings; a uke ignores it. */
    rootStrings: 'all' | 'classic';
}

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
