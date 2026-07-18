# Ensemble: Product Vision

## What is Ensemble?

Ensemble is a backing band in your browser. Pick a chord chart, pick a genre, and play — any instrument, any style, on demand. No app to install, no account to create, no subscription.

## Who is Ensemble for?

Ensemble is for musicians who want to practice, compose, teach, or perform — whether they're alone or playing with others who need a drummer, a bassist, or a keys player to complete the sound.

**Personas:**

- **The practicing musician** mutes their instrument and plays along with the band.
- **The songwriter** opens the editor, types in chords, and hears an arrangement immediately.
- **The producer** uses a template or generates a song structure to quickly sketch an idea, then exports to MIDI to take the bones of a project into their DAW.
- **The music teacher** charts a song and sends a link to a student.
- **The student** opens the link and the band is already playing.
- **The live performer** configures Ensemble to fill the seats that humans aren't — a drummer, a keys player, a bassist — and plays alongside it in the room.

## What makes Ensemble different?

Unlike AI music generators that produce audio from statistical patterns, Ensemble follows real musical rules. It understands chord quality, voice leading, scale modes, rhythm section conventions, and song form. The result is a band that plays your chart — not an approximation of what music statistically sounds like.

Every session is shareable as a URL. A teacher can chart a song and send a link. A student opens it and the band is already playing. No account, no install, no subscription required on either end. A chord progression, genre, tempo, and arrangement encode cleanly into a URL without a backend.

Ensemble is free and open source, with no account required and no subscription. It runs as a PWA from a single URL and works offline after the first load.

## What Ensemble is not

Ensemble is not AI-generated audio. The codebase is AI-assisted and agents are first-class contributors — but the output is a rule-based musical engine, not a statistical model. Ensemble is also not a subscription, not large sample libraries, not heavy dependencies, and not a backend.

## Product principles

**The chart is the center.** Every UI decision departs from and returns to the chart. Controls, settings, and tools exist to serve it — not the other way around.

**Zero friction by default.** A visitor lands on the page and sees a basic I | V | vi | IV progression with the band ready to play. They hit play and hear something musical immediately. Configuration is available but never required.

**Time is sacred; defaults are metronomic.** Ensemble is a fancy metronome at its core — the practicing musician has to be able to lock to a reference that does not move, so tempo and groove stay steady by default. Expressive and live-performance features (tempo breathing, band-leader gestures) ship **opt-in and off by default**; nothing may make the default tempo or groove drift. When personas conflict, priority runs: **practicing musician → songwriter / teacher-student sharing → live performer.** Instrument-identity features (gestures, pads, MIDI-triggered form control) advance only via the probe-first plan banked on #1019 — never as a speculative build.

**No accounts, no subscriptions, no lock-in.** Ensemble is a URL. It works offline. Sessions are shareable without asking anything of the recipient.

**The engine is precious.** The musical logic is the hardest part and the core differentiator. It is not refactored casually or extended without understanding what it already does.

**Deployment stays simple.** Ensemble is static files on a server. Any change that complicates that story needs a very strong justification.

**Agents are first-class contributors.** The codebase is documented, typed, and tested in ways that make it legible to AI tools. That's not an accident — it's a design requirement.

**Synthesis quality is an ongoing investment, not a solved problem.** If something doesn't sound good, it's worth fixing rather than shipping.

## UI direction

The four-workspace model (Arranger, Studio, Perform, Visuals) is replaced by a single chart-first surface. The chart is always visible and always playable. Controls radiate outward from it — essential ones always visible, deeper ones accessible without leaving the chart.

The layout is responsive, designed primarily for desktop and tablet, and degrades gracefully to phone. Tablet is the sweet spot: readable at arm's length, touch-friendly, portable enough for a music stand or a rehearsal room.

## Current state and next steps

*Last updated: July 2026*

### What's working well
- Dead simple deployment: static files, nginx, PWA
- Near instant load times even on poor connections
- Plain text chord chart editing
- Sophisticated musical engine: voice leading, modal theory, genre-aware groove, motivic soloist
- URL-based sharing with no backend required
- Mature dev dependencies and toolchain (Biome, Vitest, Playwright, Vite)
- Large test suite

### What needs work
- The sharing feature deserves more prominence as a marquee feature — the "band is already playing" autoplay landing exists but isn't yet produced by the Share UI (tracked as Forgejo #1126)
- The engine outgrew the surface: the **live-performer** persona still has the least product coverage — live band control is one intensity slider, pending the #1019 conductor-lens probe decision. (Section looping / start-from-section (#1016), MIDI-in play-along (#1017), and the practice tempo ramp (#1021) all shipped in the July 2026 sweep, so the practicing-musician gap is largely closed.)

### Open work
- **Band That Listens (July 2026 sweep)** — make the band listen to itself: the soloist rides `bandIntensity` and coordination transitions, a band-wide per-genre pocket palette, within-phrase velocity envelopes (Forgejo milestone "Band That Listens"), with arrangement-by-subtraction, question→answer phrasing, tempo breathing, and late-pass reharm parked as needs-decision designs.
- **Audio identity refresh** — add new soloist sounds; revisit chords/bass/harmony synthesis if a future audit turns up a new outlier. Use the existing rendered/symbolic audit flow rather than reopening a global mix sweep.
- **Surface the auxiliary percussion** (now tracked as Forgejo #1007) — `Shaker`, `Clave`, `Conga`, `Bongo`, `Perc`, `Guiro` exist as real lanes in `groove.ts` state and have full synth voices, but no genre or surfaced preset triggers them, so they are effectively unreachable from the UI (only `Conga` appears, sparsely, via the Bossa Nova preset). The `World/Latin` drum presets and the `latin`/`minimal`/`shred` groove strategies are likewise unsurfaced. Fix is a drum-grid affordance and/or surfacing those presets / a Latin genre. Surfaced during the synth-audit Epic 4 listening gates — see `docs/synth-audit/epic-4-drums.md` Notes. **Now also tracked as Epic 7 S5** in `docs/synth-audit/epic-7-mix-architecture.md` after the Epic 7 S3a 5 kHz re-measurement showed the funk drum stem sits 11× below Chic at the air probe — wiring the existing aux-percussion lanes closes the air gap and the UI gap in one move.
- **Naming conventions cleanup** — standardize canonical names across code, docs, tests, configs, and persisted surfaces so one concept has one internal key and a documented alias map. Build a naming inventory first; centralize alias resolution in the owning config or normalization helper; update persistence/share/hydration surfaces together so old links keep working. See `CLAUDE.md` → "Naming / Canonicalization" and `docs/guides/REFERENCE_TUNING.md` for tuning examples and alias lessons.

### Key decisions made
- Chart-first single surface replaces the four-workspace model
- Default I | V | vi | IV progression with the band ready to play on load
- Responsive layout optimized for desktop and tablet, graceful degradation to phone
- TypeScript migration is gradual, not a big bang rewrite
- Musical engine is untouched to start — it is the core differentiator
- Synthesis quality improvement is a named phase, not an afterthought
- Sharing via URL is treated as a marquee feature, not a hidden one
- Metronomic by default; expressive timing and live-performance control are **opt-in, off by default** (per the #1010 ruling) — this protects the practicing-musician persona, who cannot lock to a reference that moves
- The live-performer / "instrument" identity (band-leader gestures) is deliberately parked behind a probe-first plan (#1019), not built speculatively
