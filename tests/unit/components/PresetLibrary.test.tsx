// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDispatch = vi.fn();
const mockShowToast = vi.fn();
const mockTrack = vi.fn();
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

vi.mock('../../../public/state/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

vi.mock('../../../public/controllers/arranger-controller.js', () => ({
    appendSections: vi.fn(),
    refreshArrangerUI: vi.fn(),
}));

vi.mock('../../../public/ui.js', () => ({
    showToast: (...args) => mockShowToast(...args),
}));

vi.mock('../../../public/telemetry.js', () => ({
    track: (...args) => mockTrack(...args),
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

vi.mock('../../../public/state/share-codec.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        generateId: vi.fn(() => 'generated-section-id'),
    };
});

vi.mock('../../../public/utils.js', () => ({
    transposeKeyName: vi.fn((key, shift) => {
        const keys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        const index = keys.indexOf(key);
        return keys[(index + shift + 12) % 12];
    }),
}));

import { PresetLibrary } from '../../../public/components/PresetLibrary.jsx';
import { refreshArrangerUI } from '../../../public/controllers/arranger-controller.js';

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
        mockTrack.mockClear();
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
        expect(mockTrack).toHaveBeenCalledWith('preset_loaded', {
            source: 'built-in',
            name: 'Autumn Leaves',
            mode: 'replace',
        });
    });

    it('never sends a user-authored preset name', async () => {
        storageData.ensemble_userPresets = JSON.stringify([
            {
                name: 'Private rehearsal title',
                sections: [{ label: 'Main', value: 'I | IV | V | I' }],
                timestamp: 123,
            },
        ]);

        await act(async () => {
            render(<PresetLibrary />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        const userPreset = container.querySelector(
            '.preset-library-chip-name[aria-label="Private rehearsal title"]',
        );
        await act(async () => {
            userPreset?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(mockTrack).toHaveBeenCalledWith('preset_loaded', {
            source: 'user',
            mode: 'replace',
        });
        expect(JSON.stringify(mockTrack.mock.calls)).not.toContain('Private rehearsal title');
    });

    it('rejects malformed legacy section arrays without changing stored data', async () => {
        const storedPresets = [
            { name: 'Null sections', sections: [null], timestamp: 1 },
            { name: 'Number sections', sections: [1], timestamp: 2 },
            {
                name: 'Mixed sections',
                sections: [{ label: 'Main', value: 'I' }, null],
                timestamp: 3,
            },
            { name: 'Nested array section', sections: [[]], timestamp: 4 },
            { name: 'Invalid section field', sections: [{ value: {} }], timestamp: 5 },
            {
                name: 'Unsafe section id',
                sections: [{ id: 'constructor', label: 'Main', value: 'I' }],
                timestamp: 6,
            },
            { name: 'Invalid compressed JSON', sections: btoa('{{{{'), timestamp: 7 },
            { name: 'Invalid compressed member', sections: btoa('[null]'), timestamp: 8 },
            { name: 'Compressed number member', sections: btoa('[1]'), timestamp: 9 },
            { name: 'Compressed string member', sections: btoa('["x"]'), timestamp: 10 },
            { name: 'Compressed array member', sections: btoa('[[]]'), timestamp: 11 },
            {
                name: 'Too many legacy sections',
                sections: Array.from({ length: 501 }, () => ({ label: 'Main', value: 'I' })),
                timestamp: 12,
            },
            {
                name: 'Zero repeat',
                sections: [{ label: 'Main', value: 'I', repeat: 0 }],
                timestamp: 13,
            },
            {
                name: 'Oversized repeat',
                sections: [{ label: 'Main', value: 'I', repeat: 65 }],
                timestamp: 14,
            },
            {
                name: 'Fractional repeat',
                sections: [{ label: 'Main', value: 'I', repeat: 1.5 }],
                timestamp: 15,
            },
            {
                name: 'Valid repeat boundaries',
                sections: [
                    { label: 'Once', value: 'I', repeat: 1 },
                    { label: 'Sixty-four times', value: 'IV', repeat: 64 },
                ],
                timestamp: 16,
            },
            {
                name: 'Valid legacy',
                sections: [{ label: 'Legacy', value: 'I | IV' }],
                timestamp: 17,
            },
        ];
        const originalStorage = JSON.stringify(storedPresets);
        storageData.ensemble_userPresets = originalStorage;
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        await act(async () => {
            render(<PresetLibrary />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        consoleError.mockRestore();

        const renderedNames = getRenderedChipNames();
        expect(renderedNames).toEqual(
            expect.arrayContaining([
                'Pop (Standard)',
                'Autumn Leaves',
                'Valid repeat boundaries',
                'Valid legacy',
            ]),
        );
        for (const rejectedName of [
            'Null sections',
            'Number sections',
            'Mixed sections',
            'Nested array section',
            'Invalid section field',
            'Unsafe section id',
            'Invalid compressed JSON',
            'Invalid compressed member',
            'Compressed number member',
            'Compressed string member',
            'Compressed array member',
            'Too many legacy sections',
            'Zero repeat',
            'Oversized repeat',
            'Fractional repeat',
        ]) {
            expect(renderedNames).not.toContain(rejectedName);
        }
        expect(storageData.ensemble_userPresets).toBe(originalStorage);
        expect(localStorage.setItem).not.toHaveBeenCalled();
        expect(localStorage.removeItem).not.toHaveBeenCalled();
    });

    it('keeps compressed and valid legacy presets selectable', async () => {
        const { compressSections } = await import('../../../public/state/share-codec.js');
        storageData.ensemble_userPresets = JSON.stringify([
            {
                name: 'Compressed user preset',
                sections: compressSections([{ label: 'Compressed', value: 'ii | V | I' }]),
                timestamp: 1,
            },
            {
                name: 'Legacy user preset',
                sections: [{ label: 'Legacy', value: 'I | IV' }],
                timestamp: 2,
            },
        ]);
        const originalStorage = storageData.ensemble_userPresets;
        const onSelect = vi.fn();

        await act(async () => {
            render(<PresetLibrary onSelect={onSelect} />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        for (const name of ['Compressed user preset', 'Legacy user preset']) {
            const button = container.querySelector(
                `.preset-library-chip-name[aria-label="${name}"]`,
            );
            expect(button).not.toBeNull();
            await act(async () => {
                button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });
        }

        expect(onSelect).toHaveBeenCalledTimes(2);
        expect(mockDispatch).toHaveBeenCalledWith(
            'SET_ARRANGEMENT',
            expect.arrayContaining([
                expect.objectContaining({
                    label: 'Compressed',
                    value: 'ii | V | I',
                    repeat: 1,
                    timeSignature: '',
                    seamless: false,
                }),
            ]),
        );
        expect(mockDispatch).toHaveBeenCalledWith('SET_ARRANGEMENT', [
            {
                id: 'generated-section-id',
                label: 'Legacy',
                value: 'I | IV',
                repeat: 1,
                key: undefined,
                isMinor: undefined,
                timeSignature: undefined,
                seamless: undefined,
            },
        ]);
        expect(storageData.ensemble_userPresets).toBe(originalStorage);
    });

    it('preserves rejected stored records when deleting a valid preset', async () => {
        const malformedPreset = {
            name: 'Keep for recovery',
            sections: [null],
            timestamp: 1,
        };
        storageData.ensemble_userPresets = JSON.stringify([
            malformedPreset,
            {
                name: 'Delete me',
                sections: [{ label: 'Legacy', value: 'I | IV' }],
                timestamp: 2,
            },
        ]);
        vi.stubGlobal(
            'confirm',
            vi.fn(() => true),
        );

        await act(async () => {
            render(<PresetLibrary />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        const deleteButton = container.querySelector('[aria-label="Delete preset Delete me"]');
        expect(deleteButton).not.toBeNull();
        await act(async () => {
            deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(JSON.parse(storageData.ensemble_userPresets)).toEqual([malformedPreset]);
        expect(getRenderedChipNames()).not.toContain('Delete me');
    });

    it('delegates the worker resync to refreshArrangerUI AFTER swapping the arrangement (#1120)', async () => {
        await act(async () => {
            render(<PresetLibrary />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        const autumnLeavesButton = /** @type {HTMLButtonElement|null} */ (
            container.querySelector('.preset-library-chip-name[aria-label="Autumn Leaves"]')
        );

        await act(async () => {
            autumnLeavesButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // #1128 consolidated the hand-copied resync ritual onto refreshArrangerUI().
        // The component's contract is now: dispatch the new arrangement, then hand
        // off to the canonical resync exactly once — and only AFTER the swap, never
        // before (that was the #1120 bug). The #1120-safe internal order
        // (validate → syncWorker → flushBuffers) is guarded in
        // arranger-controller.test, where that order now lives.
        expect(refreshArrangerUI).toHaveBeenCalledTimes(1);

        const arrangementCallIdx = mockDispatch.mock.calls.findIndex(
            ([action]) => action === 'SET_ARRANGEMENT',
        );
        expect(arrangementCallIdx).toBeGreaterThanOrEqual(0);
        const arrangementOrder = mockDispatch.mock.invocationCallOrder[arrangementCallIdx];
        const refreshOrder = vi.mocked(refreshArrangerUI).mock.invocationCallOrder[0];
        expect(refreshOrder).toBeGreaterThan(arrangementOrder);
    });
});
