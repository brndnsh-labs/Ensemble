# Bass Audit

Reviewer: music-theory-reviewer agent
Date: 2026-05-16
Files audited:
- `public/engine/bass-engine.ts`
- `public/engine/bass-styles.ts`
- Supporting: `public/engine/coordination-engine.ts`, `public/engine/tick-logic.ts:230-362`, `public/config.ts:114-201`

## P0 — Silences, dropouts, wrong-genre output, broken contracts

### 1. Latin / Minimal / Shred genres play wrong-genre bass (route to "rock")
- **Where:** `public/config.ts:114-130` (SMART_BASS_STYLE_MAP); `resolveMappedStyle` falls back to `'rock'` at `public/config.ts:165`.
- **What a bassist hears:** A Latin selection plays driving rock 8ths — no tumbao, no anticipations, no syncopated push from beat 4-and. Minimal plays rock 8ths. Shred plays rock 8ths (CLAUDE.md calls Shred a Metal alias but the bass map has no Shred entry).
- **Musical claim being broken:** The "SMART" style routing claims to choose an idiomatic bass per genre. Three genres silently get the wrong idiom.
- **Suggested fix sketch:** Add `Latin: 'walking-ska'` as a cheap closest-existing fit, or — preferred — implement a `'tumbao'` branch (2&-3 anticipation, root-and-fifth lower neighbor, the Salsa idiom). Add `Shred: 'metal'`. For `Minimal`, route to `'whole'` or `'half'`.

### 2. `withOctaveJump` mutates approach notes and destroys the resolution
- **Where:** `public/engine/bass-engine.ts:612-619` (main engine approach branch) and `public/engine/bass-styles.ts:952, 963` (style-layer approach).
  ```ts
  approach = clampAndNormalizeMidi(withOctaveJump(approach), prevMidi);
  ```
