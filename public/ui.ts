import { dispatch } from './state.js';
import { ACTIONS } from './types.js';

export function showToast(msg: string) {
    dispatch(ACTIONS.SHOW_TOAST, msg);
}

export function triggerFlash(intensity = 0.25) {
    dispatch(ACTIONS.TRIGGER_FLASH, intensity);
}
