# Epic 3: Soloist Expressiveness

## Why this epic exists

Owner triage: "soloist sounds synthy, very tough to get this one right since it can be so prominent." It is the highest-risk voice — the most exposed instrument, so flaws are least forgivable. Discovery's verdict: not broken, a competent two-osc subtractive lead, but "toy" for three concrete reasons:

1. **Frozen sustains** — no timbral movement once the attack settles.
2. **Velocity drives loudness, never brightness.**
3. **Zero per-note timbral variation** — every repeated note is byte-identical.

Plus a dead-code find: the legato/portamento path is fully built but `isLegato` is hardcoded `false` at `scheduler-core.ts:797`, so it never runs.

## Source findings

`soloist.md` §1–§6.

## Stories

### S1. Wake the dead legato / portamento path
`isLegato` is hardcoded `false` at the scheduler call site (`scheduler-core.ts:797`), so the legato branch and its 0.03–0.06 s portamento glide in `applyPitchEnvelope` are dead. Drive `isLegato` from note adjacency in `scheduleSoloist` (`scheduler-core.ts:789–799`) — when a note begins where the previous ended, it's legato. Owner explicitly asked to revive this.

**Acceptance:** A/B — connected solo phrases glide between notes; separated notes still re-attack cleanly.
**Effort:** ~3h. **Model:** opus (adjacency rule + by-ear glide). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3; owner request.

### S2. Velocity → cutoff coupling
Filter cutoffs derive purely from `freq`, never `vel`. Make every preset's filter cutoff (and bell/formant gains) a function of velocity via the Epic 0 S7 helper. Discovery's single highest-ROI change.

**Acceptance:** A/B — hard and soft solo notes are timbrally distinct (brighter when dug in), not just louder.
**Effort:** ~3h. **Model:** opus (curve by ear). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3.

### S3. Filter-cutoff LFO on sustain
Held notes are spectrally frozen. Add a slow (0.15–0.4 Hz) cutoff LFO, depth-ramped in like the existing vibrato delay, so sustained notes breathe.

**Acceptance:** A/B — a 2-second held note evolves in brightness instead of sitting dead.
**Effort:** ~3h. **Model:** opus (movement by ear). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3.

### S4. Coupled vibrato
Vibrato modulates pitch only. Route the vibrato LFO (scaled) into output gain and filter cutoff as well — real vibrato is a 3-way correlated wobble. Consider widening the timid ~±15c pitch depth.

**Acceptance:** A/B — vibrato has body (amplitude + timbre move with pitch), not a thin pitch-only wobble.
**Effort:** ~3h. **Model:** opus (vibrato design by ear). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3.

### S5. Per-note timbral humanization
Successive same-pitch notes are byte-identical. Jitter cutoff ±8%, detune ±3c, attack ±20%, bell freq ±5% — seeded via the Epic 0 S6 humanization helper (`scrambleHash`, not `Math.random`, per repo convention).

**Acceptance:** A/B — repeated notes vary subtly; the "machine playing the same note" tell is gone. Deterministic under a fixed session seed.
**Effort:** ~3h. **Model:** opus (variation range by ear). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3.

### S6. Attack-time detune settle + tighten shred
osc2 detune is a fixed constant per preset; +12c on shred is nearly a quarter-tone and sounds sour. Tighten shred to ~+6c (or add a third osc for fatness), and ramp osc2 detune from a wide value (~±20c) to its final over 40–60 ms so unisons "lock in" on the attack.

**Acceptance:** A/B — shred is tight, not chorused-sour; all presets have a subtle unison-settle on attack.
**Effort:** ~3h. **Model:** opus (detune by ear). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3.

### S7. Articulation-aware ADSR release
Release is always a fixed 85% of duration with no decay stage and no relationship to articulation. Add a real decay stage and tie release length to staccato/legato/duration.

**Acceptance:** A/B — staccato notes are crisp, sustained notes have a natural tail; release feels played, not clamped.
**Effort:** ~4h. **Model:** opus (envelope by ear). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3.

## Notes

- The soloist's shared algorithmic reverb need is satisfied by Epic 0 S4 (FDN) — confirm the soloist bus has a sensible send during this epic.
- S1 is the owner-requested dead-code revival — a satisfying early win. S2/S3/S4/S5 are independent and can fan out. S6, S7 touch the per-preset envelopes.
- Acoustic-realism trumpet/sax remain Epic 6 pack territory — this epic makes the *synth-lead* presets genuinely expensive; don't chase photoreal brass in pure synthesis.
