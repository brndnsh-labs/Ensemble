// Everything here is the PURE half of `mix:spectro` / `mix:plant`: the geometry
// that decides where a grid line lands, and the sample surgery that plants a known
// defect. No ffmpeg is invoked — the picture is not the thing under test, the
// claim "that smudge is bar 6 beat 3" is, and that claim is arithmetic. The one
// thing arithmetic cannot settle — whether ffmpeg agrees with our arithmetic —
// lives in `spectro-calibration.test.ts`, which does run it.
//
// Expected pixel values below are HAND-COMPUTED from the documented mapping and
// written as literals. A test that re-derives them by calling the implementation
// (`expect(line.x).toBeCloseTo(t / duration * width)`) passes for any mapping the
// implementation happens to have, which is exactly how the hop-quantization bug
// shipped under a green suite.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeWav } from '../../public/engine/wav-encoder.js';
import {
    buildCaption,
    compositeFilter,
    defaultOutPath,
    type EventDump,
    type LoadedStem,
    loadRenderDir,
    orderStems,
    panelAudioFilter,
    parseMixSpectroArgs,
    requireSingleScene,
    spectrumFilter,
} from '../../scripts/mix-spectro.js';
import {
    applyClick,
    applyDropLane,
    applyFlattenAccents,
    applyMuteRegion,
    assignDefects,
    beatTime,
    DEFECT_TYPES,
    parsePlantDefectsArgs,
    type RenderFile,
} from '../../scripts/plant-defects.js';
import {
    barRangeToWindow,
    blendPixel,
    chooseLabelStride,
    computeGridLines,
    createCanvas,
    effectiveSpanSec,
    fullSheetWindow,
    type GridLine,
    layoutSheet,
    measureText,
    musicEndSec,
    padWindowForClosingLine,
    panelTop,
    parseBarRange,
    renderOverlay,
    SPECTRO_SCALE,
    spectrogramHopSamples,
    timeToPixel,
} from '../../scripts/spectro-grid.js';

/**
 * 120 bpm → a sixteenth is exactly 0.125 s, so a bar is 2.000 s and 64 steps are
 * 8.000 s of music after a 0.25 s lead-in.
 */
const META = {
    sampleRate: 44100,
    leadInSeconds: 0.25,
    stepSeconds: 0.125,
    stepsPerLoop: 64,
    loopCount: 1,
    bpm: 120,
};

describe('mix-spectro — time → pixel', () => {
    it('maps against the hop-quantized span, not the nominal window duration', () => {
        // 4.000 s at 44 100 Hz is 176 400 samples; showspectrumpic advances
        // floor(176400 / 1600) = 110 samples per column, so the picture spans
        // 176 000 samples and the naive 400 px/s is wrong by 0.23%.
        const window = { startSec: 0, endSec: 4 };
        expect(spectrogramHopSamples(window, 1600, 44100)).toBe(110);
        expect(effectiveSpanSec(window, 1600, 44100)).toBeCloseTo(176000 / 44100, 9);

        // x = (t·44100 + 422) / 110 − 0.83, worked out by hand at each point.
        expect(timeToPixel(0, window, 1600, 44100)).toBeCloseTo(3.006364, 5);
        expect(timeToPixel(1, window, 1600, 44100)).toBeCloseTo(403.915455, 5);
        expect(timeToPixel(2, window, 1600, 44100)).toBeCloseTo(804.824545, 5);
        expect(timeToPixel(3, window, 1600, 44100)).toBeCloseTo(1205.733636, 5);

        // The whole point of the correction: the naive mapping said 0/400/800/1200
        // and drifted ~1 px further out at every second. ffmpeg's own answer for
        // this geometry is columns 404 / 805 / 1206 (see spectro-calibration).
        expect(timeToPixel(4, window, 1600, 44100)).toBeGreaterThan(1600);
    });

    it('is relative to the window start, not to the file start', () => {
        // The zoomed sheet's panel begins at the trim point, so a bare `t/duration`
        // would put every zoomed grid line at the wrong column. 2.000 s → hop 55.
        const window = { startSec: 0.5, endSec: 2.5 };
        expect(spectrogramHopSamples(window, 1600, 44100)).toBe(55);
        expect(timeToPixel(0.5, window, 1600, 44100)).toBeCloseTo(6.842727, 5);
        expect(timeToPixel(1.0, window, 1600, 44100)).toBeCloseTo(407.751818, 5);
    });

    it('refuses a window with no duration rather than dividing by zero', () => {
        expect(() => timeToPixel(1, { startSec: 2, endSec: 2 }, 1600, 44100)).toThrow(
            /positive duration/,
        );
    });

    it('refuses a window too short to advance one sample per column', () => {
        // 0.03 s at 44 100 Hz is 1323 samples across 1600 columns — hop floors to 0,
        // and the mapping would divide by it.
        expect(() => timeToPixel(0, { startSec: 0, endSec: 0.03 }, 1600, 44100)).toThrow(
            /whole sample per column/,
        );
    });
});

