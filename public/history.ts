import { getState } from './state.js';
import type { Mutable } from './types.js';
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
            (arranger as Mutable<typeof arranger>).sections = parsed; // @direct-mutation
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
