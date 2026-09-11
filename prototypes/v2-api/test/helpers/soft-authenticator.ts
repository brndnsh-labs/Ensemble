import {
    createHash,
    generateKeyPairSync,
    type KeyObject,
    randomBytes,
    sign as signWithKey,
} from 'node:crypto';
import type {
    AuthenticationResponseJSON,
    RegistrationResponseJSON,
    Uint8Array_,
} from '@simplewebauthn/server';
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';

/**
 * A software WebAuthn authenticator for exercising the **real** `@simplewebauthn/server` verify
 * path in tests — no mocking of `verifyRegistrationResponse`/`verifyAuthenticationResponse`.
 *
 * Ported from a probe run manually against the installed `@simplewebauthn/server@14.0.1`
 * (`register: good` / `login: good (counter 0 -> 0, synced passkey)` and every negative case in
 * the orchestrator's #1188 decision comment all reproduced against this exact byte layout).
 * Builds real ES256 (COSE alg -7) registration and assertion responses by hand: `node:crypto`
 * for key generation and ECDSA signing, `isoCBOR`/`isoBase64URL` (from
 * `@simplewebauthn/server/helpers`) for the CBOR attestation object and base64url wire encoding.
 *
 * Every knob the design doc calls for is controllable per call: `origin`, `rpId`, the UV
 * (user-verified) flag, the signature counter, the reported `userHandle`, and — via
 * `SoftAuthenticatorConfig.keyPair` — the signing key pair itself.
 */

export interface SoftAuthenticatorKeyPair {
    privateKey: KeyObject;
    publicKey: KeyObject;
}

export interface SoftAuthenticatorConfig {
    /** Default relying-party ID baked into authenticator data unless overridden per call. */
    rpId: string;
    /** Default origin baked into `clientDataJSON` unless overridden per call. */
    origin: string;
    /** A specific credential id to report; defaults to 16 fresh random bytes. */
    credentialId?: Uint8Array;
    /** A specific EC P-256 key pair to sign with; defaults to a freshly generated one. */
    keyPair?: SoftAuthenticatorKeyPair;
}

export interface RegisterCeremonyInput {
    /** The base64url challenge from `generateRegistrationOptions()`'s `options.challenge`. */
    challenge: string;
    /** Overrides `SoftAuthenticatorConfig.origin` for this response only. */
    origin?: string;
    /** Overrides `SoftAuthenticatorConfig.rpId` for this response only. */
    rpId?: string;
    /** Whether the authenticator reports user verification. Defaults to `true`. */
    userVerified?: boolean;
}

export interface AuthenticateCeremonyInput {
    /** The base64url challenge from `generateAuthenticationOptions()`'s `options.challenge`. */
    challenge: string;
    /** Overrides `SoftAuthenticatorConfig.origin` for this response only. */
    origin?: string;
    /** Overrides `SoftAuthenticatorConfig.rpId` for this response only. */
    rpId?: string;
    /** Whether the authenticator reports user verification. Defaults to `true`. */
    userVerified?: boolean;
    /** Signature counter to report. Defaults to `0` (a synced/multi-device passkey). */
    counter?: number;
    /** base64url account id to report as the assertion's `userHandle`. Omit to send none. */
    userHandle?: string;
}

export interface SoftAuthenticator {
    /** base64url credential id this authenticator reports. */
    readonly credentialId: string;
    /** Builds a real, independently-verifiable `RegistrationResponseJSON`. */
    register(input: RegisterCeremonyInput): RegistrationResponseJSON;
    /** Builds a real, independently-verifiable `AuthenticationResponseJSON`. */
    authenticate(input: AuthenticateCeremonyInput): AuthenticationResponseJSON;
}

