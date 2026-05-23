# Epic 12 — Follow-up Drain

The post-Epic-11 reconciliation pass ([commit `75a849b4`](FOLLOWUPS.md)) left **~29 genuinely-open follow-ups**. This epic drains every implementable one — including NITs — so nothing is left behind. Items needing human ears are bucketed separately in [`LISTEN_TESTS.md`](LISTEN_TESTS.md); the stories below that depend on a listening decision are tagged **Blocked** and cite the checklist item that unblocks them.

Story sizing follows the house rule — one focused session each, one engine touch + critique test + reliability loop, commit-per-item for the sweep stories.

## Status

| Story | Title | Model | State |
| :- | :- | :-: | :- |
| S1 | Soloist engine `scrambleHash` migration | opus | Shipped 2026-05-20 |
| S2 | `evansIntervals` chord-quality awareness | opus | Ready |
| S3 | Profile-rotation sticky-retain | opus | Shipped 2026-05-23 |
| S4 | Micro-nit & test-rigor cleanup sweep | sonnet | Shipped 2026-05-23 |
| S5 | Bass walking idiom | opus | Ready |
| S6 | Per-genre tuning sweep | sonnet | Blocked → `LISTEN_TESTS.md` Part B |
| S7 | Final-bar polish | opus | Blocked → `LISTEN_TESTS.md` C1 |
| S8 | Per-genre arrangement design | opus | Blocked → `LISTEN_TESTS.md` C2/C3 |
| S9 | Disco re-categorization + vibe-path | opus | Blocked → `LISTEN_TESTS.md` C4/C5 |
| S10 | Ska-Punk shared-hook antiphony | opus | Blocked → `LISTEN_TESTS.md` C6 |

**4 / 10 shipped.** S5 is cycle-able immediately. S6–S10 unblock as their `LISTEN_TESTS.md` items are decided.

---

### S1. Soloist engine `scrambleHash` migration

The May 2026 `scrambleHash` migration covered bass / harmonies / grooves but skipped the soloist engine entirely. ~56 un-seeded `Math.random()` draws remain across three files, all reachable from `getSoloistNote` and all affecting the emitted note's pitch/rhythm/timing signature:

- **`soloist-pitch-engine.ts`** (~13 draws) — the weighted roulette (~line 1293), device-trigger gates, timing jitter.
- **`soloist-rhythm-engine.ts`** (~11 draws) — `generateRhythmPlan` entropy feeding `rhythmNode.durationSteps`, attack probability, sustain length.
- **`soloist.ts`** (~17 draws) — phrasing-layer gates (`survivalProb`, gap-fill, entropy/timing) + a byte-identical local `scrambleHash` copy (line 38) that Epic 11 S9a deliberately left for this story.

Migrate every draw to a `scrambleHash` source keyed on `(barIndex, sectionId, step)` plus a per-draw discriminator so co-located draws don't collide. The seed must NOT correlate adjacent steps — use canonical `scrambleHash` from `hash-utils.ts` (mulberry32 pre-scramble), never a bare integer seed. Preserve the deliberately un-seeded test seam at `soloist-rhythm-engine.ts:711` via the injectable-`random()` pattern (`pickByRank`, Epic 11 S7a, is the template): production passes the `scrambleHash`-derived source, the loop-count-isolation test injects its own stub. Commit-per-layer (pitch / rhythm / `soloist.ts`) so a regression bisects cleanly.

