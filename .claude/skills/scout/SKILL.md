---
name: scout
description: Discovery-driven finder for Ensemble — fans out read-only agents across security · performance · hygiene · context · a11y lenses, verifies each finding against the real code, dedupes against open issues, and files the worth-keeping candidates as actionable issues. Read-only over code: it FINDS and FILES, it never fixes, branches, or merges. Usage `/scout` (all lenses, tightly capped) or `/scout <lens>` (one focused lens, higher cap).
---
<!-- cycle:rendered template=skills/scout.md.tmpl hash=186c1aa3dad7 — managed by the-cycle; edit the template, not this file -->

# /scout — find Ensemble's next work, on demand

Goal: surface maintenance and hardening work the code itself is hiding — before it becomes an
incident — and land it in the same tracker every other skill already reads. Every other pipeline
skill *consumes* the queue (`/next` picks, `/cycle` builds); `/scout` *generates* candidates from
the code.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** Scout files
issues, so the filing mechanics are **§10** — dedup, the actionable bar, the body format, the
budget. Don't restate them; apply them. Also leans on §1 (Status), §2 (the `scout` provenance
stamp), §5 (a finding that touches an always-brake surface still gets filed, just clearly flagged),
and §7 (the batch-write rule).

## The cardinal rule: scout finds and files. It never fixes, branches, or merges.

The surfaces scout is best at spotting — Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop), destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state), the state/worker contract (a `@direct-mutation` outside the sanctioned categories, a half-synced worker field) — are exactly §5's always-brake class.
Auto-merging a speculative fix there is how a real incident happens. Discovery is cheap and
reversible; a shipped-without-review "fix" isn't. Scout's job stops at a well-specified issue.

## Lenses

Run **all lenses in one capped sweep** by default; pass a lens name for a focused, deeper pass.

- **`security`** — the trust boundary, secrets handling, authn/authz surfaces, dependency CVEs.
- **`performance`** — payload weight, render/hydration cost, query and index patterns, polling
  cadence, work done that didn't need doing.
- **`hygiene`** — type-safety erosion (`any`, unchecked casts, `@ts-expect-error`, non-null `!`),
  dead code, and drift between near-duplicate modules.
- **`context`** — **does the map still match the territory?** Do `CLAUDE.md`, the docs, and inline
  comments still describe the code as it is? A stale claim here misleads the next cold reader
  worse than no claim at all. Every finding in this lens must name **both** the wrong inference a
  cold reader would draw **and** the concrete in-tree artifact that fixes it.
- **`a11y`** — semantic HTML, focus management, touch-target size, reduced-motion, and anything
  that encodes meaning in color alone.

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
  `lens:code-review`, `status:ready`.
- **Class 2 — subjective (the unblock subset):** contrast ratios, focus *feel*, motion, arguable
  tab-order. **Don't park as `status:needs-ear`** — file as **`status:needs-decision` with the concrete fix
  attached** ("text is 3.8:1, AA wants 4.5:1, here's the darker token — apply?").
- **Classify:** `track:bundle`? No — `area:ui`, `finding`/`enhancement`, `lens:code-review`;
  Class 1 → `status:ready` + `burndown` + `verify-on-device`; Class 2 → `status:needs-decision` fix-pre-drafted.

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
- **Classify:** CVE bump → `burndown`. Input-hardening code → `status:needs-decision` with the fix
  pre-drafted ("approve adding shape validation to the share-URL reader?") → on clear, `status:ready`,
  `lens:code-review` + "needs `/security-review`", **off `burndown`**.

### `perf` — performance, *floor-aware*
Speedups must keep playback glitch-free on weak hardware — a synthetic bench can't hear an audio
dropout. **The split that decides everything — which side of the audio path is it on?**
- **Real-time audio path** (`scheduler-core.ts`, the `synth-*.ts` voices, the logic/visualizer
  workers, `tick-logic`) → **hard brake, never `burndown`.** A regression here is an audible glitch
  or a dropped buffer. File **with the by-ear / weak-device caveat written in**, route to
  `orchestrator-inline` / `musical-engine-implementer` + the matching reviewer, leave off
  `burndown` (often `needs-ear`). Model per the §3 routing rule: `sonnet` when the acceptance is
  critique-test-verifiable, `opus` only when the finding is itself a design call.
- **Off-audio-path + build-measurable** → **`burndown`-eligible**, and this is exactly the **bundle
  Track** — file it `track:bundle`, `lens:bundle-hygiene`. Drop an unused dep, lazy-load a
  route/overlay, code-split a heavy component, memoize a *verified*-hot render. `npm run build` /
  the size check **is** the proof and it never touches the audio floor. Pure ones (drop a dep) →
  `burndown`; tradeoff ones (a lazy-load adds a loading state) → `status:needs-decision`-with-fix.
