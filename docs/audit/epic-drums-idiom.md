# Epic 7: Drum Sound Design & Genre Idiom

## Why this epic exists

Three clusters in the drums audit:

1. **Sound-design wiring gaps**: groove engines write `soundName` strings that don't exist in `synth-drums.ts`. Crash accents never play a Crash (they route to "Open"); Disco "Octave Cowbells" hit a missing voice; Jazz has no Brush voice. The Crash misroute affects EVERY genre that wants a section-transition splash.

2. **Entropy phase corrupts quiet sections**: `groove-engine.ts:233-272`'s random sprinkle runs at the same probability regardless of genre intent. Reggae One Drop holes get filled by phantom snares; Jazz intentional ride emptiness is contaminated; the `firstIterationSuppression` flag flips backwards when `totalSteps` is unset.

3. **Fill vocabulary is one-dimensional**: 9 of 15 genres never play a tom. Metal blast beat is co-articulation rather than alternation. Hip-hop "trap rolls" don't actually roll. Section boundaries outside Rock/Blues/Disco/Ska-Punk get no crash.

Plus a sprinkling of genre-specific motif fixes (Country train beat continuity, Latin Snare body, Ska-Punk D-beat pattern, Acoustic motif 0 is mislabeled).

## Source findings

- `drums.md` P0 #1, #2, #3, #4
- `drums.md` P1 #5, #6, #7, #8, #9, #10, #11, #12, #13, #14
- `drums.md` P2 #16, #17, #18 (S15 from epic 3 covers `humanizeVelocity`)

## Stories

### S1. Crash routing: wire accent-catch + section-boundary to the real Crash voice
`groove-engine.ts:202-210` and `:146-160` write `soundName = 'Open'` where they mean Crash. `synth-drums.ts:285/937` has a real Crash voice that's never reached. Route `crash-catch` and post-turnaround downbeat to a Crash instrument lane. Tie into `drum-seeder.ts:265-274`'s "Crash Contract" so `pendingCrash` actually emits a Crash event on the next downbeat after a fill.

