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
- **Size budget:** a pitched pack ≤ 2 MB (ceiling 3), a drum kit ≤ 5 MB (ceiling 8). Packs are
  opt-in downloads and never part of the app shell.

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
- **Mono or stereo:** pitched packs may stay stereo. Keep stereo when the stereo field *is* the
  sound: jRhodes3c bakes a mid-side chorus that cancels to mono. Drum hits go mono (below).
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
