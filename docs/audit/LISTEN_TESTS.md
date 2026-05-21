# Listen-Test & Human-Decision Checklist

The single bucket for **everything in the audit backlog that needs human ears** — Claude/agents cannot perform these. Companion to [`FOLLOWUPS.md`](FOLLOWUPS.md) and [`epic-followup-drain.md`](epic-followup-drain.md) (Epic 12).

Three kinds of item:

- **Part A — Verification.** Shipped Epic 11 engine changes whose listen-test gate is still open. You're confirming the change sounds right; if it doesn't, file a regression.
- **Part B — Decisions.** A value or direction has to be picked by ear. Each recorded decision unblocks **Epic 12 / S5** (the per-genre tuning sweep) — fill in the `Decision:` line and S5's acceptance criteria become concrete.
- **Part C — Sessions.** Bigger design-by-ear work — needs a proposal + listening pass together. Each maps to an Epic 12 story (S6–S9).

**How to run:** `npm run dev` → http://localhost:5173. Pick the genre noted per item from the instrument rail, set the key/intensity as directed, and play. Check the box when done; for B/C, write your call on the `Decision:` line.

---

## Part A — Verification of shipped Epic 11 work

- [ ] **A1. SRDC Restatement motif echo** *(Epic 11 S4)*
  Genre: any soloist-forward style (Jazz recommended). Play through at least one full SRDC cycle (Statement → Restatement → Departure → Conclusion — roughly two choruses).
  **Listen for:** the Restatement phrase should feel like a *paraphrase of the Statement* — same rhythmic grid, same melodic contour direction, but with looser landings (it should not resolve harder than the Statement did). It should not sound like a literal repeat, nor like an unrelated new phrase.
  Result: ☐ sounds right ☐ regression — file in FOLLOWUPS

- [ ] **A2. Production voice-leading in Jazz/Bossa/Blues comping** *(Epic 11 S6a)*
  Genre: Jazz, then Bossa Nova, then Blues. Use a progression with stepwise-related chords (e.g. ii–V–I, Dm7–G7–Cmaj7).
  **Listen for:** comping voicings should move by common tone / guide tone — the chord changes should sound *connected and smooth*, voices sliding by small intervals, not the whole hand jumping register on every chord.
  Result: ☐ sounds right ☐ regression — file in FOLLOWUPS

- [ ] **A3. China splash on Metal section boundaries** *(Epic 11 S8b)*
  Genre: Metal (or Shred). Play across a section boundary so the post-turnaround accent fires.
  **Listen for:** the accent should be a trashy *China* cymbal, not a Crash. **Also note the China's loudness relative to the Crash** — this is the input to decision **B4** below.
  Result: ☐ sounds right ☐ regression — file in FOLLOWUPS

---

## Part B — Decisions (each unblocks Epic 12 / S5)

- [ ] **B1. Imperfect Symmetry intensity floor**
  Currently gated at `intensity ≥ 0.4` (`conductor.ts` / Epic 2 S2), which suppresses the gesture during quiet ballad-style Verse 2 — where subtle variation is arguably most musical.
  Genre: any; play a low-intensity (~0.25–0.35) verse-style passage and judge whether the cloned-measure variation is missed.
  **Options:** keep `0.4` · lower to `0.25` · keep `0.4` but add a gentler upward bias at low intensity.
  **Decision:** _______________________

- [ ] **B2. S8 energy-ramp inversion aggressiveness**
  `conductor.ts:229` ships `0.5 down / 1.5 up`; the up-ramp can leap +0.25 in a single measure. Audit S8 explicitly said "pick after a listen-test of both directions."
  Genre: any; listen across a section energy rise and a fall — does the up-ramp feel like a lurch?
  **Options:** keep `0.5 / 1.5` · gentler `0.75 / 1.25` · neutral `1.0 / 1.0`.
  **Decision:** _______________________

- [ ] **B3. S8 Ska-Punk genre intensity floor**
  Ska-Punk is high-energy by genre identity but has no `GENRE_INTENSITY_FLOORS` entry, so the backbeat upbeat-crack can drop out at low intensity.
  Genre: Ska-Punk; play a low-intensity passage and judge whether the upbeat crack should always be present.
  **Options:** add a floor ~`0.4` (analogous to Disco `0.45`) · pick a different floor value · leave it without a floor.
  **Decision:** _______________________

