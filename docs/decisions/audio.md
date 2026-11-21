# Decisions: audio and the packs

The sample packs (sources, the cut, what a pack is), the scheduler, sampler and mixer, the instruments chosen by ear, and the levels.

## stage 5 begins: where the packs come from (a survey, and a recommendation not yet answered)

Brandon asked for a careful start: a look at the old packs with a narrow mandate, and a look online for permissive packs. Both were done on 2026-11-15. What was learned is in `docs/AUDIO_NOTES.md`; it carries knowledge about sounds, licences and phones, and nothing about how the old audio code was built.

- **The old packs are thirteen cut-down sets (9.9 MB, AAC), each from a free library.** One recording per note at one dynamic; no licence file beside any pack; the sources are not on this machine.
- **Against what the band plays now they lack**: a ghost snare, a stick click, a dead bass note, a muted guitar stroke, a vibraphone, and any dynamic layers. The sources they were cut from have most of these.
- **The independent search online landed on the same sources** (Versilian, Karoryfer, FreePats, Salamander). Nothing better turned up for any seat the band has today.
- **Recommendation: same sources, a fresh cut.** A script in this repo fetches each source, takes what the band needs, measures loudness, and writes the pack with its licence file. Why: the brief wants the licence beside each pack and the loudness measured at ingestion, the band now plays dynamics and articulations the old cut cannot voice, and re-encoding the old AAC files would cost quality for nothing. Not done until Brandon answers: he expected the existing packs to be enough, and this is his call.
- **Left for later, noted**: the electric piano's source is non-commercial, so a Rhodes needs another source before neo-soul (stage 6). The clavinet's licence is unclear.

## stage 5: a fresh cut (Brandon's choice), and what a pack is

Brandon chose the fresh cut: "that sounds like it'll pay off". The sources are pinned by commit in `scripts/packs/sources.ts`; a cut can be repeated from exactly what it was first cut from.

- **A pack is `pack.json` plus audio files plus the source's licence text**, in `assets/packs/<id>/`. The format is the type in `packages/audio/src/pack.ts`, shared by the script that writes packs and the sampler that reads them.
- **Every take is levelled to one reference when the pack is cut; velocity alone sets the level.** A soft recording and a hard one then differ in colour only, and there is no jump in level where one layer hands over to the next. Why: the libraries are not consistent about how loud their layers are, and a level that steps at a boundary is the classic sampler fault.
- **Layers are split where the band plays, not evenly.** Measured over the library in three styles: pitched seats play velocities 50 to 92 (median 71), ghost notes and the jazz kick 25 to 34, backbeats up to 105. Even splits at 32/64/96 would leave nearly every pitched note on one layer. The tops are data in each recipe.
- **Opus in WebM at 48 kHz.** Several times smaller than the alternatives at the same quality, and its header says how much lead-in to skip, so a decoded file starts where the sound starts. Risk: older Safari. Reported as working for Web Audio since Safari 17.4, not verified here; a probe on a real phone comes before the gate, and the codec is one setting in the cut script.
- **Mono files with a pan per drum voice; a mono piano.** Memory once decoded is the limit on a phone (`docs/AUDIO_NOTES.md`), and stereo doubles it. The shared reverb is what puts the band in a room. Budget for a quartet: about 160 MB decoded.
- **The upright is Karoryfer's Meatbass**, not the VSCO contrabass the last version used: a jazz player's instrument with four dynamics and four alternates against an orchestral one with three and two. VSCO stays fetched as the fallback Brandon has heard.
- **A missing voice falls back to the plain one.** A pack without a dead note plays the note itself, short and quiet, as a General MIDI synth does today.

## the scheduler (stage 5)

