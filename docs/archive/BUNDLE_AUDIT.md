# Bundle Audit (Archived Snapshot)

Snapshot of the **2026-05-22 → 2026-05-23 bundle-audit cycle**. Chapter closed at 8/9 stories shipped (S2 not-applicable, S5 deferred speculative) — knip unused-export count went from 44 → 0 and main-app brotli from 123.9 KB → 115.85 KB (−8.05 KB), most of which came from the S3 lazy-load split.

Reusable rules from the cycle (budgets-as-baselines, statically-DCEd dead-code expectations, the pre-flight grep tripwire for "orphaned" musical content, knip blind spots, defense-in-depth hygiene) extracted to **`docs/guides/bundle-hygiene.md`** — that's the live reference for ongoing bundle work.

The per-story workflow lives in the **`/bundle-cycle`** skill (`.claude/skills/bundle-cycle/SKILL.md`) and the **`bundle-hygiene-reviewer`** subagent (`.claude/agents/bundle-hygiene-reviewer.md`); both remain active for one-off bundle work even though the audit chapter is closed.

## Cycle summary

- **Trigger:** 2026-05-22 audit — bundle budgets in `.size-limit.json` were silently broken (paths mismatched Vite's emitted filenames) and source LOC in `public/` had crept up post-musical-audit and mid-synth-audit. Goal: re-establish measurable budgets, remove provably dead code, set up CI-enforceable hygiene.
- **Stories shipped:** 8/9 (S0 instrumentation, S1 piano-mode unwind, S3 lazy-load split, S4 contourSkeletons drop, S6 Tier A export sweep, S7 state.ts barrel hygiene, S8 sub-component exports). S2 (orphaned percussion) marked Not Applicable on premise break; S5 (lazy-load synthesis) deferred speculative.
- **Reviewer discipline:** every story reviewed on the uncommitted diff by `bundle-hygiene-reviewer` before commit. The reviewer was created at the start of the cycle and used for the remainder.
- **Premise-break rate:** 2/9 stories (S2 N/A, S8 softening). Pattern matched musical-audit experience — audit docs name what to fix but not why the recipe will work; pre-flight grep catches the gap before code goes in.
- **KB delta (cumulative, Post-S0 → Post-S8 brotli):** main app −8.05 KB (−6.5%), worker −0.26 KB (noise), CSS unchanged. Almost the entire main-app delta came from S3's lazy-load split for `LibraryModal` + `VisualizerOverlay`.
- **Knip:** repaired in `7aacbedd` (config was stale and reported zero unused exports against a real list of 44). Final state: 0 unused exports.
- **Source-clarity wins:** S1, S4, S6, S7, S8 all produced ~0 KB brotli deltas — these were statically-provable dead code that Rollup was already DCE'ing. The win in those stories is source clarity and future-proofing, not bytes. The S0 baseline-doc explicitly framed this expectation, and every story called it out.

## Below this line: original audit doc, frozen at archive time.

---

Planning doc for the bundle-size + dead-code cleanup pass. Lives in the same family as `docs/audit/` (musical) and `docs/synth-audit/` (synth) — same flow (story → implement → review → done) but a different concern: **shipping bytes and code hygiene, not musical correctness.**

## Why this exists

After Phase-1→3 of the musical audit and Epics 0–5 of the synth audit, source LOC in `public/` has crept up (≈54k lines TS/TSX) while bundle budgets have not. `size-limit` is configured but silently broken for two of three chunks — see Infrastructure gaps below. This audit measures the real bundle, removes provably dead code, and re-establishes a CI-enforceable budget.

Definition of Done for any story here: **no behavior change** (musical, UI, or otherwise) AND a measurable KB-delta on the targeted chunk. Use `bundle-hygiene-reviewer` to police the first; use `npm run build:size` for the second.

## Baseline

### Pre-S0 snapshot (2026-05-22, commit `edbd4fff`)

| chunk                            | raw    | brotli (size-limit) | budget    |
| -------------------------------- | ------ | ------------------- | --------- |
| `index.<rev>.js` (main app)      | 465 KB | not measured        | 80 KB ❌  |
| `logic-worker.<rev>.js`          | 216 KB | 61 KB               | 65 KB ⚠️  |
| `index.<rev>.css`                | 100 KB | not measured        | 65 KB ❌  |
| `visualizer-worker.<rev>.js`     | 15 KB  | —                   | —         |
| 5 dynamic chunks (combined)      | ~65 KB | —                   | —         |

Main app + CSS budgets were not being enforced because `.size-limit.json` paths didn't match emitted filenames (`main.*` vs `index.*`).

### Post-S0 baseline (2026-05-22, after instrumentation)

| chunk                            | raw       | gzip     | brotli (size-limit) | budget   | status   |
| -------------------------------- | --------- | -------- | ------------------- | -------- | -------- |
| `index.<rev>.js` (main app)      | 475.82 KB | 148.24 KB | **123.9 KB**       | 80 KB    | ❌ +43.9 |
| `logic-worker.<rev>.js`          | 220.96 KB | —        | **60.95 KB**        | 65 KB    | ⚠️ 94%   |
| `index.<rev>.css`                | 102.14 KB | 17.62 KB | **15.13 KB**        | 65 KB    | ✅ 23%   |
| `visualizer-worker.<rev>.js`     | 14.38 KB  | —        | —                   | —        | —        |
| 6 dynamic chunks (combined)      | 67.59 KB  | 18.88 KB | —                   | —        | —        |

### Post-S1 baseline (2026-05-23, commit `1cd46551`)

This is the number every subsequent story's KB-delta is measured against. Note that between Post-S0 and Post-S1 several non-bundle-audit commits landed (soloist trumpet consolidation, mix tuning, PowerMetal preset, dep update), so the delta below is *not* purely S1.

| chunk                            | raw       | brotli (size-limit) | budget   | Δ vs Post-S0 brotli |
| -------------------------------- | --------- | ------------------- | -------- | ------------------- |
| `index.<rev>.js` (main app)      | 470.86 KB | **123.21 KB**       | 80 KB    | −0.69 KB            |
| `logic-worker.<rev>.js`          | 221.02 KB | **61.00 KB**        | 65 KB    | +0.05 KB (noise)    |
| `index.<rev>.css`                | 102.14 KB | **15.13 KB**        | 65 KB    | 0                    |
| `visualizer-worker.<rev>.js`     | 14.38 KB  | —                   | —        | 0                    |
| 6 dynamic chunks (combined)      | 67.61 KB  | —                   | —        | +0.02 KB (noise)    |

**The real story:** main app is the priority (44 KB brotli over budget), not the worker. CSS is well within budget. The worker still needs the 8 KB headroom target from S4 but it's not the urgent fix.

`dist/stats.html` is now emitted on every `npm run build` — open it to see per-module breakdown for S1–S4 targeting.

Source maps (~5 MB across `.map` files) ship to `dist/` — verify your deploy script strips them; if it does not, that is its own cleanup.

## Infrastructure gaps (do these first, mechanical)

1. **`.size-limit.json` is broken.** Points at `dist/main.*.js` and `dist/styles.*.css`. Vite emits `dist/index.*.js` and `dist/index.*.css`. Fix the paths so the main-app + CSS budgets actually run.
2. **No `"sideEffects": false` in `package.json`.** Rollup can't aggressively tree-shake your own modules without it. Add the field; if any `.ts` file uses a side-effect CSS import (`import './foo.css'`), use the array form to allowlist CSS.
3. **No build visualizer wired up.** Add `rollup-plugin-visualizer` as a devDep, emit `dist/stats.html` on build. One-shot tool, run on demand — no need to keep it in the default build path.

These three are S0 in the story sequence below.

## Known dead code (catalogued tonight)

### Piano-mode ghost (high confidence, mechanical to remove)

`public/engine/soloist-mode-policy.ts:28` — `isSoloistPianoMode` is hard-coded `return false`. Every call site is a dead branch. Call sites to unwind:

- `public/engine/synth-soloist.ts:84-85, 288, 532, 668, 834, 948, 1055, 1137-1140, 1264`
- `public/engine/soloist-devices.ts:84, 270`
- `public/engine/soloist-pitch-engine.ts:1441` (passes hard-coded `isPiano: false`)
- `public/types.ts:753` (stale JSDoc)
- `SOLOIST_MODE_ALIASES.piano` at `soloist-mode-policy.ts:3` — alias from `"piano"` → `"monophonic"`. Verify no UI/state still produces the string `"piano"` before deleting.
- `SOLOIST_MODE_ALIASES.polyphonic` at `soloist-mode-policy.ts:2` — same question, separate verification.

Expected: 100–200 lines removed, no behavior change.

### Orphaned Latin percussion content (medium confidence)

Auxiliary percussion lanes (shaker, conga, etc.) exist in `groove.ts` state with no UI trigger path. See memory entry `project_orphaned_latin_content`. State + any unreferenced grooves/* modules can be deleted. Worth a careful grep — these may have export-only references that look live but are never executed.

### Suspected — needs verification before any cut

- `accompaniment.ts:1925` — comment `// Using piano for "Clean Guitar" approx`. Old approximation; may be unreachable now.
- `accompaniment.ts:2454-2472` — piano/drummer interaction comments suggesting an older comping model; verify branches still fire.

## Story sequence (run in order, commit between each)

Each story has a single chunk-and-technique focus. Don't combine — KB-delta attribution is the whole point.

### S0 — Instrumentation

**Goal.** Make every subsequent KB number measurable and trustworthy.

**Actions.**
- Fix `.size-limit.json`: rename glob patterns from `main.*.js` → `index.*.js`, `styles.*.css` → `index.*.css`.
- Add `"sideEffects": false` to `package.json`. If the build breaks, switch to the array form with a CSS allowlist; do not skip.
- Add `rollup-plugin-visualizer` to devDeps. Wire it into `vite.config.ts` so `npm run build` emits `dist/stats.html`. Gate behind an env var if you'd rather opt in.
- Run `npm run build` + `npm run size`. Capture brotli numbers for *all three* chunks in this doc as the new baseline.

**Acceptance.** `size-limit` reports a number (not "can't find files") for main app, logic worker, and CSS. `dist/stats.html` exists after a build.

### S1 — Piano-mode unwind

**Goal.** Remove `isSoloistPianoMode` and every dead branch it gates.

**Actions.** See "Piano-mode ghost" above. Order:
1. Grep the entire repo (`public/`, `tests/`, `scripts/`, `docs/`, `.github/`) for `"piano"` as a soloist mode string. Confirm no live producer.
2. Delete `isSoloistPianoMode` from `soloist-mode-policy.ts`.
3. In every consumer, remove the `isPiano` parameter and collapse its branches (`if (isPiano)` blocks: delete; `&& !isPiano` conditions: simplify to the other side; `... || isPiano`: simplify).
4. Update the JSDoc on `types.ts:753`.
5. Decide on `SOLOIST_MODE_ALIASES.piano` and `.polyphonic` based on grep results.

**Acceptance.** `npm run typecheck`, `npm test`, `npm run test:e2e` all green. KB-delta reported for `index.*.js` and `logic-worker.*.js` brotli. `bundle-hygiene-reviewer` clean.

**Status:** Shipped 2026-05-22 (commit `253f1b6c`). Dropped `isSoloistPianoMode` from `soloist-mode-policy.ts` and unwound every consumer — `synth-soloist.ts` (5 dead-arg callsites at `applyPitchEnvelope`, vibrato early-return, `vibRuns` clause), `soloist-devices.ts` (countryBend simplification), `soloist-pitch-engine.ts` (dead `isPiano:false` arg), `types.ts` JSDoc, and two stale test fixtures. As predicted, statically-provable dead code was already DCE'd by the minifier — KB delta against Post-S0 is in noise (see Post-S1 baseline table). Source-clarity win.

### S2 — Orphaned percussion sweep

**Goal.** Remove state + engine code for percussion lanes that have no trigger path.

**Actions.**
1. Confirm via UI grep that shaker/conga/clave/etc. lanes have no user-reachable producer.
2. Remove their state fields, reducers, sync paths, engine modules, and presets.
3. Check `manual-metadata.ts` and `MANUAL.md` for stale references.

**Acceptance.** Same as S1, plus a visible drop in `logic-worker.*.js` brotli (these lanes ship to the worker).

**Status:** Not applicable, 2026-05-23. Premise break: the lanes are *not* orphaned. Verified runtime producers — `grooves/latin.ts` (active for Bossa Nova / Samba / Latin/Salsa / Afro-Cuban 6/8 via `groove-engine.ts:36-51`), `grooves/acoustic.ts`, `grooves/disco.ts`, and `fills.ts` (every drum fill pattern uses Toms; Conga also referenced at `fills.ts:282,289`). Critique tests (`bossa-drummer-critique`, `latin-drummer-critique`, `tom-vocabulary-critique`, `latin-groove-integrity`) exercise them, multiple presets in `drum-presets.ts` write them, and Bossa is exposed in the genre menu (`instrument-styles.ts:32`). The `project_orphaned_latin_content` memory note was about the *manual step-sequencer UI* (no button to toggle the Shaker lane by hand) — not the runtime. Removing them would be a P0 deletion of reachable musical code. **Lesson:** before any future "X is unused" story, grep for the canonical lane/symbol name across `public/engine/grooves/`, `public/engine/fills.ts`, and `tests/standards/` — those are the three non-obvious producers in this codebase.

### S3 — Main-bundle code-splitting (one feature)

**Goal.** Move one large, deferred-use feature out of the boot path via `import()`.

**Candidates** (pick the biggest per `stats.html`): `PresetLibrary`, `GenerateSongModal`, `Settings`, `song-generator`, MIDI export, `sharing`. All are post-first-paint features.

**Actions.**
1. From `stats.html`, identify the largest module that is *only* needed after a user interaction.
2. Convert its import site to `import()`, gated behind the interaction handler. Preserve any type-only imports as `import type`.
3. Add a tiny loading state if the user-perceived latency is > 100ms on the cold path.

**Acceptance.** App boot is unaffected (no flash, no missing controls); feature works on first invocation; a new chunk shows in `dist/` and the main bundle shrinks by at least 5 KB brotli.

**Status:** Shipped 2026-05-23. Converted `LibraryModal` and `VisualizerOverlay` to `lazy()` imports in `ChartSurface.tsx` with `<Suspense fallback={null}>` boundaries. `LibraryModal` uses a `libraryEverOpened` latch so the chunk only loads on first user click, while preserving its internal 180ms exit-animation lifecycle (which would have broken under a naive `{isOpen && ...}` gate). `VisualizerOverlay` keeps its existing `{isVizOpen && ...}` gate, now inside Suspense. Main-app brotli **123.21 → 116.16 KB (−7.05 KB)**, raw **470.86 → 439.34 KB (−31.5 KB)**; two new dynamic chunks in `dist/`. `bundle-hygiene-reviewer` clean (0 P0/P1/P2). All other modals (Settings/Editor/GenerateSong/Share/Manual) were already lazy in `Modals.tsx`.

### Post-S3 baseline (2026-05-23)

| chunk                            | raw       | brotli (size-limit) | budget   | Δ vs Post-S1 brotli |
| -------------------------------- | --------- | ------------------- | -------- | ------------------- |
| `index.<rev>.js` (main app)      | 439.34 KB | **116.16 KB**       | 80 KB    | **−7.05 KB**        |
| `logic-worker.<rev>.js`          | 221.02 KB | **60.99 KB**        | 65 KB    | −0.01 KB (noise)    |
| `index.<rev>.css`                | 102.14 KB | **15.13 KB**        | 65 KB    | 0                    |
| `visualizer-worker.<rev>.js`     | 14.38 KB  | —                   | —        | 0                    |
| 8 dynamic chunks (combined)      | 99.91 KB  | —                   | —        | +32.3 KB raw (the split)         |

Main app is now **36.16 KB brotli over budget** (was 43.21). Worker headroom unchanged — S4 still needed.

### S4 — Logic-worker headroom (8 KB target)

**Goal.** Pull the worker from 61/65 KB brotli down to ≤57 KB.

**Actions.** Per `stats.html`, the worker's biggest modules are likely `soloist-seeder.ts` (2147 LoC), `soloist.ts` (1778), `soloist-pitch-engine.ts` (1775), `accompaniment.ts` (2940), `bass-engine.ts` (1265). For each, look for:
- Unused exports (knip-style sweep, run by hand since `npx knip` returned nothing earlier — config may be too strict).
- Redundant lookup tables that can be derived.
- Inline single-use helpers (only if it actually shrinks the chunk — sometimes inlining grows it).
- Dead branches that survived earlier audits (e.g. unreachable `if` conditions, defensive checks for impossible states).

**Acceptance.** Critique tests + e2e pass. `logic-worker.*.js` brotli ≤57 KB. `bundle-hygiene-reviewer` clean.

**Status:** Shipped 2026-05-23. Removed the `contourSkeletons` field from `StyleConfig` and dropped its `ContourSkeletonStep` interface — the field was defined and populated for the default style plus 16 style overrides (17 nested-array blocks, ~732 source lines) but never read anywhere in `public/` or `tests/`. Grep-confirmed: no consumer in `soloist-pitch-engine.ts`, `soloist-rhythm-engine.ts`, `soloist.ts`, `soloist-devices.ts`, `coordination-engine.ts`, or any test. The unrelated `phraseContext.skeleton` (a live `SkeletonNode[]` on the phrase pipeline) is a separate concept. Worker brotli **60.99 → 60.74 KB (−0.25 KB)**, main app **116.16 → 115.70 KB (−0.46 KB)** — `soloist-config.ts` is imported on both sides via `soloist-pitch-engine.ts` so the win splits across chunks. The ≤57 KB worker target was not met; the user noted in-flight that the specific number was arbitrary and "shrink without behavior change" is the operative DoD. Source-clarity win: nested-numeric data compresses to ~1 byte/source-line under brotli, so 732 lines → ~0.7 KB combined is expected, not a red flag. The bigger worker-shrink targets (preact/signals dependency ~14 KB, sharing the same `soloist-config` style entries between threads) are structural and not in S4 scope. `bundle-hygiene-reviewer` clean (0 P0/P1/P2). 1975/1975 vitest green; typecheck clean.

### Post-S4 baseline (2026-05-23)

| chunk                            | raw       | brotli (size-limit) | budget   | Δ vs Post-S3 brotli |
| -------------------------------- | --------- | ------------------- | -------- | ------------------- |
| `index.<rev>.js` (main app)      | 434.55 KB | **115.70 KB**       | 80 KB    | −0.46 KB            |
| `logic-worker.<rev>.js`          | 216.23 KB | **60.74 KB**        | 65 KB    | −0.25 KB            |
| `index.<rev>.css`                | 102.14 KB | **15.13 KB**        | 65 KB    | 0                    |
| `visualizer-worker.<rev>.js`     | 14.38 KB  | —                   | —        | 0                    |

Main app still **35.70 KB brotli over budget** (was 36.16). Worker headroom **4.26 KB** (was 4.01).

### S5 (speculative) — Lazy-load synthesis on first `togglePlay()`

**Goal.** Defer `synth-*.ts` modules out of the boot path; they're only needed once playback starts.

**Risk.** Higher than S1–S4: synth voices are constructed on demand but the modules are imported eagerly because `engine.ts` `initAudio()` wires the graph at boot. A naive `import()` split will break sync with the audio graph; this needs design before implementation.

**Status.** Deferred 2026-05-23. Risk-vs-reward not favorable today; revisit if/when something forces the issue.

### S6 — Knip Tier A sweep (mechanical dead-export removal)

**Goal.** Delete unused exported leaf symbols whose function/constant bodies have no remaining caller anywhere — both the export and the implementation come out.

**Context.** Commit `7aacbedd` repaired the knip configuration; `npm run knip` now reports 44 unused exports (was 0 under the stale config). Tier A is the ~20 entries that are isolated, named, and not part of a known dispatch convention. Tier B is the `state.ts` barrel re-exports (S7). Tier C is two orphaned components (S8).

**Actions.**
1. Run `npm run knip` and capture the current report as the baseline list.
2. For each Tier A symbol, grep the entire repo (`public/`, `tests/`, `scripts/`, `docs/`, `.github/`) for both the symbol name AND any string literal that names it (some are dispatched by name).
3. For each symbol confirmed dead: remove the export, remove the implementation, remove any now-orphaned helpers/types it referenced. Lookup-table constants (`GENRE_STYLE_MAPPING`, `SOLOIST_REGISTER_PROFILES`) need particular care — if the *table* is dead, anything it was the sole consumer of can come out next pass.
4. Special case: `drop-mechanic.ts` has 4 unused exports out of a small surface — re-read the file to see if the whole module is dead, not just the exports.
5. Verify: `npm run typecheck`, `npx vitest run --reporter=dot`, `npm run build:size`.
6. `bundle-hygiene-reviewer` on the diff.

**Tier A list (from `npm run knip` after commit `7aacbedd`):**

| file:line | symbol | notes |
| --- | --- | --- |
| `public/arranger-controller.ts:8` | `transformRelativeProgression`, `validateProgression` | dead barrel re-export; originals live in `chords-engine.ts` and are used directly elsewhere |
| `public/engine/engine.ts:28,35` | `INSTRUMENT_PRESETS`, `playChordScratch` | tagged `Engine` — old namespace export remnants |
| `public/engine/midi-utils.ts:9` | `writeVarInt` | |
| `public/engine/midi-worker-logic.ts:23,24` | `MIDI_EXTENSION_PATTERN`, `PPQ` | |
| `public/engine/chords-engine.ts:571` | `getRootlessVoicing` | |
| `public/engine/accompaniment.ts:101` | `ALTERED_DOMINANT_QUALITIES` | sibling to `ALTERED_HOOK_QUALITIES`; the hook one survived, this one didn't |
| `public/engine/drop-mechanic.ts:63,81,87,100` | `DROP_ENERGY_DELTA_THRESHOLD`, `DROP_INFERRED_MIN_FORM_PROGRESS`, `isDropFriendlyGenre`, `isDropSectionLabel` | 4 of the file's exports — check whole-file viability |
| `public/engine/soloist-config.ts:541,644` | `GENRE_STYLE_MAPPING`, `SOLOIST_REGISTER_PROFILES` | big lookup tables — biggest single KB potential in this tier |
| `public/engine/soloist-devices.ts:54` | `getChordMask` | |
| `public/engine/voicing-policy.ts:23,38` | `TENSION_CHORD_QUALITIES`, `isBassSpaceFeel` | |
| `public/engine/worker-utils.ts:20,39,40` | `WORKER_MANAGED_KEYS`, `lastChordIndex`, `lastSectionIndex` | |
| `public/form-analysis.ts:61` | `JAM_CYCLE_DEFAULT` | |
| `public/lead-sheet-model.ts:1` | `LEAD_SHEET_MEASURES_PER_ROW` | |
| `public/utils.ts:22` | `hashString` | check carefully — name suggests something dispatch tables might string-reference |
| `public/visualizer-events.ts:168,275,288` | `queueVisualizerEvent`, `createVisualizerStepEvent`, `createVisualizerFillEvent` | three of the file's exports — check what's actually live on the visualizer message channel |

**Acceptance.** Knip's unused-export count drops by the number of Tier A items actually removed. `npm run typecheck`, `npm test`, `npm run test:e2e` all green. Reviewer clean. KB-delta reported per chunk (expectation: small but non-zero — these are leaf functions and constants that no longer reach the bundle once unexported).

**Status:** Shipped 2026-05-23. Removed `export` from every Tier A symbol — all 16 lines from the table plus one cascade (`INSTRUMENT_PRESETS` in `synth-chords.ts` became fully internal once `engine.ts` dropped its re-export). 27 dropped `export` keywords across 16 files. No symbol body deleted: every Tier A entry is still *used* intra-file, so this is a pure export-surface contraction. Knip **44 → 17** (delta = Tier A count); the 17 remaining are S7 barrel re-exports (15) + S8 orphan components (2). Main app brotli **115.70 → 115.89 KB (+0.19, noise)**, worker **60.74 → 60.62 KB (−0.12, noise)** — Rollup was already inlining the internal usages, so the win is source clarity, not bytes. Reviewer flagged 1 P1 (AI_MAP advertised `isDropFriendlyGenre` as a public symbol on `drop-mechanic.ts`; trimmed to `shouldFireDropMute` only). 1975/1975 vitest green; typecheck clean.

### Post-S6 baseline (2026-05-23)

| chunk                            | raw       | brotli (size-limit) | budget   | Δ vs Post-S4 brotli |
| -------------------------------- | --------- | ------------------- | -------- | ------------------- |
| `index.<rev>.js` (main app)      | —         | **115.89 KB**       | 80 KB    | +0.19 KB (noise)    |
| `logic-worker.<rev>.js`          | —         | **60.62 KB**        | 65 KB    | −0.12 KB (noise)    |
| `index.<rev>.css`                | —         | **15.13 KB**        | 65 KB    | 0                    |
| `visualizer-worker.<rev>.js`     | 14.38 KB  | —                   | —        | 0                    |

### S7 — State barrel re-export hygiene

**Goal.** Drop the 13 unused re-exports from `public/state.ts` (slice values + reducers re-exported for an external consumer that never materialized).

**Actions.**
1. Confirm each of these is actually unused outside `state.ts` (knip reports them but the symbols are also *called* inside `state.ts` via the local binding, so deletion is delete-the-export-keyword, not delete-the-symbol):
   - Slice values: `bass`, `chords`, `conductor`, `groove`, `harmony`, `midi`, `soloist`, `vizState`
   - Reducers: `arrangerReducer`, `conductorReducer`, `grooveReducer`, `instrumentReducer`, `midiReducer`, `playbackReducer`, `vizReducer`
2. Remove the export block.
3. Verify nothing imports from `state.ts` that just broke.

**Acceptance.** ~15 lines smaller. No KB delta (these were internal to a single chunk on each side of the worker boundary, so the minifier was already handling them — this is pure source clarity). Reviewer clean.

**Status:** Shipped 2026-05-23. Collapsed the 17-symbol `export {…}` block in `public/state.ts` to the two survivors (`arranger`, `playback`); knip's 15 flagged re-exports came out. Premise gap caught during the cycle: five tests consumed the dead re-exports through `vi.mock('public/state.js', async (importOriginal) => { ...actual.<X> })` — knip can't see dynamic-mock consumption, so it had labelled them dead while they were really live test-only consumers. Redirected each `actual.<slice|reducer>` reference to a direct import of the canonical slice module inside the mock factory (`tests/unit/engine/{jazz-blues-intensity,conductor,time-signature-transitions,smart-genre}.test.ts` + `tests/unit/utils/persistence.test.ts`); ESM single-instance-per-resolved-path guarantees the test mocks still see the same deepSignal singletons as production. Main app brotli **115.89 → 115.97 KB (+0.08, noise)**, worker **60.62 → 60.64 KB (+0.02, noise)** — source-clarity win, as the story predicted. Knip unused-export count **17 → 2** (only S8 orphans remain). `bundle-hygiene-reviewer` clean (0 P0/P1/P2). 1975/1975 vitest green; typecheck clean.

### Post-S7 baseline (2026-05-23)

| chunk                            | raw       | brotli (size-limit) | budget   | Δ vs Post-S6 brotli |
| -------------------------------- | --------- | ------------------- | -------- | ------------------- |
| `index.<rev>.js` (main app)      | —         | **115.97 KB**       | 80 KB    | +0.08 KB (noise)    |
| `logic-worker.<rev>.js`          | —         | **60.64 KB**        | 65 KB    | +0.02 KB (noise)    |
| `index.<rev>.css`                | —         | **15.13 KB**        | 65 KB    | 0                    |
| `visualizer-worker.<rev>.js`     | 14.38 KB  | —                   | —        | 0                    |

### S8 — Orphaned components: decide WIP vs delete

**Goal.** Resolve the two component-level dead exports knip flagged.

**Candidates.**
- `public/components/InstrumentSettings.tsx:75` — `InstrumentMixerSettings`
- `public/components/SoloistControls.tsx:36` — `SoloistSeedControl`

**Actions.**
1. Open each file; read the surrounding component to understand what it was intended for.
2. Check git blame / log for the introducing commit to see if it was WIP that got left, or finished work that got disconnected.
3. Cross-check `docs/VISION.md` "Open work" for any planned feature that would consume them.
4. Decide per component: **delete** (no consumer in sight, no roadmap home) or **wire up** (clearly intended for a feature still in flight; file a followup with the wiring requirement).
5. If delete: remove the function and any now-orphaned helpers/styles unique to it.

**Acceptance.** Knip unused-export count drops by however many were deleted. Reviewer clean. KB-delta proportional to what was actually removed (component bodies are usually a few KB each).

**Status:** Shipped 2026-05-23. Premise softening: both knip-flagged symbols are *not* orphans — they're internal sub-components rendered by the externally-exported wrappers in their own files (`InstrumentMixerSettings` at `InstrumentSettings.tsx:75` is rendered by `InstrumentSettings` at line 331; `SoloistSeedControl` at `SoloistControls.tsx:36` is rendered by `SoloistControls` at line 31). Grep across `public/`, `tests/`, `scripts/`, `.github/` confirmed no external importer for either symbol. Fix was the same shape as S6/S7: drop the `export` keyword. Knip unused-export count **2 → 0** — audit-wide knip target now hit. Main app brotli **115.97 → 115.85 KB (−0.12, noise)**, worker **60.64 → 60.69 KB (+0.05, noise)** — Rollup was already DCE-treating these as internal, so this is a pure source-clarity win, as predicted. `bundle-hygiene-reviewer` clean (0 P0/P1/P2). 1975/1975 vitest green; typecheck clean. **Adjacent observation (out of scope, parking lot):** the `InstrumentSettings` wrapper itself is only consumed by `tests/unit/components/InstrumentSettings.test.tsx` — production renders `<InstrumentSpecificSettings />` + `<InstrumentMixerStrip />` directly via `InstrumentRail.tsx`. Test-only-production-dead is a separate cleanup question.

### Post-S8 baseline (2026-05-23)

| chunk                            | raw       | brotli (size-limit) | budget   | Δ vs Post-S7 brotli |
| -------------------------------- | --------- | ------------------- | -------- | ------------------- |
| `index.<rev>.js` (main app)      | —         | **115.85 KB**       | 80 KB    | −0.12 KB (noise)    |
| `logic-worker.<rev>.js`          | —         | **60.69 KB**        | 65 KB    | +0.05 KB (noise)    |
| `index.<rev>.css`                | —         | **15.13 KB**        | 65 KB    | 0                    |
| `visualizer-worker.<rev>.js`     | 14.38 KB  | —                   | —        | 0                    |

## Followups / parking lot

### Test-only-production-dead (from S8)

`public/components/InstrumentSettings.tsx` exports `InstrumentSettings` (the grid-2-col wrapper); the only consumer is `tests/unit/components/InstrumentSettings.test.tsx`. Production renders the wrapper's two children directly via `InstrumentRail.tsx`. Either rewrite the test to exercise the children (and delete the wrapper) or accept the wrapper as a tested-but-not-shipped utility. Not bundle-audit scope — knip can't see it (test files keep it live), and the wrapper isn't on a hot path.


### Bundle-shape candidates from the 2026-05-23 main-thread import trace

These came out of tracing why ~80 KB of main-bundle raw is worker-only engine code. They are tracked here for future stories, not yet promoted:

- **Inline `ALTERED_HOOK_QUALITIES`** into `soloist-pitch-engine.ts` (or move to a shared `harmonic-constants.ts`). One 4-element `Set` is the only thing pulling all 45.7 KB of `accompaniment.ts` into `soloist-pitch-engine`'s consumer tree. ~1 KB brotli alone; enabler for the bigger soloist cuts.
- **Split `generateSessionSeed` out of `soloist-seeder.ts`** into a tiny module. `public/state-effects.ts:10` is the only main-thread caller; the rest of the 46 KB file is worker-internal. Est. 7–9 KB brotli off main.
- **Extract a `getDrumNotesForStep()` standalone helper.** Today `scheduleDrums` calls `generateNotesForStep({includeDrums: true, ...false})`; the runtime gate works but the bundle still pulls every instrument's engine in. Est. 5–8 KB brotli after the previous two land.
- **Delegate the soloist pickup note to the worker.** `scheduler-core.ts:463` calls `getSoloistNote` once at playback start; that one call drags `soloist.ts` + `soloist-pitch-engine.ts` + `soloist-rhythm-engine.ts` (~92 KB raw / ~18 KB brotli) into main. Biggest potential single cut but the pickup note is audible — design before code. Speculative, sits alongside S5.

### Long-term / non-bundle

- Deploy pipeline source-map stripping (verify it's already happening).
- `accompaniment.ts` (2940 LoC) and `synth-drums.ts` (2583 LoC) structural splits — pure refactor, no bundle delta, but improves long-term maintainability. Separate track, not bundle audit.
- `types.ts` (1442 LoC) — split into per-domain type files. Mostly readability, small bundle benefit.

## How to use this doc

- Each story is one commit. Run `bundle-hygiene-reviewer` before each commit.
- Goal is **lean and efficient, smaller is better when behavior is unchanged** — not chasing the `.size-limit.json` budgets (those are arbitrary historical baselines, useful only as a regression tripwire).
- During the work: update the "Post-S<N> baseline" table with real brotli numbers after each story; cite the KB-delta in the commit message.
- **When all stories ship:** archive this doc under `docs/archive/BUNDLE_AUDIT.md` (mirror the musical-audit archive pattern), and lift the most reusable rules into a `docs/guides/bundle-hygiene.md` if any are general enough.

## Recurring hygiene (after this audit ships)

Bundle drift is best caught by a gate, not a habit. Three layers, defense in depth:

1. **`size-limit` in `validate` script.** Fail `npm run validate` when any chunk exceeds budget. The single most valuable line in this whole plan.
2. **`bundle-hygiene-reviewer` subagent** (`.claude/agents/bundle-hygiene-reviewer.md`). Invoke after any large feature merge or on demand; it knows the playbook (measure first, behavioral equivalence, attack biggest module, forbidden moves).
3. **Optional periodic `/loop` or `schedule`.** Weekly build + delta report. Only valuable if (1) isn't catching things; revisit after a quarter of (1).
