# Decisions: the repository

The repository and how work is done in it: the test suite and its time budgets, the tracker and the pipeline, hosting, CI and the release.

## 2026-11-15: three styles inside ten seconds

The property suite cost one style 8.9 s of its 10. With three it took 23 s on a quiet machine. Measured before changing anything: nearly all of it is rendering takes (a take is 13 to 28 ms and a style's run renders about 500); the engine's profile is flat (the random streams 15%, the soloist's likeness 11%, nothing else over 6%), so there is no quick doubling to be had there; and running fifteen test processes on this machine gives the parallelism of about three, because every file rendered the same takes again.

- **One process per style** (`scripts/test.ts`, `--test-isolation=none`): a style's property files run together and a take is rendered once. The styles run side by side.
- **A push plays two seeds; `pnpm test:full` plays six** (`ENSEMBLE_SEEDS`, 60 s budget). `docs/TESTING.md` allows exactly this ("a small seed count on every push and a larger one nightly"). The full run is for before a listening gate and after a merge that changes what a player chooses. A floor on how many cases a property met is written for six seeds and scaled (`enough`).
- **A push samples three things the full run plays whole**: the take played twice for "the same seed is the same take" (one in three of seed 1's); the chart corpus under "a chart with mistakes still plays" (each style a different third); the soloist's special takes (every other kind per chart, slow or medium tempo by turns for the horn).
- Result on a quiet machine: push 9.4 s with three styles (6.1 s with the blues alone), full 19 s. The limit was not raised. The margin is thin: the jazz piano has yet to land, and the next thing to give is the four-minute jams under "the piano stays in its part of the keyboard".
- Halving the seeds alone was tried first and saved little, because every file was still rendering its own copy and half the renders were not `takes()` at all.

## hosting: the app as a small image (stage 6)

Brandon: "i'm leaning toward hosting this on docker04 like the current version of ensemble", and "we can replace what we have at ensembletest.brndn.zip".

- **`hosting/`: a Dockerfile, an nginx config of about fifty lines, and a compose file with one service.** No API, no volume, no secret. `pnpm image` builds the site and then the image around it (`ensemble-app:<commit>`, 125 MB, of which the instruments are 18).
- **It keeps the container contract his test stack's web service already has**, read from the old repo's hosting notes: nginx as uid 101 on port 8080, a read-only root filesystem with `/tmp` as the only writable place, every capability dropped, a `wget` health check on `/index.html`. So only the image reference has to change there.
- **Cache rules**: `/sw.js` is `no-store`; `/assets/*` (named for their contents) are immutable; everything else, the instruments included, is `no-cache`, because pack files keep their names when a pack is cut again. No rewrite to the page for unknown paths: the app keeps its place after the `#`.
- **Checked on this machine**: the container runs locked down as above and reports healthy; each kind of file comes back with the type and cache rule intended; the three smoke journeys pass against it (`SMOKE_URL=... pnpm smoke`).
- **Not done, and Brandon's to decide**: how the image reaches docker04 (the repo is local-only, and his release path pulls from a registry), and what becomes of the test stack's API container and its `/api/*` route, which this app does not use. Nothing on docker04 or in his homelab repo has been touched.
- **Replacing the test site in place is safe for installed copies**: the new worker is at the same `/sw.js`, so a browser holding the old one updates to it, and on taking over it deletes every cache it does not own.

## the app is on the test site (stage 6)

Brandon: "for now, you can feel free to use ssh to get things working".

- **https://ensembletest.brndn.zip serves the new app** since 2026-11-15, commit `972eb20`. The three smoke journeys pass against the live site (offline after install included).
- **How** (`pnpm deploy:test`): the image is built here, loaded onto docker04 over SSH (`docker save | ssh docker04-admin docker load`), given the name the test stack's recipe expects (`ghcr.io/brndnsh-labs/ensemble-web:sha-<this repo's commit>`), and rolled in by the box's own `ensemble-release ensembletest web sha-…`, which waits for health and restores the previous tag if it fails. Nothing else on the box was changed: not the generated compose file, not Caddy, not production.
- **That image name is a local label, not a registry image.** No such tag exists on GHCR. A `docker compose pull` of the test stack (`bin/docker-update ensembletest`) will fail on it.
- **To go back**: `sudo ensemble-release ensembletest web sha-06c97d8ce0fdcd06779d54ecd6b7d42509674c23` on docker04 (the old app's image, still on the box).
- **It will be replaced by the old repo's next merge to main**, whose CI releases both of its images to the test stack. The durable change is in homelab-maintenance and the old repo's CI, and is Brandon's: a one-service recipe for the test stack, the API container and its `/api/*` route retired, and the old CI no longer releasing there.
- **The test site is on the public internet behind Cloudflare.** The instruments it serves are CC0 but for the piano (CC BY, credited on the credits page).
- **Found on the live site: Cloudflare gives the instrument files a four-hour browser cache** (`max-age=14400` in place of the image's `no-cache`), because it caches `.webm` by extension. A pack cut again under the same file names could then be kept stale by the service worker. To fix in the app, not at the edge: put a version in each instrument file's address.
- **Fixed: each instrument file is fetched from an address that carries a mark of its pack's `pack.json`** (`readPack` in the audio package; the offline saver asks for the same addresses). A pack cut again is a new set of addresses, so neither Cloudflare's four hours nor any other cache can hand back an old recording. The worker's instrument cache was renamed, so devices drop the files saved under the old addresses.
- Brandon, on the test site from his phone: "works great, nice job".

## rock, checked and merged; the suite is over its budget (stage 6, part 5)

The builder's diff was read in full: one engine change (`RhythmTier.restrike`, a chord held over a barline struck again more softly, which the plain rhythm already had), three properties reworded for things no style could do before (a bass the arrangement lays out owes no note; a comp that never leans in has no pushes to count; a final chord counts the soloist's note), no property added. The old three styles' goldens and scorecards have not moved.

- **`pnpm check` fails on time: 10.2 to 10.5 s against 10.** Nothing fails but the clock. Each style's properties run in a process of their own: alone they take 4.9 s (rock) to 7.5 s (jazz), and side by side they slow each other, so the suite takes as long as the slowest style plus the crowding. Three styles was 9.1 s. Eight will not fit by any trimming that keeps what is tested.
- **One consolidation made**: a style is now held to a dozen charts written for other styles, spread through the library and starting at a different chart for each style, where it was held to all of them. That stops a new style's charts making every other style's run longer. It saved 0.2 s today.
- **Not decided here**: what the budget is when there are eight styles. `docs/TESTING.md` says a budget is not raised without an entry here, and it is Brandon's rule, so it is his call. Until then the suite is over, and that is said wherever its result is reported.

## the push suite is over its time; material trimmed, not yet timed quiet (stage 6)

With one build still running the push suite read 22.2 s of 20 (load 1.6 at its start), where each style's own tests alone take 9 to 12 s. Six styles now write two more meters each, and every one added charts, takes held at three levels and properties. Trimmed on a push only, the full run unchanged: a held take is on one seed; only a style's own charts in a meter are held; a style's own chart in a meter other than 4/4 is played in every kind on the first seed only. Every property still passes with its floors. **Not yet timed on a quiet machine** (the reggae build took the load to 9 while this was measured): time it when that build is merged. If it is still over, the next cut is the same kind (push samples, the full run covers), and if the push suite cannot hold every written meter inside 20 s the budget's rule, written for eight styles in 4/4, is restated for the meters with a reason, not quietly passed.

## the engine's budget counts written meters as it counts styles (stage 6, 2026-11-17)

- **The rule is restated, with Brandon's word** ("i'm on board with your recommendations for the test suite ... we're packing a lot of functionality in here"). It was written for eight styles in 4/4; there are now 22 written style-meters, each held to every property. On a push: 10 s for three styles, 2 more for each style after the third, and 2 more for each meter beyond 4/4 that the style with the most of them has written. That is 24 s today (five styles have written two) and 26 when jazz has three. The six-seed suite is three times the push budget (72 s today) in place of a flat 60.
- **Why by the style with the most meters and not by the count of style-meters**: the styles are tested side by side, so the suite takes as long as its longest style, and a meter written by a style that has few costs the suite nothing.
- **Why not sample harder instead**: the push suite already plays the other meters on one seed; thinner than that and a fault in six or twelve is found at the gate and not at the push.
- **What is still rationed**: the rules. A new property, a new kind of take or more seeds still has to fit, by consolidating or deleting. The scorecard's and the smoke journeys' budgets are as they were.
## where the push suite's time goes (stage 6, 2026-11-17)

- **Measured, with pickups merged**: typecheck 0.1 s, lint 0.4 s, the suite 23 s. One style alone is 11.4 s (funk), four together 16 s, all nine processes 23.5 s on eight virtual cores. Running fewer at once is slower (26.8 to 28.5 s at four to seven); a larger young generation, single-threaded collection and lazy compilation change nothing. So the suite's time is the machine's whole work, not its slowest style's, and not memory.
- **In one style's run** (a profile of funk): rendering takes is 7.3 s of 11.4, the soloist the dearest seat (2.0 s), then the bass (1.5); the second render that checks a take is the same take again is 2.7 s of that.
- **Not acted on.** The four style-meters fit: jazz's third meter takes the budget to 26 s by the rule. If time is wanted later, the first place to look is the second render (every take twice), then the soloist's critic.

## replacing the old version: the repository and CI (stage 6, 2026-11-18)

Brandon: "i'm considering what it's going to take to replace the existing codebase with this rebuilt one ... there's a lot of plumbing in place with ci/cd already", "we can move quickly since i'm the only on who's going to experience any problems"; then leave to read the old repo's workflows and the homelab repo, "you can push to github", "you can change the homelab recipe".

What the old plumbing is (read, not copied): its CI builds two images (`ensemble-web`, `ensemble-api`) to the organisation's registry, joins the tailnet, and asks one scoped account on docker04 to `release <stack> <api|web> sha-<commit>`; the box waits for health and rolls back. Both stacks run a web container and an account API with its own database.

- **The old repository is kept and the code under it is swapped**: its `main` becomes `legacy`, this repo becomes `main`, with no merge between them. The repository keeps its secrets, its registry package and its release key, and the old code is never in this tree or its ancestry.
- **One workflow** (`.github/workflows/ci.yml`): a push to `main` runs `pnpm check` and `pnpm smoke`, builds the image with `pnpm image`, pushes it as `ensemble-web:sha-<commit>` (the name both stacks already pull), and releases it to the test site. Production is the same release, run by hand with "production" ticked: the version he practises on changes when he says so.
- **The release path is the homelab's own, unchanged**: the same account, key, gate and script. The new image already meets the web service's contract (port 8080, uid 101, the health check, `build.json`), as the test site has shown since 2026-11-15.
- **Budgets are reported on a runner, not judged** (`ENSEMBLE_BUDGET=report` in `scripts/budget.ts`): a budget is a rule about the suite on the machine the work is done on; a shared runner with half the cores would fail it for reasons that are not the suite's. The limits themselves are not moved.
- **Every commit's author and committer address was rewritten** to his GitHub no-reply address before the first push (the repository is public and his own address is private; the old repo's commits use the same no-reply address). The files are byte for byte the same; every commit's name changed, and the 14 references to commits in `DECISIONS.md`, `PLAN.md` and one prompt were moved to the new names. The history before the rewrite is in `.git/pre-rewrite-main.bundle`.
- **A licence and a front page**: `LICENSE` is the AGPL-3.0 the repository already carries; `README.md` is new.
- **The account API is left running and unreferenced** for now: the new app never calls it. Taking it out of the two recipes (and its Caddy route, its backups, its volume) is cleanup after production has held, and nothing of its data is deleted without his word.

## production is the new app (stage 6, 2026-11-18)

Brandon: "let's do prod". Released by the workflow run by hand with "production" ticked: `ensemble.brndn.zip` serves `f70774c`, and the five smoke journeys pass against it (11.7 s). The image it replaced is `ensemble-web:sha-06c97d8ce0fdcd06779d54ecd6b7d42509674c23`; going back is `ensemble-release ensemble web` with that tag on docker04.

- Not checked: a browser that had the old app installed. The journeys run in a clean browser; the old app's service worker is still on his devices until the new one takes over or the home-screen app is removed and added again.
- Left as it was: the account API in both stacks, its database, its Caddy route and its backups. Nothing calls it.

## after the swap: the account API retired, the side door closed (stage 6, 2026-11-18)

Brandon: "Everything looks good, go ahead with the cleanup".

- **The old app's account API is out of both stacks** (`~/code/homelab-maintenance`, commit `30f7314`, with its own tools): Caddy no longer routes `/api/*`; both recipes are the web container alone, now kept by hand there; both API containers are stopped and removed; the nightly dump and its cron job are gone. The web containers were not recreated. Both sites serve as before; smoke 5 of 5 against production afterwards.
- **Nothing of its data was deleted**: both database volumes, the dumps (a final one taken before the containers stopped) and the env files are on the box. Deleting them is his word.
- **Left for him**: the firewall still admits Caddy to ports 8092 and 8093 (changing it needs his grant on the host); the homelab commit is not pushed.
- **`pnpm deploy:test` is retired** (`scripts/deploy-test.sh`): it built here and loaded the image over SSH because there was no remote. A push to `main` is the release to the test site now.
- The commit that retired it (`9788b55`) went out with a comma left at the end of `package.json`'s scripts, which is not JSON; its CI run fails at install and releases nothing. Mended in the next commit.

## the account API's data deleted; his ear on the soloist (stage 6, 2026-11-19)

- **The old account API's data is deleted**, on Brandon's word: "old account data can be deleted, i was the only user". Looked at first, then removed from the Docker host: the volumes `ensemble-api-data` and `ensembletest-api-data`, the dumps (fifteen nightly files a stack, 3.9 MB, the last from 2026-11-18), both `api.env` files and the folders left empty by them. Nothing of the API is left there and there is nothing to restore from; the old code is still the `legacy` branch.
- **The firewall's two rules for the API's ports are removed** (his grant on the host was active): the Docker host admits the edge to the two web ports and to nothing of Ensemble's besides. Deployed with the homelab's own tool, which validated it and reported the rules live; the sites on that host answered afterwards, and both of Ensemble's served the commits they had before.
- **Recorded in the homelab's notes** (`~/code/homelab-maintenance`, commit `aeca33d`, his to push). Its tailnet policy still tests that CI cannot reach the two retired ports; that file mirrors a console only he edits, and a test that something is denied costs nothing, so it is left.
- **The icon on his phone**: "home screen icon looks good". The old home-screen app's handover to the new one was not asked about separately and nothing was reported wrong.
- **The soloist, by his ear**: "soloist changes are sounding awesome, great job!", of the pages for the alto's shakes, scoops and falls (`out/horn-moves/`) and the pickups (`out/solo-pickups/`). The chances stay as merged. The questions those pages were to answer (shakes on most phrase endings in the slower styles; the fall fading or not; half or double the chances) got no complaint and are closed until he raises one.

## where the push suite's time goes, looked at again (stage 6, 2026-11-19)

- **The second render is not the place any more.** "Where the push suite's time goes" named the play-it-again check first. Timed for funk today: the 16 takes it renders a second time cost 0.27 s, comparing their events 0.05 s and writing both MIDI files 0.15 s, of a process of 11.3 s. The 1.5 to 1.9 s the test reports is the first render of the takes it happens to ask for first, which every later property then reads.
- **No property is dear by itself** (jazz and funk, each property timed): after the first renders the slowest are the soloist's setting (0.8 to 1.1 s: it renders its own takes at five settings), the comp that listens (0.9 s, the same reason) and the style's eighths rule (0.8 to 0.9 s); everything else is under half a second. The time is the takes, as it was.
- **So room for the next property that needs its own takes is a choice, not a fix**: fewer takes on a push for the two properties that render their own, or a DECISIONS entry that raises the budget. Not decided here; decided with the build that needs it.

## the engine suite's budget, two seconds more (stage 6, 2026-11-19)

- **Brandon, told the push suite had under a second of room and no cheap saving**: "i'm okay with adding a little budget for tests within reason".
- **The rule's base goes from 10 seconds to 12**: 28 s on a push and 84 s for six seeds at eight styles and three written meters (they were 26 and 78; the last quiet timings were 25.3 and 69.4). Two seconds, not more: it is room for the soloist's next few properties at about a third of a second each, a push stays under half a minute, and the next raise needs its own entry here. The rule still grows only with what the band can play.
- **What it does not excuse**: a new property reads the takes the suite already makes wherever it can, and a build still times each style before and after.

## the old tracker closed; the folders swapped (2026-11-19)

Brandon, wrapping up: "any issues we need to file, clean up, reconcile? i'm okay with 'starting over' or 'wontfix'ing some issues based on what no longer fits", and he would "pick up in the original repo next time". Asked which of three things he wanted, he chose all three as recommended.

- **All 28 open issues are closed as not planned**, each with one comment saying it was written against the previous version (the `legacy` branch) and that what still fits is listed in `PLAN.md`. Every one described the old code: bugs in it, five things this band already does (a pickup into a chorus top, keeping a take, recordings with soft and loud layers, a mix by style, the band building with the soloist), five for a country style there is not, and ideas. The three open milestones are closed. Nothing new is filed: this repo's work is tracked in `PLAN.md` and here, and a tracker of one person's notes to himself was the old way.
- **Six ideas carried by title into `PLAN.md`** ("Resume here"), none started: the tempo breathing with the energy, a band leader's live gestures, recovery after a Bluetooth route change on an iPhone, intensity through who plays, the pianist catching the drummer, country as a style.
- **Four unfinished branches of the old code are deleted from GitHub** (`audition/2135-2167-2165-2017` at `75e1a0e`, `chore/1953-playwright-1.65` at `ad67178`, `wip/head-solo-top-cap` at `ec4b1b8`, `wip/2183-barline-push-predict` at `dd96668`); the old folder on his machine still has them. `legacy` and `main` remain.
- **The folders are swapped**: this repository is `~/code/ensemble` and the old code's folder is `~/code/ensemble-legacy`, renamed and otherwise untouched. `pnpm check` passes from the new path. The session notes kept for the old code are archived beside the new ones and are not read for this code.
- **Left as it is**: the old repository's labels and its project board (harmless, and the board is not reachable by the plain API); Dependabot's security updates, which GitHub runs by itself; the old folder's `main`, which still follows a remote `main` that is now this history (there it should follow `legacy`; it was not edited).

## issues are the tracker again; the pipeline installed (2026-11-20)

Brandon, of the day before: "i think yesterday's call was a bit unintentional. i wanted to clear out the legacy issues from github, but otherwise it's served us well for keeping things organized and staying on track". The 28 legacy issues stay closed; "nothing new is filed" is withdrawn.

- **GitHub issues are where work is tracked**, with the-cycle's pipeline rendered into `.claude/skills/` from `.cycle/config.jsonc` and `.cycle/overlays/` (`standard` profile: `/unblock` is the lane for what waits on his ear). `PLAN.md` is still the map and this file the record. The planned items in `PLAN.md` are to be filed as issues through `/intake`.
- **Issue work lands by pull request and merges itself on green**, his choice of three. The pipeline builds on a branch and the workflow ran only for `main`, so a pull request would have had no checks: `ci.yml` now runs its `build` job for pull requests too (nothing is pushed or released for one), `main` requires that check, and the repository allows auto-merge. Administrators are not held to the rule, so a minor docs edit still goes straight to `main`. A merge is the release to the test site, as a push was.
- **Six statuses**: the pipeline's five and `status:needs-ear`, for work that is merged and waits on his ear or eye; such an issue is not closed by its pull request. All six labels were already in the repository.
- **Six brakes**, each from something here: a production release or the Docker host; publishing anything private (the repository is public); the release path; a sample pack's source or licence; what the app keeps in the browser and the service worker; loosening a gate. Rewriting goldens with a line here stays ordinary work.
- **The gates are `pnpm check` and `pnpm score`**; the smoke journeys run on the pull request, as `docs/TESTING.md` has them.
- **Left**: the old code's labels (`area:*`, `track:*`, `lens:*`, `model/*`, `size/*` and the rest) are still in the repository and unused; no reviewer agents are written (`.cycle/overlays/review-routing.md` lists the domains that would want one). The pipeline asks for Conventional Commit titles (`feat(engine): ...`), which this history has not used; a squashed pull request will carry one.

## what is decided up front, so the pipeline runs without stopping (2026-11-20)

Brandon asked what could be decided ahead to make the work more autonomous, and whether a detour to listen better was worth it; he agreed with the read given ("i agree with your read, thanks"). Written into the pipeline's rules (`.cycle/overlays/doctrine-autonomy.md`, `doctrine-labels.md`):

- **A musical fork never waits on him**: decided, logged here, overruled by ear afterwards. **His ear never blocks the queue**: hearable work merges and waits as `status:needs-ear`. **No more than two unheard changes on one seat** (counted by `area:*` label), so a "not right" does not undo a stack. **Silence after a production release is a pass.** **Big work on an established pattern is pickable** (a style, a meter, a pack). **Still his**: production, the brakes, and a new kind of sound, which gets a study page of alternatives first.
- **Listening better, in this order**, each an issue ahead of the soloist's next work: his past verdicts collected as ear cases and the critic tested on whether it would have predicted them; a reviewer that reads a take as a transcription against the notes; then the ear asked only when a change leaves what he has passed. Not taken up: pictures of a take for the main thread to look at, an audio-analysis model, a corpus of real solos (later, with its licence read), a critic for timbre (later; the audio seldom changes now).
- This does not make anything heard. Feel and timbre stay his.

## state goes to GitHub, knowledge stays in the repo (2026-11-21)

Brandon's direction: what is in flight and what shipped is on the issues and pull requests; `PLAN.md`'s "Resume here" is no longer kept (two sessions at once had both been editing it). `docs/`, `PLAN.md` as the map and this file stay in the repo, versioned with the code and read for free. The pipeline's rules (`.cycle/overlays/doctrine-preamble.md`, `done.md`, `scout-lenses.md`) and `CLAUDE.md` say so (529f9d2b). This file is to be split up later.


## things learned, once kept in PLAN.md's Resume here (2026-11-21, #2259)

Lessons on how the work is done, moved here word for word when "Resume here" was retired. They were headed "Things learned that the next session should not relearn".

- Seats are delegated whole (style type, player, data, validation) with a written brief in `prompts/`; the main session owns the planner, feel, critic framework, tests, docs, and commits. Agents report "properties I believe always hold", which become the property tests, and each new property is checked by breaking the rule on purpose.
- A brief can over-specify. "Bars where the soloist lays out must be note for note what they were" was mine, and it produced a hand that jumped home when the solo ended. Ask for the musical property, not the byte identity, unless the identity is the point.
- A bug found on one kind of take usually lives outside the suite's kinds. The soloist's bugs were all outside four-pass jams at the stock tempo; `soloistTakes` in `test/takes.ts` is the wider set.
- Check `git status` after committing: a hidden error from `git add` once left a commit with the wrong contents.
