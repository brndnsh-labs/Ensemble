# Musical Audit Epics

Synthesized from the 2026-05-16 parallel music-theory review of the codebase (six reviewers, 95 findings across `docs/audit/{soloist,bass,chords,drums,harmony-coordination,form-arranger}.md`).

Each epic is session-pickup-ready: titled, motivated, broken into session-sized stories. Stories cite back to their source finding (e.g. `bass.md P0 #2`).

## How to use this doc

- **EPICS.md (this file)** = the tracker. One line per epic with status; never grows past ~80 lines.
- **`docs/audit/epic-<slug>.md`** = stories for that epic. Pick up one, ship it, mark it done in the epic file, update the count here.
- **`docs/audit/<area>.md`** = the underlying findings, untouched. New findings during work go back into the area file, *not* into the epic file.

Story sizing: each story is a single focused session (2–6 hours) — one engine touch + critique test + reliability loop. Pattern proven by the May 2026 sweeps (see `docs/MUSICAL_AUDIT.md` § "Shipped").

## Status (2026-05-16)

| # | Epic | Cross-cutting? | Stories | Done | Notes |
| :- | :- | :-: | :-: | :-: | :- |
| 1 | [Coordination Contract](epic-coordination-contract.md) | yes | 6 | 6 | Highest-leverage. Unlocks epics 4, 6, 8. **Complete — Phase 1 Epic-1 done.** |
| 2 | [Form & Arrangement Awareness](epic-form-arrangement.md) | yes | 8 | 2 | Imperfect Symmetry for non-soloists; intro/outro layering; final-bar cascade; energy-arc calibration. S1+S2 shipped 2026-05-17. |
| 3 | [Deterministic Phrasing Sweep](epic-deterministic-phrasing.md) | yes | 5 | 5 | Replace bare `Math.random()` with `barIndex`-seeded variation. S3+S4+S5 shipped 2026-05-17. **Complete.** |
| 4 | [Soloist Idiom & Bebop Vocabulary](epic-soloist-idiom.md) | no | 6 | 1 | Bebop chromatic unlock; profile multiplier placement; head-bypass jitter. S4 shipped 2026-05-17. |
| 5 | [Bass Routing & Voice Leading](epic-bass-voice-leading.md) | no | 7 | 4 | Chord-change-approach helper; Latin/Minimal/Shred routing; country quarter-note R-5. S1+S2+S3 shipped 2026-05-17; S6 (delete-only half) shipped 2026-05-17. |
| 6 | [Chord Voicing & Comping Cells](epic-chords-voicing.md) | no | 6 | 3 | Voice leading 2nd pass; sticky comping cells; altered-dominant breadth. S2+S3+S4 shipped 2026-05-17. |
| 7 | [Drum Sound Design & Genre Idiom](epic-drums-idiom.md) | no | 7 | 2 | Crash/Cowbell/Brush wiring; tom vocabulary; entropy floor per genre. S1+S7 shipped 2026-05-17. |
| 8 | [Harmony Layer Polish](epic-harmony-polish.md) | no | 5 | 2 | Pad sustain/legato; antiphonal anchor; grounded-intervals fifth ordering. S2+S3 shipped 2026-05-17 (S3 revised after review: kept original order, added guard test). |

**Total: 50 stories.** Most are independent; pick what's interesting.

## Phased rollout

The work splits into three phases by coupling: how much each story depends on shared shape (context fields, multiplier placement patterns) vs. lives in an isolated engine corner. Phase 1 is sequential; Phases 2 and 3 fan out.

### Phase 1 — Sequential foundation (Opus)

Stories that decide architectural shape and touch shared files (`coordination-engine.ts`, `tick-logic.ts`, picker layers). Doing them in parallel forces every worker to guess at decisions that should be made once.

