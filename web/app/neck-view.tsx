'use client';

import type { ChartNotation } from '@core/songbook/types';
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from 'react';
import type { BandChart } from '../lib/band-chart';
import type { NeckLabels, NeckPreferences, PlacedNeckPreferences } from '../lib/session';
import { gripMidis, NECK_INSTRUMENTS, type VoicedBandChord } from '../lib/voicings';
import { Neck, type NeckPreview, type NeckZoom } from './neck';
import { NeckChartRowView } from './neck-chart-row';
import { HOME_W } from './neck-geometry';
import {
    changePosition,
    chordChanges,
    endsRun,
    firstVoicedSlot,
    neckModel,
    nextVoicedSlot,
    prevVoicedSlot,
} from './use-neck-view';
import './neck-view.css';

// The stand's Neck mode (#1587): the grip for the chord sounding now, a preview of the next one
// and a one-line headline of the root's move there (the finger-by-finger detail on request),
// following the band. Stopped, the learner steps through the changes at their own pace (#1595)
// and taps the board to hear the grip (#1596). Presentational: the shell hands it the band's
// chart, the voiced grips and the playhead; settings go back through `onPrefs`, a strum through
// `onStrum`. The fretboard itself is `<Neck>` (#1586).

interface NeckViewProps {
    /** The band's chart, or null for an empty chart. */
    band: BandChart | null;
    /** Every written chord's grip, keyed by `globalIndex` (`useNeckVoicing`). */
    voiced: ReadonlyMap<number, VoicedBandChord> | null;
    /** The performed slot under the playhead, or null while stopped. */
    active: number | null;
    /**
     * The last felt pulse before the `active` slot ends (`runtime.inLastBeatOfSlot`, #1590): the
     * next grip is about to land. The slot's end, not the barline the chart's next-bar cue waits
     * for — a second chord inside the bar is a change too. Only a slot that ends its chord's run
     * (`endsRun`) acts on it.
     */
    changeSoon: boolean;
    /**
     * The band is playing or about to (a count-in has no `active` slot yet): no stepping, no
     * strum — the band is the sound and the playhead the cursor.
     */
    playing: boolean;
    /** Sound these MIDI pitches as a strum, lowest string first (`runtime.auditionPitches`). */
    onStrum?: (midis: number[]) => void;
    /** The chart's chord notation, for the chart row under the board. */
    notation: ChartNotation;
    /** The settings with the hand placed (`placeNeckHand`). */
    prefs: PlacedNeckPreferences;
    onPrefs: (patch: Partial<NeckPreferences>) => void;
}

const LABEL_CHOICES: [NeckLabels, string][] = [
    ['finger', 'Fingers'],
    ['degree', 'Degrees'],
    ['note', 'Notes'],
];

/**
 * Where the board zooms onto the hand (#1593, #1995): a phone, and any portrait screen. A
 * portrait tablet is as wide as a laptop but twice as tall, and the whole neck drawn to its width
 * is a strip across the top; zoomed, the frets get the room the height gives them.
 */
const ZOOMED = '(max-width: 760px), (orientation: portrait)';

/**
 * The board's zoom for this viewport: the whole neck, or the hand's frets on a phone or portrait screen. The static
 * export prerenders the whole neck; the viewport is read on mount and on every change.
 */
function useNeckZoom(): NeckZoom {
    const [zoomed, setZoomed] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(ZOOMED);
        const read = () => setZoomed(media.matches);
        read();
        media.addEventListener('change', read);
        return () => media.removeEventListener('change', read);
    }, []);
    return zoomed ? 'window' : 'board';
}

/** The grip's symbol in the chart's own ASCII accidentals, so the notice reads as one chart. */
const ascii = (symbol: string): string => symbol.replaceAll('♭', 'b').replaceAll('♯', '#');

/**
 * Whether ← / → belong to what has focus rather than to the stepping: a settings field (a select
 * changes its value on them) or the home-window handle (its arrows move the hand).
 */
const ownsArrows = (target: EventTarget): boolean =>
    target instanceof Element && target.closest('input, select, textarea, .neck-handle') !== null;

