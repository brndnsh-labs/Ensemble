# Bundle Hygiene

Reusable recipes for keeping the Ensemble bundle lean without breaking behavior. Captured from the May 2026 bundle-audit cycle — these are the rules that proved durable across the 8 shipped stories.

If you're picking up bundle work (audit, ad-hoc shrink, suspicious chunk growth, dead-code investigation), start here. The cycle workflow itself lives in the `/cycle` skill (Track `bundle` routes the KB-delta DoD) and the `bundle-hygiene-reviewer` subagent.

## Related

- `docs/archive/BUNDLE_AUDIT.md` — completed audit chapter (history, story-by-story status). Frozen.
- `.claude/skills/cycle/SKILL.md` — per-story workflow (implement → review → patch → done); Track `bundle` gates it on the measured KB delta.
- `.claude/agents/bundle-hygiene-reviewer.md` — reviewer subagent that polices each diff.
- `.size-limit.json` — current budgets (baselines, not targets — see below).
- `package.json` — `npm run build:size` (size-limit), `npm run knip` (unused exports), `npm run build` (emits `stats.html` at the repo root).

## Budgets are baselines, not targets

The numbers in `.size-limit.json` are arbitrary historical baselines. They're useful as a regression tripwire (*"this chunk used to fit; what just changed?"*) but **not** a finish line.

The operative goal is **smaller is better when behavior is unchanged**, not "must hit budget." Don't promote risky structural changes just to close a budget gap. A speculative refactor that breaks audio-graph timing to save 8 KB is a bad trade.

Corollary: if you find a shrink that's both safe and easy, ship it even if the chunk is already under budget. The budget is a floor for "trigger an investigation," not a ceiling for "stop shrinking."

## Statically-provable dead code is already DCE'd

If you delete a function with no callers, or simplify `if (false) { ... }`, Rollup already removed it at minify time. The KB delta against the pre-change baseline will be ≈ 0.

**This is expected, not a failure.** The win in those stories is:

- **Source clarity** — the next person reading the code doesn't have to ask "is this reachable?"
- **Future-proofing** — a future edit can't accidentally re-link the dead branch.
- **Knip/AI_MAP cleanliness** — keeps the static-analysis surface honest.

The real KB wins come from elsewhere:

- **Data-driven dispatch tables with orphaned keys** — `Record<GenreKey, X>` entries the minifier can't statically prove dead because the dispatcher reads by string lookup.
- **Lazy switch arms / feature flags** with branches the minifier sees as live.
- **`import()` splits** that move bytes out of the boot path entirely.
- **Removing dependencies** (preact-runtime sized things, large lookup tables, format converters).
- **Single-symbol import drag** — one small constant imported from a 40 KB file can pull the whole file into a chunk; relocating the constant unblocks tree-shaking (see "Import-trace bundle work" below).

If a story whose Actions list reads like "delete dead code" produces ~0 KB delta, mark it as a source-clarity win in the Status line. Don't doctor the framing.

## The pre-flight grep tripwire

Before any "delete X" story, grep the entire repo (`public/`, `tests/`, `scripts/`, `docs/`, `.github/`) for every symbol the story will remove. Surviving runtime callers are P0 — stop.

### Project-specific tripwire for musical-content deletions

A story that proposes deleting a state field, instrument lane, drum voice, percussion entry, or anything keyed by a musical name (`"Clave"`, `"Shaker"`, `"Bossa Nova"`, etc.) has **three non-obvious runtime producers** that aren't UI code. Always grep these three before declaring something orphaned:

1. **`public/engine/grooves/*.ts`** — genre engines that write to lane step arrays. Latin lanes are populated here, not by user clicks. Knip can't see this because the dispatcher uses `import * as <genre>` namespace dispatch (the grooves directory is on knip's ignore list on purpose).
2. **`public/engine/fills.ts`** — every drum fill pattern arrays lane names; Toms, Conga, and the like are all driven here.
3. **`tests/standards/*-critique.test.ts`** — critique tests exercise these paths and would flake silently if the production code disappeared.

The S2 ("orphaned percussion sweep") premise break on 2026-05-23 is the canonical example: the lanes had no UI trigger path, but `grooves/latin.ts` was actively writing them for Bossa Nova / Samba / Latin-Salsa / Afro-Cuban-6/8, multiple fill patterns referenced them, and four critique tests asserted against them. Removing them would have been a P0 deletion of reachable musical code.

## Knip blind spots

`npm run knip` is the primary static-analysis lever for unused-export sweeps, but it has known blind spots. Treat findings as hypotheses, not orders.

