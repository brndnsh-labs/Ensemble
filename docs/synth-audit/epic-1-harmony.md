# Epic 1: Harmony Voice Rebuild

## Why this epic exists

The owner's listening triage: harmony "sounds the most toy-ish most of the time… feels bolted on." Discovery confirmed it literally is — the non-organ harmony voice is a near-verbatim clone of the soloist preset skeleton (two oscillators, unison detune, single lowpass) with a `style` switch on top, and a global `genreFeel` flag that hijacks the timbre before the switch even runs. It has no dedicated voice design, no formant character, an AR (not ADSR) envelope, and the thinnest bus in the mixer (a +1 dB no-op EQ).

This is the one epic that is a **rebuild, not a polish**. The **organ branch is the exception — it is genuinely well-built (Leslie, tremolo, key-click, 5th harmonic) and must be left alone.**

## Source findings

`harmony.md` §1–§6.

## Stories

### S1. Stand up `playHarmonyNoteNew` — `style` decoupled from `genreFeel`
**This is the first voice-rebuild story** — where `playHarmonyNoteNew` stops being a placeholder that delegates to `*Current` and becomes a real (if still basic) harmony voice that S2–S4 then build onto. The bug to design out from the start: `synth-harmonies.ts:288–303` (cited from the *current* voice for reference — this is not an in-place edit target) checks `groove.genreFeel` (Rock/Metal, Neo-Soul/Acoustic) *before* the `style` switch, so a chosen style silently never reaches its branch. The new voice must structure this correctly: `genreFeel` may *bias* defaults but must never override an explicit `style`. Carry the good organ branch into the new voice unchanged. Named formant voices come in S3/S4; S1 only makes `New` a structurally-correct voice.

> Note (synth-cycle triage): this cannot land in `playHarmonyNoteCurrent` — making hijacked styles reachable *changes* `current`'s sound, which breaks the bit-identical `current` freeze. All of it lands in `playHarmonyNoteNew`.

**Acceptance:** `playHarmonyNoteNew` is a real voice (no longer delegating to `*Current`); every `style` branch is reachable under every `genreFeel`; A/B confirms previously-hijacked styles now sound as intended.
**Effort:** ~4h. **Model:** opus (voice-skeleton standup + control structure). **Reviewer:** synth-graph-reviewer. **Source:** `harmony.md` §2.

### S2. Real ADSR envelope
Layered onto the `playHarmonyNoteNew` voice S1 stood up. The current envelope (`synth-harmonies.ts:526–528`, cited for reference) is AR — linear attack to `finalVol`, then `setTargetAtTime(0)` release. No decay, no sustain stage. Give the new voice a decay-to-sustain stage so pads swell-and-settle. Also avoid the past-scheduled release for short pad notes (§5) so they reach `finalVol` before decay begins.

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

- **Sequencing (synth-cycle triage, 2026-05-21):** Epic 1 is a *rebuild*, so S1–S4 are **not** independent — they all build one `playHarmonyNoteNew` body and must run **sequentially in order**: S1 stands the voice up, S2 adds the envelope, S3/S4 add the named formant presets. Each is independently auditable (the `new` voice gets progressively better). S5 (bus EQ — `engine.ts` mix-side, applies to `current` too) and S6 (hygiene on the current code) are genuinely independent — run them first as low-risk warmups, in any order. **Revised order: S6 → S5 → S1 → S2 → S3 → S4.**
- The epic's original note called S1 "mechanical" — it is not, under the bit-identical `current` freeze: a control-flow patch to `playHarmonyNoteCurrent` would change `current`'s sound. S1 is a voice-rebuild story (opus), re-scoped accordingly above.
- S2 → S3/S4 (the rebuilt formant voices want the real envelope).
- Do **not** touch the organ branch's *sound* — it is the one good voice here. S1 carries it into `playHarmonyNoteNew` unchanged; S6(b) caching the organ WaveShaper curve is a transparent, sound-preserving perf fix and is allowed.
