import type { ChartNotation } from '@engine/songbook/types';
import type { SwingSub } from '@engine/types';
import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import { arrangementOf } from '../lib/documents';
import type { ChartDocument } from '../lib/runtime';
import { whenClosed } from './dialog-close';

/**
 * Compound meters already notate the shuffle feel in the written rhythm, so Swing
 * would double it — mirrors `InstrumentRail.tsx`'s `SWING_DISABLED_METERS`.
 */
const SWING_DISABLED_METERS = new Set(['6/8', '12/8']);

const NOTATION_OPTIONS: { value: ChartNotation; label: string }[] = [
    { value: 'roman', label: 'Roman Numerals (I, vi, IV)' },
    { value: 'name', label: 'Chord Names (C, Am, F)' },
    { value: 'nns', label: 'Nashville Numbers (1, 6-, 4)' },
];

/**
 * The `runtime-derived`/`preferences` fields the sheet shows that are NOT part of
 * `ChartDocument['chart']` (`STATE_OWNERSHIP_MANIFEST`: `bandIntensity`/`autoIntensity`/
 * `metronome` are session-only, `masterVolume` is a device preference) — so, unlike
 * every document field below, the shell has to hand them down separately rather than
 * reading them off `current`.
 */
export interface FeelSnapshot {
    bandIntensity: number;
    autoIntensity: boolean;
    metronome: boolean;
    masterVolume: number;
}

interface RangeSettingProps {
    label: string;
    ariaLabel: string;
    value: number;
    /** Stored-value ceiling: 1 for a 0-1 document field shown as a 0-100 percent,
     * 100 for a field that is already natively 0-100 (swing, humanize). */
    max: 1 | 100;
    disabled: boolean;
    onCommit: (value: number) => void;
}

/** Stored-value <-> displayed-percent conversion for a `max: 1` field; a `max: 100`
 * field is already displayed 1:1, so both directions are the identity there. */
function toDisplay(stored: number, max: 1 | 100): number {
    return Math.round(stored * (max === 1 ? 100 : 1));
}
function toStored(display: number, max: 1 | 100): number {
    return max === 1 ? display / 100 : display;
}

/**
 * A range input that only commits once per gesture (pointer-up or a keyboard nudge),
 * never on every intermediate `input` event — the same contract as `sounds-panel.tsx`'s
 * `RangeSetting`, generalized here with `max` so it covers both the 0-1 fields shown as
 * a percent (band intensity, complexity, master volume) and the natively-0-100 fields
 * (swing, humanize) with one component instead of two near-duplicates.
 */
function RangeSetting({ label, ariaLabel, value, max, disabled, onCommit }: RangeSettingProps) {
    const [local, setLocal] = useState(toDisplay(value, max));
    useEffect(() => {
        setLocal(toDisplay(value, max));
    }, [value, max]);
    function commit(next: number) {
        const clamped = Math.max(0, Math.min(100, next));
        setLocal(clamped);
        if (clamped !== toDisplay(value, max)) {
            onCommit(toStored(clamped, max));
        }
    }
    return (
        <label className="feel-range">
            {label}
            <span className="feel-range-control">
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={local}
                    disabled={disabled}
                    aria-label={ariaLabel}
                    onChange={(event) => setLocal(Number(event.target.value))}
                    onPointerUp={(event) => commit(Number(event.currentTarget.value))}
                    onKeyUp={(event) => commit(Number(event.currentTarget.value))}
                />
                <span className="feel-range-value">{local}</span>
            </span>
        </label>
    );
}

interface FeelSheetProps {
    /** Owned by the shell, which drives `showModal()`/`close()` from its `feelMenu` state,
     * the same convention `sounds-panel.tsx` uses for its own dialog ref. */
    dialogRef: RefObject<HTMLDialogElement | null>;
    current: ChartDocument;
    busy: boolean;
    feel: FeelSnapshot;
    onClose: () => void;
    onSwing: (value: number) => void;
    onSwingSub: (sub: SwingSub) => void;
    onHumanize: (value: number) => void;
    onComplexity: (value: number) => void;
    onBandIntensity: (value: number) => void;
    onAutoIntensity: (auto: boolean) => void;
    onMetronome: (enabled: boolean) => void;
    onMasterVolume: (value: number) => void;
    onNotation: (notation: ChartNotation) => void;
}

