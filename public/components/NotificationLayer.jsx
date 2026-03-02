import { Fragment, h } from 'preact';
import React, { useEffect, useState } from 'preact/compat';
import { useEnsembleState } from '../ui-bridge.js';
import { PWAUpdateBanner } from './PWAUpdateBanner.jsx';

/**
 * ToastItem handles the animation lifecycle for an individual toast.
 */
function ToastItem({ message }) {
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        // We know the toast will be unmounted by the state manager after 2s.
        // We trigger the closing animation slightly before that.
        const timer = setTimeout(() => {
            setIsClosing(true);
        }, 1700); // Start exit animation before unmount (2000ms - 300ms)

        return () => clearTimeout(timer);
    }, []);

    return <div class={`toast ${isClosing ? 'closing' : ''}`}>{message}</div>;
}

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
                    flexDirection: 'column-reverse', // Newest at bottom
                    gap: '0.5rem',
                    pointerEvents: 'none',
                    alignItems: 'center',
                }}
            >
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} message={toast.message} />
                ))}
            </div>
        </Fragment>
    );
}
