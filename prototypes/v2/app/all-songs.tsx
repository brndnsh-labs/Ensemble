import { useEffect, useMemo, useRef, useState } from 'react';
import { REMOTE_UPDATE_MESSAGES } from '../lib/account/messages';
import type { RemoteCandidateKind } from '../lib/account/sync-loop';
import { starredOf } from '../lib/collections';
import { arrangementOf, composerOf, genreOf } from '../lib/documents';
import type { ChartDocument } from '../lib/runtime';
import type { AllSongsSort } from '../lib/session';
import type { CollectionEntry } from './use-collections';

/** A user collection's view is its id, prefixed so it can never collide with the three below. */
type LibraryView = 'all' | 'starred' | 'recent' | `collection:${string}`;
/** The sort select's value: a remembered order, or (inside a collection) the collection's own. */
type SortChoice = AllSongsSort | 'collection';

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/** The sort key a row is compared/grouped by for Title and Composer order — never composer alone,
 * since a song with no composer must still land somewhere stable rather than all bunching at '#'. */
function sortKeyFor(document: ChartDocument, sort: AllSongsSort): string {
    return sort === 'composer' ? composerOf(document) || document.title : document.title;
}

function leadingLetter(key: string): string {
    const ch = key.trim().charAt(0).toUpperCase();
    return ch >= 'A' && ch <= 'Z' ? ch : '#';
}

