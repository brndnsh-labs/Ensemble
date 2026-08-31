import { spawnSync } from 'node:child_process';
import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const CHECKOUT_ROOT = path.resolve(import.meta.dirname, '../..');

function runDocsValidator(cwd: string) {
    return spawnSync(process.execPath, ['scripts/validate-docs.ts'], {
        cwd,
        encoding: 'utf8',
        timeout: 15_000,
    });
}

function createLinkedCheckoutFixture() {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'ensemble-validate-docs-'));

    for (const entry of readdirSync(CHECKOUT_ROOT, { withFileTypes: true })) {
        if (entry.name === '.claude' || entry.name === '.git' || entry.name === 'node_modules') {
            continue;
        }
        symlinkSync(
            path.join(CHECKOUT_ROOT, entry.name),
            path.join(fixtureRoot, entry.name),
            entry.isDirectory() ? 'dir' : 'file',
        );
    }

    const fixtureClaudeRoot = path.join(fixtureRoot, '.claude');
    const fixtureAgentsRoot = path.join(fixtureClaudeRoot, 'agents');
    mkdirSync(fixtureAgentsRoot, { recursive: true });
    symlinkSync(
        path.join(CHECKOUT_ROOT, '.claude/skills'),
        path.join(fixtureClaudeRoot, 'skills'),
        'dir',
    );
    for (const entry of readdirSync(path.join(CHECKOUT_ROOT, '.claude/agents'), {
        withFileTypes: true,
    })) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
            copyFileSync(
                path.join(CHECKOUT_ROOT, '.claude/agents', entry.name),
                path.join(fixtureAgentsRoot, entry.name),
            );
        }
    }

    return { fixtureRoot, fixtureAgentsRoot };
}

describe('agent definition documentation validation', () => {
    it('discovers new agent definitions and rejects their nonexistent paths', () => {
        const { fixtureRoot, fixtureAgentsRoot } = createLinkedCheckoutFixture();
        const temporaryAgent = path.join(fixtureAgentsRoot, 'validator-regression.md');

        try {
            writeFileSync(temporaryAgent, '`tests/nonexistent-agent-definition-path.test.ts`\n');
            const invalidResult = runDocsValidator(fixtureRoot);

            expect(invalidResult.error).toBeUndefined();
            expect(invalidResult.signal).toBeNull();
            expect(invalidResult.status).toBe(1);
            expect(invalidResult.stderr).toContain(
                '[.claude/agents/validator-regression.md] Broken link',
            );
            expect(invalidResult.stderr).toContain(
                '`tests/nonexistent-agent-definition-path.test.ts`',
            );

            writeFileSync(
                temporaryAgent,
                [
                    '`tests/CLAUDE.md`',
                    '`public/state/<slice>.ts`',
                    '`public/engine/synth-{bass,chords}.ts`',
                    '',
                ].join('\n'),
            );
            const restoredResult = runDocsValidator(fixtureRoot);

            expect(restoredResult.error).toBeUndefined();
            expect(restoredResult.signal).toBeNull();
            expect(restoredResult.status, restoredResult.stderr).toBe(0);
        } finally {
            rmSync(fixtureRoot, { recursive: true });
        }
    });

    it.each(['tests/missing-<agent.test.ts', 'tests/missing-{agent.test.ts'])(
        'does not exempt the malformed template path %s',
        (malformedPath) => {
            const { fixtureRoot, fixtureAgentsRoot } = createLinkedCheckoutFixture();
            const temporaryAgent = path.join(fixtureAgentsRoot, 'validator-regression.md');

            try {
                writeFileSync(temporaryAgent, `\`${malformedPath}\`\n`);
                const result = runDocsValidator(fixtureRoot);

                expect(result.error).toBeUndefined();
                expect(result.signal).toBeNull();
                expect(result.status).toBe(1);
                expect(result.stderr).toContain(`\`${malformedPath}\``);
            } finally {
                rmSync(fixtureRoot, { recursive: true });
            }
        },
    );
});
