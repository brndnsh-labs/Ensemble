# Build: widen funk's pool of grooves, as data, with a measure first (#2242)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. The owner, Brandon, is a bassist and guitarist who plays along with it daily. Nobody on this side can hear. This brief: funk's band draws from a small pool (gate 4: "three kicks, about six riffs, four strums at the working level"; about 57 distinct grooves in 100 seeds), so takes sound alike. Widen it, as data only.

Read the issue: `gh api repos/brndnsh-labs/Ensemble/issues/2242 --jq .body`.

## Read first

`CLAUDE.md` (the standing rules bind you); `docs/TESTING.md` (binding: only its four kinds of test); `docs/MUSIC_NOTES.md`, the funk section of `docs/music-notes/c-styles.md` (`ST-funk-`), the drums and bass parts of `docs/music-notes/a-rhythm-section.md` and the comping part of `b-comping-soloist.md` (CH-46, CH-47 and what they say of funk); every funk section of `DECISIONS.md`; `packages/styles/src/funk/` whole; how the engine draws a kick, a riff and a strum from a style's data (`packages/engine/src/players/`, read only); `packages/engine/src/critic/measures/` and `scorecard/funk.json`; `scorecard/ear-cases.json` for anything Brandon has said about funk (`pnpm -s ears`).

## What to build

- **The measure first, in its own commit**: distinct grooves over funk's own charts and seeds, a groove being the combination of the kick pattern, the bass riff and the guitar's strum a section draws (define it precisely from how the engine draws them, and say how). It reads about 57 in 100 on the starting commit; say exactly what it reads. Reported on the funk scorecard; a target only if you can say why its number.
- **Then more kicks, riffs and strums, as data**, from the notes. Each new figure cited to the note it comes from (or, where the notes give a rule and not figures, written to that rule with the rule cited). Nothing recalled from memory as "a famous groove". Each must hold every property funk already holds (the bass follows the kick; the guitar's push against the bass; the One; ghost and accent levels) at every level and in every meter funk writes (4/4, 6/8, 12/8: a figure for 4/4 alone must not leak into compound time).
- **No engine change.** If one seems needed, stop: that is a missing concept, a separate issue. Say what it would be.
- **Brandon's verdicts stand**: funk's meters in six and twelve passed by ear today; nothing written there may change unless the brief's figures are for those meters too, and then say so.

## What holds it

- Every property holds; other styles' goldens and scorecards byte for byte unmoved; funk's goldens rewritten (`pnpm goldens`) with a `DECISIONS.md` line saying which and why.
- `pnpm score` before and after; report every funk measure that moved; accept (`pnpm -s ensemble score --update`) only what the brief asks, never a drop past tolerance; then paste funk's "against what he has passed by ear" block.
- Budgets you may not raise: `pnpm check` 28 s (about 24.5 now), `pnpm score` 120 s (about 63), `pnpm test:full` 84 s (about 67). Another builder is running on this machine at the same time: if only a time budget is exceeded, rerun alone before believing it.
- Another branch (#2238, double-time bursts in the soloist) is in flight and will add a reported measure to every scorecard, funk's included; funk gets no bursts. Expect a conflict in `scorecard/funk.json` and the end of `DECISIONS.md` at merge; the engineer will resolve it. Do not touch the soloist.
- Stay out of `packages/app/`, `packages/audio/`, `packages/engine/` (except the new critic measure) and other styles.

## For his ear

`out/funk-grooves/` in your worktree (not committed), in the manner of `/home/brandon/code/ensemble/out/solo-displaced/` (copy its `src/` to read how it was made; `.mp3` clips). A spread of the new grooves: each new kick, riff and strum heard in at least one clip, on funk's own charts, drums-bass-guitar alone and with the band, at the working level and one quiet; `main` beside the same take where the groove was drawn. Under each clip: which kick, riff and strum each section drew, and which are new, with the note each comes from. Say what the numbers show, nothing about how it sounds.

## Where you are

Worktree `/home/brandon/code/ensemble/.work/2242`, branch `funk-grooves` from `origin/main`, installed. Work only inside it; read the main tree only for `out/solo-displaced/`. Do not read the `legacy` branch or `~/code/ensemble-legacy`. The repository is public: nothing private in anything committed. Do not push, do not open a pull request, add no dependency, make no network requests.

Commit as you go, staging by path (never `git add -A`, never `--no-verify`, never amend): the measure first with this brief (`prompts/funk-grooves.md`), then the data, then goldens and scorecards with `DECISIONS.md` (a new section at the end of the file). Each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Check `git log -1 --format=%ae` prints `50114222+brndnsh@users.noreply.github.com`; if not, stop and say so.

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`); leave port 8765 alone. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## The report

Under 500 words, for the engineer who will check and merge: the measure (its definition, before and after); each new figure in a line with its source note; any figure considered and left out, and why; goldens and scorecards in numbers; funk's by-ear block; exact results and times of `pnpm check`, `pnpm test:full`, `pnpm score`; where the page is and whether its clips rendered; what you are unsure of.
