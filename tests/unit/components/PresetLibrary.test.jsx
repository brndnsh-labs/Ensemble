/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDispatch = vi.fn();
const mockState = {
    arranger: { lastChordPreset: 'Pop (Standard)', isDirty: false },
    playback: { applyPresetSettings: false },
};

vi.mock('../../../public/state.js', () => ({
    dispatch: (action, payload) => mockDispatch(action, payload),
    getState: () => mockState,
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

vi.mock('../../../public/data/chord-presets.js', () => ({
    CHORD_PRESETS: [
        {
            name: 'Pop (Standard)',
            category: 'Pop/Rock',
            sections: [{ label: 'Main', value: 'I | V | vi | IV' }],
        },
        {
            name: 'Autumn Leaves',
            category: 'Jazz',
            sections: [{ label: 'Main', value: 'ii | V | I' }],
            settings: { bpm: 140, style: 'jazz', timeSignature: '4/4' },
        },
    ],
}));

vi.mock('../../../public/utils.js', () => ({
    decompressSections: vi.fn((sections) => sections),
    formatUnicodeSymbols: vi.fn((value) => value),
    generateId: vi.fn(() => 'generated-section-id'),
}));

import { PresetLibrary } from '../../../public/components/PresetLibrary.jsx';

describe('PresetLibrary', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
        });
        mockDispatch.mockClear();
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

        const activeChip = container.querySelector('.preset-chip.active .preset-chip-name');
        expect(activeChip?.textContent).toBe('Pop (Standard)');
        expect(container.querySelector('.preset-chip')?.getAttribute('data-category')).toBe(
            'Pop/Rock',
        );
        expect(container.querySelector('.preset-chip .preset-chip-meta')?.textContent).toBe(
            'Pop/Rock',
        );
    });

    it('clears the active highlight when the arranger has unsaved edits', async () => {
        mockState.arranger.isDirty = true;

        await act(async () => {
            render(<PresetLibrary />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(container.querySelector('.preset-chip.active')).toBeNull();
    });

    it('loads a preset and notifies the caller', async () => {
        const onSelect = vi.fn();
        mockState.playback.applyPresetSettings = true;

        await act(async () => {
            render(<PresetLibrary onSelect={onSelect} />, container);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        const autumnLeaves = Array.from(container.querySelectorAll('.preset-chip')).find((chip) =>
            chip.textContent?.includes('Autumn Leaves'),
        );

        await act(async () => {
            autumnLeaves?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelect).toHaveBeenCalled();
        expect(mockDispatch).toHaveBeenCalledWith('SET_PARAM', {
            module: 'arranger',
            param: 'lastChordPreset',
            value: 'Autumn Leaves',
        });
        expect(mockDispatch).toHaveBeenCalledWith('SET_BPM', 140);
    });
});
