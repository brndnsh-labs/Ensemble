# Musical Engine Patterns

Reusable recipes for working on the generative musical engines (soloist, bass, drums, chords, harmony, conductor, arranger). Captured from the May 2026 musical-audit cycle — these are the patterns that proved durable across the cycle's 80 shipped stories.

If you're picking up new engine work and not sure how to shape the change, start here. The "5 smells" section is also the working checklist for reviewing critique tests.

## Related

- `docs/archive/MUSICAL_AUDIT.md` — Epics 1-8 history snapshot. Frozen.
- `docs/archive/musical-audit-2026-05/` — full cycle archive (EPICS.md, 12 epic-*.md files, LISTEN_TESTS.md, 6 source-finding audit reports). Frozen 2026-05-25 after all 80 stories shipped.
- `docs/audit/EPICS.md` — tombstone pointer; the next audit cycle (if any) re-fills this.
- `docs/audit/FOLLOWUPS.md` — ongoing follow-up backlog (~28 open items, mostly NIT/listen-only). Live.
- `tests/standards/CRITIQUE_GUIDELINES.md` — original critique-test principles and target thresholds.
- `CLAUDE.md` § Musical Logic & Generative Standards — operating rules for engine work.

## Methodology — the 5 smells in critique tests

Critique tests in `tests/standards/` are the Definition of Done for musicality. They're also where musical bugs hide. The recurring pattern:

> A test's *name* asserts a musical claim, but its *implementation* either (a) computes the expected pattern by replaying the engine's own predicates (tautology), (b) uses a threshold below the random-baseline (passes with any output), or (c) measures a different quantity than the name implies.

Two additional smells discovered during the May 2026 audit:

> (d) **Report/assertion mismatch** — `console.log` shows "Target: >30%" but `expect(...)` asserts `>15%`. The logged target is aspirational; the assertion is what actually guards. Check that every "Target: X" in the report is the value being asserted.
>
> (e) **Harness silences engine path** — the test passes an incomplete `stepInfo` object (e.g. just `{ isBeatStart: ... }`) when the engine checks other properties (`isBackbeat`, `isOffbeat`, `isMeasureStart`, `isPulseStart`). The engine's relevant lane never fires, so the test measures only the fallback lane while looking healthy. Fix: build stepInfo via `getStepInfo` from `public/utils.ts`, or construct an object containing every property the engine reads.

Look for any of the five per test file, then verify the engine against the *named* musical claim before deciding whether the test, the engine, or both need to change.

## Patterns proven

### Engine-knows-where-it-is (form-aware pitch / rhythm selection)

When you want an engine to shape its output based on musical structure (phrase position, section position, loop count, role), the proven recipe:

1. **Planner / scheduler derives the structural fact** in the layer that already knows it. Phrase-end markers belong in the rhythm planner (`soloist-rhythm-engine.ts`) because it builds the phrase; SRDC phase belongs in the plan-build site that already calls `getSectionContext` (`public/engine/arranger-utils.ts`). Don't try to re-derive structure at the picker layer.

2. **Attach the fact to the work unit.** Phrase-end marks ride on the rhythm node (`isPhraseEnd: true`). SRDC phase rides on the phrase context (`phrase.context.srdcState`). The work unit is the unit of musical thought; the structural fact should travel with it.

3. **Picker reads at use-site** and applies the bias. The pitch picker (`soloist-pitch-engine.ts`) reads both `rhythmNode.isPhraseEnd` and `phrase.context.srdcState`.

4. **Apply as a final-stage `weight *= mult`**, not as a multiplier on one factor's additive bonus. Generative engines have many simultaneous biases pushing the same direction; scaling just one of them gets washed out. See [[feedback-weight-tuning-multiplier-placement]] for the full reasoning.

5. **Add a top-level state override slot for tests.** Production writes the canonical nested location every call; without an override slot, test mocks setting the same nested field get clobbered immediately. Read order: `topLevel || nested || default`. See [[feedback-state-mock-vs-production-override]].

