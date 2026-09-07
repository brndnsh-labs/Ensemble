import { describe, expect, it } from 'vitest';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resetHiddenGenerationMemory } from '../../public/engine/generation-run.js';
import { ExportProcessor } from '../../public/engine/midi-worker-logic.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import type { EnsembleState } from '../../public/types.js';
import { enterGenre } from '../utils/genre-entry.js';

async function scene(meter = '4/4', value = 'Dm9 | Dm9 | Dm9 | Dm9') {
    const detached = cloneStateForDetachedGeneration(await enterGenre('Neo-Soul', meter));
    const state = {
        ...detached,
        playback: { ...detached.playback, bpm: 96, bandIntensity: 0.55, autoIntensity: false },
        chords: { ...detached.chords, style: 'neo-soul-rhodes', enabled: true },
        arranger: { ...detached.arranger, seed: 'RHODES_SUPPORT_1163' },
        soloist: {
            ...detached.soloist,
            enabled: false,
            session: { ...detached.soloist.session },
        },
        harmony: { ...detached.harmony, enabled: false },
        bass: { ...detached.bass, enabled: true },
        groove: { ...detached.groove },
    };
    state.arranger.sections = [{ id: 'rhodes', label: 'Verse', value, timeSignature: meter }];
    validateProgression(state);
    state.groove.sectionSeedMap = { rhodes: 0.37 };
    state.soloist.session.seed = generateSessionSeed(
        state,
        state.arranger,
        state.soloist.style!,
        0.55,
        state.arranger.seed,
    );
    return state;
}

