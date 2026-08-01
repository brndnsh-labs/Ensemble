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
  `orchestrator-inline` / `musical-engine-implementer` + the matching reviewer, leave off
  `burndown` (often `needs-ear`). Model per the §3 routing rule: `sonnet` when the acceptance is
  critique-test-verifiable, `opus` only when the finding is itself a design call.
- **Off-audio-path + build-measurable** → **`burndown`-eligible**, and this is exactly the **bundle
  Track** — file it `Track: bundle`, Review lens `bundle-hygiene`. Drop an unused dep, lazy-load a
  route/overlay, code-split a heavy component, memoize a *verified*-hot render. `npm run build` /
  the size check **is** the proof and it never touches the audio floor. Pure ones (drop a dep) →
  `burndown`; tradeoff ones (a lazy-load adds a loading state) → `Needs-decision`-with-fix.
- **Classify:** audio-path → Track `synth`/`musical`, Model per the §3 routing rule (`sonnet` if
  gate-verifiable, `opus` for design calls), caveat or `Needs-ear`. Off-path →
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
