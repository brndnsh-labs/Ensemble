# Build: a busier soloist, a setting for how busy, and a soloist that can come in at the top (stage 6, during gate 6)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. The owner is playing along with it daily and the week of playing that decides stage 6 is under way. The soloist (`packages/engine/src/players/solo/`) was built to leave a lot of room. He now wants more from it.

## The owner's words

Brandon is a bassist and guitarist. 2026-11-17:

- "soloist density could use some improvement. right now it's a little sparse, which was fine as we were getting started, but i'm thinking it makes sense to ramp things up"
- "maybe a slider to configure soloist density easily up front?"
- "an option to let the soloist enter immediately and start playing things. this will be most helpful on jazz standards where the soloist has to wait the entire 32 bar form to come in while the rest of the band is already fully in motion"

## Read first

`CLAUDE.md`; `docs/BRIEF.md`; `docs/TESTING.md` (binding); `docs/MUSIC_NOTES.md` and `docs/music-notes/b-comping-soloist.md` (the SO- notes: what a solo is, its arc, its space); in `DECISIONS.md` every section on the soloist (search "solo"), "the band in six and twelve", and the "checked and merged" sections of the compound-time builds (each lists what the soloist does in six and twelve); `packages/engine/src/players/solo/` whole; `packages/engine/src/plan/plan.ts` (`soloMarks`, `soloTurn`, `soloClimax`, `soloBreath`, `soloRise`) and `plan/types.ts`; each style's `solo.ts` under `packages/styles/src/`; `test/soloist.test.ts`, `test/takes.ts`; `scripts/rank-solos.ts`.

Two options are already declared in `PlanOptions` (`plan/types.ts`) and read by nothing: `soloFromTop?: boolean` and `soloDensity?: number`. Keep the names: another builder is putting them in the app.

## What to build

### 1. Measure, then make the soloist busier as it comes

Before changing anything, measure the soloist as it is, on each style's own charts and the standards, at the tempo and energy the app plays them, six seeds: notes a second while it has the lead; the share of its time that is silence; the share of its bars that are empty; its longest silence in seconds; each by chorus of the solo (first, middle, last). Keep the script (in `scripts/`, in the manner of `rank-solos.ts`) and put the table in your report: it is the "before".

Then find where the room comes from and say so, lever by lever, with what each is worth. The ones I know of: the arc's stages opening on the sparsest levels; the band's energy and the tempo each moving the level a step (`slotsOf` in `slots.ts`); shapes with bars of rest; `space.roomier`, `space.emptyBars`, `space.breath`; the first phrase's extra empty bar.

Then raise it. What "busier" must still be:

- A solo is still phrases with a breath between them, and a wind instrument still breathes (`instrument.breath`). More playing, not a run-on line: the properties that hold phrasing, breath and patience stay as they are unless you can show one was only holding the old sparseness, and then say which and restate it.
- The arc still starts lower than it ends, and the peak is still the one peak (SO-05, SO-07).
- **Styles are data.** How busy a style's soloist is belongs in that style's `solo.ts`. A jazz alto and a reggae melodica are not raised by the same amount: decide each from the notes and say why. Where the engine holds a number that makes every style sparse, that is an engine change; make it once and say what it does to each style.
- **A property first.** "The soloist is a little sparse" becomes a property (a floor on how much of its lead it plays, in seconds, by style) that fails on the starting commit and passes on yours. Write it, show it failing, then change the data.

Your new default is a proposal for his ear. He will set the final level with the setting in part 2, so build it so that moving a style's default is a change of a line or two of its data, and say in your report how.

### 2. `soloDensity`: how busy, as the player sets it

A number from 0 to 1 the player sets before a take.

- Left out, or 0.5: the style's own, **byte for byte the same take** either way.
- 0: no busier than the soloist is on the starting commit (sparser is fine). 1: as busy as a soloist of the style gets while still playing phrases and still breathing.
- **It moves all the way along.** A style has only a few levels, so a setting that picked a level would have three or four positions and feel broken under a slider. 0, 0.25, 0.5, 0.75 and 1 must each give a measurably different solo, in order: over a style's charts and seeds, notes a second and the share of the lead that is played do not go down as the setting goes up, and the ends are far apart (say how far, in your table). How a position between levels is made (a share of the phrases a level up, less room, fewer bars of rest, a shorter breath, others) is yours to design; say what each quarter of the slider changes.
- **Nothing is drawn by chance that the critic cannot read back.** `slots.ts` reads a solo's slots from the plan alone, so that the critic reads a finished take the way the soloist read the plan. Whatever the setting moves in the slots must be worked out from the plan the same way. Carry the setting on the plan.
- It is the soloist's alone: the band under it plays what it would have played (the same events from the other three seats at every setting, on the same seed). A property holds that.
- The same in every meter and every style, including a style playing a meter it has not written.

Properties, as few as hold it: the order (above), 0.5 the same as left out, the band untouched. `ensemble render` gains `--solo-density <0..1>`; `render:audio` and the audition page gain `density=`.

### 3. Tempo is felt in pulses, not bars