6. **Tune to a musical sweet spot, not a statistical one.** A ×8/×0.15 multiplier produces a tight statistical gap but sounds robotic (Response always lands on root, Departure always avoids it). A ×4/×0.3 multiplier produces a smaller but reliably-directional gap AND preserves musical variability. Confirmed on both phrase-end (2026-05-16) and SRDC (2026-05-16) work.

7. **Multi-trial reliability check before locking in thresholds.** A 20-30 run loop (`for i in $(seq 1 30); do npx vitest run ... | grep -E "FAIL|metric"; done`) catches sample-size flake that single-run testing misses. The phrase-end test went through three threshold iterations using this loop before settling on the combined-condition assertion that passed 30/30.

### Test-mock isolation (for bias-comparison tests)

When measuring whether a new engine bias differentiates outcomes, audit the mock state for *other* biases that push the same direction and neutralize them in the test. See [[feedback-test-isolation-competing-biases]] for the recipe.

### Coordination patterns

Source of truth: `public/engine/coordination-engine.ts`. When a consumer engine needs state owned by another engine, the proven recipe:

1. **Producer writes to the coordination context.** Never have a consumer read another engine's `state.x.session.*` directly — that's a contract violation that breaks test mocks (see [[feedback-tests-passing-wrong-path]]) and couples engines to each other's internals.

2. **Sticky-across-ticks state goes in `CoordinationCarryover`.** Per-tick context is recreated; if the consumer needs the producer's value from N ticks ago (because the producer doesn't run every tick), use the Carryover struct threaded through `generateNotesForStep`. Always age-cap sticky values so single-shot events don't permanently steer downstream behavior. See [[reference-coordination-carryover]] for the two hosts that must initialize it.

3. **Annotate producer order in code.** Every field on the coordination context gets a `// writer: <producer-name>` and `// readable-after: <producer-name>` comment in `createCoordinationContext()`. Guard with `tests/unit/engine/producer-order.test.ts` — mock the producer's output to a sentinel value (e.g. MIDI 72) and spy on a later consumer to assert it sees that value. If anyone reorders the producers, the positive test fails.

### Loop-awareness via per-tick `playback.currentLoopCount`

When you want an engine to vary its behavior across loop passes ("Chorus Evolution"), the proven recipe:

1. **Read `playback.currentLoopCount` at per-tick time**, not at seed time. The slot lives in `playback` state (`types.ts:162`), maintained by the conductor at iteration boundaries (`conductor.ts:319-322`), and flowed into every per-tick engine via the `playback` arg. No new context field or state slice is needed — the data plumbing is universal.

2. **Don't fake it from a seeder.** Seeders (`drum-seeder.ts`, etc.) run once at arrangement-seed time and produce static maps. They have no access to `playback.currentLoopCount`. Any "loop-aware" check inside a seeder is structurally broken — and in the drum-seeder case, the fallback `index < arranger.sectionMap.length` check was additionally defeated by `unrollArrangement` merging consecutive same-label iterations (`arranger-utils.ts:81-92`). The seeder's `index` maxes out at ~5 regardless of loop count.

3. **Reference consumers:** `soloist-pitch-engine.ts:235, 861-877, 999-1056` (~20 reads — Head/paraphrase/development branching, device-frequency scaling, fatigue decay); `groove-engine.ts:143-155` (motif complexity cap, via the exported `motifCapForLoop()` helper).

4. **Helper-extract the cap/scale formula** so the boundary table is unit-testable separately from the engine integration. Pattern: `export function motifCapForLoop(loopCount)` + a 6-line boundary-table test + one integration smoke that confirms the helper is wired into `applyGrooveOverrides`. Avoids the brittle "direction-of-divergence" assertion problem when PRNG state interacts with the cap.

5. **Test framing:** drive the engine with two `playback` objects (`currentLoopCount: 0` vs `2`) against the same fixture, and assert direction-agnostic divergence (`diffSteps.length >= threshold`). Don't assert "Loop 2 produces *more* X than Loop 0" — depending on PRNG state inside the engine, tier-boundary cases can flip the direction even when the cap is correctly wired.

