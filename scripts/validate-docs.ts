// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

/**
 * ENSEMBLE DOCUMENTATION VALIDATOR
 *
 * Ensures that all file paths mentioned in documentation exist
 * and that all core modules are mapped in AI_MAP.md.
 */

// The dir-scoped agent docs (#1153), active agent definitions, and the pipeline skill tree.
// These are
// auto-loaded the moment an agent works in the matching directory, so a rotted
// path here misleads at exactly the point it is most trusted — and until #1303
// none of them were scanned at all. That gap cost a real pointer: the
// impulse-response bisection harness moved to `tests/browser/` in #1097 while
// `public/engine/CLAUDE.md` kept sending readers to `tests/e2e/`.
//
// Both sets are DISCOVERED, not listed. A hand-maintained list is the exact
// failure this gate just suffered — `DOCS_TO_SCAN` was never extended when
// #1153 added the dir-scoped docs, and nobody noticed for months. Enumerating
// them here would only move that staleness one file over.
const AGENT_DOC_ROOTS = ['public', 'tests'];
const AGENT_DEFINITIONS_ROOT = '.claude/agents';
const SKILLS_ROOT = '.claude/skills';

/** Every dir-scoped `CLAUDE.md` under the source tree, at any depth. */
function discoverNestedAgentDocs() {
    const found = [];
    const walk = (dir) => {
        if (!fs.existsSync(dir)) {
            return;
        }
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name).replace(/\\/g, '/');
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.name === 'CLAUDE.md') {
                found.push(full);
            }
        }
    };
    for (const root of AGENT_DOC_ROOTS) {
        walk(root);
    }
    return found;
}

/** Every `.claude/agents/*.md` definition — a new agent is scanned the day it lands. */
function discoverAgentDefinitionDocs() {
    if (!fs.existsSync(AGENT_DEFINITIONS_ROOT)) {
        return [];
    }
    return fs
        .readdirSync(AGENT_DEFINITIONS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => `${AGENT_DEFINITIONS_ROOT}/${entry.name}`);
}

