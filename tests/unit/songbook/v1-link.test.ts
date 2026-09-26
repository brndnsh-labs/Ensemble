/**
 * Opening an old v1 `?s=` share link on the v2 music stand (#1279).
 *
 * Every good link here is built by v1's OWN writer — `compressSections`, the function
 * `generateShareUrl` calls — over realistic sections, assembled with `URLSearchParams` the
 * way the writer assembles it. A hand-typed payload would drift the moment the share codec
 * changes, and the whole point of this path is surviving the bytes v1 actually emits. The
 * hostile payloads are hand-written, because no writer produces them.
 *
 * Best-effort by decision (2026-09-15): chords, key, meter and tempo are the promise, and
 * that is what is asserted. `bnd` is not read at all — see `lib/v1-link.ts`.
 */
import { describe, expect, it } from 'vitest';
import { stripAccountsParam } from '../../../prototypes/v2/lib/account/feature.js';
import {
    hasV1SharePayload,
    openV1ShareLink,
    stripV1ShareParams,
} from '../../../prototypes/v2/lib/v1-link.js';
import type { ChartContent } from '../../../public/songbook/types.js';
import { compressSections } from '../../../public/state/share-codec.js';
import type { Section } from '../../../public/types.js';

/**
 * The v2-side baseline: the band and tempo a document already in this songbook carries.
 * Deliberately un-v1-like (bpm 100, Rock, everything `smart`) so any field the link is
 * supposed to carry cannot pass by accidentally matching the fallback.
 */
const BASE: Pick<ChartContent, 'performance' | 'band'> = {
    // A baseline saved before 2026-09-26, legacy fields and all: none of them may reach the
    // chart a link opens.
    performance: { bpm: 100, complexity: 0.72, seed: '', randomizeSeed: true },
    band: {
        chords: {
            enabled: true,
            voice: 'synth',
            autoSound: false,
            volume: 1,
            reverb: 0.3,
            style: 'smart',
            instrument: 'Piano',
            octave: 48,
            density: 'standard',
        },
        bass: {
            enabled: true,
            voice: 'synth',
            autoSound: false,
            volume: 1,
            reverb: 0.05,
            style: 'smart',
            octave: 36,
        },
        soloist: {
            enabled: false,
            voice: 'synth',
            autoSound: false,
            volume: 1,
            reverb: 0.6,
            style: 'smart',
            preset: 'trumpet',
            octave: 72,
            mode: 'monophonic',
            autoMode: true,
            phrasingIntensity: 0.5,
            tradeMode: 'manual',
        },
        harmony: {
            enabled: false,
            voice: 'synth',
            autoSound: false,
            volume: 1,
            reverb: 0.4,
            style: 'smart',
            octave: 60,
            complexity: 0.5,
        },
        groove: {
            enabled: true,
            voice: 'synth',
            autoSound: false,
            volume: 1,
            reverb: 0.2,
            measures: 1,
            swing: 0,
            swingSub: '8th',
            humanize: 20,
            lastDrumPreset: 'Basic Rock',
            genreFeel: 'Rock',
            lastSmartGenre: 'Rock',
            pattern: [],
        },
    },
};

const NOW = '2026-09-20T12:00:00.000Z';

function section(partial: Partial<Section> & { label: string; value: string }): Section {
    return { id: `id-${partial.label}`, repeat: 1, ...partial } as Section;
}

/** A v1 share URL's query string, assembled exactly as `generateShareUrl` assembles it. */
function shareQuery(sections: Section[], params: Record<string, string>): string {
    const search = new URLSearchParams({ s: compressSections(sections) });
    for (const [name, value] of Object.entries(params)) {
        search.set(name, value);
    }
    return `?${search.toString()}`;
}

function open(search: string) {
    return openV1ShareLink(search, BASE, NOW);
}

/** The chart of a link that must have opened; fails loudly rather than returning undefined. */
function chartOf(outcome: ReturnType<typeof open>) {
    if (outcome.kind !== 'ok') {
        throw new Error(`expected an opened link, got ${outcome.kind}`);
    }
    return outcome.document;
}

