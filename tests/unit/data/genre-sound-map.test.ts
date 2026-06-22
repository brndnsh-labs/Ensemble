import { describe, expect, it } from 'vitest';
import { autoVoiceForGenre, GENRE_SOUND_MAP } from '../../../public/data/genre-sound-map.js';
import { GENRE_NAMES } from '../../../public/data/smart-genres.js';
import { SOUND_PACKS } from '../../../public/data/sound-packs.js';
import { packIdFromVoice } from '../../../public/engine/instrument-registry.js';

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
