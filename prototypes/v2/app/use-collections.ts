import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { accountSync } from '../lib/account/sync-loop';
import {
    type CollectionDocument,
    MAX_COLLECTION_SONGS,
    newCollection,
    newStarred,
    STARRED_COLLECTION_ID,
    starredOf,
    withSong,
} from '../lib/collections';
import * as repository from '../lib/repository';
import { legacyStarredIds } from '../lib/session';

/** One collection as the songbook shows it: the stored document, plus the songs that resolve. */
export interface CollectionEntry {
    document: CollectionDocument;
    /** In the collection's own order; ids that no longer resolve are left out, never rewritten. */
    resolvedSongIds: string[];
}

export interface UseCollectionsOptions {
    /**
     * Which songbook a WRITE goes to: the account's while signed in, the guest's otherwise — the
     * rule `storeSave` and every row action already follow. A write made while the account is
     * still attaching waits for it inside the loop (`ownedScope`), never falls through to guest.
     */
    signedIn: boolean;
    /**
     * The account the loop has ATTACHED, or null: what a READ is keyed on, exactly like the star
     * set and the account library before #1477 — published only once the loop has a scope, so
     * the first read cannot race the attach, and null falls straight back to the guest songbook.
     */
    owner: string | null;
    /**
     * The account the SESSION names while signed in, or null — the claim an account write carries
     * through the loop's owner fence (`refuseForeign`), as `refreshSongs` passes `sessionOwner`.
     * Set before `owner` is, so a write made while the attach settles is still fenced.
     */
    sessionOwner: string | null;
    /** The loop's "the stored library moved" counter: a pass that merged or downloaded re-reads. */
    libraryVersion: number;
}

/** One optimistic star: what the musician asked for, and when its write landed (if it has). */
interface PendingStar {
    on: boolean;
    /** `writesDone` once this toggle's write committed; null while it is still in flight. */
    landed: number | null;
}

/**
 * The songbook's collections and its Starred (#1477), for whichever songbook is live — the shell's
 * state, kept in a hook so `app/ensemble.tsx` holds one line of it rather than a dozen. Storage
 * goes only through the existing seams: the guest repository (`lib/repository.ts`) and the account
 * loop (`accountSync`, whose collection calls are owner-fenced). Nothing here renders.
 *
 * **Starred is a collection now.** The star set every surface reads is Starred's `songIds`, and a
 * star toggle is one collection Save. Starred is created LAZILY, on the first star — never at
 * startup, so an account already at its document cap is never handed a Save it cannot take — and
 * the one-time copy of the device-local stars (#1440) runs before the first read of each songbook:
 * `migrateGuestStars` for a guest, `accountSync.migrateStars` for an account. Both are idempotent
 * and neither creates Starred without a star to put in it.
 */
