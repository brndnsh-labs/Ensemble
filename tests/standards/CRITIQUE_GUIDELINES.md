# Musical Critique Guidelines

Critique tests are a specialized tier of testing in Ensemble designed to evaluate the "musicality" and "authenticity" of generative performances. Unlike unit tests which check for logical correctness, critique tests simulate long performances (typically 128 measures) and analyze the statistical distribution of musical events.

## Core Principles

1.  **Statistical Benchmarking**: Measure the frequency and quality of genre-specific markers (e.g., Charleston rhythm in Jazz, "The One" in Funk).
2.  **Authenticity Targets**: Define acceptable ranges for musicality metrics rather than exact binary matches.
3.  **Holistic Simulation**: Simulate the engine's state over time to capture phrase-level and section-level behaviors (SRDC, coordination, etc.).
4.  **Expert Feedback**: Output a readable "Critique Report" in the test logs to provide immediate qualitative feedback to developers.

## Test Components

### 1. The Simulation Loop
Run a loop over a significant number of bars (e.g., 128) using different intensities and complexities.
```javascript
for (let i = 0; i < totalSteps; i++) {
    const notes = getEngineNotes(...);
    // Record metrics...
}
```

### 2. Standard Metrics

*   **Pulse Consistency**: The percentage of primary beats where the instrument correctly grounds the rhythm.
*   **Melodic Smoothness**: The average interval jump (in semitones) between consecutive notes.
*   **Harmonic Resolution**: The percentage of notes that resolve to chord tones (1, 3, 5, 7) at structural boundaries.
*   **Rhythmic Economy**: Density of notes per bar and the ratio of "ghost notes" to primary accents.
*   **Genre Markers**: Presence of specific stylistic signatures (e.g., Clave in Latin, Skank in Reggae, Dilla Lag in Neo-Soul).

## Target Thresholds (Blueprints)

| Genre | Key Metric | Target |
| :--- | :--- | :--- |
| **Jazz** | Charleston Frequency | >70% |
| **Jazz** | Melodic Smoothness | <7.5 semitones |
| **Funk** | "The One" Solidity | 100% |
| **Funk** | Ghost Note Density | 10-35% |
| **Reggae** | "One Drop" Silence | >70% silence on Beat 1 |
| **Latin** | Clave Integrity | 100% (No entropy on snare) |
| **Neo-Soul**| Timing Offset | >90% delayed hits (>10ms) |

## Adding a New Genre

When adding a new smart genre, you MUST create a corresponding critique test:
1.  **Drums**: Check backbeat, kick patterns, and hi-hat pulse.
2.  **Bass**: Check register, pulse, and melodic motion.
3.  **Accompaniment**: Check rhythmic stabs/pads and voicing richness.
4.  **Soloist**: Check smoothness, chord tone resolution, and stylistic inflections.
