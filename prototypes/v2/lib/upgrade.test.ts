/**
 * "Upgrade old songs" (#1738): what counts as old, what one document becomes, and the run's
 * safety rules over fake stores that keep the real compare-and-swap and draft-liveness rules.
 * Real IndexedDB for the account's draft rewrite is `tests/browser/account-upgrade-drafts.browser.test.ts`;
 * the product moment is `checks/upgrade-old-songs.spec.ts`.
 */
import { writtenChart } from '@engine/songbook/codec';
import { describe, expect, it } from 'vitest';
import { blankSong, type ChartDocument, FOLLOW_FEEL_SINCE, validateDocument } from './documents';
import { bandForGenre } from './standards';
import {
    draftBackupKey,
    needsUpgrade,
    planUpgrade,
    runUpgrade,
    songBackupKey,
    UPGRADE_SKIPS,
    type UpgradeDraft,
    type UpgradeStore,
    upgradeCount,
    upgradeDocument,
    upgradeDraftDocument,
} from './upgrade';

const OLD = '2026-09-01T12:00:00.000Z';
const NEW = '2026-10-10T12:00:00.000Z';

function textChart(id: string, value: string, updatedAt = NEW, title = id): ChartDocument {
    return validateDocument({
        schemaVersion: 1,
        id,
        title,
        createdAt: updatedAt,
        updatedAt,
        revision: 3,
        chart: {
            arrangement: {
                key: 'C',
                isMinor: false,
                timeSignature: '4/4',
                grouping: null,
                notation: 'name',
                sections: [{ id: 'a', label: 'A', value, repeat: 1 }],
            },
            performance: { bpm: 120, seed: '', randomizeSeed: false, energy: 'auto' },
            band: bandForGenre('Jazz'),
        },
    });
}

/** A current measure chart, as today's writer stores it. */
function currentChart(id: string): ChartDocument {
    const blank = validateDocument({ ...blankSong(textChart('base', 'C')), id, title: id });
    return validateDocument({
        ...blank,
        updatedAt: NEW,
        revision: 1,
        chart: writtenChart(blank.chart),
    });
}

/** A measure chart still carrying the old engine's fields and no groove genre. */
function legacyFieldsChart(id: string): ChartDocument {
    const current = currentChart(id);
    const { genre: _genre, ...groove } = current.chart.band.groove;
    return validateDocument({
        ...current,
        chart: {
            ...current.chart,
            performance: { ...current.chart.performance, complexity: 0.4 },
            band: {
                ...current.chart.band,
                chords: { ...current.chart.band.chords, style: 'funk', octave: 55 },
                groove: { ...groove, lastSmartGenre: 'Jazz', genreFeel: 'Jazz', measures: 1 },
            },
        },
    });
}

describe('needsUpgrade', () => {
    it('picks every text chart', () => {
        expect(needsUpgrade(textChart('t', 'C | F | G | C'))).toBe(true);
    });

    it('leaves a current measure chart alone, whatever order its keys were written in', () => {
        const current = currentChart('c');
        expect(needsUpgrade(current)).toBe(false);
        const reordered = JSON.parse(
            JSON.stringify(current, (_key, value) =>
                value && typeof value === 'object' && !Array.isArray(value)
                    ? Object.fromEntries(Object.entries(value).reverse())
                    : value,
            ),
        );
        expect(needsUpgrade(validateDocument(reordered))).toBe(false);
    });

    it('picks a measure chart with legacy band/performance fields or no groove genre', () => {
        expect(needsUpgrade(legacyFieldsChart('l'))).toBe(true);
        const current = currentChart('g');
        const { genre: _genre, ...groove } = current.chart.band.groove;
        expect(
            needsUpgrade(
                validateDocument({
                    ...current,
                    chart: {
                        ...current.chart,
                        // A chart from before the genre was stored once names it the old way.
                        band: {
                            ...current.chart.band,
                            groove: { ...groove, lastSmartGenre: 'Rock' },
                        },
                    },
                }),
            ),
        ).toBe(true);
    });

    it('picks an old built-in pin that Follow feel would move, and not one written since', () => {
        const pinned = currentChart('p');
        pinned.chart.band.chords = {
            ...pinned.chart.band.chords,
            voice: 'synth',
            autoSound: false,
        };
        expect(needsUpgrade({ ...pinned, updatedAt: OLD })).toBe(true);
        expect(needsUpgrade({ ...pinned, updatedAt: FOLLOW_FEEL_SINCE })).toBe(false);
    });

    it('never picks a collection', () => {
        expect(
            needsUpgrade({
                ...textChart('k', 'C'),
                kind: 'collection',
            } as unknown as ChartDocument),
        ).toBe(false);
    });
});

