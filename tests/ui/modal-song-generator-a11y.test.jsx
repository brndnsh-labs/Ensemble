/**
 * @vitest-environment happy-dom
 */

import { h, render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateSongModal } from '../../public/components/GenerateSongModal.jsx';
import { dispatch } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

// Mock dependencies
vi.mock('../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));
vi.mock('../../public/app-controller.js', () => ({
    setBpm: vi.fn(),
}));
vi.mock('../../public/instrument-controller.js', () => ({
    togglePower: vi.fn(),
    switchMeasure: vi.fn(),
    updateMeasures: vi.fn(),
    cloneMeasure: vi.fn(),
}));
vi.mock('../../public/ui-song-generator-controller.js', () => ({
    setupSongGeneratorHandlers: vi.fn(),
}));

vi.mock('../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    const mockState = {
        ...actual,
        playback: {
            ...actual.playback,
            modals: { generateSong: true, editor: false },
        },
        arranger: { ...actual.arranger, totalSteps: 64 },
    };
    return {
        ...mockState,
        getState: () => mockState,
        dispatch: actual.dispatch,
        ACTIONS: actual.ACTIONS,
    };
});

describe('Song Generator Modal Accessibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.classList.remove('modal-open');
        document.body.innerHTML = '<div id="modalContainer"></div>';

        // Mock global objects used in components
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

        render(<GenerateSongModal />, document.getElementById('modalContainer'));
    });

    it('should have correct modal ARIA attributes', () => {
        const modal = document.getElementById('generateSongOverlay');
        expect(modal.getAttribute('role')).toBe('dialog');
        expect(modal.getAttribute('aria-modal')).toBe('true');
        expect(modal.getAttribute('aria-labelledby')).toBe('generate-song-title');
    });

    it('should have a labeled title', () => {
        const title = document.getElementById('generate-song-title');
        expect(title).not.toBeNull();
        expect(title.tagName).toBe('H3');
        expect(title.textContent).toBe('Song Generator');
    });

    it('should have properly associated labels for all select inputs', () => {
        const selects = [
            { id: 'gen-root-key', labelText: 'Root Key' },
            { id: 'gen-time-sig', labelText: 'Time Signature' },
            { id: 'gen-structure', labelText: 'Structure' },
        ];

        selects.forEach(({ id, labelText }) => {
            const select = document.getElementById(id);
            expect(select).not.toBeNull();

            const label = document.querySelector(`label[for="${id}"]`);
            expect(label).not.toBeNull();
            expect(label.textContent).toBe(labelText);
        });
    });

    it('should have accessible seed options when enabled', async () => {
        // Find the checkbox to enable seed options
        const seedCheckbox = document.querySelector('input[type="checkbox"]');
        expect(seedCheckbox).not.toBeNull();

        // Simulate click to enable seed options
        seedCheckbox.checked = true;
        seedCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

        // Wait for re-render
        await new Promise((resolve) => setTimeout(resolve, 50));

        const seedSelect = document.getElementById('gen-seed-type');
        expect(seedSelect).not.toBeNull();

        const label = document.querySelector(`label[for="gen-seed-type"]`);
        expect(label).not.toBeNull();
        expect(label.textContent).toBe('Seed as...');
    });
});
