import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

export interface ClientIdentityOptions {
    /** Production passes a persisted random secret; factory-only tests may use an ephemeral one. */
    secret?: string;
    /** Exact immediate socket peers, not an arbitrary hop count or caller-provided proxy list. */
    trustedProxyAddresses?: readonly string[];
    /** Must be stripped/overwritten by the verified front door. No header precedence guessing. */
    header?: string;
}

function canonicalIp(value: string): string | undefined {
    if (value.includes('%')) {
        return undefined;
    }
    if (isIP(value) === 4) {
        return value;
    }
    if (isIP(value) !== 6) {
        return undefined;
    }
    const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
    // IPv4-mapped IPv6 and ordinary IPv4 must share one bucket.
    const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(normalized);
    if (mapped) {
        const n =
            Number.parseInt(mapped[1] as string, 16) * 65536 +
            Number.parseInt(mapped[2] as string, 16);
        return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
    }
    return normalized;
}

export function createClientIdentity(options: ClientIdentityOptions = {}) {
    const secret = options.secret ?? randomBytes(32).toString('hex');
    if (Buffer.byteLength(secret) < 32) {
        throw new Error('Client identity secret must contain at least 32 bytes');
    }
    const peers = options.trustedProxyAddresses ?? [];
    if ((options.header !== undefined) !== peers.length > 0) {
        throw new Error(
            'Client identity header and trusted proxy addresses must be configured together',
        );
    }
    if (options.header !== undefined && !/^[a-z][a-z0-9-]{0,63}$/.test(options.header)) {
        throw new Error('Invalid client identity header name');
    }
    const trusted = new Set(
        peers.map((peer) => {
            const address = canonicalIp(peer);
            if (!address) {
                throw new Error('Trusted proxy address must be an exact IP address');
            }
            return address;
        }),
    );
    return (c: Context): string => {
        let remote: string | undefined;
        try {
            remote = getConnInfo(c).remote.address;
        } catch {
            /* In-memory request, no socket. */
        }
        const peer = remote === undefined ? undefined : canonicalIp(remote);
        let address = peer ?? 'unknown';
        if (options.header !== undefined && peer !== undefined && trusted.has(peer)) {
            // Missing/malformed verified headers share a fail-closed bucket; never trust XFF.
            address = canonicalIp(c.req.header(options.header)?.trim() ?? '') ?? 'unknown';
        }
        return createHmac('sha256', secret).update(`ensemble-auth-ip\0${address}`).digest('hex');
    };
}
