import { readFileSync } from 'node:fs';
import type { Download, Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import { validateDocument } from '../lib/documents';
import { bandForGenre } from '../lib/standards';
import { upgradeDocument } from '../lib/upgrade';
import { editorRevealed, expect, seedGuestDocuments, songLink, test } from './fixtures';

/**
 * "Upgrade old songs" (#1738), the guest songbook's product moment on both projects: the card
 * shows while anything old is stored here, offers ONE backup file first, rewrites each song in
 * place (same id, same edit date, next revision) through the ordinary Save, lists what it refused
 * with a way into the text editor, never writes over or deletes a draft, and finishes an
 * interrupted run.
 *
 * The rules themselves are `lib/upgrade.test.ts`; the account half — the outbox drains and the
 * server holds schema 2 — is `account-upgrade-old-songs.chromium.spec.ts`.
 */

const RECOVERY = 'ensemble-v2-preview:recovery:';

/** A text (schema-1) chart, as v1 and this app's text editor wrote one. */
function textChart(
    id: string,
    title: string,
    sections: Array<[label: string, value: string]>,
    options: { revision?: number; stamp?: string } = {},
): ChartDocument {
    const stamp = options.stamp ?? '2026-09-01T12:00:00.000Z';
    return validateDocument({
        schemaVersion: 1,
        id,
        title,
        createdAt: stamp,
        updatedAt: stamp,
        revision: options.revision ?? 2,
        chart: {
            arrangement: {
                key: 'C',
                isMinor: false,
                timeSignature: '4/4',
                grouping: null,
                notation: 'name',
                sections: sections.map(([label, value], index) => ({
                    id: `section-${index}`,
                    label,
                    value,
                    repeat: 1,
                })),
            },
            performance: { bpm: 120, seed: '', randomizeSeed: false },
            band: bandForGenre('Blues'),
        },
    });
}

/** A measure (schema-2) chart still carrying the old engine's band fields, stored before #1424. */
function legacyFieldsChart(): ChartDocument {
    const upgraded = upgradeDocument(
        textChart('legacy-fields', 'Legacy fields', [['A', 'C | F | G7 | C']], {
            stamp: '2026-08-20T09:30:00.000Z',
        }),
    );
    if (upgraded.kind !== 'upgraded') {
        throw new Error('fixture did not convert');
    }
    const { genre: _genre, ...groove } = upgraded.document.chart.band.groove;
    return validateDocument({
        ...upgraded.document,
        revision: 5,
        chart: {
            ...upgraded.document.chart,
            performance: { ...upgraded.document.chart.performance, complexity: 0.6 },
            band: {
                ...upgraded.document.chart.band,
                chords: { ...upgraded.document.chart.band.chords, style: 'smart', octave: 60 },
                groove: { ...groove, lastSmartGenre: 'Blues', genreFeel: 'Blues', measures: 1 },
            },
        },
    });
}

async function documents(page: Page): Promise<ChartDocument[]> {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('ensemble-v2-preview', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await new Promise<ChartDocument[]>((resolve, reject) => {
                const request = db.transaction('documents').objectStore('documents').getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } finally {
            db.close();
        }
    });
}

/** Every recovery slot on this device, key to raw value. */
function slots(page: Page): Promise<Record<string, string>> {
    return page.evaluate((prefix) => {
        const found: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (key?.startsWith(prefix)) {
                found[key] = localStorage.getItem(key) ?? '';
            }
        }
        return found;
    }, RECOVERY);
}

const card = (page: Page) => page.getByTestId('upgrade-old-songs');

/** The home is up and its upgrade scan has landed, so the card's absence means something. */
async function scanned(page: Page): Promise<void> {
    await expect(page.locator('main.home')).toHaveAttribute('data-upgrade-scan', 'settled');
}