describe('upgradeDocument', () => {
    it('converts a text chart in place: same id, schema 2, written as today, and then current', () => {
        const old = textChart('song-1', 'Dm7 | G7 | Cmaj7 | Cmaj7', OLD);
        const result = upgradeDocument(old);
        expect(result.kind).toBe('upgraded');
        if (result.kind !== 'upgraded') {
            return;
        }
        const next = result.document;
        expect(next.id).toBe('song-1');
        expect(next.title).toBe(old.title);
        expect(next.schemaVersion).toBe(2);
        expect(next.schemaVersion === 2 && next.chart.score.sections[0].measures).toHaveLength(4);
        // Follow feel is applied against the song's own (old) write time, as opening it would.
        expect(next.chart.band.chords.autoSound).toBe(true);
        expect(result.changes).toEqual([]);
        // What the Save will store — restamped now — needs nothing more.
        expect(needsUpgrade({ ...next, updatedAt: new Date().toISOString() })).toBe(false);
    });

    it('strips the legacy fields and stores the genre once', () => {
        const result = upgradeDocument(legacyFieldsChart('l'));
        expect(result.kind).toBe('upgraded');
        if (result.kind !== 'upgraded') {
            return;
        }
        const json = JSON.stringify(result.document);
        for (const field of ['complexity', 'style', 'octave', 'genreFeel', 'lastSmartGenre']) {
            expect(json).not.toContain(`"${field}"`);
        }
        expect(json).not.toContain('"measures":1');
        expect(result.document.chart.band.groove.genre).toBe('Jazz');
    });

    it('leaves a current song alone', () => {
        expect(upgradeDocument(currentChart('c'))).toEqual({ kind: 'current' });
    });

    it('refuses a chart the converter refuses, naming section, bar and reason', () => {
        const result = upgradeDocument(textChart('r', 'C | Xyz7 | G'));
        expect(result.kind).toBe('refused');
        if (result.kind !== 'refused') {
            return;
        }
        expect(result.reasons[0]).toMatchObject({
            section: 'A',
            sectionIndex: 0,
            bar: 2,
            text: 'Xyz7',
        });
        expect(result.reasons[0].message).toBeTruthy();
    });

    it('reports a lossy conversion as a change, still upgraded', () => {
        // A chord whose full spelling the chart vocabulary cannot hold converts to its longest
        // written prefix (`tones-dropped`, #1737).
        const lossy = ['C7b9#11b13', 'Cmaj9#11/G', 'C7alt#9'].find(
            (token) =>
                upgradeDocument(textChart('x', token)).kind === 'upgraded' &&
                (upgradeDocument(textChart('x', token)) as { changes: unknown[] }).changes.length,
        );
        expect(lossy).toBeDefined();
        const result = upgradeDocument(textChart('x', lossy ?? ''));
        expect(result.kind === 'upgraded' && result.changes[0]).toMatchObject({ bar: 1 });
    });

    it('converts a draft without restamping Follow feel', () => {
        const old = textChart('d', 'C | F', OLD);
        const result = upgradeDraftDocument(old);
        expect(result.kind === 'upgraded' && result.document.chart.band.chords.autoSound).toBe(
            old.chart.band.chords.autoSound,
        );
        expect(upgradeDraftDocument(currentChart('d'))).toEqual({ kind: 'current' });
    });
});

/**
 * A store with the real rules: Save compare-and-swaps on the revision and restamps `updatedAt`;
 * a draft rewrite compare-and-swaps on `capturedAt` and refuses a draft that is live.
 */
