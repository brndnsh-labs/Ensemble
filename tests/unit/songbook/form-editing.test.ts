import { describe, expect, it } from 'vitest';
import {
    applyMeasureForm,
    type FormDraft,
    readMeasureForm,
} from '../../../prototypes/v2/lib/form-editing.js';
import type { ScoreDirection, ScoreMeasure } from '../../../public/songbook/score-types.js';

const emptyDraft: FormDraft = {
    repeatStart: false,
    repeatTimes: '',
    endingPasses: '',
    endingEnd: false,
};

function measure(overrides: Partial<ScoreMeasure> = {}): ScoreMeasure {
    return {
        id: 'bar-2',
        content: { kind: 'events', events: [{ kind: 'chord', symbol: 'Dm7', duration: [4, 1] }] },
        ...overrides,
    };
}

describe('repeat and ending draft controls', () => {
    it('reads an unmarked bar without inserting default form notation', () => {
        const source = measure();
        expect(readMeasureForm(source)).toEqual(emptyDraft);
        const result = applyMeasureForm(source, emptyDraft);
        expect(result).toEqual(source);
        expect(result).not.toBe(source);
        expect(result.content).not.toBe(source.content);
    });

    it('creates explicit start/end markers while retaining raw draft strings unchanged', () => {
        const source = measure();
        const original = structuredClone(source);
        const draft: FormDraft = {
            repeatStart: true,
            repeatTimes: ' 3 ',
            endingPasses: ' 1, 2 ',
            endingEnd: true,
        };
        const originalDraft = structuredClone(draft);
        expect(applyMeasureForm(source, draft)).toEqual({
            ...source,
            start: [{ kind: 'repeat-start' }, { kind: 'ending-start', passes: [1, 2] }],
            end: [{ kind: 'repeat-end', times: 3 }, { kind: 'ending-end' }],
        });
        expect(source).toEqual(original);
        expect(draft).toEqual(originalDraft);
    });

    it.each([1, 2, 64])('accepts %i total repeat passes without adding one', (times) => {
        const result = applyMeasureForm(measure(), { ...emptyDraft, repeatTimes: String(times) });
        expect(result.end).toEqual([{ kind: 'repeat-end', times }]);
    });

    it('preserves the ordering of explicit ending passes', () => {
        const source = measure({ start: [{ kind: 'ending-start', passes: [64, 1, 2] }] });
        const draft = readMeasureForm(source);
        expect(draft.endingPasses).toBe('64, 1, 2');
        expect(applyMeasureForm(source, draft)).toEqual(source);
    });

    it.each(['0', '65', '-2', '+2', '2.5', '2.0', '2e1', '0x2', '2x', '2,3', 'Infinity'])(
        'rejects malformed repeat count %j without repairing it',
        (repeatTimes) => {
            const source = measure({ end: [{ kind: 'repeat-end', times: 2 }] });
            const original = structuredClone(source);
            expect(() => applyMeasureForm(source, { ...emptyDraft, repeatTimes })).toThrow(
                /whole number from 1 to 64/,
            );
            expect(source).toEqual(original);
        },
    );

    it.each(['0', '65', '-1', '+1', '1.5', '1e1', '1x', '1 2', '1;2', ',1', '1,', '1,,2'])(
        'rejects malformed ending list %j without dropping tokens',
        (endingPasses) => {
            expect(() => applyMeasureForm(measure(), { ...emptyDraft, endingPasses })).toThrow(
                /whole number from 1 to 64/,
            );
        },
    );

    it.each(['1, 1', '2, 1, 2', '01, 1'])('rejects repeated pass numbers in %j', (endingPasses) => {
        expect(() => applyMeasureForm(measure(), { ...emptyDraft, endingPasses })).toThrow(
            /must be distinct/,
        );
    });

    it('removes only the requested form markers when controls are cleared', () => {
        const source = measure({
            start: [
                { kind: 'segno', label: 'verse' },
                { kind: 'repeat-start' },
                { kind: 'ending-start', passes: [1] },
            ],
            end: [
                { kind: 'repeat-end', times: 2 },
                { kind: 'ending-end' },
                { kind: 'fine', label: 'finish' },
            ],
        });
        const result = applyMeasureForm(source, {
            ...emptyDraft,
            repeatTimes: '  ',
            endingPasses: '\t',
        });
        expect(result.start).toEqual([{ kind: 'segno', label: 'verse' }]);
        expect(result.end).toEqual([{ kind: 'fine', label: 'finish' }]);
        expect(source.start).toHaveLength(3);
        expect(source.end).toHaveLength(3);
    });

    it('does not leave synthetic empty arrays after removing the last marker', () => {
        const source = measure({ start: [{ kind: 'repeat-start' }] });
        expect(applyMeasureForm(source, emptyDraft)).toEqual(measure());
    });

    it('roundtrips present empty arrays without rewriting the source representation', () => {
        const source = measure({ start: [], end: [] });
        expect(applyMeasureForm(source, readMeasureForm(source))).toEqual(source);
    });

    it.each(['start', 'end'] as const)(
        'preserves an existing ending-end at the %s boundary, or removes it explicitly',
        (boundary) => {
            const source = measure({ [boundary]: [{ kind: 'ending-end' }] });
            const draft = readMeasureForm(source);
            expect(draft.endingEnd).toBe(true);
            expect(applyMeasureForm(source, draft)).toEqual(source);
            expect(applyMeasureForm(source, { ...draft, endingEnd: false })).toEqual(measure());
        },
    );

    it('retains context, source-repeat identity, annotations and all unhandled navigation deeply', () => {
        const source = measure({
            key: 'F',
            isMinor: true,
            meter: '6/8',
            grouping: [3, 3],
            content: { kind: 'repeat', measureId: 'bar-1', display: 'one-bar' },
            annotations: [{ text: 'softly', at: [0, 1], placement: 'above' }],
            start: [
                { kind: 'segno', label: 'head' },
                { kind: 'repeat-start' },
                { kind: 'coda', label: 'tail' },
            ],
            end: [
                { kind: 'fine', label: 'finish' },
                { kind: 'repeat-end', times: 2 },
                {
                    kind: 'jump',
                    from: 'segno',
                    segno: 'head',
                    destination: { kind: 'coda', via: 'exit', target: 'tail' },
                    repeats: 'skip',
                },
            ],
        });
        const original = structuredClone(source);
        const unchanged = applyMeasureForm(source, readMeasureForm(source));
        expect(unchanged).toEqual(original);
        const result = applyMeasureForm(source, { ...readMeasureForm(source), repeatTimes: '3' });
        const expected = structuredClone(source);
        expected.end![1] = { kind: 'repeat-end', times: 3 };
        expect(result).toEqual(expected);
        expect(result.grouping).not.toBe(source.grouping);
        expect(result.annotations![0]).not.toBe(source.annotations![0]);
        expect(result.start![0]).not.toBe(source.start![0]);
        expect(result.end![2]).not.toBe(source.end![2]);
        expect(source).toEqual(original);
    });

    it('detaches event duration and alternate arrays as well as form markers', () => {
        const source = measure({
            content: {
                kind: 'events',
                events: [{ kind: 'chord', symbol: 'C', duration: [4, 1], alternates: ['Am'] }],
            },
        });
        const result = applyMeasureForm(source, emptyDraft);
        if (result.content.kind !== 'events' || source.content.kind !== 'events') {
            throw new Error('Expected event measures');
        }
        expect(result.content.events).not.toBe(source.content.events);
        expect(result.content.events[0].duration).not.toBe(source.content.events[0].duration);
        const resultChord = result.content.events[0];
        const sourceChord = source.content.events[0];
        if (resultChord.kind !== 'chord' || sourceChord.kind !== 'chord') {
            throw new Error('Expected chord events');
        }
        expect(resultChord.alternates).not.toBe(sourceChord.alternates);
        result.content.events[0].duration[0] = 2;
        resultChord.alternates!.push('F');
        expect(source.content.events[0].duration).toEqual([4, 1]);
        expect(sourceChord.alternates).toEqual(['Am']);
    });

    it.each<ScoreDirection>([
        { kind: 'repeat-start' },
        { kind: 'repeat-end', times: 2 },
        { kind: 'ending-start', passes: [1] },
        { kind: 'ending-end' },
    ])(
        'refuses duplicate $kind markers instead of treating the first as authoritative',
        (marker) => {
            const boundary = marker.kind === 'repeat-end' ? 'end' : 'start';
            const source = measure({ [boundary]: [marker, structuredClone(marker)] });
            const original = structuredClone(source);
            expect(() => readMeasureForm(source)).toThrow(/more than one/);
            expect(() => applyMeasureForm(source, emptyDraft)).toThrow(/more than one/);
            expect(source).toEqual(original);
        },
    );

    it('refuses ending-end at both boundaries rather than silently choosing one', () => {
        const source = measure({
            start: [{ kind: 'ending-end' }],
            end: [{ kind: 'ending-end' }],
        });
        expect(() => readMeasureForm(source)).toThrow(/more than one/);
    });

    it.each<[ScoreDirection, 'start' | 'end']>([
        [{ kind: 'repeat-start' }, 'end'],
        [{ kind: 'repeat-end', times: 2 }, 'start'],
        [{ kind: 'ending-start', passes: [1] }, 'end'],
    ])('refuses a misplaced %j marker at %s', (marker, boundary) => {
        const source = measure({ [boundary]: [marker] });
        expect(() => readMeasureForm(source)).toThrow(/unsupported boundary/);
        expect(() => applyMeasureForm(source, emptyDraft)).toThrow(/unsupported boundary/);
    });

    it.each<ScoreDirection>([
        { kind: 'repeat-end', times: 65 },
        { kind: 'ending-start', passes: [] },
        { kind: 'ending-start', passes: [1, 1] },
        { kind: 'ending-start', passes: [1, 2.5] },
    ])('refuses invalid existing $kind data rather than making a lossy draft', (marker) => {
        const boundary = marker.kind === 'repeat-end' ? 'end' : 'start';
        const source = measure({ [boundary]: [marker] });
        expect(() => readMeasureForm(source)).toThrow();
        expect(() => applyMeasureForm(source, emptyDraft)).toThrow();
    });
});
