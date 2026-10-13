/**
 * @vitest-environment happy-dom
 */
/**
 * A chart is compiled once on its way to the stand and the band (#1665). It used to be compiled
 * three times — to check it plays, to draw it, and again by the band host when it was first
 * handed the chart — and a chart at the size limit takes long enough that the tab stalled.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const compiled = vi.hoisted(() => ({ count: 0 }));

// The real band, wrapped only so the test can count the compiles.
vi.mock('@band/index', async (original) => {
    const real = await original<typeof import('@band/index')>();
    return {
        ...real,
        compileTimeline: (...args: Parameters<typeof real.compileTimeline>) => {
            compiled.count++;
            return real.compileTimeline(...args);
        },
    };
});

vi.mock('./band-export', () => ({
    downloadExportResult: vi.fn(),
    renderBandMixToWav: vi.fn(),
    renderBandStemsToWav: vi.fn(),
}));

async function freshRuntime() {
    vi.resetModules();
    const [runtime, { buildStandardDocument, STANDARDS }] = await Promise.all([
        import('./runtime'),
        import('./standards'),
    ]);
    return { runtime, document: buildStandardDocument(STANDARDS[0]) };
}

describe('compiling the open chart', () => {
    beforeEach(() => {
        compiled.count = 0;
    });

    it('happens once to open it, and not again to hand it to the band', async () => {
        const { runtime, document } = await freshRuntime();
        compiled.count = 0;
        runtime.load(document);
        expect(compiled.count).toBe(1);
        // An export hands the band host the chart exactly as Play does (`handScore`).
        await runtime.exportMidi('take');
        expect(compiled.count).toBe(1);
    });

    it('happens once for an edit, and not again to hand it to the band', async () => {
        const { runtime, document } = await freshRuntime();
        runtime.load(document);
        await runtime.exportMidi('take');
        compiled.count = 0;
        runtime.editScore({ ...document.chart.score, isMinor: !document.chart.score.isMinor });
        expect(compiled.count).toBe(1);
        await runtime.exportMidi('take');
        expect(compiled.count).toBe(1);
    });

    it('happens again when the band is handed a score the open chart did not compile', async () => {
        const { runtime, document } = await freshRuntime();
        runtime.load(document);
        compiled.count = 0;
        // A notation change replaces the score object without going through `apply`.
        runtime.setNotation(document.chart.score.notation === 'name' ? 'roman' : 'name');
        await runtime.exportMidi('take');
        expect(compiled.count).toBe(1);
    });
});
