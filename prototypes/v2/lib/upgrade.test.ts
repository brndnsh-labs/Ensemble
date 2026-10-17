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
    draftNeedsUpgrade,
    needsUpgrade,
    planUpgrade,
    runUpgrade,
    UPGRADE_SKIPS,
    type UpgradeDraft,
    UpgradeRefusal,
    type UpgradeRefusalReason,
    UpgradeScanCancelled,
    type UpgradeStore,
    type UpgradeUnreadableRow,
    unreadableLooksOld,
    upgradeBackup,
    upgradeCount,
    upgradeDocument,
    upgradeDraftDocument,
} from './upgrade';

const OLD = '2026-09-01T12:00:00.000Z';
const NEW = '2026-10-10T12:00:00.000Z';
/**
 * A chord the chart vocabulary cannot spell whole: it converts to its longest written prefix,
 * a `tones-dropped` note (#1737).
 */
const LOSSY = 'C7b9#11b13';

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
    it('converts a text chart in place: same id, same edit date, schema 2, and then current', () => {
        const old = textChart('song-1', 'Dm7 | G7 | Cmaj7 | Cmaj7', OLD);
        const result = upgradeDocument(old);
        expect(result.kind).toBe('upgraded');
        if (result.kind !== 'upgraded') {
            return;
        }
        const next = result.document;
        expect(next.id).toBe('song-1');
        expect(next.title).toBe(old.title);
        expect(next.updatedAt).toBe(old.updatedAt);
        expect(next.createdAt).toBe(old.createdAt);
        expect(next.schemaVersion).toBe(2);
        expect(next.schemaVersion === 2 && next.chart.score.sections[0].measures).toHaveLength(4);
        // Follow feel is applied against the song's own (old) write time, as opening it would.
        expect(next.chart.band.chords.autoSound).toBe(true);
        expect(result.changes).toEqual([]);
        // Stored as it is — its old edit date kept — it needs nothing more.
        expect(needsUpgrade(next)).toBe(false);
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
        const result = upgradeDocument(textChart('x', LOSSY));
        expect(result.kind === 'upgraded' && result.changes[0]).toMatchObject({ bar: 1 });
    });

    it('converts a draft without restamping Follow feel, carrying its lossy notes', () => {
        const old = textChart('d', 'C | F', OLD);
        const result = upgradeDraftDocument(old);
        expect(result.kind === 'upgraded' && result.document.chart.band.chords.autoSound).toBe(
            old.chart.band.chords.autoSound,
        );
        expect(upgradeDraftDocument(currentChart('d'))).toEqual({ kind: 'current' });
        const lossy = upgradeDraftDocument(textChart('d', LOSSY));
        expect(lossy.kind === 'upgraded' && lossy.changes).toHaveLength(1);
    });

    it('rewrites a schema-2 draft carrying legacy fields, and nothing else', () => {
        expect(draftNeedsUpgrade(currentChart('d'))).toBe(false);
        expect(draftNeedsUpgrade(legacyFieldsChart('d'))).toBe(true);
        const result = upgradeDraftDocument(legacyFieldsChart('d'));
        expect(result.kind === 'upgraded' && JSON.stringify(result.document)).not.toContain(
            '"complexity"',
        );
    });

    it('counts an unreadable row as old unless a newer app wrote it', () => {
        expect(unreadableLooksOld({ schemaVersion: 1, id: 'x', title: 42 })).toBe(true);
        expect(unreadableLooksOld({ schemaVersion: 3, id: 'x' })).toBe(false);
    });
});

