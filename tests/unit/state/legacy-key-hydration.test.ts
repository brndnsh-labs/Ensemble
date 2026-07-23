// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arranger, getState, playback } from '../../../public/state.js';
import { hydrateState } from '../../../public/state-hydration.js';

// Map-backed localStorage so this node-env test exercises the real hydration
// path (matches the pack-nudge.test.ts pattern).
const store = new Map();
vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
});

/**
 * #1174 — the dead-code batch removed keys that users' saved sessions still
 * carry: `playback.stopAtEnd`, `Section.color`, `soloist.doubleStopProb`, and
 * the phantom `vizState` params (theme/fps/...). Hydration must ignore them
 * rather than throw or resurrect them as ad-hoc fields on live state.
 */
describe('legacy session hydration (#1174 removed keys)', () => {
    beforeEach(() => {
        store.clear();
    });

    it('ignores removed keys in a pre-#1174 saved session without throwing', () => {
        localStorage.setItem(
            'ensemble_currentState',
            JSON.stringify({
                bpm: 120,
                key: 'C',
                timeSignature: '4/4',
                stopAtEnd: true, // removed in #1174
                sections: [
                    {
                        id: 's1',
                        label: 'Verse',
                        value: 'I | IV',
                        repeat: 1,
                        color: '#ff0000', // removed in #1174
                    },
                ],
                soloist: {
                    doubleStopProb: 0.4, // removed in #1174
                    phrasingIntensity: 0.8,
                },
                // theme/fps never existed on VisualizerState
                vizState: { enabled: true, theme: 'neon', fps: 60 },
            }),
        );

        expect(() => hydrateState()).not.toThrow();

        // Real content still hydrates.
        expect(arranger.sections[0].label).toBe('Verse');

        // Removed keys are not resurrected onto live state.
        expect(playback.stopAtEnd).toBeUndefined();
        expect(arranger.sections[0].color).toBeUndefined();
        expect(getState().soloist.doubleStopProb).toBeUndefined();
    });
});
