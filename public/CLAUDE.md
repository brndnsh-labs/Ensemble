# public/ — state, worker bridge, controllers

Since #1358 `public/` is a library, not an app: the v2 music stand (`prototypes/v2`) compiles it
through the `@engine/*` alias, and `prototypes/v2/lib/runtime.ts` is its one main-thread host.
The main-thread plumbing layer: `state.ts` + the `state/*.ts` family — the `deepSignal`
slices plus the non-slice plumbing that sits beside them (`state/state-effects.ts`,
`state/state-hydration.ts`, `state/history.ts`, `state/persistence.ts`,
`state/share-codec.ts`) — `worker-client.ts`, the `controllers/*.ts` family
(`controllers/app-controller.ts`, `controllers/arranger-controller.ts`,
`controllers/instrument-controller.ts`, …), and
`config.ts`. Only the slice files are exempt from `npm run check-mutations`; the
plumbing dispatches like any other consumer. For the worker's
message *schema*, see `docs/guides/WORKER_CONTRACT.md`; for the generative engines
themselves, see `public/engine/CLAUDE.md`. This file is the traps that don't fit either.

**Write ownership:** `songbook/state-ownership.ts`'s `STATE_OWNERSHIP_MANIFEST` classifies every
top-level field as `document`/`preferences`/`runtime-derived` for persistence — and, per
`docs/design/write-ownership.md`, that classification doubles as a write rule: a `document`/
`preferences` field is written only by UI dispatch or hydration, never by a runtime system
(conductor, trade block, worker). See that doc's precedent list (`conductorVelocity`,
`tradeSilenced`, `isInstrumentActiveAtStep`) before adding a new dispatch site that touches an
existing document field from an engine/conductor path.

## Worker sync

