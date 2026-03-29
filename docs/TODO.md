# Hi-Hat Articulation TODOs

This document captures the remaining work after the Rock and Funk hi-hat checkpoint.
The current pass improved phrase-aware articulation while preserving the existing public
`HiHat` / `Open` / `Ride` character.

## Completed in this checkpoint

- Rock hi-hat phrasing now uses deterministic phrase contours and single-lane articulation routing.
- Rock open-hat synthesis now supports shorter bark-like releases for softer accents.
- Funk hi-hat phrasing now uses phrase-seeded 16th-note contouring and turnaround barks.
- Rock and Funk groove integrity coverage now protects the new behavior.

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

- Apply the same articulation approach to the next strong candidate genre after Rock and Funk.
- Check whether that genre wants more open-hat breath, more bark, more ride, or less movement overall.
- Reuse the same internal phrasing ideas so future work stays musically consistent instead of being a one-off rewrite.

## Suggested order

1. Ear pass on Rock and Funk.
2. Tune thresholds and offsets by musical feel.
3. Decide whether to extract a shared hi-hat articulation helper.
4. Extend the model to the next genre.

