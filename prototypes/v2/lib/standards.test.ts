import { GENRE_NAMES } from '@engine/data/smart-genres';
import { validateChartDocumentV2 } from '@engine/songbook/document-v2';
import { describe, expect, it } from 'vitest';
import { genreOf } from './documents';
import {
    buildStandardDocument,
    firstBarsPreview,
    STANDARD_SHELF_LABELS,
    STANDARDS,
} from './standards';

describe('the standards catalog (#1439)', () => {
    it('has the 28 entries the issue decided: 4 blues, 11 jazz standards, 13 grooves', () => {
        const byShelf = { blues: 0, jazz: 0, grooves: 0 };
        for (const entry of STANDARDS) {
            byShelf[entry.shelf] += 1;
        }
        expect(byShelf).toEqual({ blues: 4, jazz: 11, grooves: 13 });
        expect(STANDARDS.length).toBe(28);
    });

    it('has no duplicate catalog id, and no id collides with a `starter-` document', () => {
        const ids = STANDARDS.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
            expect(id.startsWith('starter-')).toBe(false);
        }
    });

    it('every entry names one of the 13 canonical genres', () => {
        for (const entry of STANDARDS) {
            expect(GENRE_NAMES, entry.title).toContain(entry.genre);
        }
    });

    it('every shelf has a display label', () => {
        for (const entry of STANDARDS) {
            expect(STANDARD_SHELF_LABELS[entry.shelf]).toBeTruthy();
        }
    });

    it('every entry builds a document that round-trips the canonical v2 codec, with the same genre', () => {
        for (const entry of STANDARDS) {
            const document = buildStandardDocument(entry);
            expect(document.id, entry.title).toBe(entry.id);
            expect(document.schemaVersion).toBe(2);
            const revalidated = validateChartDocumentV2(document);
            expect(revalidated.kind, entry.title).toBe('ok');
            expect(genreOf(document), entry.title).toBe(entry.genre);
            expect(document.chart.performance.bpm).toBe(entry.bpm);
        }
    });

    it('builds a fresh document — and fresh measure ids — on every call', () => {
        const entry = STANDARDS[0];
        const a = buildStandardDocument(entry);
        const b = buildStandardDocument(entry);
        expect(a).not.toBe(b);
        expect(a.chart.score.sections[0].measures[0].id).not.toBe(
            b.chart.score.sections[0].measures[0].id,
        );
    });

    it('a first-bars preview never builds a document', () => {
        for (const entry of STANDARDS) {
            expect(firstBarsPreview(entry).length).toBeGreaterThan(0);
        }
    });
});