async function upgradeWithoutBackup(page: Page): Promise<void> {
    await card(page)
        .getByRole('button', { name: /^Upgrade (old songs|again)…$/ })
        .click();
    await expect(card(page).getByRole('heading', { name: 'First, a backup' })).toBeVisible();
    await card(page).getByRole('button', { name: 'Upgrade without a backup' }).click();
    await expect(card(page)).toHaveAttribute('data-phase', 'done');
}

/** The All songs page's titles, in the order it lists them, sorted by `sort`. */
async function allSongsOrder(page: Page, sort: string): Promise<string[]> {
    await page.getByTestId('all-songs-link').click();
    await page.getByLabel('Sort by').selectOption(sort);
    const names = page.locator('.all-songs-table .song-name');
    await expect(names.first()).toBeVisible();
    const order = await names.allInnerTexts();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    return order;
}

test('old songs are backed up in one file, upgraded in place with their edit dates and order kept, still play, and the card goes at zero', async ({
    page,
}) => {
    const blues = textChart('old-blues', 'Old blues', [['A', 'C7 | F7 | C7 | G7']], {
        stamp: '2026-09-03T08:00:00.000Z',
    });
    const turnaround = textChart('old-turn', 'Turnaround', [['A', 'Dm7 G7 | Cmaj7 | Am7 | D7']], {
        stamp: '2026-09-01T08:00:00.000Z',
    });
    const legacy = legacyFieldsChart();
    // Already current: nothing in the backup, nothing written.
    const current = upgradeDocument(textChart('current', 'Current', [['A', 'C | G']]));
    if (current.kind !== 'upgraded') {
        throw new Error('fixture did not convert');
    }
    const seeded = [blues, turnaround, legacy, current.document];
    await seedGuestDocuments(page, seeded);
    await expect(card(page).getByRole('heading', { name: 'Upgrade old songs (3)' })).toBeVisible();
    await expect(card(page)).toContainText('3 songs here are saved in the old format');
    await expect(card(page)).toContainText('Close Ensemble in other tabs first.');
    const orderBefore = await allSongsOrder(page, 'recentAdded');
    const titleOrderBefore = await allSongsOrder(page, 'title');

    await card(page).getByRole('button', { name: 'Upgrade old songs…' }).click();
    const files: Download[] = [];
    page.on('download', (download) => files.push(download));
    await card(page).getByRole('button', { name: 'Download backup' }).click();
    await expect(card(page).getByRole('button', { name: /I have the file/ })).toBeVisible();
    await expect.poll(() => files.length).toBe(1);
    // ONE file: exactly the songs this run changes, each byte-for-byte as it was stored.
    const archive = JSON.parse(readFileSync((await files[0].path())!, 'utf8'));
    expect(files[0].suggestedFilename()).toMatch(/^ensemble-pre-upgrade-originals-.*\.json$/);
    expect(archive.format).toBe('ensemble-pre-upgrade-originals');
    expect(archive.drafts).toEqual([]);
    expect(archive.songs.map((entry: { id: string }) => entry.id).sort()).toEqual([
        'legacy-fields',
        'old-blues',
        'old-turn',
    ]);
    for (const entry of archive.songs) {
        const original = seeded.find((song) => song.id === entry.id)!;
        expect(entry).toEqual({ store: 'guest', id: original.id, title: original.title, original });
    }
    // Nothing was touched by the backup.
    expect(await documents(page)).toEqual(expect.arrayContaining(seeded));

    await card(page)
        .getByRole('button', { name: /I have the file/ })
        .click();
    await expect(card(page).getByRole('heading', { name: 'Upgraded 3 songs' })).toBeVisible();
    await expect(card(page).getByTestId('upgrade-refused')).toHaveCount(0);

    const stored = await documents(page);
    for (const original of [blues, turnaround, legacy]) {
        const now = stored.find((document) => document.id === original.id)!;
        // Same id, the next revision, the SAME edit dates, the current format, no old fields.
        expect(now.schemaVersion).toBe(2);
        expect(now.revision).toBe(original.revision + 1);
        expect(now.title).toBe(original.title);
        expect(now.updatedAt).toBe(original.updatedAt);
        expect(now.createdAt).toBe(original.createdAt);
        const json = JSON.stringify(now.chart);
        for (const field of ['"complexity"', '"lastSmartGenre"', '"genreFeel"', '"octave"']) {
            expect(json).not.toContain(field);
        }
        expect(now.chart.band.groove.genre).toBe('Blues');
    }
    expect(stored.find((document) => document.id === 'current')).toEqual(current.document);
    const turned = stored.find((document) => document.id === 'old-turn')!;
    expect(turned.schemaVersion === 2 && turned.chart.score.sections[0].measures[0]).toEqual(
        expect.objectContaining({
            content: {
                kind: 'events',
                events: [
                    { kind: 'chord', symbol: 'Dm7', duration: [2, 1] },
                    { kind: 'chord', symbol: 'G7', duration: [2, 1] },
                ],
            },
        }),
    );

    await card(page).getByRole('button', { name: 'Done' }).click();
    await expect(card(page)).toHaveCount(0);
    expect(await allSongsOrder(page, 'recentAdded')).toEqual(orderBefore);
    expect(await allSongsOrder(page, 'title')).toEqual(titleOrderBefore);

    // Gone after a reload too: nothing old is stored here.
    await page.reload();
    await scanned(page);
    await expect(card(page)).toHaveCount(0);

    await songLink(page, 'Turnaround').first().click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect.poll(() => page.locator('.chord[aria-current="true"]').count()).toBe(1);
    await page.getByRole('button', { name: 'Stop playback' }).click();
    expect((await documents(page)).find((document) => document.id === 'old-turn')).toEqual(turned);
});

