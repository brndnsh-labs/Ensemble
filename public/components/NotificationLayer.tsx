import { invokeToastAction } from '../ui.js';
import { useEnsembleState } from '../ui-bridge.js';

interface Toast {
    id: string;
    message: string;
    actions?: string[];
    type?: string;
}

export function NotificationLayer() {
    const toasts = useEnsembleState((s) => s.playback.toasts ?? []) as Toast[];

    if (!toasts || toasts.length === 0) {
        return null;
    }

    return (
        <div id="notificationLayer" class="notification-layer" role="alert" aria-live="polite">
            {toasts.map((t) => (
                <div key={t.id} class="notification-box">
                    <span class="notification-icon">
                        {t.type === 'error' ? '⚠️' : t.type === 'success' ? '✅' : 'ℹ️'}
                    </span>
                    <div class="notification-content">
                        <div class="notification-message">{t.message}</div>
                        {t.actions && t.actions.length > 0 && (
                            <div class="notification-actions">
                                {t.actions.map((label) => (
                                    <button
                                        key={label}
                                        type="button"
                                        class="notification-action-btn"
                                        onClick={() => invokeToastAction(t.id, label)}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
