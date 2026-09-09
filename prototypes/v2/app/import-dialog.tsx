'use client';

import { type IRealImportResult, parseIRealImport } from '@engine/songbook/ireal-import';
import { prepareScorePlayback } from '@engine/songbook/score-playback';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type ChartDocument, validateDocument } from '../lib/documents';
import { importedDocument } from '../lib/import-document';
import { directionLabel } from '../lib/score-labels';
import './import-dialog.css';

export function downloadImportSource(text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    // Inert download: never open untrusted source as an HTML document.
    anchor.download = 'original-ireal-source.txt';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportDialog({
    base,
    onClose,
    onAdd,
}: {
    base: ChartDocument;
    onClose: () => void;
    onAdd: (candidate: ChartDocument) => Promise<void>;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const request = useRef(0);
    const [link, setLink] = useState('');
    const [source, setSource] = useState('');
    const [result, setResult] = useState<IRealImportResult | null>(null);
    const [native, setNative] = useState<ChartDocument | null>(null);
    const [selected, setSelected] = useState(0);
    const [tempo, setTempo] = useState(String(base.chart.performance.bpm));
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const element = dialog.current!;
        element.showModal();
        return () => {
            request.current++;
            element.close();
        };
    }, []);

    function review(text: string) {
        setSource(text);
        setResult(null);
        setNative(null);
        setError('');
        setSelected(0);
        try {
            if (new TextEncoder().encode(text).byteLength > 1_048_576) {
                throw new Error('Chart files must be 1 MB or smaller.');
            }
            if (text.trimStart().startsWith('{')) {
                const candidate = validateDocument(JSON.parse(text));
                if (candidate.schemaVersion === 2) {
                    prepareScorePlayback(candidate.chart.score);
                }
                setNative(candidate);
            } else {
                setResult(parseIRealImport(text));
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Cannot read this chart.');
        }
    }

    const song = result?.songs[selected];
    const diagnostics = [...(result?.diagnostics ?? []), ...(song?.diagnostics ?? [])];
    // Playback updates the parent frequently. Only recheck a newly selected score.
    const capability = useMemo(() => {
        if (
            !song?.score ||
            [...(result?.diagnostics ?? []), ...song.diagnostics].some(
                (d) => d.severity === 'error',
            )
        ) {
            return '';
        }
        try {
            prepareScorePlayback(song.score);
            return '';
        } catch (reason) {
            return reason instanceof Error ? reason.message : 'This chart cannot be played yet.';
        }
    }, [song, result]);
    const canAdd =
        !!native ||
        !!(song?.score && !capability && !diagnostics.some((d) => d.severity === 'error'));

    async function add() {
        setBusy(true);
        setError('');
        try {
            const candidate =
                native ?? (result ? importedDocument(result, selected, base, Number(tempo)) : null);
            if (!candidate) {
                throw new Error('Choose a chart to import.');
            }
            await onAdd(candidate);
            onClose();
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : 'Import failed. Your current chart is unchanged.',
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <dialog
            ref={dialog}
            className="import-dialog"
            aria-label="Review import"
            onCancel={(event) => {
                event.preventDefault();
                if (!busy) {
                    onClose();
                }
            }}
        >
            <h2>Review import</h2>
            <p>Open an iReal Pro export or an Ensemble file. Everything stays on this device.</p>
            <label className="import-field">
                Choose a chart file
                <input
                    type="file"
                    aria-label="Import chart file"
                    accept=".html,.htm,.ensemble,.json,.txt"
                    disabled={busy}
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (!file) {
                            return;
                        }
                        const token = ++request.current;
                        setBusy(true);
                        setResult(null);
                        setNative(null);
                        setSource('');
                        setError('');
                        void (async () => {
                            try {
                                if (file.size > 1_048_576) {
                                    throw new Error('Chart files must be 1 MB or smaller.');
                                }
                                const text = await file.text();
                                if (token === request.current) {
                                    review(text);
                                }
                            } catch (reason) {
                                if (token === request.current) {
                                    setError(
                                        reason instanceof Error
                                            ? reason.message
                                            : 'Cannot read this file.',
                                    );
                                }
                            } finally {
                                if (token === request.current) {
                                    setBusy(false);
                                }
                            }
                        })();
                    }}
                />
            </label>
            <details>
                <summary>Or paste an iReal link</summary>
                <label className="import-field">
                    iReal link
                    <textarea
                        aria-label="iReal link"
                        rows={2}
                        maxLength={1_048_576}
                        value={link}
                        disabled={busy}
                        onChange={(e) => {
                            setLink(e.target.value);
                            setResult(null);
                            setNative(null);
                            setSource('');
                            setError('');
                        }}
                    />
                </label>
                <button
                    className="btn"
                    disabled={busy || !link.trim()}
                    onClick={() => review(link)}
                >
                    Review link
                </button>
            </details>
            {result && result.songs.length > 1 && (
                <label className="import-field">
                    Song to import
                    <select
                        value={selected}
                        disabled={busy}
                        onChange={(event) => {
                            setSelected(Number(event.target.value));
                            setError('');
                        }}
                    >
                        {result.songs.map((item, index) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: immutable import entries have positional identity and options hold no state.
                            <option key={`${index}-${item.title}`} value={index}>
                                {item.title}
                            </option>
                        ))}
                    </select>
                </label>
            )}
            {(song || native) && (
                <section className="import-summary" aria-label="Import preview">
                    <h3>{song?.title ?? native?.title}</h3>
                    {song?.score && (
                        <>
                            <p>
                                {song.score.sections.reduce((n, s) => n + s.measures.length, 0)}{' '}
                                written bars · Stored key {song.score.key}
                                {song.score.isMinor ? ' minor' : ' major'} · {song.score.meter}
                            </p>
                            <p>
                                The stored key will be used. Export transposition (
                                {song.metadata.transpose || 'unset'}) is not applied; you can change
                                key after importing.
                            </p>
                            <div className="import-chart" aria-label="Imported chart">
                                {song.score.sections
                                    .flatMap((s) => s.measures)
                                    .map((bar, index) => (
                                        <span key={bar.id}>
                                            <small>
                                                {index + 1} ·{' '}
                                                {(bar.start ?? []).map(directionLabel).join(' · ')}
                                            </small>
                                            {bar.content.kind === 'repeat'
                                                ? '%'
                                                : bar.content.events
                                                      .map(
                                                          (e) =>
                                                              `${e.kind === 'chord' ? e.symbol : e.kind === 'no-chord' ? 'N.C.' : 'Hold'} (${e.duration[1] === 1 ? e.duration[0] : e.duration.join('/')}♩)`,
                                                      )
                                                      .join('  ')}
                                            <small>
                                                {(bar.end ?? []).map(directionLabel).join(' · ')}
                                            </small>
                                        </span>
                                    ))}
                            </div>
                            <label className="import-field">
                                Starting tempo (BPM)
                                <input
                                    aria-label="Import tempo"
                                    type="number"
                                    min={40}
                                    max={240}
                                    value={tempo}
                                    disabled={busy}
                                    onChange={(event) => setTempo(event.target.value)}
                                />
                            </label>
                            <p>
                                Uses your current {base.chart.band.groove.genreFeel} band setup.
                                Export style, tempo, and chorus count are preserved in the source,
                                not automatically applied.
                            </p>
                        </>
                    )}
                    {native && (
                        <p>
                            An independent copy will be added. The original file and existing songs
                            are unchanged.
                        </p>
                    )}
                </section>
            )}
            {diagnostics.length > 0 && (
                <ul className="import-diagnostics" aria-label="Import explanations">
                    {diagnostics.map((d, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: immutable diagnostic positions, with no child state.
                        <li key={`${index}-${d.message}`}>
                            {d.severity === 'error' ? 'Cannot import yet: ' : 'Note: '}
                            {d.path ? `${d.path}: ` : ''}
                            {d.message}
                        </li>
                    ))}
                </ul>
            )}
            {capability && (
                <p role="alert">
                    Cannot play this chart yet: {capability} The original source is preserved.
                </p>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="dialog-actions">
                <button
                    className="btn primary"
                    disabled={busy || !canAdd}
                    onClick={() => void add()}
                >
                    {busy ? 'Working…' : 'Add to songbook'}
                </button>
                <button className="btn" disabled={busy} onClick={onClose}>
                    Cancel
                </button>
                {source && (
                    <button
                        className="btn"
                        disabled={busy}
                        onClick={() => downloadImportSource(source)}
                    >
                        Download original source
                    </button>
                )}
            </div>
        </dialog>
    );
}
