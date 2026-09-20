import { useEffect, useRef } from 'react';
import { REMOTE_UPDATE_MESSAGES } from '../lib/account/messages';
import { arrangementOf } from '../lib/documents';
import { v1OfferDeclines } from '../lib/import-v1';
import type { ChartDocument } from '../lib/runtime';

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
     * reach the account from there, in the account page's own words.
     */
    accountPointer: boolean;
}

interface SongbookProps {
    songs: ChartDocument[];
    /**
     * True when `songs` is the signed-in account library rather than the guest one (#1266).
     * There is no switcher — guest signed out, account signed in (rollout decision 9 S3) — so
     * this only changes what the page SAYS about the list it was handed.
     */
    accountLibrary: boolean;
    /**
     * True while the account library has not been read yet (#1266). An empty `songs` is a claim —
     * "your account has no songs" — and it must not be made from a read that hasn't finished, or
     * from one that failed. This is the difference between the two.
     */
    loading: boolean;
    /**
     * The account songs a newer version is waiting for (#1310) — `reconcile` preserved a remote
     * advance rather than applying it over this device's unsaved work. Document ids, marked in the
     * list so the state is visible from the one place a musician can see the whole library; the
     * choice itself lives on the stand, where the song's own text is.
     *
     * Always empty for a guest songbook, which no account can advance underneath.
     */
    newerInAccount: readonly string[];
    /** The card at the top: the last-opened song (with any recovered draft), else a starter. */
    featured: ChartDocument | null;
    /** True when `featured` is the song the musician last had open. */
    continued: boolean;
    busy: boolean;
    offline: string;
    search: string;
    onSearch: (value: string) => void;
    onImport: () => void;
    onNewSong: () => void;
    onOpenSong: (id: string) => void;
    v1Import: V1ImportOffer | null;
    onImportV1: () => void;
    /** `declined` is the card's own answer — see `V1ImportCard` (#1274 patch N1). */
    onDismissV1: (declined: boolean) => void;
}

