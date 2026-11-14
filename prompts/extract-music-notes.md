# Prompt: extract musical knowledge from the old repo

Run this once, in the existing Ensemble repository. Paste everything below the line.

---

This repository is the current version of Ensemble, a browser-based generative backing band. I am rewriting it from scratch in a separate, empty folder. The new project will not see this code. Your job is to write down what this codebase knows about music, so that knowledge survives and the old architecture does not.

This is read-only work. Do not change any code. Produce one file, `MUSIC_NOTES.md`, at the repo root.

## What to capture

Write as a music director briefing a new band, not as an engineer describing modules. State each item as a musical rule or observation. Do not paste code, and do not describe the code's structure, file layout, class names, or data flow.

Sources to mine, in this order:

1. The player logic for drums, bass, chords and comping, and the soloist.
2. The conductor and energy model.
3. The style and genre definitions for all supported genres.
4. The music theory audit: its findings, epics, and stories, including what was fixed and how.
5. The test suites. Read test names and assertions for the musical rules they encode. Thousands of tests should collapse into a short list of distinct rules. Ignore tests that only check plumbing.
6. Commit history and notes, for things that were tried and abandoned.

## Structure of the document

1. **Cross-cutting rules.** Things true in every style: ranges, register relationships between instruments, voice-leading principles, how chord function affects note choice, how energy maps to density and dynamics.
2. **Per player.** Drums, bass, chords, soloist. For each: what it does well today, the rules behind that, and its known weaknesses.
3. **Per style.** For each supported genre: tempo range, feel and swing, the role of each instrument, characteristic patterns described in words or simple rhythm grids, voicing habits, how chords are anticipated, typical endings, typical arrangement arc.
4. **Endings and transitions.** Every strategy the band has for ending a tune, turning around, and moving between sections.
5. **The audit.** Each distinct finding as a one-line rule, grouped by theme, marked as fixed or open.
6. **Known failures.** Especially the soloist (it is sometimes excellent and sometimes aimless or out of place) and comping rhythm. Record what has been tried, what helped, and what did not.
7. **Sounds.** An inventory of the instrument packs: name, source, license, which instruments, where the files live, and any notes on quality. Note which soloist instruments sound convincing and which do not.
8. **Things that surprised you.** Non-obvious details that took effort to get right and would be easy to lose.

## For every rule

Tag it with how it should be used in the new project:

- `[property]` an invariant that must always hold (for example, a range limit)
- `[metric]` a quality that should be scored, not asserted (for example, phrase coherence)
- `[style-data]` a parameter or pattern that belongs in a style's data
- `[taste]` a judgment call worth knowing but not enforceable

Also mark your confidence: `(solid)` if the code and tests clearly agree, `(unclear)` if the intent is ambiguous or the implementation looks accidental.

## Standards

- Prefer one precise sentence to a paragraph.
- Use concrete values where they exist (note ranges, tempo ranges, swing ratios, probabilities), with units.
- Describe rhythm patterns as grids or in counting syllables, not as code.
- If two parts of the codebase disagree about a rule, say so and report both.
- Do not editorialize about code quality. This document is only about music.

When finished, give me a short summary: how many distinct rules you found, how many tests they came from, and the three areas where the old code's musical intent was least clear.