test('a refused chart is listed by bar and reason, untouched, keeps the card up, and Open lands in its text editor on that section', async ({
    page,
}) => {
    const refused = textChart('refused', 'Odd changes', [
        ['A', 'C | F | G | C'],
        ['B', 'G | Xyz7 | C | C'],
    ]);
    await seedGuestDocuments(page, [refused]);
    await expect(card(page).getByRole('heading', { name: 'Upgrade old songs (1)' })).toBeVisible();
    await upgradeWithoutBackup(page);
    await expect(
        card(page).getByRole('heading', {
            name: '1 item left in the old format — open each to fix',
        }),
    ).toBeVisible();
    await expect(card(page).getByRole('button', { name: 'Done' })).toHaveCount(0);
    const listed = card(page).getByTestId('upgrade-refused');
    await expect(listed).toContainText('Odd changes');
    await expect(listed).toContainText('bar 2, section B “Xyz7”:');
    expect(await documents(page)).toEqual([refused]);

    await listed.getByRole('button', { name: 'Open Odd changes' }).click();
    await expect(page.getByRole('heading', { name: 'Odd changes', exact: true })).toBeVisible();
    await editorRevealed(page);
    await expect(page.locator('#section')).toHaveValue('section-1');
    await expect(page.getByLabel('Chord text')).toHaveValue('G | Xyz7 | C | C');

    // Fixed in the text editor and saved, it upgrades on the next run.
    await page.getByLabel('Chord text').fill('G | G7 | C | C');
    await page.getByRole('button', { name: 'Update chart' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await upgradeWithoutBackup(page);
    await expect(card(page).getByRole('heading', { name: 'Upgraded 1 song' })).toBeVisible();
    expect((await documents(page))[0]).toMatchObject({ id: 'refused', schemaVersion: 2 });
    await card(page).getByRole('button', { name: 'Done' }).click();
    await expect(card(page)).toHaveCount(0);
});

test('a song with unsaved edits is left alone, its draft untouched, until it is saved', async ({
    page,
}) => {
    const edited = textChart('edited', 'Work in progress', [['A', 'C | F | G | C']]);
    const other = textChart('other', 'Other song', [['A', 'Am | Dm | E7 | Am']]);
    await seedGuestDocuments(page, [edited, other]);
    await songLink(page, 'Work in progress').click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Chord text').fill('C | F | G7 | C');
    await page.getByRole('button', { name: 'Update chart' }).click();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    const before = await slots(page);
    expect(Object.values(before).join()).toContain('G7');
    // The card's scan is latched on the songbooks' counts, which an edit does not move; a reload
    // (or pressing Upgrade, which always re-reads) sees the new draft.
    await page.reload();
    await scanned(page);

    await expect(card(page).getByRole('heading', { name: 'Upgrade old songs (3)' })).toBeVisible();
    await expect(card(page)).toContainText(
        '2 songs here are saved in the old format, and 1 unsaved draft',
    );
    await upgradeWithoutBackup(page);
    await expect(
        card(page).getByRole('heading', {
            name: '2 items left in the old format — open each to fix',
        }),
    ).toBeVisible();
    await expect(card(page).getByTestId('upgrade-done-count')).toHaveText('Upgraded 1 song.');
    await expect(card(page).getByTestId('upgrade-skipped')).toContainText(
        'Work in progress — It has unsaved changes. Open it, then Save or discard them',
    );
    const stored = await documents(page);
    expect(stored.find((document) => document.id === 'edited')).toEqual(edited);
    expect(stored.find((document) => document.id === 'other')?.schemaVersion).toBe(2);
    expect(await slots(page)).toEqual(before);

    // Its unsaved draft is listed too, with the same way in.
    await expect(
        card(page)
            .getByTestId('upgrade-drafts')
            .getByRole('button', { name: 'Open Work in progress' }),
    ).toBeVisible();
    await card(page)
        .getByTestId('upgrade-skipped')
        .getByRole('button', { name: 'Open Work in progress' })
        .click();
    await expect(page.getByLabel('Chord text')).toHaveValue('C | F | G7 | C');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await upgradeWithoutBackup(page);
    const upgraded = (await documents(page)).find((document) => document.id === 'edited')!;
    expect(upgraded.schemaVersion).toBe(2);
    expect(JSON.stringify(upgraded)).toContain('"G7"');
    await card(page).getByRole('button', { name: 'Done' }).click();
    await expect(card(page)).toHaveCount(0);
});

test('an orphan draft and an unreadable old song are listed and left exactly as they are', async ({
    page,
}) => {
    const orphan = textChart('not-here', 'Song from elsewhere', [['A', 'C | G']]);
    const orphanKey = `${RECOVERY}some-old-tab:not-here`;
    const orphanSlot = JSON.stringify({ capturedAt: '2026-09-02T00:00:00.000Z', document: orphan });
    await page.addInitScript(
        ([key, value]) => {
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, value);
            }
        },
        [orphanKey, orphanSlot],
    );
    const corrupt = { schemaVersion: 1, id: 'zz-corrupt', title: 42, chart: null };
    await seedGuestDocuments(page, [textChart('fine', 'Fine', [['A', 'C | F']]), corrupt]);
    await expect(card(page).getByRole('heading', { name: 'Upgrade old songs (3)' })).toBeVisible();
    await expect(card(page).getByTestId('upgrade-unreadable')).toContainText('zz-corrupt');
    await upgradeWithoutBackup(page);
    await expect(
        card(page).getByRole('heading', {
            name: '2 items left in the old format — open each to fix',
        }),
    ).toBeVisible();
    await expect(card(page).getByTestId('upgrade-drafts')).toContainText(
        'Song from elsewhere (unsaved draft) — Unsaved changes for a song this device no longer holds',
    );
    await expect(card(page).getByTestId('upgrade-unreadable')).toContainText('zz-corrupt');
    expect((await slots(page))[orphanKey]).toBe(orphanSlot);
    expect((await documents(page)).find((row) => row.id === 'zz-corrupt')).toEqual(corrupt);
});

