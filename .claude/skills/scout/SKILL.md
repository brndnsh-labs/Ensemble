---
name: scout
description: Find ensemble's next work in the code itself — sweep read-only across security · performance · hygiene · context · a11y lenses, verify every finding against the real code, dedupe, and file the few worth keeping as actionable issues with the fix drafted. Finds and files; never fixes. Usage `/scout` (all lenses, tightly capped) or `/scout <lens>` (one lens, deeper).
---
<!-- cycle:rendered template=skills/scout.md.tmpl hash=bb988322b450 — managed by the-cycle; edit the template, not this file -->

# /scout — find work the code is hiding

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** Filing — dedup,
format, routing by certainty, budget — is §2.

**Scout finds and files; it never fixes, branches, or merges.** The surfaces it's best at spotting
are often §5 brake surfaces, where a speculative fix shipped without a human look is how incidents
happen.

## Lenses

Sweep all lenses in parallel read-only agents by default; a named lens gets one deeper pass.

- **`security`** — trust boundaries, secrets, authn/authz, dependency CVEs.
- **`performance`** — payload weight, render cost, queries and indexes, polling, needless work.
- **`hygiene`** — type-safety erosion, dead code, drift between near-duplicate modules.
- **`context`** — do `CLAUDE.md`, the docs, and comments still describe the code? Each finding names
  the wrong inference a cold reader would draw *and* the artifact that should fix it.
- **`a11y`** — semantics, focus, touch targets, reduced motion, meaning carried by color alone.

What each lens means here. The app is a static site with no server, accounts or database, so several generic smells do not exist; these do.

- **`security`** — the repository is public and a merge is a release. Look for anything private that got committed (an address, a host name, an email that is not the no-reply one); `hosting/nginx.conf` response headers (it sets `X-Content-Type-Options` and `Referrer-Policy`; there is no `Content-Security-Policy`); workflow permissions and what a pull request from a fork could reach in `.github/workflows/ci.yml`; the chart parser on hostile text (`packages/engine/src/chart/lex.ts`, `parse.ts`: a pasted chart must not hang or blow up the tab); pack licences drifting from `scripts/packs/sources.ts`.
- **`performance`** — the phone is the target. Late notes in live playback (`pnpm render:audio <name> chart=<file> live=1` counts them); work on the main thread that belongs in `packages/app/src/play/band-worker.ts`; pack weight and what the service worker caches up front; the engine suite's headroom against its budget (`scripts/budget.ts`), since the budget failing is a gate failing.
- **`hygiene`** — drift between near-duplicate style modules (`packages/styles/src/{jazz,rock,blues}/drums.ts` are each 650 to 900 lines of the same shape: a rule fixed in one and not its siblings); a style name or a style-specific number inside `packages/engine/src` (there are none today: keep it so); the `as unknown as` and `@ts-` escapes (a handful, all should justify themselves); a property that restates the implementation instead of a rule; anything under `test/` that is not one of the four kinds.
- **`context`** — do `CLAUDE.md`, `PLAN.md` and the docs still describe the code? The commands list and budgets in `CLAUDE.md` against `package.json` and `docs/TESTING.md` (they have disagreed before: 84 seconds in one, 72 in the other); `docs/CHART_FORMAT.md` examples missing from `test/corpus.ts`; `prompts/` briefs are history and name old paths, so they are not findings.
- **`a11y`** — the player is used at arm's length with an instrument in hand: touch targets on the play screen (`packages/app/src/play/`), the playhead and lamps carrying meaning by colour alone, reduced motion honoured in `packages/app/src/motion.ts`, the bar editor (`packages/app/src/edit/BarEditor.tsx`) reachable by keyboard and screen reader.
- **`music`** (this repo's own) — a rule in `docs/MUSIC_NOTES.md` or `docs/music-notes/` that no property or critic metric holds; a property with a floor so low it cannot fail. File what is measurable; whether something sounds right is never a finding, it is a page for Brandon.

## Rules

- **Verify before filing.** Every candidate is a hypothesis until you've read the cited line. A
  misread on the slate teaches Brandon to distrust the rest.
- **File the fix already drafted** — evidence (`file:line` + a quote, and the sibling that already
  does it right, if any), the failure scenario, the concrete fix, and Acceptance a gate or a look
  can verify. Can't draft a fix → it's an observation for the report, unless it's a real defect
  needing a design call (file it as `status:needs-decision` with options sketched).
- **Budget:** about 2 per lens on a full sweep, 3–5 on a single lens. Zero is a success.

### Broader threads are a handoff, not an implicit wider sweep

When a finding exposes a pattern that probably repeats elsewhere, gather just enough evidence to
show it's credible, distinguish likely surfaces from verified ones, and finish the current sweep.
In the report, describe the pattern, the confirmed and likely surfaces, whether one issue is
sufficient or several independent issues are warranted, and the focused follow-up `/scout <lens>`
pass that would investigate it. Do **not** automatically broaden the current sweep, file
speculative related issues, or open an umbrella.

## Steps

1. Sweep → candidates with citations.
2. Verify each against the real file; drop what doesn't survive.
3. Dedup against open and recently closed issues (§2).
4. Rank, cut to budget, and show the slate — each with lens, evidence, drafted fix, routing, and
   whether it touches a §5 brake. Then file in the same turn.
5. File: `gh issue create --title "<title>" --body "<body>" --label "scout"`, then route by certainty (§2).
6. Report what was filed, what was found but not filed (and why), any credible **broader thread**
   handoff from above, and point at `/next`.