**Acceptance:** section transitions in Funk/Jazz/Country/Acoustic/Hip-Hop/Neo-Soul/Reggae produce an audible Crash splash. New critique test asserts crash-event count rises with section transitions.
**Effort:** ~4h. **Model:** sonnet (route soundName + pendingCrash consumer). **Reviewer:** music-theory-reviewer. **Source:** `drums.md` P0 #1, P1 #14.
**Status:** Shipped 2026-05-17 — `groove-engine.ts` turnaround block moved post-strategy (genre `applyOverrides` was wiping the route); both turnaround + crash-catch accent blocks now emit `soundName = 'Crash'` scoped to the Open lane only (the `blues.ts:59` single-lane pattern — previous review caught that firing on HiHat+Open lanes produced two stacked Crash drumHits per boundary, with the second voice's `lastCrashGain` ramp-down choking the first). New critique test `tests/standards/crash-routing-critique.test.ts` (per-genre boundary, crash-catch accent, mid-section steady-state, 5/5 reliability runs at 36/36).

### S2. Add Cowbell + Brush voices (or fall back) and audit `soundName` mismatches
Disco motif 3 writes `'CowbellHigh'` / `'CowbellLow'` — no handler. Jazz at low intensity wants brushes — no Brush voice exists. Either add the voices to `synth-drums.ts` (Cowbell: resonant ~800 Hz + bandpass click; Brush: long noise sweep with bandpass automation), or fall back to nearest-timbre (`AgogoHigh`/`AgogoLow` for cowbell as a stopgap). Also add a `KNOWN_SOUND_NAMES` runtime check that warns when a groove writes an unknown name.

**Acceptance:** Disco Octave Percussion is audible. Jazz ballad has brush texture below intensity 0.35. Future `soundName` typos surface as console warnings.
**Effort:** ~6h. **Model:** opus (sound design — see `feedback-synth-audio-graph` for cymbal/noise voice gotchas). **Reviewer:** music-theory-reviewer. **Source:** `drums.md` P0 #3, P1 #7.

### S3. Entropy phase respects genre intent
`groove-engine.ts:233-272` runs at the same probability across genres. Add a `config.suppressEntropyBelow` field (Reggae 0.5, Jazz 0.45, Acoustic 0.5; Bossa already exempt via `isLatin`). Apply `instTimeOffset` lay-back only to Kick/Snare in reggae, not HiHat/Open. Fix `firstIterationSuppression` flip when `totalSteps` is unset (fall back to `groove.seedTimelineStartStep`).

**Acceptance:** Reggae One Drop has clean beat-1 silence at intensity 0.5. Jazz at intensity 0.3 has audible "space" rather than 4% random snare hits. Add to existing reggae/jazz drummer critique tests.
**Effort:** ~4h. **Model:** opus (per-genre floor values need musical taste + listening check). **Reviewer:** music-theory-reviewer. **Source:** `drums.md` P0 #2, P1 #10, P2 #16.

### S4. Tom vocabulary across 9 genres
`fills.ts FILL_TEMPLATES` has toms only in Rock + Bossa. Add genre-appropriate tom templates for Funk, Country, Blues, Neo-Soul, Hip-Hop, Disco (and Acoustic where appropriate). Add a Toms lane to those grooves' fill-firing paths.

**Acceptance:** fills across the listed genres include tom hits. Audible: section transitions feel like real drum fills, not snare rolls. New cross-genre fill-content test.
**Effort:** ~5h. **Model:** opus (per-genre tom vocabulary is a musical design call). **Reviewer:** music-theory-reviewer. **Source:** `drums.md` P1 #5.

### S5. Metal blast beat alternation + China
`grooves/metal.ts:62-156` Motif 4 stacks snare-on-8ths against kick-on-8ths (co-articulation). Real blast beats ALTERNATE: snare on `isBeatStart`, kick on `isOffbeat`. Add a `China` cymbal lane for genre tell. Critique test asserts alternation pattern, not unison.

**Acceptance:** Metal motif 4 produces the buzzing blast-beat texture. China cymbal audible at section accents.
**Effort:** ~3h. **Model:** opus (musical correctness of the blast-beat alternation pattern). **Reviewer:** music-theory-reviewer. **Source:** `drums.md` P1 #6.

### S6. Hip-hop trap hat rolls + funk displaced backbeat
Two related fixes:
- `grooves/hiphop.ts:106-180` motif 2 (labeled "Trap Skitter") fires 16ths but never produces the genre-defining 32nd/triplet roll. When `activeMotif >= 2 && phraseSeed > 0.7`, schedule a 4-6 hit burst at triplet subdivision on one beat per bar.
- `grooves/funk.ts:168-181` motif 2 uses 50/50 coin flips for "displaced backbeat" — that's scatter, not displacement. Use `phraseSeed` to pick a displacement amount once per phrase (snare lands at `[5, 13]` for an entire phrase, returns next phrase).

**Acceptance:** hip-hop trap rolls audible; funk displacement is structural, not stochastic. Add per-motif tests to each file.
**Effort:** ~4h. **Model:** opus (trap-roll burst design + funk displacement structure both need musical judgment). **Reviewer:** music-theory-reviewer. **Source:** `drums.md` P1 #8, #9.

### S7. Country train-beat continuity + Latin snare body + Ska-Punk D-beat + Acoustic motif rename
Four small genre-idiom corrections, bundled because they're each ~30-60min and same-shape:
- Country (`grooves/country.ts:72-82`): drop per-step `roll(ghostProb)` for motif 2; fire 16ths deterministically.
- Latin (`grooves/latin.ts:79-140`): at `activeMotif >= 2 && intensity > 0.8`, route on-beat-2/4 to `'Snare'` keeping clave on Sidestick.
- Ska-Punk (`grooves/ska-punk.ts:103-113`): D-beat motif 3 → kick on 1, "and of 1", 3, "and of 3" + snare on 2,4 + open hat on "and of 4".
- Acoustic motif 0 (`grooves/acoustic.ts:52-66`): either rename to "Half-time" or move snare to beats 2+4 (light Sidestick).

**Acceptance:** each genre's named motif matches its label. Per-genre critique tests assert the corrected patterns.
**Effort:** ~4h. **Model:** sonnet (four mechanical motif corrections following the audit's per-genre prescriptions). **Reviewer:** music-theory-reviewer. **Source:** `drums.md` P1 #11, P0 #4, P1 #13, P1 #12.
**Status:** Shipped 2026-05-17 — Country motif 2 fires deterministic 16th train (drop stochastic ghost-prob); motif 1 keeps the full e+a lattice at lower ghost velocity (0.09 vs 0.15 scale) — reviewer caught that briefly thinning motif 1 to E-only lost the "a" hits that define the train pocket. Latin Samba (motif 2) + Partido Alto (motif 3) now route on-beat-2/4 to `'Snare'` at `intensity > 0.8`; clave slots stay on Sidestick. Ska-Punk D-beat motif 3 rewritten as kick on 1, &1, 3, &3 + open hat on &4; in-strategy "Crash on the One" at line 95 corrected to actually route `'Crash'` (was previously `'Open'` despite the comment). Acoustic motif 0 renamed "Half-time" with clarifying comments — engine output unchanged from prior behavior (beat-3 snare was always the pattern, the label was wrong). Four drummer-critique tests updated + new acoustic half-time motif-0 assertion (5/5 reliability runs). Two cspell-hook editing interruptions on Sonnet sub-agents required orchestrator continuation + threshold cleanup. Reviewer flagged Metal section-downbeat `'Open'` (intentional China voicing) is now overridden by post-strategy Crash routing — accepted as wash this pass.

## Deferred

- Motif "rotation" is fictional in practice (`drums.md` P2 #17) — Epic 2, S1 (loop-aware motif cap) addresses half of this; the binaryTier widening is a follow-on.
- Disco intensity-axis miscategorization (`drums.md` P2 #18) — currently the 4-motif system is mostly load-bearing for `synth-drums` velocity scaling. Touch when Disco needs another audit pass.
- `humanizeVelocity` seeded (`drums.md` P2 #15) → Epic 3, S5.