export function createSoftAuthenticator(config: SoftAuthenticatorConfig): SoftAuthenticator {
    const { privateKey, publicKey } =
        config.keyPair ?? generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const credentialIdBytes = new Uint8Array(config.credentialId ?? randomBytes(16)).slice();
    const credentialId = isoBase64URL.fromBuffer(credentialIdBytes);

    const jwk = publicKey.export({ format: 'jwk' });
    if (!jwk.x || !jwk.y) {
        throw new Error('EC public key JWK is missing x/y coordinates');
    }
    const xBytes = isoBase64URL.toBuffer(jwk.x);
    const yBytes = isoBase64URL.toBuffer(jwk.y);

    function register(input: RegisterCeremonyInput): RegistrationResponseJSON {
        const origin = input.origin ?? config.origin;
        const rpId = input.rpId ?? config.rpId;
        const userVerified = input.userVerified ?? true;

        // COSE_Key map for an ES256 EC2 public key: kty=EC2(2), alg=ES256(-7), crv=P-256(1).
        const cosePublicKey = new Map<number, number | Uint8Array>([
            [1, 2],
            [3, -7],
            [-1, 1],
            [-2, xBytes],
            [-3, yBytes],
        ]);
        const authData = concatBytes([
            sha256(rpId),
            Uint8Array.of(buildFlags(userVerified, { attestedCredentialData: true })),
            u32be(0), // The sign count embedded in registration authData is always 0.
            new Uint8Array(16), // AAGUID: all-zero for this software authenticator.
            Uint8Array.of(0, credentialIdBytes.length),
            credentialIdBytes,
            isoCBOR.encode(cosePublicKey),
        ]);
        const attestationObject = isoCBOR.encode(
            new Map<string, string | Uint8Array_ | Map<string, never>>([
                ['fmt', 'none'],
                ['attStmt', new Map<string, never>()],
                ['authData', authData],
            ]) as Parameters<typeof isoCBOR.encode>[0],
        );
        const clientDataJSON = buildClientDataJSON('webauthn.create', input.challenge, origin);

        return {
            id: credentialId,
            rawId: credentialId,
            type: 'public-key',
            clientExtensionResults: {},
            response: {
                clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
                attestationObject: isoBase64URL.fromBuffer(attestationObject),
                transports: ['internal'],
            },
        };
    }

    function authenticate(input: AuthenticateCeremonyInput): AuthenticationResponseJSON {
        const origin = input.origin ?? config.origin;
        const rpId = input.rpId ?? config.rpId;
        const userVerified = input.userVerified ?? true;
        const counter = input.counter ?? 0;

        const authData = concatBytes([
            sha256(rpId),
            Uint8Array.of(buildFlags(userVerified, { attestedCredentialData: false })),
            u32be(counter),
        ]);
        const clientDataJSON = buildClientDataJSON('webauthn.get', input.challenge, origin);
        const signaturePayload = concatBytes([authData, sha256(clientDataJSON)]);
        const signature = signWithKey('sha256', Buffer.from(signaturePayload), privateKey);

        return {
            id: credentialId,
            rawId: credentialId,
            type: 'public-key',
            clientExtensionResults: {},
            response: {
                clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
                authenticatorData: isoBase64URL.fromBuffer(authData),
                signature: isoBase64URL.fromBuffer(signature),
                ...(input.userHandle !== undefined ? { userHandle: input.userHandle } : {}),
            },
        };
    }

    return { credentialId, register, authenticate };
}

// --- internal byte-level helpers -------------------------------------------------------------

function sha256(input: string | Uint8Array): Uint8Array_ {
    const hash =
        typeof input === 'string'
            ? createHash('sha256').update(input, 'utf8')
            : createHash('sha256').update(input);
    return new Uint8Array(hash.digest()).slice();
}

function u32be(value: number): Uint8Array_ {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(value);
    return new Uint8Array(buf).slice();
}

/**
 * WebAuthn authenticator-data flags byte. UP (user present, bit 0) is always set. UV (user
 * verified, bit 2) is the controllable flag tests exercise the missing-UV rejection with. AT
 * (attested credential data included, bit 6) is set only for registration — an assertion's
 * authenticator data never carries attested credential data.
 */
function buildFlags(userVerified: boolean, opts: { attestedCredentialData: boolean }): number {
    const UP = 0x01;
    const UV = 0x04;
    const AT = 0x40;
    return UP | (userVerified ? UV : 0) | (opts.attestedCredentialData ? AT : 0);
}

function buildClientDataJSON(
    type: 'webauthn.create' | 'webauthn.get',
    challenge: string,
    origin: string,
): Uint8Array_ {
    const json = JSON.stringify({ type, challenge, origin, crossOrigin: false });
    return new TextEncoder().encode(json).slice();
}

function concatBytes(parts: Uint8Array[]): Uint8Array_ {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out.slice();
}