function fakeStore(
    kind: 'guest' | 'account',
    songs: ChartDocument[],
    drafts: UpgradeDraft[] = [],
    blocked: Record<string, string> = {},
) {
    const state = {
        songs: new Map(songs.map((song) => [song.id, song])),
        drafts: new Map(drafts.map((draft) => [`${draft.documentId}:${draft.writerId}`, draft])),
        saves: 0,
        /** Throw on the Nth Save (from 1), as a tab killed mid-run stops writing. */
        dieAt: Number.POSITIVE_INFINITY,
    };
    let clock = Date.parse('2026-10-16T00:00:00.000Z');
    const store: UpgradeStore = {
        kind,
        songs: async () => ({ documents: [...state.songs.values()], unreadable: 0 }),
        drafts: async () => ({ drafts: [...state.drafts.values()], unreadable: 0 }),
        blocked: async (id) => blocked[id] ?? null,
        save: async (document, expected) => {
            if (state.saves + 1 >= state.dieAt) {
                throw new Error('tab closed');
            }
            const previous = state.songs.get(document.id);
            if (previous?.revision !== expected) {
                throw new Error('This song was saved in another tab.');
            }
            state.saves += 1;
            clock += 1000;
            state.songs.set(
                document.id,
                validateDocument({
                    ...document,
                    revision: expected + 1,
                    updatedAt: new Date(clock).toISOString(),
                }),
            );
            // The account Save retires every writer's superseded rows; guest slots stay.
            if (kind === 'account') {
                for (const [key, draft] of state.drafts) {
                    if (
                        draft.documentId === document.id &&
                        draft.capturedAt < new Date(clock).toISOString()
                    ) {
                        state.drafts.delete(key);
                    }
                }
            }
        },
        replaceDraft: async (draft, next) => {
            const key = `${draft.documentId}:${draft.writerId}`;
            const held = state.drafts.get(key);
            const song = state.songs.get(draft.documentId);
            if (!held || held.capturedAt !== draft.capturedAt) {
                return false;
            }
            if (song && held.capturedAt >= song.updatedAt) {
                return false;
            }
            if (next === null) {
                state.drafts.delete(key);
            } else {
                state.drafts.set(key, { ...held, document: next });
            }
            return true;
        },
    };
    return { store, state };
}

const draftOf = (document: ChartDocument, capturedAt: string, writerId = 'w1'): UpgradeDraft => ({
    documentId: document.id,
    writerId,
    capturedAt,
    document,
    handle: null,
});

const none = { backup: null, unsavedHere: () => false };

