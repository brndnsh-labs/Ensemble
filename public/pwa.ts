import { dispatch } from './state.js';
import { ACTIONS } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let deferredPrompt: any;
let newWorker: ServiceWorker | null;

// Flag an available update once a newly-installing worker reaches the
// `installed` state while another worker still controls the page. Checks the
// captured `worker` param's OWN state, not the shared `newWorker` module var —
// when two updates land close together (e.g. a run of quick redeploys to
// TEST), `newWorker` may already point at a second, still-installing worker
// by the time the first one's `statechange` fires, silently swallowing the
// flag. Also checks immediately after attaching: a fast install (cached
// assets) can reach `installed` before the listener attaches (the
// MDN-documented missed-transition race), so a future-only event would never
// see it.
function registerUpdateOnInstalled(worker: ServiceWorker): void {
    const flagIfInstalled = () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            dispatch(ACTIONS.SET_UPDATE_AVAILABLE, true);
        }
    };
    worker.addEventListener('statechange', flagIfInstalled);
    flagIfInstalled();
}

export function initPWA(): void {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const installBtn = document.getElementById('installAppBtn');
        if (installBtn) {
            installBtn.style.display = 'flex';
        }
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        const installBtn = document.getElementById('installAppBtn');
        if (installBtn) {
            installBtn.style.display = 'none';
        }
        dispatch(ACTIONS.SHOW_TOAST, 'App installed successfully!');
    });

    const isLocalhost = Boolean(
        window.location.hostname === 'localhost' ||
            window.location.hostname === '[::1]' ||
            window.location.hostname.match(
                /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/,
            ),
    );

    if ('serviceWorker' in navigator && !navigator.webdriver && !isLocalhost) {
        navigator.serviceWorker
            .register('./sw.js', { updateViaCache: 'none' })
            .then((reg) => {
                reg.update();

                if (reg.waiting) {
                    newWorker = reg.waiting;
                    dispatch(ACTIONS.SET_UPDATE_AVAILABLE, true);
                }

                if (reg.installing) {
                    newWorker = reg.installing;
                    if (newWorker) {
                        registerUpdateOnInstalled(newWorker);
                    }
                }

                setInterval(
                    () => {
                        reg.update();
                    },
                    60 * 60 * 1000,
                );

                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        reg.update();
                    }
                });

                reg.addEventListener('updatefound', () => {
                    newWorker = reg.installing;
                    if (newWorker) {
                        registerUpdateOnInstalled(newWorker);
                    }
                });
            })
            .catch((err) => console.error('SW failed', err));

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) {
                return;
            }
            window.location.reload();
            refreshing = true;
        });
    }
}

export function skipWaiting(): void {
    if (newWorker) {
        newWorker.postMessage({ type: 'SKIP_WAITING' });
    }
}

export async function triggerInstall(): Promise<boolean> {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        return outcome === 'accepted';
    }
    return false;
}
