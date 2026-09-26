# The band engine (`band/`)

**Status:** the default engine since the cutover (DECISION 2026-09-25, Brandon), after all 13
genres' rhythm sections and leads passed his ear on `feat/band-engine` (DECISION 2026-09-23).
**Replaces:** the generative engine in `public/engine/` (worker, scheduler, conductor, per-lane
generators) and its critique suite. `?engine=old` still plays the old engine, for comparison,
until it is retired (#1404).

**The cutover (2026-09-25).** The band engine plays every page. Controls the band has nothing
to set are hidden on it: the per-lane style pickers, chord density, soloist mode, complexity
and the harmony lane. Their document fields are kept as written, so a chart opened with
`?engine=old` plays as it did. Live MIDI out was not a cutover item, since v2 never exposed it.

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
- **Gate per genre:** Brandon's ear, on a `/deploy-test` build. Tests prove rules; they do not
  prove taste.
- At cutover, VISION.md's "the engine is kept, not rewritten" is updated. `public/engine`'s
  generators and their tests are deleted once the band has held as the default.

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
- **Keyboards** voice for two hands (`voicing.ts`). The organ holds each chord to the next,
  unless the book is `percussive`: its figure is the part (the reggae bubble is chopped).
- **Guitars** play *grips found on the fretboard* (`fretboard.ts`): one note per string, on
  adjacent strings, within a four-fret reach, costed like a keyboard voicing. The invariant
  suite holds every guitar chord to `isPlayable`. An open-position book (`openPosition`, the
  acoustic strum) plays first-position shapes that ring their open strings (x32010, x02210,
  133211), standing on the root, four fingers at most; a guitar that is the band's bottom may
  make the low-interval limits law for its two lowest voices (`bottomLaw`).
- **The strumming hand is a pendulum**: down on the beat side of its grid, up on the offbeat,
  so direction follows position. A muted scratch deadens the grip the hand is holding; a palm
  mute (`palm`) keeps its pitch — a short, dark chug the host damps to ~80–130 ms.
- **Strum is time, so it lives in `feel/`**: a stroked chord rolls low→high (down) or high→low
  (up) at the instrument's `strumMs`, and takes tier-3 placement as one gesture.
- **Who owns the bottom.** With a bass in the band, grips stay above C3 — except a note that
  doubles the bass's own job: the chord's bass, root or fifth, in a grip whose lowest note is the
  root or the bass. That one shape rule covers the swing shell (`rootBottom`, one muted string
  skipped: `8x89xx`), the metal and punk power chord (`kind: 'power'`, an E2 or A2 root-5-8
  doubling the bass), and an open-position acoustic chord (Am x02210); a third, seventh or
  tension below C3 still fails. A power chord needs no third only on a power-chord style
  (`POWER_CHORD_STYLES` in the invariant suite). With the bass lane off, a book's
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

### The lead: a soloist that knows the whole song (Round 3, DECISION 2026-09-24)

The lead plays after the bass and before the comp, so the comp hears it (`heard.lead`) and can
answer it. It is **off by default** (`BandSettings.lanes.lead`): someone practising wants the
band, not a soloist. A style gives it one book (`Style.lead`) and a default instrument; the
instrument (`players/lead/instruments.ts`: alto sax, trumpet, clean or overdriven guitar,
nylon) adds its range, its home register and whether it bends.

Carried over from the old soloist as laws, not code: a phrase is planned whole before a note is
chosen; strong beats land on chord tones, and a chord change lands on a guide tone, by rule
rather than by weighted chance; motifs belong to phrases and sections, not to single notes;
expression devices take turns rather than stack; one peak note per cycle.

- **Form first.** The lead works out the song's form before any note.
  - The first time through, it plays the **head**: a tune it writes from the changes, keyed on
    the written section, so an AABA chart gets an AABA tune and the head sounds the same every
    time it comes back.
  - Looping, it solos over the next three choruses and brings the head back on the fourth:
    head, solo, solo, solo, head… The three solo choruses are one arc: the first starts low and
    sparse, the second develops, the third reaches the cycle's one peak note, then winds down so
    the head can return.
  - An intro is the band's: the lead enters after it. A section labelled Solo is a solo on any
    pass.
  - **Trading fours** (`Style.trades`; jazz). After the third solo chorus come the fours,
    then the head: head, solo, solo, solo, fours, head… The phrase slots alternate between
    the lead and the drummer, horn first and drummer last, so the drummer's four set up the
    head. A chorus with an odd number of slots trades across two choruses (a 12-bar blues
    trades over 24 bars: L D L, D L D). The third solo chorus doesn't wind down before the
    fours; the exchange keeps its heat. On the drummer's turn the bass, the comp and the lead
    lay out, and the drum idiom plays a solo in place of the time (`DrumBook.trade`), over
    the time's own hi-hat foot, in any meter. The jazz drummer states a two-beat motif on the
    one (the band has just dropped out), displaces it by an eighth onto the toms, plays it as
    accents in a stream of eighths, then runs home down the three toms, louder as he goes, to
    a shot on the "and" of 4. The band comes back in on a crash. The lead's four are one
    phrase played through to an arrival, busy and a little high, never the cycle's peak.
    Nothing rings into the drummer's four: the organ's hold stops, the comp doesn't
    anticipate into it and the bass doesn't approach it, including across the barline into
    the next pass (`performPass` takes the wrap bar's lanes from the next pass's plan). A
    practice loop doesn't trade, and neither does a band without its lead; a pass resumed
    at a barline (a settings change) does.
  - The cycle is the arrangement's (`arrange/cycle.ts`): the plan carries each bar's lead role
    (`BarPlan.lead`), so the lead, the drummer and the rhythm section agree on whose turn it
    is.
- **Phrases, and the space between them.** Each four-bar phrase of the timeline is a slot the
  lead plays in or rests in. A phrase is planned whole at its first bar and kept in memory, so
  any barline can resume it. Most slots leave room: a phrase plays two or three bars and
  breathes, or plays a call and an answer with a gap between.
- **Rhythm before pitch.** A phrase's rhythm is built from the style's rhythm vocabulary (cells
  on the sixteenth grid: bebop eighth-note lines, a blues call, funk stabs), and its last note
  is a long one: an arrival. The style's cells are its dialect, as the comp's cells are.
- **Targets, then the line between them.** Pitches are chosen targets-first. The phrase's first
  note, its last note, and every note that falls on a chord change are *targets*: a guide tone
  (3rd or 7th) at a change, a stable chord tone at the end. The notes between walk toward the
  next target through the style's note pool (the chord scale for jazz, the key's blues scale
  for blues), mostly by step, and the note before a target may approach it by half step or
  enclose it. A contour (arch, fall, climb, wave) sets where the targets sit.
