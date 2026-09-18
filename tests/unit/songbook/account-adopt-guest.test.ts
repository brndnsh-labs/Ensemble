import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    type AdoptCandidate,
    adoptGuestSongs,
    computeAdoptCandidates,
    hasDecidedAdoption,
    rememberAdoptionDecision,
} from '../../../prototypes/v2/lib/account/adopt-guest.js';
import { LocalRevisionError } from '../../../prototypes/v2/lib/sync/protocol.js';

/**
 * Copying guest songs into the account (#1268), tested at the level this file can reach without
 * a browser: WHICH ids get derived, WHICH candidates get offered, and how many Saves/passes a
 * copy issues. Real IDB compare-and-put behavior (what `AccountSongbook.save`'s caller-supplied
 * `operationId` actually does inside a transaction) is proven against real IndexedDB in
 * `tests/browser/account-songbook.browser.test.ts` — a mocked `accountSync` here would agree
 * with a wrong implementation as readily as a right one, so nothing here asserts about storage.
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
    vi.clearAllMocks();
});

describe('computeAdoptCandidates', () => {
    it('derives a deterministic account document id and operation id per guest song', async () => {
        list.mockResolvedValue([guestSong('a'), guestSong('b')]);
        listLibrary.mockResolvedValue([]);
        const first = await computeAdoptCandidates('owner-1');
        expect(first.map((c) => c.guestId)).toEqual(['a', 'b']);
        for (const candidate of first) {
            // The exact shape `identifier()` (`lib/sync/protocol.ts`) requires of both fields.
            expect(candidate.accountDocumentId).toMatch(/^guest-[a-f0-9]{64}$/);
            expect(candidate.operationId).toMatch(/^[a-f0-9]{64}$/);
            expect(candidate.document.id).toBe(candidate.accountDocumentId);
        }
        expect(first[0].accountDocumentId).not.toBe(first[1].accountDocumentId);
        expect(first[0].operationId).not.toBe(first[1].operationId);

        // Same owner, same guest songs, called again: identical ids — the whole point of
        // deriving them from identity alone rather than content or timestamps.
        const second = await computeAdoptCandidates('owner-1');
        expect(second.map((c) => c.accountDocumentId)).toEqual(
            first.map((c) => c.accountDocumentId),
        );
        expect(second.map((c) => c.operationId)).toEqual(first.map((c) => c.operationId));

        // A different owner on the same device gets different ids for the same guest song.
        const other = await computeAdoptCandidates('owner-2');
        expect(other[0].accountDocumentId).not.toBe(first[0].accountDocumentId);
    });

    it('filters out a guest song whose deterministic id is already in the account', async () => {
        list.mockResolvedValue([guestSong('a'), guestSong('b')]);
        listLibrary.mockResolvedValue([]);
        const initial = await computeAdoptCandidates('owner-1');
        const alreadyAdopted = initial.find((c) => c.guestId === 'a')!;

        listLibrary.mockResolvedValue([{ documentId: alreadyAdopted.accountDocumentId }]);
        const remaining = await computeAdoptCandidates('owner-1');
        expect(remaining.map((c) => c.guestId)).toEqual(['b']);
    });

    it('offers a guest starter the same as any other guest song', async () => {
        list.mockResolvedValue([guestSong('starter-blues')]);
        listLibrary.mockResolvedValue([]);
        const candidates = await computeAdoptCandidates('owner-1');
        expect(candidates).toHaveLength(1);
        expect(candidates[0].guestId).toBe('starter-blues');
    });
});

function candidate(guestId: string): AdoptCandidate {
    return {
        guestId,
        accountDocumentId: `guest-${guestId}`,
        operationId: `op-${guestId}`,
        document: guestSong(`guest-${guestId}`),
    };
}

describe('adoptGuestSongs', () => {
    it('commits every candidate as its own Save with its own operation id, then runs exactly one pass', async () => {
        save.mockResolvedValue({});
        const progress: Array<[number, number]> = [];
        const result = await adoptGuestSongs(
            [candidate('a'), candidate('b'), candidate('c')],
            (current, total) => progress.push([current, total]),
        );
        expect(result).toEqual({ adopted: 3, failures: [] });
        expect(save).toHaveBeenCalledTimes(3);
        // Every call is a create (`expected = null`) using that candidate's own operation id —
        // never a shared one, and never the loop's default random id.
        expect(save.mock.calls.map((call) => [call[1], call[2]])).toEqual([
            [null, 'op-a'],
            [null, 'op-b'],
            [null, 'op-c'],
        ]);
        expect(progress).toEqual([
            [1, 3],
            [2, 3],
            [3, 3],
        ]);
        // ONE pass for the whole batch, never one per song (#1268's explicit design constraint).
        expect(run).toHaveBeenCalledTimes(1);
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
