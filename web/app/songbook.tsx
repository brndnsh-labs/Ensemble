import { type RefObject, useEffect, useMemo, useRef } from 'react';
import {
    ACCOUNT_SWITCH_MESSAGES,
    REMOTE_UPDATE_MESSAGES,
    UNREADABLE_EXPORT_LABEL,
    unreadableSongsNotice,
} from '../lib/account/messages';
import type { RemoteCandidateKind } from '../lib/account/sync-loop';
import { composerOf, genreOf } from '../lib/documents';
import { type HomeSlice, openedAgo } from '../lib/home';
import type { ChartDocument } from '../lib/runtime';
import {
    STANDARD_SHELF_LABELS,
    STANDARDS,
    type StandardEntry,
    type StandardShelf,
} from '../lib/standards';

/** The Continue card's display facts (#1441) — always one of the musician's own songs. */
export interface FeaturedSummary {
    id: string;
    title: string;
    genre: string;
    bpm: number;
    key: string;
    isMinor: boolean;
    /** The song's own first bars as chord text (`firstBars`), up to 8. */
    bars: string[];
}

/** Which standards entry point opened the browse view: "Browse all →", or one shelf's link. */
export type StandardsEntry = StandardShelf | 'all';

const SHELF_ORDER: readonly StandardShelf[] = ['blues', 'jazz', 'grooves'];

/** How many of the musician's own songs a search lists before asking for a narrower query. */
const SEARCH_LIMIT = 50;

interface SongbookProps {
    /**
     * The live songbook's home slice (#1441): the Continue song, at most `HOME_ROWS` recently
     * opened songs read by id, and IndexedDB's own `count()`. Never the whole library — see
     * `library` for the one surface here that needs that. Null while it has not been read.
     */
    home: HomeSlice | null;
    /**
     * How many songs the FULL read stepped over (#1769), once one is held, else null. The home's
     * own count is only what its window read, so the notice says the larger of the two and never
     * less than All songs does (#1782).
     */
    libraryUnreadable: number | null;
    /** Writes out the songs this build cannot read, as stored; account only (#1782). */
    onExportUnreadable?: () => void;
    /**
     * True when this is the signed-in account library rather than the guest one (#1266).
     * There is no switcher — guest signed out, account signed in (rollout decision 9 S3) — so
     * this only changes what the page SAYS about the songs it was handed.
     */
    accountLibrary: boolean;
    /**
     * True while this page cannot yet say what the songbook holds (#1266): which library it is,
     * or the home slice itself. Nothing here claims "no songs" — not the first-visit layout, not
     * an empty list — while this is true.
     */
    loading: boolean;
    /**
     * True when the first session read was released by its deadline instead of answered (#1357),
     * so this is the guest library standing in for one this device could not check. Distinct
     * from `loading`: the songs below are real and openable, they just may not be the whole
     * story, and saying nothing would make a fallback indistinguishable from an answer.
     */
    accountFallback: boolean;
    /**
     * The account songs `reconcile` preserved a remote observation for rather than applying it over
     * this device's unsaved work (#1310, widened #1362). Document id plus kind — the id decides
     * WHICH row, the kind decides which of the three sentences it gets. The home page marks the
     * rows it shows and says how many others are marked on the All songs page, which is now the
     * one place the whole library is listed (#1441).
     *
     * Always empty for a guest songbook, which no account can advance underneath.
     */
    remoteCandidates: readonly { id: string; kind: RemoteCandidateKind }[];
    /**
     * The Continue card: the live songbook's own last-opened song (with any recovered draft),
     * else its most recently opened one. Null when there is nothing of the musician's own.
     */
    featured: FeaturedSummary | null;
    /** True when `featured` is the song the musician last had open. */
    continued: boolean;
    /** Per-device opened-at map (#1440), for the "opened … ago" wording. */
    openedAt: ReadonlyMap<string, string>;
    /** Opens a song and starts the band, without the editor (#1441's ▶ Play). */
    onPlaySong: (id: string) => void;
    onOpenSong: (id: string) => void;
    /** Opens a standards-catalog entry as an unsaved draft (#1439). */
    onOpenStandard: (id: string) => void;
    /** Opens #1439's browse view, filtered to one shelf or showing all of them. */
    onBrowseStandards: (entry: StandardsEntry) => void;
    /**
     * Which entry point last opened the browse view, so `standardsEntryRef` lands on that same
     * button when the musician comes back (#1440 review P3, #1441). The shell holds the ref across
     * the view swap that remounts every button here.
     */
    standardsEntry: StandardsEntry;
    standardsEntryRef: RefObject<HTMLButtonElement | null>;
    busy: boolean;
    /** The offline-install label (`useOfflineInstall`). */
    offline: string;
    /** The one search box's query (the box itself is in the shell's top bar). */
    search: string;
    /**
     * The live songbook's FULL library, for search — null until the lazy read lands (#1441). The
     * top bar starts that read when the box is focused, and the standards half of the results
     * shows meanwhile.
     */
    library: ChartDocument[] | null;
    /** Why the full-library read failed, when it did — said, never shown as "no matches". */
    libraryFailure: string | null;
    onImport: () => void;
    onNewSong: () => void;
    /** Per-device star set (#1440) — same source the row ⋯ menu's Star/Unstar writes through. */
    starred: ReadonlySet<string>;
    onToggleStar: (id: string) => void;
    /** Opens the row ⋯ menu (Star/Unstar, Rename, Duplicate, Export file, Delete…) for one song. */
    onOpenRowMenu: (id: string, title: string, trigger: HTMLElement) => void;
    /** #1440's full-library page — the "All N songs →" link. */
    onOpenAllSongs: () => void;
    /** Where focus returns after leaving the All songs page (#1440 review P3). */
    allSongsEntryRef: RefObject<HTMLButtonElement | null>;
    /**
     * The id THIS TAB's own row action just removed (#1440 review P5) — same contract as
     * `AllSongs`' own `lastRemovedId`; see its doc comment.
     */
    lastRemovedId: string | null;
}

