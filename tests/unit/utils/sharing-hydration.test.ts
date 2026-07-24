/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../../public/state.js';

const { arranger, playback, groove, chords, bass, soloist, harmony } = getState();

import { SMART_GENRES } from '../../../public/data/smart-genres.js';
import { generateShareUrl, shareProgression } from '../../../public/export/sharing.js';
import { loadFromUrl } from '../../../public/state/state-hydration.js';

vi.mock('../../../public/ui.js', () => ({
    ui: {
        keySelect: { value: 'C' },
        bpmInput: { value: '120' },
        timeSigSelect: { value: '4/4' },
        notationSelect: { value: 'roman' },
        showToast: vi.fn(),
        updateKeySelectLabels: vi.fn(),
        updateRelKeyButton: vi.fn(),
    },
    showToast: vi.fn(),
    updateKeySelectLabels: vi.fn(),
    updateRelKeyButton: vi.fn(),
    switchInstrumentTab: vi.fn(),
}));

import * as uiModule from '../../../public/ui.js';

const mockUi = (uiModule as any).ui;

vi.mock('../../../public/controllers/app-controller.js', () => ({
    applyTheme: vi.fn(),
    setBpm: vi.fn((bpm) => {
        playback.bpm = parseInt(bpm, 10);
    }),
}));

vi.mock('../../../public/controllers/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
    flushBuffers: vi.fn(),
    restoreGains: vi.fn(),
}));

vi.mock('../../../public/state/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

describe('Sharing & Hydration Round-trip', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset state
        arranger.sections = [{ id: '1', label: 'Intro', value: 'I' }];
        arranger.key = 'C';
        arranger.timeSignature = '4/4';
        playback.bpm = 120;
        chords.style = 'smart';

        // Mock clipboard
        vi.stubGlobal('navigator', {
            clipboard: {
                writeText: vi.fn().mockImplementation(() => Promise.resolve()),
            },
        });

        // Mock window.location
        vi.stubGlobal('location', new URL('http://localhost'));
    });

    it('should generate a URL containing critical state', async () => {
        groove.genreFeel = 'Funk';
        playback.bandIntensity = 0.85;
        playback.complexity = 0.6;
        shareProgression();

        expect(navigator.clipboard.writeText).toHaveBeenCalled();
        const urlString = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
        const url = new URL(urlString);

        expect(url.searchParams.get('key')).toBe('C');
        expect(url.searchParams.get('bpm')).toBe('120');
        expect(url.searchParams.get('genre')).toBe('Funk');
        expect(url.searchParams.get('int')).toBe('0.85');
        expect(url.searchParams.get('comp')).toBe('0.60');
    });

    it('should hydrate state from a generated URL', () => {
        // 1. Setup specific state
        arranger.sections = [{ id: '1', label: 'Blues', value: 'I | IV | I | V' }];
        arranger.key = 'F';
        playback.bpm = 80;
        chords.style = 'jazz';
        chords.reverb = 0.22;
        bass.reverb = 0.08;
        soloist.reverb = 0.72;
        harmony.reverb = 0.44;
        groove.reverb = 0.18;
        groove.genreFeel = 'Jazz';
        playback.bandIntensity = 0.4;

        // 2. Generate Share URL
        mockUi.keySelect.value = 'F';
        mockUi.bpmInput.value = '80';

        shareProgression();
        const urlString = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];

        // 3. Reset State
        arranger.sections = [];
        arranger.key = 'C';
        playback.bpm = 120;
        chords.style = 'smart';
        groove.genreFeel = 'Rock';
        playback.bandIntensity = 0.5;

        // 4. Simulate Load from that URL
        vi.stubGlobal('location', new URL(urlString));
        loadFromUrl();

        // 5. Verify restored state
        expect(arranger.key).toBe('F');
        expect(playback.bpm).toBe(80);
        expect(chords.style).toBe('jazz');
        expect(chords.reverb).toBe(0.22);
        expect(bass.reverb).toBe(0.08);
        expect(soloist.reverb).toBe(0.72);
        expect(harmony.reverb).toBe(0.44);
        expect(groove.reverb).toBe(0.18);
        expect(arranger.sections[0].label).toBe('Blues');
        expect(groove.genreFeel).toBe('Jazz'); // Verified state update directly
        expect(playback.bandIntensity).toBe(0.4);
    });

    it('should fall back to unity volume and default reverb for legacy band payloads', () => {
        const legacyBandState = {
            s: {
                e: 1,
                s: 'smart',
                p: 'trumpet',
                o: 72,
                v: 0.5,
                r: 0.9,
                m: 'monophonic',
                sd: '',
            },
            b: {
                e: 1,
                s: 'smart',
                o: 36,
                v: 0.4,
                r: 0.8,
            },
            c: {
                e: 1,
                s: 'smart',
                o: 48,
                v: 0.5,
                r: 0.7,
                d: 'standard',
            },
            h: {
                e: 1,
                s: 'smart',
                o: 60,
                v: 0.4,
                r: 0.6,
                c: 0.5,
            },
            g: {
                e: 1,
                v: 0.5,
                r: 0.4,
                sw: 0,
                ss: 8,
                hu: 20,
            },
        };

        const encoded = btoa(JSON.stringify(legacyBandState));

        soloist.reverb = 0.1;
        bass.reverb = 0.1;
        chords.reverb = 0.1;
        harmony.reverb = 0.1;
        groove.reverb = 0.1;

        vi.stubGlobal('location', new URL(`http://localhost/?bnd=${encodeURIComponent(encoded)}`));
        loadFromUrl();

        expect(soloist.volume).toBe(1.0);
        expect(bass.volume).toBe(1.0);
        expect(chords.volume).toBe(1.0);
        expect(harmony.volume).toBe(1.0);
        expect(groove.volume).toBe(1.0);
        expect(soloist.reverb).toBe(0.6);
        expect(bass.reverb).toBe(0.05);
        expect(chords.reverb).toBe(0.3);
        expect(harmony.reverb).toBe(0.4);
        expect(groove.reverb).toBe(0.2);
    });

    it('should hydrate high-fidelity band settings (volume, reverb) from bnd parameter', () => {
        const { soloist, bass } = getState();
        // 1. Setup specific band state
        soloist.volume = 0.8;
        soloist.reverb = 0.7;
        bass.volume = 0.3;
        bass.style = 'funk';

        // 2. Generate Share URL
        shareProgression();
        const urlString = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
        expect(urlString).toContain('bnd=');

        // 3. Reset State
        soloist.volume = 0.5;
        soloist.reverb = 0.6;
        bass.volume = 0.45;
        bass.style = 'walking';

        // 4. Simulate Load from that URL
        vi.stubGlobal('location', new URL(urlString));
        loadFromUrl();

        // 5. Verify restored high-fidelity state
        expect(soloist.volume).toBe(0.8);
        expect(soloist.reverb).toBe(0.7);
        expect(bass.volume).toBe(0.3);
        expect(bass.style).toBe('funk');
    });

    it('normalizes legacy soloist polyphonic mode to monophonic during URL hydration', () => {
        const { soloist } = getState();
        const legacyBandState = {
            s: {
                e: 1,
                s: 'smart',
                p: 'trumpet',
                o: 72,
                v: 0.5,
                r: 0.6,
                m: 'polyphonic',
                sd: '',
            },
        };
        const encoded = btoa(JSON.stringify(legacyBandState));

        soloist.mode = 'monophonic';
        vi.stubGlobal('location', new URL(`http://localhost/?bnd=${encodeURIComponent(encoded)}`));
        loadFromUrl();

        expect(soloist.mode).toBe('monophonic');
    });
});

