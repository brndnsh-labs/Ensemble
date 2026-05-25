# Soloist Audit

Reviewer: music-theory-reviewer agent
Date: 2026-05-16
Files audited:
- `public/engine/soloist.ts`
- `public/engine/soloist-pitch-engine.ts`
- `public/engine/soloist-rhythm-engine.ts`
- `public/engine/soloist-devices.ts`
- `public/engine/soloist-config.ts`
- `public/engine/soloist-mode-policy.ts`
- (cross-ref) `coordination-engine.ts`, `theory-scales.ts`, `soloist-seeder.ts`

## P0 — Silences, dropouts, wrong-genre output, broken contracts

### 1. Bebop chromatic vocabulary is impossible — non-scale, non-bluenote tones are `continue`'d before chromaticism boost can fire

- **Where:** `soloist-pitch-engine.ts:501-507` and dependent Bird profile at `:610-615`
- **Code:**
  ```ts
  if (isBluesOrJazz && (interval === 3 || interval === 6 || interval === 10)) {
      isBlueNote = true;
  }
  if (!isScaleTone && !isBlueNote) {
      continue;
  }
  ...
  case 'bird':
      // Bird: Bebop, high chromaticism
      if (!isScaleTone) { weight *= 1.5; }
  ```
- **What a listener hears:** Bird/Coltrane/bebop styles play diatonic-with-blue-notes. The genre-defining chromatic-approach vocabulary (b9→1, #9→3, half-step-above-target enclosures, leading tones of arbitrary chord tones) is structurally unreachable from the live pitch picker. A bebop "chromaticism: 0.9" knob silently does nothing.
- **Musical claim being broken:** `bird` config (`soloist-config.ts:741`) advertises `chromaticism: 0.9`. The Bird profile comment says "Bebop, high chromaticism" and applies `weight *= 1.5` to non-scale tones — but the only non-scale tones in the candidate pool by that point are the three blue-note pitch classes. Real bebop's defining sound cannot emerge.
- **Suggested fix sketch:** Loosen the `continue` to allow chromatic neighbors of chord tones (±1 semitone from any chord-tone pitch class) into the pool, gated by `config.chromaticism`. Apply a base penalty (e.g., `weight *= 0.05`) so they only win when the profile/SRDC/scale logic explicitly elevates them.

### 2. `bebopScale` device builds the run around chord ROOT, not around `selectedMidi` — line skips wildly in registration

- **Where:** `soloist-devices.ts:439-450`
- **Code:**
  ```ts
  } else if (deviceType === 'bebopScale') {
      const root = targetChord.rootMidi;
      const bebopNote = root + 11; // Major 7 passing tone for dominant
      deviceBuffer = [
          { midi: root + 12, ... },
          { midi: bebopNote, ... },
          { midi: root + 10, ... },
          { midi: root + 9, ... },
      ];
  ```
- **What a listener hears:** A 4-note bebop run that always starts an octave above the chord ROOT (then the octave-shifter at line 511 lurches it toward `lastMidi`, producing leaps before AND after the device).
- **Musical claim being broken:** A bebop scale is a *connector* — adding a chromatic passing tone so beat-aligned notes land on chord tones. Anchoring to root pitch-classes rather than to the moving line destroys the named purpose. Compare to `run`/`enclosure`, which correctly anchor to `selectedMidi`.
- **Suggested fix sketch:** Build the device ascending or descending from `selectedMidi` through a bebop-scaled interval set so the *next* beat lands on a chord tone. Chromatic passing tone inserted between scale degrees, not as a fixed `root+11`.

### 3. Role-skeleton response strips all duration shape from the answer

- **Where:** `soloist-rhythm-engine.ts:213-245`
- **Code:**
  ```ts
  } else if (
      ['blues', 'jazz', 'rock', 'scalar'].includes(style) &&
      soloistState.session.currentPhrase.context?.role === 'response' &&
      soloistState.session.currentPhrase.context?.skeleton?.length > 0 &&
      Math.random() < 0.8
  ) {
      for (const relStep of ...) {
          ...
          plan.push({ stepTarget, velocity, isStrongBeat, durationSteps: 1 });
      }
  ```
- **What a listener hears:** When a blues/jazz/rock/scalar phrase is in "response" role and the motivic-response-signature path isn't taken, the answer comes back as a uniform string of 16th-note staccato attacks at the call's positions. The call could have been "long, long, short-short-long"; the answer will always be "tick tick tick tick" of equal sixteenths. No `isSustained`, no duration variation.
- **Musical claim being broken:** A call-and-response is a *paraphrase* of the call's rhythmic shape, not just its attack positions. Compressing all durations to 1 makes the answer feel like a robotic mirror.
- **Suggested fix sketch:** Preserve source `durationSteps` where available, OR fall through to the main attack-prob path with a contour overlay. Also tag mid-build phrase-end markers inside this branch.

## P1 — Idiom gaps, weak phrasing, washed-out biases

### 4. `evans` profile is so aggressive it silences a defining part of Bill Evans's vocabulary

- **Where:** `soloist-pitch-engine.ts:616-625`
- **Code:**
  ```ts
  case 'evans':
      if (evansIntervals.has(interval)) {
          weight += 500; // Final boost to reliably exceed 40% target
          weight *= 10.0;
      }
      if (interval === 0) {
          weight *= 0.01; // Avoid roots almost entirely
      }
  ```
- **What a listener hears:** Evans-profile lines never touch the root, and extensions (2/5/6/9) so dominate the weight (>2000 against a chord-tone baseline of ~150) that the line orbits 9/11/13 like a static idée fixe. The `// reliably exceed 40% target` comment is a tell that this was tuned to a *test threshold*, not a musical target.
- **Musical claim being broken:** Voice leading. Real Evans phrases resolve `11→3` and `13→5`; killing root pitch class entirely means a beat-1 V→I will never put I's root on beat 1.
- **Suggested fix sketch:** Drop the `+ 500` additive floor (it drowns competing biases); reduce `×10.0` to `×2.5–3.0`; remove the `×0.01` on root or limit it to non-cadence positions (`!rhythmNode.isPhraseEnd && supportRole !== 'cadence'`).

### 5. SRDC `restatement` is musically indistinguishable from statement

- **Where:** `soloist-pitch-engine.ts:478-485`
- **Code:**
  ```ts
  const srdcChordToneMult =
      srdcPhase === 'conclusion' ? 1.5
      : srdcPhase === 'departure' ? 0.45
      : srdcPhase === 'restatement' ? 1.15
      : 1.0;
  ```
- **What a listener hears:** Restatement (×1.15) and Statement (×1.0) sit inside the noise floor of all the other simultaneous biases (chord-tone `+150`/`+300`, profile ×1.2–1.5, common-tone ×2.0). The SRDC arc is binary in practice — Conclusion or Departure.
- **Musical claim being broken:** SRDC is a 4-phase arc; Restatement is the moment the player says "yeah, I meant it" — chord-tone pull should be measurably higher than Statement.
- **Suggested fix sketch:** Push `restatement` to ×1.3 (and tighten Statement default), OR fold Restatement into the contour/repetition logic (rhythm reuse + same pitch contour, looser landings). The SRDC critique test (per archived musical audit shipped table) only measures Conclusion-vs-Departure, so this Restatement gap is currently untested.

### 6. Loop 0/1/2 differentiation lives almost entirely in pitch — rhythm engine has zero loop awareness

- **Where:** `soloist-rhythm-engine.ts` (whole file — no `loopCount` references); `soloist.ts:825`
- **What a listener hears:** Each successive chorus has roughly the same attack pattern. The "Loop 2 Exploratory" feature (CLAUDE.md "Progressive Ornamentation +20%/loop") is fully expressed in `deviceBaseProb *= 1.0 + loopCount * 0.2` (pitch-engine line 923) and `effectiveIntensity = intensity + loopCount * 0.05` (soloist.ts:825). That's a 10% intensity bump + 20% device frequency — both real, but rhythmic profile is essentially constant.
- **Musical claim being broken:** CLAUDE.md § Dynamic Head / Chorus Evolution promises Loop 2+ "Exploratory" with "Fatigue Decay (shorter rests)" and "Common Tone Reward (pedal-point bias across chord changes)." Fatigue Decay exists (soloist.ts:1465) but only on `isStrongResolution` rest-entry. "Common Tone Reward across chord changes" doesn't exist on this path.
- **Suggested fix sketch:** Move `loopCount` into the rhythm engine — `densityScale *= 1 + loopCount * 0.15`, `attackJitter += loopCount * 0.05`. OR explicitly downscope the CLAUDE.md claim. Add a test comparing Loop 0 vs. Loop 2 attack count / interval distribution over a fixed seed.

### 7. Head-bypass jitter range produces leaps that ignore voice leading

- **Where:** `soloist.ts:1130-1144`
- **Code:**
  ```ts
  if (isThemedImprov && !isProtectedSeedTone) {
      const jitterRange = isFirstRestatementLoop ? 1
          : effectiveIntensity > 0.75 ? 3
          : effectiveIntensity > 0.5 ? 2 : 1;
      const jitterProb = isFirstRestatementLoop ? 0.16 : 0.32;
      if (Math.random() < jitterProb) {
          targetMidi += Math.floor(Math.random() * (jitterRange * 2 + 1)) - jitterRange;
      }
  }
  ```
- **What a listener hears:** During themed improv on Loop 2+, non-anchor seed notes get bumped by up to ±3 semitones with no chord-aware filtering. A seed-note 5th (G over C) can become an F# (b5, out of key) and pass straight to playback.
- **Musical claim being broken:** "Themed improv" means *tasteful* variation, not 32% of head notes getting ±3 random semitones. Bird's variations on a head went up to the 9th or down to the 6th — interval-aware, not pitch-aware.
- **Suggested fix sketch:** Constrain jitter to scale-tones (offset to next/previous scale tone, not chromatic semitone), OR gate the jittered result through the chord-mask check — if jittered result is outside scale AND not a leading tone to the next anchor, drop it and play the seed note.

### 8. Soloist never reads `coordination.bassMidi` / `coordination.accompanimentMidis` — register conflicts go undetected

- **Where:** `soloist-pitch-engine.ts` (no references found via grep)
- **What a listener hears:** Soloist can pick a pitch in unison with the bass's current note (smudges the bass line) or doubled with a chord voice (loses melodic identity inside the comp). One of the two specific cases the coordination contract was designed to prevent (`coordination-engine.ts:90-92` writes these fields every chord turn with zero consumers).
- **Musical claim being broken:** `coordination-engine.ts:4`'s "Musical Coordination Contract" advertises proactive generator awareness. Real horn players hear the bass walking and step out of its way.
- **Suggested fix sketch:** In the candidate-weight loop, when `m === coordination.bassMidi` (or `m % 12 === coordination.bassMidi % 12` and `m < lastMidi + 5`), `weight *= 0.5`. Same for `accompanimentMidis` unison check. Multiplicative and modest. Already in archived musical audit queued pickups; restating because soloist is the natural primary consumer.

### 9. Phrase-end Response/Call bias is monophonic-only in practice

- **Where:** `soloist-rhythm-engine.ts:521-545`
- **Code:**
  ```ts
  const shouldCreatePhraseBreath =
      isMonophonicMode &&
      isSustained &&
      notesInPhrase >= 4 &&
      (isDownbeat || isBeatStart || isFinalMeasure);
  ```
- **What a listener hears:** In guitar mode, mid-phrase phrase-end markers never fire. Only the final node of each plan-build gets `isPhraseEnd: true` (line 634). For a guitar solo with long active phrases (16+ steps), the role-aware landing bias gets exercised on average once per several bars instead of once per breath.
- **Musical claim being broken:** Phrase-end Response/Call asymmetry (shipped 2026-05-16) was sold as a phrase-shape feature. In guitar mode, "phrase" effectively means "the entire active span between rests."
- **Suggested fix sketch:** Drop the `isMonophonicMode &&` clause on `shouldCreatePhraseBreath`. The breath rest can stay monophonic-only; the phrase-end *mark* should fire regardless so the pitch picker biases the landing tone.

## P2 — Programmer's-math, missing variation, missing comments, missing tests

### 10. Section influence shift uses bare `Math.random() < 0.8` — no musical justification, not deterministic

- **Where:** `soloist.ts:1287-1298`
- **What:** Every section boundary, soloist re-rolls a Greats profile from `INFLUENCE_POOLS[style]` with 80% probability. The `0.8` has no comment and no structural tie. With three sections per chorus, the soloist gets a new profile every ~1.25 sections — faster than the listener can identify.
- **Why it matters:** CLAUDE.md prefers deterministic-seeded phrasing for coherent looping.
- **Suggested direction:** Make it deterministic on `(sessionSeed, sectionLabel, sectionOccurrence)` so the same form gives the same profile rotation each pass, OR lower probability to ~0.4 with a musical comment.

### 11. `Math.random() < 0.8` for skeleton-vs-attack-prob response path — undocumented (related to P0 #3)

- **Where:** `soloist-rhythm-engine.ts:217`
- **What:** Same anti-pattern as #10. Half the time, "the answer mirrors the call's attacks"; 20% you fall through to the random attack-prob path. No musical reason it should be 80% vs. 75% or 90%.
- **Suggested direction:** Document or replace with a context-aware probability (e.g., higher when responseSource is 'section' so recall is stable, lower when 'recent' so the soloist breathes).

### 12. Monk profile timing displacement is below the perceptual threshold and undocumented

- **Where:** `soloist-pitch-engine.ts:329-331`
- **Code:**
  ```ts
  if (profile === 'monk' && Math.random() < 0.3) {
      timingOffset += (Math.random() - 0.5) * 0.025; // Monk displacement
  }
  ```
- **What:** 30% probability per attack, ±12.5ms displacement. ~30ms is the lower edge of swing-feel detection — 12.5ms is below it. Monk's actual displacements were structural musical ideas (delayed phrase entrance, anticipated downbeat), not per-note jitter.
- **Why it matters:** Programmer's-math probability with no why-comment; effect is sub-audible.
- **Suggested direction:** Sparser-but-larger — ±25–35ms targeting only phrase entries or structural downbeats.

### 13. Dead per-style config knobs (`targetExtensions`, `targetAnchoring`, `tensionScale`, `chromaticism`)

- **Where:** `soloist-config.ts` (defined per style); only `syncopationLikelihood` is consumed, and only in the seeder (not in the live engine)
- **What:** Every style block has 4 musicality knobs that read like a stylebook but aren't read at runtime. `bird.chromaticism = 0.9` does nothing. `minimal.tensionScale = 0.95` does nothing. `country.targetExtensions = [2, 4, 9]` is never consulted.
- **Why it matters:** Future style additions will be tuned by knobs that have no effect. The config looks musically rich; the engine is much simpler than it appears.
- **Suggested direction:** Wire them in (start with `chromaticism` as the multiplier on P0 #1's chromatic-neighbor unlock; `targetExtensions` as a `+weight` nudge inside the candidate loop), OR delete with a one-line comment.

### 14. Device selection is uniform random over a curated-but-unranked list — priority array is decorative

- **Where:** `soloist-pitch-engine.ts:1134`
- **Code:**
  ```ts
  const deviceType = fittedAllowed.length > 0
      ? fittedAllowed[Math.floor(Math.random() * fittedAllowed.length)]
      : null;
  ```
- **What:** `buildMotifDevicePriorities` (line 101) carefully ranks devices by phrase context; `allowed = [...thematicDevices, ...allowed]` puts prioritized ones first — but the final pick is uniform random. The prioritization is musically wasted work.
- **Why it matters:** A cadence-comment phrase has `enclosure` ranked first, but if four devices are allowed, enclosure wins 25% of the time. Priority only matters if a device is later filtered out.
- **Suggested direction:** Use weighted selection (first device 2× as likely as next), or take the head of `prioritized` with a fallback probability.

### 15. Coltrane "wide intervals" boost is immediately washed out by universal large-leap penalties

- **Where:** `soloist-pitch-engine.ts:626-633` (Coltrane boost) vs. `:809-820` (large-leap penalties)
- **Code:**
  ```ts
  case 'coltrane':
      const coltraneDist = Math.abs(m - lastMidi);
      if (coltraneDist > 7) { weight *= 1.5; }
  ...
  if (dist > 7) { weight *= 0.4; }
  ...
  if (dist > 7 && dist !== 12) { weight *= 0.1; }
  ```
- **What:** Coltrane gets ×1.5 for `dist > 7`, then universal ×0.4, then ×0.1 if not an octave. Net non-octave wide leap: 1.5 × 0.4 × 0.1 = 0.06 — a 94% penalty. EVH at line 572-579 has the same shape.
- **Why it matters:** Coltrane is meant to evoke "sheets of sound" big-interval lines; engine demonstrably suppresses them.
- **Suggested direction:** Move the profile-specific boost to AFTER the leap penalty (or apply as a final-stage `weight *= 1.5` outside the additive phase). Per the project's "final-stage multipliers dominate" rule, the boost can't precede the universal penalty if you want it audible.

## Notes for synthesis

A few clusters worth treating together:

- **Bebop/jazz idiom is structurally hobbled.** P0 #1 (chromatic neighbors excluded), P0 #2 (bebopScale misanchored), P1 #4 (Evans root-avoidance), and P2 #13 (dead `chromaticism` knob) all conspire to make line-style genres sound diatonic-with-color-notes rather than bebop. P0 #1 also unlocks the `chromaticism` knob — solve them together.

- **"Loop differentiation" claim doesn't match the code.** P1 #6 (rhythm has no loop awareness) plus P1 #7 (head-bypass jitter is harmonically blind) mean the marquee Chorus Evolution feature is a +5% intensity bump per loop plus +20% random ornaments — not the "Statement / Themed Improv / Exploratory" arc the docs sell. Already noted as deferred in archived musical audit.md handoff #4; the rhythm-side gap is the bigger one.

- **"Profile multipliers compete with universal penalties" is a recurring engine smell.** P1 #4 (Evans) and P2 #15 (Coltrane) are both symptoms of the same architectural issue: profile boosts land in the additive phase, then universal penalties apply multiplicatively on top, washing them out. The 2026-05-16 SRDC fix correctly placed its multiplier at the final stage; the profile boosts should follow the same pattern. One architectural shift fixes multiple findings.

- **Coordination consumption is half-built (P1 #8).** Coordination engine writes `bassMidi`, `accompanimentMidis`, `avgChordMidi` every chord turn; soloist reads none. Already queued in archived musical audit; restated here because soloist is the natural primary consumer.

- **Needs musical judgment from user:** the rhythm engine's `attackProb *= 1.0 + soloistState.session.rhythm.entropy * 0.5` (line 344) — entropy ranges `[-1, 1]` so this can multiply 0.5–1.5. Is this a documented stylistic axis or an undocumented chaos knob?
