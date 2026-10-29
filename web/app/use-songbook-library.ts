import {
    type Dispatch,
    type RefObject,
    type SetStateAction,
    useEffect,
    useEffectEvent,
    useRef,
    useState,
} from 'react';
import { AccountMismatchError, accountSync, type SyncSnapshot } from '../lib/account/sync-loop';
import { libraryDocuments } from '../lib/documents';
import type { HomeSlice } from '../lib/home';
import * as repository from '../lib/repository';
import type { ChartDocument } from '../lib/runtime';
import { openedAtMap as guestOpenedAtMap, recordOpened as recordOpenedGuest } from '../lib/session';
import { readGuestHome } from '../lib/starters';

/** What the shell hands `useSongbookLibrary`. */
/**
 * Which songbook-home view shows while no chart is on the stand: the library list, the standards
 * browser (#1439), or the All songs page (#1440) — opened on a collection (#1478) or on All songs
 * itself (`collection: null`).
 */
export type Browse =
    | { view: 'home' }
    | { view: 'standards' }
    | { view: 'all'; collection: string | null };

interface SongbookLibraryOptions {
    /** The boot read (`start()`) has finished: the runtime is up and the guest home was read. */
    ready: boolean;
    /** The session is signed in: the account songbook is the live one. */
    signedIn: boolean;
    /** The session's owner when signed in, else null: the account a home slice is read for. */
    sessionOwner: string | null;
    /**
     * The loop's published snapshot: its `owner` is the attached account, or null, and its
     * `libraryVersion` moves whenever the stored account library does.
     */
    sync: Pick<SyncSnapshot, 'owner' | 'libraryVersion'>;
    /** A chart is on the stand; the home slice's re-read waits for the songbook. */
    onStand: boolean;
    /** The shell's error line. */
    setError: Dispatch<SetStateAction<string>>;
    /** Opens the All songs page (`openAllSongs`), on a collection or on All songs itself. */
    setBrowse: Dispatch<SetStateAction<Browse>>;
}

/** What the songbook surfaces read back, and the setters the shell's other paths write. */
interface SongbookLibrary {
    /** The guest songbook's home slice, or null before one is read. */
    guestHome: HomeSlice | null;
    /** The shell's boot effect writes the first one. */
    setGuestHome: Dispatch<SetStateAction<HomeSlice | null>>;
    /** Set by the boot effect beside its guest home slice; the home re-read skips its first run. */
    bootHomeFresh: RefObject<boolean>;
    /** The account's home slice with the owner it was read for, or null. */
    accountHome: { owner: string; slice: HomeSlice } | null;
    /** `useAccountExit` clears it when the account leaves the device. */
    setAccountHome: Dispatch<SetStateAction<{ owner: string; slice: HomeSlice } | null>>;
    /** The account's full library, or null until it has been read. */
    accountSongs: ChartDocument[] | null;
    /** `useAccountExit` clears it when the account leaves the device. */
    setAccountSongs: Dispatch<SetStateAction<ChartDocument[] | null>>;
    /** The song rows the account's full read could not hand back, counted with it (#1769). */
    accountUnreadable: number;
    /** The live songbook's per-device opened-at map (#1440). */
    openedAt: Map<string, string>;
    /** `useSongDeletes` and `useCollectionActions` update it directly (and `recordOpened` here). */
    setOpenedAtState: Dispatch<SetStateAction<Map<string, string>>>;
    /** The live songbook's home slice, or null while it has not been read. */
    liveHome: HomeSlice | null;
    /** The live songbook's full library, or null while it is not asked for or not read yet. */
    liveSongs: ChartDocument[] | null;
    /** Why the live songbook's full read failed, or null. */
    liveLibraryFailure: string | null;
    /** Re-reads the live songbook's home slice, and its full library once one is wanted. */
    refreshSongs: () => Promise<void>;
    /** Re-reads the guest songbook whatever the session says. */
    refreshGuest: () => Promise<void>;
    /** Asks for a songbook's whole library. */
    wantLibrary: (which: 'guest' | 'account') => void;
    /** Asks for the live songbook's whole library. */
    wantLiveLibrary: () => void;
    /** Opens the All songs page on a current list, on a collection or on All songs itself. */
    openAllSongs: (collectionId?: string | null) => void;
    /** Re-reads the guest songbook's full library. */
    reloadGuestLibrary: () => Promise<void>;
    /** One song from the live songbook, by id. */
    readLiveSong: (id: string) => Promise<ChartDocument | null>;
    /** Records a song as opened just now, in `owner`'s songbook or the guest one (#1440). */
    recordOpened: (id: string, owner: string | null) => void;
}