/**
 * The songbook home (#1441, direction A "one page, library first"): pick up where you left off,
 * the eight songs opened most recently, and the standards shelf — or, on a device with nothing of
 * its own yet, the standards as the page. Presentational: every read and write is the shell's,
 * and what it hands this is sized to what the page shows, never the whole library.
 */
export function Songbook(props: SongbookProps) {
    const {
        home,
        accountLibrary,
        loading,
        accountFallback,
        remoteCandidates,
        featured,
        search,
        busy,
        offline,
    } = props;
    const rows = home?.rows ?? [];
    const { libraryUnreadable, onExportUnreadable } = props;
    const unreadable = home === null ? 0 : Math.max(home.unreadable, libraryUnreadable ?? 0);
    const query = search.trim().toLowerCase();
    const firstVisit = !loading && home !== null && home.count === 0 && featured === null;
    const shown = new Set(rows.map((row) => row.id));
    const markedElsewhere = remoteCandidates.filter((row) => !shown.has(row.id)).length;
    const heading = useRef<HTMLHeadingElement>(null);
    const firstVisitHeading = useRef<HTMLHeadingElement>(null);
    const libraryName = accountLibrary ? 'Your account songbook' : 'Your songbook';
    // The first visit's own h1 is the page's heading only while it is on screen; a search
    // replaces it, and then the songbook's name is the h1 again (#1441 review P3).
    const firstVisitIntro = firstVisit && !query;
    // Deleting the last song on the home turns it into the first visit, which unmounts the row
    // list — and `RecentSongs`' focus rescue with it. So the rescue for that one case lives here:
    // THIS tab's own delete emptied the songbook, and focus goes to the new page's heading
    // instead of falling to `<body>` (#1440 review P5's `lastRemovedId` scoping, kept).
    const wasFirstVisit = useRef(firstVisit);
    useEffect(() => {
        if (!wasFirstVisit.current && firstVisit && props.lastRemovedId !== null) {
            firstVisitHeading.current?.focus();
        }
        wasFirstVisit.current = firstVisit;
    }, [firstVisit, props.lastRemovedId]);
    return (
        <main className="home" data-layout={firstVisit ? 'first-visit' : 'everyday'}>
            {firstVisitIntro ? (
                <p className="home-library" data-testid="library-heading">
                    {libraryName}
                </p>
            ) : (
                <h1
                    className="home-library"
                    ref={heading}
                    tabIndex={-1}
                    data-testid="library-heading"
                >
                    {libraryName}
                </h1>
            )}
            {loading && (
                <p className="library-loading" role="status" data-testid="library-loading">
                    {accountLibrary ? 'Loading your account songbook…' : 'Loading your songbook…'}
                </p>
            )}
            {/* The notices sit with the library they are about, above everything it shows.
                `role="status"` rather than an alert: none is a failure to act on, and the
                fallback one appears without the musician having done anything. */}
            {accountFallback && !loading && (
                <p className="library-notice" role="status" data-testid="account-fallback">
                    {ACCOUNT_SWITCH_MESSAGES.fallback}
                </p>
            )}
            {unreadable > 0 && (
                <p className="library-notice" role="status" data-testid="home-unreadable">
                    <span>{unreadableSongsNotice(unreadable)}</span>
                    {onExportUnreadable && (
                        <button
                            className="account-btn"
                            data-testid="home-unreadable-export"
                            onClick={onExportUnreadable}
                        >
                            {UNREADABLE_EXPORT_LABEL}
                        </button>
                    )}
                </p>
            )}
            {markedElsewhere > 0 && !loading && (
                <p className="library-notice" role="status" data-testid="home-candidates-elsewhere">
                    <span>
                        {markedElsewhere === 1
                            ? 'Another song has an update in your account waiting for a look.'
                            : `${markedElsewhere} more songs have updates in your account waiting for a look.`}
                    </span>
                    <button className="account-btn" onClick={props.onOpenAllSongs}>
                        See All songs
                    </button>
                </p>
            )}
            {firstVisitIntro && (
                <section className="first-visit" aria-labelledby="first-visit-title">
                    <h1 id="first-visit-title" ref={firstVisitHeading} tabIndex={-1}>
                        Pick a tune. The band comes in.
                    </h1>
                    <p>
                        Drums, bass and keys follow the chart. Change the key, the tempo or the
                        feel, and play along.
                    </p>
                </section>
            )}
            {query ? (
                <SearchResults
                    query={query}
                    library={props.library}
                    libraryFailure={props.libraryFailure}
                    busy={busy}
                    onOpenSong={props.onOpenSong}
                    onOpenStandard={props.onOpenStandard}
                />
            ) : firstVisit ? (
                <FirstVisit {...props} />
            ) : (
                <>
                    {featured && <ContinueCard {...props} featured={featured} />}
                    {!loading && home !== null && (
                        <RecentSongs {...props} home={home} heading={heading} />
                    )}
                    <StandardsShelf {...props} perShelf={4} firstVisit={false} />
                </>
            )}
            <footer className="home-footer">
                <span data-testid="home-storage">
                    {accountLibrary
                        ? 'In your account. Saved songs sync to your other devices.'
                        : 'Saved on this device. Browser storage can be cleared; export songs you want to keep.'}{' '}
                    <span className="home-offline">{offline}</span>
                </span>
                <span>Music stand beta · {process.env.NEXT_PUBLIC_SOURCE_REV}</span>
            </footer>
        </main>
    );
}

