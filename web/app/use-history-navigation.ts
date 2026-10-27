import { type RefObject, useEffect, useRef } from 'react';
import { isNavEntry, type NavEntry, type NavView, navKey, stepTo } from '../lib/navigation';

/** What the shell hands `useHistoryNavigation`. */
interface HistoryNavigationOptions {
    /** The songbook has loaded: nothing is written to history, or read from it, before that. */
    ready: boolean;
    /** Where the musician is, as a history entry names it — a fresh object every render. */
    navView: NavView;
    /** The shell is running an action; a Back pressed meanwhile waits for it to settle. */
    busy: boolean;
    /** The shell's one-action-at-a-time lock (`run`), read when a popstate arrives. */
    working: RefObject<boolean>;
    /** Shows the view a history entry names; the shell's, since it opens and closes songs. */
    applyNav: (target: NavEntry, from: NavEntry | null) => void;
}

/** What `applyNav` needs back from the history machinery. */
interface HistoryNavigation {
    /** The entry this view stands on. `applyNav` moves it onto the entry it shows. */
    entry: RefObject<NavEntry | null>;
    /** Back was pressed once on an edited draft and warned; reset by every view change. */
    leaveDraftWarned: RefObject<boolean>;
    /** Steps history back onto `from` after a popstate the shell won't act on. */
    undoPop: (target: NavEntry, from: NavEntry | null) => void;
}

/**
 * Steps history back onto `from` after a popstate the shell won't act on (#1700) — a dialog
 * it closed instead, a chart that can't be left, a song that no longer exists. A traversal,
 * not a fresh push: it keeps the stack (and Forward) intact, and a pushed entry made without
 * a user gesture is one Chrome may skip on the next Back.
 */
function undoPop(
    silentPops: RefObject<number>,
    navEntry: RefObject<NavEntry | null>,
    target: NavEntry,
    from: NavEntry | null,
) {
    if (!from) {
        return;
    }
    silentPops.current += 1;
    navEntry.current = from;
    if (target.depth < from.depth) {
        window.history.forward();
    } else {
        window.history.back();
    }
}

/**
 * Browser history (#1700). Each view — the songbook, All songs, Standards, a song — is one
 * history entry (`lib/navigation.ts`), so Back returns to where the musician came from
 * instead of leaving the app. State-only entries: the URL never changes, because the hash
 * already belongs to `#chart=` links and a song id means nothing on another device.
 * `navEntry` is the entry this view stands on; `silentPops` counts the `history.go()`s the
 * shell made itself, whose popstate must not be read as the musician pressing Back.
 *
 * The shell keeps `applyNav`, which opens and closes songs through its own paths; this hook
 * writes each view change to history, reads Back and Forward, and hands `applyNav` the entry
 * refs and `undoPop` it needs. Call it above the shell's new-song keep effect: the pending-Back
 * effect here must run first.
 */
