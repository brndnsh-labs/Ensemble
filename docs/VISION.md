# Ensemble: Product Vision

## What is Ensemble?

Ensemble is a backing band on your music stand. Open a chart, pick a style, and play — any instrument, any genre, on demand. It runs from a single URL, installs as an app, and keeps playing offline. It is free and open source, with no subscription.

You never need an account to play. An optional account keeps your songbook synced and backed up across your devices; that is all it is for.

The v2 product brief, [`docs/design/ensemble-v2.md`](design/ensemble-v2.md), holds the agreed user journeys and interface direction in detail. This page is the short version and the priorities.

## Who is Ensemble for?

Musicians who want to practice, write, teach, or perform — alone, or with people who need a drummer, a bassist, or a keys player to complete the sound.

**Personas, in priority order:**

1. **The practicing musician** mutes their own instrument and plays along. When personas conflict, this one wins.
2. **The songwriter** types or taps in chords and hears an arrangement immediately. **The producer** sketches a chart the same way and exports MIDI to take the bones into a DAW.
3. **The music teacher** charts a song and sends a link. **The student** opens it and hears the chart — no account, no install.
4. **The live performer** has Ensemble fill the seats that humans aren't and plays alongside it in the room. This persona has the least product coverage today: live control is an intensity slider, and MIDI-in play-along did not survive into v2.

## What makes Ensemble different?

Unlike AI music generators that produce audio from statistical patterns, Ensemble follows real musical rules. It understands chord quality, voice leading, scale modes, rhythm-section conventions and song form. The result is a band that plays *your* chart — not an approximation of what music statistically sounds like.

**Sharing is a marquee feature.** A teacher sends a link; the student opens that exact chart on the stand. The link carries a frozen snapshot, so later edits by the author never change what the student hears, and neither end needs an account. Keeping a shared chart makes an independent copy. Old v1 share links still open, best-effort.

## What Ensemble is not

Ensemble is not AI-generated audio. The codebase is AI-assisted and agents are first-class contributors — but the output is a rule-based musical engine, not a statistical model. It is also not a subscription, not a service you depend on to play, and not a classroom-management, collaborative-editing or community-catalog platform.

## Product principles

**The chart is the center.** Every UI decision departs from and returns to the chart. During playback the chart is a music stand; controls, settings and tools exist to serve it.

**Zero friction by default.** A first visit lands on the songbook with starter charts ready; one tap puts a chart on the stand with the band ready to play. Configuration is available but never required, and no account is ever asked for in order to play.

**Time is sacred; defaults are metronomic.** Ensemble is a fancy metronome at its core — the practicing musician has to be able to lock to a reference that does not move, so tempo and groove stay steady by default. Expressive and live-performance features (tempo breathing, band-leader gestures) ship **opt-in and off by default**; nothing may make the default tempo or groove drift. Instrument-identity features (gestures, pads, MIDI-triggered form control) advance only via the probe-first plan banked on #937 — never as a speculative build.

**Offline-first; the server is optional.** The stand is a static app that works fully offline once installed. One small account API adds sync and backup; losing it never stops the band.

**No lock-in.** Guest play is first-class. Charts import (iReal Pro, v1 data) and export (MIDI, audio) without an account, and an account holder's songbook is theirs to take elsewhere.

**Private charts stay private.** Analytics are aggregate and allow-listed; chart contents, titles and identities never cross that boundary (#1389).

**The engine is precious.** The musical logic is the hardest part and the core differentiator. It is not refactored casually or extended without understanding what it already does.

**Agents are first-class contributors.** The codebase is documented, typed and tested in ways that make it legible to AI tools. That is a design requirement, not an accident.

**Synthesis quality is an ongoing investment, not a solved problem.** If something doesn't sound good, it's worth fixing rather than shipping.

## UI direction

One app, the music stand (`prototypes/v2/app/`): a songbook home (recent songs, starters, new/import), the chart sheet, the transport, an edit panel and a sounds panel. Tempo, genre, instrument mutes and the transport are primary; key is one obvious action away; loop and start-from belong at the section they act on. Editing keeps the chart's spatial structure, and editing controls step aside during playback.

Designed for laptop, tablet and phone alike. Tablet is the sweet spot: readable at arm's length on a music stand, touch-friendly, portable to a rehearsal room. Whole measures and readable chord symbols survive every width.

## What's next

*Last updated: 2026-09-25. The GitHub tracker is the source of truth; this is the priority order.*

1. **Finish v2 editing.** Every score field needs a writer: major/minor (#1375), beat grouping (#1376), one section-settings surface (#1374), removing a bar or section (#1373). Milestone "V2 — parity".
2. **Close out the cutover.** Retire the v1 runtime once the flip has held (#1384); verify two-device and cold-start behaviour on real phones (#1273); privacy-preserving analytics (#1389); audition links that carry intensity, part mutes and autoplay (#1382).
3. **Musical depth, on the band engine (#1404).** The comp answering the soloist's gaps, trading fours, ensemble kicks and idiomatic odd meters; then retiring the old engine and its tests, and the audio/synth rewrite. The old engine's parked design calls (#1148, #1149, #1161, #1162, #1164) and listening sweep (#534) are re-read against the band before any of them is built.
4. **The live performer, last.** The band-leader gesture probe (#937) and tempo breathing (#936), both opt-in by the principle above.

## Key decisions

- **v2 is the product (2026-09-22, #1357).** A hard cut from v1: the music stand serves the site root, and v1's UI shell is deleted (#1358). v1 browser data is reachable only through v2's import.
- **Accounts are optional and exist for the songbook** — passkey sign-in, explicit Save, whole-library offline download. Playing and sharing never require one.
- **Offline-first static app plus one small API**, released as container images; `main` is continuously deployed.
- **Semantic charts with an honest import boundary** (#1171): imports preview what they keep and explain what they can't represent.
- Chart-first single surface; the chart is a music stand during playback.
- **The band engine replaces the old one (2026-09-25, #1404).** `band/` is a ground-up, deterministic rewrite that carries the old engine's by-ear lessons over as design laws, not code. It reverses the earlier "kept, not rewritten" decision; see `docs/design/band-engine.md`. v2 still compiles `public/` for the songbook, state and voices.
- Metronomic by default; expressive timing and live-performance control are **opt-in, off by default** (the #936 ruling), protecting the practicing musician.
- The live-performer / "instrument" identity is parked behind a probe-first plan (#937), not built speculatively.
- Sharing is a marquee feature, not a hidden one.
- Free and open source, no subscription.
