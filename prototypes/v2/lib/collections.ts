import { stripDangerousChars } from '../../../public/sanitize.js';
import { validateAnyChartDocument } from '../../../public/songbook/document-v2.js';
import type { ChartDocumentV2 } from '../../../public/songbook/score-types.js';
import type { ChartDocument as LegacyDocument } from '../../../public/songbook/types.js';

/**
 * A collection (#1474, decided on #1443): a named, ORDERED list of song ids that is its own
 * synced document — the second document kind beside a chart. An iReal playlist imports as one, a
 * set list is one, and the built-in "Starred" will be one (#1477).
 *
 * Imports are relative, never `@engine/*`, because `lib/sync/protocol.ts` decodes collections
 * with this module and the account API (`prototypes/v2-api`) bundles that file: one decoder for
 * the client and the server, exactly as the chart codec is shared.
 *
 * **The discriminator is `kind`, and a chart has none.** Every chart ever stored validates exactly
 * as before — the chart codecs allowlist their top-level keys, so a chart can never carry a
 * `kind` — and a document is a collection only when it says so. That is what keeps this kind
 * additive: no stored chart, request or reply changes shape.
 *
 * **A collection never owns its songs.** It holds ids, and an id that no longer resolves (the
 * song was deleted, or this device has not downloaded it yet) is filtered when the collection is
 * READ (`resolvedSongIds`), never rewritten out of the stored list: deleting a song never
 * rewrites a collection, and a list pruned against an incomplete library download would upload
 * the loss.
 */

export const COLLECTION_SCHEMA_VERSION = 1;
/** The account's whole document cap (`MAX_DOCUMENTS_PER_OWNER`): no list can be longer. */
export const MAX_COLLECTION_SONGS = 2_000;
/** The same bound a chart title has. */
export const MAX_COLLECTION_NAME = 200;
/** A chart id's own bound (`public/songbook/codec.ts`): a song id here names one. */
const MAX_ID_LENGTH = 128;
const MAX_TIMESTAMP_LENGTH = 64;

export type BuiltInCollection = 'starred';
const BUILT_IN: readonly BuiltInCollection[] = ['starred'];

export interface CollectionDocument {
    kind: 'collection';
    schemaVersion: 1;
    id: string;
    name: string;
    /**
     * The same local commit counter a chart's `revision` is: the compare-and-swap base of a Save
     * and the order of its queued operations. Not in #1474's drafted shape, which had no way to
     * order two queued Saves of one collection; a chart's whole Save machinery keys on it.
     */
    revision: number;
    createdAt: string;
    updatedAt: string;
    /** Ordered and unique. At most `MAX_COLLECTION_SONGS`. */
    songIds: string[];
    /** A collection the app owns and the musician cannot delete (#1443 decision 5). */
    builtIn?: BuiltInCollection;
}

export type ChartDocument = LegacyDocument | ChartDocumentV2;
/** Every synced document kind. A chart carries no `kind`; a collection carries `'collection'`. */
export type AnyDocument = ChartDocument | CollectionDocument;

/** The key set this build writes, in the order it writes them. Anything else is refused. */
const KEYS = [
    'kind',
    'schemaVersion',
    'id',
    'name',
    'revision',
    'createdAt',
    'updatedAt',
    'songIds',
    'builtIn',
] as const;

export type CollectionDecodeResult =
    | { kind: 'ok'; value: CollectionDocument }
    | { kind: 'future-version'; schemaVersion: number }
    | { kind: 'invalid'; issues: string[] };

function safeString(value: unknown, max: number): value is string {
    return (
        typeof value === 'string' &&
        value.length >= 1 &&
        value.length <= max &&
        value === stripDangerousChars(value)
    );
}

function timestamp(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length <= MAX_TIMESTAMP_LENGTH &&
        Number.isFinite(Date.parse(value))
    );
}

/** Can a collection hold this as a song id? The decoder's own rule, for a caller filtering input. */
export function isCollectionSongId(value: unknown): value is string {
    return safeString(value, MAX_ID_LENGTH);
}

/** Does this candidate claim to be a collection at all? A chart carries no `kind`. */
export function isCollectionCandidate(candidate: unknown): boolean {
    return (
        !!candidate &&
        typeof candidate === 'object' &&
        !Array.isArray(candidate) &&
        Object.hasOwn(candidate, 'kind')
    );
}

/**
 * Decode one collection, deny by default. The result is REBUILT in `KEYS` order from validated
 * fields only, so it shares no reference with the input and serializes to one byte sequence per
 * logical collection — the property the Save request's canonical-bytes check relies on (the v1
 * chart codec rebuilds for the same reason).
 */
