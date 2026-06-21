const GENRE_DEFAULTS = {
    swing: 0,
    sub: '16th',
    chord: 'smart',
    harmony: 'smart',
};

type GenreOverride = Partial<typeof GENRE_DEFAULTS> & {
    drum?: string;
    feel?: string;
    bass?: string;
    soloist?: string;
    // #567 — per-genre default soloist phrasing mode, applied on genre selection.
    // Neo-Soul defaults to 'guitar' (2-voice) so its signature quartal/double-stop
    // color is live; in the default 'monophonic' mode those devices are polyphony-
    // gated and dead. Omitted = leave the user's current mode untouched. The user
    // can still switch modes after selecting the genre.
    soloistMode?: 'monophonic' | 'guitar';
    // Time signatures idiomatic for this genre — used to softly highlight
    // canonical meters in the time-signature picker (S10). Omitted = ['4/4'].
    // Non-blocking hint only: any genre × meter pairing still plays.
    meters?: string[];
};

const GENRE_OVERRIDES: Record<string, GenreOverride> = {
    Rock: {
        sub: '8th',
        drum: 'Basic Rock',
        feel: 'Rock',
        bass: 'rock',
        // #592: the Rock genre plays its tailored 'rock' profile (bluesy
        // bends/double-stops/pentatonic) — the idiomatic default. (#628 retired
        // the old 'shred' fast-lead profile; Rock owns the Rock/Metal lead voice.)
        soloist: 'rock',
    },
    Jazz: {
        swing: 60,
        sub: '8th',
        drum: 'Jazz',
        feel: 'Jazz',
        chord: 'jazz',
        bass: 'quarter',
        soloist: 'bird',
        harmony: 'horns',
        meters: ['4/4', '3/4', '6/8'], // swing · jazz waltz · All Blues
    },
    Funk: {
        swing: 15,
        drum: 'Funk',
        feel: 'Funk',
        chord: 'funk',
        bass: 'funk',
        soloist: 'funk',
        harmony: 'horns',
    },
    Disco: {
        drum: 'Disco',
        feel: 'Disco',
        bass: 'disco',
        soloist: 'disco',
    },
    'Hip Hop': {
        swing: 25,
        drum: 'Hip Hop',
        feel: 'Hip Hop',
        bass: 'hiphop',
        // #555: was 'neo' — the smart key out-prioritized GENRE_STYLE_MAPPING's
        // 'hiphop', so Hip Hop played Neo-Soul and the hand-tuned hiphop profile
        // was dead. Flip to the dedicated hook-lane profile (resolution guarded in
        // soloist-routing-guard.test.ts).
        soloist: 'hiphop',
    },
    Blues: {
        swing: 90,
        sub: '8th',
        drum: 'Blues Shuffle',
        feel: 'Blues',
        chord: 'jazz',
        bass: 'blues',
        soloist: 'blues',
        harmony: 'horns',
        meters: ['4/4', '12/8', '6/8'], // straight/shuffle · slow blues · All Blues
    },
    'Neo-Soul': {
        swing: 30,
        drum: 'Neo-Soul',
        feel: 'Neo-Soul',
        bass: 'neo',
        soloist: 'neo',
        // #567 — neo's quartal/guitarDouble color is polyphony-gated; default to
        // guitar (2-voice) so the signature double-stops are live in normal playback.
        soloistMode: 'guitar',
        harmony: 'strings',
    },
    Reggae: {
        swing: 20,
        drum: 'Reggae',
        feel: 'Reggae',
        bass: 'dub',
        // #570: activate the tailored 'reggae' soloist profile (skank/offbeat:
        // syncopationLikelihood 0.9, targetExtensions [2,6,9]) — it was fully
        // orphaned behind the generic 'minimal', which lands square on the
        // downbeats reggae deliberately leaves to bass + skank.
        soloist: 'reggae',
    },
    Acoustic: {
        swing: 15,
        sub: '8th',
        drum: 'Acoustic',
        feel: 'Acoustic',
        chord: 'pad',
        bass: 'acoustic',
        // #592: the Acoustic genre plays its hand-tuned 'acoustic' profile
        // (space-over-flash: restBase 0.15, slide/run devices) rather than the
        // generic 'minimal' it used to fall through to.
        soloist: 'acoustic',
        harmony: 'strings',
        meters: ['4/4', '3/4'], // ballads & waltz-time singer-songwriter
    },
    Bossa: {
        drum: 'Bossa Nova',
        feel: 'Bossa Nova',
        chord: 'jazz',
        bass: 'bossa',
        soloist: 'bossa',
        harmony: 'strings',
    },
    Country: {
        swing: 60,
        drum: 'Country (Two-Step)',
        feel: 'Country',
        chord: 'strum-country',
        bass: 'country',
        soloist: 'country',
        meters: ['4/4', '3/4'], // two-step · country waltz
    },
    Metal: {
        drum: 'Metal (Speed)',
        feel: 'Metal',
        chord: 'power-metal',
        bass: 'metal',
        soloist: 'metal',
    },
    'Ska-Punk': {
        sub: '8th',
        drum: 'Ska',
        feel: 'Ska',
        chord: 'ska-upstroke',
        bass: 'walking-ska',
        soloist: 'ska-horns',
        harmony: 'horns',
    },
};

export type SmartGenre = typeof GENRE_DEFAULTS & GenreOverride;

export const SMART_GENRES: Record<string, SmartGenre> = Object.keys(GENRE_OVERRIDES).reduce<
    Record<string, SmartGenre>
>((acc, key) => {
    acc[key] = { ...GENRE_DEFAULTS, ...GENRE_OVERRIDES[key] } as SmartGenre;
    return acc;
}, {});

export const GENRE_NAMES = Object.keys(GENRE_OVERRIDES);
export const GENRE_FEELS = Object.values(GENRE_OVERRIDES).map((g) => g.feel);

const DEFAULT_GENRE_METERS = ['4/4'];

/**
 * Canonical (idiomatic) time signatures per genre feel, keyed by `groove.genreFeel`.
 * Drives the soft time-signature hint in the topbar (S10) — non-blocking; any
 * genre × meter pairing still plays. Genres without an explicit `meters` field
 * default to 4/4.
 */
export const CANONICAL_METERS_BY_FEEL: Record<string, string[]> = Object.values(
    GENRE_OVERRIDES,
).reduce<Record<string, string[]>>((acc, override) => {
    if (override.feel) {
        acc[override.feel] = override.meters ?? DEFAULT_GENRE_METERS;
    }
    return acc;
}, {});

/** Idiomatic meters for a genre feel; falls back to 4/4 for unknown feels. */
export function getCanonicalMeters(genreFeel: string | undefined): string[] {
    return (genreFeel && CANONICAL_METERS_BY_FEEL[genreFeel]) || DEFAULT_GENRE_METERS;
}
