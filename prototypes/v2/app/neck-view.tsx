'use client';

import { useId, useMemo } from 'react';
import type { BandChart } from '../lib/band-chart';
import { defaultShellHome, type ShellLabels, type ShellPreferences } from '../lib/session';
import type { VoicedBandChord } from '../lib/shells';
import { Neck, type NeckPreview } from './neck';
import { neckModel, SHELL_INSTRUMENTS } from './use-neck-view';
import './neck-view.css';

// The stand's Neck mode (#1587): the grip for the chord sounding now, a preview of the next one
// and the sentence that walks the hand there, following the band. Presentational: the shell
// hands it the band's chart, the voiced grips and the playhead; settings go back through
// `onPrefs`. The fretboard itself is `<Neck>` (#1586).

interface NeckViewProps {
    /** The band's chart, or null for a measure-less chart, which the neck cannot follow. */
    band: BandChart | null;
    /** Every written chord's grip, keyed by `globalIndex` (`useNeckVoicing`). */
    voiced: ReadonlyMap<number, VoicedBandChord> | null;
    /** The performed slot under the playhead, or null while stopped. */
    active: number | null;
    /** The playing bar's last felt pulse (#1458): the next grip is about to land. */
    nextSoon: boolean;
    prefs: ShellPreferences;
    onPrefs: (patch: Partial<ShellPreferences>) => void;
}

const INSTRUMENT_LABELS: [ShellPreferences['instrument'], string][] = [
    ['guitar', 'Guitar'],
    ['uke', 'Ukulele'],
    ['uke-low-g', 'Ukulele (low G)'],
];
const LABEL_CHOICES: [ShellLabels, string][] = [
    ['finger', 'Fingers'],
    ['degree', 'Degrees'],
    ['note', 'Notes'],
];

/** The grip's symbol in the chart's own ASCII accidentals, so the notice reads as one chart. */
const ascii = (symbol: string): string => symbol.replaceAll('♭', 'b').replaceAll('♯', '#');

export function NeckView({ band, voiced, active, nextSoon, prefs, onPrefs }: NeckViewProps) {
    const id = useId();
    const instrument = SHELL_INSTRUMENTS[prefs.instrument];
    const model = useMemo(
        () => (band && voiced ? neckModel(band, voiced, active, instrument) : null),
        [band, voiced, active, instrument],
    );
    // Stopped, the first grip soft-previews the second, so the view is never empty; playing,
    // the preview strengthens on the last beat before the change.
    const preview: NeckPreview = active !== null && nextSoon ? 'strong' : 'soft';

    return (
        <section className="neck-view" aria-label="Neck">
            <div className="neck-view-inner">
                {!band ? (
                    <p className="neck-view-empty">
                        The neck follows charts written in bars, and this song is an older chord
                        list without them.
                    </p>
                ) : !model ? (
                    <p className="neck-view-empty">This chart has no chords to finger.</p>
                ) : (
                    <>
                        <div className="neck-strip">
                            <div className="neck-strip-names">
                                <span className="neck-current" data-testid="neck-current">
                                    {model.name}
                                </span>
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
                            {model.narration && <p className="neck-narration">{model.narration}</p>}
                        </div>
                        <Neck
                            id={id}
                            instrument={instrument}
                            active={model.grip}
                            next={model.next}
                            preview={preview}
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
                                    instrument: e.target.value as ShellPreferences['instrument'],
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
                                home: prefs.home ? null : defaultShellHome(prefs.instrument),
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
                                            .value as ShellPreferences['rootStrings'],
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
                            onChange={(e) => onPrefs({ labels: e.target.value as ShellLabels })}
                        >
                            {LABEL_CHOICES.map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>
        </section>
    );
}
