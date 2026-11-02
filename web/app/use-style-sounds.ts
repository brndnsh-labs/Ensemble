import { useEffect, useEffectEvent, useRef, useState } from 'react';
import * as runtime from '../lib/runtime';

/**
 * The style's sounds fetched behind the band (#1997): what the stand's one quiet line says
 * (`runtime.styleSoundsStatus`), and the shell's callback for when Follow-feel lanes moved onto
 * sounds that arrived (`runtime.onSoundsResolved`), so it can show the document as resolved on
 * this device rather than as an unsaved change. `onResolved` answers false when an action holds
 * the shell; it runs again once the shell is free (`busy` turning false).
 */
export function useStyleSounds(
    onResolved: () => boolean,
    busy: boolean,
): runtime.StyleSoundsStatus {
    const [status, setStatus] = useState(runtime.styleSoundsStatus);
    const pending = useRef(false);
    const resolved = useEffectEvent(() => {
        pending.current = !onResolved();
    });
    useEffect(() => {
        setStatus(runtime.styleSoundsStatus());
        const offStatus = runtime.onStyleSoundsStatus(() => setStatus(runtime.styleSoundsStatus()));
        const offResolved = runtime.onSoundsResolved(() => resolved());
        return () => {
            offStatus();
            offResolved();
        };
    }, []);
    useEffect(() => {
        if (!busy && pending.current) {
            resolved();
        }
    }, [busy]);
    return status;
}
