#!/usr/bin/env node
//
// forgejo-merge.mjs — the poll-then-merge guard for the Forgejo-backed pipeline.
//
// Replaces the inline `gh pr checks --watch --fail-fast && gh pr merge` snippet
// (DOCTRINE §6). Forgejo Actions has NO server-side auto-merge-on-green, so — as on
// GitHub — the guard IS the enforcement: wait for CI to REGISTER, block until it
// FINISHES, and merge (squash + delete branch) ONLY if the combined commit-status is
// `success`. On failure it surfaces each failing check's run URL and exits non-zero.
//
// Run it in the BACKGROUND (the poll takes minutes; a foreground sleep is harness-
// blocked). The merge gate is the verified `GET /commits/{sha}/status` endpoint:
// combined `state` (success|pending|failure|error) + per-job `statuses[]`
// ({context, state, target_url}) — the `gh statusCheckRollup` replacement.
//
// After a successful merge, it also closes the issues the PR body references with a
// close keyword (`Closes #<n>`, `fixes #<n>`, …). Forgejo's OWN auto-close-on-merge
// does NOT fire on this script's API squash-merge (observed systemic 2026-07 across
// #1067/#1027 and #1068/#1040 — bodies verifiably carried `Closes #<n>` yet the issues
// stayed open), so the guard closes them itself to remove the recurring manual step.
//
// Usage:
//   node scripts/forgejo-merge.mjs <pr#>            # poll → merge on green
//   node scripts/forgejo-merge.mjs <pr#> --dry-run  # poll + decide, but never merge
//   node scripts/forgejo-merge.mjs poll  <sha>      # just print the combined status once
//   node scripts/forgejo-merge.mjs watch <sha>      # poll a sha to a terminal state, no merge
//
// Auth/env: same as forgejo-project.mjs (FORGEJO_API / FORGEJO_TOKEN[_FILE] / FORGEJO_REPO).
// Tunables: FJ_POLL_SECS (5), FJ_REGISTER_TIMEOUT_SECS (300), FJ_FINISH_TIMEOUT_SECS (2400).
//
// Exit codes: 0 merged (or dry-run would-merge / already-merged) · 1 CI failed —
// not merged · 2 timed out waiting · 3 Forgejo unreachable.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const API = process.env.FORGEJO_API ?? 'https://git.brndn.zip/api/v1';
const WEB = API.replace(/\/api\/v1\/?$/, ''); // target_url comes back repo-relative
const [OWNER, REPO] = (process.env.FORGEJO_REPO ?? 'brandon/Ensemble').split('/');
const TOKEN_FILE = process.env.FORGEJO_TOKEN_FILE ?? join(homedir(), '.config/forgejo/token');
const POLL_SECS = Number(process.env.FJ_POLL_SECS ?? 5);
const REGISTER_TIMEOUT = Number(process.env.FJ_REGISTER_TIMEOUT_SECS ?? 300);
const FINISH_TIMEOUT = Number(process.env.FJ_FINISH_TIMEOUT_SECS ?? 2400);

function token() {
    const t = process.env.FORGEJO_TOKEN ?? readFileSync(TOKEN_FILE, 'utf8').trim();
    if (!t) {
        throw new Error(`empty token (${TOKEN_FILE})`);
    }
    return t;
}

function done(msg, code) {
    (code === 0 ? console.log : console.error)(`forgejo-merge: ${msg}`);
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
        done(`Forgejo unreachable (${method} ${path}): ${e.message}`, 3);
    }
    const text = await res.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            /* keep raw text for the error message */
        }
    }
    return { status: res.status, ok: res.ok, data, text };
}

// The verified merge gate. Returns { state, statuses:[{context,status,target_url}] }.
// NOTE: the combined object's state is `state`, but each per-check state is under
// `status` (Forgejo/gitea quirk), and target_url is repo-relative.
async function combinedStatus(sha) {
    const r = await api('GET', `/repos/${OWNER}/${REPO}/commits/${sha}/status`);
    if (!r.ok) {
        done(`status ${sha}: ${r.status} ${r.data?.message ?? r.text.slice(0, 200)}`, 1);
    }
    return r.data;
}

function summarize(s) {
    const parts = (s.statuses ?? []).map((c) => `${c.context}=${c.status}`);
    return `${s.state}${parts.length ? ` [${parts.join(', ')}]` : ''}`;
}

// Poll a sha until CI both REGISTERS (≥1 status) and FINISHES (state ≠ pending).
// Returns the terminal combined-status object, or exits 2 on timeout.
async function pollToTerminal(sha) {
    const start = Date.now();
    let registered = false;
    for (;;) {
        const s = await combinedStatus(sha);
        const n = (s.statuses ?? []).length;
        const elapsed = (Date.now() - start) / 1000;

        if (!registered) {
            if (n > 0) {
                registered = true;
                console.log(
                    `forgejo-merge: CI registered (${n} check${n > 1 ? 's' : ''}) — ${summarize(s)}`,
                );
            } else if (elapsed > REGISTER_TIMEOUT) {
                done(`no checks registered for ${sha} after ${REGISTER_TIMEOUT}s`, 2);
            }
        }
        // `pending` with zero statuses = not registered yet; keep waiting.
        if (registered && s.state !== 'pending') {
            return s;
        }
        if (registered && elapsed > FINISH_TIMEOUT) {
            done(
                `checks did not finish for ${sha} after ${FINISH_TIMEOUT}s — last: ${summarize(s)}`,
                2,
            );
        }
        await sleep(POLL_SECS * 1000);
    }
}

