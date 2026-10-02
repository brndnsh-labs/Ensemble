'use client';

import { type IRealImportResult, parseIRealImportInSteps } from '@engine/songbook/ireal-import';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type ChartDocument, genreOf, validateDocument } from '../lib/documents';
import { checkPlayable } from '../lib/engine-mode';
import { importedDocument } from '../lib/import-document';
import {
    DEFAULT_PLAYLIST_NAME,
    type ExistingCollection,
    framePace,
    type PlaylistImport,
    type PlaylistPlan,
    planPlaylist,
    resolvePlaylistImport,
} from '../lib/playlist-import';
import { directionLabel } from '../lib/score-labels';
import { capRefusal, MAX_REMOTE_CANDIDATES } from '../lib/sync/repository';
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

/**
 * What a whole-playlist import (#1478) needs from the shell: the live songbook to check for
 * duplicates and same-named collections, the account's document count for its cap (null for a
 * guest, who has none), and the one write. Nothing here writes; `onImport` is the shell's.
 */
export interface PlaylistImportContext {
    /** Every song in the live songbook, or null while the shell is still reading it. */
    library: readonly ChartDocument[] | null;
    /** Every collection in the live songbook, or null while they are read. */
    collections: readonly ExistingCollection[] | null;
    /** Ask the shell to read the whole songbook — only once a playlist needs the check. */
    onWantLibrary: () => void;
    /**
     * Signed in: how many documents the account holds, by this device's verified copy of it — or
     * why that cannot be told yet (`libraryCheck`, #1478 review R1). Null for a guest — no cap.
     */
    accountRoom: (() => Promise<{ held: number } | { refusal: string }>) | null;
    /**
     * Changes whenever the account library download moves (`SyncSnapshot.documents`), so a summary
     * opened mid-download re-asks `accountRoom` as it completes. Null for a guest.
     */
    libraryProgress: string | null;
    /** Write the import; `onProgress` gets a sentence to show while it runs. */
    onImport: (plan: PlaylistImport, onProgress: (text: string) => void) => Promise<void>;
}

const count = (value: number) => value.toLocaleString('en-US');
const songs = (value: number) => `${count(value)} ${value === 1 ? 'song' : 'songs'}`;

