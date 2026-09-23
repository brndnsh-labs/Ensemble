# The band engine (`band/`)

**Status:** v0 in progress on `feat/band-engine` (DECISION 2026-09-23, Brandon).
**Replaces, at cutover:** the generative engine in `public/engine/` (worker, scheduler,
conductor, per-lane generators) and its critique suite. Until cutover it runs only behind
`?engine=next`, beside the old engine, so the two can be compared on the same build.

## Decision

The old engine grew around a one-sixteenth-at-a-time generator split across the main thread
and a worker. v2's semantic score outgrew it: holds, N.C., fermatas, alternates and off-grid
durations are rejected by `prepareScorePlayback` because the engine can't express them. The
same generation ran three times (live, `.mid`, WAV), the conductor existed twice, and drums were
generated twice. Rather than keep patching, v0 rebuilds the rhythm section from the ground up and
ports the old engine's *lessons*, not its code.

- **v0 scope:** drums, bass and keys, in Rock, Jazz, Funk and Bossa.
- **Out of v0:** soloist, harmony, the other nine genres, live MIDI out, an audio-layer
  rewrite. Audio reuses today's voices and sample packs, so the listening gate judges one
  change at a time.
- **Gate per genre:** Brandon's ear, on a `/deploy-test` build with `?engine=next`. Tests prove
  rules; they do not prove taste.
- At cutover, VISION.md's "the engine is kept, not rewritten" is updated, and `public/engine`'s
  generators and their tests are deleted.

## Shape: one pure function, one event stream

```
SemanticScore ─ form/timeline ─▶ Timeline (bars in ticks, PPQ 480; chord spans; meters; visits; phrases)
BandSettings  ─ arrange/plan  ─▶ BarPlan per bar (energy, lanes, fill, crash, ending)
             players (per bar: drums → bass → keys, each hearing the lanes before it)
             feel (swing geometry, lane lean, seeded character)
                               ─▶ BandEvent[]  ─▶ live host · .mid · WAV
```

`performPass(timeline, settings, { pass, looping, memory })` is the whole engine. It is
deterministic in its inputs: every random draw is keyed on *where it is in the music* (seed,
style, lane, bar or section, purpose), never on how many draws came before, so regenerating
from any bar reproduces the same music.

- **Changing tempo regenerates nothing.** Events are in ticks; the host maps ticks to seconds.
- **Changing style, intensity or a lane regenerates the pass.** A song pass is a few
  milliseconds of work.
- **Coordination is one-way data.** Drums play first; bass reads `heard.drums` (and locks to
  the kick where the idiom wants); keys read both. No shared mutable blackboard.

## Laws carried over from the old engine

1. **The timing law** ([`timing-model.md`](timing-model.md)). Swing is grid geometry (tier 1).
   Band lean is one per-lane constant, and drums never lean (tier 2). Character is seeded
   placement keyed on (bar position, lane, voice), so it repeats every bar as a settled pocket
   (tier 3). There is no band-global time shift. This lives in `feel/feel.ts` and nowhere else.
2. **Metronomic by default.** Energy changes density and dynamics, never tempo. Fermatas are
   the only tempo event, and they are written in the chart.
3. **Motifs belong to sections, not bars.** Grooves, riffs and comping figures are chosen with
   `rng(purpose, 'section')`, so a verse keeps its groove each time and a chorus has its own.
4. **Register slots.** Bass 23–57 (home around D2), keys 52–84 (top voice aiming for C5).
5. **One chord authority.** `theory/chord.ts` parses every quality the chart codec accepts;
   lanes read `ChordFacts` and never re-read symbol text. A parity test pins it to the codec.
6. **Musical intent is documented at the decision.** Every probability and pattern says why.

## Styles and idioms

An *idiom* is one way to play one instrument: a backbeat, a walking line, a Charleston comp.
A *style* is a feel plus one idiom per lane (`styles/index.ts`). Adding a genre usually means
composing existing idioms. An influence, such as rock with a Motown bass, is a style that
borrows another family's idiom. Shared machinery does everything that isn't the idiom itself:
- `players/drums/kit.ts`: fills, crashes, endings, odd-meter cells.
- `players/keys/books.ts`: voicing, voice leading, anticipations tied over the barline.
- `players/bass/line.ts`: register and approach notes.

Idioms write whole-bar patterns for 4/4 and pulse cells for other meters. Every meter the codec
accepts plays; only 4/4 is idiomatic in v0.

## The live host (`prototypes/v2/lib/band-host.ts`)

`?engine=next` routes the runtime's play, stop and resume paths through `startBand`/`stopBand`
instead of `TOGGLE_PLAY`, so the old worker never starts and its callbacks are ignored. The
host keeps a queue of *segments*, one pass of the song or one lap of a practice loop each, and
schedules everything due in the next 150 ms on a 25 ms timer.
- **Tempo** re-anchors the clock.
- **Style, intensity, lanes, swing and humanize** regenerate the pass from the next barline.
- **A staged genre** is committed at once.
- **The chart pointer** follows `songTick()` into `arranger.stepMap`.

A pass is generated on the main thread (about 5–7 ms for 32 bars on a desktop), two seconds
before it is needed.

Not yet on the host:
- audio (WAV) export (MIDI export is)
- hiding the soloist/harmony controls
- charts the old adapter still rejects at load, because the chart sheet still draws from the
  old `arranger` maps

Genres outside v0 play their nearest v0 style (`STYLE_FOR_GENRE` in `runtime.ts`).

## Tests: two harnesses

- `band/test/invariants.test.ts` checks every style × fixture chart × 8 seeds, looping and
  ending, first and second pass. It covers determinism, bar and register bounds, velocities, the
  timing tiers, no pitched onsets under N.C., no same-pitch overlaps, bass arrivals on chord
  tones, and keys chords that carry their guide tones.
- `band/test/critique.test.ts` holds one metric library and a table of statistical claims per
  style, harvested from what the old critique suite asserted about these genres. It prints a
  report per style.
- Unit specs sit beside their modules (`form/`, `theory/`, `feel/`).
- `npm run band:render` writes `.mid` files and, with `--print=N`, a text grid of the first N
  bars.
