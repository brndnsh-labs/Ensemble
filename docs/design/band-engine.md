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

- **v0 scope:** drums, bass and comp, in Rock, Jazz, Funk and Bossa.
- **Band roles, not instrument lanes (DECISION 2026-09-23).** The band is drums, bass, **comp**
  and (later) **lead**. The comp is played by an instrument (`CompInstrument`): piano, Rhodes,
  organ, clav, electric guitar or nylon guitar. The old engine's *harmony* lane does not
  return as a lane: a second comp instrument (an organ pad under a guitar) and horn
  backgrounds behind a soloist are arrangement features, not an always-on part.
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
             players (per bar: drums → bass → comp, each hearing the lanes before it)
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
  the kick where the idiom wants); the comp reads both. No shared mutable blackboard.

## Laws carried over from the old engine

1. **The timing law** ([`timing-model.md`](timing-model.md)). Swing is grid geometry (tier 1).
   Band lean is one per-lane constant, and drums never lean (tier 2). Character is seeded
   placement keyed on (bar position, lane, voice), so it repeats every bar as a settled pocket
   (tier 3). There is no band-global time shift. This lives in `feel/feel.ts` and nowhere else.
2. **Metronomic by default.** Energy changes density and dynamics, never tempo. Fermatas are
   the only tempo event, and they are written in the chart.
3. **Motifs belong to sections, not bars.** Grooves, riffs and comping figures are chosen with
   `rng(purpose, 'section')`, so a verse keeps its groove each time and a chorus has its own.
4. **Register slots.** Bass 23–57 (home around D2), keyboard comp 52–84 (top voice aiming for
   C5). A guitar keeps its physical range but its grips stay at or above C3 when a bass plays:
   the guitar leaves the low strings to the bassist.
5. **One chord authority.** `theory/chord.ts` parses every quality the chart codec accepts;
   lanes read `ChordFacts` and never re-read symbol text. A parity test pins it to the codec.
6. **Musical intent is documented at the decision.** Every probability and pattern says why.

## Styles and idioms

An *idiom* is one way to play one instrument: a backbeat, a walking line, a Charleston comp.
A *style* is a feel plus one idiom per lane, and each style is one file (`styles/rock.ts`,
`styles/jazz.ts`, …) registered in `styles/index.ts`: a genre's whole musical identity in one
place, so genres can be written side by side without touching each other. Adding a genre usually means
composing existing idioms. An influence, such as rock with a Motown bass, is a style that
borrows another family's idiom. Shared machinery does everything that isn't the idiom itself:
- `players/drums/kit.ts`: fills, crashes, endings, odd-meter cells.
- `players/comp/idiom.ts` (`compIdiom`): voice leading, anticipations tied over the barline,
  strokes and scratches, one chord at a time.
- `players/bass/line.ts`: register and approach notes.

### The comp: what the style plays, how the instrument plays it

A style gives the comp **one book per instrument family**, keyboard and guitar
(`Style.comp`), and names the instrument its genre is heard on by default (`Style.prefers`:
bossa on nylon, funk on clav). The instrument (`players/comp/instruments.ts`) adds what is
physical: its range, its strum speed, whether it sustains.
- **Keyboards** voice for two hands (`voicing.ts`). The organ holds each chord to the next.
- **Guitars** play *grips found on the fretboard* (`fretboard.ts`): one note per string, on
  adjacent strings, within a four-fret reach, costed like a keyboard voicing. The invariant
  suite holds every guitar chord to `isPlayable`.
- **The strumming hand is a pendulum**: down on the beat side of its grid, up on the offbeat,
  so direction follows position. An upstroke misses the lowest string only when that note is
  doubled. A muted scratch deadens the grip the hand is holding.
- **Strum is time, so it lives in `feel/`**: a stroked chord rolls low→high (down) or high→low
  (up) at the instrument's `strumMs`, and takes tier-3 placement as one gesture.
