// The one test in this pair that actually runs ffmpeg.
//
// `mix-spectro.test.ts` proves the grid is internally consistent — that
// `timeToPixel` computes what it says it computes. It cannot prove the thing the
// whole tool rests on: that ffmpeg AGREES. That gap is not theoretical. The first
// version of this tool mapped `x = (t − start) / duration · width` and checked it
// with a single burst near x=400 on one geometry, which is exactly where the two
// error terms happen to cancel; the mapping was in fact wrong by 10 ms at the left
// edge growing to 17.5 ms at the right, and wrong by a DIFFERENT amount on a
// `--range` zoom of the same render — so the same musical instant sat at two
// different columns on two sheets whose only purpose is to be compared.
//
// So: synthesize bursts at known times, run the tool's own filter string, find the
// columns they actually light up, and check them against `timeToPixel`. Positions
// bracket both ends of the picture, because a single mid-sheet sample cannot see a
// drift that is zero in the middle by construction.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeWav } from '../../public/engine/wav-encoder.js';
import { panelAudioFilter } from '../../scripts/mix-spectro.js';
import {
    SPECTRO_SCALE,
    spectrogramHopSamples,
    type TimeWindow,
    timeToPixel,
} from '../../scripts/spectro-grid.js';

const WIDTH = SPECTRO_SCALE.panelWidth;
const HEIGHT = SPECTRO_SCALE.panelHeight;
const SAMPLE_RATE = 44100;
/** How far a burst may sit from where `timeToPixel` says it is. */
const TOLERANCE_PX = 1.5;

function hasFfmpeg(): boolean {
    const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return !probe.error && probe.status === 0;
}

const FFMPEG_AVAILABLE = hasFfmpeg();
if (!FFMPEG_AVAILABLE) {
    console.warn(
        '\n*** spectro-calibration SKIPPED: ffmpeg is not on PATH. ***\n' +
            '*** The grid-vs-ffmpeg agreement of mix:spectro is UNVERIFIED in this run. ***\n',
    );
}

/**
 * A file of short 4 kHz bursts at the given absolute times.
 *
 * 2 ms is deliberate: long enough to put real energy in one bin at 4 kHz, short
 * enough that it is a point in time at this resolution (one column is 2.5 ms at
 * the widest hop tested here), so "which column lit up" has one honest answer.
 */
function burstFile(durationSec: number, timesSec: number[]): Float32Array {
    const samples = new Float32Array(Math.round(durationSec * SAMPLE_RATE));
    const length = Math.round(0.002 * SAMPLE_RATE);
    for (const time of timesSec) {
        const start = Math.round(time * SAMPLE_RATE);
        for (let i = 0; i < length; i++) {
            const index = start + i;
            if (index < 0 || index >= samples.length) {
                continue;
            }
            // Hann-windowed so the burst has no edge discontinuity of its own to
            // smear energy across every column.
            const envelope = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / length);
            samples[index] = 0.9 * envelope * Math.sin((2 * Math.PI * 4000 * i) / SAMPLE_RATE);
        }
    }
    return samples;
}