describe('upgradeBackup', () => {
    it('is one archive of exactly what the plan changes and cannot, each as stored', async () => {
        const old = textChart('a', 'C');
        const stored = { ...old, extra: 'as stored' };
        const draft = draftOf(textChart('s', 'C | G'), '2026-09-01T00:00:00.000Z', 'w1');
        const orphan = draftOf(textChart('gone', 'C'), '2026-09-01T00:00:00.000Z', 'w2');
        const { store } = fakeStore('guest', [old, currentChart('s')], [draft, orphan], {
            a: stored,
        });
        const archive = JSON.parse(upgradeBackup(await planUpgrade([store]), 'now'));
        expect(archive).toMatchObject({
            format: 'ensemble-pre-upgrade-originals',
            createdAt: 'now',
        });
        expect(archive.songs).toEqual([{ store: 'guest', id: 'a', title: 'a', original: stored }]);
        expect(archive.drafts).toEqual([
            {
                store: 'guest',
                id: 's',
                title: 's',
                writerId: 'w1',
                capturedAt: draft.capturedAt,
                original: draft.stored,
            },
        ]);
        expect(archive.leftovers).toEqual([
            {
                store: 'guest',
                kind: 'draft',
                id: 'gone',
                writerId: 'w2',
                title: 'gone',
                reason: UPGRADE_SKIPS.draftOrphan,
                original: orphan.stored,
            },
        ]);
        const leftoversOnly = JSON.parse(upgradeBackup(await planUpgrade([store]), 'now', true));
        expect(leftoversOnly.songs).toEqual([]);
        expect(leftoversOnly.drafts).toEqual([]);
        expect(leftoversOnly.leftovers).toHaveLength(1);
    });
});

/**
 * A store with the real rules: an upgrade Save compare-and-swaps on the revision, keeps
 * `updatedAt`, refuses over a live draft and deletes none; a draft rewrite compare-and-swaps on
 * `capturedAt`, refuses a live draft (an orphan counts as live) and reports a vanished row; a
 * removal deletes one row only while it still holds the bytes it was planned with.
 */
function fakeStore(
    kind: 'guest' | 'account',
    songs: ChartDocument[],
    drafts: UpgradeDraft[] = [],
    stored: Record<string, unknown> = {},
) {
    const state = {
        songs: new Map(songs.map((song) => [song.id, song])),
        drafts: new Map(drafts.map((draft) => [`${draft.documentId}:${draft.writerId}`, draft])),
        unreadable: [] as UpgradeUnreadableRow[],
        unreadableDrafts: [] as UpgradeUnreadableRow[],
        saves: 0,
        /** Throw on the Nth Save (from 1), as a tab killed mid-run stops writing. */
        dieAt: Number.POSITIVE_INFINITY,
        /** Runs just before each Save, as another context writing meanwhile. */
        beforeSave: (_id: string) => {},
        refuse: {} as Record<string, UpgradeRefusalReason>,
    };
    const live = (draft: UpgradeDraft) => {
        const song = state.songs.get(draft.documentId);
        return !song || draft.capturedAt >= song.updatedAt;
    };
    const store: UpgradeStore = {
        kind,
        songs: async () => ({
            songs: [...state.songs.values()].map((document) => ({
                document,
                stored: stored[document.id] ?? document,
            })),
            unreadable: state.unreadable,
        }),
        drafts: async () => ({
            drafts: [...state.drafts.values()],
            unreadable: state.unreadableDrafts,
        }),
        save: async (document, expected) => {
            state.beforeSave(document.id);
            if (state.saves + 1 >= state.dieAt) {
                throw new Error('tab closed');
            }
            if (state.refuse[document.id]) {
                throw new UpgradeRefusal(state.refuse[document.id]);
            }
            const previous = state.songs.get(document.id);
            if (previous?.revision !== expected) {
                throw new UpgradeRefusal('elsewhere');
            }
            for (const draft of state.drafts.values()) {
                if (draft.documentId === document.id && live(draft)) {
                    throw new UpgradeRefusal('unsaved');
                }
            }
            state.saves += 1;
            state.songs.set(document.id, validateDocument({ ...document, revision: expected + 1 }));
        },
        replaceDraft: async (draft, next) => {
            const key = `${draft.documentId}:${draft.writerId}`;
            const held = state.drafts.get(key);
            if (!held) {
                return 'gone';
            }
            if (held.capturedAt !== draft.capturedAt) {
                return 'changed';
            }
            if (live(held)) {
                return 'live';
            }
            state.drafts.set(key, { ...held, document: next, raw: JSON.stringify(next) });
            return 'replaced';
        },
        remove: async (leftover) => {
            if (leftover.kind === 'song') {
                const index = state.unreadable.findIndex((row) => row.id === leftover.id);
                if (index < 0) {
                    return 'gone';
                }
                if (state.unreadable[index].raw !== leftover.raw) {
                    return 'changed';
                }
                state.unreadable.splice(index, 1);
                return 'removed';
            }
            const key = `${leftover.id}:${leftover.writerId}`;
            const held = state.drafts.get(key);
            if (!held) {
                return 'gone';
            }
            if (held.raw !== leftover.raw) {
                return 'changed';
            }
            state.drafts.delete(key);
            return 'removed';
        },
    };
    return { store, state };
}

