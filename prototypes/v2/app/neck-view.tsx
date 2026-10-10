'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { BandChart } from '../lib/band-chart';
import { defaultNeckHome, type NeckLabels, type NeckPreferences } from '../lib/session';
import { NECK_INSTRUMENTS, type VoicedBandChord } from '../lib/voicings';
import { Neck, type NeckPreview, type NeckZoom } from './neck';
import { neckModel } from './use-neck-view';
import './neck-view.css';

// The stand's Neck mode (#1587): the grip for the chord sounding now, a preview of the next one
// and a one-line headline of the root's move there (the finger-by-finger detail on request),
// following the band. Presentational: the shell
// hands it the band's chart, the voiced grips and the playhead; settings go back through
// `onPrefs`. The fretboard itself is `<Neck>` (#1586).

interface NeckViewProps {
    /** The band's chart (`legacyBandChart` for a measure-less one), or null for an empty chart. */
    band: BandChart | null;
    /** Every written chord's grip, keyed by `globalIndex` (`useNeckVoicing`). */
    voiced: ReadonlyMap<number, VoicedBandChord> | null;
    /** The performed slot under the playhead, or null while stopped. */
    active: number | null;
    /** The playing bar's last felt pulse (#1458): the next grip is about to land. */
    nextSoon: boolean;
    prefs: NeckPreferences;
    onPrefs: (patch: Partial<NeckPreferences>) => void;
}

const INSTRUMENT_LABELS: [NeckPreferences['instrument'], string][] = [
    ['guitar', 'Guitar'],
    ['uke', 'Ukulele'],
    ['uke-low-g', 'Ukulele (low G)'],
];
const LABEL_CHOICES: [NeckLabels, string][] = [
    ['finger', 'Fingers'],
    ['degree', 'Degrees'],
    ['note', 'Notes'],
];

/** `neck-view.css`'s phone breakpoint: below it the board zooms onto the hand (#1593). */
const PHONE = '(max-width: 760px)';

/**
 * The board's zoom for this viewport: the whole neck, or the hand's frets on a phone. The static
 * export prerenders the whole neck; the viewport is read on mount and on every change.
 */
function useNeckZoom(): NeckZoom {
    const [phone, setPhone] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(PHONE);
        const read = () => setPhone(media.matches);
        read();
        media.addEventListener('change', read);
        return () => media.removeEventListener('change', read);
    }, []);
    return phone ? 'window' : 'board';
}

/** The grip's symbol in the chart's own ASCII accidentals, so the notice reads as one chart. */
const ascii = (symbol: string): string => symbol.replaceAll('♭', 'b').replaceAll('♯', '#');

export function NeckView({ band, voiced, active, nextSoon, prefs, onPrefs }: NeckViewProps) {
    const id = useId();
    const instrument = NECK_INSTRUMENTS[prefs.instrument];
    const zoom = useNeckZoom();
    const model = useMemo(
        () => (band && voiced ? neckModel(band, voiced, active, instrument) : null),
        [band, voiced, active, instrument],
    );
    // The board previews the next grip only on the last beat before the change (#1592): all bar
    // long it is the grip sounding now. Stopped, the strip names the next chord instead.
    const preview: NeckPreview = active !== null && nextSoon ? 'strong' : 'soft';

    return (
        <section className="neck-view" aria-label="Neck">
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
                            home={prefs.home}
                            onHome={(start) => onPrefs({ home: [start, start + 5] })}
                            dimmed={model.held !== null}
                            // The neck re-runs the strike per voicing object, so a steady `true`
                            // while playing pulses each chord as it lands, and nothing while stopped.
                            strike={active !== null}
                        />
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
                            {INSTRUMENT_LABELS.map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button
                        type="button"
                        className="btn neck-hand-toggle"
                        onClick={() =>
                            onPrefs({
                                home: prefs.home ? null : defaultNeckHome(prefs.instrument),
                            })
                        }
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
                </div>
            </div>
        </section>
    );
}
