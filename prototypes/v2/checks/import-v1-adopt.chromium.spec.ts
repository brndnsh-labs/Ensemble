import type { Page } from '@playwright/test';
import { createAccountThroughDialog, openWithAccounts, signUp } from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * A signed-in v1 import flows straight into the adopt offer (#1359).
 *
 * #1274 shipped the import guest-only and pointed at #1268's "Add this device's songs" — two
 * gestures for one intent. What this spec pins is the join: a signed-in run that actually put
 * songs in the guest songbook opens the EXISTING adopt offer itself, scoped to what just landed,
 * and everything either half promised on its own still holds. The import still writes the guest
 * songbook and only the musician's explicit Add reaches the account.
 *
 * The once-per-owner answer is read at two different moments, and only one of them is new:
 * OPENING this offer consults nothing (that is what makes it reachable after a sign-in decline —
 * the musician asked), while ANSWERING it records the same per-device answer any answer has
 * always recorded, which retires the whole-songbook sign-in offer for this owner. Both halves are
 * pinned below.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 */

/** One importable v1 song, seeded before the app's first read of `localStorage`. */
async function seedV1Song(page: Page, name: string): Promise<void> {
    await page.addInitScript((title: string) => {
        localStorage.setItem(
            'ensemble_userPresets',
            JSON.stringify([
                {
                    name: title,
                    sections: btoa('[{"l":"A","v":"I | IV | V | I"}]'),
                    isMinor: false,
                    timestamp: 1750000000000,
                },
            ]),
        );
    }, name);
}

/**
 * A v1 SESSION — the one item with a fixed document id (`v1-session`), which is what a rerun
 * updates in place rather than importing again. The shape is what v1's own `saveCurrentState`
 * emits; `checks/import-v1.spec.ts` seeds the same one, and its byte-level fidelity is owned by
 * `tests/unit/songbook/v1-import.test.ts`.
 */
async function seedV1Session(page: Page, bpm: number): Promise<void> {
    await page.addInitScript((tempo: number) => {
        const lane = (extra: Record<string, unknown>) => ({
            enabled: true,
            voice: 'synth',
            autoSound: false,
            volume: 1,
            reverb: 0.2,
            ...extra,
        });
        localStorage.setItem(
            'ensemble_currentState',
            JSON.stringify({
                sections: [{ id: 'verse', label: 'Verse', value: 'I | vi | IV | V', key: '' }],
                key: 'G',
                timeSignature: '4/4',
                grouping: null,
                isMinor: false,
                notation: 'name',
                lastChordPreset: 'Old session',
                seed: '',
                randomizeSeed: false,
                bpm: tempo,
                complexity: 0.3,
                mixerVersion: 2,
                chords: lane({ style: 'smart', octave: 65, density: 'standard', reverb: 0.3 }),
                bass: lane({ style: 'smart', octave: 36, reverb: 0.05 }),
                soloist: lane({
                    enabled: false,
                    style: 'smart',
                    preset: 'trumpet',
                    octave: 72,
                    reverb: 0.6,
                    mode: 'monophonic',
                    autoMode: true,
                    phrasingIntensity: 0.5,
                }),
                harmony: lane({
                    enabled: false,
                    style: 'smart',
                    octave: 60,
                    reverb: 0.4,
                    complexity: 0.5,
                }),
                groove: lane({
                    swing: 0,
                    swingSub: '8th',
                    humanize: 20,
                    lastDrumPreset: 'Basic Rock',
                    genreFeel: 'Rock',
                    lastSmartGenre: 'Rock',
                    sectionSeedMap: {},
                    pattern: [
                        { name: 'Kick', steps: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] },
                        { name: 'Snare', steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0] },
                        { name: 'HiHat', steps: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
                    ],
                }),
            }),
        );
    }, bpm);
}