export function decodeCollection(candidate: unknown): CollectionDecodeResult {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return { kind: 'invalid', issues: ['A collection must be an object.'] };
    }
    if (Object.getPrototypeOf(candidate) !== Object.prototype) {
        return { kind: 'invalid', issues: ['A collection must be a plain object.'] };
    }
    const record = candidate as Record<string, unknown>;
    if (record.kind !== 'collection') {
        return { kind: 'invalid', issues: ['Not a collection.'] };
    }
    const version = record.schemaVersion;
    if (Number.isSafeInteger(version) && (version as number) > COLLECTION_SCHEMA_VERSION) {
        return { kind: 'future-version', schemaVersion: version as number };
    }
    const issues: string[] = [];
    for (const key of Object.keys(record)) {
        if (!(KEYS as readonly string[]).includes(key)) {
            issues.push(`Unknown collection field: ${key.slice(0, 40)}.`);
        }
    }
    if (version !== COLLECTION_SCHEMA_VERSION) {
        issues.push('Unsupported collection schema version.');
    }
    if (!safeString(record.id, MAX_ID_LENGTH)) {
        issues.push('Invalid collection id.');
    }
    if (!safeString(record.name, MAX_COLLECTION_NAME)) {
        issues.push('Invalid collection name.');
    }
    if (!Number.isSafeInteger(record.revision) || (record.revision as number) < 0) {
        issues.push('Invalid collection revision.');
    }
    if (!timestamp(record.createdAt) || !timestamp(record.updatedAt)) {
        issues.push('Invalid collection timestamp.');
    }
    if (record.builtIn !== undefined && !BUILT_IN.includes(record.builtIn as BuiltInCollection)) {
        issues.push('Unknown built-in collection.');
    }
    const songIds = record.songIds;
    if (!Array.isArray(songIds) || songIds.length > MAX_COLLECTION_SONGS) {
        issues.push(`A collection holds an array of at most ${MAX_COLLECTION_SONGS} song ids.`);
    } else {
        const seen = new Set<string>();
        for (const id of songIds) {
            if (!safeString(id, MAX_ID_LENGTH)) {
                issues.push('Invalid song id in collection.');
                break;
            }
            if (seen.has(id)) {
                issues.push('A song appears twice in one collection.');
                break;
            }
            seen.add(id);
        }
    }
    if (issues.length > 0) {
        return { kind: 'invalid', issues };
    }
    return {
        kind: 'ok',
        value: {
            kind: 'collection',
            schemaVersion: COLLECTION_SCHEMA_VERSION,
            id: record.id as string,
            name: record.name as string,
            revision: record.revision as number,
            createdAt: record.createdAt as string,
            updatedAt: record.updatedAt as string,
            songIds: [...(songIds as string[])],
            ...(record.builtIn === undefined
                ? {}
                : { builtIn: record.builtIn as BuiltInCollection }),
        },
    };
}

/** `decodeCollection`, throwing the sentence a caller shows — `validateDocument`'s posture. */
export function validateCollection(candidate: unknown): CollectionDocument {
    const result = decodeCollection(candidate);
    if (result.kind !== 'ok') {
        const reason =
            result.kind === 'future-version'
                ? 'a newer collection version'
                : result.issues.join(' ');
        throw new Error(`Cannot open this collection: ${reason} The source has not been changed.`);
    }
    return result.value;
}

/**
 * The one dispatch every reader of "any synced document" goes through: a candidate that carries
 * `kind` is a collection (or refused), and one that does not is a chart, through the chart codec
 * exactly as before this kind existed.
 */
export function validateAnyDocument(candidate: unknown): AnyDocument {
    if (isCollectionCandidate(candidate)) {
        return validateCollection(candidate);
    }
    const result = validateAnyChartDocument(candidate);
    if (result.kind !== 'ok') {
        throw new Error('Cannot open this document. The source has not been changed.');
    }
    return result.value;
}

export function isCollection(document: AnyDocument): document is CollectionDocument {
    return (document as { kind?: unknown }).kind === 'collection';
}

/**
 * The collection's songs that still resolve, in its own order. A read-time view only: the stored
 * `songIds` stay as they are, so a song that comes back (a download that had not landed yet, an
 * undo) is still in the list, and nothing rewrites a collection behind the musician's back.
 */
export function resolvedSongIds(
    document: CollectionDocument,
    exists: (songId: string) => boolean,
): string[] {
    return document.songIds.filter((id) => exists(id));
}

/** A new, empty collection. Not yet saved; `revision` 0 is the create's own. */
export function newCollection(name: string, songIds: string[] = []): CollectionDocument {
    const now = new Date().toISOString();
    return validateCollection({
        kind: 'collection',
        schemaVersion: COLLECTION_SCHEMA_VERSION,
        id: crypto.randomUUID(),
        name,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        songIds,
    });
}

/**
 * A built-in collection asked to do what only a user collection may (#1477 review R2): be deleted,
 * renamed, lose its built-in mark — or a user collection asked to become one. Refused by STORAGE,
 * not just by the UI, because a deleted Starred is a tombstone on its fixed id: every device's
 * next lazy create of it would then meet `remote: null`, and Starred would split.
 */
export class BuiltInCollectionError extends Error {
    constructor(action: 'deleted' | 'changed') {
        super(
            action === 'deleted'
                ? 'Starred is built in and can’t be deleted.'
                : 'Starred is built in: it can’t be renamed, and no other collection can become it.',
        );
    }
}

