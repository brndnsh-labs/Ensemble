// Pure geometry + raster for the spectrogram contact sheet. Sibling to
// `mix-spectro.ts` the way `audio-verify.ts` is to `mix-verify.ts`: no ffmpeg, no
// filesystem, no child processes — numbers and a `RenderMeta` in, pixel positions
// and an RGBA buffer out, so every claim the sheet makes about *where* something
// is can be unit-tested (`tests/scripts/mix-spectro.test.ts`).
//
// WHY THIS MODULE EXISTS AT ALL. The sheet's only job is to let a reader point at
// a smudge and say "that is bar 6, beat 3, on the chords lane". That sentence is
// false the moment the grid and the audio disagree by even a few pixels, and every
// downstream judgement inherits the error. So the mapping is owned here, in one
// place, with tests — never delegated to a renderer whose margins we do not
// control (see `SPECTRO_SCALE` on `legend=0`).

import type { RenderMeta } from './audio-verify.js';

// ── The pinned analysis scales ────────────────────────────────────────────────

/**
 * The `showspectrumpic` settings every sheet is rendered with, and the panel size
 * they are rendered at.
 *
 * **Changing ANY value here invalidates comparison against every previously
 * generated sheet.** The entire value of a contact sheet is that two of them can
 * be laid side by side — before/after a change, mix vs stem, funk vs jazz — and
 * the difference read off directly. That only holds while the color mapping and
 * the dB window are identical, because `color=intensity` maps dB to hue: move
 * `drange` and the same audio changes color with no visible marker that the
 * scale moved. If you genuinely need a different window, add a second named
 * preset rather than editing this one, so old sheets stay readable.
 *
 * `legend=0` is the load-bearing one. With ffmpeg's legend enabled the plot area
 * is inset by undocumented margins, so a grid drawn in image pixels lands off the
 * audio it annotates — a bar line that is confidently, invisibly wrong. With the
 * legend off the image IS the plot, and the mapping becomes knowable: not the
 * naive `x = (t - windowStart) / windowDuration * width`, but that corrected for
 * the two terms `timeToPixel` models (hop quantization + FFT lag). We draw our own
 * axis instead — see `renderOverlay`.
 *
 * `panelHeight` is load-bearing for the *time* mapping too, not just for how tall
 * the picture is: `showspectrumpic` derives its FFT window length from the output
 * height, and that window length is exactly what `SPECTROGRAM_LAG_SAMPLES` below
 * measures. Change the height and that constant must be re-measured.
 */
export const SPECTRO_SCALE = {
    /** Amplitude→color curve. */
    scale: 'log',
    /** Frequency axis. Log keeps the bass register from collapsing into one row. */
    fscale: 'log',
    /** Bottom of the frequency axis, Hz. Below ~20 Hz is rumble, not music. */
    start: 20,
    /** Top of the frequency axis, Hz. Cymbal air lives under this; above it is empty. */
    stop: 16000,
    /** Dynamic range shown, dB. 96 ≈ the whole 16-bit floor-to-full-scale span. */
    drange: 96,
    /** Upper limit of the dB window, dBFS. 0 = full scale at the top of the color ramp. */
    limit: 0,
    /** OFF. See the note above — this is the correctness decision, not a style one. */
    legend: 0,
    color: 'intensity',
    win_func: 'hann',
    /** Per-stem panel size, in image pixels. Width is the shared time axis. */
    panelWidth: 1600,
    panelHeight: 400,
} as const;

// ── Sheet layout ──────────────────────────────────────────────────────────────

/** Header strip above the panels — carries the render caption. */
export const HEADER_HEIGHT = 34;
/** Axis strip below the panels — carries bar ticks and bar numbers. */
export const AXIS_HEIGHT = 44;

export interface SheetLayout {
    width: number;
    headerHeight: number;
    panelHeight: number;
    axisHeight: number;
    panelCount: number;
    /** Derived: header + panels + axis. */
    height: number;
}

export function layoutSheet(panelCount: number): SheetLayout {
    if (panelCount < 1) {
        throw new Error('a contact sheet needs at least one panel');
    }
    return {
        width: SPECTRO_SCALE.panelWidth,
        headerHeight: HEADER_HEIGHT,
        panelHeight: SPECTRO_SCALE.panelHeight,
        axisHeight: AXIS_HEIGHT,
        panelCount,
        height: HEADER_HEIGHT + panelCount * SPECTRO_SCALE.panelHeight + AXIS_HEIGHT,
    };
}

