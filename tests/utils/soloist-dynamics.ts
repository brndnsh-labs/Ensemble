import { canonToFeel } from '../../public/data/smart-genres.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { getChordAtStep } from '../../public/engine/worker-utils.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

export interface DynamicsNote {
    midi: number;
    velocity: number;
    durationSteps: number;
    isDoubleStop?: boolean;
    bendStartInterval?: number;
    [key: string]: unknown;
}

export function buildDynamicsState(genre = 'Rock', seedId = 'PRACTICE_RELIABILITY') {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: canonToFeel(genre) ?? genre });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'guitar' });
    const detached = cloneStateForDetachedGeneration(getState());
    const state = {
        ...detached,
        playback: { ...detached.playback, bpm: 120, bandIntensity: 0.6 },
        arranger: { ...detached.arranger },
        soloist: { ...detached.soloist, session: { ...detached.soloist.session } },
    };
    state.arranger.sections = ['C | G', 'Am | F'].map((value, index) => ({
        id: `dynamics-${index}`,
        label: index === 0 ? 'Verse' : 'Chorus',
        value,
        key: 'C',
        timeSignature: '4/4',
    }));
    validateProgression(state);
    state.soloist.session.seed = generateSessionSeed(state, state.arranger, 'smart', 0.6, seedId);
    return state;
}

export function performDynamics(initial: ReturnType<typeof buildDynamicsState>, intensity: number) {
    const detached = cloneStateForDetachedGeneration(initial);
    const state = {
        ...detached,
        playback: { ...detached.playback, bandIntensity: intensity, currentLoopCount: 0 },
    };
    const cursor = { index: 0, sectionIndex: 0 };
    const nextCursor = { index: 0, sectionIndex: 0 };
    const trace: { step: number; notes: DynamicsNote[]; resting: boolean }[] = [];
    const span = state.soloist.session.seed!.loopLengthSteps;
    for (let step = 0; step < span * 2; step++) {
        state.playback.currentLoopCount = Math.floor(step / state.arranger.totalSteps);
        const position = getChordAtStep(step, state.arranger, cursor)!;
        const next = getChordAtStep(step + 1, state.arranger, nextCursor);
        const result = getSoloistNotePhraseFirst(
            state,
            position.chord,
            next?.chord ?? null,
            step,
            null,
            state.soloist.octave,
            'smart',
            step % 16,
            { sectionStart: position.sectionStart, sectionEnd: position.sectionEnd },
        );
        trace.push({
            step,
            notes: result ? (Array.isArray(result) ? result : [result]) : [],
            resting: state.soloist.session.phrasing.isResting,
        });
    }
    return trace;
}
