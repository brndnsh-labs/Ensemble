import { describe, expect, it } from 'vitest';
import { firstBars } from './first-bars';
import { HOME_ROWS, HOME_SPARE_IDS, homeRequest, openedAgo, settleHome } from './home';
import { buildStandardDocument, standardFor } from './standards';

describe('homeRequest (#1441)', () => {
    it('orders opened ids newest first and bounds how many a home read will look up', () => {
        const opened = new Map(
            Array.from({ length: 40 }, (_, i) => [
                `id-${i}`,
                new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
            ]),
        );
        const request = homeRequest(opened, 'id-3');
        expect(request.rows).toBe(HOME_ROWS);
        expect(request.continueId).toBe('id-3');
        expect(request.recentIds).toHaveLength(HOME_ROWS + HOME_SPARE_IDS);
        expect(request.recentIds[0]).toBe('id-39');
    });
});

describe('settleHome (#1441)', () => {
    const doc = (id: string, updatedAt: string) => ({ id, updatedAt }) as never;
    const pass = (raw: unknown) => {
        if ((raw as { bad?: boolean }).bad) {
            throw new Error('corrupt');
        }
        return raw as never;
    };

    it('lists opened rows first, then fill rows newest save first, capped and de-duplicated', () => {
        const slice = settleHome(
            {
                count: 9,
                continued: doc('a', '1'),
                recent: [doc('a', '1'), doc('b', '2')],
                fill: [doc('c', '3'), doc('a', '1'), doc('d', '9')],
            },
            pass,
            3,
        );
        expect(slice.rows.map((row) => row.id)).toEqual(['a', 'b', 'd']);
        expect(slice.continued?.id).toBe('a');
        expect(slice.count).toBe(9);
    });

    it('counts a document that will not validate and leaves it out, never failing', () => {
        const slice = settleHome(
            { count: 2, continued: { bad: true }, recent: [{ bad: true }], fill: [] },
            pass,
            8,
        );
        expect(slice).toEqual({ count: 2, continued: null, rows: [], unreadable: 2 });
    });
});

describe('firstBars (#1441)', () => {
    it('reads a measure chart’s own first bars in written order', () => {
        const blues = buildStandardDocument(standardFor('standard-12-bar-blues')!);
        expect(firstBars(blues, 8)).toEqual(['C7', 'C7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7']);
        expect(firstBars(blues, 4)).toHaveLength(4);
    });

    it('splits a measure-less chart at its bar lines', () => {
        const legacy = {
            schemaVersion: 1,
            chart: { arrangement: { sections: [{ value: 'Dm7 | G7 |\nCmaj7 | A7' }] } },
        } as never;
        expect(firstBars(legacy, 8)).toEqual(['Dm7', 'G7', 'Cmaj7', 'A7']);
    });
});

describe('openedAgo (#1441)', () => {
    const now = Date.UTC(2026, 5, 10, 12, 0);
    it('words recent stamps relatively and older ones as a date', () => {
        expect(openedAgo(new Date(now - 10_000).toISOString(), now)).toBe('just now');
        expect(openedAgo(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 min ago');
        expect(openedAgo(new Date(now - 2 * 3_600_000).toISOString(), now)).toBe('2 h ago');
        expect(openedAgo(new Date(now - 26 * 3_600_000).toISOString(), now)).toBe('yesterday');
        expect(openedAgo(new Date(now - 3 * 86_400_000).toISOString(), now)).toBe('3 days ago');
        expect(openedAgo('not a date', now)).toBeNull();
    });
});