describe('Genre share round-trip (#1200)', () => {
    // The writer emits `groove.genreFeel` (the engine's keyspace); the reader must
    // land BOTH halves canonically — a canonical feel in `genreFeel` and a canonical
    // name in `lastSmartGenre` — no matter which keyspace arrived in the URL.
    const GENRE_PAIRS = Object.keys(SMART_GENRES).map((name) => ({
        name,
        feel: SMART_GENRES[name].feel as string,
    }));

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('location', new URL('http://localhost'));
    });

    it('covers all 13 canonical genres', () => {
        expect(GENRE_PAIRS).toHaveLength(13);
    });

    it.each(GENRE_PAIRS)('round-trips $name (feel "$feel")', ({ name, feel }) => {
        groove.genreFeel = feel;
        groove.lastSmartGenre = name;

        const url = generateShareUrl();
        expect(new URL(url).searchParams.get('genre')).toBe(feel);

        // Reset to a DIFFERENT genre than the one under test, so hydrating back to
        // the original is never vacuously true (Rock is the default fallback).
        const decoy = name === 'Rock' ? 'Jazz' : 'Rock';
        groove.genreFeel = SMART_GENRES[decoy].feel as string;
        groove.lastSmartGenre = decoy;

        vi.stubGlobal('location', new URL(url));
        loadFromUrl();

        expect(groove.genreFeel).toBe(feel);
        expect(groove.lastSmartGenre).toBe(name);
    });

    it('accepts a genre NAME in the url for back-compat and normalizes it to the feel', () => {
        groove.genreFeel = 'Rock';
        groove.lastSmartGenre = 'Rock';

        vi.stubGlobal('location', new URL('http://localhost/?genre=Ska-Punk'));
        loadFromUrl();

        expect(groove.genreFeel).toBe('Ska');
        expect(groove.lastSmartGenre).toBe('Ska-Punk');
    });

    it('ignores a genre param in neither keyspace', () => {
        groove.genreFeel = 'Funk';
        groove.lastSmartGenre = 'Funk';

        vi.stubGlobal('location', new URL('http://localhost/?genre=Polka'));
        loadFromUrl();

        expect(groove.genreFeel).toBe('Funk');
        expect(groove.lastSmartGenre).toBe('Funk');
    });
});
