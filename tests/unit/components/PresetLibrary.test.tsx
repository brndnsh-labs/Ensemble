// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDispatch = vi.fn();
const mockShowToast = vi.fn();
const mockState = {
    arranger: { key: 'C', lastChordPreset: 'Pop (Standard)', isDirty: false },
    playback: { applyPresetSettings: false },
};

vi.mock('../../../public/state.js', () => ({
    dispatch: (action, payload) => mockDispatch(action, payload),
}));

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => selector(mockState),
}));

vi.mock('../../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

vi.mock('../../../public/arranger-controller.js', () => ({
    validateAndAnalyze: vi.fn(),
}));

vi.mock('../../../public/instrument-controller.js', () => ({
    flushBuffers: vi.fn(),
}));

vi.mock('../../../public/ui.js', () => ({
    showToast: (...args) => mockShowToast(...args),
}));

vi.mock('../../../public/data/chord-presets.js', () => ({
    CHORD_PRESETS: [
        {
            name: 'Pop (Standard)',
            category: 'Pop/Rock',
            sections: [{ label: 'Main', value: 'I | V | vi | IV' }],
            settings: { style: 'pop' },
        },
        {
            name: 'Autumn Leaves',
            category: 'Jazz',
            sections: [{ label: 'Main', value: 'ii | V | I', keyShift: 1, isMinor: true }],
            settings: { bpm: 140, style: 'jazz', timeSignature: '4/4' },
            provenance: { variant: 'Common-practice concert-major relative-minor chart' },
        },
    ],
}));

vi.mock('../../../public/utils.js', () => ({
    decompressSections: vi.fn((sections) => sections),
    generateId: vi.fn(() => 'generated-section-id'),
    transposeKeyName: vi.fn((key, shift) => {
        const keys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        const index = keys.indexOf(key);
        return keys[(index + shift + 12) % 12];
    }),
}));

import { PresetLibrary } from '../../../public/components/PresetLibrary.jsx';

describe('PresetLibrary', () => {
    let container;
    /** @type {Record<string, string>} */
    let storageData;

    /**
     * @returns {string[]}
     */
    const getRenderedTitles = () =>
        Array.from(container.querySelectorAll('.preset-library-card-title')).map(
            (title) => title.textContent || '',
        );

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        storageData = {};
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key) => (key in storageData ? storageData[key] : null)),
            setItem: vi.fn((key, value) => {
                storageData[key] = String(value);
            }),
            removeItem: vi.fn((key) => {
                delete storageData[key];
            }),
            clear: vi.fn(() => {
                storageData = {};
            }),
        });
        mockDispatch.mockClear();
        mockShowToast.mockClear();
        mockState.arranger.key = 'C';
        mockState.arranger.lastChordPreset = 'Pop (Standard)';
        mockState.arranger.isDirty = false;
        mockState.playback.applyPresetSettings = false;
    });

    afterEach(() => {
        render(null, container);
        container.remove();
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('highlights the last loaded chord preset when the arranger is clean', async () => {
        await act(async () => {
            render(<PresetLibrary />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        const activeCardTitle = container.querySelector(
            '.preset-library-card.active .preset-library-card-title',
        );
        expect(activeCardTitle?.textContent).toBe('Pop (Standard)');
        expect(
            container.querySelector('[data-testid="preset-library-result-summary"]')?.textContent,
        ).toContain('2 presets ready to browse');
    });

    it('clears the active highlight when the arranger has unsaved edits', async () => {
        mockState.arranger.isDirty = true;

        await act(async () => {
            render(<PresetLibrary />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(container.querySelector('.preset-library-card.active')).toBeNull();
    });

    it('filters presets by search text and genre', async () => {
        await act(async () => {
            render(<PresetLibrary />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        const searchInput = /** @type {HTMLInputElement|null} */ (
            container.querySelector('[data-testid="preset-library-search"]')
        );
        expect(searchInput).not.toBeNull();

        await act(async () => {
            searchInput.value = 'jazz';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        });

        expect(getRenderedTitles()).toEqual(['Autumn Leaves']);

        const clearButton = /** @type {HTMLButtonElement|null} */ (
            container.querySelector('[data-testid="preset-library-clear"]')
        );
        await act(async () => {
            clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const jazzButton = Array.from(
            container.querySelectorAll('.preset-library-filter-chips button'),
        ).find((button) => button.textContent === 'Jazz');
        await act(async () => {
            jazzButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(getRenderedTitles()).toEqual(['Autumn Leaves']);
        expect(
            container.querySelector('[data-testid="preset-library-result-summary"]')?.textContent,
        ).toContain('Showing 1 preset of 2 presets');
    });

    it('supports favorites-only filtering', async () => {
        await act(async () => {
            render(<PresetLibrary />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        const favoriteButton = /** @type {HTMLButtonElement|null} */ (
            container.querySelector('[aria-label="Add Autumn Leaves to favorites"]')
        );
        expect(favoriteButton).not.toBeNull();

        await act(async () => {
            favoriteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(storageData.ensemble_presetLibraryFavorites).toBe(
            JSON.stringify(['built-in:Autumn Leaves']),
        );

        const favoritesOnlyButton = /** @type {HTMLButtonElement|null} */ (
            container.querySelector('[data-testid="preset-library-favorites-only"]')
        );
        await act(async () => {
            favoritesOnlyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(getRenderedTitles()).toEqual(['Autumn Leaves']);
    });

    it('loads a preset, records it in recents, and notifies the caller', async () => {
        const onSelect = vi.fn();
        mockState.playback.applyPresetSettings = true;

        await act(async () => {
            render(<PresetLibrary onSelect={onSelect} />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        const autumnLeavesButton = /** @type {HTMLButtonElement|null} */ (
            container.querySelector('.preset-library-card-button[aria-label="Autumn Leaves"]')
        );

        await act(async () => {
            autumnLeavesButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelect).toHaveBeenCalled();
        expect(storageData.ensemble_presetLibraryRecents).toBe(
            JSON.stringify(['built-in:Autumn Leaves']),
        );
        expect(mockDispatch).toHaveBeenCalledWith('SET_PARAM', {
            module: 'arranger',
            param: 'lastChordPreset',
            value: 'Autumn Leaves',
        });
        expect(mockDispatch).toHaveBeenCalledWith('SET_ARRANGEMENT', [
            {
                id: 'generated-section-id',
                label: 'Main',
                value: 'ii | V | I',
                repeat: 1,
                key: 'Db',
                isMinor: true,
                timeSignature: undefined,
                seamless: undefined,
            },
        ]);
        expect(mockDispatch).toHaveBeenCalledWith('SET_BPM', 140);
    });
});
