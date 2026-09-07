import { afterEach, describe, expect, it } from 'vitest';
import { GENRE_NAMES, SMART_GENRES } from '../../public/data/smart-genres.js';
import { SOUND_PACKS } from '../../public/data/sound-packs.js';
import {
    __resetPackCacheForTest,
    markPackInstalled,
} from '../../public/engine/instrument-registry.js';
import {
    handleEffects,
    reconcileUrlGenreOnBoot,
    resolveAutoVoices,
} from '../../public/state/state-effects.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS, type InstrumentModule } from '../../public/types.js';
import { enterGenre } from '../utils/genre-entry.js';

// Approved defaults, independent of the tables under test. In particular, the
// Acoustic preset is still arp + strings; optional players are tested separately.
const ROUTES = [
    [
        'Rock',
        'Rock',
        'rock',
        'smart',
        'rock',
        'smart',
        'grand',
        'strings-ensemble',
        'electric-guitar-driven',
        '',
        'acoustic-kit',
    ],
    [
        'Jazz',
        'Jazz',
        'quarter',
        'jazz',
        'bird',
        'horns',
        'grand',
        'horns-section',
        'sax-alto',
        'upright-bass',
        'acoustic-kit',
    ],
    [
        'Funk',
        'Funk',
        'funk',
        'funk',
        'funk',
        'horns',
        'clavinet',
        'horns-section',
        'electric-guitar-clean',
        '',
        'acoustic-kit',
    ],
    [
        'Disco',
        'Disco',
        'disco',
        'smart',
        'disco',
        'smart',
        'rhodes',
        'strings-ensemble',
        '',
        '',
        'acoustic-kit',
    ],
    ['Hip Hop', 'Hip Hop', 'hiphop', 'smart', 'hiphop', 'smart', 'rhodes', '', '', '', ''],
    [
        'Blues',
        'Blues',
        'blues',
        'jazz',
        'blues',
        'horns',
        'hammond-organ',
        'horns-section',
        'sax-alto',
        'upright-bass',
        'acoustic-kit',
    ],
    [
        'Neo-Soul',
        'Neo-Soul',
        'neo',
        'smart',
        'neo',
        'strings',
        'rhodes',
        '',
        '',
        '',
        'acoustic-kit',
    ],
    [
        'Reggae',
        'Reggae',
        'dub',
        'smart',
        'reggae',
        'smart',
        'hammond-organ',
        'horns-section',
        '',
        '',
        'acoustic-kit',
    ],
    [
        'Acoustic',
        'Acoustic',
        'acoustic',
        'arp',
        'acoustic',
        'strings',
        'grand',
        'strings-ensemble',
        'nylon-guitar',
        'upright-bass',
        'acoustic-kit',
    ],
    [
        'Bossa',
        'Bossa Nova',
        'bossa',
        'jazz',
        'bossa',
        'strings',
        'grand',
        'strings-ensemble',
        'nylon-guitar',
        'upright-bass',
        'acoustic-kit',
    ],
    [
        'Country',
        'Country',
        'country',
        'strum-country',
        'country',
        'smart',
        'grand',
        'strings-ensemble',
        'electric-guitar-clean',
        'upright-bass',
        'acoustic-kit',
    ],
    [
        'Metal',
        'Metal',
        'metal',
        'power-metal',
        'metal',
        'smart',
        'electric-guitar-rhythm',
        'horns-section',
        '',
        '',
        '',
    ],
    [
        'Ska-Punk',
        'Ska',
        'walking-ska',
        'ska-upstroke',
        'ska-horns',
        'horns',
        'hammond-organ',
        'horns-section',
        '',
        '',
        'acoustic-kit',
    ],
];
const MODULES: InstrumentModule[] = ['chords', 'harmony', 'soloist', 'bass', 'groove'];

afterEach(() => __resetPackCacheForTest());

it('pins routes for exactly the thirteen selectable genres', () => {
    expect(ROUTES.map(([genre]) => genre).sort()).toEqual([...GENRE_NAMES].sort());
});

describe.each(ROUTES)(
    '%s preset entry',
    (genre, feel, bass, chords, soloist, harmony, ...packs) => {
        it('applies the real default players and installed Auto sounds, then falls back when absent', async () => {
            for (const pack of SOUND_PACKS) {
                markPackInstalled(pack.id, true);
            }
            const state = await enterGenre(genre);
            expect(state.groove.lastSmartGenre).toBe(genre);
            expect(state.groove.genreFeel).toBe(feel);
            expect([
                state.bass.style,
                state.chords.style,
                state.soloist.style,
                state.harmony.style,
            ]).toEqual([bass, chords, soloist, harmony]);
            for (const [index, module] of MODULES.entries()) {
                expect(state[module].autoSound, module).toBe(true);
                expect(state[module].voice, module).toBe(
                    packs[index] ? `pack:${packs[index]}` : 'synth',
                );
            }
            __resetPackCacheForTest();
            resolveAutoVoices(state, genre, dispatch);
            for (const module of MODULES) {
                expect(state[module].voice, module).toBe('synth');
            }
        });
    },
);

// Neo-Soul is an explicit style override, not a default/UI-availability claim:
// its Rhodes default makes the Modern/Open -> Grand source override observable.
const PLAYER_SOURCE_ROUTES = [
    ['Neo-Soul', 'modern-piano', 'grand'],
    ['Neo-Soul', 'open-modal', 'grand'],
    ['Jazz', 'modern-piano', 'grand'],
    ['Jazz', 'open-modal', 'grand'],
    ['Acoustic', 'modern-piano', 'grand'],
    ['Acoustic', 'open-modal', 'grand'],
    ['Acoustic', 'acoustic-strum', 'nylon-guitar'],
];

describe.each(PLAYER_SOURCE_ROUTES)('%s explicit %s source', (genre, style, pack) => {
    it('follows the player in Auto, falls back without its pack, and preserves an explicit pin', async () => {
        for (const entry of SOUND_PACKS) {
            markPackInstalled(entry.id, true);
        }
        const state = await enterGenre(genre);
        expect(state.chords.style).not.toBe(style);
        if (genre === 'Neo-Soul') {
            expect(state.chords.voice).toBe('pack:rhodes');
        }
        const payload = { module: 'chords', style };
        dispatch(ACTIONS.SET_STYLE, payload);
        handleEffects({ type: ACTIONS.SET_STYLE, payload }, state, { dispatch });
        expect(state.chords.voice).toBe(`pack:${pack}`);
        expect(state.chords.autoSound).toBe(true);
        markPackInstalled(pack, false);
        resolveAutoVoices(state, genre, dispatch);
        expect(state.chords.voice).toBe('synth');

        markPackInstalled('rhodes', true);
        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, {
            module: 'chords',
            voice: 'pack:rhodes',
            auto: false,
        });
        markPackInstalled(pack, true);
        resolveAutoVoices(state, genre, dispatch);
        expect(state.chords.voice).toBe('pack:rhodes');
        expect(state.chords.autoSound).toBe(false);
        // A later genre gesture resets its player but must respect the sound pin.
        dispatch(ACTIONS.SET_GENRE_FEEL, { genreName: 'Funk', ...SMART_GENRES.Funk });
        await reconcileUrlGenreOnBoot(getState(), 'Funk', null, dispatch);
        expect(state.chords.style).toBe('funk');
        expect(state.chords.voice).toBe('pack:rhodes');
        expect(state.chords.autoSound).toBe(false);
    });
});
