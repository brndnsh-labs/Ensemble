/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */

import { h, render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateSongModal } from '../../../public/components/GenerateSongModal.jsx';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

// Mock dependencies
vi.mock('../../../public/persistence.js', () => ({ saveCurrentState: vi.fn() }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../../public/instrument-controller.js', () => ({ flushBuffers: vi.fn() }));
vi.mock('../../../public/engine/engine.js', () => ({ restoreGains: vi.fn() }));
vi.mock('../../../public/conductor.js', () => ({ analyzeFormUI: vi.fn() }));
vi.mock('../../../public/chords.js', () => ({
    validateProgression: vi.fn((cb) => cb()),
    transformRelativeProgression: vi.fn(),
}));

describe('GenerateSongModal Crash Test', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="app"></div>';
        const state = getState();
        state.playback.modals.generateSong = true;
    });

    it('should generate song without throwing errors', async () => {
        const root = document.getElementById('app');
        render(<GenerateSongModal />, root);

        const btn = document.querySelector('.primary-btn');
        expect(btn).not.toBeNull();

        const consoleErrorSpy = vi.spyOn(console, 'error');

        await btn.click();

        // Wait for the simulated 800ms generation delay
        await new Promise((r) => setTimeout(r, 1000));

        if (consoleErrorSpy.mock.calls.length > 0) {
            console.log('Error caught:', consoleErrorSpy.mock.calls[0]);
        }

        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
});
