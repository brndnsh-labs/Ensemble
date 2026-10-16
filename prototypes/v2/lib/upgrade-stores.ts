/**
 * The two songbooks as "Upgrade old songs" (#1738) sees them: each store's own paths, adapted to
 * `UpgradeStore` (`lib/upgrade.ts`) and nothing more. A song is written by the guest repository's
 * `save` or by the account's Save (`accountSync.save`, which commits and queues one outbox
 * operation compare-and-swapped on its base revision) — each with the upgrade's one option, which
 * keeps the song's `updatedAt` and, for the account, re-checks inside its own transaction what may
 * not be written over. A draft is only ever rewritten in place, never deleted.
 */
import { accountSync } from './account/sync-loop';
import { framePace } from './playlist-import';
import * as repository from './repository';
import { LocalRevisionError } from './sync/protocol';
import { UpgradeSaveRefused } from './sync/repository';
import { UpgradeRefusal, type UpgradeStore } from './upgrade';

/** This device's guest songbook, signed in or not: its songs can still be added to an account. */
export function guestUpgradeStore(): UpgradeStore {
    return {
        kind: 'guest',
        songs: async () => {
            // Paced: this read runs behind the songbook home, and must not freeze it.
            const { documents, unreadable } = await repository.listReadable(framePace());
            return { songs: documents, unreadable };
        },
        drafts: async () => {
            const { slots, unreadable } = repository.recoverySlots();
            return {
                drafts: slots.map((slot) => ({
                    documentId: slot.documentId,
                    writerId: slot.writerId,
                    capturedAt: slot.capturedAt,
                    document: slot.document,
                    stored: JSON.parse(slot.raw),
                    handle: slot,
                })),
                unreadable: unreadable.map(({ id, reason }) => ({ id, reason })),
            };
        },
        save: async (document, expected) => {
            // Re-checked at write time, as close to the Save as a guest songbook allows: a slot
            // another tab retained since the run read the drafts is unsaved work on this song. A
            // slot that will not read counts too — it is that song's bytes all the same. The
            // song keeps its `updatedAt`, so "live" here is the same comparison as `recoveryFor`.
            const readable = repository.recoveriesFor(document);
            if (
                readable.some((slot) => slot.capturedAt >= document.updatedAt) ||
                repository.recoverySlotCount(document.id) > readable.length
            ) {
                throw new UpgradeRefusal('unsaved');
            }
            try {
                await repository.save(document, expected, { keepUpdatedAt: true });
            } catch (failure) {
                if (failure instanceof repository.ConflictError) {
                    throw new UpgradeRefusal('elsewhere');
                }
                throw failure;
            }
        },
        replaceDraft: async (draft, next) =>
            repository.replaceRecoverySlot(draft.handle as repository.RecoverySlot, next),
    };
}

/**
 * The signed-in account's songbook on this device, fenced on `owner` like every account write.
 * Call only once the library has downloaded (`libraryDownloaded`): an upgrade of a copy older than
 * the account's would only be refused by the server's compare-and-swap.
 */
export function accountUpgradeStore(owner: string): UpgradeStore {
    return {
        kind: 'account',
        songs: async () => {
            // Paged and paced (`upgradeLibrary`), and a row that will not read is reported.
            const { songs, unreadable } = await accountSync.upgradeLibrary(owner, framePace());
            return {
                songs: songs.map(({ song, stored }) => ({ document: song.document, stored })),
                unreadable: unreadable.map(({ documentId, reason, document }) => ({
                    id: documentId,
                    reason,
                    stored: document,
                })),
            };
        },
        drafts: async () => {
            const { drafts, unreadable } = await accountSync.listDrafts(owner);
            return {
                drafts: drafts.map((draft) => ({
                    documentId: draft.documentId,
                    writerId: draft.writerId,
                    capturedAt: draft.capturedAt,
                    document: draft.document,
                    // Stored through `snapshot`, which the read applies again: the same document.
                    stored: draft.document,
                    handle: null,
                })),
                unreadable: unreadable.map(({ documentId, reason }) => ({
                    id: documentId,
                    reason,
                })),
            };
        },
        save: async (document, expected) => {
            try {
                await accountSync.save(document, expected, owner, { upgrade: true });
            } catch (failure) {
                if (failure instanceof UpgradeSaveRefused) {
                    throw new UpgradeRefusal(failure.reason);
                }
                if (failure instanceof LocalRevisionError) {
                    throw new UpgradeRefusal('elsewhere');
                }
                throw failure;
            }
        },
        replaceDraft: (draft, next) => accountSync.replaceDraft(draft, next, owner),
    };
}
