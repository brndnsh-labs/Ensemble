#!/usr/bin/env node
//
// gh-project.mjs — tiny helper for the GitHub-backed work pipeline (Project #2).
//
// The story-loop skills (/implement, /review, /done) move an issue's Status field
// as it flows Ready → In progress → In review → Shipped. Setting a Project v2
// single-select field over the CLI means resolving three opaque ids (the project,
// the field, the option) and the board item — fiddly to repeat in every skill, so
// it lives here once.
//
// Usage:
//   node scripts/gh-project.mjs status <issue#> "<Status value>"   # set the Status field
//   node scripts/gh-project.mjs set-field <issue#> "<Field>" "<Value>"
//   node scripts/gh-project.mjs clear <issue#> "<Field>"
//   node scripts/gh-project.mjs ensure <issue#>                     # add to board if missing; print item id
//   node scripts/gh-project.mjs batch <file.json>                   # apply many writes in ONE metadata fetch
//
// The `batch` file is a JSON array of { "issue": N, "field": "Status", "value": "Ready" }.
// Omit field/value (or set null) for an ensure-on-board-only entry. Use batch for any
// bulk write (triage, /unblock, /intake): each single-op call refetches the 500-item
// project list, so a loop of them drains the GraphQL quota — batch fetches it once.
//
// Ensemble's custom fields: Status, Track (musical|synth|bundle), Model (sonnet|opus),
// Size (S|M|L), Agent, "Review lens" (note the space in the key).
//
// Read-only env: needs `gh` authed with the `project` scope. Exits non-zero with a
// clear message on any failure so the calling skill can surface it.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const OWNER = 'brndnsh';
const REPO = 'brndnsh/Ensemble';
const PROJECT_NUMBER = '2';

function gh(args, { json = true } = {}) {
    const out = execFileSync('gh', args, { encoding: 'utf8' });
    return json ? JSON.parse(out) : out.trim();
}

function fail(msg) {
    console.error(`gh-project: ${msg}`);
    process.exit(1);
}

// Cached lookups (one process = one invocation, so a module-level cache is plenty).
let _projectId;
function projectId() {
    if (!_projectId) {
        _projectId = gh([
            'project',
            'view',
            PROJECT_NUMBER,
            '--owner',
            OWNER,
            '--format',
            'json',
        ]).id;
    }
    return _projectId;
}

// Memoized so a `batch` run fetches the (expensive) 500-item list and the field
// list exactly once instead of once per write — the per-call refetch is what
// drains the GraphQL quota on bulk updates.
let _items;
function items() {
    if (!_items) {
        _items = gh([
            'project',
            'item-list',
            PROJECT_NUMBER,
            '--owner',
            OWNER,
            '--format',
            'json',
            '-L',
            '500',
        ]).items;
    }
    return _items;
}

let _fields;
function fields() {
    if (!_fields) {
        _fields = gh([
            'project',
            'field-list',
            PROJECT_NUMBER,
            '--owner',
            OWNER,
            '--format',
            'json',
            '-L',
            '50',
        ]).fields;
    }
    return _fields;
}

function itemIdFor(issueNum) {
    const it = items().find((i) => i.content?.type === 'Issue' && i.content?.number === issueNum);
    return it?.id ?? null;
}

function ensureOnBoard(issueNum) {
    const existing = itemIdFor(issueNum);
    if (existing) {
        return existing;
    }
    const url = `https://github.com/${REPO}/issues/${issueNum}`;
    const added = gh([
        'project',
        'item-add',
        PROJECT_NUMBER,
        '--owner',
        OWNER,
        '--url',
        url,
        '--format',
        'json',
    ]);
    // Keep the cache coherent so a later entry in the same batch finds this item.
    if (_items) {
        _items.push({ id: added.id, content: { type: 'Issue', number: issueNum } });
    }
    return added.id;
}

