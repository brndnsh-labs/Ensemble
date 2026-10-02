/**
 * The collection document (#1474): its decoder, the any-document dispatch, the read-time song
 * filter, and the Save request path a collection travels — the pure halves. What a collection
 * does in storage is proven against real IndexedDB in
 * `tests/browser/account-collections.browser.test.ts`, and on the server in
 * `prototypes/v2-api/test/http/documents-collections.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { accountChart } from '../../../tests/utils/account-songbook-fixture';
import {
    type CollectionDocument,
    decodeCollection,
    MAX_COLLECTION_SONGS,
    newCollection,
    resolvedSongIds,
    validateAnyDocument,
    validateCollection,
} from './collections';
import { planLibraryDownload } from './sync/download';
import { collectionSnapshot, digest, syncDocument } from './sync/protocol';
import { decodeSaveRequest } from './sync/request';

function collection(overrides: Record<string, unknown> = {}): CollectionDocument {
    return {
        kind: 'collection',
        schemaVersion: 1,
        id: 'set-1',
        name: 'Friday gig',
        revision: 2,
        createdAt: '2026-10-01T12:00:00.000Z',
        updatedAt: '2026-10-01T12:30:00.000Z',
        songIds: ['song-b', 'song-a'],
        ...overrides,
    } as CollectionDocument;
}

describe('decodeCollection', () => {
    it('accepts a collection and rebuilds it in one field order, detached from its input', () => {
        const shuffled = {
            songIds: ['song-b', 'song-a'],
            name: 'Friday gig',
            updatedAt: '2026-10-01T12:30:00.000Z',
            id: 'set-1',
            createdAt: '2026-10-01T12:00:00.000Z',
            revision: 2,
            schemaVersion: 1,
            kind: 'collection',
        };
        const result = decodeCollection(shuffled);
        expect(result.kind).toBe('ok');
        const value = (result as { value: CollectionDocument }).value;
        expect(JSON.stringify(value)).toBe(JSON.stringify(collection()));
        shuffled.songIds.push('song-c');
        expect(value.songIds).toEqual(['song-b', 'song-a']);
    });

    it('keeps the order of its songs, which is the point of a set list', () => {
        expect(validateCollection(collection({ songIds: ['z', 'a', 'm'] })).songIds).toEqual([
            'z',
            'a',
            'm',
        ]);
    });

    it('accepts the built-in Starred marker and nothing else there', () => {
        expect(validateCollection(collection({ builtIn: 'starred' })).builtIn).toBe('starred');
        expect(decodeCollection(collection({ builtIn: 'favourites' })).kind).toBe('invalid');
    });

    it.each([
        ['an unknown field', { title: 'x' }],
        ['a missing name', { name: undefined }],
        ['an empty name', { name: '' }],
        ['an unsafe name', { name: '<script>' }],
        ['a duplicated song', { songIds: ['a', 'a'] }],
        ['a non-string song id', { songIds: [3] }],
        ['songs that are not an array', { songIds: 'a,b' }],
        ['a negative revision', { revision: -1 }],
        ['an unparseable timestamp', { updatedAt: 'yesterday' }],
        ['another kind', { kind: 'playlist' }],
    ])('refuses %s', (_label, overrides) => {
        expect(decodeCollection(collection(overrides)).kind).toBe('invalid');
    });

    it('bounds a collection at the account’s whole document cap', () => {
        const ids = (count: number) => Array.from({ length: count }, (_, i) => `song-${i}`);
        expect(decodeCollection(collection({ songIds: ids(MAX_COLLECTION_SONGS) })).kind).toBe(
            'ok',
        );
        expect(decodeCollection(collection({ songIds: ids(MAX_COLLECTION_SONGS + 1) })).kind).toBe(
            'invalid',
        );
    });

    it('reports a newer schema as a future version, not as corrupt', () => {
        expect(decodeCollection(collection({ schemaVersion: 2, extra: true }))).toEqual({
            kind: 'future-version',
            schemaVersion: 2,
        });
    });

    it('mints a valid new collection at revision 0', () => {
        const created = newCollection('Set list', ['a']);
        expect(validateCollection(created)).toEqual(created);
        expect(created.revision).toBe(0);
    });
});

describe('validateAnyDocument — one dispatch on `kind`', () => {
    it('reads a chart, which carries no kind, exactly as the chart codec does', () => {
        const chart = accountChart('A', 'study');
        expect(validateAnyDocument(chart)).toEqual(syncDocument(chart));
        expect('kind' in validateAnyDocument(chart)).toBe(false);
    });

    it('reads a collection as a collection', () => {
        expect(validateAnyDocument(collection())).toEqual(collection());
    });

    it('refuses a chart that claims a kind, and a kind it does not know', () => {
        expect(() => validateAnyDocument({ ...accountChart(), kind: 'chart' })).toThrow();
        expect(() => validateAnyDocument({ kind: 'playlist' })).toThrow();
    });
});

describe('resolvedSongIds — a read-time view, never a rewrite', () => {
    it('drops the ids that do not resolve and keeps the rest in order', () => {
        const document = collection({ songIds: ['c', 'gone', 'a'] });
        expect(resolvedSongIds(document, (id) => id !== 'gone')).toEqual(['c', 'a']);
        expect(document.songIds).toEqual(['c', 'gone', 'a']);
    });
});

describe('the account’s narrower rule', () => {
    it('requires every id inside an account collection to be a sync identifier', () => {
        expect(collectionSnapshot(collection())).toEqual(collection());
        // A guest chart id may hold a space; an account one never does, so it cannot resolve.
        expect(() => collectionSnapshot(collection({ songIds: ['has space'] }))).toThrow();
        expect(() => collectionSnapshot(collection({ id: 'set:1' }))).toThrow();
    });
});

describe('the Save request a collection travels in', () => {
    function wire(document: unknown, owner = 'owner-a'): string {
        return JSON.stringify({
            protocolVersion: 1,
            ownerId: owner,
            documentId: 'set-1',
            operationId: 'op-1',
            expectedRevision: null,
            document,
        });
    }

    it('decodes the canonical bytes and digests exactly what arrived', async () => {
        const body = wire(syncDocument(collection()));
        const decoded = await decodeSaveRequest(body, 'owner-a');
        expect(decoded.document).toEqual(collection());
        expect(decoded.digest).toBe(await digest(body));
    });

    it('refuses a key-shuffled collection: one byte sequence per logical collection', async () => {
        const { kind, ...rest } = collection();
        await expect(decodeSaveRequest(wire({ ...rest, kind }), 'owner-a')).rejects.toThrow(
            'canonical',
        );
    });

    it('names a bad collection as a collection, never echoing its content', async () => {
        await expect(
            decodeSaveRequest(wire(collection({ songIds: ['dup', 'dup'] })), 'owner-a'),
        ).rejects.toThrow('not a supported collection');
    });
});

describe('planLibraryDownload with collections', () => {
    it('diffs a collection row only against collections, and counts only songs', () => {
        const plan = planLibraryDownload(
            [
                { documentId: 'a', revision: 'r1', deleted: false, bytes: 1, kind: 'collection' },
                { documentId: 'b', revision: 'r1', deleted: false, bytes: 1 },
                { documentId: 'c', revision: 'r2', deleted: false, bytes: 1, kind: 'collection' },
                { documentId: 'd', revision: 'r1', deleted: true, bytes: 0 },
                { documentId: 'e', revision: 'r1', deleted: false, bytes: 1, kind: 'future' },
            ],
            [
                {
                    documentId: 'c',
                    saved: true,
                    remoteRevision: 'r1',
                    quarantinedRevision: null,
                    kind: 'collection',
                },
                {
                    documentId: 'd',
                    saved: true,
                    remoteRevision: 'r1',
                    quarantinedRevision: null,
                    kind: 'collection',
                },
            ],
        );
        expect(plan.fetch).toEqual([
            {
                documentId: 'a',
                revision: 'r1',
                expectedRemoteRevision: undefined,
                kind: 'collection',
            },
            { documentId: 'b', revision: 'r1', expectedRemoteRevision: undefined },
            { documentId: 'c', revision: 'r2', expectedRemoteRevision: 'r1', kind: 'collection' },
        ]);
        expect(plan.tombstone).toEqual([
            { documentId: 'd', revision: 'r1', expectedRemoteRevision: 'r1', kind: 'collection' },
        ]);
        expect(plan.unchanged).toEqual(['e']);
        expect(plan.documents).toEqual({ required: 1, mirrored: 0 });
    });
});