export function NeckView({
    band,
    voiced,
    active,
    changeSoon,
    playing,
    onStrum,
    notation,
    prefs,
    onPrefs,
}: NeckViewProps) {
    const id = useId();
    const instrument = NECK_INSTRUMENTS[prefs.instrument];
    const zoom = useNeckZoom();
    const stopped = active === null && !playing;
    // The stopped step-through (#1595): a performed slot the learner moved to, or null for the
    // "Starts on" view. Session-only; Play hands the neck back to the band and another chart
    // starts over, so both clear it (adjusting state on a prop change, not in an effect).
    const [cursor, setCursor] = useState<number | null>(null);
    const [cursorFor, setCursorFor] = useState({ band, stopped });
    if (cursorFor.band !== band || cursorFor.stopped !== stopped) {
        setCursorFor({ band, stopped });
        setCursor(null);
    }
    const shownSlot = stopped ? cursor : active;
    const changes = useMemo(() => (band ? chordChanges(band) : []), [band]);
    const model = useMemo(
        () => (band && voiced ? neckModel(band, voiced, shownSlot, instrument) : null),
        [band, voiced, shownSlot, instrument],
    );
    // The board previews the next grip only on the last beat before the change (#1592): until
    // then it is the grip sounding now. A slot that ends into the same chord again, a hold or an
    // N.C. is no change (`endsRun`, #1590), so its last beat stays the grip alone. Stopped, the
    // strip names the next chord instead — unless the learner stepped here, when the change
    // ahead is what they are looking at.
    const changing = active !== null && changeSoon && band !== null && endsRun(band, active);
    const preview: NeckPreview = changing || (stopped && cursor !== null) ? 'strong' : 'soft';
    const canStep = stopped && band !== null && model !== null && changes.length > 1;
    const step = (direction: 1 | -1) => {
        if (!band) {
            return;
        }
        const from = cursor ?? firstVoicedSlot(band);
        if (from === null) {
            return;
        }
        const to = direction === 1 ? nextVoicedSlot(band, from) : prevVoicedSlot(band, from);
        if (to !== null) {
            setCursor(to);
        }
    };
    const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
        if (!canStep || ownsArrows(e.target) || e.altKey || e.ctrlKey || e.metaKey) {
            return;
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            step(e.key === 'ArrowRight' ? 1 : -1);
        }
    };
    const position =
        canStep && band ? changePosition(changes, cursor ?? firstVoicedSlot(band) ?? 0) : 0;
    // The SOUNDING grip: under a hold or N.C., the one held over, once.
    const grip = model?.grip ?? null;
    const strum =
        stopped && onStrum && grip ? () => onStrum(gripMidis(instrument, grip)) : undefined;

    return (
        <section className="neck-view" aria-label="Neck" tabIndex={0} onKeyDown={onKeyDown}>
            <div className="neck-view-inner">
                {!model ? (
                    <p className="neck-view-empty">This chart has no chords to finger.</p>
                ) : (
                    <>
                        <div className="neck-strip">
                            <div className="neck-strip-names">
                                <span className="neck-current" data-testid="neck-current">
                                    {model.name}
                                </span>
                                {/* Guitar only: a uke's standard chords are shapes, and its
                                    re-entrant G would call most of them inverted by pitch. */}
                                {prefs.instrument === 'guitar' && model.inversion !== 0 && (
                                    <span className="neck-note" data-testid="neck-inversion">
                                        {model.inversion === 1 ? '1st inv.' : '2nd inv.'}
                                    </span>
                                )}
                                {model.held === 'hold' && <span className="neck-note">held</span>}
                                {model.approximatedFrom && model.grip && (
                                    <span
                                        className="neck-note"
                                        title={model.grip.approximation ?? undefined}
                                    >
                                        played as {ascii(model.grip.symbol)} — the chart says{' '}
                                        {model.approximatedFrom}
                                    </span>
                                )}
                                {model.nextName && (
                                    <span className="neck-next" data-testid="neck-next">
                                        <span aria-hidden="true">→ </span>
                                        {model.nextName}
                                    </span>
                                )}
                            </div>
                            {canStep && (
                                <div className="neck-step">
                                    <button
                                        type="button"
                                        className="btn neck-step-button"
                                        aria-label="Previous chord"
                                        onClick={() => step(-1)}
                                    >
                                        ←
                                    </button>
                                    <span
                                        className="neck-step-position"
                                        data-testid="neck-position"
                                    >
                                        {position} / {changes.length}
                                    </span>
                                    <button
                                        type="button"
                                        className="btn neck-step-button"
                                        aria-label="Next chord"
                                        onClick={() => step(1)}
                                    >
                                        →
                                    </button>
                                </div>
                            )}
                            {model.headline && <p className="neck-headline">{model.headline}</p>}
                            {prefs.fingers && model.fingers && (
                                <p className="neck-fingers">{model.fingers}</p>
                            )}
                        </div>
                        <Neck
                            id={id}
                            instrument={instrument}
                            active={model.grip}
                            next={model.next}
                            preview={preview}
                            // The same pref says the fingers in the strip and draws them here.
                            fingers={prefs.fingers}
                            zoom={zoom}
                            labels={prefs.labels}
                            shell={prefs.shell}
                            home={prefs.home}
                            onHome={(start) => onPrefs({ home: [start, start + HOME_W - 1] })}
                            dimmed={model.held !== null}
                            // The neck re-runs the strike per voicing object, so a steady `true`
                            // while playing pulses each chord as it lands, and nothing while stopped.
                            strike={active !== null}
                            onStrum={strum}
                        />
                        {band && (
                            <NeckChartRowView band={band} notation={notation} slot={shownSlot} />
                        )}
                    </>
                )}
                <div className="neck-settings">
                    <label className="neck-setting">
                        <span className="setting-label">Instrument</span>
                        <select
                            className="setting-select"
                            aria-label="Instrument"
                            value={prefs.instrument}
                            onChange={(e) =>
                                onPrefs({
                                    instrument: e.target.value as NeckPreferences['instrument'],
                                })
                            }
                        >
                            {Object.entries(NECK_INSTRUMENTS).map(([value, instrument]) => (
                                <option key={value} value={value}>
                                    {instrument.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button
                        type="button"
                        className="btn neck-hand-toggle"
                        // Locking the hand again puts it back in first position (#1598, #1840).
                        onClick={() => onPrefs({ home: prefs.home ? null : 'key' })}
                    >
                        {prefs.home ? 'Anywhere' : 'Lock hand'}
                    </button>
                    {prefs.instrument === 'guitar' && (
                        <label className="neck-setting">
                            <span className="setting-label">Roots</span>
                            <select
                                className="setting-select"
                                aria-label="Root strings"
                                value={prefs.rootStrings}
                                onChange={(e) =>
                                    onPrefs({
                                        rootStrings: e.target
                                            .value as NeckPreferences['rootStrings'],
                                    })
                                }
                            >
                                <option value="all">All strings</option>
                                <option value="classic">6th &amp; 5th only</option>
                            </select>
                        </label>
                    )}
                    <label className="neck-setting">
                        <span className="setting-label">Dots</span>
                        <select
                            className="setting-select"
                            aria-label="Labels"
                            value={prefs.labels}
                            onChange={(e) => onPrefs({ labels: e.target.value as NeckLabels })}
                        >
                            {LABEL_CHOICES.map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="neck-setting neck-check">
                        <input
                            type="checkbox"
                            aria-label="Say the fingers"
                            checked={prefs.fingers}
                            onChange={(e) => onPrefs({ fingers: e.target.checked })}
                        />
                        <span className="setting-label">Say the fingers</span>
                    </label>
                    <label className="neck-setting neck-check">
                        <input
                            type="checkbox"
                            aria-label="Show the shell"
                            checked={prefs.shell}
                            onChange={(e) => onPrefs({ shell: e.target.checked })}
                        />
                        <span className="setting-label">Show the shell</span>
                    </label>
                </div>
            </div>
        </section>
    );
}
