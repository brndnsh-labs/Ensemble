/**
 * The node render backend of `mix:report` (`scripts/mix-render-node.ts`): the first audio render
 * in the unit suite. A two-bar funk bass line renders through the bridge's own `renderBand` on
 * node Web Audio and comes back measured — the shape `mix-report.ts` reads off the page today.
 */

import { laneEvents, performSceneForReport, sceneVoices } from '../../scripts/band-scene.js';
import { createNodeRenderer } from '../../scripts/mix-render-node.js';
import { parseExternalScenes } from '../../scripts/mix-report-utils.js';

const scene = parseExternalScenes(
    JSON.stringify([
        {
            id: 'two-bar-funk',
            genreFeel: 'Funk',
            bpm: 120,
            key: 'E',
            sections: [{ value: 'E7 | A7' }],
        },
    ]),
)[0];

describe('mix:report node render backend', () => {
    it('renders a stem through renderBand and measures it the way the page does', async () => {
        const renderer = await createNodeRenderer();
        const voices = sceneVoices(scene);
        const performed = performSceneForReport(scene, 'TEST', 1, voices);
        const passes = laneEvents(performed.band, ['bass']);
        expect(passes[0].length).toBeGreaterThan(0);

        const measured = await renderer.renderAndMeasure(
            {
                score: performed.score,
                passes,
                bpm: scene.bpm,
                sampleRate: 44100,
                intensity: 0.7,
                voices,
                randomSeed: 'two-bar-funk:TEST',
            },
            1,
        );

        expect(measured.sampleRate).toBe(44100);
        expect(measured.channels).toHaveLength(2);
        expect(measured.dispatched).toHaveLength(passes[0].length);
        // Something sounded, and the measurement is self-consistent.
        expect(measured.metrics.peakDb).toBeGreaterThan(-40);
        expect(measured.metrics.rmsDb).toBeLessThan(measured.metrics.peakDb);
        expect(measured.metrics.crestDb).toBeCloseTo(
            measured.metrics.peakDb - measured.metrics.rmsDb,
            6,
        );
        expect(measured.metrics.stereo.correlation).not.toBeNull();
        expect(measured.metrics.loopRmsDb).toBeNull(); // one pass: no arc to classify
        // A bass stem lives below 400 Hz.
        const { probes } = measured.metrics;
        expect(probes.sub + probes.low + probes.lowMid).toBeGreaterThan(0.8);
    }, 60_000);

    // The bass stem: a drum stem's cymbal picks carry module-level state between renders in one
    // process (#1552), so the drums are not the lane to make this claim on until that lands. The
    // tolerance is the renderer's own floor: under CPU load two renders differ by ~4e-6
    // (−108 dBFS, float summation order across its render threads), the class Chromium's −99 dBFS
    // floor belongs to — see the guide's `mix:ab` section. #1552's leak is 4.5e-2, 10,000× this.
    it("renders the same bass request twice to within the renderer's noise floor", async () => {
        const renderer = await createNodeRenderer();
        const voices = sceneVoices(scene);
        const performed = performSceneForReport(scene, 'TEST', 1, voices);
        const request = {
            score: performed.score,
            passes: laneEvents(performed.band, ['bass']),
            bpm: scene.bpm,
            sampleRate: 44100,
            intensity: 0.7,
            voices,
            randomSeed: 'two-bar-funk:TEST',
        };
        const a = await renderer.renderAndMeasure(request, 1);
        const b = await renderer.renderAndMeasure(request, 1);
        expect(b.channels[0]).toHaveLength(a.channels[0].length);
        let maxDiff = 0;
        for (let i = 0; i < a.channels[0].length; i++) {
            maxDiff = Math.max(maxDiff, Math.abs(a.channels[0][i] - b.channels[0][i]));
        }
        expect(maxDiff).toBeLessThan(1e-4); // −80 dBFS; a real state leak is ~1e-2
        expect(a.metrics.rmsDb).toBeCloseTo(b.metrics.rmsDb, 3);
    }, 60_000);
});
