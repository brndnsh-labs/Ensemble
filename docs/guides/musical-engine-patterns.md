# Musical Engine Patterns

Reusable recipes for working on the generative musical engines (the band's lanes in `band/`: drums, bass, comp and lead, and the arrangement above them). Captured from the May 2026 musical-audit cycle — these are the patterns that proved durable across the cycle's 80 shipped stories.

If you're picking up new engine work and not sure how to shape the change, start here. The "5 smells" section is also the working checklist for reviewing critique tests.

## Related

- `docs/archive/MUSICAL_AUDIT.md` — Epics 1-8 history snapshot. Frozen.
- `docs/archive/musical-audit-2026-05/` — full cycle archive (EPICS.md, 12 epic-*.md files, LISTEN_TESTS.md, 6 source-finding audit reports). Frozen 2026-05-25 after all 80 stories shipped.
- `docs/audit/EPICS.md` — tombstone pointer; the next audit cycle (if any) re-fills this.
- `docs/audit/FOLLOWUPS.md` — the old markdown follow-up backlog. **Frozen archive (2026-06-18)**; follow-ups now live as `finding`/`backlog` issues on the GitHub tracker (`brndnsh-labs/Ensemble`; see CLAUDE.md § Work Pipeline).
- `tests/standards/CRITIQUE_GUIDELINES.md` — original critique-test principles and target thresholds.
- `CLAUDE.md` § Musical Logic & Generative Standards — operating rules for engine work.

## Methodology — the 5 smells in critique tests

The band's critique tests (`band/test/critique.test.ts`, claims in `band/test/claims/`) are the Definition of Done for musicality. They're also where musical bugs hide. The recurring pattern:

> A test's *name* asserts a musical claim, but its *implementation* either (a) computes the expected pattern by replaying the engine's own predicates (tautology), (b) uses a threshold below the random-baseline (passes with any output), or (c) measures a different quantity than the name implies.

Two additional smells discovered during the May 2026 audit:

> (d) **Report/assertion mismatch** — `console.log` shows "Target: >30%" but `expect(...)` asserts `>15%`. The logged target is aspirational; the assertion is what actually guards. Check that every "Target: X" in the report is the value being asserted.
>
> (e) **Harness silences engine path** — the test passes an incomplete `stepInfo` object (e.g. just `{ isBeatStart: ... }`) when the engine checks other properties (`isBackbeat`, `isOffbeat`, `isMeasureStart`, `isPulseStart`). The engine's relevant lane never fires, so the test measures only the fallback lane while looking healthy. Fix: build the input the way production does, or construct an object containing every property the engine reads. (The old `stepInfo` object is gone with the old engine; the smell is general.)

Look for any of the five per test file, then verify the engine against the *named* musical claim before deciding whether the test, the engine, or both need to change.

### Threshold provenance: intent vs measured

Empirically-calibrated thresholds silently become a ratchet: after a deliberate musical change, failing assertions get loosened one at a time with no record of which thresholds encode musical intent versus which were just measured headroom. An `intent` number and a `measured` number look identical as code (`toBeGreaterThan(0.5)`) but a PR that loosens one has a completely different review burden than a PR that loosens the other. Tag every range/threshold assertion with its provenance so that's legible without archaeology:

- **`// intent:`** — a musical INVARIANT the number encodes, true regardless of what the engine currently measures. Example:
  ```ts
  expect(backbeatVel).toBeGreaterThan(ghostVel); // intent: backbeat must strike harder than a ghost note — a rock invariant, not a measurement
  ```
  Loosening an `intent` threshold is a musical-correctness decision — it needs a by-ear/theory look, not a quiet nudge.

- **`// measured:`** — an empirically-CALIBRATED floor below observed engine delivery, with the headroom argument inline (what the engine delivers, the random baseline, the resulting headroom). Example:
  ```ts
  expect(chordToneRatio).toBeGreaterThan(0.5); // measured: engine delivers ~0.62; random baseline 0.33; floor 0.50 leaves ~0.12 headroom
  ```
  Loosening a `measured` threshold means either the engine regressed or the original calibration was wrong — it needs a re-measurement and a fresh headroom justification, not a quiet nudge.

This applies to new and modified range assertions going forward — it is not a mandate to retrofit the ~750 existing assertions in one pass.

## Patterns proven

> **Old engine, deleted (#1404).** Most of these patterns were first proven on the worker-based generator (soloist, bass, drum and groove engines, the conductor, the coordination context, `playback.currentLoopCount`). All of it is gone. Each pattern below is kept only where it is still true of `band/`, and cites `band/` code. Where the old carrier is mentioned it is history.

### Engine-knows-where-it-is (form-aware selection)

When an engine should shape its output by musical structure (phrase position, section position, chorus, role), derive the structural fact in the layer that already knows it and hand it down; don't re-derive it at the picker.

- In `band/`, the arrangement layer (`band/arrange/`, `band/form/`) owns the structure. `arrange/cycle.ts` decides which chorus of the solo arc a bar is in (`SectionVisit.chorus`), and `players/lead/form.ts`'s arc turns that into what a solo phrase slot is asked to do (how busy, how high, whether it is the peak).
- The picker (`players/lead/idiom.ts`, `players/lead/line.ts`) reads what it was handed and does not look the structure up again.
- **Tune to a musical sweet spot, not a statistical one.** A bias strong enough to make a tight statistical gap often sounds robotic (a response phrase that always lands on the root). A weaker, reliably directional bias keeps the musical variability. Confirmed in the May 2026 phrase-end and SRDC work.
- **Multi-trial reliability check before locking in thresholds.** A band take is deterministic, so one run settles a seed, but a claim that sweeps seeds or styles still deserves a few runs before its range is fixed.

### Coordination between lanes

The old coordination context (a producer-ordered carryover struct, with an order test) is gone. The band does it by construction: `performPass` (`band/perform.ts`) is a pure function over the score's timeline, and a lane that needs another lane's output takes it as an argument rather than reading the other lane's internals. Keep that rule: a consumer never reaches into a producer's private state.

### Loop-awareness

The old recipe read `playback.currentLoopCount` per tick; that field and the conductor that maintained it are deleted. In `band/` the pass is part of the input: `arrange/cycle.ts` hands each lane the pass and the bar's chorus, so the head, the solos and the trades follow the chart's counted choruses, and `band/arrange/choruses.test.ts` checks that a looped chart and a counted one give the same arc. A "does it vary across passes" test drives `performPass` over a counted chart and compares passes; it asserts direction-agnostic divergence, not "pass 2 has more X than pass 0". Put a cap/scale formula in a small exported helper so its boundary table is unit-testable apart from the integration.

### Dual-gate activation

When a new behavior fires on a step the active style doesn't normally play (a chromatic anticipation on a half-beat in a quarter-note style), the step has to be activated AND the pitch overridden. A pitch-only gate on a step the style skipped fires zero times. The pattern holds for any engine where an activation predicate gates a separate value selector: verify both gates fire before assuming the behavior is wired up.

### Weighted choice and bias placement

The final-stage `weight *= mult` rule was proven on the old additive weight pickers (`getBassNote`, the soloist picker), where many bonuses pushed the same direction and scaling one of them got washed out (additive multiplier: 0pt phase gap; final-stage multiplier: 30pt+). `band/` has no such picker today: its choices are `rng.weighted([...])` tables (`pickApproach` in `band/players/bass/line.ts`, the shape tables in `band/players/lead/idiom.ts`) and the voicing `cost` function (`band/players/comp/voicing.ts`). The lesson still applies if a weight is ever built from several additive terms: apply a new bias as a last-stage multiplier. In a `weighted` table, change the table's own weights; in `cost`, the weight on the term is the knob.

### Register slots

Each lane keeps to a register slot, and the slot is data the picker is checked against, not a comment: the bass lane's `BASS_SLOT_HI` in `band/players/bass/line.ts`, the keyboard comp's `KEYS` slot in `band/players/comp/voicing.ts` (where `cost` charges any note outside `lo`..`hi` and pulls the top voice toward `top`). The invariant suite in `band/test/invariants/` holds every style to its lane ranges; `docs/design/band-engine.md` lists the slots.

### Determinism via `rng(seed, ...keys)`

For any variation that should be reproducible (motif rotation, voicing choice, ornaments), draw from `rng(...key)` in `band/core/random.ts`, never `Math.random()` or a hand-rolled hash. Inside a style or player, use `ctx.rng(purpose, scope)`.

- The stream is keyed on where the decision is in the music (seed, lane, bar, purpose), never on how many draws came before. Regenerating bar 40 gives the same answer whether or not bars 0 to 39 ran, and a new decision in one idiom cannot reshuffle another's.
- The stream is mulberry32 behind an FNV-based `hashKey`, so adjacent integer seeds are well distributed. Never write `(seed * X + Y) % Z` directly; it sawtooths on small seeds.
- Every structural input that should produce a different result gets a slot in the key (section, bar, lane, purpose). Leaving the lane out makes two lanes lock together.
- When a clamped value could go either way (an octave shift), derive the direction from headroom (`midi > 60 ? -12 : +12`), not a coin flip. It avoids "direction-of-divergence" test flakiness.

## When the audit doc says one thing and the code says another

The audit docs (`docs/audit/<area>.md`) are smart but not omniscient. Recurring failure modes when implementing from an audit doc:

- **Layer mismatch** — the recipe names a file/line but the actual signal lives elsewhere (seed-time when the signal is per-tick; pitch-engine when the gate is at the dispatcher). Trace the signal to its actual home before implementing.
- **Premise breaks under review** — the recipe is logically sketched but the engine's gate set, runtime path, or coordination plumbing doesn't match the recipe's assumptions. ~60% P0 rate during the May 2026 cycle came from this. Always run the reviewer; budget for premise-fix patches.
- **"Document or fix" hides a load-bearing musical decision** — a P2 doc-pass item ("undocumented gate at line X") can require a dispatcher-level musical-design call to literally satisfy its acceptance criterion. The Epic 8 S5 case: lowering the named floor required also dropping a Jazz carve-out at a different file to honor the audit's "ballad-intensity jazz/blues" language.
- **Implementer's out-of-scope observations are gold** — when a sub-agent flags adjacent issues ("I noticed 3 more undocumented thresholds at lines X/Y/Z but they're out of scope"), file them on the GitHub tracker (`brndnsh-labs/Ensemble`) as `finding`/`backlog` issues immediately. Two times during the audit, these flagged items became the next session's most valuable work.

See [[feedback-audit-doc-premise-breaks]] and [[feedback-audit-doc-layer-mismatch]] for the matched-pair memory entries.