export function FeelSheet({
    dialogRef,
    current,
    busy,
    feel,
    onClose,
    onSwing,
    onSwingSub,
    onHumanize,
    onComplexity,
    onBandIntensity,
    onAutoIntensity,
    onMetronome,
    onMasterVolume,
    onNotation,
}: FeelSheetProps) {
    const arrangement = arrangementOf(current);
    const groove = current.chart.band.groove;
    const swingDisabled = busy || SWING_DISABLED_METERS.has(arrangement.timeSignature);
    return (
        <dialog
            className="feel-panel"
            ref={dialogRef}
            aria-labelledby="feel-title"
            onClose={whenClosed(onClose)}
        >
            <div className="feel-heading">
                <div>
                    <h2 id="feel-title">Feel &amp; mix</h2>
                    <p>Groove, energy and the chart's chord notation.</p>
                </div>
                <button className="icon-button" aria-label="Close feel" onClick={onClose}>
                    ✕
                </button>
            </div>
            <div className="feel-groups">
                <div className="feel-group">
                    <h3>Feel</h3>
                    <div className="feel-swing-row">
                        <RangeSetting
                            label="Swing"
                            ariaLabel="Swing"
                            value={groove.swing}
                            max={100}
                            disabled={swingDisabled}
                            onCommit={onSwing}
                        />
                        <label>
                            Swing grid
                            <select
                                aria-label="Swing grid"
                                value={groove.swingSub}
                                disabled={swingDisabled}
                                onChange={(event) => onSwingSub(event.target.value as SwingSub)}
                            >
                                <option value="8th">1/8</option>
                                <option value="16th">1/16</option>
                            </select>
                        </label>
                    </div>
                    {SWING_DISABLED_METERS.has(arrangement.timeSignature) && (
                        <p className="feel-hint">
                            {arrangement.timeSignature} already notates the shuffle feel, so Swing
                            is disabled here.
                        </p>
                    )}
                    <RangeSetting
                        label="Humanize"
                        ariaLabel="Humanize"
                        value={groove.humanize}
                        max={100}
                        disabled={busy}
                        onCommit={onHumanize}
                    />
                </div>
                <div className="feel-group">
                    <h3>Energy</h3>
                    <label className="feel-toggle">
                        <input
                            type="checkbox"
                            checked={feel.autoIntensity}
                            disabled={busy}
                            onChange={(event) => onAutoIntensity(event.target.checked)}
                        />
                        <span>Auto intensity</span>
                    </label>
                    <RangeSetting
                        label="Band intensity"
                        ariaLabel="Band intensity"
                        value={feel.bandIntensity}
                        max={1}
                        disabled={busy || feel.autoIntensity}
                        onCommit={onBandIntensity}
                    />
                    <RangeSetting
                        label="Complexity"
                        ariaLabel="Complexity"
                        value={current.chart.performance.complexity}
                        max={1}
                        disabled={busy}
                        onCommit={onComplexity}
                    />
                </div>
                <div className="feel-group">
                    <h3>Mix</h3>
                    <RangeSetting
                        label="Master volume"
                        ariaLabel="Master volume"
                        value={feel.masterVolume}
                        max={1}
                        disabled={busy}
                        onCommit={onMasterVolume}
                    />
                    <label className="feel-toggle">
                        <input
                            type="checkbox"
                            checked={feel.metronome}
                            disabled={busy}
                            onChange={(event) => onMetronome(event.target.checked)}
                        />
                        <span>Metronome</span>
                    </label>
                </div>
                <div className="feel-group">
                    <h3>Notation</h3>
                    <label>
                        Chord notation
                        <select
                            aria-label="Chord notation"
                            value={arrangement.notation}
                            disabled={busy}
                            onChange={(event) => onNotation(event.target.value as ChartNotation)}
                        >
                            {NOTATION_OPTIONS.map((entry) => (
                                <option key={entry.value} value={entry.value}>
                                    {entry.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>
            <p>
                Band intensity, auto intensity and the metronome are session settings — they don't
                save with the chart. Everything else here does.
            </p>
        </dialog>
    );
}
