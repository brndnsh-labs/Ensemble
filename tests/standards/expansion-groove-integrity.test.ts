// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { getDrumMotif } from '../../public/engine/groove-engine.js';

describe('Expansion Genres Groove Integrity', () => {
    const genres = ['Country', 'Hip Hop', 'Metal', 'Minimal', 'Shred'];

    genres.forEach((genre) => {
        describe(`${genre} Groove Motif Assignment`, () => {
            it('should assign a baseline Motif 0 at low complexity and intensity', () => {
                const motif = getDrumMotif(0.5, genre, 0.2, 0.2);
                expect(motif).toBe(0);
            });

            it('should explore higher motifs at high complexity and intensity across different seeds', () => {
                const motifs = new Set();
                for (let i = 0; i < 20; i++) {
                    const seed = i / 20;
                    motifs.add(getDrumMotif(seed, genre, 0.9, 0.6)); // Mid intensity
                    motifs.add(getDrumMotif(seed, genre, 0.9, 0.9)); // High intensity
                }

                // Expect at least 2 distinct motifs for high intensity (baseline + at least one active pattern)
                expect(motifs.size).toBeGreaterThanOrEqual(2);

                // Specifically for Minimal, the max motif is 2, for others it goes up to 3 or 4.
                if (genre !== 'Minimal') {
                    expect(motifs.has(1)).toBe(true);
                }
            });
        });
    });
});
