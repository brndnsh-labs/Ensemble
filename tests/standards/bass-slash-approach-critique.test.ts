import { describe, expect, it } from 'vitest';
import { SMART_GENRES } from '../../public/data/smart-genres.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resetHiddenGenerationMemory } from '../../public/engine/generation-run.js';
import { foldPracticeStep } from '../../public/engine/section-overrides.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { getState } from '../../public/state.js';
import type { EnsembleState } from '../../public/types.js';

function scene(genre: string, chart: string, octave = 38, energy = 0.8) {
    const initial = cloneStateForDetachedGeneration(getState());
    const profile = SMART_GENRES[genre];
    const state = {
        ...initial,
        arranger: {
            ...initial.arranger,
            seed: 'SLASH-AUDIT',
            timeSignature: '4/4',
            sections: [
                { id: 'verse', label: 'Verse', value: chart, key: 'C', timeSignature: '4/4' },
            ],
        },
        bass: { ...initial.bass, enabled: true, style: profile.bass!, octave },
        playback: { ...initial.playback, bpm: 115, bandIntensity: energy, complexity: 0.5 },
        groove: { ...initial.groove, genreFeel: profile.feel! },
        soloist: { ...initial.soloist, enabled: false },
    };
    validateProgression(state);
    return state;
}

function play(initial: EnsembleState, start = 0, end = 16) {
    const state = cloneStateForDetachedGeneration(initial);
    resetHiddenGenerationMemory(state);
    const cursors = {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
    const carryover = { lastActiveSoloistMidi: 0, lastActiveSoloistStep: 0 };
    const events = [];
    for (let absolute = start; absolute <= end; absolute++) {
        const step = foldPracticeStep(absolute, state.playback);
        const tick = generateNotesForStep(
            state,
            step,
            cursors,
            {
                includeBass: true,
                includeChords: false,
                includeDrums: false,
                includeSoloist: false,
                includeHarmony: false,
                noLiveConductor: true,
            },
            carryover,
        );
        for (const note of tick.notes.filter((n) => n.module === 'bass')) {
            expect(note.freq).toBeCloseTo(440 * 2 ** ((note.midi! - 69) / 12), 3);
            expect(note.midi).toBeGreaterThanOrEqual(23);
            expect(note.midi).toBeLessThanOrEqual(57);
            events.push({ absolute, ...note });
        }
    }
    return events;
}

const changes = [
    ['C | C/E', 4],
    ['C/E | C/G', 7],
    ['C/G | C/D', 2],
    ['C/E | C', 0],
    ['G/B | C/E', 4],
    ['C/E | F/A', 9],
    ['F/A | C/E', 4],
    ['C | G', 7],
    ['B/F# | C/G', 7],
    ['C/G | B/F#', 6],
] as const;

describe.each(['Country', 'Ska-Punk'])('%s written-bass approach critique (#1158)', (genre) => {
    it.each(changes)('%s approaches the actual bass arrival', (chart, targetPc) => {
        let arrivals = 0;
        let registerFolds = 0;
        for (const octave of [28, 38, 51]) {
            for (const energy of [0.55, 0.8, 0.95]) {
                const events = play(scene(genre, chart, octave, energy));
                const approach = events.find((note) => note.step === 14)!;
                const arrival = events.find((note) => note.step === 16)!;
                expect(
                    approach,
                    'the existing last-eighth pickup must actually sound',
                ).toBeDefined();
                expect(arrival, 'the written bass must sound on the new chord').toBeDefined();
                expect(arrival.midi! % 12).toBe(targetPc);
                const distance = Math.abs(approach.midi! - arrival.midi!);
                // intent: a chromatic neighbour in the existing bounded octave policy.
                // A boundary may fold a semitone by one octave; arbitrary 3rd/5th
                // approaches and extra octave jumps are not the authored gesture.
                expect([1, 11], `${chart}, octave ${octave}, energy ${energy}`).toContain(distance);
                if (distance === 11) {
                    registerFolds++;
                }
                arrivals++;
            }
        }
        console.log(
            `${genre} ${chart}: ${arrivals} chromatic arrivals, ${registerFolds} register folds`,
        );
    });

    it('keeps the reported C → C/E correction connected at the ordinary register', () => {
        const events = play(scene(genre, 'C | C/E'));
        const approach = events.find((n) => n.step === 14)!;
        const arrival = events.find((n) => n.step === 16)!;
        expect(Math.abs(approach.midi! - arrival.midi!)).toBe(1);
    });

    it('does not manufacture pickups when the written bass is held across a chord change', () => {
        const events = play(scene(genre, 'C/E | Am/E'));
        const last = events.find((note) => note.step === 14);
        if (genre === 'Country') {
            expect(last).toBeUndefined();
        } else {
            // Ska still has an ordinary eighth here; it must not acquire the
            // hotter chromatic-pickup articulation merely because quality changes.
            expect(last).toBeDefined();
            expect(last).toHaveProperty('authoredVelocity', 1);
        }
        expect(events.find((note) => note.step === 16)!.midi! % 12).toBe(4);
    });

    it('replays a nonzero practice section deterministically, including its slash arrivals', () => {
        const state = scene(genre, 'G | D');
        state.arranger.sections.push({
            id: 'practice',
            label: 'Verse',
            value: 'C | C/E | F/A | C/G',
            key: 'C',
            timeSignature: '4/4',
        });
        validateProgression(state);
        const section = state.arranger.sectionMap[1];
        state.playback.loopStartStep = section.start;
        state.playback.loopEndStep = section.end;
        const events = play(state, section.start, section.end + 16);
        expect(events.length).toBeGreaterThan(12);
        expect(events).toEqual(play(state, section.start, section.end + 16));
        for (const boundary of [section.start + 16, section.end + 16]) {
            const approach = events.find((note) => note.absolute === boundary - 2)!;
            const arrival = events.find((note) => note.absolute === boundary)!;
            expect(arrival.midi! % 12).toBe(4);
            expect([1, 11]).toContain(Math.abs(approach.midi! - arrival.midi!));
        }
    });
});

it('Country follows the written downward bass movement even when the chord root stays C', () => {
    const events = play(scene('Country', 'C/G | C/D'));
    expect(events.find((note) => note.step === 12)!.midi! % 12).toBe(4); // E leads down toward D
});
