# Design and build: the band in six and twelve (stage 6, before gate 6)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. The band plays 4/4 from written material: each style's grooves, bass lines, comping figures and solo rhythms are data, written for four beats. In every other meter it makes a bar up out of that material by a general rule. The owner has listened to what that rule gives in 6/8, 12/8 and 6/4 and it is not good enough. This brief is to design how a style plays a meter it has something to say in, build it, and prove it on two feels he knows well.

## The owner's words

Brandon is a bassist and guitarist. 2026-11-16, after a study of the band in compound time (`out/meter-study/` in your clone, not committed: a page of clips, and in `src/` the charts and the script that made them, which also prints one bar of each player as a grid):

- "do we need to design proper 6/8 and 12/8 support?"
- "we definitely aren't capturing a 6/8 feel very well"
- "i think we should have fable design this properly"

Of the previous version of this app, 2026-05-27, which is why the notes below exist: "6/8 playback feels jumbled — All Blues + 6/8 should sound like a Miles Davis jazz waltz but doesn't." And of drums in 6/8 then: "drums feel too busy in 6/8, especially obvious on rock; the genre-specific drum energy pushes too hard depending on genre."

He asked for All Blues and Footprints in the library with the other standards; they were held back for this.

## What exists

- `packages/engine/src/perform/meter.ts`: a bar is its pulses (quarters where the meter counts them; dotted quarters in 6/8 and 12/8; 7/8 as 2+2+3). `perform/feel.ts`: swing only where every pulse is a quarter. The drums fit a 4/4 groove to a bar a beat for each pulse (`players/drums/groove.ts`, `fitMeter`); the bass plays a note a pulse; the chords and the soloist do what you will find when you read them.
- The study's grids, one bar each: in 6/8 as jazz the ride plays both pulses and the last eighth, the bass two notes, the chords once; in 12/8 as blues the drums are the 4/4 shuffle, the bass four notes, the chords once a bar where in 4/4 they comp on two and four; in 6/8 as acoustic the bass plays once a bar. The drums come through the fit; the bass and the chords thin to almost nothing; and nothing anywhere is the feel itself (a slow blues with the triplets in the hat and the piano; a blues in six as Miles Davis's band played it).
- What the previous version learned the hard way, which you must read before designing: `docs/music-notes/d-audit-history-sounds.md` (AU-91 to AU-99, HI-38, EAR-11, EAR-19, SU-D-14), `docs/music-notes/a-rhythm-section.md` (X-A-13, DR-10, EN-18 and whatever else names a meter or a pulse), `docs/music-notes/c-styles.md` (each style's "Meter" line, such as ST-blues-06 and ST-jazz-07; "There is no 12/8 slow-blues groove"). They are notes on what was heard and measured, not a design to copy; the old code is off limits.
- The library has two charts in 3/4 (`jazz-waltz-f`, with a golden take; `acoustic-waltz-c`) and none in any other meter but 4/4. Thirteen of the properties are held only in 4/4 (`test/*.test.ts`).
- Styles are data and the engine is pure (`CLAUDE.md`): if a style cannot say what it plays in six, the engine is missing a concept; add the concept, then say it as data.

## What to design

Write the design first, as a new section at the end of `DECISIONS.md` ("the band in six and twelve"), and commit it before any code, as the acoustic style's design was ("acoustic, and a guitar that picks" is the model: what the concept is, what a style writes, what the engine decides, and what was considered and not done). Where the code ends up differing, say so there afterwards. It must answer:

1. **The concept.** How a style says what it plays in a meter, for each of the four seats: the drums' groove, the bass's line, the chord instrument's figures, the soloist's rhythms. By the meter as written, by a family of meters (what kind of pulse and how many), or another way: decide, and say what a chart in 6/8, 12/8, 6/4, 9/8, 3/4 and 5/4 each gets. Where a style has written nothing for a meter, the general fit that exists stays, so that every style still plays every chart.
2. **What a bar of six is.** A tune in six may be two slow pulses (6/8) or six beats (6/4) or two bars of three. Say what each notation means to the band, which one All Blues and Footprints are written in and why, and whether a chart's writer needs to care.
3. **Tempo.** Today the tempo figure counts quarter notes in every meter. That was the owner's call in the previous version ("so that one number is one speed everywhere and matches other music software"), and it makes a slow blues felt at 60 read 90 in 12/8. Propose: keep it, or count the pulse, with what each costs in the format (`docs/CHART_FORMAT.md` is a specification), the app's tempo control, each style's tempo limits, and exported MIDI. Do not change it; put the question to him in your report with a recommendation.
4. **What holds it.** The properties that say a bar of six or twelve is being played as one: restate the ones that are held only in 4/4 where they mean something in other meters (a rule that says "beat 3" means "the second strong pulse", AU-97), and add the few the notes name (where the ride's skip goes, AU-92; that drums thin out as the band gets quiet and never play kick and snare on every eighth, AU-96). `docs/TESTING.md` is binding: properties are one of the four kinds allowed, and the engine suite has a budget that is not raised (`pnpm check`: 20 seconds with eight styles; `pnpm test:full`: 60; `pnpm score`: 120). A property comes before the code that satisfies it.
5. **The rest of the band's world.** The count-in, the ending and its button, fills and setups, the arrangement's hits (EN-18), the lead-in, the take's shape over passes: each either already speaks in pulses or needs to. And outside the engine: the app's chart (does a bar of 12/8 with four chords draw as it should), the playhead, the count-in a player hears, the editor's meter, the exported MIDI file's time signature. Find what is wrong and fix what is small; list what is not.

## What to build

- The concept, in the engine.
- **Jazz in six**, written: the feel of a modal blues in six, ride, bass and comping each as that music is played, and the soloist's rhythms. Then `library/standard-all-blues.chart` and `library/standard-footprints.chart` (changes and form only; titled as the tunes are known; see how the other `standard-` charts are written and tested).
- **Blues in twelve**, written: the slow blues, with the triplets where they belong in the kit and the chord instrument, and a bass line that is a slow blues bass line. Then a slow blues chart in 12/8 in `library/` (the two slow-ish twelve-bars the library had were cut as tempo copies of each other; in twelve it earns its place).
- **Not the other styles.** Acoustic in 6/8 and rock in 12/8 are next, as data, by another builder from your design: make sure the design and one worked example tell them how. Funk, disco, reggae and neo-soul keep the fit.
- **Nothing that is 4/4 changes, and the waltz does not change**: every golden take byte for byte, every scorecard for charts that exist now (rewrite each to a scratch file and compare). If the design finds 3/4 should be written too, say so and leave it: that golden was passed by his ear.
- Run every style on every chart before you finish (in `test/takes.ts` make `otherCharts` return all of `others`; each style with `ENSEMBLE_FULL=1 ENSEMBLE_SEEDS=6 ENSEMBLE_STYLES=<id> node --test --test-isolation=none test/*.test.ts`; put the file back): the new charts under all eight bands included.

## For his ear

You cannot hear, and neither can the engineer who checks this. Make the page he will judge from: `out/meter-study-2/` (not committed), in the manner of `out/meter-study/`: for jazz in six and blues in twelve, the same take before (the fit) and after (written), the whole band and the drums and bass alone, with each bar's grid; and the fit's clips for acoustic 6/8 and rock 12/8 unchanged, as what is still to do. Say in your report what the grids and the properties show; say nothing about how it sounds.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/meters`, on a branch `meters`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests, add no dependency. Commit on the branch: the design first, then the properties, the concept, each feel, the charts; each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

Read first: `CLAUDE.md`; `docs/BRIEF.md`; `docs/CHART_FORMAT.md` (meters and valid slot counts); `docs/TESTING.md`; `docs/MUSIC_NOTES.md` and the parts named above; `PLAN.md` "Resume here"; in `DECISIONS.md` "acoustic, and a guitar that picks", "the library: pruned, renamed, and given standards", and "playing in six and twelve is to be designed". Then the engine's players and a style or two whole (`packages/styles/src/jazz/`, `blues/`).

Run `pnpm check` alone: it is timed. `pnpm render:audio` and the study script render through headless Chrome. Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## The report

Your final message is read by the engineer who will check and merge the branch and put the page in front of the owner. It should say: the design in a page (the concept; what a style writes; what the engine decides; what each notation of six means); what was built and what each of the two feels plays, seat by seat, from the grids; the properties restated and added, and what each now holds; the tempo question with your recommendation; what you found and fixed, or left, outside the engine; that the goldens and the existing scorecards are unchanged, and the new charts' scorecards; every-style-on-every-chart's result; the timings against the budgets; the commits; what the next builder needs to write acoustic in 6/8 and rock in 12/8; what you could not verify; anything you saw that is wrong and did not fix.
