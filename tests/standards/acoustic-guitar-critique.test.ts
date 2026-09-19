import { afterEach, describe, expect, it, vi } from 'vitest';
import { chordFacts } from '../../public/engine/chord-facts.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resetHiddenGenerationMemory } from '../../public/engine/generation-run.js';
import { chooseGuitarShape } from '../../public/engine/guitar-player.js';
import { foldPracticeStep } from '../../public/engine/section-overrides.js';
import { generateNotesForStep, type NoteResult } from '../../public/engine/tick-logic.js';
import { getChordAtStep } from '../../public/engine/worker-utils.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { bootstrapEnsembleAudit } from '../../scripts/ensemble-analysis-utils.js';

afterEach(() => vi.restoreAllMocks());

async function scene(meter = '4/4', value = 'C | G | Am | F') {
    const boot = await bootstrapEnsembleAudit({
        genre: 'Acoustic',
        bpm: 108,
        intensity: 0.5,
        timeSignature: meter,
        seed: 'CHORDS_3',
        chordStyle: 'acoustic-strum',
        bassStyle: undefined,
        drumPreset: undefined,
        harmonyStyle: undefined,
        soloistStyle: undefined,
    });
    const detached = cloneStateForDetachedGeneration(boot.state);
    const state = {
        ...detached,
        arranger: { ...detached.arranger },
        chords: { ...detached.chords },
        playback: { ...detached.playback },
        soloist: { ...detached.soloist },
        bass: { ...detached.bass },
        harmony: { ...detached.harmony },
        groove: { ...detached.groove },
    };
    state.arranger.sections = [
        { id: 'guitar', label: 'Verse', value, key: 'C', timeSignature: meter },
    ];
    state.chords.style = 'acoustic-strum';
    state.soloist.enabled = false;
    state.bass.enabled = false;
    state.harmony.enabled = false;
    state.groove.enabled = false;
    validateProgression(state);
    return state;
}

function guitarPerformance(note: NoteResult) {
    if (note.chordPerformance?.player !== 'acoustic-guitar') {
        throw new Error('Expected authored guitar articulation');
    }
    return note.chordPerformance;
}

