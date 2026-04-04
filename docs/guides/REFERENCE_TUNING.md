# Reference Comparison & Velocity Tuning

This document tracks specific reference recordings used to calibrate the Ensemble engine's velocity maps and micro-timing.

## Jazz-Funk
**Reference Track:** *Cantaloupe Island* - Herbie Hancock (1964)
- **Target Feel:** Straight 8ths but laid back. Solid, repetitive bass anchor.
- **Velocity Goals:**
    - **Bass:** Consistent mezzo-forte (0.7 - 0.8) on downbeats. Ghost notes on syncopations (0.3 - 0.4).
    - **Drums:** Tight hi-hats (0.5 - 0.6). Kick drum should be punchy (0.85) but not overpowering. Snare backbeats sharp (0.9).

## Reggae
**Reference Track:** *Redemption Song* (Band Version) / *One Love* - Bob Marley
- **Target Feel:** Heavy "One Drop" or "Rockers". Bass carries the melody.
- **Velocity Goals:**
    - **Bass:** Deep, sustaining notes. Velocity fairly consistent (0.8), relying on duration for expression. Low-pass filter focus.
    - **Kick:** "One Drop" on beat 3 must be heavy (0.9 - 1.0).
    - **Hi-Hat:** Crisp, short, consistent chunks (0.6).
    - **Guitar/Keys Skank:** Short, staccato, medium velocity (0.5 - 0.6).

## Neo-Soul
**Reference Track:** *Untitled (How Does It Feel)* - D'Angelo
- **Target Feel:** Drastically "behind the beat".
- **Velocity Goals:**
    - **Kick:** Soft, felt more than heard (0.6 - 0.7).
    - **Snare:** Sharp rimshot (0.8) with very soft ghost notes (0.2).
    - **Hi-Hat:** Loose, varying velocities (0.4 - 0.7).

---

## DSP Filter Profiles

### Bass Engine
- **Funk/Pop Thumb:** Velocity > 1.1 triggers "Pop" mode.
- **Filter Cutoff:** Base 1000Hz, decaying to 800Hz (Pop) or 500Hz (Normal).
- **Resonant Peak:** 1800Hz (Q: 1.5, Gain: 5) for character without nasal resonance.
- **Reggae Dub:** Low-shelf at 100Hz (+2dB) for weight.

### Piano Engine
- **Attack Transient:** 1200Hz - 2000Hz noise strike.
- **Harmonic Body:** Filter depth reduced to 2400Hz to eliminate digital harshness.

## Current Calibration Log

### [Date: 2026-01-14]
- **Status:** Initial calibration completed.
- **Action:** 
    - **Funk:** Reduced Bass "One" velocity to 0.85, Ghost notes to 0.35. Tamed Hi-Hat accents to 1.0.
    - **Reggae:** Clamped Dub Bass to ~0.8. Reduced Skank velocity to ~0.5.
    - **Neo-Soul:** Applied 0.75x global velocity dampener to drums.
- **Next Steps:** Listen to output and verify against reference tracks.

### [Date: 2026-01-15]
- **Status:** v2.0 Codebase Health Audit completed.
- **Action:**
    - **Global:** Implemented intensity-brightness mapping. `playback.bandIntensity` now modulates filter cutoffs for Chords and Bass, providing more dynamic timbral range.
    - **Rock/Pop:** Refactored `accompaniment.js` with "Expressive Phrasing" pools. Piano cells now adapt to intensity and soloist activity (Call & Response).
    - **Performance:** Verified stability with "Emergency Lookahead" and "Logic Latency" monitoring.
    - **Verification:** 346 tests passing, including new stress tests for congestion and continuity.

### [Date: 2026-01-18]
- **Status:** Expanded Drum Synthesis (Toms & Latin Percussion).
- **Action:**
    - **Agogo Bells:** Reduced master volume from 0.5 to 0.35 to prevent mix congestion. Implemented multi-oscillator stack (Sine + Triangle + Body Sine) for authentic "ping".
    - **Toms:** Implemented High (180Hz), Mid (135Hz), and Low (90Hz) variations using dual-layer synthesis (Body Sine + Stick Square).
    - **Bossa Smart Genre:** Implemented procedural 16th-note Shaker layer (accents on quarters) and intensity-driven Guiro/Tom surdo accents.
    - **Verification:** 433 tests passing (added Template Integrity suite for fills).