describe('mix-spectro — the musical grid', () => {
    // The default sheet window: 8.25 s of form, plus the one-beat closing pad.
    const window = fullSheetWindow(META, 10);
    const lines = computeGridLines(META, window, 1600);

    it('trims the render to the form, then pads one beat for the closing line', () => {
        expect(musicEndSec(META)).toBe(8.25);
        expect(window).toEqual({ startSec: 0, endSec: 8.75 });
        // 8.75 s → 385 875 samples → floor(385875 / 1600) = 241 samples per column.
        expect(spectrogramHopSamples(window, 1600, META.sampleRate)).toBe(241);
    });

    it('clamps the window to a file that decoded shorter than the form', () => {
        // The pad cannot conjure audio: a file that stops at 5 s gives a 5 s window,
        // not 5.5. Without the clamp ffmpeg would `apad` the difference and the
        // sheet would draw silence as if it were the end of the form.
        expect(fullSheetWindow(META, 5)).toEqual({ startSec: 0, endSec: 5 });
    });

    it('starts bar 1 at the lead-in, not at t=0', () => {
        // The single most load-bearing assertion in this file: drop the lead-in and
        // every line on every sheet shifts by the same constant, which still LOOKS
        // like a grid.
        const barOne = lines.find((line) => line.kind === 'bar' && line.bar === 1);
        expect(barOne?.timeSec).toBe(0.25);
        // (0.25 · 44100 + 422) / 241 − 0.83 = 11447/241 − 0.83.
        expect(barOne?.x).toBeCloseTo(46.667925, 5);
        expect(lines.find((line) => line.timeSec === 0)).toBeUndefined();
    });

    it('places every bar line at a hand-computed pixel', () => {
        const bars = lines.filter((line) => line.kind === 'bar');
        // 4 bars of music, plus the closing boundary of bar 4.
        expect(bars.map((line) => line.bar)).toEqual([1, 2, 3, 4, 5]);
        expect(bars.map((line) => line.timeSec)).toEqual([0.25, 2.25, 4.25, 6.25, 8.25]);
        // Each worked out as (t · 44100 + 422) / 241 − 0.83; a bar is 88 200 samples,
        // i.e. 365.975 px at this hop.
        expect(bars.map((line) => Number(line.x.toFixed(4)))).toEqual([
            46.6679, 412.643, 778.6181, 1144.5932, 1510.5683,
        ]);
    });

    it('subdivides each bar into four beats, and calls only the first a bar line', () => {
        const barTwo = lines.filter((line) => line.bar === 2);
        expect(barTwo.map((line) => line.kind)).toEqual(['bar', 'beat', 'beat', 'beat']);
        expect(barTwo.map((line) => line.beat)).toEqual([1, 2, 3, 4]);
        // Bar 2 opens at 0.25 + 2 = 2.25 s; a beat is 4 × 0.125 = 0.5 s.
        expect(barTwo.map((line) => line.timeSec)).toEqual([2.25, 2.75, 3.25, 3.75]);
    });

    it('emits a closing boundary so the last bar has a right edge', () => {
        const closing = lines.filter((line) => line.bar === 5);
        expect(closing).toHaveLength(1);
        expect(closing[0].kind).toBe('bar');
        expect(closing[0].timeSec).toBe(8.25);
        // And it is INSIDE the picture — a closing line on the window's own edge
        // lands past the last column and is never drawn.
        expect(closing[0].x).toBeLessThan(1600 - 2);
    });

    it('closes a form that ends mid-bar on its last step, not on the missing bar line', () => {
        // 40 steps = 2.5 bars. The old `step > totalSteps` guard dropped the closing
        // line entirely here, so a partial-form sheet had no right edge at all.
        const partial = { ...META, stepsPerLoop: 40 };
        const partialWindow = fullSheetWindow(partial, 10);
        const partialLines = computeGridLines(partial, partialWindow, 1600);
        const bars = partialLines.filter((line) => line.kind === 'bar');
        expect(bars.map((line) => line.bar)).toEqual([1, 2, 3, 4]);
        // Bar 4's line is the END OF THE MUSIC (step 40 = 5.25 s), not the bar-48
        // boundary at 6.25 s, which is not in the render.
        expect(bars.map((line) => line.timeSec)).toEqual([0.25, 2.25, 4.25, 5.25]);
        // The half bar keeps only the beats strictly inside it: steps 32 and 36.
        expect(partialLines.filter((line) => line.bar === 3).map((line) => line.timeSec)).toEqual([
            4.25, 4.75,
        ]);
    });

    it('keeps a line sitting exactly on a window edge', () => {
        // Bracketing the inclusion test: at the edge the line is kept, one step
        // past it the line is gone. A strict `<`/`>` here would silently drop the
        // downbeat of every zoomed sheet.
        const tight = computeGridLines(META, { startSec: 0.25, endSec: 2.25 }, 1600);
        expect(tight[0].timeSec).toBe(0.25);
        expect(tight[tight.length - 1].timeSec).toBe(2.25);
        const nudged = computeGridLines(META, { startSec: 0.26, endSec: 2.24 }, 1600);
        expect(nudged[0].timeSec).toBe(0.75);
        expect(nudged[nudged.length - 1].timeSec).toBe(1.75);
    });

    it('scales the whole grid with loopCount', () => {
        const twoLoops = computeGridLines(
            { ...META, loopCount: 2 },
            { startSec: 0, endSec: 16.75 },
            1600,
        );
        const bars = twoLoops.filter((line) => line.kind === 'bar');
        expect(bars).toHaveLength(9); // 8 bars of music + the closing boundary
    });

    it('rejects a stepsPerBar that is not a whole number of beats', () => {
        expect(() => computeGridLines(META, window, 1600, 6)).toThrow(/multiple of 4/);
    });
});

