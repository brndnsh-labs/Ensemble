import { asHeldDevice, releaseApi, shapeApi } from './account-helpers';
import { appUrl, expect, test } from './fixtures';

/**
 * The per-device account switch (#1262, default flipped on by the cutover #1357), on both
 * projects and with no account API at all.
 *
 * This is the plain guest fixture on purpose: the claims here are about a device that has never
 * signed in and a server it cannot talk to. Accounts are on by default now, so the one `/api/*`
 * request a guest makes is every device's startup path — and it must never be able to hold up
 * the songbook, the chart or playback. `?accounts=off` is the way out, and it has to be worth
 * having: a device that asked for it makes no request at all.
 */

const SONGBOOK = 'Let’s play something.';

/** Every `/api/*` request the page makes, as `METHOD /path`. */
function apiCalls(page: import('@playwright/test').Page): string[] {
    const seen: string[] = [];
    page.on('request', (request) => {
        const { pathname } = new URL(request.url());
        if (pathname === '/api' || pathname.startsWith('/api/')) {
            seen.push(`${request.method()} ${pathname}`);
        }
    });
    return seen;
}

test('a default profile gets the account entry point and asks the server nothing', async ({
    page,
}) => {
    const calls = apiCalls(page);

    await page.goto(appUrl());
    await expect(page.getByRole('heading', { name: SONGBOOK })).toBeVisible();
    await expect(page.getByTestId('account-sign-in')).toBeVisible();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    // Past the moment an ungated bootstrap read would have fired: the read is gated on the
    // songbook being ready, which the assertions above have already waited through.
    await page.waitForTimeout(500);

    // NOT "one request" — none. A device that has never held an account has no session to
    // discover (`deviceMayHoldAccount`), and a musician who never signed in should not have this
    // app talking to a server on their behalf. Accounts are on: the entry point is right there.
    expect(calls).toEqual([]);
});

test('a device that holds an account does ask for its session, once', async ({ page }) => {
    // The other side of the gate, and the one that matters for sign-in persistence: a device
    // with account records must still discover the session it has, or signing in would not
    // survive a reload.
    await asHeldDevice(page);
    const calls = apiCalls(page);

    await page.goto(appUrl());
    await expect(page.getByRole('heading', { name: SONGBOOK })).toBeVisible();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);

    // Exactly one, and only that one: nothing downloads a library or queues a Save for a device
    // the server has not recognised.
    await expect.poll(() => calls).toEqual(['GET /api/auth/session']);
});

test('?accounts=off turns every account surface off, and makes no request at all', async ({
    page,
}) => {
    const calls = apiCalls(page);

    await page.goto(appUrl('?accounts=off'));
    await expect(page.getByRole('heading', { name: SONGBOOK })).toBeVisible();
    // The parameter is consumed, exactly as the opt-in was: the choice belongs to this device,
    // not to a URL somebody might share.
    expect(page.url()).not.toContain('accounts=');
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.getByTestId('account-sign-in')).toHaveCount(0);
    await expect(page.getByTestId('account-entry')).toHaveCount(0);

    // Not "no session request" — NO request. The gate is in front of the client, not inside it.
    expect(calls).toEqual([]);
});

test('the opted-out notice is the way back, in the product, without a reload', async ({ page }) => {
    const calls = apiCalls(page);

    await page.goto(appUrl('?accounts=off'));
    // Consuming the parameter strips it, so without this notice the only route back would be a
    // query parameter nobody has written down.
    const notice = page.getByTestId('accounts-off');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Account features are off on this device.');
    expect(calls).toEqual([]);

    await page.getByTestId('accounts-turn-on').click();

    // Same page, no navigation: the shell re-renders into the state a fresh load would reach.
    await expect(page.getByTestId('account-sign-in')).toBeVisible();
    await expect(notice).toHaveCount(0);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    // Still nothing on the wire: this device has never held an account, so switching the UI
    // back on gives it the entry point, not a request. Signing in is what changes that.
    await page.waitForTimeout(500);
    expect(calls).toEqual([]);

    // It stuck: a reload comes back on, with no parameter involved.
    await page.reload();
    await expect(page.getByTestId('account-sign-in')).toBeVisible();
    await expect(page.getByTestId('accounts-off')).toHaveCount(0);
});

test('a default profile is never shown the opted-out notice', async ({ page }) => {
    await page.goto(appUrl());
    await expect(page.getByTestId('account-sign-in')).toBeVisible();
    await expect(page.getByTestId('accounts-off')).toHaveCount(0);
    // NOTE: this guards the claim, not the `resolved` gate that `ensemble.tsx` puts in front of
    // the notice. Measured 2026-09-20 with a MutationObserver over the whole document: with that
    // gate removed the notice is still never attached, because the switch's effect resolves
    // before `ready` flips and the songbook therefore never mounts with `enabled` still false.
    // The gate is insurance against that ordering changing, and it is deliberately not
    // discoverable from out here — do not add a contrived test claiming otherwise.
});

