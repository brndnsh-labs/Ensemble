#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Thin shim → the canonical forgejo-merge guard, single-sourced in ~/code/dotfiles
// and shared across repos (see dotfiles/README.md). Committed as a REAL file, not a
// symlink, so it resolves in isolated CI checkouts where dotfiles isn't a sibling;
// the actual logic lives once in dotfiles. CI never runs this — only the local
// pipeline does, where ~/code/dotfiles is present.
const target = join(homedir(), 'code', 'dotfiles', 'bin', 'forgejo-merge.mjs');
const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], {
    stdio: 'inherit',
});
process.exit(result.status ?? 1);
