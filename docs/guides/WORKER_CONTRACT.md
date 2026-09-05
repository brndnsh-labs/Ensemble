# Ensemble: Worker-Client Communication Contract

Ensemble offloads live musical generation to `logic-worker.ts` and gives every MIDI export a fresh one-shot `midi-export-worker.ts` realm. This document defines both worker boundaries.

Source of truth: message constants and TypeScript envelopes live in `public/worker-types.ts`, and register slotting lives in `public/engine/coordination-engine.ts`.

## Architectural Overview

*   **Main Thread (`worker-client.ts`)**: Orchestrates the live worker lifecycle and creates/terminates one-shot MIDI export workers.
*   **Live Worker (`logic-worker.ts`)**: Maintains a partial mirror of application state and generates musical events (Bass, Soloist, Accompaniment) ahead of time.
*   **MIDI Export Worker (`midi-export-worker.ts`)**: Receives one detached generation snapshot, owns `ExportProcessor` in a fresh module realm, and terminates after completion or error. It never shares live worker queues or singleton engine memory.

## Message Types (Main → Worker)

### `start`
Starts the worker's internal timer for periodic buffer filling.
```json
{ "type": "start" }
```

### `stop`
Stops the worker's internal timer.
```json
{ "type": "stop" }
```

### `syncState`
Synchronizes the worker's internal state with the global state. Supports partial updates.
```json
{
  "type": "syncState",
  "data": {
    "arranger": { ... },
    "chords": { ... },
    "bass": { ... },
    "soloist": { ... },
    "harmony": { ... },
    "groove": { ... },
    "playback": { ... },
    "midi": { ... }
  }
}
```

`midi` is a first-class synced slice — `getSyncState()` ships `buildMidiSyncPayload(midi)` and the worker applies it via `recursiveSafeSync(midi, data.midi, 'midi')` in both its `syncState` and `flush` handlers. It was missing from this list until #1259; see rule 8 for the four config fields deliberately held back from the payload.

### `requestBuffer`
Explicitly requests the worker to fill the musical buffers for a specific step.
```json
{
  "type": "requestBuffer",
  "data": {
    "step": 128,
    "requestTimestamp": 123456789.0
  }
}
```

### `flush`
Clears all internal buffers and primes the engine for a specific step. Used during genre switches or transport restarts.
```json
{
  "type": "flush",
  "data": {
    "step": 0,
    "syncData": { ... },
    "requestTimestamp": 1709234567.89
  }
}
```

### `resolution`
Requests a generated ending or resolution figure for the given step.
```json
{
  "type": "resolution",
  "data": {
    "step": 128,
    "requestTimestamp": 123456789.0
  }
}
```

## Dedicated MIDI Export Protocol

`startExport()` does not post to the live logic worker. It snapshots the current session with
`cloneStateForDetachedGeneration()`, creates a fresh module worker, and sends one request:

```json
{
  "type": "startExport",
  "data": {
    "state": { "playback": { ... }, "arranger": { ... } },
    "options": {
      "includedTracks": ["chords", "bass", "soloist", "harmonies", "drums"],
      "targetDuration": 3,
      "loopMode": "time",
      "filename": "my-song"
    }
  }
}
```

A repeat request terminates the prior export worker before creating the next one. Completion,
reported export errors, and uncaught worker errors all terminate and release the active worker.

## Message Types (Worker → Main)

### `notes`
Returns a list of generated notes to be scheduled by the audio engine.
```json
{
  "type": "notes",
  "notes": [
    {
      "module": "bass",
      "step": 0,
      "freq": 440.0,
      "midi": 69,
      "velocity": 0.8,
      "durationSteps": 4,
      "timingOffset": 0.01
    }
  ],
  "requestTimestamp": 123456789.0,
  "workerProcessTime": 1.5
}
```

### `tick`
Heartbeat message sent periodically by the worker's timer.

### `exportProgress` (MIDI export worker only)
Reports export progress as a normalized `0.0-1.0` value.
```json
{
  "type": "exportProgress",
  "progress": 0.42
}
```

### `exportComplete` (MIDI export worker only)
Returns the generated MIDI file as a `Uint8Array`.
```json
{
  "type": "exportComplete",
  "blob": Uint8Array,
  "filename": "song.mid"
}
```

### `error`
Reports an internal worker error.
```json
{
  "type": "error",
  "data": "Error message",
  "stack": "..."
}
```

## Worker Lifecycle & Cursor Reset

1. **Initial mirror state**: On the first message, the worker adopts `getState()` as its local mirror if `workerContext.state` is still null.
2. **Incremental sync**: `syncState` mutates the worker-local slices in place rather than rebuilding all hidden generative state from scratch.
3. **Hard reset path**: `flush` is the authoritative reset. It can apply sync data, resets cached cursors, sets all buffer heads to the requested step, clears soloist/bass/harmony/comping memory, and immediately refills buffers.
4. **Cursor invariant**: `resetWorkerContext(step)` sets `bbBufferHead`, `sbBufferHead`, `cbBufferHead`, and `hbBufferHead` to `step`, then zeroes both `mainCursor` and `lookaheadCursor`.

## Responsibility Split

- `public/worker-client.ts` posts live `WORKER_MSG.*` messages, routes `WORKER_RESP.*`, and separately owns the `MIDI_EXPORT_MSG.*` lifecycle.
- `public/logic-worker.ts` translates live messages into sync, reset, buffer-fill, and resolution work.
- `public/midi-export-worker.ts` translates one detached export request into progress/completion/error responses.
- `public/engine/worker-buffer-manager.ts` handles lookahead fill orchestration.
- `public/engine/tick-logic.ts` generates per-step musical data and applies coordination/register slotting before notes leave the worker.
- `public/engine/scheduler-core.ts` is deliberately main-thread only: it consumes generated note events and schedules playback, but it is not the worker's source of truth for note generation.

