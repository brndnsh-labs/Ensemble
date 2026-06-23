/**
 * HARMONY-STYLES — per-genre harmony idiom profiles.
 *
 * Parallel to `bass-styles.ts` / `chords-styles.ts`: a single source of truth
 * mapping a genre `feel` to the three harmony decisions that used to be scattered
 * across three independent if/else layers in `harmonies.ts`:
 *
 *   1. `smartStyle`     — which timbre/voice the smart router picks (organ / strings
 *                         / horns / plucks / counter). Applied only when the user's
 *                         harmony style is 'smart'.
 *   2. `rhythmicStyle`  — the resolved pads-vs-stabs decision under 'smart'. 'pads'
 *                         routes to playSeaMode (sustained swells); 'stabs' routes to
 *                         playComperMode (rhythmic comping).
 *   3. `patternKey`     — which onset template `generateCompingPattern` renders.
 *
 * The `voicing` slot is the per-genre character layer the child stories populate
 * (rock 3rds/6ths, metal power-doubling, acoustic open/add9, country pedal-steel).
 *
 * Keys are the canonical `groove.genreFeel` values from `smart-genres.ts`. Note
 * the genre named "Ska-Punk" in the picker has `genreFeel === 'Ska'`; there is no
 * 'Ska-Punk' feel at runtime, so it is not a key here.
 */

export type HarmonySmartStyle = 'organ' | 'strings' | 'horns' | 'plucks' | 'counter';
export type HarmonyRhythmicStyle = 'pads' | 'stabs';

/**
 * Onset-template selector for `generateCompingPattern`. Named by rhythmic idiom,
 * not genre, so multiple genres can share a template and a genre can be repointed
 * (e.g. Ska: 'ska' backbeat → 'offbeat' skank) without touching the renderer.
 */
export type HarmonyPatternKey =
    | 'jazz' // Charleston
    | 'bossa' // bossa-nova samba cell
    | 'funk16' // 16th-note funk/disco grid
    | 'reggae' // organ-bubble (organ) OR backbeat skank (non-organ)
    | 'ska' // sparse offbeat horn stabs (&-of-2, &-of-4) above the guitar chop
    | 'neosoul' // laid-back stagger
    | 'default'; // generic 1 & 3 stabs

/** Per-genre voicing character. Populated incrementally by the child stories. */
export interface HarmonyVoicing {
    /** Harmonized diatonic 3rd-above / 6th-below lead line (rock). */
    harmonizedThirds?: boolean;
    /** Power-5th double (+ octave) at high intensity, paired with harmonizedThirds (rock). */
    powerDoubling?: boolean;
    /** Root-5th-octave power chord at every intensity, no 3rd (metal). */
    powerChord?: boolean;
    /** Long chord-tone swells with an added major-6th / 6-9 color (country pedal-steel). */
    pedalSteelSwell?: boolean;
    /** Replace the held pad with a gently rolling fingerpicked counter-line (acoustic). */
    arpeggiate?: boolean;
    /**
     * #716 — BB King big-band horn section: sparse, punchy call-and-response
     * stabs that ANSWER in the gaps (when the soloist rests / at phrase ends)
     * rather than comping every accent. Pairs with `smartStyle: 'horns'`.
     */
    hornSection?: boolean;
}

export interface HarmonyGenreProfile {
    smartStyle: HarmonySmartStyle;
    rhythmicStyle: HarmonyRhythmicStyle;
    patternKey: HarmonyPatternKey;
    voicing?: HarmonyVoicing;
}

/**
 * Generic fallback for an unmapped feel — reproduces the legacy `else → strings`
 * (pads, 1 & 3 stabs) fall-through so a new/unknown genre degrades gracefully.
 */
export const DEFAULT_HARMONY_PROFILE: HarmonyGenreProfile = {
    smartStyle: 'strings',
    rhythmicStyle: 'pads',
    patternKey: 'default',
};

/**
 * The genre table. Values reproduce the pre-refactor smart routing exactly
 * (guarded by `tests/standards/harmony-genre-routing.test.ts`); child stories
 * change a profile to give a genre its own idiom.
 */
export const HARMONY_GENRE_PROFILES: Record<string, HarmonyGenreProfile> = {
    Rock: {
        smartStyle: 'strings',
        rhythmicStyle: 'pads',
        patternKey: 'default',
        voicing: { harmonizedThirds: true, powerDoubling: true },
    },
    Jazz: { smartStyle: 'organ', rhythmicStyle: 'stabs', patternKey: 'jazz' },
    Funk: { smartStyle: 'horns', rhythmicStyle: 'stabs', patternKey: 'funk16' },
    Disco: { smartStyle: 'strings', rhythmicStyle: 'stabs', patternKey: 'funk16' },
    'Hip Hop': { smartStyle: 'plucks', rhythmicStyle: 'stabs', patternKey: 'default' },
    // #716 — the BB King horn section: a horn voice playing sparse call-and-
    // response stabs that answer the soloist/vocal in the gaps.
    Blues: {
        smartStyle: 'horns',
        rhythmicStyle: 'stabs',
        patternKey: 'default',
        voicing: { hornSection: true },
    },
    'Neo-Soul': { smartStyle: 'organ', rhythmicStyle: 'stabs', patternKey: 'neosoul' },
    Reggae: { smartStyle: 'organ', rhythmicStyle: 'stabs', patternKey: 'reggae' },
    Acoustic: {
        smartStyle: 'strings',
        rhythmicStyle: 'pads',
        patternKey: 'default',
        voicing: { arpeggiate: true },
    },
    'Bossa Nova': { smartStyle: 'strings', rhythmicStyle: 'stabs', patternKey: 'bossa' },
    Country: {
        smartStyle: 'strings',
        rhythmicStyle: 'pads',
        patternKey: 'default',
        voicing: { pedalSteelSwell: true },
    },
    Metal: {
        smartStyle: 'horns',
        rhythmicStyle: 'stabs',
        patternKey: 'default',
        voicing: { powerChord: true },
    },
    Ska: { smartStyle: 'horns', rhythmicStyle: 'stabs', patternKey: 'ska' },
};

/** Look up a genre's harmony profile, falling back to the generic default. */
export function resolveHarmonyProfile(feel: string): HarmonyGenreProfile {
    return HARMONY_GENRE_PROFILES[feel] ?? DEFAULT_HARMONY_PROFILE;
}
