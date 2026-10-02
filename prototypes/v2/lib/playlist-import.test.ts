/**
 * A whole iReal playlist imported as a collection (#1478) — the pure half: what the summary says
 * and what the write would hold, before anything is written. The writes themselves are proven
 * against real IndexedDB in `tests/browser/account-playlist-import.browser.test.ts` (account) and
 * `checks/playlist-import.spec.ts` (guest, in the app).
 */
import { parseIRealImport } from '@engine/songbook/ireal-import';
import { describe, expect, it } from 'vitest';
import { accountChart } from '../../../tests/utils/account-songbook-fixture';
import {
    type CollectionDocument,
    MAX_COLLECTION_SONGS,
    newCollection,
    newStarred,
} from './collections';
import type { ChartDocument } from './documents';
import {
    collectionName,
    collectionWrite,
    type PlaylistPlan,
    planPlaylist,
    resolvePlaylistImport,
    songKey,
} from './playlist-import';
import { capRefusal, ImportCapError, MAX_REMOTE_CANDIDATES } from './sync/repository';

/** One open-protocol (irealbook) song's six fields. */
function song(title: string, composer: string, body = 'T44[C   |G7   Z'): string[] {
    return [title, composer, 'Medium Swing', 'C', 'n', body];
}

function playlist(songs: string[][], name?: string): string {
    const fields = songs.flat();
    if (name !== undefined) {
        fields.push(name);
    }
    return `irealbook://${encodeURIComponent(fields.join('='))}`;
}

/** Synchronous slices: every song yields, and the yield is immediate. */
const steps = { shouldYield: () => true, yieldNow: async () => {} };

async function plan(source: string): Promise<PlaylistPlan> {
    const built = await planPlaylist(parseIRealImport(source), accountChart(), steps);
    if (!built) {
        throw new Error('The plan was cancelled.');
    }
    return built;
}

function counter(prefix = 'new') {
    let n = 0;
    return () => `${prefix}-${++n}`;
}

function held(title: string, composer: string, id: string): ChartDocument {
    // A v1 document has no composer field, so a held song with a composer is a v2 import.
    return composer
        ? ({
              ...accountChart(title, id),
              schemaVersion: 2,
              metadata: { composer },
          } as unknown as ChartDocument)
        : accountChart(title, id);
}

const SOURCE = playlist(
    [
        song('Blue Monk', 'Thelonious Monk'),
        song('All the Things You Are', 'Jerome Kern'),
        song('Broken', 'Nobody', 'T44[C unknown Z'),
        song('blue  monk ', 'THELONIOUS MONK'),
        song('Solar', 'Miles Davis'),
    ],
    'Gig set',
);

describe('planning a whole-playlist import (#1478)', () => {
    it('builds every playable song, lists the refused ones with their diagnostics, and keeps the name', async () => {
        const built = await plan(SOURCE);
        expect(built.playlistName).toBe('Gig set');
        expect(built.entries.map((entry) => entry.title)).toEqual([
            'Blue Monk',
            'All the Things You Are',
            'Broken',
            'blue  monk ',
            'Solar',
        ]);
        const broken = built.entries[2];
        expect(broken.document).toBeUndefined();
        expect(broken.reasons.length).toBeGreaterThan(0);
        expect(built.entries.filter((entry) => entry.document)).toHaveLength(4);
    });

    it("keeps each song's OWN link as its source, never the whole playlist", async () => {
        const built = await plan(SOURCE);
        const document = built.entries[0].document!;
        expect(document.importSource?.format).toBe('irealbook');
        expect(document.importSource?.text).not.toBe(SOURCE);
        const again = parseIRealImport(document.importSource!.text);
        expect(again.songs).toHaveLength(1);
        expect(again.songs[0].title).toBe('Blue Monk');
    });

    it('reports progress and stops when cancelled', async () => {
        const progress: number[] = [];
        let yields = 0;
        const cancelled = await planPlaylist(parseIRealImport(SOURCE), accountChart(), {
            shouldYield: () => true,
            yieldNow: async () => {
                yields += 1;
            },
            onProgress: (done) => progress.push(done),
            cancelled: () => yields >= 2,
        });
        expect(cancelled).toBeNull();
        expect(progress).toEqual([1, 2]);
    });
});

