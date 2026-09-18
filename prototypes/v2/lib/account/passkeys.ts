/**
 * The passkey ceremonies, as plain async functions over `lib/account/api.ts` (#1262, #1263).
 *
 * `@simplewebauthn/browser` (14.0.0, the same major as the server's pinned `@simplewebauthn/server`
 * 14.0.1) is the ONE new client dependency rollout decision 9 S4 allows. It is used for exactly
 * what it is good at — `PublicKeyCredential` (de)serialization and turning the eight spec
 * DOMExceptions into an inspectable `WebAuthnError` — and for nothing else: there is no query,
 * cache or state library here, and every request goes through the same typed `fetch` wrapper the
 * Save transport uses.
 *
 * The server's ceremony binding is a cookie (`ensemble_ceremony`, `HttpOnly`, `SameSite=Strict`)
 * set by each `options` call and consumed by the matching `verify`, so nothing here has to
 * carry a challenge by hand — but it does mean an options/verify pair must not be interleaved
 * with another ceremony on the same profile. Each function below is a single start-to-finish
 * ceremony for that reason.
 *
 * Nothing in this module logs, stores or rethrows anything: a raw server code, an exception
 * message and the recovery code are all things that must never reach a console line or the DOM,
 * so every path funnels through `messages.ts` into one `AccountFailure`.
 */

import {
    type AuthenticationResponseJSON,
    browserSupportsWebAuthn,
    type PublicKeyCredentialCreationOptionsJSON,
    type PublicKeyCredentialRequestOptionsJSON,
    type RegistrationResponseJSON,
    startAuthentication,
    startRegistration,
    WebAuthnError,
} from '@simplewebauthn/browser';
import type { AccountApi, ApiResult } from './api';
import {
    ACCOUNT_MESSAGES,
    type AccountFailure,
    type AccountOutcome,
    failureFromApi,
    failureFromClaim,
} from './messages';

/** Every `options` route answers `{ options }`; the value is passed straight to the library. */
interface OptionsReply<T> {
    options?: T;
}

interface AccountIdReply {
    accountId?: unknown;
}

const NO_BODY = '{}';

function fail(failure: AccountFailure): { ok: false; failure: AccountFailure } {
    return { ok: false, failure };
}

function genericFailure(): { ok: false; failure: AccountFailure } {
    return fail({ kind: 'error', message: ACCOUNT_MESSAGES.generic });
}

/**
 * True when the ceremony ended because the person dismissed the platform prompt (or it was
 * aborted), which the UI must answer with silence rather than an error banner.
 *
 * Measured against the installed 14.0.0: `identifyRegistrationError`/`identifyAuthenticationError`
 * deliberately pass a `NotAllowedError` THROUGH as `code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY'`
 * with the original DOMException on `cause` (platforms overload that error name, so the library
 * refuses to reinterpret its message), while an aborted ceremony becomes
 * `code: 'ERROR_CEREMONY_ABORTED'`. Both the wrapper and a bare DOMException are checked, because
 * the wrapping only happens for errors raised by the `navigator.credentials` call itself.
 */
function ceremonyCancelled(error: unknown): boolean {
    if (error instanceof WebAuthnError && error.code === 'ERROR_CEREMONY_ABORTED') {
        return true;
    }
    const cause = error instanceof WebAuthnError ? error.cause : error;
    const name = cause instanceof Error ? cause.name : '';
    return name === 'NotAllowedError' || name === 'AbortError';
}

function failureFromCeremony(error: unknown): { ok: false; failure: AccountFailure } {
    if (ceremonyCancelled(error)) {
        return fail({ kind: 'cancelled' });
    }
    // Everything else the authenticator can refuse — already-registered, no discoverable
    // credential support, no user verification — is actionable in the same one way.
    return fail({ kind: 'error', message: ACCOUNT_MESSAGES.failed });
}

/** `false` means this browser has no WebAuthn at all; the dialog explains and offers guest use. */
export function passkeysSupported(): boolean {
    return browserSupportsWebAuthn();
}

function accountIdOf(reply: AccountIdReply | undefined): string | null {
    const owner = reply?.accountId;
    return typeof owner === 'string' && owner.length > 0 ? owner : null;
}

/** Creates an account from a brand-new passkey. The session cookie is set by `register/verify`. */
export async function createAccount(api: AccountApi): Promise<AccountOutcome<string>> {
    return registerCredential(api, '/api/auth/register/options', '/api/auth/register/verify');
}

