import { useEffect, useState } from 'preact/hooks';
import { useEnsembleState } from '../ui-bridge.js';

export function NotificationLayer() {
    const notifications = useEnsembleState((s) => (s.playback as any).notifications ?? []);
    const [visibleNotify, setVisibleNotify] = useState<any[]>([]);

    useEffect(() => {
        setVisibleNotify(notifications);
    }, [notifications]);

    if (!visibleNotify || visibleNotify.length === 0) {
        return null;
    }

    return (
        <div id="notificationLayer" class="notification-layer" role="alert" aria-live="polite">
            {visibleNotify.map((n: any) => (
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
