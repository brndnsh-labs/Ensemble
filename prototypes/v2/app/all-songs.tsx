import { useEffect, useMemo, useRef, useState } from 'react';
import { REMOTE_UPDATE_MESSAGES } from '../lib/account/messages';
import type { RemoteCandidateKind } from '../lib/account/sync-loop';
import { arrangementOf, composerOf, genreOf } from '../lib/documents';
import type { ChartDocument } from '../lib/runtime';
import type { AllSongsSort } from '../lib/session';

type LibraryView = 'all' | 'starred' | 'recent';

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
    songs: ChartDocument[];
    accountLibrary: boolean;
    /** Per-device star set (#1440) — same source `onToggleStar` writes through. */
    starred: ReadonlySet<string>;
    /** Per-device opened-at map (#1440), id to ISO timestamp. */
    openedAt: ReadonlyMap<string, string>;
    remoteCandidates: readonly { id: string; kind: RemoteCandidateKind }[];
    busy: boolean;
    /** The device's remembered sort, or null for "no preference recorded yet". */
    initialSort: AllSongsSort | null;
    onSortChange: (sort: AllSongsSort) => void;
    onBack: () => void;
    onOpenSong: (id: string) => void;
    onToggleStar: (id: string) => void;
    onOpenRowMenu: (id: string, title: string) => void;
}

/**
 * The All songs page (#1440) — the songbook's answer for a library too large for the home page's
 * 8-row Recently-opened card: search, Starred/Recently-opened filters, a genre dropdown scoped to
 * genres actually present, five sort orders and an A–Z jump index for two of them.
 *
 * A plain list, deliberately: #1442 measured React render/commit at ~1% of a large-library load's
 * JS time (`checks/large-library.perf.spec.ts`), so a 2,000-row `<table>` is not where the cost
 * is — reading and validating the library already paid that before this page ever mounts. No
 * virtualization, no windowing.
 *
 * The Collections filter group is #1443's — this deliberately renders nothing in its place; only
 * a comment marks where it lands, so as not to fake a feature that isn't built yet.
 */
export function AllSongs({
    songs,
    accountLibrary,
    starred,
    openedAt,
    remoteCandidates,
    busy,
    initialSort,
    onSortChange,
    onBack,
    onOpenSong,
    onToggleStar,
    onOpenRowMenu,
}: AllSongsProps) {
    const [view, setView] = useState<LibraryView>('all');
    const [genre, setGenre] = useState('');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<AllSongsSort>(initialSort ?? 'title');
    const rows = useRef(new Map<string, HTMLTableRowElement>());
    const heading = useRef<HTMLHeadingElement>(null);
    // Same courtesy `StandardsBrowser` gives the standards browse view: opening this moves focus
    // to its own heading. Restoring focus on the way OUT is the shell's job instead (#1440 review
    // P3, `app/ensemble.tsx`'s `allSongsEntryRef`) — see `StandardsBrowser`'s own note on why a
    // captured `document.activeElement` cannot survive this view swap's remount.
    useEffect(() => {
        heading.current?.focus();
    }, []);

    const remoteCandidateKinds = useMemo(
        () => new Map(remoteCandidates.map((row) => [row.id, row.kind])),
        [remoteCandidates],
    );

    const genres = useMemo(() => {
        const present = new Set(songs.map((song) => genreOf(song)));
        return [...present].sort((a, b) => a.localeCompare(b));
    }, [songs]);

    const starredCount = useMemo(
        () => songs.reduce((count, song) => count + (starred.has(song.id) ? 1 : 0), 0),
        [songs, starred],
    );
    const recentCount = useMemo(
        () => songs.reduce((count, song) => count + (openedAt.has(song.id) ? 1 : 0), 0),
        [songs, openedAt],
    );

    function setSortAndRemember(next: AllSongsSort) {
        setSort(next);
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
            if (genre && genreOf(song) !== genre) {
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
    }, [songs, view, starred, openedAt, genre, search]);

    const sorted = useMemo(() => {
        const next = [...filtered];
        next.sort((a, b) => {
            switch (sort) {
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
    }, [filtered, sort, openedAt]);

    // After a row delete, focus goes to the next row, or the heading if the list is now empty
    // (#1440 review P3), rather than falling to `<body>` — a `<dialog>` closing over a row that
    // no longer exists has nowhere else to return the browser's own default restore to. Guarded
    // on `document.activeElement === document.body`: a row genuinely vanishing while focus was
    // elsewhere (a different tab's delete, say) has nothing here to correct.
    const previousRowIds = useRef<string[]>([]);
    useEffect(() => {
        const previousIds = previousRowIds.current;
        const currentIds = sorted.map((song) => song.id);
        if (previousIds.length > 0 && document.activeElement === document.body) {
            const removedIndex = previousIds.findIndex((id) => !currentIds.includes(id));
            if (removedIndex !== -1) {
                const nextId = currentIds[Math.min(removedIndex, currentIds.length - 1)];
                const nextRow = nextId ? rows.current.get(nextId) : undefined;
                const link = nextRow?.querySelector<HTMLButtonElement>('.song-link');
                if (link) {
                    link.focus();
                } else {
                    heading.current?.focus();
                }
            }
        }
        previousRowIds.current = currentIds;
    }, [sorted]);

    const showAzIndex = sort === 'title' || sort === 'composer';

    function jumpTo(letter: string) {
        const target = sorted.find((song) => leadingLetter(sortKeyFor(song, sort)) >= letter);
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
                        All songs <span className="all-songs-count">· {songs.length}</span>
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
                    <select value={genre} onChange={(event) => setGenre(event.target.value)}>
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
                        onChange={(event) => setSortAndRemember(event.target.value as AllSongsSort)}
                    >
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
                        className="filter-item"
                        aria-pressed={view === 'all'}
                        onClick={() => setView('all')}
                    >
                        All songs <span className="filter-count">{songs.length}</span>
                    </button>
                    <button
                        className="filter-item"
                        aria-pressed={view === 'starred'}
                        onClick={() => setView('starred')}
                    >
                        Starred <span className="filter-count">{starredCount}</span>
                    </button>
                    <button
                        className="filter-item"
                        aria-pressed={view === 'recent'}
                        onClick={() => setView('recent')}
                    >
                        Recently opened <span className="filter-count">{recentCount}</span>
                    </button>
                    {/* Collections group arrives with #1443's synced "Starred" collection and
                        whole-playlist imports. Nothing renders here until that story lands. */}
                </nav>
                <div className="all-songs-content">
                    {sorted.length === 0 ? (
                        <p className="all-songs-empty">No songs match.</p>
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
