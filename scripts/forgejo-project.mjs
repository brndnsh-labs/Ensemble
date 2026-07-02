#!/usr/bin/env node
//
// forgejo-project.mjs — the work-pipeline field writer for the Forgejo-backed board.
//
// Replaces gh-project.mjs. On Forgejo there is no Projects-v2 GraphQL board: the
// single-select "fields" are modelled as LABEL NAMESPACES, and **labels are the
// source of truth** (the board view is eyes-only — no skill writes it). So setting
// a field = swapping one label within its namespace. Each namespace is single-select:
// setting `track/synth` removes any other `track/*` first, mutual-exclusion enforced
// here in code.
//
// Field  → namespace     Values (label slug = value lowercased, spaces→hyphens)
//   Status  status/*       ready | in-progress | in-review | needs-decision | needs-ear | blocked
//   Track   track/*        musical | synth | bundle | ui
//   Model   model/*        sonnet | opus
//   Size    size/*         s | m | l
//   Agent   agent/*        claude | synth-implementer | musical-engine-implementer | ...
//   "Review lens" lens/*   music-theory | synth-graph | state-discipline | ... | both
//
// Usage (same shape as gh-project.mjs, so the skills port ~verbatim):
//   node scripts/forgejo-project.mjs status <issue#> "<Status>"     # set the status/* label
//   node scripts/forgejo-project.mjs set-field <issue#> "<Field>" "<Value>"
//   node scripts/forgejo-project.mjs clear <issue#> "<Field>"       # drop all labels in that ns
//   node scripts/forgejo-project.mjs ensure <issue#>                # verify issue exists (no board)
//   node scripts/forgejo-project.mjs batch <file.json>              # many writes, one GET/PUT per issue
//
// The `batch` file is a JSON array of { "issue": N, "field": "Status", "value": "Ready" }.
// Omit field/value (or null) for an ensure-only entry. Batch groups by issue so each
// issue's labels are fetched once and written once, no matter how many fields it sets.
//
// Auth: token at ~/.config/forgejo/token (scopes write:issue,write:repository), API at
// https://git.brndn.zip/api/v1 (LAN/WG-only). Override with FORGEJO_API / FORGEJO_TOKEN /
// FORGEJO_TOKEN_FILE / FORGEJO_REPO (owner/name) — used by the isolation test.
//
// Exit codes: 0 ok · 1 a write/lookup failed · 3 Forgejo unreachable (skills must STOP,
// never treat cached board state as current — the §7 "gh offline → stop" rule).

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const API = process.env.FORGEJO_API ?? 'https://git.brndn.zip/api/v1';
const [OWNER, REPO] = (process.env.FORGEJO_REPO ?? 'brandon/Ensemble').split('/');
const TOKEN_FILE = process.env.FORGEJO_TOKEN_FILE ?? join(homedir(), '.config/forgejo/token');

// Field name (as the skills say it) → label namespace prefix.
const FIELD_NS = {
    Status: 'status',
    Track: 'track',
    Model: 'model',
    Size: 'size',
    Agent: 'agent',
    'Review lens': 'lens',
};

function token() {
    const t = process.env.FORGEJO_TOKEN ?? readFileSync(TOKEN_FILE, 'utf8').trim();
    if (!t) {
        throw new Error(`empty token (${TOKEN_FILE})`);
    }
    return t;
}

function fail(msg, code = 1) {
    console.error(`forgejo-project: ${msg}`);
    process.exit(code);
}

