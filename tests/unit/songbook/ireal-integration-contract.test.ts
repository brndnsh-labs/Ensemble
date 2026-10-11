import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIRealImport } from '../../../public/songbook/ireal-import.js';
import { compileScoreForm } from '../../../public/songbook/score-form.js';
import { resolveScoreMeasureEvents } from '../../../public/songbook/score-measure-events.js';
import { parseChordBar } from '../../../public/songbook/score-text.js';
import type { ScoreMeasure, SemanticScore } from '../../../public/songbook/score-types.js';

function bar(id: string, text: string, context: Partial<ScoreMeasure> = {}): ScoreMeasure {
    const parsed = parseChordBar(text, context.meter ?? '4/4');
    if (parsed.kind !== 'ok') {
        throw new Error(`Invalid original test bar: ${text}`);
    }
    return { id, content: { kind: 'events', events: parsed.value }, ...context };
}

function score(measures: ScoreMeasure[]): SemanticScore {
    return {
        notation: 'name',
        key: 'C',
        isMinor: false,
        meter: '4/4',
        grouping: null,
        sections: [{ id: 'a', label: 'A', repeat: 1, measures }],
    };
}

/**
 * The performed order of a score: each visit's written bar id and its events, from the form
 * compiler and the measure-event resolver (a measure repeat resolves to its destination's
 * events). It is the global order the band performs, never regrouped by section.
 */
function performed(candidate: SemanticScore) {
    const untouched = structuredClone(candidate);
    const events = resolveScoreMeasureEvents(candidate);
    const visits = compileScoreForm(candidate).map(({ sectionIndex, measureIndex }) => ({
        id: candidate.sections[sectionIndex].measures[measureIndex].id,
        events: events[sectionIndex][measureIndex],
    }));
    expect(candidate).toEqual(untouched);
    return {
        ids: visits.map((visit) => visit.id),
        symbols: visits.map((visit) =>
            visit.events.flatMap((event) => (event.kind === 'chord' ? [event.symbol] : [])),
        ),
        events: visits.map((visit) => visit.events),
    };
}

function openProtocol(body: string, title = 'Original import study') {
    return `irealbook://${encodeURIComponent(`${title}=Ensemble=Medium Swing=C=n=${body}`)}`;
}

function importedScore(source: string): SemanticScore {
    const result = parseIRealImport(source);
    expect(result.source).toBe(source);
    expect(result.songs).toHaveLength(1);
    expect([...result.diagnostics, ...result.songs[0].diagnostics]).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ severity: 'error' })]),
    );
    const candidate = result.songs[0].score;
    expect(candidate).toBeDefined();
    if (!candidate) {
        throw new Error('A supported chart must provide its entire semantic score.');
    }
    return candidate;
}