export function useHistoryNavigation({
    ready,
    navView,
    busy,
    working,
    applyNav,
}: HistoryNavigationOptions): HistoryNavigation {
    const navEntry = useRef<NavEntry | null>(null);
    const silentPops = useRef(0);
    const pendingNav = useRef<NavEntry | null>(null);
    const navStarted = useRef(false);
    // A view change that landed while one of the shell's own `history.go()`s was still in flight:
    // `history.state` is the old top until that pop arrives, so the step waits for it.
    const deferredNavSync = useRef(false);
    // Back was pressed once on an edited draft and told what leaving costs; the next one leaves.
    const leaveDraftWarned = useRef(false);
    const navViewKey = navKey(navView);

    const navViewRef = useRef(navView);
    navViewRef.current = navView;
    /** Writes the history step that reaches `view` from the entry on top now (#1700). */
    function syncHistory(view: NavView) {
        const history = window.history;
        if (!navStarted.current) {
            navStarted.current = true;
            const entry: NavEntry = {
                ensemble: 1,
                depth: view.kind === 'home' ? 0 : 1,
                view,
            };
            history.replaceState(entry, '');
            navEntry.current = entry;
            return;
        }
        const step = stepTo(view, history.state);
        if (step.kind === 'none') {
            navEntry.current = history.state as NavEntry;
        } else if (step.kind === 'replace') {
            history.replaceState(step.entry, '');
            navEntry.current = step.entry;
        } else if (step.kind === 'push') {
            history.pushState(step.entry, '');
            navEntry.current = step.entry;
        } else {
            // The entry it lands on is the right place already; its own state is rewritten when
            // the popstate arrives, so a level that changed meanwhile (Standards → All songs)
            // is recorded as what is now on screen.
            silentPops.current += 1;
            navEntry.current = step.entry;
            history.go(step.delta);
        }
    }
    // Every view change writes history: deeper pushes, shallower goes back (so Forward still
    // reopens what was left), level replaces. The first run claims the page's entry in place —
    // a reload lands on the songbook whatever entry it reloaded on.
    // biome-ignore lint/correctness/useExhaustiveDependencies: `navViewKey` names `navView` exactly.
    useEffect(() => {
        if (!ready) {
            return;
        }
        leaveDraftWarned.current = false;
        if (silentPops.current > 0) {
            deferredNavSync.current = true;
            return;
        }
        syncHistory(navView);
    }, [ready, navViewKey]);

    // Browser Back and Forward (#1700). Reuses the in-app paths — `closeSong`, `openSong`,
    // `openStandard`, the sub-views' own setters — so an unchecked chart, a recovered draft or a
    // missing song behaves exactly as it does from a button.
    // The handler reads only refs, and `applyNav` through `applyNavRef`'s latest closure.
    // `working` is the shell's lock ref: the same object every render, so naming it re-runs nothing.
    useEffect(() => {
        if (!ready) {
            return;
        }
        function onPopState(event: PopStateEvent) {
            if (silentPops.current > 0) {
                silentPops.current -= 1;
                if (navEntry.current) {
                    window.history.replaceState(navEntry.current, '');
                }
                if (silentPops.current === 0 && deferredNavSync.current) {
                    deferredNavSync.current = false;
                    syncHistoryRef.current(navViewRef.current);
                }
                return;
            }
            const target = event.state;
            if (!isNavEntry(target)) {
                // A fragment navigation the shell didn't write (`location.hash = …`).
                return;
            }
            const from = navEntry.current;
            const open = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
            if (open.length === 0 && document.querySelector('.menu')) {
                // An anchored menu (#1755) is open over the page, the Song menu among them
                // (#1756), or the transport's Key popover (#1757): Back closes it as it closes a
                // dialog. Both hear Escape on the document whatever has focus
                // (`useAnchoredDismiss`).
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                undoPop(silentPops, navEntry, target, from);
                return;
            }
            if (open.length > 0) {
                // Back closes what is open over the page first, as a phone's Back does, and the
                // page itself stays: step back onto its entry.
                for (const dialog of open) {
                    if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) {
                        dialog.close();
                    }
                }
                undoPop(silentPops, navEntry, target, from);
                return;
            }
            if (working.current) {
                pendingNav.current = target;
                return;
            }
            applyNavRef.current(target, from);
        }
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [ready, working]);
    const applyNavRef = useRef<(target: NavEntry, from: NavEntry | null) => void>(() => {});
    applyNavRef.current = applyNav;
    const syncHistoryRef = useRef(syncHistory);
    syncHistoryRef.current = syncHistory;
    // A Back pressed while the shell was busy is applied once it settles.
    useEffect(() => {
        if (!busy && pendingNav.current) {
            const target = pendingNav.current;
            pendingNav.current = null;
            applyNavRef.current(target, navEntry.current);
        }
    }, [busy]);

    return {
        entry: navEntry,
        leaveDraftWarned,
        undoPop: (target, from) => undoPop(silentPops, navEntry, target, from),
    };
}