function formatOpened(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
        ? '—'
        : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface AllSongsProps {
    /**
     * The whole songbook — read lazily since #1441, the first time this page (or a search) asks
     * for it. Null while that read is out: the page says it is loading rather than showing a
     * songbook with no songs.
     */
    songs: ChartDocument[] | null;
    /**
     * Why that read failed, when it did. A full read refuses a songbook it cannot wholly read
     * (`lib/repository.ts`'s `list`), and that refusal is said here — the one surface that lists
     * every song — instead of being turned into a short or empty list.
     */
    failure: string | null;
    accountLibrary: boolean;
    /**
     * The star set — the built-in Starred collection's songs since #1477, the same source
     * `onToggleStar` writes through.
     */
    starred: ReadonlySet<string>;
    /**
     * Every collection in this songbook (#1477), Starred among them, or null while they are read.
     * Starred keeps its own filter above; the user collections are the Collections group.
     */
    collections: readonly CollectionEntry[] | null;
    onNewCollection: () => void;
    onRenameCollection: (collectionId: string, name: string) => void;
    onDeleteCollection: (collectionId: string) => void;
    /**
     * The collection THIS TAB's own delete just removed (#1477 review R5), or null — the
     * `lastRemovedId` rule for collections: only that removal moves focus (to the All songs
     * filter, since the dialog's own return target, the collection's Delete… button, is gone).
     * A collection vanishing through a sync never steals focus.
     */
    removedCollectionId: string | null;
    /** Per-device opened-at map (#1440), id to ISO timestamp. */
    openedAt: ReadonlyMap<string, string>;
    remoteCandidates: readonly { id: string; kind: RemoteCandidateKind }[];
    busy: boolean;
    /** The device's remembered sort, or null for "no preference recorded yet". */
    initialSort: AllSongsSort | null;
    /**
     * A user collection to open the page on (#1478: the one a whole-playlist import just wrote),
     * or null/absent for All songs. Read when the page mounts, like `initialSort`.
     */
    initialCollectionId?: string | null;
    onSortChange: (sort: AllSongsSort) => void;
    onBack: () => void;
    onOpenSong: (id: string) => void;
    onToggleStar: (id: string) => void;
    onOpenRowMenu: (id: string, title: string) => void;
    /**
     * The id THIS TAB's own row action just removed from the library (#1440 review P5), or null.
     * `document.activeElement === document.body` — the old guard — is also the ordinary resting
     * state for a mouse user who has clicked nothing since loading the page, so it fired on a
     * row disappearing for ANY reason (a sync-driven removal, another device's delete) and stole
     * focus from wherever the musician actually was. This is set only by the delete handlers in
     * `app/ensemble.tsx` and cleared right after, so the effect below can require the removed row
     * to match this specific id before it moves focus at all.
     */
    lastRemovedId: string | null;
}

/**
 * The All songs page (#1440) — the songbook's answer for a library too large for the home page's
 * 8-row Recently-opened card: search, Starred/Recently-opened filters, a genre dropdown scoped to
 * genres actually present, five sort orders and an A–Z jump index for two of them — and, since
 * #1477, the Collections filter group.
 *
 * A plain list, deliberately: #1442 measured React render/commit at ~1% of a large-library load's
 * JS time (`checks/large-library.perf.spec.ts`), so a 2,000-row `<table>` is not where the cost
 * is — reading and validating the library already paid that before this page ever mounts. No
 * virtualization, no windowing.
 *
 * **Collections (#1477).** Starred is a collection, and keeps its place right under All songs; the
 * user's own collections follow under a "Collections" heading, with "New collection" last.
 * Choosing Starred or a collection shows its songs in the COLLECTION'S order — the sort select
 * gains a "Collection order" choice, picked on entering the view and never remembered as the
 * device's sort — and a user collection offers Rename and Delete… above its rows. Starred offers
 * neither: it is built in.
 */
export function AllSongs({
    songs: library,
    failure,
    accountLibrary,
    starred,
    openedAt,
    remoteCandidates,
    busy,
    initialSort,
    initialCollectionId = null,
    onSortChange,
    onBack,
    onOpenSong,
    onToggleStar,
    onOpenRowMenu,
    lastRemovedId,
    collections,
    onNewCollection,
    onRenameCollection,
    onDeleteCollection,
    removedCollectionId,
}: AllSongsProps) {
    const [view, setViewState] = useState<LibraryView>(
        initialCollectionId === null ? 'all' : `collection:${initialCollectionId}`,
    );
    const [genre, setGenre] = useState('');
    const [search, setSearch] = useState('');
    const [remembered, setRemembered] = useState<AllSongsSort>(initialSort ?? 'title');
    /** Inside Starred or a collection: show the collection's own order rather than `remembered`. */
    const [inOrder, setInOrder] = useState(true);
    const loaded = library !== null;
    const songs = useMemo(() => library ?? [], [library]);
    const rows = useRef(new Map<string, HTMLTableRowElement>());
    const heading = useRef<HTMLHeadingElement>(null);
    const allFilter = useRef<HTMLButtonElement>(null);
    /** The collection whose disappearance just sent the view back to All songs (R5). */
    const fellBackFrom = useRef<string | null>(null);
    // Same courtesy `StandardsBrowser` gives the standards browse view: opening this moves focus
    // to its own heading. Restoring focus on the way OUT is the shell's job instead (#1440 review
    // P3, `app/ensemble.tsx`'s `allSongsEntryRef`) — see `StandardsBrowser`'s own note on why a
    // captured `document.activeElement` cannot survive this view swap's remount.
    useEffect(() => {
        heading.current?.focus();
    }, []);

    const starredEntry = useMemo(() => starredOf(collections ?? []), [collections]);
    const userCollections = useMemo(
        () => (collections ?? []).filter((entry) => !entry.document.builtIn),
        [collections],
    );
    const activeCollection = view.startsWith('collection:')
        ? (userCollections.find((entry) => `collection:${entry.document.id}` === view) ?? null)
        : null;
    // A collection deleted (here, or by another device's sync) while it is the view falls back to
    // All songs rather than showing an empty list under a name that no longer exists.
    useEffect(() => {
        if (collections !== null && view.startsWith('collection:') && activeCollection === null) {
            fellBackFrom.current = view.slice('collection:'.length);
            setViewState('all');
        }
    }, [collections, view, activeCollection]);
    // This tab's own delete of the collection that WAS the view (#1477 review R5): focus goes to
    // the All songs filter — its Delete… button, where the dialog would return focus, is gone.
    // A frame later, so the confirm dialog has closed: a modal makes everything outside it inert.
    useEffect(() => {
        if (removedCollectionId === null || fellBackFrom.current !== removedCollectionId) {
            return;
        }
        fellBackFrom.current = null;
        const frame = requestAnimationFrame(() => allFilter.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, [removedCollectionId]);
    /** The order the current view's collection keeps, id to position — null outside one. */
    const collectionOrder = useMemo(() => {
        const ids =
            view === 'starred'
                ? [...(starredEntry?.document.songIds ?? starred)]
                : (activeCollection?.document.songIds ?? null);
        return ids ? new Map(ids.map((id, index) => [id, index])) : null;
    }, [view, starredEntry, starred, activeCollection]);
    const collectionCounts = useMemo(() => {
        const present = new Set(songs.map((song) => song.id));
        return new Map(
            userCollections.map((entry) => [
                entry.document.id,
                entry.document.songIds.filter((id) => present.has(id)).length,
            ]),
        );
    }, [songs, userCollections]);

    function setView(next: LibraryView) {
        setViewState(next);
        setInOrder(true);
    }
    const sort: SortChoice = collectionOrder !== null && inOrder ? 'collection' : remembered;

    const remoteCandidateKinds = useMemo(
        () => new Map(remoteCandidates.map((row) => [row.id, row.kind])),
        [remoteCandidates],
    );

    const genres = useMemo(() => {
        const present = new Set(songs.map((song) => genreOf(song)));
        return [...present].sort((a, b) => a.localeCompare(b));
    }, [songs]);
    // The picked genre, while a song of it is still here. Deleting the last one drops the
    // option; left alone, the stale pick would keep filtering an empty list under a select
    // that reads "All genres".
    const activeGenre = genres.includes(genre) ? genre : '';

    const starredCount = useMemo(
        () => songs.reduce((count, song) => count + (starred.has(song.id) ? 1 : 0), 0),
        [songs, starred],
    );
    const recentCount = useMemo(
        () => songs.reduce((count, song) => count + (openedAt.has(song.id) ? 1 : 0), 0),
        [songs, openedAt],
    );

    function setSortAndRemember(next: SortChoice) {
        if (next === 'collection') {
            setInOrder(true);
            return;
        }
        setInOrder(false);
        setRemembered(next);
        onSortChange(next);
    }

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return songs.filter((song) => {
            if (view === 'starred' && !starred.has(song.id)) {
                return false;
            }
            if (view === 'recent' && !openedAt.has(song.id)) {
                return false;
            }
            if (activeCollection !== null && !collectionOrder?.has(song.id)) {
                return false;
            }
            if (activeGenre && genreOf(song) !== activeGenre) {
                return false;
            }
            if (
                query &&
                !song.title.toLowerCase().includes(query) &&
                !composerOf(song).toLowerCase().includes(query)
            ) {
                return false;
            }
            return true;
        });
    }, [songs, view, starred, openedAt, activeGenre, search, activeCollection, collectionOrder]);

    const sorted = useMemo(() => {
        const next = [...filtered];
        next.sort((a, b) => {
            switch (sort) {
                case 'collection':
                    return (
                        (collectionOrder?.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
                        (collectionOrder?.get(b.id) ?? Number.MAX_SAFE_INTEGER)
                    );
                case 'title':
                case 'composer': {
                    const keyA = sortKeyFor(a, sort);
                    const keyB = sortKeyFor(b, sort);
                    return keyA.localeCompare(keyB) || a.title.localeCompare(b.title);
                }
                case 'tempo':
                    return (
                        a.chart.performance.bpm - b.chart.performance.bpm ||
                        a.title.localeCompare(b.title)
                    );
                case 'recentAdded':
                    return b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title);
                case 'recentOpened': {
                    const openedA = openedAt.get(a.id) ?? '';
                    const openedB = openedAt.get(b.id) ?? '';
                    // Never-opened songs sort after every opened one, then alphabetically among
                    // themselves — "recently opened" order for a song that has never been opened
                    // has no other honest answer.
                    if (!openedA && !openedB) {
                        return a.title.localeCompare(b.title);
                    }
                    if (!openedA) {
                        return 1;
                    }
                    if (!openedB) {
                        return -1;
                    }
                    return openedB.localeCompare(openedA);
                }
                default:
                    return 0;
            }
        });
        return next;
    }, [filtered, sort, openedAt, collectionOrder]);

    // After a row delete, focus goes to the next row, or the heading if the list is now empty
    // (#1440 review P3), rather than falling to `<body>` — a `<dialog>` closing over a row that
    // no longer exists has nowhere else to return the browser's own default restore to.
    //
    // Scoped to THIS TAB'S OWN action via `lastRemovedId` (#1440 review P5) — the earlier
    // `document.activeElement === document.body` guard is also the ordinary resting state for a
    // mouse user who hasn't clicked anything, so it fired for a row vanishing for ANY reason
    // (another device's delete arriving mid-sync, `songbookLoading` flipping the list) and stole
    // focus from wherever the musician actually was. `handledRemovalId` makes the move fire once
    // per removal even though `sorted` can re-run this effect again before `lastRemovedId` is
    // cleared (e.g. a sync refresh right after the delete).
    const previousRowIds = useRef<string[]>([]);
    const handledRemovalId = useRef<string | null>(null);
    useEffect(() => {
        const previousIds = previousRowIds.current;
        const currentIds = sorted.map((song) => song.id);
        if (
            lastRemovedId &&
            handledRemovalId.current !== lastRemovedId &&
            previousIds.includes(lastRemovedId) &&
            !currentIds.includes(lastRemovedId)
        ) {
            handledRemovalId.current = lastRemovedId;
            const removedIndex = previousIds.indexOf(lastRemovedId);
            const nextId = currentIds[Math.min(removedIndex, currentIds.length - 1)];
            const nextRow = nextId ? rows.current.get(nextId) : undefined;
            const link = nextRow?.querySelector<HTMLButtonElement>('.song-link');
            if (link) {
                link.focus();
            } else {
                heading.current?.focus();
            }
        }
        previousRowIds.current = currentIds;
    }, [sorted, lastRemovedId]);

    const showAzIndex = sort === 'title' || sort === 'composer';

    function jumpTo(letter: string) {
        if (sort !== 'title' && sort !== 'composer') {
            return;
        }
        const key = sort;
        const target = sorted.find((song) => leadingLetter(sortKeyFor(song, key)) >= letter);
        const row = rows.current.get(target?.id ?? '');
        // Focus the row's own song link, not just scroll to it (#1440 review P3): a jump that
        // only scrolls hands nothing to keyboard/screen-reader use, and leaves focus wherever the
        // letter button itself sits.
        const link = row?.querySelector<HTMLButtonElement>('.song-link');
        if (link) {
            link.focus({ preventScroll: true });
            link.scrollIntoView({ block: 'start' });
        } else {
            row?.scrollIntoView({ block: 'start' });
        }
    }

    return (
        <main className="home all-songs">
            <div className="home-intro">
                <div>
                    <span className="eyebrow">
                        <button className="all-songs-back" onClick={onBack}>
                            ← Home
                        </button>
                    </span>
                    <h1 ref={heading} tabIndex={-1}>
                        All songs{' '}
                        {loaded && <span className="all-songs-count">· {songs.length}</span>}
                    </h1>
                </div>
            </div>
            <div className="all-songs-toolbar">
                <label className="search">
                    <span className="sr">Search your songs</span>
                    <input
                        placeholder="Title or composer…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </label>
                <label className="all-songs-select">
                    <span className="sr">Filter by genre</span>
                    <select value={activeGenre} onChange={(event) => setGenre(event.target.value)}>
                        <option value="">All genres</option>
                        {genres.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="all-songs-select">
                    <span className="sr">Sort by</span>
                    <select
                        value={sort}
                        onChange={(event) => setSortAndRemember(event.target.value as SortChoice)}
                    >
                        {collectionOrder !== null && (
                            <option value="collection">Collection order</option>
                        )}
                        <option value="title">Title</option>
                        <option value="recentOpened">Recently opened</option>
                        <option value="recentAdded">Recently added</option>
                        <option value="composer">Composer</option>
                        <option value="tempo">Tempo</option>
                    </select>
                </label>
            </div>
            <div className="all-songs-layout">
                <nav className="filter-rail" aria-label="Filter your songs">
                    <button
                        ref={allFilter}
                        className="filter-item"
                        aria-pressed={view === 'all'}
                        onClick={() => setView('all')}
                    >
                        All songs{' '}
                        <span className="filter-count">{loaded ? songs.length : '…'}</span>
                    </button>
                    <button
                        className="filter-item"
                        aria-pressed={view === 'starred'}
                        onClick={() => setView('starred')}
                    >
                        Starred <span className="filter-count">{loaded ? starredCount : '…'}</span>
                    </button>
                    <button
                        className="filter-item"
                        aria-pressed={view === 'recent'}
                        onClick={() => setView('recent')}
                    >
                        Recently opened{' '}
                        <span className="filter-count">{loaded ? recentCount : '…'}</span>
                    </button>
                    <h2 className="filter-heading" id="collections-heading">
                        Collections
                    </h2>
                    <div
                        className="filter-group"
                        role="group"
                        aria-labelledby="collections-heading"
                        data-testid="collection-filters"
                    >
                        {userCollections.map((entry) => (
                            <button
                                key={entry.document.id}
                                className="filter-item"
                                aria-pressed={view === `collection:${entry.document.id}`}
                                data-testid="collection-filter"
                                onClick={() => setView(`collection:${entry.document.id}`)}
                            >
                                <span className="filter-name">{entry.document.name}</span>{' '}
                                <span className="filter-count">
                                    {loaded ? (collectionCounts.get(entry.document.id) ?? 0) : '…'}
                                </span>
                            </button>
                        ))}
                        <button
                            className="filter-item filter-new"
                            data-testid="new-collection"
                            disabled={busy || collections === null}
                            onClick={onNewCollection}
                        >
                            + New collection
                        </button>
                    </div>
                </nav>
                <div className="all-songs-content">
                    {activeCollection !== null && (
                        <div className="collection-bar" data-testid="collection-bar">
                            <h2>{activeCollection.document.name}</h2>
                            <button
                                className="btn"
                                data-testid="collection-rename"
                                disabled={busy}
                                onClick={() =>
                                    onRenameCollection(
                                        activeCollection.document.id,
                                        activeCollection.document.name,
                                    )
                                }
                            >
                                Rename
                            </button>
                            <button
                                className="btn danger"
                                data-testid="collection-delete"
                                disabled={busy}
                                onClick={() => onDeleteCollection(activeCollection.document.id)}
                            >
                                Delete…
                            </button>
                        </div>
                    )}
                    {!loaded ? (
                        failure ? (
                            <p
                                className="all-songs-empty"
                                role="alert"
                                data-testid="library-failure"
                            >
                                {failure}
                            </p>
                        ) : (
                            <p
                                className="all-songs-empty"
                                role="status"
                                data-testid="all-songs-loading"
                            >
                                Loading all your songs…
                            </p>
                        )
                    ) : sorted.length === 0 ? (
                        <p className="all-songs-empty">
                            {activeCollection !== null &&
                            !search.trim() &&
                            !activeGenre &&
                            collectionCounts.get(activeCollection.document.id) === 0
                                ? 'No songs in this collection yet — add one from a song’s ⋯ menu.'
                                : 'No songs match.'}
                        </p>
                    ) : (
                        <table className="song-table all-songs-table">
                            <thead>
                                <tr>
                                    <th>
                                        <span className="sr">Star</span>
                                    </th>
                                    <th>Song</th>
                                    <th>Composer</th>
                                    <th>Key</th>
                                    <th className="hide-mobile">Tempo</th>
                                    <th className="hide-mobile">Opened</th>
                                    <th>
                                        <span className="sr">More actions</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((song) => {
                                    const candidateKind = remoteCandidateKinds.get(song.id) ?? null;
                                    const opened = openedAt.get(song.id);
                                    const isStarred = starred.has(song.id);
                                    return (
                                        <tr
                                            className="song-row"
                                            key={song.id}
                                            ref={(element) => {
                                                if (element) {
                                                    rows.current.set(song.id, element);
                                                } else {
                                                    rows.current.delete(song.id);
                                                }
                                            }}
                                        >
                                            <td>
                                                <button
                                                    className="icon-button star-toggle"
                                                    aria-pressed={isStarred}
                                                    aria-label={
                                                        isStarred
                                                            ? `Unstar ${song.title}`
                                                            : `Star ${song.title}`
                                                    }
                                                    disabled={busy}
                                                    onClick={() => onToggleStar(song.id)}
                                                >
                                                    {isStarred ? '★' : '☆'}
                                                </button>
                                            </td>
                                            <td>
                                                <button
                                                    className="song-link"
                                                    disabled={busy}
                                                    onClick={() => onOpenSong(song.id)}
                                                >
                                                    <span className="song-glyph">♪</span>
                                                    <span>
                                                        <span className="song-name">
                                                            {song.title}
                                                        </span>
                                                        {/* Where these songs live is said ONCE
                                                            below the table (#1440's acceptance:
                                                            "the rows no longer repeat the storage
                                                            location"), not per row here. */}
                                                        <span className="song-detail">
                                                            {genreOf(song)}
                                                        </span>
                                                        {candidateKind === 'version' && (
                                                            <span
                                                                className="song-marker"
                                                                data-testid="song-newer-in-account"
                                                            >
                                                                {REMOTE_UPDATE_MESSAGES.marker}
                                                            </span>
                                                        )}
                                                        {candidateKind === 'deleted' && (
                                                            <span
                                                                className="song-marker"
                                                                data-testid="song-deleted-in-account"
                                                            >
                                                                {
                                                                    REMOTE_UPDATE_MESSAGES.deletedMarker
                                                                }
                                                            </span>
                                                        )}
                                                        {candidateKind === 'unsupported' && (
                                                            <span
                                                                className="song-marker"
                                                                data-testid="song-unsupported-in-account"
                                                            >
                                                                {
                                                                    REMOTE_UPDATE_MESSAGES.unsupportedMarker
                                                                }
                                                            </span>
                                                        )}
                                                    </span>
                                                </button>
                                            </td>
                                            <td className="song-composer">
                                                {composerOf(song) || '—'}
                                            </td>
                                            <td className="song-key">
                                                {arrangementOf(song).key}
                                                {arrangementOf(song).isMinor ? 'm' : ''}
                                            </td>
                                            <td className="hide-mobile">
                                                {song.chart.performance.bpm}
                                            </td>
                                            <td className="hide-mobile song-opened">
                                                {opened ? formatOpened(opened) : '—'}
                                            </td>
                                            <td>
                                                <button
                                                    className="icon-button row-more"
                                                    aria-label={`More actions for ${song.title}`}
                                                    disabled={busy}
                                                    onClick={() =>
                                                        onOpenRowMenu(song.id, song.title)
                                                    }
                                                >
                                                    ⋯
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                    {songs.length > 0 && (
                        <p className="all-songs-storage-note">
                            {accountLibrary
                                ? 'These songs are saved to your account.'
                                : 'These songs are saved locally on this device.'}
                        </p>
                    )}
                </div>
                {showAzIndex && sorted.length > 0 && (
                    <nav className="az-index" aria-label="Jump to letter">
                        {LETTERS.map((letter) => (
                            <button key={letter} onClick={() => jumpTo(letter)}>
                                {letter}
                            </button>
                        ))}
                    </nav>
                )}
            </div>
        </main>
    );
}