/** Top edge of panel `index` (0-based), in sheet pixels. */
export function panelTop(layout: SheetLayout, index: number): number {
    return layout.headerHeight + index * layout.panelHeight;
}

// ── Time → pixel ──────────────────────────────────────────────────────────────

/** A half-open span of the render, in absolute seconds from the start of the file. */
export interface TimeWindow {
    startSec: number;
    endSec: number;
}

/**
 * Samples advanced per output column.
 *
 * `showspectrumpic` walks the input an INTEGER number of samples per column
 * (`floor(windowSamples / width)`), so the picture always spans slightly LESS than
 * the window it was handed — 176 400 samples at width 1600 gives hop 110, i.e.
 * 176 000 samples of the 176 400 asked for. Mapping against the nominal duration
 * instead of this therefore drifts, from 0 px at the left edge to ~4 px at the
 * right on that geometry, and by a *different* amount on a `--range` zoom of the
 * same render — so the same musical instant would sit at two different columns on
 * two sheets that exist to be compared.
 *
 * Verified against ffmpeg 8.1.2 by least-squares fit over 9 bursts at each of 12
 * geometries (44.1/48/96/22.05 kHz, hops 27–570): the fitted samples-per-column is
 * this value to within 0.03%.
 */
export function spectrogramHopSamples(
    window: TimeWindow,
    width: number,
    sampleRate: number,
): number {
    const duration = window.endSec - window.startSec;
    if (duration <= 0) {
        throw new Error('time window must have positive duration');
    }
    const hop = Math.floor(Math.round(duration * sampleRate) / width);
    if (hop < 1) {
        throw new Error(
            `window of ${duration.toFixed(4)}s at ${sampleRate} Hz is shorter than ${width} ` +
                'samples — showspectrumpic cannot advance a whole sample per column',
        );
    }
    return hop;
}

/** Seconds of audio the picture actually spans — always ≤ the window's duration. */
export function effectiveSpanSec(window: TimeWindow, width: number, sampleRate: number): number {
    return (width * spectrogramHopSamples(window, width, sampleRate)) / sampleRate;
}

/**
 * Constant lag between an instant in the audio and the column it lights up, in
 * INPUT SAMPLES. Content at sample `s` peaks at column `(s + this) / hop`.
 *
 * It is the FFT window's own centring: `showspectrumpic` sizes its analysis window
 * from the output *height*, and a burst peaks in the column whose window is
 * centred on it, which is half a window after the column's own start. So it is a
 * constant number of samples at a fixed panel height — NOT a constant number of
 * seconds and NOT a constant number of pixels:
 *
 * - not seconds: at hop 55 the offset is 7.07 px at 44.1 kHz and 6.63 px at
 *   22.05 kHz — the same *samples*, half the *time*. (96 kHz and 48 kHz at hop 120
 *   both read 3.00 px, which settles it.)
 * - not pixels: it is 7.07 px at hop 55 and −0.26 px at hop 570.
 *
 * Measured 2026-07-28 against ffmpeg 8.1.2 at the pinned `SPECTRO_SCALE` panel
 * size, by least-squares over 12 geometries; `SPECTROGRAM_LAG_PIXELS` is the
 * intercept of the same fit — a genuine column-domain offset that survives at
 * large hops, where the sample-domain term has shrunk to nothing.
 *
 * Honest weighting of the two: the sample term is load-bearing (drop it and the
 * calibration test fails by 4 px), the pixel term is margin (drop it and the test
 * still passes, at ~1.0 px of the ±1.5 px envelope instead of ~0.6). Keep both —
 * spending two thirds of the budget on a known, measured, one-line correction is
 * how a tolerance quietly stops holding — but do not treat the second as
 * mysterious if it ever needs re-deriving. `tests/scripts/spectro-calibration.test.ts`
 * is the end-to-end check, and it is what to re-run if any `SPECTRO_SCALE` value
 * moves.
 */
export const SPECTROGRAM_LAG_SAMPLES = 422;
/** Column-domain half of the same calibration — see `SPECTROGRAM_LAG_SAMPLES`. */
export const SPECTROGRAM_LAG_PIXELS = -0.83;

