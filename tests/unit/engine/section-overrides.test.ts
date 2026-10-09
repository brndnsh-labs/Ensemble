import { describe, expect, it } from 'vitest';
import {
    effectiveTargetIntensity,
    isInstrumentActiveAtStep,
    isInstrumentEverActive,
    isSoloistBusyAtStep,
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

    it('resolves a section intensity override from the section the step is in', () => {
        const state = {
            arranger: {
                totalSteps: 32,
                sectionMap: [
                    { id: 'verse', start: 0, end: 16 },
                    { id: 'chorus', start: 16, end: 32 },
                ],
                sections: [{ id: 'verse', targetIntensity: 0.2 }, { id: 'chorus' }],
            },
            conductor: { targetIntensity: 0.35 },
        } as unknown as EnsembleState;

        expect(effectiveTargetIntensity(state, 0)).toBe(0.2);
        expect(effectiveTargetIntensity(state, 15)).toBe(0.2);
        // No override on the chorus: the global target.
        expect(effectiveTargetIntensity(state, 16)).toBe(0.35);
    });

    it('ignores stale soloist busy memory while the current section force-mutes it', () => {
        const state = {
            arranger: {
                totalSteps: 32,
                sectionMap: [
                    { id: 'verse', start: 0, end: 16 },
                    { id: 'solo', start: 16, end: 32 },
                ],
                sections: [
                    { id: 'verse', instruments: { soloist: false } },
                    { id: 'solo', instruments: { soloist: true } },
                ],
            },
            soloist: {
                enabled: true,
                session: { phrasing: { busySteps: 12 } },
            },
        } as unknown as EnsembleState;

        expect(isSoloistBusyAtStep(state, 0, true)).toBe(false);
        expect(isSoloistBusyAtStep(state, 16)).toBe(true);
    });
});
