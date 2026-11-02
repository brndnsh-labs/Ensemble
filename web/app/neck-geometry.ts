// The neck's fret geometry (#1586), shared by `neck.tsx` and its test so the test can compute
// where a dot belongs independently of the component. Real fret spacing: fret n sits at
// `1 − 2^(−n/12)` of the scale length, scaled so fret 15 lands at the board's right end.

import { HOME_FRETS } from '../lib/voicings';

/** x of the nut and of the board's right end, in the 1000-wide viewBox. */
export const NUT = 52;
export const END = 988;
/** Frets drawn after the nut; both instruments show 0–15. */
export const NF = 15;
/** Frets in the home window: the handle moves `[start, start + HOME_W − 1]`. */
export const HOME_W = HOME_FRETS;
/** y of the board's top edge; the strip above it holds the home-window handle. */
export const BOARD_TOP = 30;

const pos = (n: number): number => 1 - 2 ** (-n / 12);

/** x of fret wire n (0 is the nut). */
export const fx = (n: number): number => NUT + (pos(n) / pos(NF)) * (END - NUT);

/** x of a dot on fret f: midway between its wires, or left of the nut for an open string. */
export const dx = (f: number): number => (f === 0 ? NUT - 22 : (fx(f - 1) + fx(f)) / 2);

/** The fret a viewBox x falls on, clamped to 1…NF (the handle never sits on the nut). */
export function fretAt(x: number): number {
    for (let f = 1; f <= NF; f++) {
        if (x <= fx(f)) {
            return f;
        }
    }
    return NF;
}

export interface NeckLayout {
    /** Distance between strings: a uke's four strings get more room than a guitar's six. */
    spacing: number;
    /** y of string s (1 = highest pitch, drawn at the top). */
    sy: (s: number) => number;
    boardBottom: number;
    /** viewBox height: the board plus the fret-number row under it. */
    height: number;
}

export function neckLayout(strings: number): NeckLayout {
    const spacing = strings === 6 ? 32 : 40;
    const sy = (s: number) => BOARD_TOP + 16 + (s - 1) * spacing;
    const boardBottom = sy(strings) + 16;
    return { spacing, sy, boardBottom, height: boardBottom + 34 };
}

/**
 * The frets a zoomed board (phone, portrait) shows (#1593), as `[lo, hi]`: frets `lo`…`hi` inclusive, where
 * `lo === 0` means the nut and the open strings are in view too. A locked hand shows its home
 * window ±1; an unlocked one shows the frets the current and next grips use, ±1. Either way every
 * note of both grips stays in view, and the span is never narrower than `HOME_W + 2` frets, so
 * the zoom doesn't bounce between a two-fret grip and a four-fret one.
 */
export function viewWindow(
    home: readonly [number, number] | null,
    active: { notes: readonly { fret: number }[] } | null,
    next: { notes: readonly { fret: number }[] } | null,
): [number, number] {
    const frets = [...(active?.notes ?? []), ...(next?.notes ?? [])].map((x) => x.fret);
    const fretted = frets.filter((f) => f > 0);
    let lo = home ? home[0] - 1 : fretted.length ? Math.min(...fretted) - 1 : 0;
    let hi = home ? home[1] + 1 : fretted.length ? Math.max(...fretted) + 1 : 0;
    // A note outside a locked window still has to show (an open string, a stretch).
    if (fretted.length) {
        lo = Math.min(lo, Math.min(...fretted) - 1);
        hi = Math.max(hi, Math.max(...fretted) + 1);
    }
    if (frets.includes(0)) {
        lo = 0;
    }
    lo = Math.max(0, lo);
    hi = Math.min(NF, hi);
    // Fret 1 starts at the nut: show the nut and the open strings rather than cut it off.
    if (lo <= 1) {
        lo = 0;
    }
    const min = HOME_W + 2;
    const first = Math.max(1, lo);
    if (hi - first + 1 < min) {
        hi = first + min - 1;
        if (hi > NF) {
            // At the top of the neck the span grows to the left instead.
            hi = NF;
            lo = Math.max(0, Math.min(lo, NF - min + 1));
            if (lo <= 1) {
                lo = 0;
            }
        }
    }
    return [lo, hi];
}

/** A uniform zoom of the board: viewBox x' = x · scale + tx (and y' = y · scale). */
export interface BoardTransform {
    tx: number;
    scale: number;
}

/** Margin kept around the outer fret wires so they don't sit on the svg's edge. */
const VIEW_MARGIN = 4;

/**
 * The zoom that maps a view window's frets onto the full 1000-wide viewBox: from the left edge
 * (or the wire before fret `lo`) to the wire after fret `hi` (or the board's right end).
 */
export function boardTransform([lo, hi]: readonly [number, number]): BoardTransform {
    const left = lo === 0 ? 0 : fx(lo - 1) - VIEW_MARGIN;
    const right = hi >= NF ? 1000 : fx(hi) + VIEW_MARGIN;
    const scale = 1000 / (right - left);
    return { tx: -left * scale, scale };
}

/** The board x under a viewBox x: the inverse of a `BoardTransform`, for the handle drag. */
export const boardX = ({ tx, scale }: BoardTransform, x: number): number => (x - tx) / scale;