// One fetch wrapper: JSON in/out, token auth, and a hard STOP (exit 3) on a
// connection-level failure so a skill never proceeds on stale board state.
async function api(method, path, body) {
    let res;
    try {
        res = await fetch(`${API}${path}`, {
            method,
            headers: {
                Authorization: `token ${token()}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch (e) {
        fail(
            `Forgejo unreachable (${method} ${path}): ${e.message} — stopping; do NOT treat cached board state as current`,
            3,
        );
    }
    if (res.status === 204) {
        return null;
    }
    const text = await res.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            /* non-JSON body (e.g. an HTML error page) — keep the raw text for the message */
        }
    }
    if (!res.ok) {
        const detail = data?.message ?? text.slice(0, 200);
        fail(`${method} ${path} → ${res.status}: ${detail}`);
    }
    return data;
}

// namespace label maps, fetched once. name→id and id→name over ALL repo labels.
let _labels;
async function labels() {
    if (!_labels) {
        const list = await api('GET', `/repos/${OWNER}/${REPO}/labels?limit=200`);
        _labels = new Map(list.map((l) => [l.name, l.id]));
    }
    return _labels;
}

// Resolve "Field" + "Value" → the target label name + id, enforcing that the
// namespace and the specific option both exist.
async function resolveLabel(field, value) {
    const ns = FIELD_NS[field];
    if (!ns) {
        fail(`unknown field "${field}" (have: ${Object.keys(FIELD_NS).join(', ')})`);
    }
    const slug = String(value).trim().toLowerCase().replace(/\s+/g, '-');
    const name = `${ns}/${slug}`;
    const map = await labels();
    const id = map.get(name);
    if (!id) {
        const opts = [...map.keys()].filter((n) => n.startsWith(`${ns}/`)).sort();
        fail(`no label "${name}" for ${field}="${value}" (have: ${opts.join(', ') || '(none)'})`);
    }
    return { ns, name, id };
}

async function issueLabels(issueNum) {
    return api('GET', `/repos/${OWNER}/${REPO}/issues/${issueNum}/labels`);
}

// Replace the full label set in ONE PUT, preserving every label outside the touched
// namespace (bug, area:*, etc. must survive a status write).
async function putLabels(issueNum, ids) {
    await api('PUT', `/repos/${OWNER}/${REPO}/issues/${issueNum}/labels`, { labels: ids });
}

// Apply one field op to a working array of label objects (mutual-exclusion within ns).
// Returns the new array. `target` is null to clear the namespace, else {id, name} —
// the name must be real (not null): batch chains applyOp calls, so a later op filters
// on the name a prior op just added.
function applyOp(current, ns, target) {
    const kept = current.filter((l) => !l.name.startsWith(`${ns}/`));
    return target == null ? kept : [...kept, target];
}

async function setField(issueNum, field, value) {
    // Status "Shipped" is retired — a closed issue IS done. Treat it as clearing status/*.
    if (field === 'Status' && String(value).trim().toLowerCase() === 'shipped') {
        await clearField(issueNum, 'Status');
        console.log(`#${issueNum}: Status "Shipped" is retired — cleared status/* (closed = done)`);
        return;
    }
    const { ns, name, id } = await resolveLabel(field, value);
    const current = await issueLabels(issueNum);
    if (
        current.some((l) => l.id === id) &&
        !current.some((l) => l.name.startsWith(`${ns}/`) && l.id !== id)
    ) {
        console.log(`#${issueNum}: ${field} already ${value}`);
        return;
    }
    const next = applyOp(current, ns, { id, name });
    await putLabels(
        issueNum,
        next.map((l) => l.id),
    );
    console.log(`#${issueNum}: ${field} → ${name}`);
}

async function clearField(issueNum, field) {
    const ns = FIELD_NS[field];
    if (!ns) {
        fail(`unknown field "${field}" (have: ${Object.keys(FIELD_NS).join(', ')})`);
    }
    const current = await issueLabels(issueNum);
    if (!current.some((l) => l.name.startsWith(`${ns}/`))) {
        console.log(`#${issueNum}: ${field} already clear`);
        return;
    }
    const next = applyOp(current, ns, null);
    await putLabels(
        issueNum,
        next.map((l) => l.id),
    );
    console.log(`#${issueNum}: ${field} cleared`);
}

// No board on Forgejo — "ensure on board" collapses to "the issue exists". Kept so
// callers that still say `ensure` succeed during the transition.
async function ensure(issueNum) {
    const issue = await api('GET', `/repos/${OWNER}/${REPO}/issues/${issueNum}`);
    console.log(`#${issue.number}: exists (no board — labels are truth)`);
}

async function runBatch(file) {
    let queue;
    try {
        queue = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
        fail(`could not read batch file "${file}": ${e.message}`);
    }
    if (!Array.isArray(queue)) {
        fail('batch file must be a JSON array of { issue, field, value }');
    }

    // Group by issue so we GET + PUT each issue's labels exactly once.
    const byIssue = new Map();
    for (const entry of queue) {
        const n = Number(entry.issue);
        if (Number.isNaN(n)) {
            fail(`bad entry (no issue#): ${JSON.stringify(entry)}`);
        }
        if (!byIssue.has(n)) {
            byIssue.set(n, []);
        }
        byIssue.get(n).push(entry);
    }

    let ok = 0;
    const failures = [];
    for (const [issueNum, entries] of byIssue) {
        try {
            let working = await issueLabels(issueNum);
            let touched = false;
            for (const entry of entries) {
                if (entry.field == null) {
                    console.log(`#${issueNum}: exists`);
                    ok++;
                    continue;
                }
                if (
                    entry.field === 'Status' &&
                    String(entry.value).trim().toLowerCase() === 'shipped'
                ) {
                    working = applyOp(working, 'status', null);
                    touched = true;
                    console.log(`#${issueNum}: Status "Shipped" retired → cleared status/*`);
                    ok++;
                    continue;
                }
                const { ns, name, id } = await resolveLabel(entry.field, entry.value);
                working = applyOp(working, ns, { id, name });
                touched = true;
                console.log(`#${issueNum}: ${entry.field} → ${name}`);
                ok++;
            }
            if (touched) {
                await putLabels(
                    issueNum,
                    working.map((l) => l.id),
                );
            }
        } catch (e) {
            failures.push(`#${issueNum}: ${e.message}`);
        }
    }
    console.log(`=== batch: ${ok} ok, ${failures.length} failed ===`);
    if (failures.length) {
        failures.forEach((f) => console.error(`  !! ${f}`));
        process.exit(1);
    }
}

const [cmd, arg, a, b] = process.argv.slice(2);

if (cmd === 'batch') {
    if (!arg) {
        fail('usage: forgejo-project.mjs batch <file.json>');
    }
    await runBatch(arg);
} else {
    const issueNum = Number(arg);
    if (!cmd || Number.isNaN(issueNum)) {
        fail('usage: forgejo-project.mjs <status|set-field|clear|ensure|batch> <issue#|file> ...');
    }
    switch (cmd) {
        case 'status':
            if (!a) {
                fail('usage: status <issue#> "<Status>"');
            }
            await setField(issueNum, 'Status', a);
            break;
        case 'set-field':
            if (!a || b === undefined) {
                fail('usage: set-field <issue#> "<Field>" "<Value>"');
            }
            await setField(issueNum, a, b);
            break;
        case 'clear':
            if (!a) {
                fail('usage: clear <issue#> "<Field>"');
            }
            await clearField(issueNum, a);
            break;
        case 'ensure':
            await ensure(issueNum);
            break;
        default:
            fail(`unknown command "${cmd}"`);
    }
}
