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
- **A repeated same-pitch note inside the previous note's ring produces no new
  attack**, so it reports as MISSED. On funk bass that accounts for the whole gap
  between its ~82% rate and the kit's 100%. Whether that is legato or a dropped
  note is a musical judgment, not a tool bug — tracked in #1284.
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

## Why these are separate commands

The render harness (`mix:report --write-wav`) and the audition link
(`audition-link`) hit the same problem from two angles. The render
harness lets the user listen *offline*, comparing audio files at their
own pace, useful when working through a story. The audition link is
the *live* version — one click, hear the actual engine running in the
real audio graph — useful when validating a final result and wanting
to verify what's about to ship behaves the way the metrics suggest.