### Dual-gate activation pattern

When adding a new bass behavior that fires on a step the active style doesn't normally play (e.g. a chromatic anticipation note on the half-beat in a quarter-note country style), gate the behavior in BOTH `isBassActive` (force-activate the step) AND `getBassNote` (override the pitch). Single-gate version is dead code — `getBassNote` is never called on a step the style skipped, so a pitch-only gate fires zero times.

The pattern generalizes to any engine where an activation predicate gates a separate pitch/value selector — verify both gates fire before assuming the behavior is wired up. Confirmed in Epic 1 / S3 (`upcomingSectionFirstChord` chromatic approach).

### Final-stage multiplier discipline (canonical placement)

For any weight-based picker (`selectPitchAndDevices` in `soloist-pitch-engine.ts`, drum/bass selectors with multiple bias contributions), if you want a new bias to actually shift the chosen distribution, apply it as a **final-stage `weight *= mult`** after all the additive bonuses, not as a multiplier on one factor's `+= bonus` line.

Generative engines accumulate many simultaneous biases (chord-tone bonus, profile boost, common-tone reward, etc.). Scaling just one of them gets washed out. Confirmed during the May 2026 SRDC bias work — additive multiplier gave 0pt phase gap; final-stage multiplier gave 30pt+ gap.

The "weight tuning multiplier placement" smell to look for: a `weight += baseBonus * profileMultiplier` line where the new bias is the multiplier and `baseBonus` is one of N additive contributions to the same weight. Move the multiplier to the final stage instead.

### Determinism via seeded mulberry32

For any variation that should be reproducible across reads (motif rotation, voicing displacement, ornament toggles), use `scrambleHash` (mulberry32) over the structural key tuple, not bare `Math.random()`.

- **Bare LCG produces sawtooth patterns on small integer seeds** — never use `(seed * X + Y) % Z` directly; pre-scramble with mulberry32.
- **Seed key shape:** `(sectionId, barIndex, instName, occurrence)` — every structural input that should produce different output gets a slot. Adding `instName` (e.g.) means Snare and HiHat permute at different 16ths instead of locking together.
- **Companion: direction-from-headroom rule** — when a clamped value (octave shift, dynamic) could go either direction, derive direction from headroom (`midi > 60 ? -12 : +12`) rather than from a coin flip. Avoids "direction-of-divergence" test flakiness.

See [[feedback-seeded-prng-mulberry32]] for the canonical helper and [[feedback-determinism-test-pattern]] for the matched test recipe (different `Math.random` stubs per run, parameterized fixtures over each gated branch).

## When the audit doc says one thing and the code says another

The audit docs (`docs/audit/<area>.md`) are smart but not omniscient. Recurring failure modes when implementing from an audit doc:

- **Layer mismatch** — the recipe names a file/line but the actual signal lives elsewhere (seed-time when the signal is per-tick; pitch-engine when the gate is at the dispatcher). Trace the signal to its actual home before implementing.
- **Premise breaks under review** — the recipe is logically sketched but the engine's gate set, runtime path, or coordination plumbing doesn't match the recipe's assumptions. ~60% P0 rate during the May 2026 cycle came from this. Always run the reviewer; budget for premise-fix patches.
- **"Document or fix" hides a load-bearing musical decision** — a P2 doc-pass item ("undocumented gate at line X") can require a dispatcher-level musical-design call to literally satisfy its acceptance criterion. The Epic 8 S5 case: lowering the named floor required also dropping a Jazz carve-out at a different file to honor the audit's "ballad-intensity jazz/blues" language.
- **Implementer's out-of-scope observations are gold** — when a sub-agent flags adjacent issues ("I noticed 3 more undocumented thresholds at lines X/Y/Z but they're out of scope"), capture them in `FOLLOWUPS.md` immediately. Two times during the audit, these flagged items became the next session's most valuable work.

See [[feedback-audit-doc-premise-breaks]] and [[feedback-audit-doc-layer-mismatch]] for the matched-pair memory entries.
