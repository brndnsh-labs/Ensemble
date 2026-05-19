# Musical Audit Epics

Synthesized from the 2026-05-16 parallel music-theory review of the codebase (six reviewers, 95 findings across `docs/audit/{soloist,bass,chords,drums,harmony-coordination,form-arranger}.md`).

Each epic is session-pickup-ready: titled, motivated, broken into session-sized stories. Stories cite back to their source finding (e.g. `bass.md P0 #2`).

## How to use this doc

- **EPICS.md (this file)** = the tracker. One line per epic with status; never grows past ~80 lines.
- **`docs/audit/epic-<slug>.md`** = stories for that epic. Pick up one, ship it, mark it done in the epic file, update the count here.
- **`docs/audit/<area>.md`** = the underlying findings, untouched. New findings during work go back into the area file, *not* into the epic file.
- **[`docs/audit/FOLLOWUPS.md`](FOLLOWUPS.md)** = shippable-but-flagged items surfaced during `/review`. Append here when a P2 deferral doesn't justify a fresh story but shouldn't be lost. Promote to a story (move to an epic file) when it grows or accumulates urgency.

Story sizing: each story is a single focused session (2–6 hours) — one engine touch + critique test + reliability loop. Pattern proven by the May 2026 sweeps (see `docs/archive/MUSICAL_AUDIT.md` § "Shipped").

## Status (2026-05-19)

**Audit cycle 2026-05-16 → 2026-05-19: 50/50 stories shipped across Epics 1-8 (history snapshot at [`docs/archive/MUSICAL_AUDIT.md`](../archive/MUSICAL_AUDIT.md)).** Live engine-pattern recipes at [`docs/guides/musical-engine-patterns.md`](../guides/musical-engine-patterns.md).

**Post-audit (Epic 9, 10):** sweep-story epics curating ~30 follow-ups from [`FOLLOWUPS.md`](FOLLOWUPS.md). Multi-item per story; commit per sub-item.

