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
        // The grand's lift lives in the catalog `gain` field (#656); ear-locked
        // at 8× to seat the pack against the full band (was 3.5×, which the
        // calibration tool measured ~13 dB under the rhythm section).
        expect(gainForPack('grand')).toBeCloseTo(8, 5);
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
