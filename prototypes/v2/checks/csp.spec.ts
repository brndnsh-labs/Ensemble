import { appUrl, expect, seedStarters, test } from './fixtures';

/**
 * The build-time `<meta>` Content-Security-Policy (#1395, docs/SECURITY.md F8).
 *
 * Brandon's 2026-09-26 decision: bake the policy into the export in `scripts/offline.mjs`
 * rather than send it as an nginx response header, because this suite's own preview server
 * (`scripts/serve.mjs`) sets no headers at all — an nginx-only policy would never be exercised
 * here. That makes THIS suite the policy's only automated check: a script-src or connect-src
 * that is one source too narrow has to fail a spec, not just look wrong on inspection.
 */
test.describe('Content-Security-Policy (#1395)', () => {
    test('the built page carries a script/connect CSP with no script-src unsafe-inline', async ({
        page,
    }) => {
        await page.goto(appUrl());

        const content = await page
            .locator('meta[http-equiv="Content-Security-Policy"]')
            .getAttribute('content');
        expect(content).toBeTruthy();
        const csp = content as string;

        const scriptSrc = csp.match(/script-src ([^;]+)/)?.[1] ?? '';
        expect(scriptSrc).not.toContain("'unsafe-inline'");
        // A static export has no per-request nonce: every inline script is allow-listed by its
        // own sha256 hash instead, and 'self' covers Next's own chunk files.
        expect(scriptSrc).toContain("'self'");
        expect(scriptSrc.match(/'sha256-[^']+'/g)?.length ?? 0).toBeGreaterThan(0);
        // Umami (#1420) is the one cross-origin script/connect target the stand ever loads.
        expect(scriptSrc).toContain('https://umami.brndn.zip');
        expect(csp).toContain("connect-src 'self' https://umami.brndn.zip");
        // React applies chart-sheet.tsx's two runtime-calculated inline `style={{...}}` props
        // through the CSSOM, which `style-src` does not gate — only `style="..."` attributes in
        // parsed markup and `<style>` elements, neither of which this export contains. No
        // 'unsafe-inline' here is therefore a real assertion, not an aspiration.
        const styleSrc = csp.match(/style-src ([^;]+)/)?.[1] ?? '';
        expect(styleSrc).not.toContain("'unsafe-inline'");
        expect(styleSrc).toContain("'self'");
        // A meta CSP cannot carry frame-ancestors at all — that stays an nginx response header
        // (hosting/web/nginx.conf) and must not silently reappear here as a no-op.
        expect(csp).not.toContain('frame-ancestors');
    });

    test('a full load, open, play, stop pass fires zero CSP violations', async ({ page }) => {
        // `fixtures.ts`'s `page` extension already fails this test on ANY
        // `securitypolicyviolation` event; this spec's own job is to exercise the paths a guest
        // session actually takes (service worker registration, sample decode/playback, the
        // account entry point) rather than to re-implement that assertion.
        await seedStarters(page);
        await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();

        await page.getByRole('button', { name: 'Start playback', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
        // Long enough for a bar or two of real audio scheduling and decode, not a full loop.
        await page.waitForTimeout(1500);
        await page.getByRole('button', { name: 'Stop playback' }).click();
        await expect(
            page.getByRole('button', { name: 'Start playback', exact: true }),
        ).toBeVisible();
    });
});
