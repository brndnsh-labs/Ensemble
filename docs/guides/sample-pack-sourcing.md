# Sample-pack sourcing

How the shipped sample packs in `core/packs/` were found, licensed, encoded and tuned — the
recipe to reuse for the next one. Calibrating a pack's level against the band is a separate
step: see [`listening-gate-tools.md`](listening-gate-tools.md) (`mix:report --calibrate-pack=`).
The engine-side rules for pack voices (fractional `rootMidi`, register overshoot past the top
zone) are in [`core/engine/CLAUDE.md`](../../core/engine/CLAUDE.md).

## The pack contract

- A pack is a folder `core/packs/<id>/`: a `manifest.json` plus one `.m4a` per zone.
- **Pitched pack** manifest: `{ id, name, attribution, samples: [{ key, rootMidi, url }] }`.
  `rootMidi` may be fractional — that is how a zone with a known cents error is tuned true without
  re-encoding. The manifest's `attribution` is an older free-text line nothing reads; the credit
  lives in the catalog (below).
- **Drum pack** manifest keys samples by **articulation**, not pitch (`key: "crash"`, no
  `rootMidi`), with optional round-robin `variants: [url, …]`.
- Every `url` sits under `/packs/<id>/`. `web/scripts/offline.mjs` copies `core/packs` into the
  export, hashes every file into `pack-files.json`, and keeps packs out of the offline shell;
  `web/lib/sounds.ts` downloads a pack only when the musician installs it and checks each file
  against its hash.
- The catalog entry in `core/data/sound-packs.ts` (`SoundPack`) carries what the bytes don't:
  `gain`, `reverbSend`, `toneTiltDb`, `instruments`, `approxSizeMB`. These are **per pack id**.
  When the same recording should serve two lanes at different seats (e.g. a lead guitar reused for
  rhythm comp), copy the bytes under a **new id** with its own manifest and calibration rather than
  adding the second lane to the first id's `instruments`. `electric-guitar-rhythm` is the
  precedent.
- **Every pack ships a `CREDITS.txt`** in its folder, written from the catalog's `credit`, so a
  downloaded file carries its notice; `offline.mjs` hashes it into `pack-files.json` like any
  other pack file. After changing a credit, rewrite them with
  `UPDATE_PACK_CREDITS=1 npm run test:vitest -- sound-credits` and commit the result.
- **Size budget** (Brandon's decision of 2026-11-07, #2001): a pitched pack up to about 5 MB, a
  drum kit up to about 12–15 MB. Packs are opt-in downloads, installed once, and never part of the
  app shell. **Decoded memory is the binding limit, not the download**: a pack decodes to raw
  float audio, about 10–15× its AAC size. Keep it down with mono where stereo adds nothing, trimmed
  tails on soft layers, and loudness layers only where the tone changes. Measure it (below), never
  estimate it.

## Licences

Only host what the licence lets us redistribute as standalone files.

**The catalog's structured credit is the one source of truth** (`SoundPack.credit` in
`core/data/sound-packs.ts`; the licences in `core/data/sound-credits.ts`): each source's `work`,
`author`, `source` URL and `license: { id, name, url }`, and the pack's `changes` in plain words.
Settings → Sound credits lists it for every pack, installed or not; the lane's Mix panel shows a
short line derived from it; each folder's `CREDITS.txt` is checked against it by
`tests/unit/data/sound-credits.test.ts`, which also holds every licence id to the allow-list
below and every attribution-licensed pack to naming its author, source and changes. A licence
not on that list is a decision, not a catalog edit.

**Approved licences:** CC0 1.0, **CC BY 3.0/4.0 (approved beside CC0, 2026-11-07)**,
CC BY-NC-SA 4.0 (the Rhodes only) and GeneralUser GS's own licence. CC BY asks for the creator,
the work's title, the licence with a link and a note of the changes: that is what `changes` is
for, so say what was done to the files (trimmed, levelled, mixed to mono, converted to AAC,
retuned, an amp sim).

