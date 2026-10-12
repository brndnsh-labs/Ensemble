# The timing model — three tiers, drums are the clock

**Status:** design ratified July 2026; the gravity-era deletion it prescribes shipped as #1063.
The law is live. The code that carries it moved: since the old engine was deleted (#1404) all
micro-timing is in the band engine's `band/feel/feel.ts` (`applyFeel`), and §3 names today's
owners. Anything below attributed to the old engine is dated history.
**Provenance:** distilled from the #714 → #1005 → #1025 pocket trace. Ensemble is "a fancy
metronome at its core": metronomic by default, expressive timing opt-in and *earned*.

## 1. The law

Every micro-timing term in the engine belongs to exactly one of three tiers, and each tier is
audible only as a **differential** against the tier above it:

| Tier | What it is | Owner |
| --- | --- | --- |
| **1. The Grid** | Metronomic truth. Swing is grid *geometry* (`swingRatio`, `warp`); tempo moves are clock-rate changes (the band has only chart-written fermatas, see `docs/design/band-engine.md`). | `applyFeel` in `band/feel/feel.ts` (swing); the host (tempo) |
| **2. Band lean** | The ONE band-level differential: melodic lanes vs. the drums, a per-genre constant (Neo-Soul bass +32 ms and comp +25 ms, Funk bass −5 ms, …). Smart, zero user knobs. | each style's `feel.lean` (`band/styles/<id>.ts`, type in `band/styles/types.ts`), applied in `applyFeel` |
| **3. Character** | Per-lane and per-note differentials: seeded placement keyed on `(bar position, lane, voice)`, per-hit velocity variation, and the comp's strum roll. | `applyFeel` in `band/feel/feel.ts` |

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

Every term below is applied in one pass, `applyFeel` (`band/feel/feel.ts`), after the players
have written on the straight sixteenth grid (`band/CLAUDE.md`: "Timing moves only in
`feel/feel.ts`"). Players never carry a timing term of their own.

- **Swing (tier 1):** grid geometry. `swingRatio(swing)` maps 0–100 to where the offbeat lands
  in its pair, and `warp` bends the within-beat tick position; tempo is unchanged. A style's
  `feel.swing` and `feel.swingGrid` (8th or 16th) are the defaults, a setting overrides.
- **Band lean (tier 2):** `feel.lean` per style: bass, comp and lead against the drums, in ms,
  positive = behind the beat. Drums are the clock and get a lean of 0, which is the asymmetry
  that makes it audible. `compLean` lets the instrument family differ (a jazz pianist lays back,
  a swing rhythm guitarist sits with the walking bass); an unset lead lean sits with the bass.
- **Character (tier 3):** a seeded placement per event, `rng(seed, 'place', lane, voice,
  position).bipolar() * MAX_CHARACTER_MS * humanize`, plus a per-hit velocity jitter. Each lane
  draws its own value (nothing band-global is added), and at `humanize` 0 every term is exactly
  zero, so playback is bit-for-bit grid-locked: the metronome-core identity stated purely. Two
  invariants worth keeping:
  **timing PLACEMENT is bar-independent**, keyed on the position within the bar and not the bar
  index, so a lane's lean at a given sixteenth repeats every bar and reads as settled placement
  rather than per-hit noise; the velocity jitter is keyed by the bar's place in its chorus (with
  no chorus in the key), so a counted chart's choruses repeat the same touch at the same place,
  as a loop's laps do.
- **Strum:** a stroked chord rolls across its strings at the instrument's `strumMs` (low to high
  on a down-stroke, high to low on an up-stroke). It is articulation, but it is time, so it
  lives in `applyFeel`, and the chord takes its tier-3 placement as one gesture so the roll is
  never scrambled.
- **Tempo domain:** the band never changes tempo on its own. Energy moves density and dynamics,
  and the only tempo event is a fermata written in the chart (`docs/design/band-engine.md`).

Guards: `band/feel/feel.test.ts` (swing ratio and offbeats, the lean against drums, settled placement, the strum roll)
and the per-style critique claims in `band/test/claims/`.

> **Old engine, deleted (#1404).** Before the band engine, tier 2 was `getBandPocket` in
> `coordination-engine.ts`, scaled per section by energy (#1064) and summed by each lane; tier 3
> was `public/engine/humanize.ts` (`humanizePlacement`, `PLACEMENT_WEIGHTS`) plus per-voice drum
> offsets inside each `grooves/*.ts` strategy (the Neo-Soul snare drag and hat push); and the
> grid was the scheduler's `calculateStepDuration`. None of that exists. In particular the
> energy-scaled lean and the per-drum-piece offsets were not carried over: the band's lean is a
> per-style constant and drums never lean. (`public/engine/humanize.ts` survives as a small
> leaf used by the synth voices, not as the band's timing.)

## 4. The retired gravity era (deleted — do not re-add)

*Historical: every file named in this section is gone.*

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

- **"Band digs in / lays back as energy builds"** was shipped in the old engine as #1064 (an
  energy-scaled `getBandPocket`) and did not survive the band engine's rewrite: the band's lean
  is a per-style constant. If it comes back, it is a differential in `applyFeel`: audible, one
  function, guarded by the style critique claims.
- **"Band breathes with intensity" in time** → tier 1, tempo domain. Don't build the same
  response twice in two domains.
- **New genre feel** → a tier-2 `feel.lean` entry in that genre's `band/styles/<id>.ts`, plus
  its tier-3 character through `humanize`. Never a per-style timing term inside a player.

## Migration status

- [x] `dillaFeel` removed (#1025).
- [x] Gravity-era machinery deleted (#1063) — shipped as designed.
- [x] Old engine deleted (#1404); the law now lives in `band/feel/feel.ts`.