/** DOCTRINE plus every `.claude/skills/<name>/SKILL.md` — a new skill is scanned the day it lands. */
function discoverSkillDocs() {
    if (!fs.existsSync(SKILLS_ROOT)) {
        return [];
    }
    const docs = fs
        .readdirSync(SKILLS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${SKILLS_ROOT}/${entry.name}/SKILL.md`);
    // Loose shared docs beside the skill dirs (DOCTRINE, migration notes).
    docs.push(
        ...fs
            .readdirSync(SKILLS_ROOT, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
            .map((entry) => `${SKILLS_ROOT}/${entry.name}`),
    );
    return docs.filter((docPath) => fs.existsSync(docPath));
}

const DOCS_TO_SCAN = [
    'README.md',
    'AI_MAP.md',
    'CLAUDE.md',
    'AGENTS.md',
    '.github/CONTRIBUTING.md',
    '.github/SECURITY.md',
    '.github/CODE_OF_CONDUCT.md',
    'docs/README.md',
    'docs/guides/WORKER_CONTRACT.md',
    'docs/guides/ENSEMBLE_COORDINATION.md',
    'docs/guides/REFERENCE_TUNING.md',
    'docs/guides/PERFORMANCE_GUIDELINES.md',
    'tests/README.md',
    ...discoverNestedAgentDocs(),
    ...discoverAgentDefinitionDocs(),
    ...discoverSkillDocs(),
];

// Phase 2 (unmapped-shadow-file detection) only scans what's listed here, so a
// directory missing from this list is a directory where new files can land
// without ever being flagged as absent from AI_MAP.md.
//
// #1178 is moving `public/` root files into family directories. EVERY new family
// dir must be added here in the phase that creates it — otherwise the reorg
// quietly retires this guard for exactly the files it just relocated.
const CORE_DIRECTORIES = [
    'public',
    'public/engine',
    'public/state',
    'public/components',
    'public/data',
    'public/song', // #1178 phase 1
    'public/export', // #1178 phase 1
    'public/controllers', // #1178 phase 2
    'public/visualizer', // #1178 phase 4
    'public/songbook',
];

const IGNORE_EXTENSIONS = ['.png', '.svg', '.jpg', '.jpeg', '.webp'];
const IGNORE_FILES = [
    '.DS_Store',
    'node_modules',
    '.git',
    'index.html',
    'manifest.json',
    'pwa.ts',
    'sw.ts',
    'styles.css',
    'icon.svg',
];

const VALID_BARE_LINKS = new Set([
    'README.md',
    'CLAUDE.md',
    'AGENTS.md',
    'AI_MAP.md',
    'package.json',
    'package-lock.json',
    'playwright.config.ts',
]);

const VALID_LINK_PREFIXES = [
    '.claude/', // the agent-doc tree: DOCTRINE, skills, agent definitions
    '.github/',
    '.vscode/',
    'docs/',
    'guides/',
    'archive/',
    'public/',
    'tests/',
    'scripts/',
];

const PLAYWRIGHT_DOCS = ['CLAUDE.md'];
const REGISTER_DOCS = [
    'CLAUDE.md',
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

/**
 * Is this backtick span a path this gate should check at all?
 *
 * The repo-root prefix allowlist is the primary test, and it stays the ONLY test
 * for root-level docs — widening it there would start checking incidental spans
 * like `dist/assets/index.js`. The dir-scoped agent docs (#1153) additionally
 * cite paths relative to their OWN directory (`state/history.ts` in
 * `public/CLAUDE.md`, `../coordination-engine.ts` in the grooves one), so for
 * those a second, self-limiting test applies: an explicit `./`/`../`, or a first
 * segment that is a real subdirectory of the doc. A span that matches neither
 * isn't treated as a path — that's a skip, not a pass.
 *
 * @param {string} cleanPath
 * @param {string} docDir  the doc's own directory, '.' for a root-level doc
 * @returns {boolean}
 */
function isCheckablePath(cleanPath, docDir) {
    // An absolute path is a MACHINE path, never a repo path — the deploy target
    // (`/var/www/html/`), a scratch file (`/tmp/…`). Nothing here can resolve it
    // and nothing should try.
    if (cleanPath.startsWith('/')) {
        return false;
    }
    if (!cleanPath.includes('/')) {
        return VALID_BARE_LINKS.has(cleanPath);
    }
    if (VALID_LINK_PREFIXES.some((prefix) => cleanPath.startsWith(prefix))) {
        return true;
    }
    if (!allowsDocRelativeLinks(docDir)) {
        return false;
    }
    if (cleanPath.startsWith('./') || cleanPath.startsWith('../')) {
        return true;
    }
    const firstSegment = cleanPath.split('/')[0];
    const candidate = path.join(docDir, firstSegment);
    return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
}

/**
 * Doc-relative resolution is for docs that live INSIDE the source tree and
 * describe their siblings — `public/**`, `tests/`. The pipeline skill tree
 * cites every repo path root-relative (`scripts/gh-project.mjs`,
 * `tests/standards/…`), and its only relative spans point outside the repo
 * entirely (the `../archived-memory/` memory tree in `/wrap-up`). Reading those
 * as repo-relative invents a broken link out of correct prose, so `.claude/**`
 * gets root-relative checking only — which still catches the rot that actually
 * threatens it.
 *
 * @param {string} docDir
 * @returns {boolean}
 */
function allowsDocRelativeLinks(docDir) {
    return docDir !== '.' && !docDir.startsWith('.claude');
}

/**
 * A cited path counts as resolved if it exists repo-relative OR relative to the
 * citing doc. Both readings are legitimate and both appear in the tree, so
 * demanding one spelling would red the gate on correct docs.
 *
 * @param {string} cleanPath
 * @param {string} docDir
 * @returns {boolean}
 */
function docLinkExists(cleanPath, docDir) {
    return fs.existsSync(cleanPath) || fs.existsSync(path.resolve(docDir, cleanPath));
}

function validatePlaywrightProjectDocs() {
    let hasError = false;
    const projects = extractPlaywrightProjects(readText('playwright.config.ts'));

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
        const docDir = path.dirname(doc);

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
                // A glob/template is a deliberate reference to a FAMILY of files
                // (`synth-*.ts`, `public/state/<slice>.ts`, `synth-{bass,drums}.ts`) —
                // real, and not resolvable by `existsSync`. Skipping is the correct read.
                cleanPath.includes('*') ||
                /<[^<>]+>|\{[^{}]+\}/.test(cleanPath) ||
                !isCheckablePath(cleanPath, docDir)
            ) {
                match = pathRegex.exec(content);
                continue;
            }

            if (checkedInDoc.has(cleanPath)) {
                match = pathRegex.exec(content);
                continue;
            }
            checkedInDoc.add(cleanPath);

            if (!docLinkExists(cleanPath, docDir)) {
                console.error(`❌ [${doc}] Broken link: \`${rawPath}\` does not exist on disk.`);
                hasError = true;
            }
            match = pathRegex.exec(content);
        }
    }

    console.log('🔍 Phase 2: Detecting Unmapped Shadow Files...');

    /**
     * Files directly inside `dir`, plus (when `recurse`) files nested inside its
     * subdirectories. `public` itself stays shallow — its subdirectories are each
     * already their own CORE_DIRECTORIES entry, so recursing it too would just
     * re-walk them (and pull in non-code dirs like `public/css`, `public/packs`).
     * @param {string} dir
     * @param {boolean} recurse
     * @returns {string[]}
     */
    function collectFiles(dir, recurse) {
        const results = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name).replace(/\\/g, '/');
            if (entry.isDirectory()) {
                if (recurse) {
                    results.push(...collectFiles(fullPath, recurse));
                }
                continue;
            }
            results.push(fullPath);
        }
        return results;
    }

    for (const dir of CORE_DIRECTORIES) {
        if (!fs.existsSync(dir)) {
            continue;
        }

        for (const fullPath of collectFiles(dir, dir !== 'public')) {
            const file = path.basename(fullPath);

            if (IGNORE_FILES.includes(file) || IGNORE_EXTENSIONS.includes(path.extname(file))) {
                continue;
            }

            // Check if this file is mentioned in AI_MAP.md
            // Support either direct file mapping or directory-level mapping for
            // components — but only for files directly in public/components/,
            // not its subdirectories (e.g. public/components/editor/), so a new
            // subdirectory file must still be individually mapped or fall to the
            // grooves-style warn-only path below.
            const isMapped =
                aiMapContent.includes(`\`${fullPath}\``) ||
                (path.dirname(fullPath) === 'public/components' &&
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
