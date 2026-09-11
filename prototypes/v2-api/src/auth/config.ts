/**
 * WebAuthn ceremony configuration for #1188's registration/login modules.
 *
 * Orchestrator decision 2: configuration is an explicit argument, never a module-level
 * `process.env` read (the sibling froze these at import time). Every ceremony function in
 * `src/auth/` takes a `WebAuthnConfig` value built here — construct it once at the call
 * site nearest the environment (an HTTP entrypoint, a test setup) and pass it down.
 */

export interface WebAuthnConfig {
    /** Valid domain name (after `https://`), baked into every credential at creation time. */
    readonly rpId: string;
    /** User-visible relying-party name shown by the platform's passkey UI. */
    readonly rpName: string;
    /** The single origin ceremonies are bound to. Never an array — never widened. */
    readonly origin: string;
}

export interface WebAuthnConfigInput {
    rpId: string;
    rpName: string;
    origin: string;
}

/**
 * Validates and freezes a `WebAuthnConfig`. Throws synchronously on anything malformed —
 * this is a programmer-facing contract violation (bad deployment config), not a per-request
 * failure, so it is not part of the typed ceremony failure-reason unions. A misconfigured
 * origin/RP ID must fail loudly here, at construction, rather than silently accepting
 * something "close enough" and letting every subsequent ceremony fail with no hint that
 * config is the cause (P2-4).
 *
 * **Origin must already be in canonical form.** `new URL(origin).origin === origin` is the
 * single check that rejects a trailing slash, a path, a query, a fragment, an uppercase host,
 * an explicit default port (`https://example.com:443`), and userinfo (`https://a@b`) all at
 * once — `URL#origin` always renders the canonical form (lowercase host, no default port, no
 * path/query/fragment/userinfo), so any input that round-trips to something else was not
 * canonical to begin with. This module never silently rewrites a non-canonical origin into a
 * canonical one — the caller must already pass the canonical form, exactly as a browser's
 * `location.origin` would report it.
 *
 * Then, `origin` must use `https:` — except `http://localhost` (any port), allowed for local
 * development only. Never accepts an array: widening production origin acceptance to make a
 * test hostname work is exactly the mistake the design doc calls out (the sibling's `www.`
 * outage). Add a distinct config value for a distinct environment instead.
 *
 * **`rpId` must exactly equal the origin's hostname.** WebAuthn permits an RP ID that is a
 * registrable parent of the host, but this service deliberately does not: the design requires
 * separate explicit test and production RP IDs, and a shared parent domain (`brndn.zip` for
 * both `ensembletest.brndn.zip` and `ensemble.brndn.zip`) would scope one environment's
 * passkeys onto the other. A string-level suffix check also cannot tell a registrable domain
 * from a public suffix (`zip`, `co.uk`) or a fragment of an IP address (`1.10`), and the
 * browser would refuse all of those — so every ceremony would fail with nothing pointing at
 * the config. Relaxing this later is a deliberate design change, not a config tweak.
 *
 * IP-literal and trailing-dot hosts are rejected outright for the same reason: browsers do not
 * accept them as RP IDs, so the misconfiguration should fail here, loudly, at startup.
 */
export function createWebAuthnConfig(input: WebAuthnConfigInput): WebAuthnConfig {
    const { rpId, rpName, origin } = input;

    if (typeof rpId !== 'string' || rpId.trim().length === 0) {
        throw new Error(`rpId must be a non-empty string, got ${JSON.stringify(rpId)}`);
    }
    if (typeof rpName !== 'string' || rpName.trim().length === 0) {
        throw new Error(`rpName must be a non-empty string, got ${JSON.stringify(rpName)}`);
    }
    if (typeof origin !== 'string' || origin.trim().length === 0) {
        throw new Error(`origin must be a non-empty string, got ${JSON.stringify(origin)}`);
    }

    let parsed: URL;
    try {
        parsed = new URL(origin);
    } catch {
        throw new Error(`origin must be a valid absolute URL, got ${JSON.stringify(origin)}`);
    }

    if (parsed.origin !== origin) {
        throw new Error(
            `origin must already be canonical (no trailing slash, path, query, fragment, ` +
                `uppercase host, default port, or userinfo) — expected ${JSON.stringify(parsed.origin)}, ` +
                `got ${JSON.stringify(origin)}`,
        );
    }

    const isLocalhostHttp = parsed.protocol === 'http:' && parsed.hostname === 'localhost';
    if (parsed.protocol !== 'https:' && !isLocalhostHttp) {
        throw new Error(
            `origin must use https:, or http://localhost for local development; got ${JSON.stringify(origin)}`,
        );
    }

    const hostname = parsed.hostname;
    if (hostname.endsWith('.') || hostname.startsWith('[') || /^\d+(\.\d+){3}$/.test(hostname)) {
        throw new Error(
            `origin host must be a domain name, not an IP literal or a trailing-dot name; ` +
                `got ${JSON.stringify(hostname)}`,
        );
    }
    // `URL` always reports a lowercase ASCII hostname, so exact equality also rejects an
    // untrimmed or uppercase rpId without a separate check.
    if (rpId !== hostname) {
        throw new Error(
            `rpId ${JSON.stringify(rpId)} must exactly equal the origin's hostname ` +
                `(${JSON.stringify(hostname)}); separate environments use separate RP IDs, ` +
                'never a shared parent domain',
        );
    }

    return Object.freeze({ rpId, rpName, origin });
}