/**
 * The mapping the whole tool rests on: the column where content at `timeSec`
 * actually appears, corrected for hop quantization and the measured FFT lag.
 * Residual envelope ±1.5 px, which is what the calibration test asserts.
 *
 * Returns a fractional column — callers round at draw time, so the rounding rule
 * lives in one place (the rasterizer) rather than being baked into the geometry.
 */
export function timeToPixel(
    timeSec: number,
    window: TimeWindow,
    width: number,
    sampleRate: number,
): number {
    const hop = spectrogramHopSamples(window, width, sampleRate);
    const offsetSamples = (timeSec - window.startSec) * sampleRate + SPECTROGRAM_LAG_SAMPLES;
    return offsetSamples / hop + SPECTROGRAM_LAG_PIXELS;
}

// ── The musical grid ──────────────────────────────────────────────────────────

/**
 * Steps per beat. A step is a sixteenth (`mix-report` computes `stepSeconds` as
 * `60 / bpm / 4`), so a quarter-note beat is four of them.
 */
export const STEPS_PER_BEAT = 4;

/**
 * Steps per bar, assumed 4/4.
 *
 * `RenderMeta` deliberately carries no time signature — it is the render's own
 * geometry dump and nothing else reads a meter off it — so this cannot be derived
 * and is not guessed at either (48 steps of 3/4 and 48 steps of 4/4 are the same
 * number). Every default `mix-report` scene is 4/4. A non-4/4 scene renders a
 * grid that is right about *seconds* and wrong about *bar numbers*; pass an
 * explicit `stepsPerBar` to `computeGridLines` if you ever drive one.
 */
export const STEPS_PER_BAR = 16;

export interface GridLine {
    kind: 'bar' | 'beat';
    /** Absolute seconds into the render. */
    timeSec: number;
    /** 1-indexed bar number this line opens. */
    bar: number;
    /** 1-indexed beat within the bar; 1 on a bar line. */
    beat: number;
    /** Fractional column in the sheet. */
    x: number;
}

/**
 * Bar and beat lines falling inside `window`, as sheet columns.
 *
 * **The lead-in offset is load-bearing.** `mix-report` renders 0.25 s of silence
 * before the first step so the graph has settled by the downbeat, so bar 1 does
 * NOT start at t=0. Drop `leadInSeconds` and every line on every sheet is off by
 * the same constant — which is the worst possible failure mode, because a
 * uniformly shifted grid still *looks* like a grid and every claim read off it is
 * silently one-eighth-note early.
 *
 * Emits a closing line one bar past the last (`bar = totalBars + 1`) so the final
 * bar has a right edge; beat lines are not emitted for it. When the form ends
 * mid-bar (`stepsPerLoop` not a whole number of bars) the closing line lands on
 * the LAST STEP rather than on the bar boundary past it: the boundary is not in
 * the render, so a line there would be drawn over audio that does not exist, and
 * the old `step > totalSteps` guard simply dropped it — leaving a partial-bar
 * sheet with no right edge at all.
 */
export function computeGridLines(
    meta: RenderMeta,
    window: TimeWindow,
    width: number,
    stepsPerBar: number = STEPS_PER_BAR,
): GridLine[] {
    if (stepsPerBar < STEPS_PER_BEAT || stepsPerBar % STEPS_PER_BEAT !== 0) {
        throw new Error(`stepsPerBar must be a positive multiple of ${STEPS_PER_BEAT}`);
    }
    const beatsPerBar = stepsPerBar / STEPS_PER_BEAT;
    const totalSteps = meta.stepsPerLoop * meta.loopCount;
    const totalBars = Math.ceil(totalSteps / stepsPerBar);
    // Float seconds accumulate error against a float window edge; a line exactly
    // on the edge must be kept, not dropped by a last-bit comparison.
    const epsilon = 1e-9;

    const lines: GridLine[] = [];
    const emit = (step: number, barIndex: number, beatIndex: number): void => {
        const timeSec = meta.leadInSeconds + step * meta.stepSeconds;
        if (timeSec < window.startSec - epsilon || timeSec > window.endSec + epsilon) {
            return;
        }
        lines.push({
            kind: beatIndex === 0 ? 'bar' : 'beat',
            timeSec,
            bar: barIndex + 1,
            beat: beatIndex + 1,
            x: timeToPixel(timeSec, window, width, meta.sampleRate),
        });
    };

    for (let barIndex = 0; barIndex < totalBars; barIndex++) {
        for (let beatIndex = 0; beatIndex < beatsPerBar; beatIndex++) {
            const step = barIndex * stepsPerBar + beatIndex * STEPS_PER_BEAT;
            // Strictly inside the music: a beat landing exactly on the last step is
            // the closing boundary, and belongs to the heavier line emitted below.
            if (step >= totalSteps) {
                break;
            }
            emit(step, barIndex, beatIndex);
        }
    }
    emit(Math.min(totalBars * stepsPerBar, totalSteps), totalBars, 0);
    return lines;
}

