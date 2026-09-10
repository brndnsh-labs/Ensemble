# AGENTS.md

The canonical agent guide for this repository is **[`CLAUDE.md`](CLAUDE.md)** — read that first for operational rules, architecture, conventions, and command reference.

File-by-file navigation lives in **[`AI_MAP.md`](AI_MAP.md)**.

For v2 stories, also read **[`prototypes/v2/CLAUDE.md`](prototypes/v2/CLAUDE.md)**,
including work in shared engine/tests. Its branch-only delivery rule applies to both harnesses:
build on `feat/ensemble-v2-foundation`; never merge draft PR #1173 into production `main`.

Before changing files under `public/` or `tests/`, also read every applicable nested
`CLAUDE.md` from the repository root down to the target directory. Those scoped guides add
state, engine, UI, groove, and test-specific constraints without duplicating them here.

(This file exists so AGENTS.md-aware tools find the same canonical guidance Claude Code does.
Keep these pointers aligned if the canonical paths change.)
