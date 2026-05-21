# Epic 12 — Follow-up Drain

The post-Epic-11 reconciliation pass ([commit `75a849b4`](FOLLOWUPS.md)) left **~29 genuinely-open follow-ups**. This epic drains every implementable one — including NITs — so nothing is left behind. Items needing human ears are bucketed separately in [`LISTEN_TESTS.md`](LISTEN_TESTS.md); the stories below that depend on a listening decision are tagged **Blocked** and cite the checklist item that unblocks them.

Story sizing follows the house rule — one focused session each, one engine touch + critique test + reliability loop, commit-per-item for the sweep stories.

## Status

| Story | Title | Model | State |
| :- | :- | :-: | :- |
| S1 | Soloist pitch-picker `scrambleHash` migration | opus | Ready |
| S2 | `evansIntervals` chord-quality awareness | opus | Ready |
| S3 | Profile-rotation sticky-retain | opus | Ready |
| S4 | Micro-nit & test-rigor cleanup sweep | sonnet | Ready |
| S5 | Bass walking idiom | opus | Ready |
| S6 | Per-genre tuning sweep | sonnet | Blocked → `LISTEN_TESTS.md` Part B |
| S7 | Final-bar polish | opus | Blocked → `LISTEN_TESTS.md` C1 |
| S8 | Per-genre arrangement design | opus | Blocked → `LISTEN_TESTS.md` C2/C3 |
| S9 | Disco re-categorization + vibe-path | opus | Blocked → `LISTEN_TESTS.md` C4/C5 |
| S10 | Ska-Punk shared-hook antiphony | opus | Blocked → `LISTEN_TESTS.md` C6 |

**0 / 10 shipped.** S1–S5 are cycle-able immediately. S6–S10 unblock as their `LISTEN_TESTS.md` items are decided.

---

### S1. Soloist pitch-picker `scrambleHash` migration

The May 2026 `scrambleHash` migration covered bass / harmonies / grooves but not the soloist picker. `soloist-pitch-engine.ts:1293` (`Math.random() * totalWeight` weighted roulette), the device-trigger gates, and timing jitter all still draw un-seeded `Math.random()` — two un-stubbed 1024-step runs diverge at ~338 positions, so a no-stub determinism test is impossible. Migrate the picker roulette + device gates + jitter to a `scrambleHash` source keyed by `(barIndex, sectionId, step)`. Consolidate `soloist.ts`'s byte-identical `scrambleHash` copy into `hash-utils.ts` (Epic 11 S9a deliberately left it for this story). `pickByRank` (Epic 11 S7a) already takes an injectable `random()` — it is the ready seam.

**Acceptance:** the soloist picker is deterministic by construction; `soloist-engine-determinism.test.ts` drops its pinned-mulberry32-spy requirement and asserts byte-reproducibility on two un-stubbed runs; no `scrambleHash` body remains duplicated outside `hash-utils.ts`; critique suites pass unchanged (the seed must not correlate adjacent steps — verify the chromatism / contour metrics don't drift).
**Effort:** ~4h. **Model:** opus (musically sensitive — roulette seed independence). **Reviewer:** music-theory-reviewer + worker-contract-reviewer. **Listen-test:** the soloist line should not feel more mechanical or more random than before. **Source:** FOLLOWUPS §F.
**Status:** Ready.

### S2. `evansIntervals` chord-quality awareness

`soloist-pitch-engine.ts:76` `evansIntervals = new Set([2, 5, 6, 9])` is chord-quality blind. The `6` is a real Evans color on dom7/maj7 but lands as the b5 *avoid note* on min7 — audible as ~25% of Evans extensions since the Epic 9 S2 multiplier retune. Replace the flat set with per-quality legal-extension sets (dom7 / min7 / maj7 / alt7 each get their own). Touches all Greats profiles, not just Evans. Fold in the **`isEvansCadence` weak-lever** finding (FOLLOWUPS §F) while in this code: decide whether the phrase-end cadence guard should additionally *boost* root/5th rather than only *skip* the extension boost.

**Acceptance:** Evans (and other Greats) extension picks are quality-legal — no b5 avoid-note on min7; extended `soloist` critique coverage asserts the per-quality split; the `isEvansCadence` decision is implemented or explicitly documented.
**Effort:** ~4h. **Model:** opus (harmonic-theory taste). **Reviewer:** music-theory-reviewer. **Listen-test:** Evans-style min7 passages should lose the sour b5 color. **Source:** FOLLOWUPS §E (mis-bucketed correctness bug) + §F.
**Status:** Ready.

### S3. Profile-rotation sticky-retain

`soloist.ts:1380` re-rolls `currentPhrase.context.profile` at every section boundary with `Math.random() < 0.8`, sampling the genre's full `INFLUENCE_POOLS` entry. A user who selects a specific profile (e.g. "Bill Evans") gets it for ~1 section before the engine swaps to a random pool entry. User-selected profile should sticky-retain at >90%; pool rotation drops to a smaller (~10-15%) optional variation. First step: identify the user-selected-profile signal vs. an auto/default profile (the fix must distinguish them).

**Acceptance:** a user-selected soloist profile persists across section boundaries at >90%; auto/un-pinned profiles still rotate; a test asserts the retain rate. State writes for any new "is-pinned" signal flow through dispatch.
**Effort:** ~2-3h. **Model:** opus (product + taste call). **Reviewer:** music-theory-reviewer + state-discipline-reviewer. **Source:** FOLLOWUPS §E (mis-bucketed product bug).
**Status:** Ready.

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
**Status:** Ready.

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
