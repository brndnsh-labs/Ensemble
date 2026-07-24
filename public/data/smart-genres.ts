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

/**
 * The genre authority table. Keys are the canonical genre NAMES (the 13-genre
 * canon — see `tests/standards/genre-canon-guard.test.ts`); `feel` is the runtime
 * FEEL every engine table is keyed on. `satisfies` (rather than a `Record<string,…>`
 * annotation) is load-bearing: it keeps the literal key union alive so `CanonGenre`
 * below is the exact 13-name union and every per-genre authority map gets
 * COMPILE-TIME exhaustiveness. Read value-level lookups through `GENRES` (the
 * widened view) so optional fields stay accessible across the union.
 */
const GENRE_OVERRIDES = {
    Rock: {
        sub: '8th',
        drum: 'Basic Rock',
        feel: 'Rock',
        bass: 'rock',
        // #592: the Rock genre plays its tailored 'rock' profile (bluesy
        // bends/double-stops/pentatonic) — the idiomatic default. (#628 retired
        // the old 'shred' fast-lead profile; Rock owns the Rock/Metal lead voice.)
        soloist: 'rock',
        // #856 — guitar-idiom lead: 2-voice so the double-stops are live on the
        // synth lead too (not gated on installing the electric-guitar pack).
        soloistMode: 'guitar',
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
        // #856 — guitar-idiom lead: tasteful 2-voice chord-stab double-stops.
        soloistMode: 'guitar',
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
        // The chords lane plays a fingerpick arpeggio (the 'arp' style); the
        // strings harmony holds the sustained pad underneath — each instrument
        // on its idiomatic gesture. See accompaniment.ts + harmony-styles.ts.
        chord: 'arp',
        bass: 'acoustic',
        // #592: the Acoustic genre plays its hand-tuned 'acoustic' profile
        // (space-over-flash: restBase 0.15, slide/run devices) rather than the
        // generic 'minimal' it used to fall through to.
        soloist: 'acoustic',
        // #856 — guitar-idiom lead: fingerstyle double-stops on the synth lead too.
        soloistMode: 'guitar',
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
        // A country two-step is a STRAIGHT-to-light-shuffle 8th feel (the boom-chick),
        // not a heavy swing. It previously ran swing:60 on the *16th* grid (default
        // sub) → a 1.5:1 laid-back-SIXTEENTHS pocket (hip-hop/neo-soul territory) that
        // lurched against the two-step. Move it to the 8th grid where every other
        // swung genre lives, with a light lilt (30 → ~1.22:1 8th ratio) — a hair of
        // country bounce, not the Jazz/Blues shuffle. See swing-ratio-audit.test.ts.
        swing: 30,
        sub: '8th',
        drum: 'Country (Two-Step)',
        feel: 'Country',
        chord: 'strum-country',
        bass: 'country',
        soloist: 'country',
        // #856 — guitar-idiom lead: chicken-pickin' double-stops by default.
        soloistMode: 'guitar',
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
} satisfies Record<string, GenreOverride>;

/**
 * Canonical genre NAME — the UI/picker keyspace (`GENRE_NAMES`,
 * `groove.lastSmartGenre`, share-URL `?genre=`). Exactly the 13-genre canon.
 */
export type CanonGenre = keyof typeof GENRE_OVERRIDES;

/**
 * Widened, value-level view of the authority table. `GENRE_OVERRIDES` itself keeps
 * its literal type (so `CanonGenre` is the 13-name union); every *read* goes through
 * this alias, because reading an optional field (`meters`, `bass`, …) off the literal
 * union would not typecheck for the genres that omit it.
 */
const GENRES: Record<string, GenreOverride> = GENRE_OVERRIDES;

export type SmartGenre = typeof GENRE_DEFAULTS & GenreOverride;

export const SMART_GENRES: Record<string, SmartGenre> = Object.entries(GENRES).reduce<
    Record<string, SmartGenre>
>((acc, [key, override]) => {
    acc[key] = { ...GENRE_DEFAULTS, ...override } as SmartGenre;
    return acc;
}, {});

export const GENRE_NAMES: string[] = Object.keys(GENRES);
// filter, not `as string`: a genre missing `feel` would otherwise put a literal
// `undefined` into this array and silently poison every membership guard keyed
// off it.
export const GENRE_FEELS: string[] = Object.values(GENRES)
    .map((g) => g.feel)
    .filter((f): f is string => Boolean(f));

/* ────────────────────────────────────────────────────────────────────────────
 * GENRE-NAMING AUTHORITY
 *
 * Three naming axes coexist BY DESIGN. Do not "simplify" them into one — each
 * has a different owner and a different lifetime:
 *
 *   1. CANON NAME   ('Bossa', 'Ska-Punk')  — the UI keyspace. Rendered by the
 *      genre picker and Surprise Me straight off `GENRE_NAMES`, persisted as
 *      `groove.lastSmartGenre`, and pinned by `genre-canon-guard.test.ts`.
 *      Changing one is a user-visible rename.
 *   2. FEEL         ('Bossa Nova', 'Ska')  — the runtime keyspace. Lives in
 *      `groove.genreFeel` and is what ~20 engine tables are keyed on
 *      (`GENRE_POCKET`, `HARMONY_GENRE_PROFILES`, `STICKY_GENRES`, …). It is a
 *      *musical* label ("this genre feels like a bossa nova"), deliberately free
 *      to differ from the picker label; several genres could legitimately share
 *      a feel in future. Pinned by `genre-feel-canon-guard.test.ts`.
 *   3. GROOVE STRATEGY KEY ('latin', 'ska-punk') — the ENGINE-MODULE keyspace:
 *      the `public/engine/grooves/<key>.ts` basename that implements the kit.
 *      Many-to-one with feels by design (Bossa's kit is `latin.ts`, the sole
 *      Latin-family engine). NOTE: `'latin'` here is a *strategy* key, NOT a
 *      genre — the retired `Latin` GENRE was deleted in #628 and must never be
 *      resurrected as a `GENRE_OVERRIDES` key or a feel.
 *
 * The divergence is small (2 of 13 names ≠ feel, 1 strategy key ≠ feel) but it is
 * real, so it is reconciled HERE, once, instead of ad-hoc at every call site.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Reverse feel → canonical-genre-name lookup. Eleven genres have `name === feel`;
 * exactly two diverge — `Ska-Punk` → `Ska` and `Bossa` → `Bossa Nova` — which is why
 * anything receiving a genre string from outside (share URLs, persisted sessions)
 * must translate rather than assume the two keyspaces are the same.
 */
const GENRE_NAME_BY_FEEL: Record<string, string> = Object.entries(GENRES).reduce<
    Record<string, string>
>((acc, [name, override]) => {
    if (override.feel) {
        acc[override.feel] = name;
    }
    return acc;
}, {});

/** Canon genre NAME → runtime FEEL. `null` for anything outside the canon. */
export function canonToFeel(name: string | null | undefined): string | null {
    return (name && GENRES[name]?.feel) || null;
}

/** Runtime FEEL → canon genre NAME. `null` for anything outside the canon. */
export function feelToCanon(feel: string | null | undefined): string | null {
    return (feel && GENRE_NAME_BY_FEEL[feel]) || null;
}

/**
 * Groove strategy module keys — each is a `public/engine/grooves/<key>.ts` file.
 * `groove-engine.ts` maps each key to its imported module; adding a key here
 * without a module (or vice versa) is a typecheck error there.
 */
export type GrooveStrategyKey =
    | 'acoustic'
    | 'blues'
    | 'country'
    | 'disco'
    | 'funk'
    | 'hiphop'
    | 'jazz'
    | 'latin'
    | 'metal'
    | 'neo-soul'
    | 'reggae'
    | 'rock'
    | 'ska-punk';

/**
 * The Latin-FAMILY kit. `'latin'` is a groove-strategy key, not a genre: Bossa is
 * the single selectable Latin-family genre (#628 retired the generic `Latin` genre
 * and the World/Latin drum bank as unreachable), and `latin.ts` is its live engine.
 * A second Latin-family genre would map its own feel to this same key.
 */
export const LATIN_GROOVE_STRATEGY: GrooveStrategyKey = 'latin';

/**
 * Canon genre NAME → groove strategy key. `Record<CanonGenre, …>` is deliberate:
 * adding a 14th genre to `GENRE_OVERRIDES` fails typecheck here until its kit is
 * chosen, instead of silently falling through to `DEFAULT_CONFIG` at runtime.
 */
export const GROOVE_STRATEGY_BY_GENRE: Record<CanonGenre, GrooveStrategyKey> = {
    Rock: 'rock',
    Jazz: 'jazz',
    Funk: 'funk',
    Disco: 'disco',
    'Hip Hop': 'hiphop',
    Blues: 'blues',
    'Neo-Soul': 'neo-soul',
    Reggae: 'reggae',
    Acoustic: 'acoustic',
    // why: Bossa's kit is the Latin-family engine (`grooves/latin.ts`), including
    // the compound-meter Bembé bell in 6/8 and 12/8 (#628). Name ≠ feel ≠ strategy
    // key here — the exact drift this authority exists to hold in one place.
    Bossa: 'latin',
    Country: 'country',
    Metal: 'metal',
    'Ska-Punk': 'ska-punk',
};

/** Runtime FEEL → groove strategy key. Derived; never hand-maintained. */
export const GROOVE_STRATEGY_BY_FEEL: Record<string, GrooveStrategyKey> = Object.entries(
    GROOVE_STRATEGY_BY_GENRE,
).reduce<Record<string, GrooveStrategyKey>>((acc, [name, key]) => {
    const feel = canonToFeel(name);
    if (feel) {
        acc[feel] = key;
    }
    return acc;
}, {});

const STRATEGY_BY_GENRE_LOOKUP: Record<string, GrooveStrategyKey> = GROOVE_STRATEGY_BY_GENRE;

/**
 * THE canonical Latin-family predicate, in either keyspace.
 *
 * why both arguments: `groove.genreFeel` is the runtime authority, but the groove
 * engine has always also accepted the canon name (`groove.lastSmartGenre`) so a
 * partially-synced groove slice still routes Bossa to its own kit rather than
 * silently to `DEFAULT_CONFIG`. Keeping the OR here preserves that exactly, and
 * keeps drum dispatch and the snare-syncopation exemption on ONE predicate — they
 * were forked (`genreFeel === 'Bossa Nova' || lastSmartGenre === 'Bossa'` vs a
 * `config.isLatin` flag on the strategy config) until #1177.
 */
export function isLatinGrooveFamily(
    genreFeel: string | null | undefined,
    genreName?: string | null | undefined,
): boolean {
    return (
        GROOVE_STRATEGY_BY_FEEL[genreFeel ?? ''] === LATIN_GROOVE_STRATEGY ||
        STRATEGY_BY_GENRE_LOOKUP[genreName ?? ''] === LATIN_GROOVE_STRATEGY
    );
}

/**
 * Runtime FEEL → smart bass style, DERIVED from `GENRE_OVERRIDES[*].bass` so the
 * genre's declared bass style and the engine's `smart`-mode routing table cannot
 * drift apart (they were hand-parallel until #1177). Consumed as
 * `SMART_BASS_STYLE_MAP` in `config.ts`.
 */
export const BASS_STYLE_BY_FEEL: Record<string, string> = Object.values(GENRES).reduce<
    Record<string, string>
>((acc, override) => {
    if (override.feel && override.bass) {
        acc[override.feel] = override.bass;
    }
    return acc;
}, {});

/**
 * Normalize a genre string arriving in *either* keyspace into the canonical pair.
 *
 * The UI and `groove.lastSmartGenre` speak genre NAMES; the engine and
 * `groove.genreFeel` speak FEELS, and every feel-keyed table (`GENRE_POCKET`, the
 * groove `strategies` map, `SMART_SCALE_STYLE_MAP`, `DROP_FRIENDLY_GENRES`, harmony
 * styles) misses on a name. Share URLs carry the feel (`sharing.ts` emits
 * `groove.genreFeel`), but hand-written and older links carry the name — accept both,
 * and return `null` for anything in neither keyspace so callers reject it instead of
 * writing a phantom key into `genreFeel` (#1130 / #1200).
 */
export function resolveGenre(
    input: string | null | undefined,
): { name: string; feel: string } | null {
    if (!input) {
        return null;
    }
    // Feel-space first: no feel collides with another genre's name, so order is
    // only a matter of which lookup is the common case (the share writer's output).
    const nameForFeel = feelToCanon(input);
    if (nameForFeel) {
        return { name: nameForFeel, feel: input };
    }
    const feelForName = canonToFeel(input);
    if (feelForName) {
        return { name: input, feel: feelForName };
    }
    return null;
}

const DEFAULT_GENRE_METERS = ['4/4'];

/**
 * Canonical (idiomatic) time signatures per genre feel, keyed by `groove.genreFeel`.
 * Drives the soft time-signature hint in the topbar (S10) — non-blocking; any
 * genre × meter pairing still plays. Genres without an explicit `meters` field
 * default to 4/4.
 */
export const CANONICAL_METERS_BY_FEEL: Record<string, string[]> = Object.values(GENRES).reduce<
    Record<string, string[]>
>((acc, override) => {
    if (override.feel) {
        acc[override.feel] = override.meters ?? DEFAULT_GENRE_METERS;
    }
    return acc;
}, {});

/** Idiomatic meters for a genre feel; falls back to 4/4 for unknown feels. */
export function getCanonicalMeters(genreFeel: string | undefined): string[] {
    return (genreFeel && CANONICAL_METERS_BY_FEEL[genreFeel]) || DEFAULT_GENRE_METERS;
}
