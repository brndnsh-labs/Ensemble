import type { ChartNotation } from '@core/songbook/types';
import { Fragment, useRef } from 'react';
import { genreOf } from '../lib/documents';
import { type ChartDocument, GENRE_NAMES } from '../lib/runtime';
import { type Lane, visibleLanes } from './band-lanes';
import { KeyPopover, songKeyLabel } from './key-popover';
import { TempoControl } from './tempo-control';

interface TransportBarProps {
    current: ChartDocument;
    busy: boolean;
    playbackActive: boolean;
    /** The count-in beat sounding now (0-based: 0 shows "1"), or null when not counting in
     * (#1422). The chart itself doesn't move during this window; the play button does. */
    countInBeat: number | null;
    onPlayToggle: () => void;
    onTempo: (bpm: number) => void;
    /** Whether the Key popover (#1757) is open. The shell holds it, so a refused meter can
     * close it onto the bar that would not fit. */
    keyOpen: boolean;
    /** The Key button: opens the popover, or closes it while it is open. */
    onKeyToggle: () => void;
    onKeyClose: () => void;
    onKey: (key: string) => void;
    onMode: (isMinor: boolean) => void;
    onMeter: (meter: string) => void;
    onNotation: (notation: ChartNotation) => void;
    onGenre: (genre: string) => void;
    /** Opens the Band sheet (#1703) on the tab the musician was last on. */
    onBand: () => void;
    /**
     * The Band sheet's open tab, or null while it is shut: each trigger's own `aria-expanded`
     * (#1760) — Band… while the sheet is open, Trade while it is open on its Trade tab.
     */
    bandTab: string | null;
    onToggleLane: (lane: Lane) => void;
    /** Opens the Band sheet on its Trade tab: trading turns with the band. */
    onTrade: () => void;
    /** Set when the chart asks to trade but the band can't right now (`runtime.tradeBlocked`). */
    tradeBlocked: string | null;
}

export function TransportBar({
    current,
    busy,
    playbackActive,
    countInBeat,
    onPlayToggle,
    onTempo,
    keyOpen,
    onKeyToggle,
    onKeyClose,
    onKey,
    onMode,
    onMeter,
    onNotation,
    onGenre,
    onBand,
    bandTab,
    onToggleLane,
    onTrade,
    tradeBlocked,
}: TransportBarProps) {
    const trade = current.chart.band.soloist.tradeWith ?? 'off';
    const tradeBars = current.chart.band.soloist.tradeBars ?? 4;
    // Filled only while the band really trades; asked for but blocked, it stays hollow.
    const trading = trade !== 'off' && !tradeBlocked;
    const partner = trade === 'soloist' ? 'soloist' : 'drummer';
    const keyButton = useRef<HTMLButtonElement>(null);
    const keyLabel = songKeyLabel(current);
    return (
        <div className="transport-bar">
            <div className="transport-cluster">
                <button
                    className="play-button"
                    // The accessible name stays exactly Start/Stop playback through the
                    // count-in — only the glyph changes — since `aria-label` (not the visible
                    // text) is what every existing check's `getByRole` locator keys on, and
                    // pressing Stop must read the same during the count-in as during the song.
                    aria-label={playbackActive ? 'Stop playback' : 'Start playback'}
                    // A stable, non-visual hook for `app/use-playback-state.ts`'s autoplay
                    // gesture listener (#1382 patch review): it needs to tell "the gesture that
                    // armed autoplay landed on Play itself" apart from "anywhere else", without
                    // matching on the aria-label text above (which flips with playback state)
                    // or the `play-button` class (a styling hook, not a behavioral contract).
                    data-play-toggle=""
                    disabled={busy && !playbackActive}
                    onClick={onPlayToggle}
                >
                    {countInBeat !== null ? countInBeat + 1 : playbackActive ? '■' : '▶'}
                </button>
                <TempoControl
                    key={current.id}
                    value={current.chart.performance.bpm}
                    disabled={busy}
                    onCommit={onTempo}
                />
            </div>
            {/* The song's key, mode, meter and chord notation, one popover (#1757). The small
                label above is the column's, as Tempo's and Style's are; the button's own name
                says the whole thing. `aria-disabled` while busy, so focus can come back to it. */}
            <div className="key-setting">
                <span className="setting-label" aria-hidden="true">
                    Key
                </span>
                <button
                    ref={keyButton}
                    type="button"
                    className="setting-select key-button"
                    aria-label={`Key: ${keyLabel}`}
                    aria-haspopup="dialog"
                    aria-expanded={keyOpen}
                    aria-disabled={(busy && !keyOpen) || undefined}
                    onClick={() => {
                        if (!busy || keyOpen) {
                            onKeyToggle();
                        }
                    }}
                >
                    {keyLabel}
                    <span className="key-button-caret" aria-hidden="true">
                        ▾
                    </span>
                </button>
                {keyOpen && (
                    <KeyPopover
                        current={current}
                        busy={busy}
                        anchor={() => (keyButton.current?.isConnected ? keyButton.current : null)}
                        onKey={onKey}
                        onMode={onMode}
                        onMeter={onMeter}
                        onNotation={onNotation}
                        onClose={onKeyClose}
                    />
                )}
            </div>
            <div className="genre-setting">
                <label className="setting-label" htmlFor="genre">
                    Style
                </label>
                <select
                    id="genre"
                    className="setting-select"
                    disabled={busy}
                    value={genreOf(current)}
                    onChange={(e) => onGenre(e.target.value)}
                >
                    {GENRE_NAMES.map((g) => (
                        <option key={g}>{g}</option>
                    ))}
                </select>
                {/* Everything else about the band — sounds, groove, trading, practice aids —
                    is one sheet (#1703), opened from here beside the style it follows. */}
                <button
                    type="button"
                    className="band-button"
                    disabled={busy}
                    aria-haspopup="dialog"
                    aria-expanded={bandTab !== null}
                    onClick={onBand}
                >
                    Band…
                </button>
            </div>
            <div className="band-controls" aria-label="Band instruments">
                {visibleLanes.map(([key, label]) => (
                    <Fragment key={key}>
                        <button
                            className={`band-toggle ${current.chart.band[key].enabled ? 'on' : 'off'}`}
                            disabled={busy}
                            aria-pressed={current.chart.band[key].enabled}
                            onClick={() => onToggleLane(key)}
                        >
                            <span className="dot" />
                            <span className="label">{label}</span>
                        </button>
                        {/* Trading sits by the soloist it's about; it shows the turn length
                            while on, so a musician can see the band will leave them room. */}
                        {key === 'soloist' && (
                            <button
                                type="button"
                                className={`band-toggle trade-toggle ${trading ? 'on' : 'off'}`}
                                disabled={busy}
                                aria-haspopup="dialog"
                                aria-expanded={bandTab === 'trade'}
                                aria-label={
                                    trade === 'off'
                                        ? 'Trade'
                                        : trading
                                          ? `Trade: ${tradeBars} bars with the ${partner}`
                                          : `Trade: ${tradeBars} bars with the ${partner}, paused`
                                }
                                title="Trade with the band"
                                onClick={onTrade}
                            >
                                <span className="label">
                                    {trade === 'off' ? '⇄' : `⇄ ${tradeBars}s`}
                                </span>
                            </button>
                        )}
                    </Fragment>
                ))}
            </div>
        </div>
    );
}
