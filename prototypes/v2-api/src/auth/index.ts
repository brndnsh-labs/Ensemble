export type { WebAuthnConfig, WebAuthnConfigInput } from './config.js';
export { createWebAuthnConfig } from './config.js';
export type {
    LoginFailureReason,
    LoginResult,
    StartLoginResult,
    VerifyLoginInput,
} from './login.js';
export { startLogin, verifyLogin } from './login.js';
export type {
    RegistrationFailureReason,
    RegistrationResult,
    StartRegistrationInput,
    StartRegistrationResult,
    VerifyRegistrationInput,
} from './registration.js';
export { startRegistration, verifyRegistration } from './registration.js';
