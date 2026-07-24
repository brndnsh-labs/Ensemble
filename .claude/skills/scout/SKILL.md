---
name: scout
description: Discovery-driven finder for the overnight loop — sweeps the codebase through ONE lens (a11y · security · perf · hygiene · context), triages what it finds, and files the worth-keeping candidates as well-formed Forgejo issues (via /intake's classification), `burndown`-tagging the build-verifiable mechanical ones and shaping the rest as one-question `Needs-decision`s (fix pre-drafted) so /unblock can clear them into next-loop burndown fuel. Read-only over code: it FINDS and FILES, it never fixes or merges. The discovery companion to /burndown (which consumes). Usage `/scout <a11y|security|perf|hygiene|context>` (bare = rotate by day).
---

# /scout — find tomorrow's safe work tonight

Goal: when the vetted backlog is exhausted, the overnight loop still has something useful to do —
**discover** candidate work and file it as triaged issues Brandon approves over coffee. The
**discovery half**: every other skill *consumes* the tracker (`/burndown` grinds, `/cycle` builds);
`/scout` *generates* candidates from the code itself.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** Scout files
issues, so it reuses §2 (Labels) + §3 (Track/fields/routing) — via `/intake`'s classification, don't
re-derive the vocab — and the per-lens `burndown`-safety calls below are §5's always-brake set. The
filing writes follow §7's batch rule.

**The cardinal rule: scout finds and files. It never fixes, branches, or merges.** Auto-merging
speculative a11y / perf / design changes overnight is how you wake up to a broken focus order or a
glitchy scheduler the gates couldn't catch. Discovery is cheap and reversible; speculative merges
aren't. So scout's *output* is well-formed issues; the genuinely-mechanical ones get `burndown`-tagged
so the *next* `/burndown` executes them safely. Find by night, approve by day, grind the safe ones
automatically.

## One lens per run

- **`a11y`** — accessibility of the chart / transport / instrument-rail / visualizer surfaces.
- **`security`** — dependency CVEs + untrusted-input hardening (share-URL / hydration / persisted
  session parsing). *(This app is a client-only PWA — no auth/payments/server, so the lens is small.)*
- **`perf`** — bundle weight + the real-time audio hot path, *floor-aware*.
- **`hygiene`** — type-safety, dead code, duplication, and drift between parallel modules.
- **`context`** — does the written context (CLAUDE.md, AI_MAP.md, docs, comments, musical-intent
  notes) match the code, and does the code carry the load-bearing knowledge a cold *AI agent* needs
  to not re-derive it wrong.

## The budget — quality over flood (load-bearing)

**Cap each run at the top ~3–5 findings** — highest-leverage, best-specified. Rank by (impact ×
how-actionable), file the top few, *mention* the rest without filing. A run that files **zero** because
the codebase is clean on that lens is a **success** — say so and stop. Don't manufacture busywork.

## Dedup first — always

Before filing, **search open issues for a twin** — `node scripts/forgejo.mjs list --open`
+ a title/keyword skim. Re-filing what's tracked turns the loop into spam. Twin exists → skip (or one
`node scripts/forgejo.mjs issue comment` if your finding sharpens it). Unsure if two findings are the same → file once.

## Shape every finding for the queue — the scout → unblock → burndown chain

Scout's job isn't just *find* — it's **shape each finding so the smallest human input unlocks it**:
- **Prefer `Needs-decision` (a crisp one-question call + a recommended default) over `Needs-ear`.**
  Reserve `Needs-ear` for things Brandon must genuinely *hear* — synth voice character, groove feel,
  beat timing. Contrast ratios, focus order, dead-export ownership are **desk-decidable** →
  `Needs-decision`, so `/unblock`'s menu can clear them.
- **File the fix already drafted.** Write the concrete change into the issue body so the decision is
  *"ship this diff? y/n"*, not *"go think about this."* Can't draft a fix → it's probably not
  actionable enough to file; say it in the report instead.

**The `verify-on-device` lever (§2/§5).** A change whose *correctness* is knowable from code but
whose *side-effects* want a real-device glance (a mobile safe-area / touch-target / viewport fix) is
**not** `Needs-ear` — it's `verify-on-device`, which **pairs with `burndown`**: build + auto-merge,
land on `/nightly`'s morning device-verify checklist. Use it for the deterministic-a11y subset.

## The lenses in detail

All filing uses `/intake`'s classification conventions. Every lens inherits the two shaping rules.

### `a11y` — accessibility
A music tool used **hands-on-instrument, eyes-on-a-chart** — a11y is core UX, not a checkbox.
- **Look for:** icon-only controls with no accessible name (the transport play/stop, the instrument
  mute/solo rail, the 🌈 visualizer button), focus lost after the visualizer overlay / popovers close,
  non-keyboard-operable controls, tab-order ≠ visual order, insufficient contrast, missing
  `:focus-visible`, motion ignoring `prefers-reduced-motion`, canvas/visualizer with no text
  alternative, controls (Time/Key/Seed popovers) with no label.
