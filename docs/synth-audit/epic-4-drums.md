# Epic 4: Drums Polish

## Why this epic exists

Owner triage: "drums don't sound bad" — and discovery agreed, drums are the strongest synth voice, with good bones (`createMetallicBuffer`, the multi-layer kick/snare/tom). But the owner flagged the hihats specifically: "more variance between open and closed… the in-between positions would make a difference… closed sounds choked." Discovery confirmed all of it, plus one real bug.

So this epic is genuine polish, not a rebuild — with one hygiene fix (the panner leak) that should land regardless.

## Source findings

`drums.md` §1–§6.

## Stories

### S1. Fix the `StereoPannerNode` leak
A panner is created unconditionally for every drum hit (`synth-drums.ts:820`), but `playResonantTone`/`playPercussiveStrike`'s `onended` disconnects only `[osc, gain]` — not the panner. ~9 of 14 voice branches (Kick, Snare, Sidestick, Clave, Conga/Bongo, Agogo, Shaker, Tom, Cowbell) never disconnect their panner, leaking one `StereoPannerNode` per hit, dozens/second at tempo. Add the panner to each branch's `safeDisconnect`, or disconnect it centrally.

**Acceptance:** a heap snapshot over sustained playback shows no `StereoPannerNode` growth. `synth-graph-reviewer` clean.
**Effort:** ~2h. **Model:** sonnet (concrete bug fix). **Reviewer:** synth-graph-reviewer. **Source:** `drums.md` §5.
**Status:** Shipped 2026-05-22. Added an additive optional `onEnded?` callback to the shared `playResonantTone`/`playPercussiveStrike` helpers, firing exactly once across success/early-return/throw paths; each of the 9 leaking branches (Kick, Snare, Sidestick, Clave, Conga/Bongo, Agogo/Perc, Shaker, Tom, Cowbell) hands `releasePanner` to its longest-lived layer, plus an `else` clause covers unknown drum names. Since the leak ships in the default `current` path, the fix lands there as a deliberate, owner-confirmed frozen-`Current` exception — a post-`onended` disconnect of a silent node is provably inaudible, so A/B integrity holds. `synth-graph-reviewer` verdict: safe to land (0 P0, 0 P1, 1 P2 comment-accuracy nit fixed inline). Owner approved (hygiene fix, audibly unchanged).

### S2. Un-choke the closed hihat
Three independent decay-shorteners stack on the closed hat: `getCymbalVoiceConfig` collapses `decayBase` 0.058 → `minDecay` 0.041 (`synth-drums.ts:633–638`), then `hatDecayMult` 0.92–1.10 (997), then `decayDelay` jitter (1052). At high velocity/intensity the gain envelope guillotines the hat at ~0.038 s. Raise `minDecay` (~0.075) and `decayBase` (~0.10) in `CYMBAL_RUNTIME_PROFILES.HiHat`; stop multiplying three shorteners — pick one; let the buffer's own `partialDecay` do the choking.

**Acceptance:** A/B — the closed hat rings naturally instead of sounding choked/clipped, at all velocities.
**Effort:** ~3h. **Model:** opus (decay by ear). **Reviewer:** synth-graph-reviewer. **Source:** `drums.md` §2; owner request.

### S3. In-between hihat positions
The dispatcher knows only `'HiHat'` and `'Open'` (`synth-drums.ts:984`). Add a continuous `0..1` openness parameter (or intermediate articulations) interpolating `decayBase`, `stopTime`, and bandpass/highpass cutoff between the closed and open profiles — plus a foot-pedal "chick" variant. The owner explicitly asked for this.

**Acceptance:** A/B — quarter/half-open hats are audible and distinct from both closed and fully-open; a foot "chick" exists for off-beats.
**Effort:** ~5h. **Model:** opus (articulation design). **Reviewer:** synth-graph-reviewer. **Source:** `drums.md` §2, §3; owner request.

