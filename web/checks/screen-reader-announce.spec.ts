// What a screen reader hears from the stand (#1985): the opened song, a sound install's progress
// and a failed download. Functional checks on the live regions' text, not on a reader.
import { expect, seedStarters, songLink } from './fixtures';
import { closeSounds, openSounds, test } from './foundation-helpers';

test('opening a song says its title, key and tempo in the stand toast’s live region', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    const region = page.getByTestId('stand-toast');
    await expect(region).toHaveAttribute('role', 'status');
    await expect(region).toContainText(/Blue pocket, [A-G][♭♯]?( minor)?, \d+ BPM/);
    // Heard, not seen: the plain open still shows no banner over the chart (#1700).
    await expect(region).toHaveAttribute('data-empty', 'true');
});

test('an install writes each live region at most six times', async ({ page }) => {
    test.setTimeout(120_000);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openSounds(page);
    // Every distinct text either live region takes while the install runs.
    await page.evaluate(() => {
        const writes: Record<string, string[]> = { progress: [], toast: [] };
        Object.assign(window, { __liveWrites: writes });
        const watch = (name: string, selector: string) => {
            const node = document.querySelector(selector);
            if (!node) {
                throw new Error(`no ${selector}`);
            }
            let last = node.textContent ?? '';
            new MutationObserver(() => {
                const now = node.textContent ?? '';
                if (now !== last) {
                    writes[name].push(now);
                    last = now;
                }
            }).observe(node, { childList: true, characterData: true, subtree: true });
        };
        watch('progress', '.sound-progress');
        watch('toast', '[data-testid="stand-toast"]');
    });
    const install = page.getByRole('button', { name: 'Install all & use style sounds' });
    await install.click();
    await expect(install).toBeEnabled({ timeout: 60_000 });
    const writes = await page.evaluate(
        () => (window as unknown as { __liveWrites: Record<string, string[]> }).__liveWrites,
    );
    expect(writes.progress.length, JSON.stringify(writes.progress)).toBeGreaterThan(0);
    expect(writes.progress.length, JSON.stringify(writes.progress)).toBeLessThanOrEqual(6);
    expect(writes.toast.length, JSON.stringify(writes.toast)).toBeLessThanOrEqual(6);
    await expect(page.getByTestId('stand-toast')).toContainText('Sounds installed');
    await closeSounds(page);
});

test('a download that never reaches the network says so in plain words', async ({
    page,
    browserName,
}) => {
    // The page's own fetch fails, as the engine words it: the service worker answers pack
    // requests before a Playwright route could see them.
    await page.addInitScript(
        (message: string) => {
            const real = window.fetch;
            window.fetch = (input, init) =>
                String(input instanceof Request ? input.url : input).includes('/packs/')
                    ? Promise.reject(new TypeError(message))
                    : real(input, init);
        },
        browserName === 'webkit' ? 'Load failed' : 'Failed to fetch',
    );
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openSounds(page);
    // An earlier install in this profile would otherwise answer from the cache, with no fetch.
    await page.evaluate(() => caches.delete('ensemble-v2-sounds-v1'));
    await page.getByRole('button', { name: 'Install all & use style sounds' }).click();
    await expect(page.locator('.error-banner[role="alert"]')).toHaveText(
        "Couldn't download the sounds. Check your connection and try again.",
    );
});
