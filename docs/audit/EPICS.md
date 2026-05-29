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

## Status (2026-05-28)

**Compound-Meter cycle (2026-05-27) → ✅ COMPLETE: 18 / 18 stories shipped.**
**Deferred Follow-up Sweep (Epic 3, synthesized 2026-05-28) → ✅ COMPLETE: 5 / 5 stories** (reconciled from 12 — 7 over-promoted stories were CLOSED-ON-ARRIVAL, already shipped/closed by the archived `epic-followup-drain.md` + Epic 12 S4/S5/S6). Shipped: S1 (funk displacement 50/35/15), S5 (odd-meter dub grouping-pulse), S7 (acoustic 6/8 snare — the one real defect, now fixed), S10 (Latin generic 6/8 Bembé bell — 2026-05-29; mid-cycle surfaced that the World/Latin preset bank is UI-unreachable [owner call: intentional curation, dormant-by-design], so the bell reaches production only via Bossa-forced-to-compound; reviewer caught a P0 wrong-bell-rhythm, corrected to the real maximally-even E(7,12) pattern), S12 (penultimate-bar approach window — 2026-05-29; decoupled the widen so only the structural `barsUntilSectionChange` counter opens to the penultimate bar [three-tier bass push ramp 1.0/0.5/0.15×]; both reviewers clean; worker-contract premise was stale — `coordination` is worker-internal, never synced). Listen passes approved 2026-05-29. Lesson: [[verify-followup-against-source]] — synthesis trusted a stale `FOLLOWUPS.md` and matched fix-landed `why:` comments as problem-markers; recency-of-source is the reliable "is it live" signal (every live story traces to the 2026-05-28 meter cycles). Grep for a prior drain/cleanup epic before synthesizing a new follow-up backlog.
**Meter-Robustness cycle (Epic 2, synthesized 2026-05-28) → ✅ COMPLETE: 10 / 10 stories.** Phase 1 (dead-key correctness) S1+S2+S3; Phase 2 (determinism/lock) S4+S5; Phase 3 (compound groove density — kick-pulse-anchor pattern) S6+S7+S8; Phase 4 (bass bossa/dub pulse-derived, paired gate+note sites) S9; Phase 5 (odd-meter 5/4·7/4·7/8 sweep) S10 — test-driven verification found the system already degrades gracefully except the Latin/Bossa son-clave (4/4-literal tail-dropout), now grouping-derived. Recurring lesson this cycle: every Phase 3-5 story had a hidden paired/adjacent site the first pass missed (kick beatIndex, motif-0, snare lane, note-picker, odd-meter signal, the clave + a 4/4-internal test harness) — the review gate caught all of them. Open follow-ups from this cycle (acoustic motif-0 snare; odd-meter dub grouping-pulse refinement) → both shipped via Epic 3 S7 + S5 (2026-05-28).