- **Epic 1 in full** (6 stories) — coordination context shape, multiplier values, producer-order discipline.
- **Epic 3 S1, S2** — sticky-comping-cell pattern. Establishes the seeded-variation template that ~7 later stories will reuse; Opus picks the cell-bank shape so Sonnet can replicate it.

After Phase 1, do a listening test. Confirm the contract feels right before fanning out.

### Phase 2 — Parallel fan-out (Sonnet, ~3-5 agents at a time)

Stories with clear sketches, unambiguous acceptance, and no fresh musical-taste decisions. Spawn Sonnet agents on disjoint files; run `music-theory-reviewer` on the combined diff before commit (recipe: `feedback-delegate-to-subagents` + `feedback-reviewer-after-big-subagent-diff`).

| Story | Touched file(s) | Note |
| :- | :- | :- |
| Epic 1 S3 (`upcomingSectionFirstChord` wiring) | bass-engine, accompaniment | mechanical wire-up after shape stable |
| Epic 1 S6 (producer-order discipline) | coordination-engine, new test | docs + one Vitest unit |
| Epic 3 S3, S4, S5 | bass-engine, harmonies | seed-substitution per established pattern |
| Epic 4 S4, S6 | soloist.ts, soloist-pitch-engine, soloist-config | mechanical scale-clamp + config wire-up |
| Epic 5 S1, S2, S3, S6 | bass-engine, bass-styles | helper extraction + gate removal + delete block |
| Epic 6 S2, S3, S4 | chords-styles, accompaniment | small voicing fixes |
| Epic 7 S1, S7 | groove-engine, individual grooves | mechanical fixes + motif renames |
| Epic 8 S2, S3 | harmonies.ts | one-line floor fix + array reorder |

### Phase 3 — Opus-needed remainder (parallel, but each story Opus)

Stories that require musical taste, sound design, or threshold reliability loops. Can run in parallel (different files), but each one stays on Opus.

- **Epic 2** — Imperfect Symmetry, final-bar cascade, intro layering (per-engine musical judgment)
- **Epic 4 S1, S2, S3, S5** — bebop chromatic ladder, profile multiplier placement, bebopScale anchoring, role-skeleton response shape
- **Epic 5 S4, S5, S7** — Latin tumbao design, country quarter-note pattern, hip-hop slide gesture
- **Epic 6 S1, S5, S6** — voice-leading 2nd pass, reggae piano lane choice, country strum voicing
- **Epic 7 S2-S6** — sound voices, entropy tuning, tom vocabulary, metal alternation, trap rolls
- **Epic 8 S1, S4, S5** — pad sustain, dead flag semantics, bandIntensity floor

### Model + reviewer tags

Each story in the epic files is tagged inline:

- **Model:** `opus` (default) or `sonnet`. `sonnet` means: fix sketch is unambiguous, acceptance is concrete, no musical-taste decisions left.
- **Reviewer:** `music-theory-reviewer` (any musical-behavior change), `state-discipline-reviewer` (state/context shape changes), `worker-contract-reviewer` (state crossing the worker boundary), or `none` (pure tests or docs). Default expectation: review on the uncommitted diff before merge, especially after Sonnet work.

## Notes-from-synthesis

- **No P0-marked finding is gated on user judgment** — every P0 has a clear musical claim being broken and a sketched fix. Some P1s explicitly want a product call (e.g., "how busy should funk feel at intensity 0.5?"); these are noted at the story level.
- **Two findings overlap across audits and were deduplicated**: `soloist.md P1 #8` + `harmony-coordination.md P0 #4` (both about `accompanimentMidis` consumers) live as one story in Epic 1. `bass.md P1 #11` + `harmony-coordination.md P1 #9` (both about bass coordination consumption) live as one story.
- **Untested production behavior** (no critique test guarding a shipped claim) is flagged in the source audit files; many will get tests added as part of the stories that fix them.
- See `docs/MUSICAL_AUDIT.md` for prior `Shipped` history and active engine-side open findings.
