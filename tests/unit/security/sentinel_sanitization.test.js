import { describe, expect, it } from 'vitest';
import { decompressSections, escapeHTML } from '../../../public/utils.js';

describe('Security: Input Sanitization', () => {
    describe('escapeHTML', () => {
        it('should escape backticks', () => {
            const input = '`alert(1)`';
            // Current implementation fails this (expects raw backtick)
            // We want it to be &#96; or similar
            const escaped = escapeHTML(input);
            expect(escaped).not.toContain('`');
        });
    });

    describe('decompressSections', () => {
        it('should sanitize section values (chords)', () => {
            // Manually construct a malicious payload simulating a compressed string
            // We can't easily use compressSections because it doesn't exist in the test scope easily without mocking
            // But decompressSections just takes base64 encoded JSON

            const maliciousSections = [{ l: 'Verse', v: 'C | <script>alert(1)</script> | F' }];
            const json = JSON.stringify(maliciousSections);
            const encoded = btoa(json); // This works in Node/Vitest environment usually

            const result = decompressSections(encoded);
            const value = result[0].value;

            // We want dangerous chars stripped or escaped
            expect(value).not.toContain('<script>');
            expect(value).not.toContain('</script>');
        });

        it('should sanitize section labels', () => {
            const maliciousSections = [{ l: 'Verse <img src=x onerror=alert(1)>', v: 'C' }];
            const json = JSON.stringify(maliciousSections);
            const encoded = btoa(json);

            const result = decompressSections(encoded);
            const label = result[0].label;

            expect(label).not.toContain('<img');
            expect(label).toContain('&lt;img');
        });

        it('should preserve valid text characters like apostrophes and ampersands', () => {
            const sections = [{ l: 'R&B', v: "Don't Stop" }];
            const json = JSON.stringify(sections);
            const encoded = btoa(json);

            const result = decompressSections(encoded);
            const value = result[0].value;

            expect(value).toBe("Don't Stop");
            // Label is escaped
            expect(result[0].label).toBe('R&amp;B');
        });
    });
});