- **What a bassist hears:** A chromatic approach `b7 → 1` (e.g., F#2 → G2) occasionally fires as `F#3 → G2` because the F# was octave-shifted. Instead of a smooth half-step landing, the listener gets a contradicting leap.
- **Musical claim being broken:** A chromatic approach's entire musical purpose is *one semitone of motion into the target*. Octave-shifting the approach point negates that.
- **Suggested fix sketch:** Bypass `withOctaveJump` inside the approach branches — pass `approach` straight to `getFrequency` after the clamp. Reserve octave displacement for downbeat root statements.

### 3. Reggae "One Drop silencer" is mislabeled and silences the wrong riddims
- **Where:** `public/engine/bass-styles.ts:712-716`.
  ```ts
  // 1. One Drop Logic: Highly probabilistic silence on Beat 1
  // Traditional One Drop leaves the 1 completely empty for the guitar/drums.
  if (isOne && intensity < 0.7 && Math.random() < 0.8) {
      return null;
  }
  ```
  The One Drop table at `public/config.ts:200` is `[[8, 0, 1.2, 4]]` — no step-0 entry exists.
- **What a bassist hears:** At intensity 0.45–0.7 the active riddim is 54-46 or Stalag (both DO have a step-0 hit). The silencer randomly drops beat 1 80% of the time on *those* riddims, producing a stuttering, identity-confused groove. At intensity < 0.45 the active riddim is One Drop, which has no step-0 hit anyway — silencer fires on nothing. The block does the opposite of what its comment claims.
- **Musical claim being broken:** "One Drop leaves the 1 empty" is correctly encoded in the riddim table. The active-lane already implements it. The silencer is redundant *and* lands on the wrong riddims.
- **Suggested fix sketch:** Delete the block. The riddim tables already encode beat-1 behavior. If One-Drop-specific dampening at low intensity is desired, gate explicitly on `selectedRiddim === 'One Drop'`.

## P1 — Idiom gaps per genre, weak vocabulary, missing voice leading

### 4. Chromatic approach to next chord is gated to Jazz/Blues only
- **Where:** `public/engine/bass-engine.ts:589-593`:
  ```ts
  if (
      Math.random() < chromaticProb &&
      (['Jazz', 'Blues'].includes(groove.genreFeel) ||
          (soloist.session.tension || 0) + intensity * 0.3 > 0.7)
  ) {
  ```
  Mirrored in `public/engine/bass-styles.ts:929-932`.
- **What a bassist hears:** A rock/funk/pop chart `Am | F | C | G | Am` produces root–root jumps with no half-step or scale-step approach into the new chord. The next-chord landing has no momentum; it just appears.
- **Musical claim being broken:** Chromatic/diatonic approach to the next root on beat-4-and is universal bass vocabulary across rock, funk, R&B, country, soul, gospel. Jamerson, McCartney, Duck Dunn all do it constantly.
- **Suggested fix sketch:** Remove the genre gate. Keep probability lower for non-jazz/blues (`chromaticProb *= 0.5`), and gate on `nextChord.rootMidi !== chord.rootMidi` so it only fires at real chord changes.

### 5. Approach branches fire on neighbor figures inside a held chord
- **Where:** `public/engine/bass-engine.ts:570-636` and `public/engine/bass-styles.ts:910-965`. `isApproachPoint` triggers on `step % 16 === 14` plus "last beat of measure/chord," and inner choices only check `nextChord` exists — not whether `nextChord.rootMidi !== chord.rootMidi`.
- **What a bassist hears:** Bass wandering a half-step up/down on the "&" of beat 4 inside a held chord — listeners perceive a wrong-note stumble, not a transition.
- **Musical claim being broken:** "Approach" by definition targets a destination. With no chord change, there is nothing to approach.
- **Suggested fix sketch:** Add `nextChord.rootMidi !== chord.rootMidi` to both `isApproachPoint && nextChord` guards.

### 6. Country walk-up is a single chromatic note (not a walk-up)
- **Where:** `public/engine/bass-styles.ts:294-301`:
  ```ts
  if (isLastBeat && intensity > 0.5 && nextChord && nextChord.rootMidi !== chord.rootMidi) {
      if (Math.random() < 0.4) {
          const nextTarget = normalizeToRange(nextChord.rootMidi);
          const approach = normalizeToRange(nextTarget - 1);
          return result(getFrequency(approach), 1, 1.1);
      }
  }
  ```
- **What a bassist hears:** Adjacent to the known open finding (country missing quarter-note Root-5th). The single chromatic neighbor before the new chord sounds like a misfire, not a walk-up.
- **Musical claim being broken:** A country walk-up is multi-note stepwise motion into the target (5-6-7-1 or root-2-3-leading-tone across the last 2 beats). One semitone is not a walk-up.
- **Suggested fix sketch:** Once the half-note Two-Step lock is opened up (existing open finding), build a 2-to-4-note walk-up that activates ahead of chord changes, scale-tone or chromatic depending on target distance.

### 7. Hip-hop/808 "glide" is a leap, not a slide
- **Where:** `public/engine/bass-styles.ts:323-330`:
  ```ts
  if (playback.complexity > 0.7 && !isBeatStart && Math.random() < 0.5) {
      const glideNote = Math.random() < 0.6 ? finalDeepRoot + 12 : finalDeepRoot + 7;
      note = clampAndNormalize(glideNote);
      dur = 0.5;
  }
  ```
- **What a bassist hears:** A trap 808 jumps up an octave or a fifth mid-chord — sounds like a melodic synth lead, not a sub-bass slide. Real 808 slides are pitch-bends *between* chord roots across chord boundaries, not interval jumps within a chord.
- **Musical claim being broken:** "808-style melodic glides" describes between-root bends across chord changes, not within-chord interval leaps.
- **Suggested fix sketch:** Gate on chord boundary: when `nextChord && nextChord.rootMidi !== chord.rootMidi && stepInBeat === ts.stepsPerBeat - 1`, emit a note targeting the next root with `bendStartInterval` set. Drop the within-chord jump.

### 8. Rock "harmonic anticipation push" probability is way too high
- **Where:** `public/engine/bass-styles.ts:432-438`:
  ```ts
  const isPushPoint = intBeat === ts.beats - 1 && Math.random() < 0.4 + intensity * 0.3;
  if (isPushPoint && nextChord && nextChord.rootMidi !== chord.rootMidi) {
      const nextRoot = normalizeToRange(nextChord.rootMidi);
      return result(getFrequency(nextRoot), 0.8, 1.2, 1);
  }
  ```
- **What a bassist hears:** At intensity 0.5 the bass anticipates the next chord on ~55% of chord-change beat-4s — well above the once-per-section feel of a real harmonic push. Twitchy.
- **Musical claim being broken:** A push is a *signal gesture* used to mark a section change or unexpected landing. Used on every other change, it stops being a signal and becomes ambient.
- **Suggested fix sketch:** Drop to `0.1 + intensity * 0.15` (10-25%) and ideally gate on section boundary lookahead.

### 9. Walking-ska's 6th interval ignores chord quality
- **Where:** `public/engine/bass-styles.ts:771-777`:
  ```ts
  if (patternIndex === 1) targetInterval = 7;     // 5th
  else if (patternIndex === 2) targetInterval = 9; // 6th
  else if (patternIndex === 3) targetInterval = 12; // Octave
  ```
- **What a bassist hears:** Over a minor chord (vi/iii/ii in most ska tunes), the bass plays a major sixth against a minor third — implies Dorian, not natural minor. Over a half-dim chord, the M6 clashes with the b5.
- **Musical claim being broken:** Theory: scale-degree 6 must match the chord's prevailing mode. Hard-coding 9 semitones forces a major sixth against every chord.
- **Suggested fix sketch:** `targetInterval = scale.includes(9) ? 9 : (scale.includes(8) ? 8 : 7);`

### 10. Generic walking fallback has no target awareness
- **Where:** `public/engine/bass-engine.ts:638-668`. After all style branches return `undefined`, this picks a scale tone with stepwise weighting and randomly samples one of the top 2 by hand-position weight.
- **What a bassist hears:** A non-jazz walking line (or `quarter`-style fall-through outside `Jazz` genreFeel) bounces between scale tones with no directional pull toward the next chord. Noodling, not walking.
- **Musical claim being broken:** Walking bass is defined by *targeting* — beats 2 and 3 lead toward the next chord's root on beat 1. The fallback never reads `nextChord`.
- **Suggested fix sketch:** Replace the top-2 tiebreaker with a target-distance score: for beats `n-1` and `n-2`, weight candidates by descending distance to `normalizeToRange(nextChord.rootMidi)`.

### 11. Bass never reads `coordination.bassMidi` of soloist activity beyond `kickHit` — soloist-bass unison undetected
- **Where:** `public/engine/bass-engine.ts` — only `coordination?.kickHit` is consumed.
- **What a bassist hears:** A walking bass note can land in unison with the soloist's current pitch, blurring the melodic line. The reverse (soloist consuming bassMidi) is also unbuilt — see soloist audit.
- **Musical claim being broken:** Cross-instrument awareness contract advertised in `coordination-engine.ts:4`.
- **Suggested fix sketch:** When the bass has multiple candidate scale tones, lightly penalize the one that matches `coordination.soloistMidi` octave/pc.

## P2 — Programmer's-math, missing variation, undocumented intent

### 12. `withOctaveJump` probability `0.02 + intensity * 0.08` — no WHY comment
- **Where:** `public/engine/bass-engine.ts:392-405`. Bare RNG applied universally to nearly every emitted note via wrappers throughout the engine. 2-10% of notes are octave-jumped regardless of style or position.
- **What a bassist hears:** Inconsistent leaps in walking lines and acoustic patterns where they're not idiomatic. In neo/dub (ceiling-capped) it's dampened, but in jazz walking it's an unwelcome jolt.
- **Musical claim being broken:** No documented intent. Octave displacement for emphasis is real, but it should be at structural points (downbeats, section starts), not randomly applied.
- **Suggested fix sketch:** Add a `// why:` comment naming the intended density, or restrict firing to `isBeatStart && (isMeasureStart || isSectionStart)`.

### 13. Funk "harmonic approach" fires on every beat boundary, not on chord changes
- **Where:** `public/engine/bass-styles.ts:585-589`:
  ```ts
  if (intensity > 0.75 && stepInBeat === ts.stepsPerBeat - 1 && Math.random() < 0.6) {
      const target = nextChord ? normalizeToRange(nextChord.rootMidi) : baseRoot;
      const approach = Math.random() < 0.5 ? target - 1 : target + 1;
  ```
- **What a bassist hears:** Above intensity 0.75, the last 16th of every beat fires a chromatic neighbor 60% of the time — even when no chord change is coming. Hyperactive wiggle.
- **Musical claim being broken:** `target` falls back to current root when `nextChord` is null or unchanged — producing a half-step neighbor of the *current* root, not a true approach.
- **Suggested fix sketch:** Gate on `nextChord && nextChord.rootMidi !== chord.rootMidi` and drop probability to ~0.3.

### 14. Acoustic "occasional 5th or octave" — `Math.random() < 0.4 + intensity * 0.3`
- **Where:** `public/engine/bass-styles.ts:348-356`. On beats 2 and 4 at intensity 0.5, 55% of hits leap to a fifth or octave above root.
- **What a bassist hears:** Acoustic folk/country bass jumps to octave/fifth-up every other beat — sounds like jazz fingerstyle, not fingerpicked folk.
- **Musical claim being broken:** Code comment says "Occasional 5th or Octave at higher intensity." 55% is not occasional.
- **Suggested fix sketch:** Drop to `0.15 + intensity * 0.2` (15-35%) and document the intended density.

### 15. Generic walking fallback picks top-2 candidates with raw `Math.random()`
- **Where:** `public/engine/bass-engine.ts:660-662`:
  ```ts
  candidates[Math.floor(Math.random() * Math.min(2, candidates.length))].midi
  ```
- **What a bassist hears:** A jazz tune looped twice plays a different walking line each loop. Real bassists *do* vary on repeats, but variation should follow phrase structure (chorus evolution), not a coin-flip per note.
- **Musical claim being broken:** CLAUDE.md § Deterministic phrasing: "Prefer deterministic, seeded motif generation (`barIndex`, `sectionId`) over raw `Math.random()`." This is the canonical violation in the bass engine.
- **Suggested fix sketch:** Replace with a deterministic seed from `barIndex` + `intBeat` (e.g., `(barIndex * 7 + intBeat * 11) % 3 === 0 ? candidates[1] : candidates[0]`). The bossa branch at `bass-styles.ts:485-491` is the proven model.

### 16. "Bossa Nova / Samba" label conflates two distinct rhythmic feels
- **Where:** `public/engine/bass-styles.ts:463`. Comment reads "BOSSA NOVA / SAMBA STYLE," but the (1, 2&, 3, 4&) pattern is strictly bossa.
- **What a bassist hears:** Selecting a Samba feel gets a Bossa line. Samba is Tresillo-derived with stronger anticipation, swung-eighth feel against the surdo, and the bass typically emphasizes beat 2 (in 2/4 felt time), lightening beat 3.
- **Musical claim being broken:** Bossa and Samba are theoretically and culturally distinct feels.
- **Suggested fix sketch:** Rename to "BOSSA NOVA STYLE only," and either add a separate `'samba'` branch or document that Samba should route differently in `SMART_BASS_STYLE_MAP`.

### 17. Round-number probabilities without WHY comments (sweep)
- `bass-styles.ts:296` — country walk-up `< 0.4`
- `bass-styles.ts:325-326` — hiphop glide `< 0.5` and `< 0.6`
- `bass-styles.ts:407` — metal max-intensity fill `< 0.3`
- `bass-styles.ts:540, 567, 576` — funk pop/chuck/hammer-on ladder
- `bass-styles.ts:614, 617` — rocco "and" play and tiered octave/fifth
- `bass-styles.ts:676, 697` — disco octave and gallop probabilities (`gallopProb - 0.1` at 697 is musically opaque)
- `bass-styles.ts:850` — jazz beat-3 fifth-vs-root `< 0.7`
- **Suggested fix sketch:** Each needs a `// why:` line naming the musical density target. Documentation pass so future audits can verify or correct.

## Notes for synthesis

**Findings cluster strongly around chord-change awareness.** P0 #2 (octave-jump-on-approach), P1 #4 (chromatic gated to jazz/blues), P1 #5 (approach fires inside held chords), P2 #13 (funk approach not gated on change) — four findings, all symptoms of the same gap: the bass has approach machinery but doesn't consistently check `nextChord.rootMidi !== chord.rootMidi`. A small shared helper `isChordChangeApproach(stepInfo, nextChord, chord, ts)` adopted across both `bass-engine.ts` and `bass-styles.ts` would let every branch ask the right question once. **Highest-leverage architectural shift in the audit.**

**Two findings cluster around per-event RNG vs. structural seeding** (P2 #15 walking line, P2 #12 octave-jump). The bossa branch already proves the pattern. Pushing the same `barIndex`-seeded recipe into the generic walking fallback and `withOctaveJump` closes both with one architectural move.

**Three findings cluster around routing/genre coverage** (P0 #1 latin/minimal/shred, P0 #3 mislabeled one-drop silencer, P2 #16 bossa/samba conflation). Config-and-naming, not deep engine work — cheap to fix in one pass, unblocks future critique-test creation for those genres.

**User judgment needed:**
- Funk pop/chuck/hammer ladder (`bass-styles.ts:540, 567, 576`) is musically defensible at current numbers (slap funk is busy by design), but has no documented density target. Ask "how busy should funk feel at intensity 0.5?" before tightening.
- Rock harmonic-anticipation push at 40-70% strikes the reviewer as too high, but the right target depends on intended rock feel (Stones-y "anticipate every change" vs. classic 70s "anticipate sparingly").
