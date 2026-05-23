# Bundle Audit

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

### S4 — Logic-worker headroom (8 KB target)

**Goal.** Pull the worker from 61/65 KB brotli down to ≤57 KB.

**Actions.** Per `stats.html`, the worker's biggest modules are likely `soloist-seeder.ts` (2147 LoC), `soloist.ts` (1778), `soloist-pitch-engine.ts` (1775), `accompaniment.ts` (2940), `bass-engine.ts` (1265). For each, look for:
- Unused exports (knip-style sweep, run by hand since `npx knip` returned nothing earlier — config may be too strict).
- Redundant lookup tables that can be derived.
- Inline single-use helpers (only if it actually shrinks the chunk — sometimes inlining grows it).
- Dead branches that survived earlier audits (e.g. unreachable `if` conditions, defensive checks for impossible states).

**Acceptance.** Critique tests + e2e pass. `logic-worker.*.js` brotli ≤57 KB. `bundle-hygiene-reviewer` clean.

### S5 (speculative) — Lazy-load synthesis on first `togglePlay()`

**Goal.** Defer `synth-*.ts` modules out of the boot path; they're only needed once playback starts.

**Risk.** Higher than S1–S4: synth voices are constructed on demand but the modules are imported eagerly because `engine.ts` `initAudio()` wires the graph at boot. A naive `import()` split will break sync with the audio graph; this needs design before implementation.

**Status.** Plan-first. Don't implement until after S0–S4 land and the design is reviewed.

## Followups / parking lot

- Deploy pipeline source-map stripping (verify it's already happening).
- `accompaniment.ts` (2940 LoC) and `synth-drums.ts` (2583 LoC) structural splits — pure refactor, no bundle delta, but improves long-term maintainability. Separate track, not bundle audit.
- `types.ts` (1442 LoC) — split into per-domain type files. Mostly readability, small bundle benefit.
- `knip` returned nothing under default config; likely too permissive — investigate config and rerun.

## How to use this doc

- **Tomorrow morning:** start at S0. Each story is one commit. Run `bundle-hygiene-reviewer` before each commit.
- **During the work:** update the baseline table after S0 with real brotli numbers; update KB-delta in each story's commit message.
- **When all stories ship:** archive this doc under `docs/archive/BUNDLE_AUDIT.md` (mirror the musical-audit archive pattern), and lift the most reusable rules into a `docs/guides/bundle-hygiene.md` if any are general enough.

## Recurring hygiene (after this audit ships)

Bundle drift is best caught by a gate, not a habit. Three layers, defense in depth:

1. **`size-limit` in `validate` script.** Fail `npm run validate` when any chunk exceeds budget. The single most valuable line in this whole plan.
2. **`bundle-hygiene-reviewer` subagent** (`.claude/agents/bundle-hygiene-reviewer.md`). Invoke after any large feature merge or on demand; it knows the playbook (measure first, behavioral equivalence, attack biggest module, forbidden moves).
3. **Optional periodic `/loop` or `schedule`.** Weekly build + delta report. Only valuable if (1) isn't catching things; revisit after a quarter of (1).
