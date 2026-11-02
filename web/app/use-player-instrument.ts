import { useCallback, useEffect, useState } from 'react';
import { instrumentLane, type PlayerInstrument } from '../lib/instrument';
import * as runtime from '../lib/runtime';
import { playerInstrument, rememberPlayerInstrument } from '../lib/session';

/**
 * "What do you play?" (#1992): the musician's own instrument on this device — a per-device
 * convenience, never a document field, the `use-neck-prefs.ts` pattern. The first render knows
 * nothing (the static export prerenders without storage), so `asked` stays false until the stored
 * answer has been read: the stand never flashes the question at someone who answered it.
 *
 * Every change is handed to the runtime (`setPlayerLane`), which mutes the instrument's lane on
 * every chart it opens — the default, composed at read time, never written into the chart.
 */
export function usePlayerInstrument() {
    const [instrument, setInstrument] = useState<PlayerInstrument | null>(null);
    const [read, setRead] = useState(false);
    // The runtime hears of a change before React re-renders, so the render that shows it reads
    // the runtime's new lane (`runtime.laneHeard`), not the old one.
    useEffect(() => {
        const stored = playerInstrument();
        runtime.setPlayerLane(instrumentLane(stored));
        setInstrument(stored);
        setRead(true);
    }, []);
    const choose = useCallback((next: PlayerInstrument) => {
        rememberPlayerInstrument(next);
        runtime.setPlayerLane(instrumentLane(next));
        setInstrument(next);
    }, []);
    return {
        instrument,
        /** The stored answer has been read and there is none: time to ask, once. */
        unasked: read && instrument === null,
        choose,
    };
}
