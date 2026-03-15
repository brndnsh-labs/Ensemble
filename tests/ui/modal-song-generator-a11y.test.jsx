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
        expect(title.tagName).toBe('H2');
        expect(title.textContent).toBe('Inspiration Hub');
    });

    it('should have properly associated labels for select inputs', async () => {
        // Switch to Generator tab
        const buttons = Array.from(document.querySelectorAll('button'));
        const genTab = buttons.find((b) => b.textContent.includes('Randomize'));
        if (genTab) {
            genTab.click();
        }

        // Wait for re-render
        await new Promise((resolve) => setTimeout(resolve, 50));

        const expectedLabels = ['Root Key', 'Time Signature', 'Structure'];

        expectedLabels.forEach((labelText) => {
            const labels = Array.from(document.querySelectorAll('.setting-label'));
            const foundLabel = labels.find((l) => l.textContent.includes(labelText));
            expect(foundLabel).not.toBeNull();
        });
    });

    it('should have accessible seed options when enabled', async () => {
        // Switch to Generator tab
        const buttons = Array.from(document.querySelectorAll('button'));
        const genTab = buttons.find((b) => b.textContent.includes('Randomize'));
        if (genTab) {
            genTab.click();
        }

        // Wait for re-render
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Find all setting rows
        const rows = Array.from(document.querySelectorAll('.setting-row'));
        const seedRow = rows.find((r) => r.textContent.includes('Seed Source'));
        expect(seedRow).not.toBeUndefined();

        const seedSelect = seedRow.querySelector('select');
        expect(seedSelect).not.toBeNull();

        // Simulate click to enable seed options
        seedSelect.value = 'existing';
        seedSelect.dispatchEvent(new Event('change', { bubbles: true }));

        // Wait for re-render
        await new Promise((resolve) => setTimeout(resolve, 50));

        const seedTypeSelect = document.getElementById('gen-seed-type');
        expect(seedTypeSelect).not.toBeNull();

        const labels = Array.from(document.querySelectorAll('.setting-label'));
        const foundLabel = labels.find((l) => l.textContent.includes('Treat Seed as...'));
        expect(foundLabel).not.toBeNull();
    });
});
