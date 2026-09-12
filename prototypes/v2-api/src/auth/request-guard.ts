/**
 * Runtime shape guard shared by `verifyRegistration` and `verifyLogin` (P2-6).
 *
 * The `VerifyRegistrationInput`/`VerifyLoginInput` TypeScript types promise a well-formed
 * `RegistrationResponseJSON`/`AuthenticationResponseJSON`, but those types are erased at
 * runtime — a real caller sits behind an HTTP boundary parsing untrusted JSON, so nothing
 * stops `response` from being `null`, missing its nested `response` object, or carrying an
 * `id` that is an array or object rather than a string. Left unchecked, these reach
 * `node:sqlite` as bind parameters: an object argument is silently treated as a *named*
 * parameter map by `node:sqlite`, so `{}` binds `NULL` instead of raising a type error, and a
 * `SELECT ... WHERE id = ?` with an array/object argument throws an uncaught `TypeError`
 * instead of returning a typed failure.
 *
 * This guard is intentionally shallow — it only checks the shape this module's own code reads
 * before ever touching the database or the WebAuthn library, not full schema validation. It
 * must run synchronously, before `claimChallenge`, so a malformed request never consumes the
 * ceremony token: the challenge stays claimable by a subsequent well-formed request.
 */
export function isMalformedCeremonyRequest(input: unknown): boolean {
    if (input === null || typeof input !== 'object') {
        return true;
    }
    const { ceremonyToken, response } = input as Record<string, unknown>;
    if (typeof ceremonyToken !== 'string') {
        return true;
    }
    if (response === null || typeof response !== 'object') {
        return true;
    }
    const candidate = response as Record<string, unknown>;
    if (typeof candidate.id !== 'string') {
        return true;
    }
    if (typeof candidate.rawId !== 'string') {
        return true;
    }
    if (candidate.response === null || typeof candidate.response !== 'object') {
        return true;
    }
    return false;
}
