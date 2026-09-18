import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    type AdoptCandidate,
    adoptGuestSongs,
    computeAdoptCandidates,
    hasDecidedAdoption,
    libraryDownloaded,
    rememberAdoptionDecision,
} from '../../../prototypes/v2/lib/account/adopt-guest.js';
import { LocalRevisionError } from '../../../prototypes/v2/lib/sync/protocol.js';
import { MAX_REMOTE_CANDIDATES } from '../../../prototypes/v2/lib/sync/repository.js';

/**
 * Copying guest songs into the account (#1268), tested at the level this file can reach without
 * a browser: WHICH ids get derived, WHICH candidates get offered, and how many Saves/passes a
 * copy issues. Real IDB compare-and-put behavior (the local refusal to recreate a document id the
 * store already holds, which is what makes a rerun land on exactly N songs) is proven against real
 * IndexedDB in `tests/browser/account-songbook.browser.test.ts` — a mocked `accountSync` here
 * would agree with a wrong implementation as readily as a right one, so nothing here asserts
 * about storage.
 */

const { listLibrary, save, run, list } = vi.hoisted(() => ({
    listLibrary: vi.fn(),
    save: vi.fn(),
    run: vi.fn(),
    list: vi.fn(),
}));

vi.mock('../../../prototypes/v2/lib/account/sync-loop.js', () => ({
    accountSync: { listLibrary, save, run },
}));

vi.mock('../../../prototypes/v2/lib/repository.js', () => ({ list }));

function guestSong(id: string) {
    return {
        schemaVersion: 1 as const,
        id,
        title: `Song ${id}`,
        revision: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        chart: {} as never,
    };
}

beforeEach(() => {
    // `reset`, not `clear`: one test below installs a `mockImplementation` on `save` to log write
    // ORDER, and `clearAllMocks` leaves an implementation in place for every later test.
    vi.resetAllMocks();
});

describe('computeAdoptCandidates', () => {
    it('derives a deterministic account document id per guest song, and no operation id at all', async () => {
        list.mockResolvedValue([guestSong('a'), guestSong('b')]);
        listLibrary.mockResolvedValue([]);
        const { candidates: first } = await computeAdoptCandidates('owner-1');
        expect(first.map((c) => c.guestId)).toEqual(['a', 'b']);
        for (const candidate of first) {
            // The exact shape `identifier()` (`lib/sync/protocol.ts`) requires of a document id.
            expect(candidate.accountDocumentId).toMatch(/^guest-[a-f0-9]{64}$/);
            expect(candidate.document.id).toBe(candidate.accountDocumentId);
            // The operation id is NOT derived here (patch review P0): a deterministic operation id
            // beside a deterministic document id earns a permanent `operation_mismatch` from a
            // second device, because `save()` restamps `updatedAt` and receipts replay only an
            // exact byte match. `AccountSongbook.save` mints a fresh one per attempt instead.
            expect(candidate).not.toHaveProperty('operationId');
        }
        expect(first[0].accountDocumentId).not.toBe(first[1].accountDocumentId);

        // Same owner, same guest songs, called again: identical ids — the whole point of
        // deriving them from identity alone rather than content or timestamps.
        const { candidates: second } = await computeAdoptCandidates('owner-1');
        expect(second.map((c) => c.accountDocumentId)).toEqual(
            first.map((c) => c.accountDocumentId),
        );

        // A different owner on the same device gets different ids for the same guest song.
        const { candidates: other } = await computeAdoptCandidates('owner-2');
        expect(other[0].accountDocumentId).not.toBe(first[0].accountDocumentId);
    });

    it('filters out a guest song whose deterministic id is already in the account', async () => {
        list.mockResolvedValue([guestSong('a'), guestSong('b')]);
        listLibrary.mockResolvedValue([]);
        const initial = await computeAdoptCandidates('owner-1');
        const alreadyAdopted = initial.candidates.find((c) => c.guestId === 'a')!;

        listLibrary.mockResolvedValue([{ documentId: alreadyAdopted.accountDocumentId }]);
        const remaining = await computeAdoptCandidates('owner-1');
        expect(remaining.candidates.map((c) => c.guestId)).toEqual(['b']);
        expect(remaining.omitted).toBe(0);
    });

    it('offers a guest starter the same as any other guest song', async () => {
        list.mockResolvedValue([guestSong('starter-blues')]);
        listLibrary.mockResolvedValue([]);
        const { candidates } = await computeAdoptCandidates('owner-1');
        expect(candidates).toHaveLength(1);
        expect(candidates[0].guestId).toBe('starter-blues');
    });

    it('offers only what the account has room for, rather than queueing Saves the cap will refuse', async () => {
        // One slot left under the server's per-owner document cap, three guest songs wanting it.
        // A `quota_exceeded` refusal is ACCOUNT-WIDE: it ends the whole outbox pass, so the two
        // that do not fit would stall every song queued behind them too.
        list.mockResolvedValue([guestSong('a'), guestSong('b'), guestSong('c')]);
        listLibrary.mockResolvedValue(
            Array.from({ length: MAX_REMOTE_CANDIDATES - 1 }, (_, index) => ({
                documentId: `held-${index}`,
            })),
        );
        const offer = await computeAdoptCandidates('owner-1');
        expect(offer.room).toBe(1);
        expect(offer.candidates.map((c) => c.guestId)).toEqual(['a']);
        expect(offer.omitted).toBe(2);
    });

    it('offers nothing at all, and says how many it left out, when the account is already full', async () => {
        list.mockResolvedValue([guestSong('a')]);
        listLibrary.mockResolvedValue(
            Array.from({ length: MAX_REMOTE_CANDIDATES }, (_, index) => ({
                documentId: `held-${index}`,
            })),
        );
        const offer = await computeAdoptCandidates('owner-1');
        // Not the same as "nothing new to add": the dialog has its own sentence for a full
        // account, and `omitted` is what tells it apart from an already-adopted library.
        expect(offer).toMatchObject({ candidates: [], omitted: 1, room: 0 });
    });
});