export function useCollections({
    signedIn,
    owner,
    sessionOwner,
    libraryVersion,
}: UseCollectionsOptions) {
    const [collections, setCollections] = useState<CollectionEntry[] | null>(null);
    /**
     * The star set as last READ, with this tab's own toggles applied on top — so a click shows at
     * once. A toggle is dropped from here only by a read that STARTED after its write landed
     * (`landed` against the read's own `writesDone` snapshot), so a read already in flight when
     * the musician clicked cannot flip the star back.
     */
    const [pendingStars, setPendingStars] = useState<ReadonlyMap<string, PendingStar>>(
        () => new Map(),
    );
    const read = useRef(0);
    /** Counts committed collection writes: the clock `PendingStar.landed` is read against. */
    const writesDone = useRef(0);
    /**
     * The owner the LATEST render reads for (#1477 review P2-2). A read started for another
     * owner — an edit's follow-up read from the render before an attach — must neither land nor
     * take the read counter from the current owner's read.
     */
    const ownerRef = useRef(owner);
    ownerRef.current = owner;

    const reload = useCallback(async () => {
        if (owner !== ownerRef.current) {
            return;
        }
        const mine = ++read.current;
        const writesAtStart = writesDone.current;
        try {
            let next: CollectionEntry[];
            // The one-time copy of the device-local stars runs first, in its own catch: a copy
            // that cannot run today (storage refused, the account at its cap) is tried again on
            // the next read, and must not cost the musician the collections they already have.
            if (owner === null) {
                // A copy, once: the old key is left exactly as it is (`migrateGuestStars`).
                await repository.migrateGuestStars(legacyStarredIds()).catch(() => false);
                next = await repository.listCollections();
            } else {
                await accountSync.migrateStars(owner).catch(() => {});
                next = await accountSync.listCollections(owner);
            }
            if (mine === read.current && owner === ownerRef.current) {
                setCollections(next);
                setPendingStars((previous) => {
                    const kept = new Map(
                        [...previous].filter(
                            ([, star]) => star.landed === null || star.landed > writesAtStart,
                        ),
                    );
                    return kept.size === previous.size ? previous : kept;
                });
            }
        } catch {
            // Best effort, as the star set always was: the songbook renders without collections,
            // and the next library-version bump or sign-in/out reads again. A refusal while an
            // attach settles is the fence working (`AccountMismatchError`), not a failure.
        }
    }, [owner]);
    /** The latest `reload`, for a write that finishes after the owner it began under changed. */
    const reloadRef = useRef(reload);
    reloadRef.current = reload;

    // Another songbook's collections are never shown as this one's while this one's is read.
    // biome-ignore lint/correctness/useExhaustiveDependencies: `owner` is the reset trigger.
    useEffect(() => {
        setCollections(null);
        setPendingStars(new Map());
    }, [owner]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: `libraryVersion` is a re-run trigger.
    useEffect(() => {
        void reload();
    }, [reload, libraryVersion]);

    const starredEntry = useMemo(
        () => (collections ? starredOf(collections) : null),
        [collections],
    );
    const starred = useMemo(() => {
        const ids = new Set(starredEntry?.document.songIds ?? []);
        for (const [id, { on }] of pendingStars) {
            if (on) {
                ids.add(id);
            } else {
                ids.delete(id);
            }
        }
        return ids;
    }, [starredEntry, pendingStars]);

    /** One collection Save in the live songbook, read-modify-written in one transaction. */
    const edit = useCallback(
        async (
            documentId: string,
            change: (current: CollectionDocument | null) => CollectionDocument | null,
            /** Told this write's `writesDone` stamp once it has committed, before the re-read. */
            onLanded?: (stamp: number) => void,
        ): Promise<void> => {
            if (signedIn) {
                await accountSync.editCollection(documentId, change, sessionOwner);
                // Not awaited: the commit is already durable, and the upload is the loop's, as
                // after a song Save.
                void accountSync.run().catch(() => {});
            } else {
                await repository.editCollection(documentId, change);
            }
            writesDone.current += 1;
            onLanded?.(writesDone.current);
            // The LATEST reload, keyed on whichever songbook is live now; one keyed on a songbook
            // that is no longer live does nothing (`ownerRef`).
            await reloadRef.current();
        },
        [signedIn, sessionOwner],
    );

    /** Star or unstar one song — a Save of Starred, which is created by the first star. */
    const toggleStar = useCallback(
        async (songId: string, on: boolean): Promise<void> => {
            const star: PendingStar = { on, landed: null };
            setPendingStars((previous) => new Map(previous).set(songId, star));
            const target = starredEntry?.document.id ?? STARRED_COLLECTION_ID;
            /** Replace THIS toggle's entry — never a later toggle of the same song. */
            const settle = (next: PendingStar | null) =>
                setPendingStars((previous) => {
                    if (previous.get(songId) !== star) {
                        return previous;
                    }
                    const updated = new Map(previous);
                    if (next) {
                        updated.set(songId, next);
                    } else {
                        updated.delete(songId);
                    }
                    return updated;
                });
            try {
                await edit(
                    target,
                    (current) =>
                        current ? withSong(current, songId, on) : on ? newStarred([songId]) : null,
                    (stamp) => settle({ on, landed: stamp }),
                );
            } catch (error) {
                // The toggle did not land: undo the optimistic star, and let the caller say why.
                settle(null);
                throw error;
            }
        },
        [edit, starredEntry],
    );

    /** Append one song to a collection (#1477's "Add to collection…"). False when already in it. */
    const addSong = useCallback(
        async (collectionId: string, songId: string): Promise<boolean> => {
            let added = false;
            await edit(collectionId, (current) => {
                if (!current) {
                    throw new Error('That collection no longer exists.');
                }
                const next = withSong(current, songId, true);
                added = next !== null;
                return next;
            });
            return added;
        },
        [edit],
    );

    /** A new user collection, optionally holding songs already. Returns its id. */
    const create = useCallback(
        async (name: string, songIds: string[] = []): Promise<string> => {
            const document = newCollection(name, songIds.slice(0, MAX_COLLECTION_SONGS));
            await edit(document.id, (current) => (current ? null : document));
            return document.id;
        },
        [edit],
    );

    /** Rename a user collection. Starred is never renamed: there is no affordance, and no path. */
    const rename = useCallback(
        async (collectionId: string, name: string): Promise<void> => {
            await edit(collectionId, (current) => {
                if (!current) {
                    throw new Error('That collection no longer exists.');
                }
                if (current.builtIn) {
                    throw new Error('Starred can’t be renamed.');
                }
                return current.name === name ? null : { ...current, name };
            });
        },
        [edit],
    );

    /**
     * Delete a user collection — never its songs; the caller deletes those first when asked to.
     * Starred is refused here as well as having no affordance. Resolves to the sentence to show.
     */
    const remove = useCallback(
        async (collectionId: string): Promise<string> => {
            const entry = collections?.find((item) => item.document.id === collectionId);
            if (entry?.document.builtIn) {
                throw new Error('Starred can’t be deleted.');
            }
            let message = 'Collection deleted. Its songs are still in your songbook.';
            if (signedIn) {
                const result = await accountSync.deleteCollection(collectionId, sessionOwner);
                if (result.kind === 'refused') {
                    throw new Error(result.message);
                }
                message = result.message;
            } else {
                await repository.deleteCollection(collectionId);
            }
            await reloadRef.current();
            return message;
        },
        [collections, signedIn, sessionOwner],
    );

    return { collections, starred, reload, toggleStar, addSong, create, rename, remove };
}
