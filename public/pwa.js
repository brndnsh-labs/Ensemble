import { dispatch } from './state.js';
import { ACTIONS } from './types.js';

let deferredPrompt;
let newWorker;

export function initPWA() {
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

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker
            .register('./sw.js', { updateViaCache: 'none' })
            .then((reg) => {
                console.log('SW registered');
                reg.update();

                // 1. Check if there's already a worker waiting from a previous session
                if (reg.waiting) {
                    newWorker = reg.waiting;
                    dispatch(ACTIONS.SET_UPDATE_AVAILABLE, true);
                }

                // 2. Check if a worker is currently installing
                if (reg.installing) {
                    newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            dispatch(ACTIONS.SET_UPDATE_AVAILABLE, true);
                        }
                    });
                }

                // 3. Check for updates every hour, but also check immediately on load
                setInterval(
                    () => {
                        reg.update();
                    },
                    60 * 60 * 1000,
                );

                // Trigger a check when the page is focused or becomes visible
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        reg.update();
                    }
                });

                // 3. Listen for new workers being installed
                reg.addEventListener('updatefound', () => {
                    newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        // Only notify the user once the new worker is fully installed (waiting to activate)
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            dispatch(ACTIONS.SET_UPDATE_AVAILABLE, true);
                        }
                    });
                });
            })
            .catch((err) => console.log('SW failed', err));

        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) {
                return;
            }
            window.location.reload();
            refreshing = true;
        });
    }
}

export function skipWaiting() {
    if (newWorker) {
        newWorker.postMessage({ type: 'SKIP_WAITING' });
    }
}

export async function triggerInstall() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        return outcome === 'accepted';
    }
    return false;
}
