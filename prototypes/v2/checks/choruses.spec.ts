import type { Page } from '@playwright/test';
import { appUrl, editorRevealed, expect, songLink, test } from './fixtures';

/**
 * #1475: a chart that counts its choruses plays that many and stops; Loop (the default) plays
 * on. Observed through the chart's own pointer — every time its first chord becomes current is
 * one more pass of the form — and the transport's Play/Stop button, never by sampling the
 * clock, so a slow CI WebKit only takes longer.
 */

declare global {
    interface Window {
        /** The name of each chord the stand made current, in order, while armed. */
        __chorusEvidence: { armed: boolean; current: string[] };
    }
}

async function observePointer(page: Page) {
    await page.addInitScript(() => {
        const evidence = { armed: false, current: [] as string[] };
        window.__chorusEvidence = evidence;
        // Read the mutation RECORDS, not the DOM (as `semantic-playback.spec.ts` does): a
        // starved tab can batch two transitions, and only the records keep both.
        new MutationObserver((records) => {
            if (!evidence.armed) {
                return;
            }
            for (const record of records) {
                const target = record.target as Element;
                if (
                    target.classList?.contains('chord') &&
                    record.attributeName === 'aria-current' &&
                    record.oldValue !== 'true' &&
                    target.getAttribute('aria-current') === 'true'
                ) {
                    evidence.current.push(target.textContent?.trim() ?? '');
                }
            }
        }).observe(document, {
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['aria-current'],
        });
    });
}

/** How many passes of the form have started: the new song's form opens on its only C. */
const passes = (page: Page) =>
    page.evaluate(() => window.__chorusEvidence.current.filter((name) => name === 'C').length);

async function arm(page: Page) {
    await page.evaluate(() => {
        window.__chorusEvidence.current = [];
        window.__chorusEvidence.armed = true;
    });
}

test('a chart set to 2 choruses plays two and stops; Loop plays on; the count saves (#1475)', async ({
    page,
}) => {
    test.setTimeout(90_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await observePointer(page);
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Two choruses');
    // The new song's four bars (C, G, Am, F) are the form: short, so a pass is quick.
    const choruses = page.getByLabel('Choruses', { exact: true });
    await expect(choruses).toHaveValue('loop');
    await choruses.selectOption('2');
    await expect(choruses).toHaveValue('2');
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('240');
    // Saved with its fast tempo, so the reopened song below plays as quickly.
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await save.click();
    await expect(save).toBeDisabled();
    await expect(page.locator('.error-banner')).toHaveCount(0);

    const play = page.getByRole('button', { name: 'Start playback', exact: true });
    const stop = page.getByRole('button', { name: 'Stop playback', exact: true });

    // Two choruses, then the transport returns to stopped by itself.
    await arm(page);
    await play.click();
    await expect(stop).toBeVisible();
    await expect(play).toBeVisible({ timeout: 45_000 });
    expect(await passes(page)).toBe(2);
    // It stopped after the second chorus's last bar (F), not inside it.
    expect(await page.evaluate(() => window.__chorusEvidence.current.at(-1))).toBe('F');
    // Nothing more plays once it has stopped.
    await expect(page.locator('.chord[aria-current="true"]')).toHaveCount(0);

    // The count saved, and reopens with the song.
    await page.reload();
    await songLink(page, 'Two choruses').first().click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await expect(choruses).toHaveValue('2');

    // Back to Loop: the band plays on past the second pass.
    await choruses.selectOption('loop');
    await expect(choruses).toHaveValue('loop');
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await arm(page);
    await play.click();
    await expect.poll(() => passes(page), { timeout: 45_000 }).toBeGreaterThanOrEqual(3);
    await expect(stop).toBeVisible();
    await stop.click();
    await expect(play).toBeVisible();

    await page.evaluate(() => {
        window.__chorusEvidence.armed = false;
    });
    expect(pageErrors).toEqual([]);
});
