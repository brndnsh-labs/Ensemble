# Ensemble

A browser-based generative backing band. Read these before doing anything:

1. `docs/BRIEF.md` (what and why)
2. `docs/CHART_FORMAT.md` (the song text format; a spec)
3. `docs/TESTING.md` (what may be tested; binding)
4. `docs/MILESTONES.md` (stages and gates)
5. `docs/MUSIC_NOTES.md` (musical knowledge carried over from the previous version: an index, plus four parts under `docs/music-notes/` to read when the work touches them)
6. `docs/AUDIO_NOTES.md` (what the previous version learned about sample packs, mixing them, and phones; read when the work touches audio)
7. `PLAN.md` (the map) and `docs/decisions/` (the record, a file for each area; its README says which). What is in flight and what shipped is in the GitHub issues and pull requests, not in a file

## Standing rules

- **The engine is pure.** `packages/engine` has no DOM, no audio, no I/O, no clock, and no `Math.random`. Text and a seed go in, events come out. Same inputs, identical output.
- **Boundaries hold.** `app` and `audio` may import `engine`. `engine` imports nothing from them. `audio` knows nothing about music theory. The app turns a take into sounds (`packages/app/src/play/jam.ts`); nothing else joins the two.
- **Styles are data.** Adding or tuning a style must not require engine changes. If it does, the engine is missing a concept: add the concept, then express the style as data.
- **You cannot hear.** Never claim something sounds good. Report what the properties and the critic scorecard say, write audition files, and let Brandon judge.
- **Tests are rationed.** Only the four kinds in `docs/TESTING.md`. Do not add per-function unit tests, mocks, or Playwright specs outside the named smoke journeys.
- **Feedback from a listening gate becomes a property or a critic metric first**, then a code change.
- **Decide and log.** When the docs do not settle something, make the call, record it in `docs/decisions/` (its area's file) with one line of rationale, and continue. Stop and ask only when a choice would be expensive to reverse and could reasonably go either way.
- **Stay in scope.** `docs/BRIEF.md` lists non-goals. Do not build them.
- **Check current versions.** Do not assume library versions or APIs from memory. Look them up when adding a dependency, and prefer few dependencies.

## The repository

- **It is public** (github.com/brndnsh-labs/Ensemble, AGPL-3.0). Everything committed is published: no secrets, no private addresses, nothing about the network the sites run on beyond what is already here. Commits carry Brandon's GitHub no-reply address (the repo's own `user.email`); check it before the first commit on a new machine.
- **Work is tracked in GitHub issues and built through the pipeline** (`.claude/skills/`: `/next`, `/intake`, `/cycle`, `/review`, `/scout`, `/unblock`; its rules are `.claude/skills/DOCTRINE.md`). The skills are rendered from `.cycle/config.jsonc` and `.cycle/overlays/` by `cycle update`: change those, never a rendered skill. `PLAN.md` stays the map and `docs/decisions/` the record.
- **Issue work lands through a pull request**, on a branch from `origin/main`. `main` requires the `build` check (`pnpm check`, `pnpm score`, the smoke journeys, the image), and a pull request merges itself when that is green (`gh pr merge --auto --squash`). A minor docs or tooling edit may still go straight to `main`.
- **A merge or push to `main` is a release to the test site.** Production is released by hand and only when Brandon has asked for it.
- **The old version is the `legacy` branch.** Do not read it, merge it or copy from it: `docs/MUSIC_NOTES.md` and `docs/AUDIO_NOTES.md` are what was carried over.
- **Something for Brandon's ear or eye is a page**, written under `out/` (not committed) with what was measured beside each clip or picture, and nothing merged on a claim that it sounds or looks good.

## Commands

```sh
pnpm install            # once
pnpm check              # typecheck, lint, tests (budget: 12 seconds, 2 more for each style after the third, 2 more for each meter the busiest style has written beyond 4/4: 28 now)
pnpm typecheck          # tsc --build across packages
pnpm lint               # biome check; `pnpm format` to fix
pnpm test               # engine suite under the budget: every property, two seeds
pnpm test:full          # the same on six seeds (three times the push budget: 84 seconds); run before a gate
pnpm score              # every style's scorecard against its accepted baseline (2-minute budget)
                        # on a branch it also sorts the change against what Brandon has passed by ear: inside, or the measures outside
pnpm ears               # Brandon's verdicts by ear (scorecard/ear-cases.json) beside the scorecards as they stood in git: which
                        # measures told a band he refused from its answer, and where today's sits against what he has passed;
                        # it fails first on a case whose source names a file or heading that is not there (`--check`: only that, as CI runs it)
pnpm goldens            # rewrite the golden takes (then say why in docs/decisions/)
pnpm gate:1             # write a gate's audition files to out/gate-1/ (also gate:2, gate:3, gate:4)
pnpm ensemble <command> # the CLI; runs TypeScript directly on Node 26, no build step
pnpm packs:fetch [id...] # fetch the sample libraries into .sources/ at their pinned versions (needs git and 7z)
pnpm packs:cut [id...]   # cut instrument packs into assets/packs/ (needs an ffmpeg with soxr and libopus)
pnpm app [--host 0.0.0.0] [--port 8766]   # the app, served for development (no service worker)
pnpm app:build          # build the app into packages/app/dist: a static site, packs and service worker included
pnpm smoke              # the browser smoke journeys against the built app (60-second budget; needs Google Chrome)
                        # SMOKE_URL=https://... pnpm smoke runs them against the app wherever it is served
git push                # a merge or push to main is the release to the test site: CI (.github/workflows/ci.yml) checks, builds the
                        # image and releases it to https://ensembletest.brndn.zip. The repository is public.
gh workflow run ci -f production=true   # the same, and production too (https://ensemble.brndn.zip). Only when Brandon has asked.
pnpm image              # build the app and its image (hosting/): ensemble-app:<commit>, an unprivileged nginx; needs docker
node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]
                        # look at the app in headless Chrome and save a picture; for checking work, not a test
pnpm audition [--host 0.0.0.0] [--port 8765]   # serve the audition page at /tools/audition/: play a take from the packs
pnpm levels [style...]  # each seat's loudness and the soloist's against the band, rendered and measured; before an ear is asked
pnpm render:audio <name> chart=<file> [style=] [seed=] [passes=] [solo=alto-sax] [density=0.75] [fromtop=1] [only=bass] [live=1]
                         # render a take to out/audio/<name>.wav in headless Chrome; live=1 plays it in real time and counts late notes
```

The CLI:

```sh
pnpm -s ensemble parse  library/blues-12-bar-a.chart
pnpm -s ensemble fmt    library/blues-12-bar-a.chart [--write]
pnpm -s ensemble render library/blues-12-bar-a.chart --out take.mid [--save take.json] \
    [--style blues] [--seed 1] [--minutes 3 | --passes 4] [--song] \
    [--solo | --solo-instrument alto-sax] [--solo-density 0.75] [--solo-from-top] \
    [--tempo 96] [--energy 0.3] [--key Bb] [--without bass] [--no-count-in]
pnpm -s ensemble replay take.json --out take.mid
pnpm -s ensemble read   library/blues-12-bar-a.chart [the take flags of render] [--bars 13-24] [--seats solo,bass] [--timing]
                        # the take as a transcription: each bar, each seat's notes, roles and moves, for reading
pnpm -s ensemble score  [chart...] [--style blues] [--seeds 200] [--update | --check]
```

A take is its chart, style, options, and seed: the same four always give the same MIDI file. `score --update` accepts the current scorecard as the baseline in `scorecard/<style>.json`.