### [Date: 2026-01-19] (Update)
- **Status:** Harmony Voicing Refinement & Compatibility.
- **Action:**
    - **Neo-Soul:** Refactored Quartal stack logic to be scale-aware. Specifically avoiding the natural 11th (interval 5) when a Major 3rd is present in the chord to adhere to the "Avoid Note" rule.
    - **Rock/Metal:** Implemented "Hendrix Chord" (7#9) awareness. Harmonies now explicitly avoid the natural 5th over altered dominant chords to prevent harmonic clashes.
    - **Global:** Implemented defensive semitone-clash filtering. All background harmony notes are now automatically filtered against fundamental chord tones to prevent harsh dissonances while preserving valid musical tensions.
    - **Verification:** 739 tests passing (implemented Harmony-Chord Compatibility Audit for all library presets).

### [Date: 2026-01-20]
- **Status:** Melody Harmonizer & Audio Workbench.
- **Action:**
    - **Harmonizer:** Implemented a symbolic "Loop-Back Training" system (`HarmonizerTrainer`). The engine now builds a note-likelihood matrix by querying the Soloist's scale logic for every chord quality. This ensures harmonized progressions align with the band's repertoire.
    - **Audio Analysis:** Added monophonic pitch extraction to `audio-analyzer-lite.js` with frequency decimation for performance.
    - **UI Integration:** Consolidated analysis tools into a unified "Audio Workbench" modal with a mode-toggle interface.
    - **Verification:** 743 tests passing (added unit tests for Harmonizer scoring logic and diatonic integrity).

### [Date: 2026-01-26] (Pro-Level Sprint)
- **Status:** Performance, Mixing, and Musicality Overhaul.
- **Action:**
    - **Performance:** Implemented high-resolution "Logic Latency" monitoring. Round-trip worker communication is now tracked, with warnings triggered if processing exceeds 50ms.
    - **Mixing:** Master compression still adapts to `bandIntensity`, but reverb sends now stay at fixed mixer values so the space stays predictable.
    - **Soloist:** Enhanced phrasing to prioritize "Guide Tones" (3rds and 7ths) on the downbeat of section changes to improve musical flow during transitions.

### [Date: 2026-03-27]
- **Status:** Drumkit body/balance retune.
- **Action:**
    - **Kick:** Reduced dense-mix beater click, lifted low-body resonance slightly, and preserved shell tail instead of cutting it off with beater cleanup.
    - **Snare:** Added velocity-aware crack emphasis so backbeats speak more clearly while ghost notes stay shorter and drier.
    - **Toms:** Increased register separation with longer low-tom sustain, stronger pitch-drop contrast, and more distinct shell/body envelopes per drum size.
    - **Verification:** Focused drum synthesis, seeder, and critique suites passed; full validation rerun after implementation.

### [Date: 2026-03-27] (Jazz Ride Presence)
- **Status:** Jazz ride cleanup.
- **Action:**
    - **Ride:** Increased sustain and mix presence slightly, with a small Jazz-specific mix boost so the ride reads more naturally in ride-led arrangements.
    - **Verification:** Focused jazz drum tests and full validation passed after the tweak.

### [Date: 2026-03-27] (Beat Anchor Mix Lift)
- **Status:** Drum bus level trim.
- **Action:**
    - **Drums:** Raised the drum bus slightly so the beat sits more clearly in the full mix without undoing the cymbal realism work.
    - **Verification:** Mix integrity, drum synthesis, genre critique suites, and full validation passed with the updated drum multiplier.

### [Date: 2026-03-27] (Crash Accent Lift)
- **Status:** Cymbal differentiation.
- **Action:**
    - **Crash:** Increased crash accent weight and transient noise so it reads louder and broader than ride, while ride remains the clearer sustained timekeeper.
    - **Verification:** Focused drum and genre suites passed; full validation passed after the crash/ride split tweak.

### [Date: 2026-03-27] (Cymbal Sustain Expansion)
- **Status:** Cymbal envelope retune.
- **Action:**
    - **Cymbals:** Lengthened the underlying metallic buffers and eased the runtime damping across closed hat, open hat, ride, and crash so each voice keeps more natural residual sustain.
    - **Musical target:** Closed hats stay crisp but no longer feel hard-gated; open hats sizzle longer; rides hold a clearer shimmer tail; crashes bloom longer before fading.
    - **Verification:** Focused drum suites, synth bench, and full validation passed after the sustain retune.

### [Date: 2026-03-27] (Hybrid Cymbal Liveliness Pass)
- **Status:** Cymbal feel rebalance.
- **Action:**
    - **Closed hat:** Reduced playback-rate drift and narrowed level/decay variance so hats feel less distractingly pitchy, while keeping motion in the filter/tail behavior instead of obvious pitch wobble.
    - **Crash:** Added a little more bloom and tail by lifting crash level slightly, extending the source/runtime decay, and holding the early sustain plateau a touch longer.
    - **Mix target:** Preserve the newer anti-wash cymbal discipline while recovering some of the older implementation's liveliness.
    - **Verification:** Focused drum suites, synth bench, and full validation passed after the hybrid retune.

### [Date: 2026-03-27] (Snare Backbeat Lift)
- **Status:** Snare mix presence.
- **Action:**
    - **Snare:** Added a small genre-aware presence lift for Rock and Blues backbeats so the snare sits a touch more forward without inflating the rest of the kit.
    - **Verification:** Focused drum and genre suites passed after the snare mix adjustment.

### [Date: 2026-03-27] (Blues/Jazz Mix Pass)
- **Status:** Genre-specific drum balance.
- **Action:**
    - **Blues:** Lifted kick/tom body slightly so the shuffle feels anchored without pushing cymbals forward.
    - **Jazz:** Reduced the extra ride boost a little and added a small low-mid body lift so the ride-led feel stays clear without dominating the presence band.
    - **Verification:** Focused drum synthesis, Blues drummer, Jazz drummer, and the internal mix report all passed after the genre mix tweak.

### [Date: 2026-03-27] (Closed Hi-Hat Sustain Nudge)
- **Status:** Closed hat tail.
- **Action:**
    - **HiHat:** Extended the shortest closed-hat decay/stop values slightly so the hat keeps a more natural residual ring without opening up.
    - **Verification:** Focused drum synthesis and the internal mix report passed after the subtle sustain nudge.

### [Date: 2026-04-04] (Global Backing-Bed Interlock Pass)
- **Status:** Cross-genre backing-bed audit follow-up.
- **Action:**
    - **Global harmony:** Slimmed accompaniment-overlap harmony hits into shorter, lighter support tones so backgrounds behave more like color accents than a second accompanist when the chord bed is already active.
    - **Global chords:** Added a small dynamic low-mid body dip to the chord synth so thicker voicings shed some 300-ish Hz buildup before they hit the shared bus.
    - **Audit result:** Rock and Neo-Soul showed cleaner backing-bed spacing in the rendered audit, while Jazz reduced overall stack pressure but still kept a darker chord body than desired; leave that as the first genre-specific follow-up rather than pushing the global pass further.
    - **Verification:** Representative symbolic/rendered audit reruns, focused coordination/comping/harmony standards, full `npm run validate`, and full `npm run test:e2e` passed after the retune.

### [Date: 2026-04-04] (Unity-Fader Hidden-Trim Pass)
- **Status:** Unity-default mixer reset and cross-genre loudness rebalance.
- **Action:**
    - **Mixer defaults:** Moved all instrument defaults to 100% and bumped the mixer-settings version so fresh sessions, persisted sessions, and shared `bnd` links all reset to the same visible baseline instead of carrying the older half-volume starter mix.
    - **Hidden trims:** Folded the former starter-fader attenuation into `MIXER_GAIN_MULTIPLIERS` so the UI can stay at 100% while the engine preserves roughly the earlier effective loudness for chords, bass, soloist, harmony, and drums.
    - **Audit result:** The first unity baseline pushed rendered full-mix RMS roughly 6-7 dB hotter across Rock, Blues, Jazz, Funk, and Neo-Soul; the hidden-trim pass brought those rendered scenes back near the prior loudness envelope without changing the symbolic audit surface. Jazz chord body / low-mid still remains the clearest next genre-specific follow-up.
    - **Verification:** Targeted reducer/hydration/engine mix tests, the unity rendered rerender sweep, full `npm run validate`, and full `npm run test:e2e` passed after the rebalance.

### [Date: 2026-04-04] (Jazz Chord Body / Low-Mid Pass)
- **Status:** Jazz-specific comping-body retune.
- **Action:**
    - **Jazz comping:** Shortened Jazz chord holds and shifted the default bass-respecting support voicings toward leaner 2-3 note guide-tone/color shapes so piano comping behaves more like a rootless accompanist than a thick pad.
    - **Audit result:** The rendered Jazz focus rerender kept full-mix loudness flat while reducing chord low-mid energy (`0.4899 -> 0.4142`), raising chord centroid (`605.64 -> 627.68`), and cutting chord voice-limit pressure (`61.5 -> 46.5`). A follow-up Jazz-only synth brightening experiment was measured and reverted because it gave back some of that low-mid improvement.
    - **Verification:** Focused Jazz comping/piano/consistency standards plus chord synthesis and voice-exhaustion unit coverage passed before the full repo validation sweep.

---

## Intensity-Aware Mixing Rules

To maintain professional mix clarity, the engine now modulates the signal chain based on the `ctx.bandIntensity` signal (0.0 - 1.0).

### Reverb (Space)
- Reverb sends are now fixed by the mixer and do not follow `bandIntensity`.
- Current defaults: **Chords 0.30**, **Bass 0.05**, **Soloist 0.60**, **Harmony 0.40**, **Drums 0.20**.
- Use the Studio mixer sliders to shape space manually; the conductor no longer auto-wets or auto-dries the band.

### Compression (Glue)
- **Threshold:** Scales from **-0.5dB** (low intensity) down to **-2.0dB** (high intensity) to catch peaks.
- **Ratio:** Scales from **12:1** up to **20:1** to "glue" the band together as the energy increases.
- **Attack/Release:** Fast attack (2ms) and medium release (500ms) to ensure punch without pumping artifacts.
