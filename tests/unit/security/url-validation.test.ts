// @ts-nocheck
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFromUrl } from '../../../public/state/state-hydration.js';
import { ACTIONS } from '../../../public/types.js';

const { dispatchSpy, decodeSpy, mockState } = vi.hoisted(() => {
    return {
        dispatchSpy: vi.fn(),
        decodeSpy: vi.fn(),
        mockState: {
            arranger: { key: 'C', timeSignature: '4/4', notation: 'roman', sections: [] },
            groove: { genreFeel: 'Rock', lastSmartGenre: 'Rock', instruments: [] },
            playback: { bpm: 120, bandIntensity: 0.5, complexity: 0.3 },
            chords: { style: 'smart' },
        },
    };
});

vi.mock('../../../public/state.js', () => ({
    stateMap: mockState,
    getState: () => mockState,
    dispatch: dispatchSpy,
    storage: { get: () => ({}) },
    listeners: new Set(),
}));

vi.mock('../../../public/controllers/app-controller.js', () => ({
    applyTheme: vi.fn(),
}));

// Preserve the real share codec; wrap decodeBase64Unicode in a spy so we can
// assert the `bnd` size-cap short-circuits BEFORE the (expensive) decode attempt.
vi.mock('../../../public/state/share-codec.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../public/state/share-codec.js')>();
    return {
        ...actual,
        decodeBase64Unicode: (s: string) => {
            decodeSpy(s);
            return actual.decodeBase64Unicode(s);
        },
    };
});

describe('Security: URL Parameter Validation', () => {
    beforeEach(() => {
        // Reset mock state
        mockState.arranger.timeSignature = '4/4';
        mockState.groove.genreFeel = 'Rock';
        mockState.playback.bpm = 120;
        mockState.chords.style = 'smart';
        mockState.arranger.notation = 'roman';
        dispatchSpy.mockClear();

        Object.defineProperty(window, 'location', {
            writable: true,
            value: {
                search: '',
                origin: 'http://localhost',
                pathname: '/',
            },
        });
    });

    it('rejects invalid timeSignature', () => {
        window.location.search = '?ts=<script>alert(1)</script>';
        loadFromUrl();
        expect(mockState.arranger.timeSignature).toBe('4/4'); // Remains default
    });

    it('accepts valid timeSignature', () => {
        window.location.search = '?ts=7/8';
        loadFromUrl();
        expect(mockState.arranger.timeSignature).toBe('7/8');
    });

    it('rejects invalid bpm (non-numeric)', () => {
        window.location.search = '?bpm=alert(1)';
        loadFromUrl();
        expect(dispatchSpy).not.toHaveBeenCalledWith(ACTIONS.SET_BPM, expect.anything());
    });

    it('rejects invalid bpm (out of range)', () => {
        window.location.search = '?bpm=9999';
        loadFromUrl();
        expect(dispatchSpy).not.toHaveBeenCalledWith(ACTIONS.SET_BPM, expect.anything());
    });

    it('accepts valid bpm', () => {
        window.location.search = '?bpm=140';
        loadFromUrl();
        expect(dispatchSpy).toHaveBeenCalledWith(ACTIONS.SET_BPM, 140);
    });

    it('rejects invalid style', () => {
        window.location.search = '?style=malicious_style';
        loadFromUrl();
        expect(dispatchSpy).not.toHaveBeenCalledWith(ACTIONS.SET_STYLE, expect.anything());
    });

    it('accepts valid style', () => {
        window.location.search = '?style=jazz';
        loadFromUrl();
        expect(dispatchSpy).toHaveBeenCalledWith(ACTIONS.SET_STYLE, {
            module: 'chords',
            style: 'jazz',
        });
    });

    it('rejects invalid genre', () => {
        window.location.search = '?genre=Hack';
        loadFromUrl();
        expect(mockState.groove.genreFeel).toBe('Rock');
    });

    it('accepts valid genre', () => {
        window.location.search = '?genre=Disco';
        loadFromUrl();
        expect(mockState.groove.genreFeel).toBe('Disco');
    });

    it('rejects invalid notation', () => {
        window.location.search = '?notation=literal'; // Now invalid
        loadFromUrl();
        expect(mockState.arranger.notation).toBe('roman');
    });

    it('accepts valid notation', () => {
        window.location.search = '?notation=name';
        loadFromUrl();
        expect(mockState.arranger.notation).toBe('name');
    });

    it('sanitizes prog parameter', () => {
        window.location.search = '?prog=<script>alert(1)</script>Cmaj7';
        loadFromUrl();
        expect(mockState.arranger.sections[0].value).not.toContain('<script>');
        expect(mockState.arranger.sections[0].value).not.toContain('>');
        // stripDangerousChars removes < > " = `
        expect(mockState.arranger.sections[0].value).toBe('scriptalert(1)/scriptCmaj7');
    });

    it('enforces length limit on prog parameter', () => {
        const longString = 'C'.repeat(2000);
        window.location.search = `?prog=${longString}`;
        loadFromUrl();
        expect(mockState.arranger.sections[0].value.length).toBeLessThanOrEqual(1000);
    });

    it('validates key parameter', () => {
        window.location.search = '?key=<script>';
        loadFromUrl();
        expect(mockState.arranger.key).toBe('C');
    });

    it('caps oversized bnd parameter before decoding (prevents memory-exhaustion DoS)', () => {
        decodeSpy.mockClear();
        // > 102400-char cap (mirrors decompressSections). Without the guard this
        // would be base64-decoded + JSON.parsed before failing — the DoS surface.
        const oversized = 'A'.repeat(102401);
        window.location.search = `?bnd=${oversized}`;
        expect(() => loadFromUrl()).not.toThrow();
        // The cap must short-circuit ahead of the decode, not merely fail at JSON.parse.
        expect(decodeSpy).not.toHaveBeenCalledWith(oversized);
    });

    it('still decodes a within-limit bnd parameter', () => {
        decodeSpy.mockClear();
        // Under the cap: decode IS attempted (then parse fails → null), proving the
        // guard rejects only oversized input, not all `bnd` values.
        const withinLimit = 'A'.repeat(100);
        window.location.search = `?bnd=${withinLimit}`;
        loadFromUrl();
        expect(decodeSpy).toHaveBeenCalledWith(withinLimit);
    });
});
