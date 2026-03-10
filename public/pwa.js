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
            .register('./sw.js')
            .then((reg) => {
                console.log('SW registered');

                setInterval(
                    () => {
                        reg.update();
                    },
                    60 * 60 * 1000,
                );

                reg.addEventListener('updatefound', () => {
                    newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
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

export async function triggerInstall() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        return outcome === 'accepted';
    }
    return false;
}
