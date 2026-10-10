/** `scripts/webaudio-parity.ts`: the argument parser and the per-probe comparison. The render
 * itself needs Chromium, so it stays a CLI; the comparison is held to synthetic signals here. */
import { compareProbe, parseParityArgs } from '../../scripts/webaudio-parity.js';

const tone = (n: number, gain: number, lag = 0) =>
    Array.from({ length: n }, (_, i) => gain * Math.sin((2 * Math.PI * 440 * (i - lag)) / 44100));

describe('webaudio:parity', () => {
    it('parses the mode, a probe list and --json, and refuses what it does not know', () => {
        expect(parseParityArgs([])).toEqual({ mode: 'table', probes: null, json: false });
        expect(parseParityArgs(['--mode=latency', '--probe=a, b', '--json'])).toEqual({
            mode: 'latency',
            probes: ['a', 'b'],
            json: true,
        });
        expect(() => parseParityArgs(['--mode=firefox'])).toThrow(/--mode=firefox/);
        expect(() => parseParityArgs(['--verbose'])).toThrow(/unknown argument/);
    });

    it('reads identical signals as identical and a 1.4 dB level change as flagged', () => {
        const same = compareProbe('same', tone(22050, 0.5), tone(22050, 0.5));
        expect(same.deltaDb).toBeCloseTo(0, 6);
        expect(same.correlation).toBeCloseTo(1, 6);
        expect(same.lag).toBe(0);
        expect(same.flagged).toBe(false);

        const hotter = compareProbe(
            'hotter',
            tone(22050, 0.5 * 10 ** (1.4 / 20)),
            tone(22050, 0.5),
        );
        expect(hotter.deltaDb).toBeCloseTo(1.4, 2);
        expect(hotter.flagged).toBe(true);
    });

    it('finds a sample lag and still reports the aligned correlation', () => {
        const lagged = compareProbe('lagged', tone(22050, 0.5), tone(22050, 0.5, 37));
        expect(lagged.lag).toBe(37);
        expect(lagged.correlation).toBeCloseTo(1, 4);
        expect(lagged.flagged).toBe(false);
    });

    it('flags a different waveform at the same level', () => {
        const other = Array.from(
            { length: 22050 },
            (_, i) => 0.5 * Math.sign(Math.sin((2 * Math.PI * 440 * i) / 44100)) * 0.707,
        );
        const shape = compareProbe('shape', tone(22050, 0.5), other);
        expect(Math.abs(shape.deltaDb)).toBeLessThan(0.5);
        expect(shape.correlation).toBeLessThan(0.98);
        expect(shape.flagged).toBe(true);
    });
});
