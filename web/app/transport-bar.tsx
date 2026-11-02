import type { ChartNotation } from '@core/songbook/types';
import { Fragment, useEffect, useRef, useState } from 'react';
import { genreOf } from '../lib/documents';
import { type ChartDocument, GENRE_NAMES, type PerformancePlace } from '../lib/runtime';
import { type Lane, visibleLanes } from './band-lanes';
import { KeyPopover, songKeyLabel } from './key-popover';
import { TempoControl } from './tempo-control';
import { useRangeCommit } from './use-range-commit';

interface TransportBarProps {
    current: ChartDocument;
    busy: boolean;
    playbackActive: boolean;
    /** The count-in beat sounding now (0-based: 0 shows "1"), or null when not counting in
     * (#1422). The chart itself doesn't move during this window; the play button does. */
    countInBeat: number | null;
    /** Which chorus the band is in (#1990), or null when stopped. */
    place: PerformancePlace | null;
    /** The section being looped (#1989), or null; its chip ends the loop. */
    looped: { id: string; label: string } | null;
    /** Ends the loop: playing, the band carries on into the chart at a barline. */
    onClearLoop: () => void;
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
    /**
     * What the musician plays (#1992), shown as the first chip: `label` names it, `note` says how
     * the chords read for it ("B♭ chords"), `tag` is the one word a phone has room for, and
     * `lane` is the lane that is theirs. Null before
     * they have answered. Its press opens Settings.
     */
    player: { label: string; tag: string; note: string | null; lane: Lane | null } | null;
    onPlayer: () => void;
    /** The band's intensity (#1994): one gesture, at tablet width and up. `'auto'` is the slider's
     * left stop; a level (0-1) is anywhere right of it. Lands at the next barline, as the
     * Groove tab's does. */
    onIntensity: (intensity: 'auto' | number) => void;
}

export function TransportBar({
    current,
    busy,
    playbackActive,
    countInBeat,
    place,
    looped,
    onClearLoop,
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
    player,
    onPlayer,
    onIntensity,
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
                {place && <ChorusCounter place={place} />}
                {looped && (
                    // A loop is a way of playing, not part of the chart: shown here while it is
                    // set, stopped too (Play loops it again), and ended with its ×.
                    <button
                        type="button"
                        className="loop-chip"
                        aria-label={`Stop looping section ${looped.label}`}
                        onClick={onClearLoop}
                    >
                        Looping {looped.label}
                        <span className="loop-chip-x" aria-hidden="true">
                            ×
                        </span>
                    </button>
                )}
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
            <IntensityControl
                // Re-keyed by chart, so a different song's energy never reads as this one's.
                key={current.id}
                energy={current.chart.performance.energy ?? 'auto'}
                disabled={busy}
                onCommit={onIntensity}
            />
            <div className="band-controls" aria-label="Band instruments">
                {player && (
                    <button
                        type="button"
                        className="band-toggle player-chip"
                        aria-label={`You play: ${player.label}${player.note ? `, ${player.note}` : ''}. Change`}
                        title="What you play — change it in Settings"
                        onClick={onPlayer}
                    >
                        {/* A phone's row of chips has room for a word: the tag. */}
                        <span className="label player-long" aria-hidden="true">
                            {player.label}
                            {player.note && <span className="player-note"> · {player.note}</span>}
                        </span>
                        <span className="label player-short" aria-hidden="true">
                            {player.tag}
                        </span>
                    </button>
                )}
                {visibleLanes.map(([key, label]) => {
                    const on = current.chart.band[key].enabled;
                    // Your own lane, muted, is a hole the band leaves for you (#1992).
                    const yours = player?.lane === key;
                    return (
                        <Fragment key={key}>
                            <button
                                className={`band-toggle ${on ? 'on' : 'off'}${yours ? ' yours' : ''}`}
                                disabled={busy}
                                aria-pressed={on}
                                title={
                                    yours && !on
                                        ? 'Yours: the band leaves room for your part'
                                        : undefined
                                }
                                onClick={() => onToggleLane(key)}
                            >
                                <span className="dot" />
                                <span className="label">{label}</span>
                                {yours && !on && <span className="yours-mark"> · you</span>}
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
                                        {trade === 'off' ? '⇄' : `⇄ ${tradeBars}`}
                                    </span>
                                </button>
                            )}
                        </Fragment>
                    );
                })}
            </div>
        </div>
    );
}

/** The slider's stops: 0 is Auto, 1-100 is the fixed level as a percent. */
const AUTO_STOP = 0;
function stopOf(energy: 'auto' | number): number {
    return energy === 'auto' ? AUTO_STOP : Math.max(1, Math.round(energy * 100));
}

/**
 * The band's intensity on the transport (#1994), so it can change with the chart in view. The
 * chart's own energy (`performance.energy`, the Groove tab's field): the left stop is Auto, the
 * rest a fixed level. Commits once per gesture, like every range here. Hidden below tablet width
 * (CSS), where the Groove tab keeps it.
 */
function IntensityControl({
    energy,
    disabled,
    onCommit,
}: {
    energy: 'auto' | number;
    disabled: boolean;
    onCommit: (intensity: 'auto' | number) => void;
}) {
    const [local, setLocal] = useState(stopOf(energy));
    useEffect(() => {
        setLocal(stopOf(energy));
    }, [energy]);
    const range = useRangeCommit((stop) => {
        if (stop !== stopOf(energy)) {
            onCommit(stop === AUTO_STOP ? 'auto' : stop / 100);
        }
    });
    const shown = local === AUTO_STOP ? 'Auto' : `${local}`;
    return (
        <div className="intensity-setting">
            <label className="setting-label" htmlFor="intensity">
                Intensity
            </label>
            <span className="intensity-control">
                <input
                    id="intensity"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={local}
                    disabled={disabled}
                    aria-valuetext={shown}
                    ref={range.ref}
                    onChange={(event) => {
                        range.edited();
                        setLocal(Number(event.target.value));
                    }}
                    {...range.handlers}
                />
                <span className="intensity-value">{shown}</span>
            </span>
        </div>
    );
}

/**
 * Where the band is in the song (#1990): "Chorus 2 / 3" when the song ends on its own, "Chorus 2"
 * when it repeats continuously, with the lead's part ("Head", "Solo 2", "Out") after it in a
 * counted performance. Read off the band's clock (`runtime.performancePlace`), set only when it
 * changes, so it is not a live region: a screen reader finds it by reading the bar.
 */
function ChorusCounter({ place }: { place: PerformancePlace }) {
    const count = place.of === null ? `${place.chorus}` : `${place.chorus} / ${place.of}`;
    return (
        <span className="chorus-counter" data-testid="chorus-counter">
            {/* A section loop's times round are laps of it, not choruses of the song (#1989). */}
            <span className="chorus-count">
                {place.lap ? 'Lap' : 'Chorus'} {count}
            </span>
            {place.part && <span className="chorus-part">{place.part}</span>}
        </span>
    );
}
