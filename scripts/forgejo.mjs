#!/usr/bin/env node
//
// forgejo.mjs — the issue/PR/read surface for the Forgejo-backed work pipeline.
//
// The `gh` replacement for everything that ISN'T a routing-label write (that's
// forgejo-project.mjs) or the merge guard (forgejo-merge.mjs). Covers the gh
// subcommands the skills actually use: issue list/view/create/edit/comment/close
// and pr create/list/close/view. REST-only (no gh, no tea).
//
// Reading the tracker: `list` (alias for `issue list`) returns issues as a JSON
// array — the routing (status/track/size/model/agent/lens) is read straight off
// each issue's `labels[]` by namespace prefix. A closed issue is "done" (DOCTRINE
// §1); pass --open to a picking skill. The endpoint pages to completion (no 30-item
// board default to trip over).
//
// Usage:
//   node scripts/forgejo.mjs list [--open|--state all|closed] [--label L]... [--milestone M]
//   node scripts/forgejo.mjs issue view <n>
//   node scripts/forgejo.mjs issue create --title T [--body B] [--label L]... [--milestone M]
//   node scripts/forgejo.mjs issue edit <n> [--title T] [--body B] [--add-label L]... [--remove-label L]... [--milestone M]
//   node scripts/forgejo.mjs issue comment <n> --body B
//   node scripts/forgejo.mjs issue close <n>
//   node scripts/forgejo.mjs pr create --head BRANCH [--base main] --title T [--body B]
//   node scripts/forgejo.mjs pr list [--state open|closed|all]
//   node scripts/forgejo.mjs pr view <n>
//   node scripts/forgejo.mjs pr close <n>
//
// list/view print JSON (pipe to jq/python); create/edit/comment/close print a
// one-line human result. --body may be "@path" or "@-" to read the body from a file
// or stdin (long markdown bodies — mirrors gh -F).
//
// Auth/env identical to forgejo-project.mjs: FORGEJO_API / FORGEJO_TOKEN[_FILE] /
// FORGEJO_REPO. Exit codes: 0 ok · 1 usage/API error · 3 Forgejo unreachable (STOP).

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const API = process.env.FORGEJO_API ?? 'https://git.brndn.zip/api/v1';
const [OWNER, REPO] = (process.env.FORGEJO_REPO ?? 'brandon/Ensemble').split('/');
const TOKEN_FILE = process.env.FORGEJO_TOKEN_FILE ?? join(homedir(), '.config/forgejo/token');
const PAGE = 50;

function token() {
    const t = process.env.FORGEJO_TOKEN ?? readFileSync(TOKEN_FILE, 'utf8').trim();
    if (!t) throw new Error(`empty token (${TOKEN_FILE})`);
    return t;
}

function fail(msg, code = 1) {
    console.error(`forgejo: ${msg}`);
    process.exit(code);
}

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
        fail(`Forgejo unreachable (${method} ${path}): ${e.message} — stopping; do NOT treat cached state as current`, 3);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            /* keep raw text for the error message */
        }
    }
    if (!res.ok) fail(`${method} ${path} → ${res.status}: ${data?.message ?? text.slice(0, 200)}`);
    return data;
}

const R = `/repos/${OWNER}/${REPO}`;

// --- tiny flag parser: collects --flag value (repeatable → array) + positionals ---
function parseArgs(argv) {
    const flags = {};
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const val = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
            if (flags[key] === undefined) flags[key] = val;
            else flags[key] = [].concat(flags[key], val); // repeated → array
        } else {
            positional.push(a);
        }
    }
    return { flags, positional };
}

const asArray = (v) => (v === undefined ? [] : [].concat(v));

// --body "@path" / "@-" (stdin) → contents, mirroring gh -F.
function readBody(v) {
    if (typeof v !== 'string') return v;
    if (v === '@-') return readFileSync(0, 'utf8');
    if (v.startsWith('@')) return readFileSync(v.slice(1), 'utf8');
    return v;
}

// name→id maps for label / milestone resolution on create/edit.
let _labels;
async function labelId(name) {
    if (!_labels) {
        const list = await api('GET', `${R}/labels?limit=200`);
        _labels = new Map(list.map((l) => [l.name, l.id]));
    }
    const id = _labels.get(name);
    if (id === undefined) fail(`no label "${name}" (have ${[..._labels.keys()].length} labels)`);
    return id;
}
let _milestones;
async function milestoneId(title) {
    if (!_milestones) {
        const list = await api('GET', `${R}/milestones?state=all&limit=100`);
        _milestones = new Map(list.map((m) => [m.title, m.id]));
    }
    const id = _milestones.get(title);
    if (id === undefined) fail(`no milestone "${title}" (have: ${[..._milestones.keys()].join(', ')})`);
    return id;
}

// Slim projection for list/view so skills get a stable, small shape.
function slimIssue(i) {
    return {
        number: i.number,
        title: i.title,
        state: i.state,
        url: i.html_url,
        labels: (i.labels ?? []).map((l) => l.name),
        milestone: i.milestone?.title ?? null,
        body: i.body ?? '',
    };
}