describe('iReal integration contracts: source to the performed order', () => {
    it('plays the sanitized modern blues without transposing or expanding its written repeats', () => {
        // This is the checked-in sanitized derivative, never the private original HTML.
        const fixture = JSON.parse(
            readFileSync(
                new URL('../../../docs/design/fixtures/ensemble-v2-charts.json', import.meta.url),
                'utf8',
            ),
        ) as { realExport: { sanitizedUrl: string } };
        const result = parseIRealImport(fixture.realExport.sanitizedUrl);
        expect(result.songs[0].metadata).toMatchObject({ key: 'C', transpose: '10', tempo: '0' });
        const candidate = importedScore(fixture.realExport.sanitizedUrl);
        const written = candidate.sections.flatMap((section) => section.measures);
        expect(written).toHaveLength(12);
        expect(written.map((measure) => measure.content.kind)).toEqual([
            'events',
            'events',
            'events',
            'repeat',
            'events',
            'repeat',
            'events',
            'repeat',
            'events',
            'events',
            'events',
            'events',
        ]);
        const order = performed(candidate);
        expect(order.symbols).toEqual([
            ['C7'],
            ['F7'],
            ['C7'],
            ['C7'],
            ['F7'],
            ['F7'],
            ['C7'],
            ['C7'],
            ['G7'],
            ['F7'],
            ['C7'],
            ['G7'],
        ]);
        expect(order.ids).toEqual(written.map((measure) => measure.id));
    });

    it('retains explicit 2+1+1 cell spacing through imported score and actual chord timing', () => {
        // Original four-cell bar: C, an empty continuation cell, Dm, G7.
        const candidate = importedScore(openProtocol('T44[C ,Dm,G7|F   Z'));
        const order = performed(candidate);
        expect(order.symbols).toEqual([['C', 'Dm', 'G7'], ['F']]);
        // Quarter notes: the 2+1+1 split of the first bar, then a whole-bar F.
        expect(
            order.events.map((events) =>
                events.map((event) => (event.kind === 'chord' ? event.duration : null)),
            ),
        ).toEqual([
            [
                [2, 1],
                [1, 1],
                [1, 1],
            ],
            [[4, 1]],
        ]);
    });

    it('carries a plain D.C. al Fine import through navigation', () => {
        // Original three-bar exercise: play C, Dm, G7; return to C and stop after Dm.
        const candidate = importedScore(openProtocol('T44[C   |Dm   <Fine>|G7   <D.C. al Fine>Z'));
        expect(performed(candidate).symbols).toEqual([['C'], ['Dm'], ['G7'], ['C'], ['Dm']]);
        expect(candidate.sections.flatMap((section) => section.measures)).toHaveLength(3);
    });

    it.each([
        ['unsupported chord', 'T44[C   |Cnotachord   |G7   Z'],
        ['empty interior measure', 'T44[C   |   |G7   Z'],
        // "C,Dm,G7" (3 chords, no spacing) used to be refused here as "unroundable harmonic
        // thirds" under the old proportional-width duration formula; #1453's cited round-robin
        // replacement (infojunkie/ireal-musicxml converter.js's `adjustChordsDuration()`) pads it
        // to a clean [2,1,1] quarter-note split instead — see ireal-import.test.ts's "rounds a
        // 4/4 bar's under-filled cells" test. Five chords genuinely exceed 4/4's 4 beats, though,
        // so that case still belongs in this refusal list.
        ['more chords than the meter has beats for', 'T44[C,Dm,Em,F,G7Z'],
        ['unknown staff instruction', 'T44[C   |!   |G7   Z'],
    ])('does not adopt a partial playable chart after %s', (_label, body) => {
        const source = openProtocol(body);
        const result = parseIRealImport(source);
        expect(result.source).toBe(source);
        expect(result.songs.every((song) => song.score === undefined)).toBe(true);
        expect([
            ...result.diagnostics,
            ...result.songs.flatMap((song) => song.diagnostics),
        ]).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error' })]));
    });

    it.each(['irealbook://Bad%ZZ', 'javascript:alert(1)', '<html>No chart here</html>'])(
        'retains malformed input without creating a playable substitute: %s',
        (source) => {
            const result = parseIRealImport(source);
            expect(result.source).toBe(source);
            expect(result.songs.every((song) => song.score === undefined)).toBe(true);
            expect(result.diagnostics).toEqual(
                expect.arrayContaining([expect.objectContaining({ severity: 'error' })]),
            );
        },
    );
});