- **`vi.mock` dynamic consumption.** When a test does `vi.mock('public/state.js', async (importOriginal) => { const actual = await importOriginal(); return { ...actual.<X> } })`, knip sees `<X>` as unused. It is not — the mock factory is a live consumer. S7 caught this with five test files referencing dead-looking re-exports. Fix the mock to import the canonical slice module directly so the test's dependency on the symbol is statically visible.
- **Namespace dispatch.** `import * as <genre>` from `grooves/*.ts` defeats knip's per-symbol analysis. The grooves directory is on knip's ignore list intentionally. Don't re-include it without rewriting the dispatcher.
- **Test entry points.** Knip considers test files live consumers, which is correct but creates a class of "test-only-production-dead" symbols — the production code never calls them, only the test does. The test pinning a wrapper alive is a separate cleanup question; surface it as a followup, not a delete.

Workflow: knip finding → grep for the symbol name AND any string literal that names it (some are dispatched by name) → if the only references are inside the file, drop the `export` keyword (don't delete the body); if no references at all, delete the body and any now-orphaned helpers.

## Import-trace bundle work

When tracing why N KB of a chunk is in code that should belong somewhere else (worker code in main, modal code in boot), open `stats.html` at the repo root (emitted on every `npm run build`).

Pattern: one small symbol — a 4-element `Set`, a single function — can be the only thing pulling a 40 KB file into the chunk's consumer tree. The fix is rarely a big refactor; it's usually:

- **Inline the constant** into the consumer, or move it to a tiny shared module.
- **Extract a single function** from a large file into its own module if the rest of the file is only worker-internal.

The 2026-05-23 followups from S3 are the canonical list: `ALTERED_HOOK_QUALITIES` (one `Set` was dragging 45.7 KB of `accompaniment.ts` into `soloist-pitch-engine`'s consumer tree), `generateSessionSeed` (one function pulled 46 KB of `soloist-seeder.ts` into main), `getDrumNotesForStep` (the `includeDrums: true` flag on `generateNotesForStep` still bundled every instrument's engine). Stats.html surfaced all of them.

## Code-splitting (`import()`) discipline

When converting a feature import to `import()` (the S3 pattern):

- **Gate at the user interaction**, not at the component file. The handler is what defers the chunk; making the component lazy without gating doesn't move the bytes if something else imports the module eagerly.
- **Use a one-time latch for first-open**, not the boolean visibility prop. If the modal has its own internal exit-animation lifecycle, a naive `{isOpen && <Modal />}` gate will unmount it before the animation runs. The pattern that worked in S3: `const [everOpened, setEverOpened] = useState(false); const onOpen = () => setEverOpened(true);` then `{everOpened && <Suspense fallback={null}><LazyModal isOpen={isOpen} ... /></Suspense>}`.
- **Preserve type-only imports** as `import type` — they don't affect the bundle but they keep typecheck happy.
- **Add a tiny loading state** if the user-perceived latency is > 100 ms on the cold path. For modals on user click, `<Suspense fallback={null}>` is usually enough.

## Defense-in-depth bundle hygiene

Three layers. Order matters (most-mechanized first):

1. **`size-limit` in `validate` script.** Fails `npm run validate` when any chunk exceeds budget. The single most valuable line in this whole guide — turn this on as soon as the budgets are sane.
2. **`bundle-hygiene-reviewer` subagent.** Invoke after any large feature merge or on demand; the agent knows the playbook (measure first, behavioral equivalence, attack biggest module, forbidden moves). The `/review` step of `/cycle` wires this in automatically for Track `bundle`; for ad-hoc work, invoke it manually against the uncommitted diff.
3. **Optional periodic `/loop` or scheduled agent.** Weekly build + delta report. Only valuable if (1) isn't catching things; revisit after a quarter of (1) being on.

## When a "shrink" story grows the bundle

Never commit a bundle story that grew the *target* chunk. Either the technique was wrong, scope-crept, or accidentally introduced a side effect (a new eager import, a new module boundary that defeats tree-shaking).

Common causes:

- A symbol moved to a new module, but the import statement that pulls it in now also pulls in a barrel re-export's siblings.
- A "lazy" `import()` whose handler is wired to a `useEffect` that runs on mount — the chunk loads at boot, just with a roundtrip.
- A `"sideEffects"` regression — adding a side-effect CSS import to a file that's otherwise tree-shakeable can keep the whole module in the graph.

Stop, investigate, revert if needed. KB-delta on the target chunk is the oracle; if it disagrees with the intent, the intent is wrong, not the oracle.

## What's *not* in scope for bundle work

- **Structural refactors with no bundle delta** (e.g. splitting `accompaniment.ts` 2940 LoC for readability). Track separately; they don't belong on the bundle board.
- **Behavior changes** of any kind (musical, UI, audio). The Definition of Done for any bundle story is no observable difference at runtime, only smaller bytes or cleaner exports. If a story can't ship without changing behavior, it's a different track.
- **Source-map stripping in deploy.** That's a deploy-pipeline question, not a bundle-content one.
