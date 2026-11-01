import type { Page } from '@playwright/test';
import {
    expect,
    measureSong,
    seedGuestDocuments,
    seedStarters,
    songLink,
    starterDocuments,
    test,
} from './fixtures';

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
    // with no footer in either state and nothing in the header hidden for playing (#1969), the
    // box is the same in both.
    expect(playing).toEqual(stopped);
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

/** A tempo nudge, then Save: the simplest real action that announces itself in the toast, and
 * the same sentence every time. */
async function saveAChange(page: Page) {
    await page.getByRole('button', { name: 'Faster' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
}

test('a plain open announces nothing — the header already says where the song lives', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').click();
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');
    // #1700: opening used to toast "Saved on this device" for a song nobody had just saved.
    // Held for longer than a render, so a late message would have landed by now.
    await page.waitForTimeout(500);
    await expect(page.getByTestId('stand-toast')).toHaveAttribute('data-empty', 'true');
});

test('an action announces a message in the toast that auto-dismisses on its own', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').click();
    await saveAChange(page);
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
    await saveAChange(page);
    const toast = page.getByTestId('stand-toast');
    await expect(toast).toContainText('Saved on this device');
    // Marks the CURRENT text node so the re-review's node-replacement check below can tell "the
    // same node, mutated in place" from "a fresh element React mounted".
    await page.evaluate(() => {
        const span = document.querySelector('[data-testid="stand-toast"] span');
        if (span) {
            (span as unknown as { __marker?: boolean }).__marker = true;
        }
    });

    // Re-set the SAME text well inside the first window's 4s.
    await page.waitForTimeout(1500);
    await saveAChange(page);
    await expect(toast).toContainText('Saved on this device');

    // #1460 re-review P2 #2 — a repeat of the identical sentence must still be a genuine node
    // REPLACEMENT (`key={messageToken}` on the span), which is what makes a screen reader
    // announce it again: React bails out of updating a text node whose value is unchanged, so
    // updating in place would leave nothing for a live region's mutation observer to react to. A
    // custom property set directly on the DOM element instance survives an in-place text update
    // but is lost the moment React unmounts/remounts the node.
    // Polled, not read once: the toast already says "Saved on this device" from the first Save,
    // so the assertion above passes before the second Save lands. Until #1760 an edit's own
    // "Draft recovered" toast sat between the two and hid that race. The window stays inside
    // the first toast's 4s, so a span that is never replaced still fails here.
    await expect
        .poll(
            () =>
                page.evaluate(() => {
                    const span = document.querySelector('[data-testid="stand-toast"] span');
                    return (span as unknown as { __marker?: boolean } | null)?.__marker === true;
                }),
            { timeout: 2000 },
        )
        .toBe(false);

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
    await page.getByLabel('Style', { exact: true }).selectOption('Rock');
    await expect(page.getByLabel('Style', { exact: true })).toBeEnabled();
    await page.waitForTimeout(500);
    const history = await page.evaluate(
        () => (window as unknown as { __toastHistory: string[] }).__toastHistory,
    );
    expect(history.some((text) => text.includes('Updating'))).toBe(false);
});

function longChart() {
    return measureSong(
        [
            'long-chart',
            'Long chart',
            'Jazz',
            'C',
            Array.from({ length: 64 }, (_, i) => ['Cmaj7', 'Am7', 'Dm7', 'G7'][i % 4]).join(' | '),
            110,
        ],
        new Date(Date.now() - 60_000).toISOString(),
    );
}

