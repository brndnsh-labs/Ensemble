import { stripDangerousChars } from '@engine/sanitize';
import type { IRealImportResult } from '@engine/songbook/ireal-import';
import type { ChartDocumentV2 } from '@engine/songbook/score-types';
import {
    type CollectionDocument,
    MAX_COLLECTION_NAME,
    MAX_COLLECTION_SONGS,
    mergeSongIds,
    newCollection,
} from './collections';
import { type ChartDocument, composerOf } from './documents';
import { importedDocument } from './import-document';

/**
 * A whole iReal playlist imported as a collection (#1478, decided on #1443): the songs in playlist
 * order, then one collection named after the playlist holding them. Pure — nothing here reads or
 * writes storage. The dialog (`app/import-dialog.tsx`) shows a `PlaylistImport` as its summary
 * BEFORE anything is written, and the shell hands the same object to a songbook's one batched
 * write (`repository.importSongs`, `AccountSongbook.importPlaylist`).
 *
 * The rules, each decided on #1443:
 * - **Duplicates** are a song whose title and composer both match one already in the songbook, or
 *   an earlier song in the same playlist — case- and whitespace-insensitive (`songKey`). They are
 *   skipped by default; `includeDuplicates` imports them as new copies. A skipped duplicate is not
 *   dropped from the COLLECTION: the collection names the copy the songbook already holds, in its
 *   playlist position, so the collection is still the playlist.
 * - **Refused** songs — ones the importer cannot build, or a score the band cannot play yet — are
 *   skipped and listed with their own diagnostics. A refused song is never half-imported.
 * - **The account cap** is checked against everything the import would add (`capRefusal` in
 *   `lib/sync/repository.ts`), and a refusal writes nothing at all. A guest songbook has no cap.
 * - **The collection** is named after the playlist; when a user collection of that name already
 *   exists (case- and whitespace-insensitive, never the built-in Starred), the import ADDS to it
 *   rather than making a second one.
 */

/** One playlist entry as the import plan sees it. */
export interface PlaylistEntry {
    /** Its position in the playlist. */
    index: number;
    title: string;
    composer: string;
    /** The document it would import as; absent when the song is refused. */
    document?: ChartDocumentV2;
    /** Why it cannot be imported — the importer's own diagnostics. Empty when it can. */
    reasons: string[];
}

export interface PlaylistPlan {
    /** The playlist's own name, when the export carries a usable one. */
    playlistName: string | null;
    entries: PlaylistEntry[];
}

export interface PlanStepOptions {
    /** True when this slice has run long enough to hand the event loop back (the caller's clock). */
    shouldYield: () => boolean;
    yieldNow: () => Promise<void>;
    onProgress?: (done: number, total: number) => void;
    cancelled?: () => boolean;
}

/** The default collection name when a playlist carries none (the musician can edit it). */
export const DEFAULT_PLAYLIST_NAME = 'iReal playlist';

/**
 * Build every song's document, in slices (#1478): building and checking Jazz 1460's 1,460 tunes
 * took 2.1-4.3 s in one go on a desktop (Node, Chromium, WebKit), so this hands the event loop
 * back as the parse does. Each document is built exactly as a single-song import builds it (`importedDocument`,
 * including its playability check), except that it keeps its OWN source link rather than the whole
 * playlist. `bpm` is a placeholder — the tempo is chosen when the import is written
 * (`resolvePlaylistImport`). Null when `cancelled` said so.
 */
export async function planPlaylist(
    result: IRealImportResult,
    base: ChartDocument,
    options: PlanStepOptions,
): Promise<PlaylistPlan | null> {
    const entries: PlaylistEntry[] = [];
    const playlistErrors = result.diagnostics.filter((d) => d.severity === 'error');
    for (const [index, song] of result.songs.entries()) {
        const entry: PlaylistEntry = {
            index,
            title: song.title,
            composer: song.composer ?? '',
            reasons: [],
        };
        const errors = [...playlistErrors, ...song.diagnostics].filter(
            (d) => d.severity === 'error',
        );
        if (errors.length > 0 || !song.score) {
            entry.reasons = errors.length
                ? errors.map((d) => d.message)
                : ['The iReal chart could not be interpreted safely.'];
        } else {
            try {
                entry.document = importedDocument(result, index, base, PLACEHOLDER_BPM, 'song');
            } catch (reason) {
                entry.reasons = [
                    reason instanceof Error ? reason.message : 'This chart cannot be played yet.',
                ];
            }
        }
        entries.push(entry);
        if (options.shouldYield()) {
            options.onProgress?.(index + 1, result.songs.length);
            await options.yieldNow();
            if (options.cancelled?.()) {
                return null;
            }
        }
    }
    return { playlistName: result.playlistName ?? null, entries };
}

