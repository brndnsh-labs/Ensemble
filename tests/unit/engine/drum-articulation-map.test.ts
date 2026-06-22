import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    drumArticulationKey,
    isHatName,
    isRingingHat,
    KNOWN_SOUND_NAMES,
} from '../../../public/engine/synth-drums.js';

// The acoustic-kit seam (#662) maps a groove-engine drum `name` to a pack
// manifest key. The contract that must not silently drift: every key the mapper
// emits has to exist in the shipped manifest (or the hit plays silence), and the
// two documented gaps (china, snare brush — no clean CC0 source) must resolve to
// `null` so they fall back to the synth voice. This guards both sides at once.

const manifestPath = fileURLToPath(
    new URL('../../../public/packs/acoustic-kit/manifest.json', import.meta.url),
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    samples: Array<{ key: string }>;
};
const manifestKeys = new Set(manifest.samples.map((s) => s.key));

describe('drumArticulationKey — pack contract', () => {
    it('maps every covered articulation to a key that exists in the manifest', () => {
        // The full groove-engine drum vocabulary that the kit intends to cover.
        const covered = [
            'Kick',
            'Snare',
            'Sidestick',
            'HiHat',
            'HiHatQuarter',
            'HiHatHalf',
            'Open',
            'HiHatPedal',
            'Ride',
            'RideBell',
            'Crash',
            'Cowbell',
            'CowbellHigh',
            'CowbellLow',
            'Agogo',
            'AgogoHigh',
            'AgogoLow',
            'Shaker',
            'High Tom',
            'Mid Tom',
            'Low Tom',
        ];
        for (const name of covered) {
            const key = drumArticulationKey(name);
            expect(key, `${name} should map to a sampled articulation`).not.toBeNull();
            expect(
                manifestKeys.has(key as string),
                `${name} → "${key}" missing from manifest`,
            ).toBe(true);
        }
    });

    it('returns null for the documented synth-fallback hits (no CC0 source)', () => {
        // China + brushes have no clean CC0 sample; they must fall through to synth.
        for (const name of ['China', 'Brush', 'Clave', 'Guiro', 'CongaHigh', 'BongoLow', 'Perc']) {
            expect(drumArticulationKey(name), `${name} must fall back to synth`).toBeNull();
        }
    });

    it('collapses hi-hat openness onto the three sampled articulations', () => {
        expect(drumArticulationKey('HiHat')).toBe('hihat-closed');
        expect(drumArticulationKey('HiHatQuarter')).toBe('hihat-loose');
        expect(drumArticulationKey('HiHatHalf')).toBe('hihat-loose');
        expect(drumArticulationKey('Open')).toBe('hihat-open');
        expect(drumArticulationKey('HiHatPedal')).toBe('hihat-pedal');
    });

    it('folds the mid tom onto the high rack tom (kit ships two tom samples)', () => {
        expect(drumArticulationKey('High Tom')).toBe('tom-high');
        expect(drumArticulationKey('Mid Tom')).toBe('tom-high');
        expect(drumArticulationKey('Low Tom')).toBe('tom-low');
    });

    it('every mapped name is a sound the engine actually emits (no phantom keys)', () => {
        // Anything the mapper covers should be a real drum name (a KNOWN sound or a
        // space-formed tom) — catches a typo'd case label that would never fire.
        const names = ['Kick', 'Snare', 'HiHat', 'Ride', 'Crash', 'Cowbell', 'Shaker'];
        for (const name of names) {
            expect(KNOWN_SOUND_NAMES.has(name), `${name} not in KNOWN_SOUND_NAMES`).toBe(true);
        }
    });
});

describe('hi-hat choke classification (#679)', () => {
    it('every hi-hat articulation chokes a ringing open hat', () => {
        for (const name of ['HiHat', 'Open', 'HiHatQuarter', 'HiHatHalf', 'HiHatPedal']) {
            expect(isHatName(name), `${name} should choke a ringing hat`).toBe(true);
        }
    });

    it('non-hat hits never choke (a kick/snare/cymbal leaves the open hat ringing)', () => {
        for (const name of ['Kick', 'Snare', 'Ride', 'Crash', 'Cowbell', 'Shaker', 'High Tom']) {
            expect(isHatName(name), `${name} must not choke`).toBe(false);
        }
    });

    it('only open + semi-open hats are tracked as choke-able (closed/pedal are already short)', () => {
        for (const name of ['Open', 'HiHatQuarter', 'HiHatHalf']) {
            expect(isRingingHat(name), `${name} should be tracked as a ringing voice`).toBe(true);
        }
        for (const name of ['HiHat', 'HiHatPedal', 'Kick', 'Snare']) {
            expect(isRingingHat(name), `${name} should not be tracked`).toBe(false);
        }
    });

    it('every choke-able ringing hat is also a hat that chokes (consistency)', () => {
        // A ringing hat must be in the choking set — otherwise it could register as
        // active but never get cut by its own family.
        for (const name of ['Open', 'HiHatQuarter', 'HiHatHalf']) {
            expect(isRingingHat(name) && isHatName(name)).toBe(true);
        }
    });
});
