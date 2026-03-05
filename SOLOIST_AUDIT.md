# Soloist Engine Tuning & Phrasing Audit

## 1. Identified Irregularities & Root Causes

### A. Jazz (Bird Style) "Dead Air"
- **Symptom:** At high intensity (0.8), the soloist sometimes rests for 3+ measures.
- **Root Cause:** 
    - **Entry Windowing:** The "Realistic Phrase Starts" logic (lines 960-990) restricts re-entry to the Downbeat (Beat 1) or Pickup Zone (Beat 4). If the engine misses these 60-90% probability checks, it is forced to wait a full measure for the next window.
    - **Phrase Fatigue:** For Bird, `restProb` increases significantly once `notesInPhrase > 48`. If it hits this limit mid-measure, it stops and then gets trapped by the Entry Windowing.
- **Fix:** Implement a "High Intensity Assertive Entry" for Bird/Shred styles that allows re-entry on any 8th note if the rest has lasted > 8 steps.

### B. Intensity Scaling Paradox
- **Symptom:** Low intensity sometimes feels denser than high intensity.
- **Root Cause:** 
    - `effectiveIntensity` math: The blend of `maturityFactor` and `smoothLoopCount` can push low-intensity solos higher than intended over time, while high-intensity solos hit the `1.0` cap early and lose their "pressure" differentiation.
    - `restBase` values (e.g., 0.6 for Ska/Blues) are static and don't scale aggressively enough with `bandIntensity`.
- **Fix:** Refactor `restProb` to use a non-linear scaling for `effectiveIntensity` and lower the `restBase` floors for "High Energy" genres.

### C. Ska-Punk "Identity Crisis"
- **Symptom:** Soloist feels like "generic horns" rather than a high-energy sax solo.
- **Root Cause:**
    - **Antiphony Logic:** Lines 940-950 force rests on even measures if `intensity < 0.7`. This is too binary and makes the soloist feel like a background element.
    - **Style Config:** `restBase: 0.6` and `maxNotesPerPhrase: 8` are far too restrictive for a "Punk" energy solo.
- **Fix:** 
    - Redesign `STYLE_CONFIG.ska` for "Sax Solo" energy: `restBase: 0.15`, `maxNotesPerPhrase: 24`, and use "Straight" cells (0, 1, 2).
    - Remove the hard-coded antiphony suppression for the soloist.

### G. Rhythmic Rigidity (Grid-First vs Groove-First)
- **Symptom:** Soloist felt disconnected from the rhythm section, sounding mechanical and "on-the-grid."
- **Root Cause:** Phrasing was driven by fixed 4-step `RHYTHMIC_CELLS` that were chosen in isolation from the drums and bass.
- **Fix (The Rhythmic Overhaul):**
    - **Groove DNA Maps:** Replaced fixed cells with 16-step **STYLE_EMPHASIS** maps for every genre (e.g., Jazz offbeats, Ska skank).
    - **Reactive Alignment:** Soloist now "listens" to the drummer. Attack probability is boosted (+30%) when a Kick or Snare hit is detected in high-energy styles.
    - **Reactive Interlocking:** Jazz/Bossa soloists now "duck" slightly on heavy downbeats to create a more sophisticated, syncopated feel.
    - **Probabilistic Generation:** Moved to a per-step probability model with `minGap` protection to prevent machine-gun fire and ensure natural spacing.

## 2. Refined Implementation Plan

### Phase 1: Core Phrasing Engine Updates (COMPLETED)
- [x] **Assertive Re-entry:** (Applied)
- [x] **Intensity Linearization:** (Applied)

### Phase 2: Style Tuning & Melodic Devices (COMPLETED)
- [x] **Update `ska` Style:** (Applied)
- [x] **Chromatic Falls:** (Applied)
- [x] **Smooth Slides:** (Applied)
- [x] **Device Probability Audit:** (Applied)

### Phase 3: Lyrical Head Mode (COMPLETED)
- [x] **Implement Head Detection:** (Applied)
- [x] **Melodic Bias:** (Applied)
- [x] **Chord Tone Weighting:** (Applied)
- [x] **Bebop Head Nuance:** (Applied)

### Phase 4: Rhythmic Overhaul (COMPLETED)
- [x] **Groove DNA Maps:** (Applied)
- [x] **Reactive Coordination:** (Applied)
- [x] **Per-Step Probability Model:** (Applied)

### Phase 5: Validation (COMPLETED)
- [x] Run `analyze-soloist-stats.test.js` and verify stats.
- [x] Verify reactive alignment via `soloist-reactive-rhythm.test.js`.

## 3. Final Results
- **Jazz (Bird):** Authentic Bebop arc. Starts with an intentional "Head" (Parker-style phrasing), ramping into a continuous, swinging improvised solo that interlocks with the rhythm section.
- **Ska-Punk:** High-energy lead character that locks in with the skank and the drum backbeat.
- **MIDI Quality:** Professional-grade Pitch Bend slides and expressive velocity fluctuations.
- **Dynamic Response:** All genres respond linearly and predictably to the Intensity and Lyrical Bias sliders.

---
**Branch:** `feature/soloist-tuning-audit`
**Lead:** Gemini CLI
**Status:** COMPLETED

---
**Branch:** `feature/soloist-tuning-audit`
**Lead:** Gemini CLI
**Status:** COMPLETED