test('a run cut short by a reload leaves each song old or new, and the next run finishes it', async ({
    page,
}) => {
    const songs = Array.from({ length: 120 }, (_, index) =>
        textChart(`song-${String(index).padStart(3, '0')}`, `Song ${index}`, [
            ['A', 'C | Am | Dm7 G7 | C'],
            ['B', 'F | F | C | G7'],
        ]),
    );
    await seedGuestDocuments(page, songs);
    await expect(
        card(page).getByRole('heading', { name: 'Upgrade old songs (120)' }),
    ).toBeVisible();
    await card(page).getByRole('button', { name: 'Upgrade old songs…' }).click();
    await card(page).getByRole('button', { name: 'Upgrade without a backup' }).click();
    // Cut it short as soon as the first song is in: a closed tab mid-run.
    await expect(card(page).getByTestId('upgrade-progress')).toHaveText(/Upgraded [1-9]\d* of 120/);
    await page.reload();
    await scanned(page);

    const after = await documents(page);
    expect(after).toHaveLength(120);
    const upgraded = after.filter((document) => document.schemaVersion === 2);
    const old = after.filter((document) => document.schemaVersion === 1);
    expect(upgraded.length + old.length).toBe(120);
    // The reload really did land mid-run (measured: a fifth to a quarter of the way in).
    expect(upgraded.length).toBeGreaterThan(0);
    expect(old.length).toBeGreaterThan(0);
    // Every song wholly one or the other: an old one is byte-for-byte its seed, a new one is the
    // next revision of it.
    for (const document of old) {
        expect(document).toEqual(songs.find((song) => song.id === document.id));
    }
    for (const document of upgraded) {
        expect(document.revision).toBe(3);
        expect(document.schemaVersion === 2 && document.chart.score.sections).toHaveLength(2);
    }
    await expect(
        card(page).getByRole('heading', { name: `Upgrade old songs (${old.length})` }),
    ).toBeVisible();
    await upgradeWithoutBackup(page);
    await expect(
        card(page).getByRole('heading', {
            name: `Upgraded ${old.length} ${old.length === 1 ? 'song' : 'songs'}`,
        }),
    ).toBeVisible();
    const finished = await documents(page);
    expect(finished.every((document) => document.schemaVersion === 2)).toBe(true);
    // Nothing upgraded twice: the songs the first run finished kept their revision.
    for (const document of upgraded) {
        expect(finished.find((song) => song.id === document.id)?.revision).toBe(3);
    }
});

