export type { WebAuthnConfig, WebAuthnConfigInput } from './config.js';
export { createWebAuthnConfig } from './config.js';
export { FRESH_AUTH_WINDOW_MS, isFreshlyAuthenticated } from './fresh-auth.js';
export type {
    LoginFailureReason,
    LoginResult,
    StartLoginResult,
    VerifyLoginInput,
} from './login.js';
export { startLogin, verifyLogin } from './login.js';
export type {
    AddPasskeyFailureReason,
    AddPasskeyResult,
    PasskeySummary,
    RevokePasskeyFailureReason,
    RevokePasskeyResult,
    StartAddPasskeyInput,
    StartAddPasskeyResult,
    VerifyAddPasskeyInput,
} from './passkeys.js';
export { listPasskeys, revokePasskey, startAddPasskey, verifyAddPasskey } from './passkeys.js';
export type { RateLimiterOptions, RateLimitResult } from './rate-limit.js';
export { createRateLimiter } from './rate-limit.js';
export type {
    ReauthFailureReason,
    ReauthResult,
    StartReauthInput,
    StartReauthResult,
    VerifyReauthInput,
} from './reauth.js';
export { startReauth, verifyReauth } from './reauth.js';
export type {
    ClaimRecoveryCodeResult,
    ConfirmRecoveryCodeFailureReason,
    ConfirmRecoveryCodeResult,
    EnrollRecoveryCodeFailureReason,
    EnrollRecoveryCodeResult,
    RecoveryEnrollPasskeyFailureReason,
    StartRecoveryEnrollPasskeyInput,
    StartRecoveryEnrollPasskeyResult,
    VerifyRecoveryEnrollPasskeyInput,
    VerifyRecoveryEnrollPasskeyResult,
} from './recovery.js';
export {
    claimRecoveryCode,
    confirmRecoveryCode,
    enrollRecoveryCode,
    RECOVERY_CLAIM_RATE_LIMIT,
    RECOVERY_CODE_BYTES,
    RECOVERY_SESSION_TTL_MS,
    readLiveRecoverySession,
    startRecoveryEnrollPasskey,
    verifyRecoveryEnrollPasskey,
} from './recovery.js';
export { hasEnrolledRecoveryMaterial } from './recovery-material.js';
export type {
    RegistrationFailureReason,
    RegistrationResult,
    StartRegistrationInput,
    StartRegistrationResult,
    VerifyRegistrationInput,
} from './registration.js';
export { startRegistration, verifyRegistration } from './registration.js';
export type { IssuedSession, SessionClaims } from './session.js';
export {
    issueSession,
    readSession,
    revokeOtherSessions,
    revokeSession,
    SESSION_TTL_MS,
} from './session.js';