function capture(
    initial: Awaited<ReturnType<typeof scene>>,
    random: number,
    start = 0,
    detach = true,
) {
    const state = detach ? cloneStateForDetachedGeneration(initial) : initial;
    resetHiddenGenerationMemory(state);
    const rng = vi.spyOn(Math, 'random').mockReturnValue(random);
    const cursors = {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
    const chordCursor = { index: 0, sectionIndex: 0 };
    const events = [];
    try {
        for (let step = start; step < state.arranger.totalSteps * 3; step++) {
            // Mirror worker-buffer-manager: generate at musical position, retain
            // the monotonic step only as the returned playback buffer key.
            const musicalStep = foldPracticeStep(step, state.playback);
            const data = getChordAtStep(musicalStep, state.arranger, chordCursor);
            const result = generateNotesForStep(
                state,
                musicalStep,
                cursors,
                {
                    includeChords: true,
                    includeBass: false,
                    includeSoloist: false,
                    includeHarmony: false,
                    includeDrums: false,
                    noLiveConductor: true,
                },
                null,
            );
            const notes = result.notes
                .filter((n) => n.module === 'chords')
                .map((n) => ({ ...n, step }));
            for (const n of notes) {
                expect(Number.isFinite(n.midi)).toBe(true);
                expect(Number.isFinite(n.velocity)).toBe(true);
                expect(Number.isFinite(n.durationSteps)).toBe(true);
                expect(Number.isFinite(n.timingOffset)).toBe(true);
                expect(n.durationSteps).toBeGreaterThan(0);
                expect(n.velocity).toBeGreaterThan(0);
                expect(n.midi).toBeGreaterThanOrEqual(52);
                expect(n.midi).toBeLessThanOrEqual(79);
                expect(n.chordPerformance).toBeDefined();
                // The production register pass must preserve the assigned string.
                const p = guitarPerformance(n);
                expect(n.midi).toBe([40, 45, 50, 55, 59, 64][p.string] + p.fret);
            }
            if (data?.stepInChord === 0) {
                expect(notes.length, `silent arrival at ${step}`).toBeGreaterThanOrEqual(3);
            }
            events.push({ step, notes });
        }
        return events;
    } finally {
        rng.mockRestore();
    }
}

describe('Acoustic guitar: playable harmony and dependable phrasing (#1150)', () => {
    it('keeps the same preceding-chord voicing context across worker/export cloning', async () => {
        const state = await scene();
        expect(state.arranger.stepMap[1].chord).toBe(state.arranger.progression[1]);
        const detached = cloneStateForDetachedGeneration(state);
        expect(detached.arranger.stepMap[1].chord).not.toBe(detached.arranger.progression[1]);
        expect(capture(state, 0.05)).toEqual(capture(state, 0.05, 0, false));
        // The same chart position must retain its context when a practice window wraps.
        const normal = capture(state, 0.05);
        state.playback.loopStartStep = 16;
        state.playback.loopEndStep = 48;
        const normalize = (notes: NoteResult[]) => notes.map((n) => ({ ...n, step: 0 }));
        for (const event of capture(state, 0.05, 16)) {
            expect(normalize(event.notes)).toEqual(
                normalize(normal[16 + ((event.step - 16) % 32)].notes),
            );
        }
    });
    it('preserves chart quality independently of rootless/colored keyboard intervals', async () => {
        const state = await scene('4/4', 'C | Am7 | G7b9 | C/E | Dsus4 | Bm7b5 | E7alt | Fmaj7');
        for (const chord of state.arranger.progression) {
            const facts = chordFacts(chord);
            chord.intervals = [1, 6, 11];
            expect(chordFacts(chord)).toEqual(facts);
            for (const bass of [true, false]) {
                const shape = chooseGuitarShape(facts, bass);
                const pcs = new Set(shape.map((n) => n.midi % 12));
                for (const pc of facts.defining) {
                    expect(pcs.has(pc), `${chord.absName} missing ${pc}`).toBe(true);
                }
                if (!bass) {
                    expect(Math.min(...shape.map((n) => n.midi)) % 12, chord.absName).toBe(
                        facts.bass,
                    );
                }
            }
        }
    });

    it('finds bounded shapes in every key for common, extended and altered qualities', () => {
        for (let rootMidi = 60; rootMidi < 72; rootMidi++) {
            for (const quality of [
                'major',
                'minor',
                '7',
                'maj7',
                'sus2',
                'sus4',
                'halfdim',
                'dim',
                'aug',
                '9',
                'm9',
                '13',
                '7b9',
                '7#9',
                '7alt',
                '7sus4',
                'augmaj7',
                'add2',
                'add9',
                '6',
                'm6',
                '6/9',
                'maj9',
                '11',
                'maj11',
                'm11',
                'maj13',
                'm13',
                'maj7#11',
                '7#11',
                '7b13',
                '7b5',
                // #1336/#1329 — the two qualities with no perfect fifth at all. A quality
                // missing from `chord-facts.ts`'s table falls back to MAJOR, which hands the
                // guitar voicer a natural 5 and (for m#5) a major 3rd; the natural-5 assertion
                // below is what catches that, not the bounded-shape check.
                'm#5',
                'maj7b5',
                '5',
            ]) {
                const facts = chordFacts({ rootMidi, quality, bassMidi: null, is7th: false });
                const noPerfectFifth = quality === 'm#5' || quality === 'maj7b5';
                if (noPerfectFifth) {
                    expect(facts.tones, `${quality} tones sound a natural 5`).not.toContain(
                        (rootMidi + 7) % 12,
                    );
                    expect(facts.tones, `${quality} lost its altered 5`).toContain(
                        (rootMidi + (quality === 'm#5' ? 8 : 6)) % 12,
                    );
                    expect(facts.tones, `${quality} wrong third`).toContain(
                        (rootMidi + (quality === 'm#5' ? 3 : 4)) % 12,
                    );
                }
                const shape = chooseGuitarShape(facts, false);
                if (noPerfectFifth) {
                    expect(
                        shape.map((n) => n.midi % 12),
                        `${quality} guitar shape sounds a natural 5`,
                    ).not.toContain((rootMidi + 7) % 12);
                }
                expect(shape.length).toBeGreaterThanOrEqual(3);
                expect(shape.length).toBeLessThanOrEqual(6);
                const frets = shape.filter((n) => n.fret > 0).map((n) => n.fret);
                if (frets.length) {
                    expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(3);
                }
                for (const pc of facts.defining) {
                    expect(
                        shape.some((n) => n.midi % 12 === pc),
                        `${rootMidi} ${quality} missing ${pc}`,
                    ).toBe(true);
                }
            }
        }
    });

    it.each(['4/4', '3/4', '6/8', '7/8'])(
        'keeps pulse and chord arrivals across three %s loops with the other players off',
        async (meter) => {
            const state = await scene(meter);
            const events = capture(state, 0.05);
            const attacks = events.filter((e) => e.notes.length);
            for (const { notes } of attacks) {
                // A previous keyboard style must not pedal through a guitar stroke.
                expect(notes.flatMap((n) => n.ccEvents || [])).toEqual([
                    { controller: 64, value: 0, timingOffset: 0 },
                ]);
            }
            const up = attacks.filter((e) => guitarPerformance(e.notes[0]).stroke === 'up');
            const down = attacks.filter((e) => guitarPerformance(e.notes[0]).stroke === 'down');
            expect(up.length).toBeGreaterThan(0);
            expect(down.length).toBeGreaterThan(up.length - 1);
            for (const e of up) {
                expect(e.notes.length).toBe(3);
                // String order, not sorted pitch: an open high E can sound below
                // a fretted B string in a legitimate guitar shape.
                expect(guitarPerformance(e.notes[0]).string).toBeGreaterThan(
                    guitarPerformance(e.notes.at(-1)!).string,
                );
            }
            for (const e of down) {
                expect(guitarPerformance(e.notes[0]).string).toBeLessThan(
                    guitarPerformance(e.notes.at(-1)!).string,
                );
            }
            expect(capture(state, 0.95)).toEqual(events);
            expect(capture(state, 0.5, state.arranger.totalSteps + 3)).toEqual(
                events.slice(state.arranger.totalSteps + 3),
            );
            console.log(
                `Acoustic guitar ${meter}: ${attacks.length / 3 / 4} attacks/bar; ${up.length} partial upstrokes; finite events across three loops`,
            );
        },
    );

    it('bounds releases at rapid changes and preserves shapes with a pinned crunch sound', async () => {
        const state = await scene('4/4', 'C G Am F | Dm7 G7 Cmaj7 C/E');
        state.chords.voice = 'pack:electric-guitar-rhythm';
        state.playback.bpm = 220;
        const events = capture(state, 0.5);
        for (const e of events) {
            const chord = getChordAtStep(e.step, state.arranger, { index: 0, sectionIndex: 0 });
            for (const n of e.notes) {
                const end = n.durationSteps! + n.timingOffset! / (60 / 220 / 4);
                expect(end).toBeLessThanOrEqual(chord!.chord.beats * 4 - chord!.stepInChord + 1e-6);
            }
        }
    });
});
