import { Workbox } from 'workbox-window';
import { dispatch } from './state.js';
import { ACTIONS } from './types.js';

interface InstallPromptChoice {
    outcome: 'accepted' | 'dismissed';
    platform: string;
}

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<InstallPromptChoice>;
    userChoice: Promise<InstallPromptChoice>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let wb: Workbox | null = null;

function setInstallButtonVisible(visible: boolean): void {
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
        installBtn.style.display = visible ? 'flex' : 'none';
    }
}

export function syncInstallButtonVisibility(): void {
    setInstallButtonVisible(deferredPrompt !== null);
}

export function initPWA(): void {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e as BeforeInstallPromptEvent;
        setInstallButtonVisible(true);
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        setInstallButtonVisible(false);
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
    const promptEvent = deferredPrompt;
    if (!promptEvent) {
        return false;
    }

    // The browser prompt is one-shot. Consume our reference before waiting for
    // the user's choice so a second click cannot try to reuse it, while a later
    // real `beforeinstallprompt` event can install a fresh prompt immediately.
    deferredPrompt = null;
    setInstallButtonVisible(false);
    const { outcome } = await promptEvent.prompt();
    return outcome === 'accepted';
}
