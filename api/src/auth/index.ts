export { deleteAccount } from './account-deletion.js';
export type { WebAuthnConfig } from './config.js';
export type { LoginFailureReason } from './login.js';
export { startLogin, verifyLogin } from './login.js';
export type {
    AddPasskeyFailureReason,
    RevokePasskeyFailureReason,
    StartAddPasskeyResult,
} from './passkeys.js';
export { listPasskeys, revokePasskey, startAddPasskey, verifyAddPasskey } from './passkeys.js';
export type { ReauthFailureReason } from './reauth.js';
export { startReauth, verifyReauth } from './reauth.js';
export type {
    ConfirmRecoveryCodeFailureReason,
    EnrollRecoveryCodeFailureReason,
    RecoveryEnrollPasskeyFailureReason,
    StartRecoveryEnrollPasskeyResult,
} from './recovery.js';
export {
    claimRecoveryCode,
    confirmRecoveryCode,
    enrollRecoveryCode,
    RECOVERY_SESSION_TTL_MS,
    startRecoveryEnrollPasskey,
    verifyRecoveryEnrollPasskey,
} from './recovery.js';
export { hasEnrolledRecoveryMaterial } from './recovery-material.js';
export type { RegistrationFailureReason } from './registration.js';
export {
    countAccounts,
    DEFAULT_REGISTRATION_CAP,
    startRegistration,
    verifyRegistration,
} from './registration.js';
export type { SessionClaims } from './session.js';
export {
    issueSession,
    readSession,
    revokeOtherSessions,
    revokeSession,
    SESSION_TTL_MS,
} from './session.js';
