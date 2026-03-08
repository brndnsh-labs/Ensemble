# Musical Coordination Contract

## Unified Coordination State
A single `CoordinationContext` object must be passed to every note generator per step. This context contains vital flags necessary for global coordination:
*   `soloistBusy`: Indicates if the soloist is actively playing a dense or prominent phrase.
*   `accompanimentHit`: Indicates if the accompaniment (chords/keys) is striking a chord on the current step.
*   `kickHit`: Indicates if the kick drum is striking on the current step.
*   `pocketOffset`: Provides micro-timing adjustments for swing or groove feel.

## Strict Register Slotting
To ensure a clean mix and avoid harmonic masking, instruments are strictly assigned to specific MIDI note ranges:
*   **Bass:** Claims MIDI 28 to 51.
*   **Chords:** Restricted to MIDI 52 to 84 when Bass is present.
*   **Harmony:** Dynamically evaluates the Chords and Soloist averages before selecting an inversion to avoid clashing.
*   **Soloist:** Has free range across the keyboard, but priority is given in the MIDI 60 to 90 range.

## Rhythmic Yielding Hierarchy
Instruments must yield to each other rhythmically to maintain a clear arrangement:
*   **Priority:** Top priority goes to the Groove (Drums) and the Soloist.
*   **Bass:** Yields melodic complexity to the Soloist but strictly locks its rhythm to the Kick drum.
*   **Chords:** Yield density to the Soloist (playing sparser voicings or comping less frequently when the soloist is busy).
*   **Harmony:** Yields to all other instruments, filling in only when space allows.