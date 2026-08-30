# The write-ownership invariant — runtime must not write document-owned fields

**Status:** design ratified August 2026 (#1069). Three violations of this law shipped and were
fixed before it was written down (#1062, #1064); this doc closes the gap by giving the pattern
those fixes already used a name, so the next contributor recognizes the shape of the mistake
before shipping it a fourth time.

**Provenance:** distilled from the #1062 (soloist trade) and #1064 (conductor density/complexity)
incident pair. `public/songbook/state-ownership.ts`'s `STATE_OWNERSHIP_MANIFEST` is an exhaustive,
`satisfies`-guarded classification of every top-level state field as `document`, `preferences`, or
`runtime-derived` — but it governs **persistence** only (what gets saved, shared, and round-tripped
through a share URL). Until now nothing constrained who may **write** a field, and the manifest's
classification was silently trusted to imply a write rule it never actually stated.

## 1. The law

> A `document`- or `preferences`-owned field is written **only** by user intent — a UI dispatch or
> hydration. Runtime systems never write it. Runtime modulation lives in a paired
> `runtime-derived` field and is combined at **read** time.

A `document` field (persisted, share-URL encoded — `chords.density`, `harmony.complexity`,
`soloist.enabled`) or a `preferences` field (persisted, device-local) represents a decision the
*user* made. Nothing about a conductor tick, a trade-block boundary, or an intensity ramp is user
intent, no matter how musically justified the modulation is — so none of those systems may ever
be the writer of record for a `document`/`preferences` field. If a runtime system needs to shift
the *effective* value of one of those fields during playback, it publishes its own opinion onto a
sibling `runtime-derived` field, and the code that actually consumes the value (a generation
engine, a scheduler read) composes the two — typically `runtime ?? document` or a boolean AND —
at the point of use.

This is deliberately the same shape as `docs/design/timing-model.md`'s law for the timing domain:
**one authority per domain; differential or inaudible**. That document says a band-global timing
shift must be expressed as a differential against the grid, never as a raw additive term smeared
across every tier. This document says the same thing about *ownership*: a runtime opinion about a
document field must be expressed as a differential (a paired runtime field, composed at read
time) against the user's own value, never as a direct overwrite of it. See §4 for how the two laws
compose in a single call path.

## 2. Why an overwrite is the wrong shape, not just an inconvenience

Every one of the three violations below looked, in isolation, like the obvious way to modulate a
setting a runtime system needed to move: dispatch the same action a user-facing control would
dispatch, straight onto the field the slider/toggle also writes. That shape has two failure modes,
both real, both shipped:

- **Persistence corruption.** `document` fields flow through `debounceSaveState`
  (`state-effects.ts`) by default (deny-listed only for known-transient actions) and are encoded
  into share URLs. A runtime overwrite that lands between two user actions gets saved and shared
  as if the user had chosen it — the user's own setting is gone the next time they reload or a
  friend opens their share link.
- **Read-modify-write races with the user's own dispatch.** A runtime system ticking every step
  or every section boundary competes with the user's toggle/slider for the same field. Whichever
  fires last wins, non-deterministically from the user's point of view — flipping a toggle back on
  can be silently undone by the next conductor tick.

A paired `runtime-derived` field structurally cannot cause either failure: it is never saved
(`runtime-derived` fields are excluded from every persistence/share codec by the ownership
manifest), and it is a different memory cell than the one the user's dispatch writes, so there is
no race to lose.

## 3. Live inventory — correct precedent

- **`playback.conductorVelocity`** (`state/playback.ts`, published by `applyConductor` in
  `engine/conductor.ts`) — the conductor's own runtime-derived velocity multiplier. Never
  assigned onto a lane's own volume/velocity field. `scheduler-core.ts` reads it directly at the
  scheduling call sites (`baseVel = (velocity || 1.0) * (playback.conductorVelocity || 1.0)`,
  three separate read sites) — composition happens exactly once, at the point where a note's
  final velocity is computed, never upstream of it.
- **`section.targetIntensity`** (`songbook/types.ts`, read via `getSectionOverride` in
  `engine/section-overrides.ts`) — a read-only input to the conductor's per-tick `stepSize`
  targeting (`conductor.ts`). The conductor reads a section's authored override to decide how
  hard to close the gap toward it; it never writes the override back. The only writer is the
  arranger controller's unlocked-mode slider (`arranger-controller.ts`), i.e. user intent.
- **`isInstrumentActiveAtStep`** (`engine/section-overrides.ts`) — the single authority every
  generation path (`scheduler-core.ts`, `worker-buffer-manager.ts`, `drums-tick.ts`,
  `groove-engine.ts`, `harmonies.ts`, `accompaniment.ts`, `synth-drums.ts`) calls to decide
  whether a lane sounds on a given step. It layers a per-section override, and (since #1062) the
  soloist trade block's `tradeSilenced`, over the slice's own `enabled` — composed inside this one
  function, at read time. No caller ever needs to know the field is layered; no writer ever
  touches `enabled` to express the layering.
- **The Intensity slider's `disabled={autoIntensity}`** (`components/InstrumentRail.tsx`) — the
  UI-layer sibling of the same law. When the conductor owns intensity (`autoIntensity` is on), the
  manual `bandIntensity` slider is disabled rather than being silently driven out from under the
  user's fingers; `bandIntensity` itself is never written by the conductor. The conductor's
  own opinion lives in `playback.bandIntensity`'s *runtime* path (driven by
  `SET_BAND_INTENSITY`/`UPDATE_CONDUCTOR_DECISION`, not a document field) precisely because
  intensity itself is `runtime-derived` in the ownership manifest, not `document` — there is
  nothing here for the conductor to overwrite. The UI still models the ownership boundary
  explicitly, which is the reusable pattern: make it structurally impossible for two authorities
  to reach for the same field at the same time.

## 4. Composition with the timing-model law

A runtime system routinely needs to **read** across domains — the soloist reads
`playback.conductorVelocity` (ownership domain) *and* `getBandPocket` (timing domain) in the same
note-generation call. That's fine: reading is not the hazard either law cares about. What neither
law permits is a system in one domain **assigning into** another domain's user-owned field to
express its opinion:

- `docs/design/timing-model.md` forbids a runtime system writing a uniform time shift onto the
  grid or onto every lane's `timingOffset` — its opinion must land as a tier-2/tier-3 differential,
  composed at schedule time.
- This document forbids a runtime system writing its opinion onto a `document`/`preferences`
  field — its opinion must land as a paired `runtime-derived` field, composed at read time.

Put together: **a runtime system may read from as many domains as it needs, but it may only ever
write into its own runtime-derived output, never into another domain's — or another owner's —
field.** The two laws are the same shape (one authority per domain, expressed as a differential)
applied to two different axes of "domain": *when* something plays, and *who* is allowed to decide
a setting's value.

## 5. Retired violations (fixed — do not re-introduce)

Both incidents below shipped the overwrite shape from §2, were caught, and were fixed by
introducing exactly the paired-field pattern this document now names. They are recorded here as
the shape of the mistake to recognize, not as open work.

### #1062 — the soloist trade block wrote `soloist.enabled`

**Wrong pattern:** the trade-in/trade-out block in `checkSectionTransition` (`engine/conductor.ts`)
flipped the user's own `soloist.enabled` (a `document` field, persisted and share-URL encoded)
directly via `ACTIONS.UPDATE_SB`, then called `saveCurrentState()` synchronously — so every trade
boundary during Trade mode overwrote and persisted the user's manual enable/disable choice.
Reloading, or opening a share link captured mid-trade, could silently restore the soloist to
whatever trade happened to leave it in, not what the user last chose.

**Fixed pattern:** a new `runtime-derived` field, `soloist.tradeSilenced`
(`state-ownership.ts`, `types.ts`), that the trade block toggles instead — `enabled` is never
touched again. `isInstrumentActiveAtStep` composes `tradeSilenced` with `enabled` at read time
(§3), "mirroring how `playback.conductorVelocity` combines with a lane's volume without ever
being assigned onto it" (from the fix's own commit message). `tradeSilenced` resets on stop
(`scheduler-core.ts`'s `togglePlay`) and whenever `tradeMode` returns to manual, and crosses to
the worker via the sync manifest so the worker's own generation gates respect it too. No
`saveCurrentState()` call remains in the trade block — there is nothing persisted left to flush.

### #1064 — the conductor wrote `chords.density` and `harmony.complexity`

**Wrong pattern:** `applyConductor` (`engine/conductor.ts`) computed a target chord density and
harmony complexity from the current band intensity and dispatched them straight onto
`chords.density` and `harmony.complexity` — both `document`-owned, persisted, and shareable —
via `UPDATE_CONDUCTOR_DECISION` and `UPDATE_HB`. Every intensity-ramp tick during playback
clobbered the user's own density/complexity choice, the same failure shape as #1062 one field
class up.

**Fixed pattern:** two new `runtime-derived` fields, `playback.conductorDensity` and
`playback.conductorHarmonyComplexity` (`state-ownership.ts`, `state/playback.ts`), that
`applyConductor` publishes instead — mirroring the already-shipped `conductorVelocity`
precedent (§3) exactly. The generation readers (`chords-engine.ts`, `harmonies.ts`) compose the
two at read time via `?? ` fallback to the document field: the conductor's opinion wins while
present, the user's authored value is what's left when it isn't. The instrument reducer no longer
writes `chords.density` for `UPDATE_CONDUCTOR_DECISION`, and `UPDATE_HB`'s generic pass-through
now explicitly excludes `complexity`.

Both fixes are merged on `main`; a quick grep of `state-ownership.ts` confirms `tradeSilenced`,
`conductorDensity`, and `conductorHarmonyComplexity` are all still classified `runtime-derived`,
and neither original write site (the trade block's direct `enabled` flip, `applyConductor`'s
direct `density`/`complexity` dispatch) remains in `conductor.ts`.

## 6. How to apply this

When a runtime system needs to modulate a `document`- or `preferences`-owned field during
playback:

1. **Never dispatch onto the existing field.** If the field a slider/toggle writes is
   `document`/`preferences` in `STATE_OWNERSHIP_MANIFEST`, that field's only legitimate writers are
   the UI dispatch and state hydration.
2. **Add a sibling `runtime-derived` field** for the runtime system's own opinion
   (`playback.conductorVelocity` / `conductorDensity` / `conductorHarmonyComplexity`,
   `soloist.tradeSilenced` are the worked precedents). Classify it in
   `STATE_OWNERSHIP_MANIFEST` immediately — the `satisfies` guard fails typecheck until you do.
3. **Compose at the read site**, not upstream of it: the one place the value actually gets used
   (a generation engine, `isInstrumentActiveAtStep`, a scheduler velocity computation) is where
   the runtime field and the document field combine — `runtime ?? document`, a boolean AND
   (`enabled && !tradeSilenced`), or a multiplier, depending on the field's shape. Every other
   reader keeps calling the same function/reading the same composed value; nothing upstream needs
   to know the field is layered.
4. **If the field is worker-relevant, wire the new field through the worker-sync manifest** like
   any other synced scalar (see `public/CLAUDE.md` § Worker sync) — a runtime-derived field the
   worker needs to gate its own generation on is exactly as real a sync requirement as the
   document field it composes with.
5. **Grep `STATE_OWNERSHIP_MANIFEST` before adding a new dispatch site that touches an existing
   field** — if the target field is already `document`/`preferences` and the writer isn't a UI
   component or `state-hydration.ts`, that's the smell this document exists to catch.

There is currently no static gate enforcing this — it is prose ratification only (tracked
separately as a possible follow-up: a reducer-scanning check that a `document`/`preferences`
field's write sites are limited to UI dispatch + hydration). Until such a gate exists, catching a
violation is a code-review discipline: ask "is the field being written here `document` or
`preferences` in the manifest, and if so, is this write site a UI dispatch or hydration?" for any
new write onto an existing state field from an engine/conductor/worker path.
