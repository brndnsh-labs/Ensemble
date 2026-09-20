import { appUrl, expect, test } from './fixtures';

/**
 * The dark-launch gate (#1262), on both projects and with no account API at all.
 *
 * This is the plain guest fixture on purpose: the whole point of the gate is that a device which
 * never opted in behaves exactly as it did before this story — no entry point, and not one
 * `/api/*` request. And on a device that HAS opted in, an unreachable server must still leave a
 * playable guest music stand, because accounts enhance that path and never gate it.
 */

const SONGBOOK = 'Let’s play something.';

test('a default profile shows no account UI and never calls the API', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
        const { pathname } = new URL(request.url());
        if (pathname === '/api' || pathname.startsWith('/api/')) {
            apiCalls.push(`${request.method()} ${pathname}`);
        }
    });

    await page.goto(appUrl());
    await expect(page.getByRole('heading', { name: SONGBOOK })).toBeVisible();
    // The session read is gated on the songbook being ready, so waiting for the heading is also
    // waiting past the moment an ungated bootstrap would have fired.
    await page.waitForTimeout(500);

    await expect(page.getByTestId('account-entry')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0);
    expect(apiCalls).toEqual([]);
});

test('an opted-in device still plays as a guest when the server is unreachable', async ({
    page,
}) => {
    // `scripts/serve.mjs` 404s `/api/*` until a worker attaches the API, which would map to a
    // generic message; aborting the request instead is what a genuinely unreachable server looks
    // like to `fetch`, and it is the path the "keep playing as a guest" copy exists for.
    await page.route('**/api/**', (route) => route.abort());

    await page.goto(appUrl('?accounts=on'));
    await expect(page.getByRole('heading', { name: SONGBOOK })).toBeVisible();
    expect(page.url()).not.toContain('accounts=');
    // The entry point renders even though the session could not be read: the alternative is a
    // feature that silently never appears when the network is having a bad day.
    await expect(page.getByTestId('account-sign-in')).toBeVisible();

    // Guest playback is untouched by any of it.
    await page.getByRole('button', { name: 'Open chart →' }).click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback' }).click();

    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByTestId('account-sign-in')).toBeVisible();
});

test('a browser without passkeys explains itself instead of offering a dead button', async ({
    page,
    browserName,
}) => {
    // Playwright's Linux WebKit build has no usable WebAuthn, which makes this project a real
    // unsupported browser rather than a stub of one — exactly the device the copy is written for.
    test.skip(browserName === 'chromium', 'Chromium supports WebAuthn.');
    await page.route('**/api/**', (route) => route.abort());
    await page.goto(appUrl('?accounts=on'));
    await expect(page.getByRole('heading', { name: SONGBOOK })).toBeVisible();

    await page.getByTestId('account-sign-in').click();
    await expect(
        page.getByRole('heading', { name: 'Passkeys aren’t available here.' }),
    ).toBeVisible();
    // No disabled mystery buttons: the paths that cannot work are not offered at all.
    await expect(page.getByTestId('account-create')).toHaveCount(0);
    await expect(page.getByTestId('account-do-sign-in')).toHaveCount(0);
    await expect(page.locator('dialog.account-dialog')).toContainText('export');
});

test('an unreachable server says so, and says guest playback still works', async ({
    page,
    browserName,
}) => {
    test.skip(browserName !== 'chromium', 'needs WebAuthn to reach the ceremony path at all.');
    await page.route('**/api/**', (route) => route.abort());
    await page.goto(appUrl('?accounts=on'));
    await expect(page.getByRole('heading', { name: SONGBOOK })).toBeVisible();

    await page.getByTestId('account-sign-in').click();
    await page.getByTestId('account-create').click();
    await expect(page.getByTestId('account-error')).toHaveText(
        'Can’t reach the server. You can keep playing as a guest.',
    );
});
