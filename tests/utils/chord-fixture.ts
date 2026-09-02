import type { Chord } from '../../public/types.js';

const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);

/**
 * A full, contract-satisfying `Chord` for tests that only care about a few
 * fields (pitch content, quality, section context). Fills the rest with
 * musically-inert defaults so callers can override just what the test needs.
 */
export function makeChord(overrides: Partial<Chord> = {}): Chord {
    const rootMidi = overrides.rootMidi ?? 60;
    const intervals = overrides.intervals ?? [0, 4, 7];
    const quality = overrides.quality ?? 'maj';
    return {
        romanName: 'I',
        absName: 'C',
        nnsName: '1',
        display: {
            name: { root: 'C', suffix: '' },
            nns: { root: '1', suffix: '' },
            roman: { root: 'I', suffix: '' },
        },
        rootMidi,
        bassMidi: null,
        freqs: intervals.map((iv) => midiToFreq(rootMidi + iv)),
        intervals,
        quality,
        is7th: false,
        isMinor: false,
        beats: 4,
        // Deliberately '' (falsy), not '4/4': several test fixtures predate
        // this required field (see lead-sheet-model.ts's fallback comment) and
        // rely on an absent per-chord override falling through to the caller's
        // meter — a truthy default here would silently override that fallback.
        timeSignature: '',
        key: 'C',
        charStart: 0,
        charEnd: 0,
        ...overrides,
    };
}
