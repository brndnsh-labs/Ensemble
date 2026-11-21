---
name: review
description: Independently review the current uncommitted ensemble diff (or a named branch/PR) — correctness, plus whether it does what the issue asked — adding `/security-review` when it touches an always-brake surface (a production release, or anything done on the Docker host, anything that would publish a secret, a private address, a network detail or a private email (the repository is public), the release path: the release job in `.github/workflows/ci.yml`, `hosting/`, `scripts/image.sh`, repository secrets and variables, branch protection, a sample pack's source or licence: `scripts/packs/sources.ts`, a pack's `LICENCE` file, the credits, what the app keeps in the browser: the stored lists (`packages/app/src/stored.ts` and the keys and shapes kept through it) and the service worker (`packages/app/service-worker.js`, `offline.ts`), loosening a gate: raising a time budget or a scorecard tolerance, accepting a scorecard drop, deleting or weakening a property). Reports findings with evidence; fixing them is the caller's job. Used by /cycle, or on its own for any diff.
---
<!-- cycle:rendered template=skills/review.md.tmpl hash=c9874088f9f7 — managed by the-cycle; edit the template, not this file -->

# /review — fresh eyes on a diff

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context** (§3 says how
much review a change deserves; §5 says when to stop).

**Run it in a fresh-context subagent** when the caller built the diff: hand it the issue number
and the diff, not your reasoning. The value is a reviewer who doesn't share the builder's
assumptions. If a subagent can't be launched at all, don't stall: review in-thread, re-reading
the issue and the diff from scratch, and say that's what happened.

## What to check

- **Correctness — the inline correctness pass.** Logic, edge cases, error paths, contracts,
  invariants. Depth matches risk. Tests beside production code are supporting cast; the behavior
  change is the subject.
- **Spec — kept separate.** Read the issue's Acceptance and its comments, and report against them:
  a criterion missing or half-met, behavior nobody asked for, or a criterion addressed in a way that
  won't actually satisfy it. Quote the acceptance line, and tag these `[spec]`. No issue in context
  → say "no spec available"; never reconstruct one from the diff.
- **Tests that are the deliverable — the test-quality lens.** Do they assert the contract or just
  restate the implementation? Can each assertion actually fail? A test that enshrines a bug is a
  finding, however green.
- **Brake surfaces** (a production release, or anything done on the Docker host, anything that would publish a secret, a private address, a network detail or a private email (the repository is public), the release path: the release job in `.github/workflows/ci.yml`, `hosting/`, `scripts/image.sh`, repository secrets and variables, branch protection, a sample pack's source or licence: `scripts/packs/sources.ts`, a pack's `LICENCE` file, the credits, what the app keeps in the browser: the stored lists (`packages/app/src/stored.ts` and the keys and shapes kept through it) and the service worker (`packages/app/service-worker.js`, `offline.ts`), loosening a gate: raising a time budget or a scorecard tolerance, accepting a scorecard drop, deleting or weakening a property): also run `/security-review`, reasoning about this flow's
  threat model, not generic categories.
- **A big or subtle diff:** a second reviewer on a different model catches same-prior blind spots.
  The heavyweight `/code-review` is human-triggered — if a diff deserves it, say so and leave the
  call to Brandon.

This repo has **one reviewer agent**, `ear-reviewer` (`.claude/agents/ear-reviewer.md`): it reads takes as transcriptions (`ensemble read`) against the music notes, and runs beside the general review where a row names it. Every row is also reviewed by a fresh-context general reviewer briefed with the "what to hold" column. The rows without an agent are the backlog for writing dedicated ones.

| Path | Domain | What to hold |
|---|---|---|
| `packages/engine/src/players/**` | engine, players | The engine row, and **`ear-reviewer`** beside the general review: the takes the change reaches, read before and after against the music notes for the seat and the style. |
| `packages/engine/src/**` | engine | Purity: same chart, style, options and seed give identical events; no DOM, audio, I/O, clock or `Math.random`; imports nothing from `app` or `audio`. No style named in engine code (a style is data). Extending an open-ended plan must not change passes already generated. Range, register and resolution rules in `docs/MUSIC_NOTES.md` and `docs/music-notes/`. |
| `packages/engine/src/critic/**`, `scorecard/**` | critic | A metric measures what its name says, over the seeds it claims. A baseline change is an accepted improvement with a `DECISIONS.md` line, never a quiet drop (§5). |
| `packages/styles/src/**`, `library/*.chart` | styles | `packages/styles/src/**` also gets **`ear-reviewer`** beside the general review, on the styles the change touches. Data only: no engine edit rode along. Other styles' goldens are byte for byte unchanged and `pnpm score` shows no movement for them. A tune's changes are checked against a published source, never recalled. |
| `test/**` | tests | Only the four kinds in `docs/TESTING.md`; public API only; no mocks; each test names its rule in musical or user-facing words. A new property fits the budget as it stands. A changed golden has its `DECISIONS.md` line. |
| `packages/audio/src/**` | audio | Knows nothing about music theory (no chord, scale or style words). Scheduling against the audio clock, not timers. `docs/AUDIO_NOTES.md` for packs, mixing and phones. |
| `packages/app/src/**`, `smoke/**` | app | `play/jam.ts` is the only place a take becomes sounds. `stored.ts`, the stored shapes and the service worker are §5 brakes: something kept by an older build must still load. No committed Playwright spec beyond the five journeys. |
| `scripts/packs/**`, `assets/packs/**` | packs | §5 brake. Each source pinned to a version, its licence read from the fetched file and kept beside the pack; the electric piano is non-commercial share-alike. |
| `.github/**`, `hosting/**`, `scripts/image.sh` | release | §5 brake, with `/security-review`. Nothing private published; the image is the commit it is named for; the release job stays `main`-only and never runs for a pull request. |
| `packages/cli/src/**`, other `scripts/**` | tooling | A take is its chart, style, options and seed: the same four give the same MIDI file. |
| `docs/**`, `*.md`, `prompts/**` | docs | Agrees with the code and with `CLAUDE.md`; `docs/CHART_FORMAT.md` is a spec, so each example in it is a corpus row. |

**Fallback:** a path matching nothing gets the general review. A diff across rows is held to every row it touches. Musical judgment (is this idiomatic) is reported as an observation for Brandon's ear, never as a pass or a fail.

## Reporting

- Each finding: an ID (`F1`, `F2`, …), severity (P0 / P1 / P2), `file:line`, a verbatim quote of the
  line, and what's wrong. **Read the cited line before reporting it** — a confidently wrong finding
  costs more than a missed one.
- End with one verdict: **clean**, **fixable** (mechanical findings — fix and re-check), or
  **needs Brandon** (a design call, a P0 on a brake surface, or a contradiction with a project
  memory note — which wins by default, but surface it).
- No findings is a valid result. A reviewer that errored or timed out is a *missing* result — say
  so; never report it as clean.
- **Re-check mode:** when called again after fixes, confirm each original ID against the current
  tree (fixed / still open) and look at the fix itself for new problems. If the fix grew into new
  behavior, do a full review instead.
