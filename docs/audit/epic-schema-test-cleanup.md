# Epic 10: Schema & Test Cleanup

## Why this epic exists

Post-audit cleanup. Schema fields that became inert during the audit (named locals shadowing coordination fields, dead carriers, dead conductor arms) and test-rigor gaps surfaced during reviews (mostly P2 deferrals that documented "this test would pass even if the fix regressed"). Less musically consequential than Epic 9 but important for long-term code hygiene and regression detection.

Items are individually small (~15min-2h each). Two of the three stories are `/fan-out` candidates — independent files, mechanical changes. The third (test-rigor for soloist) needs musical taste on each test's metric reshape.

Promoted from `docs/audit/FOLLOWUPS.md` sections F and G.

## Stories

### S1. Schema cleanup sweep

**Six items that share "remove inert names + add missing fuzzy-match branches":**

**(a) Naming collision: `soloist.ts:1257 isFinalMeasure` (per-section) vs `coordination.isFinalMeasure` (per-song).** Different semantics, same name. Rename the local to `isLastSectionMeasure` or similar. Epic 2 S4 follow-up.

**(b) Three state-discipline NITs at Epic 2 S4.** Untyped `: any` parameter bag in cadence helper; redundant `as any` cast; defensive `arranger?.` where arranger is guaranteed.