- **Motifs develop.** A phrase's first cell and its contour are its motif. The next phrase may
  repeat it, sequence it onto the new chord, vary its rhythm or answer it; a blues head is
  AAB (a call, the same call over the IV, a different answer).
- **Held notes and changes.** A note held into a chord change is heard against the new chord.
  Struck within an eighth of the change it is an anticipation, voiced for the incoming chord;
  struck earlier, it stops at the change.
- **Articulation.** Vibrato on notes as long as the book says (a guitarist shakes every held
  note, a bebop alto only long ones); a guitar bends into its landings from below (`bendIn`:
  the major 3rd from the blue third, the root or 5th from a whole step); a horn scoops now and
  then. The host plays the lead on today's soloist voices and packs.
- **The comp gives the lead its register.** While the lead sounds, a keyboard voice at or
  above it drops an octave (never below middle C). A guitar grip is a hand shape and stays.

## The live host (`prototypes/v2/lib/band-host.ts`)

The runtime's play, stop and resume paths go through `startBand`/`stopBand` instead of
`TOGGLE_PLAY` (unless `?engine=old`), so the old worker never starts and its callbacks are
ignored. The
host keeps a queue of *segments*, one pass of the song or one lap of a practice loop each, and
schedules everything due in the next 150 ms on a 25 ms timer.
- **Tempo** re-anchors the clock.
- **Style, intensity, lanes, swing, humanize and the comp instrument** regenerate the pass from
  the next barline. The comp instrument follows the chords lane's sound (`COMP_FOR_VOICE` in
  `runtime.ts`); a genre's Auto sound is its style's `prefers`, unless
  `AUTO_VOICE_FOR_STYLE` names another sound for the same instrument (metal: the crunch guitar).
- **A staged genre** is committed at once; `setGenre` then waits for the barline where the band
  first plays it (`BandHost.changeHeard`), so "Switching feel at the next bar" reads true.
- **The chart pointer** follows `songTick()` to the written event under it (`slotAt`).

A pass is generated on the main thread (about 5–7 ms for 32 bars on a desktop), two seconds
before it is needed.

Audio (WAV/stem) export renders `BandHost.render()`'s events offline (`lib/band-export.ts`)
through `playBandEvent`, the same voice mapping `BandHost` schedules live with, feel offsets
included. A stem export renders drums, bass, chords (the comp) and soloist (the lead).
`app/band-lanes.ts`'s `visibleLanes` drops harmony from every lane-driven control (transport
mute chips, the Sounds panel). The `.mid` export is the same stream through `band/sinks/midi.ts`:
the song once through with its ending, a lead track only when the lead played.

**The chart sheet** draws a score from the score and its timeline (`prototypes/v2/lib/band-chart.ts`),
not from the old engine's plan, so any chart the timeline compiles opens, edits and plays:
holds show as `/`, N.C. as `N.C.`, a fermata sits over its chord, and off-grid lengths keep
their exact widths. The old engine is given no plan for such a score, so its `arranger` maps
derive empty and its worker idles. Every path that lets a chart onto the stand (open, edit,
import, the guided form) asks `checkPlayable` in `lib/engine-mode.ts`: on the band engine
that is `validateSemanticScore` plus `compileTimeline`, and on the old engine it is still
`prepareScorePlayback`. A measure-less (v1) chart is still drawn from the old maps. On the
band engine the measure editor can put a fermata on (or take it off) a bar's last event: the flag is
editor state carried across the bar's text round-trip, never encoded in chord text.

Every canonical genre has its own style (`STYLE_FOR_GENRE` in `runtime.ts`).

## Tests: two harnesses

- `band/test/invariants.test.ts` checks every style × fixture chart × comp instrument (piano,
  organ, guitar, nylon) × 8 seeds, looping and ending, first and second pass. It covers
  determinism, bar and register bounds, velocities, the timing tiers (strum included), no
  pitched onsets under N.C., no same-pitch overlaps, bass arrivals on chord tones, comp chords
  that carry their guide tones, and playable guitar grips off the bass's register.
- The critique: one claims file per style (`band/test/claims/<id>.ts`, built with
  `defineClaims`), each a list of *takes* (comp instrument, a fixed energy, bass on or off)
  with statistical claims harvested from what the old critique suite asserted about the genre.
  The shared metric library is `band/test/critique/harness.ts`; a style may define its own
  metrics in its claims file. `band/test/critique.test.ts` runs them all and prints a report
  per take.
- Unit specs sit beside their modules (`form/`, `theory/`, `feel/`).
- `npm run band:render` writes `.mid` files and, with `--print=N`, a text grid of the first N
  bars.
