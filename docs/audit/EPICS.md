# Musical Audit Epics — Compound Meter cycle

## Previous cycles

- **Musical-audit 2026-05** (12 epics, 80 stories) shipped 2026-05-25; archived at [`docs/archive/musical-audit-2026-05/`](../archive/musical-audit-2026-05/). Reusable engine-pattern recipes at [`docs/guides/musical-engine-patterns.md`](../guides/musical-engine-patterns.md). Earlier Epics 1-8 snapshot at [`docs/archive/MUSICAL_AUDIT.md`](../archive/MUSICAL_AUDIT.md).
- **Synth-audit** continues in a separate track at [`docs/synth-audit/`](../synth-audit/) (Epic 6 remains).

## This cycle: Compound Meter

Synthesized 2026-05-27 from a focused investigation triggered by the user reporting "6/8 playback feels jumbled — All Blues + 6/8 should sound like a Miles Davis jazz waltz but doesn't." The breakage is in the **runtime/engine layer** — the preset layer (`All Blues` tagged `'6/8'`, 12-step drum arrays, `TIME_SIGNATURES['6/8'].isCompound = true` with correct `pulse` and `grouping`) is already right. Multiple engine sites silently assume 4/4 in their fallback paths or rhythm gates, and one design-level issue with BPM semantics (treated as quarter-notes/min everywhere) compounds the others.

The Definition of Done for this cycle is **All Blues + 6/8 sounds like a slow jazz waltz** — measured by a new end-to-end critique test (Story 7) plus a manual A/B listening pass.

## How to use this doc

- **EPICS.md (this file)** = the tracker. One line per epic with status.
- **`docs/audit/epic-<N>-<slug>.md`** = stories for that epic. Pick up one, ship it, mark it done in the epic file, update the count here.
- **[`docs/audit/FOLLOWUPS.md`](FOLLOWUPS.md)** = shippable-but-flagged items surfaced during `/review`. Append when a P2 deferral doesn't justify a fresh story but shouldn't be lost.

Story sizing: each story is a single focused session (2–6 hours) — one engine touch + critique test + reliability loop. Same pattern as the 2026-05 musical-audit cycle.

## Status (2026-05-27)

**Cycle 2026-05-27 → in progress: 5 / 10 stories shipped.**

| # | Epic | Stories | Done | Notes |
| :- | :- | :-: | :-: | :- |
| 1 | [Compound Meter (6/8, 12/8)](epic-1-compound-meter.md) | 10 | 5 | All Blues + 6/8 must feel like a slow jazz waltz. S1 (BPM unit per TS) is the dominant fix and gates S7 (end-to-end critique). S2–S5, S9 are mechanical 4/4-assumption fixes that can fan out in parallel. S6 audits the soloist pipeline. S8 investigates the chart-sizing shift user observed on a long progression. S10 is the genre × TS UX decision (defer if scope tight). |

## Phased rollout

### Phase 1 — Sequential foundation (Opus)

Story S1 (BPM unit per time signature) decides whether 6/8 BPM means quarter or dotted-quarter and rewires the scheduler. Every downstream test (especially S7) depends on this choice. Ship S1 first; listen-test the difference before fanning out.

### Phase 2 — Parallel fan-out (Sonnet)

Once S1 lands, S2, S3, S4, S5, S9 are mechanical 4/4-assumption fixes on disjoint files. They can run in parallel.

| Story | Touched file(s) | Note |
| :- | :- | :- |
| S2 (bass `is8th` bug) | bass-engine, utils, getStepInfo | rename + add `isEighthBoundary` to `getStepInfo` |
| S3 (accompaniment `% 4`) | accompaniment | drop dead 4/4 fallbacks |
| S4 (latin clave 4/4 positions) | grooves/latin | gate clave on `!isCompound` or branch for 6/8 |
| S5 (bass "and-of-four" name+pos) | bass-engine | rename + compound branch |
| S9 (getStepInfo offbeat math) | utils | one-line fix |

### Phase 3 — Opus-needed remainder

| Story | Note |
| :- | :- |
| S6 (soloist phrasing audit) | Verify pipeline isn't 4/4-assuming; extend `tests/integration/odd-meter-authenticity.test.ts`. |
| S7 (All Blues critique test) | The cycle's Definition of Done. New `tests/standards/all-blues-6-8-critique.test.ts`. |
| S8 (chart sizing under TS change) | User-reported regression on a long progression; needs reproduction + lead-sheet-model fix. |
| S10 (genre × TS UX) | Design call on soft hint vs hard gate vs no-op. Defer if Phase 2/3 produce a passing S7. |

### Model + reviewer tags

- **Model:** `opus` (default) or `sonnet`. `sonnet` means: fix sketch is unambiguous, acceptance is concrete, no musical-taste decisions left.
- **Reviewer:** `music-theory-reviewer` (any musical-behavior change), `state-discipline-reviewer` (state/context shape changes), `worker-contract-reviewer` (state crossing the worker boundary). Default expectation: review on the uncommitted diff before merge.

## Notes-from-synthesis

- The preset layer is correct: `chord-presets.ts:640-665` (All Blues), 6/8 drum step arrays at `drum-presets.ts:925-932, 965-970`, `config.ts:79-87` (TIME_SIGNATURES['6/8']). Don't touch those.
- Existing **compound-aware** engines to learn from, not refactor: `grooves/jazz.ts:42-162` (ride/skip-beat/kick feathering all branch on `isCompound`), `soloist-seeder.ts:674-720` (pulse-aware phrase-cell generation), `conductor.ts:289-645` (parameterized on `stepsPerMeasure`).
- Existing 6/8 tests: `tests/integration/meter-integrity.test.ts:33-109`, `tests/integration/odd-meter-authenticity.test.ts:21-42`. Low-level mechanics are covered; no end-to-end "All Blues at tempo" yet (S7).
- The `synth-audit` track is separate (`docs/synth-audit/`). This cycle does not touch synth voices.
