// The neck's fret geometry (#1586), shared by `neck.tsx` and its test so the test can compute
// where a dot belongs independently of the component. Real fret spacing: fret n sits at
// `1 − 2^(−n/12)` of the scale length, scaled so fret 15 lands at the board's right end.

/** x of the nut and of the board's right end, in the 1000-wide viewBox. */
export const NUT = 52;
export const END = 988;
/** Frets drawn after the nut; both instruments show 0–15. */
export const NF = 15;
/** Frets in the home window: the handle moves `[start, start + HOME_W − 1]`. */
export const HOME_W = 6;
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
