/**
 * The two songbooks as "Upgrade old songs" (#1738) sees them: each store's ORDINARY paths, adapted
 * to `UpgradeStore` (`lib/upgrade.ts`) and nothing more. A song is written by the guest
 * repository's own `save` or by the account's own Save (`accountSync.save`, which commits and
 * queues one outbox operation compare-and-swapped on its base revision); a draft is rewritten only
 * by the store's own in-place rewrite. No write here has a path of its own.
 */
import { accountSync } from './account/sync-loop';
import { framePace } from './playlist-import';
import * as repository from './repository';
import type { UpgradeStore } from './upgrade';

export const ACCOUNT_UPGRADE_BLOCKS = {
    refused:
        'Your account refused its last Save. Open it and resolve that first (Keep both), then upgrade again.',
    waiting:
        'Your account has a newer version of it waiting. Open it and choose which to keep first.',
} as const;

/** This device's guest songbook, signed in or not: its songs can still be added to an account. */
export function guestUpgradeStore(): UpgradeStore {
    return {
        kind: 'guest',
        // Paced: this read runs behind the songbook home, and must not freeze it.
        songs: () => repository.listReadable(framePace()),
        drafts: async () => {
            const { slots, unreadable } = repository.recoverySlots();
            return {
                drafts: slots.map((slot) => ({
                    documentId: slot.documentId,
                    writerId: slot.writerId,
                    capturedAt: slot.capturedAt,
                    document: slot.document,
                    handle: slot,
                })),
                unreadable,
            };
        },
        // A guest song has no outbox; another tab's Save is the compare-and-swap's to catch.
        blocked: async () => null,
        save: async (document, expected) => {
            await repository.save(document, expected);
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
        songs: async () => ({
            documents: (await accountSync.listLibrary(owner)).map((song) => song.document),
            unreadable: 0,
        }),
        drafts: async () => {
            const { drafts, unreadable } = await accountSync.listDrafts(owner);
            return {
                drafts: drafts.map((draft) => ({
                    documentId: draft.documentId,
                    writerId: draft.writerId,
                    capturedAt: draft.capturedAt,
                    document: draft.document,
                    handle: null,
                })),
                unreadable,
            };
        },
        blocked: async (documentId) => {
            // A refused head is terminal until Keep both, and a fresh Save would RETIRE it
            // (`AccountSongbook.save`): that is the musician's call, never the upgrade's.
            const head = await accountSync.saveQueue(documentId, owner);
            if (head === 'conflict' || head === 'refused') {
                return ACCOUNT_UPGRADE_BLOCKS.refused;
            }
            if (
                accountSync
                    .getSnapshot()
                    .candidates.some((candidate) => candidate.documentId === documentId)
            ) {
                return ACCOUNT_UPGRADE_BLOCKS.waiting;
            }
            return null;
        },
        save: async (document, expected) => {
            await accountSync.save(document, expected, owner);
        },
        replaceDraft: async (draft, next) =>
            (await accountSync.replaceDraft(draft, next, owner)) === 'replaced',
    };
}