function capture(initial: EnsembleState, loops = 2) {
    const detached = cloneStateForDetachedGeneration(initial);
    const state = { ...detached, playback: { ...detached.playback } };
    resetHiddenGenerationMemory(state);
    const cursors = {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
    const carryover = { lastActiveSoloistMidi: 0, lastActiveSoloistStep: 0 };
    return Array.from({ length: state.arranger.totalSteps * loops }, (_, step) => {
        state.playback.currentLoopCount = Math.floor(step / state.arranger.totalSteps);
        const result = generateNotesForStep(
            state,
            step,
            cursors,
            {
                includeChords: true,
                includeBass: true,
                includeSoloist: true,
                includeHarmony: true,
                includeDrums: true,
                noLiveConductor: true,
            },
            carryover,
        );
        carryover.lastActiveSoloistMidi = result.coordination.lastActiveSoloistMidi;
        carryover.lastActiveSoloistStep = result.coordination.lastActiveSoloistStep;
        return {
            step,
            coordination: result.coordination,
            lead: result.notes.filter((n) => n.module === 'soloist' && (n.velocity ?? 0) > 0),
            notes: result.notes.filter(
                (n) =>
                    n.module === 'chords' &&
                    (n.midi ?? 0) > 0 &&
                    (n.velocity ?? 0) > 0 &&
                    n.muted !== true,
            ),
        };
    });
}

describe('Neo-Soul Rhodes: reserved upper-hand hook (#1163)', () => {
    it.each([
        { meter: '4/4', bar: 16, answer: 6, beat: 4 },
        { meter: '3/4', bar: 12, answer: 6, beat: 4 },
        { meter: '6/8', bar: 12, answer: 4, beat: 2 },
        { meter: '12/8', bar: 24, answer: 4, beat: 2 },
    ])(
        'states every $meter bar and answers only in bars one and three',
        async ({ meter, bar, answer, beat }) => {
            const state = await scene(meter);
            const trace = capture(state);
            // Authored positions, independent of the gesture planner's predicates.
            const expected = [0, answer, bar, bar * 2, bar * 2 + answer, bar * 3];
            for (let loop = 0; loop < 2; loop++) {
                const start = loop * bar * 4;
                const attacks = trace
                    .slice(start, start + bar * 4)
                    .filter((tick) => tick.notes.length);
                expect(attacks.map((tick) => tick.step - start)).toEqual(expected);
                for (const tick of attacks) {
                    const answering = (tick.step - start) % bar === answer;
                    if (answering) {
                        expect(tick.notes.length).toBeLessThanOrEqual(2);
                        expect(
                            tick.notes.every(
                                (n) =>
                                    n.chordPerformance?.player === 'neo-soul-rhodes' &&
                                    n.chordPerformance.hand === 'right',
                            ),
                        ).toBe(true);
                        expect(tick.notes.every((n) => n.durationSteps! <= beat * 0.5)).toBe(true);
                        const statement = trace[tick.step - answer];
                        const left = statement.notes.filter(
                            (n) =>
                                n.chordPerformance?.player === 'neo-soul-rhodes' &&
                                n.chordPerformance.hand === 'left',
                        );
                        expect(left.length).toBeGreaterThan(0);
                        expect(
                            left.some((n) => statement.step + n.durationSteps! > tick.step),
                        ).toBe(true);
                        expect(Math.min(...tick.notes.map((n) => n.midi!))).toBeGreaterThan(
                            Math.max(...left.map((n) => n.midi!)),
                        );
                    } else {
                        expect(tick.notes.length).toBeGreaterThanOrEqual(3);
                        const right = tick.notes.filter(
                            (n) =>
                                n.chordPerformance?.player === 'neo-soul-rhodes' &&
                                n.chordPerformance.hand === 'right',
                        );
                        expect(right.length).toBeGreaterThan(0);
                        expect(right.every((n) => n.durationSteps! <= beat * 1.5)).toBe(true);
                    }
                }
            }
            const hookPitches = (step: number) => trace[step].notes.map((n) => n.midi);
            expect(hookPitches(answer)).toEqual(hookPitches(bar * 2 + answer));
        },
    );

    it('states mid-bar written changes without adding another answer', async () => {
        const state = await scene('4/4', 'Dm9 G13 | Cmaj9 Am9 | Dm9 G13 | Cmaj9 Am9');
        const trace = capture(state, 1);
        expect(trace.filter((tick) => tick.notes.length).map((tick) => tick.step)).toEqual([
            0, 6, 8, 16, 24, 32, 38, 40, 48, 56,
        ]);
        for (const entry of state.arranger.stepMap) {
            expect(
                trace[entry.start].notes.length,
                `written arrival ${entry.start}`,
            ).toBeGreaterThanOrEqual(3);
            for (const tick of trace.slice(entry.start, entry.end)) {
                expect(tick.notes.every((n) => tick.step + n.durationSteps! <= entry.end)).toBe(
                    true,
                );
            }
        }
    });

    it('keeps the attack and two-key answer budget across energy, density, and taking over the lead', async () => {
        const state = await scene();
        for (const intensity of [0.2, 0.9]) {
            state.playback.bandIntensity = intensity;
            state.playback.complexity = intensity;
            for (const density of ['thin', 'standard', 'rich'] as const) {
                state.chords.density = density;
                const answerCounts: number[][] = [];
                for (const enabled of [true, false]) {
                    state.soloist.enabled = enabled;
                    const trace = capture(state, 1);
                    expect(trace.some((tick) => tick.lead.length > 0)).toBe(enabled);
                    expect(
                        trace.filter((tick) => tick.notes.length).map((tick) => tick.step),
                    ).toEqual([0, 6, 16, 32, 38, 48]);
                    for (const step of [6, 38]) {
                        expect(trace[step].notes.length).toBeGreaterThan(0);
                        expect(trace[step].notes.length).toBeLessThanOrEqual(2);
                    }
                    answerCounts.push([6, 38].map((step) => trace[step].notes.length));
                }
                expect(answerCounts[0]).toEqual(answerCounts[1]);
            }
        }
    });

    it('honors published intro/outro/subtraction rests and restores the final cadence', async () => {
        for (const label of ['Intro', 'Outro', 'Bridge']) {
            const state = await scene();
            state.arranger.sections[0].label = label;
            validateProgression(state);
            const trace = capture(state, 1);
            const steps = trace.filter((tick) => tick.notes.length).map((tick) => tick.step);
            if (label === 'Intro') {
                expect(trace[0].coordination.introBarsElapsed).toBe(0);
                expect(steps).toEqual([48]);
            } else if (label === 'Outro') {
                expect(trace[16].coordination.outroBarsRemaining).toBe(3);
                expect(steps).toEqual([0, 6]);
            } else {
                expect(trace[0].coordination.subtractionMutedLanes).toContain('chords');
                expect(steps).toEqual([]);
            }
            state.playback.songMode = true;
            state.playback.isEndingPending = true;
            const ending = capture(state, 1);
            expect(ending[48].coordination.isFinalMeasure).toBe(true);
            expect(ending[48].notes.length).toBeGreaterThanOrEqual(3);
            expect(ending.slice(49).every((tick) => tick.notes.length === 0)).toBe(true);
        }
    });

    it.each([
        ['Chorus', 'Outro'],
        ['Drop', 'Intro'],
    ])(
        'releases the fast %s voicing before the earlier %s pocket in generated notes and MIDI',
        async (from, to) => {
            const state = await scene();
            state.playback.bpm = 240;
            state.groove.humanize = 0;
            state.groove.swing = 0;
            state.arranger.sections = [
                { id: 'before', label: from, value: 'Dm9', timeSignature: '4/4' },
                {
                    id: 'after',
                    label: to,
                    value: to === 'Outro' ? 'G13 | G13 | G13 | G13' : 'G13',
                    timeSignature: '4/4',
                },
            ];
            // An Outro's first of four bars sounds normally. For the Intro case,
            // the final-cadence exception makes its first bar sound despite layering.
            // Both fixtures must actually attack on either side of the boundary.
            state.playback.songMode = to === 'Intro';
            state.playback.isEndingPending = to === 'Intro';
            validateProgression(state);
            const trace = capture(state, 1);
            const prior = trace[0].notes;
            const next = trace[16].notes;
            expect(prior.length).toBeGreaterThanOrEqual(3);
            expect(next.length).toBeGreaterThanOrEqual(3);
            const stepSeconds = 60 / 240 / 4;
            const boundary = 16 * stepSeconds;
            const nextOnset = boundary + Math.min(...next.map((n) => n.timingOffset!));
            const left = prior.filter(
                (n) =>
                    n.chordPerformance?.player === 'neo-soul-rhodes' &&
                    n.chordPerformance.hand === 'left',
            );
            expect(left.length).toBeGreaterThan(0);
            expect(left[0].timingOffset!).toBeGreaterThan(next[0].timingOffset!);
            for (const note of left) {
                const release = note.timingOffset! + note.durationSteps! * stepSeconds;
                expect(release).toBeLessThan(boundary);
                expect(release).toBeLessThan(nextOnset);
            }

            const processor = new ExportProcessor(cloneStateForDetachedGeneration(state), {
                includedTracks: ['chords', 'bass'],
                loopMode: 'time',
                targetDuration: 1,
            });
            try {
                processor.processStep(0);
                const releases = processor.chordTrack.events.filter(
                    (e) => (e.data[0] & 0xf0) === 0x80,
                );
                expect(releases.length).toBe(prior.length);
                expect(Math.max(...releases.map((e) => e.time))).toBeLessThan(16 * 120);
                for (let step = 1; step < 16; step++) {
                    processor.processStep(step);
                }
                const beforeArrival = processor.chordTrack.events.length;
                processor.processStep(16);
                const arrivals = processor.chordTrack.events
                    .slice(beforeArrival)
                    .filter((e) => (e.data[0] & 0xf0) === 0x90 && e.data[2] > 0);
                expect(arrivals.length).toBe(next.length);
                expect(Math.max(...releases.map((e) => e.time))).toBeLessThan(
                    Math.min(...arrivals.map((e) => e.time)),
                );
                for (const note of prior) {
                    expect(releases).toContainEqual({
                        time: Math.round(
                            (note.timingOffset! + note.durationSteps! * stepSeconds) * 240 * 8,
                        ),
                        data: [0x80 | (state.midi.chordsChannel - 1), note.midi!, 0],
                    });
                }
            } finally {
                processor.cleanup();
            }
        },
    );

    it.each(['4/4', '6/8'])(
        'exports the actual %s generated pitches, laid-back onsets, and hand releases',
        async (meter) => {
            const state = await scene(meter, 'Dm9 G13 | Cmaj9 Am9 | Dm9 G13 | Cmaj9 Am9');
            state.groove.humanize = 0;
            state.groove.swing = 0;
            const generated = capture(state, 1).flatMap((tick) => tick.notes);
            expect(generated.length).toBeGreaterThan(0);
            expect(generated.every((n) => n.timingOffset! > 0)).toBe(true);
            const processor = new ExportProcessor(cloneStateForDetachedGeneration(state), {
                includedTracks: ['chords', 'bass'],
                loopMode: 'time',
                targetDuration: 1,
            });
            try {
                for (let step = 0; step < state.arranger.totalSteps; step++) {
                    processor.processStep(step);
                }
                const events = processor.chordTrack.events;
                const actual = events
                    .filter((e) => [0x80, 0x90].includes(e.data[0] & 0xf0))
                    .map((e) => ({
                        time: e.time,
                        kind: e.data[0] & 0xf0,
                        midi: e.data[1],
                    }));
                // With humanize/swing off: 480 MIDI ticks per quarter, 120 per step.
                // Note offsets remain the generated player's own laid-back placement.
                const expected = generated.flatMap((n) => {
                    const start = n.step * 120 + n.timingOffset! * state.playback.bpm * 8;
                    return [
                        { time: Math.round(start), kind: 0x90, midi: n.midi },
                        {
                            time: Math.round(start + n.durationSteps! * 120),
                            kind: 0x80,
                            midi: n.midi,
                        },
                    ];
                });
                const sort = (a: { time: number; midi?: number; kind: number }, b: typeof a) =>
                    a.time - b.time || a.midi! - b.midi! || a.kind - b.kind;
                expect(actual.sort(sort)).toEqual(expected.sort(sort));
            } finally {
                processor.cleanup();
            }
        },
    );
});
