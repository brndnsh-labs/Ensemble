/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../../public/state.js';

const { arranger, playback, groove, chords } = getState();

import { shareProgression } from '../../../public/sharing.js';
import { loadFromUrl } from '../../../public/state-hydration.js';

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

import { ui as actualUi } from '../../../public/ui.js';

const mockUi = actualUi;

vi.mock('../../../public/app-controller.js', () => ({
    applyTheme: vi.fn(),
    setBpm: vi.fn((bpm) => {
        playback.bpm = parseInt(bpm, 10);
    }),
}));

vi.mock('../../../public/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
    flushBuffers: vi.fn(),
    restoreGains: vi.fn(),
}));

vi.mock('../../../public/persistence.js', () => ({
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
        expect(arranger.sections[0].label).toBe('Blues');
        expect(groove.genreFeel).toBe('Jazz'); // Verified state update directly
        expect(playback.bandIntensity).toBe(0.4);
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
});
