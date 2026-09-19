// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateState } from '../../../public/state/state-hydration.js';
import { arranger, getState, playback } from '../../../public/state.js';

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

/**
 * #1314 — `playback.practiceMode` was a default-on preference whose last two behavioural
 * readers went away in #1313 (bass space now follows the bass LANE). Every session saved
 * before this release carries it, so hydration has to walk past it: no throw, and no
 * ad-hoc field appearing on the live slice for a reducer or a sync payload to pick up.
 */
describe('legacy session hydration (#1314 retired practiceMode)', () => {
    beforeEach(() => {
        store.clear();
    });

    it.each([true, false])(
        'ignores a saved practiceMode: %s without throwing or resurrecting it',
        (saved) => {
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({
                    bpm: 132,
                    key: 'F',
                    timeSignature: '4/4',
                    practiceMode: saved, // retired in #1314
                    countIn: false,
                    songMode: false,
                    sections: [{ id: 's1', label: 'A', value: 'I | V', repeat: 1 }],
                }),
            );

            expect(() => hydrateState()).not.toThrow();

            // The rest of the saved session still hydrates — proof the read reached the
            // fields around the retired one rather than bailing out early.
            expect(playback.bpm).toBe(132);
            expect(playback.countIn).toBe(false);
            expect(playback.songMode).toBe(false);
            expect(arranger.sections[0].label).toBe('A');

            // The retired key is not on the live slice, under any spelling.
            expect(playback.practiceMode).toBeUndefined();
            expect(Object.hasOwn(playback, 'practiceMode')).toBe(false);
        },
    );
});
