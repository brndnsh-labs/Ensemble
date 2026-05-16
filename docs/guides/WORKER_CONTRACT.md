# Ensemble: Worker-Client Communication Contract

Ensemble offloads heavy musical generation and MIDI processing to a background Web Worker (`logic-worker.ts`). This document defines the message schema and synchronization logic between the Main Thread and the Worker.

Source of truth: message constants live in `public/worker-types.ts`, and register slotting lives in `public/engine/coordination-engine.ts`.

## Architectural Overview

*   **Main Thread (`worker-client.ts`)**: Orchestrates the worker lifecycle, dispatches state updates, and requests note generation.
*   **Worker (`logic-worker.ts`)**: Maintains a partial mirror of the application state and generates musical events (Bass, Soloist, Accompaniment) ahead of time.

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
    "playback": { ... }
  }
}
```

### `requestBuffer`
Explicitly requests the worker to fill the musical buffers for a specific step.
```json
{
  "type": "requestBuffer",
  "data": { "step": 128 },
  "requestTimestamp": 123456789.0
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

### `export`
Triggers a MIDI file generation process.
```json
{
  "type": "export",
  "data": {
    "includedTracks": ["chords", "bass", "soloist", "harmonies", "drums"],
    "targetDuration": 3,
    "loopMode": "time",
    "filename": "my-song"
  }
}
```

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

### `exportProgress`
Reports export progress as a normalized `0.0-1.0` value.
```json
{
  "type": "exportProgress",
  "progress": 0.42
}
```

### `exportComplete`
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

- `public/worker-client.ts` posts `WORKER_MSG.*` messages and routes `WORKER_RESP.*` back to the main thread.
- `public/logic-worker.ts` translates those messages into sync, reset, buffer-fill, resolution, and export work.
- `public/engine/worker-buffer-manager.ts` handles lookahead fill orchestration.
- `public/engine/tick-logic.ts` generates per-step musical data and applies coordination/register slotting before notes leave the worker.
- `public/engine/scheduler-core.ts` is deliberately main-thread only: it consumes generated note events and schedules playback, but it is not the worker's source of truth for note generation.

## Synchronization Rules

1.  **Step Mapping**: Both threads must use the same `arranger.stepMap`, `arranger.sectionMap`, and `totalSteps` to ensure harmonic and structural alignment.
2.  **Lookahead**: The worker targets a `LOOKAHEAD` of 64 steps (typically 4 measures in 4/4) to prevent buffer underruns during CPU spikes.
3.  **Generative Drum Parity**: To ensure MIDI exports match live playback, the worker utilizes the shared `applyGrooveOverrides` strategy. This ensures that intensity-aware ghost notes, turnaround fills, and pocket timing offsets are identical in both environments.
4.  **Flush resets caches**: `flush` is the only message that resets cursors, buffer heads, and per-engine memory before immediately refilling buffers.
5.  **Musical Coordination**: The worker enforces the `ENSEMBLE_COORDINATION.md` contract using a centralized `CoordinationContext`. To allow for rhythmic yielding, instruments MUST be generated in the following order: Soloist -> Bass -> Chords -> Harmony.
6.  **Register Slotting Enforcement**: All generated notes MUST be wrapped in `enforceRegisterSlotting(module, midi, context)` before being returned to the main thread. The live slotting contract is Bass 23-57, Chords/Harmony 52-84, and Soloist free range at or above 52 with a 60-90 priority clamp only when it would otherwise fall below the chord floor.
7.  **Worker-Owned Scratch Subtrees**: Some fields on synced slices are written **only inside the worker** against its local copy of the signal tree, marked `// @worker-mutation`. These subtrees are deliberately omitted from `getSyncState()` in `public/state.ts` so the worker's writes survive subsequent `syncState` messages. Do not add a worker-owned subtree to `getSyncState()` without a worker→main round-trip plan — doing so will clobber in-flight worker state on every dispatch.

    Current worker-owned scratch (audited 2026-05-16):
    - `soloist.session.currentPhrase.context.*` — phrase metadata derived during plan-build (`role`, `responseSource`, `sectionLabel`, `sectionOccurrence`, `srdcState`). Written by `preparePhraseResponseContext` in `public/engine/soloist.ts`, read by `public/engine/soloist-pitch-engine.ts` within the same worker tick.
    - `soloist.session.memory.*`, `bass.session.memory.*`, `harmony.session.memory.*` — per-engine working memory (hook retention, motif history, voicing recency). Generator-local; never round-tripped.

    The structural defense is two-part: (a) `getSyncState()` explicitly omits these subtrees from the snapshot it ships, and (b) the worker's apply helper `recursiveSafeSync` in `public/engine/worker-utils.ts` iterates `for (const key in source)` — keys absent from the incoming payload are not touched on the worker, so locally-written scratch survives. Either invariant breaking silently corrupts in-flight phrase/motif state. If a worker-owned field ever needs to be visible to the main thread (e.g. for a UI readout of current SRDC phase), use an explicit `WORKER_RESP.*` message back to main, not the sync channel.
