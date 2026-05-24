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

## Why these are separate commands

The render harness (`mix:report --write-wav`) and the audition link
(`audition-link`) hit the same problem from two angles. The render
harness lets the user listen *offline*, comparing audio files at their
own pace, useful when working through a story. The audition link is
the *live* version — one click, hear the actual engine running in the
real audio graph — useful when validating a final result and wanting
to verify what's about to ship behaves the way the metrics suggest.
