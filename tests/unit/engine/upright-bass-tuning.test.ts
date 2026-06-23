import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// #697 follow-up — the upright-bass pack was "occasionally out of tune": each
// sampled zone's root was rounded to the nearest INTEGER MIDI note, discarding up
// to ±50c of the recording's true pitch. Because `pitchRatio` shifts a buffer by
// exact equal-tempered ratios, that residual got baked in as constant per-zone
// detuning (zones 31/42/45 measured −12/+23/+18c — audibly off while the rest sang).
// The fix stores each zone's *measured fractional* fundamental so the ratio cancels
// the offset. This guard stops a future re-sample/edit from silently regressing to
// lazy integer roots. It intentionally does NOT pin exact cents — those stay open to
// by-ear nudging on ensembletest — only the invariants that keep the pack in tune.

const manifestUrl = new URL('../../../public/packs/upright-bass/manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(fileURLToPath(manifestUrl), 'utf8')) as {
    samples: { key: string; rootMidi: number }[];
};

describe('upright-bass zone tuning', () => {
    it('has the expected 8 pizz zones', () => {
        expect(manifest.samples).toHaveLength(8);
    });

    it('each zone root sits within a semitone of its nominal note (sanity)', () => {
        // The `key` is the nominal integer note the sample stands in for; the true
        // measured pitch must be close to it (a >100c gap means a wrong octave or a
        // fat-fingered value, not a tuning correction).
        for (const { key, rootMidi } of manifest.samples) {
            const cents = Math.abs(rootMidi - Number(key)) * 100;
            expect(cents).toBeLessThan(100);
        }
    });

    it('carries fractional (measured) roots — not lazy integer rounding', () => {
        // The whole point of the fix: at least the audibly-sour zones must hold a
        // cents-level correction. If every root is an integer again, someone
        // re-rounded and the detuning is back.
        const fractional = manifest.samples.filter(
            (s) => Math.abs(s.rootMidi - Math.round(s.rootMidi)) > 1e-6,
        );
        expect(fractional.length).toBeGreaterThanOrEqual(3);
    });
});