| # | Epic | Stories | Done | Notes |
| :- | :- | :-: | :-: | :- |
| 2 | [Meter Robustness + Genre Correctness](epic-2-meter-robustness.md) | 10 | 10 | **✅ COMPLETE 2026-05-28.** **Synthesized 2026-05-28** (2 discovery agents + main-thread hot-file triage). Every genre × instrument must groove in any time signature; non-jazz odd/compound meters in scope; correctness not taste. Phase 1 = a verified dead-key cluster (Ska-Punk feel is `'Ska'` but 4 tables key on `'Ska-Punk'`; Metal missing from `FILL_TEMPLATES`; Bossa Nova dead-key in `GENRE_MAP`) — wrong in every meter, single root cause, highest ROI. Phase 2 = determinism/lock (the Epic-1 comp fix applied to the bass density gate + non-jazz comping lanes). Phase 3 = compound groove density (minimal, ska-punk, acoustic kick). Phase 4 = bass bossa/dub 4/4-position math. Phase 5 = odd-meter (5/4,7/4,7/8) degradation sweep. **Not started.** |
| 3 | [Deferred Follow-up Sweep](epic-3-followup-cleanup.md) | 5 | 5 | **Synthesized 2026-05-28** from a one-at-a-time owner triage of the open `FOLLOWUPS.md` items; **reconciled mid-cycle to 5 real stories** (was 12 promoted). Synthesis over-promoted: 6 items were already-shipped at synthesis time, and **7 were CLOSED-ON-ARRIVAL** (S2/S3/S4/S6/S8/S9/S11 — already shipped or closed-no-action by the archived [`epic-followup-drain.md`](../archive/musical-audit-2026-05/epic-followup-drain.md) + Epic 12 S4/S5/S6; the `FOLLOWUPS.md` entries were never marked closed). **✅ COMPLETE 2026-05-29.** Shipped: **S1** (funk displacement re-weight), **S5** (odd-meter dub grouping-pulse), **S7** (acoustic 6/8 snare — the one real defect), **S10** (Latin generic 6/8 Bembé bell), **S12** (penultimate-bar approach window). All trace to 2026-05-28 meter cycles. Recurring lesson [[verify-followup-against-source]]: shallow greps matched fix-landed `why:` comments; recency-of-source is the reliable "is it live" signal. |
| 1 | [Compound Meter (6/8, 12/8)](epic-1-compound-meter.md) | 18 | 18 | All Blues + 6/8 must feel like a slow jazz waltz. S1 (BPM unit per TS) is the dominant scheduling fix and gates S7 (end-to-end critique). S2–S5, S9 are mechanical 4/4-assumption fixes that ran in parallel. S6 audited the soloist pipeline. S8 investigates the chart-sizing shift user observed on a long progression. S10 is the genre × TS UX decision (defer if scope tight). **Epic expanded 2026-05-27** after S7 authoring surfaced 4 musical-content layer gaps the scheduling work didn't address: S11 (jazz ride skip-beat target), S12 (jazz walking density), S13 (jazz comping density), S14 (soloist rest cadence). **S16 split 2026-05-27** during its parallel-agent audit revealed the cross-genre scope is bigger than estimated: S16 shipped hat-density (universal helper + shimmer/sparse profiles), S16b shipped kick/snare per-genre (2026-05-28), S16c shipped reggae/latin repair (2026-05-28 — premise correction: One Drop was already correct; real fixes were Rockers kick over-density + Partido Alto 7-vs-1 split). S8 shipped chart-sizing fix (2026-05-28 — float-accumulation drift in measure grouping, not the suspected step-count density path). S10 shipped genre×TS soft hint (2026-05-28 — ★ marks idiomatic meters in the TS picker; non-blocking). **Epic complete; cycle DoD (All Blues + 6/8 jazz-waltz feel) confirmed by listening pass 2026-05-28.** |

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
| S6 (soloist phrasing audit) | ✅ Done. Verified pipeline isn't 4/4-assuming; extended critique coverage. |
| S7 (All Blues critique test) | ✅ Done 2026-05-27. The cycle's Definition of Done. 5/5 assertions green, 30/30 reliable. Surfaced architectural S14 gap (budget code unreachable behind head-bypass) — patched inline with hoisted budget timer + anchor-aware gate. Listening pass next. |
| S8 (chart sizing under TS change) | ✅ Done 2026-05-28. Float-accumulation drift in `buildLeadSheetSections` measure grouping (not the suspected step-count density path) — fixed with an epsilon-tolerant bar-close comparison. Unit tests added. |
| S10 (genre × TS UX) | ✅ Done 2026-05-28. User chose the soft-hint option: ★ marks genre-idiomatic meters in the TS picker (`smart-genres.ts` canonical-meter map + `TimeSignatureControl` legend). Non-blocking — any pairing still plays. |

### Phase 4 — Musical-content fixes (added 2026-05-27 after S7 authoring)

The scheduling foundation (S1–S6, S9) is correct, but the engine's per-genre musical content still assumes 4/4 in four places. These gate S7's DoD.