/**
 * One registration ceremony over an options/verify pair — the sibling of `assertIdentity` below,
 * and for the same reason: `register/*` and `recovery/enroll-passkey/*` are byte-identical
 * ceremonies over different routes (a `PublicKeyCredentialCreationOptionsJSON`, one
 * `startRegistration`, an `{ accountId }` reply), differing only in what the server does with the
 * result. Keeping one implementation is what stops the recovery path quietly drifting away from
 * the create path's cancellation and error handling.
 */
async function registerCredential(
    api: AccountApi,
    optionsPath: string,
    verifyPath: string,
): Promise<AccountOutcome<string>> {
    const started = await api.post<OptionsReply<PublicKeyCredentialCreationOptionsJSON>>(
        optionsPath,
        NO_BODY,
    );
    if (!started.ok) {
        return fail(failureFromApi(started.error));
    }
    const optionsJSON = started.value?.options;
    if (!optionsJSON) {
        return genericFailure();
    }
    let response: RegistrationResponseJSON;
    try {
        response = await startRegistration({ optionsJSON });
    } catch (error) {
        return failureFromCeremony(error);
    }
    const verified = await api.post<AccountIdReply>(verifyPath, JSON.stringify(response));
    if (!verified.ok) {
        return fail(failureFromApi(verified.error));
    }
    const owner = accountIdOf(verified.value);
    return owner === null ? genericFailure() : { ok: true, value: owner };
}

/**
 * Signs in with an existing passkey. `login/options` is usernameless (no `allowCredentials`), so
 * the platform picker offers whatever discoverable credential the device holds — there is no
 * account name to type, by design.
 */
export async function signIn(api: AccountApi): Promise<AccountOutcome<string>> {
    return assertIdentity(api, '/api/auth/login/options', '/api/auth/login/verify');
}

async function assertIdentity(
    api: AccountApi,
    optionsPath: string,
    verifyPath: string,
): Promise<AccountOutcome<string>> {
    const started = await api.post<OptionsReply<PublicKeyCredentialRequestOptionsJSON>>(
        optionsPath,
        NO_BODY,
    );
    if (!started.ok) {
        return fail(failureFromApi(started.error));
    }
    const optionsJSON = started.value?.options;
    if (!optionsJSON) {
        return genericFailure();
    }
    let response: AuthenticationResponseJSON;
    try {
        response = await startAuthentication({ optionsJSON });
    } catch (error) {
        return failureFromCeremony(error);
    }
    const verified = await api.post<AccountIdReply>(verifyPath, JSON.stringify(response));
    if (!verified.ok) {
        return fail(failureFromApi(verified.error));
    }
    const owner = accountIdOf(verified.value);
    return owner === null ? genericFailure() : { ok: true, value: owner };
}

/**
 * Ends the server session. A full sign-out preflight for unsent work is a LATER story (#1269):
 * today nothing account-scoped is stored on this device — `lib/sync/` exists but no UI writes to
 * it — so there is nothing to warn about, and a plain logout is the correct and complete action.
 * When #1269 lands, the preflight belongs in front of this call, not inside it.
 */
export async function signOut(api: AccountApi): Promise<AccountOutcome<null>> {
    // Idempotent and `204` on the server, including with no session cookie at all.
    const result = await api.post<undefined>('/api/auth/logout', NO_BODY);
    return result.ok ? { ok: true, value: null } : fail(failureFromApi(result.error));
}

interface RecoveryStatusReply {
    enrolled?: unknown;
}

/**
 * Whether the account has a CONFIRMED, unconsumed recovery code — the server's definition of
 * "protected". `false` is the state an abandoned enrolment leaves behind, and what makes the
 * header able to say so after a reload without keeping anything on the device.
 */
export async function recoveryEnrolled(api: AccountApi): Promise<AccountOutcome<boolean>> {
    const result = await api.get<RecoveryStatusReply>('/api/auth/recovery/status');
    if (!result.ok) {
        return fail(failureFromApi(result.error));
    }
    return typeof result.value?.enrolled === 'boolean'
        ? { ok: true, value: result.value.enrolled }
        : genericFailure();
}

interface EnrollReply {
    code?: unknown;
}

/**
 * Mints a recovery code and returns it — the server returns the raw value EXACTLY ONCE and stores
 * only its hash, so the caller must show it now. Calling this again replaces any live unconfirmed
 * or confirmed-but-unconsumed code (server decision 2), which is what makes resuming an abandoned
 * enrolment safe: the person gets a fresh code, and the one they walked away from stops working.
 */
