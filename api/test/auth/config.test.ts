import { describe, expect, it } from 'vitest';
import { createWebAuthnConfig } from '../../src/auth/config.js';

describe('createWebAuthnConfig (P2-4 canonicalization)', () => {
    const BASE = { rpId: 'example.com', rpName: 'Ensemble Test' };

    // --- accept cases --------------------------------------------------------------------------

    it('accepts an already-canonical https origin with an exactly-matching rpId', () => {
        expect(() =>
            createWebAuthnConfig({ ...BASE, origin: 'https://example.com' }),
        ).not.toThrow();
    });

    it('accepts a non-default https port', () => {
        expect(() =>
            createWebAuthnConfig({ ...BASE, origin: 'https://example.com:8443' }),
        ).not.toThrow();
    });

    it('accepts the ratified test origin with its own exact RP ID', () => {
        expect(() =>
            createWebAuthnConfig({
                rpId: 'ensembletest.brndn.zip',
                rpName: 'x',
                origin: 'https://ensembletest.brndn.zip',
            }),
        ).not.toThrow();
    });

    it('accepts http://localhost for local development', () => {
        expect(() =>
            createWebAuthnConfig({ rpId: 'localhost', rpName: 'x', origin: 'http://localhost' }),
        ).not.toThrow();
    });

    it('accepts http://localhost with a non-default port', () => {
        expect(() =>
            createWebAuthnConfig({
                rpId: 'localhost',
                rpName: 'x',
                origin: 'http://localhost:5173',
            }),
        ).not.toThrow();
    });

    // --- reject cases: origin non-canonical (P2-4) ----------------------------------------------

    it('rejects a trailing slash', () => {
        expect(() => createWebAuthnConfig({ ...BASE, origin: 'https://example.com/' })).toThrow();
    });

    it('rejects a path', () => {
        expect(() =>
            createWebAuthnConfig({ ...BASE, origin: 'https://example.com/path' }),
        ).toThrow();
    });

    it('rejects a query string', () => {
        expect(() =>
            createWebAuthnConfig({ ...BASE, origin: 'https://example.com?x=1' }),
        ).toThrow();
    });

    it('rejects a fragment', () => {
        expect(() =>
            createWebAuthnConfig({ ...BASE, origin: 'https://example.com#foo' }),
        ).toThrow();
    });

    it('rejects an uppercase host', () => {
        expect(() => createWebAuthnConfig({ ...BASE, origin: 'https://Example.com' })).toThrow();
    });

    it('rejects an explicit default port (https:443)', () => {
        expect(() =>
            createWebAuthnConfig({ ...BASE, origin: 'https://example.com:443' }),
        ).toThrow();
    });

    it('rejects userinfo in the origin', () => {
        expect(() => createWebAuthnConfig({ ...BASE, origin: 'https://a@example.com' })).toThrow();
    });

    // --- reject cases: rpId non-canonical or mismatched (P2-4) ----------------------------------

    it('rejects an untrimmed rpId', () => {
        expect(() =>
            createWebAuthnConfig({
                rpId: ' example.com',
                rpName: 'x',
                origin: 'https://example.com',
            }),
        ).toThrow();
        expect(() =>
            createWebAuthnConfig({
                rpId: 'example.com ',
                rpName: 'x',
                origin: 'https://example.com',
            }),
        ).toThrow();
    });

    it('rejects an uppercase rpId', () => {
        expect(() =>
            createWebAuthnConfig({
                rpId: 'Example.com',
                rpName: 'x',
                origin: 'https://example.com',
            }),
        ).toThrow();
    });

    it('rejects an rpId that is not exactly the origin host', () => {
        expect(() =>
            createWebAuthnConfig({
                rpId: 'totally-different.com',
                rpName: 'x',
                origin: 'https://example.com',
            }),
        ).toThrow();
    });

    it('rejects an rpId that is only a raw substring, not a dot-suffix, of the hostname', () => {
        // "example.com" must not match a hostname like "notexample.com" — the check has to
        // require an actual dot boundary, not a bare String#endsWith.
        expect(() =>
            createWebAuthnConfig({
                rpId: 'example.com',
                rpName: 'x',
                origin: 'https://notexample.com',
            }),
        ).toThrow();
    });

    // --- reject cases: exact RP ID only (no parent-domain relaxation) --------------------------
    // Each rpId below is a string-level dot-suffix of its hostname, which the earlier
    // suffix check accepted. They must be rejected by the exact-equality rule.

    it('rejects a registrable parent domain as rpId', () => {
        expect(() =>
            createWebAuthnConfig({
                rpId: 'example.com',
                rpName: 'x',
                origin: 'https://app.example.com',
            }),
        ).toThrow(/exactly equal/);
    });

    it('rejects a parent domain shared across environments', () => {
        expect(() =>
            createWebAuthnConfig({
                rpId: 'brndn.zip',
                rpName: 'x',
                origin: 'https://ensembletest.brndn.zip',
            }),
        ).toThrow(/exactly equal/);
    });

    it('rejects a public suffix as rpId', () => {
        expect(() =>
            createWebAuthnConfig({
                rpId: 'zip',
                rpName: 'x',
                origin: 'https://ensembletest.brndn.zip',
            }),
        ).toThrow(/exactly equal/);
        expect(() =>
            createWebAuthnConfig({ rpId: 'co.uk', rpName: 'x', origin: 'https://example.co.uk' }),
        ).toThrow(/exactly equal/);
    });

    // --- reject cases: hosts browsers refuse as RP IDs -----------------------------------------
    // rpId equals the hostname in each case, so exact equality cannot be what rejects these.

    it('rejects an https IPv4-literal host even when rpId matches it', () => {
        expect(() =>
            createWebAuthnConfig({
                rpId: '192.168.1.10',
                rpName: 'x',
                origin: 'https://192.168.1.10',
            }),
        ).toThrow(/IP literal/);
    });

    it('rejects an https IPv6-literal host even when rpId matches it', () => {
        expect(() =>
            createWebAuthnConfig({ rpId: '[::1]', rpName: 'x', origin: 'https://[::1]' }),
        ).toThrow(/IP literal/);
    });

    it('rejects a trailing-dot host even when rpId matches it', () => {
        expect(() =>
            createWebAuthnConfig({
                rpId: 'example.com.',
                rpName: 'x',
                origin: 'https://example.com.',
            }),
        ).toThrow(/trailing-dot/);
    });

    // --- reject cases: already correctly rejected, per the review brief ------------------------

    it('rejects http://localhost.evil.com (not exactly localhost)', () => {
        expect(() =>
            createWebAuthnConfig({
                rpId: 'localhost.evil.com',
                rpName: 'x',
                origin: 'http://localhost.evil.com',
            }),
        ).toThrow();
    });

    it('rejects http://127.0.0.1', () => {
        expect(() =>
            createWebAuthnConfig({ rpId: '127.0.0.1', rpName: 'x', origin: 'http://127.0.0.1' }),
        ).toThrow();
    });

    it('rejects http://[::1]', () => {
        expect(() =>
            createWebAuthnConfig({ rpId: '::1', rpName: 'x', origin: 'http://[::1]' }),
        ).toThrow();
    });

    it('rejects a javascript: origin', () => {
        expect(() =>
            createWebAuthnConfig({ rpId: 'example.com', rpName: 'x', origin: 'javascript:' }),
        ).toThrow();
    });

    // --- basic input validation, unchanged by P2-4 ----------------------------------------------

    it('rejects an empty rpId, rpName or origin', () => {
        expect(() =>
            createWebAuthnConfig({ ...BASE, rpId: '', origin: 'https://example.com' }),
        ).toThrow();
        expect(() =>
            createWebAuthnConfig({
                rpId: 'example.com',
                rpName: '',
                origin: 'https://example.com',
            }),
        ).toThrow();
        expect(() => createWebAuthnConfig({ ...BASE, origin: '' })).toThrow();
    });

    it('rejects an unparseable origin', () => {
        expect(() => createWebAuthnConfig({ ...BASE, origin: 'not a url' })).toThrow();
    });
});