describe('runUpgrade', () => {
    it('upgrades every old song through the store Save, and a second run is a no-op', async () => {
        const { store, state } = fakeStore('guest', [
            textChart('a', 'C | F | G | C'),
            legacyFieldsChart('b'),
            currentChart('c'),
        ]);
        expect(upgradeCount(await planUpgrade([store]))).toBe(2);
        const outcome = await runUpgrade([store], none);
        expect(outcome.upgraded.map((entry) => entry.id)).toEqual(['a', 'b']);
        expect(state.songs.get('a')?.schemaVersion).toBe(2);
        expect(state.songs.get('a')?.revision).toBe(4);
        expect(state.songs.get('c')?.revision).toBe(1);
        expect(upgradeCount(await planUpgrade([store]))).toBe(0);
        const again = await runUpgrade([store], none);
        expect(again.upgraded).toEqual([]);
        expect(state.saves).toBe(2);
    });

    it('finishes an interrupted run: each song wholly old or wholly new, the rest on the next run', async () => {
        const { store, state } = fakeStore('guest', [
            textChart('a', 'C'),
            textChart('b', 'F'),
            textChart('c', 'G'),
        ]);
        state.dieAt = 2;
        const first = await runUpgrade([store], none);
        expect(first.upgraded).toHaveLength(1);
        expect([...state.songs.values()].map((song) => song.schemaVersion).sort()).toEqual([
            1, 1, 2,
        ]);
        state.dieAt = Number.POSITIVE_INFINITY;
        const second = await runUpgrade([store], none);
        expect(second.upgraded).toHaveLength(2);
        expect([...state.songs.values()].every((song) => song.schemaVersion === 2)).toBe(true);
    });

    it('lists a refused song with its bars and leaves it exactly as it was', async () => {
        const refused = textChart('r', 'C | Xyz7');
        const { store, state } = fakeStore('guest', [refused]);
        const outcome = await runUpgrade([store], none);
        expect(outcome.refused).toMatchObject([{ id: 'r', reasons: [{ bar: 2 }] }]);
        expect(state.songs.get('r')).toEqual(refused);
    });

    it('skips a song with a live draft or unsaved text in this tab, and touches neither', async () => {
        const withDraft = textChart('d', 'C', NEW);
        const live = draftOf(textChart('d', 'C | G', NEW), '2026-10-11T00:00:00.000Z');
        const { store, state } = fakeStore('account', [withDraft, textChart('u', 'F')], [live]);
        const outcome = await runUpgrade([store], {
            backup: null,
            unsavedHere: (_store, id) => id === 'u',
        });
        expect(outcome.skipped.map((entry) => [entry.id, entry.reason])).toEqual([
            ['d', UPGRADE_SKIPS.unsaved],
            ['u', UPGRADE_SKIPS.unsaved],
        ]);
        expect(state.saves).toBe(0);
        expect(state.drafts.get('d:w1')).toEqual(live);
        expect(outcome.draftsKept).toMatchObject([{ id: 'd', reason: UPGRADE_SKIPS.draftLive }]);
    });

    it('skips a song the store blocks (a conflicted outbox head) without saving', async () => {
        const { store, state } = fakeStore('account', [textChart('a', 'C')], [], {
            a: 'It has a sync conflict.',
        });
        const outcome = await runUpgrade([store], none);
        expect(outcome.skipped).toMatchObject([{ id: 'a', reason: 'It has a sync conflict.' }]);
        expect(state.saves).toBe(0);
    });

    it('reports a refused Save rather than forcing it', async () => {
        const { store, state } = fakeStore('guest', [textChart('a', 'C')]);
        store.save = async () => {
            throw new Error('This song was saved in another tab.');
        };
        const outcome = await runUpgrade([store], none);
        expect(outcome.skipped).toMatchObject([
            { id: 'a', reason: 'This song was saved in another tab.' },
        ]);
        expect(state.songs.get('a')?.schemaVersion).toBe(1);
    });

    it('with a backup, upgrades only what the backup holds', async () => {
        const a = textChart('a', 'C');
        const b = textChart('b', 'F');
        const { store } = fakeStore('guest', [a, b]);
        const outcome = await runUpgrade([store], {
            backup: { songs: new Set([songBackupKey('guest', a)]), drafts: new Set() },
            unsavedHere: () => false,
        });
        expect(outcome.upgraded.map((entry) => entry.id)).toEqual(['a']);
        expect(outcome.skipped).toMatchObject([{ id: 'b', reason: UPGRADE_SKIPS.changed }]);
    });

    it('converts a dead schema-1 draft in place, keeping its writer and capture time', async () => {
        const song = currentChart('s');
        const dead = draftOf(textChart('s', 'C | G'), '2026-09-01T00:00:00.000Z', 'old-tab');
        const { store, state } = fakeStore('guest', [song], [dead]);
        expect(upgradeCount(await planUpgrade([store]))).toBe(1);
        const outcome = await runUpgrade([store], none);
        expect(outcome.draftsConverted).toBe(1);
        const kept = state.drafts.get('s:old-tab');
        expect(kept?.capturedAt).toBe(dead.capturedAt);
        expect(kept?.document.schemaVersion).toBe(2);
        expect(upgradeCount(await planUpgrade([store]))).toBe(0);
    });

    it('upgrading a song makes its old guest drafts dead, and they are converted after it', async () => {
        const song = textChart('s', 'C', NEW);
        const old = draftOf(textChart('s', 'C | F'), '2026-09-01T00:00:00.000Z');
        const { store, state } = fakeStore('guest', [song], [old]);
        const outcome = await runUpgrade([store], none);
        expect(outcome.upgraded).toHaveLength(1);
        expect(outcome.draftsConverted).toBe(1);
        expect(state.drafts.get('s:w1')?.document.schemaVersion).toBe(2);
    });

    it('retires a draft that will not convert only when the backup holds it', async () => {
        const song = currentChart('s');
        const bad = draftOf(textChart('s', 'C | Xyz7'), '2026-09-01T00:00:00.000Z');
        const unbacked = fakeStore('guest', [song], [bad]);
        const kept = await runUpgrade([unbacked.store], none);
        expect(kept.draftsKept).toMatchObject([{ reason: UPGRADE_SKIPS.draftRefused }]);
        expect(unbacked.state.drafts.size).toBe(1);

        const backed = fakeStore('guest', [song], [bad]);
        const retired = await runUpgrade([backed.store], {
            backup: {
                songs: new Set([songBackupKey('guest', song)]),
                drafts: new Set([draftBackupKey('guest', bad)]),
            },
            unsavedHere: () => false,
        });
        expect(retired.draftsRetired).toBe(1);
        expect(backed.state.drafts.size).toBe(0);
    });

    it('covers both stores, account first', async () => {
        const account = fakeStore('account', [textChart('a', 'C')]);
        const guest = fakeStore('guest', [textChart('g', 'C')]);
        const outcome = await runUpgrade([account.store, guest.store], none);
        expect(outcome.upgraded.map((entry) => `${entry.store}:${entry.id}`)).toEqual([
            'account:a',
            'guest:g',
        ]);
    });

    it('reports progress over songs and drafts', async () => {
        const song = currentChart('s');
        const { store } = fakeStore(
            'guest',
            [textChart('a', 'C'), song],
            [draftOf(textChart('s', 'C'), '2026-09-01T00:00:00.000Z')],
        );
        const seen: string[] = [];
        await runUpgrade([store], {
            ...none,
            onProgress: (done, total) => seen.push(`${done}/${total}`),
        });
        expect(seen).toEqual(['0/2', '1/2', '2/2']);
    });
});
