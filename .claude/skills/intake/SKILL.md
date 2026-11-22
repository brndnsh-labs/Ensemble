---
name: intake
description: Turn a plain-English idea into an actionable ensemble issue — look up the facts yourself, ask Brandon only the decisions that change the issue (in rounds, each question led by your recommended answer), show the draft, then file and route it. Usage `/intake <the idea>` (or bare, and it'll ask).
---
<!-- cycle:rendered template=skills/intake.md.tmpl hash=7fc128aa41d8 — managed by the-cycle; edit the template, not this file -->

# /intake — idea → actionable issue

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** Filing rules —
dedup, the body format, routing by certainty — are §2.

The bar: `/cycle` could build it from the issue alone, without asking again. Shaping a request
into that form is the single most valuable step in this pipeline, so do it properly — and stop the
moment it's there.

## Interview in frontier rounds

- **Facts are yours; decisions are Brandon's.** Never ask anything the repo, the docs, or the
  tracker can answer — go look. Ask only what genuinely changes the issue.
- **Ask every question that's askable now in one round**, numbered, each with your recommended
  answer, so a round can be accepted in a word. A question that depends on an unanswered one waits
  for the next round. Reflect each answer back in a sentence.
- The usual gaps: what "done" looks like, verifiably (the load-bearing one); what's explicitly out of
  scope; whether it touches a §5 brake (running the release by hand (it puts production on a named commit), or anything done on the Docker host, anything that would publish a secret, a private address, a network detail or a private email (the repository is public), the release path: the release in `.github/workflows/` (`ci.yml`'s release jobs, `release.yml`) and `.github/actions/release/`, `hosting/`, `scripts/image.sh`, repository secrets and variables, branch protection, a sample pack's source or licence: `scripts/packs/sources.ts`, a pack's `LICENCE` file, the credits, what the app keeps in the browser: the stored lists (`packages/app/src/stored.ts` and the keys and shapes kept through it) and the service worker (`packages/app/service-worker.js`, `offline.ts`), loosening a gate: raising a budget's figures or changing its rule (a budget that grows by `docs/TESTING.md`'s own rule, a style added, is not raised), raising a scorecard tolerance, accepting a scorecard drop, deleting or weakening a property) — if so, say so in the body; and whether
  it's really a decision rather than a task.
- One or two rounds is normal. Five questions in one round means the idea wants splitting.

```
❓ **Q1 — <title>**: <the question; options inline when it's a pick>
➡️ <your recommended answer>
```

Use `AskUserQuestion` for a round of purely discrete picks (2–4 options, recommendation first); anything
free-text goes in chat in the format above.

## Steps

1. **Dedup** (§2) — search open and recently closed issues. A likely twin → offer to extend it.
2. **Interview** until actionable.
3. **Show the draft** — title, body in §2's format, and its routing. Nothing is filed before this. If
   Brandon already approved the shape in advance, show it and file in the same turn.
4. **File** with `gh issue create --title "<title>" --body "<body>" --label "<label>"` (a kind label such as `bug`, or none),
   then route it by §2's certainty call: actionable and gate-provable →
   `gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:blocked,status:needs-decision,status:needs-ear" && gh issue edit "<n>" --add-label "status:ready"`; a decision, with the options written out →
   `gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:blocked,status:needs-decision,status:needs-ear" && gh issue edit "<n>" --add-label "status:needs-decision"`; genuinely unsure → leave it unrouted.
5. **Report** the link, and offer `/cycle #<n>` if it's ready to build.

Several ideas at once: interview each separately, then show and file them together. An idea that's
really several gets split. Intake files; it never fixes, even a one-liner. Tracker unreachable →
stop and echo the drafted issue so it isn't lost.
