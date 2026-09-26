# AGENTS.md

The canonical agent guide for this repository is **[`CLAUDE.md`](CLAUDE.md)** — read that first for operational rules, architecture, conventions, and command reference.

File-by-file navigation lives in **[`AI_MAP.md`](AI_MAP.md)**.

For v2 stories, also read **[`prototypes/v2/CLAUDE.md`](prototypes/v2/CLAUDE.md)**,
including work in shared engine/tests. The v2 app is the production site: a merge to `main`
releases it, and `public/**` on the same merge is live production code too.

Before changing files under `band/`, `public/`, `prototypes/v2/` or `tests/`, also read every
applicable nested `CLAUDE.md` from the repository root down to the target directory. Those
scoped guides add band, state, engine, app and test-specific constraints without duplicating
them here.

(This file exists so AGENTS.md-aware tools find the same canonical guidance Claude Code does.
Keep these pointers aligned if the canonical paths change.)