- **Where:** `public/components/**`, the `ChartSurface` topbar/rail, the visualizer overlay.
- **Class 1 — deterministic (the burndown subset):** an unambiguously-right native fix — a missing
  `aria-label` on an icon button, `<span role="button">`→`<button>`, a missing `type="button"`, a
  hand-rolled Enter/Space handler a native element gives free. → **`burndown` + `verify-on-device`**,
  Review lens `code-review`, Status `Ready`.
- **Class 2 — subjective (the unblock subset):** contrast ratios, focus *feel*, motion, arguable
  tab-order. **Don't park as `Needs-ear`** — file as **`Needs-decision` with the concrete fix
  attached** ("text is 3.8:1, AA wants 4.5:1, here's the darker token — apply?").
- **Classify:** Track `bundle`? No — `area:ui`, `finding`/`enhancement`, Review lens `code-review`;
  Class 1 → `Ready` + `burndown` + `verify-on-device`; Class 2 → `Needs-decision` fix-pre-drafted.

### `security` — hardening (the *least* burndown-able lens; deliberately small here)
This is a client-only PWA: no auth, no payments, no server. The real surface is **untrusted input**
(share URLs, persisted-session JSON, hydration state) and **dependency CVEs**.
- **Look for:** `npm audit` CVEs (run it); share-URL / hydration / `localStorage` session parsing
  that trusts shape without validation (a malformed payload that can crash the app or inject through
  to the DOM/`innerHTML`); service-worker/`workbox` cache that could serve stale or poisoned assets;
  any `dangerouslySetInnerHTML`-equivalent or unsanitized user-derived string reaching the DOM.
- **Where:** `public/state/state-hydration.ts`, share/URL encode-decode, the persisted-session reader,
  the service worker, anywhere URL/`localStorage` data crosses into state or markup.
