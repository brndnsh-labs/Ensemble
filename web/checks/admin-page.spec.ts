import { appUrl, expect, test } from './fixtures';

/**
 * The operator page (#1717). The server's gate is proven in the api's own tests; these hold the
 * page to what it does with each answer. The preview server has no API, so both are routed.
 */

test('a refused caller sees the ordinary not-found page', async ({ page }) => {
    await page.route('**/api/admin/overview', (route) =>
        route.fulfill({ status: 404, json: { error: 'not_found' } }),
    );
    await page.goto(appUrl('admin/'));
    await expect(page.getByText('Page not found')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Admin' })).toHaveCount(0);
});

test('a listed account sees accounts against the cap and the account list', async ({ page }) => {
    const day = 24 * 60 * 60 * 1000;
    await page.route('**/api/admin/overview', (route) =>
        route.fulfill({
            json: {
                accounts: {
                    total: 3,
                    cap: 25,
                    remaining: 22,
                    newLast7Days: 1,
                    newLast30Days: 2,
                    signedInLast7Days: 2,
                },
                documents: { total: 12, bytes: 48_000 },
                charts: { total: 11, bySchemaVersion: { '1': 4, '2': 7 } },
                authFailuresLast24Hours: 0,
                list: [
                    {
                        shortId: 'newAcct1',
                        joinedAt: Date.now() - day,
                        lastSignInAt: Date.now() - day,
                        documents: 2,
                        bytes: 8_000,
                        passkeys: 1,
                        you: false,
                    },
                    {
                        shortId: 'mineAcct',
                        joinedAt: Date.now() - 20 * day,
                        lastSignInAt: Date.now(),
                        documents: 10,
                        bytes: 40_000,
                        passkeys: 2,
                        you: true,
                    },
                    {
                        shortId: 'oldAcct9',
                        joinedAt: Date.now() - 40 * day,
                        lastSignInAt: null,
                        documents: 0,
                        bytes: 0,
                        passkeys: 1,
                        you: false,
                    },
                ],
                listTruncated: false,
            },
        }),
    );
    await page.goto(appUrl('admin/'));
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
    const totals = page.getByRole('region', { name: 'Totals' });
    await expect(totals).toContainText('3 of 25');
    await expect(totals).toContainText('22 sign-ups left');
    const formats = page.getByRole('region', { name: 'Chart formats' });
    await expect(formats).toContainText('Format 2 charts: 7');
    await expect(formats).toContainText('Old-format charts: 4');
    const rows = page.locator('.admin-table tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText('mineAcct');
    await expect(rows.nth(1)).toContainText('you');
    await expect(rows.nth(2)).toContainText('Over 30 days ago');
    // Nothing on the page may run sideways on a phone except the table's own scroller.
    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
});

test('a malformed chart count is a failed load, not a half-rendered page', async ({ page }) => {
    await page.route('**/api/admin/overview', (route) =>
        route.fulfill({
            json: {
                accounts: {
                    total: 1,
                    cap: 25,
                    remaining: 24,
                    newLast7Days: 0,
                    newLast30Days: 0,
                    signedInLast7Days: 0,
                },
                documents: { total: 0, bytes: 0 },
                charts: { total: 'many', bySchemaVersion: {} },
                authFailuresLast24Hours: 0,
                list: [],
                listTruncated: false,
            },
        }),
    );
    await page.goto(appUrl('admin/'));
    await expect(page.locator('.admin-note')).toContainText("Couldn't reach the server");
    await expect(page.getByRole('region', { name: 'Chart formats' })).toHaveCount(0);
});
