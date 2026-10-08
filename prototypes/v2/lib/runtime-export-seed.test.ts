/**
 * @vitest-environment happy-dom
 */
/**
 * An export renders the take the open chart would play. The runtime once kept the seed of the
 * last chart it played or exported and only filled it in when empty, so a chart with a locked
 * seed, exported before it was played, came out as the previous chart's take.
 */

import type { ChartDocumentV2 } from '@engine/songbook/score-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const downloads = vi.hoisted(() => [] as Blob[]);

vi.mock('./band-export', () => ({
    downloadExportResult: (result: { blob: Blob }) => {
        downloads.push(result.blob);
    },
    renderBandMixToWav: vi.fn(),
    renderBandStemsToWav: vi.fn(),
}));

async function freshRuntime() {
    vi.resetModules();
    const [runtime, { buildStandardDocument, STANDARDS }] = await Promise.all([
        import('./runtime'),
        import('./standards'),
    ]);
    const chart = (seed: string): ChartDocumentV2 => {
        const document = buildStandardDocument(STANDARDS[0]);
        return {
            ...document,
            chart: {
                ...document.chart,
                performance: { ...document.chart.performance, seed, randomizeSeed: false },
            },
        };
    };
    return { runtime, chart };
}

async function exported(steps: string[]): Promise<number[]> {
    const { runtime, chart } = await freshRuntime();
    downloads.length = 0;
    for (const seed of steps) {
        runtime.load(chart(seed));
        await runtime.exportMidi('take');
    }
    return [...new Uint8Array(await downloads[downloads.length - 1].arrayBuffer())];
}

describe('the seed an export renders', () => {
    beforeEach(() => {
        downloads.length = 0;
    });

    it('is the open chart’s own, not the one the last export used', async () => {
        const alone = await exported(['BBBBBB']);
        const afterAnother = await exported(['AAAAAA', 'BBBBBB']);
        expect(afterAnother).toEqual(alone);
    });

    it('gives two charts that differ only in seed two different takes', async () => {
        expect(await exported(['AAAAAA'])).not.toEqual(await exported(['BBBBBB']));
    });
});
