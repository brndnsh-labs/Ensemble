import { useEffect, useState } from 'react';

/** Registers the `/v2/` service worker and reports, in words, whether the app shell is offline-ready. */
export function useOfflineInstall(): string {
    const [offline, setOffline] = useState('Preparing offline access…');
    useEffect(() => {
        let alive = true;
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/v2/sw.js', { scope: '/v2/', updateViaCache: 'none' })
                .then(async (registration) => {
                    // navigator.serviceWorker.ready may resolve the old root app's
                    // worker. Only this registration earns the preview's ready label.
                    if (registration.active?.state !== 'activated') {
                        await new Promise<void>((resolve, reject) => {
                            const worker =
                                registration.installing ||
                                registration.waiting ||
                                registration.active;
                            if (!worker) {
                                reject(new Error('No preview worker'));
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
                    if (alive) {
                        setOffline(
                            registration.waiting
                                ? 'Update ready · close all music stand tabs to install'
                                : 'App available offline',
                        );
                    }
                    registration.addEventListener('updatefound', () => {
                        registration.installing?.addEventListener('statechange', () => {
                            if (registration.waiting && alive) {
                                setOffline('Update ready · close all music stand tabs to install');
                            }
                        });
                    });
                })
                .catch(() => {
                    if (alive) {
                        setOffline('Offline download unavailable · retry by reloading');
                    }
                });
        } else {
            setOffline('Offline installation unavailable in this browser');
        }
        return () => {
            alive = false;
        };
    }, []);
    return offline;
}
