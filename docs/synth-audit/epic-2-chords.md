# Epic 2: Chords → Electric Piano

## Why this epic exists

Owner triage: "chords can get buried in the mix… might benefit from a true piano voice." Epic 0 S5 fixes the *mix-side* burial (gain, EQ notch, glue compressor). This epic fixes the *voice itself* — and it has three concrete burial causes plus a realism ceiling:

- **No attack transient** — the hammer strike is a quiet (`finalVol*0.15`), diffuse noise blip; nothing for the ear to latch onto.
- **No sustained presence-band energy** — heavily low-passed toward 400 Hz, tiny upper partials.
- **Mechanically simultaneous, polyphony-attenuated onsets** — the strum-stagger code is dead (`index:0`), and `1/sqrt(numVoices)` makes full chords *quieter* than single notes.

The realism ceiling: the "piano" is one static 10-partial wave with a single shared decay. Pure synthesis can fully nail an **electric piano**; a true acoustic grand is the one honest pack candidate (Epic 6) — but premature, the voice is far below its synthesis ceiling.

## Source findings

`chords.md` §1–§6.

## Stories

### S1. Wake the dead strum-stagger
`scheduleChords` always passes `index: 0` (`scheduler-core.ts:931`), so the `index * stagger` term at `synth-chords.ts:137` is always 0 — every chord note starts perfectly simultaneously. Pass real ascending indices, or compute a humanized 4–12 ms spread inside `playNote` (ideally via the Epic 0 S6 humanization helper).

**Acceptance:** A/B — chords have a subtle human strum/roll spread, not a mechanical block.
**Effort:** ~2h. **Model:** sonnet (concrete wire-up). **Reviewer:** synth-graph-reviewer. **Source:** `chords.md` §2.

**Status:** Shipped 2026-05-22. `scheduleChords` now ranks a step's non-muted notes by ascending pitch and passes that rank as `index` — but only for the `new` voice, so `current` keeps `index: 0` and stays bit-identical. `playNoteNew` turns the rank into a low→high roll (~4 ms/voice base spread + small deterministic `humanizeNote` jitter at scale 0.15), applies it to `time`, and delegates with `index: 0` so the legacy `Math.random()` stagger never double-strums. synth-graph-reviewer: clean (P0:0, P1:0, P2:3, all observations) — confirmed `playNoteCurrent` bit-identical, no node leaks, no NaN to AudioParam; folded in the reviewer's one clarity-comment suggestion. typecheck/Biome/jscpd/vitest green. Owner approved by ear.

### S2. Real attack transient
The hammer strike (`synth-chords.ts:152–169`) is too quiet and too diffuse. Raise it toward 0.4–0.6×, and add a short pitched click component (a fast-decaying blip at the note frequency, or a resonant ping in the 2–4 kHz band) so the onset has an edge.

**Acceptance:** A/B — chords have a defined attack that cuts through a full-band mix. The single highest-leverage fix for burial.
**Effort:** ~4h. **Model:** opus (transient design by ear). **Reviewer:** synth-graph-reviewer. **Source:** `chords.md` §2, §3.

**Status:** Shipped 2026-05-22. `playNoteNew` now layers a defined two-part transient on top of the legacy diffuse blip before delegating the body: a boosted noise "chiff" (`playPercussiveStrike` at `finalVol*0.45`, ~3× the old level) and a fast-decaying pitched click (`playResonantTone`, ~45 ms triangle at the note pitch). Both track velocity/polyphony and fire at the strum-shifted onset. synth-graph-reviewer: clean (no findings) — guard ordering, no NaN path, no node leak (both helpers self-disconnect), `playNoteCurrent` bit-identical. The one P2 (NaN-velocity not range-checked) is pre-existing and already covered by S7. typecheck/Biome/jscpd/vitest green. Owner approved by ear.

### S3. Velocity → brightness
Velocity currently moves only filter cutoff and gain, not wave content. Crossfade two periodic waves (mellow + bright) by velocity, or scale upper-partial weights — using the Epic 0 S7 velocity→timbre helper.

**Acceptance:** A/B — soft and hard chord hits are timbrally distinct, not just louder/quieter.
**Effort:** ~3h. **Model:** opus (curve by ear). **Reviewer:** synth-graph-reviewer. **Source:** `chords.md` §2, §3.

**Status:** Shipped 2026-05-22. `playNoteNew` now layers a velocity-scaled "bright" oscillator on top of the delegated body: a cached fundamental-light `brightWave` PeriodicWave (energy in partials 3–7), gated by `velocityTimbre`'s convex `brightness` scalar — soft chords stay on the mellow body alone, hard hits bloom upper-harmonic shimmer in. Fast attack + 0.18 s decay-bloom, self-disconnecting. synth-graph-reviewer found one P1 (the bright osc could be hard-stopped while still audible on staccato chords → click, because the stop was coupled to note `duration`); fixed by decoupling the stop to a fixed 1.0 s tail (~5.4 decay time-constants, inaudible residual). `playNoteCurrent` bit-identical. typecheck/Biome/jscpd/vitest green. Owner approved by ear.

### S4. Per-partial additive voice
Replace the single periodic-wave oscillator with ~6–10 individually-enveloped sine partials, upper partials given shorter decay time-constants so the spectrum evolves naturally instead of one uniform LPF sweep faking it. This is *the* technique that makes synthetic piano stop sounding synthetic. Mind the voice budget (partials × polyphony).

**Acceptance:** A/B — sustained chords have natural spectral decay (upper partials die first); the "buzzy stable" sustain is gone. Holds up at full polyphony without CPU strain.
**Effort:** ~6h. **Model:** opus (DSP design). **Reviewer:** synth-graph-reviewer. **Source:** `chords.md` §2, §3.

### S5. Inharmonicity
On top of S4's per-partial model, detune partial *n* from *n·f0* by a stretch factor (`f_n = n·f0·sqrt(1+B·n²)`, B small, pitch-dependent). This is the difference between "rich synth" and "piano."

**Acceptance:** A/B — the voice reads as a real piano/electric piano rather than an organ-ish synth. Depends on S4.
**Effort:** ~3h. **Model:** opus (tuning by ear). **Reviewer:** synth-graph-reviewer. **Source:** `chords.md` §2, §3.

### S6. Soften polyphony compensation
`1/sqrt(numVoices)` makes a 4-note chord play each voice at 0.5× — a full chord ends up quieter than a single note, working against de-burial. Switch to a gentler curve (`1/numVoices^0.3`) or a cap.

**Acceptance:** A/B — full voicings are not quieter than sparse ones; no clipping on dense chords.
**Effort:** ~2h. **Model:** sonnet (concrete curve change). **Reviewer:** synth-graph-reviewer. **Source:** `chords.md` §2.

### S7. NaN guards on `vol` / `duration` / `bandIntensity`
`vol` (from `n.velocity`) and `duration` reach `AudioParam`s and `osc.stop()` unguarded; a NaN silently poisons gain/cutoff/shaper or drops the note. Add `Number.isFinite` guards with sane fallbacks (fail-fast per the worker-payload convention).

**Acceptance:** a NaN velocity or duration is caught and logged, not silently swallowed. `synth-graph-reviewer` clean.
**Effort:** ~2h. **Model:** sonnet (concrete guards). **Reviewer:** synth-graph-reviewer. **Source:** `chords.md` §5.

## Notes

- S1, S6, S7 are mechanical — fan out early. S4 → S5 (inharmonicity needs the per-partial model). S2, S3 are independent voice work.
- Target the synthesized voice at a great **electric piano** + a serviceable acoustic. The true acoustic grand is Epic 6.
