# Audio notes

What the previous version of Ensemble learned about instrument samples, mixing them, and playing them on phones. Carried over on 2026-11-15 as knowledge, not design: nothing here says how to build the audio package. Read it when the work touches packs, the mixer, or browser playback.

Each finding is marked by how it was established:

- **(ear)** Brandon heard it and said so.
- **(measured)** a number someone measured; no listener.
- **(noted)** written down last time with no listener and no measurement recorded. Treat as a lead.

## 1. Sources that were used

Every pack last time was cut down from a free library on the web. The licences below are as the previous project recorded them after reading each at its source on 2026-11-07. They were not re-read for this note. Read the licence file again when a source is fetched, and keep it beside the pack.

| Instrument | Source | Licence as recorded |
|---|---|---|
| Drum kit | VCSL (Versilian Studios), `github.com/sgossner/VCSL`; ride, bell, crash and pedal hat from Virtuosity Drums (Versilian and Karoryfer), `github.com/sfzinstruments/virtuosity_drums` | CC0 1.0 |
| Grand piano | Salamander Grand Piano V3, Alexander Holm, `archive.org/details/SalamanderGrandPianoV3` | CC BY 3.0 |
| Upright bass | VSCO 2 Community Edition, solo contrabass pizzicato, `github.com/sgossner/VSCO-2-CE` | CC0 1.0 |
| Electric bass, fingered | Karoryfer Black And Blue Basses (the Washburn AB-95), `github.com/sfzinstruments/karoryfer.black-and-blue-basses` | CC0 1.0 |
| Electric bass, Jazz | Karoryfer Growlybass (Squier Jazz Bass), `github.com/sfzinstruments/karoryfer.growlybass` | CC0 1.0 |
| Clean electric guitar | FreePats FSBS Electric Guitar Clean #1, `freepats.zenvoid.org/ElectricGuitar/clean-electric-guitar.html` | CC0 1.0 (stated on its page) |
| Nylon guitar | FreePats Spanish Classical Guitar, `freepats.zenvoid.org/Guitar/acoustic-guitar.html` | CC0 1.0 (stated on its page) |
| Drawbar organ | FreePats Drawbar Organ Emulation, `freepats.zenvoid.org/Organ/electric-organ.html` | CC0 1.0 (stated on its page) |
| Alto sax | Karoryfer Weresax, `github.com/sfzinstruments/karoryfer.weresax` | CC0 1.0 |
| Clavinet | GeneralUser GS, S. Christian Collins | GeneralUser GS License v2.0 |
| Electric piano | jRhodes3c, Jeff Learman, `github.com/sfzinstruments/jlearman.jRhodes3c` | CC BY-NC-SA 4.0 |

Licence problems to carry forward:

- **The electric piano is non-commercial and share-alike.** Its source's own licence file is ambiguous (it names BY and NC and links a different deed); the stricter reading was followed. It is not a permissive pack.
- **The clavinet's licence is bespoke**, and its author says he cannot be sure where all the samples came from. Treat it as unclear.
- **The grand needs attribution**: creator, title, licence link, and a statement of what was changed. The app needs a credits page.
- VSCO 2's readme asks, without making it a condition, that the samples not be sold directly and that Versilian be credited.

Sources looked at and rejected, with the reason: Sonatina (its licence forbids serving samples on their own), Philharmonia (no redistribution as samples), Pianobook (no redistribution), the Salamander Drumkit (share-alike), jRhodes for any commercial use. No free source was found for snare brushes, a clean china cymbal, or a better clavinet. A VCSL harmonica was tried and dropped: the reed buzz read as a rattle (noted).

## 2. What was cut from them, and what the cut lacked

The old packs were small: 13 packs in 9.9 MB, AAC at about 96 kbps, the largest 1.5 MB. Each pitched note was **one recording at one dynamic**, sampled every minor third or wider. Only the drum kit had alternates (2 to 4 takes a piece). The sources had more that was left behind: four dynamic layers on both electric basses, with staccato and ghost takes; three layers and two alternates on the upright; sixteen layers on the piano.

Missing from the old cut, against what the band plays now: a snare ghost note (it was the snare through a filter), a stick click, a dead note on the bass, a muted stroke on the guitar, a vibraphone, a steel-string guitar. The mid tom was the high tom pitched down. The piano covered C2 to C7 only. The upright stopped at E3 and the alto at G5. The alto and organ recordings end while still sounding, at about 5 and 4 seconds.

## 3. Verdicts by ear

