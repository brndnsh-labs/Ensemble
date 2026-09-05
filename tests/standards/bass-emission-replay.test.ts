import { afterEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive, resetBassState } from '../../public/engine/bass-engine.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { fillBuffers } from '../../public/engine/worker-buffer-manager.js';
import { resetWorkerContext } from '../../public/engine/worker-orchestrator.js';
import { getChordAtStep, recursiveSafeSync } from '../../public/engine/worker-utils.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { getStepInfo } from '../../public/utils.js';
import type { WorkerResponse } from '../../public/worker-types.js';

const STYLES = [
    ['rock', 'Rock'],
    ['quarter', 'Jazz'],
    ['blues', 'Blues'],
    ['funk', 'Funk'],
    ['neo', 'Neo-Soul'],
    ['metal', 'Metal'],
    ['dub', 'Reggae'],
    ['walking-ska', 'Ska'],
    ['hiphop', 'Hip Hop'],
    ['country', 'Country'],
    ['bossa', 'Bossa Nova'],
    ['acoustic', 'Acoustic'],
    ['disco', 'Disco'],
];

function play(
    style: string,
    genre: string,
    intensity: number,
    seed: string,
    loop: number,
    rng: number,
) {
    dispatch(ACTIONS.RESET_STATE);
    const initial = cloneStateForDetachedGeneration(getState());
    const state = {
        ...initial,
        arranger: {
            ...initial.arranger,
            seed,
            timeSignature: '4/4',
            sections: [
                {
                    id: 'practice',
                    label: 'Verse',
                    value: 'C7 | F7 | Dm7 | G7',
                    key: 'C',
                    timeSignature: '4/4',
                },
            ],
        },
        playback: {
            ...initial.playback,
            bandIntensity: intensity,
            complexity: intensity,
            currentLoopCount: loop,
        },
        groove: { ...initial.groove, genreFeel: genre },
    };
    validateProgression(state);
    const random = vi.spyOn(Math, 'random').mockReturnValue(rng);
    const trace = [];
    let previous = null;
    try {
        for (let local = 0; local < state.arranger.totalSteps; local++) {
            const step = loop * state.arranger.totalSteps + local;
            const info = getStepInfo(
                step,
                TIME_SIGNATURES['4/4'],
                state.arranger.measureMap,
                TIME_SIGNATURES,
            );
            const current = getChordAtStep(step, state.arranger);
            const next = getChordAtStep((Math.floor(step / 16) + 1) * 16, state.arranger);
            if (!current || !isBassActive(state, style, step, current.stepInChord, info)) {
                trace.push(null);
                continue;
            }
            const note = getBassNote(
                state,
                current.chord,
                next?.chord,
                info.beatIndex,
                previous,
                38,
                style,
                current.chordIndex,
                step,
                current.stepInChord,
                {},
                info,
            );
            if (note) {
                previous = note.freq;
                trace.push({
                    midi: note.midi,
                    freq: note.freq,
                    velocity: note.velocity,
                    duration: note.durationSteps,
                    muted: note.muted,
                    bend: note.bendStartInterval,
                });
            } else {
                trace.push(null);
            }
        }
        expect(random).not.toHaveBeenCalled();
        expect(trace.some((note) => note !== null)).toBe(true);
        return trace;
    } finally {
        random.mockRestore();
    }
}

afterEach(() => vi.restoreAllMocks());

it('replays bass across a loop boundary regardless of buffer-fill ordering (F1)', () => {
    dispatch(ACTIONS.RESET_STATE);
    const initial = cloneStateForDetachedGeneration(getState());
    const capture = (prefill: boolean) => {
        const detached = cloneStateForDetachedGeneration(initial);
        const state = {
            ...detached,
            arranger: {
                ...detached.arranger,
                seed: 'BASS_REPLAY',
                sections: [
                    {
                        id: 'practice',
                        label: 'Verse',
                        value: 'C7 | F7 | Dm7 | G7',
                        key: 'C',
                        timeSignature: '4/4',
                    },
                ],
            },
            playback: {
                ...detached.playback,
                bandIntensity: 0.7,
                complexity: 0.7,
                currentLoopCount: 0,
            },
            bass: { ...detached.bass, enabled: true, style: 'dub' },
            soloist: { ...detached.soloist, enabled: false },
            chords: { ...detached.chords, enabled: false },
            harmony: { ...detached.harmony, enabled: false },
            groove: { ...detached.groove, genreFeel: 'Reggae' },
        };
        validateProgression(state);
        expect(state.arranger.totalSteps).toBe(64);
        resetWorkerContext(0);
        resetBassState(state);
        const messages: WorkerResponse[] = [];
        vi.stubGlobal('postMessage', (message: WorkerResponse) => messages.push(message));
        try {
            fillBuffers(state, 0);
            // The worker can generate the next pass before the scheduler's delta arrives.
            if (prefill) {
                fillBuffers(state, 1);
            }
            recursiveSafeSync(state.playback, { currentLoopCount: 1 }, 'playback');
            fillBuffers(state, 64);
            return messages
                .flatMap((message) => ('notes' in message ? message.notes : []))
                .filter((note) => note.module === 'bass');
        } finally {
            vi.unstubAllGlobals();
            resetWorkerContext(0);
            resetBassState(state);
        }
    };
    const prefilled = capture(true);
    const afterBoundary = capture(false);
    expect(prefilled.some((note) => note.step === 64)).toBe(true);
    expect(afterBoundary).toEqual(prefilled);
});

describe.each(STYLES)('%s bass seeded emission (#1139)', (style, genre) => {
    it.each([0.3, 0.7, 0.95])(
        'replays at intensity %s without consuming ambient RNG',
        (intensity) => {
            const first = play(style, genre, intensity, 'BASS_REPLAY', 1, 0.05);
            play(style, genre, intensity, 'UNRELATED_TAKE', 3, 0.5);
            expect(play(style, genre, intensity, 'BASS_REPLAY', 1, 0.95)).toEqual(first);
        },
    );
});

describe.each([
    ['rock', 'Rock'],
    ['quarter', 'Jazz'],
])('%s bass variation (#1139)', (style, genre) => {
    it('retains seed changes and pass-to-pass variety rather than freezing the line', () => {
        const first = play(style, genre, 0.95, 'BASS_REPLAY', 0, 0.5);
        expect(play(style, genre, 0.95, 'ANOTHER_SONG', 0, 0.5)).not.toEqual(first);
        expect(play(style, genre, 0.95, 'BASS_REPLAY', 1, 0.5)).not.toEqual(first);
    });
});
