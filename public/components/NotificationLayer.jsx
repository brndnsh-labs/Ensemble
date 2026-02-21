import { Fragment, h } from 'preact';
import React from 'preact/compat';
import { useEnsembleState } from '../ui-bridge.js';
import { PWAUpdateBanner } from './PWAUpdateBanner.jsx';

export function NotificationLayer() {
    const { toasts, flashIntensity } = useEnsembleState((s) => ({
        toasts: s.playback.toasts,
        flashIntensity: s.playback.flashIntensity,
    }));

    return (
        <Fragment>
            <PWAUpdateBanner />
            {/* Flash Overlay */}
            <div
                id="flashOverlay"
                style={{
                    opacity: flashIntensity,
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'white',
                    pointerEvents: 'none',
                    zIndex: 9999,
                    transition: flashIntensity > 0 ? 'none' : 'opacity 0.1s ease-out',
                }}
            />

            {/* Toasts Container */}
            <div
                class="toasts-container"
                style={{
                    position: 'fixed',
                    bottom: '2rem',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 10000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    pointerEvents: 'none',
                }}
            >
                {toasts.map((toast) => (
                    <div key={toast.id} class="toast show" style={{ pointerEvents: 'auto' }}>
                        {toast.message}
                    </div>
                ))}
            </div>
        </Fragment>
    );
}
