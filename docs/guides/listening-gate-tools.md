# Listening-Gate Tools

A short tour of the tooling that reduces friction on the synth-audit
"listening gate" — the human step where the assistant can't tell whether
a sound is actually good and the user has to use their ear.

Every render-based command here sits on one pipeline, `npm run mix:report`. None of them
replaces the ear; they only shorten the loop around it.

## What a render is: the band engine (since 2026-09-25)

The tools render **the band engine** (`band/`), the engine every page plays. The old
worker engine no longer runs in the app.

- **The music is composed in node.** `scripts/band-scene.ts` turns each scene into a
  semantic score (its sections' `|`-separated bars, in the chart editor's bar syntax), runs
  `compileTimeline`, then `performPass` once per `--loops` chorus, each pass remembering the
  one before and the last one playing the ending — the stand looping the song, then stopping.
- **The audio is rendered through the render bridge's `renderBand`**
  (`prototypes/v2/lib/render-bridge.ts`), which hands the events to `renderBandPasses`
  (`lib/band-export.ts`) — the same offline render, through the same `playBandEvent` voice
  mapping, as the app's WAV/stem export — and returns raw channels plus a dispatch tap (every
  event with the time, length and level its voice was handed). Two engines run it:
  - **`--engine=node`, the default (since 2026-10-09).** `scripts/mix-render-node.ts` calls
    `renderBand` in node on `node-web-audio-api`, with `scripts/node-webaudio.ts` standing in
    for the browser (the Web Audio globals, the sample packs read from `public/packs/`, and
    a shim for the library's differences — see *Rendering in node* below). No build, no
    browser; metrics are measured with `scripts/audio-analysis.ts`.
  - **`--engine=chromium`.** Unless `--no-build` (a no-op on the node engine), `mix:report` builds `prototypes/v2` at
    `ENSEMBLE_V2_BASE=/` with `NEXT_PUBLIC_RENDER_BRIDGE=1` (`next build --webpack` +
    `scripts/offline.mjs`, which copies the sample packs), serves `prototypes/v2/out`, and
    drives Chromium; the bridge is on `window.ensemble` and the metrics are measured in the
    page. This is the render the app itself makes — use it for the final check of a change
    whose point is how Chromium's nodes behave, and for a bit-level A/B against an app export.
  The report is built in node either way (`mix-report-utils.ts`). `mix:verify`, `mix:ab` and
  `mix:spectro` pass `--engine=` through to the `mix:report` they drive.
- **A Chromium build overwrites the same `out/` the v2 Playwright suite serves**, so rebuild
  (`npm run build --prefix prototypes/v2`) before trusting that suite after a Chromium mix
  report. A normal build compiles the bridge out: grep `out/` for
  `ensemble-band-render-bridge` — it appears only in a bridge build.

**Scene → band settings.** Style from the scene's `genreFeel` (one of the 13; anything else
is refused), and since 2026-10-10 (#1563) the clone's `groove.genreFeel` too, which is what
`initAudio` builds the bus EQ from — a Jazz scene's bass now meets the Jazz highpass at 55 Hz
and its shelves, as it does on the stand. Before that the clone kept the host's genre (Rock),
so Jazz scenes' spectral numbers from before #1563 are not comparable with later ones. Energy: `intensity`, held for the whole render (default 0.7). Seed:
`<sceneId>:<seed>` for the band, and the same string seeds `Math.random` for the voices' own
humanising, so a render repeats. Lanes: all on, unless `includeDrums`/`includeBass`/
`includeChords`/`includeSoloist` is `false`. Sounds: every lane plays **the synth** unless a
scene pins one (`voices: [{ module, voice: 'pack:<id>' }]`, modules `groove`, `bass`,
`chords`, `soloist`). The comp instrument is the scene's `comp`, else the instrument the
pinned chords sound names (`pack:nylon-guitar` → nylon grips, the stand's own rule, from
`lib/band-voices.ts`), else the style's; the lead instrument likewise (`lead`, the soloist
pack, the style's). `swing` and `humanize` are optional overrides; left out, the style's own
feel plays.

**Stems.** The band's lanes: `drums`, `bass`, `chords` (the comp), `soloist` (the lead), each
alone, plus `full+solo` (the whole band) and `full` (the band with the lead lane off, as a
musician practising hears it — the comp plays differently when it has a lead to answer). The
solo stems are cut from the whole-band performance, as the app's stem export cuts them. The
ids keep their old names so reports, `mix:diff` baselines and `--stems=` filters still read.
**There is no `harmony` stem**: the band has no harmony lane.

**Dropped in the port, and why.**

- Old-engine scene fields are accepted and ignored — `drumPreset`, `complexity`,
  `chordStyle`/`bassStyle`/`soloistStyle`/`harmonyStyle`, `density`, `includeHarmony` — the
  band has no such setting (a style is a genre's whole identity). A `harmony` voice pin is
  dropped for the same reason.
- The old loop-arc intensity broadcast (`loopArcMultiplier` on `bandIntensity` per loop) is
  gone: the band plans its own form, and a scene's energy is held fixed.
- `mix:verify`'s intent → dispatch parity block (below) and the `intentEvents` /
  `sharedCatchEvents` streams in the event dump: old-engine stages with no band counterpart.
- The `harmony` findings (voice cap, retriggers, sharp edges, top-end air) and the `harmony`
  entry in `--cohesion`'s sample band.

## Rendering in node (`--engine=node`, `npm run render:node`)

`scripts/node-webaudio.ts` is what lets the engine run in node: it installs `node-web-audio-api`'s
classes as the Web Audio globals, serves `/packs/` from `public/packs/` on disk (each `.m4a`
decoded once through ffmpeg into `tmp/node-webaudio/`, because the node decoder refuses the
packs' non-faststart layout and does not trim AAC priming, which put every sampled note ~23 ms
late), and corrects three library differences found with a node-vs-Chromium parity probe over
identical graph snippets — its comments say which: `setTargetAtTime`/`setValueCurveAtTime`
evaluated before their start time (a release at 0.5 s multiplied the whole sustain by
e^(0.5/τ)), and built-in `sawtooth`/`square` 1.4 dB hotter than Chromium's.
`tests/scripts/node-webaudio-automation.test.ts` holds the shim to the spec's envelope formulas
and to Chromium's oscillator levels; `tests/scripts/mix-render-node.test.ts` renders a stem
through the backend in the unit suite.

`npm run render:node -- <scene> <seed> <dir> [--scenes-from=<json>] [--stems=a,b] [--mute-reverb]`
writes a scene's stem WAVs through the same backend without the report — the quick way to get
audio to look at.

**Measured against Chromium (2026-10-09, `funk-pocket` / `MIX_AUDIT`, and the same scene on
the sample band).** `mix:verify`'s checks give the same verdicts on both renders (drums
106/113, chords 36/36, soloist 28/28 with pitch confirmed 100%, bass 43 vs 46 matched — the
muted-note class at the detection floor). Every lane's level is within 1 dB. A sampled lane is
sample-identical after a constant 176-sample (4 ms) offset from the master chain's compressor
and waveshaper latencies (aligned correlation 0.99–1.00, residual −46 to −52 dBFS). A synth
lane keeps its energy, spectrum and timing but not its exact waveform: node's compressor passes
loud transients about 2 dB hotter, its `WaveShaper` `4x` oversampling is its `2x`, and the
reverb's feedback combs differ in detail. So: read levels, spectra, presence and timing off a
node render, and compare node against node; a node render subtracted from a Chromium one
measures the engines, not your change. Two node renders of one request agree to ~4e-6
(−108 dBFS) — float summation order across the library's render threads, visible only under
CPU load, the same class as Chromium's −99 dBFS floor below — and the one real cross-render
state is #1552's (4.5e-2, on the synth kit's cymbals).

**`npm run webaudio:parity` is where those numbers come from.** `scripts/webaudio-parity.ts`
renders the same graph snippet in node (through the shim, so the shim is under test) and in
headless Chromium and compares them per probe: RMS and peak delta, best lag, aligned
correlation, residual, with `<<<` past 0.5 dB or under 0.98 correlation. `--mode=envelope`
samples gain envelopes over time, `--mode=latency` tracks an impulse through each node type,
`--probe=a,b` runs a subset, `--json` for a script. About 10 s. Re-run it after a
`node-web-audio-api` bump; the two residuals it should still flag today are `compressor`
(−1.1 dB on a steady tone, +2 dB on transients, 120 samples less latency) and `delayComb`
(the reverb's feedback combs, correlation 0.86).

**`mix:diff` across engines flags real engine differences, not noise.** The spectral probes
average every consecutive 4096-sample window of the stem's active region, which starts at the
first sample above −60 dBFS (`computeSpectralProbes`, #1556). Until 2026-10-10 they measured
four windows from a −80 dBFS floor, and the few LSB a render's master chain emits before the
first note moved the windows onto different bars per engine (bass sub/low read 33/50 in node,
57/24 in Chromium). On `funk-pocket` / `MIX_AUDIT` the two engines now agree within 3 points on
every band of every stem. `mix:diff`'s ±5% is relative, so it still flags the small bands
(presence, air: shares under 2%) at 6 to 10%, which is the engines' real difference.
**Spectral numbers from before 2026-10-10 are not comparable** with numbers from after; re-make
a `mix:diff` baseline instead of reading an old one.

**Speed.** The pack scene's six stems render in 9 s; the all-synth scene's take 70 s, against
86 s for `--engine=chromium --no-build` on the same scene plus the Next build when the bridge
export is stale. node-web-audio-api's cost scales with node count (the synth chords build 11
oscillators per event).

## `npm run live:capture` — record the LIVE transport, then measure it

Every other tool here renders offline. `scripts/live-capture.ts` (#1562) records what the stand's
real `AudioContext` plays: it serves the bridge export, opens the stand on a `mix:report` scene
(the same link `audition-link` builds), presses Play through `window.ensemble.transport`, taps
the master limiter through `window.ensemble.capture` for N bars of wall-clock time, presses
Stop, keeps recording through the release, and writes `tmp/live/<scene>-<seed>.wav` plus a
markers file (the audio-clock time of `play`, `scheduled` and `stop`, and where each lands in
the samples). The transport and the tap exist only in a bridge build
(`NEXT_PUBLIC_RENDER_BRIDGE=1`); a production build compiles them out with the rest of the
bridge, and `grep ensemble-band-render-bridge prototypes/v2/out` stays empty.

```bash
npm run live:capture -- --scene=funk-pocket --bars=8          # needs a bridge build (mix:report --engine=chromium leaves one)
npm run live:capture -- --scene=jazz-ride --bars=4 --build    # build it first
npm run live:capture -- --scenes-from=scenes.json --scene=my-scene --json
```

Four checks (`scripts/live-checks.ts`, unit-tested on synthetic signals), each a number against
the threshold it states, never a verdict on how it sounds:

| Check | What it reads | Catches |
| :- | :- | :- |
| stop silence | RMS 1.2–1.6 s after Stop against −60 dBFS, the 0.4–0.8 s tail for scale, and the time to fall under the floor; NOT VERIFIABLE when nothing sounded before Stop or the capture ends inside the window | a voice Stop never released (#1530) — the reverb's tail is the room, so the judged window sits past it |
| stop click | the largest `measureDiscontinuity` in the 400 ms after Stop, against `CLICK_DISCONTINUITY` | a hard cut at Stop |
| tempo | onsets in the steady region against the nominal sixteenth grid (its phase the circular mean of the onsets, so a swung offbeat cannot drag it): median deviation, drift in ms per bar, and the tempo they describe. The deviation carries the style's swing and humanise feel; read it against those, not as error | the metronome-core promise, in numbers |
| live/offline | the same scene rendered offline on the sounds the stand actually played (`transport.voices()`), compared on RMS and dense band shares over the same whole bars | a live path that differs from the export (#1531: 2.5 dB) |
| same take | with `--match=live` (the default), the offline side is the stand's OWN performance recomposed — its score, settings and seed, one looping pass — so the two sides align sample for sample: lag, correlation and residual in dBFS | what the live path adds or removes, with the performance held equal |

**Two ways to build the offline side.** `--match=live` (the default) recomposes the stand's own
performance from the score, settings and seed `transport` reports, so the comparison holds the
music equal and reads the path: on `funk-pocket` it put live against offline at +0.1 dB and
within 1.3 points per band for the whole band, −0.0 dB for drums alone (2026-10-10). The
aligned correlation sits near 0.7 because the voices humanise with `Math.random` live and the
seeded sequence offline — expected, not a defect. `--match=scene` composes the scene's settings
and seed as `mix:report` does, so the comparison also carries whatever the stand does
differently: that is how #1564 was found. The offline side uses the `full` stem (the lead lane is
off by default on the stand), minus any lane `--off=` switched off. Both sides skip their first bar and
cover the whole bars the stand got through before Stop; the stand counts a bar in by default
(`playback.countIn`), which the script reads and skips. Playback is real time: eight bars at
104 bpm is eighteen seconds, nineteen with the count-in.

**Two facts about the tap worth knowing.** `ScriptProcessorNode`'s `playbackTime` names when
its *output* plays; the input block it hands over was rendered two buffers (186 ms) earlier, and
the anchor corrects for that — measured by the count-in's first click, scheduled 100 ms after
Play, landing at +287 ms before the correction and +76 ms after (the marker itself is taken a quantum or two after the schedule). And the processor runs on the
main thread: a late block is counted as a dropout and the run warns, because the capture then
has a seam that reads as timing.

The run also prints the stand's `BandSettings` against the scene's (`sceneSettings`): a
difference there is a reason the two performances differ before any audio is compared.

**Measured on the first runs (2026-10-10, `funk-pocket`, 8 bars, the stand's default synth
sounds):** the live clock held a 0.6–1.0 ms median deviation from the sixteenth grid and under
0.35 ms/bar of drift (103.98–104.01 bpm against 104); no click at Stop; the band fell under
−60 dBFS 0.8 s after Stop with a −35 dBFS reverb tail at 0.4–0.8 s. Live against the page's own
offline render of the same state: drums alone and drums + bass agree within 3 points per band;
with the comp on, the live mix carries 17 points more sub and 11 less low — because the stand
plays the comp on **piano** (`bandSettings()` maps the synth chords voice to piano) while the
tools render the style's preferred **clav** (#1564). Those first runs also read live 0.4–1.7 dB
above offline; `--match=live` showed that to be take-to-take variance, not the path (#1565,
closed on the measurement). `--off=` is how the lanes were separated: switch lanes off on the
stand and the offline side follows. `jazz-ride` had too few onsets in the full mix for the
tempo fit.

`--offline=node` renders the reference in node from node's default state instead; use it to
compare the stand against what `mix:report` measures, knowing #1563 (the clone's genre) and the
stand's preferences (humanize 20 against the funk style's 25) sit in that difference too.

## `npm run mix:report`

Prints, per scene and seed, a per-stem table (peak/RMS/crest, transients, schedule pressure,
spectral probes, stereo) and a `Findings:` line. The scene header names what played:
`style jazz · comp piano · lead sax`.

```bash
npm run mix:report                                  # the four default scenes, rendered in node
npm run mix:report -- --scene=jazz-ride --seeds=ALPHA,BETA
npm run --silent mix:report -- --json --scene=funk-pocket > report.json
npm run mix:report -- --engine=chromium --scene=funk-pocket   # the app's own render, built + driven headless
```

The default scenes are `rock-backbeat`, `blues-shuffle`, `jazz-ride`, `funk-pocket`
(`DEFAULT_MIX_REPORT_SCENES`). The schedule columns come from the dispatch tap, over the first
pass: `maxVoices` (most notes sounding at once), `retriggers` (a pitch struck again before it
ended), `steals` (a note landing with the stem's `voiceLimit` already sounding).

### `--calibrate-pack=<module>:<packId>` — sample-pack gain calibration

Renders the pack's lane twice per scene and seed — once on the synth, once on the pack — and
prints the RMS difference and the gain that sets the pack's RMS to the synth's, against the
catalog `gain` in `public/data/sound-packs.ts`. Modules: `groove` (drums stem), `bass`,
`chords` (the comp), `soloist` (the lead); anything else is refused before the build.

```bash
npm run mix:report -- --calibrate-pack=chords:grand
npm run mix:report -- --calibrate-pack=bass:upright-bass --scene=funk-pocket
```

Both legs play **the same performance**: the pack decides the instrument the band plays for
both (a `pack:nylon-guitar` calibration plays nylon grips on the synth leg too), so the only
difference is the sound. A pack that fails to load prints `✗ … failed to load` and exits 1 —
the render never passes the synth fallback off as pack evidence.

### `--cohesion` — all-synth vs all-sample band

Renders `full+solo` on every lane's synth, on the sample band (`COHESION_SAMPLE_BAND`: grand,
alto sax, acoustic kit; bass stays synth), and on the sample band with reverb sends zeroed, and
prints side-ratio, crest and the reverb's wetness. One performance for all three legs.

## `npm run mix:report -- --write-wav=<dir>`

Renders each scene/stem/seed combination to a 16-bit stereo PCM file
(`{sceneId}-{stemId}-{seed}.wav`) in the given directory while the
existing metric pass runs. Lets you audition the rendered output
without spinning up the live app or pinning the right preset by hand.

```bash
npm run mix:report -- --write-wav=tmp/mix-render --scene=jazz-ride --seeds=ALPHA
```

Output dir is gitignored under `tmp/`.

The per-stem table includes `corr` (Pearson L/R correlation, 1.0 = perfectly
mono) and `sideRatio` (fraction of energy in the side channel, 0 = mono, ~0.5
= maximally wide). Useful for catching mixes that have shrunk to the center
without anyone noticing.

Pass `--loops=N` (default 1) to render each scene through N choruses: band passes, each
remembering the one before, so the lead's form expresses (its head on pass 0, three solo
choruses as one arc, the head again on the fifth). Each stem then reports per-loop RMS in dB
(`loopDb` column) and an `arc` classification: `flat` (under 1.5 dB swing), `front-loaded`,
`building`, `arc`, `dip`, `irregular`.

### `--scenes-from=<file.json>` — render externally supplied scenes

Renders a JSON array of scene objects (shaped like the `DEFAULT_MIX_REPORT_SCENES`
entries in `scripts/mix-report-utils.ts`, fields as in the settings list above) instead of
the built-in catalog. Required per scene: `id`, `genreFeel`, `bpm`, `key`, and a non-empty
`sections` array whose entries carry a `value` progression string (`'A7 | D7 | …'`, the
chart editor's bar syntax, so `C:2 G7:2` splits a bar). `label` defaults to the id,
`intensity` to 0.7, `timeSignature` to `4/4`; `findingThresholds` falls back to the
genre-agnostic defaults. Unknown fields pass through untouched, so an external spec's own
metadata rides along. Mutually exclusive with `--scene`/`--scenes`/`--focus-from`.

This is the fixture-factory entry point for the songsiknow analysis harness
(#1349): combined with `--write-wav` + `--write-events` it renders per-stem
audio whose musical truth (the event stream + the scene spec) is known by
construction. The render is *musically* deterministic per seed — the band's events are
byte-identical across runs — but WAVs can differ by a few LSB of int16 (OfflineAudioContext
float jitter), so fixture consumers should render-once-and-freeze rather than re-render and
expect byte equality.

```bash
npm run mix:report -- --scenes-from=/path/to/scenes.json \
  --write-wav=tmp/fixtures --write-events=tmp/fixtures --seeds=FIXTURE_1
```

## `npm run --silent mix:diff -- before.json after.json`

Compares two `mix:report --json` outputs and surfaces stems whose
dynamics or spectral balance moved beyond a configurable threshold.
The goal isn't to judge "better" vs "worse" — that's still your ear —
but to flag the stems where something actually changed since the
baseline so you don't audition identical renders.

Defaults: ±1.5 dB on peak/RMS/crest, ±5% relative on the six spectral
probe bands, ±1.5 spikes/sec on transient rate. Override with
`--threshold-db=`, `--threshold-spectral=`, `--threshold-spikes=`.

Exits 1 when at least one stem is flagged, so a future CI run can gate
on this directly.

```bash
npm run --silent mix:report -- --json --scene=jazz-ride --seeds=ALPHA > before.json
# ...make engine changes...
npm run --silent mix:report -- --json --scene=jazz-ride --seeds=ALPHA > after.json
npm run --silent mix:diff -- before.json after.json
```

## `npm run --silent audition-link -- --scene=<id> [--seed=<seed>]`

Builds a URL that opens the named scene in the app — chart, key, meter,
tempo and genre already set — so a listening pass is "click link, press
play" instead of "open the app, pick the genre, the key, the BPM, type
the progression, press play."

```bash
npm run --silent audition-link -- --scene=jazz-ride --seed=ALPHA
# → http://localhost:3100/v2/?prog=Dm7+%7C+G7+...
```

The default base is the v2 dev server (`npm run dev --prefix prototypes/v2`)
at its default `/v2` base; for the site use `--base-url=https://ensemble.brndn.zip/`.
Available scenes are the same four shipped with `mix:report`:
`rock-backbeat`, `blues-shuffle`, `jazz-ride`, `funk-pocket`.

**What the app reads (#1358, extended #1382).** Since the cutover the link is opened by
v2's old-link reader (`prototypes/v2/lib/v1-link.ts`, #1279), which takes
`prog`, `key`, `ts`, `bpm` and `genre` and opens them as an unsaved
shared chart. It also reads `int` — the chart opens with its energy pinned to that
level instead of `'auto'` — and `bnd`'s `--on`/`--off` part switches for `soloist`,
`bass` and `chords`, applied as that lane's mute state. `autoplay=1` doesn't play
immediately (browsers block audio before a gesture): the stand shows a "tap anywhere
to play" hint and starts on the first pointer or key event anywhere on the page.
`--density` and everything else `bnd` can carry (style, octave, volume, reverb) stay
**ignored** — those are the genre's own settings, re-picked in the Feel/Sounds panels,
not something a link should override. `--on=`/`--off=harmony` is accepted by the CLI
but has no effect and the script says so on stderr: the band engine has no harmony
lane and no v2 surface shows a control to mute one. `?seed=` is inert too (v2 re-rolls
it on play) and always was — that one was never part of the dropped-fields warning.

### Ad-hoc scenarios — a link per listen-checklist line

`--prog` replaces `--scene` with any progression in any genre, which is
what turns a `verify-by-ear` checklist line into something clickable.
Post the links as an issue/PR comment next to the line they audition:

```bash
npm run --silent audition-link -- --base-url=https://ensemble.brndn.zip/ \
    --prog="C | C+ | C6 | C7" --genre=Jazz
npm run --silent audition-link -- --base-url=https://ensemble.brndn.zip/ \
    --prog="Cm | Cmb6 | Cm6 | Cmb6" --genre=Neo-Soul --ts=6/8 --bpm=90
```

Flags the app reads: `--genre` (one of the 13, validated), `--key`,
`--ts` (e.g. `6/8`), `--bpm` (omit to leave tempo to the app), `--int`
(clamped 0-1), and `--on=`/`--off=` with `soloist`, `bass` or `chords`
(switched on or off on open). Flags it still ignores: `--density=thin|standard|rich`
and `--on=`/`--off=harmony` (no harmony lane in the band engine).
`tests/scripts/audition-link-roundtrip.test.ts` feeds generated links
through the app's reader, `lib/v1-link.ts` (v1's `loadFromUrl` is gone, #1424); the v2
Playwright suite (`prototypes/v2/checks/audition-link-fields.spec.ts`) checks the
fields it applies in the browser.

## `npm run mix:analyze -- <file> [<file> ...]`

Runs the same spectral / stereo / RMS analysis as `mix:report` on an arbitrary
audio file path. Used to calibrate engine output against professionally-mixed
reference tracks. Anything ffmpeg can decode (mp3, wav, flac, m4a) is accepted;
files are internally decoded to 48 kHz stereo / f32le.

```bash
npm run --silent mix:analyze -- ~/Downloads/*.mp3
npm run --silent mix:analyze -- --json reference.wav > calibration.json
```

A `--loops=N` flag enables per-loop arc analysis on a single render that
contains N choruses of the same length. Reports the same per-stem column
shape as the table block from `mix:report` plus a `Findings:` summary using
the **genre-agnostic** `DEFAULT_FINDING_THRESHOLDS` — these are looser than
the per-scene thresholds in `DEFAULT_MIX_REPORT_SCENES` and are tuned not to
false-positive on pro reference mixes.

`scripts/calibration/calibration.json` is the persisted reference baseline
(Miles Davis "So What" / Chic / STP / B.B. King), used to calibrate the
per-scene thresholds at `scripts/mix-report-utils.ts`. It is tracked in git —
the WAV renders it was measured against stay disposable under `tmp/references/`.

## `npm run --silent mix:verify -- --scene=<id>`

Reconciles the **band's events, as their voices received them** against the **rendered
audio** for the same seed, and prints a per-stem table. This is the one tool here the assistant
can read directly: it answers audible-fact questions in text, without an ear.

```bash
npm run --silent mix:verify -- --scene=funk-pocket
npm run --silent mix:verify -- --scene=jazz-ride --stems=bass,drums --loops=2   # --stems filters the REPORT, not the render
npm run --silent mix:verify -- --scene=rock-backbeat --keep=tmp/ears   # keep WAVs + events
npm run --silent mix:verify -- --scenes-from=scripts/scenes/funk-bass-ladder.json --stems=bass --loops=1 --json
```

It drives one `mix:report --write-wav --write-events` render, then runs the pure
checks in `scripts/audio-verify.ts` over each stem:

| Reported | What it catches |
| :- | :- |
| `expected` / `matched` / MISSED | a scheduled note that never sounded — mute voice, dropped hit, buried in the mix |
| UNSCHEDULED onsets | audio nothing asked for; flagged `→ click?` when the discontinuity ratio ≥ 1.0 |
| graph latency | the render's constant output delay, measured and removed before any timing claim |
| median deviation | per-note timing against the grid after latency removal (pocket as a number, not a feel) |
| vel→peak r | whether the loudest hit of each attack reaches the output at the level its velocity asked for |
| pitch confirmed | share of the judged attacks whose written pitch is what sounds. Three methods by what the attack is (#1568): a single note held ≥ 150 ms is *measured* (`measurePitchCents`, any register); a chord held ≥ 100 ms is checked note by note against its loudest (`voicingMatch`); a short single note keeps the 80 ms probe, MIDI 69 and up only |
| PITCH | what the rate is made of: `36/36 held notes, 8/8 short notes, 36/36 chord voicings confirmed` |
| PITCH NOT CONFIRMED | each held note that failed, with the reason (a semitone or more away; a lower note under it; odd partials missing; another note louder). A bend or a slide lands here honestly |
| TUNING | median \|cents\| from the written pitch over the confirmed held notes, and the worst note |
| OFF-PITCH | written pitches whose notes read more than 10 cents out (median, at least two notes): the mis-rooted sample zone of `public/engine/CLAUDE.md` rule 24. A smooth ramp across the register is a piano's stretch tuning, not a bug |
| QUIET (intended) | attacks whose events are all deliberately attenuated (`levelScale ≤ 0.2` — the old engine's 0.15 palm-mute floor plus margin, kept tight so a half-muted dropped note still reads MISSED; the band's muted bass note carries 0.2775, `muteGain(0.85)`, so it is *not* excluded — see the blind spots) and show no rise — excluded from the match-rate denominator, printed so the exclusion is never silent |

**No intent → dispatch stage on the band engine.** The old engine generated notes into
lane buffers that a scheduler later consumed behind its own gates, so #1351 added an
`intent → dispatch` parity block to catch a note dropped between the two. The band is one
event stream: `performPass` produces it and the render hands every event to
`playBandEvent` — the event dump *is* the dispatch tap — so there is no stage between them
to reconcile, and the block (and the dump's `intentEvents`) was removed with the port.
Everything the band decided is checked against the audio by the table above.

**`--json`** prints the full structured results instead of the table: per stem,
everything above plus a per-attack `attacks` array
(`step`/`time`/`midis`/`level`/`attenuated`/`present`/`riseDb`/`peak`) — so a
story can group musical positions and assert rendered relationships (intensity
ladders, The-One-vs-pop salience) without scraping text.
`scripts/scenes/funk-bass-ladder.json` is the standing fixture for exactly that:
a 3-rung intensity ladder × {synth, `pack:upright-bass`} funk-bass scene set
(external scenes can pin lane voices via a `voices` array — event capture stays
on, unlike the `--calibrate-pack` voice-override path). Its old-engine fields
(`drumPreset`, `complexity`, `includeHarmony`) are ignored on the band.

**Scope limit, stated deliberately.** The events and the audio come from the same
code path, so `mix:verify` cannot catch a bad *musical decision* — only a decision
that failed to become sound. Musical-decision claims stay gated by the band's
critique and invariant suites (`band/test/`). What it adds is the half those tests
structurally cannot reach: a claim passes on velocity math while the render buries
the note.

**It emits no verdict.** Every metric it cannot measure prints as
`NOT VERIFIABLE: <metric> — <reason>` rather than being quietly omitted, and there
is no aggregate pass line anywhere in the output. A clean table means "nothing
measured here is broken", never "this sounds good" — that judgment stays with the
listening gate (DOCTRINE §5).

**Mixed stems make no presence claim at all.** `full` and `full+solo` print
`presence NOT VERIFIABLE` rather than a match percentage: attacks are clustered
across lanes and presence is a band-energy rise, so a kick landing with a bass note
satisfies the bass note's evidence. Measured — muting the bass lane entirely on a
`full` render still scored 100%. **Read the solo stems for any presence claim.**

**Known blind spots** (measured, not guessed — check these before trusting a report):

- **A click buried in loud material is invisible.** One impulse contributes almost
  nothing to a 1024-sample frame's *energy*, so novelty detection misses it at any
  offset. Clicks in gaps are caught. A dedicated discontinuity scan was tried and
  rejected: noise-based percussion legitimately reaches a delta/peak ratio of ~1.36
  against a real click's ~1.96, too narrow to separate without proper bandwidth
  estimation.
- **A deliberately quiet note under a louder tail reports as MISSED.** This is the
  big one, and it produced a wrong bug report before it was understood. On funk bass
  the whole gap between its ~82% rate and the kit's 100% is the **slap "chuck"**
  (`bass-styles.ts`): a dead note that emits `muted: 1`, so it plays at
  `vol × 0.15` — exactly −16.5 dB — with a halved cutoff, landing 144 ms after a note
  still ringing 17–28 dB above it. It is 27% of that lane's notes. **The note sounds;
  presence detection cannot see it.** `mix:verify` measures a band-energy *rise*
  across the onset, and a note 17 dB below the ongoing tail does not produce one.
  Confirmed by instrumenting the render: 161 scheduled notes → 161 voices built and
  started, zero early returns. (That measurement is the old engine's. The band's funk
  bass has the same class: its muted notes play at `muteGain(0.85)` = 0.2775 and are 13
  of the 13 misses on `funk-pocket`; see the band measurement below.)

  Two traps this exposed, both worth knowing before trusting a MISSED report:
  **(1)** ~~the bass visualizer payload omits velocity, so the tool cannot tell an
  intentionally-quiet note from a failed one — it has no way to expect −16.5 dB.~~
  **Closed 2026-08-03 (#1351):** bass/soloist/harmony dispatch events now carry
  `renderVelocity` (the exact post-conductor scalar the voice received) and bass
  carries `levelScale` (the numeric `muteGain`), so the chuck class above now
  prints under `QUIET (intended, unverifiable)` instead of MISSED, leaves the
  match-rate denominator, and `vel→peak r` is computable on the bass lane.
  **(2)** Do not try to rescue this by band-splitting for the attack transient.
  `playPercussiveStrike`'s centre frequency is `Math.max(200, …)` and pins to the
  200 Hz floor for a low-E bass note, so a split above that measures a band the
  transient is not in — and the transient carries the same ×0.15 mute anyway, so it
  is not level-independent either. That reasoning produced a confident, wrong
  "the voice never executes" conclusion (see #1284).

  **Quantified 2026-07-31, when #1284 was re-opened and re-investigated on the same
  wrong premise a second time.** If you are here because the funk bass lane reports
  ~80%, stop and read this instead of instrumenting the voice again:

  | | count |
  |---|---|
  | MISSED notes carrying `muted: 1` | **16 / 16** |
  | MISSED notes carrying `muted: 0` | **0 / 16** |
  | MATCHED notes carrying `muted: 0` | 61 / 65 |

  The lane emits exactly two values — 61 × `0`, 20 × `1`. **The control group is the
  proof, not the correlation:** the four remaining `muted: 1` notes (steps 13, 31, 45,
  77) *did* match, at +24.6 to +31.6 dB. Their only distinguishing property is a
  **263–464 ms** gap after the previous note ended, versus 29–174 ms for all sixteen
  missed ones. A chuck landing in silence is detected loudly; the same chuck landing
  under a decaying note is not. There is nothing to mask it, so it reads.

  Mutation test on `MUTE_ATTENUATION` (which feeds *only* `vol` — cutoff and
  `releaseTime` read the raw amount, so voice construction was byte-identical across
  all three renders and level was the sole variable): at `0` (chuck at full level) the
  lane goes **65 → 77 matched**; at `1.0` (`vol → 0`, tripping the `vol < 0.005` bail,
  i.e. a genuinely silent chuck) it drops to **61**, all 20 muted notes missing. A gain
  constant cannot resurrect 12 of 16 notes if the voice never retriggered.

  **The residual ceiling, worth knowing before you chase the last four.** Steps 1, 17,
  33 and 65 stay undetectable *even at full gain* (0.58–1.38 dB, under the 2 dB
  threshold). They land ~29 ms after a full-velocity **same-pitch** note, so they are
  not a *rise* over what they replace at any level. That is a limit of rise-based
  presence detection, not a defect in anything it is measuring — a lane whose idiom is
  the repeated sixteenth has a floor on what this method can verify.
- **Pitch is not judged on a short low note, and octaves are only half seen.** A single
  note held under 150 ms below roughly **MIDI 69** gets no pitch claim (the 80 ms probe
  cannot tell it from its neighbors: measured, it confirmed 8 of 10 *wrong* pitches), and
  neither does a chord held under 100 ms or with fewer than two separable notes (an
  octave dyad, a low root under one high note); the report counts them under
  `NOT VERIFIABLE: pitchOfShortNotes`. A held single note is checked against the octave,
  the fifth and the fourth either side (probing five scenes' notes at ±2, 5, 7 and ±12
  semitones confirmed none). A **chord** is not: a wrong note an octave or a twelfth from
  a right one passes, a wrong note that lands on another written note's partial is not
  judged, and 3% of semitone errors passed. The chord check reads pitch, not tuning.
- **A tuning readout is the median, not a verdict on one note.** A bend, a slide or
  vibrato moves a note off its written pitch on purpose and shows as the worst note or
  under PITCH NOT CONFIRMED. `OFF-PITCH` needs two notes on the same pitch to agree.
- **`vel→peak r` only sees each attack's loudest hit.** Both the velocity and the
  peak collapse onto whatever dominates — on a kit, the kick. A ghost hat whose
  accent fails *under* a louder hit (the #1273 class) does not move this number;
  catching that needs a per-piece, per-band probe that does not exist yet.
- **An early note reads as a dropped note; a late one inside ±25 ms is invisible.**
  The evidence window looks back 20 ms, so a note rushing by ~15 ms puts its own
  attack in the "before" window and cancels its own rise.
- **A treble event quieter than the low band's leakage** (~`f/800Hz` of the low
  content) cannot be separated from it and reads as absent.

**The renderer is not bit-reproducible.** Two runs at identical config and seed
differ by up to ~7e-4 dB on per-stem peak/RMS/crest. That is far below audibility
and below anything `mix:verify` asserts on, but it means "identical render" has a
noise floor rather than being exact — worth knowing before building any tool that
diffs two renders. (Enabling `--write-events` perturbs the output by ~7e-5 dB,
an order of magnitude *inside* that floor, which is how it was confirmed to be a
passive tap rather than something that changes the render.)

Implementation note worth knowing before extending it: the **dispatch** stream is the
render bridge's tap (`onSchedule` in `renderBandPasses`), one entry per event, taken at
the moment it is handed to its voice — render-absolute time with the feel layer's
`offsetMs` included (the ±25 ms match needs the real play time), written length,
`velocity` (MIDI velocity / 127), `renderVelocity` (the scalar the voice received,
`bandEventLevel` in `band-host.ts`), `levelScale` (a muted bass note's mute gain) and the
bar. A drum hit carries its General MIDI key as `midi`, and its `piece`. `events` remains a
compatibility alias for `dispatchEvents` (`mix:ab` reads it), and the dump says
`engine: "band"`.

**Measured on the band (2026-09-25, `funk-pocket`/`MIX_AUDIT`):** bass 44 of 57
attacks matched — all 13 misses are muted notes (level 0.12–0.13, i.e. `levelScale`
0.2775), the documented quiet-note-under-a-tail class; drums 106/113 (the misses are
one hat per bar, step 5); chords 36/36; soloist 28/28 with pitch confirmed 100%. Every
stem also reports one UNSCHEDULED onset at 0.040 s flagged `click?`: it is a 1 LSB
(−90.3 dBFS) floor that starts ~20–40 ms into every render, before the first note — the
onset detector's ratio test on near-silence, not an audible click.

## `npm run --silent mix:spectro -- --scene=<id>`

Emits a **spectrogram contact sheet**: every stem stacked vertically on one shared,
bar-numbered time axis, as a single PNG. Where `mix:verify` answers questions that
reduce to a scalar, this one exists for the ones that do not — density, masking,
mud. "The chords are smearing the snare" is a claim about two lanes occupying the
same band at the same instant, and the honest way to settle it is to look at both.

```bash
npm run --silent mix:spectro -- --scene=funk-pocket
npm run --silent mix:spectro -- --scene=jazz-ride --stems=bass,drums,full
npm run --silent mix:spectro -- --scene=funk-pocket --range=bar3..bar5   # the click-hunting zoom
npm run --silent mix:spectro -- --from=tmp/ears --out=tmp/sheet.png      # replay an existing render dir
```

It drives one `mix:report --write-wav --write-events` render (or replays a directory
with `--from`), draws one `showspectrumpic` panel per stem, and composites its own
grid, bar numbers and stem labels on top. Defaults to `tmp/spectro/`.

**Two decisions worth not undoing:**

- **`legend=0`, always.** With ffmpeg's legend on, the plot is inset by undocumented
  margins and a grid drawn in image pixels lands off the audio it annotates — a bar
  line that is confidently, invisibly wrong. With it off the image *is* the plot, and
  the mapping becomes *knowable* — which is not the same as trivial. It is **not**
  `x = (t - windowStart) / windowDuration * width`; that is wrong by two terms, and
  wrong by a *different* amount on a `--range` zoom of the same render, so the same
  instant sits at two different columns on two sheets whose only purpose is to be
  compared. `timeToPixel` corrects for both: `showspectrumpic` advances an integer
  `floor(windowSamples / width)` samples per column (so the picture spans slightly
  less than the window), and the FFT window's centring adds a constant
  sample-domain lag. Measured residual after both: **under 1 px, envelope ±1.5 px**,
  end-to-end against ffmpeg in `tests/scripts/spectro-calibration.test.ts` — which
  brackets both edges of the picture, because the error this replaced was zero in
  the middle. The axis is ours, rasterized in `scripts/spectro-grid.ts` — this
  repo's ffmpeg has no `drawtext`.
- **The scales are pinned in one place** (`SPECTRO_SCALE`). Two sheets are only
  comparable while the color mapping and dB window are identical, because
  `color=intensity` maps dB to hue: move `drange` and the same audio changes color
  with no marker that the scale moved. Changing any value there invalidates
  comparison against every sheet generated before it.

**The grid is drawn from the event dump's `meta`, and the lead-in is load-bearing** —
`mix-report` renders 0.25 s of silence first, so bar 1 does not start at t=0. Bars are
assumed 4/4 (16 steps); `RenderMeta` carries no time signature, so a non-4/4 scene gets
a grid that is right about seconds and wrong about bar numbers.

**Window rules worth knowing before you read a sheet:**

- **One scene per sheet, enforced.** `--scene` has no default, so a bare
  `npm run mix:spectro` renders every default scene (96/104/118/138 bpm) into one
  directory. That used to draw one scene's grid over all four; it now fails and tells
  you to pass `--scene=<id>`. Same for `mix:plant --from`, where a multi-scene
  directory silently turned "one defect per lane" into one per lane *per scene*.
- **The default window stops at the last bar**, not at the end of the file.
  `mix-report` renders a 2 s tail past the form (~10% of a default scene), and those
  pixels annotated nothing. Each window is then extended by exactly one beat, because
  a window that *ends* on its closing bar line cannot draw that line — the picture's
  right edge sits a few columns short of the window's own last instant.
- **`--range` is clamped to the render.** A range running past the end used to emit
  `apad` silence under a confident caption, and `--range=bar90..bar99` on a 4-bar
  render exited 0 with a black sheet. The far end now clamps to the last step and a
  start past the form is refused by name.

## `npm run --silent mix:plant -- --from=<dir> --out=<dir>`

The calibration deck for the above. A clean sheet looks like a clean sheet whether
the tool works or not, so this takes a real render and writes a copy with **known**
defects planted — one per lane, each a pure deterministic transform — plus a
`defects.json` answer key naming the type, stem and exact time range.

```bash
npm run --silent mix:verify -- --scene=funk-pocket --keep=tmp/ears
npm run --silent mix:plant -- --from=tmp/ears --out=tmp/ears-defective
npm run --silent mix:spectro -- --from=tmp/ears-defective     # read it
npm run --silent mix:spectro -- --from=tmp/ears               # against the control
```

| Class | What it plants |
| :- | :- |
| `mute-region` | one beat of one stem silenced — a dropped note |
| `click` | a single full-scale sample against its neighbors, 7 ms off the grid |
| `drop-lane` | an entire stem silenced |
| `flatten-accents` | dynamic range compressed 8:1 with +18 dB capped make-up — accents eaten |

`flatten-accents` plants compression and **nothing else**: the gain is derived from the
louder of the envelope and the sample it multiplies, so the transform cannot overshoot
full scale. It previously did, and the ±1 clamp that caught it hard-clipped 0.36% of
the drums stem (0.73% of `full`, peak 2.57) in runs up to 1.3 ms — broadband distortion
at every transient, under a manifest that claimed only "accents eaten", confounding
exactly the masking calibration this deck exists to support.

It deliberately does **not** grade the read. Whether a planted defect was visible is
a judgment for whoever looks at the sheet, and would be worthless coming from the
same code that placed it.

### What the images can and cannot show (measured 2026-07-28)

The point of planting known defects is to find out how far the image channel can be
trusted, rather than assuming a spectrogram is legible because spectrograms usually
are. Read on `funk-pocket`, full sheet plus a `--range=bar5..bar6` zoom:

| Class | Verdict | What it looks like |
| :- | :- | :- |
| `drop-lane` | **readable alone** | the panel is black end to end; needs no control |
| `mute-region` | **readable alone** | a vertical black gap in a lane you expect to be continuous — and the bar grid makes it *addressable* ("bass, second half of bar 3") without counting pixels |
| `flatten-accents` | **A/B unambiguous; easy to miss alone** | the inter-hit space fills with an even haze — the control's dark background lifts to red across the whole panel — and the low band loses its gaps. Beside the control it is obvious. Alone, the uniformly raised floor *is* the tell, but it is easy to write off as a busier kit or a hotter mix |
| `click` | **not readable — metrics only** | never located it, at full form *or* zoomed to two bars, while knowing the exact bar and beat |

**The click result is the load-bearing one, and it is a floor, not a ceiling.** A
single-sample discontinuity carries almost no energy inside a ~20 ms FFT window, and
every panel is already full of vertical transients from real percussion — so a
broadband streak has nothing to distinguish it from a snare. Do not go click-hunting
on these images. `mix:verify`'s `discontinuity` metric owns that class and does detect
it. This is a genuine division of labour between the two tools, not a gap to close by
tuning the color scale.

**`flatten-accents` is why the pinned scale earns its keep** — that verdict is only
available because two sheets are directly comparable. It is also the class most likely
to be *missed* in practice, since it needs the discipline of rendering the control
alongside.

**Method caveat, so nobody over-trusts the table.** The read was informed, not blind:
an earlier deck had already revealed which stem carries which defect, and an attempt to
re-randomize by shuffling the request order failed silently — each defect's preferred
stem is distinct and always free, so order cannot change the assignment. That weakens
the two positive calls (`drop-lane`, `mute-region`), which are in any case plain image
facts anyone can re-check. It **strengthens** the two negative ones: knowing exactly
where the click was and still not finding it is worse for the image channel than a
blind miss would be, and the same holds for judging the drum flattening hard to spot in
isolation while knowing it was planted.

The `flatten-accents` row was re-read after that transform was fixed to stop clipping.
The first version overshot into a hard clamp on every attack, so the panel carried
broadband distortion the manifest never claimed — which is exactly the kind of second,
undocumented difference that quietly invalidates an A/B. The verdict above is the one
measured against the corrected transform.

## `npm run --silent mix:ab -- --refs=A..B`

Renders the same scene/seed at two git refs and **subtracts the audio**. "Did this
change alter anything besides X, and where" stops being a listening task and becomes
a measurement. Exits nonzero above threshold, so it is a `git bisect run` predicate.

```bash
npm run --silent mix:ab -- --scene=funk-pocket --refs=main..HEAD
npm run --silent mix:ab -- --scene=funk-pocket --refs=main..HEAD --stems=bass
npm run --silent mix:ab -- --identity=HEAD --scene=funk-pocket   # measure the noise floor
git bisect start bad good && git bisect run npm run --silent mix:ab -- --scene=funk-pocket --refs=HEAD~1..HEAD
```

Each ref renders with its own harness, so a ref from before these tools moved to the band engine
(2026-09-25) renders the old engine, and a ref from before `mix:report` rendered in node
(2026-10-09) renders in Chromium — with the Next build that path needs: comparing across either
boundary measures the engine swap, not your change. Compare refs on the same side of it (pass
`--engine=chromium` to compare two refs the way the app renders them).

Per stem it reports total residual RMS, **residual per bar** (so the change is
addressable — "bass, bar 3"), the note-level event delta, and writes the residual
itself as a WAV so `mix:spectro --from=<dir>` renders a difference spectrogram.

### The floor is measured, not zero — do not "fix" this

**The renderer is not bit-reproducible.** Two renders of the same ref, same seed,
same bundle differ. Measured on the band engine (2026-09-25, `--identity=HEAD` @ 3d449ab1,
`funk-pocket` / `MIX_AUDIT`):

| stem | residual RMS | max abs diff |
| :- | -: | -: |
| full+solo | **−99.9 dBFS** | 6 LSB |
| full | −100.4 | 2 LSB |
| bass | −101.2 | 2 LSB |
| chords | −105.5 | 1 LSB |
| drums | −106.0 | 7 LSB |
| soloist | −111.4 | 1 LSB |

The event delta was empty on every stem (the band's events are identical run to run). On
the old engine (three renders @ d44dee78) the worst stem was −99.0 dBFS and its silent
soloist stem was byte-identical — the tell: the nondeterminism
scales with signal, which is float summation-order variation in Chromium's
`OfflineAudioContext` — not anything structural or musical. It is inaudible and not
fixable from this repo.

So the default threshold is **−90 dBFS**, about 9 dB above the worst observed floor,
and a difference below it is reported as *indistinguishable from render noise* rather
than attributed to the change under test. The original design said the identity check
must "null to silence" and the tool must refuse to compare until it does — which, since
that never holds, would have deadlocked the tool permanently. The floor preserves that
rule's intent (never report noise as signal) in a form that is achievable.

### Validated against a known change

A bar-localized positive control (bass muted across bars 3–4, on a throwaway commit)
produced exactly the localization the tool exists to provide (measured on the old engine,
hence its `harmony` stem):

```
bass       residual  -34.6 dBFS   ABOVE THRESHOLD by 55.4 dB
           loudest: bar 3 -25.1, bar 4 -69.3, bar 6 -98.8, bar 1 -99.4, ... (rest at the floor)
           events: 0 added, 11 removed  ·  bar 3 beat 1 — bass midi 45 in A, absent in B
drums / chords / harmony / soloist        at or below threshold
3 of 7 stem(s) above -90.0 dBFS: bass, full+solo, full   → exit 1
```

Right stems, right bars, right notes, nonzero exit. Note `bar 4` sitting well above
the floor at −69.3 dB is correct physics, not leakage — it is the release tail of the
notes that were still ringing when the mute began.

### The event delta needs both refs to carry event dumps

`--write-events` landed in `795baf1b`. Comparing two older refs still works for the
null test — the residual is exact — but the per-bar breakdown and the event delta both
print `NOT VERIFIABLE`, because the bar grid comes from the dump. Rendering an old ref
through the *current* harness is deliberately **not** done: it would measure the harness
change along with the engine change, which is a different experiment.

Each ref is rendered by checking it out **in the main repo** (a worktree has no
`node_modules` — see the npx-probe trap in the global guide) and running that ref's own
harness. `tmp/` is gitignored, which is what lets the rendered output survive the
checkout. The tool refuses a dirty tree, never stashes, and restores the original ref
in a `finally`.

## Song menu → Export audio

In addition to the CLI tools above, the song menu's **Export audio (mix)** and **Export
audio (stems)** render the current chart through `renderBandPasses` — the same offline
render `mix:report` measures — and download WAVs. A stem renders its lane even when that
lane is off live (the lead is off by default): the render opens the bus of every lane that
has events in it.

This is the workflow path for handing a clip to another model
(Gemini, GPT, etc.) for a second-opinion listen — no API integration
required, just drag the file into another chat.

Implementation: `prototypes/v2/lib/band-export.ts` + the shared
`public/engine/wav-encoder.ts`.

The encoder quantizes with a **round** against a symmetric `0x8000` scale (clamped at
`+0x7fff`), which makes `int16 → float → int16` the exact identity for all 65 536
values. It used to truncate against `0x7fff`, so every strictly-positive sample lost
one LSB per round trip — inaudible on its own (-90 dBFS), but it meant any tool that
decodes a render, edits a region and writes it back changed the *whole* file:
`mix:plant` claiming to touch 2 samples of the `full` stem moved 871 754 of them.

## Why these are separate commands

The render harness (`mix:report --write-wav`) and the audition link
(`audition-link`) hit the same problem from two angles. The render
harness lets the user listen *offline*, comparing audio files at their
own pace, useful when working through a story. The audition link is
the *live* version — one click, hear the actual engine running in the
real audio graph — useful when validating a final result and wanting
to verify what's about to ship behaves the way the metrics suggest.
