import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fillBuffers } from '../../../public/engine/worker-buffer-manager.js';
import { resetWorkerContext, workerContext } from '../../../public/engine/worker-orchestrator.js';
import type { EnsembleState } from '../../../public/types.js';

const generateNotesForStep = vi.hoisted(() =>
    vi.fn(() => ({ notes: [], coordination: {}, drumHits: [] })),
);

vi.mock('../../../public/engine/tick-logic.js', () => ({ generateNotesForStep }));

describe('worker buffer heads across section overrides', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('postMessage', vi.fn());
        resetWorkerContext(0);
        workerContext.LOOKAHEAD = 8;
    });

    it('consumes inactive steps instead of replaying them when a lane turns on', () => {
        const state = {
            arranger: {
                timeSignature: '4/4',
                totalSteps: 8,
                sections: [
                    { id: 'rest', instruments: { bass: false } },
                    { id: 'entry', instruments: { bass: true } },
                ],
                sectionMap: [
                    { id: 'rest', start: 0, end: 4 },
                    { id: 'entry', start: 4, end: 8 },
                ],
            },
            playback: {},
            bass: { enabled: true },
            soloist: { enabled: false },
            chords: { enabled: false },
            harmony: { enabled: false },
        } as unknown as EnsembleState;

        fillBuffers(state, 0);

        expect(workerContext.bbBufferHead).toBe(8);
        expect(generateNotesForStep).toHaveBeenCalledTimes(8);
        expect(
            generateNotesForStep.mock.calls.slice(0, 4).every((call) => !call[3].includeBass),
        ).toBe(true);
        expect(generateNotesForStep.mock.calls.slice(4).every((call) => call[3].includeBass)).toBe(
            true,
        );
    });
});