// ── `--range=barA..barB` ──────────────────────────────────────────────────────

export interface BarRange {
    /** 1-indexed, inclusive. */
    fromBar: number;
    toBar: number;
}

/**
 * Parse `bar3..bar5` — inclusive on both ends, so that spec means "bars 3, 4 and
 * 5", three bars of audio.
 *
 * Strict on purpose: a range that silently coerces (`bar0`, a reversed pair, a
 * typo'd separator) would produce a zoomed sheet of the wrong music, and a zoom
 * view carries no landmarks a reader could use to notice.
 */
export function parseBarRange(spec: string): BarRange {
    const match = /^bar(\d+)\.\.bar(\d+)$/i.exec(spec.trim());
    if (!match) {
        throw new Error(`--range must look like bar3..bar5 (got "${spec}")`);
    }
    const fromBar = Number.parseInt(match[1], 10);
    const toBar = Number.parseInt(match[2], 10);
    if (fromBar < 1) {
        throw new Error('--range bars are 1-indexed; bar0 does not exist');
    }
    if (toBar < fromBar) {
        throw new Error(`--range is inclusive and ascending (got bar${fromBar}..bar${toBar})`);
    }
    return { fromBar, toBar };
}

/** Absolute seconds at which the rendered form ends — the last step, lead-in included. */
export function musicEndSec(meta: RenderMeta): number {
    return meta.leadInSeconds + meta.stepsPerLoop * meta.loopCount * meta.stepSeconds;
}

/**
 * Extend a window one beat past the last line it has to show.
 *
 * A window that ENDS on its closing bar line cannot display that line. The picture
 * spans `width · hop` samples, up to `width − 1` samples short of the window it was
 * handed, and the FFT lag pushes the mapping a further `SPECTROGRAM_LAG_SAMPLES`
 * right — so the window's own last instant reliably lands a few columns off the
 * right edge and its line is simply never drawn. (Under the old, wrong mapping it
 * landed at exactly `width` and rendered as a single column, which is the same bug
 * wearing a disguise: the right-hand boundary of the last bar at half weight.)
 *
 * One beat is the smallest musically-meaningful pad, and it is generous: what is
 * actually needed is one column's worth of samples plus the lag, ~45 ms at 44.1 kHz.
 * It costs a few percent of the axis and buys a readable closing line — plus, on a
 * `--range` zoom, a visible first sliver of the bar after the range, which is the
 * landmark that tells a reader the zoom ends where they think it does.
 */
export function padWindowForClosingLine(
    window: TimeWindow,
    meta: RenderMeta,
    limitSec: number,
): TimeWindow {
    return {
        startSec: window.startSec,
        endSec: Math.min(window.endSec + STEPS_PER_BEAT * meta.stepSeconds, limitSec),
    };
}

/**
 * The default (no `--range`) window: the whole render, cut at the last step (plus
 * the closing-line pad).
 *
 * `mix-report` renders `leadIn + music + 2 s`, and that 2 s tail is ~10% of a
 * default scene and more of a short one — pixels spent on a decaying reverb tail
 * that no grid line annotates. Trimming it buys the same proportion of horizontal
 * resolution on the part of the sheet anyone reads. The tail is not lost
 * information anybody wanted: `mix:verify` owns release-tail questions.
 *
 * Clamped to the file as well, so a render that somehow decoded short cannot ask
 * ffmpeg for a window past EOF and get `apad` silence drawn as if it were music.
 */