## Synchronization Rules

1.  **Step Mapping**: Both threads must use the same `arranger.stepMap`, `arranger.sectionMap`, and `totalSteps` to ensure harmonic and structural alignment.
2.  **Lookahead**: The worker targets a `LOOKAHEAD` of 64 steps (typically 4 measures in 4/4) to prevent buffer underruns during CPU spikes.
3.  **Generative Drum Parity**: To ensure MIDI exports match live playback, the worker utilizes the shared `applyGrooveOverrides` strategy. This ensures that intensity-aware ghost notes, turnaround fills, and per-voice drum micro-timing are identical in both environments. Drums schedule exactly on the grid in both environments (#1063 — see `docs/design/timing-model.md`).
4.  **Flush resets caches**: `flush` is the only message that resets cursors, buffer heads, and per-engine memory before immediately refilling buffers.
5.  **Musical Coordination**: The worker enforces the `ENSEMBLE_COORDINATION.md` contract using a centralized `CoordinationContext`. To allow for rhythmic yielding, instruments MUST be generated in the following order: Soloist -> Bass -> Chords -> Harmony.
6.  **Register Slotting Enforcement**: All generated notes MUST be wrapped in `enforceRegisterSlotting(module, midi, context)` before being returned to the main thread. The live slotting contract is Bass 23-57, Chords/Harmony 52-84, and Soloist free range at or above 52 with a 60-90 priority clamp only when it would otherwise fall below the chord floor.
7.  **Worker-Owned Scratch Subtrees**: Some fields on synced slices are written **only inside the worker** against its local copy of the signal tree, marked `// @worker-mutation`. These subtrees are deliberately omitted from `getSyncState()` in `public/state.ts` so the worker's writes survive subsequent `syncState` messages. Do not add a worker-owned subtree to `getSyncState()` without a worker→main round-trip plan — doing so will clobber in-flight worker state on every dispatch.

    Current worker-owned scratch (audited 2026-05-16):
    - `soloist.session.phrasing.isResting` — the live phrase-first engine's breath flag, written each tick (`// @worker-mutation`) by `getSoloistNotePhraseFirst` in `public/engine/soloist-phrase-first.ts` and published to the coordination context so bass/chords/harmony know whether the lead is resting. (Before epic #10 this slot documented `currentPhrase.context.*` written by the legacy `soloist.ts` engine, now retired.)
    - `soloist.session.memory.*`, `bass.session.memory.*`, `harmony.session.memory.*` — per-engine working memory (hook retention, motif history, voicing recency). Generator-local; never round-tripped.

    The structural defense is two-part: (a) `getSyncState()` explicitly omits these subtrees from the snapshot it ships, and (b) the worker's apply helper `recursiveSafeSync` in `public/engine/worker-utils.ts` iterates `for (const key in source)` — keys absent from the incoming payload are not touched on the worker, so locally-written scratch survives. Either invariant breaking silently corrupts in-flight phrase/motif state. If a worker-owned field ever needs to be visible to the main thread (e.g. for a UI readout of current SRDC phase), use an explicit `WORKER_RESP.*` message back to main, not the sync channel.

8.  **Main-Thread-Only Synced Fields**: A synced field can be shipped in the full snapshot for symmetry without having a delta-sync case if no worker code reads it. Once a field gains a worker-side reader, add its delta in the same change. `arranger.seed` now drives bass emission directly in the worker (#1139), so `SET_SONG_SEED` sends the current seed as an arranger delta. Main-thread-derived soloist seeds and drum orchestration/fills/accents still cross through their own `UPDATE_SB` / `UPDATE_GB` cases. The delta updates future generation; it does not retroactively replace already-buffered notes.

    The `midi` slice is the third: `buildMidiSyncPayload` ships the channels, octave offsets, `latency`, `velocitySensitivity` and `enabled`, but deliberately holds back `selectedOutputId`, `selectedInputId`, `inputEnabled` and `muteLocal` — device routing and local-audio muting are main-thread concerns (`controllers/midi-controller.ts`, `engine/engine.ts`, `engine/midi-scheduler.ts`), and the worker holds no `MIDIAccess`. `midi.outputs` / `midi.inputs` are excluded for a different reason again: they are a *mirror of live hardware enumeration*, rebuilt by `syncMIDIOutputs`/`syncMIDIInputs` from the controller's `midiAccess`, so they are neither persisted nor part of any reset's inverse (#1259).

    **`RESET_STATE` is boot-only by contract.** It has no delta case in `syncWorker()`'s switch, so a `RESET_STATE` dispatched after `initWorker()` posts nothing and leaves the worker generating over the entire pre-reset chart. Today that is safe because its only two production dispatch sites are in `state/state-hydration.ts`, which runs at `main.ts:36` — well before `initWorker()`. It now resets ~18 worker-synced fields, so if you ever wire it to a "New Session" control, follow it with `flushBuffers()`, **not** a bare `syncWorker()`: per rule 4 only `flush` resets cursors and buffer heads, which is exactly what a reset needs. Don't add a partial `case 'RESET_STATE'` delta — the correct payload for a reset is the whole snapshot plus a cursor reset.

    A further example: `playback.chartLocked` is pure UI state (controls whether the chord chart renders the inline editor) — read only by main-thread components (`ChartSurface.tsx`, `ChordVisualizer.tsx`, `GlobalShortcuts.tsx`, `state-effects.ts`) and intentionally excluded from `getSyncState().playback`. The `SET_CHART_LOCKED` action does **not** need a delta case in `syncWorker()`; if a future engine change ever reads `chartLocked` worker-side, add both the snapshot field and the delta in the same commit.
