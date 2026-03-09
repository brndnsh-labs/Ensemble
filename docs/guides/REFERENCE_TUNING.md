# Reference Comparison & Velocity Tuning

This document tracks specific reference recordings used to calibrate the Ensemble engine's velocity maps and micro-timing.

## Jazz-Funk
**Reference Track:** *Cantaloupe Island* - Herbie Hancock (1964)
- **Target Feel:** Straight 8ths but laid back. Solid, repetitive bass anchor.
- **Velocity Goals:**
    - **Bass:** Consistent mezzo-forte (0.7 - 0.8) on downbeats. Ghost notes on syncopations (0.3 - 0.4).
    - **Drums:** Tight hi-hats (0.5 - 0.6). Kick drum should be punchy (0.85) but not overpowering. Snare backbeats sharp (0.9).

## Reggae
**Reference Track:** *Redemption Song* (Band Version) / *One Love* - Bob Marley
- **Target Feel:** Heavy "One Drop" or "Rockers". Bass carries the melody.
- **Velocity Goals:**
    - **Bass:** Deep, sustaining notes. Velocity fairly consistent (0.8), relying on duration for expression. Low-pass filter focus.
    - **Kick:** "One Drop" on beat 3 must be heavy (0.9 - 1.0).
    - **Hi-Hat:** Crisp, short, consistent chunks (0.6).
    - **Guitar/Keys Skank:** Short, staccato, medium velocity (0.5 - 0.6).

## Neo-Soul
**Reference Track:** *Untitled (How Does It Feel)* - D'Angelo
- **Target Feel:** Drastically "behind the beat".
- **Velocity Goals:**
    - **Kick:** Soft, felt more than heard (0.6 - 0.7).
    - **Snare:** Sharp rimshot (0.8) with very soft ghost notes (0.2).
    - **Hi-Hat:** Loose, varying velocities (0.4 - 0.7).

---

## DSP Filter Profiles

### Bass Engine
- **Funk/Pop Thumb:** Velocity > 1.1 triggers "Pop" mode.
- **Filter Cutoff:** Base 1000Hz, decaying to 800Hz (Pop) or 500Hz (Normal).
- **Resonant Peak:** 1800Hz (Q: 1.5, Gain: 5) for character without nasal resonance.
- **Reggae Dub:** Low-shelf at 100Hz (+2dB) for weight.

### Piano Engine
- **Attack Transient:** 1200Hz - 2000Hz noise strike.
- **Harmonic Body:** Filter depth reduced to 2400Hz to eliminate digital harshness.

## Current Calibration Log

### [Date: 2026-01-14]
- **Status:** Initial calibration completed.
- **Action:** 
    - **Funk:** Reduced Bass "One" velocity to 0.85, Ghost notes to 0.35. Tamed Hi-Hat accents to 1.0.
    - **Reggae:** Clamped Dub Bass to ~0.8. Reduced Skank velocity to ~0.5.
    - **Neo-Soul:** Applied 0.75x global velocity dampener to drums.
- **Next Steps:** Listen to output and verify against reference tracks.

### [Date: 2026-01-15]
- **Status:** v2.0 Codebase Health Audit completed.
- **Action:**
    - **Global:** Implemented intensity-brightness mapping. `playback.bandIntensity` now modulates filter cutoffs for Chords and Bass, providing more dynamic timbral range.
    - **Rock/Pop:** Refactored `accompaniment.js` with "Expressive Phrasing" pools. Piano cells now adapt to intensity and soloist activity (Call & Response).
    - **Performance:** Verified stability with "Emergency Lookahead" and "Logic Latency" monitoring.
    - **Verification:** 346 tests passing, including new stress tests for congestion and continuity.