test('the opt-out survives a reload with no parameter in the URL', async ({ page }) => {
    await page.goto(appUrl('?accounts=off'));
    await expect(page.getByTestId('account-sign-in')).toHaveCount(0);

    // A second load of the plain URL: the device's answer is what decides, and the default must
    // not quietly reassert itself the moment the parameter is gone.
    const calls = apiCalls(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: SONGBOOK })).toBeVisible();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.getByTestId('account-sign-in')).toHaveCount(0);
    expect(calls).toEqual([]);

    // And back on request, which is the only thing that may overturn it.
    await page.goto(appUrl('?accounts=on'));
    await expect(page.getByTestId('account-sign-in')).toBeVisible();
});

test('a default profile still plays as a guest when the server is unreachable', async ({
    page,
}) => {
    // On a device that HOLDS an account, so the read it is about actually happens. `serve.mjs`
    // 404s `/api/*` until a worker attaches the API, which would map to a generic message; a
    // rejected `fetch` is what a genuinely unreachable server looks like, and it is the path the
    // "keep playing as a guest" copy exists for.
    await asHeldDevice(page);
    await shapeApi(page, 'unreachable');

    await page.goto(appUrl());
    await expect(page.getByRole('heading', { name: SONGBOOK })).toBeVisible();
    // The entry point renders even though the session could not be read: the alternative is a
    // feature that silently never appears when the network is having a bad day.
    await expect(page.getByTestId('account-sign-in')).toBeVisible();
    // And the songbook is a songbook, not a loading line: a failed read settles the question.
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.locator('.song-row').first()).toBeVisible();

    // Guest playback is untouched by any of it.
    await page.getByRole('button', { name: 'Open chart →' }).click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback' }).click();

    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByTestId('account-sign-in')).toBeVisible();
});

test('a server that answers with an error leaves the guest songbook exactly as it was', async ({
    page,
}) => {
    // The other half of "unreachable": an origin that IS there and refuses. A 5xx carries no
    // information about who this device is, so the session state stays unknown and the guest
    // songbook is what it was before the question was asked.
    await asHeldDevice(page);
    await shapeApi(page, 'error');

    await page.goto(appUrl());
    await expect(page.getByRole('heading', { name: SONGBOOK })).toBeVisible();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.locator('.song-row').first()).toBeVisible();
    await expect(page.getByTestId('account-sign-in')).toBeVisible();

    await page.getByRole('button', { name: 'Open chart →' }).click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback' }).click();
});

test('an origin that accepts the session request and never answers it does not hold the songbook', async ({
    page,
}) => {
    // The nastiest shape of a bad server, and the reason `use-account-session.ts` bounds the
    // first read: `fetch` has no deadline of its own, so a connection that is accepted and then
    // left open never rejects. Held under the TEST's control rather than behind a timer, so the
    // assertions below cannot pass by out-waiting anything — the request is provably still
    // outstanding while the song list renders.
    await asHeldDevice(page);
    await shapeApi(page, 'hold');

    try {
        await page.goto(appUrl());
        await expect(page.getByRole('heading', { name: SONGBOOK })).toBeVisible();
        // The whole claim: the library stops waiting, and the songs are there to open.
        await expect(page.getByTestId('library-loading')).toHaveCount(0);
        await expect(page.locator('.song-row').first()).toBeVisible();
        // And it is not a SILENT fallback (patch P1-4): while the request is STILL outstanding,
        // the songbook says which library this is and why.
        await expect(page.getByTestId('account-fallback')).toContainText(
            'Couldn’t reach your account',
        );

        await page.getByRole('button', { name: 'Open chart →' }).click();
        await page.getByRole('button', { name: 'Start playback', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
        await page.getByRole('button', { name: 'Stop playback' }).click();
    } finally {
        await releaseApi(page);
    }

    // The late answer retires the notice — a fallback that outlived the thing it was standing in
    // for would be its own wrong claim.
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByTestId('account-fallback')).toHaveCount(0);
});

test('a browser without passkeys explains itself instead of offering a dead button', async ({
    page,
    browserName,
}) => {
    // Playwright's Linux WebKit build has no usable WebAuthn, which makes this project a real
    // unsupported browser rather than a stub of one — exactly the device the copy is written for.
    test.skip(browserName === 'chromium', 'Chromium supports WebAuthn.');
    await shapeApi(page, 'unreachable');
    // No `asHeldDevice`: the dialog is user-initiated, so this is a plain first-time visitor —
    // which is exactly who meets the "passkeys aren't available here" copy.
    await page.goto(appUrl());
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
    await shapeApi(page, 'unreachable');
    await page.goto(appUrl());
    await expect(page.getByRole('heading', { name: SONGBOOK })).toBeVisible();

    await page.getByTestId('account-sign-in').click();
    await page.getByTestId('account-create').click();
    await expect(page.getByTestId('account-error')).toHaveText(
        'Can’t reach the server. You can keep playing as a guest.',
    );
});