export function Songbook({
    songs,
    accountLibrary,
    loading,
    newerInAccount,
    featured,
    continued,
    busy,
    offline,
    search,
    onSearch,
    onImport,
    onNewSong,
    onOpenSong,
    v1Import,
    onImportV1,
    onDismissV1,
}: SongbookProps) {
    // A set, not `includes`: both this list and the account library are capped at 2,000, and the
    // pair of them scanned against each other is the one place that product would be paid for.
    const newer = new Set(newerInAccount);
    return (
        <main className="home">
            <div className="home-intro">
                <div>
                    <span className="eyebrow">Your next good session</span>
                    <h1>Let’s play something.</h1>
                    <p>A chart, a backing band, and a little room to explore.</p>
                </div>
                <div className="home-actions">
                    <button className="btn" disabled={busy} onClick={onImport}>
                        Import chart
                    </button>
                    <button className="btn primary" disabled={busy} onClick={onNewSong}>
                        ＋ New song
                    </button>
                </div>
            </div>
            <div className="home-grid">
                <div>
                    {featured && (
                        <section className="continue-card">
                            <div className="continue-copy">
                                <span className="eyebrow">
                                    {continued
                                        ? 'Pick up where you left off'
                                        : 'A good place to start'}
                                </span>
                                <h3>{featured.title}</h3>
                                <p>
                                    {featured.chart.band.groove.lastSmartGenre} ·{' '}
                                    {featured.chart.performance.bpm} BPM ·{' '}
                                    {arrangementOf(featured).key}
                                    {arrangementOf(featured).isMinor ? 'm' : ''}
                                </p>
                                <button
                                    className="btn"
                                    disabled={busy}
                                    onClick={() => onOpenSong(featured.id)}
                                >
                                    Open chart →
                                </button>
                            </div>
                            <div className="continue-art" aria-hidden="true">
                                <div className="mini-heading">A little room to improvise</div>
                                <div className="mini-grid">
                                    {['C7', 'F7', 'C7', 'G7', 'F7', 'F7', 'C7', 'G7'].map(
                                        (c, i) => (
                                            // biome-ignore lint/suspicious/noArrayIndexKey: Fixed decorative sample, never reordered.
                                            <span key={i}>{c}</span>
                                        ),
                                    )}
                                </div>
                            </div>
                        </section>
                    )}
                    {v1Import && (
                        <V1ImportCard
                            offer={v1Import}
                            busy={busy}
                            onImport={onImportV1}
                            onDismiss={onDismissV1}
                        />
                    )}
                    <div className="section-heading library-heading">
                        <h2 data-testid="library-heading">
                            {accountLibrary ? 'Your account songbook' : 'Your songbook'}
                        </h2>
                        <label className="search">
                            <span className="sr">Search songs</span>
                            <input
                                placeholder="Find a song…"
                                value={search}
                                onChange={(e) => onSearch(e.target.value)}
                            />
                        </label>
                    </div>
                    {loading && (
                        <p className="library-loading" role="status" data-testid="library-loading">
                            {accountLibrary
                                ? 'Loading your account songbook…'
                                : 'Loading your songbook…'}
                        </p>
                    )}
                    <table className="song-table" hidden={loading}>
                        <thead>
                            <tr>
                                <th>Song</th>
                                <th>Key</th>
                                <th className="hide-mobile">Tempo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {songs
                                .filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
                                .map((s) => (
                                    <tr className="song-row" key={s.id}>
                                        <td>
                                            <button
                                                className="song-link"
                                                disabled={busy}
                                                onClick={() => onOpenSong(s.id)}
                                            >
                                                <span className="song-glyph">♪</span>
                                                <span>
                                                    <span className="song-name">{s.title}</span>
                                                    <span className="song-detail">
                                                        {s.chart.band.groove.lastSmartGenre} ·{' '}
                                                        {accountLibrary
                                                            ? 'In your account'
                                                            : 'Saved locally'}
                                                    </span>
                                                    {/* #1310 — said here as well as on the stand
                                                        because this is the only surface that shows
                                                        the whole library at once, and the song it
                                                        is about may not be the one open. */}
                                                    {newer.has(s.id) && (
                                                        <span
                                                            className="song-marker"
                                                            data-testid="song-newer-in-account"
                                                        >
                                                            {REMOTE_UPDATE_MESSAGES.marker}
                                                        </span>
                                                    )}
                                                </span>
                                            </button>
                                        </td>
                                        <td className="song-key">
                                            {arrangementOf(s).key}
                                            {arrangementOf(s).isMinor ? 'm' : ''}
                                        </td>
                                        <td className="hide-mobile">{s.chart.performance.bpm}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                    <p className="offline-note">
                        {offline}. Browser storage can be cleared; export songs you want to keep.
                    </p>
                </div>
                <aside>
                    <section className="quick-jam">
                        <span className="eyebrow">No blank page required</span>
                        <h2>Just start playing.</h2>
                        <p>Pick a chart, change the key or the feel, and make it your own.</p>
                        {songs
                            .filter((s) => s.id.startsWith('starter-'))
                            .map((s) => (
                                <button
                                    className="jam-tile"
                                    key={s.id}
                                    disabled={busy}
                                    onClick={() => onOpenSong(s.id)}
                                >
                                    <span className="jam-symbol">♭</span>
                                    <span>
                                        <strong>{s.chart.band.groove.lastSmartGenre}</strong>
                                        <small>{s.title}</small>
                                    </span>
                                </button>
                            ))}
                    </section>
                    <section className="sync-card">
                        <h3>Your band, wherever you play.</h3>
                        {accountLibrary ? (
                            // The three sync facts are a music-stand surface: they describe the
                            // chart on the stand, and there isn't one here (#1266).
                            <p>
                                Save on one device and open it on another. Your guest songbook stays
                                on this device and is separate from your account.
                            </p>
                        ) : (
                            <p>
                                Accounts and cloud songbooks are a later stage. The stand is
                                device-local, with real playback and portable Ensemble files.
                            </p>
                        )}
                        <p className="preview-note">
                            iReal import and chord discovery are not implemented here yet. Open a
                            song and use its menu's "Copy link" to share it — the link opens as an
                            unsaved draft, with no account needed.
                        </p>
                    </section>
                </aside>
            </div>
            <footer className="home-footer">
                <span>Made for practice, writing, and getting lost in a good groove.</span>
                <span>Music stand beta · {process.env.NEXT_PUBLIC_SOURCE_REV}</span>
            </footer>
        </main>
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
        : offer.songs > 0
          ? `Bring over ${plural(offer.songs, 'song')} from the old Ensemble?`
          : offer.alreadyHere > 0
            ? 'Everything from the old Ensemble is already here'
            : offer.problems.length > 0
              ? 'Some music in the old Ensemble could not be read'
              : 'There is nothing in the old Ensemble to bring over';
    const body = offer.result
        ? null
        : offer.songs > 0
          ? 'They are copied into this songbook. Nothing in the old app is changed or removed.'
          : offer.alreadyHere > 0
            ? `Nothing new to bring over — ${plural(offer.alreadyHere, 'song')} from the old app ${offer.alreadyHere === 1 ? 'is' : 'are'} already in this songbook.`
            : offer.problems.length > 0
              ? 'Nothing was changed there. Open the old Ensemble to check those songs.'
              : 'The old app is still on this device, but it has no saved songs to copy.';
    return (
        <section
            className="quick-jam import-card"
            data-testid="v1-import"
            aria-labelledby="v1-import-heading"
        >
            <span className="eyebrow">From the old Ensemble</span>
            <h3 id="v1-import-heading" ref={heading} tabIndex={-1}>
                {headingText}
            </h3>
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
                    These go to this device’s songbook, not your account. To add them to your
                    account afterwards, use “Add this device’s songs” on your account page.
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