describe('libraryDownloaded', () => {
    it('is false until both halves of the manifest progress are observed', () => {
        // `attach()` publishes `UNOBSERVED`, and a partially paged manifest leaves one half null.
        expect(libraryDownloaded({ required: null, verified: null })).toBe(false);
        expect(libraryDownloaded({ required: 3, verified: null })).toBe(false);
        expect(libraryDownloaded({ required: null, verified: 3 })).toBe(false);
        // A genuinely empty account library is still an ANSWER, so the offer may be computed.
        expect(libraryDownloaded({ required: 0, verified: 0 })).toBe(true);
        expect(libraryDownloaded({ required: 3, verified: 3 })).toBe(true);
    });
});

function candidate(guestId: string): AdoptCandidate {
    return {
        guestId,
        accountDocumentId: `guest-${guestId}`,
        document: guestSong(`guest-${guestId}`),
    };
}

describe('adoptGuestSongs', () => {
    it('commits every candidate as a create, reports progress after each write, then runs exactly one pass', async () => {
        // One log for both, so the ORDER is what is asserted: a count published before the write
        // claims a Save that has not happened yet (patch review P3-6b).
        const log: string[] = [];
        save.mockImplementation(async (document: { id: string }) => {
            log.push(`save:${document.id}`);
            return {};
        });
        const result = await adoptGuestSongs(
            [candidate('a'), candidate('b'), candidate('c')],
            (copied, total) => log.push(`copied:${copied}/${total}`),
        );
        expect(result).toEqual({ adopted: 3, failures: [] });
        expect(log).toEqual([
            'save:guest-a',
            'copied:1/3',
            'save:guest-b',
            'copied:2/3',
            'save:guest-c',
            'copied:3/3',
        ]);
        // Every call is a create (`expected = null`) and passes NO operation id: the store mints a
        // fresh one per attempt, which is the patch review's P0 fix.
        expect(save.mock.calls.map((call) => call.slice(1))).toEqual([[null], [null], [null]]);
        // ONE pass for the whole batch, never one per song (#1268's explicit design constraint).
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('counts only songs actually copied, so a failure does not inflate the progress line', async () => {
        save.mockRejectedValueOnce(new Error('storage exploded')).mockResolvedValueOnce({});
        const progress: string[] = [];
        await adoptGuestSongs([candidate('a'), candidate('b')], (copied, total) =>
            progress.push(`${copied}/${total}`),
        );
        expect(progress).toEqual(['0/2', '1/2']);
    });

    it('treats a LocalRevisionError as already adopted, not a failure — the retry-safety case', async () => {
        save.mockRejectedValueOnce(new LocalRevisionError());
        const result = await adoptGuestSongs([candidate('a')]);
        expect(result).toEqual({ adopted: 1, failures: [] });
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('reports a genuine failure without abandoning the remaining candidates', async () => {
        save.mockRejectedValueOnce(new Error('storage exploded')).mockResolvedValueOnce({});
        const result = await adoptGuestSongs([candidate('a'), candidate('b')]);
        expect(result.adopted).toBe(1);
        expect(result.failures).toEqual([{ guestId: 'a', message: 'storage exploded' }]);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('never sends when nothing was adopted', async () => {
        save.mockRejectedValue(new Error('nope'));
        const result = await adoptGuestSongs([candidate('a')]);
        expect(result).toEqual({
            adopted: 0,
            failures: [{ guestId: 'a', message: 'nope' }],
        });
        expect(run).not.toHaveBeenCalled();
    });
});

/**
 * Node/happy-dom has no `localStorage` at all, same fact `account-feature.test.ts` documents —
 * which is exactly why both accessors here are wrapped in try/catch, proven the same way.
 */
function withStorage(store: Map<string, string>, options: { throws?: boolean } = {}) {
    const fake = {
        getItem: (key: string) => {
            if (options.throws) {
                throw new Error('storage is blocked');
            }
            return store.get(key) ?? null;
        },
        setItem: (key: string, value: string) => {
            if (options.throws) {
                throw new Error('storage is blocked');
            }
            store.set(key, value);
        },
    };
    vi.stubGlobal('localStorage', fake as unknown as Storage);
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('hasDecidedAdoption / rememberAdoptionDecision', () => {
    it('is undecided until remembered, and remembers per owner', () => {
        const store = new Map<string, string>();
        withStorage(store);
        expect(hasDecidedAdoption('owner-1')).toBe(false);
        rememberAdoptionDecision('owner-1');
        expect(hasDecidedAdoption('owner-1')).toBe(true);
        // A second owner signing into the same device is asked its own once (S3: one account per
        // profile, but a device can still see a different owner across a sign-out/sign-in).
        expect(hasDecidedAdoption('owner-2')).toBe(false);
    });

    it('defaults to "already decided" (do not nag) when storage is unreadable', () => {
        withStorage(new Map(), { throws: true });
        expect(hasDecidedAdoption('owner-1')).toBe(true);
        expect(() => rememberAdoptionDecision('owner-1')).not.toThrow();
    });
});
