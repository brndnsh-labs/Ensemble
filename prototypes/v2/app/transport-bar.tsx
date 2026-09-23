import { KEY_ORDER } from '@engine/config';
import { arrangementOf } from '../lib/documents';
import { type ChartDocument, GENRE_NAMES } from '../lib/runtime';
import { type Lane, lanes } from './band-lanes';
import { TempoControl } from './tempo-control';

interface TransportBarProps {
    current: ChartDocument;
    busy: boolean;
    playbackActive: boolean;
    onPlayToggle: () => void;
    onTempo: (bpm: number) => void;
    /**
     * The song's key AND its own major/minor (#1375), from one select: a separate Mode control
     * wrapped the transport onto a second row on a phone. Mode is never a section/bar override.
     */
    onKey: (key: string, isMinor: boolean) => void;
    onGenre: (genre: string) => void;
    onFeel: () => void;
    onToggleLane: (lane: Lane) => void;
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
}: TransportBarProps) {
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
                    value={arrangementOf(current).key + (arrangementOf(current).isMinor ? 'm' : '')}
                    onChange={(event) => {
                        // No KEY_ORDER name ends in "m", so the suffix is unambiguous.
                        const value = event.target.value;
                        const isMinor = value.endsWith('m');
                        onKey(isMinor ? value.slice(0, -1) : value, isMinor);
                    }}
                >
                    {/* Majors, then minors. No <optgroup>: WebKit sizes the select to its
                        widest label, and "Minor" alone pushed the transport onto a second row on
                        a phone. */}
                    {KEY_ORDER.map((key) => (
                        <option key={key} value={key}>
                            {key}
                        </option>
                    ))}
                    {KEY_ORDER.map((key) => (
                        <option key={`${key}m`} value={`${key}m`}>
                            {key}m
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
                {lanes.map(([key, label]) => (
                    <button
                        key={key}
                        className={`band-toggle ${current.chart.band[key].enabled ? 'on' : 'off'}`}
                        disabled={busy}
                        aria-pressed={current.chart.band[key].enabled}
                        onClick={() => onToggleLane(key)}
                    >
                        <span className="dot" />
                        <span className="label">{label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
