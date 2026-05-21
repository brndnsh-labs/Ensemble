# Epic 1: Harmony Voice Rebuild

## Why this epic exists

The owner's listening triage: harmony "sounds the most toy-ish most of the time… feels bolted on." Discovery confirmed it literally is — the non-organ harmony voice is a near-verbatim clone of the soloist preset skeleton (two oscillators, unison detune, single lowpass) with a `style` switch on top, and a global `genreFeel` flag that hijacks the timbre before the switch even runs. It has no dedicated voice design, no formant character, an AR (not ADSR) envelope, and the thinnest bus in the mixer (a +1 dB no-op EQ).

This is the one epic that is a **rebuild, not a polish**. The **organ branch is the exception — it is genuinely well-built (Leslie, tremolo, key-click, 5th harmonic) and must be left alone.**

## Source findings

`harmony.md` §1–§6.

## Stories

### S1. Decouple `style` from the `genreFeel` override
`synth-harmonies.ts:288–303` checks `groove.genreFeel` (Rock/Metal, Neo-Soul/Acoustic) *before* the `style` switch, so a chosen style silently never reaches its branch. Remove the preemption: `genreFeel` may *bias* defaults but must not override an explicit `style`.

**Acceptance:** every `style` branch is reachable under every `genreFeel`. A/B confirms previously-hijacked styles now sound as intended.
**Effort:** ~2h. **Model:** sonnet (control-flow fix, concrete). **Reviewer:** synth-graph-reviewer. **Source:** `harmony.md` §2.

### S2. Real ADSR envelope
The envelope (`synth-harmonies.ts:526–528`) is AR — linear attack to `finalVol`, then `setTargetAtTime(0)` release. No decay, no sustain stage. Add a decay-to-sustain stage so pads swell-and-settle. Also fix the past-scheduled release for short pad notes (§5) so they reach `finalVol` before decay begins.

**Acceptance:** A/B — pad/string styles have an audible swell-settle shape instead of a flat held tone. Short pad notes are no longer shape-distorted.
**Effort:** ~3h. **Model:** opus (envelope shape by ear). **Reviewer:** synth-graph-reviewer. **Source:** `harmony.md` §2, §5.

### S3. "Horn Section" formant voice
Build a named horn-section preset following the soloist/`INSTRUMENT_PRESETS` pattern: sawtooth core, bandpass formants (~1.2k/2.5k), a brass bell peak, fast attack with a tiny swell, optional shared noise-breath layer (the sax technique at `synth-soloist.ts:448–466` is directly reusable).

**Acceptance:** A/B — harmony stabs read as a horn section, not a generic synth. Distinct from the soloist trumpet.
**Effort:** ~6h. **Model:** opus (voice design). **Reviewer:** synth-graph-reviewer. **Source:** `harmony.md` §3.

### S4. "String Pad" ensemble voice
Build a named string-pad preset: a multi-detuned sawtooth ensemble (4–6 layers) with per-layer attack-time offset, an ensemble chorus LFO, a slow-moving gentle lowpass, and a body-resonance peak. This is the canonical pure-synth "expensive pad."

**Acceptance:** A/B — sustained harmony reads as a string ensemble with width and movement, not a static duo. Note: a true sampled string ensemble remains the one future pack candidate (Epic 6) — this story makes the *synth* pad as good as synthesis allows.
**Effort:** ~6h. **Model:** opus (voice design). **Reviewer:** synth-graph-reviewer. **Source:** `harmony.md` §3, §4.

### S5. Harmony bus character EQ
The harmony bus EQ (`engine.ts:257–271`) is a single peaking filter at 1200 Hz with +1 dB gain — inaudible. Give the bus real character like the bass/chord buses: an air high-shelf and a low-mid scoop, voiced so harmony sits as a sweetener layer above the chords.

**Acceptance:** A/B — harmony has presence and air without competing with the chord comp.
**Effort:** ~3h. **Model:** opus (mix judgment). **Reviewer:** synth-graph-reviewer. **Source:** `harmony.md` §2.

### S6. Hygiene cleanup
Three concrete items from `harmony.md` §5–§6: (a) remove the dead `tremoloGain` — allocated at `synth-harmonies.ts:262–272`, never connected; (b) cache the organ WaveShaper curve — `synth-harmonies.ts:236–245` rebuilds a 44100-sample `Float32Array` on *every organ note*; the chords file already has the cached pattern (`cachedShaperCurve`) to copy; (c) guard the `slideInterval` exponential ramp (401–412) and the organ click ramp (330–331) against zero/NaN start or target values.

**Acceptance:** `tremoloGain` gone; organ curve built once and cached; no uncaught `exponentialRamp` throw paths. `synth-graph-reviewer` clean.
**Effort:** ~3h. **Model:** sonnet (concrete cleanup). **Reviewer:** synth-graph-reviewer. **Source:** `harmony.md` §5, §6.

## Notes

- S1 and S6 are mechanical and can be done first/in parallel. S2 → S3/S4 (the rebuilt voices want the real envelope). S5 is independent.
- Do **not** touch the organ branch — it is the one good voice here.
