import { expect, seedStarters, songLink, test } from './fixtures';

/**
 * #1460 — the stand drops its footer: messages become a toast, sync status moved into Song
 * actions (covered by the account specs, which can produce a real `sync.failure`), and Resume
 * follow became a pill. This file covers the acceptance items that need no account: no footer in
 * either playback state, the toast's auto-dismiss and always-mounted live region, and the pill's
 * lifecycle. Sound-download progress persisting while `busy` — no auto-dismiss timer runs at all
 * while `standNoticeTone !== 'info'` (`app/ensemble.tsx`) — is exercised by
 * `foundation.spec.ts`'s "a feel staged for the next bar settles..." test, which reads the same
 * toast while a real busy window is open; a second, artificially-delayed-network version of that
 * proof here was dropped for flakiness (pack installs fan out across many parallel file fetches,
 * which made "still busy after Nms" a race rather than a fact).
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

test('a message set twice in a row re-arms the auto-dismiss both times', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').click();
    const toast = page.getByTestId('stand-toast');
    await expect(toast).toContainText('Saved on this device');
    await expect(toast).toHaveAttribute('data-empty', 'true', { timeout: 6000 });

    // Re-opening the SAME song sets the exact same sentence again (`messageToken` is the re-arm
    // signal a plain string dependency would miss) — it must still dismiss on its own.
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await songLink(page, 'Blue pocket').click();
    await expect(toast).toContainText('Saved on this device');
    await expect(toast).toHaveAttribute('data-empty', 'true', { timeout: 6000 });
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
