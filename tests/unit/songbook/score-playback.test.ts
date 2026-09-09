import { describe, expect, it, vi } from 'vitest';
import { scoreDisplayIndices, scoreLeadSheet } from '../../../prototypes/v2/lib/lead-sheet.js';
import { GENRE_FEELS } from '../../../public/data/smart-genres.js';
import {
    registerScorePlaybackRenderer,
    validateProgression,
} from '../../../public/engine/chords-engine.js';
import { cloneStateForDetachedGeneration } from '../../../public/export/detached-generation-state.js';
import { getEffectiveMeterAtStep } from '../../../public/meter.js';
import { validateSemanticScore } from '../../../public/songbook/score-codec.js';
import {
    prepareScorePlayback,
    renderScorePlayback,
    scoreArrangement,
} from '../../../public/songbook/score-playback.js';
import { parseChordBar } from '../../../public/songbook/score-text.js';
import type { ScoreMeasure, SemanticScore } from '../../../public/songbook/score-types.js';
import { buildArrangerSyncPayload, getState } from '../../../public/state.js';
import { ACTIONS, type ArrangerState, type Chord, type Mutable } from '../../../public/types.js';

registerScorePlaybackRenderer(renderScorePlayback);

function bar(
    id: string,
    text: string,
    meter = '4/4',
    context: Partial<ScoreMeasure> = {},
): ScoreMeasure {
    const parsed = parseChordBar(text, meter);
    if (parsed.kind !== 'ok') {
        throw new Error(`Invalid test bar: ${text}`);
    }
    return { id, content: { kind: 'events', events: parsed.value }, ...context };
}

function scoreFixture(measures = [bar('a1', 'C:2 Dm:1 G7:1')]): SemanticScore {
    return {
        key: 'C',
        isMinor: false,
        notation: 'name',
        meter: '4/4',
        grouping: null,
        sections: [{ id: 'a', label: 'A', repeat: 1, measures }],
    };
}

function stateFixture(score: SemanticScore, feel = 'Jazz', bassEnabled = true) {
    const scorePlan = prepareScorePlayback(score);
    const arranger: Mutable<ArrangerState> = {
        ...scoreArrangement(score, scorePlan),
        scorePlan,
        valid: false,
        progression: [],
        stepMap: [],
        measureMap: [],
        sectionMap: [],
        totalSteps: 0,
        history: [],
        lastInteractedSectionId: 'a',
        mutatedSectionId: null,
        isDirty: false,
        seed: 'ABC123',
        randomizeSeed: false,
    };
    // The real parser/voicer receives local fixture state, not mocked musical helpers
    // or the global deep-signal slices. No browser, transport or audio graph is needed.
    return {
        arranger,
        playback: { bandIntensity: 0.6, practiceMode: false },
        chords: { density: 'rich' as const, octave: 60 },
        groove: { genreFeel: feel },
        bass: { enabled: bassEnabled },
    };
}

function offsets(entries: { start: number; end: number }[]) {
    return entries.map(({ start, end }) => [start, end]);
}

function fullStateFixture(score: SemanticScore) {
    const fixture = stateFixture(score);
    const baseline = cloneStateForDetachedGeneration(getState());
    return {
        ...baseline,
        arranger: fixture.arranger,
        playback: { ...baseline.playback, ...fixture.playback },
        chords: { ...baseline.chords, ...fixture.chords },
        bass: { ...baseline.bass, ...fixture.bass },
        groove: { ...baseline.groove, ...fixture.groove },
    };
}

function musicalChord(chord: Chord) {
    // Character offsets are specific to the editing surface; measure identity is
    // new provenance. Neither should change voicing, rhythm, spelling or section IDs.
    const { charStart: _start, charEnd: _end, measureId: _id, ...music } = chord;
    return music;
}