describe('resolving it against the songbook (#1478)', () => {
    const library = [held('All the Things You Are', 'Jerome  Kern', 'held-atty')];

    it('skips duplicates by default: the songbook copy and a repeat in the playlist', async () => {
        const result = resolvePlaylistImport(await plan(SOURCE), {
            library,
            collections: [],
            includeDuplicates: false,
            name: 'Gig set',
            bpm: 132,
            newId: counter(),
        });
        expect(result.songs.map((document) => document.title)).toEqual(['Blue Monk', 'Solar']);
        expect(result.songs.map((document) => document.id)).toEqual(['new-1', 'new-2']);
        expect(result.duplicates.map((entry) => entry.title)).toEqual([
            'All the Things You Are',
            'blue  monk ',
        ]);
        expect(result.duplicatesInSongbook).toBe(1);
        // The collection is still the playlist: the held copy stands in for the skipped one, in
        // its own position, and the repeat names the copy this import makes.
        expect(result.songIds).toEqual(['new-1', 'held-atty', 'new-2']);
        expect(result.refused.map((entry) => entry.title)).toEqual(['Broken']);
        expect(result.collection).toEqual({ kind: 'new', name: 'Gig set' });
        expect(result.documents).toBe(3);
        // Every written song carries the chosen tempo.
        expect(result.songs.every((document) => document.chart.performance.bpm === 132)).toBe(true);
    });

    it('imports duplicates as new copies with the checkbox', async () => {
        const result = resolvePlaylistImport(await plan(SOURCE), {
            library,
            collections: [],
            includeDuplicates: true,
            name: 'Gig set',
            bpm: 120,
            newId: counter(),
        });
        expect(result.songs.map((document) => document.title)).toEqual([
            'Blue Monk',
            'All the Things You Are',
            'blue  monk ',
            'Solar',
        ]);
        expect(result.songIds).toEqual(['new-1', 'new-2', 'new-3', 'new-4']);
        expect(result.duplicates).toHaveLength(2);
        expect(result.includeDuplicates).toBe(true);
        expect(result.documents).toBe(5);
    });

    it('never writes a refused song', async () => {
        const result = resolvePlaylistImport(await plan(SOURCE), {
            library: [],
            collections: [],
            includeDuplicates: true,
            name: 'Gig set',
            bpm: 120,
        });
        expect(result.songs.some((document) => document.title === 'Broken')).toBe(false);
        expect(result.refused).toHaveLength(1);
        expect(result.refused[0].reasons.length).toBeGreaterThan(0);
    });

    it('adds to an existing collection of the same name rather than making a second one', async () => {
        const existing: CollectionDocument = {
            ...newCollection('gig  SET', ['older-song', 'held-atty']),
            id: 'gig-collection',
        };
        const result = resolvePlaylistImport(await plan(SOURCE), {
            library,
            collections: [{ document: newStarred(['x']) }, { document: existing }],
            includeDuplicates: false,
            name: 'Gig set',
            bpm: 120,
            newId: counter(),
        });
        expect(result.collection).toMatchObject({ kind: 'existing', id: 'gig-collection' });
        // Only the songs: no new collection document.
        expect(result.documents).toBe(2);
        expect(result.added).toBe(2);
        const write = collectionWrite(result, () => 'unused');
        expect(write.documentId).toBe('gig-collection');
        const next = write.edit(existing);
        // Appended after the collection's own songs, the one it already held not repeated.
        expect(next?.songIds).toEqual(['older-song', 'held-atty', 'new-1', 'new-2']);
        expect(next?.name).toBe('gig  SET');
        // An import that adds nothing queues nothing.
        expect(write.edit(next)).toBeNull();
        // One that would carry the collection past its cap since the summary is refused, never
        // silently cut short.
        const grown = {
            ...existing,
            songIds: Array.from({ length: MAX_COLLECTION_SONGS - 1 }, (_, i) => `grown-${i}`),
        };
        expect(() => write.edit(grown)).toThrow(/can hold 2,000 songs/);
    });

    it('never treats the built-in Starred as the collection a playlist named "Starred" joins', async () => {
        const result = resolvePlaylistImport(await plan(SOURCE), {
            library: [],
            collections: [{ document: newStarred(['x']) }],
            includeDuplicates: false,
            name: 'Starred',
            bpm: 120,
        });
        expect(result.collection).toEqual({ kind: 'new', name: 'Starred' });
    });

    it('writes a new collection under a fresh id, in playlist order', async () => {
        const result = resolvePlaylistImport(await plan(SOURCE), {
            library: [],
            collections: [],
            includeDuplicates: false,
            name: '  Friday <gig>  ',
            bpm: 120,
            newId: counter(),
        });
        expect(result.collection).toEqual({ kind: 'new', name: 'Friday gig' });
        const write = collectionWrite(result, () => 'fresh-collection');
        const created = write.edit(null);
        expect(created).toMatchObject({
            kind: 'collection',
            id: 'fresh-collection',
            name: 'Friday gig',
            songIds: ['new-1', 'new-2', 'new-3'],
        });
    });

    it('refuses an import with no name, a bad tempo, or nothing to import', async () => {
        const built = await plan(SOURCE);
        const options = {
            library: [],
            collections: [],
            includeDuplicates: false,
            name: 'Gig',
            bpm: 120,
        };
        expect(() => resolvePlaylistImport(built, { ...options, name: ' <> ' })).toThrow(
            /Name the collection/,
        );
        expect(() => resolvePlaylistImport(built, { ...options, bpm: 20 })).toThrow(/tempo/);
        const allBroken = await plan(
            playlist([song('One', 'A', 'T44[C unknown Z'), song('Two', 'B', 'T44[C unknown Z')]),
        );
        expect(() => resolvePlaylistImport(allBroken, options)).toThrow(/None of the songs/);
    });

    it('keys duplicates on title and composer, ignoring case and spacing', () => {
        expect(songKey(' Blue  Monk', 'thelonious monk')).toBe(
            songKey('blue monk ', 'Thelonious  Monk'),
        );
        expect(songKey('Blue Monk', '')).not.toBe(songKey('Blue Monk', 'Thelonious Monk'));
        expect(collectionName(`  ${'x'.repeat(300)}  `)).toHaveLength(200);
    });
});

describe('the account cap (#1478)', () => {
    it('lets an import that fits through, and states cap and usage for one that does not', () => {
        expect(capRefusal(1_351, 649)).toBeNull();
        const refusal = capRefusal(1_352, 649);
        expect(refusal).toContain('2,000');
        expect(refusal).toContain('649');
        expect(refusal).toContain('1,352');
        expect(refusal).toContain('1 more than fit');
        expect(refusal).toContain('room for 1,351');
        expect(refusal).toContain('Nothing has been imported');
        expect(capRefusal(10, MAX_REMOTE_CANDIDATES)).not.toContain('room for');
        const error = new ImportCapError(1_352, 649);
        expect(error.message).toBe(refusal);
        expect([error.documents, error.held]).toEqual([1_352, 649]);
    });
});