1. **A `syncWorker(ACTION, payload)` call is only real if `ACTION` has a `case` in the
   delta `switch` in `worker-client.ts`.** Actions with no case (`SET_TIME_SIGNATURE`,
   `SET_GROUPING`) fall through to an empty `data` object and the
   `Object.keys(data).length > 0` guard means **nothing is posted** — a subscriber-forwarded
   `syncWorker('SET_TIME_SIGNATURE', …)` in the v2 runtime's dispatch subscriber
   (`initialize()` in `prototypes/v2/lib/runtime.ts`) is a silent no-op. That's why `refreshArrangerUI()` (`arranger-controller.ts`) ends with a **bare**
   `syncWorker()` — no action arg — which ships a full `getSyncState()` snapshot (so does the
   v2 runtime's `rebuild()`). That call
   is load-bearing, not redundant belt-and-suspenders: delete it (or "dedupe" it against the
   subscriber) and the worker keeps generating over the old progression/meter until stop→play.
   Before touching any `syncWorker` call site, grep the action's `case` in the switch first —
   an action that *does* have a delta case (e.g. `SET_GENRE_FEEL`) makes a manual duplicate
   call genuinely safe to drop; one that doesn't, isn't.

2. **A new field on any `build*SyncPayload` snapshot builder (`state.ts`) must be classified
   in `WORKER_SYNC_MANIFEST`** (`tests/unit/engine/worker-sync-reachability.test.ts`) as either
   `{ delta: '<ACTION>' }` (a live `syncWorker()` delta case actually carries it) or
   `{ snapshotOnly: '<reason>' }`. The test fails loudly on anything unclassified — that's the
   intended tripwire for the half-update class of bug (a field that reaches the worker at
   playback-start via the full snapshot but never updates again on change).

3. **An instrument's `voice` (`chords.voice`, `bass.voice`, …) is main-thread-audio-routing-only
   by default and does NOT cross to the worker** — the audio source resolves at play time in
   `synth-*.ts`. It only needs to cross if a voice starts affecting *note generation itself*
   (e.g. the crunch pack's power-chord reduction inside `tick-logic.ts`) — see the
   `chords.voice` precedent (`getSyncState()` snapshot field + `SET_INSTRUMENT_VOICE` delta
   case) before wiring a new voice-dependent generation path for another lane; it will not be
   synced by default. Gate worker-side logic on the voice **string**, never `isPackLoaded` —
   the worker holds no decoded sample buffers, so any loaded-check is permanently false there.

4. **`flushBuffers()` (`instrument-controller.ts`) reads `getSyncState()` synchronously at the
   moment it's called** and ships it as the worker's `FLUSH` message, which the worker uses to
   *immediately, synchronously* refill its lookahead buffer. Call-site ordering relative to the
   state mutation it should reflect is load-bearing: call it before `dispatch()` /
   `validateAndAnalyze()` and it primes the buffer from the *old* state — and a `syncWorker()`
   called afterward does **not** fix this, because a bare `SYNC_STATE` patches the mirrored
   slices in place without re-triggering `resetCursors()`/`fillBuffers()`. The correct order,
   matching `refreshArrangerUI()`: mutate state → `validateAndAnalyze()` → `syncWorker()` →
   `flushBuffers()`. Any call site that both mutates arranger/chords/bass/etc. state and calls
   `flushBuffers()` must follow that order, not "mutate, flush, resync after."

5. **`WORKER_MSG.FLUSH`'s "Centralized Reset Phase"** (`resetSoloistState` /
   `resetBassState` / `clearHarmonyMemory` / `resetCompingState` in `logic-worker.ts`) runs on
   **every** flush, not just a new song — and `flushBuffers()` fires mid-song on ordinary user
   actions (genre change, instrument/style change, per-lane toggle). Any change to what a reset
   ritual touches has live mid-song behavioral consequences, not just an offline/new-song one —
   trace whether `FLUSH` reaches the thing you're resetting before assuming it's a fresh-start
   concern only.

6. **`recursiveSafeSync` (`engine/worker-utils.ts`, called from `logic-worker.ts`) DEEP-MERGES
   object-valued synced fields into the worker's existing mirror in place** — it replaces arrays
   and scalars wholesale but recurses
   into plain objects, mutating the *same* worker-side object rather than swapping in the fresh
   one from the main thread. So after a mid-play change regenerates an object field (e.g. the
   soloist session seed on a key/tempo change), the worker's copy has **new contents but the same
   object identity**. Any cache keyed on that identity — a `WeakMap<seed, …>`, an
   `if (obj === lastObj)` guard — is therefore a silent staleness bug: the key is reference-equal,
   so the cache serves the *old* digest against the *new* contents, and it only manifests after a
   live change (never at playback-start, never in a fresh-object unit test). Fix: stamp a **content
   token** into the object at generation time (a djb2/content hash — `seedId` on `SoloistSessionSeed`
   is the precedent) and key/validate the cache on that token, not on object identity. This bit the
   #1157 Q&A-hang digest cache; the regression guard is `tests/unit/engine/qa-hang-digest-cache.test.ts`,
   which mutates a seed **in place** to reproduce what the deep-merge does. When adding any
   identity-keyed cache over a synced object field, assume its identity is stable across content
   changes and reach for a content token instead.

## Effects & reactivity (`state/state-effects.ts`)

7. **Any side effect on the global dispatch subscriber (`handleEffects`) fires on every single
   dispatch.** During playback the auto-conductor (`autoIntensity`, default ON) dispatches
   `SET_BAND_INTENSITY` / `UPDATE_CONDUCTOR_DECISION` / `UPDATE_HB` roughly every step while an
   intensity ramp is in flight (driven from `scheduler-core.ts`'s per-step
   `scheduleGlobalEvent`). A **debounced** effect hung off `handleEffects` gets its timer reset
   on every one of those and never settles until the ramp ends — starved, not just deferred.
   The persistence save (`debounceSaveState`) already solves this with a denylist
   (`TRANSIENT_PERSIST_ACTIONS` at the top of `state-effects.ts`) — persist-by-default, with the
   high-frequency per-step actions explicitly excluded. Any *new* debounced/coalesced subscriber
   effect needs its own equivalent exclusion list; don't assume the persistence denylist covers
   it, since it's scoped to "does this change a persisted field," not "is this high-frequency."
   `playback.step` itself is not a dispatch (`// @direct-mutation` in `scheduler-core.ts`), so
   it's the conductor's ramp dispatches to watch for, not the tick.

8. **Audio-up side effects belong on `initAudio()` (`engine.ts`), not on the
   `ACTIONS.INIT_AUDIO` dispatch.** Since #1358 nothing dispatches `ACTIONS.INIT_AUDIO` at all
   (v1's Sounds panel was its only dispatcher); only its `state-effects.ts` case remains. Every
   way audio comes up — the scheduler (`scheduler-core.ts`), the v2 runtime's `toggle()` and
   `audition()` — calls `initAudio(state)` directly. Anything that must run
   "whenever audio is live" (e.g. pack loading, #666) has to hook `initAudio()` itself, gated
   `if (!usingOfflineContext && playback.audio)` so offline render/export contexts are excluded
   — wiring it into the `INIT_AUDIO` case means it never runs.

## Practice loop / step framing (`section-overrides.ts`, `practice-controller.ts`)

9. **The worker consumes a monotonic absolute `step`** — it buckets notes by `n.step` and its
   per-instrument buffer-head bookkeeping only ever advances forward. Section-practice looping
   (`foldPracticeStep` in `engine/section-overrides.ts`) therefore does **not** wrap
   `playback.step` itself; it folds only the *musical* position (`chord`/`section` lookups,
   drum step) into `[loopStartStep, loopEndStep)` while every lane-buffer consumer keeps using
   the raw monotonic `step` as its map key. If you touch this path, keep the two variables
   (`step` the key, `musicalStep`/folded value the music) distinct — collapsing them back into
   one desyncs the worker's buffer heads. `foldPracticeStep` is the identity function whenever
   no loop is active (`loopStartStep < 0`), which is what keeps normal (non-looping) playback
   byte-for-byte unchanged.

10. **A new live-audio-handle field on any state slice (`GainNode`, a voice handle closing over
    the live `AudioContext`) must be nulled in *both* offline-render clone hosts**, not just
    declared: `audio-export.ts`'s `cloneStateForRender` and `scripts/mix-report.ts`'s inline
    clone. Both spread the whole slice then explicitly null the known handle fields
    (`lastHatGain`/`lastRideGain`/`lastCrashGain` on `groove`; `activeChordVoices`/`lastChordKey`
    on `playback`). A new handle rides through the spread un-nulled and its first
    choke/ramp during an offline render pokes a **live-context** node — usually silent (the
    choke's try/catch swallows the `InvalidStateError`), so nothing crashes, it's just a stale
    cross-context reference. When adding a live-handle field, grep an existing one on that slice
   to enumerate every reset site and add the new field at each.

## Build identity and build-time flags

11. **There is no version constant in `public/`.** `APP_VERSION`/`BUILD_REV` and their
    `__APP_VERSION__`/`__BUILD_REV__` defines went with v1 (#1358). The deployed build is named
    by the v2 export's `/build.json` (`sourceRevision`, written by
    `prototypes/v2/scripts/offline.mjs`), which is what the CI `deploy` job asserts on each host.

12. **`import.meta.env` does not distinguish dev from prod in this layer.** The v2 build defines
    it as the constant `{ MODE: 'test', DEV: false }` (`prototypes/v2/next.config.mjs`), and
    Vitest supplies its own. Gate code that must not ship on a `NEXT_PUBLIC_*` flag instead,
    read from the v2 host where Next inlines it — the precedent is `NEXT_PUBLIC_RENDER_BRIDGE`,
    which `lib/runtime.ts` checks before dynamically importing `lib/render-bridge.ts`, so a
    production build drops the branch and the module. Before gating out an existing branch,
    grep every consumer of what it installs (e.g. `window.ensemble`), or a prod path reaching
    through the same global goes silently dead.

## Product-identity constraint on this layer

13. **Ensemble is "a fancy metronome at its core"** — stable, predictable time is a load-bearing
    product promise (the practicing-musician persona mutes their own instrument and plays along;
    it cannot lock to a reference that moves). Any change that destabilizes tempo/timing by
    default — anywhere in this layer's transport/BPM path (`app-controller.ts` `setBpm`,
    `playback` slice) — needs to ship **opt-in**, not default-on, even when it makes the band
    sound more human. Tempo breathing (#1010) is the standing design in this space and is
    **still parked** — if it ships it must be opt-in and off during practice. No
    expressive-timing toggle exists today, so there is **no prior art** here to cite: don't
    read this constraint as "we already ship opt-in tempo drift."

## Config-semantics changes

14. **Changing what a config value *means*** (units, scaling, denomination — e.g. the BPM-unit
    change for compound meters) **must migrate authored data in the same commit, not just code.**
    Grep `data/`, `prototypes/v2/lib/starters.ts` and any `presets.ts`/`fixtures.ts`/`defaults.ts`
    for the changed field; a
    built-in preset's numeric value was tuned under the *old* interpretation and critique tests
    won't catch a stale one (they drive their own BPM). This bit the compound-meter S1 migration
    for a full ~10 hours of downstream work before it was heard: code was migrated everywhere,
    the one built-in compound-meter preset (`chord-presets.ts`) wasn't, and it played 1.5× too
    fast. Schedule an explicit listen-test on any user-visible preset whose defaults depend on
    the changed semantics.
