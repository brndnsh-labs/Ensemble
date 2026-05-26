import { dispatch } from './state.js';
import { ACTIONS } from './types.js';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

export interface ToastOptions {
    message: string;
    actions?: ToastAction[];
}

// Function handlers can't live in state (deepSignal slices are serializable
// snapshots), so we keep them in a module-local registry keyed by toast id.
// The renderer dispatches by label; expiry clears the entry.
const toastActionRegistry = new Map<string, Map<string, () => void>>();

export function showToast(arg: string | ToastOptions) {
    if (typeof arg === 'string') {
        dispatch(ACTIONS.SHOW_TOAST, arg);
        return;
    }
    const id = Math.random().toString(36).substring(2, 11);
    if (arg.actions && arg.actions.length > 0) {
        const map = new Map<string, () => void>();
        arg.actions.forEach((a) => map.set(a.label, a.onClick));
        toastActionRegistry.set(id, map);
    }
    dispatch(ACTIONS.SHOW_TOAST, {
        id,
        message: arg.message,
        actions: arg.actions?.map((a) => a.label),
    });
}

export function invokeToastAction(toastId: string, label: string): void {
    const actions = toastActionRegistry.get(toastId);
    const fn = actions?.get(label);
    if (fn) {
        // Run before clearing so the callback can dispatch its own toast / state
        // without racing the expiry path.
        fn();
        toastActionRegistry.delete(toastId);
        dispatch(ACTIONS.TOAST_EXPIRED, toastId);
    }
}

export function clearToastActions(toastId: string): void {
    toastActionRegistry.delete(toastId);
}

export function triggerFlash(intensity = 0.25) {
    dispatch(ACTIONS.TRIGGER_FLASH, intensity);
}
