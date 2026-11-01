import type { Page } from '@playwright/test';
import { expect, seedStarters, songLink, test } from './fixtures';

/**
 * #1992 — "What do you play?": one per-device choice, asked once on the stand, that mutes your
 * own lane whenever a chart opens (a default, never a chart edit), moves the chords for a B♭ or
 * E♭ horn, and turns a guitarist's stand to the neck.
 */
const KEY = 'ensemble-v2-preview:player-instrument';

/**
 * A device that has never answered: the suite's fixture seeds "Just listening" on every
 * navigation while the key is unset, so this takes it back out — on the app's first load only,
 * so the answer the test then gives survives a reload.
 */
async function freshDevice(page: Page) {
    await page.addInitScript((key) => {
        if (location.pathname.endsWith('build.json') || sessionStorage.getItem('asked-fresh')) {
            return;
        }
        localStorage.removeItem(key);
        sessionStorage.setItem('asked-fresh', '1');
    }, KEY);
}

async function choose(page: Page, label: RegExp) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await sheet.getByRole('radio', { name: label }).check();
    await sheet.getByRole('button', { name: 'Close settings' }).click();
    await expect(sheet).toBeHidden();
}

const chip = (page: Page, lane: string) =>
    page.locator('.band-controls').getByRole('button', {
        name: new RegExp(`^${lane}( · you)?$`),
    });
const save = (page: Page) => page.locator('.save-btn');

test('asked once on the stand; Bass mutes the bass on every chart without making it unsaved', async ({
    page,
}) => {
    await freshDevice(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.waitForSelector('.bar');
    const prompt = page.getByRole('region', { name: 'What do you play?' });
    await expect(prompt).toBeVisible();
    // Never a modal: the chart stays playable under it.
    await expect(page.getByRole('button', { name: 'Start playback' })).toBeEnabled();
    await prompt.getByRole('button', { name: 'Bass', exact: true }).click();
    await expect(prompt).toBeHidden();

    await expect(chip(page, 'Bass')).toHaveAttribute('aria-pressed', 'false');
    await expect(chip(page, 'Bass')).toHaveText(/you/);
    await expect(chip(page, 'Drums')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /^You play: Bass/ })).toBeVisible();
    // The default mute is not an edit.
    await expect(save(page)).toHaveAttribute('aria-disabled', 'true');
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('bass');

    // Your own lane turned on for this chart is not an edit either: the chart already has it on.
    await chip(page, 'Bass').click();
    await expect(chip(page, 'Bass')).toHaveAttribute('aria-pressed', 'true');
    await expect(save(page)).toHaveAttribute('aria-disabled', 'true');
    // Another lane is a chart edit, as ever.
    await chip(page, 'Drums').click();
    await expect(chip(page, 'Drums')).toHaveAttribute('aria-pressed', 'false');
    await expect(save(page)).not.toHaveAttribute('aria-disabled', 'true');
    await chip(page, 'Drums').click();
    await expect(save(page)).toHaveAttribute('aria-disabled', 'true');

    // The next chart opens with the bass muted again, and the choice survives a reload, asked
    // no more.
    await page
        .getByRole('button', { name: /songbook|Back/i })
        .first()
        .click();
    await songLink(page, 'Minor swing sketch', 'Jazz').click();
    await page.waitForSelector('.bar');
    await expect(chip(page, 'Bass')).toHaveAttribute('aria-pressed', 'false');
    await expect(save(page)).toHaveAttribute('aria-disabled', 'true');
    await page.reload();
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.waitForSelector('.bar');
    await expect(chip(page, 'Bass')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('region', { name: 'What do you play?' })).toHaveCount(0);
    await page.getByRole('button', { name: /^You play: Bass/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await expect(sheet.getByRole('radio', { name: /^Bass/ })).toBeChecked();
});

test('Just listening answers the question and changes nothing on the stand', async ({ page }) => {
    await freshDevice(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.waitForSelector('.bar');
    const prompt = page.getByRole('region', { name: 'What do you play?' });
    await prompt.getByRole('button', { name: 'Just listening' }).click();
    await expect(prompt).toBeHidden();
    for (const lane of ['Drums', 'Bass', 'Chords']) {
        await expect(chip(page, lane)).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(page.getByRole('button', { name: /^You play/ })).toHaveCount(0);
    await page.reload();
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.waitForSelector('.bar');
    await expect(page.getByRole('region', { name: 'What do you play?' })).toHaveCount(0);
});

test('a B♭ horn reads the chords a whole step up, an E♭ horn a sixth up; editing shows concert', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.waitForSelector('.bar');
    const first = page.locator('.bar').first().locator('.chord');
    await expect(first).toHaveText(['C7']);

    await choose(page, /^Horn \(B♭\)/);
    await expect(first).toHaveText(['D7']);
    await expect(page.getByRole('button', { name: /^You play: B♭ horn, B♭ chords/ })).toBeVisible();
    // The chip and "you" mark fit the chips' row, even on a phone.
    const row = await page.locator('.band-controls').evaluate((el) => {
        const box = el.getBoundingClientRect();
        const chips = [...el.children].map((c) => c.getBoundingClientRect());
        return {
            fits: el.scrollWidth <= el.clientWidth + 1,
            inside: chips.every((c) => c.left >= box.left - 1 && c.right <= box.right + 1),
            onScreen: box.right <= window.innerWidth + 1,
        };
    });
    expect(row).toEqual({ fits: true, inside: true, onScreen: true });
    // The soloist is the horn's lane.
    await expect(chip(page, 'Soloist')).toHaveAttribute('aria-pressed', 'false');
    await expect(save(page)).toHaveAttribute('aria-disabled', 'true');

    await choose(page, /^Horn \(E♭\)/);
    await expect(first).toHaveText(['A7']);
    // The Key stays concert: it is the song's key, and the chip says how the chords read.
    await expect(page.getByRole('button', { name: 'Key: C' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit chart' }).click();
    await expect(page.getByRole('button', { name: /^You play: E♭ horn, concert/ })).toBeVisible();
    await expect(page.locator('.bar').first()).toContainText('C7');
});

test('rhythm guitar mutes the band’s chords and turns the stand to the neck', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.waitForSelector('.bar');
    await choose(page, /^Guitar — rhythm/);
    await expect(chip(page, 'Chords')).toHaveAttribute('aria-pressed', 'false');
    await expect(chip(page, 'Bass')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Neck', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    await expect(page.getByRole('region', { name: 'Neck' })).toBeVisible();
    await expect(save(page)).toHaveAttribute('aria-disabled', 'true');

    // Lead guitar keeps the band's chords; its lane is the soloist's.
    await choose(page, /^Guitar — lead/);
    await expect(chip(page, 'Chords')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'Soloist')).toHaveAttribute('aria-pressed', 'false');
});
