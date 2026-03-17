import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { skipWaiting } from '../pwa.js';
import { useEnsembleState } from '../ui-bridge.js';

export function PWAUpdateBanner() {
    const updateAvailable = useEnsembleState((s) => s.playback.updateAvailable);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (updateAvailable) {
            // Small delay to ensure the element is mounted before animating in
            const timer = setTimeout(() => setIsVisible(true), 50);
            return () => clearTimeout(timer);
        } else {
            setIsVisible(false);
        }
    }, [updateAvailable]);

    if (!updateAvailable) {
        return null;
    }

    return (
        <div
            id="updateBanner"
            class={`update-banner ${isVisible ? 'show' : ''}`}
            role="alert"
            aria-live="polite"
        >
            <span>A new version is available.</span>
            <button id="updateRefreshBtn" onClick={skipWaiting} aria-label="Refresh to update app">
                Refresh
            </button>
        </div>
    );
}