export function ImportDialog({
    base,
    onClose,
    onAdd,
    playlist,
}: {
    base: ChartDocument;
    onClose: () => void;
    onAdd: (candidate: ChartDocument) => Promise<void>;
    playlist: PlaylistImportContext;
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
    /** Reading or checking an export: cancellable — Cancel and Escape stay live (review R5). */
    const [reading, setReading] = useState(false);
    /** Writing to a songbook: the one step that is never interrupted from here. */
    const [writing, setWriting] = useState(false);
    const busy = reading || writing;
    /** A sentence while a long step runs (reading, checking, importing), else null. */
    const [progress, setProgress] = useState<string | null>(null);
    // #1478 — the whole-playlist path, offered beside the single-song picker.
    const [plan, setPlan] = useState<PlaylistPlan | null>(null);
    const [mode, setMode] = useState<'all' | 'one'>('all');
    const [includeDuplicates, setIncludeDuplicates] = useState(false);
    const [name, setName] = useState('');
    const [room, setRoom] = useState<{ held: number } | { refusal: string } | null>(null);
    const [roomError, setRoomError] = useState('');

    useEffect(() => {
        const element = dialog.current!;
        // The control that opened this dialog. The shell UNMOUNTS the dialog to close it, and a
        // dialog closed after it has left the document hands focus back to nothing, so it is
        // returned here — when that control is still on the page (an import that opened another
        // page takes focus there instead).
        const opener =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        element.showModal();
        return () => {
            request.current++;
            element.close();
            if (opener?.isConnected) {
                opener.focus();
            }
        };
    }, []);

    function reset() {
        setResult(null);
        setNative(null);
        setPlan(null);
        setMode('all');
        setIncludeDuplicates(false);
        setRoom(null);
        setRoomError('');
        setError('');
        setSelected(0);
    }

    /**
     * Read an export. An iReal one is parsed in slices (`parseIRealImportInSteps`) and, when it
     * holds more than one song, every song is built and checked the same way (`planPlaylist`), so
     * the summary can say what a whole-playlist import would do before anything is written. Both
     * hand the event loop back between slices: Jazz 1460 is seconds of work on a phone.
     */
    async function review(text: string, fileName?: string) {
        const token = ++request.current;
        const current = () => token === request.current;
        setSource(text);
        reset();
        try {
            if (new TextEncoder().encode(text).byteLength > 1_048_576) {
                throw new Error('Chart files must be 1 MB or smaller.');
            }
            if (text.trimStart().startsWith('{')) {
                const candidate = validateDocument(JSON.parse(text));
                if (candidate.schemaVersion === 2) {
                    checkPlayable(candidate.chart.score);
                }
                setNative(candidate);
                return;
            }
            setReading(true);
            setProgress('Reading the export…');
            const pace = framePace();
            const parsed = await parseIRealImportInSteps(text, {
                ...pace,
                onProgress: (done, total) => {
                    if (current()) {
                        setProgress(`Reading songs… ${count(done)} of ${count(total)}`);
                    }
                },
                cancelled: () => !current(),
            });
            if (!parsed || !current()) {
                return;
            }
            setResult(parsed);
            if (parsed.songs.length < 2) {
                return;
            }
            const built = await planPlaylist(parsed, base, {
                ...pace,
                onProgress: (done, total) => {
                    if (current()) {
                        setProgress(`Checking songs… ${count(done)} of ${count(total)}`);
                    }
                },
                cancelled: () => !current(),
            });
            if (!built || !current()) {
                return;
            }
            setPlan(built);
            setName(
                built.playlistName ??
                    (fileName?.replace(/\.[^.]*$/, '').trim() || DEFAULT_PLAYLIST_NAME),
            );
        } catch (reason) {
            if (current()) {
                setError(reason instanceof Error ? reason.message : 'Cannot read this chart.');
            }
        } finally {
            if (current()) {
                setReading(false);
                setProgress(null);
            }
        }
    }

    // The account's room, read once a playlist is ready — the cap is stated before anything is
    // written — and again as the library download moves. The store re-checks it as it writes.
    const { accountRoom, libraryProgress } = playlist;
    // Asked once per playlist, through the LATEST callback: the shell's is a fresh function on
    // every render, and asking again on each one would re-request a read that failed in a loop.
    const wantLibrary = useRef(playlist.onWantLibrary);
    wantLibrary.current = playlist.onWantLibrary;
    useEffect(() => {
        if (plan) {
            wantLibrary.current();
        }
    }, [plan]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: `libraryProgress` is a re-run trigger.
    useEffect(() => {
        if (!plan || !accountRoom) {
            return;
        }
        let alive = true;
        accountRoom().then(
            (value) => {
                if (alive) {
                    setRoom(value);
                    setRoomError('');
                }
            },
            (reason: unknown) => {
                if (alive) {
                    setRoomError(
                        reason instanceof Error
                            ? reason.message
                            : 'Your account library could not be read.',
                    );
                }
            },
        );
        return () => {
            alive = false;
        };
    }, [plan, accountRoom, libraryProgress]);

    const resolved = useMemo((): { value: PlaylistImport } | { error: string } | null => {
        if (!plan || !playlist.library || !playlist.collections) {
            return null;
        }
        try {
            return {
                value: resolvePlaylistImport(plan, {
                    library: playlist.library,
                    collections: playlist.collections,
                    includeDuplicates,
                    name,
                    bpm: Number(tempo),
                }),
            };
        } catch (reason) {
            return {
                error: reason instanceof Error ? reason.message : 'This playlist cannot import.',
            };
        }
    }, [plan, playlist.library, playlist.collections, includeDuplicates, name, tempo]);
    const summary = resolved && 'value' in resolved ? resolved.value : null;
    const capMessage =
        summary && accountRoom && room
            ? 'refusal' in room
                ? room.refusal
                : capRefusal(summary.documents, room.held)
            : null;
    const whole = !!plan && mode === 'all';

    const song = whole ? undefined : result?.songs[selected];
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
            checkPlayable(song.score);
            return '';
        } catch (reason) {
            return reason instanceof Error ? reason.message : 'This chart cannot be played yet.';
        }
    }, [song, result]);
    const canAdd =
        !!native ||
        !!(song?.score && !capability && !diagnostics.some((d) => d.severity === 'error'));
    // An import that adds no song and no collection entry would write nothing at all.
    const nothingNew =
        !!summary &&
        summary.songs.length === 0 &&
        (summary.collection.kind === 'existing' ? summary.added === 0 : false);
    const canImportAll =
        !!summary &&
        !nothingNew &&
        !capMessage &&
        !roomError &&
        (accountRoom === null || room !== null);

    async function add() {
        setWriting(true);
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
            setWriting(false);
        }
    }

    async function importAll() {
        if (!summary || !canImportAll) {
            return;
        }
        setWriting(true);
        setError('');
        setProgress(`Importing ${songs(summary.songs.length)}…`);
        try {
            await playlist.onImport(summary, setProgress);
            onClose();
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : 'The import failed. Nothing was imported.',
            );
        } finally {
            setWriting(false);
            setProgress(null);
        }
    }

    return (
        <dialog
            ref={dialog}
            className="import-dialog"
            aria-label="Review import"
            onCancel={(event) => {
                event.preventDefault();
                // Reading is cancellable (closing stops the parse — `request` moves on unmount and
                // every step checks it); only a write in progress holds the dialog open.
                if (!writing) {
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
                        setReading(true);
                        reset();
                        setSource('');
                        void (async () => {
                            try {
                                if (file.size > 1_048_576) {
                                    throw new Error('Chart files must be 1 MB or smaller.');
                                }
                                const text = await file.text();
                                if (token === request.current) {
                                    await review(text, file.name);
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
                                    setReading(false);
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
                            request.current++;
                            setLink(e.target.value);
                            reset();
                            setSource('');
                        }}
                    />
                </label>
                <button
                    className="btn"
                    disabled={busy || !link.trim()}
                    onClick={() => void review(link)}
                >
                    Review link
                </button>
            </details>
            {progress && (
                <p className="import-progress" role="status" data-testid="import-progress">
                    {progress}
                </p>
            )}
            {plan && result && (
                <fieldset className="import-choice" disabled={busy}>
                    <legend>
                        {plan.playlistName ?? 'This playlist'} · {songs(plan.entries.length)}
                    </legend>
                    <label>
                        <input
                            type="radio"
                            name="import-what"
                            checked={mode === 'all'}
                            onChange={() => setMode('all')}
                        />
                        <span>
                            <strong>Import all {count(plan.entries.length)} as a collection</strong>
                            <small>
                                Each song is yours to edit. Deleting the collection later never
                                deletes its songs.
                            </small>
                        </span>
                    </label>
                    <label>
                        <input
                            type="radio"
                            name="import-what"
                            checked={mode === 'one'}
                            onChange={() => setMode('one')}
                        />
                        <span>
                            <strong>Choose one song</strong>
                        </span>
                    </label>
                </fieldset>
            )}
            {result && result.songs.length > 1 && !whole && (
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
            {whole && plan && (
                <section
                    className="import-summary"
                    aria-label="Playlist summary"
                    data-testid="playlist-summary"
                >
                    <label className="import-field">
                        Collection name
                        <input
                            aria-label="Collection name"
                            data-testid="playlist-collection-name"
                            value={name}
                            maxLength={200}
                            disabled={busy}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </label>
                    {!playlist.library || !playlist.collections ? (
                        <p role="status">Checking your songbook for songs you already have…</p>
                    ) : resolved && 'error' in resolved ? (
                        <p role="alert">{resolved.error}</p>
                    ) : summary ? (
                        <>
                            <p data-testid="playlist-counts">
                                {summary.songs.length === 0
                                    ? 'No new songs to import'
                                    : `${songs(summary.songs.length)} to import`}
                                {summary.collection.kind === 'existing'
                                    ? `, added to your collection “${summary.collection.name}”, which already exists.`
                                    : `, as the new collection “${summary.collection.name}”.`}
                            </p>
                            {summary.duplicates.length > 0 && (
                                <div
                                    className="import-duplicates"
                                    data-testid="playlist-duplicates"
                                >
                                    <p>
                                        {songs(summary.duplicates.length)}{' '}
                                        {summary.duplicates.length === 1 ? 'matches' : 'match'}{' '}
                                        {summary.duplicatesInSongbook === summary.duplicates.length
                                            ? 'a song already in your songbook'
                                            : summary.duplicatesInSongbook === 0
                                              ? 'an earlier song in this playlist'
                                              : `a song already in your songbook (${count(summary.duplicatesInSongbook)}) or earlier in this playlist`}{' '}
                                        by title and composer.{' '}
                                        {includeDuplicates
                                            ? 'They are imported as new copies.'
                                            : 'They are skipped; the collection lists the copy you already have.'}
                                    </p>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={includeDuplicates}
                                            disabled={busy}
                                            onChange={(event) =>
                                                setIncludeDuplicates(event.target.checked)
                                            }
                                        />
                                        Import duplicates anyway
                                    </label>
                                    <details data-testid="playlist-duplicate-list">
                                        <summary>Which songs</summary>
                                        <ul className="import-diagnostics">
                                            {summary.duplicates.map((entry) => (
                                                <li key={entry.index}>
                                                    <strong>{entry.title}</strong>
                                                    {entry.composer ? ` (${entry.composer})` : ''}
                                                    {entry.matched.inSongbook
                                                        ? ' matches “'
                                                        : ' repeats “'}
                                                    {entry.matched.title}”
                                                    {entry.matched.composer
                                                        ? ` (${entry.matched.composer})`
                                                        : ' (no composer)'}
                                                    {entry.matched.inSongbook
                                                        ? ', already in your songbook.'
                                                        : ', earlier in this playlist.'}
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                </div>
                            )}
                            {summary.refused.length > 0 && (
                                <details className="import-refused" data-testid="playlist-refused">
                                    <summary>
                                        {songs(summary.refused.length)} can’t be imported yet and{' '}
                                        {summary.refused.length === 1 ? 'is' : 'are'} skipped
                                    </summary>
                                    <ul className="import-diagnostics">
                                        {summary.refused.map((entry) => (
                                            <li key={entry.index}>
                                                <strong>{entry.title}</strong>:{' '}
                                                {entry.reasons.join(' ')}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                            {accountRoom && (
                                <p
                                    data-testid="playlist-cap"
                                    role={capMessage || roomError ? 'alert' : undefined}
                                >
                                    {roomError
                                        ? roomError
                                        : room === null
                                          ? 'Checking how much room your account has…'
                                          : (capMessage ??
                                            ('held' in room
                                                ? `Your account can hold ${count(MAX_REMOTE_CANDIDATES)} songs and collections. Counting what this device has downloaded from it, it would hold ${count(room.held + summary.documents)} after this import.`
                                                : ''))}
                                </p>
                            )}
                        </>
                    ) : null}
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
                        Uses your current {genreOf(base)} band setup. Export style, tempo, and
                        chorus count are preserved in each song’s source, not automatically applied.
                    </p>
                </section>
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
                                Uses your current {genreOf(base)} band setup. Export style, tempo,
                                and chorus count are preserved in the source, not automatically
                                applied.
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
                {whole ? (
                    <button
                        className="btn primary"
                        disabled={busy || !canImportAll}
                        data-testid="playlist-import"
                        onClick={() => void importAll()}
                    >
                        {busy
                            ? 'Working…'
                            : nothingNew
                              ? 'Nothing new to import'
                              : summary && summary.songs.length === 0
                                ? summary.collection.kind === 'existing'
                                    ? 'Add to the collection'
                                    : 'Make the collection'
                                : `Import ${songs(summary?.songs.length ?? 0)}`}
                    </button>
                ) : (
                    <button
                        className="btn primary"
                        disabled={busy || !canAdd}
                        onClick={() => void add()}
                    >
                        {busy ? 'Working…' : 'Add to songbook'}
                    </button>
                )}
                <button className="btn" disabled={writing} onClick={onClose}>
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