describe('mix-spectro — --range=barA..barB', () => {
    it('parses an inclusive bar range', () => {
        expect(parseBarRange('bar3..bar5')).toEqual({ fromBar: 3, toBar: 5 });
        expect(parseBarRange('  BAR1..BAR1  ')).toEqual({ fromBar: 1, toBar: 1 });
    });

    it('rejects a malformed, zero-indexed or reversed range', () => {
        // A silently-coerced range renders the wrong music with no landmark a
        // reader could use to notice.
        expect(() => parseBarRange('3..5')).toThrow(/bar3\.\.bar5/);
        expect(() => parseBarRange('bar3-bar5')).toThrow(/bar3\.\.bar5/);
        expect(() => parseBarRange('bar0..bar4')).toThrow(/1-indexed/);
        expect(() => parseBarRange('bar5..bar3')).toThrow(/ascending/);
    });

    it('turns a bar range into the exact seconds it covers, lead-in included', () => {
        // bars 3–5 inclusive on an 8-bar form: the top of bar 3 to the top of bar 6.
        const eightBars = { ...META, loopCount: 2 };
        expect(barRangeToWindow({ fromBar: 3, toBar: 5 }, eightBars)).toEqual({
            startSec: 4.25,
            endSec: 10.25,
        });
        // A single bar is one bar long, not zero.
        expect(barRangeToWindow({ fromBar: 1, toBar: 1 }, META)).toEqual({
            startSec: 0.25,
            endSec: 2.25,
        });
    });

    it('clamps a range that runs past the end of the form', () => {
        // `--range=bar3..bar5` on this 4-bar render used to exit 0 with the right
        // third of every panel filled by `apad` silence, captioned "BARS 3-5".
        expect(barRangeToWindow({ fromBar: 3, toBar: 5 }, META)).toEqual({
            startSec: 4.25,
            endSec: 8.25,
        });
    });

    it('refuses a range that starts past the end of the form', () => {
        // `--range=bar90..bar99` on a 4-bar render emitted a wholly black sheet.
        expect(() => barRangeToWindow({ fromBar: 90, toBar: 99 }, META)).toThrow(
            /bar 90.*4 bar\(s\)/,
        );
        // Bracketed: the last bar is in range, one past it is not.
        expect(() => barRangeToWindow({ fromBar: 4, toBar: 4 }, META)).not.toThrow();
        expect(() => barRangeToWindow({ fromBar: 5, toBar: 5 }, META)).toThrow(/starts at bar 5/);
    });

    it('puts the zoomed downbeat near pixel 0 and the closing line inside the image', () => {
        // Two loops = 8 bars, so bar 6's opening line genuinely exists.
        const eightBars = { ...META, loopCount: 2 };
        const window = padWindowForClosingLine(
            barRangeToWindow({ fromBar: 3, toBar: 5 }, eightBars),
            eightBars,
            30,
        );
        expect(window).toEqual({ startSec: 4.25, endSec: 10.75 });
        // 6.5 s → 286 650 samples → hop 179.
        expect(spectrogramHopSamples(window, 1600, META.sampleRate)).toBe(179);

        const bars = computeGridLines(eightBars, window, 1600).filter(
            (line) => line.kind === 'bar',
        );
        expect(bars.map((line) => line.bar)).toEqual([3, 4, 5, 6]);
        // ((t − 4.25) · 44100 + 422) / 179 − 0.83 at each of the four.
        expect(bars.map((line) => Number(line.x.toFixed(4)))).toEqual([
            1.5275, 494.265, 987.0024, 1479.7398,
        ]);
    });
});

describe('mix-spectro — bar-number thinning', () => {
    it('holds stride 1 at the threshold and doubles one pixel under it', () => {
        // Bracketed, not sampled mid-band: a stride chosen from a spacing well
        // inside a band cannot see the boundary move.
        expect(chooseLabelStride(40, 40)).toBe(1);
        expect(chooseLabelStride(39.999, 40)).toBe(2);
        expect(chooseLabelStride(20, 40)).toBe(1 * 2);
        expect(chooseLabelStride(19.999, 40)).toBe(4);
    });

    it('degenerates safely on a zero or negative spacing', () => {
        expect(chooseLabelStride(0, 40)).toBe(1);
        expect(chooseLabelStride(-5, 40)).toBe(1);
    });
});

describe('mix-spectro — sheet layout', () => {
    it('stacks panels under a header and over an axis strip', () => {
        // Literal heights, not the formula restated: 34 + 3 × 400 + 44. Re-deriving
        // this from `layout.headerHeight` passes for HEADER_HEIGHT = 0 or 9999.
        const layout = layoutSheet(3);
        expect(layout.width).toBe(1600);
        expect(layout.headerHeight).toBe(34);
        expect(layout.panelHeight).toBe(400);
        expect(layout.axisHeight).toBe(44);
        expect(layout.height).toBe(1278);
        expect(panelTop(layout, 0)).toBe(34);
        expect(panelTop(layout, 1)).toBe(434);
        expect(panelTop(layout, 2)).toBe(834);
    });

    it('keeps the pinned panel size the sheet width is built from', () => {
        // The lag calibration is measured at this panel size, so a change here is a
        // change to the time→pixel mapping, not only to how big the picture is.
        expect(SPECTRO_SCALE.panelWidth).toBe(1600);
        expect(SPECTRO_SCALE.panelHeight).toBe(400);
    });

    it('refuses an empty sheet', () => {
        expect(() => layoutSheet(0)).toThrow(/at least one panel/);
    });

    it('measures text as glyphs plus inter-glyph gaps', () => {
        // 5 px glyph + 1 px gap, minus the trailing gap, times the scale.
        expect(measureText('8', 1)).toBe(5);
        expect(measureText('88', 1)).toBe(11);
        expect(measureText('88', 2)).toBe(22);
        expect(measureText('', 3)).toBe(0);
    });
});

