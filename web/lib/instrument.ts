/**
 * "What do you play?" (#1992): the one per-device choice of the musician's own instrument, and
 * everything it sets. A device preference (`lib/session.ts`'s `playerInstrument`), never a chart
 * field: the chart says what the song is, this says who is standing at the stand.
 *
 * - `lane` is the band lane it mutes whenever a chart opens, and that mute is a hole for you
 *   (`BandSettings.you`): the band plays as if you were there. Unmuted, the lane plays as today.
 * - `shift` is how far the chords on the stand are moved for a transposing instrument, in
 *   semitones up from concert: B♭ reads a whole step up, E♭ a major sixth up. Display only.
 * - `neck` makes Neck the stand's view when the instrument is chosen.
 *
 * The decision behind every row is Brandon's (2026-11-01, on #1992): rhythm guitar mutes the
 * band's chords; lead guitar keeps them and leaves the soloist off; both default to Neck.
 */
import type { InstrumentModule } from '@core/types';

export const PLAYER_INSTRUMENTS = [
    'guitar-rhythm',
    'guitar-lead',
    'bass',
    'keys',
    'drums',
    'horn-bb',
    'horn-eb',
    'voice',
    'listening',
] as const;
export type PlayerInstrument = (typeof PLAYER_INSTRUMENTS)[number];

export interface InstrumentRole {
    /** How the choice reads in Settings and the first-run prompt. */
    label: string;
    /** How it reads on the stand's chip: short. */
    short: string;
    /** One word, for the chip on a phone; a horn's is its key, the fact the stand changes. */
    tag: string;
    /** The band lane that is yours, muted for you when a chart opens; null mutes nothing. */
    lane: InstrumentModule | null;
    /** Semitones the stand's chord symbols move up from concert (0 for a concert instrument). */
    shift: number;
    /** Whether choosing it turns the stand to Neck view. */
    neck: boolean;
}

/**
 * Keyed only by an id already checked against `PLAYER_INSTRUMENTS` (`playerInstrument` reads the
 * stored value strictly), so a plain literal is safe here (the #1266 rule).
 */
export const INSTRUMENT_ROLES: Record<PlayerInstrument, InstrumentRole> = {
    'guitar-rhythm': {
        label: 'Guitar — rhythm',
        short: 'Rhythm guitar',
        tag: 'Rhythm',
        lane: 'chords',
        shift: 0,
        neck: true,
    },
    'guitar-lead': {
        label: 'Guitar — lead',
        short: 'Lead guitar',
        tag: 'Lead',
        lane: 'soloist',
        shift: 0,
        neck: true,
    },
    bass: { label: 'Bass', short: 'Bass', tag: 'Bass', lane: 'bass', shift: 0, neck: false },
    keys: { label: 'Keys', short: 'Keys', tag: 'Keys', lane: 'chords', shift: 0, neck: false },
    drums: { label: 'Drums', short: 'Drums', tag: 'Drums', lane: 'groove', shift: 0, neck: false },
    'horn-bb': {
        label: 'Horn (B♭)',
        short: 'B♭ horn',
        tag: 'B♭',
        lane: 'soloist',
        shift: 2,
        neck: false,
    },
    'horn-eb': {
        label: 'Horn (E♭)',
        short: 'E♭ horn',
        tag: 'E♭',
        lane: 'soloist',
        shift: 9,
        neck: false,
    },
    voice: { label: 'Voice', short: 'Voice', tag: 'Voice', lane: 'soloist', shift: 0, neck: false },
    listening: {
        label: 'Just listening',
        short: 'Listening',
        tag: 'Listening',
        lane: null,
        shift: 0,
        neck: false,
    },
};

/** The lane that is yours, or null — for no choice yet as for "Just listening". */
export function instrumentLane(instrument: PlayerInstrument | null): InstrumentModule | null {
    return instrument ? INSTRUMENT_ROLES[instrument].lane : null;
}

/** How far the stand's chord symbols move for this instrument (0 for none chosen). */
export function instrumentShift(instrument: PlayerInstrument | null): number {
    return instrument ? INSTRUMENT_ROLES[instrument].shift : 0;
}
