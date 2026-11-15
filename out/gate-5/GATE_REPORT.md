# Gate 5: one band

Stage 5 gave the band a sound of its own: instrument packs cut from free sample libraries, a sampler, a scheduler, a mixer, and a bare page that plays a take in the browser. The gate asks three things (`docs/MILESTONES.md`):

1. Do the instruments sound like they are in the same room?
2. Is anything too loud, too quiet, or muddy?
3. Which soloist instruments are worth keeping?

Nothing here has been heard by me. Every claim below is a measurement or a statement of what was built. The balance, the reverb and every sound are yours to judge.

## How to listen

- **The files**: open `/out/gate-5/` on the audition server (`pnpm audition --host <address>`). Each file has a player. They are the takes below, rendered through the same sampler and mixer the page uses.
- **Live**: `/tools/audition/` plays any chart in any style with any seed. Under the take there is a fader for each seat's level and its reverb send, the room's level and the master. They work while it plays. The line of text under them is the mix as a style pack would hold it: paste it back and it becomes the style's mix.

## The files

| File | Band | What | Loudness |
|---|---|---|---|
| `1-jazz-rhythm-changes-bb-alto.m4a` | Jazz | Rhythm changes in Bb, 4 choruses, alto | -18.4 LUFS, peak -0.9 dBFS |
| `1-jazz-two-five-one-c-vibes.m4a` | Jazz | ii-V-I in C, 4 choruses, vibraphone | -19.4 LUFS, peak -0.8 dBFS |
| `1-jazz-ballad-eb-alto.m4a` | Jazz | Ballad in Eb, 2 choruses, alto | -20.8 LUFS, peak -0.8 dBFS |
| `1-jazz-waltz-f-no-solo.m4a` | Jazz | Waltz in F, 3 choruses, no soloist | -19.9 LUFS, peak -0.9 dBFS |
| `2-blues-12-bar-a-alto.m4a` | Blues | 12-bar in A, 5 choruses, alto | -19.0 LUFS, peak -1.8 dBFS |
| `2-blues-slow-g-vibes.m4a` | Blues | Slow blues in G, 3 choruses, vibraphone | -20.2 LUFS, peak -3.0 dBFS |
| `2-blues-quick-change-e-no-solo.m4a` | Blues | Quick-change blues in E, 4 choruses, no soloist | -19.5 LUFS, peak -2.4 dBFS |
| `3-funk-vamp-a-alto.m4a` | Funk | Vamp in A, alto | -17.7 LUFS, peak -1.6 dBFS |
| `3-funk-two-chord-dm-no-solo.m4a` | Funk | Two-chord vamp in Dm, no soloist | -18.0 LUFS, peak -2.7 dBFS |
| `3-funk-verse-bridge-e-vibes.m4a` | Funk | Verse and bridge in E, vibraphone | -16.7 LUFS, peak -1.2 dBFS |
| `4-soloist-alto.m4a` | Jazz | A jazz blues in F, 4 choruses, alto | -19.6 LUFS, peak -2.5 dBFS |
| `4-soloist-vibes.m4a` | Jazz | The same take, vibraphone | -19.3 LUFS, peak -2.5 dBFS |
| `5-layers-all.m4a` | Jazz | Rhythm changes, 2 choruses, every dynamic layer | -19.0 LUFS, peak -0.9 dBFS |
| `5-layers-one.m4a` | Jazz | The same take, one layer | -18.9 LUFS, peak -0.9 dBFS |
| `5-funk-layers-all.m4a` | Funk | One-chord vamp in E, every layer | -17.7 LUFS, peak -2.2 dBFS |
| `5-funk-layers-one.m4a` | Funk | The same take, one layer | -17.6 LUFS, peak -1.8 dBFS |

Every file is a jam with a count-in. Loudness is the whole file's, measured after rendering. They sit between -17 and -21 LUFS with peaks within 1 to 3 dB of full scale; the last version aimed at -16. Is it loud enough on the phone?

## What to listen for

### One room

