/**
 * share-codec.ts — main-thread persistence / share-URL codec.
 *
 * What belongs here: the wire format for getting a chart *out of* and *back
 * into* the app — Unicode-safe Base64, the minified section payload used by
 * share URLs and saved presets, and the section-id generator that
 * deserialization has to mint. These are main-thread concerns only; the logic
 * worker never encodes or decodes a share payload.
 *
 * What does NOT belong here: musical/timing math (`../utils.js`), seeded RNG
 * and hashing (`../engine/hash-utils.js`), or raw string sanitization
 * (`../sanitize.js` — this module *consumes* it during decode; the dependency
 * runs one way only, share-codec → sanitize, never back).
 */

import { TIME_SIGNATURES } from '../config.js';
import { escapeHTML, stripDangerousChars } from '../sanitize.js';
import type { Section } from './arranger.js';

/**
 * Unicode-safe Base64 encode: JSON string → UTF-8 bytes → binary string → btoa.
 * Shared by the share-URL payloads (sections + band settings).
 */
export function encodeBase64Unicode(json: string): string {
    const bytes = new TextEncoder().encode(json);
    const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
    return btoa(binString);
}

/**
 * Unicode-safe Base64 decode: atob → binary string → UTF-8 bytes → JSON string.
 * The inverse of {@link encodeBase64Unicode}. Callers own size guards and JSON.parse.
 */
export function decodeBase64Unicode(str: string): string {
    const binString = atob(str);
    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0) || 0);
    return new TextDecoder().decode(bytes);
}

/**
 * Generates a unique ID for sections.
 */
export function generateId(): string {
    // 🛡️ Sentinel: Security Enhancement - Cryptographically Secure UUID
    // Date.now() + Math.random() is susceptible to collisions and is not secure.
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `id-${crypto.randomUUID()}`;
    }
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const array = new Uint32Array(2);
        crypto.getRandomValues(array);
        return `id-${array[0].toString(36)}${array[1].toString(36)}`;
    }
    return `id-${Date.now().toString(36)}${Math.random().toString(36).substr(2)}`;
}

/**
 * Compresses the sections array into a Base64 string, handling Unicode.
 */
export function compressSections(sections: Section[]): string {
    const minified = sections.map((s) => {
        const m: Record<string, unknown> = { l: s.label, v: s.value };
        if (s.key) {
            m.k = s.key;
        }
        if (typeof s.isMinor === 'boolean') {
            m.m = s.isMinor ? 1 : 0;
        }
        if (s.repeat && s.repeat > 1) {
            m.r = s.repeat;
        }
        if (s.timeSignature) {
            m.t = s.timeSignature;
        }
        if (s.seamless) {
            m.s = 1;
        }
        if (typeof s.targetIntensity === 'number') {
            m.i = Math.max(0, Math.min(1, s.targetIntensity));
        }
        if (s.instruments && Object.keys(s.instruments).length > 0) {
            const e: Record<string, 0 | 1> = {};
            for (const [k, v] of Object.entries(s.instruments)) {
                if (typeof v === 'boolean') {
                    e[k] = v ? 1 : 0;
                }
            }
            if (Object.keys(e).length > 0) {
                m.e = e;
            }
        }
        return m;
    });
    const json = JSON.stringify(minified);
    return encodeBase64Unicode(json);
}

/**
 * Decompresses the Base64 string back into sections, handling Unicode.
 */
export function decompressSections(str: string): Section[] {
    try {
        if (!str || typeof str !== 'string') {
            throw new Error('Invalid input');
        }
        // Limit input size to 100KB to prevent memory exhaustion
        if (str.length > 102400) {
            throw new Error('Payload too large');
        }

        const json = decodeBase64Unicode(str);
        const minified = JSON.parse(json);

        if (!Array.isArray(minified)) {
            throw new Error('Invalid format: expected array');
        }
        // Limit number of sections to prevent DoS
        const safeMinified = minified.slice(0, 500);

        return safeMinified.map((s: any, i: number) => {
            // Sanitize label to prevent XSS (even though likely handled by UI framework, defense in depth)
            let safeLabel = escapeHTML(s.l || `Section ${i + 1}`);
            if (safeLabel.length > 100) {
                safeLabel = safeLabel.substring(0, 100);
            }

            // Clamp value length
            let safeValue = typeof s.v === 'string' ? s.v : '';
            if (safeValue.length > 1000) {
                safeValue = safeValue.substring(0, 1000);
            }

            safeValue = stripDangerousChars(safeValue);

            const out: Section = {
                id: generateId(),
                label: safeLabel,
                value: safeValue,
                key: typeof s.k === 'string' ? escapeHTML(s.k) : '',
                isMinor: typeof s.m === 'number' ? s.m === 1 : undefined,
                repeat: Math.min(Math.max(1, parseInt(s.r, 10) || 1), 64), // Clamp repeats
                // Membership, not just length (#1258). `decompressSections`'s output goes
                // straight into state with no `validateSections` pass, so this is the ONLY
                // guard on the `?s=` path — and '__proto__' (9), 'toString' (8) and
                // 'valueOf' (7) all slipped under a `length < 10` check. TIME_SIGNATURES is
                // null-prototype now so the consequence is already neutralized downstream,
                // but two readers of one field disagreeing on its keyspace is the defect:
                // `validateSections` requires table membership, so this should too.
                // Membership, not just length (#1258). `decompressSections`'s output goes
                // straight into state with no `validateSections` pass, so this is the ONLY
                // guard on the `?s=` path — and '__proto__' (9), 'toString' (8) and
                // 'valueOf' (7) all slipped under a `length < 10` check. TIME_SIGNATURES is
                // null-prototype now so the consequence is already neutralized downstream,
                // but two readers of one field disagreeing on its keyspace is the defect:
                // `validateSections` requires table membership, so this should too.
                timeSignature: typeof s.t === 'string' && TIME_SIGNATURES[s.t] ? s.t : '',
                seamless: !!s.s,
            };
            if (typeof s.i === 'number' && Number.isFinite(s.i)) {
                out.targetIntensity = Math.max(0, Math.min(1, s.i));
            }
            if (s.e && typeof s.e === 'object') {
                const allowed: Section['instruments'] = {};
                const keys: Array<keyof NonNullable<Section['instruments']>> = [
                    'groove',
                    'bass',
                    'chords',
                    'harmony',
                    'soloist',
                ];
                for (const k of keys) {
                    const raw = (s.e as Record<string, unknown>)[k];
                    if (raw === 0 || raw === 1) {
                        allowed[k] = raw === 1;
                    } else if (typeof raw === 'boolean') {
                        allowed[k] = raw;
                    }
                }
                if (Object.keys(allowed).length > 0) {
                    out.instruments = allowed;
                }
            }
            return out;
        });
    } catch (e) {
        console.error('Failed to decompress sections', e);
        return [{ id: generateId(), label: 'Intro', value: 'I | IV' }];
    }
}
