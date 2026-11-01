/**
 * @vitest-environment happy-dom
 */
/**
 * Humanize follows the band style unless the musician has set it (#2010): a stored 20 is "not
 * set". The parity half: for the same chart, the app hands the band the same humanize the
 * critique harness does (`band/test/critique/harness.ts` spreads `DEFAULT_SETTINGS` and never
 * sets humanize), so the band the tests hear is the band the app plays.
 */
import { DEFAULT_SETTINGS, STYLES } from '@band/index';
import { GENRE_NAMES } from '@core/data/smart-genres';
import { describe, expect, it, vi } from 'vitest';
import { STYLE_FOR_GENRE } from './band-voices';
import { bandHumanize, shownHumanize, UNSET_HUMANIZE } from './genre-humanize';

vi.mock('./band-export', () => ({
    downloadExportResult: vi.fn(),
    renderBandMixToWav: vi.fn(),
    renderBandStemsToWav: vi.fn(),
}));

/** The settings the app renders a standard with, its genre and stored humanize swapped in. */
async function appSettings(genre: string, humanize: number) {
    vi.resetModules();
    // One at a time: two imports at once can each reach a mocked module mid-import and get
    // the real one (a Vitest race, #1699).
    const runtime = await import('./runtime');
    const { buildStandardDocument, STANDARDS } = await import('./standards');
    const { BandHost } = await import('./band-host');
    const render = vi.spyOn(BandHost.prototype, 'render');
    const document = buildStandardDocument(STANDARDS[0]);
    document.chart.band.groove = { ...document.chart.band.groove, genre, humanize };
    runtime.load(document);
    await runtime.exportMidi('take');
    expect(render).toHaveBeenCalledTimes(1);
    return render.mock.calls[0][0];
}

describe('humanize follows the style until it is set', () => {
    it('reads a stored 20 as not set, and any other amount as set', () => {
        expect(UNSET_HUMANIZE).toBe(20);
        expect(bandHumanize(20)).toBeNull();
        expect(bandHumanize(0)).toBe(0);
        expect(bandHumanize(19)).toBe(19);
        expect(bandHumanize(21)).toBe(21);
        expect(bandHumanize(100)).toBe(100);
    });

    it("shows the style's own amount while not set, and the musician's once set", () => {
        expect(shownHumanize(20, 'Jazz')).toBe(STYLES.jazz.feel.humanize);
        expect(shownHumanize(20, 'Neo-Soul')).toBe(STYLES.neosoul.feel.humanize);
        expect(shownHumanize(20, 'Metal')).toBe(STYLES.metal.feel.humanize);
        expect(shownHumanize(55, 'Jazz')).toBe(55);
        expect(shownHumanize(0, 'Neo-Soul')).toBe(0);
        // A persisted genre with no band style (or a prototype key) shows rock's, as it plays.
        expect(shownHumanize(20, 'constructor')).toBe(STYLES.rock.feel.humanize);
        expect(shownHumanize(20, 'Polka')).toBe(STYLES.rock.feel.humanize);
    });

    it('new standards are written not set', async () => {
        const { buildStandardDocument, STANDARDS } = await import('./standards');
        for (const entry of STANDARDS) {
            expect(buildStandardDocument(entry).chart.band.groove.humanize, entry.title).toBe(
                UNSET_HUMANIZE,
            );
        }
    });
});

describe('the app and the critique harness hand the band the same humanize', () => {
    for (const genre of GENRE_NAMES) {
        it(`${genre}: a chart that never set it plays the style's own`, async () => {
            const settings = await appSettings(genre, UNSET_HUMANIZE);
            expect(settings.style).toBe(STYLE_FOR_GENRE[genre]);
            expect(settings.humanize).toBe(DEFAULT_SETTINGS.humanize);
            // And so `applyFeel`'s `settings.humanize ?? feel.humanize` lands on the style's.
            expect(settings.humanize ?? STYLES[settings.style].feel.humanize).toBe(
                STYLES[STYLE_FOR_GENRE[genre]].feel.humanize,
            );
        });
    }

    it('a chart saved without touching humanize stays not set', async () => {
        vi.resetModules();
        const runtime = await import('./runtime');
        const { buildStandardDocument, STANDARDS } = await import('./standards');
        const document = buildStandardDocument(STANDARDS[0]);
        runtime.load(document);
        expect(runtime.captureDocument(document).chart.band.groove.humanize).toBe(UNSET_HUMANIZE);
    });

    it("a chart the musician set plays the musician's amount", async () => {
        expect((await appSettings('Jazz', 55)).humanize).toBe(55);
        expect((await appSettings('Neo-Soul', 0)).humanize).toBe(0);
    });
});
