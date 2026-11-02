import type { SwingSub } from '@core/types';
import { useEffect, useState } from 'react';
import { shownHumanize, UNSET_HUMANIZE } from '../lib/genre-humanize';
import type { ChartDocument, SongMinutes } from '../lib/runtime';
import { songPlanText } from '../lib/song-mode';
import { useRangeCommit } from './use-range-commit';

/**
 * Compound meters already notate the shuffle feel in the written rhythm, so Swing
 * would double it — mirrors v1's `InstrumentRail.tsx` `SWING_DISABLED_METERS` (deleted).
 */
const SWING_DISABLED_METERS = new Set(['6/8', '12/8']);

/**
 * The live values the sheet shows that are NOT read off `ChartDocument['chart']`
 * (`STATE_OWNERSHIP_MANIFEST`: `metronome` is session-only, `masterVolume` is a device
 * preference) — so, unlike every document field below, the shell hands them down separately.
 * `bandIntensity` is here only for the slider's resting position while the chart's energy is
 * on auto, when the chart itself names no level (`ChartPerformance.energy`).
 */
export interface FeelSnapshot {
    bandIntensity: number;
    metronome: boolean;
    masterVolume: number;
    /** One bar of clicks before a fresh Play (#1422) — `preferences`-owned like
     * `masterVolume` above, not part of `ChartDocument['chart']` either. */
    countIn: boolean;
    /** Song mode (#1784): minutes, or null for Off — a device preference like `countIn`. */
    songMinutes: SongMinutes | null;
}

/** The song-length choices, Off first; 3 minutes is the one switched on to. */
const SONG_LENGTHS: { value: string; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: '3', label: '3 min' },
    { value: '4', label: '4 min' },
    { value: '5', label: '5 min' },
];

interface RangeSettingProps {
    label: string;
    ariaLabel: string;
    value: number;
    /** Stored-value ceiling: 1 for a 0-1 document field shown as a 0-100 percent,
     * 100 for a field that is already natively 0-100 (swing, humanize). */
    max: 1 | 100;
    disabled: boolean;
    onCommit: (value: number) => void;
    /**
     * What a pick will read as, when that can differ from the pick: humanize's 20 is "not set"
     * and reads as the style's own (#2010), so picking it shows the style's amount at once —
     * and, when that is already what the slider shows, commits nothing. Default: the pick.
     */
    readsAs?: (display: number) => number;
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
 * A range input that only commits once per gesture (`useRangeCommit`),
 * never on every intermediate `input` event — the same contract as `band-players.tsx`'s
 * `RangeSetting`, generalized here with `max` so it covers both the 0-1 fields shown as
 * a percent (band intensity, master volume) and the natively-0-100 fields
 * (swing, humanize) with one component instead of two near-duplicates.
 */
function RangeSetting({
    label,
    ariaLabel,
    value,
    max,
    disabled,
    onCommit,
    readsAs = (display) => display,
}: RangeSettingProps) {
    const [local, setLocal] = useState(toDisplay(value, max));
    useEffect(() => {
        setLocal(toDisplay(value, max));
    }, [value, max]);
    function commit(next: number) {
        const clamped = Math.max(0, Math.min(100, next));
        const shown = readsAs(clamped);
        setLocal(shown);
        if (shown !== toDisplay(value, max)) {
            onCommit(toStored(clamped, max));
        }
    }
    const range = useRangeCommit(commit);
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
                    ref={range.ref}
                    onChange={(event) => {
                        range.edited();
                        setLocal(Number(event.target.value));
                    }}
                    {...range.handlers}
                />
                <span className="feel-range-value">{local}</span>
            </span>
        </label>
    );
}

interface GrooveTabProps {
    current: ChartDocument;
    busy: boolean;
    feel: FeelSnapshot;
    onSwing: (value: number) => void;
    onSwingSub: (sub: SwingSub) => void;
    onHumanize: (value: number) => void;
    onBandIntensity: (value: number) => void;
    onAutoIntensity: (auto: boolean) => void;
}

