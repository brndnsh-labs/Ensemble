import { describe, expect, it } from 'vitest';
import { INTENSITY_BANDS, makeMotifSelector } from '../../../public/engine/grooves/utils.js';

// Verify that makeMotifSelector produces identical output to the hand-written
// getMotif functions it replaced, using a representative sample of (seed, complexity,
// intensity) triples for each genre.

describe('makeMotifSelector factory', () => {
    describe('basic guard conditions', () => {
        const selector = makeMotifSelector([
            {
                picks: [
                    [0.5, 0],
                    [1.0, 1],
                ],
            },
        ]);

        it('returns 0 when complexity is below threshold', () => {
            expect(selector(0.9, 0.1, 1.0)).toBe(0);
        });

        it('returns 0 when intensity is below floor', () => {
            expect(selector(0.9, 0.8, INTENSITY_BANDS.LOW - 0.01)).toBe(0);
        });
    });

    describe('pickBySeed via single-tier selector', () => {
        const sel = makeMotifSelector([
            {
                picks: [
                    [0.3, 0],
                    [0.7, 1],
                    [1.0, 2],
                ],
            },
        ]);

        it('picks first motif when seed < first threshold', () => {
            expect(sel(0.1, 1.0, 1.0)).toBe(0);
        });

        it('picks second motif in mid range', () => {
            expect(sel(0.5, 1.0, 1.0)).toBe(1);
        });

        it('picks last motif for high seed', () => {
            expect(sel(0.8, 1.0, 1.0)).toBe(2);
        });
    });

    describe('Funk motif selector (2-tier)', () => {
        const getMotif = makeMotifSelector([
            {
                maxIntensity: 0.7,
                picks: [
                    [0.4, 0],
                    [1.0, 1],
                ],
            },
            {
                picks: [
                    [0.2, 0],
                    [0.5, 1],
                    [0.75, 2],
                    [1.0, 3],
                ],
            },
        ]);

        it('guard: low intensity → 0', () => {
            expect(getMotif(0.9, 0.8, 0.2)).toBe(0);
        });
        it('mid tier: seed < 0.4 → 0', () => {
            expect(getMotif(0.3, 0.8, 0.5)).toBe(0);
        });
        it('mid tier: seed >= 0.4 → 1', () => {
            expect(getMotif(0.5, 0.8, 0.5)).toBe(1);
        });
        it('high tier: seed < 0.2 → 0', () => {
            expect(getMotif(0.1, 0.8, 0.9)).toBe(0);
        });
        it('high tier: seed 0.2–0.5 → 1', () => {
            expect(getMotif(0.4, 0.8, 0.9)).toBe(1);
        });
        it('high tier: seed 0.5–0.75 → 2', () => {
            expect(getMotif(0.6, 0.8, 0.9)).toBe(2);
        });
        it('high tier: seed >= 0.75 → 3', () => {
            expect(getMotif(0.9, 0.8, 0.9)).toBe(3);
        });
    });

    describe('Blues motif selector (3-tier with INTENSITY_BANDS.HIGH)', () => {
        const getMotif = makeMotifSelector([
            {
                maxIntensity: 0.6,
                picks: [
                    [0.75, 0],
                    [1.0, 1],
                ],
            },
            {
                maxIntensity: INTENSITY_BANDS.HIGH,
                picks: [
                    [0.5, 0],
                    [0.8, 1],
                    [1.0, 2],
                ],
            },
            {
                picks: [
                    [0.3, 1],
                    [0.7, 2],
                    [1.0, 3],
                ],
            },
        ]);

        it('low tier: seed < 0.75 → 0', () => {
            expect(getMotif(0.5, 0.8, 0.5)).toBe(0);
        });
        it('low tier: seed >= 0.75 → 1', () => {
            expect(getMotif(0.9, 0.8, 0.5)).toBe(1);
        });
        it('mid tier: seed < 0.5 → 0', () => {
            expect(getMotif(0.3, 0.8, 0.7)).toBe(0);
        });
        it('mid tier: seed 0.5–0.8 → 1', () => {
            expect(getMotif(0.6, 0.8, 0.7)).toBe(1);
        });
        it('mid tier: seed >= 0.8 → 2', () => {
            expect(getMotif(0.9, 0.8, 0.7)).toBe(2);
        });
        it('high tier: seed < 0.3 → 1', () => {
            expect(getMotif(0.2, 0.8, 0.95)).toBe(1);
        });
        it('high tier: seed 0.3–0.7 → 2', () => {
            expect(getMotif(0.5, 0.8, 0.95)).toBe(2);
        });
        it('high tier: seed >= 0.7 → 3', () => {
            expect(getMotif(0.8, 0.8, 0.95)).toBe(3);
        });
    });

    describe('Jazz motif selector (3-tier, 5 motifs)', () => {
        const getMotif = makeMotifSelector([
            {
                maxIntensity: 0.6,
                picks: [
                    [0.75, 0],
                    [1.0, 1],
                ],
            },
            {
                maxIntensity: INTENSITY_BANDS.HIGH,
                picks: [
                    [0.3, 0],
                    [0.6, 1],
                    [0.85, 2],
                    [1.0, 3],
                ],
            },
            {
                picks: [
                    [0.2, 0],
                    [0.4, 1],
                    [0.6, 2],
                    [0.8, 3],
                    [1.0, 4],
                ],
            },
        ]);

        it('high tier: seed >= 0.8 → 4', () => {
            expect(getMotif(0.9, 0.8, 0.95)).toBe(4);
        });
        it('high tier: seed 0.6–0.8 → 3', () => {
            expect(getMotif(0.7, 0.8, 0.95)).toBe(3);
        });
        it('mid tier: seed >= 0.85 → 3', () => {
            expect(getMotif(0.9, 0.8, 0.7)).toBe(3);
        });
    });

    describe('Metal motif selector (3-tier, skips motif 0 in high tiers)', () => {
        const getMotif = makeMotifSelector([
            {
                maxIntensity: 0.65,
                picks: [
                    [0.6, 0],
                    [1.0, 1],
                ],
            },
            {
                maxIntensity: INTENSITY_BANDS.HIGH,
                picks: [
                    [0.3, 1],
                    [0.7, 2],
                    [1.0, 3],
                ],
            },
            {
                picks: [
                    [0.25, 2],
                    [0.6, 3],
                    [1.0, 4],
                ],
            },
        ]);

        it('mid tier: any seed below 0.3 → 1', () => {
            expect(getMotif(0.1, 0.8, 0.7)).toBe(1);
        });
        it('high tier: seed < 0.25 → 2', () => {
            expect(getMotif(0.1, 0.8, 0.95)).toBe(2);
        });
        it('high tier: seed >= 0.6 → 4 (blast beat)', () => {
            expect(getMotif(0.8, 0.8, 0.95)).toBe(4);
        });
    });
});