- **Landmines:** a **CVE bump with green gates** is `burndown` (it's `/dep-update`-shaped). A
  **code-level input-parsing change** is a judgment call — file it, route to a human `/cycle` with a
  `/security-review`, **never `burndown`-tag it** (a wrong hardening change is worse than the gap).
- **Classify:** CVE bump → `burndown`. Input-hardening code → `Needs-decision` with the fix
  pre-drafted ("approve adding shape validation to the share-URL reader?") → on clear, `Ready`,
  Review lens `code-review` + "needs `/security-review`", **off `burndown`**.

### `perf` — performance, *floor-aware*
Speedups must keep playback glitch-free on weak hardware — a synthetic bench can't hear an audio
dropout. **The split that decides everything — which side of the audio path is it on?**
- **Real-time audio path** (`scheduler-core.ts`, the `synth-*.ts` voices, the logic/visualizer
  workers, `tick-logic`) → **hard brake, never `burndown`.** A regression here is an audible glitch
  or a dropped buffer. File **with the by-ear / weak-device caveat written in**, route to
  `synth-implementer` / `musical-engine-implementer` + the matching reviewer, Model `opus`, leave off
  `burndown` (often `needs-ear`).
- **Off-audio-path + build-measurable** → **`burndown`-eligible**, and this is exactly the **bundle
  Track** — file it `Track: bundle`, Review lens `bundle-hygiene`. Drop an unused dep, lazy-load a
  route/overlay, code-split a heavy component, memoize a *verified*-hot render. `npm run build` /
  the size check **is** the proof and it never touches the audio floor. Pure ones (drop a dep) →
  `burndown`; tradeoff ones (a lazy-load adds a loading state) → `Needs-decision`-with-fix → `/unblock`
  → `burndown`.
- **Classify:** audio-path → Track `synth`/`musical`, Model `opus`, caveat or `Needs-ear`. Off-path →
  Track `bundle`, Model `sonnet`, `Ready` + `burndown` (or `Needs-decision`-with-fix for tradeoffs).

### `hygiene` — type-safety, dead code, duplication, drift (the most `burndown`-able lens)
The mechanical-wins lens — where overnight discovery most feeds same-week auto-grind.
- **Look for:** `any` / `@ts-expect-error` / non-null `!` / unsafe `as` casts that can be tightened
  (inventory them — the `as Mutable<T>` narrowing trap is real here); `knip` dead-export/dead-file
  flags (`npm run knip`); `jscpd` duplication (`npx jscpd`); drift between parallel modules (two
  near-identical groove/style helpers that should share); stale TODO/FIXME with enough context.
- **Landmines:** keep each item **bounded and single-area** — "tighten the 4 `any`s in
  `worker-client.ts`" not "remove all `any`". An unbounded sweep isn't `burndown`-safe. **Engine
  hygiene that changes generative behavior is NOT hygiene** — if a "cleanup" could shift a critique
  test, it's a `musical` Track story, not a `burndown` nit.
- **Classify:** `area:*`, `finding`, Model `sonnet`, Size `S`, Status `Ready` **+ `burndown`** for the
  genuinely build-verifiable ones (a bounded `any`-tighten, a knip dead-code removal, a jscpd
  de-dup); the judgment-tail ("is this export dead or kept API?") → `Needs-decision`-with-fix. Track
  `bundle` for dead-code removal; otherwise leave Track unset / `musical` if it's engine-adjacent.

### `context` — does the map match the territory (the project-unique lens)
The dev loop here is **agent-driven**, so code that lies to a cold reader has a *direct, recurring*
cost. Two faces of one failure: **doc↔code drift** and **undocumented load-bearing invariants**.
- **The discipline (no linter — name both or it's not a finding):** every finding states **(a) the
  specific wrong inference a cold reader makes** and **(b) the concrete in-tree artifact that fixes
  it** — a clarifying comment, a guard, a regression test, a tightened type, a one-line doc sync.
  Can't name both → it's a vibe, leave it out.
- **Look for:** **AI_MAP.md paths that no longer exist on disk** (the `lint:docs` gate enforces this —
  a stale row blocks commits); CLAUDE.md / VISION.md / guide claims that no longer match the code;
  comments/skill docs referencing files/functions/flags that moved (verify they still exist);
  **musical magic numbers the code enforces but doesn't justify** (a probability/offset with no
  `// why` comment — CLAUDE.md requires the intent be documented) → propose encoding the rationale;
  the canonical-genre-key / alias families (Rock/Shred, Neo-Soul/Neo) drifting from `smart-genres.ts`.
- **Where:** the doc tree (`*.md`, `.claude/skills/**`, AI_MAP.md), plus `public/**` comments and the
  generative engines (`public/engine/**`).
- **The split:** **factual sync** (a renamed-file reference, a missing AI_MAP row, a missing
  musical-intent comment) → `burndown` (build/lint-verifiable or doc-only + directionally
  unambiguous). **Interpretive drift** ("is the *doc* wrong or the *code*?") → `Needs-decision`
  with the likely correction pre-drafted.
- **Classify:** `area:infra` (or the owning area), `finding`, Model `sonnet`, Size `S`; factual-sync →
  `Ready` + `burndown`; interpretive → `Needs-decision`-with-fix. Review lens `code-review`.

## Workflow

1. **Pick the lens** (arg, or rotation). State which lens this run is.
2. **Sweep** — read-only over the lens's surfaces. Use the tools: `npm audit` (security), `npm run
   knip` / `npx jscpd` / `npm run build` (hygiene+perf), `npm run lint:docs` (context — stale AI_MAP
   rows), grep for the type-safety inventory, read the actual components for a11y, diff docs/comments
   against code for `context`. **Verify each finding is real** in the current tree.
3. **Triage to the top ~3–5** by impact × actionability. Drop anything half-formed.
4. **Dedup each survivor** against open issues. Skip twins.
5. **Present the candidate slate (plan-first checkpoint).** Per finding: one-line symptom, the lens's
   classification (Track + labels + fields + readiness verdict), and *why it's safe or not* for
   `burndown`. Under a standing overnight go (`/nightly`), proceed without waiting; interactively, get
   Brandon's nod first.
6. **File** — for each survivor, `/intake`'s write step: `node scripts/forgejo.mjs issue create` with labels, then **one**
   `node scripts/forgejo-project.mjs batch /tmp/scout-fields.json` for ALL routing fields (never a loop —
   §7). Conservative `burndown` tagging. **Always stamp `--label scout`** so `/unblock` surfaces last
   night's finds freshest-first. Forgejo unreachable → say so and stop.
7. **Report** — what was filed (links + Status/whether `burndown`), what was found but not filed (dups,
   below-the-cut, "clean on this lens"), and which items are grind-ready vs waiting on Brandon.

## Guardrails

- **Find and file only — never fix/branch/merge.** If it's tempting to "just fix this one," that's a
  sign it's `burndown`-safe — file it tagged and let the grinder do it.
- **Conservative `burndown` tagging.** Feeders: bounded build-verifiable **hygiene**, off-audio-path
  **perf** (Track bundle), deterministic **a11y** (`+verify-on-device`), factual-sync **context**,
  clean **CVE bumps**. Audio-path perf, security *code*, anything that could move a critique test, and
  interpretive/subjective findings stay **off** `burndown` → route through `Needs-decision` → `/unblock`.
- **Respect the budget.** Fewer, better issues. Zero is a fine answer.
- **Dedup is not optional.**
- **Read-only until the step-5 confirmation** (or the standing overnight go applies).

## How it fits the pipeline

- **`/scout`** = code → candidate backlog (machine-driven sibling of `/intake`'s human capture).
- **`/burndown`** = grind the safe `burndown` set — `/scout` keeps it fed when the vetted queue dries.
- **`/unblock`** = clears the `Needs-decision`/`Needs-ear` items scout files.
- **`/nightly`** = the overnight orchestration that runs `/burndown` then one `/scout` lens.