test('a draft another tab writes during the run stops that song’s Save, and survives', async ({
    page,
}) => {
    const songs = Array.from({ length: 120 }, (_, index) =>
        textChart(`song-${String(index).padStart(3, '0')}`, `Song ${index}`, [['A', 'C | G7']]),
    );
    await seedGuestDocuments(page, songs);
    await expect(
        card(page).getByRole('heading', { name: 'Upgrade old songs (120)' }),
    ).toBeVisible();
    await card(page).getByRole('button', { name: 'Upgrade old songs…' }).click();
    await card(page).getByRole('button', { name: 'Upgrade without a backup' }).click();
    // After the run has read everything and started writing, another tab keeps unsaved work on
    // the LAST song — the case only a check at write time can catch.
    await expect(card(page).getByTestId('upgrade-progress')).toHaveText(/Upgraded [1-9]\d* of 120/);
    const last = songs.at(-1)!;
    const key = `${RECOVERY}other-tab:${last.id}`;
    const value = JSON.stringify({
        capturedAt: new Date().toISOString(),
        document: { ...last, title: 'Unsaved in another tab' },
    });
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
    await expect(card(page)).toHaveAttribute('data-phase', 'done');
    await expect(card(page).getByTestId('upgrade-skipped')).toContainText(
        `${last.title} — It has unsaved changes`,
    );
    expect((await documents(page)).find((document) => document.id === last.id)).toEqual(last);
    expect((await slots(page))[key]).toBe(value);
});
