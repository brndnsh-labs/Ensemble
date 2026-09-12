import fixtures from '../../../docs/design/fixtures/ensemble-v2-charts.json';
import { decodeIRealMusic } from '../../../public/songbook/ireal-decode.js';
import { parseIRealImport } from '../../../public/songbook/ireal-import.js';
import { prepareScorePlayback } from '../../../public/songbook/score-playback.js';

function open(body: string, title = 'Original fixture', key = 'C'): string {
    return `irealbook://${encodeURIComponent([title, 'Ensemble', 'Swing', key, 'n', body].join('='))}`;
}

function score(body: string) {
    const parsed = parseIRealImport(open(body));
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.songs[0]?.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
    expect(parsed.songs[0]?.score).toBeDefined();
    return parsed.songs[0].score!;
}

function blocked(body: string) {
    const source = open(body);
    const parsed = parseIRealImport(source);
    expect(parsed.source).toBe(source);
    expect(parsed.songs[0]?.score).toBeUndefined();
    expect(parsed.songs[0]?.diagnostics.some((entry) => entry.severity === 'error')).toBe(true);
}

describe('bounded source-preserving iReal import', () => {
    it('decodes the supplied sanitized modern Blues without losing empty header fields or refs', () => {
        const fixture = fixtures.realExport;
        const parsed = parseIRealImport(fixture.sanitizedUrl);
        expect(parsed.source).toBe(fixture.sanitizedUrl);
        expect(parsed.format).toBe('irealb');
        expect(parsed.diagnostics).toEqual([]);
        expect(parsed.songs).toHaveLength(1);
        const song = parsed.songs[0];
        expect(song.metadata.fields).toEqual(fixture.expectedPositionalFields);
        expect(song.metadata).toMatchObject({
            key: 'C',
            transpose: '10',
            tempo: '0',
            repeats: '6',
        });
        expect(song.score?.key).toBe('C');
        expect(song.score?.sections[0].repeat).toBe(1);
        expect(song.score?.sections[0].measures).toHaveLength(12);
        expect(song.score?.sections[0].measures[3].content).toEqual({
            kind: 'repeat',
            measureId: 'ireal-1-bar-3',
            display: 'one-bar',
        });
        expect(decodeIRealMusic(fixture.expectedPositionalFields[6])).toBe(
            fixture.expectedUnscrambledBody,
        );
    });

    it('accepts the independent documented open-protocol fixture', () => {
        const parsed = parseIRealImport(fixtures.syntheticOpenProtocol.url);
        expect(parsed.format).toBe('irealbook');
        expect(parsed.songs[0].score?.sections[0].measures).toHaveLength(2);
        expect(parsed.songs[0].metadata.fields).toEqual(
            fixtures.syntheticOpenProtocol.expectedFields,
        );
    });

    it('keeps unpermuted 50- and 51-character final tails intact', () => {
        for (const length of [1, 49, 50, 51]) {
            const body = '0123456789'.repeat(6).slice(0, length);
            expect(decodeIRealMusic(`1r34LbKcu7${body}`)).toBe(body);
        }
    });

    it.each([
        ['D-', 'Dm'],
        ['D-7/F', 'Dm7/F'],
        ['A-6', 'Am6'],
        ['E-9', 'Em9'],
        ['C^', 'Cmaj7'],
        ['C^7/E', 'Cmaj7/E'],
        ['Bh', 'Bm7b5'],
        ['Bh7', 'Bm7b5'],
        ['B-7b5', 'Bm7b5'],
        ['Co', 'Cdim'],
        ['Co7', 'Cdim7'],
        ['Csus', 'Csus4'],
        ['C2', 'Csus2'],
    ])(
        'maps equivalent iReal shorthand %s into playable %s without dropping extensions',
        (written, canonical) => {
            const source = open(`T44[${written}   Z`);
            const parsed = parseIRealImport(source);
            expect(parsed.source).toBe(source);
            expect(parsed.songs[0].score).toBeDefined();
            const plan = prepareScorePlayback(parsed.songs[0].score);
            expect(plan.sections[0].measures[0].symbols).toEqual([canonical]);
        },
    );

    it.each([
        ['C   ', [[4, 1]]],
        [' C  ', [[4, 1]]],
        [
            'C G7 ',
            [
                [2, 1],
                [2, 1],
            ],
        ],
        [
            'C Dm,G7',
            [
                [2, 1],
                [1, 1],
                [1, 1],
            ],
        ],
        [
            'C,Dm,G7 ',
            [
                [1, 1],
                [1, 1],
                [2, 1],
            ],
        ],
        [
            'C  G7',
            [
                [3, 1],
                [1, 1],
            ],
        ],
        [
            'C,Dm,Em,F',
            [
                [1, 1],
                [1, 1],
                [1, 1],
                [1, 1],
            ],
        ],
    ])('retains verified exact cell spacing %s', (body, durations) => {
        const content = score(`T44[${body}Z`).sections[0].measures[0].content;
        expect(content.kind).toBe('events');
        if (content.kind === 'events') {
            expect(content.events.map((event) => event.duration)).toEqual(durations);
        }
    });

    it('maps repeat barlines and alternate ending markers without unfolding the authored chart', () => {
        const result = score('T44*A{C   |N1F   }|N2G7  Z');
        const bars = result.sections[0].measures;
        expect(bars).toHaveLength(3);
        expect(bars[0].start).toEqual([{ kind: 'repeat-start' }]);
        expect(bars[0].annotations).toEqual([{ text: 'A', at: [0, 1], placement: 'above' }]);
        expect(bars[1].start).toEqual([{ kind: 'ending-start', passes: [1] }]);
        expect(bars[1].end).toEqual([{ kind: 'repeat-end', times: 2 }]);
        expect(bars[2].start).toEqual([{ kind: 'ending-start', passes: [2] }]);
    });

    it('retains a legitimate closing/opening double-bar boundary without fabricating a measure', () => {
        expect(score('T44[C   ][G7  Z').sections[0].measures).toHaveLength(2);
    });

    it('maps one- and two-bar repeats to their earlier authored sources', () => {
        const bars = score('T44[C   |F   | r |   |x   Z').sections[0].measures;
        expect(bars.slice(2).map((bar) => bar.content)).toEqual([
            { kind: 'repeat', measureId: bars[0].id, display: 'two-bar-start' },
            { kind: 'repeat', measureId: bars[1].id, display: 'two-bar-end' },
            { kind: 'repeat', measureId: bars[3].id, display: 'one-bar' },
        ]);
    });

    it('maps explicit repeat counts without confusing them with player chorus metadata', () => {
        const bars = score('T44{C   |F   <3x>}').sections[0].measures;
        expect(bars[1].end).toEqual([{ kind: 'repeat-end', times: 3 }]);
    });

    it('preserves slash bass, alternate chords, fermata, N.C. and held events as distinct notation', () => {
        const bars = score('T44[C/E(Dm7)f   |n   |p   Z').sections[0].measures;
        expect(bars.map((bar) => bar.content)).toEqual([
            {
                kind: 'events',
                events: [
                    {
                        kind: 'chord',
                        symbol: 'C/E',
                        duration: [4, 1],
                        alternates: ['Dm7'],
                        fermata: true,
                    },
                ],
            },
            { kind: 'events', events: [{ kind: 'no-chord', duration: [4, 1] }] },
            { kind: 'events', events: [{ kind: 'hold', duration: [4, 1] }] },
        ]);
    });

    it('does not mistake official parenthesized chord qualities for alternate chords', () => {
        const content = score('T44[Cmaj(add4)   Z').sections[0].measures[0].content;
        expect(content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'Cmaj(add4)', duration: [4, 1] }],
        });
    });

    it('retains sticky written meter changes at the next measure boundary', () => {
        const result = score('T44[C   T34|F   |G7  Z');
        expect(result.meter).toBe('4/4');
        expect(result.sections[0].measures[1].meter).toBe('3/4');
        expect(result.sections[0].measures[2].content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'G7', duration: [3, 1] }],
        });
    });

    it.each(['C', 'S'])('maps unambiguous D.%s. al Fine at the final barline', (from) => {
        const bars = score(`T44[${from === 'S' ? 'S' : ''}C   <Fine>|F   <D.${from}. al Fine>Z`)
            .sections[0].measures;
        expect(bars[1].end).toContainEqual({
            kind: 'jump',
            from: from === 'C' ? 'start' : 'segno',
            repeats: 'skip',
            ...(from === 'S' ? { segno: 'segno-1' } : {}),
            destination: { kind: 'fine', label: 'fine-1' },
        });
    });

    it('maps coda departure after music separately from coda arrival before music', () => {
        const bars = score('T44[C   Q|F   <D.C. al Coda>Z[QG7  Z').sections[0].measures;
        expect(bars[0].end).toEqual([{ kind: 'coda', label: 'coda-1' }]);
        expect(bars[2].start).toEqual([{ kind: 'coda', label: 'coda-2' }]);
        expect(bars[1].end).toContainEqual({
            kind: 'jump',
            from: 'start',
            repeats: 'skip',
            destination: { kind: 'coda', via: 'coda-1', target: 'coda-2' },
        });
    });

    it.each([
        'T44[C,Dm,G7Z',
        'T44[C,Dm,Em,F,G7Z',
        'T34[C F Z',
        'T44[C | |G7 Z',
        'T44[CunknownZ',
        'T44[C UZ',
        'T44[C Kcl Z',
        'T44[C LZ',
        'T44[C7',
        'T44[x Z',
        'T44[C |r Z',
        'T44[C |F |r Z',
        'T44[C |F |r |G7 Z',
        'T44[W/C Z',
        'T44[C <Bass break>Z',
        'T44[C <D.C. al 2nd End.>Z',
        'T44{C <Fine>|F <D.C. al Fine>}Z',
        'T44[C <D.C. al Fine>Z',
        'T44[C <Fine>|F <D.C. al Fine>|G7Z',
        'T44[QC|F <D.C. al Coda>Z[QG7Z',
        '[C Z',
        'T44[N0C Z',
        'T44[C (Dm) Z',
        'T44[C<unclosed Z',
    ])('blocks unsupported, ambiguous or incomplete music without a partial score: %s', blocked);

    it.each([
        'T44[C   ||G7  Z',
        'T44[C   |Z',
        'T44[C   |]',
        'T44[C   ][Z',
        'T44[C   ][]',
        'T44[C   |  Z',
        'T44[C   Z<D.C. al Fine>',
        'T44[C   Z<4x>',
        'T44[C   ZT34',
        'T44[C   T34Z',
        'T44{C   Z',
        'T44{{C   }',
        'T44{C   |N1F   }',
    ])(
        'does not erase terminal empty measures, dangling context/commands or invalid form: %s',
        blocked,
    );

    it('handles HTML as inert data and only extracts actual quoted anchor links', () => {
        const url = open('T44[C Z', 'A & B');
        const source = `<html><script>"<a href="${open('T44[F Z')}">trap</a>"</script><!-- <a href="${open('T44[G Z')}"> --> <img src="https://invalid.test/image"><a HREF='${url}'>Chart</a></html>`;
        const parsed = parseIRealImport(source);
        expect(parsed.source).toBe(source);
        expect(parsed.songs).toHaveLength(1);
        expect(parsed.songs[0].title).toBe('A & B');
        expect(parsed.songs[0].score).toBeDefined();
    });

    it('decodes HTML references once and never decodes plus as form-url-encoded space', () => {
        const source = `<a href="${open('T44[C+ Z', 'A&B').replace('%26', '&#38;')}">Chart</a>`;
        const song = parseIRealImport(source).songs[0];
        expect(song.title).toBe('A&B');
        expect(song.score?.sections[0].measures[0].content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C+', duration: [4, 1] }],
        });
    });

    it('does not mistake a script closing-tag prefix for the actual raw-text end', () => {
        const source = `<script></scripture><a href="${open('T44[F Z')}">fake</a></script><a href="${open('T44[C Z', 'Real')}">real</a>`;
        const parsed = parseIRealImport(source);
        expect(parsed.songs.map((song) => song.title)).toEqual(['Real']);
    });

    it('returns every song and preserves modern empty fields in a playlist', () => {
        const one = fixtures.realExport.sanitizedUrl.slice('irealb://'.length);
        const source = `irealb://${one}===${one.replace('Blues%20fixture', 'Another%20fixture')}===Practice`;
        const parsed = parseIRealImport(source);
        expect(parsed.songs).toHaveLength(2);
        expect(parsed.songs.map((song) => song.title)).toEqual([
            'Blues fixture',
            'Another fixture',
        ]);
        expect(parsed.songs.every((song) => song.score)).toBe(true);
        expect(parsed.songs[1].metadata.fields[2]).toBe('');
        expect(parsed.songs[0].score?.sections[0].measures[0].id).not.toBe(
            parsed.songs[1].score?.sections[0].measures[0].id,
        );
    });

    it('returns an open-protocol playlist with per-song diagnostics, never silently choosing the first', () => {
        const first = ['One', '', '', 'C', 'n', 'T44[C Z'];
        const second = ['Two', '', '', 'C', 'n', 'T44[C unknown Z'];
        const parsed = parseIRealImport(
            `irealbook://${encodeURIComponent([...first, ...second, 'Practice'].join('='))}`,
        );
        expect(parsed.songs).toHaveLength(2);
        expect(parsed.songs[0].score).toBeDefined();
        expect(parsed.songs[1].score).toBeUndefined();
    });

    it.each([
        'irealb://search?Blues',
        'irealbook://Bad%ZZ',
        'irealbook://Bad%FF',
        'https://invalid.test/chart',
        '<script>irealb://ignored</script>',
        '<a href=irealb://unquoted>link</a>',
        '<a href="irealb://one" href="irealb://two">',
        '<a href="irealb://&constructor;">',
        '<!-- unclosed',
        '<a href="irealb://unterminated',
    ])('returns a source-preserving diagnostic for malformed envelopes: %s', (source) => {
        const parsed = parseIRealImport(source);
        expect(parsed.source).toBe(source);
        expect(parsed.songs).toEqual([]);
        expect(parsed.diagnostics[0]?.severity).toBe('error');
    });

    it.each(['<script>unsafe</script>', 'unsafe\u0000title', 'x'.repeat(161)])(
        'rejects unsafe display metadata: %s',
        (title) => {
            const parsed = parseIRealImport(open('T44[C Z', title));
            expect(parsed.songs[0].score).toBeUndefined();
            expect(parsed.songs[0].title).toBe('Imported song 1');
            expect(parsed.songs[0].metadata.fields[0]).toBe(title);
        },
    );

    it('never treats prototype names as musical keys or special metadata fields', () => {
        const parsed = parseIRealImport(open('T44[C Z', 'constructor', '__proto__'));
        expect(parsed.songs[0].title).toBe('constructor');
        expect(parsed.songs[0].score).toBeUndefined();
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('enforces source-byte, song, bar and cell bounds', () => {
        for (const source of ['x'.repeat(1_048_577), '🎵'.repeat(262_145)]) {
            expect(parseIRealImport(source).diagnostics[0]?.message).toContain('1 MiB');
        }
        const tooMany = Array.from(
            { length: 65 },
            () => `<a href="${open('T44[C Z')}">song</a>`,
        ).join('');
        expect(parseIRealImport(tooMany).diagnostics[0]?.message).toContain('64');
        blocked(`T44[${'C|'.repeat(4096)}C Z`);
        blocked(`T44[C${' '.repeat(64)}Z`);
    });

    it('bounds the performed repeat route before returning a score', () => {
        blocked(`T44{${'C|'.repeat(300)}C<64x>}`);
    });

    it('bounds total written measures across multiple valid songs', () => {
        const chart = open(`T44[${'C|'.repeat(2050)}CZ`);
        const source = `<a href="${chart}">one</a><a href="${chart}">two</a>`;
        const parsed = parseIRealImport(source);
        expect(parsed.source).toBe(source);
        expect(parsed.songs).toEqual([]);
        expect(parsed.diagnostics[0]?.message).toContain('4,096 written measures');
    });

    it('returns detached objects and deterministic identities on repeated reads', () => {
        const source = fixtures.realExport.sanitizedUrl;
        const first = parseIRealImport(source);
        const second = parseIRealImport(source);
        expect(first).toEqual(second);
        first.songs[0].metadata.fields[0] = 'Changed';
        first.songs[0].score!.sections[0].measures[0].id = 'Changed';
        expect(second.songs[0].metadata.fields[0]).toBe('Blues fixture');
        expect(second.songs[0].score!.sections[0].measures[0].id).toBe('ireal-1-bar-1');
    });
});
