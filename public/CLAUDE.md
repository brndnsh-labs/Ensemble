# public/ — state, worker bridge, controllers

The main-thread plumbing layer: `state.ts` + `state/*.ts` slices, `state-effects.ts`,
`state-hydration.ts`, `worker-client.ts`, `app-controller.ts`, `arranger-controller.ts`,
`instrument-controller.ts`, `history.ts`, `persistence.ts`, `config.ts`. For the worker's
message *schema*, see `docs/guides/WORKER_CONTRACT.md`; for the generative engines
themselves, see `public/engine/CLAUDE.md`. This file is the traps that don't fit either.

## Worker sync

1. **A `syncWorker(ACTION, payload)` call is only real if `ACTION` has a `case` in the
   delta `switch` in `worker-client.ts`.** Actions with no case (`SET_ARRANGEMENT`,
   `SET_TIME_SIGNATURE`, `SET_GROUPING`) fall through to an empty `data` object and the
   `Object.keys(data).length > 0` guard means **nothing is posted** — a subscriber-forwarded
   `syncWorker('SET_TIME_SIGNATURE', …)` in `main.ts`'s dispatch-forwarding is a silent
   no-op. That's why `refreshArrangerUI()` (`arranger-controller.ts`) ends with a **bare**
   `syncWorker()` — no action arg — which ships a full `getSyncState()` snapshot. That call
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

## Effects & reactivity (`state-effects.ts`)

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
   `ACTIONS.INIT_AUDIO` dispatch.** `dispatch(ACTIONS.INIT_AUDIO)` fires from exactly one place
   (`PacksSettings.tsx`'s `ensureAudio()`, opening the Sounds panel) and is handled by exactly
   one `state-effects.ts` case. Every other way audio comes up — the play path
   (`scheduler-core.ts`), preview (`main.ts`), performance mode, audio recovery — calls
   `initAudio(state)` directly and never touches that dispatch. Anything that must run
   "whenever audio is live" (e.g. pack loading, #666) has to hook `initAudio()` itself, gated
   `if (!usingOfflineContext && playback.audio)` so offline render/export contexts are excluded
   — wiring it only into the `INIT_AUDIO` case means it silently never runs unless the user
   happens to open Settings first.

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

## Persistence / versioning

11. **App version display is build-time, not hand-maintained.** `config.ts`'s `APP_VERSION`
    reads `typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'` — a Vite `define`
    injects the real CalVer + git-REV literal at build time; the `typeof` guard exists because
    Vitest doesn't apply Vite's `define`, and a bare reference to the global would throw across
    the whole suite (`config.ts` is imported repo-wide). Don't hand-bump a version constant here.

12. **The build REV is dirty-aware** (`vite.config.ts` `computeBuildRev()`): a clean tree
    stamps the bare short SHA; a dirty tree stamps `<head>-<sig>` where `<sig>` hashes
    `git diff HEAD` + the porcelain list, so a redeploy of uncommitted work is distinguishable
    from the last one. When verifying a test/prod deploy landed, check the **printed Built
    REV** the deploy script echoes back out of `dist/index.html`, not bare `git rev-parse HEAD`
    — the latter only matches a clean tree.

## Gating dev-only code

13. **Gate main-thread code that must not ship to prod on `import.meta.env.DEV`, not
    `import.meta.env.MODE`.** `npm run build` runs `vite build --mode test`, so `MODE === 'test'`
    in the *production* bundle too — a `MODE`-gated branch ships live. `DEV` is `true` under the
    Playwright e2e dev server and `false` under `vite build`, so a `DEV`-gated branch (e.g.
    `installE2EGlobals()` in `main.ts`) is fully tree-shaken out of the prod bundle, imports
    included. Before gating out an existing branch as "dev-only," grep every consumer of what it
    installs — a prod code path that reaches through the same global (e.g.
    `window.ensemble?.dispatch`) would go silently dead if you cut the branch without giving prod
    its own direct import.

## Product-identity constraint on this layer

14. **Ensemble is "a fancy metronome at its core"** — stable, predictable time is a load-bearing
    product promise (the practicing-musician persona mutes their own instrument and plays along;
    it cannot lock to a reference that moves). Any change that destabilizes tempo/timing by
    default — anywhere in this layer's transport/BPM path (`app-controller.ts` `setBpm`,
    `playback` slice) — needs to ship **opt-in**, not default-on, even when it makes the band
    sound more human. The one shipped precedent (tempo breathing, #1010) is gated behind an
    explicit "Expressive timing" toggle, off during practice.

## Config-semantics changes

15. **Changing what a config value *means*** (units, scaling, denomination — e.g. the BPM-unit
    change for compound meters) **must migrate authored data in the same commit, not just code.**
    Grep `data/` and any `presets.ts`/`fixtures.ts`/`defaults.ts` for the changed field; a
    built-in preset's numeric value was tuned under the *old* interpretation and critique tests
    won't catch a stale one (they drive their own BPM). This bit the compound-meter S1 migration
    for a full ~10 hours of downstream work before it was heard: code was migrated everywhere,
    the one built-in compound-meter preset (`chord-presets.ts`) wasn't, and it played 1.5× too
    fast. Schedule an explicit listen-test on any user-visible preset whose defaults depend on
    the changed semantics.
