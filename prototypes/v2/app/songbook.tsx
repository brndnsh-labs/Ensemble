import { arrangementOf } from '../lib/documents';
import type { ChartDocument } from '../lib/runtime';

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
}

export function Songbook({
    songs,
    accountLibrary,
    loading,
    featured,
    continued,
    busy,
    offline,
    search,
    onSearch,
    onImport,
    onNewSong,
    onOpenSong,
}: SongbookProps) {
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
                            Loading your account songbook…
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
