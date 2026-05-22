# Epic 5: Bass Finishing

## Why this epic exists

Owner triage: "bass sounds pretty solid, if synthy." Discovery agreed emphatically — the bass is a genuinely solid, professionally-architected three-layer voice (thump / growl / impact, with expressive `bendStartInterval` glides and `muteAmount` palm-mute modeling). It is **synthy-but-good**, not toy-ish.

So this is the smallest epic: *finishing*, not a rebuild. A handful of high-leverage moves take it from "good synth bass" to "expensive." Pure synthesis is firmly the right call — a sample pack would *regress* the expressive bend/mute features.

## Source findings

`bass.md` §1–§6.

## Stories

### S1. Sub layer
The fundamental is just `sine`+`triangle` at pitch (`synth-bass.ts:74–94`) — no dedicated sub. A real P-Bass DI has deliberate sub-fundamental energy; on small speakers the weight is thin. Add a second `sine` an octave below at ~0.3–0.4 gain, low-passed. Discovery's single biggest "synthy" tell and biggest bang-for-buck.

**Acceptance:** A/B — the bass has weight and low-end body, especially on small speakers, without boom.
**Effort:** ~3h. **Model:** opus (level/filter by ear). **Reviewer:** synth-graph-reviewer. **Source:** `bass.md` §2, §3.

**Status:** Shipped 2026-05-22. Added a dedicated sub-octave sine to `playBassNoteNew` — a second `sine` an octave below the fundamental, low-passed to ~140 Hz (Q 0.7), fixed gain 0.34, summed into the bass mix; it rides the bend ramp with the other oscillators and is floored above 10 Hz. synth-graph-reviewer clean (0 P0/P1/P2). Owner confirmed the added low-end weight reads correctly. Listening gate also surfaced that the `new` voice overall sounds louder/more aggressive than `current` — that is the velocity-driven saturation (`driveGain = 1 + drive*2.5`, up to 3.25× pre-gain into the soft-clip), and is S2's explicit mandate; owner wants S2 to preserve `current`'s rounder/smoother character on soft/medium notes and only let genuinely hard notes bite.

### S2. Velocity-driven saturation + transient brightness
`bodyMix.gain` into the waveshaper is a fixed 0.8 (`synth-bass.ts:90`), and the impact transient (`vol*0.4`, 132) scales only in volume. Make `bodyMix.gain` scale with velocity (hard notes clip/growl harder) and push `impactFreq`/`impactQ` up with velocity (digs-in get a sharper click) — via the Epic 0 S7 helper.

**Acceptance:** A/B — hard and soft bass notes are timbrally distinct: loud notes growl and bite, soft notes are clean.
**Effort:** ~3h. **Model:** opus (curves by ear). **Reviewer:** synth-graph-reviewer. **Source:** `bass.md` §2, §3.

### S3. Animated growl cutoff
The growl layer's two lowpass filters are set with `setValueAtTime` only (`synth-bass.ts:117–118`) — cutoff frozen for the note's life. Add a `setTargetAtTime` downward sweep (start ~1.5× cutoff, settle over ~80–120 ms) so the pluck "settles" like a real string.

**Acceptance:** A/B — bass notes have a pluck-settle motion instead of a static timbre.
**Effort:** ~2h. **Model:** opus (sweep by ear). **Reviewer:** synth-graph-reviewer. **Source:** `bass.md` §2, §3.

### S4. NaN guard on `bandIntensity`
The comment at `synth-bass.ts:111` claims a guard the code doesn't deliver — `Math.max(0, NaN) === NaN`, so a NaN `bandIntensity` reaches `lp1.frequency.setValueAtTime`. Add a real `Number.isFinite` fallback and fix the misleading comment.

**Acceptance:** a NaN `bandIntensity` cannot reach a filter `AudioParam`. Comment matches behavior. `synth-graph-reviewer` clean.
**Effort:** ~1h. **Model:** sonnet (concrete guard). **Reviewer:** synth-graph-reviewer. **Source:** `bass.md` §5.

### S5. Per-note humanization
The only per-note variation is a ±5% amplitude wobble. Wire the bass into the Epic 0 S6 humanization helper for subtle per-note timbre/timing/detune variation (tight profile — bass is a steady instrument).

**Acceptance:** A/B — repeated bass notes vary subtly without sounding loose. Deterministic under a fixed seed.
**Effort:** ~2h. **Model:** sonnet (helper wire-up + tight profile). **Reviewer:** synth-graph-reviewer. **Source:** `bass.md` §2; `shared.md` §4.

## Notes

- S4 and S5 are mechanical — fan out early. S1, S2, S3 are the substantive finishing work and are independent of each other.
- A gentle bass-bus compressor was noted in discovery (`bass.md` §3 item 6) — that overlaps Epic 0 S5's glue compressor; confirm the bass bus benefits from it rather than adding a second one.
- Bass is **not** a pack candidate — sampling would lose the bend/mute expressivity. Epic 6 does not touch bass.