- **The room is one shared reverb**, made by the mixer (1.2 seconds, the same for every style so far). Each seat sends some of itself to it: the bass least, then the drums, the chords, the soloist most. Does the band sit in one place, or are some instruments dry and close while others are far off?
- **The packs were recorded in different rooms on different microphones.** The drum kit carries some of its own room (overheads); the upright, the piano, the alto and the vibraphone are close. The electric bass and the guitar were recorded direct. Does any one instrument sound like it came from another record?
- **Everything is mono but the piano**, with each drum given a place from left to right (hi-hat a little right, ride a little left, as the audience sees a kit). The piano is the one stereo instrument. Does it sound too wide beside the rest, or does the kit sound too narrow?

### Balance

- **The starting mix came from measurement.** Each seat was rendered alone and its loudness read; then the piano was brought under the soloist, the jazz drums up (a ride and a feathered kick measure quieter than a backbeat), the funk guitar up. No ear chose any of it. Expect to move the faders.
- **Your first listen was with the piano about 3 dB louder than it is now** (a levelling fault in how the stereo piano was measured, since fixed). If the piano now sounds too far back, that is the reason, and the fader is the fix.
- **The low end**: bass and kick are the only seats with nothing cut. The chords are high-passed at 90 Hz and the soloist at 120. Is the bottom clear, boomy, or thin? On the phone's own speakers, does the bass disappear?
- **The jazz kick** is feathered: very quiet, on every beat. On the kit's soft kick recording, is it a pulse you feel, or a thud you notice?
- **The master** has light compression and a limiter. Do loud choruses pump or flatten?

### Each sound

- **Drums** (Virtuosity Drums, a jazz kit played with sticks). It is one kit for all three styles. For funk it may be too open and ringing: say if the funk backbeat wants a tighter snare and kick, and a second kit can be cut from another library.
- **Ghost notes on the snare** are their own soft recordings, not a quiet backbeat. Do they read as ghost notes?
- **The hi-hat closed with the foot** (jazz, on 2 and 4) is placed so its "chick" lands on the beat. Does it sit with the ride?
- **Upright bass** (Meatbass, a 1958 double bass, plucked). The last version used a different, orchestral bass. Does this one sound like a jazz bassist's instrument? It is tuned by measurement: it was recorded 11 cents flat on average and is corrected note by note.
- **Piano** (Salamander, a Yamaha C5). Three dynamic layers. Do loud chords sound struck harder, or only louder?
- **Electric bass** (the Washburn you preferred last time). **Dead notes** are the library's recorded ghost notes. A thump, or still a blip?
- **Clean guitar** (a Fender through a clean amp). **The scratches** are real deadened strokes from a second guitar. Do they read as the "chick" of a funk strum now? They are five strokes spread from dark to bright across the strum.
- **A dead note on the upright** is still the note itself, short and quiet: the library had no damped thump to use.

### The soloists (question 3)

- **`4-soloist-alto` and `4-soloist-vibes` are the same take** with each instrument: the same band, the same form, each soloist playing its own line.
- **Alto sax** (Weresax): single sustained notes at two dynamics. No bends, no vibrato, no legato between notes; every note is tongued. The brief already says sampled sax was unconvincing last time. Is this one worth keeping as it is? If the answer is "nearly", two things can be added in the sampler without new samples: a delayed vibrato on long notes, and slurring into a note that follows without a gap.
- **Vibraphone** (VCSL, hard mallets): a struck instrument, so a sampler has less to fake. It has no motor vibrato and its notes ring until their written length ends.
- **Above the top recorded note** the sampler stretches the nearest recording up: two semitones for the alto, one for the vibraphone. If a high note sounds thin or pinched, that is why.

### Do dynamic layers earn their memory? (section 5)

`5-layers-all` and `5-layers-one` are the same take; so are the two funk files. With every layer a jazz quartet is 212 MB in memory and a funk quartet 128; with one layer they are 78 and 56. If you cannot tell them apart, the app can load one layer and be lighter on a phone. If you can, the layers stay.

## What was checked

