// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { escapeHTML } from '../../../public/sanitize.js';
import { tryDecompressSections } from '../../../public/state/share-codec.js';

describe('Security: Data Integrity & Sanitization', () => {
    describe('HTML Sanitization (escapeHTML)', () => {
        it('should escape basic HTML characters', () => {
            const input = '<div class="test"> & \'single\'</div>';
            const expected =
                '&lt;div class=&quot;test&quot;&gt; &amp; &#39;single&#39;&lt;/div&gt;';
            expect(escapeHTML(input)).toBe(expected);
        });

        it('should escape backticks', () => {
            const input = '`alert(1)`';
            const escaped = escapeHTML(input);
            expect(escaped).not.toContain('`');
        });

        it('should handle strings with no HTML characters', () => {
            const input = 'Hello World';
            expect(escapeHTML(input)).toBe('Hello World');
        });

        it('should handle empty strings and non-string inputs safely', () => {
            expect(escapeHTML('')).toBe('');
            expect(escapeHTML(null)).toBe('');
            expect(escapeHTML(undefined)).toBe('');
            expect(escapeHTML(123)).toBe('123');
        });

        it('should prevent script and event handler injection', () => {
            expect(escapeHTML('<script>alert(1)</script>')).toBe(
                '&lt;script&gt;alert(1)&lt;/script&gt;',
            );
            expect(escapeHTML('<img src=x onerror=alert(1)>')).toBe(
                '&lt;img src=x onerror=alert(1)&gt;',
            );
        });
    });

    describe('Safe Deserialization (tryDecompressSections)', () => {
        it('exposes decode failures to strict persisted-data callers', () => {
            expect(tryDecompressSections(btoa('{{{{'))).toBeNull();
            for (const invalidSections of ['[null]', '[1]', '["x"]', '[[]]']) {
                expect(tryDecompressSections(btoa(invalidSections))).toBeNull();
            }
        });

        it('should limit the number of decompressed sections', () => {
            const hugeArray = new Array(1000).fill({ l: 'A', v: 'C' });
            const payload = JSON.stringify(hugeArray);
            const bytes = new TextEncoder().encode(payload);
            const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
            const encoded = btoa(binString);

            const result = tryDecompressSections(encoded);
            expect(result.length).toBeLessThanOrEqual(500);
        });

        it('should sanitize section labels and values during decompression', () => {
            const malicious = [{ l: '<script>alert(1)</script>', v: 'C | <img src=x> | F' }];
            const json = JSON.stringify(malicious);
            const encoded = btoa(json);

            const result = tryDecompressSections(encoded);

            expect(result[0].label).not.toContain('<script>');
            expect(result[0].label).toContain('&lt;script&gt;');

            expect(result[0].value).not.toContain('<img');
        });

        it('should preserve valid text characters like apostrophes and ampersands', () => {
            const sections = [{ l: 'R&B', v: "Don't Stop" }];
            const json = JSON.stringify(sections);
            const encoded = btoa(json);

            const result = tryDecompressSections(encoded);
            expect(result[0].value).toBe("Don't Stop");
            expect(result[0].label).toBe('R&amp;B');
        });
    });
});