export function fullSheetWindow(meta: RenderMeta, fileDurationSec: number): TimeWindow {
    return padWindowForClosingLine(
        { startSec: 0, endSec: Math.min(musicEndSec(meta), fileDurationSec) },
        meta,
        fileDurationSec,
    );
}

/**
 * The absolute-seconds span covered by an inclusive bar range, clamped to the
 * render.
 *
 * A range that runs past the end used to be accepted silently: `--range=bar3..bar5`
 * on a 4-bar render exited 0 and emitted panels whose right-hand third was `apad`
 * silence, and `--range=bar90..bar99` emitted a wholly black sheet with a confident
 * caption on it. A zoom carries no landmarks a reader can use to notice either, so
 * the far end clamps to the last step and a start past the form is refused outright.
 */
export function barRangeToWindow(
    range: BarRange,
    meta: RenderMeta,
    stepsPerBar: number = STEPS_PER_BAR,
): TimeWindow {
    const barSeconds = stepsPerBar * meta.stepSeconds;
    const totalBars = Math.ceil((meta.stepsPerLoop * meta.loopCount) / stepsPerBar);
    if (range.fromBar > totalBars) {
        throw new Error(
            `--range starts at bar ${range.fromBar}, but this render is ${totalBars} bar(s) long`,
        );
    }
    return {
        startSec: meta.leadInSeconds + (range.fromBar - 1) * barSeconds,
        endSec: Math.min(meta.leadInSeconds + range.toBar * barSeconds, musicEndSec(meta)),
    };
}

/**
 * Label every Nth bar, so numbers never overlap at full-form zoom.
 *
 * Bracketed by test: at exactly `minSpacingPx` the stride stays 1, one pixel
 * under it doubles. Strides stay on powers of two so the labelled bars are always
 * 1, 5, 9, … rather than an arbitrary set a reader has to decode.
 */
export function chooseLabelStride(barSpacingPx: number, minSpacingPx: number): number {
    if (!(barSpacingPx > 0)) {
        return 1;
    }
    let stride = 1;
    while (barSpacingPx * stride < minSpacingPx && stride < 1024) {
        stride *= 2;
    }
    return stride;
}

// ── 5×7 bitmap font ───────────────────────────────────────────────────────────
//
// This repo's ffmpeg is built WITHOUT `drawtext` (no libfreetype — verified with
// `ffmpeg -filters`), so text is rasterized here and composited as an overlay. That
// turned out to be the better boundary anyway: the labels and the grid are then
// the same pixels, produced by the same tested code, and cannot drift apart.
//
// Each glyph is 7 rows of 5 bits, most-significant bit leftmost (bit 4 = column 0).

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
/** One blank column between glyphs. */
const GLYPH_ADVANCE = GLYPH_WIDTH + 1;