describe('semantic score playback: exact authored timing', () => {
    it('plays alternate endings with exact offsets and written context on every visit', () => {
        const score = scoreFixture([
            bar('a1', 'C:2 Dm:1 G7:1', '4/4', { start: [{ kind: 'repeat-start' }] }),
            bar('a2', 'F'),
            bar('a3', 'I', '3/4', {
                meter: '3/4',
                key: 'D',
                start: [{ kind: 'ending-start', passes: [1] }],
                end: [{ kind: 'repeat-end', times: 2 }],
            }),
            bar('a4', 'I', '6/8', {
                meter: '6/8',
                key: 'E',
                start: [{ kind: 'ending-start', passes: [2] }],
                end: [{ kind: 'ending-end' }],
            }),
            bar('a5', 'Am', '6/8'),
        ]);
        const original = structuredClone(score);
        const state = fullStateFixture(score);
        validateProgression(state);
        expect(state.arranger.progression.map((chord) => chord.absName)).toEqual([
            'C',
            'Dm',
            'G7',
            'F',
            'D',
            'C',
            'Dm',
            'G7',
            'F',
            'E',
            'Am',
        ]);
        expect(offsets(state.arranger.stepMap)).toEqual([
            [0, 8],
            [8, 12],
            [12, 16],
            [16, 32],
            [32, 44],
            [44, 52],
            [52, 56],
            [56, 60],
            [60, 76],
            [76, 88],
            [88, 100],
        ]);
        expect(state.arranger.progression.map((chord) => chord.key)).toEqual([
            'C',
            'C',
            'C',
            'C',
            'D',
            'C',
            'C',
            'C',
            'C',
            'E',
            'E',
        ]);
        expect(state.arranger.measureMap.map((measure) => measure.ts)).toEqual([
            '4/4',
            '4/4',
            '3/4',
            '4/4',
            '4/4',
            '6/8',
            '6/8',
        ]);
        expect(state.arranger.totalSteps).toBe(100);
        const blocks = scoreLeadSheet(state.arranger, score);
        expect(blocks[0].measures.map((measure) => measure.chords[0].measureId)).toEqual([
            'a1',
            'a2',
            'a3',
            'a4',
            'a5',
        ]);
        expect(scoreDisplayIndices(state.arranger)).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 9, 10]);
        const clone = cloneStateForDetachedGeneration(state);
        validateProgression(clone);
        expect(clone.arranger.stepMap).toEqual(state.arranger.stepMap);
        expect(buildArrangerSyncPayload(state.arranger).measureMap).toEqual(
            state.arranger.measureMap,
        );
        expect(score).toEqual(original);
    });

    it('keeps non-monotonic ending pass sets in written order, including a repeated one-bar section', () => {
        const score = scoreFixture([
            bar('a1', 'C', '4/4', { start: [{ kind: 'repeat-start' }] }),
            bar('a2', 'F', '4/4', {
                start: [{ kind: 'ending-start', passes: [2] }],
                end: [{ kind: 'repeat-end', times: 2 }],
            }),
            bar('a3', 'G', '4/4', {
                start: [{ kind: 'ending-start', passes: [1] }],
                end: [{ kind: 'ending-end' }],
            }),
        ]);
        score.sections.push({ id: 'b', label: 'B', repeat: 2, measures: [bar('b1', 'Am G')] });
        const state = fullStateFixture(score);
        validateProgression(state);
        expect(state.arranger.progression.map((chord) => chord.absName)).toEqual([
            'C',
            'G',
            'C',
            'F',
            'Am',
            'G',
            'Am',
            'G',
        ]);
        const blocks = scoreLeadSheet(state.arranger, score);
        expect(
            blocks.map((block) => block.measures.map((measure) => measure.chords[0].measureId)),
        ).toEqual([['a1', 'a2', 'a3'], ['b1']]);
        expect(scoreDisplayIndices(state.arranger)).toEqual([0, 1, 0, 3, 4, 5, 4, 5]);
        score.sections[1].seamless = true;
        const joined = scoreLeadSheet(state.arranger, score);
        expect(joined).toHaveLength(1);
        expect(joined[0].measures.at(-1)).toMatchObject({
            sectionId: 'b',
            sectionLabel: 'B',
            startsSection: true,
            isSeamlessStart: true,
        });
    });
    it('plays 2+1+1 as three chord events at 0, 8 and 12, ending exactly at 16', () => {
        const source = scoreFixture();
        const untouched = structuredClone(source);
        const state = stateFixture(source);
        const notify = vi.fn();
        validateProgression(state, notify);

        expect(offsets(state.arranger.stepMap)).toEqual([
            [0, 8],
            [8, 12],
            [12, 16],
        ]);
        expect(state.arranger.progression.map((chord) => chord.absName)).toEqual(['C', 'Dm', 'G7']);
        expect(state.arranger.progression.map((chord) => chord.beats)).toEqual([2, 1, 1]);
        expect(state.arranger.progression.map((chord) => chord.measureId)).toEqual([
            'a1',
            'a1',
            'a1',
        ]);
        expect(offsets(state.arranger.measureMap)).toEqual([[0, 16]]);
        expect(state.arranger.totalSteps).toBe(16);
        expect(notify).toHaveBeenCalledExactlyOnceWith(ACTIONS.PROG_VALIDATED);
        expect(source).toEqual(untouched);
    });

    it('uses denominator counts in 6/8 without changing their quarter-note duration', () => {
        const score = scoreFixture([bar('a1', 'Am:3 E7:3', '6/8')]);
        score.meter = '6/8';
        const state = stateFixture(score);
        validateProgression(state);

        expect(offsets(state.arranger.stepMap)).toEqual([
            [0, 6],
            [6, 12],
        ]);
        expect(state.arranger.progression.map((chord) => chord.beats)).toEqual([3, 3]);
        expect(state.arranger.totalSteps).toBe(12);
        expect(getEffectiveMeterAtStep(state.arranger, 6).stepInfo).toMatchObject({
            tsName: '6/8',
            mStep: 6,
            beatIndex: 3,
            groupIndex: 1,
            isGroupStart: true,
        });
    });

    it('preserves exact sixteenth lengths instead of re-equalizing events in a bar', () => {
        const state = stateFixture(scoreFixture([bar('a1', 'C:1/4 Dm:3/4 G7:3')]));
        validateProgression(state);
        expect(offsets(state.arranger.stepMap)).toEqual([
            [0, 1],
            [1, 4],
            [4, 16],
        ]);
        expect(state.arranger.progression.map((chord) => chord.beats)).toEqual([0.25, 0.75, 3]);
    });

    it('retains section repeats and stable written-bar identities in performed order', () => {
        const score = scoreFixture([bar('a1', 'C:2 Dm:1 G7:1'), bar('a2', 'C')]);
        score.sections[0].repeat = 2;
        score.sections.push({ id: 'b', label: 'B', repeat: 1, measures: [bar('b1', 'F G7')] });
        const state = stateFixture(score);
        validateProgression(state);

        expect(offsets(state.arranger.measureMap)).toEqual([
            [0, 16],
            [16, 32],
            [32, 48],
            [48, 64],
            [64, 80],
        ]);
        expect(state.arranger.sectionMap).toMatchObject([
            { id: 'a', start: 0, end: 64 },
            { id: 'b', start: 64, end: 80 },
        ]);
        expect(
            state.arranger.progression.map((chord) => [
                chord.measureId,
                chord.repeatIndex,
                chord.localIndex,
            ]),
        ).toEqual([
            ['a1', 0, 0],
            ['a1', 0, 1],
            ['a1', 0, 2],
            ['a2', 0, 3],
            ['a1', 1, 0],
            ['a1', 1, 1],
            ['a1', 1, 2],
            ['a2', 1, 3],
            ['b1', 0, 0],
            ['b1', 0, 1],
        ]);
        expect(state.arranger.totalSteps).toBe(80);
    });

    it('keeps measure key/meter changes sticky, resets at the next section, and repeats exactly', () => {
        const score = scoreFixture([
            bar('a1', 'I'),
            bar('a2', 'I V', '6/8', { key: 'G', isMinor: true, meter: '6/8', grouping: [2, 2, 2] }),
            bar('a3', 'I', '6/8'),
        ]);
        score.grouping = [1, 3];
        score.sections[0].repeat = 2;
        score.sections.push({ id: 'b', label: 'B', repeat: 1, measures: [bar('b1', 'I')] });
        const state = stateFixture(score);
        validateProgression(state);

        expect(offsets(state.arranger.measureMap)).toEqual([
            [0, 16],
            [16, 28],
            [28, 40],
            [40, 56],
            [56, 68],
            [68, 80],
            [80, 96],
        ]);
        expect(
            state.arranger.progression.map((chord) => [
                chord.key,
                chord.keyIsMinor,
                chord.rootMidi,
            ]),
        ).toEqual([
            ['C', false, 60],
            ['G', true, 67],
            ['G', true, 74],
            ['G', true, 67],
            ['C', false, 60],
            ['G', true, 67],
            ['G', true, 74],
            ['G', true, 67],
            ['C', false, 60],
        ]);
        expect(state.arranger.measureMap.map((measure) => measure.config?.grouping)).toEqual([
            [1, 3],
            [2, 2, 2],
            [2, 2, 2],
            [1, 3],
            [2, 2, 2],
            [2, 2, 2],
            [1, 3],
        ]);
    });

    it('shares exact timing/config through the worker snapshot and meter lookup on two laps', () => {
        const score = scoreFixture([
            bar('a1', 'C:2 Dm:1 G7:1'),
            bar('a2', 'Am:3 E7:3', '6/8', { meter: '6/8', grouping: [2, 2, 2] }),
            bar('a3', 'Am:3 E7:3', '6/8', { grouping: [3, 3] }),
        ]);
        const state = stateFixture(score);
        validateProgression(state);
        const wire = structuredClone(buildArrangerSyncPayload(state.arranger));

        expect(offsets(wire.stepMap)).toEqual([
            [0, 8],
            [8, 12],
            [12, 16],
            [16, 22],
            [22, 28],
            [28, 34],
            [34, 40],
        ]);
        expect(wire.measureMap.map((measure) => measure.config?.grouping)).toEqual([
            [2, 2],
            [2, 2, 2],
            [3, 3],
        ]);
        for (const lap of [0, 1]) {
            const secondBar = getEffectiveMeterAtStep(wire, lap * 40 + 20);
            expect(secondBar.chartStep).toBe(20);
            expect(secondBar.stepInfo).toMatchObject({
                tsName: '6/8',
                mStep: 4,
                groupIndex: 1,
                isGroupStart: true,
            });
            expect(secondBar.ts.grouping).toEqual([2, 2, 2]);
            const thirdBar = getEffectiveMeterAtStep(wire, lap * 40 + 32);
            expect(thirdBar.stepInfo).toMatchObject({
                tsName: '6/8',
                mStep: 4,
                groupIndex: 0,
                isGroupStart: false,
            });
            expect(thirdBar.ts.grouping).toEqual([3, 3]);
            const turnaround = getEffectiveMeterAtStep(wire, lap * 40 + 34);
            expect(turnaround.stepInfo).toMatchObject({
                mStep: 6,
                groupIndex: 1,
                isGroupStart: true,
            });
        }
    });

    it('rebuilds a detached render clone without flattening unequal timing or changing live state', () => {
        const state = fullStateFixture(scoreFixture());
        validateProgression(state);
        const live = structuredClone(state);
        const detached = cloneStateForDetachedGeneration(state);
        Object.assign(detached.arranger, {
            progression: [],
            stepMap: [],
            measureMap: [],
            sectionMap: [],
            totalSteps: 0,
        });
        validateProgression(detached);

        expect(detached.arranger).toEqual(live.arranger);
        expect(state).toEqual(live);
        expect(detached.arranger.stepMap).not.toBe(state.arranger.stepMap);
        expect(detached.arranger.progression).not.toBe(state.arranger.progression);
    });

    it('voices a chord-only stem for its actual absent bass without changing authored overrides', () => {
        const score = scoreFixture([bar('a1', 'Cmaj7')]);
        score.sections[0].instruments = { bass: true };
        const state = fullStateFixture(score);
        validateProgression(state);
        const original = structuredClone(state);
        const detached = cloneStateForDetachedGeneration(state);
        // Reproduce renderStemsToWav's sink masks after its production clone:
        // force bass off globally and per-section without rewriting the source plan.
        Object.assign(detached.bass, { enabled: false });
        for (const section of detached.arranger.sections) {
            section.instruments = { ...section.instruments, bass: false };
        }
        const legacy = cloneStateForDetachedGeneration(detached);
        Object.assign(legacy.arranger, { scorePlan: null });
        validateProgression(legacy);
        validateProgression(detached);

        expect(state.arranger.progression[0].intervals).not.toContain(0);
        expect(detached.arranger.progression[0].intervals).toContain(0);
        expect(detached.arranger.progression.map(musicalChord)).toEqual(
            legacy.arranger.progression.map(musicalChord),
        );
        expect(detached.arranger.scorePlan!.sections[0].section.instruments?.bass).toBe(true);
        expect(state).toEqual(original);
        expect(score.sections[0].instruments?.bass).toBe(true);
    });
});

