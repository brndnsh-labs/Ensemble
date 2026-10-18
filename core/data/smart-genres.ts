const GENRE_DEFAULTS = {
    chord: 'smart',
};

type GenreOverride = Partial<typeof GENRE_DEFAULTS> & {
    feel?: string;
    bass?: string;
    // #567 — per-genre default soloist phrasing mode, applied on genre selection.
    // Neo-Soul defaults to 'guitar' (2-voice) so its signature quartal/double-stop
    // color is live; in the default 'monophonic' mode those devices are polyphony-
    // gated and dead. Omitted = leave the user's current mode untouched. The user
    // can still switch modes after selecting the genre.
    soloistMode?: 'monophonic' | 'guitar';
};

/**
 * The genre authority table. Keys are the canonical genre NAMES (the 13-genre
 * canon — see `tests/standards/genre-canon-guard.test.ts`); `feel` is the runtime
 * FEEL the feel-keyed tables are keyed on. `satisfies` (rather than a `Record<string,…>`
 * annotation) is load-bearing: it keeps the literal key union alive so `CanonGenre`
 * below is the exact 13-name union and every per-genre authority map gets
 * COMPILE-TIME exhaustiveness. Read value-level lookups through `GENRES` (the
 * widened view) so optional fields stay accessible across the union.
 */
const GENRE_OVERRIDES = {
    Rock: {
        feel: 'Rock',
        bass: 'rock',
        // #856 — guitar-idiom lead: 2-voice so the double-stops are live on the
        // synth lead too (not gated on installing the electric-guitar pack).
        soloistMode: 'guitar',
    },
    Jazz: {
        feel: 'Jazz',
        chord: 'jazz',
        bass: 'quarter',
    },
    Funk: {
        feel: 'Funk',
        chord: 'funk',
        bass: 'funk',
        // #856 — guitar-idiom lead: tasteful 2-voice chord-stab double-stops.
        soloistMode: 'guitar',
    },
    Disco: {
        feel: 'Disco',
        bass: 'disco',
    },
    'Hip Hop': {
        feel: 'Hip Hop',
        bass: 'hiphop',
    },
    Blues: {
        feel: 'Blues',
        chord: 'jazz',
        bass: 'blues',
    },
    'Neo-Soul': {
        feel: 'Neo-Soul',
        bass: 'neo',
        // #567 — neo's quartal/guitarDouble color is polyphony-gated; default to
        // guitar (2-voice) so the signature double-stops are live in normal playback.
        soloistMode: 'guitar',
    },
    Reggae: {
        feel: 'Reggae',
        bass: 'dub',
    },
    Acoustic: {
        feel: 'Acoustic',
        // The chords lane plays a fingerpick arpeggio (the 'arp' style).
        chord: 'arp',
        bass: 'acoustic',
        // #856 — guitar-idiom lead: fingerstyle double-stops on the synth lead too.
        soloistMode: 'guitar',
    },
    Bossa: {
        feel: 'Bossa Nova',
        chord: 'jazz',
        bass: 'bossa',
    },
    Country: {
        feel: 'Country',
        chord: 'strum-country',
        bass: 'country',
        // #856 — guitar-idiom lead: chicken-pickin' double-stops by default.
        soloistMode: 'guitar',
    },
    Metal: {
        feel: 'Metal',
        chord: 'power-metal',
        bass: 'metal',
    },
    'Ska-Punk': {
        feel: 'Ska',
        chord: 'ska-upstroke',
        bass: 'walking-ska',
    },
} satisfies Record<string, GenreOverride>;

/**
 * Widened, value-level view of the authority table. `GENRE_OVERRIDES` itself keeps
 * its literal type (so `CanonGenre` is the 13-name union); every *read* goes through
 * this alias, because reading an optional field (`bass`, `soloistMode`, …) off the literal
 * union would not typecheck for the genres that omit it.
 */
const GENRES: Record<string, GenreOverride> = GENRE_OVERRIDES;

export type SmartGenre = typeof GENRE_DEFAULTS & GenreOverride;

export const SMART_GENRES: Record<string, SmartGenre> = Object.entries(GENRES).reduce<
    Record<string, SmartGenre>
>((acc, [key, override]) => {
    acc[key] = { ...GENRE_DEFAULTS, ...override } as SmartGenre;
    return acc;
}, Object.create(null));

export const GENRE_NAMES: string[] = Object.keys(GENRES);

/* ────────────────────────────────────────────────────────────────────────────
 * GENRE-NAMING AUTHORITY
 *
 * Three naming axes coexist BY DESIGN. Do not "simplify" them into one — each
 * has a different owner and a different lifetime:
 *
 *   1. CANON NAME   ('Bossa', 'Ska-Punk')  — the UI keyspace. Rendered by the
 *      genre picker and Surprise Me straight off `GENRE_NAMES`, stored in a chart
 *      as `band.groove.genre` (the only spelling the songbook codec accepts), held
 *      in state as `groove.lastSmartGenre`, and pinned by `genre-canon-guard.test.ts`.
 *      Changing one is a user-visible rename.
 *   2. FEEL         ('Bossa Nova', 'Ska')  — the runtime keyspace. Lives in the
 *      state's `groove.genreFeel`, set from the name when a genre is applied, and
 *      is what the feel-keyed tables are keyed on (the synth voices' genre trims;
 *      the old engine had ~20 more). It is a *musical* label ("this genre feels
 *      like a bossa nova"), deliberately free to differ from the picker label;
 *      several genres could legitimately share a feel in future. No stored chart
 *      holds a feel any more (#1741).
 *   3. (retired) GROOVE STRATEGY KEY ('latin', 'ska-punk') — the old engine's
 *      `core/engine/grooves/<key>.ts` basename for a kit, many-to-one with feels
 *      (Bossa's kit was `latin.ts`). Those modules went with the engine (#1404); the
 *      band's equivalent is the StyleId (`band/styles/<id>.ts`), looked up by genre
 *      in `STYLE_FOR_GENRE` (`web/lib/band-voices.ts`). NOTE: `'latin'`
 *      was a *strategy* key, NOT a genre — the retired `Latin` GENRE was deleted in
 *      #628 and must never be resurrected as a `GENRE_OVERRIDES` key or a feel.
 *
 * The divergence is small (2 of 13 names ≠ feel) but it is real, so a genre's
 * feel is always read off its entry (`SMART_GENRES[name].feel`), never assumed
 * equal to its name.
 * ──────────────────────────────────────────────────────────────────────────── */