/**
 * The songbook library reads (#1921): both songbooks' home slices and lazily read full libraries,
 * the per-device opened-at map, the live songbook's derivations, the effects that read them
 * (the account full read, the opened-at map, the guest full read, the home slice's re-read) and
 * the functions every surface asks them through (`refreshSongs`, `wantLibrary`, `openAllSongs`,
 * `readLiveSong`, `recordOpened`, …). The shell keeps the boot effect that writes the first guest
 * home slice (`setGuestHome`, `bootHomeFresh`), `useAccountExit`'s clears, `songbookLoading`,
 * `template` and `importPlaylist`. Call it right after `sessionOwner`, before anything reads
 * `liveHome` or `guestHome` during render.
 */
export function useSongbookLibrary({
    ready,
    signedIn,
    sessionOwner,
    sync,
    onStand,
    setError,
    setBrowse,
}: SongbookLibraryOptions): SongbookLibrary {
    // Two songbooks, never merged and never switched between by a control (#1266, rollout
    // decision 9 S3): the guest library is what a signed-out device plays from, the account
    // library is what a signed-in one plays from, and signing in copies nothing either way.
    //
    // Each songbook is read two ways (#1441). The HOME slice is what the songbook home shows —
    // the Continue song, the recently opened ones by id and a count — and it is all the home page
    // ever reads, so a 2,000-song library opens as fast as a 20-song one. The FULL library is read
    // lazily, the first time a surface needs every song (All songs, search,
    // the account page's export and count), and then kept for the page session. `null` is "not
    // read (yet)" for both, never "empty": only a home slice's `count` — IndexedDB's own
    // `count()`, not a partial read — may say a songbook has no songs.
    const [guestHome, setGuestHome] = useState<HomeSlice | null>(null);
    const [guestSongs, setGuestSongs] = useState<ChartDocument[] | null>(null);
    const [guestLibraryFailure, setGuestLibraryFailure] = useState<string | null>(null);
    // The account's home slice carries the owner it was read for: a slice that names anybody but
    // the session's owner is not this songbook's answer, and reads as still loading.
    const [accountHome, setAccountHome] = useState<{ owner: string; slice: HomeSlice } | null>(
        null,
    );
    // Null until the account library has actually been read — an empty array is a claim.
    const [accountSongs, setAccountSongs] = useState<ChartDocument[] | null>(null);
    // The song rows that read could not hand back (a text chart, #1740), counted with it: read
    // only beside `accountSongs`, so a stale count is never shown without the list it goes with.
    const [accountUnreadable, setAccountUnreadable] = useState(0);
    const [accountLibraryFailure, setAccountLibraryFailure] = useState<string | null>(null);
    /**
     * Which full libraries a surface has asked for (#1441). A ref, because every refresh path reads
     * it synchronously after an await and a closure's snapshot of a state could be a render old;
     * `libraryDemand` is the state that re-runs the load effects when a new one is asked for.
     * Never cleared: once a surface has needed the whole songbook, it stays read for the page.
     */
    const libraryWanted = useRef({ guest: false, account: false });
    const [libraryDemand, setLibraryDemand] = useState(0);
    // Latest-read-wins for the two full-library reads, which a burst of refreshes can overlap.
    const guestLibraryRead = useRef(0);
    const accountLibraryRead = useRef(0);
    // Whose library `accountSongs` holds, so a change of account never shows the last one's.
    const accountSongsOwner = useRef<string | null>(null);
    // The boot read already produced a fresh guest home slice; the home effect skips its first run.
    const bootHomeFresh = useRef(false);
    // Per-device opened-at map (#1440) — never a document field, and scoped to whichever songbook
    // is live the same way `songs` itself is (guest `localStorage`, or the account database read
    // through `accountSync`). Refreshed by the effect beside the account library read below, and
    // updated directly by `recordOpened`. Stars are no longer here: since #1477 they
    // are the built-in Starred collection (`useCollections`, the shell's).
    const [openedAt, setOpenedAtState] = useState<Map<string, string>>(() => new Map());
    // The live songbook's home slice (#1441), or null while it has not been read. Signed in, a
    // slice read for anybody else is not an answer yet.
    const liveHome = signedIn
        ? accountHome !== null && accountHome.owner === sessionOwner
            ? accountHome.slice
            : null
        : guestHome;
    // The live songbook's FULL library, or null while no surface has asked for it or its read is
    // still out — never `[]` for "not read". Only surfaces that need every song read this.
    const liveSongs = signedIn ? accountSongs : guestSongs;
    const liveLibraryFailure = signedIn ? accountLibraryFailure : guestLibraryFailure;
    // The two full-library reads as of the latest render, for the effects below to call: each
    // read is this hook's own function, new every render, so it cannot be a dependency.
    const onReloadAccountLibrary = useEffectEvent(reloadAccountLibrary);
    const onReloadGuestLibrary = useEffectEvent(reloadGuestLibrary);
    // #1266 — the account library is re-read on sign-in and whenever the loop reports it changed
    // on disk (a Save committed, a download advanced or removed a record) — but since #1441 only
    // once a surface has asked for the WHOLE library (`wantLibrary`); the home page reads its own
    // slice. `sync.owner` rather than `signedIn` is the gate: it is published only once the loop
    // has a scope, so the first read cannot race the attach. Nothing here touches
    // `current`/`saved` — the list changing is never allowed to change the chart on the stand.
    // `libraryVersion` and `libraryDemand` are not read in the body: they are "the stored library
    // moved" and "a surface just asked", and re-running this read is exactly why the effect
    // depends on them. The read itself is the latest render's `reloadAccountLibrary`, through an
    // effect event (`onReloadAccountLibrary`), so it is not a dependency.
    // biome-ignore lint/correctness/useExhaustiveDependencies: `sync.libraryVersion` and `libraryDemand` are re-run triggers.
    useEffect(() => {
        if (sync.owner === null) {
            accountLibraryRead.current += 1;
            accountSongsOwner.current = null;
            setAccountSongs(null);
            setAccountLibraryFailure(null);
            return;
        }
        if (accountSongsOwner.current !== null && accountSongsOwner.current !== sync.owner) {
            // Another account's list is never shown as this one's while this one's is read.
            accountSongsOwner.current = null;
            setAccountSongs(null);
        }
        if (!libraryWanted.current.account) {
            return;
        }
        void onReloadAccountLibrary(sync.owner);
    }, [sync.owner, sync.libraryVersion, libraryDemand]);
    // #1440 — the opened-at map follows whichever songbook is live, the same gate
    // `accountSongs` uses above: `sync.owner` publishes only once the loop has attached, so the
    // first read cannot race it, and a sign-out (owner going null) falls straight back to the
    // guest reads. `libraryVersion` is not read in the body — see the comment on the effect above.
    // `alive` guards the same race the sibling effect does (review #1440 P2): a slow account read
    // started before a sign-out must not land after it and overwrite the guest sets it already
    // fell back to.
    // biome-ignore lint/correctness/useExhaustiveDependencies: `sync.libraryVersion` is a re-run trigger.
    useEffect(() => {
        if (sync.owner === null) {
            setOpenedAtState(guestOpenedAtMap());
            return;
        }
        let alive = true;
        accountSync
            .openedAtMap()
            .then((map) => {
                if (alive) {
                    setOpenedAtState(map);
                }
            })
            .catch(() => {
                // Best-effort preference read; the songbook still renders without opened-at
                // data, and the next sign-in/out or library-version bump tries again.
            });
        return () => {
            alive = false;
        };
    }, [sync.owner, sync.libraryVersion]);
    // #1441 — the guest songbook's FULL library, read once a surface asks for it (`wantLibrary`)
    // and kept for the page. A read that failed leaves it null with its reason in
    // `guestLibraryFailure`, and the next ask retries. `libraryDemand` is the ask; the read is
    // the latest render's `reloadGuestLibrary`, through an effect event (`onReloadGuestLibrary`).
    // biome-ignore lint/correctness/useExhaustiveDependencies: `libraryDemand` is a re-run trigger.
    useEffect(() => {
        if (!ready || !libraryWanted.current.guest || guestSongs !== null) {
            return;
        }
        void onReloadGuestLibrary();
    }, [ready, libraryDemand, guestSongs]);
    /**
     * #1441 — the live songbook's HOME slice, re-read whenever the home page comes back into view
     * (leaving the stand is when "recently opened" last changed) and whenever the account library
     * moved on disk. This is the only read the home page makes: the Continue song and the ≤8
     * recently opened ones by id, plus a `count()`.
     *
     * Signed in, it waits for the loop's published owner to be the session's — the same gate the
     * full-library read uses — and a refusal while the attach settles is "not ready yet", exactly
     * as `refreshSongs` treats it. Signed out, the shell's boot read (`start()`) has already
     * produced one, so the first run is skipped rather than read twice. `libraryVersion` is a
     * trigger only.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: `sync.libraryVersion` is a re-run trigger.
    useEffect(() => {
        if (!ready || onStand) {
            return;
        }
        if (bootHomeFresh.current) {
            bootHomeFresh.current = false;
            if (!signedIn) {
                return;
            }
        }
        let alive = true;
        const fail = (failure: unknown) => {
            if (alive && !(failure instanceof AccountMismatchError)) {
                setError(failure instanceof Error ? failure.message : String(failure));
            }
        };
        if (signedIn) {
            const owner = sync.owner;
            if (owner === null || owner !== sessionOwner) {
                return;
            }
            accountSync.homeLibrary(owner).then((slice) => {
                if (alive) {
                    setAccountHome({ owner, slice });
                }
            }, fail);
        } else {
            readGuestHome().then((slice) => {
                if (alive) {
                    setGuestHome(slice);
                }
            }, fail);
        }
        return () => {
            alive = false;
        };
    }, [ready, onStand, signedIn, sync.owner, sessionOwner, sync.libraryVersion, setError]);
    /**
     * Re-reads whichever songbook this device is playing from. Signed in that is the account
     * library (#1266); signed out it is the guest one. The two are never merged and never
     * switched between by a control (rollout decision 9 S3) — which is also why this only ever
     * writes the LIST state: re-listing must never reach into `current`/`saved` and change the
     * chart on the stand.
     *
     * Since #1441 "re-read" means the HOME slice, awaited — it is small, and the home is what the
     * musician lands on — plus the full library only if a surface has already asked for it, and
     * then in the background, so a Save on a large songbook never waits seconds for a list it is
     * not showing. Nothing reads the list back from here any more: a caller that acts on one song
     * reads that song by id (`readLiveSong`).
     */
    async function refreshSongs(): Promise<void> {
        if (signedIn) {
            // Named with the account the SESSION reports (#1351 patch R6), for the reason
            // `liveStand` reads the session rather than `sync.owner`: this branch is gated on a
            // session fact while the loop reads a storage one, and `attach` runs from a passive
            // effect that can lag `meta.active`. In that window an unnamed read would hand back
            // the account this device still HOLDS — A's library, rendered as B's. Named, the loop
            // refuses it, and the caller's error handling says so instead.
            const owner = sessionOwner;
            if (owner === null) {
                return;
            }
            try {
                setAccountHome({ owner, slice: await accountSync.homeLibrary(owner) });
            } catch (failure) {
                if (!(failure instanceof AccountMismatchError)) {
                    throw failure;
                }
                // NOT READY YET, not an error (#1351 patch N3). `signedIn` flips the instant the
                // session names an owner and `attach` runs from a passive effect one render later,
                // so in that window `meta.active` still names the previous account and the named
                // read is refused. That is the fence working; it is not something to tell a
                // musician about, and `OWNER_MESSAGES.mismatch` — a sentence about a CHART on the
                // stand — would be doubly wrong in front of a library listing.
                //
                // So the account home is left exactly as it is (null = still loading), and the
                // `sync.owner`-keyed effects re-read it the moment the attach settles. No banner
                // and no retry loop: this is a read, and something else is already going to do it.
                return;
            }
            if (libraryWanted.current.account) {
                void reloadAccountLibrary(owner);
            }
            return;
        }
        await refreshGuest();
    }
    /**
     * The guest songbook's home slice, and its full library when a surface has asked for it — for
     * the paths that write the GUEST songbook whatever the session says (the guest songbook
     * becoming live again after a sign-out or an account deletion).
     */
    async function refreshGuest(): Promise<void> {
        setGuestHome(await readGuestHome());
        if (libraryWanted.current.guest) {
            void reloadGuestLibrary();
        }
    }
    /**
     * Ask for a songbook's WHOLE library (#1441) — All songs, a search and the account page are
     * the surfaces that need every song. Idempotent; a failed read is retried by
     * the next ask.
     */
    function wantLibrary(which: 'guest' | 'account') {
        const failed = which === 'guest' ? guestLibraryFailure : accountLibraryFailure;
        if (!libraryWanted.current[which] || failed !== null) {
            libraryWanted.current[which] = true;
            setLibraryDemand((demand) => demand + 1);
        }
    }
    function wantLiveLibrary() {
        wantLibrary(signedIn ? 'account' : 'guest');
    }
    /**
     * Open the All songs page with a list that is current (#1441 review P3). A full list read
     * earlier in the page is kept, but another tab may have written since, so opening the page
     * re-reads it. When the home's own `count()` already disagrees with the kept list, the kept
     * one is dropped first and the page shows loading — never "All 21 songs" on the home and then
     * a page of 20. When they agree, the page shows the kept list at once and the re-read
     * replaces it (a rename in another tab changes no count).
     */
    function openAllSongs(collectionId: string | null = null) {
        const which = signedIn ? 'account' : 'guest';
        if (liveSongs === null || !libraryWanted.current[which]) {
            wantLibrary(which);
        } else if (
            liveHome !== null &&
            // The store's `count()` holds the rows the account's full read steps over (#1769);
            // they are not a sign the kept list is stale.
            liveHome.count !== liveSongs.length + (signedIn ? accountUnreadable : 0)
        ) {
            if (signedIn) {
                accountSongsOwner.current = null;
                setAccountSongs(null);
                if (sessionOwner !== null) {
                    void reloadAccountLibrary(sessionOwner);
                }
            } else {
                // The guest load effect re-reads a wanted songbook whose list is null.
                setGuestSongs(null);
            }
        } else if (signedIn) {
            if (sessionOwner !== null) {
                void reloadAccountLibrary(sessionOwner);
            }
        } else {
            void reloadGuestLibrary();
        }
        setBrowse({ view: 'all', collection: collectionId });
    }
    /**
     * The guest songbook, all of it, validated — `repository.list()`, which refuses a songbook it
     * cannot wholly read. That refusal is kept as a reason for the surfaces that needed the list
     * (`guestLibraryFailure`), never turned into an empty songbook. Latest read wins.
     */
    async function reloadGuestLibrary() {
        const read = ++guestLibraryRead.current;
        try {
            const documents = await repository.list();
            if (read === guestLibraryRead.current) {
                setGuestSongs(documents);
                setGuestLibraryFailure(null);
            }
        } catch (failure) {
            if (read === guestLibraryRead.current) {
                setGuestSongs(null);
                setGuestLibraryFailure(
                    failure instanceof Error ? failure.message : String(failure),
                );
            }
        }
    }
    /**
     * The account library, all of it (#1266), named with `owner` for #1351 patch R6's reason. A
     * refusal while an attach settles is "not ready yet" and changes nothing; any other failure is
     * said, as the library read always has, and kept for the surfaces that needed the list.
     */
    async function reloadAccountLibrary(owner: string) {
        const read = ++accountLibraryRead.current;
        try {
            const documents = libraryDocuments(await accountSync.listLibrary(owner));
            const unreadable = await accountSync.unreadableSongs(owner);
            if (read === accountLibraryRead.current) {
                accountSongsOwner.current = owner;
                setAccountSongs(documents);
                setAccountUnreadable(unreadable.length);
                setAccountLibraryFailure(null);
            }
        } catch (failure) {
            if (read !== accountLibraryRead.current || failure instanceof AccountMismatchError) {
                return;
            }
            const reason = failure instanceof Error ? failure.message : String(failure);
            setAccountLibraryFailure(reason);
            setError(reason);
        }
    }
    /**
     * One song from the live songbook, by id (#1441) — what opening, renaming, duplicating or
     * exporting a row reads, instead of the whole library. Null when the songbook no longer holds
     * it; a stored document that does not validate throws its own reason.
     */
    async function readLiveSong(id: string): Promise<ChartDocument | null> {
        if (signedIn) {
            return accountSync.readSong(id, sessionOwner);
        }
        return repository.get(id);
    }
    /**
     * Records this song as opened just now (#1440) — a per-song preference, alongside the
     * existing single Continue-card pointer the shell's `rememberOpened` already writes. Never a
     * document edit: this touches neither `songs`/`operations` nor the guest `documents` store.
     *
     * `owner` is the STAND's resolved owner (the shell's `rememberOpened`'s own `stand.ownerId`,
     * already checked against `standBelongsElsewhere`), not a fresh read of `sync.owner` — the two
     * can differ for one render while an account attach is settling, and this must land in the
     * same songbook the chart itself was just bound to, never a guess at the live one.
     */
    function recordOpened(id: string, owner: string | null) {
        if (owner !== null) {
            accountSync.recordOpened(id, owner).catch(() => {
                /* A preference nobody can store is still a chart just opened. */
            });
        } else {
            recordOpenedGuest(id);
        }
        setOpenedAtState((previous) => {
            const updated = new Map(previous);
            updated.set(id, new Date().toISOString());
            return updated;
        });
    }

    return {
        guestHome,
        setGuestHome,
        bootHomeFresh,
        accountHome,
        setAccountHome,
        accountSongs,
        setAccountSongs,
        accountUnreadable,
        openedAt,
        setOpenedAtState,
        liveHome,
        liveSongs,
        liveLibraryFailure,
        refreshSongs,
        refreshGuest,
        wantLibrary,
        wantLiveLibrary,
        openAllSongs,
        reloadGuestLibrary,
        readLiveSong,
        recordOpened,
    };
}
