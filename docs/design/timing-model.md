# The timing model — three tiers, drums are the clock

**Status:** design ratified July 2026; the gravity-era deletion it prescribes shipped as #1063.
**Provenance:** distilled from the #714 → #1005 → #1025 pocket trace. Ensemble is "a fancy
metronome at its core": metronomic by default, expressive timing opt-in and *earned*.

## 1. The law

Every micro-timing term in the engine belongs to exactly one of three tiers, and each tier is
audible only as a **differential** against the tier above it:

| Tier | What it is | Owner |
| --- | --- | --- |
| **1. The Grid** | Metronomic truth. Swing is grid *geometry* (subdivision ratios, `swingSub`); tempo moves (ritardando, tempo breathing #1010) are clock-rate changes. | scheduler / `calculateStepDuration`, `resolution.ts` |
| **2. Band lean** | The ONE band-level differential: melodic lanes vs. the drums, a per-genre constant (Neo-Soul +25 ms, Funk −5 ms, …). Smart, zero user knobs. | `getBandPocket` in `coordination-engine.ts` |
| **3. Character** | Per-lane and per-note differentials: the bass's Neo-Soul drag residual, harmony stagger, the comper's deterministic wobble, per-voice drum offsets inside genre strategies (`grooves/neo-soul.ts` snare drag / hat push — the actual Dilla feel), seeded humanization. | each lane's engine / groove strategy |

A new timing idea must name its tier before it lands. If it can't, it's probably a uniform shift
(see §2) and will be inaudible.

## 2. The uniform-shift proof (why there is no band-global micro-timing term)

Since #714, any offset added to **both** the drum grid and every melodic lane's `timingOffset` is
the *same value per step on both sides* — a uniform whole-band time shift. Nothing moves relative
to anything else. A **constant** uniform shift is inaudible by construction, regardless of
magnitude or driver (it's just wall-clock latency). A **per-step-varying** uniform shift is
tempo-domain jitter — in-principle audible (it's tier-1 territory) — but the deleted seeded
flutter was bounded ≤ ~±3 ms peak (tightness 0.5, worst case at low intensity), below tempo-jitter
perception and against the metronome-core identity anyway.

This argument retired `dillaFeel` (#1025) and then generalized to the whole gravity-era shared
pocket (§4). The corollary is the design rule:

> **"The whole band leans/pushes" must be expressed as a tier-2 differential (melodic lanes vs.
> drums) or a tier-1 clock-rate change — never as a band-global time add.**

## 3. Live inventory (what exists and where)

- **Band lean:** `getBandPocket(genreFeel, sectionLabel?)` — the per-genre palette table in
  `coordination-engine.ts`, scaled per section by energy (#1064): `getSectionEnergy(sectionLabel)`
  drives a bounded final-stage multiplier (scale ∈ [0.6, 1.4], 1.0 at verse/default energy, hard
  30 ms feel-ceiling) so the genre's character amplifies as the arrangement builds — push genres
  dig in harder at a chorus/drop, laid-back genres lean deeper, everyone plays breakdowns/intros
  closer to the grid. Summed by bass (`getBassNote`), comp (`getAccompanimentNotes`),
  harmony (`getHarmonyNotes`), and soloist (`getSoloistNotePhraseFirst`, since #1025). Drums do
  **not** add it — that asymmetry is what makes it audible.
- **Lane character:** bass Neo-Soul drag residual in `bass-engine.ts`; harmony's schedule
  accumulator (stagger); the comper's deterministic onset wobble; soloist expressive devices.
- **Drum-kit character:** per-voice `instTimeOffset` inside each `grooves/*.ts` strategy
  (e.g. Neo-Soul: snare +6–18 ms drag, hats −8–20 ms push, kick +8 ms weight). Relative *within*
  the kit → audible → stays in genre strategies, not in engine plumbing.
- **Humanization:** seeded per-lane/per-note wobble, owned by `public/engine/humanize.ts`
  (`humanizePlacement` / `humanizeColor`, scaled by `humanizeScale(groove.humanize)`). Squarely
  tier 3 and re-modelled as such in #1068 — it is a *differential*: each lane draws its own value,
  the drums draw one per kit piece, and nothing band-global is added (the pre-#1068 shape, a single
  `Math.random()` per tick handed unchanged to the comp + harmony + chart visuals, was the §2
  uniform-shift mistake in miniature, and inaudible for the same reason). Two invariants worth
  keeping: **timing PLACEMENT is bar-independent** — keyed on `(barStep, lane, voice)` so a lane's
  lean at a given 16th repeats every bar and reads as settled placement rather than per-hit noise
  (the same seam `grooves/utils.ts` draws between `placementSkew` and `humanizeDraw`); and
  **placement is position-weighted** (`PLACEMENT_WEIGHTS`: downbeat 0.35 → offbeat 1.0), so the
  band's lock points stay near the grid while the subdivisions carry the character. At
  `groove.humanize === 0` every term is exactly zero and playback is bit-for-bit grid-locked, which
  is the metronome-core identity stated purely (cf. §4's note on the gravity-era deletion).
  Each lane has exactly one placement authority: the scheduler for bass/chords/soloist, per drum
  piece inside `scheduleDrums`, and `finalizeHarmonyNotes` for harmony (which bakes its offset into
  the note, so it is also the only lane whose humanization reaches the `.mid` export by that route
  — every other lane's export placement is drawn in `midi-worker-logic.ts` with the same key).
- **Swing:** tier-1 grid geometry; guarded by the swing-ratio audit.
- **Tempo domain:** end-of-song ritardando (`resolution.ts`); tempo breathing is #1010's job.

Guards: `tests/standards/band-pocket-palette-critique.test.ts` (lane onset = band lean + lane
character, exactly), the swing-ratio audit, per-genre critique tests.

## 4. The retired gravity era (deleted — do not re-add)

An earlier "instruments following each other" model predates `coordination-engine.ts` and was
superseded by it. By the time of the July 2026 trace it was provably a no-op end to end:

- `groove.pocket` (`PocketState`: `globalDrive`, `tightness`, `bassGravity`, `chordGravity`,
  `soloistGravity`) — `globalDrive` hardcoded 0, no UI, no smart driver; gravities read only by
  dead code.
- `calculateTimingOffset` (`utils.ts`) — single caller passed `'shared'`, so every per-instrument
  gravity branch was dead.
- `calculatePocketOffset` (`groove-engine.ts`) → `coordination.pocketOffset` — added symmetrically
  to the drum grid (`scheduleDrums`), the MIDI export, and every melodic lane: a uniform shift,
  inaudible by §2.
- The conductor's `bass.pocketOffset` mirror write — write-only; `harmony.pocketOffset` —
  worker-synced but never written or read; `genreGravityOffset` in `soloist-config.ts` — never
  read.

All of it was deleted behavior-frozen (the only delta: losing the ≤±1.5 ms whole-band flutter —
i.e. becoming *exactly* grid-locked, which is the product identity stated more purely).
`shared-pocket-lock-critique` and `comp-timing-tightens-critique` pinned properties of this layer
that #714 had already made vacuous; they were retired with it.

If a future feature wants what this system *reached for* — the band's feel responding to energy —
see §5. Do not resurrect a band-global term; it cannot work (§2).

## 5. Future hooks (one authority per domain)

- **"Band digs in / lays back as energy builds"** → **shipped as #1064**: `getBandPocket` scales
  by `getSectionEnergy(sectionLabel)` inside `coordination-engine.ts` (see §3). Differential,
  audible, one function, guarded by the band-pocket critique's energy-modulation section.
- **"Band breathes with intensity" in time** → tier 1, tempo domain: #1010 tempo breathing.
  Don't build the same response twice in two domains.
- **New genre feel** → tier 2 palette entry + tier 3 character in that genre's strategy/lane.

## Migration status

- [x] `dillaFeel` removed (#1025).
- [x] Gravity-era machinery deleted (#1063) — shipped as designed; `band-pocket-palette-critique`
  now asserts lane onset = `getBandPocket` + lane character exactly, and the conductor test pins
  that the retired `bass.pocketOffset` mirror write stays gone.
