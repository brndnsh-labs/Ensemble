# Hi-Hat Articulation TODOs

This document captures the remaining work after the Rock/Funk checkpoint and the
first non-Rock/Funk rollout pass.
The current pass improved phrase-aware articulation while preserving the existing public
`HiHat` / `Open` / `Ride` character.

## Completed in this checkpoint

- Rock hi-hat phrasing now uses deterministic phrase contours and single-lane articulation routing.
- Rock open-hat synthesis now supports shorter bark-like releases for softer accents.
- Funk hi-hat phrasing now uses phrase-seeded 16th-note contouring and turnaround barks.
- Rock and Funk groove integrity coverage now protects the new behavior.
- Disco now keeps its offbeat open-hat engine on the open lane while adding phrase-shaped closed support.
- Hip Hop now uses phrase-shaped boom-bap/trap hat releases with clean open-lane routing.
- Neo-Soul now uses more deliberate phrase-release open hats and phrase-breath shaping instead of broad random barking.
- Disco, Hip Hop, and Neo-Soul coverage now protects the new lane-ownership behavior.

## Remaining work

### 1. Ear-balance and phrase-shape pass

- Listen to the new Rock and Funk grooves across a few tempos and intensities.
- Check whether the new phrase-seeded accents read as musical motion or feel too predictable.
- Tune the lift points, turnaround bark thresholds, and offbeat emphasis by ear rather than by more probability.
- Make sure the groove still feels like the same drummer family, just more alive.

### 2. Rock-specific refinement

- Verify that Rock still feels like a strong eighth-note engine in sparse arrangements.
- Decide whether Rock needs slightly more bar-to-bar contrast in verses versus choruses.
- Check if the new open-hat lifts are strong enough in the right places without turning into a wash.
- Confirm that the new timing nudges feel like human phrasing and not jitter.

### 3. Funk-specific refinement

- Verify that the 16th-note stream still feels locked, especially around the one and the backbeat.
- Check whether the bark targets should vary more between motifs 1, 2, and 3.
- Tune the relationship between open barks, phrase releases, and ghost-note density so the hat does not compete with the snare.
- Make sure the groove still leaves room for future bass and snare interaction work.

### 4. Generalized hi-hat articulation model

- Extract the repeated phrase-seed and articulation ideas into a reusable helper if they stay stable.
- Decide whether the internal model should grow into explicit articulation states such as chick, bark, and half-open.
- Keep the public sound names stable unless a future musical reason justifies expanding them.
- Ensure any new abstraction remains usable for Rock, Funk, and eventually other genres.

### 5. Synthesis follow-up

- Re-check the open-hat envelope against the Rock/Funk groove changes.
- Confirm that short open accents still feel crisp at higher velocities and do not smear into long sustained wash.
- Consider whether closed-hat choking should be made slightly more expressive if the next musical pass needs it.

### 6. Validation and regression protection

- Keep the existing Rock and Funk critique tests passing as the groove evolves.
- Add new tests only when they protect an actual musical decision, not just an implementation detail.
- Re-run `npm run validate` after any follow-up changes.
- If a future pass changes the public cymbal vocabulary, update live playback and MIDI/export parity at the same time.

### 7. Future genre rollout

- Acoustic, Reggae, and Ska-Punk were reviewed after the first-wave rollout and are staying as-is for now.
- Revisit them only if a later ear pass reveals a clear musical shortcoming rather than as a mechanical extension of the new model.
- Check whether each remaining candidate wants more open-hat breath, more bark, more ride, or less movement overall.
- Reuse the same internal phrasing ideas so future work stays musically consistent instead of being a one-off rewrite.

## Suggested order

1. Ear pass on Rock, Funk, Disco, Hip Hop, and Neo-Soul.
2. Tune thresholds and offsets by musical feel.
3. Decide whether to extract a shared hi-hat articulation helper.
4. Revisit only the remaining genres that show a clear ear-driven need.

---

# Additional Backlog

These are broader UI/system tasks to catalog next.

## 1. Visualizer overhaul / rewrite

- Revisit the visualizer architecture and decide whether it needs an incremental refactor or a larger rewrite.
- Clarify the target rendering style, performance goals, and how much of the current thread/worker split should stay intact.
- Identify which visual behaviors should remain stable so the rewrite does not break the current musical feedback loop.

## 2. Arranger kebab menu auto-expand

- When the arranger / lead-sheet header has enough horizontal space, surface more commonly used icons directly instead of hiding them behind the overflow menu.
- Prioritize the library action so it is visible sooner when room allows.
- Keep the overflow menu as the fallback for tighter layouts and lower-density displays.
- Decide the expansion rules by available space, not by hard-coded screen assumptions, so the behavior stays responsive.

## 3. Library redesign with filtering

- Redesign the progression library to make browsing and discovery easier.
- Add filtering and search so users can narrow progressions by mood, genre, complexity, or other useful tags.
- Preserve fast access to favorite or frequently used progressions.
- Keep the library workflow aligned with the arranger so discovery and insertion feel like one flow.

## 4. Mixer reverb defaults and auto-adjustment

- Stop the reverb from changing itself unexpectedly.
- Define sane defaults per track so the mixer starts from musical, predictable values.
- Make sure any automatic behavior is clearly intentional and easy to understand.
- Check whether the issue is rooted in state hydration, side effects, or a mixer-control feedback loop.

## 5. Flaky tests

- `tests/standards/soloist-jazz-critique.test.js` occasionally fails on the notes-per-bar threshold during full validation, but it passes when rerun in isolation.
- `tests/unit/engine/soloist-pitch-deep.test.js` has also shown occasional variance in the repetition expectation during full validation, then passes on rerun.
- Reproduce both with the full suite before changing the assertions so we can confirm whether the issue is test variance or a real regression.
