# Build: the app counts its use (#2279)

The issue is the specification: `gh api repos/brndnsh-labs/Ensemble/issues/2279 --jq .body`, and its comment
with the website id (`gh api repos/brndnsh-labs/Ensemble/issues/2279/comments --jq '.[].body'`). Read it
first, then `CLAUDE.md` (binding), `docs/BRIEF.md`, `docs/TESTING.md` (the smoke journeys are a named list),
`docs/decisions/README.md` and `docs/decisions/app.md`, and the app (`packages/app/src/`).

## Where you are

A git worktree at `/home/brandon/code/ensemble/.work/2279`, branch `counts-use`, dependencies installed. Work
only inside it. Commit in a few sensible commits, explicit paths only (never `git add -A`, never `--no-verify`,
never amend, never bare `git stash`). Do not push, open a pull request or touch GitHub beyond reading the
issue. Do not read the `legacy` branch or `~/code/ensemble-legacy`. Servers you start: ports 8772 and 8773
only, stopped by port (`fuser -k 8772/tcp`). **Send nothing to the real Umami instance from this machine**:
no request to `umami.brndn.zip` at all, not even to look at it.

## Decided (the main session's calls; log them in `docs/decisions/app.md` with the owner's words from the issue)

- **Look up Umami's current documentation for sending an event without its tracker script** (the send
  endpoint, the payload's fields, what it needs of the request) before writing the module; do not write it
  from memory. Use the documentation tools you have; the lookup is about Umami in general and names nothing
  of this project.
- One module, `packages/app/src/counts.ts` (or a better plain name), holding: the endpoint and website id as
  constants; the production hostname (`ensemble.brndn.zip`, already named in `CLAUDE.md`); a typed allow-list
  (an event's name and the exact shape of its data, so a call that sends anything else does not compile);
  and one `count(event, data)`.
- **It sends only when `location.hostname` is production's and do-not-track is not set.** Otherwise it does
  nothing at all: no request, no queue.
- No cookies, nothing written to any storage, no identifier. The page sent is the path only (the app's
  addresses may carry a chart's name in the hash or path: check `address.ts`, and send a fixed path per
  screen, never one that could hold a user's chart title). No referrer.
- A send is fire-and-forget: `fetch` with `keepalive` (or what the documentation says), every failure
  swallowed, nothing retried, nothing shown.
- Library charts are named by their file name without the extension; a chart of the user's own is "own".
  Length buckets for `play_ended`: under 1 minute, 1 to 3, 3 to 10, over 10.
- Calls go where the thing happens once (a play starting is the band starting, not a re-render; a style
  changed is the user's choice, not the first load setting a default). Say in your report where each call
  sits and why it cannot fire twice or on load.
- If an event in the issue's table names something the app does not have, leave it out and say so; do not
  build the feature.
- **Nothing in `stored.ts`, the service worker, `offline.ts`, `hosting/`, `.github/` or `scripts/image.sh`
  changes.** If you find you need one, stop and report.
- `docs/BRIEF.md`: one line at "No server" and one at the non-goals: anonymous counts of use sent to the
  owner's own Umami from production are the exception, and what is never sent.
- The credits screen (`CreditsView.tsx`) gets a short plain line saying what is counted and what is not. No
  banner, no setting, no new screen. Look at it light and dark at phone size (`node scripts/look.ts`).

## The test (tests are rationed: one journey, nothing else)

One smoke journey, added to the named list in `docs/TESTING.md` with its line, in the manner of the existing
journeys: (a) as served (not production): through a play, a style change and a chart open, no request leaves
for another origin; (b) with the page told before it loads that it is production (a hook only an init script
can set, never a URL, hash or query; name it plainly) and the endpoint's requests caught and answered by the
journey itself, the same actions send exactly the events expected, and each payload carries only its allowed
fields; (c) the same with do-not-track set sends nothing. The journey must never reach the real instance:
catch the endpoint before any action and fail if a request gets past. No unit tests.

## Gates

`pnpm check`, `pnpm score`, `pnpm smoke` (its budget is 60 seconds on the clock; report the figure), each run
alone. Engine goldens and scorecards cannot move: nothing under `packages/engine` or `packages/styles`
changes.

## Report

Under 500 words: what the documentation says the endpoint needs, and where you read it; the module's shape;
every event with its exact payload as the journey caught it; where each call sits; what was left out and why;
the gates' figures; anything you could not verify (the real instance receiving is the owner's to see). Kill
every shell and server you left before reporting.
