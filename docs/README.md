# Documentation index

This folder groups the living documentation for Ensemble.

## Start here

- [`README.md`](../README.md) — project overview and quick start.
- [`CLAUDE.md`](../CLAUDE.md) — primary operational guide for AI-assisted work. (`AGENTS.md` points here.)
- [`AI_MAP.md`](../AI_MAP.md) — source and module map.
- [`docs/VISION.md`](VISION.md) — product direction, open work, and roadmap context.
- [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) — contributor workflow.
- [`.github/CODE_OF_CONDUCT.md`](../.github/CODE_OF_CONDUCT.md) — community expectations.
- [`.github/SECURITY.md`](../.github/SECURITY.md) — vulnerability reporting.
- [`.vscode/mcp.json`](../.vscode/mcp.json) — optional VS Code Playwright MCP workspace helper.

## Active references

- [`docs/guides/`](guides/) — implementation notes and reference guides.
- [`docs/guides/PERFORMANCE_GUIDELINES.md`](guides/PERFORMANCE_GUIDELINES.md) — hot-loop performance notes.
- [`docs/guides/musical-engine-patterns.md`](guides/musical-engine-patterns.md) — reusable recipes for generative-engine work (5 smells in critique tests, coordination patterns, loop-awareness, final-stage multiplier discipline, seeded determinism). Extracted from the completed musical audit.
- [`docs/guides/bundle-hygiene.md`](guides/bundle-hygiene.md) — reusable recipes for bundle-size work (budgets-as-baselines, DCE expectations, pre-flight grep for "orphaned" musical content, knip blind spots, code-splitting discipline, defense-in-depth hygiene). Extracted from the completed bundle audit.
- [`docs/synth-audit/`](synth-audit/) — active synth-realism audit (7 epics revisiting every synthesized voice). Separate, semi-manual track — start at [`synth-audit/EPICS.md`](synth-audit/EPICS.md).
- [`docs/audit/FOLLOWUPS.md`](audit/FOLLOWUPS.md) — ongoing follow-up backlog from the completed musical audit (~20 NIT/listen-only items). The audit cycle itself is archived at [`docs/archive/musical-audit-2026-05/`](archive/musical-audit-2026-05/).
- [`public/MANUAL.md`](../public/MANUAL.md) — in-app manual.
- [`tests/README.md`](../tests/README.md) — test-suite conventions.
- [`docs/FLAKY_TESTS.md`](FLAKY_TESTS.md) — registry of known-flaky tests, the three flake classes (unseeded-statistical / ordering-dependent / e2e-timing), and their fixes. Diagnose new flakes with the `/flake` skill.

## Historical references

- [`docs/archive/`](archive/) — completed reports and archived audits.
