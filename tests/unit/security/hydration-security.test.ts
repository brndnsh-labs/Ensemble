/**
 * Security of v1's reading rules (`public/state/state-hydration.ts`), which the v2 stand's v1
 * import (#1274) still applies to every saved session and progression it reads.
 *
 * These cases used to drive v1's own readers (`hydrateState`, `loadFromUrl`) end to end. Those
 * readers went with v1's load/save layer (#1424); what survives is each rule, tested directly,
 * because the untrusted bytes still arrive — from a real v1 profile's `localStorage`.
 */
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../../public/config.js';
import { normalizeSongSeed } from '../../../public/sanitize.js';
import {
    clamp,
    normalizeSwingSub,
    sanitizeDisplayString,
    validateSections,
} from '../../../public/state/state-hydration.js';

type Untrusted = Parameters<typeof validateSections>[0];

// why (#1258): `clamp` coerced with `Number()`, so null/false/[] became 0 rather than NaN --
// landing on `min` instead of the intended default. For a volume field that meant a silently
// muted instrument, which is worse than the default it skipped.
describe('clamp() rejects non-numbers instead of coercing them to zero (#1258)', () => {
    it.each([
        ['null', null],
        ['false', false],
        ['an empty array', []],
        ['an object', {}],
        ['Infinity', Number.POSITIVE_INFINITY],
    ])('uses the default, not the minimum, for %s', (_label, bad) => {
        // Assert the actual contract (the 1.0 default), not merely "not muted" -- `not.toBe(0)`
        // would also pass on 0.5 or NaN.
        expect(clamp(bad, 0, 1, 1.0)).toBe(1.0);
    });

    it('accepts a legitimate numeric string, and clamps it (the accept direction)', () => {
        expect(clamp('140', 20, 300, 100)).toBe(140);
        expect(clamp('200', 0, 100, 0)).toBe(100);
        expect(clamp(-20, 0, 100, 20)).toBe(0);
    });
});

// why (#1257): the broken share reader wrote the *number* 8 into this string field and v1 then
// saved it, so a real v1 profile can still hold it. Normalizing is what un-sticks it.
describe('normalizeSwingSub (#1257)', () => {
    it('recovers a numeric swingSub written by the pre-fix share reader', () => {
        expect(normalizeSwingSub(8)).toBe('8th');
        expect(normalizeSwingSub('constructor')).toBe('8th');
    });

    it('keeps a valid 16th (the accept direction)', () => {
        expect(normalizeSwingSub('16th')).toBe('16th');
    });
});

describe('sanitizeDisplayString (#1266)', () => {
    it('sanitizes free text without allowlisting it', () => {
        // A sanitizer, not an allowlist: v1 put arbitrary user text here (a saved progression's
        // name), so a real user's own name must survive.
        expect(sanitizeDisplayString("Brandon's Tune #4", 'fallback')).toBe("Brandon's Tune #4");
        expect(sanitizeDisplayString('<b>Bad "Quote"</b>', 'fallback')).toBe('bBad Quote/b');
        expect(sanitizeDisplayString('z'.repeat(500), 'fallback')).toHaveLength(100);
        expect(sanitizeDisplayString({ evil: 1 }, 'fallback')).toBe('fallback');
    });
});

// why (#1258): four allowlist checks validated untrusted input by indexing a plain object
// literal and testing truthiness. Every `Object.prototype` member resolves through the prototype
// chain and reads as truthy, so `TIME_SIGNATURES['__proto__']` was a valid-looking hit -- and it
// ALSO defeated the `TIME_SIGNATURES[x] || TIME_SIGNATURES['4/4']` fallback, poisoning meter math
// into NaN instead of defaulting to 4/4. Fixed at the declaration (null prototype).
describe('Prototype-pollution-shaped keys in allowlist lookups (#1258)', () => {
    // The pin. A null prototype looks like a stylistic quirk, so a future "simplify this back to
    // a plain literal" would silently reopen every case below.
    it('keeps the untrusted-input lookup table prototype-less', () => {
        expect(Object.getPrototypeOf(TIME_SIGNATURES)).toBeNull();
        // Indexed through a variable: these keys arrive at runtime from untrusted bytes.
        for (const key of ['__proto__', 'constructor', 'toString', 'valueOf']) {
            expect(TIME_SIGNATURES[key]).toBeUndefined();
            expect(TIME_SIGNATURES[key] || TIME_SIGNATURES['4/4']).toBe(TIME_SIGNATURES['4/4']);
        }
        // ...without breaking ordinary reads.
        expect(TIME_SIGNATURES['4/4'].beats).toBe(4);
    });

    it.each(['__proto__', 'constructor', 'toString'])(
        'rejects a section timeSignature of %s',
        (key) => {
            const [section] = validateSections([
                { id: '1', label: 'A', value: 'I', timeSignature: key },
            ]);
            expect(section.timeSignature).toBe('');
        },
    );

    it('keeps a valid non-4/4 section timeSignature (the accept direction)', () => {
        const [section] = validateSections([
            { id: '1', label: 'A', value: 'I', timeSignature: '7/8' },
        ]);
        expect(section.timeSignature).toBe('7/8');
    });
});

