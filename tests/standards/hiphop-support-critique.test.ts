import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { emitCompNotes } from '../../public/engine/comping-emit.js';
import { compingState } from '../../public/engine/comping-state.js';
import { resetHiddenGenerationMemory } from '../../public/engine/generation-run.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

type EmitArgs = Parameters<typeof emitCompNotes>[0];
const ts = TIME_SIGNATURES['4/4'];

function scene() {
    const detached = cloneStateForDetachedGeneration(getState());
    const state = {
        ...detached,
        playback: { ...detached.playback },
        groove: { ...detached.groove },
        chords: { ...detached.chords },
        soloist: { ...detached.soloist },
        harmony: { ...detached.harmony },
        arranger: { ...detached.arranger },
    };
    state.playback.bandIntensity = 0.55;
    state.playback.complexity = 0.55;
    state.groove.genreFeel = 'Hip Hop';
    state.chords.style = 'smart';
    state.chords.enabled = true;
    state.soloist.enabled = false;
    state.harmony.enabled = false;
    state.arranger.sections = [
        { id: 'support', label: 'Verse', value: 'Cm7 | Fm7', timeSignature: '4/4' },
    ];
    validateProgression(state);
    resetHiddenGenerationMemory(state);
    return state;
}

function audible(notes: ReturnType<typeof emitCompNotes>) {
    return notes.filter((note) => note.midi > 0 && note.velocity > 0 && note.muted !== true);
}

function emitter(state: ReturnType<typeof scene>, cell = [6, 10]) {
    compingState.currentCell = Array.from({ length: 16 }, (_, index) =>
        cell.includes(index) ? 1 : 0,
    );
    return (step: number, overrides: Partial<EmitArgs> = {}) => {
        const stepInfo = getStepInfo(step, ts, [], TIME_SIGNATURES);
        return audible(
            emitCompNotes({
                state,
                chord: state.arranger.progression[0],
                step,
                stepInChord: step % 16,
                measureStep: step % 16,
                stepInfo,
                coordination: { bassHit: true },
                compingState,
                ts,
                spm: 16,
                genre: 'Hip Hop',
                chordIndex: 0,
                ccEvents: [],
                isBeatStart: stepInfo.isBeatStart,
                intBeat: Math.floor((step % 16) / 4),
                compBarIndex: Math.floor(step / 16),
                compDraw: (draw) => (draw === 1 ? 0.1 : 0.99),
                rotateVoicingFreqs: (freqs) => freqs,
                ...overrides,
            }),
        );
    };
}

describe('Hip Hop bass-collision support (#1165)', () => {
    it('yields the earlier stab and retains only the final existing offbeat', () => {
        const emit = emitter(scene());
        const attacks = Array.from({ length: 16 }, (_, step) => emit(step).length > 0);
        expect(attacks.flatMap((hit, step) => (hit ? [step] : []))).toEqual([10]);
    });

    it('still yields the final collision when an earlier stab sounded', () => {
        const emit = emitter(scene());
        expect(emit(6, { coordination: { bassHit: false } }).length).toBeGreaterThan(0);
        expect(emit(10)).toHaveLength(0);
    });

    it('does not invent an attack in an empty cell', () => {
        const emit = emitter(scene(), []);
        expect(Array.from({ length: 16 }, (_, step) => emit(step)).flat()).toHaveLength(0);
    });

    it('keeps later soloist and harmony yields authoritative', () => {
        const state = scene();
        const emit = emitter(state, [10]);
        expect(
            emit(10, {
                coordination: { bassHit: true, soloistActive: true },
                compDraw: () => 0.1,
            }),
        ).toHaveLength(0);
        state.harmony.enabled = true;
        state.harmony.rhythmicMask = 1 << 10;
        expect(emit(10, { compDraw: () => 0.1 })).toHaveLength(0);
        expect(
            emit(10, { coordination: { bassHit: true, harmonyEffectiveEnabled: false } }).length,
        ).toBeGreaterThan(0);
    });

    it('does not change the collision decision for other standard comp genres', () => {
        for (const genre of ['Rock', 'Jazz', 'Blues', 'Bossa Nova', 'Disco', 'Ska']) {
            const emit = emitter(scene(), [6]);
            expect(emit(6, { genre }), genre).toHaveLength(0);
        }
    });

    it('expires support after a bar, a skipped downbeat, a practice rewind and a fresh run', () => {
        const state = scene();
        let emit = emitter(state);
        expect(emit(6, { coordination: { bassHit: false } }).length).toBeGreaterThan(0);
        expect(emit(10)).toHaveLength(0);
        expect(emit(26).length).toBeGreaterThan(0); // next bar, no downbeat call
        expect(emit(10).length).toBeGreaterThan(0); // folded practice return
        expect(emit(6, { coordination: { bassHit: false } }).length).toBeGreaterThan(0);
        resetHiddenGenerationMemory(state);
        emit = emitter(state);
        expect(emit(10).length).toBeGreaterThan(0); // direct mid-bar seek after reset
    });

    it.each([
        { introBarsElapsed: 0 },
        { outroBarsRemaining: 1 },
        { subtractionMutedLanes: ['chords'] },
        { isFinalMeasure: true },
    ])('keeps authored arrangement and cadence rests: %j', (precedence) => {
        const state = scene();
        const chord = state.arranger.progression[0];
        for (let step = 1; step < 16; step++) {
            const notes = getAccompanimentNotes(
                state,
                chord,
                step,
                step,
                step,
                getStepInfo(step, ts, [], TIME_SIGNATURES),
                { bassHit: true, ...precedence },
            );
            expect(audible(notes)).toHaveLength(0);
        }
    });
});
