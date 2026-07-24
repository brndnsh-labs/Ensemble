/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../../public/state.js';

const { arranger } = getState();

import { pushHistory, undo } from '../../../public/history.js';

// Mock UI and dependencies
vi.mock('../../../public/ui.js', () => ({
    ui: {},
    showToast: vi.fn(),
    renderSections: vi.fn(),
    updateActiveChordUI: vi.fn(),
    renderChordVisualizer: vi.fn(),
}));

vi.mock('../../../public/engine/chords-engine.js', () => ({
    validateProgression: vi.fn((chords) => chords()),
}));

vi.mock('../../../public/controllers/instrument-controller.js', () => ({
    flushBuffers: vi.fn(),
}));

vi.mock('../../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

describe('History / Undo System', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        arranger.sections = [{ id: '1', label: 'Intro', value: 'I' }];
        arranger.history = [];
    });

    it('should push a snapshot of sections to history', () => {
        pushHistory();
        expect(arranger.history.length).toBe(1);

        const snapshot = JSON.parse(arranger.history[0]);
        expect(snapshot[0].label).toBe('Intro');
    });

    it('should restore sections on undo', () => {
        pushHistory();

        // Change state
        arranger.sections[0].label = 'Verse';
        arranger.sections.push({ id: '2', label: 'Chorus', value: 'IV' });

        const refreshMock = vi.fn();
        undo(refreshMock);

        expect(arranger.sections.length).toBe(1);
        expect(arranger.sections[0].label).toBe('Intro');
        expect(refreshMock).toHaveBeenCalled();
    });

    it('should maintain a maximum limit of 20 undo steps', () => {
        for (let i = 0; i < 25; i++) {
            arranger.sections = [{ id: '1', label: `Step ${i}`, value: 'I' }];
            pushHistory();
        }

        expect(arranger.history.length).toBe(20);
        // The first 5 should have been shifted out
        const firstInStack = JSON.parse(arranger.history[0]);
        expect(firstInStack[0].label).toBe('Step 5');
    });

    it('should deep copy sections to prevent reference pollution', () => {
        pushHistory();

        // Modify the object directly (simulating a mutation bug)
        arranger.sections[0].label = 'MUTATED';

        undo();

        // If it was a shallow copy, this would be 'MUTATED'
        expect(arranger.sections[0].label).toBe('Intro');
    });
});
