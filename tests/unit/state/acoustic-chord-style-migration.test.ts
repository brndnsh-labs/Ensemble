// @ts-nocheck
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateState } from '../../../public/state/state-hydration.js';
import * as stateModule from '../../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// #787 — Acoustic's chord-style default changed 'pad' → 'arp' (the fingerpick
// lane). A session persisted under the OLD default must reload as the arp, not a
// static block pad with no arpeggio (the symptom: "not hearing the arpeggios").
// Hydration restores the persisted chords.style verbatim, so the upgrade has to
// happen there. These lock the migration AND its blast radius (Acoustic-only,
// the exact stale default only).

vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bpm: 100, bandIntensity: 0.5, complexity: 0.3 },
        arranger: { sections: [], key: 'C', timeSignature: '4/4', notation: 'roman' },
        groove: { enabled: true, measures: 1, volume: 0.5, reverb: 0.2, instruments: [] },
        chords: { enabled: true, style: 'smart', volume: 0.5, reverb: 0.3 },
        bass: { enabled: true, volume: 0.5, reverb: 0.05 },
        soloist: makeSoloistMock({ enabled: false, volume: 0.5, reverb: 0.6 }),
        harmony: { enabled: false, volume: 0.4, reverb: 0.4 },
        vizState: { enabled: false },
        midi: { enabled: false },
    };
    const storage = {
        get: vi.fn((key) => {
            const item = localStorage.getItem(`ensemble_${key}`);
            if (!item) {
                return undefined;
            }
            try {
                return JSON.parse(item);
            } catch (_e) {
                return undefined;
            }
        }),
        save: vi.fn(),
    };
    return {
        stateMap: mockState,
        getState: () => mockState,
        dispatch: vi.fn(),
        storage,
        arranger: mockState.arranger,
        playback: mockState.playback,
        groove: mockState.groove,
        chords: mockState.chords,
        bass: mockState.bass,
        soloist: mockState.soloist,
    };
});

vi.mock('../../../public/controllers/app-controller.js', () => ({ applyTheme: vi.fn() }));
vi.mock('../../../public/controllers/midi-controller.js', () => ({ initMIDI: vi.fn() }));

const mockStorage = (() => {
    let store = {};
    return {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => {
            store[k] = v.toString();
        },
        removeItem: (k) => {
            delete store[k];
        },
        clear: () => {
            store = {};
        },
        get length() {
            return Object.keys(store).length;
        },
        key: (i) => Object.keys(store)[i] || null,
    };
})();

function savedSession({ genreFeel, chordStyle }) {
    return {
        sections: [{ id: '1', label: 'A', value: 'I' }],
        groove: { genreFeel, measures: 1, volume: 0.5 },
        chords: chordStyle === undefined ? {} : { style: chordStyle },
    };
}

function hydrateWith(session) {
    localStorage.setItem('ensemble_currentState', JSON.stringify(session));
    hydrateState();
    return stateModule.getState().chords.style;
}

describe('#787 — Acoustic chord-style hydration migration (pad → arp)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('localStorage', mockStorage);
        mockStorage.clear();
        const s = stateModule.getState();
        s.arranger.sections = [];
        s.chords.style = 'smart';
    });

    it('upgrades a stale Acoustic session (persisted pad) to the arp lane', () => {
        expect(hydrateWith(savedSession({ genreFeel: 'Acoustic', chordStyle: 'pad' }))).toBe('arp');
    });

    it('preserves a deliberate pad on a non-Acoustic genre', () => {
        expect(hydrateWith(savedSession({ genreFeel: 'Jazz', chordStyle: 'pad' }))).toBe('pad');
    });

    it('leaves a non-default Acoustic chord style untouched', () => {
        expect(hydrateWith(savedSession({ genreFeel: 'Acoustic', chordStyle: 'smart' }))).toBe(
            'smart',
        );
    });

    it('falls back to the smart default when no chord style was saved', () => {
        expect(hydrateWith(savedSession({ genreFeel: 'Acoustic', chordStyle: undefined }))).toBe(
            'smart',
        );
    });
});
