// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFromUrl } from '../../../public/state-hydration.js';
import { ACTIONS } from '../../../public/types.js';

const { dispatchSpy, mockState } = vi.hoisted(() => {
    return {
        dispatchSpy: vi.fn(),
        mockState: {
            arranger: { key: 'C', timeSignature: '4/4', notation: 'roman', sections: [] },
            groove: { genreFeel: 'Rock', lastSmartGenre: 'Rock', instruments: [] },
            playback: { bpm: 120, bandIntensity: 0.5, complexity: 0.3 },
            chords: { style: 'smart' }
        }
    }
});

vi.mock('../../../public/state.js', () => ({
    getState: () => mockState,
    dispatch: dispatchSpy,
    storage: { get: () => ({}) },
    listeners: new Set()
}));

vi.mock('../../../public/app-controller.js', () => ({
    applyTheme: vi.fn()
}));

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
                pathname: '/'
            }
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
        expect(dispatchSpy).toHaveBeenCalledWith(ACTIONS.SET_STYLE, { module: 'chords', style: 'jazz' });
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
        window.location.search = '?notation=hack';
        loadFromUrl();
        expect(mockState.arranger.notation).toBe('roman');
    });

    it('accepts valid notation', () => {
        window.location.search = '?notation=nns';
        loadFromUrl();
        expect(mockState.arranger.notation).toBe('nns');
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
});
