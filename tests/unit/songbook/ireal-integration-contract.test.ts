import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { scoreDisplayIndices, scoreLeadSheet } from '../../../prototypes/v2/lib/lead-sheet.js';
import {
    registerScorePlaybackRenderer,
    validateProgression,
} from '../../../public/engine/chords-engine.js';
import { cloneStateForDetachedGeneration } from '../../../public/export/detached-generation-state.js';
import { parseIRealImport } from '../../../public/songbook/ireal-import.js';
import {
    prepareScorePlayback,
    renderScorePlayback,
    scoreArrangement,
} from '../../../public/songbook/score-playback.js';
import { parseChordBar } from '../../../public/songbook/score-text.js';
import type { ScoreMeasure, SemanticScore } from '../../../public/songbook/score-types.js';
import { buildArrangerSyncPayload, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

registerScorePlaybackRenderer(renderScorePlayback);

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

function render(candidate: SemanticScore) {
    const untouched = structuredClone(candidate);
    const state = cloneStateForDetachedGeneration(getState());
    const scorePlan = prepareScorePlayback(candidate);
    state.arranger = { ...state.arranger, ...scoreArrangement(candidate, scorePlan), scorePlan };
    const notify = vi.fn();
    validateProgression(state, notify);
    expect(notify).toHaveBeenCalledExactlyOnceWith(ACTIONS.PROG_VALIDATED);
    expect(candidate).toEqual(untouched);
    return state;
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

describe('iReal integration contracts: source to the production playback adapter', () => {
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
        const state = render(candidate);
        expect(state.arranger.progression.map((chord) => chord.absName)).toEqual([
            'C7',
            'F7',
            'C7',
            'C7',
            'F7',
            'F7',
            'C7',
            'C7',
            'G7',
            'F7',
            'C7',
            'G7',
        ]);
        expect(state.arranger.progression.map((chord) => chord.measureId)).toEqual(
            written.map((measure) => measure.id),
        );
        expect(state.arranger.totalSteps).toBe(192);
        expect(
            scoreLeadSheet(state.arranger, candidate).flatMap((block) => block.measures),
        ).toHaveLength(12);
        expect(scoreDisplayIndices(state.arranger)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        const sync = buildArrangerSyncPayload(state.arranger);
        expect(sync.stepMap).toEqual(state.arranger.stepMap);
        expect(sync).not.toHaveProperty('scorePlan');
        expect(sync).not.toHaveProperty('score');
    });

    it('retains explicit 2+1+1 cell spacing through imported score and actual chord timing', () => {
        // Original four-cell bar: C, an empty continuation cell, Dm, G7.
        const candidate = importedScore(openProtocol('T44[C ,Dm,G7|F   Z'));
        const state = render(candidate);
        expect(state.arranger.progression.map((chord) => chord.absName)).toEqual([
            'C',
            'Dm',
            'G7',
            'F',
        ]);
        expect(state.arranger.stepMap.map(({ start, end }) => [start, end])).toEqual([
            [0, 8],
            [8, 12],
            [12, 16],
            [16, 32],
        ]);
        expect(state.arranger.measureMap.map(({ start, end, ts }) => [start, end, ts])).toEqual([
            [0, 16, '4/4'],
            [16, 32, '4/4'],
        ]);
        expect(state.arranger.totalSteps).toBe(32);
    });

    it('carries a plain D.C. al Fine import through navigation and compact written highlighting', () => {
        // Original three-bar exercise: play C, Dm, G7; return to C and stop after Dm.
        const candidate = importedScore(openProtocol('T44[C   |Dm   <Fine>|G7   <D.C. al Fine>Z'));
        const state = render(candidate);
        expect(state.arranger.progression.map((chord) => chord.absName)).toEqual([
            'C',
            'Dm',
            'G7',
            'C',
            'Dm',
        ]);
        expect(state.arranger.totalSteps).toBe(80);
        expect(candidate.sections.flatMap((section) => section.measures)).toHaveLength(3);
        expect(scoreDisplayIndices(state.arranger)).toEqual([0, 1, 2, 0, 1]);
        expect(
            scoreLeadSheet(state.arranger, candidate).flatMap((block) => block.measures),
        ).toHaveLength(3);
    });

    it.each([
        ['unsupported chord', 'T44[C   |Cnotachord   |G7   Z'],
        ['empty interior measure', 'T44[C   ||G7   Z'],
        ['unroundable harmonic thirds', 'T44[C,Dm,G7Z'],
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
    it('plays D.C. al Fine across sections with written meter/key restored on return', () => {
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
        const state = render(candidate);
        expect(state.arranger.progression.map((chord) => chord.measureId)).toEqual([
            'a1',
            'a2',
            'b1',
            'b2',
            'a1',
            'a2',
        ]);
        expect(state.arranger.progression.map((chord) => chord.absName)).toEqual([
            'C',
            'D',
            'E',
            'Am',
            'C',
            'D',
        ]);
        expect(state.arranger.stepMap.map(({ start, end }) => [start, end])).toEqual([
            [0, 16],
            [16, 28],
            [28, 44],
            [44, 60],
            [60, 76],
            [76, 88],
        ]);
        expect(state.arranger.sectionMap).toEqual([
            { id: 'a', label: 'A', start: 0, end: 28 },
            { id: 'b', label: 'B', start: 28, end: 60 },
            { id: 'a', label: 'A', start: 60, end: 88 },
        ]);
        expect(scoreDisplayIndices(state.arranger)).toEqual([0, 1, 2, 3, 0, 1]);
        expect(
            scoreLeadSheet(state.arranger, candidate).flatMap((block) =>
                block.measures.map((measure) => measure.chords[0].measureId),
            ),
        ).toEqual(['a1', 'a2', 'b1', 'b2']);
        expect(state.arranger.totalSteps).toBe(88);
    });

    it('activates To Coda only after D.S. and maps the second visit to the original written bars', () => {
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
        const state = render(candidate);
        expect(state.arranger.progression.map((chord) => chord.measureId)).toEqual([
            'a1',
            'a2',
            'a3',
            'b1',
            'b2',
            'a2',
            'a3',
            'c1',
            'c2',
        ]);
        expect(state.arranger.progression.map((chord) => chord.absName)).toEqual([
            'C',
            'Dm',
            'E7',
            'F',
            'G',
            'Dm',
            'E7',
            'Am',
            'G7',
        ]);
        expect(state.arranger.sectionMap).toEqual([
            { id: 'a', label: 'A', start: 0, end: 48 },
            { id: 'b', label: 'B', start: 48, end: 80 },
            { id: 'a', label: 'A', start: 80, end: 112 },
            { id: 'c', label: 'Coda', start: 112, end: 144 },
        ]);
        expect(scoreDisplayIndices(state.arranger)).toEqual([0, 1, 2, 3, 4, 1, 2, 7, 8]);
        expect(
            scoreLeadSheet(state.arranger, candidate).flatMap((block) => block.measures),
        ).toHaveLength(7);
        const detached = cloneStateForDetachedGeneration(state);
        validateProgression(detached);
        expect(detached.arranger.stepMap).toEqual(state.arranger.stepMap);
        expect(state.arranger.totalSteps).toBe(144);
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
        const state = render(candidate);
        expect(state.arranger.progression.map((chord) => chord.absName)).toEqual([
            'C',
            'G',
            'F',
            'Am',
            'C',
            'G',
            'F',
            'Am',
            'C',
            'G',
            'F',
        ]);
        expect(state.arranger.progression.map((chord) => chord.measureId)).toEqual([
            'a1',
            'a1',
            'a1',
            'a2',
            'a3',
            'a3',
            'a3',
            'a4',
            'a5',
            'a5',
            'a5',
        ]);
        expect(state.arranger.stepMap.map(({ start, end }) => [start, end])).toEqual([
            [0, 8],
            [8, 12],
            [12, 16],
            [16, 32],
            [32, 40],
            [40, 44],
            [44, 48],
            [48, 64],
            [64, 72],
            [72, 76],
            [76, 80],
        ]);
        expect(
            scoreLeadSheet(state.arranger, candidate).flatMap((block) => block.measures),
        ).toHaveLength(5);
        expect(scoreDisplayIndices(state.arranger)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
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
            expect(() => prepareScorePlayback(candidate)).toThrow();
            expect(candidate).toEqual(untouched);
        },
    );

    it('rejects an unreachable navigation goal before replacing prepared music', () => {
        const playable = score([bar('a1', 'C'), bar('a2', 'G7')]);
        const state = render(playable);
        const before = structuredClone(state.arranger);
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
        expect(() => prepareScorePlayback(invalid)).toThrow();
        expect(state.arranger).toEqual(before);
    });
});