- **The engine gives notes in seconds** (`timedNotes`, `secondsAt`): the tempo is the plan's, so the conversion belongs to the engine, and the audio package never meets a tick.
- **The audio package takes `Sound`s**: a time, a length, a pack, a voice, a pitch, a velocity. Which pack plays which seat is decided outside it. It imports nothing from the engine.
- **The look-ahead is 1.5 seconds.** A background tab's timers fire once a second, and a look-ahead shorter than that drops notes whenever the tab is hidden. The cost is that stopping has to silence up to a second and a half of notes already handed over, which the sampler does.
- **A sound found late is played at once if it is within 50 ms, and dropped otherwise.** After a long stall the band comes back in time rather than playing a pile of old notes together. Both are counted, which is how "no dropped or late notes over ten minutes" will be read off the page.
- **Three properties, with a made-up clock** (`test/audio.test.ts`): every note once, in order, ahead of its time, whatever the timers do short of a stall; after a stall nothing twice and nothing more than a moment late; a start part-way through plays nothing from before it, and stop stops. Each was checked by breaking the scheduler and watching it fail. The milestone names this as the one check on the audio layer; nothing else there gets a test.

## the sampler, the mixer, the audition page (stage 5)

- **The sampler plays what the pack says and nothing cleverer**: the layer for the velocity, the zone recorded nearest the pitch, the takes in turn, level by the square of velocity (the usual MIDI law, 40 dB from 1 to 127) times the voice's trim. A voice the pack lacks is the plain voice. Where the sound starts in a decoded file is found again when it loads, so a browser that leaves a codec's lead-in at the front cannot push that pack late.
- **Stop and choke cut a sound in 30 ms; a sound handed over and not yet started is stopped at its own start** (`docs/AUDIO_NOTES.md`: fading one in to fade it out clicks). A note already in its release is left to finish.
- **The reverb's room is made, not recorded**: decaying noise that darkens as it rings, the same every time. A recorded room would be one more asset with a licence, and the render would not be repeatable.
- **The mix preset is in the style pack** (`StylePack.sound`: the pack for each seat and the mix), as the brief asks. The engine does not use it. The audio package has its own `Mix` type of the same shape and imports nothing from the engine; Biome now enforces that.
- **`DEFAULT_MIX` is a starting point no ear has been on.** The audition page has a fader for each seat's level and reverb send, and prints the mix as it would be written in a style pack, so Brandon can balance by ear at the gate and the numbers come back as data.
- **No bundler yet.** `scripts/serve.ts` serves the source with types stripped (Node's own `stripTypeScriptTypes`) and the page uses an import map. Vite arrives with the app in stage 6.
- **A take can be rendered to a WAV with nobody at a browser** (`scripts/render-audio.ts`): headless Chrome opens the page, the page renders through the same sampler and mixer in an `OfflineAudioContext` and posts the file back. This is how levels get measured and how audition files get made. It is a tool, not a test.
- **`loadPack` can load fewer layers than a pack has**, for the one-layer comparison at the gate and as a lever for a phone short of memory.

## stage 5: the cut script and the first five packs

`scripts/packs/cut.ts` cuts the quartet's packs and the vibraphone (`pnpm packs:cut`). Calls made while building it, each a number or a line in a recipe:

- **ffmpeg with soxr.** The ffmpeg 9 on the path (Homebrew) has libopus and no soxr; the script takes the first of `$FFMPEG`, `ffmpeg`, `/usr/bin/ffmpeg` built with both (here Debian's 7.1) and prints which. Encoder output is pinned with `+bitexact`.
- **Levelled after the codec.** A sample peak moves by up to 1.3 dB through Opus, so each take is encoded, decoded, and its one gain corrected until the decoded file sits within 0.05 dB of the reference (the kit ends within 0.3).
- **The piano starts at the hammer.** Salamander's files open on the action's noise, within 50 dB of the peak, and the strike comes 3 to 24 ms later (median 10). Its onset is the first sample within 30 dB of the peak (`onsetDb` in the recipe); every other pack uses 50.
- **Budgets bound by caps first, then alternates.** The kit as briefed was 72.9 MB decoded against 40: drum caps now sit near each voice's median 40 dB decay (kick 1.2 s, snare 1, toms 1 and 1.5, hats 0.6 to 2.5, ride and bell 3.5, crash 5) and the outer layers keep two alternates. The upright was 39.9 MB against 30: its caps fall from 2.9 s to 1.8 s instead of 4 to 2.5.
- **No dead bass note.** Meatbass's percussive noises measure as body knocks (one resonance near 65 Hz shared by all eight, no harmonic series on a string's pitch), not a damped string.
- **The kit's sticks are the stickshot** ("one stick strikes other while it is touching drum head", keymap PDF), and its cross-stick is the snare's, from the full kit program, which the basic one leaves out.
- **Scripts typecheck.** `scripts/packs` has its own `tsconfig.json` in the build; `assets/packs` is generated and out of biome's reach.

## the first five packs, checked (stage 5)

The builder's report was checked against the files, not taken on trust: every file a `pack.json` lists exists and nothing else does; every decoded length matches to the sample; FFmpeg's own loudness meter reads -20.0 on the levelled packs and the kit's peaks are within 0.2 dB of -6; the licence beside each pack is the source's, byte for byte.

- **The piano is stereo.** Summed to mono, 47 of its 66 takes lost more than 6 dB in some third-octave band between 1 and 8 kHz (up to 11.6 dB): the two microphones are a spaced pair and cancel. Stereo costs 114 MB decoded against 63. The quartet is 212 MB in memory, which an iPhone 17 has room for; `loadPack`'s `layers` option is the lever for a phone that has not.
- **The sampler puts a recording's hit on the note's time, not its first sound.** Measured in the packs: a hi-hat closed with the foot is 24 ms into its file before it is within 20 dB of its peak, a shaker 41 ms, a soft alto note 10 to 20. Started on the beat, the jazz hi-hat on 2 and 4 would have dragged by a fortieth of a second on every stroke. The hit is the first sample within 12 dB of the recording's peak, found when the pack loads (so a decoder's lead-in is covered by the same rule), and the recording starts early by that much. The threshold is one constant; no ear has judged it.
- **Rendered takes land where the engine wrote them.** `scripts/check-timing.ts`: drums, bass and piano onsets are 10 to 12 ms after their written times, the same for all three within 2 ms. The constant is taken to be the look-ahead of the two compressors on the master (6 ms each in Chrome); it moves the whole band together.
- **A whole jazz take played live in headless Chrome**: 3,418 notes over three minutes, none late, none dropped.
- **The starting mix is from measurement, not from an ear**: each seat rendered alone and its loudness read. The blues piano measured 1.7 dB over the soloist and came down 3 dB; the jazz drums (a ride and a feathered kick) measured 6 dB under the blues drums and came up 3. Full mixes of four takes read -17 to -18 LUFS; the master is trimmed 1.5 dB for headroom. (Corrected at the gate: with the trim, the gate's jazz takes still peak at -0.8 dBFS, because the limiter is a compressor with make-up gain and not a wall. Nothing clips; the peaks are not under -2 as first written here.)
- **No dead note on the upright**: the library's "noises" measure as knocks on the body. The fallback (the note itself, short and quiet) stands.
- **Found for funk**: the Washburn bass Brandon preferred has recorded ghost notes; the clean Fender library has no muted strokes, and Karoryfer's Emilyguitar (CC0) has twenty-five. One pack will draw on both, credited as such.

## first listen: it plays on the laptop and the iPhone; a pop after stop (stage 5)

Brandon listened on his laptop and his iPhone 17: "nice job... the instruments themselves all worked". So Safari on a current iPhone decodes the packs (Opus in WebM) and the tap unlocks audio. One fault: "a popping kind of sound that echoes after stopping playback".

- **Measured before changed.** A render can now press stop part-way (`stop=20`). With a dry mix, the second and a half after the stop still peaked at -17 dBFS, and so did the rest of the file.
- **The cause was mine.** A recording starts a little before its note's time, by its run-up to the hit. Stop took a queued note out "at its own start" using the note's time, not the earlier moment its recording begins, so every queued note played its run-up and was cut at the hit: a string of clicks, in tempo, into the reverb.
- **The fix**: a queued recording is stopped at the moment it would begin, so it never sounds. After it, the same measurement reads -72 dBFS from 0.2 s after the stop (notes that had just ended, finishing their own release) and digital silence from 1.7 s.
- **Stop now fades over 120 ms; a choke stays at 30 ms.** A whole band cut in 30 ms thumps in the bass. A cymbal closed by a foot is that quick; a band stopping is not.
- No test: the audio layer has none beyond the scheduler (`docs/TESTING.md`), and this lives in the sampler, which needs a browser. The measurement is repeatable: `pnpm render:audio x chart=... stop=20 mix='<dry>'`, then read the level after 20 s.

## stage 5: funk's two packs, and a pack may credit several sources

Built from `prompts/cut-funk-packs.md`. `electric-bass` (Black And Blue Basses, the darkblack Washburn) and `clean-guitar` (FSBS clean for the notes, Emilyguitar for the muted strokes).

- **`Pack.credits` is a list**, the main source first, each with its own `changes`. `LICENCE` is the one text when the sources' licences are byte-identical (FSBS's and Emilyguitar's are), else each in turn under its source's title. The five earlier packs were recut: only their `pack.json` changed.
- **A source may be a release archive** (`ArchiveSource`: URL, SHA-256, unpacked with `7z`). The fetch path is written but has never run: the archive here was fetched by hand, as `clean.7z`, so a fetch on this machine would download it again under its URL's name.
- **The electric bass takes every third semitone.** All 32 recorded notes from 26 to 57 were 92 MB decoded for the plain voice alone against 30; caps short enough to fit (0.55 s) would cut a held last note. A minor third apart no note is more than a semitone from a recording, the same worst case as a whole step. The caps then fall from 2.45 s to 1.63 s (the brief's 3 to 2 came to about 36 MB with the dead voice).
- **The bass mapping is an octave above the sound** (key 40 sounds E1): every take measured 12 semitones under its key, so a take's pitch is its key less 12.
- **The dead note keeps its fret as its root.** The ghost samples are short and pitched, but 0.5 to 2 semitones under the fret they were played at, ringing an open string's harmonic at the bottom and top of the neck, and neighbouring frets measure alike; a measured root would retune each ghost and put zones out of order. `Voice.measureRoots: false` keeps the recipe's pitch. Cut at 0.3 s (the band's are 80 ms).
- **The guitar's caps fall from 2.45 s to 1.53 s** (the brief's 4 to 2.5 came to about 48 MB). Its notes at G4 and above are recorded at one dynamic: alternates 1 and 2 go to the soft layer, 3 and 4 to the loud.
- **The muted strokes are placed, not tuned**: roots 51, 55.5, 60, 64.5 and 69 in order of spectral centre (muted 1, 2, 4, 5, 3). The nearest-zone rule moves a stroke by at most 2 semitones between 51 and 69.
- **Short sounds levelled to -20 LUFS peak above full scale**: the dead notes up to +5.9 dBFS, the muted strokes up to +9.8 (a 0.1 s sound measured over a 400 ms window). ffmpeg's Opus decoder returns them unclipped (round-trip level within 0.19 dB); whether every browser's decoder does is not established.

## funk's packs, checked; two levelling faults fixed in the cutter (stage 5)

The second builder's report was checked against the files the same way as the first: every listed file present and nothing else, lengths exact, levels on reference, licences the sources' own.

- **`electric-bass`** is the Washburn from Karoryfer's Black And Blue Basses, four dynamics, a note every minor third (every recorded note would have been 92 MB against a budget of 30), with a `dead` voice from the library's recorded ghost notes. The ghosts are pitched a little under their fret, so the voice keeps the fret as its root and is not retuned.
- **`clean-guitar`** is FreePats' clean Fender for the notes and Karoryfer's Emilyguitar for the `muted` voice: five kinds of deadened stroke, five takes each, laid across the strum from the darkest at the bottom to the brightest at the top. Two libraries, so `Pack.credit` became `Pack.credits`, a list.
- **A short stroke is levelled by its peak, not its loudness.** A loudness is read over 400 ms; a 90 ms stroke brought up to it came out 6 to 10 dB over full scale (the builder reported it; my measurement agreed: the dead notes peaked at +5.9 dBFS, the muted strokes at +9.8). `PackVoice.level` now lets a voice have its own levelling: the dead and muted voices are levelled to the middle peak of their pack's plain notes, so at one velocity a stroke peaks where a note does and the player's lower velocity puts it under.
- **A stereo pack is levelled as a pair.** The piano had been levelled on the fold of its two channels, and two channels played side by side are about 3 dB over their fold: FFmpeg's meter read -17.5 on files meant to be -20. It now reads the pair. Brandon's first listen was with the piano 3 dB hot; he made no remark on the balance.
- **Funk's starting mix**: alone, the guitar measured 3 dB under the bass at the default level, and came up 3. No ear yet.

## gate 5 files; two faults in the render tool (stage 5)

- **Sixteen audition files** (`pnpm gate:5`): each band on its own tunes, the same take with each soloist, the same take with every layer and with one. Encoded to `.m4a` for any player; not kept in git, because the script makes them again from the packs. The server plays them from a page and now answers requests for part of a file, which Safari needs before it will play audio.
- **A ten-minute take played live in headless Chrome: 12,434 notes, none late, none dropped.** That is the stage's "done when".
- **The render queued every note of a take at once, and slowed with the square of its length**: a 165-second funk take took 179 seconds and hit the tool's time limit, which is how it was found. A render now hands notes over a second at a time, with the scheduler that plays live. The same take renders in 9 seconds, and differs from the old way's output by at most one step of 16-bit in 0.6% of samples (the order the mixer sums in).
- **Headless Chrome waited 25 seconds before its first request**, every launch: it asks the desktop keyring for a key over D-Bus, and this machine has no desktop session. `--password-store=basic` removes the wait.
- **Editing a shell script while it runs cuts it short.** The first gate run stopped two thirds through for this reason and for the time limit above; both looked the same. Noted so the next unexplained early exit is checked against both.

## gate 5 passed (stage 5)

Brandon, 2026-11-15, on his laptop and iPhone: "everything is sounding fantastic in my testing so far"; "sax is definitely good enough so far, and the vibes sound wonderful". No complaint about room, balance or loudness. A short verdict is leave to carry on, not an answer to each question, so these hold as defaults and stay open to his ear:

- **Both soloists stay**, alto and vibraphone. The alto's vibrato and slurs in the sampler are not built: "good enough so far" does not ask for them.
- **The mix stays at the measured numbers** in each style's `sound.mix`. No fader line came back.
- **Packs load every layer.** Nothing said the layers could go, and his phone is recent. `loadPack`'s `layers` option stays as the lever if a weaker phone needs it.
- **One kit for all three styles.** A tighter kit for funk waits on a complaint, or on rock and disco in stage 6, which will want one anyway.

## a lead guitar's tone: the clean guitar through an amplifier (stage 6, part 5)

Brandon, asked how to get a lead guitar: the old band "manipulated the samples" and "it worked reasonably well". The notes already say how (SN-25, EAR-16), so nothing was read from the old code.

- **The overdriven guitar is the clean guitar's plain notes put through an amplifier when the pack is cut** (`scripts/packs/amp.ts`, a recipe's `amp`): thinned below 90 Hz, a soft clip made a little uneven, then a speaker that rolls off at 4 kHz with +2.5 dB at 450 Hz and +1.5 dB at 2.4 kHz. Those are the old band's kept numbers, the speaker being the part its owner's ear settled ("a little brittle" until it was darker and had body).
- **The amp runs at four times the sample rate.** A clip makes overtones far above what a 48 kHz file holds, and they fold back as tones that belong to no note, which is one way to be brittle. The old notes do not say whether the old one did this.
- **Every take meets the clip at full scale**, so a note is driven the same whatever its recording's level, and the softer of the two dynamics is driven half as hard: a lighter touch cleans the amp up.
- **Two packs for now, 3 times drive and 6** (`driven-guitar`, `driven-guitar-grit`), because drive is the knob the notes say is set by ear and nobody here has one. Measured on E4, the loud layer: the peak sits 15 dB over the average level clean, 11 dB at 3 and 8.5 dB at 6, so the note is held up longer the harder it is driven. One of the two goes when Brandon has chosen.
- **Both are soloists the player can pick** (`SOLO_INSTRUMENTS`), with plain notes: no bends, no vibrato. Rock's default soloist stays the alto until the tone has passed. Pitch movement (a note that carries a bend or a vibrato, a sampler that follows it, pitch bend in the MIDI file) is the next step, and is the part that makes it a guitarist.
- The clean guitar's pack was cut again after its plain notes were made a function both recipes share, and came out byte for byte the same.

## the lead guitar's drive, the soloist's level, and the suite's budget (stage 6, part 5)

Brandon, after hearing both guitars: "they both sound pretty good, might just depend on the context a little bit. i guess i'd lean toward slightly less, so let's stick with the 3x"; "soloist volume may need to come up a touch in general, please check levels"; and on the budget, "i'm open to your professional opinion... i don't want to create artifical constraints, but i also don't want to create a monstrous test suite that makes iterating on the project slower".

- **The overdriven guitar is driven three times.** The six-times pack and its instrument are gone.
- **The soloist sits about a decibel under the band it plays over, in every style.** `pnpm levels` (new, `scripts/levels.ts`) renders each seat alone through the real sampler and mixer and reads its loudness; a soloist is read while it plays. Before: 2.5 dB under the band in the blues, 1.5 in jazz, 4.9 in rock, 5.8 in funk. Now 0.5 to 1.8 under in all four, on any of the three instruments. The default soloist level is up 1.5 dB; jazz, the quietest band, is up 0.5; rock 3; funk 4.5 (short stabs over a busy band).
- **Rock's overall level was 2 dB under the blues'**, set from the old band's make-up gains and not measured. It is now where funk's is (-17 LUFS; the blues and jazz read -18.5).
- **The tool that renders a take to a file used the blues' mix for every style asked for by name** (`tools/audition/main.ts`): found because rock's level did not move when its mix did. Fixed. Gate 5's files were rendered by chart, which takes the chart's own style, so they were right; anything measured since with `style=` was not, including the first numbers read here.
- **Noticed and left for an ear**: rock's piano reads 4.5 dB under its drums, where the blues' is 1.4 and funk's guitar level with them. Nobody has complained.
- **The engine suite's budget grows with the styles and with nothing else: 10 seconds with three, 2 more for each after (12 now, 20 at eight).** The rule exists to stop tests piling up, and they have not: there are 62 properties, and the count is what a new style does not change. What grew is the number of bands held to them, each in a process of its own (5 to 7.5 s alone, and slower side by side). The other ways to stay at 10 were to check each style on one seed (7.8 s with four, so over again by six or seven, and one property needs two seeds) or to check only some styles on a push (an engine change can break any of them). Both give up coverage to keep a number. What stays rationed is the rules: a new property, a new kind of take, or more seeds still has to fit, and `docs/TESTING.md` now says so. The suite reads 10.3 s of 12.

## the electric piano is the Rhodes (stage 6, part 5)

Brandon, 2026-11-15, asked whether to use the old band's Rhodes or a CC0 FM piano: "it'll stay non-commercial, let's use the rhodes".

- **The source is `jrhodes3d`** (Jeff Learman, a 1977 Mark I Stage 73), pinned in `scripts/packs/sources.ts`. The old band used `jRhodes3c`, the same takes shortened and looped; a first cut from it gave soft and low notes about a second long, ending near their peak, because that set is meant to be looped by its player and the packs play a recording once. The author's full-length set has the same fifteen notes at up to five dynamics, 14 to 25 s long at the bottom.
- **Its licence is CC BY-NC 4.0**, by its own `LICENSE` file ("License for samples: CC BY-NC"): credit, and no commercial use. (The looped set's file named BY-NC-SA and linked BY-NC; the full-length set's mapping file still says "CC-SA-BY" in a comment. The `LICENSE` file is what the pack follows and carries.)
- **What that binds**: Ensemble is not sold or put behind payment while this pack ships in it; the pack carries the source's licence file, its credit names the licence, and the credits page says in words that these recordings may not be used commercially. Every other pack is CC0 or CC BY and is not touched by this. If Ensemble were ever to be commercial, this pack is the one to replace or to ask the author about (he offers a commercial licence on request).
- **The pack** (`electric-piano`, cut by a Sonnet subagent from `prompts/cut-electric-piano.md`, checked here): mono, 15 notes by 5 layers (tops 47, 72, 95, 111, 127, the mapping's), 75 files, 3.9 MB encoded, 65.7 MB decoded. A note lasts 6 s at the bottom falling to 3.5 s at the top; a low note is 8 to 10 dB down where the cap cuts it and is faded from there. Release 0.3 s (the mapping's runs 0.5 to 0.2 by register; the pack carries one). Roots within 17 cents of the mapping's, 3 on average. The eight other packs are untouched.
- **It plays**: the jazz ballad's chords rendered on it (`pnpm render:audio … packs=chords:electric-piano`, a new way to put any pack in a seat on the audition page) read -23.9 LUFS where the grand reads -26.4 in the same part. No style uses it yet, so it is not in the app until neo-soul is.
- The CC0 alternative found and not used: `Electrophones/TX81Z/FM Piano` in VCSL, already a pinned source.


## the acoustic guitar is a steel-string archtop; the nylon stays (stage 6, part 5)

Brandon heard the same picked and strummed part on three guitars (`scripts/steel-study.ts`, served from `out/steel-study/`): the nylon already cut, FreePats' FSS steel-string (a Seagull flat-top, GPL 3 with the FreePats exception for music made with it), and Karoryfer's Shinyguitar (an archtop through a microphone, CC0). 2026-11-15: "let's go with the archtop, it sounds pretty good and the license is nice", and "we should keep nylon as an option as well".

- **`shinyguitar` is pinned** (`scripts/packs/sources.ts`, the microphone recordings only) and the cut is briefed in `prompts/cut-steel-guitar.md`: 16 notes at four dynamics, two alternates each. It waits for the acoustic build to report (one subagent at a time).
- **The flat-top was not chosen**: the genre's own instrument, but shipping its samples in the app is distributing them under the GPL (the pack under the same terms, its licence text, the means to rebuild it to anyone who asks), and it has one dynamic for most notes.
- **The acoustic style is being built on the nylon** and moves to the steel in one line when the pack is in (`sound.packs.chords`, and its soloist).
- **Nylon as an option** needs something the app does not have: a seat's instrument chosen by the player where a style has more than one that plays the same part. The soloist already works this way (`SOLO_INSTRUMENTS`). Put to Brandon as a small piece of work for after acoustic is heard: a style lists the instruments its chord seat may be played on (the first is its own), and the band setup offers them where there is more than one.
- **No manager for packs**: ten packs are 24 MB to download in all and a band loads only its own three or four. What a growing shelf does need is listed in `PLAN.md`.

## the steel-string guitar is cut and acoustic plays it; a seat's instrument can be chosen (stage 6, part 5)

- **`steel-guitar` is cut** (a Sonnet build from `prompts/cut-steel-guitar.md`): Karoryfer's Shinyguitar, the microphone recordings only, CC0. Seventeen notes a minor third apart (Db2 to C6), four dynamics at the source's tops (32, 64, 96, 127), the first two of four alternates: 136 files, 4.6 MB to fetch, 78.3 MB decoded (budget 80). Checked on the main thread: the diff is the pack, its recipe and two lines registering it; `LICENCE` is the source's file byte for byte; the ten other packs untouched; it plays through the sampler (`pnpm levels`).
  - Its top notes are cut at 2.0 s, not the brief's 2.5: at 2.5 the pack came to 83.8 MB. The bottom keeps 4 s.
  - `release` 0.12 s: between the nylon's 0.1 and the source mapping's 0.25. A guess; no ear.
  - File names and the mapping agree with the measured pitches (no octave error, as Karoryfer's bass library has); the worst take is 14 cents off its name, and roots are the measured ones.
  - Not used: the pickup recordings, release noises, muted strings, body taps.
- **Acoustic's guitar and its soloist are the steel-string** (`sound.packs.chords`, `solo.instrument`, program 25). `SOLO_INSTRUMENTS["steel-guitar"]` has the nylon's register and hand (E3 to A5, no bend, the narrow shake): unheard numbers. The two acoustic goldens were rewritten for the instrument and nothing else; no scorecard moved.
- **Mix, measured** (`pnpm levels acoustic`): the steel-string read 1.1 dB under the nylon in the same part, so the seat is at -6.9 (was -8) and reads -22.6 LUFS as before; the soloist at 3.9 (was 3) reads 0.9 dB under the band; everyone -18.1 LUFS, peak -0.4 dBFS before the limiter's ceiling.
- **A seat's instrument can be chosen where a style offers more than one** (Brandon: "we should keep nylon as an option as well"). `SoundStyle.choices` lists the instruments a seat's part may be played on, the style's own first, each with a level in decibels that keeps the band as loud as on the style's own (the nylon: -1.1, and `pnpm levels` prints each choice against the style's own). The choice is `TakeOptions.instruments`: the engine plays the same notes whichever it is and reads it nowhere, but it is part of what a take is, so it goes in the recipe with the soloist's instrument and a kept take plays again on the guitar it was kept on. The app keeps it with the chart, drops it when the chart's style is changed, and shows the picker only for a seat with a choice. Only acoustic offers one.
  - Not done: the exported MIDI file names the style's own instrument (program 25) whichever was chosen. `toMidi` is not given the options, and a program number is the first thing changed in a sequencer.
  - The pickers under Band are a draft: two selects with no labels of their own, told apart by "Chords:" and "Soloist:" in their options. For the pass over the interface.

## every style heard; the electric bass is harsh (stage 6, part 5)

Brandon, 2026-11-16, of acoustic: "everything i'm listening to sounds great so far! awesome work on the acoustic side of things"; and "disco, neo-soul, and reggae all seem good as well. we might want to look at the bass pack(s) for some of those though - the electric bass sound is a little harsh, and we might need something else for the mellower genres". All eight styles have now been heard and passed; the one thing asked for is the electric bass.

- **Measured before anything was changed.** The pack has four recorded dynamics, split at velocities 56, 68 and 80. Counted over each style's own charts, the bass plays the hardest set in 47% of its notes in funk, 44% in rock, 51% in disco, 31% in reggae and 18% in neo-soul, the second hardest in nearly all the rest, and the softest never. The share of a note's energy above 800 Hz, by set, softest first: -37, -36, -26 and -20 dB. So the band plays the two bright sets almost all the time; the library's own "warm" programs are the same recordings with the top set left out.
- **Two things a style can now say about a seat's sound**, both left out by every style so far:
  - `SoundStyle.touch`: a number added to a note's velocity to choose the recording played, while the note keeps its level (`Sound.touch` in the audio package). A bass plucked gently and turned up.
  - `SeatMix.lowpass`: the instrument's tone control, a 12 dB an octave roll-off in the seat's channel.
- **A study for his ear** (`scripts/bass-study.ts`, `out/bass-study/`): the top of one take in neo-soul, reggae and funk, six ways each, with the band and the bass alone. Measured on the bass alone, a softer touch (12 under) takes 5 to 8 dB off what lies above 800 Hz and a much softer one (24 under) 11 to 12, with the loudness within a few tenths; a tone roll-off at 1 kHz changes that figure by under a decibel, so the study's tone clips are at 400 and 600 Hz. Nothing is chosen until he has listened.
- Not looked for yet: another bass. The library's second instrument is played with a pick on the bridge pickup, which is brighter, not mellower. If touch and tone are not enough for neo-soul and reggae, the next thing is a source search for a flatwound or a thumb-plucked bass.

## the electric bass, by Brandon's ear (stage 6, part 5)

From the study (2026-11-16): "neo-soul - B / reggae - F / funk - B".

- **Neo-soul and funk: a softer touch** (`sound.touch.bass` -12): each note plays the recording a dynamic under its own, at its own level.
- **Reggae: a much softer touch and the tone down** (`touch.bass` -24, `mix.seats.bass.lowpass` 400). The soft recordings turned up read 0.6 dB louder, so the seat is 0.6 down and the band is as loud as it was.
- **Disco: the softer touch too, by the main thread's reading and not by his ear.** Disco was not in the study. He named it among the styles whose bass was harsh, it plays the hardest recordings as often as funk does (51% of notes), and he chose this for funk. To be told plainly and undone if he says so.
- **Rock is left as it was**: he passed it earlier and did not name it.
- Measured after (`pnpm levels`): with everyone playing, funk -17.1 LUFS, disco -17.0, neo-soul -17.6, reggae -17.1 with the alto 1.1 dB under the band. All where they were. Notes are untouched: no golden and no scorecard reads a sound.

