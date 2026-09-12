import type { MiddlewareHandler } from 'hono';
import type { WebAuthnConfig } from '../auth/config.js';
import { createRateLimiter } from '../auth/rate-limit.js';
import { RECOVERY_CLAIM_RATE_LIMIT } from '../auth/recovery.js';
import { requestHasBody } from './content-type.js';
import { clearCeremonyCookie } from './cookies.js';
import { sendError } from './errors.js';

type Shape = 'empty' | 'label' | 'registration' | 'authentication' | 'credential' | 'code';
interface Policy {
    shape: Shape;
    max: number;
    windowMs: number;
}
const minute = 60_000;
const policy = (shape: Shape, max: number, windowMs = minute): Policy => ({ shape, max, windowMs });

/** Each route opts into both validation and its own independent budget. Unknown routes fail closed. */
export const AUTH_POLICIES: Readonly<Record<string, Policy>> = Object.freeze({
    'POST /api/auth/register/options': policy('label', 10, 10 * minute),
    'POST /api/auth/register/verify': policy('registration', 20, 10 * minute),
    'POST /api/auth/login/options': policy('empty', 30),
    'POST /api/auth/login/verify': policy('authentication', 30),
    'GET /api/auth/session': policy('empty', 120),
    'POST /api/auth/logout': policy('empty', 30),
    'POST /api/auth/sessions/revoke-others': policy('empty', 10),
    'GET /api/auth/passkeys': policy('empty', 60),
    'POST /api/auth/passkeys/options': policy('label', 10),
    'POST /api/auth/passkeys/verify': policy('registration', 20),
    'POST /api/auth/passkeys/revoke': policy('credential', 10),
    'POST /api/auth/reauth/options': policy('empty', 20),
    'POST /api/auth/reauth/verify': policy('authentication', 20),
    'GET /api/auth/recovery/status': policy('empty', 60),
    'POST /api/auth/recovery/enroll': policy('empty', 5, 10 * minute),
    'POST /api/auth/recovery/confirm': policy('code', 10, 10 * minute),
    'POST /api/auth/recovery/claim': { shape: 'code', ...RECOVERY_CLAIM_RATE_LIMIT },
    'POST /api/auth/recovery/enroll-passkey/options': policy('label', 10, 10 * minute),
    'POST /api/auth/recovery/enroll-passkey/verify': policy('registration', 20, 10 * minute),
});

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]): boolean {
    return Object.keys(value).every((key) => allowed.includes(key));
}
function text(value: unknown, max: number): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= max;
}
function base64(value: unknown, max: number): boolean {
    return text(value, max) && /^[A-Za-z0-9_-]+$/.test(value);
}
/** Extension data is never used for authorization. Bound every nested collection and scalar. */
function boundedExtension(value: unknown, depth = 0): boolean {
    if (depth > 4) {
        return false;
    }
    if (value === null || typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (typeof value === 'string') {
        return value.length <= 4096;
    }
    if (Array.isArray(value)) {
        return value.length <= 16 && value.every((v) => boundedExtension(v, depth + 1));
    }
    return (
        record(value) &&
        Object.keys(value).length <= 16 &&
        Object.entries(value).every(
            ([key, v]) => key.length <= 64 && boundedExtension(v, depth + 1),
        )
    );
}
export function validAuthBody(shape: Shape, value: unknown): boolean {
    if (value === undefined) {
        return shape === 'empty' || shape === 'label';
    }
    if (!record(value)) {
        return false;
    }
    if (shape === 'empty') {
        return keys(value, []);
    }
    if (shape === 'label') {
        return (
            keys(value, ['label']) &&
            (value.label === undefined ||
                (text(value.label, 256) &&
                    value.label.trim().length > 0 &&
                    value.label.trim().length <= 64))
        );
    }
    if (shape === 'credential') {
        return keys(value, ['credentialId']) && base64(value.credentialId, 2048);
    }
    if (shape === 'code') {
        return keys(value, ['code']) && text(value.code, 128);
    }
    if (
        !keys(value, [
            'id',
            'rawId',
            'type',
            'response',
            'clientExtensionResults',
            'authenticatorAttachment',
        ]) ||
        !base64(value.id, 2048) ||
        !base64(value.rawId, 2048) ||
        value.type !== 'public-key' ||
        !record(value.response) ||
        !record(value.clientExtensionResults) ||
        !boundedExtension(value.clientExtensionResults) ||
        (value.authenticatorAttachment !== undefined &&
            !['platform', 'cross-platform'].includes(value.authenticatorAttachment as string))
    ) {
        return false;
    }
    const response = value.response;
    if (!base64(response.clientDataJSON, 8192)) {
        return false;
    }
    if (shape === 'authentication') {
        return (
            keys(response, ['clientDataJSON', 'authenticatorData', 'signature', 'userHandle']) &&
            base64(response.authenticatorData, 8192) &&
            base64(response.signature, 2048) &&
            (response.userHandle === undefined ||
                response.userHandle === null ||
                base64(response.userHandle, 128))
        );
    }
    return (
        keys(response, [
            'clientDataJSON',
            'attestationObject',
            'transports',
            'authenticatorData',
            'publicKey',
            'publicKeyAlgorithm',
        ]) &&
        base64(response.attestationObject, 48 * 1024) &&
        (response.transports === undefined ||
            (Array.isArray(response.transports) &&
                response.transports.length <= 8 &&
                response.transports.every((v) =>
                    ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'].includes(v),
                ))) &&
        (response.authenticatorData === undefined || base64(response.authenticatorData, 8192)) &&
        (response.publicKey === undefined || base64(response.publicKey, 8192)) &&
        (response.publicKeyAlgorithm === undefined ||
            (Number.isSafeInteger(response.publicKeyAlgorithm) &&
                Math.abs(response.publicKeyAlgorithm as number) <= 65536))
    );
}

export function authPolicy(
    config: WebAuthnConfig,
    identify: (c: Parameters<MiddlewareHandler>[0]) => string,
    now: () => number,
): MiddlewareHandler {
    const limiters = new Map(
        Object.entries(AUTH_POLICIES).map(([route, value]) => [route, createRateLimiter(value)]),
    );
    return async (c, next) => {
        // Hono's HEAD fallback invokes GET handlers; it must inherit the same policy.
        const route = `${c.req.method === 'HEAD' ? 'GET' : c.req.method} ${c.req.path}`;
        const selected = Object.hasOwn(AUTH_POLICIES, route) ? AUTH_POLICIES[route] : undefined;
        if (!selected) {
            return sendError(c, 404, 'not_found');
        }
        const limit = limiters.get(route)!(identify(c), now());
        if (!limit.allowed) {
            c.header('Retry-After', String(Math.ceil(limit.retryAfterMs / 1000)));
            return sendError(c, 429, 'rate_limited');
        }
        let body: unknown;
        let valid = new URL(c.req.url).search.length === 0;
        try {
            if (requestHasBody(c)) {
                body = await c.req.json();
            }
        } catch {
            valid = false;
        }
        if (!valid || !validAuthBody(selected.shape, body)) {
            if (c.req.path.endsWith('/verify')) {
                clearCeremonyCookie(c, config);
            }
            return sendError(c, 400, 'malformed_request');
        }
        await next();
    };
}