- **Who owns the bottom.** With a bass in the band, grips stay above C3 — except the chord's bass
  note itself: the swing shell (`rootBottom`, one muted string skipped: `8x89xx`) puts its root
  on the low strings, doubling the walking bass on purpose. With the bass lane off, a book's
  `alone` shape takes over: rock plays full root-position chords, and the bossa grip carries
  the root on its bottom string while the thumb fills root/fifth between plucks.
- **Idiom physics.** Open strings are off where the idiom mutes by releasing the fretting hand
  (the swing chunk, the funk scratch). A funk chank is staccato. A scratch after an
  anticipation deadens the grip already held, never the old one. An upstroke catches the top
  three strings. The organ holds each chord to the next strike, across barlines, until an N.C.
- **Voicing laws for every instrument.** A written b13, #11 or 13 takes the 5th's seat; 7#9
  plays 3-b7-#9; half-diminished always sounds its b5. Close intervals obey low-interval limits
  (a minor 3rd no lower than C3, a major 3rd no lower than Bb2, …).

Idioms write whole-bar patterns for 4/4 and pulse cells for other meters. Every meter the codec
accepts plays; only 4/4 is idiomatic in v0.

## The live host (`prototypes/v2/lib/band-host.ts`)

`?engine=next` routes the runtime's play, stop and resume paths through `startBand`/`stopBand`
instead of `TOGGLE_PLAY`, so the old worker never starts and its callbacks are ignored. The
host keeps a queue of *segments*, one pass of the song or one lap of a practice loop each, and
schedules everything due in the next 150 ms on a 25 ms timer.
- **Tempo** re-anchors the clock.
- **Style, intensity, lanes, swing, humanize and the comp instrument** regenerate the pass from
  the next barline. The comp instrument follows the chords lane's sound (`COMP_FOR_VOICE` in
  `runtime.ts`); in next mode a native genre's Auto sound is its style's `prefers`.
- **A staged genre** is committed at once.
- **The chart pointer** follows `songTick()` to the written event under it (`slotAt`).

A pass is generated on the main thread (about 5–7 ms for 32 bars on a desktop), two seconds
before it is needed.

Audio (WAV/stem) export renders `BandHost.render()`'s events offline (`lib/band-export.ts`)
through `playBandEvent`, the same voice mapping `BandHost` schedules live with, feel offsets
included. A stem export renders drums, bass and chords (the comp) only. `app/band-lanes.ts`'s
`visibleLanes` drops soloist/harmony from every lane-driven control (transport mute chips, the
Sounds panel).

**The chart sheet** draws a score from the score and its timeline (`prototypes/v2/lib/band-chart.ts`),
not from the old engine's plan, so any chart the timeline compiles opens, edits and plays:
holds show as `/`, N.C. as `N.C.`, a fermata sits over its chord, and off-grid lengths keep
their exact widths. The old engine is given no plan for such a score, so its `arranger` maps
derive empty and its worker idles. Every path that lets a chart onto the stand (open, edit,
import, the guided form) asks `checkPlayable` in `lib/engine-mode.ts`: on the band engine
that is `validateSemanticScore` plus `compileTimeline`, and on the old engine it is still
`prepareScorePlayback`. A measure-less (v1) chart is still drawn from the old maps.

Genres outside v0 play their nearest v0 style (`STYLE_FOR_GENRE` in `runtime.ts`).

## Tests: two harnesses

- `band/test/invariants.test.ts` checks every style × fixture chart × comp instrument (piano,
  organ, guitar, nylon) × 8 seeds, looping and ending, first and second pass. It covers
  determinism, bar and register bounds, velocities, the timing tiers (strum included), no
  pitched onsets under N.C., no same-pitch overlaps, bass arrivals on chord tones, comp chords
  that carry their guide tones, and playable guitar grips off the bass's register.
- `band/test/critique.test.ts` holds one metric library and a table of statistical claims per
  style, harvested from what the old critique suite asserted about these genres, plus a table
  per style on guitar. It prints a report per style.
- Unit specs sit beside their modules (`form/`, `theory/`, `feel/`).
- `npm run band:render` writes `.mid` files and, with `--print=N`, a text grid of the first N
  bars.
