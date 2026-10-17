import type { ReactNode, RefObject } from 'react';
import { useRef } from 'react';
import { dialogRule } from './dialog-close';

export const BAND_TABS = [
    { id: 'players', label: 'Players' },
    { id: 'groove', label: 'Groove' },
    { id: 'trade', label: 'Trade' },
    { id: 'practice', label: 'Practice' },
] as const;
export type BandTab = (typeof BAND_TABS)[number]['id'];

interface BandSheetProps {
    /** Owned by the shell, which drives `showModal()`/`close()` from its `bandTab` state. */
    dialogRef: RefObject<HTMLDialogElement | null>;
    tab: BandTab;
    onTab: (tab: BandTab) => void;
    onClose: () => void;
    /** Shown inside the sheet while it is open — the page's banner sits behind the backdrop. */
    error: string;
    players: ReactNode;
    groove: ReactNode;
    trade: ReactNode;
    practice: ReactNode;
}

/**
 * Everything about the band in one place (#1703): who plays and on what sound (Players), how they
 * play (Groove), trading turns (Trade), and the practice aids (Practice). It replaced three sheets —
 * Sounds in the song header, Feel & mix behind the transport's More…, and Trade — which split one
 * job over three entry points, and let "feel" name three different things. The transport's lane
 * chips stay as quick on/off toggles.
 */
export function BandSheet({
    dialogRef,
    tab,
    onTab,
    onClose,
    error,
    players,
    groove,
    trade,
    practice,
}: BandSheetProps) {
    const tabs = useRef<Map<BandTab, HTMLButtonElement>>(new Map());
    const panels: Record<BandTab, ReactNode> = { players, groove, trade, practice };
    // The ARIA tabs pattern's arrow keys: the tab row is one stop for Tab, and the arrows move
    // along it, selecting as they go.
    function step(delta: number) {
        const index = BAND_TABS.findIndex((entry) => entry.id === tab);
        const next = BAND_TABS[(index + delta + BAND_TABS.length) % BAND_TABS.length].id;
        onTab(next);
        tabs.current.get(next)?.focus();
    }
    return (
        <dialog
            className="feel-panel band-panel"
            ref={dialogRef}
            aria-labelledby="band-title"
            {...dialogRule({ onClose })}
        >
            <div className="feel-heading">
                <h2 id="band-title">Band</h2>
                <button className="icon-button" aria-label="Close band" onClick={onClose}>
                    ✕
                </button>
            </div>
            <div className="band-tabs" role="tablist" aria-label="Band settings">
                {BAND_TABS.map((entry) => (
                    <button
                        key={entry.id}
                        ref={(node) => {
                            if (node) {
                                tabs.current.set(entry.id, node);
                            }
                        }}
                        type="button"
                        role="tab"
                        id={`band-tab-${entry.id}`}
                        aria-selected={tab === entry.id}
                        aria-controls={`band-panel-${entry.id}`}
                        tabIndex={tab === entry.id ? 0 : -1}
                        onClick={() => onTab(entry.id)}
                        onKeyDown={(event) => {
                            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                                event.preventDefault();
                                step(event.key === 'ArrowRight' ? 1 : -1);
                            }
                        }}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>
            {error && (
                <div className="error-banner" role="alert">
                    {error}
                </div>
            )}
            <div
                className="band-tab-panel"
                role="tabpanel"
                id={`band-panel-${tab}`}
                aria-labelledby={`band-tab-${tab}`}
            >
                {panels[tab]}
            </div>
        </dialog>
    );
}