describe('semantic score playback: capability and atomicity boundaries', () => {
    it('rejects equal thirds in 4/4 without rounding or changing the source', () => {
        const score = scoreFixture([bar('a1', 'C'), bar('a2', 'C Dm G7')]);
        const source = structuredClone(score);
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => prepareScorePlayback(score)).toThrow(/sixteenth|grid|round/i);
        expect(score).toEqual(source);
    });

    it.each(['N.C.', '/', 'C[Dm,G7]', 'C^7', 'C7b9#11'])(
        'rejects valid but not-yet-playable notation %s instead of substituting music',
        (text) => {
            const score = scoreFixture([bar('a1', text)]);
            const source = structuredClone(score);
            expect(validateSemanticScore(score).kind).toBe('ok');
            expect(() => prepareScorePlayback(score)).toThrow(/not.*supported|cannot be played/i);
            expect(score).toEqual(source);
        },
    );

    it('rejects a fermata rather than inventing its duration', () => {
        const score = scoreFixture([bar('a1', 'C')]);
        const content = score.sections[0].measures[0].content;
        if (content.kind !== 'events') {
            throw new Error('Expected event fixture');
        }
        content.events[0].fermata = true;
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => prepareScorePlayback(score)).toThrow(/fermata/i);
    });

    it('rejects incomplete repeats/endings and unsupported jumps without discarding markers', () => {
        const measures = [
            bar('a1', 'C', '4/4', { start: [{ kind: 'repeat-start' }] }),
            bar('a2', 'G7', '4/4', {
                start: [{ kind: 'ending-start', passes: [1] }],
                end: [{ kind: 'repeat-end', times: 2 }],
            }),
            bar('a3', 'C', '4/4', {
                start: [{ kind: 'ending-start', passes: [2] }],
                end: [
                    { kind: 'jump', from: 'start', repeats: 'skip', destination: { kind: 'end' } },
                ],
            }),
        ];
        // Each fragment is invalid form alone; supported markers do not excuse missing pairs.
        for (const measure of measures) {
            const score = scoreFixture([measure]);
            const source = structuredClone(score);
            expect(validateSemanticScore(score).kind).toBe('ok');
            expect(() => prepareScorePlayback(score)).toThrow(/repeat|ending|D\.C\./i);
            expect(score).toEqual(source);
        }
    });

    it('rejects a measure-repeat reference instead of treating it as an empty bar', () => {
        const score = scoreFixture([
            bar('a1', 'C'),
            { id: 'a2', content: { kind: 'repeat', measureId: 'a1', display: 'one-bar' } },
        ]);
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => prepareScorePlayback(score)).toThrow(/measure-repeat/i);
    });

    it('rejects an authored meter the engine cannot play instead of using 4/4', () => {
        const score = scoreFixture([bar('a1', 'C', '9/8')]);
        score.meter = '9/8';
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => prepareScorePlayback(score)).toThrow(/9\/8.*not supported/i);
    });

    it.each([
        { name: 'performed measures', barsAtLimit: 256, text: 'C' },
        { name: 'performed events', barsAtLimit: 64, text: Array(16).fill('C:1/4').join(' ') },
    ])(
        'bounds $name before expansion, including a valid boundary chart',
        ({ barsAtLimit, text }) => {
            const score = scoreFixture(
                Array.from({ length: barsAtLimit }, (_, index) => bar(`a${index}`, text)),
            );
            score.sections[0].repeat = 64;
            expect(() => prepareScorePlayback(score)).not.toThrow();
            score.sections[0].measures.push(bar('overflow', text));
            expect(validateSemanticScore(score).kind).toBe('ok');
            expect(() => prepareScorePlayback(score)).toThrow(/playback limit/i);
        },
    );

    it('does not replace any live maps or notify success if a later bar cannot render', () => {
        const state = stateFixture(scoreFixture([bar('a1', 'C'), bar('a2', 'Dm G7')]));
        validateProgression(state);
        const previous = {
            progression: state.arranger.progression,
            stepMap: state.arranger.stepMap,
            measureMap: state.arranger.measureMap,
            sectionMap: state.arranger.sectionMap,
            totalSteps: state.arranger.totalSteps,
        };
        const plan = structuredClone(state.arranger.scorePlan);
        if (!plan) {
            throw new Error('Expected playback plan');
        }
        // Fault-inject the derived input after preparation. The first bar can render;
        // failure later must not publish its partial progression over the live one.
        plan.sections[0].measures[1].steps.pop();
        state.arranger.scorePlan = plan;
        const notify = vi.fn();
        expect(() => validateProgression(state, notify)).toThrow(/every written chord/i);
        for (const key of [
            'progression',
            'stepMap',
            'measureMap',
            'sectionMap',
            'totalSteps',
        ] as const) {
            expect(state.arranger[key]).toBe(previous[key]);
        }
        expect(notify).not.toHaveBeenCalled();
    });
});