const FONT_5X7: Record<string, readonly number[]> = {
    ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
    '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
    '2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
    '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
    '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
    '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
    '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
    '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
    '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
    A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
    B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
    C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
    D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
    E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
    F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
    G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
    H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
    I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
    J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
    K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
    L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
    M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
    N: [0x11, 0x19, 0x19, 0x15, 0x13, 0x13, 0x11],
    O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
    Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
    R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
    S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
    T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
    W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a],
    X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
    Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
    Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
    '+': [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
    '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
    '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
    ',': [0x00, 0x00, 0x00, 0x00, 0x0c, 0x04, 0x08],
    ':': [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
    '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
    _: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f],
    '#': [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
    '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
    ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
    '=': [0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00],
    '?': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
};

/** Folded to upper case so the table stays one case; anything unmapped renders as `?`. */
function glyphFor(char: string): readonly number[] {
    return FONT_5X7[char.toUpperCase()] ?? FONT_5X7['?'];
}

/** Rendered width of `text` at `scale`, in pixels (no trailing inter-glyph gap). */
export function measureText(text: string, scale: number): number {
    if (text.length === 0) {
        return 0;
    }
    return text.length * GLYPH_ADVANCE * scale - scale;
}

// ── RGBA rasterizer ───────────────────────────────────────────────────────────

export type Rgba = readonly [number, number, number, number];

const AXIS_BG: Rgba = [16, 16, 20, 255];
const TEXT_COLOR: Rgba = [232, 232, 238, 255];
const LABEL_BG: Rgba = [0, 0, 0, 175];
// Grid weights, set by eye against a real full-band funk render rather than
// picked as round numbers. The first pass used alpha 125/42 and the beat lines
// were invisible over bright content — a subdivision you cannot see is worse than
// none, because the reader assumes the bar is undivided. Both are up; the 2:1
// weight ratio that keeps bars readable as the landmark is preserved.
/** Bar lines are the landmark a reader counts along — heavier, and 2 px wide. */
const BAR_LINE: Rgba = [255, 255, 255, 200];
const BAR_LINE_WIDTH = 2;
/** Beat lines only subdivide: 1 px, so at most 0.06% of a panel's width is covered. */
const BEAT_LINE: Rgba = [255, 255, 255, 95];
const BEAT_LINE_WIDTH = 1;
const TEXT_SCALE = 2;
const CAPTION_SCALE = 2;
/** Minimum gap between two bar numbers before labels start thinning out. */
export const MIN_LABEL_SPACING_PX = measureText('88', TEXT_SCALE) + 10;

/** A mutable RGBA canvas with straight (non-premultiplied) alpha. */
export interface Canvas {
    width: number;
    height: number;
    data: Uint8Array;
}

export function createCanvas(width: number, height: number): Canvas {
    return { width, height, data: new Uint8Array(width * height * 4) };
}

/**
 * Source-over blend of one pixel, in STRAIGHT alpha. Out-of-bounds writes are
 * dropped, not wrapped.
 *
 * The divide by the resulting alpha is not optional here, and skipping it is not a
 * rounding-level mistake. The canvas starts fully transparent, so the first write
 * to any pixel has `dst.a = 0` and the premultiplied form
 * (`c·a + dst·(1−a)`, no divide) stores the color already multiplied by its own
 * alpha — while `Canvas`, `mix-spectro.ts`'s `-pix_fmt rgba` and ffmpeg's `overlay`
 * all read it as straight. A bar line specified `[255,255,255,200]` was stored
 * `[200,200,200,200]` and composited to 157 over black instead of 200; a beat line
 * at alpha 95 landed at 35. Both grid weights were then raised by eye to
 * compensate, so this fix makes the sheet brighter than the tuned-for look —
 * `BAR_LINE`/`BEAT_LINE` want a fresh look by eye, not a silent re-scaling here.
 */
export function blendPixel(canvas: Canvas, x: number, y: number, color: Rgba): void {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
        return;
    }
    const index = (y * canvas.width + x) * 4;
    const data = canvas.data;
    const sourceAlpha = color[3] / 255;
    const destAlpha = data[index + 3] / 255;
    const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
    if (outAlpha <= 0) {
        // Transparent over transparent: the color channels carry no information,
        // and dividing by zero would write NaN into the buffer.
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
        data[index + 3] = 0;
        return;
    }
    const sourceWeight = sourceAlpha / outAlpha;
    const destWeight = (destAlpha * (1 - sourceAlpha)) / outAlpha;
    data[index] = Math.round(color[0] * sourceWeight + data[index] * destWeight);
    data[index + 1] = Math.round(color[1] * sourceWeight + data[index + 1] * destWeight);
    data[index + 2] = Math.round(color[2] * sourceWeight + data[index + 2] * destWeight);
    data[index + 3] = Math.round(outAlpha * 255);
}

export function fillRect(
    canvas: Canvas,
    x: number,
    y: number,
    width: number,
    height: number,
    color: Rgba,
): void {
    for (let row = y; row < y + height; row++) {
        for (let column = x; column < x + width; column++) {
            blendPixel(canvas, column, row, color);
        }
    }
}

/** Draw `text` with its top-left at (x, y). Returns the advance width. */
export function drawText(
    canvas: Canvas,
    x: number,
    y: number,
    text: string,
    scale: number,
    color: Rgba,
): number {
    let cursor = x;
    for (const char of text) {
        const glyph = glyphFor(char);
        for (let row = 0; row < GLYPH_HEIGHT; row++) {
            const bits = glyph[row];
            for (let column = 0; column < GLYPH_WIDTH; column++) {
                if ((bits >> (GLYPH_WIDTH - 1 - column)) & 1) {
                    fillRect(canvas, cursor + column * scale, y + row * scale, scale, scale, color);
                }
            }
        }
        cursor += GLYPH_ADVANCE * scale;
    }
    return measureText(text, scale);
}

