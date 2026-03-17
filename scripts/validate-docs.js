import fs from 'node:fs';
import path from 'node:path';

/**
 * ENSEMBLE DOCUMENTATION VALIDATOR
 *
 * Ensures that all file paths mentioned in documentation exist
 * and that all core modules are mapped in AI_MAP.md.
 */

const DOCS_TO_SCAN = [
    'AI_MAP.md',
    'GEMINI.md',
    'AI.md',
    'docs/guides/WORKER_CONTRACT.md',
    'docs/guides/ENSEMBLE_COORDINATION.md',
    'docs/guides/REFERENCE_TUNING.md',
];

const CORE_DIRECTORIES = [
    'public',
    'public/engine',
    'public/state',
    'public/components',
    'public/data',
];

const IGNORE_EXTENSIONS = ['.png', '.svg', '.jpg', '.jpeg', '.webp'];
const IGNORE_FILES = [
    '.DS_Store',
    'node_modules',
    '.git',
    'index.html',
    'manifest.json',
    'pwa.js',
    'sw.js',
    'styles.css',
    'icon.svg',
];

function validateDocs() {
    let hasError = false;
    const aiMapPath = 'AI_MAP.md';

    if (!fs.existsSync(aiMapPath)) {
        console.error('❌ Critical: AI_MAP.md is missing.');
        process.exit(1);
    }

    const aiMapContent = fs.readFileSync(aiMapPath, 'utf-8');

    console.log('🔍 Phase 1: Validating Documentation Links...');

    for (const doc of DOCS_TO_SCAN) {
        if (!fs.existsSync(doc)) {
            console.warn(`⚠️  Warning: Optional doc file missing: ${doc}`);
            continue;
        }

        const content = fs.readFileSync(doc, 'utf-8');

        const pathRegex = /`([^`]+\.[a-z0-9]+)`|`([^`]+\/)`/g;
        let match = pathRegex.exec(content);
        const checkedInDoc = new Set();

        while (match !== null) {
            const rawPath = match[1] || match[3];
            if (!rawPath || rawPath.startsWith('http') || rawPath.startsWith('{{')) {
                match = pathRegex.exec(content);
                continue;
            }

            const cleanPath = rawPath.trim().replace(/\/$/, '');

            if (checkedInDoc.has(cleanPath)) {
                match = pathRegex.exec(content);
                continue;
            }
            checkedInDoc.add(cleanPath);

            if (
                cleanPath.includes('--') ||
                (cleanPath.toUpperCase() === cleanPath && cleanPath.includes('_'))
            ) {
                match = pathRegex.exec(content);
                continue;
            }

            const validRoot =
                /^(public|docs|tests|scripts|package\.json|GEMINI\.md|AI\.md|AI_MAP\.md|tests\/)/;
            if (!validRoot.test(cleanPath)) {
                match = pathRegex.exec(content);
                continue;
            }

            if (!fs.existsSync(cleanPath)) {
                console.error(`❌ [${doc}] Broken link: \`${rawPath}\` does not exist on disk.`);
                hasError = true;
            }
            match = pathRegex.exec(content);
        }
    }

    console.log('🔍 Phase 2: Detecting Unmapped Shadow Files...');

    for (const dir of CORE_DIRECTORIES) {
        if (!fs.existsSync(dir)) {
            continue;
        }

        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file).replace(/\\/g, '/');

            if (fs.statSync(fullPath).isDirectory()) {
                continue;
            }

            if (IGNORE_FILES.includes(file) || IGNORE_EXTENSIONS.includes(path.extname(file))) {
                continue;
            }

            // Check if this file is mentioned in AI_MAP.md
            // Support either direct file mapping or directory-level mapping for components
            const isMapped =
                aiMapContent.includes(`\`${fullPath}\``) ||
                (fullPath.startsWith('public/components/') &&
                    aiMapContent.includes('`public/components/`'));

            if (!isMapped) {
                console.warn(`⚠️  Shadow File: \`${fullPath}\` is not mapped in AI_MAP.md`);
                if (fullPath.startsWith('public/engine/') && !fullPath.includes('grooves/')) {
                    console.error(
                        `❌ Error: Core engine file \`${fullPath}\` MUST be mapped in AI_MAP.md`,
                    );
                    hasError = true;
                }
            }
        }
    }

    if (hasError) {
        console.log('\n❌ Documentation validation FAILED.');
        process.exit(1);
    } else {
        console.log('\n✅ Documentation validation PASSED.');
    }
}

validateDocs();