/** Any valid tempo: `resolvePlaylistImport` stamps the chosen one on every document it writes. */
const PLACEHOLDER_BPM = 120;

/**
 * The duplicate key: title and composer, each lower-cased with its whitespace collapsed. A song
 * with no composer matches only another song with no composer.
 */
export function songKey(title: string, composer: string): string {
    return `${normalText(title)}\u0000${normalText(composer)}`;
}

/** Lower-cased, whitespace collapsed and trimmed: how two names are told to be the same one. */
function normalText(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The collection name a musician's text becomes: unsafe characters dropped, bounded, trimmed. */
export function collectionName(text: string): string {
    return stripDangerousChars(text).trim().slice(0, MAX_COLLECTION_NAME).trim();
}

/** A collection the songbook already holds, as the import needs to see it. */
export interface ExistingCollection {
    document: CollectionDocument;
}

export interface ResolveOptions {
    /** Every song in the live songbook, for the duplicate check. */
    library: readonly ChartDocument[];
    /** Every collection in the live songbook, for "a collection of that name already exists". */
    collections: readonly ExistingCollection[];
    includeDuplicates: boolean;
    /** The collection name the musician settled on (already `collectionName`-cleaned or not). */
    name: string;
    bpm: number;
    /** Mints a new song id; `crypto.randomUUID` in the app, a counter in a test. */
    newId?: () => string;
}

export interface PlaylistImport {
    /** The documents to write, in playlist order, each under a fresh id and the chosen tempo. */
    songs: ChartDocumentV2[];
    /** The collection's songs after the import, in playlist order: new ids and kept duplicates. */
    songIds: string[];
    /**
     * The playlist's duplicates — whether or not they are imported: skipped (and named in the
     * collection by the copy already held) unless `includeDuplicates`, imported as new copies when
     * it is set.
     */
    duplicates: PlaylistEntry[];
    /** Of `duplicates`, how many match a song already in the songbook (the rest repeat in the playlist). */
    duplicatesInSongbook: number;
    /** Whether `duplicates` are being imported anyway. */
    includeDuplicates: boolean;
    refused: PlaylistEntry[];
    /** Where the collection goes: a new one, or an existing one of the same name it adds to. */
    collection:
        | { kind: 'new'; name: string }
        | { kind: 'existing'; id: string; name: string; songIds: string[] };
    /** Songs the collection gains (new ids and duplicates it did not already hold). */
    added: number;
    /** Documents the import adds to the songbook: its songs, plus one when the collection is new. */
    documents: number;
}

/**
 * Settle a plan against the live songbook (#1478): which songs to write, which are duplicates or
 * refused, and where the collection goes. Throws the sentence to show when the import cannot be
 * made at all (no name, no song to import, a collection that would pass its own cap).
 */
export function resolvePlaylistImport(plan: PlaylistPlan, options: ResolveOptions): PlaylistImport {
    const name = collectionName(options.name);
    if (!name) {
        throw new Error('Name the collection this playlist imports into.');
    }
    if (!Number.isInteger(options.bpm) || options.bpm < 40 || options.bpm > 240) {
        throw new Error('Choose a tempo from 40 to 240 BPM.');
    }
    const newId = options.newId ?? (() => crypto.randomUUID());
    const held = new Map<string, string>();
    for (const document of options.library) {
        const key = songKey(document.title, composerOf(document));
        if (!held.has(key)) {
            held.set(key, document.id);
        }
    }
    const songs: ChartDocumentV2[] = [];
    const songIds: string[] = [];
    const duplicates: PlaylistEntry[] = [];
    const refused: PlaylistEntry[] = [];
    let duplicatesInSongbook = 0;
    const imported = new Map<string, string>();
    for (const entry of plan.entries) {
        if (!entry.document) {
            refused.push(entry);
            continue;
        }
        const key = songKey(entry.title, entry.composer);
        const existing = held.get(key) ?? imported.get(key);
        if (existing !== undefined) {
            duplicates.push(entry);
            if (held.has(key)) {
                duplicatesInSongbook += 1;
            }
            if (!options.includeDuplicates) {
                songIds.push(existing);
                continue;
            }
        }
        const id = newId();
        songs.push({
            ...entry.document,
            id,
            chart: {
                ...entry.document.chart,
                performance: { ...entry.document.chart.performance, bpm: options.bpm },
            },
        });
        songIds.push(id);
        if (!imported.has(key)) {
            imported.set(key, id);
        }
    }
    if (songIds.length === 0) {
        throw new Error('None of the songs in this playlist can be imported yet.');
    }
    const unique = [...new Set(songIds)];
    const target = options.collections.find(
        (entry) => !entry.document.builtIn && normalText(entry.document.name) === normalText(name),
    );
    const collection: PlaylistImport['collection'] = target
        ? {
              kind: 'existing',
              id: target.document.id,
              name: target.document.name,
              songIds: target.document.songIds,
          }
        : { kind: 'new', name };
    const before = collection.kind === 'existing' ? collection.songIds : [];
    const inCollection = new Set(before);
    const added = unique.filter((id) => !inCollection.has(id)).length;
    if (before.length + added > MAX_COLLECTION_SONGS) {
        throw new Error(
            `“${name}” can hold ${MAX_COLLECTION_SONGS.toLocaleString('en-US')} songs, and this import would take it past that. Import into a new collection instead.`,
        );
    }
    return {
        songs,
        songIds: unique,
        duplicates,
        duplicatesInSongbook,
        includeDuplicates: options.includeDuplicates,
        refused,
        collection,
        added,
        documents: songs.length + (collection.kind === 'new' ? 1 : 0),
    };
}

/**
 * Where the import's collection is written, and what is written there — the one rule both
 * songbooks follow (#1478). The id is the existing collection's when the import adds to one, else
 * a fresh one. `edit` runs inside the songbook's own read-modify-write, against what is stored at
 * that id NOW: the import's songs are appended after the collection's own (`mergeSongIds`), and an
 * import that adds nothing queues nothing. A collection deleted since the summary was shown is made
 * again under the same name rather than losing the playlist.
 */
export function collectionWrite(
    plan: PlaylistImport,
    newId: () => string = () => crypto.randomUUID(),
): {
    documentId: string;
    edit: (current: CollectionDocument | null) => CollectionDocument | null;
} {
    const documentId = plan.collection.kind === 'existing' ? plan.collection.id : newId();
    return {
        documentId,
        edit: (current) => {
            if (current) {
                // Grown past the cap since the summary was shown (another tab, a sync): refused,
                // never silently cut short — `mergeSongIds` alone would drop the overflow.
                if (new Set([...current.songIds, ...plan.songIds]).size > MAX_COLLECTION_SONGS) {
                    throw new Error(
                        `“${current.name}” can hold ${MAX_COLLECTION_SONGS.toLocaleString('en-US')} songs, and this import would take it past that.`,
                    );
                }
                const songIds = mergeSongIds(current.songIds, plan.songIds);
                return songIds.length === current.songIds.length ? null : { ...current, songIds };
            }
            return { ...newCollection(plan.collection.name, plan.songIds), id: documentId };
        },
    };
}

/**
 * A pace for the steps above: true once the current slice has run `budgetMs`, and a yield that
 * hands the event loop back (a timer task, so input and paint get their turn) and starts the next
 * slice. One frame's worth by default, so a whole playlist never freezes the page.
 */
export function framePace(budgetMs = 12): {
    shouldYield: () => boolean;
    yieldNow: () => Promise<void>;
} {
    let started = performance.now();
    return {
        shouldYield: () => performance.now() - started > budgetMs,
        yieldNow: () =>
            new Promise((resolve) =>
                setTimeout(() => {
                    started = performance.now();
                    resolve();
                }, 0),
            ),
    };
}