export async function enrollRecoveryCode(api: AccountApi): Promise<AccountOutcome<string>> {
    const result = await withFreshAuth(api, () =>
        api.post<EnrollReply>('/api/auth/recovery/enroll', NO_BODY),
    );
    if (!result.ok) {
        return result;
    }
    const code = result.value?.code;
    return typeof code === 'string' && code.length > 0
        ? { ok: true, value: code }
        : genericFailure();
}

/** Proves the code was kept. Only after this does the account read as protected. */
export async function confirmRecoveryCode(
    api: AccountApi,
    code: string,
): Promise<AccountOutcome<null>> {
    const result = await withFreshAuth(api, () =>
        api.post<undefined>('/api/auth/recovery/confirm', JSON.stringify({ code })),
    );
    return result.ok ? { ok: true, value: null } : result;
}

/**
 * Spends a recovery code for a RECOVERY-ONLY session (#1263). `204`, no body: the cookie the
 * server sets is the entire result, and there is nothing else to disclose.
 *
 * Deliberately NOT `withFreshAuth`-wrapped. This is the one account route that runs with no
 * session at all — a person here has lost their passkey, so there is nothing to step up with —
 * and the session it mints can do exactly one thing: enroll one new passkey. It does not satisfy
 * `isFreshlyAuthenticated`, and the library routes (`GET /api/documents`) refuse it, so nothing
 * between this call and `enrollRecoveryPasskey` below can read or write a single chart.
 *
 * `failureFromClaim` rather than `failureFromApi`: the server's one collapsed
 * `401 authentication_failed` means "that code isn't usable" here, not "try a different passkey".
 *
 * Claiming takes an exclusive, self-expiring lock on the code for `RECOVERY_SESSION_TTL_MS` (10
 * minutes). So a caller whose enrolment then fails must RETRY THE CEREMONY on the session it
 * already holds — calling this again with the same code inside that window is refused by the
 * lock, not by the code being spent. The code itself is only consumed when
 * `enroll-passkey/verify` commits.
 */
export async function claimRecoveryCode(
    api: AccountApi,
    code: string,
): Promise<AccountOutcome<null>> {
    const result = await api.post<undefined>('/api/auth/recovery/claim', JSON.stringify({ code }));
    return result.ok ? { ok: true, value: null } : fail(failureFromClaim(result.error));
}

/**
 * Enrolls the replacement passkey under a recovery-only session, completing the recovery (#1263).
 *
 * The server's commit is one transaction: consume the code, revoke every live session, delete
 * every existing credential, insert this one — so on success the old passkeys and every other
 * signed-in device are gone, and `verify` mints a brand-new STANDARD session bound to the new
 * credential, immediately fresh. That freshness is why the replacement `enrollRecoveryCode` that
 * follows needs no second prompt, exactly as it doesn't after registration.
 *
 * On ANY failure the whole transaction rolls back, including the consume — which is what makes an
 * interrupted enrolment safe to retry. Retry this function, not `claimRecoveryCode`: the recovery
 * session is still live and still holds the claim lock.
 */
export async function enrollRecoveryPasskey(api: AccountApi): Promise<AccountOutcome<string>> {
    return registerCredential(
        api,
        '/api/auth/recovery/enroll-passkey/options',
        '/api/auth/recovery/enroll-passkey/verify',
    );
}

/**
 * Runs `attempt`, and on the server's `403 fresh_auth_required` performs a step-up
 * re-authentication and retries it exactly once.
 *
 * Both recovery routes are gated on `isFreshlyAuthenticated`: the session must have been created
 * by a real passkey ceremony within the last 10 minutes (`FRESH_AUTH_WINDOW_MS`). Registration
 * mints exactly such a session, so the happy path — create the account, enroll, confirm — needs
 * NO extra prompt; the retry only ever fires when someone comes back to an abandoned enrolment
 * later, which is precisely the case where re-proving possession of the passkey is the point
 * rather than friction. `reauth/verify` rotates the session, so the retry runs on a fresh one.
 */
async function withFreshAuth<T>(
    api: AccountApi,
    attempt: () => Promise<ApiResult<T>>,
): Promise<AccountOutcome<T>> {
    let result = await attempt();
    if (!result.ok && result.error.kind === 'code' && result.error.code === 'fresh_auth_required') {
        const stepped = await assertIdentity(
            api,
            '/api/auth/reauth/options',
            '/api/auth/reauth/verify',
        );
        if (!stepped.ok) {
            return stepped;
        }
        result = await attempt();
    }
    return result.ok ? { ok: true, value: result.value } : fail(failureFromApi(result.error));
}
