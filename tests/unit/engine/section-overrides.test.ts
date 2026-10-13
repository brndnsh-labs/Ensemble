import { describe, expect, it } from 'vitest';
import { isInstrumentEverActive } from '../../../public/engine/section-overrides.js';
import type { EnsembleState } from '../../../public/types.js';

describe('section instrument overrides', () => {
    it('keeps chart-wide resources alive for a globally muted lane forced on later', () => {
        const state = {
            arranger: { sections: [{ id: 'bridge', instruments: { harmony: true } }] },
            harmony: { enabled: false },
        } as unknown as EnsembleState;

        expect(isInstrumentEverActive(state, 'harmony')).toBe(true);
        expect(isInstrumentEverActive(state, 'bass')).toBe(false);
    });
});