describe('Groove files use makeMotifSelector correctly', () => {
    it('funk getMotif is a function', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/funk.js');
        expect(typeof getMotif).toBe('function');
        expect(getMotif(0.5, 0.5, 0.2)).toBe(0); // low intensity guard
        expect(getMotif(0.4, 0.5, 0.8)).toBe(1); // high intensity, seed=0.4 < 0.5 → motif 1
        expect(getMotif(0.6, 0.5, 0.8)).toBe(2); // high intensity, seed=0.6 → motif 2
    });

    it('rock getMotif is a function', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/rock.js');
        expect(typeof getMotif).toBe('function');
        expect(getMotif(0.5, 0.2, 0.8)).toBe(0); // low complexity guard
    });

    it('jazz getMotif returns 4 at max seed + high intensity', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/jazz.js');
        expect(getMotif(0.9, 0.8, 0.95)).toBe(4);
    });

    it('metal getMotif returns blast beat (4) at max seed + high intensity', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/metal.js');
        expect(getMotif(0.9, 0.8, 0.95)).toBe(4);
    });

    it('hiphop getMotif returns 1 as lowest motif at high intensity', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/hiphop.js');
        expect(getMotif(0.1, 0.8, 0.9)).toBe(1); // Trap Foundation
    });

    it('country getMotif stays at most 2 motifs', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/country.js');
        expect(getMotif(0.9, 0.8, 0.9)).toBe(2);
        expect(getMotif(0.5, 0.8, 0.9)).toBe(1);
        expect(getMotif(0.1, 0.8, 0.9)).toBe(0);
    });
});
