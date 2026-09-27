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

    it("every entry's performance defaults match what a fresh captureContent() gives, never a fixed seed", () => {
        // `public/state/arranger.ts`'s own default: `randomizeSeed: true`, empty `seed`. A fixed
        // seed would make every take after the first identical — a real regression on the
        // product path (`bandForGenre`), even though a test fixture may deliberately pin one.
        for (const entry of STANDARDS) {
            const document = buildStandardDocument(entry);
            expect(document.chart.performance.seed, entry.title).toBe('');
            expect(document.chart.performance.randomizeSeed, entry.title).toBe(true);
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

    /**
     * Pins every entry's written form — total bar count and meter — so a future chart edit that
     * silently changes a form (#1439 review: this is exactly how the jazz charts drifted from
     * their published forms without any test catching it) fails here instead of only by ear.
     * "Written" bars: the sum of every section's authored `bars`, not the performed length a
     * section's `repeat` would unroll to.
     */
    it('pins every entry’s total written bar count and meter', () => {
        const forms: Record<string, { bars: number; meter?: string }> = {
            // Blues (4)
            'standard-12-bar-blues': { bars: 12 },
            'standard-minor-blues': { bars: 12 },
            'standard-8-bar-blues': { bars: 8 },
            'standard-jazz-blues': { bars: 12 },
            // Jazz standards (11)
            'standard-autumn-leaves': { bars: 32 },
            'standard-blue-bossa': { bars: 16 },
            'standard-all-the-things-you-are': { bars: 36 },
            'standard-rhythm-changes': { bars: 32 },
            'standard-stella-by-starlight': { bars: 32 },
            'standard-cherokee': { bars: 64 },
            'standard-giant-steps': { bars: 16 },
            'standard-ornithology': { bars: 32 },
            'standard-donna-lee': { bars: 32 },
            'standard-night-and-day': { bars: 48 },
            // 12-bar head + a 4-bar vamp, 6/8.
            'standard-all-blues': { bars: 16, meter: '6/8' },
            // Grooves (13) — short vamps, some with a repeated verse/chorus pair.
            'standard-pop-standard': { bars: 4 },
            'standard-pop-ballad': { bars: 4 },
            'standard-country-standard': { bars: 8 },
            'standard-metal-core': { bars: 4 },
            'standard-50s-rock': { bars: 4 },
            'standard-royal-road': { bars: 4 },
            'standard-canon': { bars: 8 },
            'standard-andalusian': { bars: 4 },
            'standard-neo-soul-deep': { bars: 8 },
            'standard-acid-jazz-london': { bars: 8 },
            'standard-funk-i-iv': { bars: 4 },
            'standard-funk-grand-groove': { bars: 8 },
            'standard-alternative-loop': { bars: 4 },
        };
        expect(Object.keys(forms).sort()).toEqual(
            STANDARDS.map((entry) => entry.id)
                .slice()
                .sort(),
        );
        for (const entry of STANDARDS) {
            const expected = forms[entry.id];
            const total = entry.sections.reduce((sum, section) => sum + section.bars.length, 0);
            expect(total, entry.title).toBe(expected.bars);
            expect(entry.meter ?? '4/4', entry.title).toBe(expected.meter ?? '4/4');
        }
    });
});