/** The guest songbook read straight out of IndexedDB — invisible on screen while signed in. */
function guestTitles(page: Page): Promise<string[]> {
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

const adoptDialog = (page: Page) => page.locator('dialog[aria-labelledby="adopt-guest-title"]');

/**
 * Sign up and leave the sign-in offer UNANSWERED — Escape is deliberately not a decision
 * (`adopt-guest.tsx`), so `hasDecidedAdoption` stays false and this device has never said no.
 * `signUp` from `account-helpers.ts` is the other starting point these tests use: it DECLINES.
 */
async function signUpLeavingAdoptUnanswered(page: Page): Promise<void> {
    await createAccountThroughDialog(page);
    await page.getByTestId('recovery-not-now').click();
    await expect(adoptDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(adoptDialog(page)).toBeHidden();
}

/** Run the import from the song menu — the signed-in way in (#1274 patch R2). */
async function importFromTheSongMenu(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByTestId('bring-over-v1').click();
    await expect(page.getByTestId('v1-import')).toBeVisible();
}

/** A song on the stand, which is where the song menu lives. */
async function newSongOnTheStand(page: Page): Promise<void> {
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
}

test('a signed-in import opens the adopt offer by itself, scoped to the songs it just brought over, and adopting reaches the account', async ({
    page,
}) => {
    await seedV1Song(page, 'Old tune');
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    // The guest starters this device already holds (`lib/starters.ts` seeds three). The scoped
    // offer must leave every one of them out: they are not what the musician just asked for.
    const starters = await page.locator('.song-name').allInnerTexts();
    expect(starters.length).toBeGreaterThan(0);
    expect(starters).not.toContain('Old tune');

    await signUpLeavingAdoptUnanswered(page);
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');

    await newSongOnTheStand(page);
    await importFromTheSongMenu(page);
    // Said before the run, and true before it: the songs land here, then the offer follows.
    await expect(page.getByTestId('v1-import-account-pointer')).toContainText(
        'These go to this device’s songbook first',
    );
    await page.getByTestId('v1-import').getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('v1-import-result')).toContainText('Imported 1');

    // Nobody clicked anything else: the offer opened on the back of the import.
    await expect(adoptDialog(page)).toBeVisible();
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        'Add the song you just brought over to your account?',
    );
    // Exactly the imported song — not the whole guest songbook, starters and all.
    await expect(page.getByTestId('adopt-guest-preview').locator('li')).toHaveText(['Old tune']);

    await page.getByTestId('adopt-guest-confirm').click();
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        'Copied 1 song into this device’s account songbook',
    );
    await page.getByTestId('adopt-guest-done').click();
    await expect(adoptDialog(page)).toBeHidden();

    // In the account library on screen…
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(page.locator('.song-name').filter({ hasText: 'Old tune' })).toHaveCount(1);
    // …and still in the guest songbook, which the copy never touches, beside the starters the
    // scoped offer left alone.
    const guests = await guestTitles(page);
    expect(guests).toContain('Old tune');
    expect(guests).toEqual(expect.arrayContaining(starters));
    // The old app is read-only to all of this.
    expect(await page.evaluate(() => localStorage.getItem('ensemble_userPresets'))).toContain(
        'Old tune',
    );
});