/**
 * The All songs link (#1440). Its count leaves out the songs the account no longer holds (#1754,
 * `HomeSlice.gone`); a songbook of nothing else still links there, without a number, since that
 * page is where they are removed.
 */
function allSongsLabel(count: number): string {
    return count > 0 ? `All ${count} ${count === 1 ? 'song' : 'songs'} →` : 'All songs →';
}

/** A key the way the chart header writes it: `C`, `Am`. */
function keyOf(document: ChartDocument): string {
    const { key, isMinor } = document.chart.score;
    return `${key}${isMinor ? 'm' : ''}`;
}

/**
 * "Pick up where you left off" (#1441): the song's own first bars — never a sample — with Open
 * chart and ▶ Play. The phone shows the first four (CSS), the desktop all eight.
 *
 * One label (#1459): the state phrase ("Pick up where you left off" / "From your songbook") that
 * used to sit above the title as its own eyebrow now leads the meta line instead — the page's own
 * "Your songbook" heading right above this card already reads as an eyebrow, and stacking a
 * second one said the same thing twice for no reason worth a whole line.
 */
function ContinueCard({
    featured,
    continued,
    openedAt,
    busy,
    onOpenSong,
    onPlaySong,
}: SongbookProps & { featured: FeaturedSummary }) {
    const opened = openedAt.get(featured.id);
    const ago = opened ? openedAgo(opened, Date.now()) : null;
    return (
        <section
            className="continue-card"
            data-testid="continue-card"
            aria-labelledby="continue-title"
        >
            <div className="continue-copy">
                <h2 id="continue-title">{featured.title}</h2>
                <p className="continue-meta">
                    {continued ? 'Pick up where you left off' : 'From your songbook'} ·{' '}
                    {featured.genre} · {featured.bpm} BPM · {featured.key}
                    {featured.isMinor ? 'm' : ''}
                    {ago ? ` · opened ${ago}` : ''}
                </p>
                <div className="continue-actions">
                    <button
                        className="btn primary"
                        disabled={busy}
                        onClick={() => onOpenSong(featured.id)}
                    >
                        Open chart
                    </button>
                    <button
                        className="btn"
                        disabled={busy}
                        aria-label={`Play ${featured.title}`}
                        onClick={() => onPlaySong(featured.id)}
                    >
                        ▶ Play
                    </button>
                </div>
            </div>
            {featured.bars.length > 0 && (
                <div className="continue-bars">
                    <div className="continue-bars-label">
                        First {featured.bars.length === 1 ? 'bar' : `${featured.bars.length} bars`}
                    </div>
                    <ol className="continue-grid" data-testid="continue-bars">
                        {featured.bars.map((bar, index) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional; two can read the same.
                            <li key={index}>{bar}</li>
                        ))}
                    </ol>
                </div>
            )}
        </section>
    );
}

