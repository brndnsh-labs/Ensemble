/** `scripts/live-capture.ts`: the argument parser and the link it opens the stand on. */
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
        ]);
        expect(options.scene).toBe('jazz-ride');
        expect(options.bars).toBe(4);
        expect(options.offline).toBe('node');
        expect(options.off).toEqual(['chords', 'soloist']);
        expect(() => parseLiveCaptureArgs(['--bars=0'])).toThrow(/--bars/);
        expect(() => parseLiveCaptureArgs(['--offline=firefox'])).toThrow(/--offline/);
        expect(() => parseLiveCaptureArgs(['--off=drums'])).toThrow(/--off=drums/);
        expect(() => parseLiveCaptureArgs(['--loud'])).toThrow(/unknown argument/);
    });

    it('opens the stand on the scene the way audition-link does, lane switches included', () => {
        const scene = DEFAULT_MIX_REPORT_SCENES.find((s) => s.id === 'funk-pocket')!;
        const url = new URL(sceneUrl('http://127.0.0.1:4321', scene, ['chords']));
        expect(url.searchParams.get('genre')).toBe('Funk');
        expect(url.searchParams.get('bpm')).toBe(String(scene.bpm));
        expect(url.searchParams.get('key')).toBe(scene.key);
        expect(url.searchParams.get('int')).toBe(scene.intensity.toFixed(2));
        expect(url.searchParams.get('prog')).toContain('|');
        expect(url.searchParams.get('bnd')).not.toBeNull(); // the chords switch rides in `bnd`
        expect(url.searchParams.get('autoplay')).toBeNull(); // the script presses Play itself
    });
});
