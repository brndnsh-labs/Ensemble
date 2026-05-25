# Chords / Accompaniment Audit

Reviewer: music-theory-reviewer agent
Date: 2026-05-16
Files audited:
- `public/engine/chords-engine.ts`
- `public/engine/chords-styles.ts`
- `public/engine/accompaniment.ts`
- `public/engine/voicing-policy.ts`
- `public/engine/coordination-engine.ts`
- `public/engine/harmonies.ts` (boundary check)
- `public/data/instrument-styles.ts`
- `tests/standards/{jazz,funk,acoustic,neo-soul,reggae}-piano-critique.test.ts`

## P0 — Silences, dropouts, wrong-genre output, broken voicings

### 1. Funk comping cell is uniform-random across all 4 beats and all 16 sub-positions
- **Where:** `accompaniment.ts:487-507`
  ```ts
  for (let i = 0; i < density; i++) {
      const b = Math.floor(Math.random() * ts.beats);
      const sub = Math.random() < 0.5 ? 1 : spb - 1; // "e" or "a"
      hit(getBeatStep(b, sub));
  }
  ```
- **What a comper hears:** A funk clav/Rhodes part that lands its 16th-note stab on a different randomly-chosen beat every bar — no signature, no repeating rhythmic cell, no James-Brown "wait for the One-and." Real funk comping is *built* on a 1–2 bar groove cell that loops: the pattern locks (e.g. stab on `&-of-2`, `e-of-3`, `a-of-4` every bar) and *that locked phrase* is what gives the groove its shape. Even with STICKY_GENRES retention every 4–8 bars (`accompaniment.ts:784-801`), the cell *inside* each non-retained bar is a fresh random scatter.
- **Musical claim being broken:** Funk comping is groove-cell based, not stochastic per-step. Requires a deterministic, looping 16th-note pattern.
- **Suggested fix sketch:** Replace the per-call `Math.random()` placement with a small bank of deterministic 1–2-bar 16th-note cells (e.g. `[0, 6, 11, 14]`, `[3, 6, 10, 14]`, `[0, 3, 6, 11]`), keyed by `barIndex % bankSize` or a `sectionId`-seeded hash. Same recipe as the bossa-bass `barIndex` fix shipped 2026-05-16.

### 2. Jazz/Bossa/Blues "Charleston / Reverse-Charleston / Sync-Ands / RG-Lite / Anticipation" rhythms picked by `Math.random()` per-bar
- **Where:** `accompaniment.ts:556-602` (line 557: `const type = Math.random();` drives a five-way switch)
- **What a comper hears:** A jazz pianist who flips a coin every bar to decide whether to play Charleston, reverse-Charleston, anticipated 4-and-3-and, or sparse-and-4. Real jazz compers commit to a rhythmic idea for a phrase (often 4 bars) and *develop* it. STICKY_GENRES (`accompaniment.ts:48`) excludes Jazz/Blues/Bossa.
- **Musical claim being broken:** Comping is statement → development, not bar-by-bar dice rolls.
- **Suggested fix sketch:** Hash `(sectionId, barIndex >> 2)` to choose a Charleston-family pattern that locks for a 4-bar phrase, with in-phrase variation coming from intensity/soloistBusy rather than uniform random.

### 3. Neo-Soul Quartal voicings stack a literal half-step `[2, 3]` cluster the listener will hear as a wrong note
- **Where:** `chords-styles.ts:60-67`
  ```ts
  if (genre === 'Neo-Soul' && quality === 'minor' && is7th) {
      if (isRich || intensity > 0.6) {
          return [2, 3, 5, 10, 15, 19];
      }
      return [5, 10, 15, 19];
  }
  ```
- **What a comper hears:** On a Cm7 voicing the rich version emits pitch classes `{D, Eb, F, Bb, Eb, G}` — the `2` (D) and `3` (Eb) are one semitone apart, producing an adjacent half-step in the same octave. Comment claims "2 + b3 cluster for crunch," but a half-step *between two adjacent voicing notes* over an m7 root sounds like a wrong note. The Glasper/D'Angelo m9 vocabulary uses 2 *above* the b3 voiced an octave apart (the 9 over the b3 in the next octave), never `[2, 3]` adjacent.
- **Musical claim being broken:** Neo-Soul "cluster crunch" lives between the 9 and the b3 voiced an octave apart, not between scale degrees 2 and b3 in the same compact register.
- **Suggested fix sketch:** Drop the `2` from the rich quartal stack — `[5, 10, 14, 17]` (4, b7, 9, 11) is the canonical D'Angelo quartal m7 voicing. If you want crunch, voice the 9 above the b3 in a higher octave.