describe('mix-spectro — straight-alpha compositing', () => {
    // The overlay is handed to ffmpeg as `-pix_fmt rgba` and composited by
    // `overlay`, both of which read STRAIGHT alpha. The premultiplied form this
    // replaced left the alpha channel correct and only the colors wrong, which is
    // why an alpha-only test never saw it — so these read RGB.
    const pixel = (canvas: ReturnType<typeof createCanvas>, x: number, y: number): number[] => {
        const index = (y * canvas.width + x) * 4;
        return [...canvas.data.slice(index, index + 4)];
    };

    it('stores a translucent color at its own full brightness', () => {
        const canvas = createCanvas(4, 4);
        blendPixel(canvas, 1, 1, [255, 255, 255, 200]);
        // Premultiplied storage gave [200, 200, 200, 200] here, which ffmpeg then
        // composited to 157 over black instead of the 200 the constant asks for.
        expect(pixel(canvas, 1, 1)).toEqual([255, 255, 255, 200]);
    });

    it('blends a second translucent layer over the first', () => {
        const canvas = createCanvas(4, 4);
        blendPixel(canvas, 1, 1, [255, 255, 255, 200]);
        blendPixel(canvas, 1, 1, [0, 0, 0, 175]);
        // outA = 175/255 + (200/255)(1 − 175/255) = 0.932334 → 238.
        // rgb  = 255 · (200/255)(1 − 175/255) / 0.932334 = 67.30 → 67.
        expect(pixel(canvas, 1, 1)).toEqual([67, 67, 67, 238]);
    });

    it('leaves a fully transparent write as transparent rather than NaN', () => {
        // The canvas starts at alpha 0, so the source-over divide is by zero here.
        const canvas = createCanvas(4, 4);
        blendPixel(canvas, 2, 2, [255, 0, 0, 0]);
        expect(pixel(canvas, 2, 2)).toEqual([0, 0, 0, 0]);
    });

    it('writes an opaque color through unchanged', () => {
        const canvas = createCanvas(4, 4);
        blendPixel(canvas, 0, 0, [17, 34, 51, 255]);
        expect(pixel(canvas, 0, 0)).toEqual([17, 34, 51, 255]);
    });

    it('drops out-of-bounds writes instead of wrapping to the next row', () => {
        const canvas = createCanvas(4, 4);
        blendPixel(canvas, 4, 0, [255, 255, 255, 255]);
        blendPixel(canvas, -1, 0, [255, 255, 255, 255]);
        expect([...canvas.data].every((value) => value === 0)).toBe(true);
    });
});

describe('mix-spectro — overlay raster', () => {
    const layout = layoutSheet(2);
    const window = fullSheetWindow(META, 10);
    const canvas = renderOverlay({
        layout,
        gridLines: computeGridLines(META, window, layout.width),
        panelLabels: ['full', 'bass'],
        caption: 'TEST',
        labelStride: 1,
    });
    const at = (x: number, y: number): number[] => {
        const index = (y * canvas.width + x) * 4;
        return [...canvas.data.slice(index, index + 4)];
    };
    const midPanel = panelTop(layout, 0) + 300;

    it('leaves the audio area transparent and paints only grid + gutters', () => {
        expect(canvas.width).toBe(1600);
        expect(canvas.height).toBe(878); // 34 + 2 × 400 + 44
        expect(canvas.data.length).toBe(1600 * 878 * 4);
        // The header strip is opaque so the pad color never shows through.
        expect(at(800, 5)[3]).toBe(255);
        // Mid-panel, away from any grid line and any label: fully transparent, so
        // the spectrogram underneath is never hidden by the annotation layer.
        expect(at(900, midPanel)).toEqual([0, 0, 0, 0]);
    });

    it('draws bar 2 as a 2 px full-brightness line at its computed column', () => {
        // Bar 2 sits at 412.643 → rounded 413, drawn as columns 412-413.
        expect(at(411, midPanel)).toEqual([0, 0, 0, 0]);
        expect(at(412, midPanel)).toEqual([255, 255, 255, 200]);
        expect(at(413, midPanel)).toEqual([255, 255, 255, 200]);
        expect(at(414, midPanel)).toEqual([0, 0, 0, 0]);
    });

    it('draws a beat line 1 px wide and lighter than a bar line', () => {
        // Beat 3 of bar 2 (2.75 s) → 504.137 → column 504.
        expect(at(504, midPanel)).toEqual([255, 255, 255, 95]);
        expect(at(505, midPanel)).toEqual([0, 0, 0, 0]);
    });

    it('refuses a label count that does not match the panel count', () => {
        // A shifted label list would name every lane as its neighbor — the sheet
        // would still render, and every claim read off it would be wrong.
        expect(() =>
            renderOverlay({
                layout: layoutSheet(2),
                gridLines: [],
                panelLabels: ['full'],
                caption: '',
                labelStride: 1,
            }),
        ).toThrow(/1 labels for 2 panels/);
    });

    const barLineAt = (x: number): GridLine => ({ kind: 'bar', timeSec: 0, bar: 1, beat: 1, x });
    const overlayWith = (lines: GridLine[]) =>
        renderOverlay({
            layout: layoutSheet(1),
            gridLines: lines,
            panelLabels: ['full'],
            caption: '',
            labelStride: 1,
        });

    it('keeps an edge bar line at its full 2 px weight', () => {
        // `round(x) − 1` put one of the two columns out of bounds at each edge, and
        // the dropped write rendered the edge bar at half weight — on a zoom, that
        // is the downbeat the whole read is aligned against.
        const y = panelTop(layoutSheet(1), 0) + 100;
        const left = overlayWith([barLineAt(0.2)]);
        const right = overlayWith([barLineAt(1599.6)]);
        const read = (c: typeof left, x: number) => c.data[(y * c.width + x) * 4 + 3];
        expect([read(left, 0), read(left, 1), read(left, 2)]).toEqual([200, 200, 0]);
        expect([read(right, 1597), read(right, 1598), read(right, 1599)]).toEqual([0, 200, 200]);
    });

    it('does not drag a line that is wholly off the picture back onto it', () => {
        // Clamping unconditionally would put a confident bar line on audio it does
        // not belong to, and the reader cannot see that happen.
        const y = panelTop(layoutSheet(1), 0) + 100;
        const canvas = overlayWith([barLineAt(1608)]);
        expect(canvas.data[(y * canvas.width + 1599) * 4 + 3]).toBe(0);
    });
});

