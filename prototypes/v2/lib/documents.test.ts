/**
 * Removing a bar or a section (#1373). What is pinned here is the one non-obvious rule — a bar
 * that WROTE a key/mode/meter/grouping change hands it to the next bar, so the music after it
 * keeps sounding as it did — and every refusal, which must change nothing.
 */
import { validateSemanticScore } from '@engine/songbook/score-codec';
import type { ScoreMeasure, SemanticScore } from '@engine/songbook/score-types';
import { describe, expect, it } from 'vitest';
import { withoutMeasure, withoutSection, withSectionSettings } from './documents';

const bar = (id: string, extra: Partial<ScoreMeasure> = {}, beats = 4): ScoreMeasure => ({
    id,
    content: { kind: 'events', events: [{ kind: 'chord', symbol: 'C', duration: [beats, 1] }] },
    ...extra,
});
const section = (id: string, measures: ScoreMeasure[], extra = {}) => ({
    id,
    label: id.toUpperCase(),
    repeat: 1,
    measures,
    ...extra,
});
const song = (sections: SemanticScore['sections']): SemanticScore => ({
    notation: 'name',
    key: 'C',
    isMinor: false,
    meter: '4/4',
    grouping: null,
    sections,
});
const ids = (score: SemanticScore) => score.sections.map((s) => s.measures.map((m) => m.id));
const ok = (result: ReturnType<typeof withoutMeasure>) => {
    if (result.kind !== 'ok') {
        throw new Error(`expected ok, got: ${result.message}`);
    }
    expect(validateSemanticScore(result.score).kind).toBe('ok');
    return result;
};

describe('withoutMeasure', () => {
    const chart = () =>
        song([
            section('a', [bar('a1'), bar('a2'), bar('a3')]),
            section('b', [bar('b1'), bar('b2')]),
        ]);

    it('removes a middle bar and selects the one before it', () => {
        const result = ok(withoutMeasure(chart(), 'a2'));
        expect(ids(result.score)).toEqual([
            ['a1', 'a3'],
            ['b1', 'b2'],
        ]);
        expect([result.measureId, result.sectionId]).toEqual(['a1', 'a']);
    });

    it('removes the first bar and selects the next one', () => {
        const result = ok(withoutMeasure(chart(), 'a1'));
        expect(ids(result.score)).toEqual([
            ['a2', 'a3'],
            ['b1', 'b2'],
        ]);
        expect(result.measureId).toBe('a2');
    });

    it('removes the last bar of a multi-section chart', () => {
        const result = ok(withoutMeasure(chart(), 'b2'));
        expect(ids(result.score)).toEqual([['a1', 'a2', 'a3'], ['b1']]);
        expect([result.measureId, result.sectionId]).toEqual(['b1', 'b']);
    });

    it("takes a section's only bar together with the section", () => {
        const source = song([section('a', [bar('a1')]), section('b', [bar('b1')])]);
        const result = ok(withoutMeasure(source, 'b1'));
        expect(ids(result.score)).toEqual([['a1']]);
        expect([result.measureId, result.sectionId]).toEqual(['a1', 'a']);
    });

    it('does not change its argument', () => {
        const source = chart();
        const before = structuredClone(source);
        withoutMeasure(source, 'a2');
        expect(source).toEqual(before);
    });

    describe('hands a written context change to the next bar', () => {
        it('key and mode', () => {
            const source = song([
                section('a', [bar('a1'), bar('a2', { key: 'A', isMinor: true }), bar('a3')]),
            ]);
            const result = ok(withoutMeasure(source, 'a2'));
            expect(result.score.sections[0].measures[1]).toMatchObject({
                id: 'a3',
                key: 'A',
                isMinor: true,
            });
        });

        it('meter with its grouping', () => {
            const source = song([
                section('a', [
                    bar('a1'),
                    bar('a2', { meter: '5/4', grouping: [3, 2] }, 5),
                    bar('a3', {}, 5),
                ]),
            ]);
            const result = ok(withoutMeasure(source, 'a2'));
            expect(result.score.sections[0].measures[1]).toMatchObject({
                id: 'a3',
                meter: '5/4',
                grouping: [3, 2],
            });
        });

        it('but never over a field the next bar wrote itself', () => {
            const source = song([
                section('a', [
                    bar('a1'),
                    bar('a2', { key: 'A', meter: '5/4', grouping: [3, 2] }, 5),
                    bar('a3', { key: 'E', meter: '5/4' }, 5),
                ]),
            ]);
            const result = ok(withoutMeasure(source, 'a2'));
            const next = result.score.sections[0].measures[1];
            expect(next.key).toBe('E');
            // a3 wrote its own meter, which resets grouping: a2's 3+2 was never a statement
            // about a3's bar, even though the two meters are spelled the same.
            expect(next.grouping).toBeUndefined();
        });

        it('not across a section boundary', () => {
            const source = song([
                section('a', [bar('a1'), bar('a2', { key: 'A' })]),
                section('b', [bar('b1')]),
            ]);
            const result = ok(withoutMeasure(source, 'a2'));
            expect(result.score.sections[1].measures[0].key).toBeUndefined();
        });
    });

    describe('refuses, changing nothing,', () => {
        it('the only bar of the chart', () => {
            const result = withoutMeasure(song([section('a', [bar('a1')])]), 'a1');
            expect(result).toEqual({
                kind: 'blocked',
                message: 'A chart needs at least one bar. Change its chords instead.',
            });
        });

        it('a bar another bar repeats', () => {
            const source = song([
                section('a', [
                    bar('a1'),
                    bar('a2'),
                    { id: 'a3', content: { kind: 'repeat', measureId: 'a2', display: 'one-bar' } },
                ]),
            ]);
            expect(withoutMeasure(source, 'a2')).toEqual({
                kind: 'blocked',
                message: 'A · bar 3 repeats this music. Change that bar first.',
            });
        });

        it('half of a two-bar repeat', () => {
            const source = song([
                section('a', [
                    bar('a1'),
                    bar('a2'),
                    {
                        id: 'a3',
                        content: { kind: 'repeat', measureId: 'a1', display: 'two-bar-start' },
                    },
                    {
                        id: 'a4',
                        content: { kind: 'repeat', measureId: 'a2', display: 'two-bar-end' },
                    },
                ]),
            ]);
            expect(withoutMeasure(source, 'a4')).toMatchObject({ kind: 'blocked' });
        });

        it('a bar carrying a repeat mark', () => {
            // Without the refusal this would still validate — the repeat-end would repeat from
            // the top of the section — which is exactly the silent change it prevents.
            const source = song([
                section('a', [
                    bar('a1'),
                    bar('a2', { start: [{ kind: 'repeat-start' }] }),
                    bar('a3', { end: [{ kind: 'repeat-end', times: 2 }] }),
                ]),
            ]);
            expect(withoutMeasure(source, 'a2')).toEqual({
                kind: 'blocked',
                message:
                    'This bar carries repeat or navigation marks. Remove them first, or remove the whole section.',
            });
        });
    });
});

