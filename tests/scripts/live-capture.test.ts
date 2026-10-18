/** `scripts/live-capture.ts`: the argument parser and the link it opens the stand on. */
import { decodeChartLink } from '../../core/songbook/chart-link.js';
import { parseLiveCaptureArgs, sceneUrl } from '../../scripts/live-capture.js';
import { DEFAULT_MIX_REPORT_SCENES } from '../../scripts/mix-report-utils.js';

describe('live:capture', () => {
    it('parses every flag and defaults the rest', () => {
        expect(parseLiveCaptureArgs([])).toEqual({
            scene: 'funk-pocket',
            seed: 'ALPHA',
            bars: 8,
            out: 'tmp/live',
            build: false,
            scenesFrom: null,
            json: false,
            offline: 'page',
            off: [],
            match: 'live',
        });
        const options = parseLiveCaptureArgs([
            '--scene=jazz-ride',
            '--seed=BETA',
            '--bars=4',
            '--out=tmp/x',
            '--build',
            '--json',
            '--offline=node',
            '--off=chords,soloist',
            '--match=scene',
        ]);
        expect(options.scene).toBe('jazz-ride');
        expect(options.bars).toBe(4);
        expect(options.offline).toBe('node');
        expect(options.off).toEqual(['chords', 'soloist']);
        expect(options.match).toBe('scene');
        expect(() => parseLiveCaptureArgs(['--match=take'])).toThrow(/--match/);
        expect(() => parseLiveCaptureArgs(['--bars=0'])).toThrow(/--bars/);
        expect(() => parseLiveCaptureArgs(['--offline=firefox'])).toThrow(/--offline/);
        expect(() => parseLiveCaptureArgs(['--off=drums'])).toThrow(/--off=drums/);
        expect(() => parseLiveCaptureArgs(['--loud'])).toThrow(/unknown argument/);
    });

    it('opens the stand on the scene the way audition-link does, lane switches included', async () => {
        const scene = DEFAULT_MIX_REPORT_SCENES.find((s) => s.id === 'funk-pocket')!;
        const url = new URL(await sceneUrl('http://127.0.0.1:4321', scene, ['chords']));
        const doc = await decodeChartLink(url.hash);
        if (typeof doc !== 'object') {
            throw new Error('expected a schema-2 chart link');
        }
        expect(doc.chart.band.groove.genre).toBe('Funk');
        expect(doc.chart.performance.bpm).toBe(scene.bpm);
        expect(doc.chart.score.key).toBe(scene.key);
        expect(doc.chart.performance.energy).toBeCloseTo(scene.intensity);
        expect(doc.chart.score.sections[0].measures.length).toBeGreaterThan(1);
        expect(doc.chart.band.chords.enabled).toBe(false); // the chords switch
        expect(url.searchParams.get('autoplay')).toBeNull(); // the script presses Play itself
    });
});