/** Throws `BuiltInCollectionError` when `next` would rename or un-mark a built-in, or mint one. */
export function assertBuiltInKept(
    previous: CollectionDocument | null,
    next: CollectionDocument,
): void {
    if (previous === null) {
        return;
    }
    if (previous.builtIn !== next.builtIn || (previous.builtIn && previous.name !== next.name)) {
        throw new BuiltInCollectionError('changed');
    }
}

/**
 * The built-in Starred collection's id (#1477), the same in every songbook — guest and account
 * alike. Fixed rather than minted, because Starred is created LAZILY on whichever device stars a
 * song first: two devices that each star offline both create THIS id, so the second Save meets the
 * first as an ordinary revision conflict that `mergeSongIds` resolves
 * (`AccountSongbook.mergeCollectionConflicts`). Two random ids would be two Starred collections
 * forever. Document ids are unique per owner, never across owners, so one constant serves all.
 */
export const STARRED_COLLECTION_ID = 'collection-starred';
export const STARRED_NAME = 'Starred';

/** A new, unsaved Starred collection holding these songs, at its fixed id. */
export function newStarred(songIds: string[]): CollectionDocument {
    return {
        ...newCollection(STARRED_NAME, songIds),
        id: STARRED_COLLECTION_ID,
        builtIn: 'starred',
    };
}

/**
 * The Starred collection among these, or null when none exists yet — it is created on the first
 * star, never before (#1477: an account at the document cap must not be handed a Save it cannot
 * take). The fixed id wins; any other built-in Starred — one a `'gone'` conflict re-created under
 * a fresh id (`AccountSongbook.mergeCollectionConflicts`) — is the fallback.
 */
export function starredOf<T extends { document: CollectionDocument }>(
    collections: readonly T[],
): T | null {
    return (
        collections.find((entry) => entry.document.id === STARRED_COLLECTION_ID) ??
        collections.find((entry) => entry.document.builtIn === 'starred') ??
        null
    );
}

/**
 * The merge a conflicted collection Save resolves by (#1477, decided on #1443): the union of the
 * two lists — this device's own order first, then the ids only the other side has, in ITS order.
 * It never asks and never drops a song either side holds: for Starred that is always right (a star
 * made on either device survives), and for a user collection it never loses a song. The one thing
 * a union cannot keep is a REMOVAL made on one side while the other still held the id — that song
 * comes back, the cheaper of the two mistakes.
 *
 * **The cap (#1477 review R7).** A collection holds at most `MAX_COLLECTION_SONGS` ids, so a union
 * of two full lists must drop some. What is dropped is deterministic: every local id is kept in
 * its order, then remote-only ids in THEIR order until the cap, so two devices merging the same
 * pair agree on the result. Dropping ids of songs known to be DELETED before live ones would be
 * better, but this device cannot tell them apart cheaply: a downloaded tombstone removes the song
 * record and leaves no local trace, so a deleted song looks exactly like one that has not
 * downloaded yet, and pruning on "does not resolve here" would throw live songs away on a fresh
 * device. The cap is hard to reach in practice: the account holds at most 2,000 documents in all,
 * collections included, so a union past 2,000 ids is mostly dead ids already.
 */
export function mergeSongIds(local: readonly string[], remote: readonly string[]): string[] {
    const merged = [...local];
    const seen = new Set(local);
    for (const id of remote) {
        if (!seen.has(id)) {
            seen.add(id);
            merged.push(id);
        }
    }
    return merged.slice(0, MAX_COLLECTION_SONGS);
}

/**
 * This collection with one song added at the end, or removed — null when that changes nothing,
 * so a caller queues no Save for a star that is already a star. Adding past the cap throws the
 * sentence a musician reads.
 */
export function withSong(
    document: CollectionDocument,
    songId: string,
    present: boolean,
): CollectionDocument | null {
    const has = document.songIds.includes(songId);
    if (has === present) {
        return null;
    }
    if (present && document.songIds.length >= MAX_COLLECTION_SONGS) {
        throw new Error(
            `“${document.name}” already holds ${MAX_COLLECTION_SONGS} songs, the most a collection can.`,
        );
    }
    return {
        ...document,
        songIds: present
            ? [...document.songIds, songId]
            : document.songIds.filter((id) => id !== songId),
    };
}

/**
 * The songs in `collectionId` that are in no OTHER collection — what a collection delete's
 * "also delete the N songs that are in no other collection" option would remove (#1443 decision
 * 3). Starred counts as another collection: a starred song is kept. Only songs that resolve are
 * candidates (`resolved`), in the collection's own order.
 */
export function songsOnlyIn(
    collectionId: string,
    collections: ReadonlyArray<{ document: CollectionDocument; resolvedSongIds: string[] }>,
): string[] {
    const target = collections.find((entry) => entry.document.id === collectionId);
    if (!target) {
        return [];
    }
    const elsewhere = new Set(
        collections
            .filter((entry) => entry.document.id !== collectionId)
            .flatMap((entry) => entry.document.songIds),
    );
    return target.resolvedSongIds.filter((id) => !elsewhere.has(id));
}