### 4. Power-metal lane stacks a perfect-fifth power-chord voicing regardless of chord quality
- **Where:** `accompaniment.ts:1105-1142` (line 1112: `const voicing = [root, root + 7, root + 12];`)
- **What a comper hears:** Correct for major or 5 chord, but every minor / dim / dom7 / m7b5 in the progression is rewritten as a bright perfect-fifth power-chord stack. On a `iim7b5 → V7alt → im` Phrygian-flavored metal turnaround the m7b5 becomes a P5 power chord (effectively a *major*-implying voicing on a half-diminished function). The chart says one thing; the comper plays another.
- **Musical claim being broken:** "Power chord" is a P5 voicing that removes the third precisely so the chord is quality-ambiguous — but for diminished/half-dim/altered-dominant qualities the fifth itself is wrong.
- **Suggested fix sketch:** Read `chord.quality`. For `dim`, `halfdim`, `7b5` use `[root, root+6, root+12]` (tritone power chord — standard metal "evil" voicing); for `aug`, `7#5` use `[root, root+8, root+12]`; for everything else keep `[root, root+7, root+12]`.

## P1 — Voice leading, comping rhythm per genre, extension/color usage

### 5. "Harmonic Tension Scaling" randomly overwrites voicing notes with extensions, breaking voice leading on every retrigger
- **Where:** `accompaniment.ts:1543-1563`
- **What a comper hears:** When `complexity > 0.5`, each chord retrigger inside one sustained chord re-rolls *which voice* gets shifted to a random extension at a random octave. The top three voicings within a single Cm9 will jitter between `[G, Bb, D]` → `[G, Bb, F]` → `[G, F, D]` from stab to stab. A real player picks one voicing for the chord, then changes it intentionally on the next chord change.
- **Musical claim being broken:** Top-voice movement should be deliberate. Random per-stab extension swaps inside one chord break voice-leading and sound nervous, not lush.
- **Suggested fix sketch:** Make extension selection deterministic per `(chordIndex, retriggerIndex)` and *one-shot per chord*: pick the upper-voice color when the chord changes, then hold it across all stabs of that chord.

### 6. `getBestInversion` only nearest-octave-picks each interval; ignores common-tone holds and 7→3 resolution between successive chords
- **Where:** `chords-engine.ts:202-286`, called from `parseProgressionPart` at `chords-engine.ts:765`
- **What a comper hears:** ii–V–I in C: Dm7 → G7 → Cmaj7. A real comper holds F (b7 of Dm7) and resolves it down to E (3 of Cmaj7); holds A (5 of Dm7 / 9 of G7) as a common tone; resolves F (b7 of G7) → E (3 of Cmaj7). The engine instead places each interval at "nearest octave to targetCenter" independently, with no preference for keeping the common-tone voice on the same MIDI and resolving the guide-tone voice by step.
- **Musical claim being broken:** Functional jazz/pop comping is built on guide-tone lines (3rd and 7th moving by step) and common-tone holds (5th).
- **Suggested fix sketch:** After placing each interval near `targetCenter`, run a second pass: for each pitch-class in the new chord that exists in `previousMidis`, snap to the same octave (common-tone hold); for each new 3rd/b7, find the previous chord's 7th/3rd and move by minimum interval. The machinery exists — `getNearestVoiceLeadingCost` at `accompaniment.ts:261-273` — but is only consumed by the altered-dominant resolver lane.

### 7. Altered-dominant voicing logic only fires for literal `'7alt'` quality — `7b9`, `7#9`, `7b13`, `7#11` fall through to generic inversion
- **Where:** `accompaniment.ts:1538-1539`
  ```ts
  const shouldUseResolvingAlteredVoicing =
      genre === 'Jazz' && chord.quality === '7alt' && chords.style !== 'pad';
  ```
