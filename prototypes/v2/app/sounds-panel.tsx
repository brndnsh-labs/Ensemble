import type { RefObject } from 'react';
import type { ChartDocument } from '../lib/runtime';
import { allSoundsSizeMB, packsForInstrument } from '../lib/sounds';
import { type Lane, lanes } from './band-lanes';

interface SoundsPanelProps {
    /** Owned by the shell, which drives `showModal()`/`close()` from its `soundMenu` state. */
    dialogRef: RefObject<HTMLDialogElement | null>;
    open: boolean;
    current: ChartDocument;
    busy: boolean;
    error: string;
    soundProgress: string;
    soundsOffline: boolean | null;
    allSoundsOffline: boolean | null;
    pendingSound: { lane: string; value: string } | null;
    onClose: () => void;
    onInstallAll: () => void;
    onChooseSound: (lane: Lane, value: string) => void;
}

export function SoundsPanel({
    dialogRef,
    open,
    current,
    busy,
    error,
    soundProgress,
    soundsOffline,
    allSoundsOffline,
    pendingSound,
    onClose,
    onInstallAll,
    onChooseSound,
}: SoundsPanelProps) {
    return (
        <dialog
            className="sound-panel"
            ref={dialogRef}
            aria-labelledby="sounds-title"
            onClose={onClose}
        >
            <div className="sounds-heading">
                <div>
                    <h2 id="sounds-title">Your band's sound</h2>
                    <p>Install once. Play anywhere.</p>
                </div>
                <button className="icon-button" aria-label="Close sounds" onClick={onClose}>
                    ✕
                </button>
            </div>
            <div className="sound-install">
                <button className="btn primary" disabled={busy} onClick={onInstallAll}>
                    {busy ? 'Preparing sounds…' : 'Install all & use genre sounds'}
                </button>
                <p>
                    About {allSoundsSizeMB.toFixed(1)} MB. Chooses sounds for this song's feel;
                    changing the feel follows along. Save to keep this setup.
                </p>
                <small>
                    {allSoundsOffline === null
                        ? 'Checking installed sounds…'
                        : allSoundsOffline
                          ? 'All sound packs available offline'
                          : 'Missing downloads will be installed. Completed files are reused.'}
                </small>
            </div>
            {error && open && (
                <div className="error-banner" role="alert">
                    {error}
                </div>
            )}
            <p className="sound-progress" role="status">
                {soundProgress}
            </p>
            <div className="sounds-status">
                <span>
                    {soundsOffline === null
                        ? 'Checking downloads…'
                        : soundsOffline
                          ? 'Song sounds available offline'
                          : 'Some sounds need downloading'}
                </span>
                <span>Or choose each instrument:</span>
            </div>
            <div className="sound-choices">
                {lanes.map(([lane, label]) => (
                    <label key={lane}>
                        {label} sound
                        <select
                            aria-label={`${label} sound`}
                            value={
                                pendingSound?.lane === lane
                                    ? pendingSound.value
                                    : current.chart.band[lane].autoSound
                                      ? 'auto'
                                      : current.chart.band[lane].voice
                            }
                            disabled={busy}
                            onChange={(event) => onChooseSound(lane, event.target.value)}
                        >
                            <option value="auto">Follow feel</option>
                            <option value="synth">Built-in</option>
                            {packsForInstrument(lane).map((pack) => (
                                <option key={pack.id} value={`pack:${pack.id}`}>
                                    {pack.name} · {pack.approxSizeMB} MB
                                </option>
                            ))}
                        </select>
                        <small>
                            {current.chart.band[lane].autoSound && (
                                <span className="resolved-sound">
                                    Using{' '}
                                    {packsForInstrument(lane).find(
                                        (pack) =>
                                            current.chart.band[lane].voice === `pack:${pack.id}`,
                                    )?.name || 'Built-in'}
                                </span>
                            )}
                            {
                                packsForInstrument(lane).find(
                                    (pack) => current.chart.band[lane].voice === `pack:${pack.id}`,
                                )?.attribution
                            }
                        </small>
                    </label>
                ))}
            </div>
            <p>
                Choosing a sound downloads it for offline use. Save keeps your choices with this
                song. Browser storage can still be cleared or evicted.
            </p>
        </dialog>
    );
}
