import { describe, expect, it } from 'vitest';
import { autoVoiceForGenre, GENRE_SOUND_MAP } from '../../../public/data/genre-sound-map.js';
import { GENRE_NAMES } from '../../../public/data/smart-genres.js';
import { SOUND_PACKS } from '../../../public/data/sound-packs.js';
import { packIdFromVoice } from '../../../public/engine/instrument-registry.js';
import type { InstrumentVoice } from '../../../public/types.js';

const allInstalled = () => true;
const noneInstalled = () => false;

describe('genre → sound map (#675)', () => {
    describe('canon integrity (guards against silently-dead entries)', () => {
        it('every map key is a canonical genre name', () => {
            for (const key of Object.keys(GENRE_SOUND_MAP)) {
                expect(GENRE_NAMES, `"${key}" is not a canonical genre`).toContain(key);
            }
        });

        it('every mapped voice names a real catalog pack that serves the module', () => {
            const packById = new Map(SOUND_PACKS.map((p) => [p.id, p]));
            for (const [genre, byModule] of Object.entries(GENRE_SOUND_MAP)) {
                for (const [module, voice] of Object.entries(byModule)) {
                    const packId = packIdFromVoice(voice);
                    expect(
                        packId,
                        `${genre}.${module} → ${voice} is not a pack voice`,
                    ).not.toBeNull();
                    const pack = packById.get(packId as string);
                    expect(pack, `${voice} is not in the catalog`).toBeDefined();
                    expect(pack?.instruments, `${pack?.id} does not serve ${module}`).toContain(
                        module,
                    );
                }
            }
        });
    });

    describe('chords lane — per-genre keyboard (#682)', () => {
        // The table decided with Brandon 2026-06-22 (#682), revised 2026-06-23
        // when the Rhodes pack (#655) took the electric-piano seats. Locked here
        // so a stray edit to GENRE_SOUND_MAP that re-points a genre's keyboard
        // fails loudly.
        const CHORDS_TABLE: Record<string, InstrumentVoice> = {
            Jazz: 'pack:grand',
            Acoustic: 'pack:grand',
            Bossa: 'pack:grand',
            Country: 'pack:grand',
            Rock: 'pack:grand',
            // Tine Rhodes (#655) — the neo-soul/hip-hop/disco electric-piano seats
            // the grand used to stand in for.
            'Neo-Soul': 'pack:rhodes',
            'Hip Hop': 'pack:rhodes',
            Disco: 'pack:rhodes',
            Reggae: 'pack:hammond-organ',
            Blues: 'pack:hammond-organ',
            'Ska-Punk': 'pack:hammond-organ',
            Funk: 'pack:clavinet',
            // Metal keeps the synth keyboard (no acoustic-keys idiom).
            Metal: 'synth',
        };

        it('maps every canonical genre to its decided chords voice (installed)', () => {
            for (const genre of GENRE_NAMES) {
                expect(
                    autoVoiceForGenre(genre, 'chords', allInstalled),
                    `${genre} chords voice drifted from the locked table`,
                ).toBe(CHORDS_TABLE[genre]);
            }
        });

        it('covers all 13 canonical genres (no genre left unspecified)', () => {
            expect(Object.keys(CHORDS_TABLE).sort()).toEqual([...GENRE_NAMES].sort());
        });

        it('falls back to synth for a pack-mapped genre when that pack is NOT installed', () => {
            // Auto-follow never auto-downloads — an uninstalled mapping plays synth.
            expect(autoVoiceForGenre('Jazz', 'chords', noneInstalled)).toBe('synth');
            expect(autoVoiceForGenre('Funk', 'chords', noneInstalled)).toBe('synth');
            expect(autoVoiceForGenre('Reggae', 'chords', noneInstalled)).toBe('synth');
        });
    });

    describe('soloist lane — per-genre lead (#694)', () => {
        // Sax only where a horn lead is idiomatic; everything else keeps synth.
        const SAX_GENRES = ['Jazz', 'Blues', 'Funk', 'Bossa'];

        it('maps every canonical genre to its decided soloist voice (installed)', () => {
            for (const genre of GENRE_NAMES) {
                const expected = SAX_GENRES.includes(genre) ? 'pack:sax-alto' : 'synth';
                expect(
                    autoVoiceForGenre(genre, 'soloist', allInstalled),
                    `${genre} soloist voice drifted from the locked table`,
                ).toBe(expected);
            }
        });

        it('falls back to synth when the sax pack is NOT installed', () => {
            expect(autoVoiceForGenre('Jazz', 'soloist', noneInstalled)).toBe('synth');
            expect(autoVoiceForGenre('Funk', 'soloist', noneInstalled)).toBe('synth');
        });
    });

    describe('drums lane — per-genre kit (#695)', () => {
        // Acoustic kit is the DEFAULT (live drummer fits most genres, Brandon's
        // ear 2026-06-22); synth kit is the exception for programmed/triggered
        // drums only — Hip Hop (beats) and Metal (too soft on the natural kit).
        const SYNTH_KIT_GENRES = ['Hip Hop', 'Metal'];

        it('maps every canonical genre to its decided groove voice (installed)', () => {
            for (const genre of GENRE_NAMES) {
                const expected = SYNTH_KIT_GENRES.includes(genre) ? 'synth' : 'pack:acoustic-kit';
                expect(
                    autoVoiceForGenre(genre, 'groove', allInstalled),
                    `${genre} groove voice drifted from the locked table`,
                ).toBe(expected);
            }
        });

        it('falls back to synth when the acoustic-kit pack is NOT installed', () => {
            expect(autoVoiceForGenre('Jazz', 'groove', noneInstalled)).toBe('synth');
            expect(autoVoiceForGenre('Acoustic', 'groove', noneInstalled)).toBe('synth');
        });
    });

    describe('bass lane — per-genre bass (#697)', () => {
        // Upright pizzicato for the acoustic combo; everything else keeps the
        // synth electric (the only electric-bass voice we have).
        const UPRIGHT_GENRES = ['Jazz', 'Blues', 'Bossa', 'Acoustic', 'Country'];

        it('maps every canonical genre to its decided bass voice (installed)', () => {
            for (const genre of GENRE_NAMES) {
                const expected = UPRIGHT_GENRES.includes(genre) ? 'pack:upright-bass' : 'synth';
                expect(
                    autoVoiceForGenre(genre, 'bass', allInstalled),
                    `${genre} bass voice drifted from the locked table`,
                ).toBe(expected);
            }
        });

        it('falls back to synth when the upright-bass pack is NOT installed', () => {
            expect(autoVoiceForGenre('Jazz', 'bass', noneInstalled)).toBe('synth');
            expect(autoVoiceForGenre('Bossa', 'bass', noneInstalled)).toBe('synth');
        });
    });

    describe('autoVoiceForGenre', () => {
        it('returns the mapped pack voice when installed', () => {
            // Funk → horns on the harmony lane (a known map entry).
            expect(autoVoiceForGenre('Funk', 'harmony', allInstalled)).toBe('pack:horns-section');
            expect(autoVoiceForGenre('Bossa', 'harmony', allInstalled)).toBe(
                'pack:strings-ensemble',
            );
        });

        it('falls back to synth when the mapped pack is NOT installed (no auto-download)', () => {
            expect(autoVoiceForGenre('Funk', 'harmony', noneInstalled)).toBe('synth');
        });

        it('falls back to synth for an unmapped genre', () => {
            // Hip Hop has no harmony mapping → synth pad.
            expect(autoVoiceForGenre('Hip Hop', 'harmony', allInstalled)).toBe('synth');
        });

        it('falls back to synth for an unmapped module', () => {
            // No genre maps the bass lane today.
            expect(autoVoiceForGenre('Funk', 'bass', allInstalled)).toBe('synth');
        });

        it('falls back to synth for an undefined / unknown genre', () => {
            expect(autoVoiceForGenre(undefined, 'harmony', allInstalled)).toBe('synth');
            expect(autoVoiceForGenre('NotAGenre', 'harmony', allInstalled)).toBe('synth');
        });
    });
});
