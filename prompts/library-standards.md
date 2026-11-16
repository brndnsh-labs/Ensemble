# Build: the built-in library, pruned, renamed, and given standards (stage 6, before gate 6)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. The app ships a library of built-in charts, `library/*.chart` (51 of them). This brief looks at that library critically and adds the jazz standards the owner asked for. The charts are also the material the band's properties are tested on, which is half the reason for the standards.

## The owner's words

Brandon is a bassist and guitarist. Verbatim, 2026-11-16:

- "another thing i want to look at is the library itself with its presets. we can probably simplify and look critically at what we have to make sure it's all relevant. i don't mind having some burner chord progressions, but things like 'numerals' stand out as useless since that's just a toggle in the app anyway (same with any key, honestly)"
- "i'd also like to add back some common standards that also serve as useful tests for the band. stuff like autumn leaves, stella by starlight, all the things you are, night and day, giant steps, all blues, etc"
- Earlier the same day: "the band is very adaptable and can play any chart in any genre we support ... everything is easily customizable anyway"

An earlier decision (`DECISIONS.md`: "The progressions are common property; none is a named tune") is overturned by his word. What still holds is `docs/BRIEF.md`: "Chord changes and form only: no melodies, no lyrics."

## The rule for what stays

A built-in chart earns its place by its changes or its form: something to practise over that no setting gives you. Key, tempo, style and names-or-numerals are settings in the app. A chart that differs from another only by one of those goes.

### Cut

- `blues-numerals-bb` (numerals are a setting). The chart tests read the library as their corpus (`test/chart.test.ts`): if anything there leans on this chart for the format's numerals, keep that coverage by putting the chart among the tests' own material, not in the library. Say what you found.
- `blues-quick-change-e` and `blues-slow-g`: the same twelve bars as each other at two tempos, and the body of `blues-intro-outro-d` is already a quick-change twelve.
- `jazz-falling-fifths-gm`: it is Autumn Leaves under another name. The standard replaces it.
- `jazz-modal-dm`: it is So What's form. The standard replaces it.
- `jazz-ballad-eb`: Body and Soul replaces it as the ballad.

Everything else stays. If, reading the rest, you find another chart that differs from a neighbour only by a setting, say so in your report and leave it: the owner decides.

### Rename

No key in a title: the key is a setting, and every list shows it beside the title. "12-Bar Blues in A" is "12-Bar Blues"; "Rhythm Changes in Bb" is "Rhythm Changes"; "Minor Blues in A minor" is "Minor Blues"; "Funk in C with Intro and Outro" is "Funk with Intro and Outro"; "Minor Reggae, One to Flat Seven, in E minor" is "Minor Reggae, One to Flat Seven"; "Riff in D" is "Rock Riff"; "Minor Rock in A" is "Minor Rock"; and so on through all of them. Titles must stay distinct from one another and say what the chart is. **File names do not change for a chart that stays**: the golden takes, the scorecards, the app's addresses and what a player has kept are all named by them.

## The standards

