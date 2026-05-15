import { describe, expect, it, vi } from 'vitest';
import { dispatch } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';
import { showToast, triggerFlash } from '../../../public/ui.js';

// Mock the state module to track calls to dispatch
vi.mock('../../../public/state.js', () => ({
    dispatch: vi.fn(),
}));

describe('UI Utilities', () => {
    it('showToast should dispatch SHOW_TOAST action with message', () => {
        const testMsg = 'Test Toast Message';
        showToast(testMsg);
        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SHOW_TOAST, testMsg);
    });

    it('triggerFlash should dispatch TRIGGER_FLASH action with default intensity', () => {
        triggerFlash();
        expect(dispatch).toHaveBeenCalledWith(ACTIONS.TRIGGER_FLASH, 0.25);
    });

    it('triggerFlash should dispatch TRIGGER_FLASH action with custom intensity', () => {
        const customIntensity = 0.5;
        triggerFlash(customIntensity);
        expect(dispatch).toHaveBeenCalledWith(ACTIONS.TRIGGER_FLASH, customIntensity);
    });
});
