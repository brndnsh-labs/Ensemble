import type { Chord } from '../../public/types.js';

/**
 * A full, contract-satisfying `Chord` for tests that only care about a few
 * fields (name, timing, section context). Fills the rest with
 * musically-inert defaults so callers can override just what the test needs.
 */
export function makeChord(overrides: Partial<Chord> = {}): Chord {
    return {
        absName: 'C',
        display: {
            name: { root: 'C', suffix: '' },
            nns: { root: '1', suffix: '' },
            roman: { root: 'I', suffix: '' },
        },
        beats: 4,
        // Deliberately '' (falsy), not '4/4': several test fixtures predate
        // this required field (see lead-sheet-model.ts's fallback comment) and
        // rely on an absent per-chord override falling through to the caller's
        // meter — a truthy default here would silently override that fallback.
        timeSignature: '',
        key: 'C',
        ...overrides,
    };
}