- **Classify:** audio-path → `track:synth`/`musical`, Model per the §3 routing rule (`sonnet` if
  gate-verifiable, `opus` for design calls), caveat or `status:needs-ear`. Off-path →
  `track:bundle`, Model `sonnet`, `status:ready` + `burndown` (or `status:needs-decision`-with-fix for tradeoffs).

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
- **Classify:** `area:*`, `finding`, Model `sonnet`, Size `S`, `status:ready` **+ `burndown`** for the
  genuinely build-verifiable ones (a bounded `any`-tighten, a knip dead-code removal, a jscpd
  de-dup); the judgment-tail ("is this export dead or kept API?") → `status:needs-decision`-with-fix. Track
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
  unambiguous). **Interpretive drift** ("is the *doc* wrong or the *code*?") → `status:needs-decision`
  with the likely correction pre-drafted.
- **Classify:** `area:infra` (or the owning area), `finding`, Model `sonnet`, Size `S`; factual-sync →
  `status:ready` + `burndown`; interpretive → `status:needs-decision`-with-fix. `lens:code-review`.

## The budget — quality over flood (load-bearing)

Within §10.6's budget: **all-lenses run** — ~2 findings per lens, single digits overall;
**single-lens run** — the top 3–5.

**Filing zero because a lens is clean is a success, not a failure** — say so and stop. A flood of
marginal issues is worse than a missed one: it burns trust in the whole queue.

## Verify before filing (non-negotiable)

Every finding is a **hypothesis with a citation** until you've read the cited code. Open the file,
read the actual line, and confirm the claim — grep the *assignment*, not just a textual match. A
finding that turns out to be a misread costs more than the one you didn't file, because it teaches
Brandon to distrust the rest of the slate.

## File the fix already drafted (the fleshing-out rule)

A diagnosis-only issue hands Brandon homework; a drafted fix hands them a decision
(§10.3). Scout has already done the reading — it knows the file, the line, and what right looks
like — so the body carries that knowledge instead of describing where someone else might find
it. Every filed issue includes:

- **Evidence** — `file:line` plus a **verbatim quote** of the offending code, and, where one
  exists, the in-repo pattern that already does it right (the strongest possible spec: "make it
  match its sibling").
- **The failure scenario** — the concrete inputs/state → wrong outcome, and why it matters here.
- **The drafted fix** — the concrete change: a diff block, or the exact edit stated precisely
  enough to apply without re-deriving the analysis. The decision becomes *"ship this? y/n"*, and
  the eventual builder starts from the draft instead of from zero.
- **Acceptance** a gate or a look can actually verify.

A finding you can't draft a fix for usually isn't actionable enough to file — put it in the
report as an observation instead. The one exception: a genuine defect whose fix needs a design
call — file it with the options sketched and route it `status:needs-decision` (§10.5),
never pickable.

## Workflow

1. **Pick the lenses** (all, or the named one).
2. **Sweep, read-only.** Fan out across the lenses; each returns candidate findings with
   `file:line` citations.
3. **Verify each candidate against the real file.** Drop anything that doesn't survive.
4. **Dedup** (§10.1) — open *and* recently-closed issues. A closed-unfixed twin is a rejection
   with memory: report it, don't re-file it.
5. **Rank and cut to budget.**
6. **Present the slate** — each finding with its lens, `file:line`, the drafted issue body
   **including its drafted fix**, its §10.5 certainty call with one line of why, and whether it
   lands on a §5 brake. This is a §5 plan — shown for visibility, then acted on in the same turn;
   an unattended run's standing go folds it into the report.
7. **File** (§7): `gh issue create --title "<title>" --body "<body>" --label "scout"` per finding, then route each by
   its certainty call (§10.5) — deterministic → `gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:needs-decision,status:needs-ear,status:blocked" --add-label "status:ready"`,
   interpretive → `gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:needs-decision,status:needs-ear,status:blocked" --add-label "status:needs-decision"`, unsure → no status write —
   plus anything this repo's lens table adds. A plain loop is correct here; these are REST calls,
   and there is nothing to batch around. Tracker unreachable → say so and stop; don't pretend it
   filed.
8. **Report.** What was filed (links, labels, which ones flag a §5 brake for later), what was found
   but not filed (dups, below-the-cut, "clean on this lens"), and point at `/next`.

## Guardrails

- **Find and file only — never fix, branch, or merge.** If it's tempting to "just fix this one,"
  file it instead and let `/cycle` do it with a human watching.
- **Verify every finding against the real file before it reaches the slate.** Non-negotiable.
- **Respect the budget.** Fewer, sharper issues beat a flood; zero is a fine outcome.
- **Dedup is not optional.**
- **Read-only until the step-6 slate is shown.** Presenting it is a §5 plan, not a "Proceed?"
  prompt — but nothing is created before it exists.
- **Always-brake findings still get filed** — just clearly labeled as needing `/security-review` at
  build time, never framed as a quick auto-mergeable patch.

## How it fits the pipeline

- **`/scout`** = code → candidate issues (the discovery front door).
- **`/next`** = ranks and picks. A scout-filed issue arrives already routed by §10.5's certainty
  call: deterministic findings are pickable on arrival, interpretive ones sit on Brandon's
  decision queue with the fix pre-drafted, and only the genuinely unsure land under **Untriaged**.
- **`/implement` / `/cycle`** = build a picked issue; §5 still brakes regardless of who filed it.
- **`/burndown`** = curates the believed-safe subset and loops `/cycle` over it.