describe('semantic score playback: legacy compatibility', () => {
    it.each(GENRE_FEELS)(
        'preserves on-grid voicings and rhythm for %s, including section bass overrides',
        (feel) => {
            const score = scoreFixture([
                bar('a1', 'Dm7 G7'),
                bar('a2', 'Cmaj7'),
                bar('a3', 'Fmaj7 Bm7b5 E7 Am7'),
            ]);
            score.sections[0].repeat = 2;
            score.sections[0].instruments = { bass: false };
            score.sections.push({
                id: 'b',
                label: 'Bridge',
                repeat: 2,
                key: 'D',
                isMinor: true,
                meter: '6/8',
                instruments: { bass: true },
                measures: [bar('b1', 'ii7 V7', '6/8'), bar('b2', 'i', '6/8')],
            });
            for (const bassEnabled of [false, true]) {
                const semantic = stateFixture(score, feel, bassEnabled);
                const legacy = structuredClone(semantic);
                delete legacy.arranger.scorePlan;
                validateProgression(legacy);
                validateProgression(semantic);

                expect(legacy.arranger.progression.length).toBeGreaterThan(0);
                expect(semantic.arranger.progression.map(musicalChord)).toEqual(
                    legacy.arranger.progression.map(musicalChord),
                );
                expect(offsets(semantic.arranger.stepMap)).toEqual(
                    offsets(legacy.arranger.stepMap),
                );
                expect(
                    semantic.arranger.measureMap.map(({ start, end, ts }) => ({ start, end, ts })),
                ).toEqual(legacy.arranger.measureMap);
                expect(offsets(semantic.arranger.sectionMap)).toEqual(
                    offsets(legacy.arranger.sectionMap),
                );
                expect(semantic.arranger.totalSteps).toBe(legacy.arranger.totalSteps);
            }
        },
    );

    it('still parses legacy section edits when no semantic plan is installed', () => {
        const state = stateFixture(scoreFixture([bar('a1', 'C G7')]));
        state.arranger.scorePlan = null;
        state.arranger.sections[0].value = 'F G7 | C';
        validateProgression(state);
        expect(state.arranger.progression.map((chord) => chord.absName)).toEqual(['F', 'G7', 'C']);
        expect(offsets(state.arranger.stepMap)).toEqual([
            [0, 8],
            [8, 16],
            [16, 32],
        ]);
        expect(state.arranger.totalSteps).toBe(32);
    });
});
