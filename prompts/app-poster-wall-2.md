# Build: the poster wall, part 2: the chart's screen (stage 6, before gate 6)

You are working on Ensemble, a backing band in a browser. The owner chose a look from a design study ("the poster wall") and part 1 of it is merged: the visual system, home, one library, and the row of places at the top left of every screen. This brief rebuilds the screen a chart is played on, to the study's drawing. A third brief, after yours, makes Edit a mode of this screen; leave the editor alone.

## The owner's words

Brandon is a bassist and guitarist; the phone (an iPhone 17) sits beside his instrument, and he also uses a laptop.

- "seems difficult to navigate though - we should work on that. the audio we've cooked up is genuinely impressive, and i want the app to look and feel visually impressive as well. welcoming vibes, fun place to practice, but still snappy and responsive"
- Of the study's direction A: "the poster wall looks really cool, i haven't seen anything like that in a while. reminds me of metro ui in the best way"
- "the band is very adaptable and can play any chart in any genre we support ... with the idea that everything is easily customizable anyway"
- Earlier, of the screen as it is: he asked for Stop that stops at once with Finish beside it, the band's buttons muting live while it plays, and the chart large in a serif. All of that exists and must stay.

## The study is the specification

It is in your clone at `out/look-study/` (not committed; do not commit it). The chart's screen as drawn is `a/chart-<id>.html`, and a page opens in a state by its address: `#play`, `#tempo`, `#style`, `#key`, `#length`, `#more`. The pictures are `shots/a-10` to `a-20`, `a-22`, `a-23`, `a-25` (dark, playing) and `a-28` (laptop, playing). Open the pages in a browser, press things, read the stylesheet and script inside a page. Match direction A. Direction B (`shots/b-*`) was not chosen; do not draw from it. Where the study only sketched something (it has no sound, its key change is its own table, its edit is a stub), the real app's behaviour stays. Where the study and this brief disagree, this brief wins.

The screen today is `packages/app/src/play/` (`PlayView.tsx`, `Stage.tsx`, `StatusStrip.tsx`, `useJam.ts`, `rig.ts`, `jam.ts`, `TakeView.tsx`) and `style.css`. Before Play it has fourteen controls of equal weight. Read all of it, and part 1's pieces you will use: `Trail.tsx`, `posters.ts`, `PosterName.tsx`, `address.ts`, the ink tokens at the top of `style.css` (`--spot`, `--press`, `--on`, `--under`; `main.play` already carries `data-style` of the style being played).

## What to build

### 1. The setup as a sentence

Under the chart's title, one line in place of the four boxes (Style, Key, Tempo, Length) and the grey facts line: "**Blues** in **A** at **100 bpm**, **about 3 min**", as the study sets it. Each part in bold is pressed to change that one thing, and opens a sheet:

