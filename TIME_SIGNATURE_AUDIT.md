# Ensemble Time Signature Audit

This document outlines a comprehensive audit of the Ensemble codebase to evaluate support for time signatures other than 4/4 (such as 3/4, 6/8, 5/4, and 7/8) and identifies areas where hardcoded 4/4 assumptions currently exist. It also highlights gaps in testing and provides a prioritized action plan for addressing these issues.

## 1. Hardcoded 4/4 Assumptions Identified

### Core Scheduling and Playback (`public/engine/scheduler-core.js`)
- **Fixed Beat Checks:** The logic uses hardcoded `step % 4 === 0` to identify beat downbeats (e.g., for MIDI note scheduling), which incorrectly assumes 4 steps per beat.
- **Fixed Subdivisions in Fills:** The drum logic loops strictly 16 times (`for (let i = 0; i < 16; i++)`) over snare patterns, assuming exactly 16 steps per measure, which fails for 3/4 (12 steps) or 5/4 (20 steps).
- **Swing Calculation:** Swing shift duration logic hardcodes `% 4 < 2` and `% 2 === 0` which implicitly assumes sixteenth note structures.
- **Metronome Flashes:** Metronome click/flash logic has explicit hardcoded checks like `ts.beats === 4 && stepInfo.beatIndex === 2` for accenting backbeats.

### Conductor Engine (`public/conductor.js`)
- **Intensity Recalculation:** `playback.bandIntensity > 0.4 ? 2 : 4` uses literal fallback values based on 4/4 structures.
- **Turnarounds:** Bar transition logic often uses strict 4-bar phrases (e.g., `measureEnd >= total`) without respecting dynamic phrase lengths depending on the meter.

### Groove and Accompaniment Engines
- **Groove Engine (`public/engine/groove-engine.js`):**
  - Contains explicit 4/4 backbeat checks: `const isBackbeat44 = arrangerState.timeSignature === '4/4' && isBackbeat;`.
  - Pattern turnaround and creativity offsets rely heavily on `barIndex % 4 === 0` and `barIndex % 4 === 3` for fills.
  - Offbeat checks (`loopStep % 4 === 2`) assume strict 16-step cycles.
- **Individual Grooves (e.g., `public/engine/grooves/blues.js`):**
  - Rhythm patterns use hardcoded step indices (`loopStep === 4`, `loopStep === 12` for snares, or `[0, 6, 8, 14]` for hi-hats), which misalign when a measure has a different number of steps.
- **Synth Engines (`public/engine/synth-bass.js`, `public/engine/synth-drums.js`):**
  - Density and ducking logic uses fixed thresholds (e.g., `const densityThreshold = 4`) and assumes ~2 bars of 16ths means 32 steps.

### User Interface and Visualization
- **Visualizer (`public/visualizer.js`):**
  - Contains extensive loops strictly constrained to 4 iterations: `for (let i = 0; i < 4; i++)`, specifically for rendering grid backgrounds, macro beat lines, and chord boxes.
  - The `render` function directly defaults to 4 beats (`render(currentTime, bpm, beatsPerMeasure = 4)`).
  - Background rendering relies on hardcoded beat widths divided by 4.
- **Sequencer Grid (`public/components/SequencerGrid.jsx`):**
  - Time signature parsing does not dynamically group macro beats for compound meters (like grouping 6/8 into 2 macro beats), resulting in potential visual clutter.

## 2. Gaps in Testing Coverage

- **`tests/unit/time-signature.test.js`:**
  - Good coverage of step-per-measure calculations for various meters.
  - Lacks tests for the *metronome flash alignment* or macro-beat derivation for compound meters (e.g., extracting 2 beats for 6/8).
  - Lacks validation for `scheduleCountIn` correctly handling variable beats per measure.
- **`tests/unit/system/time-signature-transitions.test.js`:**
  - Tests 3/4, 5/4, and 6/8 transitions, but only implicitly checks phrase boundaries based on math rather than structural groove changes.
  - No coverage for **mid-song time signature changes**; tests assume a constant time signature per execution.

## 3. Prioritized Action Plan

1. **Phase 1: Dynamic Math and Step Information (Core Engine)**
   - Update `scheduler-core.js` and `groove-engine.js` to rely entirely on `getStepInfo` instead of inline `% 4` logic for identifying beats and offbeats.
   - Refactor `step % 4 === 0` to use `stepInfo.isBeatStart`.
   - Ensure the metronome calculation handles macro beats for compound meters.

2. **Phase 2: Groove and Pattern Refactoring**
   - Refactor individual groove files (`blues.js`, etc.) to use relative step percentages or step groups rather than hardcoded step arrays, or implement multi-meter motif libraries.
   - Adjust the drum fill lookup loop from a static `16` to `stepsPerMeasure`.

3. **Phase 3: Visualization and UI Scaling**
   - Update `public/visualizer.js` to map `for (let i = 0; i < beatsPerMeasure; i++)` instead of static `4`.
   - Introduce logic in `public/components/SequencerGrid.jsx` to visually divide 6/8 and 12/8 into groups of 3 (e.g., 2 macro beats for 6/8) instead of rendering every eighth note homogeneously.

4. **Phase 4: Comprehensive Test Expansion**
   - Introduce a suite testing mid-song transitions between, for example, 4/4 and 3/4.
   - Test macro-beat calculations specifically for 6/8, 9/8, and 12/8 time signatures.

## 4. Proposed Code Adjustments for Critical Flaws

### Flaw: Hardcoded Snare Step Iteration
**File:** `public/engine/scheduler-core.js`
**Issue:** Loops exactly 16 times to extract snare masks, breaking in non-4/4 meters.
**Proposed Adjustment:**
```javascript
// Before
for (let i = 0; i < 16; i++) {
    if (snare.steps[i] > 0) {
        snareMask |= 1 << i;
    }
}

// After
const spm = getStepsPerMeasure(stepInfo.tsName);
for (let i = 0; i < spm; i++) {
    if (snare.steps[i] > 0) {
        snareMask |= 1 << i;
    }
}
```

### Flaw: Hardcoded Metronome Grid and Beat Checks
**File:** `public/visualizer.js`
**Issue:** Hardcoded iterations over 4 beats.
**Proposed Adjustment:**
```javascript
// Before
render(currentTime, bpm, beatsPerMeasure = 4) {
    ...
    for (let i = 0; i < 4; i++) {
        // Draw beat subdivisions
    }
}

// After
render(currentTime, bpm, stepInfo) {
    // Utilize stepInfo to group compound meters correctly based on TS rules
    const effectiveBeats = stepInfo.isCompound ? stepInfo.macroBeats : stepInfo.beatsPerMeasure;
    ...
    for (let i = 0; i < effectiveBeats; i++) {
        // Draw dynamic beat subdivisions
    }
}
```

### Flaw: Hardcoded MIDI Output Downbeat Sync
**File:** `public/engine/scheduler-core.js`
**Issue:** `% 4 === 0` assumes 4 steps per beat.
**Proposed Adjustment:**
```javascript
// Before
if (midi.enabled && midi.selectedOutputId && step % 4 === 0) {

// After
if (midi.enabled && midi.selectedOutputId && stepInfo.isBeatStart) {
```