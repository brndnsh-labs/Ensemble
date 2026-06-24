import { hasAnyPackInstalled } from './engine/instrument-registry.js';
import { dispatch } from './state.js';
import { ACTIONS } from './types.js';
import { showToast } from './ui.js';

/**
 * One-time, dismissible nudge steering a fresh synth-only user toward installing
 * a sound pack (#684).
 *
 * The app runs on lightweight synths by default (fast load, nothing downloaded —
 * intended). This is the single gentle signpost that real instruments sound
 * markedly better, *without* compromising "simple to use": it fires at most once
 * ever, only when zero packs are installed, and is suppressed permanently the
 * moment the user dismisses it OR installs any pack.
 */

/**
 * localStorage flag persisting "the user has already seen the nudge". Set the
 * instant we show it, so the at-most-once guarantee holds even if the user
 * ignores it (the toast auto-expires) or reloads — never repeated.
 */
export const PACK_NUDGE_SEEN_KEY = 'ensemble.packNudgeSeen';

/** Open Settings on the Packs tab — where "Install all" lives. */
function openPacksSettings(): void {
    dispatch(ACTIONS.SET_SETTINGS_TAB, 'packs');
    dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: true });
}

/**
 * Show the pack-install nudge if (and only if) the user has never seen it and
 * has no packs installed. Safe to call unconditionally — it self-gates. Marks
 * itself seen before showing so it can only ever fire once.
 *
 * Callers defer this past first paint (see `main.ts`) so it never competes with
 * the fast-load story or blocks interaction.
 */
export function maybeShowPackInstallNudge(): void {
    if (localStorage.getItem(PACK_NUDGE_SEEN_KEY)) {
        return;
    }
    // Already has real instruments — no reason to nudge.
    if (hasAnyPackInstalled()) {
        return;
    }
    // Persist "seen" up front: at-most-once, survives reload, fires even if the
    // toast is ignored rather than explicitly dismissed.
    localStorage.setItem(PACK_NUDGE_SEEN_KEY, '1');

    showToast({
        message: '🎹 Hear the band with real instruments — add a free sound pack.',
        actions: [
            { label: 'Open Packs', onClick: openPacksSettings },
            // The "seen" flag is already set above, so dismissing just closes the
            // toast (invokeToastAction expires it after the callback runs).
            { label: 'Dismiss', onClick: () => {} },
        ],
    });
}
