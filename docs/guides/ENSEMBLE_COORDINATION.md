# Musical Coordination Contract

## Unified Coordination State
A single `CoordinationContext` object must be passed to every note generator per step. This context contains vital flags necessary for global coordination:
*   `soloistBusy`: Indicates if the soloist is actively playing a dense or prominent phrase.
*   `accompanimentHit`: Indicates if the accompaniment (chords/keys) is striking a chord on the current step.
*   `kickHit`: Indicates if the kick drum is striking on the current step.
*   `pocketOffset`: Provides micro-timing adjustments for swing or groove feel.

## Strict Register Slotting
To ensure a clean mix and avoid harmonic masking, instruments are strictly assigned to specific MIDI note ranges:
*   **Bass:** Claims MIDI 23 to 57 (Expanded 5-String Range). This is subdivided into a "Three-Lane" model:
    *   **Sub-Basement (23-35):** The deep pocket for Neo-Soul, Dub, and Reggae.
    *   **The Meat (36-47):** The standard home for Rock, Funk, and Pop (low E/A strings).
    *   **The Attic (48-57):** Reserved for high-intensity fills and melodic peaks, restricted by downward gravity algorithms.
*   **Chords:** Restricted to MIDI 52 to 84. A hard "Musical Firewall" prevents Chords and Harmonies from ever bleeding below MIDI 52 to ensure the Bass has exclusive ownership of the low-end spectrum.
*   **Harmony:** Dynamically evaluates the Chords and Soloist averages before selecting an inversion to avoid clashing.
*   **Soloist:** Has free range across the keyboard, but priority is given in the MIDI 60 to 90 range.

## Rhythmic Yielding Hierarchy
Instruments must yield to each other rhythmically to maintain a clear arrangement:
*   **Priority:** Top priority goes to the Groove (Drums) and the Soloist.
*   **Bass:** Yields melodic complexity to the Soloist but strictly locks its rhythm to the Kick drum.
*   **Chords:** Yield density to the Soloist (playing sparser voicings or comping less frequently when the soloist is busy).
*   **Harmony:** Yields to all other instruments, filling in only when space allows. **As of v2.36**, the Harmony section also performs **Thematic Reinforcement**: during the song's Head (Loop 0), it proactively "shadows" the soloist's seeded melody by providing reinforcement stabs on anchor points, strengthening the thematic hook.