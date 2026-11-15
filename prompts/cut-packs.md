# Brief: cut the first five instrument packs

You are building the script that cuts Ensemble's instrument packs from free sample libraries, and cutting the first five with it. Ensemble is a browser-based backing band; its engine writes notes, and a sampler (not yet built, not yours) will play them from these packs.

Read first, in this order: `CLAUDE.md`, `docs/AUDIO_NOTES.md` (all of it; sections 5 to 7 are traps the last attempt fell into), `packages/audio/src/pack.ts` (the pack format: you write files that satisfy it), `scripts/packs/sources.ts` and `scripts/packs/fetch.ts`.

## Rules

- **Work only in your clone** of the repo (the path you were started in). Commit there, on `main`, in small commits. Do not push anywhere.
- **`.sources/` is a symlink to the fetched libraries. Read-only.** Everything you need is already fetched. Make no network requests and install nothing: use `ffmpeg`/`ffprobe` (version 9, with `libopus`) and Node 26's standard library. No new dependencies.
- **Do not open `/home/brandon/code/ensemble`** or anything outside your clone, `.sources/`, and your own temp files (keep those inside the clone under `.cut-tmp/`, gitignored).
- **You cannot hear.** Never say a pack sounds good, warm, realistic or anything like it. Report what you measured.
- **No tests.** The testing policy gives scripts none. Verify by measurement and say what you measured.
- `pnpm typecheck` and `pnpm lint` must pass (`pnpm format` fixes formatting). `pnpm check` must still pass. Scripts are TypeScript run directly by Node (`node scripts/packs/cut.ts`), with erasable syntax only.
- Follow the repo's writing style in comments: plain statements about what a thing is for, in a musician's words where there is one.
- If the brief is wrong about a source (a folder that does not exist, an articulation that is not there), do the nearest sensible thing, and say so in your report. Do not invent a sound the source lacks.
- If you think the pack format needs a change, do not edit `packages/audio/src/pack.ts`. Say what and why in your report.

## What to build

In `scripts/packs/`:

- **`sfz.ts`**: a reader for the SFZ mapping files the libraries ship. Headers (`<control>`, `<global>`, `<master>`, `<group>`, `<region>`), opcode inheritance, `#include`, `#define`, `default_path`, sample paths with spaces and backslashes. It returns flat regions with their resolved sample path and opcodes. The libraries' own mappings are the truth about which file is which note, layer and alternate; filenames are not (see the notes).
- **`signal.ts`**: decoding a source file to 48 kHz floats through `ffmpeg` (soxr resampler), finding the onset, peak, K-weighted loudness of the loudest 400 ms (ITU-R BS.1770 K-weighting; two biquads), measuring pitch as a fractional MIDI number (autocorrelation near the expected pitch, over a steady stretch after the attack), fades, and encoding to Opus in WebM through `ffmpeg`.
- **`cut.ts`**: `node scripts/packs/cut.ts [id...]` cuts the named packs, or all. It writes `assets/packs/<id>/` afresh: the audio files, `pack.json`, and `LICENCE` (the source's licence file, byte for byte). It prints a summary table per pack. Cutting twice from the same sources must give the same `pack.json` and, as far as the encoder allows, the same files.
- **`recipes/<id>.ts`**: one per pack. A recipe is data plus, where needed, a small function that picks regions out of a mapping. Numbers a listener will want to tune (layer tops, trims, pans, lengths, release) live in the recipe as named data, not buried in code.
- Add `packs:fetch` and `packs:cut` to `package.json` scripts, and the two commands to the list in `CLAUDE.md`.

### What happens to every take

1. Decode to 48 kHz. Mix to the recipe's channel count.
2. Trim the start so the sound begins at the first sample: find the onset (first sample within 50 dB of the take's peak), keep 1 ms before it, fade in over that 1 ms.
3. Cut the length to the recipe's cap for that note, or sooner if the tail has fallen 60 dB under the peak. Fade the end (raised cosine, 80 ms or 10% of the length, whichever is longer) so no file ends on a step.
4. Level it to the pack's reference (see each pack below). One fixed gain per take. Never a loudness normaliser or compressor: they lift a decaying note's tail.
5. Where the recipe says so, measure the root pitch from the source audio and store it as a fraction. Compare it with what the mapping says and report any take more than 50 cents away (that is a wrong file, not a tuning).
6. Encode: Opus in WebM, 48 kHz. Start at 80 kbps mono or 128 kbps stereo, `-application audio`, and report sizes.
7. **Check the round trip**: decode a sample of the files you wrote and confirm the onset is within 1 ms of the start, the length matches `seconds`, and the level is within 0.5 dB of the reference. An encoder that adds leading silence the decoder does not remove would wreck the band's timing, so this check is the important one. Report the numbers.

### Layer tops

The band plays in the middle of the velocity range: pitched seats sit between 50 and 92, with a median near 71. Ghost notes and a jazz drummer's feathered kick are 25 to 34; drum backbeats reach 105. So the layers are split where the band plays, not evenly across 1 to 127:

- two layers: tops 70, 127
- three layers: tops 62, 78, 127
- four layers: tops 56, 68, 80, 127
- drum voices (which use the whole range): up to four layers, tops 40, 64, 88, 127

When a source has more layers than a pack takes, pick the source layers whose own velocity range (in its mapping) sits nearest those tops, spread from soft to hard. Say which you took.

## The five packs

Budgets are for the audio decoded to 32-bit floats at 48 kHz (mono is 0.192 MB a second), because memory on a phone is the limit, not download size. If a recipe as written goes over its budget, shorten length caps first, then drop alternates in the outer layers, and report what you did.

### `drum-kit`, from `virtuosity-drums` (CC0)

Mono, with a pan per voice. Level measure `peak`, reference -6 dBFS. Budget 40 MB.

- **Mics.** The library has several microphone positions per hit. Mix them to one mono file per hit using the balance the library's own basic kit program uses (`Programs/01-basic-kit.sfz` and what it includes). Leave out the lo-fi ("vintage") mic. Report the balance you used. If the mics of one hit are not sample-aligned in the source, keep their relative timing exactly as the source has it.
- **Voices** (these names exactly; they are what the drummer writes): `kick`, `snare`, `ghostSnare`, `crossStick`, `closedHat`, `pedalHat`, `openHat`, `ride`, `rideBell`, `crash`, `highTom`, `midTom`, `lowTom`, `shaker`, `sticks`.
  - `snare`: the centre hit, snares on. `ghostSnare`: its own voice, from the softest centre hits the library has (one layer, up to four takes). `kick`: snares-on or snares-off as the basic kit program uses.
  - `closedHat`, `pedalHat`, `openHat`: the closed, pedal and fully open hits. `closedHat` and `pedalHat` choke `openHat`.
  - `ride`: the normal hit on the ride (not the flat ride). `rideBell`: its bell. `crash`: the crash's normal hit.
  - `highTom`, `lowTom`: centre hits. The kit has two toms. `midTom`: say in your report what the source offers; if nothing, make it from the high tom pitched down two semitones (resampled when cut), and say so in the pack's `credit.changes`.
  - `shaker`: from the library's auxiliary percussion. `sticks`: a count-in click. Look for sticks struck together; the library's "stickshot" may or may not be that (read the manual PDF's text if `pdftotext` exists, or the mapping names). If there is no stick click, use the cross-stick and say so.
- **Takes.** Up to four alternates a layer for `kick`, `snare`, `closedHat`, `ride`, `pedalHat`; up to three for the rest.
- **Lengths.** Crash up to 5 s, ride and bell up to 4 s, open hat up to 2.5 s, everything else to its natural end, 3 s at most.
- **Trims** (dB, set by ear on an earlier kit; a starting point): kick 0, snare 0, ghostSnare 0, toms -1, crash -5, ride -6, rideBell -4, closedHat -8, openHat -8, pedalHat -12, crossStick -6, sticks -6, shaker -11.
- **Pans** (audience view, mild): kick 0, snare 0, ghostSnare 0, crossStick 0, closedHat 0.3, pedalHat 0.3, openHat 0.3, ride -0.35, rideBell -0.35, crash 0.2, highTom 0.15, midTom -0.05, lowTom -0.3, shaker 0.4, sticks 0.
- Every voice is `oneShot`.

### `upright-bass`, from `meatbass` (CC0), pizzicato

Mono. Level measure `loudness`, reference -20 LUFS. Budget 30 MB. Measure roots.

- The band plays MIDI 28 (E1) to 55 (G3). Cover 26 to 57 with the notes the source recorded (its pizzicato mapping shows which).
- Four layers if the source's four are distinct recordings. Two alternates in the middle two layers, one in the outer two.
- Length cap 4 s at the bottom of the range falling to 2.5 s at the top. `release` 0.12.
- The readme mentions percussive noises mapped above the notes. Find out what they are from the mapping and the audio (length, pitch, level). If one is a damped thump on a string, a `dead` voice can be made of it; otherwise make no `dead` voice. Report either way.

### `grand-piano`, from `salamander` (CC BY 3.0)

Mono (sum of left and right at -3 dB). Level measure `loudness`, reference -20 LUFS. Budget 65 MB. Do **not** measure roots: use the mapping's pitch and tuning, because a piano's stretch tuning is meant.

- The source has sixteen dynamic layers at notes a minor third apart. Take three layers (tops 62, 78, 127) for the sampled notes from A1 (33) to C7 (96).
- Length cap 7 s at the bottom falling to 3 s at the top. `release` 0.2.
- **Check the mono sum.** For each note, compare the spectrum of the sum with the average of the two channels' own spectra. Report any note where the sum loses more than 6 dB in a band between 1 and 8 kHz (a cancellation), and the overall picture.
- `credit.changes` must say what was done (CC BY requires it): which layers and notes, summed to mono, trimmed and faded, levelled, encoded.
- Ignore the source's release and pedal-noise samples.

### `alto-sax`, from `weresax` (CC0)

Mono, the condenser microphone. Level measure `loudness`, reference -20 LUFS. Budget 30 MB. Measure roots.

- The source has every semitone from 49 to 80 at two dynamics with two alternates. Take every second semitone from 49 (so 49, 51, ... 79) and add 80, both dynamics (tops 70, 127), first alternate only.
- Length cap 4.5 s. `release` 0.06.
- The band's alto goes to 82. Do nothing about that here; the sampler stretches the top note.

### `vibraphone`, from `vcsl` (CC0)

Mono. Level measure `loudness`, reference -20 LUFS. Budget 25 MB. Measure roots (this library's filenames call middle C "C3"; trust the measurement).

- Hard mallets. Both dynamics the source has (tops 70, 127), every recorded note.
- Length cap 6 s at the bottom falling to 3.5 s at the top. `release` 0.25.
- Report the recorded range as MIDI numbers. The band's vibraphone plays 53 to 89.

## Your report

When all five are cut and committed, reply with:

1. For each pack: voices, layers, zones, takes; bytes on disk and decoded MB against budget; which source layers, notes and mics you took.
2. The round-trip check's numbers (step 7), per pack.
3. Measured roots: the largest deviations in cents, and any file the mapping had wrong.
4. The piano's mono-sum check.
5. What the upright's "noises" are, what the kit's stick click is, what you did for the mid tom.
6. Everything where you departed from this brief, and why.
7. Anything about the sources that the next person cutting a pack should know.

Do not describe how anything sounds.