**(c) MIDI export silently drops `CowbellHigh`/`CowbellLow`.** `midi-worker-logic.ts:560` resolves drum hits via `DRUM_MAP[soundName]`. `DRUM_MAP` only has bare `Cowbell = 56`, no fuzzy `name.includes('Cowbell')` branch like Agogo/Bongo have. Disco octave-cowbell motif (Epic 7 S2) renders in live audio but silently drops from MIDI export. Add a fuzzy fallback for the Cowbell family, plus a `'Brush'` mapping (GM doesn't have a brush note; nearest is `38 Snare` or `37 Side Stick`).

**(d) `KNOWN_SOUND_NAMES` substring-exemption too broad.** `synth-drums.ts:219-224` exempts `name.includes('Tom')`, `name.startsWith('Conga'/'Bongo'/'Agogo'/'Cowbell')` from the unknown-name warning. Real typos like `'AgogoMid'` or `'CowbellMid'` are exempt AND fall through the substring-matching dispatch branches that render *something* (wrong octave) rather than warn. Tighten to the exact dispatcher-recognized suffixes (`High`/`Low`/`Open`/`Mute`/`Slap` + bare root). Add bare `'Cowbell'` to `KNOWN_SOUND_NAMES` for symmetry.

**(e) `KNOWN_SOUND_NAMES` carries inert no-space tom variants.** `synth-drums.ts:189-191` lists `'HighTom'/'MidTom'/'LowTom'` but no emitter writes those — every fill template uses the space-form. The `name.includes('Tom')` substring exemption catches them anyway. Remove the four entries (`'HighTom'`, `'MidTom'`, `'LowTom'`, bare `'Tom'`) to keep the registry honest.

**(f) `voice.duration` monotonic growth across legato chains (Epic 8 S1 follow-up).** `synth-harmonies.ts:108`: each legato extension recomputes `duration = newEnd - existing.time` from the original first-attack time. A single voice held across N consecutive chord changes accumulates `duration ≈ N × bar_length`. Not user-visible (activeVoices hard-capped at 3) but bookkeeping is wrong. Track `voice.lastExtendedAt = playTime` and key the GC on that field.

**Also: dead role-switch arms in `conductor.ts:401-428`** (FOLLOWUPS §G). Switch handles `Exposition/Development/Contrast/Build/Climax/Recapitulation/Resolution`, but `analyzeForm` only emits `Intro/Outro/Peak/Main Theme/Theme B/Bridge/Variation/Refrain/Build`. Six of seven case arms unreachable. **Choose:** rename switch arms to match `analyzeForm` vocabulary (~2h, mechanical), or have `analyzeForm` emit formal-music vocabulary (~4h, richer but wider rework). Recommend rename in this sweep; promote the analyzer-enrichment to a separate story if/when richer form analysis matters.

**Acceptance:** grep verifies inert variants removed. MIDI export round-trip preserves cowbell motif. `voice.duration` no longer accumulates monotonically. Conductor switch arms intersect non-trivially with `analyzeForm`'s output set.
**Effort:** ~4h. **Model:** sonnet (mechanical across the board; conductor rename is the largest item). **Reviewer:** state-discipline-reviewer + music-theory-reviewer (for the conductor rename). **Source:** FOLLOWUPS §G.

**Status:** Shipped 2026-05-19 (per-sub-item commits — S1.a/S1.b/S1.c/S1.d/S1.e/S1.f/S1.conductor). All seven sub-items completed inline by the orchestrator over ~3h. Highlights: (a) `isFinalMeasure` per-section local renamed to `isLastSectionMeasure` in `soloist.ts`, tick-logic comment updated. (b) Three state-discipline NITs from Epic 2 S4 addressed — dropped defensive `arranger?.totalSteps`, removed two redundant `(coordination as any)` casts (the field is on the inferred `createCoordinationContext` return), introduced `GrooveOverrideOptions` interface on `applyGrooveOverrides` (test fixtures still typecheck via `params: any`; `mStep`/`stepInGroup`/`groupIndex` marked optional because tick-logic doesn't pass them today). (c) Added `Brush: 37` (GM Side Stick) to DRUM_MAP + fuzzy `Cowbell` / `Brush` branches in `midi-worker-logic.ts:560` + matching velocity multipliers (Cowbell 0.6, Brush 0.5). (d) Replaced broad `startsWith('Cowbell')`/`includes('Tom')` exemption in `synth-drums.ts:maybeWarnUnknownSound` with `DISPATCHER_FAMILIES` table — exact suffix vocabulary per family root (High/Mid/Low/Open/Mute/Slap, `spacedForm` for `'High Tom'`); typos like `'CowbellMid'` now warn. Added bare `'Cowbell'` to KNOWN_SOUND_NAMES. (e) Removed four inert tom variants (`'HighTom'`/`'MidTom'`/`'LowTom'`/`'Tom'`) — no emitter wrote them; `includes('Tom')` exemption already caught the canonical space-form. (f) New invariant for harmony legato: `voice.lastExtendedAt` tracks the most recent attack time; `voice.duration` stops accumulating monotonically (was `≈ N × bar_length` after N extensions). GC key: `(lastExtendedAt ?? voice.time) + duration + 1.0 <= now`. (conductor) Renamed dead role-switch arms in `conductor.ts:447-485` and `tick-logic.ts:642-668` to mirror `analyzeForm`'s vocabulary (Intro/Outro/Peak/Main Theme/Theme B/Bridge/Variation/Refrain/Build); preserved old arms' energy formulas 1:1 where roles align. Updated `tests/unit/engine/conductor.test.ts` Climax→Peak + coverage list. 92 standards-suite files / 568 tests green; 16/16 conductor unit tests + 17/17 conductor-arc-critique green. No critique-test threshold changes. Two pre-existing unit-test failures (`hiphop-integrity` open-lane routing; `metal-shred-integrity` blast-beat coverage) confirmed unrelated by checking out main pre-cycle — filed in FOLLOWUPS §F.

### S2. Test rigor sweep — soloist

**Five items in the soloist test suite that share "test passes even if the fix regresses":**

**(a) Deterministic-seeding of head-bypass jitter PRNG** (Epic 4 S4 follow-up). Jitter is scale-clamped but not yet seeded.

**(b) Engine-wide determinism test was waiting on S4+S5** (Epic 3 S3 follow-up). Now unblocked — write the test.

**(c) Picker-output-only chromatism metric for Epic 4 S1.** `soloist-jazz-critique.test.ts` "Bird-profile chromatism ratio ≥ 30.5%" tests COMBINED picker + device chromatic output. Pre-fix engine produced 27-31% via devices; post-fix produces 31-34%; 0.5pt headroom over pre-fix ceiling is real but thin. Add a `source: 'picker' | 'device'` field on returned note objects (surfaced only in test mode); rewrite the S1 test to assert picker-emitted chromatic-neighbor share directly.

**(d) Soloist test fixtures don't seed `Math.random` (Epic 4 S2 follow-up).** Extension/cadence tests show wide single-run variance (15-50%) despite per-iteration profile + role pinning and 800-step loops. Variance dominated by un-seeded RNG in picker scoring, section-boundary profile re-roll, and rhythm-engine attack distribution. Write a shared test-fixture helper that installs a `mulberry32`-seeded `Math.random` spy at test setup; collapses distribution to a single deterministic run and lets assertion bounds tighten 3-5×.

**(e) Evans cadence test doesn't isolate phrase-end attacks (Epic 4 S2 follow-up).** `jazz-soloist-authenticity.test.ts` "Evans response cadences should resolve home" measures root/5th rate across ALL response attacks, not phrase-end response attacks specifically. The asserted home rate (>10%) is mostly carried by `isCallResponse ×8.0` boost (every response attack), not by `isEvansCadence` early-exit (phrase-end only). Test would still pass if the `isEvansCadence` guard were reverted. Filter the metric to phrase-end attacks only (proxy via `i % 16 === 15` or surface `isPhraseEnd` from rhythm engine to test-mode).

**Acceptance:** each test, after the rewrite, *fails* when its target fix is reverted. Build a regression mini-suite: revert each target fix one at a time, confirm the corresponding test goes red, restore.
**Effort:** ~5h. **Model:** opus (each metric reshape needs musical judgment — what subset of attacks is the *claim* about). **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §F (soloist items).

### S3. Test rigor sweep — harmony, drums, conductor

**Six items in the harmony / drum / conductor test suites:**

**(a) Accompaniment S3 test fixture primary seed lands target=0** (Epic 2 S3 follow-up). The cascade-from-`bar > target` path is not directly observed in the primary fixture. Add a fixture with `target > 0`.

**(b) Drums-not-muted regression test asserts Kick only** (Epic 2 S5 follow-up). Extend to Snare/HiHat for symmetry.

**(c) `withOctaveJump` PC-fold metric can't detect regressions on `clampAndNormalize`-wrapped chromatic paths** (Epic 5 S3 follow-up). The +12 gets re-folded away. Tighten to engine-computed `targetRoot`.

**(d) Sparse-vibe cell collapse + active-vibe ornament collision** (Epic 3 S2 follow-up). Pre-existing reviewer-flagged issues; deferred.

**(e) Conductor cool-down jitter headroom is thin** (Epic 2 S7 follow-up). `tests/standards/conductor-arc-critique.test.ts:393-427` asserts `targetIntensity < 0.6` against worst-case `0.5 + 0.075 jitter = 0.575` — only 0.025 cushion. Safe today but will silently start clipping if jitter envelope widens. Assert `< 0.625` with a pinned-to-jitter-constant comment, OR `≤ 0.575 + ε` so jitter-constant regressions surface as deliberate test failures.

**(f) Conductor critique only exercises ceiling-clamped section** (Epic 2 S7 follow-up). Fixture uses Chorus (energy 0.9) so the macro clamp resolves to ceiling. Companion test should transition into a low-energy section (Verse, energy 0.5) and verify `targetEnergy` lands at the `getSectionEnergy()` value (not the ceiling).

**(g) Pad-sustain test doesn't exercise scheduler or synth legato paths** (Epic 8 S1 follow-up). Test calls `getHarmonyNotes` directly and asserts only the harmony-engine layer. Scheduler-level survivor-retention branch in `scheduler-core.ts` (the `legatoMidis` partition) and synth-level voice-extension branch in `synth-harmonies.ts` ship with zero test coverage — roughly 110 of the ~134 changed lines. Add an integration-style assertion in `tests/unit/engine/scheduler-core.test.ts` (or new sibling) that drives one chord-change tick through `scheduleHarmonies` with a fake AudioContext, asserts `state.harmony.activeVoices` retains the legato MIDI across the boundary.

**(h) S8 funk-backbeat-presence integration coverage** (Epic 2 S8 follow-up). PART 1 fixes `bandIntensity=0.35` directly and exercises only the gate; PART 2 measures the ramp without measuring backbeat routing during it. Add a PART 3 that runs `runConductorArc` for 32 bars AND collects backbeats from `applyGrooveOverrides` using the conductor-driven per-tick `bandIntensity`, asserting ≥80% Snare on the integrated trace.

**Acceptance:** as in S2 — each rewritten test fails when its target fix is reverted.
**Effort:** ~5h. **Model:** sonnet for (a)(b)(d)(e)(f); opus for (c)(g)(h) (each requires understanding the engine path being tested). **Reviewer:** music-theory-reviewer. **Source:** FOLLOWUPS §F (non-soloist items).

## Notes on this epic's shape

S1 and S3 are **multi-item sweeps** with per-sub-item commits. S2 is also a sweep but more taste-driven per item — likely worth single-item commits anyway.

S1 has at least three near-independent sub-items (conductor rename, KNOWN_SOUND_NAMES sweep, voice.duration fix) — fan-out candidate if you want to parallelize.
