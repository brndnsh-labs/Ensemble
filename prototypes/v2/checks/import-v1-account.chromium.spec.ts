import { openWithAccounts, signUp } from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * The v1 import while SIGNED IN (#1274 patch R2).
 *
 * The import is guest-only and stays that way — it writes this device's songbook and never
 * the account — but it must still be reachable, because at the cutover a musician with an
 * account is the normal case and the owner's decision makes the song-menu entry permanent.
 * So what this spec pins is the honest version of that: the entry is there, the songs land
 * in the guest songbook, the account library and the network are untouched, and the card
 * says in the account page's own words how to get them the rest of the way.
 *
 * Since #1359 the offer to copy them into the account opens on the back of that run — what
 * that offer then does is `import-v1-adopt.chromium.spec.ts`'s subject. It changes nothing
 * here: until the musician answers it, the import has still written one songbook, and the
 * "not one byte was sent" reading below is exactly as load-bearing as it was.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 */

/** Every Save this page actually sent. Zero is the proof that nothing reached the account. */
function countSaveRequests(page: import('@playwright/test').Page): () => number {
    let count = 0;
    page.on('request', (request) => {
        if (
            request.method() === 'POST' &&
            new URL(request.url()).pathname === '/api/documents/save'
        ) {
            count += 1;
        }
    });
    return () => count;
}

/** The guest songbook read straight out of IndexedDB — invisible on screen while signed in. */
function guestTitles(page: import('@playwright/test').Page): Promise<string[]> {
    return page.evaluate(
        () =>
            new Promise<string[]>((resolve, reject) => {
                const open = indexedDB.open('ensemble-v2-preview', 1);
                open.onerror = () => reject(new Error('guest songbook did not open'));
                open.onsuccess = () => {
                    const all = open.result
                        .transaction('documents', 'readonly')
                        .objectStore('documents')
                        .getAll();
                    all.onerror = () => reject(new Error('guest songbook did not read'));
                    all.onsuccess = () =>
                        resolve(all.result.map((row: { title: string }) => row.title));
                };
            }),
    );
}

test('signed in, the song menu still brings v1 songs over — into this device’s songbook, with nothing sent to the account', async ({
    page,
}) => {
    await page.addInitScript(() => {
        localStorage.setItem(
            'ensemble_userPresets',
            JSON.stringify([
                {
                    name: 'Old tune',
                    sections: btoa('[{"l":"A","v":"I | IV | V | I"}]'),
                    isMinor: false,
                    timestamp: 1750000000000,
                },
            ]),
        );
    });
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    const saves = countSaveRequests(page);
    await signUp(page);
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');

    // Nothing opens by itself over the account songbook; the way in is the menu.
    await expect(page.getByTestId('v1-import')).toHaveCount(0);
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByTestId('bring-over-v1').click();

    const card = page.getByTestId('v1-import');
    await expect(card).toBeVisible();
    // Said up front, in the account page's own words (`account-page.tsx`), not paraphrased.
    await expect(page.getByTestId('v1-import-account-pointer')).toContainText(
        'These go to this device’s songbook first',
    );
    await expect(page.getByTestId('v1-import-account-pointer')).toContainText(
        'Add this device’s songs',
    );

    // The counter has to be proven live, or "nothing was sent" is `0 === 0` the day this
    // endpoint is renamed (#1274 patch N7). The New song above is a real account Save.
    await expect.poll(saves).toBeGreaterThan(0);
    const before = saves();
    await card.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('v1-import-result')).toContainText('Imported 1');
    // Repeated afterwards, because the result is the moment someone asks "so where is it?".
    await expect(page.getByTestId('v1-import-account-pointer')).toBeVisible();

    // It landed in the GUEST songbook…
    expect(await guestTitles(page)).toContain('Old tune');
    // …the account songbook on screen is untouched…
    await expect(page.locator('.song-name').filter({ hasText: 'Old tune' })).toHaveCount(0);
    // …and not one byte of it was sent anywhere.
    expect(saves()).toBe(before);
    expect(await page.evaluate(() => localStorage.getItem('ensemble_userPresets'))).toContain(
        'Old tune',
    );
});
