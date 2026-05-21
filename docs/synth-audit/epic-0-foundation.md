# Epic 0: Audio Foundation & A/B Harness

## Why this epic exists

Foundation-first. Two reasons this goes before any per-instrument work:

1. **Auditability.** Sound design is ear-driven and has no automated Definition of Done — the only honest verdict is the owner listening. S1 builds the A/B audition harness so every later story can be heard against the old voice and approved before it ships.
2. **Shared leverage.** Four of the five cross-cutting themes are best fixed once, in the shared layer: an FDN reverb, a glue compressor, a seeded humanization helper, and a velocity→timbre helper each lift *every* instrument at once. Per-instrument epics then apply these locally instead of each reinventing them.

This epic is run **semi-manually** — `/cycle` and friends are coupled to the musical-audit track. `/review` still works for audio-graph hygiene; implementer agents are spawned directly.

## Source findings

`shared.md` §1–§6 (the cross-cutting report). `drums.md` §2, `chords.md` §2 for the burial diagnosis.

## Stories

### S1. Per-instrument voice control (A/B audition harness)
There is no way to compare a new voice against the old one today. Build a per-instrument voice switch: each `synth-*.ts` voice can run either its `current` or `new` implementation, selected at runtime.

Surface it as a **visible control in each instrument's settings panel** — not a dev-only panel. This is deliberate: the same control is the precursor to the Epic 6 voice selector (synth vs. sample pack), so it is permanent UI, not scaffolding.

Design constraints:
- **State is a voice identifier, not a boolean.** Model the field as `voice: 'current' | 'new'`, through `dispatch` like any other UI state, persisted so it survives a reload. Epic 6 extends the same field with `'pack:<id>'` values — no migration, no boolean→enum rename later (CLAUDE.md "split labels from logic"). The settings UI can be a plain checkbox for now; the key underneath is the enum.
- **`new` is the whole instrument's audited voice**, not per-story. Each later Epic-N story builds onto that instrument's `new` path; the user toggles the instrument as a unit. Mid-epic `new` is partially built — expected.
- **Bass needs a settings entry point.** Bass has no settings panel today — add a settings button bringing it to parity with the other instruments. Folded in here as a sub-task, not a separate story.
- `current` must remain bit-identical to today's output.

**Acceptance:** every instrument (including bass) has a visible settings control to switch between `current` and `new` synthesis; the change takes effect mid-playback without a reload; the choice persists across reloads; `current` output is bit-identical to pre-epic. State uses a `voice` identifier, not a boolean.
**Effort:** ~6h. **Model:** opus (architecture — where the synth seam lives so per-voice swaps are clean; bass settings panel). **Reviewer:** state-discipline-reviewer (new persisted UI state). **Source:** owner request; `EPICS.md` Definition of Done.

### S2. Build the `synth-graph-reviewer` agent
Discovery already surfaced three audio-graph hygiene bugs (panner leak, overpromised NaN guards, unconnected node). Create a `synth-graph-reviewer` agent definition analogous to `state-discipline-reviewer`, seeded from `feedback_synth_audio_graph.md` and the §5 hygiene findings across all six reports. Its checklist: `0*NaN` / NaN into `AudioParam`s, node leaks (created but never `disconnect()`-ed), `exponentialRampToValueAtTime` misuse (ramp from/to 0, no anchor), decay/release math that can go negative or zero, UI-clock vs audio-clock scheduling.

**Acceptance:** the agent exists and, run against the current tree, independently re-finds the drums panner leak and the bass NaN-guard nit.
**Effort:** ~3h. **Model:** opus (catalog design). **Reviewer:** none (tooling). **Source:** `shared.md` §5; all reports §5.
**Status:** Shipped 2026-05-21. Agent written to `.claude/agents/synth-graph-reviewer.md` — catalog: NaN-into-AudioParam, node leaks, ramp misuse, envelope math, clock, dead-node / per-note-alloc. Caveat: custom agent definitions load at session start, so the session that *adds* the agent must self-review the synth seam (or use `general-purpose`) — the agent is invocable from the next session on.

### S3. Typed audio-graph / FX-bus abstraction
`engine.ts` `initAudio()` stores the whole graph as loose named properties on `playback` (`playback.chordsGain`, `playback.bassEQ`, `Record<string,GainNode>` casts at `engine.ts:289,300`). Replace with a typed bus/FX-bus object: each instrument bus a typed struct, the master chain explicit. No behavior change — pure refactor enabling S4, S5, and Epic 6.