function fieldAndOption(fieldName, value) {
    const field = fields().find((f) => f.name === fieldName);
    if (!field) {
        throw new Error(
            `no field named "${fieldName}" (have: ${fields()
                .map((f) => f.name)
                .join(', ')})`,
        );
    }
    const opt = (field.options ?? []).find((o) => o.name === value);
    if (!opt) {
        throw new Error(
            `field "${fieldName}" has no option "${value}" (have: ${(field.options ?? []).map((o) => o.name).join(', ')})`,
        );
    }
    return { fieldId: field.id, optionId: opt.id };
}

function setField(issueNum, fieldName, value) {
    const id = ensureOnBoard(issueNum);
    const { fieldId, optionId } = fieldAndOption(fieldName, value);
    gh(
        [
            'project',
            'item-edit',
            '--id',
            id,
            '--project-id',
            projectId(),
            '--field-id',
            fieldId,
            '--single-select-option-id',
            optionId,
        ],
        { json: false },
    );
    console.log(`#${issueNum}: ${fieldName} → ${value}`);
}

function clearField(issueNum, fieldName) {
    const id = itemIdFor(issueNum);
    if (!id) {
        fail(`#${issueNum} is not on the board`);
    }
    const field = fields().find((f) => f.name === fieldName);
    if (!field) {
        fail(`no field named "${fieldName}"`);
    }
    gh(
        [
            'project',
            'item-edit',
            '--id',
            id,
            '--project-id',
            projectId(),
            '--field-id',
            field.id,
            '--clear',
        ],
        { json: false },
    );
    console.log(`#${issueNum}: ${fieldName} cleared`);
}

function runBatch(file) {
    let queue;
    try {
        queue = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
        fail(`could not read batch file "${file}": ${e.message}`);
    }
    if (!Array.isArray(queue)) {
        fail('batch file must be a JSON array of { issue, field, value }');
    }

    let ok = 0;
    const failures = [];
    for (const entry of queue) {
        const issueNum = Number(entry.issue);
        if (Number.isNaN(issueNum)) {
            failures.push(`bad entry (no issue#): ${JSON.stringify(entry)}`);
            continue;
        }
        try {
            const id = ensureOnBoard(issueNum);
            if (entry.field == null) {
                console.log(`#${issueNum}: on board`);
                ok++;
                continue;
            }
            const { fieldId, optionId } = fieldAndOption(entry.field, entry.value);
            gh(
                [
                    'project',
                    'item-edit',
                    '--id',
                    id,
                    '--project-id',
                    projectId(),
                    '--field-id',
                    fieldId,
                    '--single-select-option-id',
                    optionId,
                ],
                { json: false },
            );
            console.log(`#${issueNum}: ${entry.field} → ${entry.value}`);
            ok++;
        } catch (e) {
            failures.push(`#${issueNum} ${entry.field ?? ''}: ${e.message}`);
        }
    }
    console.log(`=== batch: ${ok} ok, ${failures.length} failed ===`);
    if (failures.length) {
        failures.forEach((f) => console.error(`  !! ${f}`));
        process.exit(1);
    }
}

const [cmd, issueArg, a, b] = process.argv.slice(2);

if (cmd === 'batch') {
    if (!issueArg) {
        fail('usage: gh-project.mjs batch <file.json>');
    }
    runBatch(issueArg); // exits non-zero itself if any entry failed
} else {
    const issueNum = Number(issueArg);
    if (cmd !== 'ensure' && (!cmd || Number.isNaN(issueNum))) {
        fail('usage: gh-project.mjs <status|set-field|clear|ensure|batch> <issue#|file>');
    }
    try {
        switch (cmd) {
            case 'status':
                setField(issueNum, 'Status', a);
                break;
            case 'set-field':
                setField(issueNum, a, b);
                break;
            case 'clear':
                clearField(issueNum, a);
                break;
            case 'ensure':
                console.log(ensureOnBoard(issueNum));
                break;
            default:
                fail(`unknown command "${cmd}"`);
        }
    } catch (e) {
        fail(e.message);
    }
}