- **(ear)** The sampled band sounds much better than synthesized voices; a real drum kit is the better default.
- **(ear)** The fingered Washburn bass sits in the mix. The Jazz bass read as harsh beside it.
- **(ear)** The grand was buried under the band until it was brought up a long way; then "present under the lead, not poking".
- **(ear)** The nylon guitar read low and far back: it wanted more level and less reverb than a level match suggested, and a touch brighter (+2 dB tilt).
- **(ear)** The alto wanted to be slightly darker (-1.5 dB tilt).
- **(ear)** An overdriven guitar made by putting clean samples through a simulated amp was "a little brittle" until the cabinet was warmed.
- **(ear)** From the brief: piano, drums and bass are good; mix coherence was the weak point; sax, trumpet and lead guitar are unconvincing from static samples.
- **(noted)** Bends and vibrato are not in guitar samples, and a lead line misses them.

## 4. Levels

The old gain numbers were set against synthesized voices that do not exist here, so the numbers do not carry. What does:

- **Matching RMS is not matching what is heard.** Dark and percussive sounds want to sit 1 to 3 dB under an RMS match. Balance against the band, not against a reference tone. (ear, repeatedly)
- **Kit balance set by ear**, as peak levels in dBFS: kick and snare -7, toms -8, crash -12, ride -13, ride bell -11, open and closed hat -15, pedal hat -19, cross stick -13, shaker -18.
- **Reverb sends, relative to the piano at 1**: basses 0.6, kit 0.7, guitars 1.0 to 1.2, alto 1.2, organ 1.5. Most of these were never confirmed by ear.
- **Each style was brought to -16 LUFS integrated under a -1 dBTP limiter**, and the make-up differed by 5 dB between styles (jazz needed the most, rock and disco the least). (measured)
- **A bass that is mostly fundamental vanishes on a phone or tablet speaker.** Checking the balance through a 150 Hz high-pass stands in for a small speaker. (measured; the cause was reasoned, not heard)

## 5. Preparing samples

- **Tune by measurement, and allow fractions.** A sampled note is rarely exactly on pitch. Rounding its root to a whole semitone left upright bass notes 12 to 23 cents off (noted as audible). A smooth drift across a piano is stretch tuning and is meant to be there.
- **Do not trust source filenames.** VSCO's contrabass files are misnamed in letter and octave. VCSL calls middle C "C3". Both Karoryfer basses name notes an octave high.
- **Level decaying notes with one fixed gain each.** A loudness normaliser run over a plucked or struck note lifts its tail by 10 dB and more. (measured)
- **The Jazz bass's attack spike** sat 23 dB over the body of the note and needed limiting. The fingered bass has about 25 ms of noise before each note. (measured)
- **The drawbar organ does not loop**: its tonewheels are not phase-locked, so no loop point joins cleanly. A held note has to be carried some other way.
- **The clavinet source** stops mid-ring 20 dB under its attack and has to be rendered out to a natural decay.
- **Spacing**: a minor third between sampled notes for sustained instruments, a whole step for plucked ones. (noted)

## 6. Playing samples

- **A note above the highest sampled note** rings thin and metallic when stretched up to. Do not stretch far past the top. (noted)
- **Open hi-hats pile up.** Without choking, a disco beat stacked about fifteen overlapping washes. (noted)
- **Stop has to silence sampled notes too**, including ones already scheduled. (noted, from a bug)
- **Cutting a note that is scheduled but has not started** should stop it at its own start. Fading it clicks. (noted)
- **A click buried in loud material** does not show in a waveform or level analysis. Ears find clicks.

## 7. Phones and browsers

- **Decoded memory is the limit, not the download.** Samples decode to 10 to 15 times their compressed size. One stereo piano layer of 21 six-second notes is 48 MB decoded. A four-piece band was 3 to 4.5 MB to download and 43 to 87 MB in memory. Mono, shorter tails and a lower sample rate were the levers. No out-of-memory failure was recorded, and what the weakest phone tolerates was never established.
- **AAC in `.m4a` was the one format every browser's decoder handled**, Mobile Safari included. Opus and Vorbis were judged unsafe on older Safari. Recheck against current browsers before choosing.
- **iOS audio unlock**: create and resume the audio context inside the tap handler, before anything is awaited, because Safari stops treating the tap as a gesture after an await. Playing a silent audio element in the same handler was also needed.
- **A hidden tab or a suspended context stops the audio clock.** Anything that waits on that clock needs a way out, and a suspended context has to be resumed.
- **Installing packs was slow on a real phone** when every file was hashed several times on one thread; fetching in parallel barely helped. Measuring on the development machine understated it. (ear, on a device)
- A size budget Brandon set last time: about 5 MB for a pitched pack, 12 to 15 MB for a kit. The old packs used a third of it or less.

## 8. Not established

First-sound latency by device. Whether iOS evicts cached packs. What a pack with several dynamic layers costs in memory on a phone, and whether the layers are worth it to the ear.
