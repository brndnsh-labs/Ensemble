import type { CDPSession, Page } from '@playwright/test';

/**
 * The Chromium CDP virtual authenticator, shared by every `*.chromium.spec.ts` (#1262).
 *
 * Extracted from `account-harness.chromium.spec.ts` (#1258), which first proved the setup. Only
 * Chromium has `WebAuthn.*`, which is why passkey specs carry the `.chromium` infix that
 * `playwright.config.ts` uses to keep them out of the WebKit project.
 *
 * `hasResidentKey` + `hasUserVerification` + `isUserVerified` is not a convenience default: the
 * service requests `userVerification: 'required'` and verifies it server-side, and login is
 * usernameless (no `allowCredentials`), so a non-discoverable or non-verifying authenticator
 * cannot complete either ceremony. `automaticPresenceSimulation` stands in for the human touch.
 */

/**
 * One stored passkey, in the shape `WebAuthn.getCredentials` hands back and `WebAuthn.addCredential`
 * takes. Copying one between authenticators is how a spec proves a sign-in on a browser profile
 * that shares nothing but the passkey itself — a second context gets its own cookie jar and its own
 * `localStorage`, so the only thing carried over is the credential, exactly like a real second
 * device syncing a passkey.
 */
export interface VirtualCredential {
    credentialId: string;
    isResidentCredential: boolean;
    rpId: string;
    privateKey: string;
    signCount: number;
    userHandle?: string;
}

export interface VirtualAuthenticator {
    session: CDPSession;
    authenticatorId: string;
    /**
     * Flip whether the authenticator can verify the user.
     *
     * `false` is how a spec simulates a dismissed platform prompt: the service requires user
     * verification, so the authenticator refuses and Chromium reports the same
     * `NotAllowedError` a real dismissal produces — measured at ~7ms, immediately, unlike
     * detaching the authenticator (the ceremony then simply waits for a device until the
     * options' own timeout) or clearing `automaticPresenceSimulation` (measured: it waits out
     * the full timeout before reporting the identical error).
     */
    setUserVerified(verified: boolean): Promise<void>;
    /** Every passkey this authenticator holds, ready to hand to another one. */
    credentials(): Promise<VirtualCredential[]>;
    /** Install a passkey exported from another authenticator. */
    addCredential(credential: VirtualCredential): Promise<void>;
}

export async function addVirtualAuthenticator(page: Page): Promise<VirtualAuthenticator> {
    const session = await page.context().newCDPSession(page);
    await session.send('WebAuthn.enable');
    const { authenticatorId } = await session.send('WebAuthn.addVirtualAuthenticator', {
        options: {
            protocol: 'ctap2',
            transport: 'internal',
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
            automaticPresenceSimulation: true,
        },
    });
    return {
        session,
        authenticatorId,
        setUserVerified: async (verified: boolean) => {
            await session.send('WebAuthn.setUserVerified', {
                authenticatorId,
                isUserVerified: verified,
            });
        },
        credentials: async () => {
            const { credentials } = await session.send('WebAuthn.getCredentials', {
                authenticatorId,
            });
            // Only the fields `addCredential` accepts: the reply also carries display metadata
            // and large-blob state, which CDP rejects as unknown parameters on the way back in.
            return credentials.map((credential) => ({
                credentialId: credential.credentialId,
                isResidentCredential: credential.isResidentCredential,
                rpId: credential.rpId ?? 'localhost',
                privateKey: credential.privateKey,
                signCount: credential.signCount,
                userHandle: credential.userHandle,
            }));
        },
        addCredential: async (credential: VirtualCredential) => {
            await session.send('WebAuthn.addCredential', { authenticatorId, credential });
        },
    };
}