- **Style**: the eight styles, each in its ink, the one being played marked. Choosing one closes the sheet.
- **Key**: every key the picker offers now, the written one said to be the written one.
- **Tempo**: the figure large, minus and plus (the steps and the style's limits as now), and the way back to the chart's own tempo when it has been changed.
- **Length**: what the Length picker offers now, "The song, once through" included where the chart has an arrangement.

A sheet is one new component, used for all of these and for More: it rises from the bottom on a phone (140 ms; closes at once; no movement under `prefers-reduced-motion`), sits as the study draws it on a laptop, is closed by a press outside it, by Escape and by its own Close, keeps keyboard focus inside while open and gives it back to what opened it, and is announced as a dialog. The sentence is set-before-Play, as the boxes were: while the band plays it reads as a statement and its parts are not pressed (say so to a screen reader too).

### 2. More

One button, "More", at the top right beside Edit, opening a sheet that holds everything rarely wanted, in this order:

- How the chords are written: three choices that say what they are ("Names: A7", "Numerals: I7", "Both"), in place of "C7 / V7 / Both".
- Focus mode (as it works now, and still left the way it is left now).
- The band's instruments where there is a choice: what the chords are played on (only where the style offers more than one), and what the soloist plays. These are the two pickers that now sit under the Band row.
- Kept takes of this chart (the list that is now under the chart when it is not playing).
- Export MIDI of the take just played or playing (when there is one), and Export the chart's text.
- For a chart of his own: Rename, Duplicate, Delete (asking first). For a built-in chart: Make a copy to edit.

Keep stays out of More, beside Stop and Finish, where it is.

### 3. The dock

The bottom of the screen is one block, as the study draws it: the status strip (the passes, the time, the shape of the take), the band, and the transport.

- Before Play: on paper, with one large Play in the playing style's ink.
- While the band plays: the whole dock floods with the playing style's ink (no transition), Play is Stop in the press ink where Play was, with Finish and Keep beside it, as the study draws them. Everything about how they work stays: Stop at once and in one press; the space bar; Finish once, then "on its way home"; the 0.4 s guard against the tap that started the band also stopping it; nothing moves under a thumb between idle and playing.
- The four players are four blocks, each naming its seat and what it is played on ("Bass", "Upright bass"). They are the mutes they are now: pressed while playing, a seat in the take is silenced and brought back in time; a seat that was out says it comes in next time; what is silenced when the band stops is out at the next Play. A seat that is out reads as out (the study's dashed block, "sits out").
- A short chart leaves room between the chart and the dock; a long chart scrolls a line at a time with the band, under the dock, as it does now. The rule that lays the chart out (`ChartView.tsx`) is not yours to change; give it the room it has.

### 4. The players alive

Each player's block shows when that player plays a note: inked solid at the note and fading over 150 ms, as the study does it (`#play` on a chart page; read its script).

- A small module of its own. Each seat's onsets come from the sounds the take was made into (`made.sounds`: each has its time and its channel). A `requestAnimationFrame` loop reads the player's position less the output's latency (as the playhead does: `useJam.ts`), and writes to the blocks directly, a class or a style on the element, not through React state: nothing re-renders on a note.
- It follows the take when it is replaced under the band (an open jam being extended; Finish): `player.replace` gives new sounds, and the onsets must be the new ones from that moment.
- Only `opacity` and `transform` change, or a colour on a small element: nothing that lays the page out again. Nothing runs when the band is not playing. Under `prefers-reduced-motion` the blocks do not flash at all.
- A muted seat does not flash. The count-in is not the band.
- The band must not play later for it. Run `pnpm render:audio wall-live chart=jazz-rhythm-changes-bb.chart live=1` before and after on the same machine and report the late notes it counts both times.

### 5. The ink follows the style being played

A blues chart played as reggae has reggae's ink in its sentence, its dock and its Play, while the place in the row at the top stays the chart's own style (it says where the chart is found). The last-played poster on home already shows the style it was played in.

### 6. The tempo when the style is changed

Each style has its own usual tempo and limits (`style.tempo`: blues stops at 150, rhythm changes is written at 176). Today a chart keeps its written tempo whatever style plays it. New rule, in the app only (`PlayView.tsx`; the engine and the CLI are not changed): when the style being played is not the one the chart was written for, and he has not set a tempo himself, the band plays at that style's usual tempo; a tempo he has set is kept through a change of style, held to the new style's limits; back in the chart's own style with no tempo set, it is the written tempo again. The sentence always shows the tempo that Play would use. A kept take records the tempo it was played at, as now, so replaying and exporting are unchanged.

### 7. A kept take's screen

The same screen in another state, as the study's `take-1.html`: the sentence states what was played and cannot be changed; the dock, the flood and the players alive are the same; its own exports and Delete are in its More; "Open its chart" stays where part 1 put it. Mutes work there as on a chart (the builder of part 1 noted the take's screen has none).

### 8. A laptop

As `shots/a-28`: the chart in a centred column (64rem), the dock in one row. Sheets as the study draws them at that width.

## What must stay true

- Nothing in `packages/engine`, `packages/styles` or `packages/audio` changes. If you find you want to, stop and say why.
- Everything the screen does now it still does. Go through `PlayView.tsx` and `Stage.tsx` before you start and list every control and state (loading the band, a failed load, the count-in, playing, finishing, ended, autoplay from home's Play buttons, an open jam, song mode, focus mode, the "next time" seat, Keep and Kept, Export MIDI); each has a place afterwards, and your report says where.
- A phone held upright (390 by 844) and a laptop (1280 by 800), light and dark. Tap targets 44 px. Focus visible from a keyboard. A press answers in the same frame; nothing moves on load or on hover; movement is 150 ms at most.
- The chart stays the most legible thing on its screen: Roboto Serif, the yellow highlighter, the pencil under the coming change, untouched.
- Words are plain and say what a press does. The stylesheet stays one file, tokens at the top, comments in plain words (why, not what), written for a musician who reads code. No state library, no router, no new dependency.

## Tests

`docs/TESTING.md` rations tests (binding). Add none. The five smoke journeys (`smoke/app.spec.ts`) must pass against the built app (`pnpm app:build && pnpm smoke`). Journeys 4 and 5 walk this screen (Play, the playhead, Keep, Export MIDI compared with the CLI's bytes): where a control moved, change the step to walk the same journey through the new screen, and say exactly what you changed and why. Do not weaken what a journey proves. `pnpm check` must pass (run it alone: it is timed).

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/wall2`, on a branch `wall2`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests. Commit on the branch in a few sensible commits (the sheet and the sentence; More; the dock; the players; the take's screen), each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

Read first: `CLAUDE.md`; `docs/BRIEF.md` sections 2 and 11; `docs/TESTING.md`; in `DECISIONS.md` the sections from "the interface pass, first half" on, and above all "the poster wall, part 1" (its last part says what this brief should know).

Look at your own work: `pnpm app --port <a free port over 8770>` serves the app; `node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]` photographs it in headless Chrome. Photograph every state at both sizes and in both themes, read the pictures, and put each beside the study's picture of the same state. Save a final set in `/home/brandon/code/ensemble2/.work/wall2/out/wall-2/` (not committed), named for the state, size and theme. Headless Chrome cannot play you sound and you could not hear it: say what you could not verify and how you checked what you could (a class read from the page while it plays, a level read from the mixer).

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Where this brief leaves something open, decide, and write each decision in a new section at the end of `DECISIONS.md` ("the poster wall, part 2") with a line of why. If something here cannot be built as written, or the study and the app pull apart in a way this brief did not foresee, do not guess at a design: build the rest, and say plainly what you left and why. Your final message is read by the engineer who will check and merge the branch. It should say: what the screen now is, as a user meets it, state by state; where every control and state of the old screen went; every decision the brief left open; where you departed from the study and why; what changed in each smoke journey; the late notes counted before and after; the commits; the exact results of `pnpm check` and `pnpm smoke`; the pictures; what you could not verify (a real iPhone above all: the sheet over Safari's toolbars and the home indicator, the dock's flood in a dark room, whether the players sit on the notes by ear); anything you saw that is wrong and did not fix; and what the next brief (Edit as a mode of this screen) should know. Do not say that anything looks or sounds good: say what you checked.