A known fault, logged at the compound-time merges: `slotsOf` judges a tempo by the seconds in a bar (`tempo.slowBar`, `tempo.fastBar`), so a bar of six at a brisk pulse reads as fast and the soloist goes a level sparser, where the same pulse in 4/4 would not. Restate it so the soloist is as busy against the pulse in six, twelve, three and 6/4 as it is in four at the same pulse (`perform/meter.ts` has what you need). A property holds it. Show the compound charts before and after in your table. The soloist playing a major seventh over a dominant tonic in six (A over a B-flat ninth chord; acoustic, reggae, neo-soul) is also logged: if you see why and the fix is small, fix it with a property; otherwise leave it.

### 4. `soloFromTop`: the soloist comes in at the top

In a jam the band plays the form once and the soloist comes in on the second pass (`soloTurn`'s `lead`). With `soloFromTop: true` the soloist has the lead from the first pass, and everything else follows from that as it does now: solos of three choruses with one of rest, the jam's peak and its breath under the solo (`soloClimax` starts its search at the second pass: look), an open jam made again with more passes leaving what was played unchanged. Default false; a song (the chart once through) and a chart with a written Solo section are not changed by it. Properties: with it, the first pass's body is the soloist's in every style; without it, every take is what it was. `ensemble render` gains `--solo-from-top`; `render:audio` and the audition page gain `fromtop=1`.

## What holds it

- **The band is untouched.** Every golden take with no soloist stays byte for byte. Golden takes with a soloist will move, by parts 1 and 3: rewrite them (`pnpm goldens`), and say in `DECISIONS.md` which moved and why. In those, the drums' and the bass's events must be the same as before (the chord instrument plays differently under a soloist only where the soloist's lead bars moved, which without `soloFromTop` they have not): check it and say so.
- **Scorecards.** Rewrite each to a scratch file before and after; report every metric that moved, by style, and which way. Accept the new ones (`score --update`) only where the movement is what this brief asks for (the soloist's density and what follows from it). A metric that got worse and is not about how much the soloist plays is a finding: fix it or report it exactly.
- **Time.** Budgets: `pnpm check` 20 s (now 19.6 on a quiet machine), `pnpm test:full` 60 (55.3), `pnpm score` 120 (61), `pnpm smoke` 60. There is almost no room. New properties read takes the suite already makes wherever they can (`test/takes.ts`); the ones that need a setting play a handful of short takes, not a corpus. The styles' tests run side by side, so the suite's time is its slowest style's: time each style alone (`ENSEMBLE_STYLES=<id> node --test --test-isolation=none test/*.test.ts`) before and after and report both. If the suite cannot stay under 20 s with these properties in it, do not raise the budget and do not drop a property: say by how much it is over and what you would do. Run timed things alone; another builder is using the machine, so time the starting commit beside yours when the load is up. A busier soloist costs the suite more time on every take with a soloist: measure that too.
- Every style on every chart with a soloist, six seeds (`ENSEMBLE_SEEDS=6 node scripts/test.ts`), passes. Report any failure exactly (property, style, chart, seed, message). Then the same with the setting at 0 and at 1, and with `soloFromTop`, by whatever means is cheapest (an environment variable read in `test/takes.ts` for this run only, not left in the suite): a property that fails only at an end of the slider is a finding. Fix it if the fault is the soloist's; if the property was only ever true of the default, say so and what you did.
- Stay out of `packages/app/` (another builder is there), `packages/audio/`, and the other three seats' players. `tools/audition/` and `scripts/` are yours as far as the new settings need.

## For his ear

You cannot hear, and neither can the engineer who checks this. Make the page he will judge from, `out/solo-density/` (not committed; add it to `.gitignore`), in the manner of `out/meter-study-4-funk/` (copied into your clone, with the script that made it in its `src/`): for a jazz standard of 32 bars, a blues, a funk chart and one chart in six or twelve, the same chart and seed with the soloist as it was on the starting commit, then at 0, 0.25, 0.5, 0.75 and 1; and for the standard, the take with and without `soloFromTop`. Long enough that a whole solo of three choruses is heard on the short forms and at least one chorus on the standard. Under each clip, its numbers (notes a second, share played, longest silence). Say in your report what the numbers show; say nothing about how it sounds.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/density`, on a branch `density`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests, add no dependency. Commit on the branch as you go, each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

`pnpm render:audio` and the study script render through headless Chrome. Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Where this brief leaves something open, decide, and write each decision in a new section at the end of `DECISIONS.md` ("a busier soloist, and a setting for it") with a line of why. Your final message is read by the engineer who will check and merge the branch and put the page in front of the owner. It should say: the table before and after, by style (and by setting, for part 2); where the room came from and what you changed, lever by lever, in which file; what each quarter of the slider does; how a style's default is moved; what part 3 changed in six and twelve; how `soloFromTop` changes the plan; the properties added or restated and what each failed on before; goldens and scorecards, what moved; the timings, before and after, each style alone and the whole; the exact results of `pnpm check`, the six-seed run, `pnpm score`; the commits; what you could not verify; anything you saw that is wrong and did not fix. Do not say that anything sounds good: say what you measured.