- **What a comper hears:** On a chart that spells `G7b9 → Cm` (more common than `G7alt`), the comper plays a tight guide-tone-plus-b9 voicing — exactly what `buildResolvingAlteredVoicing` produces. But because the gate is `=== '7alt'`, `G7b9` gets the generic inversion path with no awareness that the b9 is the resolution-critical color.
- **Musical claim being broken:** All altered-dominant qualities share one comping idiom — guide tones (3, b7) plus 1–2 altered colors.
- **Suggested fix sketch:** Extend `shouldUseResolvingAlteredVoicing` to cover `{'7alt', '7b9', '7#9', '7b13', '7#11'}`.

### 8. Reggae lane: bubble fires on ALL offbeats including those overlapping skank beats — produces "skank + bubble" union texture instead of one-lane-at-a-time
- **Where:** `accompaniment.ts:1226-1296`
- **What a comper hears:** Real reggae piano plays either *skank* (staccato chord on backbeats 2 & 4, organ "BLOK") or *bubble* (eighth-note offbeats on the organ), almost never both. The engine fires `isSkank && isBeatStart` (backbeats) AND `isBubble` (offbeats at step `stepsPerBeat/2`) with bubble probability `0.3 + intensity * 0.5`. At intensity 0.7 you get ~65% bubble overlapping 100% skank.
- **Musical claim being broken:** Reggae piano is one lane at a time. The engine's union-of-lanes produces a busier feel than the One-Drop or Steppers vocabulary supports.
- **Suggested fix sketch:** Pick lane per-bar (or per-section) instead of per-step: low/medium intensity → skank-only; high intensity OR `chords.style === 'organ'` → bubble-only.

### 9. Strum-country alternating Root/Fifth bass uses 90% probability instead of strict alternation
- **Where:** `accompaniment.ts:1046-1058`
- **What a comper hears:** Carter Family / boom-chick country guitar alternates Root–Fifth–Root–Fifth on beats 1-3 strictly. The 10% probability that beat-3 returns to root sounds like the player forgot the alternation.
- **Suggested fix sketch:** Strict `if (measureStep === 0) root; else fifth;`. If variation is wanted, vary the octave or use the third as a passing tone — never go back to root on beat 3.

### 10. Strum-country uses raw `chord.freqs.slice(0, 3)` — no idiomatic strum voicing, no voice leading
- **Where:** `accompaniment.ts:1070-1088`
- **What a comper hears:** Whatever the chord voicing happened to be set to upstream. No Carter-pick / boom-chick *strum* shape (typically open D-G-B-E voicings on guitar), and no voice leading between chords.
- **Suggested fix sketch:** Build a dedicated strum voicing — octave-doubled root with third and fifth on top — and recenter against `previousMidis` for voice leading.

### 11. `add9`, `sus2`, `6` color tones never used in pop/acoustic at moderate intensity — gated behind `intensity >= 0.6`
- **Where:** `chords-styles.ts:240-267`
- **What a comper hears:** A "Pop" or "Acoustic" major chord at intensity 0.5 is a plain `[0, 4, 7]` triad. Real pop comping defaults to *some* color (sus2, add9, 6/9) without needing high intensity — the genre's whole sound is in the color tones.
- **Suggested fix sketch:** Lower threshold for non-Rock/Jazz genres or route through `chord.quality === 'major'` → "add a 9 with 30% probability" instead of gating on intensity alone.

## P2 — Programmer's-math, missing variation, undocumented intent

### 12. Probability constants with no musical `// why:` comment
- **Where:**
  - `accompaniment.ts:489` — `Math.random() > 0.75` for Funk "Very optional 1"
  - `accompaniment.ts:1003` — `Math.random() < 0.7` for soloist-busy yield (load-bearing ensemble-texture gate)
  - `accompaniment.ts:1308` — `Math.random() < 0.4` for funk conversational displacement
  - `accompaniment.ts:1385` — `Math.random() < 0.4` for bass-hit yield (smart style)
  - `accompaniment.ts:1405` — `Math.random() < 0.4` for snare/kick conversational comping in jazz
  - `accompaniment.ts:1416` — `0.4 + bandIntensity * 0.3` for harmony interlocking suppression
  - `accompaniment.ts:1423` — `Math.random() < 0.8` for forced One-hit
  - `chords-engine.ts:325` — `Math.random() > 0.5 ? 'maj7' : '7'` — a major-vs-dominant function coin flip
- **Suggested fix sketch:** Add `// why:` lines naming the source, or route through a style-table constant with the rationale at the table entry.

