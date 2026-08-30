// @ts-nocheck
// @vitest-environment happy-dom
/**
 * #1070 — `soloist.complexity` is deleted from state, types and the ownership
 * manifest. It had zero writers and zero readers after #1167 rewired its slider
 * to `phrasingIntensity`, but it shipped for long enough that saved sessions and
 * share URLs in the wild can still carry it.
 *
 * Every route into the soloist slice must therefore DROP it silently: hydration
 * from a saved session, hydration from a `?bnd=` share URL, and the flat-keyed
 * `UPDATE_SB` payload path (whose unknown-key fall-through would otherwise
 * resurrect it as a stray top-level field — the same trap `motifTracking` and
 * `pinnedProfile` fell into in #866).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBase64Unicode } from '../../../public/state/share-codec.js';
import { hydrateState, loadFromUrl } from '../../../public/state/state-hydration.js';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

// Map-backed localStorage so this test exercises the real hydration path
// (matches legacy-key-hydration.test.ts).
const store = new Map();
vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
});

function setSearch(search: string) {
    Object.defineProperty(window, 'location', {
        writable: true,
        configurable: true,
        value: { search, origin: 'http://localhost', pathname: '/' },
    });
}

describe('soloist.complexity removal (#1070)', () => {
    beforeEach(() => {
        store.clear();
        setSearch('');
    });

    it('drops a stale complexity from an old saved session without throwing', () => {
        localStorage.setItem(
            'ensemble_currentState',
            JSON.stringify({
                bpm: 120,
                key: 'C',
                timeSignature: '4/4',
                sections: [{ id: 's1', label: 'Verse', value: 'I | IV', repeat: 1 }],
                soloist: {
                    enabled: true,
                    complexity: 0.9, // removed in #1070
                    phrasingIntensity: 0.8,
                    octave: 72,
                },
            }),
        );

        expect(() => hydrateState()).not.toThrow();

        const { soloist } = getState();
        // The live field it was confused with still hydrates...
        expect(soloist.phrasingIntensity).toBeCloseTo(0.8);
        // ...and the retired one is not resurrected.
        expect(soloist.complexity).toBeUndefined();
    });

    it('drops a stale complexity from an old share URL without throwing', () => {
        const band = {
            mv: 2,
            s: {
                e: 1,
                s: 'smart',
                p: 'trumpet',
                o: 74,
                v: 0.9,
                r: 0.6,
                m: 'monophonic',
                am: 1,
                c: 0.9, // a stale key an old payload could carry
            },
        };
        setSearch(`?bnd=${encodeURIComponent(encodeBase64Unicode(JSON.stringify(band)))}`);

        expect(() => loadFromUrl()).not.toThrow();

        const { soloist } = getState();
        // Proof the branch actually ran (an allow-listed field came through)...
        expect(soloist.octave).toBe(74);
        // ...while the unknown key was never assigned.
        expect(soloist.complexity).toBeUndefined();
    });

    it('drops complexity from an UPDATE_SB payload instead of creating a stray field', () => {
        dispatch(ACTIONS.UPDATE_SB, { complexity: 0.9, phrasingIntensity: 0.25 });

        const { soloist } = getState();
        expect(soloist.phrasingIntensity).toBeCloseTo(0.25);
        expect(soloist.complexity).toBeUndefined();
    });
});
