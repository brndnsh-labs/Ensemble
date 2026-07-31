#!/usr/bin/env node
// cycle:rendered template=shim.mjs.tmpl hash=cf4dd53e8a43 — managed by the-cycle; edit the template, not this file
//
// forgejo-merge.mjs — shim → the-cycle's canonical helpers/forgejo-merge.mjs.
//
// A REAL FILE, not a symlink, on purpose: a committed symlink dangles in an isolated
// CI checkout (the runner clones one repo, no siblings), which breaks any gate that
// checks a file exists. A real file is always present, and CI never runs it — only
// the local pipeline does, where the-cycle is available.
//
// The logic lives once, upstream. Edit the helper, not this file.

import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

const HELPER = join('helpers', 'forgejo-merge.mjs');

/**
 * Locate the-cycle, most explicit first: an env override, then wherever the `cycle`
 * command on PATH actually resolves to, then the path this shim was rendered from,
 * then the conventional clone. The PATH probe is what makes a repo work on a machine
 * that clones the-cycle somewhere else.
 */
function cycleHome() {
    const tries = [process.env.CYCLE_HOME];
    for (const dir of (process.env.PATH ?? '').split(delimiter)) {
        const bin = join(dir, 'cycle');
        if (!existsSync(bin)) {
            continue;
        }
        try {
            tries.push(resolve(dirname(realpathSync(bin)), '..'));
        } catch {
            /* dangling symlink — keep looking */
        }
    }
    tries.push('/home/brandon/code/the-cycle', join(homedir(), 'code', 'the-cycle'));
    return tries.find((t) => t && existsSync(join(t, HELPER)));
}

const home = cycleHome();
if (!home) {
    console.error(
        `forgejo-merge.mjs: cannot find the-cycle (no ${HELPER} on any candidate path).\n` +
            '  Clone it and run install.sh, or set CYCLE_HOME=/path/to/the-cycle.',
    );
    process.exit(1);
}

const target = join(home, HELPER);
// .sh helpers execute directly; .mjs go through this same node.
const argv = target.endsWith('.sh') ? [target] : [process.execPath, target];

const result = spawnSync(argv[0], [...argv.slice(1), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: {
        // Bindings from .cycle/config.jsonc, baked in at render time. An explicitly
        // exported value still wins — these are defaults, not overrides.
        FORGEJO_REPO: "brandon/Ensemble",
        FORGEJO_API: "https://git.brndn.zip/api/v1",
        ...process.env,
    },
});
process.exit(result.status ?? 1);