**Acceptance:** the full `getSoloistNote` engine is deterministic by construction — `tests/standards/soloist-engine-determinism.test.ts` drops its pinned-mulberry32-spy requirement and asserts byte-reproducibility on two genuinely un-stubbed 1024-step runs; no `scrambleHash` body remains duplicated outside `hash-utils.ts`; the `soloist-rhythm-engine.ts:711` loop-count-isolation test still works via injected `random()`; all soloist critique suites pass unchanged — if a chromatism/contour/device-distribution metric drifts, the seed keying is correlating where it shouldn't; fix the keying, don't re-baseline.
**Effort:** ~8-12h (re-scoped 2026-05-20 from picker-only — the implementer found `soloist-engine-determinism.test.ts` exercises the whole engine, not just the picker; FOLLOWUPS §F's "~338 divergences" is whole-engine entropy, not picker entropy). **Model:** opus (musically sensitive — seed independence across ~56 draws). **Reviewer:** music-theory-reviewer + worker-contract-reviewer. **Listen-test:** the soloist line should not feel more mechanical or more random than before. **Source:** FOLLOWUPS §F.
**Status:** Shipped 2026-05-20 — full soloist-engine migration (~56 draws across the three files + the `form-analysis.ts` `scrambleHash` copy consolidated). Engine deterministic by construction; `soloist-engine-determinism.test.ts` runs un-stubbed with 0 divergences (mulberry32 spy + negative-control test dropped). All 750 standards + 861 unit-engine tests green; no critique metric drift. Both reviewers clean (music-theory 0 P0/P1/P2 + 1 NIT — the `form-analysis.ts` copy, patched inline; worker-contract 0 findings). Listen-test **passed** 2026-05-20 (`LISTEN_TESTS.md` A4 — soloist still sounds musical, no mechanical/repetitive drift on looped passages).

### S2. `evansIntervals` chord-quality awareness

`soloist-pitch-engine.ts:76` `evansIntervals = new Set([2, 5, 6, 9])` is chord-quality blind. The `6` is a real Evans color on dom7/maj7 but lands as the b5 *avoid note* on min7 — audible as ~25% of Evans extensions since the Epic 9 S2 multiplier retune. Replace the flat set with per-quality legal-extension sets (dom7 / min7 / maj7 / alt7 each get their own). Touches all Greats profiles, not just Evans. Fold in the **`isEvansCadence` weak-lever** finding (FOLLOWUPS §F) while in this code: decide whether the phrase-end cadence guard should additionally *boost* root/5th rather than only *skip* the extension boost.

**Acceptance:** Evans (and other Greats) extension picks are quality-legal — no b5 avoid-note on min7; extended `soloist` critique coverage asserts the per-quality split; the `isEvansCadence` decision is implemented or explicitly documented.
**Effort:** ~4h. **Model:** opus (harmonic-theory taste). **Reviewer:** music-theory-reviewer. **Listen-test:** Evans-style min7 passages should lose the sour b5 color. **Source:** FOLLOWUPS §E (mis-bucketed correctness bug) + §F.
**Status:** Shipped 2026-05-23 — `ChordQualityClass` + `classifyChordQuality()` + per-quality `EVANS_INTERVALS_BY_QUALITY` / `MILES_INTERVALS_BY_QUALITY` tables replace the flat sets. Dm7 interval-6 (b5 avoid) drops from 6.5% → 2.2% (30/30 reliability loop); Cmaj7 interval-6 (lydian #11) preserved as negative control. `isEvansCadence` decision documented inline: skip-only is sufficient — the cumulative `isCallResponse ×8.0` × phrase-end role-aware `×4.0` (=×32) root/5th cadence pull already dominates; adding an Evans-specific boost would caricature. New critique test in `jazz-soloist-authenticity.test.ts`. Reviewer P1s patched inline: `'diminished'` / `'augmented'` added to `classifyChordQuality`; halfdim suppression rationale rewritten to the actual locrian-vocabulary reason. P2s filed in FOLLOWUPS §F (missing per-quality test controls; case-sensitive classifier; m6-bucket interval-9 ear-call; `slashIntervals` chord-quality blindness; bucket-by-quality vs by-active-scale architectural note). All 1977 vitest tests green. Two reviewer P0/P1/P2-tier listen-test items added to FOLLOWUPS for next listening session.

### S3. Profile-rotation sticky-retain

`soloist.ts:1380` re-rolls `currentPhrase.context.profile` at every section boundary with `Math.random() < 0.8`, sampling the genre's full `INFLUENCE_POOLS` entry. A user who selects a specific profile (e.g. "Bill Evans") gets it for ~1 section before the engine swaps to a random pool entry. User-selected profile should sticky-retain at >90%; pool rotation drops to a smaller (~10-15%) optional variation. First step: identify the user-selected-profile signal vs. an auto/default profile (the fix must distinguish them).

**Acceptance:** a user-selected soloist profile persists across section boundaries at >90%; auto/un-pinned profiles still rotate; a test asserts the retain rate. State writes for any new "is-pinned" signal flow through dispatch.
**Effort:** ~2-3h. **Model:** opus (product + taste call). **Reviewer:** music-theory-reviewer + state-discipline-reviewer. **Source:** FOLLOWUPS §E (mis-bucketed product bug).
**Status:** Shipped 2026-05-23 — added `pinnedProfile: string | null` to the soloist slice (default `null`; flows through `applySoloistPayload` via the `config`-kind route; included in `getSyncState()` snapshot + generic `SET_PARAM`/`UPDATE_SB` delta paths). Engine rotation gate at `soloist.ts:~1444` rewritten with three branches: in-pool pin → sticky-retain (100%); no-pool pin (Reggae/Country/Bossa/Acoustic/Ska/Metal/Minimal/etc. — styles without an `INFLUENCE_POOLS` entry) → honor pin since there's no auto-rotation to fall back to (post-review P1 patch — initial S3 implementation silently dropped pins on those styles); off-pool pin (pool exists, pin not in it) → fall back to auto-rotation since downstream Greats logic in `soloist-pitch-engine.ts` is keyed on `(style, profile)` and silently no-ops on unknowns. Unpinned (null) path is byte-identical to pre-S3. New `tests/standards/soloist-profile-pin.test.ts` with 4 assertions (pinned-evans on jazz ≥95% — observed 100%; auto-rotation diversity ≥2 distinct + no profile >90%; off-pool fallback evans <30%; no-pool retain ≥95%). All 1981 tests green; both state-discipline + worker-contract reviewers clean (0/0/0/0); music-theory reviewer P1 patched in same diff, 4 P2s (test-comment narrative + every-boundary warn comment patched inline; sister-test isolation foot-gun + 100%-Evans saturation distribution filed in FOLLOWUPS §F; pre-existing comment typo skipped). No UI work — the field is shaped for a future `pinnedProfile` picker that dispatches `SET_PARAM { module: 'soloist', param: 'pinnedProfile', value }`.

### S4. Micro-nit & test-rigor cleanup sweep

Commit-per-item, Epic 11 S5 mould. Every remaining mechanical follow-up — NITs included, nothing left behind.

- **3 `Math.random()` in `groove-engine.ts:259/281/293`** → `scrambleHash` (drum-strategy probability/velocity). (§C) ~1h.
- **`CoordinationContext` interface** — declare the 5 S1 lookahead/drop fields (`upcomingSectionLabel`, `upcomingSectionEnergyDelta`, `barsUntilSectionChange`, `dropMuteActive`, `dropCrashPending`) so `drop-mechanic.ts` + the rock push get type safety. (§G) ~30min.
- **`bass-chord-change-approach-critique.test.ts`** — seed the bass engine path or widen the ~1pp delta cushion to a statistically honest margin. (§G) ~30min.
- **Soloist rhythm critique fixture** — extend `soloist-chorus-evolution-rhythm.test.ts` with active `stepCoordination` boosts so it exercises the wash-out the Epic 9 S5.a placement prevents. (§B) ~1h.
- **`findNextBebopMidi` whole-tone fallback** — `soloist-devices.ts`; make the degenerate-scale fallback scale-aware or document it. (§E NIT) ~30min.
- **Funk pop/chuck/hammer probability documentation** — `bass.md` P2 #17 doc/comment pass. (§E) ~1h.
- **Funk + Hip-Hop motif-tier test floors** — tighten the loose `>= 5` floors against a 20-run reliability sample. (§E) ~30min.
- **`accompanimentMidis` device-floor structural limit** — add a WHY comment documenting the 23.1pp ceiling as a known limit, not a defect. (§B NIT) ~15min.
- **Bossa phrase-end breath eval** — now that the partido-alto bank (Epic 9 S5.c) has shipped, evaluate whether Bossa should join `PHRASE_END_THIN_GENRES`; implement if yes, document if no. (§D) ~15min eval.

**Acceptance:** all items shipped, committed per-item; no behavior change beyond the `Math.random()`→`scrambleHash` migration and the Bossa gate (if added); `npm test` green.
**Effort:** ~6h. **Model:** sonnet (mechanical). **Reviewer:** music-theory-reviewer (the PRNG migration + Bossa gate touch musical behavior). **Source:** FOLLOWUPS §B/§C/§D/§E/§G.
**Status:** Shipped 2026-05-23 — 9 sub-items committed per-item + 4 reviewer-driven patches. `CoordinationContext` interface declared (forward-ref export). `accompanimentMidis` 23.1pp ceiling documented as structural limit. Funk pop/chuck/hammer probabilities documented. `findNextBebopMidi` whole-tone fallback documented as acceptable. Hip-hop slide-rate floor tightened `> 5` → `> 8` (patched from `> 10` after reviewer P2 — sat at min-1 of observed). `bass-chord-change-approach-critique` cushion documented as honest (engine churn since FOLLOWUPS entry grew the gap from ~1pp to 14-24pp). Soloist rhythm 2b extended with discriminating forced-vs-non-forced partition assertions (rewritten from `total2 > total0` after reviewer P2 — original didn't distinguish OLD vs NEW multiplier placement). Bossa phrase-end breath EVAL = no (initially added to `PHRASE_END_THIN_GENRES` but reverted after reviewer P0 — test/production divergence via genre-key drift, and partido-alto already encodes soloist-busy thinning natively). 3 `groove-engine.ts` `Math.random()` draws migrated to `scrambleHash` with per-draw discriminators + inst-name fold for lane independence (patched after reviewer P2). New velocity-distribution unit test guards draws 2/3 against constant-return regression. All 1983 tests green; standards suite 629/629; music-theory-reviewer P0 + 4 P2s all patched inline. Two pre-existing concerns surfaced by review filed in FOLLOWUPS §B (accompaniment.ts Bossa genre-key audit; bass-styles.ts funk slap-bass Math.random determinism).

### S5. Bass walking idiom

Two bass-walking idiom-correctness items. Verify-by-ear after, but no pre-decision needed — these are corrections, not taste tunings.

- **Walking-ska M6 over minor chords** — `bass.md` P1 #9. The M6 walking degree is wrong over minor chords. ~1h.
- **Generic walking target-awareness** — `bass.md` P1 #10. The generic walking line doesn't aim at the next chord's target tone. ~2h.

**Acceptance:** walking-ska no longer plays a M6 over a minor chord; the generic walking line measurably approaches the next chord's root/3rd; extended bass critique coverage.
**Effort:** ~3h. **Model:** opus (idiom-correctness). **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §E.
**Status:** Ready.

### S6. Per-genre tuning sweep

Implements the six value/direction decisions recorded in `LISTEN_TESTS.md` Part B. Each is a small per-genre tweak; commit-per-item.

- **B1** Imperfect Symmetry intensity floor · **B2** S8 ramp-inversion · **B3** S8 Ska-Punk genre floor · **B4** China `volumeScale` · **B5** Funk motif-2 `+2` displacement · **B6** Final-bar HiHat suppression gate.

**Acceptance:** each `LISTEN_TESTS.md` Part B decision is implemented as recorded; critique tests updated where a gated rate changes.
**Effort:** ~4h. **Model:** sonnet (mechanical once decided). **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §E.
**Status:** Blocked — needs `LISTEN_TESTS.md` Part B decisions B1–B6.

### S7. Final-bar polish

`LISTEN_TESTS.md` C1. Per-genre final-bar drum gestures (replace the universal snare-stinger) + final-bar cadence voice-leading (Epic 2 S4 currently discards `previousVoicingMidis`).

**Acceptance:** final-bar drum treatment is per-genre; the cadence resolves with voice-leading from the previous voicing; new critique coverage; listen-test pass.
**Effort:** ~4h. **Model:** opus. **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §E.
**Status:** Blocked — needs `LISTEN_TESTS.md` C1.

### S8. Per-genre arrangement design

`LISTEN_TESTS.md` C2 + C3. Per-genre intro/outro mute tuning (replace genre-flat `INTRO_MUTES`) + Bossa/samba label split (`bass.md` P2 #16).

**Acceptance:** intro/outro layering is per-genre; bossa and samba are distinct feels in config + engine, with compatibility shims for any persisted label; new coverage.
**Effort:** ~5h. **Model:** opus. **Reviewer:** music-theory-reviewer (+ state-discipline-reviewer if the label split touches persisted state). **Source:** FOLLOWUPS §E.
**Status:** Blocked — needs `LISTEN_TESTS.md` C2/C3.

### S9. Disco re-categorization + vibe-path

`LISTEN_TESTS.md` C4 + C5. Disco intensity-axis re-categorization (`drums.md` P2 #18 — careful, load-bearing for `synth-drums` velocity scaling) + sparse-vibe cell collapse / active-vibe ornament collision (Epic 3 S2 chords/accompaniment vibe path).

**Acceptance:** Disco's motif/intensity mapping is corrected without breaking velocity scaling; the comping cell has a sparse-vibe floor and an active-vibe collision rule; new coverage; listen-test pass.
**Effort:** ~5h. **Model:** opus. **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §E/§F.
**Status:** Blocked — needs `LISTEN_TESTS.md` C4/C5.

### S10. Ska-Punk shared-hook antiphony

`LISTEN_TESTS.md` C6. The `playShadowMode` Ska-Punk branch that echoes soloist hooks is dead — `sharedHookBuffer` is never populated. Make it work: the soloist emits a `SoloistHook` on phrases it wants harmony to echo, harmony reads the contract surface (Epic 11 S9b already routed the buffer through `CoordinationContext`).

**Acceptance:** the soloist populates `sharedHookBuffer` on hook-worthy phrases; the Ska-Punk shadow branch fires in a production trace; new critique coverage; listen-test pass.
**Effort:** ~3h. **Model:** opus. **Reviewer:** music-theory-reviewer + worker-contract-reviewer. **Source:** FOLLOWUPS §E.
**Status:** Blocked — needs `LISTEN_TESTS.md` C6 (decide whether the feature is worth building).

---

**Created:** 2026-05-20 (post-Epic-11 scoping pass). **Source:** [`FOLLOWUPS.md`](FOLLOWUPS.md) reconciled backlog + [`LISTEN_TESTS.md`](LISTEN_TESTS.md).