describe('mix-spectro — CLI parsing', () => {
    it('reads every flag, and defaults the rest', () => {
        expect(
            parseMixSpectroArgs([
                '--scene=funk-pocket',
                '--stems=bass,drums',
                '--loops=3',
                '--seed=ALPHA',
                '--out=tmp/sheet.png',
                '--range=bar3..bar5',
                '--no-build',
            ]),
        ).toEqual({
            scene: 'funk-pocket',
            stems: ['bass', 'drums'],
            loops: 3,
            seed: 'ALPHA',
            from: null,
            out: 'tmp/sheet.png',
            range: 'bar3..bar5',
            noBuild: true,
        });

        const defaults = parseMixSpectroArgs([]);
        expect(defaults.scene).toBeNull();
        expect(defaults.stems).toEqual([]);
        expect(defaults.loops).toBe(1);
        expect(defaults.from).toBeNull();
        expect(defaults.range).toBeNull();
        expect(defaults.noBuild).toBe(false);
    });

    it('rejects an unknown flag rather than ignoring it', () => {
        expect(() => parseMixSpectroArgs(['--wat=1'])).toThrow(/Unknown flag/);
    });

    it('falls back to one loop on a nonsense --loops value', () => {
        expect(parseMixSpectroArgs(['--loops=0']).loops).toBe(1);
        expect(parseMixSpectroArgs(['--loops=abc']).loops).toBe(1);
    });

    it('rejects render flags alongside --from', () => {
        // The replayed directory has its own scene, seed and loop count baked in;
        // accepting these would caption the sheet with a render that never happened.
        expect(() => parseMixSpectroArgs(['--from=tmp/ears', '--scene=jazz-ride'])).toThrow(
            /do not apply/,
        );
        expect(() => parseMixSpectroArgs(['--from=tmp/ears', '--no-build'])).toThrow(
            /do not apply/,
        );
        // `--loops` needs a sentinel of its own: it defaults to 1, so "not passed"
        // and "passed 1" are the same value. It was silently accepted and ignored.
        expect(() => parseMixSpectroArgs(['--from=tmp/ears', '--loops=2'])).toThrow(/do not apply/);
        expect(() => parseMixSpectroArgs(['--from=tmp/ears', '--loops=1'])).toThrow(/do not apply/);
        expect(parseMixSpectroArgs(['--from=tmp/ears', '--range=bar1..bar2']).from).toBe(
            'tmp/ears',
        );
    });
});

describe('mix-spectro — one scene per sheet', () => {
    it('accepts a single-scene directory and reports its scene', () => {
        expect(requireSingleScene(['funk-pocket', 'funk-pocket', 'funk-pocket'], '--scene')).toBe(
            'funk-pocket',
        );
    });

    it('refuses a directory holding more than one scene', () => {
        // A bare `mix:spectro` renders all four default scenes (96/104/118/138 bpm)
        // into one directory; the grid can only be right about one of them.
        expect(() =>
            requireSingleScene(['jazz-ride', 'funk-pocket', 'jazz-ride'], '--scene=<id>'),
        ).toThrow(/2 scenes \(funk-pocket, jazz-ride\).*--scene=<id>/s);
    });
});

