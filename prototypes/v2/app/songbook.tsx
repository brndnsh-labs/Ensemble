import { type RefObject, useEffect, useMemo, useRef } from 'react';
import {
    ACCOUNT_SWITCH_MESSAGES,
    REMOTE_UPDATE_MESSAGES,
    V1_IMPORT_ACCOUNT_MESSAGES,
} from '../lib/account/messages';
import type { RemoteCandidateKind } from '../lib/account/sync-loop';
import { arrangementOf, composerOf, genreOf } from '../lib/documents';
import { type HomeSlice, openedAgo } from '../lib/home';
import { v1OfferDeclines } from '../lib/import-v1';
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

/** The v1 import offer (#1274). Counts and copy only; the shell owns the work. */
export interface V1ImportOffer {
    /**
     * How many songs pressing Import would actually bring over — not how many the old app
     * holds (#1274 patch R12). The two differ on the song-menu path, which offers everything
     * regardless of what is already here.
     */
    songs: number;
    /** Offered items this songbook already holds. */
    alreadyHere: number;
    /**
     * v1 data that exists but cannot be read, each with the reason to show. Rendered BEFORE
     * a run, not only in its result, or a profile with nothing but unreadable items has a
     * reason no click can reach (#1274 patch R1).
     */
    problems: Array<{ label: string; reason: string }>;
    /** One-line result of the run that just finished, or null before one. */
    result: string | null;
    /**
     * True when the musician opened this from the song menu rather than the app opening it
     * by itself. An asked-for offer never records a decline (#1274 patch N1b): they came
     * looking, which is the opposite of "stop showing me this".
     */
    asked: boolean;
    /**
     * True while this device is signed in (#1274 patch R2). The import is guest-only — it
     * never writes to an account — so the card has to say where the songs land and how they
     * reach the account from there, in the account page's own words. Since #1359 a run that
     * lands something opens that offer itself, and the sentence
     * (`V1_IMPORT_ACCOUNT_MESSAGES.pointer`) covers both: the offer that follows, and the
     * account page's standing button for every run that opens none.
     */
    accountPointer: boolean;
    /**
     * Why the offer cannot say what Import would do, when it cannot (#1441 review P2): the guest
     * songbook it is compared against would not read, or the comparison itself failed. The card
     * says so, with the reason, instead of disappearing or claiming there is nothing to bring.
     */
    unavailable: string | null;
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
    /** True when this device opted out with `?accounts=off` (#1357) — and only once known. */
    accountsOff: boolean;
    /** Turns the account surfaces back on for this device, in place, with no reload. */
    onEnableAccounts: () => void;
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
    v1Import: V1ImportOffer | null;
    onImportV1: () => void;
    /** `declined` is the card's own answer — see `V1ImportCard` (#1274 patch N1). */
    onDismissV1: (declined: boolean) => void;
    /**
     * True once no further v1 offer can appear on its own: the old app's data has been looked for
     * and any offer's plan has settled (#1441 review P2). Published as `data-v1-plan`.
     */
    v1PlanSettled: boolean;
    /** Whether this origin holds an old-Ensemble profile at all — the first-visit card's gate. */
    v1Present: boolean;
    /** The song menu's permanent way back into the v1 import, from the first-visit card. */
    onOpenV1Import: () => void;
    /** Per-device star set (#1440) — same source the row ⋯ menu's Star/Unstar writes through. */
    starred: ReadonlySet<string>;
    onToggleStar: (id: string) => void;
    /** Opens the row ⋯ menu (Star/Unstar, Rename, Duplicate, Export file, Delete…) for one song. */
    onOpenRowMenu: (id: string, title: string) => void;
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
        accountsOff,
        onEnableAccounts,
        remoteCandidates,
        featured,
        search,
        v1Import,
        busy,
        offline,
    } = props;
    const rows = home?.rows ?? [];
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
        <main
            className="home"
            data-layout={firstVisit ? 'first-visit' : 'everyday'}
            // A positive "no more v1 offer is coming" signal (#1441 review P2): the offer's plan
            // waits on a lazy whole-songbook read, so "no card yet" alone proves nothing.
            data-v1-plan={props.v1PlanSettled ? 'settled' : 'pending'}
        >
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
            {accountsOff && (
                <p className="library-notice" role="status" data-testid="accounts-off">
                    <span>{ACCOUNT_SWITCH_MESSAGES.off}</span>
                    <button
                        className="account-btn"
                        data-testid="accounts-turn-on"
                        onClick={onEnableAccounts}
                    >
                        {ACCOUNT_SWITCH_MESSAGES.turnOn}
                    </button>
                </p>
            )}
            {home !== null && home.unreadable > 0 && (
                <p className="library-notice" role="status" data-testid="home-unreadable">
                    {home.unreadable === 1
                        ? 'One song on this device couldn’t be read, so it isn’t listed here.'
                        : `${home.unreadable} songs on this device couldn’t be read, so they aren’t listed here.`}
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
            {/* Below the page's h1 in both layouts, so its own h2 never outranks it. */}
            {v1Import && (
                <V1ImportCard
                    offer={v1Import}
                    busy={busy}
                    onImport={props.onImportV1}
                    onDismiss={props.onDismissV1}
                />
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

/** A key the way the chart header writes it: `C`, `Am`. */
function keyOf(document: ChartDocument): string {
    const { key, isMinor } = arrangementOf(document);
    return `${key}${isMinor ? 'm' : ''}`;
}

/**
 * "Pick up where you left off" (#1441): the song's own first bars — never a sample — with Open
 * chart and ▶ Play. The phone shows the first four (CSS), the desktop all eight.
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
                <span className="eyebrow">
                    {continued ? 'Pick up where you left off' : 'From your songbook'}
                </span>
                <h2 id="continue-title">{featured.title}</h2>
                <p className="continue-meta">
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
    // here (a v1 import, a downloaded library) fills the list from elsewhere (`HomeRead.fill`).
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
                        All {home.count} {home.count === 1 ? 'song' : 'songs'} →
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
                            <th>Song</th>
                            <th className="hide-mobile">Key</th>
                            <th className="hide-mobile">Tempo</th>
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
                                        <button
                                            className="song-link"
                                            disabled={busy}
                                            onClick={() => onOpenSong(song.id)}
                                        >
                                            <span className="song-name">{song.title}</span>
                                            <span className="song-detail">
                                                {composerOf(song) || genreOf(song)}
                                            </span>
                                            <CandidateMarker kind={kinds.get(song.id) ?? null} />
                                            <span className="song-meta">
                                                {keyOf(song)} · {song.chart.performance.bpm} BPM
                                                {ago ? ` · ${ago}` : ''}
                                            </span>
                                        </button>
                                    </td>
                                    <td className="song-key hide-mobile">{keyOf(song)}</td>
                                    <td className="hide-mobile">{song.chart.performance.bpm}</td>
                                    <td className="hide-mobile song-opened">{ago ?? '—'}</td>
                                    <td className="more-cell">
                                        <button
                                            className="icon-button row-more"
                                            aria-label={`More actions for ${song.title}`}
                                            disabled={busy}
                                            onClick={() => onOpenRowMenu(song.id, song.title)}
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
 * are rendered by `Songbook` itself, above the v1 card.) The old-Ensemble card
 * appears only when this origin holds v1 data.
 */
function FirstVisit(props: SongbookProps) {
    const { busy, onImport, onNewSong, v1Present, onOpenV1Import } = props;
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
                    {v1Present && (
                        <button className="byo-card" disabled={busy} onClick={onOpenV1Import}>
                            <strong>Bring songs from the old Ensemble</strong>
                            <span>Copy the songs this browser kept in the old app.</span>
                        </button>
                    )}
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

/**
 * The v1 import card (#1274) — the offer, what a run did, and every piece of v1 data that
 * could not be read, with its reason.
 *
 * Its own component because it needs an effect, and because its four shapes (something to
 * bring over · everything already here · nothing readable · a finished run) are easier to
 * keep truthful in one place than inlined in the songbook's markup.
 *
 * Accessibility (#1274 patch R10): the section is named by its own heading, the result line
 * is a live region that EXISTS from the first render — a `role="status"` mounted together
 * with its text is not reliably announced — and pressing Import, which replaces that button
 * with Done, moves focus to the result instead of dropping it on `<body>`.
 */
function V1ImportCard({
    offer,
    busy,
    onImport,
    onDismiss,
}: {
    offer: V1ImportOffer;
    busy: boolean;
    onImport: () => void;
    onDismiss: (declined: boolean) => void;
}) {
    const heading = useRef<HTMLHeadingElement>(null);
    const announced = useRef<string | null>(null);
    useEffect(() => {
        if (offer.result && announced.current !== offer.result) {
            announced.current = offer.result;
            // The HEADING, not the live region (#1274 patch N9): moving focus into a
            // `role="status"` as its text arrives invites a double announcement, and the
            // heading is where someone lands to read what just happened anyway.
            heading.current?.focus();
        }
    }, [offer.result]);
    const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
    // ONE fact behind both the label and what the button does (#1274 patch N1a), and a rule
    // with a name and a test of its own rather than a condition spelled twice.
    const declines = v1OfferDeclines(offer);
    const headingText = offer.result
        ? 'Brought over from the old Ensemble'
        : offer.unavailable
          ? 'The old Ensemble’s songs can’t be compared yet'
          : offer.songs > 0
            ? `Bring over ${plural(offer.songs, 'song')} from the old Ensemble?`
            : offer.alreadyHere > 0
              ? 'Everything from the old Ensemble is already here'
              : offer.problems.length > 0
                ? 'Some music in the old Ensemble could not be read'
                : 'There is nothing in the old Ensemble to bring over';
    const body = offer.result
        ? null
        : offer.unavailable
          ? offer.unavailable
          : offer.songs > 0
            ? 'They are copied into this songbook. Nothing in the old app is changed or removed.'
            : offer.alreadyHere > 0
              ? `Nothing new to bring over — ${plural(offer.alreadyHere, 'song')} from the old app ${offer.alreadyHere === 1 ? 'is' : 'are'} already in this songbook.`
              : offer.problems.length > 0
                ? 'Nothing was changed there. Open the old Ensemble to check those songs.'
                : 'The old app is still on this device, but it has no saved songs to copy.';
    return (
        <section
            className="home-card import-card"
            data-testid="v1-import"
            aria-labelledby="v1-import-heading"
        >
            <span className="eyebrow">From the old Ensemble</span>
            <h2 id="v1-import-heading" ref={heading} tabIndex={-1}>
                {headingText}
            </h2>
            {body && <p>{body}</p>}
            {!offer.result && offer.problems.length > 0 && (
                <ul className="import-problems" data-testid="v1-import-problems">
                    {offer.problems.map((problem) => (
                        <li key={`${problem.label} — ${problem.reason}`}>
                            {problem.label} — {problem.reason}
                        </li>
                    ))}
                </ul>
            )}
            {offer.accountPointer && (
                <p className="import-pointer" data-testid="v1-import-account-pointer">
                    {V1_IMPORT_ACCOUNT_MESSAGES.pointer}
                </p>
            )}
            <p className="import-result" role="status" data-testid="v1-import-result">
                {offer.result ?? ''}
            </p>
            <div className="import-actions">
                {!offer.result && offer.songs > 0 && (
                    <button className="btn primary" disabled={busy} onClick={onImport}>
                        Import
                    </button>
                )}
                <button className="btn" disabled={busy} onClick={() => onDismiss(declines)}>
                    {declines ? 'Not now' : 'Done'}
                </button>
            </div>
        </section>
    );
}
