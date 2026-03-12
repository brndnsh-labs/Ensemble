# Musical Critique Guidelines

Critique tests are a specialized tier of testing in Ensemble designed to evaluate the "musicality" and "authenticity" of generative performances. Unlike unit tests which check for logical correctness, critique tests simulate long performances (typically 128 measures) and analyze the statistical distribution of musical events.

## Core Principles

1.  **Statistical Benchmarking**: Measure the frequency and quality of genre-specific markers (e.g., Charleston rhythm in Jazz, "The One" in Funk).
2.  **Authenticity Targets**: Define acceptable ranges for musicality metrics rather than exact binary matches.
3.  **Holistic Simulation**: Simulate the engine's state over time to capture phrase-level and section-level behaviors (SRDC, coordination, etc.).
4.  **Expert Feedback**: Output a readable "Critique Report" in the test logs to provide immediate qualitative feedback to developers.

## Advanced Rhythmic Metrics

With the implementation of the **Unified Timing Grid (v2)**, several advanced metrics are now enforced:

-   **One Drop Accuracy**: For Reggae, verifies Kick/Snare alignment strictly on Beat 3 and silence on Beat 1.
-   **Pocket Width (Dilla Lag)**: For Neo-Soul and Hip Hop, measures the millisecond delta between the rushed Hi-Hats and the dragged Snare.
-   **Slap & Pop Ratio**: For Funk, ensures high-velocity octave "pops" occur with a frequency proportional to intensity.
-   **2-Bar Clave Integrity**: For Bossa Nova, verifies that 2-bar sidestick patterns (3-2 or 2-3) remain stable across bar boundaries.
-   **Loping Consistency**: For Blues and Jazz, ensures the 8th-note shuffle follows the weighted `[1.5, 0.5, -0.5, -1.5]` distribution.

## Target Thresholds (Blueprints)

| Genre | Key Metric | Target |
| :--- | :--- | :--- |
| **Jazz** | Charleston Frequency | >70% |
| **Jazz** | Melodic Smoothness | <7.5 semitones |
| **Bossa Nova** | Clave Integrity | 100% (Stable 2-bar cycle) |
| **Reggae** | One Drop Accuracy | >80% Silence on Beat 1 |
| **Neo-Soul** | Snare Drag | >0.010s average lag |
| **Funk** | Octave Pop Freq | >0.3 jumps/bar at high intensity |
| **Acoustic** | Note Duration | >2.5 steps (Resonant sustain) |
| **Metal** | Double Kick Density | >70% 16th note kick presence |
| **Ska-Punk** | 8th Note Density | >90% (Walking/Skanking pulse) |

## Adding a New Genre

When adding a new smart genre, you MUST create a corresponding critique test:
1.  **Drums**: Check backbeat, kick patterns, and hi-hat pulse.
2.  **Bass**: Check register, pulse, and melodic motion.
3.  **Accompaniment**: Check rhythmic stabs/pads and voicing richness.
4.  **Soloist**: Check smoothness, chord tone resolution, and stylistic inflections.
