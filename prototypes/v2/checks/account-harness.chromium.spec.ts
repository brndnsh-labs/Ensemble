import { appUrl, expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

// `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only, so playwright.config.ts
// keeps these out of the WebKit project rather than starting an API there just to skip.

test('a passkey registers against the real API on the app origin, and the session reads back', async ({
    page,
}) => {
    // The authenticator setup this spec introduced now lives in ./virtual-authenticator, shared
    // with the sign-in specs (#1262); the options it sends are unchanged.
    await addVirtualAuthenticator(page);
    await page.goto(appUrl());

    const outcome = await page.evaluate(async () => {
        const post = (path: string, body: unknown) =>
            fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        const before = await fetch('/api/auth/session');
        const started = await post('/api/auth/register/options', {});
        const { options } = await started.json();
        const credential = (await navigator.credentials.create({
            publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options),
        })) as PublicKeyCredential;
        const verified = await post('/api/auth/register/verify', credential.toJSON());
        const after = await fetch('/api/auth/session');
        return {
            before: before.status,
            started: started.status,
            verified: verified.status,
            account: (await verified.json()).accountId as string,
            session: after.status === 200 ? ((await after.json()).accountId as string) : null,
            cacheControl: after.headers.get('cache-control'),
        };
    });

    expect(outcome.before).toBe(401);
    expect(outcome.started).toBe(200);
    expect(outcome.verified).toBe(200);
    expect(outcome.account).toBeTruthy();
    expect(outcome.session).toBe(outcome.account);
    // Private API responses must never be storable by the app shell's service worker or a CDN.
    expect(outcome.cacheControl).toContain('no-store');
});
