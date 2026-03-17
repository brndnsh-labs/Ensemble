/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../../public/state.js';
import { undo } from '../../../public/history.js';

const { arranger } = getState();

// Mock dependencies
vi.mock('../../../public/ui.js', () => ({
    showToast: vi.fn(),
}));

describe('History Security', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        arranger.sections = [{ id: '1', label: 'Intro', value: 'I' }];
        arranger.history = [];
    });

    it('should not crash when undoing with malformed JSON in history', () => {
        arranger.history.push('{ invalid json');

        // This is expected to fail currently
        expect(() => undo()).not.toThrow();
    });

    it('should not crash and not update sections when history contains non-array JSON', () => {
        const initialSections = [...arranger.sections];
        arranger.history.push(JSON.stringify({ not: 'an array' }));

        undo();

        expect(arranger.sections).toEqual(initialSections);
    });
});