| Story | Note |
| :- | :- |
| S11 (jazz 6/8 ride skip-beat) | 1-line fix in `grooves/jazz.ts:80` — `groupSteps - 1` → `groupSteps - 2` in compound. Sonnet. ~1.5h. |
| S12 (jazz walking density) | `bass-styles.ts` jazz branch — drive density off `isPulseStart` not `isBeatStart` in compound. Opus (density curve is taste-driven). ~3h. |
| S13 (jazz comping density) | `accompaniment.ts` jazz lane — compound-meter comping bank or per-step probability divisor. Opus. ~4h. |
| S14 (soloist rest cadence) | New phrasing-budget timer so soloist breathes every 4–8 bars instead of 50+. Opus. ~6h. |
| S15 (jazz walking-bass picker) | Compound-aware `getBassNoteStyle 'quarter'` picker — roots on pulses, leading-tone approaches on pickup slots. Promoted from S12 review (2026-05-27). Opus. ~4h. |
| S16 (compound drum density — hat-first) | ✅ Done 2026-05-27. Shipped universal `compoundHatAllowed` helper with sparse/shimmer profiles + Open/HiHatHalf passthrough. 10 affected groove files filter their hat lane post-hoc. Measured: sparse genres 2/bar in 6/8 (vs 12/bar bug), shimmer genres 6/bar (preserves time-keeper). Parallel 3-agent audit + music-theory reviewer iteration (caught shimmer-genre identity issue). |
| S16b (compound drum density — kick/snare per-genre) | ✅ Done 2026-05-28. Shipped `compoundKickAllowed` helper (sparse two-tier) + `!isCompound` motif gates (metal 1-4 via effectiveMotif, country train-beat, funk Funky Drummer, latin Samba). Reviewer caught 2 P0s (second-pulse loss F1, blast-snare paired-site F6) — fixed. All 9 genres anchor both 6/8 pulses at 2/bar. |
| S16c (reggae One Drop + Latin Samba/Partido Alto partial-compound repair) | ✅ Done 2026-05-28. Premise correction: reggae One Drop was already correct (`isBackbeat` = mStep 6 only in 6/8, beat-1 silent). Real fixes: `compoundKickAllowed` filter on reggae kick (trims Rockers from 8→2/bar) + Latin Partido Alto gated `!isCompound` (was 7-vs-1 bar split; also closed an S16b Samba fall-through). Reviewer 0 P0, 2 P1 patched, 2 P2 → FOLLOWUPS. Ran inline (~1.5h) after premise de-risk, not opus. |

### Model + reviewer tags

- **Model:** `opus` (default) or `sonnet`. `sonnet` means: fix sketch is unambiguous, acceptance is concrete, no musical-taste decisions left.
- **Reviewer:** `music-theory-reviewer` (any musical-behavior change), `state-discipline-reviewer` (state/context shape changes), `worker-contract-reviewer` (state crossing the worker boundary). Default expectation: review on the uncommitted diff before merge.

## Notes-from-synthesis

- The preset layer is correct: `chord-presets.ts:640-665` (All Blues), 6/8 drum step arrays at `drum-presets.ts:925-932, 965-970`, `config.ts:79-87` (TIME_SIGNATURES['6/8']). Don't touch those.
- Existing **compound-aware** engines to learn from, not refactor: `grooves/jazz.ts:42-162` (ride/skip-beat/kick feathering all branch on `isCompound`), `soloist-seeder.ts:674-720` (pulse-aware phrase-cell generation), `conductor.ts:289-645` (parameterized on `stepsPerMeasure`).
- Existing 6/8 tests: `tests/integration/meter-integrity.test.ts:33-109`, `tests/integration/odd-meter-authenticity.test.ts:21-42`. Low-level mechanics are covered; no end-to-end "All Blues at tempo" yet (S7).
- The `synth-audit` track is separate (`docs/synth-audit/`). This cycle does not touch synth voices.
