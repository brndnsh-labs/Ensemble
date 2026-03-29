# Remaining Backlog

These are the open UI/system tasks left after the hi-hat, visualizer, and flaky-test work was completed.

## 1. Arranger kebab menu auto-expand

- When the arranger / lead-sheet header has enough horizontal space, surface more commonly used icons directly instead of hiding them behind the overflow menu.
- Prioritize the library action so it is visible sooner when room allows.
- Keep the overflow menu as the fallback for tighter layouts and lower-density displays.
- Decide the expansion rules by available space, not by hard-coded screen assumptions, so the behavior stays responsive.

## 2. Library redesign with filtering

- Redesign the progression library to make browsing and discovery easier.
- Add filtering and search so users can narrow progressions by mood, genre, complexity, or other useful tags.
- Preserve fast access to favorite or frequently used progressions.
- Keep the library workflow aligned with the arranger so discovery and insertion feel like one flow.

## 3. Mixer reverb defaults and auto-adjustment

- Stop the reverb from changing itself unexpectedly.
- Define sane defaults per track so the mixer starts from musical, predictable values.
- Make sure any automatic behavior is clearly intentional and easy to understand.
- Check whether the issue is rooted in state hydration, side effects, or a mixer-control feedback loop.
