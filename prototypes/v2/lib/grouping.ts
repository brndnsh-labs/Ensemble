import { TIME_SIGNATURES } from '@engine/config';
import { scoreMeter } from '@engine/songbook/score-duration';

/**
 * The beat groupings the editors offer (#1376), by a meter's count of units — `grouping` is
 * in the meter's own units, so 7/8 and 7/4 share a row. Canonical splits only, never free text:
 * each row is the groupings a player of that meter actually meets.
 *
 * Why these rows:
 * - 5: 3+2 and 2+3 are the two ways a five is felt ("Take Five" is 3+2).
 * - 7: 2+2+3 is the Balkan/prog default; 3+2+2 and 2+3+2 are its rotations, which change where
 *   the long beat lands; 4+3 and 3+4 are the half-bar feels a 7/4 rock riff uses.
 * - 8: an 8/8 bar only exists to be grouped unevenly — 3+3+2 (the tresillo), and its rotations.
 * - 9: 3+3+3 is compound triple; 2+2+2+3 and its rotations are the aksak nines.
 * - 10: 3+3+2+2, 2+2+3+3 and 3+2+3+2 — the common tens; ten beats are rare enough to stop there.
 * - 11: 2+2+3+2+2 (kopanitsa) and 3+3+3+2.
 * - 12: 3+3+3+3 is 12/8's four dotted beats; 3+3+2+2+2 is the one common alternative.
 *
 * Not offered: 1–4 and 6. 2/4, 3/4 and 4/4 have one natural grouping, and 6's alternative
 * (2+2+2) is 3/4, which is a meter change rather than a grouping. Null-prototype because a
 * count read from a chart indexes it (the `TABLE[untrusted]` rule in the root CLAUDE.md).
 */
const SPLITS: Readonly<Record<number, readonly (readonly number[])[]>> = Object.assign(
    Object.create(null),
    {
        5: [
            [3, 2],
            [2, 3],
        ],
        7: [
            [2, 2, 3],
            [3, 2, 2],
            [2, 3, 2],
            [4, 3],
            [3, 4],
        ],
        8: [
            [3, 3, 2],
            [3, 2, 3],
            [2, 3, 3],
        ],
        9: [
            [3, 3, 3],
            [2, 2, 2, 3],
            [2, 2, 3, 2],
            [2, 3, 2, 2],
            [3, 2, 2, 2],
        ],
        10: [
            [3, 3, 2, 2],
            [2, 2, 3, 3],
            [3, 2, 3, 2],
        ],
        11: [
            [2, 2, 3, 2, 2],
            [3, 3, 3, 2],
        ],
        12: [
            [3, 3, 3, 3],
            [3, 3, 2, 2, 2],
        ],
    },
);

/** What the engine plays when a chart writes no grouping: the meter's own default, if it has one. */
export function defaultGrouping(meter: string): number[] | null {
    const config = Object.hasOwn(TIME_SIGNATURES, meter) ? TIME_SIGNATURES[meter] : undefined;
    return config?.grouping ? [...config.grouping] : null;
}

/**
 * The groupings to offer for `meter`, the engine's default first; empty when the meter has only
 * one natural grouping and so gets no control at all.
 */
export function groupingsFor(meter: string): number[][] {
    const { counts } = scoreMeter(meter);
    const rows = (SPLITS[counts] ?? []).map((row) => [...row]);
    const fallback = defaultGrouping(meter);
    if (fallback && fallback.reduce((sum, n) => sum + n, 0) === counts) {
        const at = rows.findIndex((row) => groupingText(row) === groupingText(fallback));
        if (at > 0) {
            rows.unshift(...rows.splice(at, 1));
        } else if (at < 0 && rows.length) {
            rows.unshift(fallback);
        }
    }
    return rows.length > 1 ? rows : [];
}

export const groupingText = (grouping: readonly number[]) => grouping.join('+');

/** The inverse of `groupingText` for a value the editors wrote. */
export function parseGrouping(text: string): number[] {
    return text.split('+').map(Number);
}
