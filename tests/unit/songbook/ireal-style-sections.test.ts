/**
 * #2004: an iReal import keeps the tune's style, tempo and sections. Fixture-driven over the 24
 * Jazz 1460 tunes in `tests/fixtures/ireal/`; every expectation below was decoded from the
 * fixture itself (its style field, its rehearsal marks and repeat signs), not recalled.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GENRE_NAMES } from '../../../core/data/smart-genres.js';
import { parseIRealImport } from '../../../core/songbook/ireal-import.js';
import {
    defaultTempoForIRealStyle,
    genreForIRealStyle,
    knownIRealStyles,
    writtenIRealTempo,
} from '../../../core/songbook/ireal-style.js';
import { compileScoreForm } from '../../../core/songbook/score-form.js';
import { genreSwing } from '../../../web/lib/genre-swing.js';
import { importedDocument } from '../../../web/lib/import-document.js';
import { accountChart } from '../../utils/account-songbook-fixture.js';

// slug: [iReal style, genre, tempo, sections as label:bars, performed bars]
const EXPECTED: Record<string, [string, string, number, string, number]> = {
    '500-miles-high': ['Bossa Nova', 'Bossa', 130, 'Chart:22', 0],
    '502-blues': ['Waltz', 'Jazz', 150, 'Chart:20', 0],
    'all-blues': ['Waltz', 'Jazz', 150, 'Chart:24', 0],
    'all-the-things-you-are': ['Medium Up Swing', 'Jazz', 160, 'A:8 B:8 C:8 D:12', 0],
    'autumn-leaves': ['Medium Swing', 'Jazz', 130, 'A:8 B:8 C:8', 32],
    'blue-bossa': ['Bossa Nova', 'Bossa', 130, 'Chart:16', 0],
    'blue-in-green': ['Ballad', 'Jazz', 66, 'Chart:14', 0],
    cherokee: ['Up Tempo Swing', 'Jazz', 200, 'A:20 B:16', 64],
    'donna-lee': ['Up Tempo Swing', 'Jazz', 200, 'A:16 B:16', 0],
    driftin: ['Medium Swing', 'Jazz', 130, 'A:10 B:8 A:11', 0],
    'giant-steps': ['Up Tempo Swing', 'Jazz', 200, 'Chart:16', 0],
    harlequin: ['Ballad', 'Jazz', 66, 'i:10 A:34', 0],
    'hello-dolly': ['Medium Swing', 'Jazz', 130, 'A:16 B:22', 0],
    'i-got-rhythm': ['Up Tempo Swing', 'Jazz', 200, 'A:9 B:8 A:12', 0],
    'ladies-in-mercedes': ['Bossa Nova', 'Bossa', 130, 'A:8 B:8 C:8 D:12', 0],
    'night-and-day': ['Medium Swing', 'Jazz', 130, 'A:18 B:16', 48],
    // Its C (bar 33) sits inside the repeat that opens at bar 17, so it stays a letter in its bar.
    'one-for-my-baby': ['Ballad', 'Jazz', 66, 'A:16 B:31', 0],
    ornithology: ['Up Tempo Swing', 'Jazz', 200, 'A:8 B:8 A:8 C:8', 0],
    'round-midnight': ['Ballad', 'Jazz', 66, 'i:8 A:10 B:17', 0],
    'speak-like-a-child': ['Bossa Nova', 'Bossa', 130, 'A:24 B:24', 0],
    'stella-by-starlight': ['Medium Swing', 'Jazz', 130, 'A:16 B:8 C:8', 0],
    'take-five': ['Medium Up Swing', 'Jazz', 160, 'A:8 B:8 A:8', 0],
    'up-with-the-lark': ['Medium Swing', 'Jazz', 130, 'i:8 A:16 B:24 A:16', 0],
    'west-coast-blues': ['Waltz', 'Jazz', 150, 'i:12 A:12', 0],
};

function fixtureText(slug: string) {
    const text = readFileSync(
        new URL(`../../fixtures/ireal/${slug}.txt`, import.meta.url),
        'utf8',
    ).trim();
    return { text };
}

function importFixture(slug: string) {
    const { text } = fixtureText(slug);
    const result = parseIRealImport(text);
    expect(result.songs).toHaveLength(1);
    return { result, song: result.songs[0] };
}

describe('the 24 playlist fixtures keep their style, tempo and sections (#2004)', () => {
    it('covers every fixture on disk', () => {
        const slugs = readdirSync(new URL('../../fixtures/ireal/', import.meta.url))
            .filter((name) => name.endsWith('.txt'))
            .map((name) => name.replace(/\.txt$/, ''));
        expect(slugs.sort()).toEqual(Object.keys(EXPECTED).sort());
    });

    it.each(Object.entries(EXPECTED))('%s', (slug, [style, genre, bpm, sections, performed]) => {
        const { song } = importFixture(slug);
        expect(song.style).toBe(style);
        expect(song.genre).toBe(genre);
        // The fixtures all write tempo 0 ("not set"), so the style's own starting tempo stands.
        expect(song.tempo).toEqual({ bpm, from: 'style' });
        const score = song.score!;
        expect(score.sections.map((s) => `${s.label}:${s.measures.length}`).join(' ')).toBe(
            sections,
        );
        // Bars keep their order and ids across the split: nothing renumbered, nothing dropped.
        const ids = score.sections.flatMap((s) => s.measures.map((m) => m.id));
        expect(ids).toEqual(ids.map((_, i) => `ireal-1-bar-${i + 1}`));
        if (performed) {
            expect(compileScoreForm(score)).toHaveLength(performed);
        }
        // No rehearsal-mark letter is left in a bar that also names a section.
        for (const section of score.sections) {
            const first = section.measures[0];
            expect((first.annotations ?? []).filter((a) => /^[ABCDVvi]$/.test(a.text))).toEqual([]);
        }
    });

    it('stores no iReal `-^` shorthand in any chord', () => {
        const seen = new Set<string>();
        for (const slug of Object.keys(EXPECTED)) {
            const { song } = importFixture(slug);
            for (const section of song.score!.sections) {
                for (const bar of section.measures) {
                    if (bar.content.kind !== 'events') {
                        continue;
                    }
                    for (const event of bar.content.events) {
                        if (event.kind === 'chord') {
                            seen.add(event.symbol);
                            expect(event.symbol).not.toContain('-^');
                            for (const alt of event.alternates ?? []) {
                                expect(alt).not.toContain('-^');
                            }
                        }
                    }
                }
            }
        }
        // The fixtures do write `Db-^7` and `C-^7`: they arrive as the house minor-major seventh.
        expect(seen).toContain('DbmMaj7');
        expect(seen).toContain('CmMaj7');
    });

    it('explains the one mark it leaves inside a repeat', () => {
        const { song } = importFixture('one-for-my-baby');
        const messages = song.diagnostics.map((d) => d.message);
        expect(messages).toContain(
            'Rehearsal mark C at bar 33 sits inside a repeat or ending, so it stays a letter in its bar and does not start a section.',
        );
    });

    it('plays the same bars in the same order as the one-section import did', () => {
        // The split is built only when the performed measure order is identical; prove it end to end
        // by flattening the sections back into one and comparing the compiled routes.
        for (const slug of Object.keys(EXPECTED)) {
            const { song } = importFixture(slug);
            const score = song.score!;
            const flat = {
                ...score,
                sections: [
                    {
                        ...score.sections[0],
                        id: 'flat',
                        measures: score.sections.flatMap((s) => s.measures),
                    },
                ],
            };
            const route = (s: typeof score) =>
                compileScoreForm(s).map(
                    (v) => `${v.chorus}:${s.sections[v.sectionIndex].measures[v.measureIndex].id}`,
                );
            expect(route(score)).toEqual(route(flat));
        }
    });
});

describe('the style table (#2004)', () => {
    it('maps only to canon genres', () => {
        for (const [style, { genre, bpm }] of knownIRealStyles()) {
            expect(GENRE_NAMES, style).toContain(genre);
            expect(bpm, style).toBeGreaterThanOrEqual(40);
            expect(bpm, style).toBeLessThanOrEqual(240);
        }
    });

    it('matches case and spacing loosely and leaves an unknown style alone', () => {
        expect(genreForIRealStyle('  bossa   NOVA ')).toBe('Bossa');
        expect(genreForIRealStyle('Gypsy Jazz')).toBeNull();
        expect(genreForIRealStyle(undefined)).toBeNull();
        expect(defaultTempoForIRealStyle('Gypsy Jazz')).toBeNull();
    });

    it('reads a written tempo only when it is one the app plays', () => {
        expect(writtenIRealTempo('0')).toBeNull();
        expect(writtenIRealTempo('')).toBeNull();
        expect(writtenIRealTempo('120')).toBe(120);
        expect(writtenIRealTempo('300')).toBeNull();
        expect(writtenIRealTempo('12x')).toBeNull();
    });

    it('has no tempo field in the open protocol, so the style’s default stands', () => {
        const song = parseIRealImport('irealbook://Tune=Someone=Medium Swing=C=n=T44[C   |G7  Z')
            .songs[0];
        expect(song.tempo).toEqual({ bpm: 130, from: 'style' });
        expect(song.genre).toBe('Jazz');
    });

    it('takes the export’s own tempo over the style’s, and ignores one outside 40-240', () => {
        const { text } = fixtureText('giant-steps');
        expect(text.endsWith('==0=0')).toBe(true);
        const withTempo = (bpm: string) =>
            parseIRealImport(`${text.slice(0, -'==0=0'.length)}==${bpm}=0`).songs[0];
        expect(withTempo('112').tempo).toEqual({ bpm: 112, from: 'export' });
        expect(withTempo('300').tempo).toEqual({ bpm: 200, from: 'style' });
    });

    it('keeps a two-bar repeat whole: a mark between its bars does not start a section', () => {
        const song = parseIRealImport(
            'irealbook://Tune=Someone=Medium Swing=C=n=T44[C   |D   |E   |r|*B  |A   |B   Z',
        ).songs[0];
        expect(song.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(song.score!.sections.map((s) => s.label)).toEqual(['Chart']);
    });

    it('labels the tune’s `i` mark with its letter, never "Intro", which would rest the lead', () => {
        const song = parseIRealImport(
            'irealbook://Tune=Someone=Medium Swing=C=n=T44*i[C   |F   |G   ]*A[C   |F   Z',
        ).songs[0];
        expect(song.score!.sections.map((s) => s.label)).toEqual(['i', 'A']);
    });
});

describe('the imported document carries them (#2004)', () => {
    const base = accountChart();

    it('plays in the mapped genre with that genre’s swing, at the proposed tempo', () => {
        const { result, song } = importFixture('blue-bossa');
        const document = importedDocument(result, 0, base, song.tempo!.bpm);
        expect(document.chart.band.groove.genre).toBe('Bossa');
        expect(document.chart.band.groove).toMatchObject(genreSwing('Bossa')!);
        expect(document.chart.performance.bpm).toBe(130);
    });

    it('keeps the borrowed setup when asked to, and takes another genre when told', () => {
        const { result } = importFixture('blue-bossa');
        expect(importedDocument(result, 0, base, 120, 'input', null).chart.band.groove.genre).toBe(
            base.chart.band.groove.genre,
        );
        expect(
            importedDocument(result, 0, base, 120, 'input', 'Funk').chart.band.groove.genre,
        ).toBe('Funk');
    });

    it('keeps the borrowed genre for a style Ensemble has no match for', () => {
        const { result, song } = importFixture('blue-bossa');
        song.style = 'Gypsy Jazz';
        song.genre = genreForIRealStyle(song.style);
        const document = importedDocument(result, 0, base, 120);
        expect(document.chart.band.groove.genre).toBe(base.chart.band.groove.genre);
    });
});
