# AGENTS.md

The canonical agent guide for this repository is **[`CLAUDE.md`](CLAUDE.md)** — read that first for operational rules, architecture, conventions, and command reference.

File-by-file navigation lives in **[`AI_MAP.md`](AI_MAP.md)**.

For v2 stories, also read **[`prototypes/v2/CLAUDE.md`](prototypes/v2/CLAUDE.md)**,
including work in shared engine/tests. V2 merged to `main` on 2026-09-12 and follows the normal
delivery defaults; note that `prototypes/**` has no production deploy target, so landing v2 code
is not releasing it, while `public/**` on the same merge is live production code.

Before changing files under `public/` or `tests/`, also read every applicable nested
`CLAUDE.md` from the repository root down to the target directory. Those scoped guides add
state, engine, UI, groove, and test-specific constraints without duplicating them here.

(This file exists so AGENTS.md-aware tools find the same canonical guidance Claude Code does.
Keep these pointers aligned if the canonical paths change.)
