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

**No accounts, no subscriptions, no lock-in.** Ensemble is a URL. It works offline. Sessions are shareable without asking anything of the recipient.

**The engine is precious.** The musical logic is the hardest part and the core differentiator. It is not refactored casually or extended without understanding what it already does.

**Deployment stays simple.** Ensemble is static files on a server. Any change that complicates that story needs a very strong justification.

**Agents are first-class contributors.** The codebase is documented, typed, and tested in ways that make it legible to AI tools. That's not an accident — it's a design requirement.

**Synthesis quality is an ongoing investment, not a solved problem.** If something doesn't sound good, it's worth fixing rather than shipping.

## UI direction

The four-workspace model (Arranger, Studio, Perform, Visuals) is replaced by a single chart-first surface. The chart is always visible and always playable. Controls radiate outward from it — essential ones always visible, deeper ones accessible without leaving the chart.

The layout is responsive, designed primarily for desktop and tablet, and degrades gracefully to phone. Tablet is the sweet spot: readable at arm's length, touch-friendly, portable enough for a music stand or a rehearsal room.

## Current state and next steps

*Last updated: May 2026*

### What's working well
- Dead simple deployment: static files, nginx, PWA
- Near instant load times even on poor connections
- Plain text chord chart editing
- Sophisticated musical engine: voice leading, modal theory, genre-aware groove, motivic soloist
- URL-based sharing with no backend required
- Mature dev dependencies and toolchain (Biome, Vitest, Playwright, esbuild)
- Large test suite

### What needs work
- UI was developed without a clear interaction model — four workspaces replaced "everything at once" but created new friction
- Unused features to remove: Lars mode, audio analyzer
- TypeScript migration (currently JSDoc with tsc checking via jsconfig.json — closer than it looks)
- Synthesis quality is good but not great
- The sharing feature deserves more prominence as a marquee feature

### Key decisions made
- Chart-first single surface replaces the four-workspace model
- Default I | V | vi | IV progression with the band ready to play on load
- Responsive layout optimized for desktop and tablet, graceful degradation to phone
- TypeScript migration is gradual, not a big bang rewrite
- Musical engine is untouched to start — it is the core differentiator
- Cruft removal (Lars mode, audio analyzer) is early cleanup work
- Synthesis quality improvement is a named phase, not an afterthought
- Sharing via URL is treated as a marquee feature, not a hidden one
