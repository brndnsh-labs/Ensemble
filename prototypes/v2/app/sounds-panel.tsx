import {
    BASS_STYLES,
    CHORD_STYLES,
    HARMONY_STYLES,
    SOLOIST_STYLES,
} from '@engine/data/instrument-styles';
import type { ChordDensity } from '@engine/types';
import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ENGINE_NEXT } from '../lib/engine-mode';
import type { ChartDocument } from '../lib/runtime';
import { allSoundsSizeMB, packsForInstrument } from '../lib/sounds';
import { type Lane, visibleLanes } from './band-lanes';
import { whenClosed } from './dialog-close';

/** The one style-picker list each style-bearing lane has (#1275). Groove/drums
 * has no `style` field on `ChartGroove` and no entry in `instrument-styles.ts` —
 * drums route by drum preset/genre feel instead, so it is deliberately absent. */
const STYLE_OPTIONS: Partial<Record<Lane, { id: string; name: string }[]>> = {
    chords: CHORD_STYLES,
    bass: BASS_STYLES,
    harmony: HARMONY_STYLES,
    soloist: SOLOIST_STYLES,
};

const DENSITY_OPTIONS: { value: ChordDensity; label: string }[] = [
    { value: 'thin', label: 'Thin (3 notes)' },
    { value: 'standard', label: 'Standard (4 notes)' },
    { value: 'rich', label: 'Rich (5+ notes)' },
];

const SOLOIST_MODE_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'monophonic', label: 'Monophonic' },
    { value: 'guitar', label: 'Guitar' },
] as const;

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
 * gesture, on pointer-up or a keyboard nudge — never on every intermediate
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
                    onChange={(event) => setLocal(Number(event.target.value) / 100)}
                    onPointerUp={(event) => commit(Number(event.currentTarget.value))}
                    onKeyUp={(event) => commit(Number(event.currentTarget.value))}
                />
                <span className="sound-range-value">{Math.round(local * 100)}</span>
            </span>
        </label>
    );
}

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
    onVolume: (lane: Lane, value: number) => void;
    onReverb: (lane: Lane, value: number) => void;
    onStyle: (lane: Lane, value: string) => void;
    onDensity: (value: ChordDensity) => void;
    onSoloistMode: (mode: 'auto' | 'monophonic' | 'guitar') => void;
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
    onVolume,
    onReverb,
    onStyle,
    onDensity,
    onSoloistMode,
}: SoundsPanelProps) {
    return (
        <dialog
            className="sound-panel"
            ref={dialogRef}
            aria-labelledby="sounds-title"
            onClose={whenClosed(onClose)}
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
                {visibleLanes.map(([lane, label]) => {
                    const band = current.chart.band[lane];
                    const styleOptions = STYLE_OPTIONS[lane];
                    return (
                        <div className="sound-lane" key={lane}>
                            <h3>{label}</h3>
                            <label>
                                {label} sound
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
                                    <option value="auto">Follow feel</option>
                                    <option value="synth">Built-in</option>
                                    {packsForInstrument(lane).map((pack) => (
                                        <option key={pack.id} value={`pack:${pack.id}`}>
                                            {pack.name} · {pack.approxSizeMB} MB
                                        </option>
                                    ))}
                                </select>
                                <small>
                                    {band.autoSound && (
                                        <span className="resolved-sound">
                                            Using{' '}
                                            {packsForInstrument(lane).find(
                                                (pack) => band.voice === `pack:${pack.id}`,
                                            )?.name || 'Built-in'}
                                        </span>
                                    )}
                                    {
                                        packsForInstrument(lane).find(
                                            (pack) => band.voice === `pack:${pack.id}`,
                                        )?.attribution
                                    }
                                </small>
                            </label>
                            {/* The band engine's lead is its style's own soloist: the old
                                engine's soloist style and mode pickers have nothing to set. */}
                            {styleOptions &&
                                'style' in band &&
                                !(ENGINE_NEXT && lane === 'soloist') && (
                                    <label>
                                        {label} style
                                        <select
                                            aria-label={`${label} style`}
                                            value={band.style}
                                            disabled={busy}
                                            onChange={(event) => onStyle(lane, event.target.value)}
                                        >
                                            {/* A style outside the picker list (e.g. Acoustic's
                                            genre-routed 'arp', #1257) is still selected and
                                            named, never silently swapped for the first option. */}
                                            {!styleOptions.some(
                                                (entry) => entry.id === band.style,
                                            ) && <option value={band.style}>{band.style}</option>}
                                            {styleOptions.map((entry) => (
                                                <option key={entry.id} value={entry.id}>
                                                    {entry.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                            {lane === 'chords' && (
                                <label>
                                    Chords density
                                    <select
                                        aria-label="Chords density"
                                        value={current.chart.band.chords.density}
                                        disabled={busy}
                                        onChange={(event) =>
                                            onDensity(event.target.value as ChordDensity)
                                        }
                                    >
                                        {DENSITY_OPTIONS.map((entry) => (
                                            <option key={entry.value} value={entry.value}>
                                                {entry.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            {lane === 'soloist' && !ENGINE_NEXT && (
                                <label>
                                    Soloist mode
                                    <select
                                        aria-label="Soloist mode"
                                        value={
                                            current.chart.band.soloist.autoMode
                                                ? 'auto'
                                                : current.chart.band.soloist.mode
                                        }
                                        disabled={busy}
                                        onChange={(event) =>
                                            onSoloistMode(
                                                event.target.value as
                                                    | 'auto'
                                                    | 'monophonic'
                                                    | 'guitar',
                                            )
                                        }
                                    >
                                        {SOLOIST_MODE_OPTIONS.map((entry) => (
                                            <option key={entry.value} value={entry.value}>
                                                {entry.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
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
                        </div>
                    );
                })}
            </div>
            <p>
                Choosing a sound downloads it for offline use. Save keeps your choices with this
                song. Browser storage can still be cleared or evicted.
            </p>
        </dialog>
    );
}
