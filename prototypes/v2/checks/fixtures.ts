import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';

export { expect } from '@playwright/test';

/**
 * One preview server PER WORKER, not one for the whole run (#1223).
 *
 * `scripts/serve.mjs` carries process-global state: its `/__test/network` toggle drops every
 * socket while "offline", which is how the WebKit projects prove cache-only navigation. With a
 * single shared server, a second worker's tests would see their requests destroyed whenever a
 * sibling worker went offline. So each worker spawns its own server on an ephemeral port and
 * the `baseURL` option is overridden to point at it; `page`, `context` and `request` all
 * follow `baseURL`, so the specs are unchanged. Against the live test host there is nothing to
 * start and the suite runs on one worker (see playwright.config.ts).
 */
const liveTest = process.env.V2_LIVE_TEST === '1';
const LIVE_URL = 'https://ensembletest.brndn.zip';

// Playwright transpiles these specs to CommonJS (no "type": "module" here), so `__dirname`
// is the module-relative anchor, not `import.meta.dirname`.
async function startPreviewServer(): Promise<{ child: ChildProcess; url: string }> {
    const child = spawn(process.execPath, [path.resolve(__dirname, '../scripts/serve.mjs')], {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, V2_PREVIEW_PORT: '0' },
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    let buffered = '';
    const url = await new Promise<string>((resolvePort, reject) => {
        child.stdout?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => {
            buffered += chunk;
            const match = buffered.match(/V2 preview: (http:\/\/127\.0\.0\.1:\d+)\/v2\//);
            if (match) {
                resolvePort(match[1]);
            }
        });
        child.once('exit', (code) =>
            reject(new Error(`preview server exited with ${code} before listening`)),
        );
    });
    return { child, url };
}

export const test = base.extend<Record<never, never>, { previewServer: string }>({
    previewServer: [
        // Playwright requires the destructuring pattern here even with no dependencies.
        // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature
        async ({}, use) => {
            if (liveTest) {
                await use(LIVE_URL);
                return;
            }
            const { child, url } = await startPreviewServer();
            await use(url);
            child.kill();
            await once(child, 'exit');
        },
        { scope: 'worker' },
    ],
    baseURL: async ({ previewServer }, use) => {
        await use(previewServer);
    },
});

/**
 * Wait for the editor's reveal-focus to land before typing into any OTHER field (#1235).
 *
 * `revealEditor` in app/ensemble.tsx bumps `editorRequest`, and an effect gated on `!busy`
 * then focuses the edit panel's first textarea. That effect can fire in the middle of a
 * `fill()` on a different control: Playwright focuses its target and inserts the text as a
 * separate step, so a focus steal in between sends the keystrokes to the textarea instead —
 * observed on `webkit-phone` under three workers as `Chords in this bar` holding
 * "Guided offlineC" while `Song title` stayed "Untitled song". Asserting the steal has already
 * happened is both the barrier and a real assertion about the reveal contract.
 */
export async function editorRevealed(page: Page): Promise<void> {
    await expect(page.locator('.edit-panel textarea').first()).toBeFocused();
}
