import { describe, expect, it } from 'vitest';
import { gainForPack, packsForInstrument, SOUND_PACKS } from '../../../public/data/sound-packs.js';

describe('sound-packs catalog', () => {
    it('every pack has a non-empty id, name, attribution, and ≥1 instrument', () => {
        for (const pack of SOUND_PACKS) {
            expect(pack.id).toMatch(/\S/);
            expect(pack.name).toMatch(/\S/);
            expect(pack.attribution).toMatch(/\S/);
            expect(pack.approxSizeMB).toBeGreaterThan(0);
            expect(pack.instruments.length).toBeGreaterThan(0);
        }
    });

    it('pack ids are unique (they key /packs/<id>/ and the pack:<id> voice)', () => {
        const ids = SOUND_PACKS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('declares the grand piano for the chords instrument', () => {
        const grand = SOUND_PACKS.find((p) => p.id === 'grand');
        expect(grand).toBeDefined();
        expect(grand?.instruments).toContain('chords');
    });

    it('gainForPack returns the calibrated grand lift and 1 for unknown/uncalibrated ids', () => {
        // Behavior-preserving (#656): the grand's 3.5× lift moved from a code
        // constant in synth-chords.ts to this catalog field — same value.
        expect(gainForPack('grand')).toBeCloseTo(3.5, 5);
        // Unknown id → no lift (a freshly-added pack plays raw until calibrated).
        expect(gainForPack('does-not-exist')).toBe(1);
    });

    it('packsForInstrument returns only packs that list that module', () => {
        const chordPacks = packsForInstrument('chords');
        expect(chordPacks.map((p) => p.id)).toContain('grand');
        for (const pack of chordPacks) {
            expect(pack.instruments).toContain('chords');
        }
        // No pack targets bass yet, so the filter is empty (not all packs).
        expect(packsForInstrument('bass')).toHaveLength(0);
    });
});
