import { dispatch } from './state.js';
import { ACTIONS } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let deferredPrompt: any;
let newWorker: ServiceWorker | null;

// Flag an available update once a newly-installing worker reaches the
// `installed` state while another worker still controls the page.
function registerUpdateOnInstalled(worker: ServiceWorker): void {
    worker.addEventListener('statechange', () => {
        if (newWorker && newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            dispatch(ACTIONS.SET_UPDATE_AVAILABLE, true);
        }
    });
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