/** The candidate marker a row carries (#1310, widened #1362) — one row, one kind. */
function CandidateMarker({ kind }: { kind: RemoteCandidateKind | null }) {
    if (kind === 'version') {
        return (
            <span className="song-marker" data-testid="song-newer-in-account">
                {REMOTE_UPDATE_MESSAGES.marker}
            </span>
        );
    }
    if (kind === 'deleted') {
        return (
            <span className="song-marker" data-testid="song-deleted-in-account">
                {REMOTE_UPDATE_MESSAGES.deletedMarker}
            </span>
        );
    }
    if (kind === 'unsupported') {
        return (
            <span className="song-marker" data-testid="song-unsupported-in-account">
                {REMOTE_UPDATE_MESSAGES.unsupportedMarker}
            </span>
        );
    }
    return null;
}

/**
 * "Recently opened" (#1441): at most `HOME_ROWS` songs, by #1440's device-local opened-at, and
 * "All N songs →" with the store's own count. Where the songs live is said once, in the footer,
 * never per row.
 */
function RecentSongs({
    home,
    heading,
    remoteCandidates,
    openedAt,
    starred,
    busy,
    onOpenSong,
    onToggleStar,
    onOpenRowMenu,
    onOpenAllSongs,
    allSongsEntryRef,
    lastRemovedId,
}: SongbookProps & { home: HomeSlice; heading: RefObject<HTMLHeadingElement | null> }) {
    // A map, not `.find`, for the same reason the All songs page keeps one.
    const kinds = new Map(remoteCandidates.map((row) => [row.id, row.kind]));
    const rows = useRef(new Map<string, HTMLTableRowElement>());
    const now = Date.now();
    // After a row delete, focus goes to the next row, or the heading if the list is now empty
    // (#1440 review P3) — the same fix and the same reasoning as `AllSongs`' own copy of this.
    // Scoped to THIS TAB'S OWN action via `lastRemovedId` (#1440 review P5).
    const previousRowIds = useRef<string[]>([]);
    const handledRemovalId = useRef<string | null>(null);
    const ids = useMemo(() => home.rows.map((song) => song.id), [home.rows]);
    useEffect(() => {
        const previousIds = previousRowIds.current;
        if (
            lastRemovedId &&
            handledRemovalId.current !== lastRemovedId &&
            previousIds.includes(lastRemovedId) &&
            !ids.includes(lastRemovedId)
        ) {
            handledRemovalId.current = lastRemovedId;
            const removedIndex = previousIds.indexOf(lastRemovedId);
            const nextId = ids[Math.min(removedIndex, ids.length - 1)];
            const nextRow = nextId ? rows.current.get(nextId) : undefined;
            const link = nextRow?.querySelector<HTMLButtonElement>('.song-link');
            if (link) {
                link.focus();
            } else {
                heading.current?.focus();
            }
        }
        previousRowIds.current = ids;
    }, [ids, lastRemovedId, heading]);
    // "Recently opened" only when it is true of every row: a songbook with songs it never opened
    // here (a downloaded library) fills the list from elsewhere (`HomeRead.fill`).
    const allOpened = home.rows.every((song) => openedAt.has(song.id));
    return (
        <section className="home-section recent-songs" aria-labelledby="recent-heading">
            <div className="section-heading">
                <h2 id="recent-heading">{allOpened ? 'Recently opened' : 'Your songs'}</h2>
                {home.count > 0 && (
                    <button
                        ref={allSongsEntryRef}
                        className="text-link"
                        data-testid="all-songs-link"
                        onClick={onOpenAllSongs}
                    >
                        {allSongsLabel(home.count - home.gone)}
                    </button>
                )}
            </div>
            {home.rows.length > 0 && (
                <table className="song-table home-table">
                    <thead>
                        <tr>
                            <th>
                                <span className="sr">Star</span>
                            </th>
                            {/* Visible on the laptop; sr-only on the phone (#1459) — a lone
                                "SONG" header over a one-visible-column list said nothing a
                                musician needed. */}
                            <th className="song-col-header">Song</th>
                            <th className="hide-mobile">Opened</th>
                            <th>
                                <span className="sr">More actions</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {home.rows.map((song) => {
                            const isStarred = starred.has(song.id);
                            const opened = openedAt.get(song.id);
                            const ago = opened ? openedAgo(opened, now) : null;
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
                                    <td className="star-cell">
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
                                        {/* Two lines (#1459): the title, then one meta line —
                                            composer (or genre) · key · tempo. `.song-detail` keeps
                                            EXACTLY the composer/genre text (nothing appended
                                            inside it): `songLink()`'s exact-match filter, used
                                            across the whole v2 suite, matches this element's own
                                            text. The key/tempo facts sit beside it in a sibling
                                            span so the two read as one line without touching that
                                            contract. */}
                                        <button
                                            className="song-link"
                                            disabled={busy}
                                            onClick={() => onOpenSong(song.id)}
                                        >
                                            <span className="song-name">{song.title}</span>
                                            <span className="song-meta-line">
                                                <span className="song-detail">
                                                    {composerOf(song) || genreOf(song)}
                                                </span>
                                                <span className="song-meta">
                                                    {' '}
                                                    · {keyOf(song)} · {song.chart.performance.bpm}{' '}
                                                    BPM
                                                    {/* The phone has no Opened column, so the
                                                        opened time rides the meta line there. */}
                                                    {ago && (
                                                        <span className="song-ago"> · {ago}</span>
                                                    )}
                                                </span>
                                            </span>
                                            <CandidateMarker kind={kinds.get(song.id) ?? null} />
                                        </button>
                                    </td>
                                    <td className="hide-mobile song-opened">{ago ?? '—'}</td>
                                    <td className="more-cell">
                                        <button
                                            className="icon-button row-more"
                                            aria-label={`More actions for ${song.title}`}
                                            aria-haspopup="menu"
                                            aria-expanded={false}
                                            aria-disabled={busy || undefined}
                                            onClick={(event) =>
                                                onOpenRowMenu(
                                                    song.id,
                                                    song.title,
                                                    event.currentTarget,
                                                )
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
        </section>
    );
}

/**
 * The standards shelf (#1441) — Blues, Jazz standards and Grooves, `perShelf` of each, every item
 * opening the standard as an unsaved draft. "Browse all →" (and, on a first visit, each shelf's
 * own "All N …" link) opens #1439's browse view.
 */
function StandardsShelf({
    perShelf,
    firstVisit,
    busy,
    onOpenStandard,
    onBrowseStandards,
    standardsEntry,
    standardsEntryRef,
}: SongbookProps & { perShelf: number; firstVisit: boolean }) {
    const entryRef = (entry: StandardsEntry) =>
        standardsEntry === entry ? standardsEntryRef : undefined;
    return (
        <section className="home-section standards-shelf" aria-labelledby="standards-heading">
            <div className="section-heading">
                <h2 id="standards-heading">Standards</h2>
                <button
                    ref={entryRef('all')}
                    className="text-link"
                    disabled={busy}
                    onClick={() => onBrowseStandards('all')}
                >
                    Browse all →
                </button>
            </div>
            <p className="section-sub">
                {STANDARDS.length} charts that come with Ensemble. Open one to play; Save keeps your
                own copy.
            </p>
            <div className="shelf-columns">
                {SHELF_ORDER.map((shelf) => {
                    const entries = STANDARDS.filter((entry) => entry.shelf === shelf);
                    return (
                        <div className="shelf-column" key={shelf}>
                            <h3>{STANDARD_SHELF_LABELS[shelf]}</h3>
                            <ul className="shelf-items">
                                {entries.slice(0, perShelf).map((entry) => (
                                    <li key={entry.id}>
                                        <StandardItem
                                            entry={entry}
                                            busy={busy}
                                            onOpen={onOpenStandard}
                                        />
                                    </li>
                                ))}
                            </ul>
                            {firstVisit && (
                                <button
                                    ref={entryRef(shelf)}
                                    className="text-link"
                                    disabled={busy}
                                    onClick={() => onBrowseStandards(shelf)}
                                >
                                    All {entries.length}{' '}
                                    {STANDARD_SHELF_LABELS[shelf].toLowerCase()} →
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function StandardItem({
    entry,
    busy,
    onOpen,
}: {
    entry: StandardEntry;
    busy: boolean;
    onOpen: (id: string) => void;
}) {
    return (
        <button
            className="standard-item"
            aria-label={`Open ${entry.title}`}
            disabled={busy}
            onClick={() => onOpen(entry.id)}
        >
            <span className="play-circle" aria-hidden="true">
                ▶
            </span>
            <span className="standard-copy">
                <span className="standard-title">{entry.title}</span>
                <span className="standard-meta">
                    {entry.genre} · {entry.bpm} BPM
                </span>
            </span>
        </button>
    );
}

/**
 * A fresh device (#1441): nothing of its own and nothing to continue, so the standards are the
 * page — a bigger shelf — and "Or bring your own" offers the three ways in. (Its h1 and subline
 * are rendered by `Songbook` itself.)
 */
function FirstVisit(props: SongbookProps) {
    const { busy, onImport, onNewSong } = props;
    return (
        <>
            <StandardsShelf {...props} perShelf={6} firstVisit />
            <section className="home-section bring-your-own" aria-labelledby="byo-heading">
                <div className="section-heading">
                    <h2 id="byo-heading">Or bring your own</h2>
                </div>
                <div className="byo-cards">
                    <button className="byo-card" disabled={busy} onClick={onImport}>
                        <strong>Import from iReal Pro</strong>
                        <span>A song or a whole playlist, from a link or a file.</span>
                    </button>
                    <button className="byo-card" disabled={busy} onClick={onNewSong}>
                        <strong>Write a new song</strong>
                        <span>Type the chords, pick a feel.</span>
                    </button>
                </div>
            </section>
        </>
    );
}

/**
 * One search across the musician's songs (title and composer) and the standards, grouped
 * (#1441). The standards half answers at once; the songs half waits for the lazy full-library
 * read the search box started, and says so rather than reporting no matches.
 */
function SearchResults({
    query,
    library,
    libraryFailure,
    busy,
    onOpenSong,
    onOpenStandard,
}: {
    query: string;
    library: ChartDocument[] | null;
    libraryFailure: string | null;
    busy: boolean;
    onOpenSong: (id: string) => void;
    onOpenStandard: (id: string) => void;
}) {
    const songs = useMemo(
        () =>
            library?.filter(
                (song) =>
                    song.title.toLowerCase().includes(query) ||
                    composerOf(song).toLowerCase().includes(query),
            ) ?? null,
        [library, query],
    );
    const standards = STANDARDS.filter(
        (entry) =>
            entry.title.toLowerCase().includes(query) || entry.genre.toLowerCase().includes(query),
    );
    return (
        <section className="home-section search-results" aria-label="Search results">
            <div className="search-group" data-testid="search-songs">
                <h2>Your songs</h2>
                {songs === null ? (
                    <p className="library-loading" role="status">
                        {libraryFailure ?? 'Searching your songs…'}
                    </p>
                ) : songs.length === 0 ? (
                    <p className="search-empty">No songs match.</p>
                ) : (
                    <ul className="search-list">
                        {songs.slice(0, SEARCH_LIMIT).map((song) => (
                            <li key={song.id}>
                                <button
                                    className="song-link"
                                    disabled={busy}
                                    onClick={() => onOpenSong(song.id)}
                                >
                                    <span className="song-name">{song.title}</span>
                                    <span className="song-detail">
                                        {composerOf(song) || genreOf(song)}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {songs !== null && songs.length > SEARCH_LIMIT && (
                    <p className="search-empty">
                        Showing {SEARCH_LIMIT} of {songs.length}. Keep typing to narrow it down.
                    </p>
                )}
            </div>
            <div className="search-group" data-testid="search-standards">
                <h2>Standards</h2>
                {standards.length === 0 ? (
                    <p className="search-empty">No standards match.</p>
                ) : (
                    <ul className="search-list">
                        {standards.map((entry) => (
                            <li key={entry.id}>
                                <StandardItem entry={entry} busy={busy} onOpen={onOpenStandard} />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}
