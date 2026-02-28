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
| **Latin** | Clave Integrity | 100% (No entropy on snare) |



| **Acoustic**| Melodic Smoothness | <12.0 semitones |
| **Acoustic**| Note Density | 2.0-14.0 notes/bar |
| **Bossa Nova**| Melodic Smoothness | <12.0 semitones |
| **Bossa Nova**| Note Density | 2.0-14.0 notes/bar |
| **Country** | Melodic Smoothness | <12.0 semitones |
| **Country** | Note Density | 2.0-14.0 notes/bar |
| **Disco** | Melodic Smoothness | <12.0 semitones |
| **Disco** | Note Density | 3.0-16.0 notes/bar |
| **Funk** | Melodic Smoothness | <12.0 semitones |
| **Funk** | Note Density | 3.0-16.0 notes/bar |
| **Hip Hop** | Melodic Smoothness | <14.0 semitones |
| **Hip Hop** | Note Density | 2.0-14.0 notes/bar |
| **Metal** | Melodic Smoothness | <14.0 semitones |
| **Metal** | Note Density | 3.0-22.0 notes/bar |
| **Minimal** | Melodic Smoothness | <12.0 semitones |
| **Minimal** | Note Density | 0.5-10.0 notes/bar |
| **Neo-Soul**| Melodic Smoothness | <14.0 semitones |
| **Neo-Soul**| Note Density | 2.0-14.0 notes/bar |
| **Reggae**| Melodic Smoothness | <14.0 semitones |
| **Reggae**| Note Density | 2.0-14.0 notes/bar |
| **Rock/Scalar**| Melodic Smoothness | <14.0 semitones |
| **Rock/Scalar**| Note Density | 2.0-16.0 notes/bar |
| **Shred** | Melodic Smoothness | <14.0 semitones |
| **Shred** | Note Density | 4.0-24.0 notes/bar |
| **Ska-Punk**| Melodic Smoothness | <14.0 semitones |
| **Ska-Punk**| Note Density | 2.0-14.0 notes/bar |

| **Acoustic**| Melodic Smoothness | <12.0 semitones |
| **Acoustic**| Note Density | 2.0-14.0 notes/bar |
| **Bossa Nova**| Melodic Smoothness | <12.0 semitones |
| **Bossa Nova**| Note Density | 2.0-14.0 notes/bar |
| **Country** | Melodic Smoothness | <12.0 semitones |
| **Country** | Note Density | 2.0-14.0 notes/bar |
| **Disco** | Melodic Smoothness | <12.0 semitones |
| **Disco** | Note Density | 3.0-16.0 notes/bar |
| **Funk** | Melodic Smoothness | <12.0 semitones |
| **Funk** | Note Density | 3.0-16.0 notes/bar |
| **Metal** | Melodic Smoothness | <14.0 semitones |
| **Metal** | Note Density | 3.0-22.0 notes/bar |
| **Minimal** | Melodic Smoothness | <12.0 semitones |
| **Minimal** | Note Density | 0.5-10.0 notes/bar |
| **Neo-Soul**| Melodic Smoothness | <14.0 semitones |
| **Neo-Soul**| Note Density | 2.0-14.0 notes/bar |
| **Reggae**| Melodic Smoothness | <14.0 semitones |
| **Reggae**| Note Density | 2.0-14.0 notes/bar |
| **Rock/Scalar**| Melodic Smoothness | <14.0 semitones |
| **Rock/Scalar**| Note Density | 2.0-16.0 notes/bar |
| **Shred** | Melodic Smoothness | <14.0 semitones |
| **Shred** | Note Density | 4.0-24.0 notes/bar |
| **Ska-Punk**| Melodic Smoothness | <14.0 semitones |
| **Ska-Punk**| Note Density | 2.0-14.0 notes/bar |

## Adding a New Genre

When adding a new smart genre, you MUST create a corresponding critique test:
1.  **Drums**: Check backbeat, kick patterns, and hi-hat pulse.
2.  **Bass**: Check register, pulse, and melodic motion.
3.  **Accompaniment**: Check rhythmic stabs/pads and voicing richness.
4.  **Soloist**: Check smoothness, chord tone resolution, and stylistic inflections.
