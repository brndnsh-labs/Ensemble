import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { CHALLENGE_TTL_MS } from '../auth/challenges.js';
import type { WebAuthnConfig } from '../auth/config.js';

/**
 * Cookie transport for the two auth-flow cookies (#1189 decision 13). Names and attributes are
 * derived entirely from `config.origin` — never a separate flag — so there is exactly one place
 * that decides "are we in the `https:` production shape or the `http://localhost` development
 * shape."
 *
 * - `https:` gets the `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no
 *   `Domain`. `createWebAuthnConfig` already restricts `origin` to `https:` or
 *   `http://localhost`, so this module never has to handle a third shape.
 * - `http://localhost` (development only) drops the prefix and `Secure`, keeping the rest — the
 *   `__Host-` prefix is a browser-enforced contract that requires `Secure`, and plain HTTP
 *   cannot satisfy it.
 * - `SameSite=Strict` is safe for both cookies: every request that needs either cookie is a
 *   same-origin `fetch` from the app itself, never a cross-site navigation.
 */

const CEREMONY_COOKIE_NAME = 'ensemble_ceremony';
const SESSION_COOKIE_NAME = 'ensemble_session';

function isLocalHttp(config: WebAuthnConfig): boolean {
    return config.origin.startsWith('http://localhost');
}

interface BaseCookieAttrs {
    httpOnly: true;
    sameSite: 'Strict';
    path: '/';
    secure: boolean;
    prefix?: 'host';
}

function baseAttrs(config: WebAuthnConfig): BaseCookieAttrs {
    if (isLocalHttp(config)) {
        return { httpOnly: true, sameSite: 'Strict', path: '/', secure: false };
    }
    return { httpOnly: true, sameSite: 'Strict', path: '/', secure: true, prefix: 'host' };
}

export function setCeremonyCookie(c: Context, config: WebAuthnConfig, token: string): void {
    setCookie(c, CEREMONY_COOKIE_NAME, token, {
        ...baseAttrs(config),
        // Matches the ceremony's own 5-minute challenge TTL — the cookie must not outlive the
        // challenge row it carries the token for.
        maxAge: Math.floor(CHALLENGE_TTL_MS / 1000),
    });
}

export function getCeremonyToken(c: Context, config: WebAuthnConfig): string | undefined {
    return isLocalHttp(config)
        ? getCookie(c, CEREMONY_COOKIE_NAME)
        : getCookie(c, CEREMONY_COOKIE_NAME, 'host');
}

/** Every verify clears the ceremony cookie, success or failure (decision 13) — it is single-use. */
export function clearCeremonyCookie(c: Context, config: WebAuthnConfig): void {
    deleteCookie(c, CEREMONY_COOKIE_NAME, baseAttrs(config));
}

export function setSessionCookie(
    c: Context,
    config: WebAuthnConfig,
    token: string,
    sessionTtlMs: number,
): void {
    setCookie(c, SESSION_COOKIE_NAME, token, {
        ...baseAttrs(config),
        maxAge: Math.floor(sessionTtlMs / 1000),
    });
}

export function getSessionToken(c: Context, config: WebAuthnConfig): string | undefined {
    return isLocalHttp(config)
        ? getCookie(c, SESSION_COOKIE_NAME)
        : getCookie(c, SESSION_COOKIE_NAME, 'host');
}

export function clearSessionCookie(c: Context, config: WebAuthnConfig): void {
    deleteCookie(c, SESSION_COOKIE_NAME, baseAttrs(config));
}