### 13. `compingState.maxGrooveLength = 4 + Math.floor(Math.random() * 4)` resets sticky-groove length to uniform-random 4–8 bars
- **Where:** `accompaniment.ts:800`
- **What:** Phrase length 4 or 8 bars is *musical structure* (AABA, 12-bar, 8-bar verse). Picking 4/5/6/7/8 uniformly mixes well-formed and odd-length phrases together.
- **Suggested fix sketch:** Snap to musical phrase lengths: `[4, 8, 16]` with weights, or read the section length from `arranger`.

### 14. `accompanimentMidis` is published but never consumed (already in audit; re-flagging with adjacent context)
- **Where:** `coordination-engine.ts:90-92`
- **Adjacent context:** chords-side use case — soloist's "avoid chord-voice unison" is most painful in jazz where chords play guide tones in 60–84 (`accompaniment.ts:1631-1656`) exactly where the soloist priority window (60–90) lives. Could feed `soloist-pitch-engine.ts` as a `weight *= 0.6` unison-pitch-class avoidance.

### 15. `bassMidi`-floor reservation is enforced inconsistently across four lanes
- **Where:** `accompaniment.ts:1187-1191` (Neo-Soul: iterates `+12` until clear), `1337-1338` (Funk: `bassMidi + 13` floor inside cluster-selection), `1566` (altered-dominant resolver: `bassMidi + 13`), `1690-1699` (smart-standard: remaps individually).
- **What:** Same musical rule, four implementations. Drift risk: if one is fixed, others fall out of sync.
- **Suggested fix sketch:** Extract `enforceBassClearance(voicing, bassMidi, minMidi)` to `voicing-policy.ts` and call from all four lanes.

### 16. No comping engine reacts to soloist phrase-end — the comper's "answer" moment is wasted
- **Where:** `accompaniment.ts:807-818` — sets vibe to `'active'` on `soloistJustStopped`, but the only effect is denser `generateCompingPattern`. No velocity bump, no extension reach, no anticipated `&-of-4` stab into the next chord.
- **What:** A real comper hears the soloist breathing and *plays into* the gap with a voicing reach or rhythmic comment.
- **Suggested fix sketch:** Plumb `soloistPhraseEnd: boolean` through `CoordinationContext` (already proposed for harmonies, queued pickup #4) and fire a one-shot velocity-+0.15 + extension-reach stab on the step after.

### 17. Funk lane targets 2-voice cluster — misses the classic 3-note funk Clav voicing (3 + b7 + 9 or 3 + b7 + 13)
- **Where:** `accompaniment.ts:1336` `selectCompactCluster(voicing, ..., 2, ...)`
- **What:** Authentic clav funk comping (Stevie Wonder "Superstition," Stubblefield-era JB) is 3-note: 3rd + b7 + (9 or 13). Two-note guide tones alone is more *jazz shell* than funk Clav. The "lean voicing" critique test (`funk-piano-critique.test.ts:64`) asserts `notes.length <= 3` so a bump to 3 voices would still pass.
- **Suggested fix sketch:** Bump funk target to 3 voices via `selectSupportiveVoicing` (which already prefers guides → colors → roots/fifths).

## Notes for synthesis

1. **The engine is single-bar-stochastic, but real comping is multi-bar-deterministic.** Across funk, jazz, blues, rock, and country lanes the dominant smell is that *every bar's rhythmic shape* is decided by a fresh `Math.random()` call. STICKY_GENRES was a partial fix but explicitly excludes Jazz/Bossa/Blues — exactly the genres where motivic development matters most. **Biggest single musical improvement available:** "lock the comping cell per 4-bar phrase via `(sectionId, barIndex >> 2)` hash."

2. **Voice leading is missing.** `getBestInversion` is a register-centroid optimizer; it does not minimize voice-leading cost between successive chords. The machinery exists (`getNearestVoiceLeadingCost` at `accompaniment.ts:261`) but is only consumed by the altered-dominant resolver lane.

3. **The bassMidi floor rule has no test and four near-duplicate implementations.** Audit confirms drift across Neo-Soul, Funk, altered-dominant, and smart-standard lanes.

4. **Power-metal and country-strum lanes are genre-thin and untested** by `tests/standards/`.

5. **Genres with zero specific chord vocabulary:** Latin/montuno, Hip-hop pads vs. sample stabs, Disco (rhythm-only), Ska (upstroke is rhythm-only). Future product work, not bugs against current code.