**Acceptance:** `initAudio()` returns/populates a typed graph object; no `as` casts on bus wiring; `npm run typecheck` green; audio output bit-identical (A/B "current" unchanged).
**Effort:** ~5h. **Model:** opus (architecture). **Reviewer:** synth-graph-reviewer + state-discipline-reviewer. **Source:** `shared.md` §1.

### S4. FDN reverb
Replace the static white-noise `ConvolverNode` (`engine.ts:143–146`, IR from `utils.ts:653`) with a modulated feedback-delay-network reverb — 4–8 `DelayNode` lines + Hadamard mixing + per-line damping lowpass + slight LFO modulation on delay times. Drop-in: same input/output contract as `reverbNode`, so the existing per-instrument send architecture is untouched. Zero bundle cost. Expose decay/size/damping as real-time params; add at least two presets (small room, hall).

**Acceptance:** A/B against the old convolver — the tail is smooth and modulated, not static/metallic. Per-genre preset selection works. No new download weight. Highest-leverage "not-synthy" change.
**Effort:** ~6h. **Model:** opus (DSP design). **Reviewer:** synth-graph-reviewer. **Source:** `shared.md` §3.

### S5. Chord mix de-burial
Three mechanisms bury chords (`shared.md` §2). Fix the mix-side ones here (the chord *voice* is Epic 2): (a) raise the `chords` entry in `MIXER_GAIN_MULTIPLIERS` (`config.ts:105–112`) relative to soloist/drums; (b) invert or remove the −2 dB peaking notch at 2500 Hz on the chord bus (`engine.ts:198–202`) — give chords their presence band back; (c) add a glue/bus compressor (gentle ratio, slow-ish attack) so chords aren't pumped down by the brick-wall master limiter when the band peaks together.

**Acceptance:** A/B — chords remain audible and present through loud full-band passages. The glue compressor is musical, not pumping.
**Effort:** ~4h. **Model:** opus (mix judgment — levels by ear). **Reviewer:** synth-graph-reviewer. **Source:** `shared.md` §2.

### S6. Shared seeded humanization layer
Add `humanizeNote(seed, profile)` to `synth-utils.ts` returning `{timeOffset, velocityMult, detuneCents}`, seeded via `hash-utils.ts` `scrambleHash` on `(step, instrument, voiceIndex)` — **independent draws per instrument per note**, replacing the current single shared `Math.random()` jitter at `scheduler-core.ts:1138` that the whole rhythm section reuses. Per-instrument profiles (drummer tighter than soloist, etc.). Call it from each `schedule*` function before the `play*` call. This story lands the helper + wires drums as the first consumer; Epics 3 and 5 wire soloist and bass.

**Acceptance:** A/B — repeated identical notes are no longer mechanically uniform; each instrument breathes independently. Deterministic (seeded) — same session seed reproduces.
**Effort:** ~5h. **Model:** opus (per-instrument feel profiles). **Reviewer:** synth-graph-reviewer. **Source:** `shared.md` §4.

### S7. Shared velocity→timbre helper
The #1 cross-cutting "toy" tell is velocity driving loudness but never brightness. Add a small shared helper / documented pattern in `synth-utils.ts` for mapping velocity to a brightness control (filter cutoff multiplier, saturation drive, transient brightness) with a tunable curve. This story lands the helper + a worked example; Epics 2, 3, 4, 5 each apply it per voice.

**Acceptance:** the helper exists with a documented curve; one voice (pick the simplest) demonstrates velocity→brightness audibly in A/B.
**Effort:** ~3h. **Model:** opus (curve design). **Reviewer:** synth-graph-reviewer. **Source:** all reports §2; `EPICS.md` cross-cutting theme 1.

## Notes

- S1 (the voice control) and S2 (the reviewer) unblock everything — do them first, in either order. S1 is permanent UI, not throwaway scaffolding — Epic 6 S1 extends its `voice` field.
- S3 should land before S4/S5 (they extend the graph); S6/S7 are independent helpers and can fan out after S1.
- After this epic, do a full listening pass before starting Epic 1 — confirm the foundation feels right.