test('no Resume follow on a chart that fits, whatever is scrolled or paged (#1986)', async ({
    page,
}) => {
    // Tall enough that the three-row starter fits on a phone too.
    await page.setViewportSize({ width: 390, height: 1800 });
    await seedStarters(page);
    await songLink(page, 'Blue pocket').click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    const scroller = page.locator('.chart-scroll');
    expect(await scroller.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await scroller.press('PageDown');
    await scroller.dispatchEvent('wheel', { deltaY: 300 });
    await page.waitForTimeout(400);
    await expect(page.getByTestId('resume-follow')).toHaveCount(0);
});

test('Resume follow only appears playing with Following off, and hides on resume or stop', async ({
    page,
}) => {
    // A chart long enough to scroll: the pill needs the playing row to be scrolled out of view
    // (#1986), which a chart that fits never does.
    await seedGuestDocuments(page, [...starterDocuments(), longChart()]);
    await songLink(page, 'Long chart').click();
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
    // 44px tap target. A layout box can read 43.9999 under load (sub-pixel rounding while the pill
    // animates in), so the floor allows half a pixel; a real regression loses whole pixels.
    expect(pillBox?.height).toBeGreaterThanOrEqual(43.5);

    // Tapping it resumes Following and hides the pill again — the only direction left; turning
    // Following off is a scroll/wheel/touch gesture now, not a click on this control.
    await pill.click();
    await expect(pill).toHaveCount(0);
    // Re-review P3 — focus moves to `.chart-scroll` on activation (it unmounts the pill), via
    // `.focus({ preventScroll: true })` from a pointer click handler; `:focus-visible` (not plain
    // `:focus`) is what must govern its outline, or every pointer tap here would ring the whole
    // chart the way a real keyboard Tab-to-focus should.
    await expect(page.locator('.chart-scroll')).toBeFocused();
    expect(
        await page.locator('.chart-scroll').evaluate((el) => getComputedStyle(el).outlineStyle),
    ).toBe('none');

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

/**
 * Re-review P3 — WebKit fires no `focusout` when the focused element (the warning's own close
 * button) is removed from under it, which could leave `toastHeld` stuck `true` forever — nothing
 * left to hover/focus, so nothing would ever fire `onMouseLeave`/`onBlur` to clear it, and every
 * later `info` message would silently never auto-dismiss again. This reproduces the same
 * "nothing left to leave" shape on every engine, not just WebKit's quirk: the mouse stays
 * hovering the toast's own screen position through the dismiss (the close button disappears
 * under the pointer, so `onMouseLeave` never fires either), which is exactly what the fix —
 * resetting `toastHeld` the moment the toast goes EMPTY, rather than relying on a leave/blur
 * event from a node that may no longer be there — is for.
 */
test('dismissing a warning while still hovering it does not stick the pause for later messages', async ({
    page,
}) => {
    await seedStarters(page);
    await page.locator('.song-link', { hasText: 'Blue pocket' }).click();
    await page.getByRole('button', { name: 'Edit chart' }).click();
    await page.getByLabel('Song title').fill('Blue pocket edited');
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    Object.keys(localStorage).filter((key) =>
                        key.startsWith('ensemble-v2-preview:recovery:'),
                    ).length,
            ),
        )
        .toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Back to songbook' }).click();

    const row = page.locator('.song-table .song-row', { hasText: 'Blue pocket' });
    await row.getByRole('button', { name: 'More actions for Blue pocket' }).click();
    await page.getByTestId('row-menu-rename').click();
    await page.getByTestId('row-menu-rename-input').fill('Renamed via row menu');
    await page.getByTestId('row-menu-rename-save').click();

    const toast = page.getByTestId('stand-toast');
    await expect(toast).toHaveAttribute('data-tone', 'warning');
    const dismiss = toast.getByRole('button', { name: 'Dismiss' });
    await dismiss.hover();
    await dismiss.click();
    await expect(toast).toHaveAttribute('data-empty', 'true');

    // A fresh `info` message (saving a copy of a different song) must still auto-dismiss on
    // schedule — proof `toastHeld` did not stay stuck `true` from the dismiss above.
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await page.locator('.song-link', { hasText: 'Minor swing sketch' }).click();
    await saveAChange(page);
    await expect(toast).toContainText('Saved on this device');
    await expect(toast).toHaveAttribute('data-empty', 'true', { timeout: 6000 });
});

/**
 * Review P3 — `.stand-stack` is a full-width-capped, fixed-position box sitting over the bottom
 * of the chart at every moment, whether or not anything inside it is showing. On a narrow phone
 * viewport the empty space AROUND the pill (inside the stack's own bounding box, to its left and
 * right) used to intercept taps meant for the chord grid underneath — `pointer-events: none` on
 * the stack, `auto` on each visible child, is the fix. `elementFromPoint` beside the pill is the
 * direct proof: it must resolve to the chart, never to the (invisible) stack.
 */
test('the empty space around the pill does not eat taps meant for the chart', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedGuestDocuments(page, [...starterDocuments(), longChart()]);
    await songLink(page, 'Long chart').click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await page.locator('.chart-scroll').press('PageDown');
    const pill = page.getByTestId('resume-follow');
    await expect(pill).toBeVisible();

    const pillBox = await pill.boundingBox();
    expect(pillBox).not.toBeNull();
    // A point beside the pill (same row, well clear of it horizontally) but still inside the
    // stack's own full-width bounding box — exactly where the bug lived.
    const point = { x: 20, y: pillBox!.y + pillBox!.height / 2 };
    const hitsChart = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return !!el?.closest('.chart-scroll') && !el?.closest('.stand-stack');
    }, point);
    expect(hitsChart).toBe(true);
    await page.getByRole('button', { name: 'Stop playback' }).click();
});