**Non-commercial packs:** an NC pack — today the Rhodes — may ship only while Ensemble stays
non-commercial. If that ever changes, the Rhodes is replaced (or a licence bought from its
author, who offers one).

Each claim below was read at its source on 2026-11-07 (#2113):

| Source | Licence, as read at the source | Used for |
|---|---|---|
| Salamander Grand Piano V3 (archive.org `SalamanderGrandPianoV3`) | CC BY 3.0 (the item's licence URL and its description: "Licence: CC-by http://creativecommons.org/licenses/by/3.0/ … Author: Alexander Holm") | `grand` |
| Karoryfer Weresax (`sfzinstruments/karoryfer.weresax`) | CC0 1.0 (repo `LICENSE`) | `sax-alto` |
| VSCO-2 Community Edition (`sgossner/VSCO-2-CE`) | CC0 1.0 (repo `LICENSE`); its `Readme.txt` also *asks* (not a condition) that the samples not be sold directly and that Versilian Studios be credited | `upright-bass` (Solo Contrabass Pizz); also has section strings and brass |
| VCSL (`sgossner/VCSL`) | CC0 1.0 (repo `LICENSE`; README: "no royalties, no credit, no special terms") | `acoustic-kit` (most articulations) |
| Virtuosity Drums (`sfzinstruments/virtuosity_drums`, Versilian Studios and Karoryfer Samples) | CC0 1.0 (repo `LICENSE`) | `acoustic-kit` (ride, bell, crash, pedal hat) |
| FreePats Drawbar Organ Emulation (SFZ variant) | CC0 1.0 (its FreePats page) | `hammond-organ` |
| FreePats Spanish Classical Guitar | CC0 1.0 (its FreePats page) | `nylon-guitar` |
| FreePats FSBS Electric Guitar Clean #1 (`-small-` variant) | CC0 1.0 (its FreePats page) | `electric-guitar-clean`, and via the amp sim below `electric-guitar-driven` / `electric-guitar-rhythm` |
| GeneralUser GS (`mrbumpy409/GeneralUser-GS`) | GeneralUser GS License v2.0 (`documentation/LICENSE.txt`): free to use "in your software projects, and to modify the SoundFont bank or its packaging"; no credit is required, and a site featuring it is asked to link to the author's website or host its own copy, never his download files. The author also says he "cannot be 100% sure where all of the samples originated" | `clavinet` |
| jRhodes3c (`sfzinstruments/jlearman.jRhodes3c`) | CC BY-NC-SA 4.0 for distributing the samples "in an application" (repo `LICENSE`; GitHub shows NOASSERTION because the file is custom). The same file links the BY-NC deed and lists only BY and NC; we follow the stricter, named BY-NC-SA. Commercial use needs a licence from the author | `rhodes` |
| Karoryfer Growlybass (`sfzinstruments/karoryfer.growlybass`) | CC0 1.0 (repo `LICENSE`; readme: "Royalty-free for all commercial and non-commercial use.") | `electric-bass-jazz` (Squier Jazz Bass, sustain `f` layer) |
| Karoryfer Black And Blue Basses (`sfzinstruments/karoryfer.black-and-blue-basses`) | CC0 1.0 (repo `license`; user guide: "This is free and open-source, with a CC 0 license.") | `electric-bass-fingered` (darkblack, Washburn AB-95, fingered, `mf` layer); its babyblue bass is a picked 5-string |

**Looked for a better clavinet, found none (2026-11-07, #2001):** sfzinstruments has no clavinet
(its nearest, Greg Sullivan's Pianet T, is CC BY 3.0 and a different instrument); FreePats has
none; nothing CC0 or permissive turned up elsewhere (the D6 libraries are commercial). GeneralUser
GS holds only the 8 clavinet samples already shipped, and they are **loop-sustain** samples (0.35–
0.74 s with SF2 loop points, instrument `Clavinet_1`, loop mode 1): played one-shot they stopped
mid-ring, about 20 dB under their attack. **Fixed in #2116 by rendering the loop out** (below).
Tighter spacing would have to be derived (resampled neighbours, as `tom-mid` is); not done, it
needs an ear.

**The clavinet's loop, rendered out (#2116).** A re-render is reproducible from these parameters.
Per zone, from the `shdr` sample (32 kHz mono, loop points relative to the sample start):
attack = `[0, endLoop)`, then the loop `[startLoop, endLoop)` repeated to 2.2 s. The loops are
sample-accurate (the wrap step `x[startLoop] − x[endLoop−1]` is below every zone's own largest
sample step) and short, 1–16 ms, so the pitch holds (loop tail within ±4 cents of the root). From
the loop start an exponential decay of `max(the sample's measured dB/s, 55 / (2.2 − loopStartTime))`
(the samples' own decay is 8–26 dB/s, GeneralUser's volume envelope 10 dB/s; the render uses
~30–37 dB/s so the note is gone by ~2 s), then a 120 ms raised-cosine fade. Level by static gain,
no `loudnorm`: the RMS of each zone's first 0.5 s to one common target (their geometric mean), then
one shared −5.2 dB trim so the loudest zone peaks at −1.5 dBFS. Encode: `-ar 44100 -ac 1 -c:a aac
-b:a 96k`. The roots are unchanged (`originalPitch − correction/100`). Result: each file is 2.2 s,
~27 KB; a note sits −29 to −39 dB under its peak at 1 s and −62 to −70 dB at 2 s, with no 10 ms
RMS step over 3 dB after the attack.

**Rejected — don't re-check:** Sonatina/SSO (CC-Sampling+, forbids serving samples standalone),
Philharmonia (forbids as-is redistribution, MP3 only), Pianobook (EULA bars redistribution),
NI/M-Audio free kits (Kontakt-locked), 99sounds/SampleRadar (no redistribution).

**Watch:** the Salamander *Drumkit* is CC-BY-**SA** — hosting transcoded files inherits
ShareAlike, heavier than the grand's plain CC-BY. Nothing CC0 covers snare **brushes** or a clean
**china**; those articulations stay on the synth voice (the drum seam falls back per hit).
**VCSL has no bowed strings** (its chordophones are harps, strumstick, zithers). The VCSL Hohner
harmonica was tried and scrapped: the reed buzz reads as a rattle.

## Fetching

- **VSCO-2 CE is a GitHub repo — don't download the 3 GB zip.** Pull single WAVs from
  `raw.githubusercontent.com/sgossner/VSCO-2-CE/master/<dir>/<file>.wav`, getting the exact
  `download_url` from `gh api repos/sgossner/VSCO-2-CE/contents/<path>`. URL-encode spaces (`%20`)
  and `#` (`%23`). Files are `…_<Note><Oct>_v<1-3>_rr<1-2>.wav`; v2/rr1 is a good single mezzo
  layer.
- **FreePats** URLs carry a subdirectory (`/Guitar/SpanishClassicalGuitar/…`); the bare
  `/Guitar/<file>` 404s, so scrape the page for the real href. Prefer the **SFZ** variants: raw
  WAV/FLAC plus a text map whose `pitch_keycenter` / `key=` gives each zone's root.
- **SF2 sources need no Polyphone.** Parse the RIFF in Python: the `shdr` chunk holds 46-byte
  records (20-char name, then `<IIIII` = start, end, loopstart, loopend, rate; byte 40 = original
  pitch; **byte 41 = pitch correction in signed cents**). Slice the `smpl` chunk (16-bit mono PCM)
  at `[smpl + start*2 : smpl + end*2]` and write each zone as a WAV at its `rate`. **Don't ignore
  byte 41**: the clavinet zones were ~30 cents flat and uneven until the manifest root became
  `rootMidi = originalPitch − corr/100` (a positive correction means the sample was recorded flat).
  Also read the instrument's zones (`inst` → `ibag` → `igen`: generator 43 is the key range, 53 the
  sample, 54 the loop mode) before deciding a source is thin or long enough.
- **Karoryfer (sfzinstruments) repos are plain git, no LFS**: list a folder with
  `gh api repos/sfzinstruments/<repo>/contents/<dir>` and pull single WAVs from
  `raw.githubusercontent.com`. The SFZ maps (`Programs/maps/*.sfz`, or the top-level `.sfz`) give
  each file's `pitch_keycenter`. **Both bass libraries name and map every note an octave above
  where it sounds** (Growlybass `e2_…` and Black And Blue `darkblack_e2_…` are E1 = 28), so take
  the root from the measurement, never the name. Black And Blue's samples carry ~25 ms of pre-note
  noise before the pluck (its "Preroll" control): cut to the onset, or every note lands late.

## Encoding

**Format: AAC in `.m4a`.** It is the one format `decodeAudioData` handles everywhere, Mobile
Safari included; Vorbis-in-Ogg and Opus on older Safari are not safe. This machine's ffmpeg has
native `aac`, `libopus` and `vorbis` but not `libvorbis`; `sox`, `opusenc` and `oggenc` are absent.

A pitched zone:

```bash
ffmpeg -nostdin -v error -y -i in.wav -t 6 \
  -af "loudnorm=I=-16:TP=-1.0:LRA=11,afade=t=out:st=5.6:d=0.4" -c:a aac -b:a 96k <midi>.m4a
```

- **`-nostdin` is required in a loop** — otherwise ffmpeg eats the loop's stdin and it stops after
  one file.
- **Trim to the musical need.** A piano decays for ~16 s; ~6 s plus a short fade is enough, since
  the voice's envelope owns the release. A looped or sustained source (organ, clean electric) gets
  a tail fade. Playback is one-shot, so a chord held longer than the sample cuts off.
- **Encode quiet sources hot.** The VSCO strings peaked at −21 dB against the grand's −6 dB and
  played ~30 dB under the synth; catalog `gain` couldn't rescue it, because the envelope clamps.
  `loudnorm` brings each zone to about −6 dB peak with even loudness across zones. Calibrate the
  catalog `gain` only after that. A source that peaks at 0 dBFS gets −1 dB of true-peak headroom.
- **Single-pass `loudnorm` is dynamic: it flattens a decaying note.** On a Growlybass note the
  level 3–4 s in, against the first half second, went from −20.8 dB to −8.9 dB. For a plucked or
  struck note whose decay *is* the sound, level each zone with a **static** gain instead (the RMS of
  its first second to one target), then one shared trim so no zone peaks over −1 dBFS. The electric
  basses were built that way (#2001).
- **A pluck's spike can cost a whole pack's level.** The Growlybass attack rises ~23 dB above the
  note's RMS, so peak headroom left the pack 8 dB quieter than the fingered bass, and its gain
  would have run into `MAX_SAMPLE_PEAK`. A look-ahead peak limiter on each zone (2 ms look-ahead,
  60 ms release, holding peaks to 15 dB over the note's RMS) touches only the first few
  milliseconds, the way a bassist's compressor does, and won back 7.5 dB.
- **Mono or stereo:** mono unless the stereo field *is* the sound: jRhodes3c bakes a mid-side
  chorus that cancels to mono, so it stays stereo. A bass is mono (both electric-bass sources are
  mono DI recordings anyway). Drum hits go mono (below).
- **Measure decoded memory.** Sum `numberOfChannels × length × 4` bytes over every decoded buffer,
  at the context's rate (48 kHz on most devices). node's own decoder refuses these `.m4a` files
  (`moov` sits after `mdat`; `scripts/node-webaudio.ts` says why), so decode each through ffmpeg
  to WAV and hand that to `decodeAudioData`, as the node render does. Measured 2026-11-07 at
  48 kHz: `grand` 47.6 MB, `electric-bass-jazz` 13.8 MB (12 × 6 s), `electric-bass-fingered`
  11.5 MB (12 × 5 s), `upright-bass` 3.4 MB, `clavinet` 0.8 MB (before the 2.2 s render-out; 3.4 MB after: 8 zones x 2.2 s x 48 kHz x 4 B).
- **Zone spacing:** about every minor third for sustained instruments; plucked instruments get
  denser zones (every two semitones for nylon), because a plucked transient betrays pitch-shifting
  sooner than a sustained horn does.

## Measure pitch, don't trust filenames

- VSCO contrabass filenames are wrong about both letter and octave (`B2.wav` is a G1).
- **VCSL labels middle C as "C3"**, so every file sits an octave above its standard (C4 = 60) name:
  "C3" measured 262 Hz, which is MIDI 60.
- Measure every zone with three detectors over a post-attack window: FFT harmonic-product-spectrum,
  autocorrelation, and YIN. Where all three agree, trust the result.
- Low plucked notes split by an octave: the fundamental is weak and the 2nd harmonic dominates. For
  those, score harmonic templates: the energy at each candidate f0 and at 2f0…5f0. The true root
  shows a clean ladder even when f0 itself is faint. Sub-20 Hz peaks are body rumble, not pitch.
- Set `rootMidi` from the measurement, then **re-measure the encoded `.m4a`** to prove that
  loudnorm, trimming and the mono downmix didn't move it.

## Drum packs

- **Downmix to mono** (`-ac 1`). The engine pans each hit itself, and a stereo source fights the
  panner. Mono also halves the size.
- **Strip leading silence** (`silenceremove` at the start), or hits land late.
- **Bake the kit balance into the files.** Source levels are inconsistent, not dynamic (VCSL's
  closed hat is −36 dB raw, its loose hat −8 dB), and the sample path skips the synth's per-voice
  mix. Measure each articulation's peak with `volumedetect` (without `-v error`, which silences
  it), apply `volume=<target − measured>dB`, then `atrim`, `afade` out, `-ac 1 -c:a aac -b:a 128k`.
  One catalog `gain` then lifts the whole kit; per-hit dynamics come from the band's velocity.
  Re-tuning one drum by ear means re-encoding that articulation at a new target.
- **Target peaks (dBFS) set by ear for `acoustic-kit`:** kick and snare −7; toms −8; crash −12;
  ride −13; ride bell −11; open hat −15 with a 2.2 s decay; loose hat −15 at 1.1 s; closed hat −15;
  pedal hat −19; cowbell −12; agogo −13; sidestick −13; shaker −18.
- **A missing drum can be derived, not sourced.** The kit's sources carry two toms ~4 semitones
  apart, so `tom-mid` is the high tom's takes resampled 2 semitones down (`asetrate` to
  44100 × 2^(−2/12), then `aresample=44100`), which also lengthens the ring as a bigger shell
  would (#1998).
- An un-choked open hat piles up in hat-dense styles: disco stacked ~15 overlapping washes. The
  engine chokes the open hat on a closed or pedal hit (#679); keep the open-hat sample's decay
  natural rather than trimming it as a workaround.

## Offline amp sim: a driven guitar with no engine code

`electric-guitar-driven` is the clean CC0 electric re-voiced offline (numpy/scipy) and saved as a
separate data-only pack:

1. Normalize hot, then high-pass at ~90 Hz to tighten the lows before clipping.
2. Soft-clip with `tanh(drive·(x + bias)) − tanh(drive·bias)`. A bias of ≈0.08 adds even-harmonic
   warmth; drive ≈4 is a medium crunch, and **drive is the main by-ear knob**.
3. Shape a cabinet EQ, which makes or breaks the sound. A brittle result means the cabinet needs
   warming, not less drive: the shipped voicing is a 4.0 kHz low-pass, +2.5 dB at 450 Hz for body,
   and only +1.5 dB of presence at 2.4 kHz.
4. Verify that pitch is unchanged and the harmonics are richer. A warmer voicing loses
   high-frequency energy, so it calibrates to a *higher* `gain`.
