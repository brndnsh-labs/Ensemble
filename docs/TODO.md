# Roadmap

These are the current product and audio work streams, ordered by user-facing impact.

## 1. Resolution balance fix

- Status: Done (2026-04-02)
- Summary: Final resolution velocities softened so final notes blend with preceding material in both live playback and MIDI export.
- Commits: b6249ac — "Flatten resolution cadence: soften final-note velocities and add regression tests"
- Tests: Regression tests added; full repo validation (npm run validate) passed.
- Notes: Export uses precomputed n.midiVelocity; fix implemented in generateResolutionNotes so live and export match. Consider a subjective DAW check or an optional UI preference to tune resolution intensity.

## 2. Studio workspace polish

- Make desktop instrument cards smaller and denser.
- Tighten the Studio controls menu layout so the per-instrument controls feel consistent.

## 3. Arranger readability pass

- Let the maximized lead-sheet view stretch vertically.
- Use the extra room to increase font size and improve legibility.

## 4. Audio identity refresh

- Add new soloist sounds.
- Revisit synthesis for chords, bass, and harmony as separate design passes.

## 5. Dynamic Head simplification

- Look for ways to simplify the session seed / Dynamic Head logic.
- Prefer smaller helpers and clearer flow over more branching, while preserving the seeded head behavior.

## 6. Progression library discovery

- Keep the library redesign moving toward better browsing and discovery.
- Add filtering and search by mood, genre, complexity, and favorites.
- Preserve quick access to frequently used progressions.

## Notes

- The Dynamic Head refactor is the riskiest item because it is tightly coupled to seeded playback and export behavior.
- Audio synthesis changes should be checked against both live playback and export output.