/** The Band sheet's Groove tab (#1703): how the band plays — swing, humanize and energy. */
export function GrooveTab({
    current,
    busy,
    feel,
    onSwing,
    onSwingSub,
    onHumanize,
    onBandIntensity,
    onAutoIntensity,
}: GrooveTabProps) {
    const groove = current.chart.band.groove;
    // The chart's energy (a chart saved before it carried one plays on auto).
    const energy = current.chart.performance.energy ?? 'auto';
    const autoEnergy = energy === 'auto';
    const swingDisabled = busy || SWING_DISABLED_METERS.has(current.chart.score.meter);
    return (
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
                {SWING_DISABLED_METERS.has(current.chart.score.meter) && (
                    <p className="feel-hint">
                        {current.chart.score.meter} already notates the shuffle feel, so Swing is
                        disabled here.
                    </p>
                )}
                {/* Until the musician sets it, humanize is the style's own (#2010). */}
                <RangeSetting
                    label="Humanize"
                    ariaLabel="Humanize"
                    value={shownHumanize(groove.humanize, groove.genre)}
                    max={100}
                    disabled={busy}
                    onCommit={onHumanize}
                    readsAs={(display) => shownHumanize(display, groove.genre)}
                />
                {groove.humanize === UNSET_HUMANIZE && (
                    <p className="feel-hint">
                        Humanize follows the {groove.genre} style until you change it.
                    </p>
                )}
            </div>
            <div className="feel-group">
                <h3>Energy</h3>
                <label className="feel-toggle">
                    <input
                        type="checkbox"
                        checked={autoEnergy}
                        disabled={busy}
                        onChange={(event) => onAutoIntensity(event.target.checked)}
                    />
                    <span>Auto intensity</span>
                </label>
                <RangeSetting
                    label="Band intensity"
                    ariaLabel="Band intensity"
                    value={autoEnergy ? feel.bandIntensity : energy}
                    max={1}
                    disabled={busy || autoEnergy}
                    onCommit={onBandIntensity}
                />
            </div>
            <p className="band-note">Saved with the chart.</p>
        </div>
    );
}

interface PracticeTabProps {
    busy: boolean;
    feel: FeelSnapshot;
    /** The open chart's own chorus count (`SemanticScore.choruses`); undefined is Loop. */
    chartChoruses: number | undefined;
    /** What song mode plays (`runtime.songModeReadout()`), null when it doesn't apply. */
    songReadout: { choruses: number; seconds: number } | null;
    onMetronome: (enabled: boolean) => void;
    onMasterVolume: (value: number) => void;
    onCountIn: (enabled: boolean) => void;
    onSongMinutes: (minutes: SongMinutes | null) => void;
}

/**
 * The Band sheet's Practice tab (#1703): what helps the musician practise — the click, the
 * count-in, how long a looping song plays (song mode, #1784) and the overall level. How the chart spells its chords is the transport's Key
 * popover's (#1757).
 */
export function PracticeTab({
    busy,
    feel,
    chartChoruses,
    songReadout,
    onMetronome,
    onMasterVolume,
    onCountIn,
    onSongMinutes,
}: PracticeTabProps) {
    // A chart that counts its own choruses already ends on its own: its count wins.
    const counted = chartChoruses !== undefined;
    return (
        <div className="feel-groups">
            <div className="feel-group">
                <h3>Click</h3>
                <label className="feel-toggle">
                    <input
                        type="checkbox"
                        checked={feel.metronome}
                        disabled={busy}
                        onChange={(event) => onMetronome(event.target.checked)}
                    />
                    <span>Metronome</span>
                </label>
                <label className="feel-toggle">
                    <input
                        type="checkbox"
                        checked={feel.countIn}
                        disabled={busy}
                        onChange={(event) => onCountIn(event.target.checked)}
                    />
                    <span>Count-in</span>
                </label>
            </div>
            <div className="feel-group">
                <h3>Song length</h3>
                <label>
                    Length
                    <select
                        aria-label="Song length"
                        aria-describedby="song-length-detail"
                        value={feel.songMinutes === null ? 'off' : String(feel.songMinutes)}
                        disabled={busy || counted}
                        onChange={(event) =>
                            onSongMinutes(
                                event.target.value === 'off'
                                    ? null
                                    : (Number(event.target.value) as SongMinutes),
                            )
                        }
                    >
                        {SONG_LENGTHS.map((length) => (
                            <option key={length.value} value={length.value}>
                                {length.label}
                            </option>
                        ))}
                    </select>
                </label>
                <p className="feel-hint" id="song-length-detail">
                    {counted
                        ? `This chart plays ${chartChoruses === 1 ? 'once' : `${chartChoruses} times`}, then ends, so it sets its own length.`
                        : songReadout
                          ? songPlanText(songReadout)
                          : 'The band repeats the song until you stop it.'}
                </p>
            </div>
            <div className="feel-group">
                <h3>Level</h3>
                <RangeSetting
                    label="Master volume"
                    ariaLabel="Master volume"
                    value={feel.masterVolume}
                    max={1}
                    disabled={busy}
                    onCommit={onMasterVolume}
                />
            </div>
            <p className="band-note">
                The metronome lasts this session; song length and master volume belong to this
                device. None of them saves with the chart. Song length is counted when you press
                Play, and the band ends on its last chorus.
            </p>
        </div>
    );
}
