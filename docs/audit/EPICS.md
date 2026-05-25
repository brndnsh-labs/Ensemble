# Musical Audit Epics — SHIPPED

The 2026-05-16 → 2026-05-25 musical audit cycle is **complete**: all 12 epics, 80 stories shipped.

## Archive

Full tracker and source-finding history at [`docs/archive/musical-audit-2026-05/`](../archive/musical-audit-2026-05/):

- `EPICS.md` — final tracker with per-epic Status blocks.
- `epic-*.md` (12 files) — per-epic story files; each Status line records the shipping commit's notes.
- `LISTEN_TESTS.md` — closed listen-test gate (Parts A + C all decided 2026-05-25).
- `{bass,chords,drums,soloist,harmony-coordination,form-arranger}.md` — original 2026-05-16 audit findings (untouched throughout the cycle).

Earlier Epics 1-8 history snapshot: [`docs/archive/MUSICAL_AUDIT.md`](../archive/MUSICAL_AUDIT.md).

## Live successors

- [`docs/guides/musical-engine-patterns.md`](../guides/musical-engine-patterns.md) — the reusable engine-patterns guide. Distilled from the cycle's 80 stories (5 smells, coordination patterns, loop-awareness, final-stage multiplier discipline, dual-gate activation, determinism). **This is the load-bearing live doc.**
- [`docs/audit/FOLLOWUPS.md`](FOLLOWUPS.md) — ongoing follow-up backlog (~28 items, mostly NIT/listen-only). Survives the archive pass; not an audit-cycle artifact.

## If a future audit cycle starts

The `/cycle`, `/next`, `/pmlite`, `/done`, `/implement` skills all read this file. Create a fresh `EPICS.md` here (mirror the structure of the archived one) and the skills will pick up the active phase automatically. Don't resurrect the old EPICS.md — the new cycle's phasing, story sizing, and reviewer routing will diverge from the 2026-05 pass.
