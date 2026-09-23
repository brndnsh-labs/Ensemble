# Ensemble Test Suite

This directory contains the automated tests for the Ensemble application, powered by [Vitest](https://vitest.dev/).

## Structure

*   **`unit/`**: Tests for individual modules, functions, and logic.
    *   *Examples:* Music theory rules in `chords.js`, synthesis logic in `synth-*.js`, or isolated component logic.
    *   *Environment:* `happy-dom` (simulates browser APIs like `window`, `document`, `Canvas`).
*   **`integration/`**: Tests that verify the interaction between multiple modules or the full system lifecycle.
    *   *Examples:* "Song Creation to Playback" flows, Worker synchronization.
*   **`standards/`**: Musical validity checks.
    *   *Examples:* Ensuring generated bass lines adhere to genre rules (e.g., Reggae "One Drop") over thousands of measures.
    *   *Critique Tests:* Advanced statistical analysis of musical authenticity (e.g., Jazz Charleston frequency, Soloist melodic smoothness). See [Critique Guidelines](./standards/CRITIQUE_GUIDELINES.md) for details.
*   **`browser/`**: Vitest browser mode (real Chromium, and WebKit for the sync suite) for what
    needs a real `OfflineAudioContext` or IndexedDB — `npm run test:browser`, `npm run test:sync`.
*   **End-to-end UI tests** live with the app: `prototypes/v2/checks/` (Playwright), gated in CI
    by `v2-checks`. We avoid pixel-perfect visual regression (snapshots) to prevent CI flakiness
    across different OS environments.

## Running Tests

### Run Core Suite (Vitest)
```bash
npm test
```

### Run the app's end-to-end suite (Playwright)
```bash
npm run build --prefix prototypes/v2
npm run test:e2e --prefix prototypes/v2
```

### Run Specific Tests
You can filter by filename or test name using the `--` argument:

```bash
# Run only worker-client tests
npm run test:vitest -- worker-client

# Run only standards tests
npm test -- standards/
```

### Watch Mode
To run tests in watch mode (re-run on file change):
```bash
npx vitest
```

## Writing Tests

### Practice Reliability Acceptance

Musicality changes must preserve dependable practice backing (#1134). Use
`integration/practice-reliability.test.ts` for the fixed `PRACTICE_RELIABILITY` seed:
Rock at 118 BPM (`C | G`, then `Am | F`), Jazz at 138 BPM (`Dm7 | G7`, then
`Cmaj7 | Cmaj7`), and Blues at 120 BPM in 6/8 (`G7 | C7`, then
`Eb7#9 D7alt | G7`). Each scene runs two chart passes at intensity 0.7.

- Compare fresh event traces, not frozen pitch snapshots or identical successive
  choruses. The replay test varies ambient randomness after explicit seed creation;
  it does not claim seed-bootstrap independence from every global input.
- Check authored chord/section/loop boundaries and elapsed time, including the split
  6/8 bar. Anticipations may precede a chord change; chart ownership must not move.
- Keep disabled soloist/harmony lanes silent while bass, chords and drums continue.
  New responses must not automatically fill the human's reserved part. This does not
  freeze all existing mute-dependent voicing choices.
- Reuse `unit/engine/scheduler.test.ts` for live scheduling and mute seams,
  `unit/engine/section-practice-fold.test.ts` for drill wrapping,
  `standards/swing-ratio-audit.test.ts` and
  `standards/band-pocket-palette-critique.test.ts` for swing and bounded pocket,
  and `standards/generation-run-isolation-critique.test.ts` for detached render resets.
- Each musical issue names the applicable fixtures and its additional critique.
  Preserve existing idiomatic space; do not enforce an attack on every beat.
- Record a human play-along comparison with chart, seed, tempo, intensity, muted
  part and old/new build revisions. Can the player follow pulse, changes and arrivals
  without compensating for the band? Does their part still have room? Automated
  evidence does not establish subjective practice usability or replace a required
  pre-merge listening gate.

### Compound Fill Pulse Pilot (#1137)

Rock and Blues in canonical 6/8 and 12/8 use three single-stroke gestures: sparse
snare pickup (first/third eighth), three-eighth snare group, and high-to-mid-to-low
tom group. Each starts on a dotted-quarter pulse with the strongest event velocity.
Fills occupy the final half-bar, or just the final pulse at low energy. Other
styles/meters and authored alternative groupings keep the existing vocabulary.

`standards/compound-fill-pulse-critique.test.ts` checks pulse positions and accent
hierarchy across 768 seeded fills, actual drum emission, unchanged selection/crash
contracts, local-meter fallback during extended playback, and a 4/4 fingerprint
captured before implementation. Reuse the practice-reliability fixtures above and
the existing compound kick/hat and tom-vocabulary critiques.

For the play-along comparison, use Rock then Blues at 120 quarter-note BPM, seed
`COMPOUND_PRACTICE`, 6/8 then 12/8, Verse `C | C | C | C` into Chorus
`G | G | G | G`, and low/medium/high intensity. Mute the part being practiced;
count the two/four large pulses through a selected fill and its next downbeat.
Compare old/new build revisions with normal humanization and the usual drum
sounds. The tests prove event grouping and velocity, not perceived accents across
different tom timbres or full-mix practice usability; record the listening verdict
before merging this new vocabulary.

### Soloist Dynamic Headroom (#1135)

`standards/soloist-dynamic-headroom.test.ts` compares the shipped clamp with reserved
base-weight headroom on identical `PRACTICE_RELIABILITY` phrases: all 13 genres,
120 BPM, `C | G` (Verse) then `Am | F` (Chorus), guitar mode, intensity 0.3/0.6/1,
two complete seeded macro-forms with advancing arrangement loops. All non-velocity
events, including empty steps and secondary notes, must match. The high-energy
apex envelope retains its authored 15% lift; metric lean/release and secondary
ratios are separately guarded. Existing envelope, intensity and seam critiques
remain unchanged.

The selected curve compresses the base BEFORE the envelope, retaining at least
one third of base-weight differences. Its knee is derived from the available
headroom, including the extra Country snap only when polyphony permits it.
Post-envelope compression was rejected: even a variant passing the older critiques
left too little contrast in the formerly clipped range and weakened double-stops.
Uniform normalization was rejected for lowering quiet velocities by about 29%.

Measured event-velocity means (old -> new, not PCM loudness): Rock low 0.686 ->
0.670 and high 0.849 -> 0.770; Jazz low 0.676 -> 0.665 and high 0.851 -> 0.779;
Country low 0.703 -> 0.668 and high 0.871 -> 0.750. Increasing intensity still
increases weight; high-energy ordinary notes leave space for the crest.

`browser/soloist-dynamic-headroom.browser.test.ts` sends generated apex velocities
through the real scheduler, synth/loaded sax pack and complete audio graph, using
matched C5 quarter-second probes with humanize off. The 15% crest must retain at
least 10% amplitude contrast in PCM. Measured low/high contrasts: synth 1.27/1.11 dB,
sax 1.21/1.21 dB. This isolates delivery, not full-mix masking or subjective feel.

Practice comparison: use the chart/seed/tempo above at low and high energy with
normal humanization, first synth then sax, and Country guitar for double-stops.
Mute the part being practiced. Listen for quiet lead presence, clearer loud-phrase
crests/releases, and unchanged pulse, arrivals and rests. Record old/new build
revisions and the listener's verdict; the measured probes are not a listening claim.

*   **Environment**: Most tests require a DOM environment. Add `// @vitest-environment happy-dom` to the top of your test file.
*   **Mocking**: Use `vi.mock()` to isolate dependencies, especially for global state (`public/state.ts`) or browser APIs (`AudioContext`).
*   **Canvas**: For visualizer tests, mock the Canvas API and `ResizeObserver` as `happy-dom` support for these is limited.
