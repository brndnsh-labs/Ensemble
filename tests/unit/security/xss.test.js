import { describe, expect, it } from 'vitest';
import { escapeHTML } from '../../../public/utils.js';

describe('Security Utilities', () => {
    describe('escapeHTML', () => {
        it('should escape basic HTML characters', () => {
            const input = '<div class="test"> & \'single\'</div>';
            const expected =
                '&lt;div class=&quot;test&quot;&gt; &amp; &#39;single&#39;&lt;/div&gt;';
            expect(escapeHTML(input)).toBe(expected);
        });

        it('should handle strings with no HTML characters', () => {
            const input = 'Hello World';
            expect(escapeHTML(input)).toBe('Hello World');
        });

        it('should handle empty strings', () => {
            expect(escapeHTML('')).toBe('');
        });

        it('should handle non-string inputs safely (by converting or returning empty)', () => {
            expect(escapeHTML(null)).toBe('');
            expect(escapeHTML(undefined)).toBe('');
            expect(escapeHTML(123)).toBe('123');
        });

        it('should prevent script injection', () => {
            const input = '<script>alert(1)</script>';
            expect(escapeHTML(input)).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
        });

        it('should prevent event handler injection', () => {
            const input = '<img src=x onerror=alert(1)>';
            expect(escapeHTML(input)).toBe('&lt;img src=x onerror=alert(1)&gt;');
        });
    });
});
