import { useEffect, useRef, useState } from 'react';

/**
 * Registers this app's service worker at the site root and reports whether the app shell is
 * offline-ready, both in words and as the three-state fact `lib/sync/status.ts` wants (#1266). They are one observation
 * with two readers, not two: `'unknown'` is the honest answer until the registration settles, and
 * a shell that failed to install is `'missing'`, never quietly unknown.
 *
 * It also carries the update (#1889). A newer release installs and then waits behind the running
 * one; `update` asks it to take over now. When the worker changes, every open tab reloads, because
 * the new worker deletes the old release's cache and an old page left running would miss its own
 * lazy chunks. A tab that is `busy` (playing, or holding unsaved work) is not reloaded out from
 * under the musician: it reloads once it is idle, or when they press Reload.
 */
export interface OfflineInstall {
    label: string;
    shell: 'unknown' | 'verified' | 'missing';
    /**
     * `ready`: a newer release is installed and waiting. `deferred`: it has taken over, and this
     * busy tab still runs the old one.
     */
    update: 'none' | 'ready' | 'deferred';
    /** Ready: ask the waiting worker to take over (every tab then reloads). Deferred: reload. */
    applyUpdate: () => void;
}

type Install = Pick<OfflineInstall, 'label' | 'shell'>;

const READY = 'App available offline';

function reload(reloading: { current: boolean }) {
    reloading.current = true;
    window.location.reload();
    // Still here after the reload's turn: the musician cancelled it at the leave warning, so
    // the tab may ask again (when it next goes idle, or on Reload).
    window.setTimeout(() => {
        reloading.current = false;
    }, 0);
}

export function useOfflineInstall(busy: boolean): OfflineInstall {
    const [offline, setOffline] = useState<Install>({
        label: 'Preparing offline access…',
        shell: 'unknown',
    });
    const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
    const [deferred, setDeferred] = useState(false);
    const busyNow = useRef(busy);
    busyNow.current = busy;
    // The tab whose Reload set the update off reloads whatever it is doing: that was its ask.
    const asked = useRef(false);
    // A reload is under way. Set first, so nothing asks twice; a reload the musician cancels
    // (the leave warning's Stay) leaves the tab `deferred`, and Reload asks again.
    const reloading = useRef(false);
    useEffect(() => {
        let alive = true;
        if (!('serviceWorker' in navigator)) {
            setOffline({
                label: 'Offline installation unavailable in this browser',
                shell: 'missing',
            });
            return;
        }
        // Only a page that a worker already controlled is running a release the new one replaces.
        // A first install's `clients.claim()` also changes the controller, from none, and that is
        // no reason to reload; the next change in this same page is. (A Shift-reloaded page
        // starts uncontrolled too, so it reloads only if it pressed Reload itself.)
        let controlled = navigator.serviceWorker.controller !== null;
        const changed = () => {
            if (!alive) {
                return;
            }
            // Whatever was waiting has taken over: there is nothing left to ask.
            setWaiting(null);
            if (!controlled && !asked.current) {
                controlled = true;
                return;
            }
            setDeferred(true);
            if (!reloading.current && (asked.current || !busyNow.current)) {
                reload(reloading);
            }
        };
        navigator.serviceWorker.addEventListener('controllerchange', changed);
        navigator.serviceWorker
            .register('/sw.js', { scope: '/', updateViaCache: 'none' })
            .then(async (registration) => {
                // Wait on THIS registration's worker: only a shell that finished
                // installing earns the ready label.
                if (registration.active?.state !== 'activated') {
                    await new Promise<void>((resolve, reject) => {
                        const worker =
                            registration.installing || registration.waiting || registration.active;
                        if (!worker) {
                            reject(new Error('No service worker'));
                            return;
                        }
                        const check = () => {
                            if (worker.state === 'activated') {
                                worker.removeEventListener('statechange', check);
                                resolve();
                            }
                            if (worker.state === 'redundant') {
                                worker.removeEventListener('statechange', check);
                                reject(new Error('Offline installation failed'));
                            }
                        };
                        worker.addEventListener('statechange', check);
                        check();
                    });
                }
                if (!alive) {
                    return;
                }
                // A waiting update means the shell IS installed and verified — the newer one
                // simply waits for the musician's Reload (or for every tab to close).
                setOffline({ label: READY, shell: 'verified' });
                setWaiting(registration.waiting);
                const watch = (worker: ServiceWorker | null) =>
                    worker?.addEventListener('statechange', () => {
                        if (alive && registration.waiting) {
                            setWaiting(registration.waiting);
                        }
                    });
                // An update the page load's own check found may already be installing.
                watch(registration.installing);
                registration.addEventListener('updatefound', () => watch(registration.installing));
            })
            .catch(() => {
                if (alive) {
                    setOffline({
                        label: 'Offline download unavailable · retry by reloading',
                        shell: 'missing',
                    });
                }
            });
        return () => {
            alive = false;
            navigator.serviceWorker.removeEventListener('controllerchange', changed);
        };
    }, []);
    // A deferred tab reloads the moment it has nothing to lose: the band stopped, the edit saved.
    useEffect(() => {
        if (deferred && !busy && !reloading.current) {
            reload(reloading);
        }
    }, [deferred, busy]);
    const update = deferred ? 'deferred' : waiting ? 'ready' : 'none';
    return {
        ...offline,
        label:
            update === 'deferred'
                ? busy
                    ? 'Updated · reloads when you stop'
                    : 'Updated · reload to finish'
                : update === 'ready'
                  ? 'Update ready'
                  : offline.label,
        update,
        applyUpdate: () => {
            if (deferred) {
                reload(reloading);
                return;
            }
            asked.current = true;
            waiting?.postMessage({ type: 'skip-waiting' });
        },
    };
}
