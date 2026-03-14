import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useEnsembleState } from '../ui-bridge.js';

export function NotificationLayer() {
    const notifications = useEnsembleState((s) => s.playback.notifications);
    const [visibleNotify, setVisibleNotify] = useState([]);

    useEffect(() => {
        // Track unique IDs to manage exit animations if needed,
        // but for now we just filter the active ones from state.
        setVisibleNotify(notifications);
    }, [notifications]);

    if (!visibleNotify || visibleNotify.length === 0) {
        return null;
    }

    return (
        <div id="notificationLayer" class="notification-layer" role="alert" aria-live="polite">
            {visibleNotify.map((n) => (
                <div key={n.id} class="notification-box">
                    <span class="notification-icon">
                        {n.type === 'error' ? '⚠️' : n.type === 'success' ? '✅' : 'ℹ️'}
                    </span>
                    <div class="notification-content">
                        <div class="notification-message">{n.message}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}