| # | Epic | Cross-cutting? | Stories | Done | Notes |
| :- | :- | :-: | :-: | :-: | :- |
| 1 | [Coordination Contract](epic-coordination-contract.md) | yes | 6 | 6 | Highest-leverage. Unlocks epics 4, 6, 8. **Complete — Phase 1 Epic-1 done.** |
| 2 | [Form & Arrangement Awareness](epic-form-arrangement.md) | yes | 8 | 8 | Imperfect Symmetry for non-soloists; intro/outro layering; final-bar cascade; energy-arc calibration. S1+S2+S3+S4+S5+S6+S7+S8 shipped 2026-05-17. **Complete.** |
| 3 | [Deterministic Phrasing Sweep](epic-deterministic-phrasing.md) | yes | 5 | 5 | Replace bare `Math.random()` with `barIndex`-seeded variation. S3+S4+S5 shipped 2026-05-17. **Complete.** |
| 4 | [Soloist Idiom & Bebop Vocabulary](epic-soloist-idiom.md) | no | 6 | 6 | Bebop chromatic unlock; profile multiplier placement; bebopScale anchor; head-bypass jitter; role-skeleton duration preservation; dead config knobs wired. S1+S2+S3+S4 shipped 2026-05-17; S5+S6 shipped 2026-05-18. **Complete.** |
| 5 | [Bass Routing & Voice Leading](epic-bass-voice-leading.md) | no | 7 | 7 | Chord-change-approach helper; Latin/Minimal/Shred routing; country quarter-note R-5; hip-hop 808 slide gesture. S1+S2+S3 shipped 2026-05-17; S6 (delete-only half) shipped 2026-05-17; S4 (routing only) shipped 2026-05-18; S5 (country quarter-tier + walk-up) shipped 2026-05-18; S7 (chord-boundary 808 slide) shipped 2026-05-18. **Complete.** |
| 6 | [Chord Voicing & Comping Cells](epic-chords-voicing.md) | no | 6 | 6 | Voice leading 2nd pass; sticky comping cells; altered-dominant breadth. S2+S3+S4 shipped 2026-05-17; S1 shipped 2026-05-18 (opt-in only; production wiring deferred); S5 shipped 2026-05-18 (reggae bubble lane removed from chord channel; bubble→harmony filed as follow-up); S6 shipped 2026-05-18 (strict R-5 + dedicated strum voicing + sus preservation + voice leading). **Complete.** |
| 7 | [Drum Sound Design & Genre Idiom](epic-drums-idiom.md) | no | 7 | 7 | Crash/Cowbell/Brush wiring; tom vocabulary; entropy floor per genre. S1+S7 shipped 2026-05-17; S2 shipped 2026-05-18 (Cowbell + Brush voices + `KNOWN_SOUND_NAMES` warning); S3 shipped 2026-05-18 (per-genre `suppressEntropyBelow` floor + reggae lay-back lane scope + `firstIterationSuppression` fallback fix); S4 shipped 2026-05-18 (per-genre tom templates for Funk/Country/Blues/Neo-Soul/Hip-Hop/Disco/Acoustic + new `tom-vocabulary-critique.test.ts`); S5 shipped 2026-05-18 (blast-beat alternation + new `China` cymbal voice, accent scoped to Open lane after reviewer P0 on triple-stack); S6 shipped 2026-05-18 (hip-hop trap-roll burst + funk structural-displacement, reviewer P0 patched: gated Open-release on burst beat + positive `openHitsOnBurstBeat===0` test guard). **Complete.** |
| 8 | [Harmony Layer Polish](epic-harmony-polish.md) | no | 5 | 5 | Pad sustain/legato; antiphonal anchor; grounded-intervals fifth ordering. S2+S3 shipped 2026-05-17 (S3 revised after review: kept original order, added guard test). S1 shipped 2026-05-18 (pad-mode `isLegato` continuation across common-tone chord changes; scheduler partitioned-kill; synth voice-extension with mid-release gain restore). S4 shipped 2026-05-18 (gesture-flag consumption: `isResponse` folded into `timingOffset` and dropped from schema; `isBloom` → max-of-multiplicative-and-additive attack swell + extra detune; `isLatched` → release ×1.6 floored at plain, capped at duration + 0.4 — fixes the original cap that inverted the gesture at engine-realistic durations). S5 shipped 2026-05-19 (band-intensity policy named: `HARMONY_MUTE_FLOOR = 0.15` + `HARMONY_PAD_CEILING = 0.4`; dropped Jazz carve-out at pad-route dispatcher so ballad-intensity Jazz hits `playSeaMode` sparse swells; new `harmony-low-intensity-critique.test.ts` with 9 tests). **Complete.** |

| 9 | [Coordination & Consistency Sweep](epic-coordination-consistency.md) | no | 6 | 4 | Post-audit promotion of FOLLOWUPS §B/§C/§D + one live bug (§G). Multi-item sweep stories: coord-consumption (register seam + harmony channel; soloist-driven reactions); cross-engine consistency (altered-dom, slash-chord, bendStartInterval); native-style chromatic leading tones (narrowed to rock-only — country already done; pop/soul/gospel non-styles); multiplier hardening; Hype Man dead branch. S1 (a+b) + S2 (a+b) + S3 (a+b+c) + S4 shipped 2026-05-19. |
| 10 | [Schema & Test Cleanup](epic-schema-test-cleanup.md) | no | 3 | 0 | Post-audit promotion of FOLLOWUPS §F/§G. Multi-item sweep stories: schema cleanup (naming, dead carriers, conductor arms); test rigor — soloist (5 metric reshapes); test rigor — harmony/drums/conductor (8 items). |

**Total: 50 stories shipped (Epics 1-8) + 3 shipped / 6 queued (Epics 9-10).** Most queued stories are independent; pick what's interesting.

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
- See `docs/archive/MUSICAL_AUDIT.md` for prior `Shipped` history and active engine-side open findings.