describe('a real v1 share link', () => {
    it('opens a multi-section blues with its chords, key, meter and tempo', () => {
        const document = chartOf(
            open(
                shareQuery(
                    [
                        section({ label: 'Head', value: 'C7 | F7 | C7 | C7' }),
                        section({ label: 'Turnaround', value: 'G7 | F7 | C7 | G7', repeat: 2 }),
                    ],
                    {
                        key: 'C',
                        ts: '4/4',
                        bpm: '96',
                        genre: 'Blues',
                        style: 'jazz',
                        int: '0.40',
                        comp: '0.55',
                        notation: 'name',
                    },
                ),
            ),
        );
        const { arrangement, performance, band } = document.chart;
        expect(arrangement.sections.map((s) => [s.label, s.value, s.repeat])).toEqual([
            ['Head', 'C7 | F7 | C7 | C7', 1],
            ['Turnaround', 'G7 | F7 | C7 | G7', 2],
        ]);
        expect(arrangement.key).toBe('C');
        expect(arrangement.timeSignature).toBe('4/4');
        expect(arrangement.notation).toBe('name');
        expect(performance.bpm).toBe(96);
        expect(band.groove.genre).toBe('Blues');
        // The old engine's `comp` and `style` land nowhere: a chart no longer carries either,
        // and the lane styles follow the genre (DECISION 2026-09-26). `int` doesn't either,
        // since it cannot say whether the sender was on auto energy.
        expect(performance).toEqual({ bpm: 96, seed: '', randomizeSeed: true, energy: 'auto' });
        expect(band.chords).not.toHaveProperty('style');
        expect(band).not.toHaveProperty('harmony');
        // Not a library entry and not an import: a fresh id, never `v1-session` or a
        // content-derived `v1-preset-…` one, which belong to `lib/import-v1.ts`.
        expect(document.id).not.toBe('v1-session');
        expect(document.id.startsWith('v1-preset-')).toBe(false);
        expect(document.id).not.toBe(
            chartOf(open(shareQuery([section({ label: 'A', value: 'C' })], {}))).id,
        );
        expect(document.title).toBe('Shared song');
        expect(document.schemaVersion).toBe(1);
    });

    it('opens a minor-key waltz in its own meter, with a unicode section label', () => {
        const document = chartOf(
            open(
                shareQuery(
                    [
                        section({
                            label: 'Valse ① · Tema',
                            value: 'Am | Dm | E7 | Am',
                            isMinor: true,
                        }),
                        section({ label: 'Pont', value: 'F | G | C | E7', isMinor: true }),
                    ],
                    { key: 'A', ts: '3/4', bpm: '132', genre: 'Jazz', notation: 'roman' },
                ),
            ),
        );
        const { arrangement, performance } = document.chart;
        expect(arrangement.sections[0].label).toBe('Valse ① · Tema');
        expect(arrangement.sections[0].value).toBe('Am | Dm | E7 | Am');
        expect(arrangement.key).toBe('A');
        expect(arrangement.timeSignature).toBe('3/4');
        // The `?s=` payload has no song-level minor flag and v1's own reader leaves the
        // recipient's default standing; the section payload does carry one, so the opening
        // section's explicit flag is the closest thing the link has to the song's quality.
        expect(arrangement.isMinor).toBe(true);
        expect(performance.bpm).toBe(132);
    });

    it('opens an odd meter and a feel-spelled genre', () => {
        const document = chartOf(
            open(
                shareQuery([section({ label: 'A', value: 'Dm7 | G7 | Cmaj7 | A7' })], {
                    key: 'C',
                    ts: '5/4',
                    bpm: '125',
                    // The share writer emits the FEEL, not the canon genre name.
                    genre: 'Bossa Nova',
                }),
            ),
        );
        expect(document.chart.arrangement.timeSignature).toBe('5/4');
        expect(document.chart.performance.bpm).toBe(125);
        // Stored once, by its canonical name.
        expect(document.chart.band.groove.genre).toBe('Bossa');
        expect(document.chart.band.groove).not.toHaveProperty('genreFeel');
        expect(document.chart.band.groove).not.toHaveProperty('lastSmartGenre');
    });

    // A link carries no swing of its own: without the genre's a Jazz link played straight
    // eighths (#1412). It brings the band style's, the one a picked genre plays too.
    it("brings the swing picking the genre gives: its band style's", () => {
        const feelOf = (genre: string) =>
            chartOf(open(`?prog=${encodeURIComponent('Dm7 | G7')}&genre=${genre}`)).chart.band
                .groove;
        expect(feelOf('Jazz')).toMatchObject({ swing: 60, swingSub: '8th' });
        expect(feelOf('Blues')).toMatchObject({ swing: 100, swingSub: '8th' });
        expect(feelOf('Country')).toMatchObject({ swing: 30, swingSub: '8th' });
        expect(feelOf('Neo-Soul')).toMatchObject({ swing: 45, swingSub: '16th' });
        // The feel-spelled genre the share writer emits resolves the same way.
        expect(feelOf('Bossa%20Nova')).toMatchObject({ swing: 0, swingSub: '16th' });
        expect(feelOf('Rock')).toMatchObject({ swing: 0, swingSub: '8th' });
        // No genre (or an unknown one) keeps the old fallback: straight.
        expect(chartOf(open('?prog=I%20%7C%20IV')).chart.band.groove.swing).toBe(0);
        expect(feelOf('Polka').swing).toBe(0);
    });

    it("prefers `s` over `prog`, the way v1's own `loadFromUrl` resolves the pair", () => {
        const search = `${shareQuery([section({ label: 'Head', value: 'C7 | F7' })], {})}&prog=${encodeURIComponent('I | IV')}`;
        const document = chartOf(open(search));
        expect(document.chart.arrangement.sections.map((s) => s.value)).toEqual(['C7 | F7']);
    });

    it('opens a plain-text `?prog=` permalink as one section', () => {
        const document = chartOf(open('?prog=I%20%7C%20IV%20%7C%20V%20%7C%20I&key=G&bpm=88'));
        expect(document.chart.arrangement.sections).toHaveLength(1);
        expect(document.chart.arrangement.sections[0].value).toBe('I | IV | V | I');
        expect(document.chart.arrangement.key).toBe('G');
        expect(document.chart.performance.bpm).toBe(88);
    });
});

