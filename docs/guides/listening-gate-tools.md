# Listening-Gate Tools

A short tour of the tooling that reduces friction on the synth-audit
"listening gate" — the human step where the assistant can't tell whether
a sound is actually good and the user has to use their ear.

All three commands operate on the same `OfflineAudioContext` pipeline
already used by `npm run mix:report`. None of them replace the ear; they
only shorten the loop around it.

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

Pass `--loops=N` (default 1) to render each scene through N choruses. The
offline render bumps `playback.currentLoopCount` on each loop boundary so
the soloist's chorus-evolution machinery (Loop 0 head → Loop 1 themed →
Loop 2+ exploratory) actually expresses. Each stem then reports per-loop
RMS in dB (`loopDb` column) and an `arc` classification: `flat` (under
1.5 dB swing), `front-loaded`, `building`, `arc`, `dip`, `irregular`. The
old default render of a single loop was silently testing only the
"Loop 0" head behavior — this surfaces the rest of the architecture.

### `--scenes-from=<file.json>` — render externally supplied scenes

Renders a JSON array of scene objects (shaped like the `DEFAULT_MIX_REPORT_SCENES`
entries in `scripts/mix-report-utils.ts`) instead of the built-in catalog.
Required per scene: `id`, `genreFeel`, `bpm`, `key`, and a non-empty `sections`
array whose entries carry a `value` progression string (`'A7 | D7 | …'`).
`label` defaults to the id, `intensity`/`complexity` to 0.7/0.6,
`drumPreset` to `Basic Rock`, `timeSignature` to `4/4`; `findingThresholds`
falls back to the genre-agnostic defaults. Unknown fields pass through
untouched, so an external spec's own metadata rides along. Mutually exclusive
with `--scene`/`--scenes`/`--focus-from`.

This is the fixture-factory entry point for the songsiknow analysis harness
(#1349): combined with `--write-wav` + `--write-events` it renders per-stem
audio whose musical truth (the event stream + the scene spec) is known by
construction. Note the render is *musically* deterministic per seed — the
events JSON is byte-identical across runs — but WAVs can differ by ±2 LSB of
int16 (OfflineAudioContext float jitter), so fixture consumers should
render-once-and-freeze rather than re-render and expect byte equality.

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

Builds a URL that, when opened in a browser pointing at the app,
hydrates the named scene and shows a single "▶ Play" overlay. One
click satisfies the browser's autoplay gesture requirement and starts
playback of the already-set-up scene. This collapses the listening
pass from "context-switch to the app, pick the genre, pick the key,
set the BPM, pick a chord progression, hit play" to "click link, hit
play."

```bash
npm run --silent audition-link -- --scene=jazz-ride --seed=ALPHA
# → http://localhost:5173/?prog=Dm7+%7C+G7+...&autoplay=1
```

Available scenes are the same four shipped with `mix:report`:
`rock-backbeat`, `blues-shuffle`, `jazz-ride`, `funk-pocket`. Override
the base URL with `--base-url=https://your-deploy/`.

The URL pin uses top-level `?seed=` so audition links don't have to
round-trip through the base64 `bnd` payload that the in-app share
modal produces.

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

`tmp/references/calibration.json` is the persisted reference baseline
(Miles Davis "So What" / Chic / STP / B.B. King), used to calibrate the
per-scene thresholds at `scripts/mix-report-utils.ts`.

## `npm run --silent mix:verify -- --scene=<id>`

Reconciles the **scheduled note events** against the **rendered audio** for the
same seed, and prints a per-stem table. This is the one tool here the assistant
can read directly: it answers audible-fact questions in text, without an ear.

```bash
npm run --silent mix:verify -- --scene=funk-pocket
npm run --silent mix:verify -- --scene=jazz-ride --stems=bass,drums --loops=2   # --stems filters the REPORT, not the render
npm run --silent mix:verify -- --scene=rock-backbeat --keep=tmp/ears   # keep WAVs + events
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
| pitch confirmed | harmonic energy at the expected f0 vs its semitone neighbors (monophonic, resolvable pitches only) |

**Scope limit, stated deliberately.** The events and the audio come from the same
code path, so `mix:verify` cannot catch a bad *musical decision* — only a decision
that failed to become sound. Musical-decision claims stay gated by
`tests/standards/`. What it adds is the half those tests structurally cannot
reach: a critique test passes on velocity math while the render buries the note.

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
  started, zero early returns.

  Two traps this exposed, both worth knowing before trusting a MISSED report:
  **(1)** the bass visualizer payload omits velocity, so the tool cannot tell an
  intentionally-quiet note from a failed one — it has no way to expect −16.5 dB.
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
- **Pitch confirmation is monophonic AND high-register only.** Inside a chord a
  neighbor's partials land on a note's probe bins, so `chords`/`harmony` decline it.
  Separately, an 80 ms Goertzel resolves ~12.5 Hz while a semitone at MIDI 45 spans
  6.5 Hz — below roughly **MIDI 69** the probe cannot tell a pitch from its
  neighbors at all (measured: it confirmed 8 of 10 *wrong* pitches), so it declines
  there too. In practice only upper-register soloist notes get a pitch claim. An
  octave above still confirms, since that partial genuinely is present.
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

Implementation note worth knowing before extending it: the event stream is
captured by switching the visualizer event queue **on** in the render clone
(`--write-events`), not by reading the note buffers. The buffers hold
pre-humanization times and contain no drums at all (drums are generated live in
`scheduleGlobalEvent`); `queueVisualizerNoteEvent` fires at every lane's real
schedule site with the actual play time, which is what a ±25 ms match needs.
Velocity is only on the payload for lanes that pass it today (drums, chords) —
the others report NOT VERIFIABLE rather than assuming a value.

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

Per stem it reports total residual RMS, **residual per bar** (so the change is
addressable — "bass, bar 3"), the note-level event delta, and writes the residual
itself as a WAV so `mix:spectro --from=<dir>` renders a difference spectrogram.

### The floor is measured, not zero — do not "fix" this

**The renderer is not bit-reproducible.** Two renders of the same ref, same seed,
same bundle differ. Measured across three renders of `funk-pocket` / `MIX_AUDIT`:

| stem | residual RMS | max abs diff |
| :- | -: | -: |
| full | **−99.0 dBFS** | 2 LSB |
| full+solo | −99.2 | 2 |
| bass | −100.5 | 2 |
| drums | −102.9 | 2 |
| harmony | −105.0 | 1 |
| chords | −107.3 | 1 |
| soloist (silent) | −Inf (byte-identical) | 0 |

Only the **silent** stem is bit-identical, and that is the tell: the nondeterminism
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
produced exactly the localization the tool exists to provide:

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

## Share modal → Download .wav

In addition to the CLI tools above, the in-app **Share & Export** modal
now has a "Download .wav" button next to the existing MIDI export. It
renders the user's current arrangement (with whatever instruments,
styles, and intensity are dialed in) through the same
`OfflineAudioContext` path as `mix:report`, and triggers a browser
download.

This is the workflow path for handing a clip to another model
(Gemini, GPT, etc.) for a second-opinion listen — no API integration
required, just drag the file into another chat.

Implementation: `public/export/audio-export.ts` + the shared
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
