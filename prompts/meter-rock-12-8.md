# Build: rock in 12/8 (stage 6, before gate 6)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. Each style's parts are data, written for 4/4. A design now lets a seat write its bar again for another meter (`meters: { "12/8": ... }` on the drums, the bass, the chords and the soloist); jazz is written for 6/4 and the blues for 12/8, and the owner has heard both and passed them ("done listening - great job so far"). Every other style in every other meter still makes a bar up from its 4/4 parts by a general rule ("the fit"). This brief writes the rock style's 12/8.

## The owner's words

Brandon is a bassist and guitarist.

- Of the fit, 2026-11-16: "we definitely aren't capturing a 6/8 feel very well".
- Of the previous version of this app, which is why the notes exist: "drums feel too busy in 6/8, especially obvious on rock; the genre-specific drum energy pushes too hard depending on genre."
- "what's the 'right' way that pro musicians would think of it? should we aim for the pulse?" The tempo figure now counts the felt pulse: the dotted quarter in 6/8 and 12/8.

## Read first

`CLAUDE.md`; `docs/BRIEF.md`; `docs/TESTING.md` (binding); `docs/CHART_FORMAT.md` (meters, tempo); in `DECISIONS.md`: "the band in six and twelve" (the design; its last part is a worked example for exactly this job), "the band in six and twelve: checked and merged", "six and twelve heard; a style's tempo range in a meter", and the section on rock itself; `docs/MUSIC_NOTES.md` and in `docs/music-notes/` everything that names rock, a meter, a pulse or compound time (`a-rhythm-section.md` X-A-13, DR-10, EN-18; `c-styles.md`; `d-audit-history-sounds.md` AU-91 to AU-99, HI-38, EAR-11, EAR-19, SU-D-14). The notes are what was heard and measured in the previous version, not a design to copy; the old code is off limits. Then `packages/styles/src/rock/` whole, and the two written examples: `packages/styles/src/blues/` (12/8) and `packages/styles/src/jazz/` (6/4): their `meters` entries, and the properties that hold them in `test/` (`WRITTEN` in `test/takes.ts`).

## What to build

**Rock in 12/8**: four slow pulses of three eighths, the rock ballad and the fifties slow dance, nothing swung.

- **The drums**: the cymbal on the eighths (all twelve from the working level; thinner when quiet), the kick on the strong pulses with a pickup where the music has one, the backbeat on pulses 2 and 4, fills in eighths. He found rock's drums in six "too busy" in the previous version: the two dotted-pulse properties hold the kick and snare, and your own should say what a quiet bar is.
- **The bass**: roots on the pulses, with the pickup eighth into a pulse where the line wants one; in 4/4 rock's bass drives eighths, and in twelve it must not play all twelve.
- **The piano** (rock's chord instrument): the ballad's triplets, eighths in the right hand through each pulse at the working level and above, a pad or a chord a pulse when quiet; under a solo it makes room as it does in 4/4.
- **The soloist** (the lead guitar): rhythms in eighths and dotted quarters; its bends and its shake are the player and do not change.
- **A chart**: one in 12/8 in `library/`, named `rock-<what it is>.chart`, titled without its key (the study used the fifties changes in 12/8: `out/meter-study-2/src/`; the library's `rock-fifties-c` is the same changes in 4/4, so make this one earn its place by its form: a bridge, a turnaround). Changes and form only: no named tune.
- The blues's 12/8 is the worked example and is not touched.

## What holds it

- **A property comes before the data that satisfies it.** Restate rock's own properties that are held only in 4/4 so they mean something in 12/8 (in pulses: "beat 3" is the second strong pulse), add your style to `WRITTEN` in `test/takes.ts`, and add the few that say this feel is being played and not the fit (run them against the fit first and report which fail). The two every-style properties about dotted pulses (the drummer's time on the eighths; kick and snare never on more than half the eighths, quiet no busier than loud) already apply.
- **Styles are data.** If the style cannot say what it plays without an engine change, the engine is missing a concept: add the smallest one, say so in `DECISIONS.md`, and nothing that is 4/4, 3/4 or 6/4, and nothing the blues plays in 12/8, may change by it.
- **Nothing that exists changes**: every golden take byte for byte (`test/goldens/`); every scorecard on the charts that exist now (rewrite each to a scratch file and compare before you add a chart). Then accept rock's scorecard with the new chart and give the headline numbers for the new chart alone.
- **Tempo**: `tempoRange(style, meter)` gives a style two thirds of its 4/4 range in a dotted-pulse meter unless the style says otherwise in `tempo.meters`. Say what rock's range in 12/8 should be and write it if the default is wrong.
- Budgets, none raised: `pnpm check` 20 s (now about 16.2), `pnpm test:full` 60 (about 44), `pnpm score` 120 (about 58), `pnpm smoke` 60. Run each alone: they are timed, and another builder is using the machine.
- Run rock on every chart and every style on your new chart before you finish (`pnpm test:full` hands every style every chart once; also play your new chart under each of the eight styles in every kind of take on six seeds, as the design's builder did, and report any failure exactly: property, style, chart, seed, message). A failure in another style on your chart is a finding: fix it if it is small and clear, otherwise report it.

## For his ear

You cannot hear, and neither can the engineer who checks this. Make the page he will judge from, `out/meter-study-3-rock/` (not committed), in the manner of `out/meter-study-2/` (in your clone, not committed; its `src/` has the script that made it, and the audition page takes `fit=1` to play the fit): the same take before (the fit) and after (written), the whole band, the drums and bass alone, and with the soloist, at two levels of the band (quiet and working), with each bar's grid printed. Say in your report what the grids and the properties show; say nothing about how it sounds.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/rock128`, on a branch `rock128`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests, add no dependency. Another builder is at work in another clone on acoustic in 6/8: stay out of `packages/styles/src/acoustic/`, its charts and its scorecard; you will both add a line to `WRITTEN` in `test/takes.ts` and a section to `DECISIONS.md`, which the engineer will merge. Commit on the branch in a few sensible commits (properties; the parts, a seat at a time; the chart; the scorecard and decisions), each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

`pnpm render:audio` and the study script render through headless Chrome. Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Where this brief leaves something open, decide, and write each decision in a new section at the end of `DECISIONS.md` ("rock in 12/8") with a line of why. Do not invent a design where the brief and the notes run out: build the rest and say what you left. Your final message is read by the engineer who will check and merge the branch and put the page in front of the owner. It should say: what each seat plays at each level, from the grids; the properties restated and added, what each holds, and which failed against the fit; any engine change and why; the tempo range; the chart (form, key, tempo, bar by bar); that the goldens and existing scorecards are unchanged, and the new chart's numbers; the every-style results; the timings against the budgets; the commits; what you could not verify; anything you saw that is wrong and did not fix.
