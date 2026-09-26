import { KEY_ORDER } from '@engine/config';
import { Fragment } from 'react';
import { arrangementOf } from '../lib/documents';
import { BAND_ENGINE } from '../lib/engine-mode';
import { type ChartDocument, GENRE_NAMES } from '../lib/runtime';
import { type Lane, visibleLanes } from './band-lanes';
import { TempoControl } from './tempo-control';

interface TransportBarProps {
    current: ChartDocument;
    busy: boolean;
    playbackActive: boolean;
    onPlayToggle: () => void;
    onTempo: (bpm: number) => void;
    onKey: (key: string) => void;
    onGenre: (genre: string) => void;
    onFeel: () => void;
    onToggleLane: (lane: Lane) => void;
    /** Opens the Trade sheet (the band engine only): trading turns with the band. */
    onTrade: () => void;
    /** Set when the chart asks to trade but the band can't right now (`runtime.tradeBlocked`). */
    tradeBlocked: string | null;
}

export function TransportBar({
    current,
    busy,
    playbackActive,
    onPlayToggle,
    onTempo,
    onKey,
    onGenre,
    onFeel,
    onToggleLane,
    onTrade,
    tradeBlocked,
}: TransportBarProps) {
    const trade = current.chart.band.soloist.tradeWith ?? 'off';
    const tradeBars = current.chart.band.soloist.tradeBars ?? 4;
    // Filled only while the band really trades; asked for but blocked, it stays hollow.
    const trading = trade !== 'off' && !tradeBlocked;
    const partner = trade === 'soloist' ? 'soloist' : 'drummer';
    return (
        <div className="transport-bar">
            <div className="transport-cluster">
                <button
                    className="play-button"
                    aria-label={playbackActive ? 'Stop playback' : 'Start playback'}
                    disabled={busy && !playbackActive}
                    onClick={onPlayToggle}
                >
                    {playbackActive ? '■' : '▶'}
                </button>
                <TempoControl
                    key={current.id}
                    value={current.chart.performance.bpm}
                    disabled={busy}
                    onCommit={onTempo}
                />
            </div>
            <div className="key-setting">
                <label className="setting-label" htmlFor="song-key">
                    Key
                </label>
                <select
                    id="song-key"
                    className="setting-select"
                    disabled={busy}
                    value={arrangementOf(current).key}
                    onChange={(event) => onKey(event.target.value)}
                >
                    {KEY_ORDER.map((key) => (
                        <option key={key} value={key}>
                            {key}
                            {arrangementOf(current).isMinor ? 'm' : ''}
                        </option>
                    ))}
                </select>
            </div>
            <div className="genre-setting">
                <label className="setting-label" htmlFor="genre">
                    Feel
                </label>
                <select
                    id="genre"
                    className="setting-select"
                    disabled={busy}
                    value={current.chart.band.groove.lastSmartGenre}
                    onChange={(e) => onGenre(e.target.value)}
                >
                    {GENRE_NAMES.map((g) => (
                        <option key={g}>{g}</option>
                    ))}
                </select>
                {/* The rest of the feel — swing, humanize, mix, notation — opens from
                    here rather than the song header, which has no room for a fifth
                    control on a phone (#1276). */}
                <button
                    type="button"
                    className="feel-button"
                    disabled={busy}
                    onClick={onFeel}
                    aria-label="Feel and mix"
                    title="Feel and mix"
                >
                    More…
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
                        {BAND_ENGINE && key === 'soloist' && (
                            <button
                                type="button"
                                className={`band-toggle trade-toggle ${trading ? 'on' : 'off'}`}
                                disabled={busy}
                                aria-haspopup="dialog"
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
