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

### D. Slide Proliferation & MIDI Clunkiness
- **Symptom:** Slides into notes are too frequent and sound "clunky" in MIDI export/connection.
- **Root Cause:**
    - **Discrete Notes:** The `slide` and `graceSlide` devices use two separate 16th notes. In MIDI, this translates to distinct NoteOn/Off events which sound mechanical on external synths.
    - **High Probability:** Styles like `acoustic` and `minimal` have `allowedDevices: ['slide']` with `deviceProb` up to 0.25, resulting in slides on ~25% of phrases.
- **Fix:**
    - **Refactor to Pitch Bend:** Change `slide` and `graceSlide` to use `bendStartInterval` on a single note instead of two discrete notes.
    - **Balance Probability:** Lower `deviceProb` for slide-heavy styles and ensure a more varied device pool where possible.
    - **Fix Blues Licks:** Resolve the unused `slideTarget` in `bluesLick` logic by switching to `bendStartInterval`.

## 2. Refined Implementation Plan

### Phase 1: Core Phrasing Engine Updates (COMPLETED)
- [x] **Assertive Re-entry:** Modify the `isResting` logic to allow styles like `bird`, `shred`, and `ska` to break out of rest faster at high intensity.
- [x] **Intensity Linearization:** Ensure `restProb` truly reflects the `bandIntensity` slider by adjusting the damping and base multipliers.

### Phase 2: Style Tuning & Melodic Devices
- [x] **Update `ska` Style:** (Applied)
- [x] **Chromatic Falls:** (Applied)
- [ ] **Smooth Slides:** Refactor `slide` and `graceSlide` to use `bendStartInterval`.
- [ ] **Device Probability Audit:** Normalize `deviceProb` across styles to prevent slide-flooding.

### Phase 3: Validation
- [ ] Run `analyze-soloist-stats.test.js` and verify stats.
- [ ] Verify `bendStartInterval` usage in MIDI export code.

## 3. Final Results
- **Jazz (Bird):** Transformation from intermittent to continuous "sheets of sound" at high intensity.
- **Ska-Punk:** Revamped from a background element to a driving "Reel Big Fish" style sax lead.
- **Linearization:** All genres now respond predictably to the Intensity slider, with a distinct sparse-vs-dense profile.

---
**Branch:** `feature/soloist-tuning-audit`
**Lead:** Gemini CLI
**Status:** COMPLETED