test('declining the post-import offer leaves the songs guest-only, and is remembered exactly as a decline has always been', async ({
    page,
}) => {
    await seedV1Song(page, 'Old tune');
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    const starters = await page.locator('.song-name').allInnerTexts();

    await signUpLeavingAdoptUnanswered(page);
    await newSongOnTheStand(page);
    await importFromTheSongMenu(page);
    await page.getByTestId('v1-import').getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('v1-import-result')).toContainText('Imported 1');
    await expect(adoptDialog(page)).toBeVisible();

    await page.getByTestId('adopt-guest-decline').click();
    await expect(adoptDialog(page)).toBeHidden();

    // Guest-only: the song is on this device and nowhere near the account library.
    expect(await guestTitles(page)).toContain('Old tune');
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(page.locator('.song-name').filter({ hasText: 'Old tune' })).toHaveCount(0);

    // The answer is the same per-device answer `rememberAdoptionDecision` has always recorded:
    // a reload re-attaches the same owner and nothing nags.
    //
    // Settled on the gate the auto-offer itself waits for, not on `library-loading` (patch P3-2):
    // the list stops loading before `sync.documents` is observed, so "no dialog" read there could
    // be a moment too early to mean anything. The account page's own button is enabled by exactly
    // that download (`adoptReady` / `libraryDownloaded`), so waiting for it puts this assertion
    // past the point where an un-latched offer would have opened.
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await page.getByTestId('account-open').click();
    await expect(page.getByTestId('account-page-adopt-guest')).toBeEnabled();
    await expect(page.getByTestId('account-page-adopt-waiting')).toHaveCount(0);
    await expect(adoptDialog(page)).toBeHidden();

    // And the standing invitation is untouched — and asks its own, unscoped question, because the
    // scope belonged to that one import and does not outlive it.
    await page.getByTestId('account-page-adopt-guest').click();
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        `Add your ${starters.length + 1} songs on this device to your account?`,
    );
});

test('a musician who already declined at sign-in still gets the offer after importing, because this time they asked', async ({
    page,
}) => {
    await seedV1Song(page, 'Old tune');
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);

    // `signUp` answers the sign-in offer with "Not now" — the once-per-owner decision is stored
    // before this import ever runs.
    await signUp(page);
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(adoptDialog(page)).toBeHidden();

    await newSongOnTheStand(page);
    await importFromTheSongMenu(page);
    await page.getByTestId('v1-import').getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('v1-import-result')).toContainText('Imported 1');

    // The stored decline silences the AUTOMATIC sign-in offer; it does not silence an offer the
    // musician's own gesture opened, exactly as the account page's button is never silenced.
    await expect(adoptDialog(page)).toBeVisible();
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        'Add the song you just brought over to your account?',
    );

    // Declining again leaves that decision exactly where it was: still no nag on a later load,
    // settled past the download the auto-offer waits for rather than at "the list stopped
    // loading" (patch P3-2).
    await page.getByTestId('adopt-guest-decline').click();
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await page.getByTestId('account-open').click();
    await expect(page.getByTestId('account-page-adopt-guest')).toBeEnabled();
    await expect(adoptDialog(page)).toBeHidden();
});

test('an import run with nothing new to bring over opens no offer', async ({ page }) => {
    await seedV1Song(page, 'Old tune');
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);

    await signUp(page);
    await newSongOnTheStand(page);
    await importFromTheSongMenu(page);
    await page.getByTestId('v1-import').getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('v1-import-result')).toContainText('Imported 1');
    await expect(adoptDialog(page)).toBeVisible();
    await page.getByTestId('adopt-guest-decline').click();
    await expect(adoptDialog(page)).toBeHidden();
    await page.getByTestId('v1-import').getByRole('button', { name: 'Done' }).click();

    // The same import again, from the menu, which ignores the ledger and offers everything v1
    // holds. Nothing of it is missing from this device any more, so there is no run to make —
    // the card says so and offers no Import — and nothing opens on the back of a run that never
    // happened. (The card never offers a run it knows would land nothing: `v1Plan.fresh` and the
    // run reach their verdicts through the same `decideV1Item`. The shell's own
    // `imported + updated > 0` condition is the guard behind that, for a run whose items all
    // fail or are refused at write time.)
    await newSongOnTheStand(page);
    await importFromTheSongMenu(page);
    await expect(page.getByRole('heading', { level: 3, name: /already here/ })).toBeVisible();
    await expect(page.getByTestId('v1-import').getByRole('button', { name: 'Import' })).toHaveCount(
        0,
    );
    await expect(adoptDialog(page)).toBeHidden();
});

