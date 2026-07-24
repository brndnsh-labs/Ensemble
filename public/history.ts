import { dispatch, getState } from './state.js';
import { ACTIONS } from './types.js';
import { showToast } from './ui.js';

export function pushHistory(): void {
    const { arranger } = getState();
    arranger.history.push(JSON.stringify(arranger.sections));
    if (arranger.history.length > 20) {
        arranger.history.shift();
    }
}

export function undo(refreshArrangerUI?: () => void): void {
    const { arranger } = getState();
    if (arranger.history.length === 0) {
        return;
    }
    const last = arranger.history.pop();
    if (!last) {
        return;
    }
    try {
        const parsed = JSON.parse(last);
        if (Array.isArray(parsed)) {
            // #1180: restore through the reducer rather than writing the slice
            // directly. `refreshArrangerUI()` below still re-syncs the worker and
            // refills its buffers; routing through dispatch additionally emits the
            // `arranger.sections` delta, so the worker isn't left generating over
            // the pre-undo progression in the window before that refresh lands.
            dispatch(ACTIONS.SET_PARAM, {
                module: 'arranger',
                param: 'sections',
                value: parsed,
            });
        } else {
            console.warn('[History] Undo failed: Snapshot is not an array');
            return;
        }
    } catch (e) {
        console.error('[History] Undo failed: Malformed history snapshot', e);
        return;
    }

    if (refreshArrangerUI) {
        refreshArrangerUI();
    }
    showToast('Undo successful');
}
