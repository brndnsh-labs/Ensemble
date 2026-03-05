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

### E. "Over the Top" Initial Jazz Phrasing
- **Symptom:** Soloist starts with hyper-active shredding immediately, making it hard for listeners to latch onto a melody.
- **Root Cause:**
    - **Filler Logic:** Bird style had a hardcoded 80% chance to fill any rest with approach notes, regardless of loop progress.
    - **Lyrical Bias:** Hardcoded to 0.0 for Jazz, preventing any "breathing" space.
    - **Cell Pool:** Standard busy cells (16ths) were available from step 0.
- **Fix:**
    - **Head Mode (Loop 1):** Introduced `headFactor` (1.0 -> 0.0 during loop 1).
    - **Dynamic Bias:** Increased `lyricalBias` and reduced `fillerProb` significantly during the Head.
    - **Chord Tone Priority:** Increased weight for chord tones (1, 3, 5, 7) by 8000% during the Head to ensure "intentional" melodic lines.
    - **Rhythmic Simplification:** Filtered busy cells out of the pool during the Head.

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
- [x] **Implement Head Detection:** Use `smoothLoopCount`.
- [x] ** Melodic Bias:** Reduce Jazz filler and increase lyrical bias during Loop 1.
- [x] **Chord Tone Weighting:** Ensure intentional melody generation.

### Phase 4: Validation
- [x] Run `analyze-soloist-stats.test.js` and verify stats.
- [x] Verify Head vs Solo density delta (>30% difference).

## 3. Final Results
- **Jazz (Bird):** Now plays a recognizable, intentional "Head" (8.8 notes/m) before ramping into full speed (12.7 notes/m).
- **Ska-Punk:** Revamped lead character with clear melodic growth across loops.
- **Linearization:** All genres respond predictably to the Intensity slider.
- **MIDI Quality:** Slides are now expressive Pitch Bends rather than clunky chromatic notes.

---
**Branch:** `feature/soloist-tuning-audit`
**Lead:** Gemini CLI
**Status:** COMPLETED

---
**Branch:** `feature/soloist-tuning-audit`
**Lead:** Gemini CLI
**Status:** COMPLETED