function run(command: string, args: string[]): Buffer {
    const result = spawnSync(command, args, { maxBuffer: 1 << 28 });
    if (result.error) {
        throw new Error(`${command} failed to start: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`${command} exited ${result.status}: ${result.stderr?.toString().trim()}`);
    }
    return result.stdout;
}

/** Per-column energy of the panel ffmpeg draws for `window`. */
function renderColumnSums(dir: string, samples: Float32Array, window: TimeWindow): Float64Array {
    const wavPath = path.join(dir, 'calibration.wav');
    const pngPath = path.join(dir, 'calibration.png');
    writeFileSync(wavPath, Buffer.from(encodeWav([samples], SAMPLE_RATE)));
    run('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        wavPath,
        '-lavfi',
        // The tool's OWN filter chain, imported rather than retyped — a copy here
        // would let the shipped one drift and this test keep passing.
        panelAudioFilter(window, WIDTH, HEIGHT),
        '-frames:v',
        '1',
        pngPath,
    ]);
    // PNG back to raw gray, so no image library is needed to read the picture.
    const gray = run('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        pngPath,
        '-f',
        'rawvideo',
        '-pix_fmt',
        'gray',
        '-',
    ]);
    expect(gray.length).toBe(WIDTH * HEIGHT);
    const columns = new Float64Array(WIDTH);
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            columns[x] += gray[y * WIDTH + x];
        }
    }
    // Sanity: the picture has to have content, or every peak below is noise.
    expect(Math.max(...columns)).toBeGreaterThan(0);
    return columns;
}

/** Brightest column within `radius` of `expected`. */
function brightestColumnNear(columns: Float64Array, expected: number, radius = 40): number {
    const from = Math.max(0, Math.round(expected - radius));
    const to = Math.min(columns.length - 1, Math.round(expected + radius));
    let best = from;
    for (let x = from; x <= to; x++) {
        if (columns[x] > columns[best]) {
            best = x;
        }
    }
    return best;
}

const suite = FFMPEG_AVAILABLE ? describe : describe.skip;

suite(
    FFMPEG_AVAILABLE
        ? 'mix-spectro — grid vs ffmpeg (end-to-end calibration)'
        : 'mix-spectro — grid vs ffmpeg (SKIPPED, ffmpeg not on PATH)',
    () => {
        let dir = '';

        const check = (window: TimeWindow, fileDurationSec: number, label: string): void => {
            // 2% / 25% / 50% / 75% / 97% of the window. The two outer positions are
            // the point: the error this test exists to catch is zero in the middle
            // and grows toward the edges.
            const span = window.endSec - window.startSec;
            const times = [0.02, 0.25, 0.5, 0.75, 0.97].map(
                (fraction) => window.startSec + fraction * span,
            );
            const columns = renderColumnSums(dir, burstFile(fileDurationSec, times), window);
            const errors = times.map((time) => {
                const expected = timeToPixel(time, window, WIDTH, SAMPLE_RATE);
                return brightestColumnNear(columns, expected) - expected;
            });
            const report = times
                .map((time, index) => `t=${time.toFixed(3)}s → ${errors[index].toFixed(2)}px`)
                .join(', ');
            for (const error of errors) {
                expect(
                    Math.abs(error) <= TOLERANCE_PX,
                    `${label} (hop ${spectrogramHopSamples(window, WIDTH, SAMPLE_RATE)}): ${report}`,
                ).toBe(true);
            }
        };

        const withDir = (fn: () => void) => {
            dir = mkdtempSync(path.join(tmpdir(), 'ensemble-calibration-'));
            try {
                fn();
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        };

        it('lands every burst within 1.5 px of the grid, from one edge to the other', () => {
            // A 4.000 s window: 176 400 samples, hop 110, so the picture spans
            // 176 000 — the geometry where the naive mapping drifted 0 → 4 px.
            withDir(() => check({ startSec: 0, endSec: 4 }, 4.2, 'full sheet'));
        });

        it('holds on a mid-file window, which is what a --range zoom renders', () => {
            // A zoom re-derives the hop from its own shorter window, so its drift is
            // a different one — two sheets of the same render disagreeing is the
            // failure mode that makes the tool useless rather than merely inaccurate.
            withDir(() => check({ startSec: 1.3, endSec: 6.3 }, 8, 'zoom'));
        });

        it('holds at a long-window hop, which is what a default full sheet renders', () => {
            // Hop 570. The sample-domain half of the calibration is worth only 0.7 px
            // at this size and the column-domain half −0.83, so the two nearly cancel
            // — this case is not what pins either constant (measured: it passes with
            // both zeroed). It is here because it is the geometry every full sheet
            // actually uses, and because it is where a mapping tuned only on the
            // short windows above would go wrong.
            withDir(() => check({ startSec: 0, endSec: 20.7 }, 21, 'long form'));
        });

        it('reads the burst positions the shipped constants were fitted to', () => {
            // Regression pin on the numbers themselves, not just the tolerance: at
            // this geometry ffmpeg puts the 1.000 s burst in column 404, and the
            // pre-fix mapping said 400.
            withDir(() => {
                const window = { startSec: 0, endSec: 4 };
                const columns = renderColumnSums(dir, burstFile(4.2, [1, 2, 3]), window);
                expect([1, 2, 3].map((t) => brightestColumnNear(columns, t * 400))).toEqual([
                    404, 805, 1206,
                ]);
            });
        });
    },
);
