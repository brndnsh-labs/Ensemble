import { Workbox } from 'workbox-window';
import { dispatch } from './state.js';
import { ACTIONS } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let deferredPrompt: any;
let wb: Workbox | null = null;

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
        wb = new Workbox('./sw.js', { updateViaCache: 'none' });

        // #1048 — replaces a hand-rolled `newWorker` module variable that a
        // second update could clobber before the first worker's `statechange`
        // fired (#1046). Workbox tracks the waiting worker per-registration
        // internally, so `waiting` fires correctly whether a worker was
        // already waiting when we registered, or just finished installing —
        // one event covers both cases the old code hand-coded separately.
        wb.addEventListener('waiting', () => {
            dispatch(ACTIONS.SET_UPDATE_AVAILABLE, true);
        });

        let refreshing = false;
        wb.addEventListener('controlling', () => {
            if (refreshing) {
                return;
            }
            refreshing = true;
            window.location.reload();
        });

        wb.register()
            .then(() => {
                wb?.update();

                setInterval(
                    () => {
                        wb?.update();
                    },
                    60 * 60 * 1000,
                );

                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        wb?.update();
                    }
                });
            })
            .catch((err) => console.error('SW failed', err));
    }
}

export function skipWaiting(): void {
    // Targets whatever's currently waiting on the live registration — not a
    // captured reference, so it can't go stale the way the old `newWorker`
    // var could.
    wb?.messageSkipWaiting();
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
