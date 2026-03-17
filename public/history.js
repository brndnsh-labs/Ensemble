import { getState } from './state.js';
import { showToast } from './ui.js';

// We need some function references that are usually in main.js
// For now, we'll assume they are globally available or we'll pass them.
// Refactoring to use a more event-driven approach later.

export function pushHistory() {
    const { arranger } = getState();
    arranger.history.push(JSON.stringify(arranger.sections));
    if (arranger.history.length > 20) {
        arranger.history.shift();
    }
}

export function undo(refreshArrangerUI) {
    const { arranger } = getState();
    if (arranger.history.length === 0) {
        return;
    }
    const last = arranger.history.pop();
    try {
        const parsed = JSON.parse(last);
        if (Array.isArray(parsed)) {
            arranger.sections = parsed;
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