// Forgejo's close-keyword set (Gitea default): close/closes/closed, fix/fixes/fixed,
// resolve/resolves/resolved, each followed by `#<n>`. Same-repo refs only — a cross-repo
// `owner/repo#n` has non-`#` text after the keyword and is intentionally skipped. We match
// regardless of surrounding prose (negations included), mirroring Forgejo's own literal
// keyword behavior — a "does not close #5" still closes #5, same as Forgejo does.
const CLOSE_KEYWORD_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;

function parseClosesIssues(body) {
    const nums = new Set();
    for (const m of (body ?? '').matchAll(CLOSE_KEYWORD_RE)) {
        nums.add(Number(m[1]));
    }
    return [...nums];
}

// Close every issue the merged PR body claims to close. Logs each outcome; a failure
// here NEVER flips the exit code — the merge already succeeded (exit 0 = merged), and a
// close hiccup is a surfaced warning, not a merge failure.
async function closeReferencedIssues(prNum, body) {
    for (const n of parseClosesIssues(body)) {
        const cur = await api('GET', `/repos/${OWNER}/${REPO}/issues/${n}`);
        if (!cur.ok) {
            console.error(`forgejo-merge: could not read issue #${n} to close (${cur.status})`);
            continue;
        }
        if (cur.data.pull_request) {
            continue; // a PR, not an issue — skip
        }
        if (cur.data.state === 'closed') {
            console.log(`forgejo-merge: issue #${n} already closed — skipping`);
            continue;
        }
        await api('POST', `/repos/${OWNER}/${REPO}/issues/${n}/comments`, {
            body: `Closed by PR #${prNum} (squash-merged).`,
        });
        const patched = await api('PATCH', `/repos/${OWNER}/${REPO}/issues/${n}`, {
            state: 'closed',
        });
        if (patched.ok && patched.data?.state === 'closed') {
            console.log(`forgejo-merge: closed issue #${n} (referenced by PR #${prNum})`);
        } else {
            console.error(
                `forgejo-merge: FAILED to close issue #${n}: ${patched.status} ${patched.data?.message ?? patched.text?.slice(0, 120) ?? ''}`,
            );
        }
    }
}

async function mergePr(prNum, { dryRun } = {}) {
    const pr = await api('GET', `/repos/${OWNER}/${REPO}/pulls/${prNum}`);
    if (!pr.ok) {
        done(`PR #${prNum}: ${pr.status} ${pr.data?.message ?? pr.text.slice(0, 200)}`, 1);
    }
    if (pr.data.merged) {
        done(`PR #${prNum} already merged — nothing to do`, 0);
    }
    const sha = pr.data.head?.sha;
    const branch = pr.data.head?.ref;
    if (!sha) {
        done(`PR #${prNum} has no head sha`, 1);
    }
    console.log(`forgejo-merge: PR #${prNum} (${branch}) @ ${sha.slice(0, 8)} — waiting for CI`);

    const s = await pollToTerminal(sha);

    if (s.state !== 'success') {
        const failed = (s.statuses ?? []).filter((c) => c.status !== 'success');
        console.error(`forgejo-merge: CI ${s.state} — NOT merging PR #${prNum}`);
        for (const c of failed) {
            const url = c.target_url
                ? c.target_url.startsWith('http')
                    ? c.target_url
                    : WEB + c.target_url
                : '';
            console.error(`  ✗ ${c.context}: ${c.status}${url ? ` → ${url}` : ''}`);
        }
        process.exit(1);
    }

    if (dryRun) {
        done(`CI success — would merge PR #${prNum} (squash + delete ${branch}) [dry-run]`, 0);
    }

    const m = await api('POST', `/repos/${OWNER}/${REPO}/pulls/${prNum}/merge`, {
        Do: 'squash',
        delete_branch_after_merge: true,
    });
    // Forgejo returns 200 (body) or 204 (empty) on a successful merge.
    if (!m.ok) {
        done(
            `merge PR #${prNum} failed: ${m.status} ${m.data?.message ?? m.text.slice(0, 200)}`,
            1,
        );
    }
    console.log(`forgejo-merge: merged PR #${prNum} (squash) + deleted ${branch}`);
    await closeReferencedIssues(prNum, pr.data.body);
    process.exit(0);
}

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'poll') {
    if (!arg) {
        done('usage: forgejo-merge.mjs poll <sha>', 1);
    }
    console.log(summarize(await combinedStatus(arg)));
} else if (cmd === 'watch') {
    if (!arg) {
        done('usage: forgejo-merge.mjs watch <sha>', 1);
    }
    const s = await pollToTerminal(arg);
    done(`terminal: ${summarize(s)}`, s.state === 'success' ? 0 : 1);
} else {
    const prNum = Number(cmd);
    if (Number.isNaN(prNum)) {
        done('usage: forgejo-merge.mjs <pr#> [--dry-run] | poll <sha> | watch <sha>', 1);
    }
    await mergePr(prNum, { dryRun: arg === '--dry-run' });
}