describe('mix-spectro — caption, panel order and output path', () => {
    const dump = (stem: string, scene = 'funk-pocket'): EventDump => ({
        scene,
        stem,
        seed: 'MIX_AUDIT',
        tracks: [stem],
        meta: META,
    });

    it('captions the sheet with everything needed to read it off the CLI', () => {
        expect(buildCaption(dump('full'), META, { startSec: 0, endSec: 8.75 }, null)).toBe(
            'funk-pocket/MIX_AUDIT  120 BPM  4 BARS  0.00-8.75S  20-16000HZ LOG  DRANGE 96DB',
        );
    });

    it('names the bar range on a zoomed sheet instead of the bar count', () => {
        expect(
            buildCaption(
                dump('full'),
                META,
                { startSec: 4.25, endSec: 10.75 },
                {
                    fromBar: 3,
                    toBar: 5,
                },
            ),
        ).toBe(
            'funk-pocket/MIX_AUDIT  120 BPM  BARS 3-5  4.25-10.75S  20-16000HZ LOG  DRANGE 96DB',
        );
    });

    it('rounds a partial bar up in the caption rather than reporting fewer bars', () => {
        const partial = { ...META, stepsPerLoop: 40 };
        expect(buildCaption(dump('full'), partial, { startSec: 0, endSec: 5.75 }, null)).toContain(
            '3 BARS',
        );
    });

    it('puts the mix on top and the lanes low-to-high, whatever order they load in', () => {
        // `readdirSync` is alphabetical, which would put `bass` above `full` and
        // shuffle the rows between two sheets that exist to be compared.
        const loaded = ['soloist', 'bass', 'full', 'drums', 'chords'].map(
            (stem): LoadedStem => ({ dump: dump(stem), wavPath: `${stem}.wav`, durationSec: 1 }),
        );
        expect(orderStems(loaded).map((entry) => entry.dump.stem)).toEqual([
            'full',
            'drums',
            'bass',
            'chords',
            'soloist',
        ]);
    });

    it('keeps unknown stems after the known ones, in alphabetical order', () => {
        const loaded = ['zither', 'bass', 'accordion'].map(
            (stem): LoadedStem => ({ dump: dump(stem), wavPath: `${stem}.wav`, durationSec: 1 }),
        );
        expect(orderStems(loaded).map((entry) => entry.dump.stem)).toEqual([
            'bass',
            'accordion',
            'zither',
        ]);
    });

    it('derives a default output path from the scene and seed', () => {
        const plain = defaultOutPath(dump('full'), null);
        expect(path.basename(plain)).toBe('funk-pocket-MIX_AUDIT.png');
        expect(path.dirname(plain).endsWith(path.join('tmp', 'spectro'))).toBe(true);
        // `..` is not path-safe, so a range spec is flattened into the file name.
        expect(path.basename(defaultOutPath(dump('full'), 'bar3..bar5'))).toBe(
            'funk-pocket-MIX_AUDIT-bar3-bar5.png',
        );
    });
});