describe('withoutSection', () => {
    const chart = () =>
        song([
            section('a', [bar('a1'), bar('a2')]),
            section('b', [
                bar('b1', { start: [{ kind: 'repeat-start' }] }),
                bar('b2', { end: [{ kind: 'repeat-end', times: 2 }] }),
            ]),
            section('c', [bar('c1')]),
        ]);

    it("removes a section with its own repeat and selects the previous section's last bar", () => {
        const result = ok(withoutSection(chart(), 'b'));
        expect(ids(result.score)).toEqual([['a1', 'a2'], ['c1']]);
        expect([result.measureId, result.sectionId]).toEqual(['a2', 'a']);
    });

    it("removes the first section and selects the next section's first bar", () => {
        const result = ok(withoutSection(chart(), 'a'));
        expect([result.measureId, result.sectionId]).toEqual(['b1', 'b']);
    });

    it('refuses the only section', () => {
        expect(withoutSection(song([section('a', [bar('a1')])]), 'a')).toEqual({
            kind: 'blocked',
            message: 'A chart needs at least one section. Change its bars instead.',
        });
    });

    it('refuses when a bar elsewhere repeats music inside it', () => {
        const source = song([
            section('a', [bar('a1')]),
            section('b', [
                { id: 'b1', content: { kind: 'repeat', measureId: 'a1', display: 'one-bar' } },
            ]),
        ]);
        expect(withoutSection(source, 'a')).toEqual({
            kind: 'blocked',
            message: 'B · bar 1 repeats this music. Change that bar first.',
        });
    });

    it('allows a repeat that lives inside the removed section', () => {
        const source = song([
            section('a', [
                bar('a1'),
                { id: 'a2', content: { kind: 'repeat', measureId: 'a1', display: 'one-bar' } },
            ]),
            section('b', [bar('b1')]),
        ]);
        expect(ok(withoutSection(source, 'a')).score.sections).toHaveLength(1);
    });
});

/** #1374 — one section-settings edit at a time; a refusal changes nothing. */
describe('withSectionSettings', () => {
    const chart = () =>
        song([section('a', [bar('a1')]), section('b', [bar('b1', { key: 'E' }), bar('b2')])]);
    const apply = (change: Parameters<typeof withSectionSettings>[2]) => {
        const result = withSectionSettings(chart(), 'b', change);
        if (result.kind !== 'ok') {
            throw new Error(result.message);
        }
        expect(validateSemanticScore(result.score).kind).toBe('ok');
        return result.score.sections[1];
    };

    it('names a section, trimmed', () => {
        expect(apply({ label: '  Bridge ' }).label).toBe('Bridge');
    });

    it('refuses an empty or over-long name', () => {
        for (const label of ['   ', 'x'.repeat(25)]) {
            expect(withSectionSettings(chart(), 'b', { label })).toMatchObject({
                kind: 'blocked',
            });
        }
        expect(apply({ label: 'x'.repeat(24) }).label).toHaveLength(24);
    });

    it('sets how many times it plays, 1 to 64', () => {
        expect(apply({ repeat: 2 }).repeat).toBe(2);
        expect(apply({ repeat: 64 }).repeat).toBe(64);
        for (const repeat of [0, 65, 1.5, Number.NaN]) {
            expect(withSectionSettings(chart(), 'b', { repeat })).toMatchObject({
                kind: 'blocked',
            });
        }
    });

    it('writes and clears key and mode overrides without touching a bar that wrote its own', () => {
        const keyed = apply({ key: 'A' });
        expect(keyed.key).toBe('A');
        expect(keyed.measures[0].key).toBe('E');
        expect(apply({ isMinor: true }).isMinor).toBe(true);
        const cleared = withSectionSettings(
            song([section('a', [bar('a1')], { key: 'A', isMinor: true })]),
            'a',
            { key: null },
        );
        expect(cleared.kind === 'ok' && cleared.score.sections[0]).toEqual(
            expect.not.objectContaining({ key: expect.anything() }),
        );
        expect(cleared.kind === 'ok' && cleared.score.sections[0].isMinor).toBe(true);
    });

    it('routes a meter change through the section re-fit', () => {
        const next = apply({ meter: '3/4' });
        expect(next.meter).toBe('3/4');
        expect(
            next.measures.map((m) => m.content.kind === 'events' && m.content.events[0].duration),
        ).toEqual([
            [3, 1],
            [3, 1],
        ]);
    });
});