describe('iReal navigation integration contracts: performed order is never grouped by section', () => {
    it('plays D.C. al Fine across sections, back through the first section', () => {
        const candidate = score([
            bar('a1', 'C'),
            bar('a2', 'I', { meter: '3/4', key: 'D', end: [{ kind: 'fine', label: 'finish' }] }),
        ]);
        candidate.sections.push({
            id: 'b',
            label: 'B',
            repeat: 1,
            key: 'E',
            measures: [
                bar('b1', 'I'),
                bar('b2', 'Am', {
                    end: [
                        {
                            kind: 'jump',
                            from: 'start',
                            destination: { kind: 'fine', label: 'finish' },
                            repeats: 'skip',
                        },
                    ],
                }),
            ],
        });
        const order = performed(candidate);
        expect(order.ids).toEqual(['a1', 'a2', 'b1', 'b2', 'a1', 'a2']);
        expect(order.symbols).toEqual([['C'], ['I'], ['I'], ['Am'], ['C'], ['I']]);
    });

    it('activates To Coda only after D.S. and revisits the original written bars', () => {
        const candidate = score([
            bar('a1', 'C'),
            bar('a2', 'Dm', { start: [{ kind: 'segno', label: 'return' }] }),
            bar('a3', 'E7', { end: [{ kind: 'coda', label: 'departure' }] }),
        ]);
        candidate.sections.push({
            id: 'b',
            label: 'B',
            repeat: 1,
            measures: [
                bar('b1', 'F'),
                bar('b2', 'G', {
                    end: [
                        {
                            kind: 'jump',
                            from: 'segno',
                            segno: 'return',
                            destination: { kind: 'coda', via: 'departure', target: 'arrival' },
                            repeats: 'skip',
                        },
                    ],
                }),
            ],
        });
        candidate.sections.push({
            id: 'c',
            label: 'Coda',
            repeat: 1,
            measures: [
                bar('c1', 'Am', { start: [{ kind: 'coda', label: 'arrival' }] }),
                bar('c2', 'G7'),
            ],
        });
        const order = performed(candidate);
        expect(order.ids).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'a2', 'a3', 'c1', 'c2']);
        expect(order.symbols.flat()).toEqual(['C', 'Dm', 'E7', 'F', 'G', 'Dm', 'E7', 'Am', 'G7']);
    });

    it('resolves chained one/two-bar repeats while preserving each destination identity', () => {
        const candidate = score([
            bar('a1', 'I:2 V:1 IV:1'),
            bar('a2', 'Am'),
            {
                id: 'a3',
                content: { kind: 'repeat', measureId: 'a1', display: 'two-bar-start' },
            },
            { id: 'a4', content: { kind: 'repeat', measureId: 'a2', display: 'two-bar-end' } },
            { id: 'a5', content: { kind: 'repeat', measureId: 'a3', display: 'one-bar' } },
        ]);
        const order = performed(candidate);
        expect(order.ids).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
        // Every repeat resolves to its destination's events, however long the chain.
        const oneTwoFour = [
            { kind: 'chord', symbol: 'I', duration: [2, 1] },
            { kind: 'chord', symbol: 'V', duration: [1, 1] },
            { kind: 'chord', symbol: 'IV', duration: [1, 1] },
        ];
        const am = [{ kind: 'chord', symbol: 'Am', duration: [4, 1] }];
        expect(order.events).toEqual([oneTwoFour, am, oneTwoFour, am, oneTwoFour]);
        expect(candidate.sections[0].measures[2].content).toEqual({
            kind: 'repeat',
            measureId: 'a1',
            display: 'two-bar-start',
        });
    });

    it.each([{ key: 'D' }, { isMinor: true }, { grouping: [3, 1] }])(
        'rejects a measure-repeat context change instead of silently reinterpreting music: %j',
        (context) => {
            const candidate = score([
                bar('a1', 'I:2 V:1 IV:1'),
                {
                    id: 'a2',
                    ...context,
                    content: { kind: 'repeat', measureId: 'a1', display: 'one-bar' },
                },
            ]);
            const untouched = structuredClone(candidate);
            expect(() => resolveScoreMeasureEvents(candidate)).toThrow();
            expect(candidate).toEqual(untouched);
        },
    );

    it('rejects an unreachable navigation goal', () => {
        const invalid = score([
            bar('intro', 'C', { end: [{ kind: 'fine', label: 'before-segno' }] }),
            bar('return', 'Dm', { start: [{ kind: 'segno', label: 'segno' }] }),
            bar('jump', 'G7', {
                end: [
                    {
                        kind: 'jump',
                        from: 'segno',
                        segno: 'segno',
                        destination: { kind: 'fine', label: 'before-segno' },
                        repeats: 'skip',
                    },
                ],
            }),
        ]);
        expect(() => compileScoreForm(invalid)).toThrow();
    });
});
