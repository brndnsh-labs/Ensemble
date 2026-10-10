/**
 * The node render backend of `mix:report` (`scripts/mix-render-node.ts`): the first audio render
 * in the unit suite. A two-bar funk bass line renders through the bridge's own `renderBand` on
 * node Web Audio and comes back measured — the shape `mix-report.ts` reads off the page today.
 */

import { laneEvents, performSceneForReport, sceneVoices } from '../../scripts/band-scene.js';
import { createNodeRenderer } from '../../scripts/mix-render-node.js';
import { DEFAULT_MIX_REPORT_SCENES, parseExternalScenes } from '../../scripts/mix-report-utils.js';

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
                genreFeel: scene.genreFeel,
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

    // The tolerance is the renderer's own floor: under CPU load two renders differ by ~4e-6 on
    // the bass and up to ~4e-4 on the noise-heavy drums (float summation order across its render
    // threads), the class Chromium's −99 dBFS floor belongs to — see the guide's `mix:ab` section.
    // A state leak between renders is ~1e-2, thirty times the line below:
    // the synth kit's cymbal pool fills on the first four hat hits and then picks members at
    // random, never the one before, and that cursor was module-level — the second drum render in
    // a process differed from the first by 4.5e-2 (#1552).
    it.each([
        // The two-bar scene for the bass; the drums need the full funk scene, whose hat pattern
        // fills the pool and reaches the random pick where the leak showed (4.5e-2 at 1.1 s).
        { lane: 'bass' as const, fixture: scene, seed: 'TEST' },
        {
            lane: 'drums' as const,
            fixture: DEFAULT_MIX_REPORT_SCENES.find((s) => s.id === 'funk-pocket')!,
            seed: 'MIX_AUDIT',
        },
    ])(
        "renders the same $lane request twice to within the renderer's noise floor",
        async ({ lane, fixture, seed }) => {
            const renderer = await createNodeRenderer();
            const voices = sceneVoices(fixture);
            const performed = performSceneForReport(fixture, seed, 1, voices);
            const request = {
                score: performed.score,
                passes: laneEvents(performed.band, [lane]),
                bpm: fixture.bpm,
                sampleRate: 44100,
                intensity: fixture.intensity ?? 0.7,
                voices,
                randomSeed: `${fixture.id}:${seed}`,
                genreFeel: fixture.genreFeel,
            };
            const a = await renderer.renderAndMeasure(request, 1);
            const b = await renderer.renderAndMeasure(request, 1);
            expect(b.channels[0]).toHaveLength(a.channels[0].length);
            let maxDiff = 0;
            for (let i = 0; i < a.channels[0].length; i++) {
                maxDiff = Math.max(maxDiff, Math.abs(a.channels[0][i] - b.channels[0][i]));
            }
            expect(maxDiff).toBeLessThan(1e-3); // −60 dBFS; the leak measured 3.2e-2
            expect(a.metrics.rmsDb).toBeCloseTo(b.metrics.rmsDb, 3);
        },
        90_000,
    );

    // #1563: the clone used to keep the host state's genre (Rock) whatever the scene said, so a
    // Jazz scene was measured through Rock's bus EQ. The Jazz bass bus highpasses at 55 Hz and
    // flattens the +2 dB low shelf to −1; a low E (41 Hz) must come out quieter than on Rock.
    it("renders the bass bus EQ of the scene's genre, not the slice default", async () => {
        const renderer = await createNodeRenderer();
        const jazzScene = parseExternalScenes(
            JSON.stringify([
                {
                    id: 'low-e',
                    genreFeel: 'Jazz',
                    bpm: 100,
                    key: 'E',
                    sections: [{ value: 'Em7 | Em7' }],
                },
            ]),
        )[0];
        const voices = sceneVoices(jazzScene);
        const performed = performSceneForReport(jazzScene, 'TEST', 1, voices);
        const subEnergyDb = async (genreFeel: string | undefined) => {
            const render = await renderer.renderAndMeasure(
                {
                    score: performed.score,
                    passes: laneEvents(performed.band, ['bass']),
                    bpm: jazzScene.bpm,
                    sampleRate: 44100,
                    intensity: 0.7,
                    voices,
                    randomSeed: 'low-e:TEST',
                    genreFeel,
                },
                1,
            );
            // Energy around 41 Hz (the low E): a Goertzel over the whole render.
            const mono = render.channels[0];
            const omega = (2 * Math.PI * 41.2) / 44100;
            const coefficient = 2 * Math.cos(omega);
            let s0 = 0;
            let s1 = 0;
            let s2 = 0;
            for (let i = 0; i < mono.length; i++) {
                s0 = mono[i] + coefficient * s1 - s2;
                s2 = s1;
                s1 = s0;
            }
            return (
                20 * Math.log10(Math.sqrt(s1 * s1 + s2 * s2 - coefficient * s1 * s2) / mono.length)
            );
        };
        const jazz = await subEnergyDb('Jazz');
        const rock = await subEnergyDb('Rock');
        const unset = await subEnergyDb(undefined);
        expect(unset).toBeCloseTo(rock, 1); // the slice default is Rock: unset keeps old behaviour
        expect(rock - jazz).toBeGreaterThan(3); // the Jazz highpass and shelf take the low E down
    }, 90_000);
});
