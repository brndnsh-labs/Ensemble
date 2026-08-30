// @ts-nocheck
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getFiles(dir, allFiles = []) {
    const files = readdirSync(dir);
    for (const file of files) {
        const name = path.join(dir, file);
        if (statSync(name).isDirectory()) {
            getFiles(name, allFiles);
        } else if (
            name.endsWith('.js') ||
            name.endsWith('.jsx') ||
            name.endsWith('.ts') ||
            name.endsWith('.tsx')
        ) {
            allFiles.push(name);
        }
    }
    return allFiles;
}

describe('Security Ledger Verification: DOM Injection', () => {
    // Audit of Ensemble components and engine logic to ensure no unsafe innerHTML usage.
    // This explicitly prevents XSS via dynamic musical input (chords, labels).

    const projectRoot = path.resolve(__dirname, '../../');
    const publicDir = path.join(projectRoot, 'public');

    const sourceFiles = getFiles(publicDir).filter((f) => {
        // Ignore bundled code and parsers that may need to look at raw HTML/XML
        return (
            !f.includes('public/dist/') &&
            !f.includes('test-dist/') &&
            !f.includes('ManualModal.tsx')
        );
    });

    it('should NOT contain direct innerHTML or dangerouslySetInnerHTML use for musical content', () => {
        const forbiddenPatterns = [/\.innerHTML\b/, /dangerouslySetInnerHTML/];

        const violations = [];

        sourceFiles.forEach((file) => {
            const content = readFileSync(file, 'utf8');
            forbiddenPatterns.forEach((pattern) => {
                if (pattern.test(content)) {
                    // Check if it's a false positive (e.g., within a comment or valid non-dynamic context)
                    violations.push(`${path.relative(projectRoot, file)} matches ${pattern}`);
                }
            });
        });

        expect(violations).toEqual([]);
    });
});
