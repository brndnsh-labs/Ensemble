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
     * Returns the names of all rendered chips.
     * @returns {string[]}
     */
    const getRenderedChipNames = () =>
        Array.from(container.querySelectorAll('.preset-library-chip-name')).map(
            (name) => name.textContent || '',
        );

    /**
     * Returns the names of chip rows currently rendered (used to assert search collapse).
     * @returns {string[]}
     */
    const getRenderedRowLabels = () =>
        Array.from(container.querySelectorAll('[data-testid="preset-library-chip-row"]')).map(
            (row) => row.getAttribute('data-row-label') || '',
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

        const activeChipName = container.querySelector(
            '.preset-library-chip.active .preset-library-chip-name',
        );
        expect(activeChipName?.textContent).toBe('Pop (Standard)');
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

        expect(container.querySelector('.preset-library-chip.active')).toBeNull();
    });

    it('color-codes chips by their genre category', async () => {
        await act(async () => {
            render(<PresetLibrary />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        const popChip = container.querySelector('.preset-library-chip[data-genre="Pop/Rock"]');
        const jazzChip = container.querySelector('.preset-library-chip[data-genre="Jazz"]');
        expect(popChip).not.toBeNull();
        expect(jazzChip).not.toBeNull();
        expect(popChip?.querySelector('.preset-library-chip-name')?.textContent).toBe(
            'Pop (Standard)',
        );
        expect(jazzChip?.querySelector('.preset-library-chip-name')?.textContent).toBe(
            'Autumn Leaves',
        );
    });

    it('hides non-matching chips on search and collapses empty rows', async () => {
        await act(async () => {
            render(<PresetLibrary />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        // No search: every chip is rendered; both genre rows are present.
        expect(getRenderedChipNames()).toEqual(
            expect.arrayContaining(['Pop (Standard)', 'Autumn Leaves']),
        );
        expect(getRenderedRowLabels()).toEqual(expect.arrayContaining(['Pop/Rock', 'Jazz']));

        const searchInput = /** @type {HTMLInputElement|null} */ (
            container.querySelector('[data-testid="preset-library-search"]')
        );
        expect(searchInput).not.toBeNull();

        await act(async () => {
            searchInput.value = 'jazz';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // Non-matching chips removed; the Pop/Rock row collapses entirely.
        expect(getRenderedChipNames()).toEqual(['Autumn Leaves']);
        expect(getRenderedRowLabels()).toEqual(['Jazz']);
        expect(
            container.querySelector('[data-testid="preset-library-result-summary"]')?.textContent,
        ).toContain('Showing 1 preset of 2 presets');
    });

    it('surfaces pinned presets in a dedicated row at the top', async () => {
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

        const rows = container.querySelectorAll('[data-testid="preset-library-chip-row"]');
        const pinnedRow = Array.from(rows).find(
            (row) => row.getAttribute('data-row-label') === 'Pinned',
        );
        expect(pinnedRow).toBeDefined();
        expect(pinnedRow?.querySelector('.preset-library-chip-name')?.textContent).toBe(
            'Autumn Leaves',
        );
    });

    it('loads a preset, records it in recents, and notifies the caller', async () => {
        const onSelect = vi.fn();
        mockState.playback.applyPresetSettings = true;

        await act(async () => {
            render(<PresetLibrary onSelect={onSelect} />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        const autumnLeavesButton = /** @type {HTMLButtonElement|null} */ (
            container.querySelector('.preset-library-chip-name[aria-label="Autumn Leaves"]')
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