// why (#1258): a section id keys per-section lookups (`sectionSeedMap`). A truthiness check let
// a non-string id straight through; an object-valued id stringifies to "[object Object]" and
// COLLIDES across every section carrying one. #1266 adds the prototype-member rejection.
describe('validateSections section ids (#1258, #1266)', () => {
    it.each([
        ['an object', {}],
        ['a number', 7],
        ['an array', []],
        ['true', true],
    ])('mints a fresh string id when the id is %s', (_label, badId) => {
        const [a, b] = validateSections([
            { id: badId, label: 'A', value: 'I' },
            { id: badId, label: 'B', value: 'IV' },
        ]);
        expect(typeof a.id).toBe('string');
        expect(typeof b.id).toBe('string');
        // The actual defect was collision, not just the wrong type.
        expect(a.id).not.toBe(b.id);
        expect(a.id).not.toBe('[object Object]');
    });

    it.each(['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'])(
        'mints a fresh id for a prototype-shaped section id (%s)',
        (badId) => {
            const [section] = validateSections([{ id: badId, label: 'A', value: 'I' }]);
            expect(section.id).not.toBe(badId);
            expect(typeof section.id).toBe('string');
        },
    );

    it('preserves a legitimate string id (the accept direction)', () => {
        expect(validateSections([{ id: 'sec-abc', label: 'A', value: 'I' }])[0].id).toBe('sec-abc');
    });
});

describe('validateSections: DoS and XSS prevention', () => {
    it('limits the number of sections (DoS prevention)', () => {
        const massive = Array.from({ length: 1000 }, (_, i) => ({
            id: `sec-${i}`,
            label: `Section ${i}`,
            value: 'I | IV',
        }));
        expect(validateSections(massive).length).toBeLessThanOrEqual(500);
    });

    it('sanitizes section labels and values (XSS prevention)', () => {
        const [sec1, sec2] = validateSections([
            { id: 'xss1', label: '<script>alert(1)</script>', value: 'I | IV' },
            { id: 'xss2', label: 'Safe', value: '<img src=x>' },
        ]);
        expect(sec1.label).not.toContain('<script>');
        expect(sec2.value).not.toContain('<img');
    });

    it('validates a section key against the allowlist', () => {
        const [bad, good] = validateSections([
            { id: '1', label: 'A', value: 'I', key: 'InvalidKey' },
            { id: '2', label: 'B', value: 'I', key: 'A#' },
        ]);
        expect(bad.key).toBe('');
        expect(good.key).toBe('Bb');
    });

    it('returns no sections for a wrong-shaped payload', () => {
        expect(validateSections('I | IV | V | I' as unknown as Untrusted)).toEqual([]);
    });
});

describe('validateSections: the additive section fields (#1029)', () => {
    it('bounds section intensity and rejects malformed overrides', () => {
        const [bounded, rejected] = validateSections([
            {
                id: 'bounded',
                label: 'Bounded',
                value: 'I',
                targetIntensity: 9,
                instruments: { groove: false, bass: 'off', soloist: true, constructor: true },
            },
            {
                id: 'rejected',
                label: 'Rejected',
                value: 'IV',
                targetIntensity: '0.5',
                instruments: ['groove'],
            },
        ]);
        expect(bounded.targetIntensity).toBe(1);
        expect(bounded.instruments).toEqual({ groove: false, soloist: true });
        expect(rejected).not.toHaveProperty('targetIntensity');
        expect(rejected).not.toHaveProperty('instruments');
    });

    it('adds neither field when a legacy section lacks them', () => {
        const [section] = validateSections([{ id: 'legacy', label: 'Legacy', value: 'I' }]);
        expect(section).not.toHaveProperty('targetIntensity');
        expect(section).not.toHaveProperty('instruments');
    });
});

// #1258/#1266 — one bound for the song seed, shared by every reader of it: the v1 import
// (`import-v1.ts`), the songbook codec and the `SET_SONG_SEED` reducer (`arranger.ts`). An
// oversized seed was a hashing-cost and data-hygiene problem carried forward indefinitely.
describe('normalizeSongSeed', () => {
    it('bounds, strips and type-checks an untrusted seed', () => {
        expect(normalizeSongSeed('a'.repeat(500))).toHaveLength(64);
        expect(normalizeSongSeed('<script>')).toBe('script');
        expect(normalizeSongSeed({ evil: 1 })).toBe('');
    });

    it('keeps a legitimate seed (the accept direction)', () => {
        expect(normalizeSongSeed('blue-note-42')).toBe('blue-note-42');
    });
});