- **Ten minutes, live, in a browser**: a jazz take of 10 minutes 14 seconds played in headless Chrome. 12,434 notes handed to the sampler, **none late, none dropped**. (The stage's "done when".) The page shows the same counts while you play.
- **The scheduler's timing with a made-up clock**: three properties in `test/audio.test.ts` (every note once, in order, ahead of its time; nothing twice or more than a moment late after a stall; start part-way and stop). Each was confirmed to fail when the scheduler was deliberately broken.
- **Notes land where the engine wrote them**: in rendered takes, the onsets of drums, bass and chords sit a constant 10 to 12 ms after their written times, the same for every seat within about 2 ms. The constant is the look-ahead of the two compressors on the master; it moves the whole band together.
- **Your iPhone 17 and your laptop both played it** (your first listen), so Safari decodes the packs and a tap unlocks the sound.
- **Stop is clean by measurement**: a render with stop pressed at 20 seconds and no reverb reads -72 dBFS from 0.2 seconds after the stop and silence after 1.7. Before the fix it read -17 dBFS (the pop you heard).
- **Every pack file was measured independently of the agent that cut it**: all listed files present and no others, lengths exact to the sample, levels on reference, each licence identical to its source's.
- `pnpm check` passes in about 9 seconds of 10. Engine output is unchanged: the goldens match and `pnpm score` shows no movement in any of the three scorecards.
- **The rendered files match live playing to within rounding**: a render made the slow way (every note queued at once) and the way the files were made (a second at a time, by the scheduler that plays live) differ by at most one step of 16-bit in 0.6% of samples.

## The packs

| Pack | Source | Licence | Download | In memory |
|---|---|---|---|---|
| drum-kit | Virtuosity Drums (Versilian Studios, Karoryfer Samples) | CC0 | 1.9 MB | 39 MB |
| upright-bass | Meatbass (Karoryfer Samples) | CC0 | 1.5 MB | 30 MB |
| grand-piano | Salamander Grand Piano V3 (Alexander Holm) | CC BY 3.0 | 6.0 MB | 114 MB |
| alto-sax | Weresax (Karoryfer Samples) | CC0 | 2.1 MB | 29 MB |
| vibraphone | VCSL (Versilian Studios) | CC0 | 1.1 MB | 19 MB |
| electric-bass | Black And Blue Basses (Karoryfer Samples) | CC0 | 1.7 MB | 30 MB |
| clean-guitar | FSBS Electric Guitar Clean (FreePats), muted strokes from Emilyguitar (Karoryfer Samples) | CC0 | 2.0 MB | 30 MB |

- Each pack's folder holds its source's licence text and a `pack.json` naming the source, its version and what was changed. The sources are pinned by commit in `scripts/packs/sources.ts`, and `pnpm packs:cut` cuts any pack again from them.
- **The piano needs attribution** (CC BY). The app will need a credits page; the data for it is in each `pack.json`.
- A jazz or blues quartet is 12 MB to download and 212 MB in memory. A funk quartet is 8 MB and 128 MB.

## Decisions made along the way

Each is in `DECISIONS.md` with its reason.

- **A fresh cut from the sources**, not the old cut-down files (your choice).
- **Every recording is levelled alike and velocity alone sets the level**, so layers change colour, not volume.
- **Layers are split where the band plays** (velocities 50 to 92), not evenly from 1 to 127.
- **The piano is stereo**: summed to mono, its two microphones cancelled in narrow bands by up to 11.6 dB.
- **A recording's hit goes on the beat, not its first sound.** The foot hi-hat hisses for 25 ms before its "chick".
- **Opus in WebM**, a third to a fifth the size of the alternatives. Verified on your phone.
- **The look-ahead is a second and a half**, so a background tab does not drop notes.
- **The mix lives in the style pack** (`sound` in each style), with the pack for each seat.

## Known and left

- **One kit for every style.** A tighter kit for funk is a second pack if you want it.
- **No brushes.** No free library has them.
- **No dead note on the upright.**
- **The sax is static samples.** See the soloist questions.
- **The reverb is the same in every style.** A style can have its own room; none does yet.
- **Archive fetching in `pnpm packs:fetch` is untested**: the guitar library was fetched by hand, and the code that would fetch it again has never run.
- **Rhodes and organ** are not cut. The Rhodes source the last version used is non-commercial; another is needed before neo-soul. They belong with the styles that use them (stage 6).
- **What a weaker phone tolerates** in memory is not established. Your iPhone 17 holds the full quartet.
- From gate 4, still open: the listening questions you have not spoken to, the small funk vocabulary, the waltz comp.