### S4. Per-hit cymbal variation
Every HiHat hit replays one cached buffer — fast hat patterns are near-xerox copies. Keep a small runtime-generated pool (3–4 buffers per cymbal, different `createMetallicBuffer` seeds) and round-robin, or apply a stronger per-hit detune. Generate the pool at runtime — do NOT ship buffers.

**Acceptance:** A/B — fast hat/ride patterns sound stick-to-stick varied, not looped. No bundle-size change.
**Effort:** ~3h. **Model:** opus (variation by ear). **Reviewer:** synth-graph-reviewer. **Source:** `drums.md` §2, §3, §6.

### S5. Ride ping on every hit
The ride "ping" fires only above `velocity > 0.92` (`synth-drums.ts:1067`); below that the ride is pure wash with no stick definition. Drop the gate — scale ping volume continuously from velocity.

**Acceptance:** A/B — every ride hit has stick definition; soft rides are no longer indistinct wash.
**Effort:** ~2h. **Model:** sonnet (concrete gate removal + scaling). **Reviewer:** synth-graph-reviewer. **Source:** `drums.md` §2, §3.

### S6. Velocity → timbre on hand percussion
Clave, conga, bongo, agogo, perc, shaker, guiro take velocity only as a volume scalar — frequencies, cutoffs, decay times are constant. Map velocity to filter cutoff and decay (harder = brighter + slightly longer, more noise-click) via the Epic 0 S7 helper.

**Acceptance:** A/B — a hard and a soft conga/bongo/clave hit are timbrally distinct.
**Effort:** ~4h. **Model:** opus (per-voice curves by ear). **Reviewer:** synth-graph-reviewer. **Source:** `drums.md` §2, §3.

### S7. Voice-specific colored noise
Every noise layer (kick skin, snare wires, hat sizzle, toms, shaker, guiro, brush) reads the single shared white-noise buffer — spectrally flat and static, a broad "synthy" tell. Pre-render filtered/colored noise tailored per voice (pink-ish brushes, metallic-band wires, granular shakers), or run noise through per-voice pre-filters with slow LFO movement so it is time-varying.

**Acceptance:** A/B — noise-based voices (snare wires, brushes, shaker) sound textured and alive, not flat hiss. No bundle-size change (runtime-generated).
**Effort:** ~5h. **Model:** opus (noise design). **Reviewer:** synth-graph-reviewer. **Source:** `drums.md` §2, §3.

### S8. Two-stage decay envelopes in shared helpers
`playResonantTone` / `playPercussiveStrike` do a strict attack→decay `setTargetAtTime` pair — no hold, no two-stage decay. Add an optional `holdTime` + `bodyDecay` so a fast transient decay hands off to a slower body tail, giving lighter percussion the kick/snare-style life without hand-rolling extra oscillators.

**Acceptance:** A/B — light percussion voices have a transient + body, not one flat exponential. Existing voices unchanged unless they opt in.
**Effort:** ~4h. **Model:** opus (envelope API + by-ear). **Reviewer:** synth-graph-reviewer. **Source:** `drums.md` §2, §3.

## Notes

- S1 and S5 are mechanical — fan out early. S2 + S3 are the owner's explicit hihat ask — prioritize. S8 is a shared-helper change that S6 may want to consume.
- **Carried over from Epic 0 S6:** the scheduler now applies seeded `humanizeNote` velocity/timing per drum hit, but `playDrumSoundCurrent` still has its own un-seeded `Math.random()` `velJitter` (`synth-drums.ts`). `current` is frozen and bit-identical, so it stays — but whichever story builds `playDrumSoundNew` must **not** carry the `velJitter` line over: S6's seeded humanization replaces it, and dropping it makes the `new` drum voice fully reproducible.
- The one defensible drum pack is acoustic cymbals (Epic 6) — but synthesized cymbals with S4 are good; no pack dependency here.