/** Text with a padded dark plate behind it, so a label stays readable over audio. */
function drawPlatedText(canvas: Canvas, x: number, y: number, text: string, scale: number): void {
    const padding = 4;
    fillRect(
        canvas,
        x - padding,
        y - padding,
        measureText(text, scale) + padding * 2,
        GLYPH_HEIGHT * scale + padding * 2,
        LABEL_BG,
    );
    drawText(canvas, x, y, text, scale, TEXT_COLOR);
}

export interface OverlaySpec {
    layout: SheetLayout;
    gridLines: GridLine[];
    /** Panel labels, top to bottom — one per panel. */
    panelLabels: string[];
    /** Single line above the panels: scene, tempo, window. */
    caption: string;
    /** Label every Nth bar; see `chooseLabelStride`. */
    labelStride: number;
}

/**
 * The whole annotation layer for one sheet, as straight-alpha RGBA.
 *
 * Composited over the stacked spectrogram panels by ffmpeg `overlay`. Everything
 * outside the header and axis strips is transparent, so the audio underneath is
 * dimmed by the grid lines but never hidden by them.
 */
export function renderOverlay(spec: OverlaySpec): Canvas {
    const { layout, gridLines, panelLabels, caption, labelStride } = spec;
    if (panelLabels.length !== layout.panelCount) {
        throw new Error(`overlay has ${panelLabels.length} labels for ${layout.panelCount} panels`);
    }
    const canvas = createCanvas(layout.width, layout.height);
    const panelsTop = layout.headerHeight;
    const panelsBottom = panelsTop + layout.panelCount * layout.panelHeight;

    // Header + axis strips are opaque: they sit over `pad`ded background, and a
    // translucent strip there would show the pad color through and read as a
    // rendering artefact rather than a deliberate gutter.
    fillRect(canvas, 0, 0, layout.width, layout.headerHeight, AXIS_BG);
    fillRect(canvas, 0, panelsBottom, layout.width, layout.axisHeight, AXIS_BG);

    // Grid lines run through every panel — one shared time axis is the reason the
    // sheet is a contact sheet and not N unrelated pictures.
    for (const line of gridLines) {
        const isBar = line.kind === 'bar';
        const lineWidth = isBar ? BAR_LINE_WIDTH : BEAT_LINE_WIDTH;
        // A 2 px bar line centred on column 0 (or on the last column) puts one of
        // its two columns out of bounds, and the silently-dropped write renders the
        // edge bar at half weight. On a `--range` zoom the LEFT edge is the downbeat
        // the whole read is aligned against, so it is exactly the line that must not
        // be the faint one — nudge a straddling rect fully inside instead.
        //
        // A line that lands ENTIRELY outside is left where it is, and therefore not
        // drawn: dragging it to the edge would put a confident bar line on audio it
        // does not belong to, and the reader has no way to see that happen.
        const raw = Math.round(line.x) - (isBar ? 1 : 0);
        const straddles = raw + lineWidth > 0 && raw < layout.width;
        const x = straddles ? Math.max(0, Math.min(layout.width - lineWidth, raw)) : raw;
        fillRect(
            canvas,
            x,
            panelsTop,
            lineWidth,
            panelsBottom - panelsTop,
            isBar ? BAR_LINE : BEAT_LINE,
        );
        if (!isBar) {
            continue;
        }
        // Tick into the axis strip, then the number under it.
        fillRect(canvas, x, panelsBottom, lineWidth, 8, TEXT_COLOR);
        if ((line.bar - 1) % labelStride !== 0) {
            continue;
        }
        const label = String(line.bar);
        const textWidth = measureText(label, TEXT_SCALE);
        const centered = Math.round(line.x - textWidth / 2);
        const clamped = Math.max(2, Math.min(layout.width - textWidth - 2, centered));
        drawText(canvas, clamped, panelsBottom + 14, label, TEXT_SCALE, TEXT_COLOR);
    }

    for (let index = 0; index < panelLabels.length; index++) {
        drawPlatedText(canvas, 14, panelTop(layout, index) + 12, panelLabels[index], TEXT_SCALE);
    }
    drawText(
        canvas,
        10,
        Math.round((layout.headerHeight - GLYPH_HEIGHT * CAPTION_SCALE) / 2),
        caption,
        CAPTION_SCALE,
        TEXT_COLOR,
    );
    return canvas;
}