- [ ] **B4. China cymbal `volumeScale`**
  China runtime profile ships `volumeScale: 0.85` — picked as defensive headroom against a since-fixed triple-stack. A real China/Trash typically peaks *above* the Crash.
  Genre: Metal; A/B the China accent against a Crash at the same hit (see **A3**).
  **Options:** `0.90` · `0.95` · `1.0`.
  **Decision:** _______________________

- [ ] **B5. Funk motif-2 `+2` displacement frequency**
  `grooves/funk.ts:184` puts 25% of motif-2 phrases on a full `+2` displacement (both backbeats shifted for a sustained 2-bar phrase). Canonically `+2` is a 1-bar fill setup, not a sustained groove.
  Genre: Funk; play several 2-bar phrases and judge whether the sustained `+2` feel is too frequent.
  **Options:** keep `0/1/2` at `25%/35%/40%`-ish current split · re-weight to `50%/35%/15%` (normal-heavy) · restructure `+2` as a 1-bar gesture that returns to normal next bar.
  **Decision:** _______________________

- [ ] **B6. Final-bar HiHat suppression**
  Epic 2 S4 suppresses the HiHat on the final bar; in 8th-note-hat genres this can read as an abrupt drop-out.
  Genre: an 8th-note-hat genre (Disco, Funk, Rock); listen to the last bar before a loop/section end.
  **Options:** keep universal suppression · per-genre gate (suppress only where it sounds natural — list which genres).
  **Decision:** _______________________

---

## Part C — Design sessions (each maps to an Epic 12 story)

These need a proposal from Claude *and* a listening pass from you — book them as working sessions, not quick checks.

- [ ] **C1. Per-genre final-bar drum gestures** *(→ Epic 12 / S6)*
  Epic 2 S4 uses a universal snare-stinger for every genre's final bar. Jazz/Bossa might want a ride-bell + comping figure; other genres their own idiom. Also: Epic 2 S4 final-bar cadence voicing discards `previousVoicingMidis` (no voice-leading into the resolution).
  **Session goal:** decide per-genre final-bar treatments; confirm the cadence resolves with voice-leading by ear.

- [ ] **C2. Per-genre intro/outro mute tuning** *(→ Epic 12 / S7)*
  Epic 2 S5 ships genre-flat `INTRO_MUTES = { bass: 2, chords: 3, harmony: 4 }`. Different genres layer in differently (a jazz intro vs a metal intro).
  **Session goal:** decide per-genre intro/outro layering-in schedules.

- [ ] **C3. Bossa/samba label split** *(→ Epic 12 / S7)*
  `bass.md` P2 #16 — the current single label conflates two distinct feels (bossa is laid-back, samba is driving).
  **Session goal:** confirm by ear that the two need separate treatment, then split.

- [ ] **C4. Disco intensity-axis re-categorization** *(→ Epic 12 / S8)*
  `drums.md` P2 #18 — Disco's 4-motif system is mis-categorized on the intensity axis; it's load-bearing for `synth-drums` velocity scaling so it needs care.
  **Session goal:** audit Disco's motif/intensity mapping by ear and re-categorize it.

- [ ] **C5. Sparse-vibe cell collapse + active-vibe ornament collision** *(→ Epic 12 / S8)*
  Epic 3 S2 — at sparse vibe the comping cell can collapse to near-silence; at active vibe an ornament can collide with the cell's own hit.
  **Session goal:** play the chords/accompaniment vibe path at both extremes, decide the floor (sparse) and the collision rule (active).

- [ ] **C6. Ska-Punk shared-hook antiphony** *(→ Epic 12 / S9)*
  The `playShadowMode` Ska-Punk branch that echoes soloist hooks is dead — `sharedHookBuffer` is never populated. Making it work needs the soloist to emit a hook on phrases it wants harmony to echo.
  **Session goal:** decide whether Ska-Punk call-and-response antiphony is worth building, and if so what a "shareable hook" is.

---

## Logging a regression

If a Part A check fails, append a dated entry to the relevant `FOLLOWUPS.md` section (the engine area it regressed) with what you heard and the genre/setup that reproduces it — then it re-enters the normal `/cycle` flow.

**Last updated:** 2026-05-20 (created during the post-Epic-11 scoping pass).