describe('a URL with no v1 share payload', () => {
    it('is left alone', () => {
        expect(open('')).toEqual({ kind: 'none' });
        expect(open('?accounts=on')).toEqual({ kind: 'none' });
        // Every other v1 parameter without a chart in it is still nothing to open.
        expect(open('?key=C&ts=4/4&bpm=120&genre=Funk')).toEqual({ kind: 'none' });
        // A present-but-empty payload is indistinguishable from an absent one, and
        // "nothing to open" is the honest answer rather than a failure to report.
        expect(open('?s=&key=C')).toEqual({ kind: 'none' });
        expect(open('?prog=')).toEqual({ kind: 'none' });
    });
});

describe('a hostile or broken link', () => {
    it('fails closed rather than throwing', () => {
        for (const search of [
            '?s=not-base64!!',
            // `TABLE['constructor']` is a truthy hit on a plain-object table; the codec
            // rejects it as a payload long before any table sees it.
            '?s=constructor',
            '?s=__proto__',
            // Past the codec's 100KB payload ceiling.
            `?s=${'A'.repeat(102_500)}`,
            // Valid base64, valid JSON, wrong shape.
            `?s=${encodeURIComponent(btoa('{"not":"an array"}'))}`,
            '?prog=%20%20%20',
        ]) {
            const outcome = open(search);
            expect(outcome.kind, search).toBe('failed');
        }
    });

    it('falls back field by field instead of failing the whole chart', () => {
        const sections = [section({ label: 'A', value: 'C | G' })];
        // A prototype member as a meter, a genre and a chord style; an out-of-range tempo.
        const document = chartOf(
            open(
                shareQuery(sections, {
                    key: 'constructor',
                    ts: 'constructor',
                    genre: '__proto__',
                    style: 'toString',
                    bpm: '9999',
                    comp: 'NaN',
                    notation: 'valueOf',
                }),
            ),
        );
        const { arrangement, performance, band } = document.chart;
        expect(arrangement.key).toBe('C');
        expect(arrangement.timeSignature).toBe('4/4');
        expect(arrangement.notation).toBe('roman');
        expect(band.groove.genre).toBe('Rock');
        // v1 tolerated 20–300; the songbook schema is a whole 40–240, so the far end clamps.
        expect(performance.bpm).toBe(240);
        // Neither v1's hostile `comp`/`style` nor the baseline's legacy fields land: the
        // chart is written as a chart is today.
        expect(performance).not.toHaveProperty('complexity');
        expect(band.chords).not.toHaveProperty('style');
    });

    it('takes an unreadable tempo from the songbook baseline', () => {
        const document = chartOf(
            open(shareQuery([section({ label: 'A', value: 'C | G' })], { bpm: 'allegro' })),
        );
        expect(document.chart.performance.bpm).toBe(BASE.performance.bpm);
    });
});