Each as its own chart, `style: jazz`, titled as the tune is known, in the key it is most often called in, at a tempo it is usually played at (inside the jazz style's limits: `packages/styles/src/jazz/index.ts`), with the changes most players and fake books agree on. Where sources differ, take the plainer, commonly played version, not a reharmonisation. Sections are labelled by the tune's form (A, A2, B, C), a comment at the top says what the form is and what makes the tune worth practising (as the existing charts do), and the format's own means (repeats, endings, a section played again by its label) are used where they make the chart shorter and clearer to read. Run `pnpm -s ensemble fmt <file> --write` on each. `docs/CHART_FORMAT.md` is the specification; `docs/music-notes/` has what the band knows about jazz.

Name the files `standard-<tune>.chart` (see "The tests" for why).

| Tune | Why it is here |
|---|---|
| Autumn Leaves | two-five-ones round a major key and its relative minor |
| All the Things You Are | 36 bars, the cycle through four keys |
| Stella by Starlight | half-diminished and altered chords, a key that will not sit still |
| Night and Day | the flat-six major chord, a chromatic descent, 48 bars |
| Giant Steps | keys a major third apart, two chords a bar, as fast as the style goes |
| All Blues | a blues in six |
| So What | sixteen bars on one chord, a half-step up, back |
| Take the "A" Train | AABA with the two chord as a dominant |
| Body and Soul | the ballad; a bridge a half-step up |
| Summertime | sixteen bars, minor |
| Cherokee | 64 bars, fast, a bridge of two-fives falling through four keys |
| Have You Met Miss Jones | a bridge that moves by major thirds at an easy tempo |
| Footprints | a minor blues in three, with its own turnaround |
| There Will Never Be Another You | ABAC |

**All Blues and Footprints**: find out which meters the engine and the jazz style really play (the library has 3/4; the format allows `n/2`, `n/4`, `n/8`). Write each in six if the band plays six properly (the properties hold and the drums, bass and comping are each written for it); otherwise as 3/4 with two bars for each bar of six, and say which and why. Do not add a meter to the engine or the style in this brief.

**Check your changes.** For every standard, write in your report the form and bar count, the key, and one line on any place where you chose between versions. The engineer reading it knows these tunes and will check each chart bar by bar.

## The tests

Read `docs/TESTING.md` (binding) and `test/takes.ts`. The library is the test corpus: a style's own charts (file names beginning with its id) are played in every kind of take on every seed; every other chart is handed round the styles a few at a time. Fourteen more charts named `jazz-` would be fourteen more charts in every kind and seed, and the push suite has a budget (`pnpm check`: 20 seconds with eight styles, now about 16; `pnpm test:full`: 60; `pnpm score`: 120). **No budget is raised.** Hence `standard-`: decide, by measuring, how the standards are played on every push so that they are in fact "useful tests for the band" (at the least, the jazz band plays each standard once, soloist included, on every push), and how fully under `ENSEMBLE_FULL`. Say what you chose and what it costs in seconds.

Then run **every style on every chart**: in `test/takes.ts`, make `otherCharts` return all of `others`, run each of the eight styles with `ENSEMBLE_FULL=1 ENSEMBLE_SEEDS=6 ENSEMBLE_STYLES=<id> node --test --test-isolation=none test/*.test.ts`, and put the file back. Report every failure exactly: the property, the style, the chart, the seed, the message.

**When a property fails on a standard, that is the standard doing its job.** Do not weaken the property and do not bend the chart to get past it. Find the cause.
- If it is a plain fault with a small, clear fix (in a style's data or in the engine), fix it, and show the failing case and why the fix is right. The engine's rules in `CLAUDE.md` hold (pure; styles are data). Every golden take must stay byte for byte what it is; if a fix would change one, do not make it.
- If it needs a decision about how the band should play (a new concept, a judgement about style), do not make it: leave the chart in `library/`, keep it out of the failing property's material in the least intrusive way you can, mark that clearly in the code, and report it in full. Those are for the engineer.

**Goldens and scorecards.** The goldens (`test/goldens/`) must pass unchanged: the charts they are takes of keep their files and their bars. If one changes, stop and find out why. The scorecards (`scorecard/<style>.json`, `pnpm score`) are measured over the library: where a baseline moves because the charts did, accept the new one (`pnpm -s ensemble score --style <id> --update`) and give the headline numbers before and after for each style in `DECISIONS.md`. A number that moves a long way because of a standard is worth a line in your report.

## Everything that names a chart

Find every place a library chart is named by file or by title and bring it in line: `packages/app/src/` (the first-visit charts in `HomeView.tsx`; anything else), `smoke/app.spec.ts` (the journeys name "12-Bar Blues in A" and "Rhythm Changes in Bb", and a downloaded file by its title: change the names and nothing else about what a journey proves), `scripts/` (the gate and study scripts name charts), `docs/`, `tools/`. `pnpm app:build && pnpm smoke` must pass.

Another builder is at work in another clone at the same time, on the app's editor (`packages/app/src/edit/`, `packages/app/src/play/`, `packages/app/src/style.css`). Stay out of those files. In `smoke/app.spec.ts` change only the titles and file names of charts.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/library`, on a branch `library`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits, even though it had these tunes), do not push, fetch or deploy, make no network requests: write the standards from what you know. Commit on the branch in a few sensible commits (the cuts and the renames; the standards; the tests; any fix, each on its own), each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

Read first: `CLAUDE.md`; `docs/BRIEF.md` (section 13 and where the library is described); `docs/CHART_FORMAT.md`; `docs/TESTING.md`; `PLAN.md` "Resume here".

Run `pnpm check` alone: it is timed. Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Where this brief leaves something open, decide, and write each decision in a new section at the end of `DECISIONS.md` ("the library: pruned, renamed, and given standards") with a line of why; say there that the earlier "none is a named tune" is overturned by the owner's word and that the charts hold changes and form only. Your final message is read by the engineer who will check and merge the branch. It should say: what was cut and renamed (the full list of old and new titles); each standard as described under "Check your changes"; the meter question's answer; how the standards are tested on a push and in full, and the timings (`pnpm check`, `pnpm test:full`, `pnpm score`, each run alone, with their budgets); every failure the every-style-on-every-chart run found, what you fixed and what you left; the scorecards' numbers before and after; that the goldens are unchanged; what changed in the smoke journeys and everywhere else a chart was named; the commits; anything you saw that is wrong and did not fix. You cannot hear: do not say how anything sounds.
