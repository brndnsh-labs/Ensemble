import { expect, seedStarters, songLink, test } from './fixtures';

/**
 * #1460 — the stand drops its footer: messages become a toast, sync status moved into Song
 * actions (covered by the account specs, which can produce a real `sync.failure`), and Resume
 * follow became a pill. This file covers the acceptance items that need no account: no footer in
 * either playback state, the toast's auto-dismiss/re-arm and always-mounted live region, the
 * busy-toast debounce (review P3 — no "Updating…" flash on a fast `run()`), and the pill's
 * lifecycle. The sync-failure notice, its own element since review P2 #1, and the no-overlap
 * proof against the Resume-follow pill (review P2 #4) both need a real `sync.failure`, so they
 * live in `account-songbook.chromium.spec.ts` instead.
 */

test('no footer in either playback state, and the chart keeps the height back', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').click();
    await expect(page.locator('.playback-footer')).toHaveCount(0);
    const stopped = await page.locator('.chart-scroll').boundingBox();
    expect(stopped).not.toBeNull();

    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    // Still nowhere, now that the band is actually playing — not just absent at the first check.
    await expect(page.locator('.playback-footer')).toHaveCount(0);
    const playing = await page.locator('.chart-scroll').boundingBox();
    expect(playing).not.toBeNull();
    // A bar that comes and goes on Play/Stop would shift `.chart-scroll`'s own box (Touches #1);
    // with no footer at all in either state, its height cannot SHRINK between the two (playing
    // mode's own `.performance-focus` chrome hides a few more header controls, which can only
    // ever grow it further — never a like-for-like px match).
    expect(playing!.height).toBeGreaterThanOrEqual(stopped!.height);
    await page.getByRole('button', { name: 'Stop playback' }).click();
});

test('the stand never says "Band is playing" or the offline label', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await page.waitForTimeout(300);
    const standText = await page.locator('main.workspace').innerText();
    expect(standText).not.toContain('Band is playing');
    expect(standText).not.toContain('App available offline');
    await page.getByRole('button', { name: 'Stop playback' }).click();
});

test('opening a song announces a message in the toast that auto-dismisses on its own', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').click();
    // `open()` always sets a message ("Saved on this device") on every ordinary open — the
    // simplest real trigger, no dialog involved.
    const toast = page.getByTestId('stand-toast');
    await expect(toast).toHaveAttribute('role', 'status');
    await expect(toast).toHaveAttribute('data-tone', 'info');
    await expect(toast).toContainText('Saved on this device');
    // Auto-dismiss ~4s after it was shown — well before it could be mistaken for the sync
    // failure's persist-until-closed form.
    await expect(toast).toHaveAttribute('data-empty', 'true', { timeout: 6000 });
    // Always mounted, never unmounted: the same node just went empty (#1440's `homeNotice`
    // pattern), which is what makes a screen reader's next announcement reliable.
    await expect(toast).toHaveCount(1);
});

/**
 * Review P2 #5 — the exact regression a text-only effect dependency would reintroduce: if
 * `messageToken` were dropped from the auto-dismiss effect's deps, setting the SAME sentence a
 * second time would not restart the clock at all (React bails out of even re-running the effect,
 * since `message`'s own value is unchanged), and the toast would still clear on the FIRST
 * window's original schedule regardless of the second set.
 */
test('the same message set again inside the first 4s gets a fresh 4s window', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').click();
    const toast = page.getByTestId('stand-toast');
    await expect(toast).toContainText('Saved on this device');

    // Re-set the SAME text well inside the first window's 4s.
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await songLink(page, 'Blue pocket').click();
    await expect(toast).toContainText('Saved on this device');

    // ~3s after the SECOND set (4.5s after the first): still up. Without the re-arm, the FIRST
    // window (armed at t=0, due at t≈4000ms) would already have cleared it by now.
    await page.waitForTimeout(3000);
    await expect(toast).toContainText('Saved on this device');
    await expect(toast).not.toHaveAttribute('data-empty', 'true');

    // And it still dismisses ~4s after the SECOND set, not the first.
    await expect(toast).toHaveAttribute('data-empty', 'true', { timeout: 3000 });
});

/**
 * Review P3 — "Updating…" must not flash on every `run()`, only once `soundProgress` has
 * something real to say or `busy` has held for ~300ms without one. A polled `expect` cannot tell
 * "never appeared" from "appeared and vanished before the last poll", so this records every text
 * the toast's own span ever held via a `MutationObserver` instead.
 */
test('a fast action never flashes "Updating…" in the toast', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.evaluate(() => {
        const node = document.querySelector('[data-testid="stand-toast"] span');
        const seen: string[] = [];
        Object.assign(window, { __toastHistory: seen });
        if (!node) {
            return;
        }
        const record = () => seen.push(node.textContent ?? '');
        record();
        new MutationObserver(record).observe(node, {
            childList: true,
            characterData: true,
            subtree: true,
        });
    });
    // Built-in sounds both sides — no pack download, so this settles in well under 300ms.
    await page.getByLabel('Feel', { exact: true }).selectOption('Rock');
    await expect(page.getByLabel('Feel', { exact: true })).toBeEnabled();
    await page.waitForTimeout(500);
    const history = await page.evaluate(
        () => (window as unknown as { __toastHistory: string[] }).__toastHistory,
    );
    expect(history.some((text) => text.includes('Updating'))).toBe(false);
});

test('Resume follow only appears playing with Following off, and hides on resume or stop', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').click();
    // Stopped: no pill, regardless of Following's internal state.
    await expect(page.getByTestId('resume-follow')).toHaveCount(0);

    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    // Playing and still following: no pill either.
    await expect(page.getByTestId('resume-follow')).toHaveCount(0);

    // Wheel/touch/scroll-key turns Following off, same as before #1460 — only its footer toggle
    // went. `PageDown` is one of the scroll keys `chart-scroll`'s own handler already caught.
    await page.locator('.chart-scroll').press('PageDown');
    const pill = page.getByTestId('resume-follow');
    await expect(pill).toBeVisible();
    const pillBox = await pill.boundingBox();
    expect(pillBox?.height).toBeGreaterThanOrEqual(44);

    // Tapping it resumes Following and hides the pill again — the only direction left; turning
    // Following off is a scroll/wheel/touch gesture now, not a click on this control.
    await pill.click();
    await expect(pill).toHaveCount(0);

    // Scrolling away again, then stopping: hidden immediately, not on the next unrelated render.
    await page.locator('.chart-scroll').press('PageDown');
    await expect(page.getByTestId('resume-follow')).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect(page.getByTestId('resume-follow')).toHaveCount(0);
});

/**
 * Review P3 — `startPlayback` itself re-engages Following. Without it, a scroll while STOPPED
 * (which already turns Following off today) would leave Play starting the band unfollowed, with
 * the pill already showing before anything had moved.
 */
test('scrolling while stopped does not leave the pill showing the instant playback starts', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').click();
    await page.locator('.chart-scroll').press('PageDown');
    await expect(page.getByTestId('resume-follow')).toHaveCount(0); // hidden while stopped anyway

    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await expect(page.getByTestId('resume-follow')).toHaveCount(0);
    await page.getByRole('button', { name: 'Stop playback' }).click();
});
