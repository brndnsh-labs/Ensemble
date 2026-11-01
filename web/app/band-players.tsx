import { useEffect, useRef, useState } from 'react';
import type { ChartDocument } from '../lib/runtime';
import { allSoundsSizeMB, packsForInstrument } from '../lib/sounds';
import { type Lane, visibleLanes } from './band-lanes';
import './band-players.css';
import { useRangeCommit } from './use-range-commit';

interface RangeSettingProps {
    label: string;
    ariaLabel: string;
    value: number;
    disabled: boolean;
    onCommit: (value: number) => void;
}

/**
 * A 0-1 document value shown/dragged as 0-100. Local state updates live while
 * dragging (cheap, click-free); the draft-worthy commit fires once per
 * gesture (`useRangeCommit`) — never on every intermediate
 * `input` event a native range fires — so a drag makes exactly one undo step,
 * matching `TempoControl`'s commit-on-gesture-end contract.
 */
function RangeSetting({ label, ariaLabel, value, disabled, onCommit }: RangeSettingProps) {
    const [local, setLocal] = useState(value);
    const committed = useRef(value);
    useEffect(() => {
        committed.current = value;
        setLocal(value);
    }, [value]);
    function commit(next: number) {
        const clamped = Math.max(0, Math.min(100, next));
        setLocal(clamped / 100);
        if (clamped !== Math.round(committed.current * 100)) {
            committed.current = clamped / 100;
            onCommit(clamped / 100);
        }
    }
    const range = useRangeCommit(commit);
    return (
        <label className="sound-range">
            {label}
            <span className="sound-range-control">
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(local * 100)}
                    disabled={disabled}
                    aria-label={ariaLabel}
                    ref={range.ref}
                    onChange={(event) => {
                        range.edited();
                        setLocal(Number(event.target.value) / 100);
                    }}
                    {...range.handlers}
                />
                <span className="sound-range-value">{Math.round(local * 100)}</span>
            </span>
        </label>
    );
}

interface PlayersTabProps {
    current: ChartDocument;
    busy: boolean;
    soundProgress: string;
    soundsOffline: boolean | null;
    allSoundsOffline: boolean | null;
    pendingSound: { lane: string; value: string } | null;
    onInstallAll: () => void;
    onChooseSound: (lane: Lane, value: string) => void;
    onVolume: (lane: Lane, value: number) => void;
    onReverb: (lane: Lane, value: number) => void;
    onToggleLane: (lane: Lane) => void;
    /** Fetch the style's sounds when the band plays (#1997): a device preference. */
    autoSounds: boolean;
    onAutoSounds: (enabled: boolean) => void;
}

/**
 * The Band sheet's Players tab (#1703): each lane on or off and on which sound, one row apiece, so
 * the tab fits a phone screen (#1759). Volume and reverb sit behind each lane's Mix disclosure,
 * closed until asked for; the one-off install-all is a quiet link at the bottom. The on/off the
 * transport's chips also offer as a quick toggle stays here as a quieter switch.
 */
export function PlayersTab({
    current,
    busy,
    soundProgress,
    soundsOffline,
    allSoundsOffline,
    pendingSound,
    onInstallAll,
    onChooseSound,
    onVolume,
    onReverb,
    onToggleLane,
    autoSounds,
    onAutoSounds,
}: PlayersTabProps) {
    return (
        <>
            <div className="player-rows">
                {visibleLanes.map(([lane, label]) => {
                    const band = current.chart.band[lane];
                    const pack = packsForInstrument(lane).find(
                        (entry) => band.voice === `pack:${entry.id}`,
                    );
                    return (
                        <div className={`player-row ${band.enabled ? '' : 'muted'}`} key={lane}>
                            <div className="player-head">
                                <h3>{label}</h3>
                                {band.autoSound && (
                                    <span className="resolved-sound">
                                        Using {pack?.name || 'Built-in'}
                                    </span>
                                )}
                                <label className="lane-switch">
                                    <input
                                        type="checkbox"
                                        role="switch"
                                        checked={band.enabled}
                                        disabled={busy}
                                        aria-label={`${label} playing`}
                                        onChange={() => onToggleLane(lane)}
                                    />
                                    <span>{band.enabled ? 'On' : 'Off'}</span>
                                </label>
                            </div>
                            <select
                                aria-label={`${label} sound`}
                                value={
                                    pendingSound?.lane === lane
                                        ? pendingSound.value
                                        : band.autoSound
                                          ? 'auto'
                                          : band.voice
                                }
                                disabled={busy}
                                onChange={(event) => onChooseSound(lane, event.target.value)}
                            >
                                <option value="auto">Follow style</option>
                                <option value="synth">Built-in</option>
                                {packsForInstrument(lane).map((entry) => (
                                    <option key={entry.id} value={`pack:${entry.id}`}>
                                        {entry.name} · {entry.approxSizeMB} MB
                                    </option>
                                ))}
                            </select>
                            <details className="lane-mix">
                                <summary aria-label={`${label} mix`}>Mix</summary>
                                <RangeSetting
                                    label={`${label} volume`}
                                    ariaLabel={`${label} volume`}
                                    value={band.volume}
                                    disabled={busy}
                                    onCommit={(value) => onVolume(lane, value)}
                                />
                                <RangeSetting
                                    label={`${label} reverb`}
                                    ariaLabel={`${label} reverb`}
                                    value={band.reverb}
                                    disabled={busy}
                                    onCommit={(value) => onReverb(lane, value)}
                                />
                                {pack?.attribution && <small>{pack.attribution}</small>}
                            </details>
                        </div>
                    );
                })}
            </div>
            <p className="sound-progress" role="status">
                {soundProgress}
            </p>
            <div className="players-foot">
                <label className="auto-sounds">
                    <input
                        type="checkbox"
                        checked={autoSounds}
                        onChange={(event) => onAutoSounds(event.target.checked)}
                    />
                    Get each style's sounds when the band plays
                </label>
                <button
                    type="button"
                    className="install-all"
                    disabled={busy}
                    onClick={onInstallAll}
                >
                    {busy ? 'Preparing sounds…' : 'Install all & use style sounds'}
                </button>
                <small>
                    About {allSoundsSizeMB.toFixed(1)} MB. Chooses sounds for this song's style;
                    changing the style follows along. Save to keep this setup.
                </small>
                <small>
                    {allSoundsOffline === null
                        ? 'Checking installed sounds…'
                        : allSoundsOffline
                          ? 'All sound packs available offline'
                          : 'Missing downloads will be installed. Completed files are reused.'}
                </small>
                <small>
                    {soundsOffline === null
                        ? 'Checking downloads…'
                        : soundsOffline
                          ? 'Song sounds available offline'
                          : 'Some sounds need downloading'}
                </small>
            </div>
        </>
    );
}
