import type { SoloistTradeBars, SoloistTradeWith } from '@engine/songbook/types';
import type { RefObject } from 'react';
import type { ChartDocument } from '../lib/runtime';
import { whenClosed } from './dialog-close';

const TURNS: { value: SoloistTradeBars; label: string }[] = [
    { value: 2, label: 'Twos (2 bars)' },
    { value: 4, label: 'Fours (4 bars)' },
    { value: 8, label: 'Eights (8 bars)' },
];

interface TradeSheetProps {
    /** Owned by the shell, which drives `showModal()`/`close()` from its own state. */
    dialogRef: RefObject<HTMLDialogElement | null>;
    current: ChartDocument;
    busy: boolean;
    /** Who this feel's band can trade with: the drummer solos only in some styles. */
    partners: { soloist: boolean; drums: boolean };
    onClose: () => void;
    onChange: (tradeWith: SoloistTradeWith, bars: SoloistTradeBars) => void;
}

/**
 * Trading with the band (the band engine's `BandSettings.trade`, docs/design/band-engine.md):
 * after the head, the band plays a phrase and leaves the player room to answer, turn about.
 * Saved with the chart, like the rest of the band's settings.
 */
export function TradeSheet({
    dialogRef,
    current,
    busy,
    partners,
    onClose,
    onChange,
}: TradeSheetProps) {
    const soloist = current.chart.band.soloist;
    const tradeWith = soloist.tradeWith ?? 'off';
    const bars = soloist.tradeBars ?? 4;
    const drumsUnavailable = tradeWith === 'drums' && !partners.drums;
    return (
        <dialog
            className="feel-panel trade-panel"
            ref={dialogRef}
            aria-labelledby="trade-title"
            onClose={whenClosed(onClose)}
        >
            <div className="feel-heading">
                <div>
                    <h2 id="trade-title">Trade</h2>
                    <p>
                        After the head, the band plays a phrase and leaves you room to answer,
                        taking turns.
                    </p>
                </div>
                <button className="icon-button" aria-label="Close trade" onClick={onClose}>
                    ✕
                </button>
            </div>
            <div className="feel-groups">
                <div className="feel-group">
                    <label>
                        Trade with
                        <select
                            aria-label="Trade with"
                            disabled={busy}
                            value={tradeWith}
                            onChange={(event) =>
                                onChange(event.target.value as SoloistTradeWith, bars)
                            }
                        >
                            <option value="off">Off</option>
                            <option value="soloist">The soloist</option>
                            <option value="drums" disabled={!partners.drums}>
                                {partners.drums
                                    ? 'The drummer'
                                    : 'The drummer (jazz only, for now)'}
                            </option>
                        </select>
                    </label>
                    <p className="trade-note">
                        {tradeWith === 'soloist'
                            ? 'The soloist plays a phrase, then lays out while the band comps for yours.'
                            : tradeWith === 'drums'
                              ? drumsUnavailable
                                  ? "This feel's drummer doesn't solo yet, so the band plays on as usual."
                                  : 'The band drops out for the drummer’s solo, then comps for yours.'
                              : 'The band plays the whole song with you.'}
                    </p>
                </div>
                <div className="feel-group">
                    <label>
                        Turns
                        <select
                            aria-label="Turns"
                            disabled={busy || tradeWith === 'off'}
                            value={bars}
                            onChange={(event) =>
                                onChange(tradeWith, Number(event.target.value) as SoloistTradeBars)
                            }
                        >
                            {TURNS.map((turn) => (
                                <option key={turn.value} value={turn.value}>
                                    {turn.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>
        </dialog>
    );
}