describe('consuming the link', () => {
    it('drops every v1 parameter, including the ones it never reads', () => {
        expect(
            stripV1ShareParams(
                '?s=abc&prog=x&key=C&ts=4%2F4&bpm=120&genre=Funk&style=comp&int=0.4&comp=0.5&notation=name&tmr=5&bnd=zzz&seed=abc123&autoplay=1&utm_source=email',
            ),
        ).toBe('?utm_source=email');
        expect(stripV1ShareParams('?s=abc')).toBe('');
        expect(stripV1ShareParams('')).toBe('');
        expect(stripV1ShareParams('?utm_source=email')).toBe('?utm_source=email');
    });

    it('leaves a survivor equivalent rather than byte-identical', () => {
        // `URLSearchParams` round-tripping is the documented limit of "everything else
        // survives": spacing normalises and a valueless parameter gains an `=`. Both read
        // back identically through `URLSearchParams`, which is every reader in this app.
        expect(stripV1ShareParams('?s=abc&note=a b')).toBe('?note=a+b');
        expect(stripV1ShareParams('?s=abc&debug')).toBe('?debug=');
    });

    it('does not strip the account flag by itself — that is `stripAccountsParam`', () => {
        // The two halves are composed by the shell's `consumeLink`; each module owns the
        // parameter names it knows about, and neither one alone is the whole rule.
        expect(stripV1ShareParams('?s=abc&accounts=on')).toBe('?accounts=on');
        expect(stripAccountsParam(stripV1ShareParams('?s=abc&accounts=on'))).toBe('');
        expect(stripAccountsParam(stripV1ShareParams('?s=abc&accounts=on&utm_source=email'))).toBe(
            '?utm_source=email',
        );
    });
});

describe('hasV1SharePayload', () => {
    it('recognises exactly the two parameters that carry a chart', () => {
        expect(hasV1SharePayload('?s=abc')).toBe(true);
        expect(hasV1SharePayload('?prog=I%20%7C%20IV')).toBe(true);
        expect(hasV1SharePayload('?accounts=on&s=abc')).toBe(true);
        expect(hasV1SharePayload('')).toBe(false);
        expect(hasV1SharePayload('?accounts=on')).toBe(false);
        // Everything else a v1 link carries only DESCRIBES a chart; on its own it is not one,
        // so an ordinary v2 URL that happens to say `?key=` is not treated as a share link.
        expect(hasV1SharePayload('?key=C&ts=4/4&bpm=120&genre=Funk&bnd=zzz')).toBe(false);
        // Present-but-empty is absent.
        expect(hasV1SharePayload('?s=&prog=')).toBe(false);
    });
});