describe('mix-spectro — loading a render directory', () => {
    const write = (
        dir: string,
        stem: string,
        sampleRate: number,
        frames: number,
        options: { scene?: string; wavRate?: number } = {},
    ) => {
        const scene = options.scene ?? 'a';
        const name = `${scene}-${stem}-SEED`;
        writeFileSync(
            path.join(dir, `${name}.events.json`),
            JSON.stringify({
                scene,
                stem,
                seed: 'SEED',
                tracks: [stem],
                meta: { ...META, sampleRate },
            }),
        );
        writeFileSync(
            path.join(dir, `${name}.wav`),
            Buffer.from(encodeWav([new Float32Array(frames)], options.wavRate ?? sampleRate)),
        );
    };
    const withDir = (fn: (dir: string) => void): void => {
        const dir = mkdtempSync(path.join(tmpdir(), 'ensemble-spectro-test-'));
        try {
            fn(dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    };

    it('reads each dump with its WAV, and measures the file duration from the audio', () => {
        withDir((dir) => {
            write(dir, 'bass', 44100, 22050);
            write(dir, 'full', 44100, 44100);
            const loaded = loadRenderDir(dir, []);
            expect(loaded.map((entry) => entry.dump.stem).sort()).toEqual(['bass', 'full']);
            expect(loaded.map((entry) => entry.durationSec).sort()).toEqual([0.5, 1]);
        });
    });

    it('applies --stems as a filter, and says so when it matches nothing', () => {
        withDir((dir) => {
            write(dir, 'bass', 44100, 4410);
            write(dir, 'full', 44100, 4410);
            expect(loadRenderDir(dir, ['full']).map((entry) => entry.dump.stem)).toEqual(['full']);
            expect(() => loadRenderDir(dir, ['kazoo'])).toThrow(/no stems matched/);
        });
    });

    it('refuses a WAV whose rate disagrees with its own event dump', () => {
        // Every grid line would be at the wrong second while the picture still
        // looked entirely plausible.
        withDir((dir) => {
            write(dir, 'bass', 44100, 4800, { wavRate: 48000 });
            expect(() => loadRenderDir(dir, [])).toThrow(/48000 Hz but its event dump says 44100/);
        });
    });

    it('refuses a directory that is not a render directory at all', () => {
        withDir((dir) => {
            expect(() => loadRenderDir(dir, [])).toThrow(/no \*\.events\.json/);
        });
    });
});

describe('mix-spectro — the ffmpeg filter graph', () => {
    // Not a rendering test — a PIN. The tool's whole time→pixel contract rests on
    // the legend being off and the scales never moving, and both live in a string
    // that is easy to edit and impossible to notice having edited.
    it('keeps the legend off, so the image is the plot', () => {
        expect(spectrumFilter(1600, 400)).toContain('legend=0');
    });

    it('emits every pinned scale at the requested panel size', () => {
        const filter = spectrumFilter(1600, 400);
        expect(filter).toBe(
            'showspectrumpic=s=1600x400:legend=0:scale=log:fscale=log:start=20:stop=16000:' +
                'drange=96:limit=0:color=intensity:win_func=hann',
        );
        expect(SPECTRO_SCALE.legend).toBe(0);
    });

    it('forces every panel onto the same window duration before the spectrum', () => {
        // A stem that decoded one frame short would otherwise be stretched across
        // the same panel width as the others — its grid subtly, invisibly wrong.
        const filter = panelAudioFilter({ startSec: 4.5, endSec: 6.5 }, 1600, 400);
        expect(filter.startsWith('atrim=start=4.5:end=6.5,asetpts=PTS-STARTPTS,')).toBe(true);
        expect(filter).toContain('apad=whole_dur=2');
        expect(filter).toContain('atrim=end=2,showspectrumpic=');
    });

    it('stacks, pads and overlays — and skips vstack on a one-panel sheet', () => {
        const many = compositeFilter(layoutSheet(3));
        expect(many).toContain('[0:v][1:v][2:v]vstack=inputs=3[stack]');
        expect(many).toContain('[stack]pad=1600:1278:0:34');
        // The overlay is always the input AFTER the panels.
        expect(many).toContain('[padded][3:v]overlay=0:0');

        // `vstack` needs two or more inputs; one panel goes straight to `pad`.
        const one = compositeFilter(layoutSheet(1));
        expect(one).not.toContain('vstack');
        expect(one).toContain('[0:v]pad=');
        expect(one).toContain('[padded][1:v]overlay=0:0');
    });
});

describe('mix-plant — CLI parsing', () => {
    it('defaults to planting every defect class', () => {
        const options = parsePlantDefectsArgs(['--from=tmp/ears', '--out=tmp/bad']);
        expect(options.defects).toEqual([...DEFECT_TYPES]);
    });

    it('accepts a subset and rejects an unknown class', () => {
        expect(
            parsePlantDefectsArgs(['--from=a', '--out=b', '--defects=click,drop-lane']).defects,
        ).toEqual(['click', 'drop-lane']);
        expect(() => parsePlantDefectsArgs(['--from=a', '--out=b', '--defects=wobble'])).toThrow(
            /Unknown defect/,
        );
    });

    it('requires both directories and refuses to overwrite the control', () => {
        expect(() => parsePlantDefectsArgs(['--out=b'])).toThrow(/--from/);
        expect(() => parsePlantDefectsArgs(['--from=a'])).toThrow(/--out/);
        expect(() => parsePlantDefectsArgs(['--from=tmp/x', '--out=tmp/x'])).toThrow(/must differ/);
        expect(() => parsePlantDefectsArgs(['--from=a', '--out=b', '--wat'])).toThrow(
            /Unknown flag/,
        );
    });
});

describe('mix-plant — planted defects', () => {
    const SAMPLE_RATE = 1000; // round numbers; the transforms are rate-agnostic
    const tone = (length: number, amplitude = 0.5): Float32Array => {
        const out = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            out[i] = Math.sin((2 * Math.PI * i) / 20) * amplitude;
        }
        return out;
    };

    it('mute-region silences exactly the samples it claims, and no others', () => {
        const source = tone(1000);
        const out = applyMuteRegion(source, SAMPLE_RATE, 0.2, 0.5);
        // Bracketed on both boundaries: the region is half-open [200, 500).
        expect(out[199]).toBe(source[199]);
        expect(out[200]).toBe(0);
        expect(out[499]).toBe(0);
        expect(out[500]).toBe(source[500]);
        // Nothing outside it moved.
        for (const i of [0, 100, 199, 500, 700, 999]) {
            expect(out[i]).toBe(source[i]);
        }
        // And the source itself is untouched — these run over a shared render.
        expect(source[250]).not.toBe(0);
    });

    it('mute-region clamps to the buffer instead of throwing on a late region', () => {
        const source = tone(100);
        const out = applyMuteRegion(source, SAMPLE_RATE, 0.05, 5);
        expect(out[49]).toBe(source[49]);
        expect(out[50]).toBe(0);
        expect(out[99]).toBe(0);
    });

    it('click moves one sample to full scale, against its neighbors', () => {
        // The 20-sample period puts a positive peak at index 305 and a negative
        // one at 315, so the sign rule is exercised in both directions rather
        // than at a zero crossing where either answer would look correct.
        const source = tone(1000);
        expect(source[305]).toBeGreaterThan(0.4);
        expect(source[315]).toBeLessThan(-0.4);

        const onPeak = applyClick(source, SAMPLE_RATE, 0.305);
        expect(onPeak[305]).toBe(-1);
        const onTrough = applyClick(source, SAMPLE_RATE, 0.315);
        expect(onTrough[315]).toBe(1);

        for (const i of [0, 304, 306, 315, 500, 999]) {
            expect(onPeak[i]).toBe(source[i]);
        }
    });

    it('click at an out-of-range time changes nothing rather than corrupting index 0', () => {
        const source = tone(100);
        expect(applyClick(source, SAMPLE_RATE, 5)).toEqual(source);
        expect(applyClick(source, SAMPLE_RATE, -1)).toEqual(source);
    });

    it('drop-lane silences the whole stem and keeps its length', () => {
        const source = tone(500);
        const out = applyDropLane(source);
        expect(out).toHaveLength(500);
        expect(Math.max(...out)).toBe(0);
        expect(Math.min(...out)).toBe(0);
    });

    /** Two hits 24 dB apart, each a short burst with silence between. */
    const accentAndGhost = (): Float32Array => {
        const source = new Float32Array(4000);
        const burst = (at: number, amplitude: number) => {
            for (let i = 0; i < 400; i++) {
                source[at + i] = Math.sin((2 * Math.PI * i) / 20) * amplitude * (1 - i / 400);
            }
        };
        burst(200, 0.9); // accent
        burst(2200, 0.9 / 16); // ghost, 24 dB down
        return source;
    };

    it('flatten-accents collapses the gap between a ghost note and an accent', () => {
        const source = accentAndGhost();
        const out = applyFlattenAccents(source, SAMPLE_RATE);

        const peak = (from: number, to: number) =>
            Math.max(...Array.from(out.slice(from, to), Math.abs));
        const sourcePeak = (from: number, to: number) =>
            Math.max(...Array.from(source.slice(from, to), Math.abs));

        const beforeRatio = sourcePeak(200, 600) / sourcePeak(2200, 2600);
        const afterRatio = peak(200, 600) / peak(2200, 2600);
        expect(beforeRatio).toBeCloseTo(16, 0);
        // The accent survives; the ghost is lifted toward it — that is the defect.
        // Bounded by FLATTEN_MAX_GAIN: 16× in can shrink to at most 16/8 = 2×.
        expect(afterRatio).toBeLessThan(3);
        expect(peak(200, 600)).toBeGreaterThan(0.5);
        expect(peak(2200, 2600)).toBeGreaterThan(sourcePeak(2200, 2600));
    });

    it('flatten-accents plants NO clipping — not one sample reaches full scale', () => {
        // The assertion this replaces was `max(|out|) <= 1`, which is the old
        // clamp's own postcondition: it passed *because* samples were clipped.
        //
        // The signal matters. Make-up gain is feed-forward off a lagging envelope,
        // so it is the sharp attack out of near-silence that overshoots — this one
        // reached 1.27 and was clamped, and the real funk drums stem reached 3.09
        // with 0.36% of its samples clipped in runs up to 1.3 ms.
        const out = applyFlattenAccents(accentAndGhost(), SAMPLE_RATE);
        const clipped = Array.from(out).filter((value) => Math.abs(value) >= 1);
        expect(clipped).toEqual([]);
        // Not vacuous through the other door either: the attack is still loud, so
        // this is "no clipping", not "nothing survived the transform".
        expect(Math.max(...Array.from(out, Math.abs))).toBeGreaterThan(0.9);
    });

    it('flatten-accents keeps the length and never inverts a sample', () => {
        const source = tone(2000, 0.95);
        const out = applyFlattenAccents(source, SAMPLE_RATE);
        expect(out).toHaveLength(2000);
        // Every sample keeps its sign: the transform is a per-sample gain, so a
        // sign flip anywhere would mean the gain went negative.
        for (let i = 0; i < out.length; i++) {
            expect(Math.sign(out[i])).toBe(Math.sign(source[i]));
        }
    });
});

describe('mix-plant — placement', () => {
    it('locates a bar/beat in absolute seconds, lead-in included', () => {
        expect(beatTime(META, 1, 1)).toBe(0.25);
        expect(beatTime(META, 1, 2)).toBe(0.75); // +4 steps
        expect(beatTime(META, 3, 3)).toBe(0.25 + 2 * 2 + 2 * 0.5);
        expect(beatTime(META, 3, 4)).toBe(0.25 + 2 * 2 + 3 * 0.5);
    });

    const makeFiles = (stems: string[]): RenderFile[] =>
        stems.map((stem) => ({
            scene: 'funk-pocket',
            stem,
            wavName: `s-${stem}-A.wav`,
            eventsName: `s-${stem}-A.events.json`,
            meta: META,
        }));

    it('gives each defect its own lane so the read stays unambiguous', () => {
        const assigned = assignDefects(
            makeFiles(['full', 'bass', 'drums', 'chords']),
            DEFECT_TYPES,
        );
        expect(assigned.map((entry) => `${entry.type}:${entry.file.stem}`)).toEqual([
            'mute-region:bass',
            'click:full',
            'drop-lane:chords',
            'flatten-accents:drums',
        ]);
        expect(new Set(assigned.map((entry) => entry.file.stem)).size).toBe(4);
    });

    it('honors the preference list ahead of the order the files arrive in', () => {
        // Regression: a `files.find(f => preference.includes(f.stem))` reads the
        // same and lets disk order win — on a real render `click` landed on
        // `drums` because `drums` sorts before `full`. Same stems, reversed.
        const assigned = assignDefects(
            makeFiles(['chords', 'drums', 'bass', 'full']),
            DEFECT_TYPES,
        );
        expect(assigned.map((entry) => `${entry.type}:${entry.file.stem}`)).toEqual([
            'mute-region:bass',
            'click:full',
            'drop-lane:chords',
            'flatten-accents:drums',
        ]);
    });

    it('falls back to any free stem rather than dropping a defect silently', () => {
        const assigned = assignDefects(makeFiles(['full', 'weird']), ['mute-region', 'click']);
        expect(assigned.map((entry) => entry.file.stem).sort()).toEqual(['full', 'weird']);
    });

    it('refuses to plant more defects than there are stems', () => {
        expect(() => assignDefects(makeFiles(['full']), DEFECT_TYPES)).toThrow(/not enough stems/);
    });
});
