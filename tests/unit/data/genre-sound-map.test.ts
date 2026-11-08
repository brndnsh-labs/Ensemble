import { describe, expect, it } from 'vitest';
import { autoVoiceForGenre, GENRE_SOUND_MAP } from '../../../core/data/genre-sound-map.js';
import { GENRE_NAMES } from '../../../core/data/smart-genres.js';
import { SOUND_PACKS } from '../../../core/data/sound-packs.js';
import { packIdFromVoice } from '../../../core/engine/instrument-registry.js';

const allInstalled = () => true;
const noneInstalled = () => false;

describe('genre → sound map (#675)', () => {
    it('uses Rhodes for the explicit Neo-Soul player even outside its genre, with synth fallback', () => {
        expect(autoVoiceForGenre('Neo-Soul', 'chords', allInstalled, 'neo-soul-rhodes')).toBe(
            'pack:rhodes',
        );
        expect(autoVoiceForGenre('Jazz', 'chords', allInstalled, 'neo-soul-rhodes')).toBe(
            'pack:rhodes',
        );
        expect(autoVoiceForGenre('Acoustic', 'chords', noneInstalled, 'neo-soul-rhodes')).toBe(
            'synth',
        );
        // Installing Grand alone must not change this player's Auto identity.
        expect(
            autoVoiceForGenre('Jazz', 'chords', (pack) => pack === 'grand', 'neo-soul-rhodes'),
        ).toBe('synth');
        expect(autoVoiceForGenre('Neo-Soul', 'chords', allInstalled, 'modern-piano')).toBe(
            'pack:grand',
        );
        expect(autoVoiceForGenre('Neo-Soul', 'chords', allInstalled, 'open-modal')).toBe(
            'pack:grand',
        );
    });
    it.each(['modern-piano', 'open-modal'])(
        'follows %s with grand piano or the audible synth fallback',
        (profile) => {
            expect(autoVoiceForGenre('Jazz', 'chords', allInstalled, profile)).toBe('pack:grand');
            expect(autoVoiceForGenre('Acoustic', 'chords', noneInstalled, profile)).toBe('synth');
        },
    );
    it('follows the Acoustic player without remapping existing defaults (#1150)', () => {
        expect(autoVoiceForGenre('Acoustic', 'chords', allInstalled, 'acoustic-strum')).toBe(
            'pack:nylon-guitar',
        );
        expect(autoVoiceForGenre('Acoustic', 'chords', noneInstalled, 'acoustic-strum')).toBe(
            'synth',
        );
        expect(autoVoiceForGenre('Acoustic', 'chords', allInstalled, 'arp')).toBe('pack:grand');
    });
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
            // Funk → clavinet on the chords lane (a known map entry).
            expect(autoVoiceForGenre('Funk', 'chords', allInstalled)).toBe('pack:clavinet');
            expect(autoVoiceForGenre('Bossa', 'chords', allInstalled)).toBe('pack:grand');
        });

        it('falls back to synth when the mapped pack is NOT installed (no auto-download)', () => {
            expect(autoVoiceForGenre('Funk', 'chords', noneInstalled)).toBe('synth');
        });

        it('falls back to synth for an unmapped genre', () => {
            // Hip Hop maps only its keys → the soloist stays the synth.
            expect(autoVoiceForGenre('Hip Hop', 'soloist', allInstalled)).toBe('synth');
        });

        it('falls back to synth for an unmapped module', () => {
            // Hip Hop maps no drum pack (programmed beats on the synth kit).
            expect(autoVoiceForGenre('Hip Hop', 'groove', allInstalled)).toBe('synth');
        });

        it('falls back to synth for an undefined / unknown genre', () => {
            expect(autoVoiceForGenre(undefined, 'chords', allInstalled)).toBe('synth');
            expect(autoVoiceForGenre('NotAGenre', 'chords', allInstalled)).toBe('synth');
        });
    });
});
