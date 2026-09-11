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
export type {
    ReauthFailureReason,
    ReauthResult,
    StartReauthInput,
    StartReauthResult,
    VerifyReauthInput,
} from './reauth.js';
export { startReauth, verifyReauth } from './reauth.js';
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