function draftOf(document: ChartDocument, capturedAt: string, writerId = 'w1'): UpgradeDraft {
    return {
        documentId: document.id,
        writerId,
        capturedAt,
        document,
        stored: document,
        raw: JSON.stringify(document),
        handle: null,
    };
}

const none = { backedUp: false, unsavedHere: () => false };

/** Plan now, then run that plan — "Upgrade without a backup". */
async function upgrade(
    stores: UpgradeStore[],
    options: Partial<Parameters<typeof runUpgrade>[2]> = {},
) {
    return runUpgrade(stores, await planUpgrade(stores), { ...none, ...options });
}

describe('runUpgrade', () => {
    it('upgrades every old song through the store Save, keeping its edit date, and a second run is a no-op', async () => {
        const { store, state } = fakeStore('guest', [
            textChart('a', 'C | F | G | C', OLD),
            legacyFieldsChart('b'),
            currentChart('c'),
        ]);
        expect(upgradeCount(await planUpgrade([store]))).toBe(2);
        const outcome = await upgrade([store]);
        expect(outcome.upgraded.map((entry) => entry.id)).toEqual(['a', 'b']);
        expect(state.songs.get('a')).toMatchObject({
            schemaVersion: 2,
            revision: 4,
            updatedAt: OLD,
        });
        expect(state.songs.get('b')?.updatedAt).toBe(NEW);
        expect(state.songs.get('c')?.revision).toBe(1);
        expect(upgradeCount(await planUpgrade([store]))).toBe(0);
        const again = await upgrade([store]);
        expect(again.upgraded).toEqual([]);
        expect(state.saves).toBe(2);
    });

    it('touches only what the backed-up plan holds, and leaves what changed since alone', async () => {
        const { store, state } = fakeStore('guest', [textChart('a', 'C'), textChart('b', 'F')]);
        const dead = draftOf(textChart('c', 'C | G'), '2026-09-01T00:00:00.000Z');
        state.songs.set('c', currentChart('c'));
        state.drafts.set('c:w1', dead);
        const backedUp = await planUpgrade([store]);
        // After the backup: `b` saved elsewhere, the draft captured again, a new old song.
        state.songs.set('b', { ...state.songs.get('b')!, revision: 9 });
        state.drafts.set('c:w1', { ...dead, raw: `${dead.raw} ` });
        state.songs.set('late', textChart('late', 'G'));
        const outcome = await runUpgrade([store], backedUp, { ...none, backedUp: true });
        expect(outcome.upgraded.map((entry) => entry.id)).toEqual(['a']);
        expect(outcome.skipped).toMatchObject([
            { id: 'b', reason: UPGRADE_SKIPS.changedSinceBackup },
        ]);
        expect(outcome.draftsKept).toMatchObject([
            { id: 'c', reason: UPGRADE_SKIPS.changedSinceBackup, openable: false },
        ]);
        expect(state.songs.get('late')?.schemaVersion).toBe(1);
        expect(state.songs.get('b')?.schemaVersion).toBe(1);
    });

    it('finishes an interrupted run: each song wholly old or wholly new, the rest on the next run', async () => {
        const { store, state } = fakeStore('guest', [
            textChart('a', 'C'),
            textChart('b', 'F'),
            textChart('c', 'G'),
        ]);
        state.dieAt = 2;
        const first = await upgrade([store]);
        expect(first.upgraded).toHaveLength(1);
        expect([...state.songs.values()].map((song) => song.schemaVersion).sort()).toEqual([
            1, 1, 2,
        ]);
        state.dieAt = Number.POSITIVE_INFINITY;
        const second = await upgrade([store]);
        expect(second.upgraded).toHaveLength(2);
        expect([...state.songs.values()].every((song) => song.schemaVersion === 2)).toBe(true);
    });

    it('lists a refused song with its bars, leaves it exactly as it was, and still counts it', async () => {
        const refused = textChart('r', 'C | Xyz7');
        const { store, state } = fakeStore('guest', [refused]);
        const outcome = await upgrade([store]);
        expect(outcome.refused).toMatchObject([{ id: 'r', reasons: [{ bar: 2 }] }]);
        expect(state.songs.get('r')).toEqual(refused);
        expect(upgradeCount(await planUpgrade([store]))).toBe(1);
    });

    it('skips a song with a live draft or unsaved text in this tab, and touches neither', async () => {
        const withDraft = textChart('d', 'C', NEW);
        const live = draftOf(textChart('d', 'C | G', NEW), '2026-10-11T00:00:00.000Z');
        const { store, state } = fakeStore('account', [withDraft, textChart('u', 'F')], [live]);
        const outcome = await upgrade([store], { unsavedHere: (_store, id) => id === 'u' });
        expect(outcome.skipped.map((entry) => [entry.id, entry.reason])).toEqual([
            ['d', UPGRADE_SKIPS.unsaved],
            ['u', UPGRADE_SKIPS.unsaved],
        ]);
        expect(state.saves).toBe(0);
        expect(state.drafts.get('d:w1')).toEqual(live);
        expect(outcome.draftsKept).toMatchObject([
            { id: 'd', reason: UPGRADE_SKIPS.draftLive, openable: true },
        ]);
    });

    it('a draft written between the scan and the Save stops that Save, and survives', async () => {
        const { store, state } = fakeStore('guest', [textChart('a', 'C', NEW)]);
        const late = draftOf(textChart('a', 'C | F7'), '2026-10-12T00:00:00.000Z', 'other-tab');
        state.beforeSave = () => state.drafts.set('a:other-tab', late);
        const outcome = await upgrade([store]);
        expect(outcome.skipped).toMatchObject([{ id: 'a', reason: UPGRADE_SKIPS.unsaved }]);
        expect(state.songs.get('a')?.schemaVersion).toBe(1);
        expect(state.drafts.get('a:other-tab')).toEqual(late);
    });

    it('reports what the store refuses at write time, rather than forcing it', async () => {
        const { store, state } = fakeStore('account', [
            textChart('a', 'C'),
            textChart('b', 'C'),
            textChart('c', 'C'),
        ]);
        state.refuse = { a: 'refused', b: 'waiting', c: 'deleting' };
        const outcome = await upgrade([store]);
        expect(outcome.skipped.map((entry) => entry.reason)).toEqual([
            UPGRADE_SKIPS.refused,
            UPGRADE_SKIPS.waiting,
            UPGRADE_SKIPS.deleting,
        ]);
        expect(state.saves).toBe(0);
    });

    it('converts a dead schema-1 draft in place, keeping its writer and capture time', async () => {
        const song = currentChart('s');
        const dead = draftOf(textChart('s', 'C | G'), '2026-09-01T00:00:00.000Z', 'old-tab');
        const { store, state } = fakeStore('guest', [song], [dead]);
        expect(upgradeCount(await planUpgrade([store]))).toBe(1);
        const outcome = await upgrade([store]);
        expect(outcome.draftsConverted).toBe(1);
        const kept = state.drafts.get('s:old-tab');
        expect(kept?.capturedAt).toBe(dead.capturedAt);
        expect(kept?.document.schemaVersion).toBe(2);
        expect(upgradeCount(await planUpgrade([store]))).toBe(0);
    });

    it('rewrites a dead schema-2 draft that carries legacy fields', async () => {
        const dead = draftOf(legacyFieldsChart('s'), '2026-09-01T00:00:00.000Z');
        const { store, state } = fakeStore('guest', [currentChart('s')], [dead]);
        const outcome = await upgrade([store]);
        expect(outcome.draftsConverted).toBe(1);
        expect(JSON.stringify(state.drafts.get('s:w1')?.document)).not.toContain('"complexity"');
    });

    it('carries a converted draft’s lossy notes into the outcome', async () => {
        const dead = draftOf(textChart('s', LOSSY), '2026-09-01T00:00:00.000Z');
        const { store } = fakeStore('guest', [currentChart('s')], [dead]);
        const outcome = await upgrade([store]);
        expect(outcome.changed).toMatchObject([{ id: 's', draft: true, notes: [{ bar: 1 }] }]);
    });

    it('plans what it cannot fix as leftovers, each with its own reason, and never touches one', async () => {
        const orphan = draftOf(textChart('gone', 'C | G'), '2026-09-01T00:00:00.000Z');
        const ofUnreadable = draftOf(textChart('bad', 'C'), '2026-09-01T00:00:00.000Z', 'w9');
        const refused = draftOf(textChart('s', 'C | Xyz7'), '2026-09-01T00:00:00.000Z');
        const { store, state } = fakeStore(
            'account',
            [currentChart('s')],
            [orphan, ofUnreadable, refused],
        );
        state.unreadable = [
            {
                id: 'bad',
                reason: 'Cannot open this chart',
                stored: { schemaVersion: 1 },
                raw: '{"schemaVersion":1}',
            },
            {
                id: 'future',
                reason: 'a newer document version',
                stored: { schemaVersion: 3 },
                raw: '{"schemaVersion":3}',
            },
        ];
        const plan = await planUpgrade([store]);
        expect(plan.drafts).toEqual([]);
        expect(
            plan.leftovers.map((leftover) => [leftover.kind, leftover.id, leftover.reason]),
        ).toEqual([
            ['song', 'bad', 'Cannot open this chart'],
            ['draft', 'gone', UPGRADE_SKIPS.draftOrphan],
            ['draft', 'bad', UPGRADE_SKIPS.draftUnreadableSong],
            ['draft', 's', UPGRADE_SKIPS.draftRefused],
        ]);
        expect(plan.leftovers[3].reasons).toMatchObject([{ bar: 2 }]);
        expect(upgradeCount(plan)).toBe(4);
        const outcome = await runUpgrade([store], plan, none);
        expect(outcome.draftsConverted).toBe(0);
        expect(state.drafts.size).toBe(3);
        expect(state.unreadable).toHaveLength(2);
    });

    it('a leftover removal deletes exactly that row, only while it holds the planned bytes', async () => {
        const orphan = draftOf(textChart('gone', 'C | G'), '2026-09-01T00:00:00.000Z');
        const { store, state } = fakeStore('guest', [], [orphan]);
        const [leftover] = (await planUpgrade([store])).leftovers;
        state.drafts.set('gone:w1', { ...orphan, raw: `${orphan.raw} ` });
        expect(await store.remove(leftover)).toBe('changed');
        expect(state.drafts.size).toBe(1);
        const [fresh] = (await planUpgrade([store])).leftovers;
        expect(await store.remove(fresh)).toBe('removed');
        expect(upgradeCount(await planUpgrade([store]))).toBe(0);
    });

    it('treats a draft gone before its rewrite as done, not as a conflict', async () => {
        const dead = draftOf(textChart('s', 'C'), '2026-09-01T00:00:00.000Z');
        const { store, state } = fakeStore('guest', [currentChart('s')], [dead]);
        const replace = store.replaceDraft;
        store.replaceDraft = async (draft, next) => {
            state.drafts.delete('s:w1');
            return replace(draft, next);
        };
        const outcome = await upgrade([store]);
        expect(outcome.draftsKept).toEqual([]);
    });

    it('covers both stores, account first', async () => {
        const account = fakeStore('account', [textChart('a', 'C')]);
        const guest = fakeStore('guest', [textChart('g', 'C')]);
        const outcome = await upgrade([account.store, guest.store]);
        expect(outcome.upgraded.map((entry) => `${entry.store}:${entry.id}`)).toEqual([
            'account:a',
            'guest:g',
        ]);
    });

    it('stops a superseded scan at its next yield', async () => {
        const { store } = fakeStore(
            'guest',
            Array.from({ length: 5 }, (_, index) => textChart(`s${index}`, 'C')),
        );
        let yields = 0;
        await expect(
            planUpgrade([store], {
                shouldYield: () => true,
                yieldNow: async () => {
                    yields += 1;
                    if (yields === 2) {
                        throw new UpgradeScanCancelled();
                    }
                },
            }),
        ).rejects.toBeInstanceOf(UpgradeScanCancelled);
        expect(yields).toBe(2);
    });

    it('reports progress over songs and drafts', async () => {
        const song = currentChart('s');
        const { store } = fakeStore(
            'guest',
            [textChart('a', 'C'), song],
            [draftOf(textChart('s', 'C'), '2026-09-01T00:00:00.000Z')],
        );
        const seen: string[] = [];
        await upgrade([store], { onProgress: (done, total) => seen.push(`${done}/${total}`) });
        expect(seen).toEqual(['0/2', '1/2', '2/2']);
    });
});
