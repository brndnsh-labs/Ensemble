/**
 * Removing a bar or a section (#1373). What is pinned here is the one non-obvious rule — a bar
 * that WROTE a key/mode/meter/grouping change hands it to the next bar, so the music after it
 * keeps sounding as it did — and every refusal, which must change nothing.
 */
import { validateSemanticScore } from '@core/songbook/score-codec';
import type { ChartDocumentV2, ScoreMeasure, SemanticScore } from '@core/songbook/score-types';
import { describe, expect, it } from 'vitest';
import {
    composerOf,
    withBarAfter,
    withoutMeasure,
    withoutSection,
    withSectionAfter,
    withSectionDuplicated,
    withSectionSettings,
    withSpilledBars,
} from './documents';

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

describe('withSectionAfter (#1726)', () => {
    const chart = () =>
        song([
            section('a', [bar('a1', { key: 'F', isMinor: true })], { key: 'D' }),
            section('b', [bar('b1')]),
        ]);

    it('adds a section straight after the one named, with one bar of the song tonic', () => {
        const result = ok(withSectionAfter(chart(), 'a'));
        expect(validateSemanticScore(result.score).kind).toBe('ok');
        expect(result.score.sections.map((s) => s.id)).toEqual(['a', result.sectionId, 'b']);
        const added = result.score.sections[1];
        // The first letter no section has: A and B are taken.
        expect(added.label).toBe('C');
        expect(added.measures.map((m) => m.id)).toEqual([result.measureId]);
        // The song's key and meter, not the section's or a bar's before it.
        expect(added.measures[0].content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }],
        });
    });

    it('adds after the last section too', () => {
        const result = ok(withSectionAfter(chart(), 'b'));
        expect(result.score.sections.map((s) => s.id)).toEqual(['a', 'b', result.sectionId]);
    });

    it('names it with the first letter not already used, not by counting sections', () => {
        // A and C, two sections: counting would name a third "C" again.
        const source = song([section('a', [bar('a1')]), section('c', [bar('c1')])]);
        const result = ok(withSectionAfter(source, 'c'));
        expect(result.score.sections.map((s) => s.label)).toEqual(['A', 'C', 'B']);
    });

    it('refuses an unknown section, changing nothing', () => {
        const source = chart();
        const before = structuredClone(source);
        expect(withSectionAfter(source, 'nope').kind).toBe('blocked');
        expect(source).toEqual(before);
    });
});

