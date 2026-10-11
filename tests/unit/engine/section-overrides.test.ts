import { describe, expect, it } from 'vitest';
import {
    isInstrumentActiveAtStep,
    isInstrumentEverActive,
} from '../../../public/engine/section-overrides.js';
import type { EnsembleState } from '../../../public/types.js';

describe('section instrument overrides', () => {
    it('wraps monotonic transport steps into the chart on later loops', () => {
        const state = {
            arranger: {
                totalSteps: 32,
                sectionMap: [
                    { id: 'verse', start: 0, end: 16 },
                    { id: 'chorus', start: 16, end: 32 },
                ],
                sections: [
                    { id: 'verse', instruments: { bass: true } },
                    { id: 'chorus', instruments: { bass: false } },
                ],
            },
            bass: { enabled: false },
        } as unknown as EnsembleState;

        expect(isInstrumentActiveAtStep(state, 'bass', 32)).toBe(true);
        expect(isInstrumentActiveAtStep(state, 'bass', 48)).toBe(false);
    });

    it('keeps chart-wide resources alive for a globally muted lane forced on later', () => {
        const state = {
            arranger: { sections: [{ id: 'bridge', instruments: { harmony: true } }] },
            harmony: { enabled: false },
        } as unknown as EnsembleState;

        expect(isInstrumentEverActive(state, 'harmony')).toBe(true);
        expect(isInstrumentEverActive(state, 'bass')).toBe(false);
    });
});
