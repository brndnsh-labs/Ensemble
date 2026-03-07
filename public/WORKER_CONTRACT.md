# Ensemble: Worker-Client Communication Contract

Ensemble offloads heavy musical generation and MIDI processing to a background Web Worker (`logic-worker.js`). This document defines the message schema and synchronization logic between the Main Thread and the Worker.

## Architectural Overview

*   **Main Thread (`worker-client.js`)**: Orchestrates the worker lifecycle, dispatches state updates, and requests note generation.
*   **Worker (`logic-worker.js`)**: Maintains a partial mirror of the application state and generates musical events (Bass, Soloist, Accompaniment) ahead of time.

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
    "primeSteps": 32,
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

## Synchronization Rules

1.  **Step Mapping**: Both threads must use the same `arranger.stepMap`, `arranger.sectionMap`, and `totalSteps` to ensure harmonic and structural alignment.
2.  **Lookahead**: The worker targets a `LOOKAHEAD` of 64 steps (typically 4 measures in 4/4) to prevent buffer underruns during CPU spikes.
3.  **Priming**: During a `flush` operation, the worker can "prime" the engine by simulating multiple measures of playback to establish musical context (e.g., updating `bass.lastFreq`).
4.  **Generative Drum Parity**: To ensure MIDI exports match live playback, the worker utilizes the shared `applyGrooveOverrides` strategy. This ensures that intensity-aware ghost notes, turnaround fills, and pocket timing offsets are identical in both environments.
