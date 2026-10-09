# public/ — state, controllers, voices

Since #1358 `public/` is a library, not an app: the v2 music stand (`prototypes/v2`) compiles it
through the `@engine/*` alias, and `prototypes/v2/lib/runtime.ts` is its one main-thread host.
The main-thread plumbing layer: `state.ts` + the `state/*.ts` family — the `deepSignal`
slices plus the non-slice plumbing that sits beside them (`state/state-effects.ts`,
`state/state-hydration.ts`, `state/history.ts`, `state/share-codec.ts`) — the `controllers/*.ts` family
(`controllers/app-controller.ts`, `controllers/arranger-controller.ts`,
`controllers/instrument-controller.ts`, …), and
`config.ts`. Only the slice files are exempt from `npm run check-mutations`; the
plumbing dispatches like any other consumer. For the voices and the audio graph, see
`public/engine/CLAUDE.md`; the band engine that plays them is `band/`. This file is the traps
that don't fit either. (The old engine's logic worker and its sync contract are gone, #1404;
`docs/archive/WORKER_CONTRACT.md` keeps them for history.)

**Write ownership:** `songbook/state-ownership.ts`'s `STATE_OWNERSHIP_MANIFEST` classifies every
top-level field as `document`/`preferences`/`runtime-derived` for persistence — and, per
`docs/design/write-ownership.md`, that classification doubles as a write rule: a `document`/
`preferences` field is written only by UI dispatch or hydration, never by a runtime system
(conductor, trade block, worker). See that doc's read-time composition precedent
(`isInstrumentActiveAtStep`) and its retired violations (§5) before adding a new dispatch site
that touches an existing document field from an engine/conductor path.

## Effects & reactivity (`state/state-effects.ts`)

7. **Any side effect on the global dispatch subscriber (`handleEffects`) fires on every single
   dispatch**, and so does the band's own settings sync (`syncBand`). Playback no longer
   dispatches per chord — the stand reads the playhead straight off the runtime each frame
   (`playheadSlot`, #1240) — but a **debounced** effect hung off `handleEffects` still gets its
   timer reset by every dispatch in a burst: starved, not just deferred. A *new* debounced/
   coalesced subscriber effect needs an exclusion list for the high-frequency actions. v1's session save solved it
   that way (a `TRANSIENT_PERSIST_ACTIONS` denylist) until it was deleted with v1's load/save
   layer (#1424); nothing debounced hangs off `handleEffects` today.

8. **Audio-up side effects belong on `initAudio()` (`engine.ts`), never on a dispatched
   action.** `ACTIONS.INIT_AUDIO` (v1's Sounds panel was its only dispatcher) and its
   `state-effects.ts` case were deleted in #1381 — nothing dispatched it since #1358. Every
   way audio comes up — the v2 runtime's `toggle()` and `audition()`, and the offline export —
   calls `initAudio(state)` directly. Anything that must run
   "whenever audio is live" (e.g. pack loading, #666) has to hook `initAudio()` itself, gated
   `if (!usingOfflineContext && playback.audio)` so offline render/export contexts are excluded.

## Offline-render clones

10. **A new live-audio-handle field on any state slice (`GainNode`, a voice handle closing over
    the live `AudioContext`) must be nulled in the offline-render clone**, not just declared:
    `export/detached-generation-state.ts`'s `cloneStateForDetachedGeneration`, which the band's
    WAV export and the listening-gate tools render from (`prototypes/v2/lib/band-export.ts`). It
    spreads the whole slice then explicitly nulls the known handle fields
    (`lastHatGain`/`lastRideGain`/`lastCrashGain` on `groove`; `heldNotes` on `playback`).
    Sampled voices are not on a slice at all: `sample-voice.ts` keeps them per audio context
    (#1530), so an offline render's are its own. A new handle rides through the spread un-nulled and its first
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
    won't catch a stale one (they drive their own BPM) — a missed preset plays at the wrong
    speed and is only found by ear. Schedule an explicit listen-test on any user-visible preset whose defaults depend on
    the changed semantics.