describe('withBarAfter (#1725)', () => {
    const chart = () =>
        song([
            section('a', [bar('a1'), bar('a2', { key: 'F', isMinor: true }), bar('a3')]),
            section('b', [bar('b1')]),
        ]);
    const added = (score: SemanticScore, measureId: string) =>
        score.sections.flatMap((s) => s.measures).find((m) => m.id === measureId)!;

    it('inserts straight after the bar, in its section, and selects the new bar', () => {
        const result = ok(withBarAfter(chart(), 'a1'));
        expect(validateSemanticScore(result.score).kind).toBe('ok');
        expect(ids(result.score)).toEqual([['a1', result.measureId, 'a2', 'a3'], ['b1']]);
        expect(result.sectionId).toBe('a');
    });

    it('fills it with the tonic in force after the bar, and writes no key of its own', () => {
        const result = ok(withBarAfter(chart(), 'a2'));
        const inserted = added(result.score, result.measureId);
        expect(inserted.content).toEqual({
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'Fm', duration: [4, 1] }],
        });
        expect(inserted.key).toBeUndefined();
        expect(ids(result.score)[0]).toEqual(['a1', 'a2', result.measureId, 'a3']);
    });

    it('fills the meter in force there', () => {
        const source = song([section('a', [bar('a1', { meter: '3/4' }, 3), bar('a2', {}, 3)])]);
        const result = ok(withBarAfter(source, 'a2'));
        expect(validateSemanticScore(result.score).kind).toBe('ok');
        const content = added(result.score, result.measureId).content;
        expect(content.kind === 'events' && content.events[0].duration).toEqual([3, 1]);
    });

    describe('around repeats and endings', () => {
        // ||: r1 | e1 (1st ending, :||) | e2 (2nd ending) | after
        const form = () =>
            song([
                section('a', [
                    bar('r1', { start: [{ kind: 'repeat-start' }] }),
                    bar('e1', {
                        start: [{ kind: 'ending-start', passes: [1] }],
                        end: [{ kind: 'repeat-end', times: 2 }],
                    }),
                    bar('e2', { start: [{ kind: 'ending-start', passes: [2] }] }),
                    bar('after'),
                ]),
            ]);

        it('is a valid form to start from', () => {
            expect(validateSemanticScore(form()).kind).toBe('ok');
        });

        it('refuses after a bar that ends a repeat or an ending, changing nothing', () => {
            const source = form();
            const before = structuredClone(source);
            const result = withBarAfter(source, 'e1');
            expect(result.kind).toBe('blocked');
            expect(result.kind === 'blocked' && result.message).toMatch(/Repeat or ending…/);
            expect(source).toEqual(before);
        });

        it("after a section's last bar that closes a repeat, adds the bar outside it", () => {
            // ||: r1 | r2 :||, the section's last bar closing the repeat (#1726 review).
            const source = song([
                section('a', [
                    bar('r1', { start: [{ kind: 'repeat-start' }] }),
                    bar('r2', { end: [{ kind: 'repeat-end', times: 2 }] }),
                ]),
            ]);
            const result = ok(withBarAfter(source, 'r2'));
            expect(validateSemanticScore(result.score).kind).toBe('ok');
            expect(ids(result.score)).toEqual([['r1', 'r2', result.measureId]]);
            const added = result.score.sections[0].measures[2];
            expect(added.start).toBeUndefined();
            expect(added.end).toBeUndefined();
            // The repeat still closes on r2.
            expect(result.score.sections[0].measures[1].end).toEqual([
                { kind: 'repeat-end', times: 2 },
            ]);
        });

        it('lengthens the repeated body from inside it', () => {
            const result = ok(withBarAfter(form(), 'r1'));
            expect(ids(result.score)).toEqual([['r1', result.measureId, 'e1', 'e2', 'after']]);
        });
    });

    it('is refused for an unknown bar, and does not change its argument', () => {
        const source = chart();
        const before = structuredClone(source);
        expect(withBarAfter(source, 'nope').kind).toBe('blocked');
        withBarAfter(source, 'a3');
        expect(source).toEqual(before);
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

    it('silences a lane for one section and gives it back (#2021)', () => {
        const off = apply({ lane: 'bass', on: false });
        expect(off.instruments).toEqual({ bass: false });
        const both = withSectionSettings(
            song([section('b', [bar('b1')], { instruments: { bass: false } })]),
            'b',
            { lane: 'groove', on: false },
        );
        expect(both.kind === 'ok' && both.score.sections[0].instruments).toEqual({
            bass: false,
            groove: false,
        });
        const back = withSectionSettings(
            song([section('b', [bar('b1')], { instruments: { bass: false } })]),
            'b',
            { lane: 'bass', on: null },
        );
        expect(back.kind === 'ok' && back.score.sections[0]).not.toHaveProperty('instruments');
        expect(back.kind === 'ok' && validateSemanticScore(back.score).kind).toBe('ok');
    });

    it('writes and clears a section grouping (#1376)', () => {
        const fives = song([section('a', [bar('a1', {}, 5)], { meter: '5/4' })]);
        const set = withSectionSettings(fives, 'a', { grouping: [2, 3] });
        expect(set.kind === 'ok' && validateSemanticScore(set.score).kind).toBe('ok');
        expect(set.kind === 'ok' && set.score.sections[0].grouping).toEqual([2, 3]);
        const cleared =
            set.kind === 'ok' && withSectionSettings(set.score, 'a', { grouping: null });
        expect(cleared && cleared.kind === 'ok' && cleared.score.sections[0]).not.toHaveProperty(
            'grouping',
        );
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

describe('composerOf (#1440)', () => {
    it('reads a v2 document’s own metadata.composer', () => {
        const document = {
            schemaVersion: 2,
            metadata: { composer: 'Cole Porter' },
        } as ChartDocumentV2;
        expect(composerOf(document)).toBe('Cole Porter');
    });

    it('is empty for a v2 document with no composer recorded', () => {
        const document = { schemaVersion: 2 } as ChartDocumentV2;
        expect(composerOf(document)).toBe('');
    });
});

describe('withSpilledBars (#2006)', () => {
    const rest = (id: string): ScoreMeasure => ({
        id,
        content: { kind: 'events', events: [{ kind: 'no-chord', duration: [4, 1] }] },
    });
    const blank = (m: ScoreMeasure) => m.id.startsWith('r');
    const chart = () => song([section('a', [bar('a1'), rest('r2'), rest('r3'), bar('a4')])]);

    it('overwrites the blank bars after it first, then inserts new ones', () => {
        const result = withSpilledBars(chart(), 'a1', 3, blank);
        if (result.kind !== 'ok') {
            throw new Error(result.message);
        }
        expect(result.ids.slice(0, 2)).toEqual(['r2', 'r3']);
        expect(ids(result.score)[0]).toEqual(['a1', 'r2', 'r3', result.ids[2], 'a4']);
        expect(validateSemanticScore(result.score).kind).toBe('ok');
    });

    it('inserts after bars that are music, and past the section end', () => {
        const result = withSpilledBars(chart(), 'a4', 2, () => false);
        if (result.kind !== 'ok') {
            throw new Error(result.message);
        }
        expect(ids(result.score)[0]).toEqual(['a1', 'r2', 'r3', 'a4', ...result.ids]);
    });
});

describe('withSectionDuplicated (#2006)', () => {
    it('copies the section straight after itself under fresh ids, labelled by the next number', () => {
        const source = song([
            section('a', [bar('a1'), bar('a2')], { repeat: 2 }),
            section('b', [bar('b1')]),
        ]);
        const result = ok(withSectionDuplicated(source, 'a'));
        expect(result.score.sections.map((s) => s.label)).toEqual(['A', 'A2', 'B']);
        const copy = result.score.sections[1];
        expect(copy.repeat).toBe(2);
        expect(copy.id).not.toBe('a');
        expect(copy.measures.map((m) => m.id)).not.toContain('a1');
        expect(copy.measures).toHaveLength(2);
        expect(validateSemanticScore(result.score).kind).toBe('ok');
        // The next copy of a copy is the next number, not A22.
        const again = ok(withSectionDuplicated(result.score, copy.id));
        expect(again.score.sections.map((s) => s.label)).toEqual(['A', 'A2', 'A3', 'B']);
    });

    it('points a copied measure repeat at the copy’s own bar', () => {
        const repeat: ScoreMeasure = {
            id: 'a2',
            content: { kind: 'repeat', measureId: 'a1', display: 'one-bar' },
        };
        const result = ok(withSectionDuplicated(song([section('a', [bar('a1'), repeat])]), 'a'));
        const copy = result.score.sections[1].measures;
        expect(copy[1].content).toMatchObject({ kind: 'repeat', measureId: copy[0].id });
    });
});
