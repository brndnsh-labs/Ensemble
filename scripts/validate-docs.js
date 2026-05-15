import fs from 'node:fs';
import path from 'node:path';

/**
 * ENSEMBLE DOCUMENTATION VALIDATOR
 *
 * Ensures that all file paths mentioned in documentation exist
 * and that all core modules are mapped in AI_MAP.md.
 */

const DOCS_TO_SCAN = [
    'README.md',
    'AI_MAP.md',
    'AI.md',
    '.github/copilot-instructions.md',
    '.github/CONTRIBUTING.md',
    '.github/SECURITY.md',
    '.github/CODE_OF_CONDUCT.md',
    'docs/README.md',
    'docs/ROADMAP.md',
    'docs/guides/WORKER_CONTRACT.md',
    'docs/guides/ENSEMBLE_COORDINATION.md',
    'docs/guides/REFERENCE_TUNING.md',
    'docs/guides/PERFORMANCE_GUIDELINES.md',
    'tests/README.md',
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

const VALID_BARE_LINKS = new Set([
    'README.md',
    'AI.md',
    'AI_MAP.md',
    'package.json',
    'package-lock.json',
    'playwright.config.js',
]);

const VALID_LINK_PREFIXES = [
    '.github/',
    '.vscode/',
    'docs/',
    'guides/',
    'archive/',
    'public/',
    'tests/',
    'scripts/',
];

const PLAYWRIGHT_DOCS = ['AI.md', '.github/copilot-instructions.md'];
const REGISTER_DOCS = [
    'AI.md',
    'docs/guides/WORKER_CONTRACT.md',
    'docs/guides/ENSEMBLE_COORDINATION.md',
];

/**
 * @param {string} filePath
 * @returns {string}
 */
function readText(filePath) {
    return fs.readFileSync(filePath, 'utf-8');
}

/**
 * @param {string} configContent
 * @returns {string[]}
 */
function extractPlaywrightProjects(configContent) {
    return [...configContent.matchAll(/name:\s*'([^']+)'/g)].map((match) => match[1]);
}

/**
 * @param {string} engineContent
 * @returns {{
 *   bassMin: number,
 *   bassMax: number,
 *   chordMin: number,
 *   chordMax: number,
 *   soloFloor: number,
 *   soloClampMin: number,
 *   soloClampMax: number
 * }}
 */
function extractRegisterSlotting(engineContent) {
    const slottingStart = engineContent.indexOf('export function enforceRegisterSlotting');
    const slottingContent = slottingStart >= 0 ? engineContent.slice(slottingStart) : engineContent;
    const bassMatch = /case 'bass':[\s\S]*?smoothOctaveClamp\(midi,\s*(\d+),\s*(\d+)/.exec(
        slottingContent,
    );
    const chordMatch = /case 'chords':[\s\S]*?smoothOctaveClamp\(midi,\s*(\d+),\s*(\d+)/.exec(
        slottingContent,
    );
    const soloMatch =
        /case 'soloist':[\s\S]*?if \(midi < (\d+)\)[\s\S]*?smoothOctaveClamp\(midi,\s*(\d+),\s*(\d+)/.exec(
            slottingContent,
        );

    if (!bassMatch || !chordMatch || !soloMatch) {
        throw new Error('Unable to extract register slotting rules from coordination-engine.ts');
    }

    return {
        bassMin: Number(bassMatch[1]),
        bassMax: Number(bassMatch[2]),
        chordMin: Number(chordMatch[1]),
        chordMax: Number(chordMatch[2]),
        soloFloor: Number(soloMatch[1]),
        soloClampMin: Number(soloMatch[2]),
        soloClampMax: Number(soloMatch[3]),
    };
}

/**
 * @param {string} docPath
 * @param {RegExp} pattern
 * @param {string} message
 * @returns {boolean}
 */
function ensureDocPattern(docPath, pattern, message) {
    const content = readText(docPath);
    const normalizedContent = content.replace(/\s+/g, ' ');
    if (pattern.test(content) || pattern.test(normalizedContent)) {
        return false;
    }
    console.error(`❌ [${docPath}] ${message}`);
    return true;
}

/**
 * @param {string} rawPath
 * @returns {string | null}
 */
function resolveDocLink(rawPath) {
    return rawPath.trim().split('#')[0].split('?')[0].replace(/\/$/, '');
}

function validatePlaywrightProjectDocs() {
    let hasError = false;
    const projects = extractPlaywrightProjects(readText('playwright.config.js'));

    for (const docPath of PLAYWRIGHT_DOCS) {
        const content = readText(docPath);

        for (const project of projects) {
            if (!content.includes(project)) {
                console.error(`❌ [${docPath}] Missing Playwright project reference: ${project}`);
                hasError = true;
            }
        }

        if (projects.includes('Mobile Chrome') && !content.includes('@mobile')) {
            console.error(`❌ [${docPath}] Missing @mobile tag guidance for Mobile Chrome.`);
            hasError = true;
        }

        if (projects.includes('Mobile Safari') && !content.includes('@ipad')) {
            console.error(`❌ [${docPath}] Missing @ipad tag guidance for Mobile Safari.`);
            hasError = true;
        }
    }

    return hasError;
}

function validateRegisterSlottingDocs() {
    let hasError = false;
    const slotting = extractRegisterSlotting(readText('public/engine/coordination-engine.ts'));
    const rangeSep = '(?:[–-]|to)';

    for (const docPath of REGISTER_DOCS) {
        hasError =
            ensureDocPattern(
                docPath,
                new RegExp(`Bass[^\\n]*${slotting.bassMin}\\s*${rangeSep}\\s*${slotting.bassMax}`),
                `Missing live bass slot ${slotting.bassMin}-${slotting.bassMax}.`,
            ) || hasError;
        hasError =
            ensureDocPattern(
                docPath,
                new RegExp(
                    `Chords(?:\\/Harmony)?[^\\n]*${slotting.chordMin}\\s*${rangeSep}\\s*${slotting.chordMax}`,
                ),
                `Missing live chord slot ${slotting.chordMin}-${slotting.chordMax}.`,
            ) || hasError;
        hasError =
            ensureDocPattern(
                docPath,
                new RegExp(
                    `Soloist(?=[^\\n]*${slotting.soloFloor})(?=[^\\n]*${slotting.soloClampMin}\\s*${rangeSep}\\s*${slotting.soloClampMax})`,
                ),
                `Missing live soloist clamp behavior (${slotting.soloFloor} floor, ${slotting.soloClampMin}-${slotting.soloClampMax} priority lane).`,
            ) || hasError;
    }

    return hasError;
}

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

        const content = readText(doc);

        const pathRegex = /`([^`]+\.[a-z0-9]+)`|`([^`]+\/)`/g;
        let match = pathRegex.exec(content);
        const checkedInDoc = new Set();

        while (match !== null) {
            const rawPath = match[1] || match[2];
            const cleanPath = rawPath ? resolveDocLink(rawPath) : null;
            if (
                !cleanPath ||
                cleanPath.startsWith('http') ||
                cleanPath.startsWith('{{') ||
                (!cleanPath.includes('/') && !VALID_BARE_LINKS.has(cleanPath)) ||
                (cleanPath.includes('/') &&
                    !VALID_LINK_PREFIXES.some((prefix) => cleanPath.startsWith(prefix)))
            ) {
                match = pathRegex.exec(content);
                continue;
            }

            if (checkedInDoc.has(cleanPath)) {
                match = pathRegex.exec(content);
                continue;
            }
            checkedInDoc.add(cleanPath);

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

    console.log('🔍 Phase 3: Checking Semantic Drift...');

    hasError = validatePlaywrightProjectDocs() || hasError;
    hasError = validateRegisterSlottingDocs() || hasError;

    if (hasError) {
        console.log('\n❌ Documentation validation FAILED.');
        process.exit(1);
    } else {
        console.log('\n✅ Documentation validation PASSED.');
    }
}

validateDocs();
