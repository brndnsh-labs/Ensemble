// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateSongModal } from '../../public/components/GenerateSongModal.jsx';
import { getState } from '../../public/state.js';

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

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
    ACTIONS: { SET_MODAL_OPEN: 'SET_MODAL_OPEN' },
    subscribe: vi.fn(() => () => {}),
}));

describe('Song Generator Modal', () => {
    // Helper to render with specific modal state
    const renderWithState = (isOpen) => {
        vi.mocked(getState).mockReturnValue({
            playback: { modals: { generateSong: isOpen }, isPlaying: false },
            arranger: { totalSteps: 64 },
        });
        render(<GenerateSongModal />, document.getElementById('modalContainer'));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="modalContainer"></div>';
    });

    it('should be initially hidden', () => {
        renderWithState(false);
        const modal = document.getElementById('generateSongOverlay');
        expect(modal.classList.contains('active')).toBe(false);
    });

    it('should be visible when state is open', () => {
        renderWithState(true);
        const modal = document.getElementById('generateSongOverlay');
        expect(modal.classList.contains('active')).toBe(true);
    });
});