test('a rerun that only updates the old session says what the account actually holds', async ({
    page,
}) => {
    // The flow #1274 designed the v1 session for: import it, add it to the account, keep playing
    // in the old app, run the import again. The one `v1-session` document is UPDATED in place, so
    // the offer opens — but adoption deduplicates by deterministic document id, not by content
    // (#1268), and the account copy stays at the version it was copied at. The sentence has to
    // say that rather than "already in your account", which would read as a claim that the update
    // is up there too.
    await seedV1Session(page, 96);
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);

    await signUp(page);
    await newSongOnTheStand(page);
    await importFromTheSongMenu(page);
    await page.getByTestId('v1-import').getByRole('button', { name: 'Import' }).click();
    await expect(page.getByTestId('v1-import-result')).toContainText('Imported 1');
    await expect(page.getByTestId('adopt-guest-preview').locator('li')).toHaveText([
        'Last session from the old Ensemble',
    ]);
    await page.getByTestId('adopt-guest-confirm').click();
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        'Copied 1 song into this device’s account songbook',
    );
    await page.getByTestId('adopt-guest-done').click();

    // More playing in the old app: same session document, different bytes, a different digest.
    await page.evaluate(() => {
        const raw = localStorage.getItem('ensemble_currentState');
        if (raw === null) {
            throw new Error('the v1 session is missing');
        }
        localStorage.setItem(
            'ensemble_currentState',
            JSON.stringify({ ...JSON.parse(raw), bpm: 132 }),
        );
    });

    await newSongOnTheStand(page);
    await importFromTheSongMenu(page);
    await page.getByTestId('v1-import').getByRole('button', { name: 'Import' }).click();
    // The run updated this device's copy — it imported nothing new, and the offer still opens
    // because an updated session is real work that may never have been adopted.
    await expect(page.getByTestId('v1-import-result')).toContainText('1 updated');

    await expect(adoptDialog(page)).toBeVisible();
    await expect(page.locator('#adopt-guest-title')).toHaveText('Nothing new to add');
    await expect(adoptDialog(page)).toContainText(
        'A song you’ve already added keeps the version you added',
    );
    await page.getByTestId('adopt-guest-close').click();
    await expect(adoptDialog(page)).toBeHidden();
});

test('an offer does not outlive its session: after signing out and back in, the account page still opens one', async ({
    page,
}) => {
    // The shell's `adoptOpen` flag is cleared with the session (#1359 patch P1-2). Left set while
    // the dialog is unmounted, every later `setAdoptOpen(true)` is a no-op transition and the
    // account page's button does nothing for the rest of the page load. The transition that could
    // strand it — a session ending while an offer is ON SCREEN — is not reachable from here (a
    // modal `<dialog>` is in front of every control that could end one), so what this walks is the
    // reachable half: one page load that opens an offer, ends its session, starts another, and
    // must still be able to ask.
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    const guestTitles = await page.locator('.song-name').allInnerTexts();

    await createAccountThroughDialog(page);
    await page.getByTestId('recovery-not-now').click();
    await expect(adoptDialog(page)).toBeVisible();
    // Answered, so the second attach below cannot be the auto-offer opening this by itself.
    await page.getByTestId('adopt-guest-decline').click();
    await expect(adoptDialog(page)).toBeHidden();

    await page.getByTestId('account-sign-out').click();
    await page.getByTestId('sign-out-confirm').click();
    await expect(page.getByTestId('account-sign-in')).toBeVisible();
    await expect(page.getByTestId('library-heading')).toHaveText('Your songbook');

    await page.getByTestId('account-sign-in').click();
    await page.getByTestId('account-do-sign-in').click();
    await expect(page.getByTestId('account-sign-out')).toBeVisible();
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');

    await page.getByTestId('account-open').click();
    await expect(page.getByTestId('account-page-adopt-guest')).toBeEnabled();
    await expect(adoptDialog(page)).toBeHidden();
    await page.getByTestId('account-page-adopt-guest').click();
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        `Add your ${guestTitles.length} songs on this device to your account?`,
    );
});
