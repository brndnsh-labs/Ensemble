import { appUrl, test as base, expect, openBand } from './fixtures';

/** What `foundation.spec.ts` and `foundation-sounds.spec.ts` share. */

export async function observeSamples(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
        const decoded = new Set<AudioBuffer>();
        const evidence = { starts: 0, nonzero: 0 };
        Object.assign(window, { __sampleEvidence: evidence });
        const decode = BaseAudioContext.prototype.decodeAudioData;
        BaseAudioContext.prototype.decodeAudioData = function (bytes: ArrayBuffer) {
            return decode.call(this, bytes).then((buffer) => {
                decoded.add(buffer);
                return buffer;
            });
        };
        const start = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function (
            ...args: Parameters<AudioBufferSourceNode['start']>
        ) {
            if (this.buffer && decoded.has(this.buffer)) {
                evidence.starts++;
                if (this.buffer.getChannelData(0).some((value) => Math.abs(value) > 0.0001)) {
                    evidence.nonzero++;
                }
            }
            return Reflect.apply(start, this, args);
        };
    });
}

export async function sampleStarts(page: import('@playwright/test').Page) {
    return page.evaluate(
        () =>
            (window as unknown as { __sampleEvidence: { nonzero: number } }).__sampleEvidence
                .nonzero,
    );
}

export const test = base.extend<{ disconnect: () => Promise<void> }>({
    disconnect: async ({ browserName, context, request }, use) => {
        await use(async () => {
            if (browserName === 'webkit') {
                // Minimal independent reproduction: setOffline causes an internal
                // WebKit error even for a single cached HTML page; refusing real
                // network connections reloads correctly. No application responses
                // can succeed through this local-only server until teardown.
                const response = await request.post('/__test/network?offline=1');
                expect(response.ok()).toBe(true);
                await expect(
                    request.get(appUrl('uncached-network-proof'), { timeout: 3000 }),
                ).rejects.toThrow();
            } else {
                await context.setOffline(true);
            }
        });
        if (browserName === 'webkit') {
            await request.post('/__test/network?offline=0');
        }
    },
});

/** The band's lanes on the stand; harmony is not a band role (docs/design/band-engine.md). */
export const LANES = ['Drums', 'Bass', 'Chords', 'Soloist'];

export async function openSounds(page: import('@playwright/test').Page) {
    await openBand(page, 'Players');
}
export async function closeSounds(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Close band' }).click();
}
