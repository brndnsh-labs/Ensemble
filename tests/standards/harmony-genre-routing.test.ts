/**
 * HARMONY GENRE-ROUTING CHARACTERIZATION
 *
 * Golden-master guard for the #556 harmony-profile refactor. Before the refactor,
 * genre → (style, rhythmicStyle, comping-pattern) routing was three scattered
 * if/else layers in harmonies.ts; it now flows through HARMONY_GENRE_PROFILES
 * (harmony-styles.ts). This test pins the EXACT pre-refactor routing for every
 * runtime feel so the extraction is provably behavior-preserving. The child
 * stories that deliberately change a genre's idiom (rock 3rds/6ths, disco
 * strings, ska offbeat, …) update the relevant expectation here in the same
 * commit — a diff to this table is the visible record that behavior changed.
 *
 * The comping-pattern golden arrays were captured at seed 12345 / 4-4 from the
 * pre-refactor generateCompingPattern (deterministic given seed).
 */
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { generateCompingPattern } from '../../public/engine/harmonies.js';
import {
    DEFAULT_HARMONY_PROFILE,
    HARMONY_GENRE_PROFILES,
    type HarmonyGenreProfile,
    resolveHarmonyProfile,
} from '../../public/engine/harmony-styles.js';

const SEED = 12345;
const TS = TIME_SIGNATURES['4/4'];

// Expected smart-path routing per runtime feel (the pre-refactor table).
const EXPECTED_PROFILE: Record<string, Omit<HarmonyGenreProfile, 'voicing'>> = {
    Rock: { smartStyle: 'strings', rhythmicStyle: 'pads', patternKey: 'default' },
    Jazz: { smartStyle: 'organ', rhythmicStyle: 'stabs', patternKey: 'jazz' },
    Funk: { smartStyle: 'horns', rhythmicStyle: 'stabs', patternKey: 'funk16' },
    Disco: { smartStyle: 'strings', rhythmicStyle: 'stabs', patternKey: 'funk16' },
    'Hip Hop': { smartStyle: 'plucks', rhythmicStyle: 'stabs', patternKey: 'default' },
    Blues: { smartStyle: 'organ', rhythmicStyle: 'stabs', patternKey: 'default' },
    'Neo-Soul': { smartStyle: 'organ', rhythmicStyle: 'stabs', patternKey: 'neosoul' },
    Reggae: { smartStyle: 'organ', rhythmicStyle: 'stabs', patternKey: 'reggae' },
    Acoustic: { smartStyle: 'strings', rhythmicStyle: 'pads', patternKey: 'default' },
    'Bossa Nova': { smartStyle: 'strings', rhythmicStyle: 'stabs', patternKey: 'bossa' },
    Country: { smartStyle: 'strings', rhythmicStyle: 'pads', patternKey: 'default' },
    Metal: { smartStyle: 'horns', rhythmicStyle: 'stabs', patternKey: 'default' },
    Ska: { smartStyle: 'horns', rhythmicStyle: 'stabs', patternKey: 'ska' },
    Afrobeat: { smartStyle: 'horns', rhythmicStyle: 'stabs', patternKey: 'funk16' },
};

// Pre-refactor generateCompingPattern output, captured at seed 12345 / 4-4.
const DEFAULT_PATTERN = [
    1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0,
];
const FUNK16_PATTERN = [
    1, 0, 0, 3, 0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 3, 0, 1, 0, 0, 0, 0, 2, 0, 3, 0, 2, 3, 0, 2, 0, 0, 0,
];
const GOLDEN_PATTERN: Record<string, number[]> = {
    Rock: DEFAULT_PATTERN,
    Jazz: [
        1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0,
        0,
    ],
    Funk: FUNK16_PATTERN,
    Disco: FUNK16_PATTERN,
    'Hip Hop': DEFAULT_PATTERN,
    Blues: DEFAULT_PATTERN,
    'Neo-Soul': [
        0, 1, 0, 0, 0, 0, 0, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        2,
    ],
    Reggae: [
        0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1,
        0,
    ],
    Acoustic: DEFAULT_PATTERN,
    'Bossa Nova': [
        1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1,
        0,
    ],
    Country: DEFAULT_PATTERN,
    Metal: DEFAULT_PATTERN,
    // #562: sparse offbeat horn stabs on &-of-2 / &-of-4 (steps 6, 14, 22, 30),
    // replacing the former beats-2&4 backbeat (steps 4, 12, 20, 28).
    Ska: [
        0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1,
        0,
    ],
    Afrobeat: FUNK16_PATTERN,
};

describe('Harmony genre routing (characterization)', () => {
    const feels = Object.keys(EXPECTED_PROFILE);

    it.each(feels)('%s resolves to the pinned smart profile', (feel) => {
        const profile = resolveHarmonyProfile(feel);
        expect(profile.smartStyle).toBe(EXPECTED_PROFILE[feel].smartStyle);
        expect(profile.rhythmicStyle).toBe(EXPECTED_PROFILE[feel].rhythmicStyle);
        expect(profile.patternKey).toBe(EXPECTED_PROFILE[feel].patternKey);
    });

    it.each(feels)('%s renders the pinned comping pattern', (feel) => {
        const profile = resolveHarmonyProfile(feel);
        // Under smart, the rendered activeStyle is the profile's smartStyle.
        const pattern = generateCompingPattern(profile.patternKey, SEED, TS, profile.smartStyle);
        expect(pattern).toEqual(GOLDEN_PATTERN[feel]);
    });

    it('maps exactly the canonical runtime feels (no typo silently falling to default)', () => {
        // Guards the canonical-genre-key hazard: a misspelled key resolves to
        // DEFAULT silently rather than erroring. Pin the exact key set.
        expect(Object.keys(HARMONY_GENRE_PROFILES).sort()).toEqual(feels.slice().sort());
    });

    it('falls back to the generic default for an unmapped feel', () => {
        expect(resolveHarmonyProfile('Polka-Core')).toBe(DEFAULT_HARMONY_PROFILE);
        expect(DEFAULT_HARMONY_PROFILE).toEqual({
            smartStyle: 'strings',
            rhythmicStyle: 'pads',
            patternKey: 'default',
        });
    });
});