async function listIssues(flags) {
    const state = flags.open ? 'open' : (flags.state && flags.state !== true ? flags.state : 'open');
    const labels = asArray(flags.label).filter((x) => x !== true);
    const qs = new URLSearchParams({ type: 'issues', state, limit: String(PAGE) });
    if (labels.length) qs.set('labels', labels.join(','));
    if (flags.milestone && flags.milestone !== true) qs.set('milestones', flags.milestone);
    const out = [];
    for (let page = 1; ; page++) {
        qs.set('page', String(page));
        const batch = await api('GET', `${R}/issues?${qs}`);
        out.push(...batch);
        if (batch.length < PAGE) break;
    }
    console.log(JSON.stringify(out.map(slimIssue), null, 2));
}

async function issueCmd(sub, rest) {
    const { flags, positional } = parseArgs(rest);
    const n = positional[0];
    switch (sub) {
        case 'list':
            return listIssues(flags);
        case 'view': {
            if (!n) fail('usage: issue view <n>');
            console.log(JSON.stringify(slimIssue(await api('GET', `${R}/issues/${n}`)), null, 2));
            return;
        }
        case 'create': {
            if (!flags.title || flags.title === true) fail('usage: issue create --title T [--body B] [--label L]... [--milestone M]');
            const payload = { title: flags.title, body: flags.body ? readBody(flags.body) : '' };
            const labels = asArray(flags.label).filter((x) => x !== true);
            if (labels.length) payload.labels = await Promise.all(labels.map(labelId));
            if (flags.milestone && flags.milestone !== true) payload.milestone = await milestoneId(flags.milestone);
            const issue = await api('POST', `${R}/issues`, payload);
            console.log(`created #${issue.number}: ${issue.html_url}`);
            return;
        }
        case 'edit': {
            if (!n) fail('usage: issue edit <n> [--title T] [--body B] [--add-label L]... [--remove-label L]... [--milestone M]');
            const patch = {};
            if (flags.title && flags.title !== true) patch.title = flags.title;
            if (flags.body) patch.body = readBody(flags.body);
            if (flags.milestone && flags.milestone !== true) patch.milestone = await milestoneId(flags.milestone);
            if (Object.keys(patch).length) await api('PATCH', `${R}/issues/${n}`, patch);
            for (const name of asArray(flags['remove-label']).filter((x) => x !== true)) {
                await api('DELETE', `${R}/issues/${n}/labels/${await labelId(name)}`);
            }
            const add = asArray(flags['add-label']).filter((x) => x !== true);
            if (add.length) await api('POST', `${R}/issues/${n}/labels`, { labels: await Promise.all(add.map(labelId)) });
            console.log(`edited #${n}`);
            return;
        }
        case 'comment': {
            if (!n || !flags.body) fail('usage: issue comment <n> --body B');
            const c = await api('POST', `${R}/issues/${n}/comments`, { body: readBody(flags.body) });
            console.log(`commented on #${n}: ${c.html_url}`);
            return;
        }
        case 'close': {
            if (!n) fail('usage: issue close <n>');
            await api('PATCH', `${R}/issues/${n}`, { state: 'closed' });
            console.log(`closed #${n}`);
            return;
        }
        default:
            fail(`unknown: issue ${sub}`);
    }
}

async function prCmd(sub, rest) {
    const { flags, positional } = parseArgs(rest);
    const n = positional[0];
    switch (sub) {
        case 'create': {
            if (!flags.head || flags.head === true || !flags.title || flags.title === true) {
                fail('usage: pr create --head BRANCH [--base main] --title T [--body B]');
            }
            const pr = await api('POST', `${R}/pulls`, {
                head: flags.head,
                base: flags.base && flags.base !== true ? flags.base : 'main',
                title: flags.title,
                body: flags.body ? readBody(flags.body) : '',
            });
            console.log(`created PR #${pr.number}: ${pr.html_url}`);
            return;
        }
        case 'list': {
            const state = flags.state && flags.state !== true ? flags.state : 'open';
            const prs = await api('GET', `${R}/pulls?state=${state}&limit=${PAGE}`);
            console.log(JSON.stringify(prs.map((p) => ({ number: p.number, title: p.title, state: p.state, url: p.html_url, head: p.head?.ref })), null, 2));
            return;
        }
        case 'view': {
            if (!n) fail('usage: pr view <n>');
            const p = await api('GET', `${R}/pulls/${n}`);
            console.log(JSON.stringify({ number: p.number, title: p.title, state: p.state, url: p.html_url, head: p.head?.ref, merged: p.merged, mergeable: p.mergeable }, null, 2));
            return;
        }
        case 'close': {
            if (!n) fail('usage: pr close <n>');
            await api('PATCH', `${R}/pulls/${n}`, { state: 'closed' });
            console.log(`closed PR #${n}`);
            return;
        }
        default:
            fail(`unknown: pr ${sub}`);
    }
}

const [cmd, sub, ...rest] = process.argv.slice(2);

if (cmd === 'list') {
    await listIssues(parseArgs([sub, ...rest].filter((x) => x !== undefined)).flags);
} else if (cmd === 'issue') {
    if (!sub) fail('usage: issue <list|view|create|edit|comment|close> ...');
    await issueCmd(sub, rest);
} else if (cmd === 'pr') {
    if (!sub) fail('usage: pr <create|list|view|close> ...');
    await prCmd(sub, rest);
} else {
    fail('usage: forgejo.mjs <list|issue|pr> ...');
}
