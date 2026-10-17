import { useEffect, useState } from 'react';

/**
 * Registers this app's service worker at the site root and reports whether the app shell is
 * offline-ready, both in words and as the three-state fact `lib/sync/status.ts` wants (#1266). They are one observation
 * with two readers, not two: `'unknown'` is the honest answer until the registration settles, and
 * a shell that failed to install is `'missing'`, never quietly unknown.
 */
export interface OfflineInstall {
    label: string;
    shell: 'unknown' | 'verified' | 'missing';
}

export function useOfflineInstall(): OfflineInstall {
    const [offline, setOffline] = useState<OfflineInstall>({
        label: 'Preparing offline access…',
        shell: 'unknown',
    });
    useEffect(() => {
        let alive = true;
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/sw.js', { scope: '/', updateViaCache: 'none' })
                .then(async (registration) => {
                    // Wait on THIS registration's worker: only a shell that finished
                    // installing earns the ready label.
                    if (registration.active?.state !== 'activated') {
                        await new Promise<void>((resolve, reject) => {
                            const worker =
                                registration.installing ||
                                registration.waiting ||
                                registration.active;
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
                    // A waiting update means the shell IS installed and verified — the newer one
                    // simply cannot activate while a tab holds the old one open.
                    const installed = (label: string): OfflineInstall => ({
                        label,
                        shell: 'verified',
                    });
                    if (alive) {
                        setOffline(
                            installed(
                                registration.waiting
                                    ? 'Update ready · close all music stand tabs to install'
                                    : 'App available offline',
                            ),
                        );
                    }
                    registration.addEventListener('updatefound', () => {
                        registration.installing?.addEventListener('statechange', () => {
                            if (registration.waiting && alive) {
                                setOffline(
                                    installed(
                                        'Update ready · close all music stand tabs to install',
                                    ),
                                );
                            }
                        });
                    });
                })
                .catch(() => {
                    if (alive) {
                        setOffline({
                            label: 'Offline download unavailable · retry by reloading',
                            shell: 'missing',
                        });
                    }
                });
        } else {
            setOffline({
                label: 'Offline installation unavailable in this browser',
                shell: 'missing',
            });
        }
        return () => {
            alive = false;
        };
    }, []);
    return offline;
}