### [Date: 2026-01-18]
- **Status:** Expanded Drum Synthesis (Toms & Latin Percussion).
- **Action:**
    - **Agogo Bells:** Reduced master volume from 0.5 to 0.35 to prevent mix congestion. Implemented multi-oscillator stack (Sine + Triangle + Body Sine) for authentic "ping".
    - **Toms:** Implemented High (180Hz), Mid (135Hz), and Low (90Hz) variations using dual-layer synthesis (Body Sine + Stick Square).
    - **Bossa Smart Genre:** Implemented procedural 16th-note Shaker layer (accents on quarters) and intensity-driven Guiro/Tom surdo accents.
    - **Verification:** 433 tests passing (added Template Integrity suite for fills).

### [Date: 2026-01-19] (Update)
- **Status:** Harmony Voicing Refinement & Compatibility.
- **Action:**
    - **Neo-Soul:** Refactored Quartal stack logic to be scale-aware. Specifically avoiding the natural 11th (interval 5) when a Major 3rd is present in the chord to adhere to the "Avoid Note" rule.
    - **Rock/Metal:** Implemented "Hendrix Chord" (7#9) awareness. Harmonies now explicitly avoid the natural 5th over altered dominant chords to prevent harmonic clashes.
    - **Global:** Implemented defensive semitone-clash filtering. All background harmony notes are now automatically filtered against fundamental chord tones to prevent harsh dissonances while preserving valid musical tensions.
    - **Verification:** 739 tests passing (implemented Harmony-Chord Compatibility Audit for all library presets).

### [Date: 2026-01-20]
- **Status:** Melody Harmonizer & Audio Workbench.
- **Action:**
    - **Harmonizer:** Implemented a symbolic "Loop-Back Training" system (`HarmonizerTrainer`). The engine now builds a note-likelihood matrix by querying the Soloist's scale logic for every chord quality. This ensures harmonized progressions align with the band's repertoire.
    - **Audio Analysis:** Added monophonic pitch extraction to `audio-analyzer-lite.js` with frequency decimation for performance.
    - **UI Integration:** Consolidated analysis tools into a unified "Audio Workbench" modal with a mode-toggle interface.
    - **Verification:** 743 tests passing (added unit tests for Harmonizer scoring logic and diatonic integrity).

### [Date: 2026-01-26] (Pro-Level Sprint)
- **Status:** Performance, Mixing, and Musicality Overhaul.
- **Action:**
    - **Performance:** Implemented high-resolution "Logic Latency" monitoring. Round-trip worker communication is now tracked, with warnings triggered if processing exceeds 50ms.
    - **Mixing:** Automated "Intensity-Aware Mixing". Reverb sends and master compression now dynamically adapt to `bandIntensity` (see new Rules section below).
    - **Soloist:** Enhanced phrasing to prioritize "Guide Tones" (3rds and 7ths) on the downbeat of section changes to improve musical flow during transitions.
    - **UX:** Implemented "Painting" mode for the Drum Sequencer and a spacious 2-column settings layout for desktop.
    - **Verification:** 724 tests passing (100% pass rate after architectural decoupling).

---

## Intensity-Aware Mixing Rules

To maintain professional mix clarity, the engine now modulates the signal chain based on the `ctx.bandIntensity` signal (0.0 - 1.0).

### Reverb (Space)
- **Low Intensity (0.0 - 0.3):** Ambient focus. Reverb sends increased to **0.4 - 0.6** to create an "airy" and expansive atmosphere.
- **High Intensity (0.7 - 1.0):** Clarity focus. Reverb sends automatically "dry out" to **0.1 - 0.3** to prevent mix mud during climaxes and complex drum fills.
- **Bias:** Drums are kept 30% dryer than the average; Soloist is kept 20% wetter.

### Compression (Glue)
- **Threshold:** Scales from **-0.5dB** (low intensity) down to **-2.0dB** (high intensity) to catch peaks.
- **Ratio:** Scales from **12:1** up to **20:1** to "glue" the band together as the energy increases.
- **Attack/Release:** Fast attack (2ms) and medium release (500ms) to ensure punch without pumping artifacts.

