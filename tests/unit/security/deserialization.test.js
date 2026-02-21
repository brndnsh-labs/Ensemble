/* eslint-disable */
import { describe, expect, it } from 'vitest';
import { decompressSections } from '../../../public/utils.js';

describe('Security: Deserialization', () => {
    it('should handle malformed JSON gracefully', () => {
        const badBase64 = btoa('{{{{'); // Invalid JSON
        const result = decompressSections(badBase64);
        expect(result).toHaveLength(1);
        expect(result[0].label).toBe('Intro');
    });

    it('should limit the number of decompressed sections', () => {
        // Create a large payload
        const hugeArray = new Array(10000).fill({ l: 'A', v: 'C' });
        const payload = JSON.stringify(hugeArray);
        // Emulate the encoding in utils.js
        const bytes = new TextEncoder().encode(payload);
        const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
        const encoded = btoa(binString);

        const result = decompressSections(encoded);
        // We expect it to either be capped or fail to default
        expect(result.length).toBeLessThanOrEqual(500);
    });

    it('should sanitize section labels', () => {
        const malicious = [{ l: '<script>alert(1)</script>', v: 'C' }];
        const payload = JSON.stringify(malicious);
        const bytes = new TextEncoder().encode(payload);
        const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
        const encoded = btoa(binString);

        const result = decompressSections(encoded);
        // Expect sanitized output
        expect(result[0].label).not.toContain('<script>');
        expect(result[0].label).toContain('&lt;script&gt;');
    });
});
