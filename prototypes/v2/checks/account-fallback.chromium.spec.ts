import { openWithAccounts, releaseApi, shapeApi, signUp } from './account-helpers';
import { appUrl, expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * The case the deadline fallback was written for (#1357 patch P1-4), against the real API.
 *
 * `account-entry.spec.ts` proves the guest half on both projects with no API at all: a hung
 * origin does not hold the song list, and the list that appears says it is a fallback. What only
 * a SIGNED-IN device can show is why that sentence has to exist — here the guest songbook is a
 * different library under the same heading, and a silent swap would be a wrong answer rather
 * than a slow one. The held response then lands with a genuine session and everything proceeds
 * exactly as an on-time answer would have: notice gone, account library in place.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 */

const SONGBOOK = 'Let’s play something.';

test('a signed-in device whose session read hangs gets a labelled fallback, then its own library', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');

    // Hold the session read of the next page load, and ONLY that — the library download and
    // everything else this account does go through untouched, so what is under test is the one
    // read the songbook waits on. Held under the test's control rather than behind a timer: the
    // assertions below then cannot pass by out-waiting anything. `shapeApi` explains why this is
    // an init script rather than `page.route`.
    await shapeApi(page, 'hold', { only: '/api/auth/session' });

    try {
        await page.goto(appUrl());
        await expect(page.getByRole('heading', { name: SONGBOOK })).toBeVisible();
        // The deadline releases the list rather than leaving it behind a loading line — and what
        // it releases is the GUEST library, because this device's session is still an open
        // question. Both halves are asserted: the sentence, and the heading it is explaining.
        await expect(page.getByTestId('account-fallback')).toContainText(
            'Couldn’t reach your account',
        );
        await expect(page.getByTestId('library-heading')).toHaveText('Your songbook');
        // That notice IS the proof this device asked: `fellBack` is set only when a read was
        // started and has not answered, and the gate that keeps a never-signed-in device off the
        // wire (`deviceMayHoldAccount`) would have skipped it entirely. Nothing is asserted
        // against `page.on('request')` here, and deliberately: `shapeApi` holds the call inside
        // the page's own `fetch`, so it never reaches the network layer to be observed. The
        // wire-level count lives in `account-entry.spec.ts`, where no stub is in the way.
    } finally {
        await releaseApi(page);
    }

    // The late answer retires the notice and the account library takes the page back.
    await expect(page.getByTestId('account-fallback')).toHaveCount(0);
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
});
