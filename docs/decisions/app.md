# Decisions: the app

The app: the play view, the library on screen, the editor, takes and export, the poster wall, the first visit and fetching the instruments, settings, the icon.

## stage 6 begins: the play view and the library (part 1)

Brandon on the mix after gate 5: "no complaints about the mix so far. we can always tweak that later". Then: "go ahead and start building".

**The app**

- **`packages/app`: Vite 8, React 19, no other runtime dependency** but the typeface. No router (the address after `#` says which screen), no state library, no PWA plugin. Versions looked up on 2026-11-15: vite 8.3.8, react 19.3.1, @vitejs/plugin-react 6.3.0, @playwright/test 1.65.1.
- **The engine runs on the page's own thread.** A three-minute jam renders in 35 to 105 ms here and a thirty-minute one in 260 to 610 ms; the scheduler is 1.5 s ahead, so even the longest render cannot make a note late. No worker.
- **One rig for the whole visit** (`play/rig.ts`): one audio context, one mixer, one sampler, and every pack loaded so far, never dropped. The packs for a chart's band are fetched when its screen opens, not when play is pressed. A pack is seated under its seat's name, so one pack can sit in two chairs. All seven packs are about 290 MB decoded; nothing evicts them, which is untested on any phone but Brandon's.
- **The band's seats are switches on the play screen** (drums, bass, chords, soloist). The brief's list for that screen does not name them; a bass player wants to turn the bass off.
- **Remembered in `localStorage`**: how chords are read, the jam's length, who is in the band, and each chart's style, key and tempo. Where charts the player writes will live is part 2's decision.
- **A phone is kept awake while the band plays, and the silent switch does not mute it** (`navigator.wakeLock`, `navigator.audioSession.type = "playback"`). Both are skipped where the browser lacks them.

**The chart on the screen**

- **The page is the chart as written, with one exception.** Repeats, endings and `%` stay as their signs; a section that repeats an earlier one by name (`[A]` again) is written out, so the eye goes down the page in playing order. Each bar shows what will be played (from the same expansion the band reads), so a section in another key shows its own chords.
- **A planned bar knows its section's index** (`PlanBar.section.index`), which with `source` is its place on the page. The line layout (`flow`) is exported from the engine for the same reason.
- **The type is sized to fit.** One size for the whole chart, the largest at which every line fits the height and a bar is at least 3.3 times the root's size wide. Lines are eight bars across where that makes the type more than 15% bigger (a laptop), four otherwise. A chord too wide for its share of a bar is set in narrower letters (the typeface has a width axis, 62 to 88), then smaller.
- **One symbol set**: a triangle for major seven, a circle for diminished, a slashed circle for half-diminished, `+` for augmented, `m` for minor, `sus` for sus4. The flat, the sharp and the triangle are drawn, because few typefaces carry them. Open to Brandon's taste.
- **The playhead is a highlighter stroke on the bar being played and an underline on the next change of chord.** Focus mode shows the line being played and the next: two bars to a line on a narrow screen, four otherwise.
- **The look**: indigo ink on cool paper, a yellow highlighter, Archivo (OFL, bundled, one family in several widths). Dark mode follows the device.

**Jams**

- **A jam can be told to finish** (`PlanOptions.endAfter`). The pass named becomes the last: it lifts and lands like any last pass, and everything before it is planned as the jam it set out to be (the arc and the solos are shaped by the passes planned, not the passes played; a solo under way makes that chorus its last). The property: nothing before the last pass changes, in an open jam or a timed one.
- **In the app, Finish turns the band for home at the top of the next phrase** that is at least three seconds off; if this pass has none left, the next pass is the last. The music from there on is the told take's (`Scheduler.replace`, with its property). The two takes agree before the last pass; inside it they differ after its first phrase, so there is a join at that phrase top. A note the old take was holding rings on; one the new take would have been holding across it is not there. No ear has judged the join.
- **A jam with no set length** is made two passes long and given more whenever under 20 seconds are left, by making the take again longer (the engine's open jam leaves what was played unchanged).
- **One button**: Play, then Finish, then Stop. Pressing it while the band plays asks for an ending; pressing again stops dead. A timed jam can be finished early the same way.

**Installing and offline**

- **A hand-written service worker** (`service-worker.js`, about sixty lines; the build fills in its file list). The app's own files are kept at install under a cache named for their contents. Instrument files are kept as they are first fetched, in a cache named for the packs' `pack.json` files, so a new build of the app does not fetch 17 MB again. Once the app is open it fetches whatever instruments are missing, four at a time, and says so at the foot of the library.
- **Cache matches ignore `Vary`.** The smoke journey found it: the preview server marks responses as varying, and the page's script was not matched by the copy kept at install, so the app opened offline as a blank page.
- **Service workers need a secure address.** On the LAN by IP over plain HTTP the app runs but is not installable and keeps nothing offline. Open: how Brandon's phone reaches it over HTTPS.
- **A credits page** (`#/credits`) lists each pack's sources, licences and changes from its `pack.json`, with a link to its licence text. The piano's CC BY asks for this.

**Tests**

- **Smoke journeys 1, 2 and 4** (`smoke/app.spec.ts`, `pnpm smoke`, 7 s of 60) run the built app in the installed Chrome. Journey 4 listens at the output: whatever is connected to the speakers also feeds a meter, and the spec waits for a signal and for the highlight to move from the first bar to the second.
- **Two new properties**, each broken on purpose and seen to fail: the scheduler's "when what is to come is changed", and the band's "a jam told to finish". The first version of the second sampled only cases with nothing before the last pass on a push; three deliberate breaks passed it before that was found.
- **The engine suite is at 9.1 to 9.3 s of 10.** The next property has to be paid for by trimming another.

## the app's first part, reviewed (stage 6)

An independent review (Opus, its own clone, brief in `prompts/review-app-part-1.md`) drove the app and compared note lists. It confirmed the planner's side of Finish (told and open takes agree before the last pass on all 21 charts, seeds 1 to 3, soloist on and off; 31,203 planned bars each map to a bar on the page) and found these, all fixed:

- **Finish late in a pass could join the two takes in the middle of a bar.** With no phrase top left in the pass, the join was "three seconds from now", which could fall just inside the next pass, where the solo is already a different solo. The join is now always a phrase top: the next one at least three seconds off that is not the top of the pass being played, in this pass or the next (`turnForHome`). It is taken 30 ms before the bar line, so a downbeat leaning early comes from the new take. My note that the takes differ only "after the first phrase" of the last pass was wrong with a soloist: its solo is rewritten for the whole pass.
- **The last bar showed the turnaround while the band played the ending** (14 of 21 charts: the page said E7, the band played A9). On the last pass the final bar now shows what the plan plays there.
- **Fetching a style's instruments early could change the mix of a band already playing another style**, and would have silenced it had the two styles differed in room or filters. The early fetch now only fetches; the band is seated when play is pressed.
- **A long jam with no set length froze the page** while it was made longer: 0.85 s at 35 minutes and 1.8 s at 79 on this machine, against a scheduler 1.5 s ahead, and a phone is slower. **The engine now runs in a worker** (`play/band-worker.ts`), for every take. This reverses "no worker" above: the measurement there was right for a take made once, and wrong for one remade as it grows. More is asked for when under 20 seconds are left, or eight times the last render if that is longer. Only the sounds still to come cross back to the page.
- **Focus mode's type changed size from line to line, and showed nothing after the form's last line.** It is one size for the tune (sized for the tallest pair of lines), and the second line is the one the plan plays next, so the bottom of the form shows its top.
- **A double tap on Finish stopped the band.** Stop ignores a press within 0.6 s of Finish.
- **Smaller**: `Scheduler.replace` now enforces its own rule (asked for a change nearer than what is handed over, it changes just after it; nothing sounds twice; the property covers it); `endAfter` that is not a number is ignored; the worker's install fetches past the browser's cache; the offline saver gives up on a page the worker never takes charge of, and no longer counts a failed file as saved; a wake lock granted after stop is released; "N.C." on the highlighter is readable in dark mode; the development server's pack path check.
- **Not changed**: on a landscape phone with both readings, the numerals are about 8 px (focus mode is the answer there); the first visit fetches the first chart's instruments twice (once to play, once to save); when the join is late in the pass the lift before it is not heard, so the energy steps up at the join. That last one is for Brandon's ear.


## the editor (stage 6, part 2)

Built to `prompts/app-editor.md`. What that brief did not settle:

- **The player's charts** (`charts.ts`): one list under `ensemble.charts.1`, the shelf showing the one changed last first. An id is `my-` and a random number in base 36, from `crypto.getRandomValues`, because `crypto.randomUUID` is missing over plain HTTP on the home network. The browser is asked to keep the site's storage each time a chart is made, not only the first: it remembers its answer, and a player who deleted every chart is starting again. Another tab's changes are picked up from the `storage` event.
- **When storage refuses a write, the editor says so** and suggests Export: the brief's "lasts for the visit" is otherwise a silent loss.
- **An imported file has its byte-order mark dropped and its line breaks made `\n`**, because a text box reports every line break as one letter and the parser's places are counted in letters; a file over 64 KB is refused as not a chart. An import, like a new chart, opens in the editor. A copy of a built-in keeps its text, title included.
- **The text never wraps** (`wrap="off"`, `white-space: pre` in both the box and the marked copy behind it), so the two cannot wrap differently; a long line scrolls sideways. The copy is moved by the box's scroll offsets rather than scrolled itself, so it never runs out of room to follow. The type is 16 px, below which a phone zooms the page when the box is touched.
- **A problem at a place rather than over letters** is marked on the letter there, or with a short stroke at the end of a line. Where problems overlap, the worse one colours the stretch. Errors also get a faint pencil wash, so a bar line or a space can be seen to be marked.
- **On a phone the whole editor is fitted to the visual viewport while the text has the focus**, and the key row sits at its foot, full width; the brief's "position it from `visualViewport`" done for the screen, not the row alone, so the text box is the part that shrinks and the caret's line is scrolled back above the row when it does. Format, Export and Delete are hidden while typing on a touch screen.
- **Saving is 400 ms after typing pauses**, and at once on Play, Format, leaving the screen, `pagehide` and the page being hidden.
- **On the play screen of a phone, "Edit a copy" reads "Edit"** (its accessible name stays "Edit a copy"): the header had no room, and the title was already down to a few letters.
- **Smoke journey 3** (`smoke/app.spec.ts`): a new chart, eight typed bars on the page, then `Hq7` typed: its message is listed and the error mark is exactly `Hq7`, inside the box. Seen to fail with the mark moved one letter. The four journeys take 7 s of 60.

## the editor, checked and merged (stage 6, part 2)

The builder's diff was read in full, and the editor looked at on a phone and a laptop with a clean chart and one full of mistakes. Merged as built, with two changes on the main thread:

- **The play screen's header holds only the way back, the title and Edit.** With Edit added, a phone had 78 px left for the title. How the page is read (names, numerals, both; focus) moved to a line of its own under the header, beside the line that says the style, key and tempo, which is now shown before playing as well as during.
- **"Edit a copy" opens the copy already made**, if the player made one and has not changed it. Pressing it twice no longer leaves two.
- **The player's charts are in `localStorage`** (decided in the brief): a chart is a few hundred bytes, the reads are synchronous, and the same eviction rules apply to it as to anything else a site keeps. Export is the backup.
- **Not verified by anyone yet**: the key row above a real phone keyboard, and whether pressing a key in it keeps the iPhone's keyboard up.


## takes and export (stage 6, part 3)

Built to `prompts/app-takes.md`. What that brief did not settle:

- **The charts and the takes share one stored-list module** (`stored.ts`): loading with a filter, writing, the `storage` event, listeners, new ids. Each keeps its own shape and what the screens are shown. Anything not a take is left out of the list.
- **The take file's text is written by the engine** (`recipeText` beside `TakeRecipe`), and the CLI's `writeRecipe` calls it, so the app and the CLI cannot drift apart on the format.
- **"The jam a take came from" is its seed.** A new press of Play is a new random seed; the play screen follows a kept take only while `jam.take` carries that seed. Keep is hidden while a new take loads, so it never keeps the one before.
- **`useJam` takes a listener for every change to the take**, because the last change (an open jam made into the passes it got to) happens as the screen closes, when no effect of the screen can run any more.
- **Kept is the same button, disabled.** Pressing it again would mean nothing; removing is on the take's screen.
- **A take's row has the round play button like every other row**, starting the take as its screen opens (the address is remembered, not the chart id, so a chart and a take cannot be confused).
- **The take's screen is headed by its name**, and the key and tempo line under it is the one the play screen has.
- **The day a take was kept is in the device's own way of writing dates** ("Nov 15" here, "15 Nov" in Britain), with the year only when it is not this one.
- **A take that will not plan** (its style gone, or options this engine refuses) says so on its screen and its row, and offers only Delete.
- **Smoke journey 5 stops the band by going back to the library.** The transport's Stop sits behind Finish, which would make a different take, and a press within 0.6 s of Finish is ignored; waiting that out is a sleep. Leaving the screen is a real way to stop the band, and goes through the same stop. Seen to fail with Export MIDI given a tempo one off.

## song mode and the arrangement grid (stage 6, part 4)

Built to `prompts/app-arrangement.md`. What that brief did not settle:

- **"The song" is kept as `ChartChoices.song`**, true or false once the player has chosen; unset, it follows whether the chart's arrangement fits. Choosing a length writes `false` for that chart as well as the length for all of them, so the next chart keeps its own choice.
- **A song's strip names its section to the last chord**, and says "Ending" only while the chord rings: an outro is a section the player reads, and "Ending" over its last bar would hide where they are. Before play it says "7 sections" beside the length, as a jam says "3 passes".
- **The way home in a song is its last section**: the strip's pencil cue, the shaded end of the arc, and the final bar showing the ending the band plays (as the last pass of a jam does). One helper, `homeStretch`, answers for both.
- **The arc is drawn once for both**: its rules mark the tops of passes in a jam and the starts of sections in a song. No labels in the arc; the line above it names the section, and at 22 px a label could not be read.
- **There is no Finish in a song** in the hook as well as on the button (`useJam.finish` does nothing for a song), so a take's screen cannot reach it either.
- **The grid's quiet levels come from the style play would use**: the one chosen for the chart on the play screen, else the chart's own. A section left to the style is drawn at the arrangement level nearest the level the style gives it, read from a song planned without the arrangement.
- **The grid waits when the block has a mistake**: it shows what could be read and its choices are disabled until "Write it out clean" is pressed, because a change would quietly turn the mistaken value into `-`. A block that is not an arrangement (`---` and anything else) is not offered a clean copy or Remove at all: both would delete text the player wrote and the parser does not read.
- **A chart with no block is shown the arrangement it is already played with** (changed at the merge): `arrangedLines` puts the soloist where a song with no arrangement has it, in `Solo` sections when there are any and otherwise through the body. As built, the first change to any cell also took the soloist out of every other section without saying so.
- **Setting a cell to the value it has writes nothing**, so a tap on the selected choice never gives a chart a block.
- **The switch is a row of its own** above Format, Export and Delete: at phone width the five do not fit on one line. Which side is shown is not remembered; the editor opens on Chords.
- **The first cell (the opening section's energy) is selected on opening**, so the row of choices is never empty. The selection is drawn with the highlighter, as the bar being played is.
- **The grid is a table of buttons with the arrow keys, not an ARIA `grid`**: the linter refuses an interactive role on a table, and buttons with one in the tab order (the selected one) read well enough: each says its player, section, place and value.
- **Cells are 48 by 44 px**, 40 high on a screen under 500 px tall (a phone on its side), where the grid still scrolls inside its pane to reach the choices.

## the first visit, timed (stage 6)

Brandon, 2026-11-15: "i just want to make sure initial page load is snappy - don't want people waiting while packs download". Timed on a cold browser against the built app through one shared pipe (a throwaway server, every response uncompressed and rate-limited together):

| | 10 Mbps | 30 Mbps |
|---|---|---|
| the library on the screen | 0.6 s | 0.3 s |
| Play pressed on rhythm changes to its first bar | 9.4 s | 4.4 s |

- **The page never waits for a pack.** The shell is 0.25 MB compressed (script, stylesheet, the worker that plays the band, one font file); packs are fetched after it has drawn.
- **The wait is the first Play of a band on a device**: its three packs. The jazz and blues quartet is the heaviest, 9.4 MB (the grand is 6.0, the kit 1.9, the upright 1.5); funk, disco and reggae are 5.6. About 1.9 s of each figure is the count-in and the start, not the fetch. After that the packs are on the device and Play is immediate.
- **Changed now: fetching for later never competes with a band someone is waiting for.** The app saves every pack for offline use in the background from the moment it opens, four files at a time. It now waits a moment for the page to settle, stops whenever a band's packs are on their way (`Rig.idle`), and fetches the instruments most bands share first (the kit, then the basses and the chord instruments, the soloists' own last) so the next tune opened has least left to fetch. On this test pipe the first Play measured the same before and after (HTTP/1.1's six connections had been giving the band its turn anyway); over the live site's HTTP/2 nothing rations the saver's requests but this.
- **The lever that would move the number, not built: start a band on one dynamic layer of each pack and bring the rest in behind it.** One middle layer of the jazz quartet is 3.2 MB against 9.4 (`loadPack` can already load a pack that way), which is about 2.6 s of fetching at 10 Mbps in place of 7.5. The price is that the very first take of a band on a device is played with one recording for every dynamic, loud and soft differing only in level, until the full packs land and take over at the next Play. Gate 5 left "packs load every layer" standing until an ear said otherwise, so this is put to Brandon.
- **Brandon's answer, 2026-11-15: not built.** "i don't think we need to over-engineer it yet. packs can probably download while users are on the main screen in the background, and that should be plenty of time". The background save, in its new order, is the whole of it; every layer still loads. Come back to the one-layer start only if someone is heard waiting.



## the interface pass, first half (stage 6)

Built to `prompts/app-interface-pass.md`. What that brief did not settle:

**Stopping**

- **Play and Stop are one button, in one place and the same ink**, and Finish is an outline to its left. Stop in the pencil's red was tried and taken out: red is for what is wrong and for the last pass, and a red button was louder than the chart.
- **Finish is there from the press of Play**, not from the first note, so nothing arrives beside Stop a second later. It cannot be pressed until the band is in, says "Finishing" once the band is told or is in its last pass by itself, and is as wide as that word so the change moves nothing. A song has no Finish, and nothing in its place.
- **A press of Stop within 0.4 s of Play is the same tap twice** and is ignored, now that Stop is where Play was. The old guard (Stop within 0.6 s of Finish) is gone: they are two buttons.
- **The space bar is the transport wherever the focus is, except in a text box or a list of choices.** A seat silenced with the mouse keeps the focus, and a space bar that brought it back when the player reached to stop the band would be the wrong thing. A button under the focus is still pressed with Enter.
- **The setup leaves at the press of Play**, not when the band starts: the press is answered at once, and nothing set while the band loads could change that take anyway. While it loads the strip says "Loading the band" and the button, already Stop, calls it off.

**Mutes**

- **The band's seats are a row under the chart**, over the transport, in the same place before and during play; the rest of the setup still leaves. The footer is three rows on a phone (the strip, the seats, what to press), two from 820 px wide, one from 1100.
- **A mute is the seat's channel taken all the way down through `Mixer.adjust`** (a level of minus infinity; the reverb is fed after the level). Nothing was added to the audio package. Everyone is heard again at each press of Play.
- **Four separate switches, not a joined row**, since any of them can be on; a joined row is kept for choices of one (how the page is read, the editor's two sides). A seat in the band is a tint of ink, one out of it an empty outline; filled ink is left to the transport.
- **"next time" is written in the button**, hatched and with a dashed edge, for a seat switched on while the band plays a take it is not in.
- **While the band plays, the strip's soloist line follows the take, not the switches**: a soloist silenced still has its solos marked, for a player who wants to take them.
- **The instrument choices sit over the seats, named "Chords played on" and "Soloist plays"**, from the right so the soloist's stands over its seat. Before play only. Any seat a style gives a choice for gets one.

**The home screen**

- **Recent is what had its play button pressed**, on its own screen or its row: five shown, twelve remembered (`recent.ts`, a stored list like the charts and takes). Keeping a take does not put it there; its chart, just played, is.
- **Until something has been played, "Start here" stands in Recent's place**: a blues in A, a four-chord song in G and a funk vamp in A.
- **A chart's actions are behind the word More on its row**, one row open at a time: Edit, Rename, Duplicate, Export, Delete. Four buttons on every row was a wall of them on a phone. Rename is typed in the row, and rewrites only the chart's `title:` line (or adds one), so the rest of the text stays as typed. A duplicate is named "… copy".
- **With nothing typed and no style chosen, the built-in charts are shown as their styles**, each a row naming its charts and a tap from them: eight rows in place of fifty-one. Search looks for each word in the title and the style's name, or as the key. What is being looked for is kept by the app for the visit, so it is still set on coming back from a chart.
- **Home keeps no Takes shelf.** A take is a performance of a chart and is found on that chart's play screen, before the band starts, as a line of links (the time it was kept if today, else the day, and its length). A take now records its chart's id (`KeptTake.chart`); one kept before is matched by the chart's text, then its title. **Takes whose chart is gone get a shelf on the home screen**, there only when there are any. A take's screen goes back to its chart.

**Export**

- **Export MIDI is beside Keep**, for the take as it stands: for a jam with no set length still playing, that is the passes made so far. The file is named for the chart.

**The look**

- **`--chart-face`** is used by the chart (chords, section marks) and by the screen's title on the play screen, a take's screen and the editor. Checked with a system serif that has no width axis, on four charts at both sizes: every bar inside the frame and no chord wider than its slot; a crowded chord is then made smaller, where Archivo is made narrower first.
- **A choice carries its name inside its own box**, small, over what is chosen, and the box draws its own arrow. A row of labels over the row of boxes cost a phone 16 px a row.
- **Anything pressed is 44 px tall**, 38 under a mouse on a wide screen (`--control`).
- **A phone on its side** (under 500 px tall) puts the screen's name and how it is read on one line.
- **Fixed in passing: the chart chose its layout after the 8 px floor was applied**, so a long song on a short screen kept four bars to a line and ran off the bottom when eight would have fitted. The two layouts are now compared before the floor.
- **`out/ui-pass/`** (the pictures of this pass) is ignored by git.

**Tests**

- **Smoke journey 1** also finds a built-in chart through the search box, since they are no longer all listed. **Journey 5** exports the MIDI file from the play screen while the band plays, keeps the take, leaves (which stops the band), comes back through Recent, opens the kept take from the chart's screen, and exports the take and the MIDI file again there; both MIDI files are compared with the CLI's. Seen to fail with the play screen's export given a tempo one off. Journeys 2, 3 and 4 are as they were.

## the interface pass, first half: checked and merged; the chart in a serif, set larger (stage 6)

Read on the main thread: the rig's mutes, the recent list, the report against the pictures (home, play idle, playing with a seat silenced and one waiting for next time). `pnpm check` 16.4 s of 20; the five smoke journeys pass against the built app. Nothing in the engine, the styles or the audio package changed.

- **The chart's typeface is Roboto Serif** (Brandon, from four candidates on the real screen: "roboto serif looks good"). `@fontsource-variable/roboto-serif` 5.3.0, OFL, its `wdth.css` (150 KB: weight and width axes), bundled so the chart is the same on every device and offline. It sets the chords, the section marks and the chart's title; the interface stays in Archivo.
- **The chart is set larger, and a long form scrolls. This departs from BRIEF 11** ("the whole form fits on one screen at any size; no scrolling during play"), by the owner's word: "any thoughts on how we can make the chords larger/more legible ... i'm open to intelligent scrolling if it'll make it easier to look at", and of a picture of both, "larger looks better". The rule (`ChartView.tsx`):
  - A size is wanted: a root of 34 px on a phone, 24 px on a wider screen (whose pixels are bigger and nearer), or as large as four bars to a line allow.
  - A form that fits one screen at four fifths of that or more is left whole and still, as before.
  - A form that does not is set at that size, four bars to a line as written (never eight on a phone), and the page moves: when the bar being played is on another line, that line comes to the top with its section's name. It moves between lines, never inside one; stopped, the page is the reader's to scroll. Its bottom edge fades, so a line cut off reads as more to come.
  - Extensions are 0.64 of the root (were 0.56).
- **Every chord on a page is one size** (Brandon: "any idea why the first chord in a measure looks smaller than the second though?"). Each chord used to be squeezed into its own share of the bar, so a long symbol beside a short one came out smaller. Now a chord takes the room it needs before the bar's spare room is shared out by the beats, a bar that is still too full narrows all its chords alike, and where that is not enough the whole page is set smaller (to 72% at most) so that the fullest bar fits; only past that is one bar smaller than its neighbours.
  - Measured: narrowing Roboto Serif's letters from 88% to 62% takes about 6% off a chord's width (the accidentals and the gaps do not narrow), so on a tune with two chords in most bars the page's size is what the width allows: rhythm changes on a 390 px phone comes out at a 24 px root, and fits one screen; the neo-soul song (one chord a bar) at 32 px, scrolling.
- Left from the build's own list: under 388 px wide the footer's buttons wrap to a fourth row; a Stop within 0.4 s of Play is ignored; a take whose chart was since retitled is listed as a take with no chart; the take screen has no mutes.

## the interface pass, second half: an editor you tap (stage 6)

Built to `prompts/app-editor-tap-a-bar.md`. What that brief did not settle:

**The text**

- **A tap rewrites one section, and that section is written out as `fmt` writes it** (`edit/rewrite.ts`). The change is made in the text where a person would make it (over a bar's own letters, beside a bar, under a label), the parser reads the result, and the section the change touched is printed by the engine's own formatter, asked for that one section; it is put back over the section's lines. Everything outside the section stays letter for letter. The two things the brief asks ("laid out as `fmt` lays it out", "anything the tap did not concern left exactly as it was") pull apart inside a section: a bar that changes width moves its column, so the section is the least that can be laid out again, and a section typed loosely is tidied whole (spellings made canonical, columns lined up) the first time a bar in it is changed. Nothing was added to the engine: the parser's ranges and `print` were enough.
- **Typing a bar as it already is writes nothing**, so a stray tap never tidies a section either.
- **A section keeps its line width.** The formatter reads a section's width off its lines as they stand, so a line of four with a bar added would be taken for a line of five (and a new chart typed out in one go for a line of twelve). The section is printed at the width it had before the change; where the formatter would not read that width back (an ending's bars must share a line), the width it does read is used, so what is written is always what `fmt` leaves alone.
- **An empty bar is `NC`.** The format has no empty bar: `| |` makes none, and the parser's own message says to write what the bar does. `%` and `.` both need a bar before them and are errors in a first bar; a bar of no chord is valid anywhere and plays what an empty bar would. A new chart, a new section and an inserted bar all use it; a bar cleared of its text becomes it; and a bar that holds only `NC` opens as an empty field (the placeholder says `NC`), so there is nothing to clear before typing.
- **A new chart states no key** (`title: New chart`, `[A]`, four bars of `NC`). The old starter said `key: C`, and a blues typed into it in F would have been read, transposed and ended in C without a word. With no key the parser takes it from the first chord, right far more often, and says so as a warning on the Text side.
- **Bars typed past the end of a section go after its last line**, outside a repeat that closes there. A bar put in with Add before or Add after goes beside the bar it was asked for, inside the same repeat or ending.
- **A repeat's only bar, deleted, takes the signs and the count with it**: they have nothing left to repeat. A section's last bar cannot be deleted (the section would become a repeat of another by name, or an error); the section is deleted from its name instead.
- **Duplicate makes a copy with its own label and its own bars** (`Verse 2`, the next number free). A section header with the same label would be the same section again, which nothing tapped could then vary; a repeat by name is still typed in the text. **Add after** makes `[B]` (the next letter) where the sections are lettered and `[New]` where they are named, with a line of four empty bars.
- **Rename changes every label that says the section**: one played again by name further down is the same section. A name another section has is refused, in words, since it would make the two one. A chart of bars with no label gets its `[A]` written out when it is renamed or given a second section.
- **Delete, on a section played again by name further down, gives the first of those its bars**: the song loses that one place and nothing else. The last section with bars cannot be deleted.
- **An arrangement block in use is carried across a change to the sections** (a renamed section's lines renamed, a copy given its original's line, a new section a plain one, a deleted one's line dropped), so the block still fits and the song is still arranged. A block with a mistake in it, or already out of step, is left as typed: the grid already offers to line it up.
- **What cannot stand in a bar is kept out of the way of the line**: a word typed starting `//` loses a slash (it would turn the rest of the line into a comment), and a bar that is first on a line with no bar line before it gets one (so `key: D` or `[x` typed there is an unreadable bar, not a header line or a label).
- **`docs/CHART_FORMAT.md` still says "the app never rewrites a user's text unless asked to format it."** The arrangement grid already rewrote its block; a tap now rewrites a section. The sentence was left alone for Brandon to reword: the format's rules are unchanged.

**Typing a bar**

- **The page draws the bar as it is typed**, from the text as it would be with the bar applied; leaving the bar as it was is forgetting the draft. The text box shows the text as it stands, and takes the change when the bar is left.
- **A mistake is marked on the bar at once and put into words after 0.7 s without a key** (at once when the bar is opened already wrong): a chord half typed (`Csu`) is not a mistake yet. Only errors are said there; warnings stay in the Text side's list.
- **A bar that cannot be read shows what was typed**, in the text's own type and the red pencil, in place of the chords the band falls back to: an unreadable bar on its own would otherwise be drawn empty.
- **On a touch screen (`pointer: coarse`) the bar is typed in a dock; under a mouse, in a field over the bar itself.** The dock is the last row of the editor, which is already fitted to the visual viewport, so it sits on the keyboard without being positioned. The field is the bar's width, so the bars beside it can still be pressed.
- **The dock's keys**: `|  .  %  #  b  /  NC`, then the twelve chord endings the built-in library uses most, most used first (of its 610 chords: `7` 135, `m7` 77, `9` 46, `m` 39, `m9` 33, `maj7` 32, `maj9` 19, `7b9` 16, `m7b5` 12, `13` 12, `m6` 7, `dim7` 5), in a row that scrolls sideways. `:`, `[` and `]` are not in a bar and are left to the text's own key row. A key types its text at the caret and nothing else.
- **The bar's own actions are behind a key marked Bar**, which swaps the endings for Add before, Add after, Repeat % and Delete: a fourth row would leave a phone two lines of chart above the keyboard.
- **Enter (the keyboard's Next) applies and moves on, past the bars a bar line spread over; on the last bar it applies and closes.** It does not add a bar: a stray Enter should not grow the tune.
- **Under a mouse the bar's text is selected when it opens**, as a cell is, so typing replaces it; on a phone the caret is at the end, where a key from the dock adds to the chord. A lone `%` is selected on both.
- **The field asks a phone to capitalize each word**, so a chord's root comes up as a capital and the rest does not. A numeral in lower case (`ii7`) needs the shift key put down by hand.
- **A press on another bar applies the one being typed and opens that one** without the keyboard going down; a press anywhere else, Done, or the keyboard being put away applies it and closes. Leaving the screen, or the phone putting the app away, keeps the bar as typed.
- **The bar being typed is drawn with the highlighter**, as the bar being played is and the grid's chosen cell is: one mark for "here".

**The screen**

- **One switch, three sides: Chart, Text, Arrangement.** The editor opens on Chart, on every device; which side is shown is not remembered. On a phone the chart has the screen on its own side and is the page above the other two; on a wide screen it stands beside them and can be pressed there too. A bar pressed on a phone's Text or Arrangement side is edited on the Chart side.
- **Format, Export and Delete are on the Text side only.** Format is about the text; Export and Delete are also on the home screen, behind More.
- **Undo and Redo are in the header**, the one row that is there in every state, keyboard up or down. The title gives up the room: 160 px of a 390 px phone.
- **How the two undos meet.** The buttons step through every change made by tapping: a bar applied, a bar or section action, a rename, the title, Format, a cell of the grid. A stretch of typing in the text box, from its first letter to leaving the box, is one step. Inside the box (and inside a bar's field) Ctrl/Cmd-Z is the browser's own, letter by letter, for what has been typed there since the text was last changed from outside; a change from outside (a tap, Undo) replaces the box's text and with it the browser's memory of it. Anywhere else, Ctrl/Cmd-Z and Shift-Ctrl/Cmd-Z (or Ctrl-Y) are the buttons. Undo while a bar is half typed applies it first, so Redo brings it back. 200 steps are kept, until the editor is left.
- **The title is typed where it stands**, in the header, and rewrites the `title:` line as Rename on the home screen does.
- **In the editor the chart is always set at the size it is wanted at and scrolls**, whatever the height, and every section shows its name (a lone `A` too, since the name is where the section's actions are). Fitting the form to the screen, as the play screen does, would re-set the whole page each time a phone's keyboard came up.
- **On a wide screen, alone, the chart keeps to 64 rem**: four bars across 1280 px left a bar 300 px of white.
- **A chart with no bars offers "Add a line of bars"** where the page says there are none: without it, a chart emptied in the text had nothing to press.
- **The arrangement grid's cells were already a fingertip**: 48 by 44 px measured on a 390 px phone, before and after (the brief says they are small; the stylesheet and the browser say otherwise). Their size was left. What changed on a phone: the grid's side takes the height it needs and the chart above it the rest, so the row of choices and Remove are on the screen without scrolling the pane (Remove was under the fold); the tools row above the grid is gone (see above). The whole song is in view where it was before: up to five sections on a 390 px phone, and it scrolls sideways past that.

**Tests**

- **Smoke journey 3** opens a new chart, presses the first bar, types `F7 | Bb7` and Enter, and reads the second bar as `Bb7` on the chart; then presses Text and reads `| F7 | Bb7 | NC | NC |` in the box. From there it is as it was: the text filled in, eight bars on the page, the heading, `Hq7` typed, its message, its mark inside the box. The other four are untouched.
- **The rewrites are not tested** (`docs/TESTING.md`: UI glue). They were checked with a scratch script over all 51 library charts, kept out of the repo (`out/editor-pass/`, ignored): 23,367 checks, no faults. See the report.

## the editor you tap: checked and merged (stage 6)

Read on the main thread: the report against the pictures (a bar open over the phone's dock, a bar open on a laptop), and the build's own check of the rewrites run again here: 23,367 edits over every bar and section of the 51 library charts, no faults (each bar retyped gives the text back; each change parses with no new diagnostic and is left alone by `fmt`; add then delete, duplicate then delete, rename and back all restore the original). `pnpm check` and the five smoke journeys pass on the merged tree; nothing in the engine changed.

- `docs/CHART_FORMAT.md` section 1 said the app never rewrites a user's text unless asked to format it. An edit made on the chart now does, for the section it touches and in the formatter's layout; the sentence says so.
- Not seen on a real phone by anyone: whether a press on a bar raises the iPhone's keyboard, whether the dock sits on it, whether its keys keep it up. Brandon's to try.
- Left as the build found them: by tapping there is no way to set key, tempo or meter, add repeats and endings, or play a section again by name (the Text side has them); a laptop's field overlaps the next bar on a six-bar line; duplicating a section that has its own key copies its bars untransposed.

## the instruments, fetched faster (stage 6)

Brandon, 2026-11-16, on a fresh browser: "it takes a pretty long time to pull down all the sound files". Measured on the test site from a fresh headless Chrome: the background save took 50 s for its 908 files, while a band's own loader had the jazz quartet's 267 files in 2.3 s from Play to the playhead. The bytes were never the wait (30 MB); the requests were.

- **The saver fetches 24 files at once, not 4.** Four was chosen on a test pipe speaking HTTP/1.1; the live site speaks HTTP/3, where a request is a stream and the only ration was ours. A band being loaded still has the connection: the saver stops asking while one loads.
- **A recording's address is kept for good** (`hosting/nginx.conf`): the app asks for each with a mark made from its pack's description (`?v=`), so the address changes when the pack does, and the server now says so (`immutable`, a year). The edge in front of the test site was asking the house about every file on every fetch (`cf-cache-status: MISS` or `REVALIDATED`, 0.35 to 0.65 s to the first byte); it may now answer by itself. A pack's description, the page and the worker are asked about every time, as before.
- **Not done, and why**: one file for each pack (eleven requests in place of nine hundred) is a change to the pack format, the cutter and the loader, and over HTTP/3 the requests are no longer the wait once they are not rationed; saving only the styles someone plays gives up playing a new style on a train. Come back to either if a measurement says so.

## a style opened on home has a way back (stage 6)

Brandon, 2026-11-16: "i opened a genre, then opened a chart, and when leaving the chart, i couldn't navigate back home". Reproduced: back from the chart lands on home with the style still chosen, at the top of the page, and the only way to the other styles was the Style picker set to "Every style".

- **Where a style's list starts it says "All styles", with the arrow, and the style's name.** Home still remembers the style (he was browsing it); what was missing was the way out.
- **Home comes back where it was left**, not at its top: the list he opened the chart from is the list he returns to.
- The back arrow's word is hidden on a phone only in a screen's top bar, where the title needs the room; the credits page shows "Charts" beside its arrow now.
- A stopgap: the study of the app's structure (`prompts/app-look-study.md`) makes a style its own page.

## the poster wall is chosen; one library, a style is a mark (stage 6)

Brandon, 2026-11-16, of the study's direction A: "the poster wall looks really cool, i haven't seen anything like that in a while. reminds me of metro ui in the best way". And: "the band is very adaptable and can play any chart in any genre we support. does it make sense to organize things this way? what if we have a unified library and tag things based on their idiomatic genre, with the idea that everything is easily customizable anyway?"

- **Direction A is the app's look.** B (the band room) is set aside; its players as shapes may yet be drawn into A's dock.
- **One library; a chart's style is a mark on it, not a place it lives.** He is right about what the thing is: a chart is its chords, and the suite holds every style to every chart. The library is one page that says what it is showing (everything, his own, or one style) and is in the address; the wall on home stays, as eight ways into it. His own charts are in it with the built-in ones.
- **The way back from a chart does not depend on how he arrived**: `Home / <its style>`, the second going to the library showing that style; `Home / Charts` for a chart with no style.
- **A style's ink is the app's to know** (a table in `packages/app`, with an ink for a style it has not been told about): a look is not music, and a ninth style must not need the engine changed for it.
- **Built in three briefs, one builder at a time**: the look, home, the library and the way back (`prompts/app-poster-wall-1.md`); then the chart's screen (the setup as a sentence, More, the dock in the style's ink, the players alive); then Edit as a mode of it.
- **For the second brief to settle**: the ink on a chart's screen follows the style being played, not the one written; and what the tempo does when the style is changed (each style has its own range, and rhythm changes is written at 176 where blues stops at 150).
## the poster wall, part 1 (stage 6)

Built to `prompts/app-poster-wall-1.md`: the look of the study's direction A, home, one library, and the way back. Nothing in the engine, the styles or the audio package changed. What that brief did not settle:

**The library**

- **Every chart in one list is by title**, the way a person reads one ("8-Bar Blues" before "12-Bar Blues", capitals aside). Grouped by style would be the eight style pages end to end, which the strip already gives; by title is the one view that finds a tune by its name. One style's charts are by title too. The player's own (`#/charts/yours`) stay the one changed last first, as on home.
- **A search is a fourth thing the library shows, across everything, and it is in the address** (`#/charts?find=minor`). It is not a filter on what was showing: typed while Jazz is showing, it still looks everywhere. So what was found is still there on coming back from a chart, and after a reload. The first letter is one step in the browser's history (the back gesture undoes the search) and the letters after it are the same step. Emptying the box shows every chart.
- **The search box on home and the one in the library are one box** (`Browse.tsx`): the first letter typed on home turns the screen into the library showing what was found, and the caret and the phone's keyboard stay in it. The box does move, from under the name to the bar at the top.
- **In the library the search box is in the pinned bar beside `‹ Home`**, not on a line of its own: it is there however far a list of fifty is scrolled, and a style's page spends no height on it. The style's name joins the bar once its poster is scrolled past, only from 600 px wide; on a phone the bar's ink says which style it is.
- **The strip is a small wall: All, Yours, and a bill for each style, wrapped onto as many rows as it needs** (two on a phone), directly under the bar and above what is being shown. Wrapped, not a row that scrolls sideways: every place is in view and one tap away. Above the poster, not under it: the posters are different heights, and the strip stays under the finger from one style to the next. The style being shown has the press ink's frame; All and Yours are filled when shown.
- **While a search is showing, the strip is not**: none of its places is the one being shown, and a phone's keyboard has half the screen. Clear (or "Show every chart" where nothing matched) is the way out to it.
- **A chart's mark is its play button, printed in the ink of the style it was written for, and the style's name in its line.** One of the player's own says "Yours" in a small box wherever the list holds built-in charts too, and has its actions behind More in every list it is in, not only on home.
- **A chart that names no style, or one this version does not have, has a grey-violet ink** (`--ink-other`), is in All, Yours and what a search finds, and is under no style. `#/charts/<a style that is not there>` shows every chart.
- **The inks are in the stylesheet**, as tokens at its top (`--ink-blues` …) and one line each that gives the ink to anything marked `data-style`. That is the table by style id; a style with no line gets `--ink-other`. The line about how a style sounds (`posters.ts`, taken from the study) is by style id too, and a style without one has none. A style's band is read from its pack: each instrument is named by its own pack's `pack.json`, so the wall says "clean electric guitar" where the study's own table said "clean guitar".

**Home**

- **The poster is the last thing played as it was played**: in the style, key and tempo chosen for it on its own screen, since that is what its Play starts, and in that style's ink. A take played says it is a take, when it was kept and how long it runs. The two things played before it are the smaller bills (style, key and tempo); one alone is as wide as the poster.
- **Home lists every chart of the player's own**, as before. The way to the whole library is a block of the app's own ink under them: "All 54 charts".
- **Takes is an address** (`#/takes`), so the row of places over a take has somewhere to go and the back gesture returns to it. Every kept take is listed there, with or without its chart; home's shelf of "takes of charts no longer here" is gone with the need for it. A chart's own screen still lists its takes.
- **The wall's heading counts the styles in words** ("Eight styles"), and each bill counts the charts written for its style, the player's own included.

**The way back**

- **The row is `‹ Home`, then the place the screen belongs under.** A chart: the style its text names (not the style it is being played in), as that style's bill; with no style, "Charts". A take: "Takes". Credits: `‹ Home` alone.
- **The editor's row is its chart's row**, `‹ Home / <STYLE>` or `‹ Home / Charts`: the editor is beside its chart, not under it. On a phone held upright the second place is left out, because the same row holds the chart's name, Undo, Redo and Play, and Play is the way to the chart.
- **A take's screen no longer goes back to its chart**; it goes to Takes. The chart is a word at the end of the take's top row, "Open its chart", where a chart's screen has Edit. A take deleted leaves for Takes.
- **Coming back is to where the page was** (`Browse.tsx`): home from anywhere; a part of the library when it is come up to from a chart, a take, the editor or credits, or reached by the browser's back or forward. A part of the library gone to afresh, from the wall, the strip or a search, starts at its top. The browser's own scroll restoring is switched off, since each address is a different page in one document.
- **How an address was reached is told by a mark on the history entry** (`address.ts`): the app marks every entry it has shown, so an entry already marked was come back to.

**The chart's screen, the take's, the editor: the look only**

- **The chart's name is on a line of its own under the row of places.** The row, with "Edit a copy" at its end, leaves no room for it on a phone. It costs the chart about 30 px there until the next brief rebuilds the screen.
- **Play is a block of the ink of the style the band will play in**, as wide as its row has room for, and Stop is the same block in the app's ink. The study's Stop is the press ink on a dock flooded with the style's ink; with no flooded dock that would be the style's colour as type on dark paper, which the palette rules out. The editor's Play is in the ink of the style the chart will be played in.
- **Edit, Edit a copy and Open its chart are words at the end of the row, not boxes**, as the study has Edit and More.
- **Corners are square throughout** (the editor's dock, its keys and panels, the arrangement's cells), outlines are 2 px, and the one round thing is a line's play button. The highlighter's stroke keeps its own shape.

**The look**

- **A style's name is fitted by the stylesheet from one number**, its width in ems, measured once for each name after the type's own letters are in (`PosterName.tsx`); until they are, the width is a guess of 0.49 em a letter, so a name is not set at a size worked out for other letters.
- **A press on a block of colour is the colour a shade darker (mixed with the press ink), with no transition and no filter.** The stylesheet has no transition and no animation; the only movement in the app is the chart's page following the band, which was there and is off under reduced motion.
- **The page listens for touches and does nothing with them** (`main.tsx`), so that Safari on a phone shows `:active`. Not seen on a phone.
- **`out/wall-1/`** (the pictures of this part) is ignored by git.

**Tests**

- **Smoke journey 1** looks for the wall's Jazz as a link (it was a button that filtered home), fills the search box by its new name ("Find a chart"), and also sees the way home at the top of what was found, which is the library. **Journey 5** leaves the chart by the row of places (`Home`, in the navigation "Where you are") where it pressed "Back to the charts", and comes back through the poster at the top of home where it came through Recent. Journeys 2, 3 and 4 are as they were. Nothing was added.

## the poster wall, part 1: checked and merged (stage 6)

Read on the main thread: the diff (2,408 lines in, 864 out, all in `packages/app` and the smoke journeys; nothing in the engine, the styles or the audio), `pnpm check` (16.0 s of 20), the five smoke journeys against the built app (9.2 s), and its screens photographed again from the merged tree at phone and laptop size (home, the wall, the library showing jazz and showing everything, a chart). The walk Brandon got lost on (home, a style, a chart, back) was walked: a jazz chart's row reads `Home -> #/` and `Jazz -> #/charts/jazz`.

- The builder's decisions stand as logged above, among them: search is the library showing what was found (the box moves from home into the library's top bar on the first letter); a take's row goes to Takes, with "Open its chart" beside it; lists are by title.
- **Known and left for the next parts or his eye**: on a phone a style's list starts about 435 px down (the bar, two rows of the strip, the poster head); a long chart title is cut to one line; `theme-color` is still the paper; nothing has been seen on an iPhone (safe areas, the pinned bar under Safari's toolbars, how a press shows).
- **Builds from here go to Opus where the design is drawn** (Brandon, 2026-11-16: "should we lean more on opus for most of the building?"; agreed): parts 2 and 3 are built from the study's pages. Fable keeps the briefs, the checking, and anything that turns out to need design.

## the poster wall, part 2: the chart's screen (stage 6)

Built to `prompts/app-poster-wall-2.md`, from the study's direction A (`out/look-study/a/chart-*.html`, `take-1.html`). Nothing in the engine, the styles or the audio package changed. What that brief did not settle:

**The line and its sheets**

- **A sheet is the browser's own modal dialog** (`play/Sheet.tsx`): the screen behind it is inert, Escape is its `cancel`, a press on the dimmed screen closes it, the sheet itself takes the focus as it opens (so nothing is ringed by a touch, and the next Tab is its first control) and the focus goes back to what opened it. It rises 28 px in 140 ms on a phone, closes at once, and does not move under reduced motion; from 720 px wide it is a 440 px card at the foot of the middle, as the study draws it. It is the only animation in the stylesheet.
- **Its way out is a filled "Done", the study's word**, in every sheet. The brief says "its own Close"; Done is what the study draws, and every change in a sheet is made at the press, so there is nothing to confirm or cancel.
- **A choice of one closes its sheet** (style, key, length), as the study's do. Tempo and how the chords are written leave it open: each press there is a step, and the figure or the page behind has to stay in view.
- **The tempo sheet keeps the study's slider** under the figure, over the style's whole range, a beat at a time; minus and plus step by 4 as before, and are not pressed past the style's limits.
- **The way back on the tempo sheet**: with a tempo he set, "Back to 100, as written" (or "Back to 76, reggae's usual" where the chart is played in another style); with none set and the chart played in another style at that style's usual tempo, "Play at 176, as written" sets the chart's own, held to the style's limits.
- **"The song, once through" is offered for every chart**, as the Length picker offered it. The brief says "where the chart has an arrangement"; keeping it to those would take away playing a 12-bar blues once through, which the screen does now.
- **The key sheet is the twelve keys of the written mode from C, as the picker spelled them** (G flat, not the study's F sharp), the written one marked "written".
- **While the band plays the line is a statement**: the same bold words with the ink taken from under them, plain text and not buttons, and "(changed when the band is stopped)" for a screen reader. A take's line is the study's plain sentence: "A take kept 16 Nov: Jazz in Bb, 176 bpm, 2:57".
- **The space bar is not the transport inside a sheet**: there it presses the button under the focus, as anywhere a choice is being made.

**More**

- **More is a word at the end of the top row**, after Edit (or "Edit a copy", which part 1 put there and which stays: the next brief makes Edit a mode). A built-in chart's More also has "Make a copy to edit", as the brief lists.
- **The sheet's heading is the screen's name.** How the chords are written is a joined row of three, each with an example in the key it is played in ("Names A7", "Numerals I7", "Both A7 over I7"). Focus is a line that says what it does, switches, and closes the sheet so the page can be seen; it is still forgotten when the screen is left.
- **An instrument is chosen in More only before Play**, as the pickers under the Band row were, and the line is the browser's own list laid unseen over it (a phone's wheel). "Soloist plays" is there while the soloist sits out too, and says so: choosing the instrument first is reasonable.
- **A kept take is a line named for itself** ("Kept take, 14:05" for one kept today, else the day; its own name if it was given one) with its style, key, tempo and length under it.
- **Export MIDI and Export the chart's text close the sheet**, so the download is seen. **Duplicate opens the copy; Delete, asked first, goes to the chart's place in the library**; Rename is typed in the sheet.

**The dock**

- **The ink floods the dock from the press of Play**, through the band loading, not from the first note: the press is answered in its frame, as Stop already was.
- **Keep is there from the press of Play** (dashed, until the take is made) and stays beside Play after the band stops, until the next Play: Stop never moves when the take arrives, and the take just played can still be kept, as before. A song has Keep and Stop, no Finish.
- **Stop covers the middle of where Play was.** On a 390 px phone Keep (about 60 px) and Finish (84 px) leave Stop from 176 px; Play's middle is 195. On a laptop the transport is 360 px wide for the same reason (at 320 the middle of Play was Finish).
- **The last pass is not red on the flood**: red on a spot colour is the palette's no. It says "Last pass", and the way home is shaded in the arc.
- **A player in the band is an outline; out of it, a dashed block that says "sits out"; switched on while the band plays a take it is not in, hatched and dashed, "in next time".** On a take, a seat that is not in the take is dashed, says "not in this take", and cannot be pressed.
- **Phone: the strip, the players, the transport, three rows. From 820 px: the strip over the players, the transport beside them. From 1100 px: one row** (strip, players 400 px, transport 360 px) in the chart's 64 rem column.

**The players alive**

- **`play/lamps.ts`**: each seat's onsets are the take's sounds by the chair they sit in (the seat before the colon of the sampler's name), one per moment (a chord lights once); nothing before the first bar of music (the count-in). When the take is replaced under the band, the onsets are replaced from the same second the player's sounds are. `useJam` keeps them beside the player and hands out one function, `follow`, that reads the player's position less the output's latency; it never sets state.
- **A lamp is a copy of the block's words in the paper's colour on the ink, laid over the block**, and the frame loop writes only its opacity: full for 37.5 ms, then out by 150 ms on a squared ease (the study's keyframes). The loop runs only while the band plays, not at all under reduced motion, and a seat out or silenced does not light.

**The tempo when the style is changed**

- **`tempoFor` in `play/jam.ts`**, used by the chart's screen and by home's poster and bills (so home says what Play will play). A tempo he set is kept and held to the style's limits when it is used, not when it is stored, so going back to the first style gives back what he set. A chart that names no style, or one this version does not have, keeps its written tempo in every style.

**A kept take's screen**

- **Its mutes are the screen's own**, not the chart's switches: everyone is heard when it opens, a seat silenced stays silenced from one Play to the next on that screen, and nothing is stored. Rename, Export MIDI, Export take and Delete are its More. "This browser is not keeping takes" is said where the screen's problems are, over the dock.

**Left as it is**

- **At 1280 px the chart is set eight bars to a line**, where the study drew four: that is `ChartView.tsx`'s rule given a 64 rem column, which this brief did not open.

**Tests**

- **Smoke journey 5** opens More before each export (the play screen's while the band plays, the take's two), presses the export inside the sheet, and reaches the kept take through More's "Kept take" line where it pressed the link under the chart. What it proves is unchanged: both MIDI files equal the CLI's. Journeys 1 to 4 are as they were.
- **`out/wall-2/`** (the pictures of this part) is ignored by git.

## the poster wall, part 2: checked and merged (stage 6)

An Opus build from `prompts/app-poster-wall-2.md`. Read on the main thread: the new modules whole (`play/lamps.ts`, `play/Sheet.tsx`, `tempoFor` in `play/jam.ts`, what `useJam.ts` gained), the diff's shape (13 files, all in `packages/app` and the smoke journeys), `pnpm check` (16.1 s of 20), the five smoke journeys against the built app (10.3 s), and the screen photographed from the merged tree (a chart before Play, playing, More) beside the study's. The lamps were sampled in the page for three seconds of a playing blues: drums, bass and chords each reached full ink, the soloist sitting out stayed at nothing.

- The builder's decisions stand as logged above. Two go against the brief's letter and are right: "The song, once through" is offered for every chart, as the old picker offered it; sheets close with "Done".
- **Known and left**: at laptop width the chart sets eight bars a line in the 64rem column where the study drew four (the chart's own layout rule, not opened here); a take's Rename shows its chart's name; a phone on its side is only compacted. Nothing has been seen on an iPhone: the sheet (the browser's own modal dialog) over Safari's toolbars, the flood in a dark room, whether the lamps sit on the notes by ear.
- **Part 3 (Edit as a mode of this screen) waits for Brandon's hands on parts 1 and 2**: it is the largest piece, it moves the editor he passed on his phone the same day, and what he says of the chart's screen changes what it is built on.

## the poster wall, part 3: Edit is a mode of the chart's screen (stage 6)

Built to `prompts/app-poster-wall-3.md`, from the study's sketch (`out/look-study/a/chart-my-sunday-groove.html#edit`). Nothing in the engine, the styles or the audio package changed; `viewport.ts`, `rewrite.ts` and how `BarEditor` places itself did not change. What that brief did not settle:

**How the editor is hosted**

- **The editor is a hook of the chart's screen** (`edit/useEditor.tsx`, which was `EditView.tsx`), not a screen of its own nor a component inside it. Its state lives in the chart's screen, so a bar pressed is drawn open inside the press (`flushSync`, as before) and the field takes the focus there, which is what brings a phone's keyboard up. A child component handing its parts up would draw them a frame later, outside the press. The hook hands back parts and `Stage` places them: the chart to press, the text or the grid, the dock's words and controls, and the dock that sits on the keyboard.
- **Playing and editing are one screen at the same place in the tree**, so going from one to the other redraws nothing: the chart's frame, its scroll and the focus on the button stay. Edit and Done are one button.
- **The steps are kept while the pencil is down.** Putting it down writes everything (the bar being typed with it); picking it up again starts from the chart as saved, on the Chart side, with nothing to take back.

**The address**

- **`#/edit/<id>` is kept as the mode's address**, so every link to the old editor (home's New chart and Import, a row's Edit) opens the mode, and a reload stays in it. An `#/edit/` address of a built-in is put back to its `#/chart/` address.
- **Edit is one step of history; Done goes back over it** when Edit made it, and otherwise (a reload, New chart, a copy just made) puts the chart's address in the mode's place. Either way Done adds no entry, and the phone's back gesture from the mode lands on the chart.

**What stays where it is**

- **The chart is set in the mode as it is for playing**: the same layout rule, the same frame, the same lines opened up by the height left over. The editor used to set every chart at the size it is wanted at and scroll it, so that a phone's keyboard would not re-set the page; that is now done by holding the height the page was set for (`Editing.held`) while a keyboard, or the dock on it, has the room. The page in the mode always scrolls.
- **The dock keeps its height**: the editor's things are laid over the strip and the players, which keep their room under them unseen (a grid area over both, on every width). So the frame is the same height in both modes, the chart does not move, and Play is where it was.
- **A section's name keeps its play-screen height** (it was at least 38 px in the editor); its fingertip of room is its own, outside it.
- **The one exception: a chart of one section with no name.** The play screen shows no name over it; the mode shows "A", since the name is where the section's actions are (adding a second section, renaming). Its bars move down by the name's height, and the page is fitted with the name counted, so it still fits.
- **In the mode the chart is drawn in the key it is written in**, since that is what is typed; the line above still says the key it will be played in.

**The dock**

- **Words, then a row: Undo and Redo, and Chart, Text, Arrangement as one joined switch** (the editor's own three sides, so the way back from the text is the switch itself). The words say "Press a bar to change it.", which bar is open (on a laptop), or once, for a copy just made, "This is your copy. The built-in chart is unchanged." What there is to fix is "1 to fix" beside the words, in the red pencil, and opens the text. On a laptop the words and the row are one line, in the strip's and the players' place.
- **On a touch screen, a bar or a section open has the foot of the screen**: the band's dock waits and the editor's dock is the screen's last row, fitted to what the keyboard leaves, as before. While the keyboard is up (a bar, or the text, being typed) the title and the line are put away too and the row of places stays: with them the chart above a bar's dock was a line and a half.
- **The space bar is not the transport in the mode**: there it presses what has the focus (a bar, a section's name), as in the editor.

**The rest**

- **Play from the mode** writes everything, puts the pencil down and starts the band from the chart as saved, once the screen is drawn from it (the browser is woken inside the press, as home's play buttons do).
- **More's Rename in the mode is a step of the editor**, taken back with Undo, as the title typed in the editor's header was. The title is no longer typed where it stands: it does not move now, and More has Rename. Duplicate writes everything first; Export the chart's text exports the text as it stands.
- **Focus is off in the mode and not in More there**: it shows two lines, and every bar must be there to press.
- **"Edit a copy" makes the copy, gives it the choices the built-in was played with (style, key, tempo, instruments) if it has none of its own, and opens it in the mode.** Otherwise the line would change under the player's eyes.
- **The editor's `.dock` is `.key-dock` and the text's `.more` is `.problems-more`**; the chart's More is `.more`. There are two docks on the screen now, so the band's keeps `.band-dock`.
- **On a phone the text and the grid take the chart's place** between the top and the dock; on a laptop they sit beside it, the two in the chart's 64 rem column.

**Tests**

- No journey's steps changed: journey 3's New chart, bar, Text and diagnostic steps find the same names in the mode. Nothing added.
- **`out/wall-3/`** (the pictures of this part) is ignored by git.

## the poster wall, part 3: checked and merged (stage 6)

An Opus build from `prompts/app-poster-wall-3.md`. Read on the main thread: the whole of `useEditor.tsx`, the changes to `App`, `PlayView`, `Stage` and `ChartView`, the builder's pictures. Then walked in headless Chrome at 390 by 844 (touch) and 1280 by 800:

- **Edit, a bar typed, Play from the mode**: the address goes `#/chart/` to `#/edit/` and back, the bar as typed is what is saved, and the band is playing the saved chart (its first bar on the page is the new one).
- **History**: Edit then Done then back lands on home, not on the chart twice. "Edit a copy" on a built-in opens the copy in the mode and says so once; Done then back lands on the built-in.
- **Delete from the mode with a bar being typed**: the chart is gone and stays gone (a save for a chart that is not there writes nothing).
- **A reload in the mode stays in it**; an `#/edit/` address of a built-in is put back to `#/chart/`.
- The five smoke journeys pass with no step changed. Typecheck and lint pass. Nothing in the engine, the styles or the audio package is in the diff.
- The builder's decisions stand as logged above.
- **Known and left**: on a phone with a bar open there are two buttons that say Done (the top one leaves the mode, the dock's closes the bar); a chart of one unnamed section moves down by its name's height when the pencil is picked up; a copy has the same title as the built-in it was made from; between 820 and 1100 px the dock's words sit low. Not seen on an iPhone: that a tap on a bar raises the keyboard now that the editor is hosted in the chart's screen, and where the dock sits on it.
## small things in the app, 1 (stage 6, during gate 6)

Built to `prompts/app-tidy-1.md`. Nothing in the styles or the audio package changed; in the engine only the MIDI export (item 5). No test added, no journey step changed.

- **1. The way out of the editing mode says "Stop editing"; Done is the dock's alone.** He has used the dock on the keyboard and passed it, and Done there is where a phone's own keyboard puts it (close what is being typed); the top button is the one that changes. "Stop editing" is the plain pair of "Edit", fits the row at 390 px (97 px wide, the row 46 px high as before), and is not "Finish", which is the transport's word for a jam. A sheet's Done is now the only Done on the screen too.
- **2. "Edit a copy" and "Make a copy to edit" make "<title> copy"**, by the same rewrite Duplicate uses. A copy not yet changed is opened again rather than made twice, as before (it is found by its text, now the copy's text). A changed copy and a second one share the title "<title> copy", exactly as two Duplicates of one chart do: Duplicate does not number its copies, so neither does this.
- **3. More in the editing mode has "Meter"**, the browser's own list laid over the line as "Soloist plays" is: 4/4, 3/4, 6/8, 12/8, 6/4, and a meter typed in the text that is not one of them is shown as typed and listed first. The choice is `remetered` in `edit/rewrite.ts`: only the `meter:` line the parser reads is rewritten (a trailing comment kept), or one is put under the header's last field line, or at the top where there is none. A commit of the editor, so Undo takes it back. Bars that no longer fit are the parser's to point out, and are: "1 to fix" and the bar marked, as for any bar that does not fit. Shown only with the pencil down, as the brief says.
- **4. Left: a style's page on a phone.** At 390 by 844 the strip ends at 142 px and JAZZ, at the size that fills the measure, is a 159 px box with 128 px of ink, so the name alone ends near 285 to 300 px; the two lines under it (what the style sounds like, its band and range) are 84 px more. Taking in the white space (about 45 px, worked out, not built) would bring the jazz page's first row from 443 to about 400, not under 300; it was not done, since it misses the mark and changes a passed look. Under 300 for every style would take one of: the two lines moved out of the head on a phone (under the list, or dropped), the strip set as one row that scrolls sideways (part 1 chose wrapped), or the name set smaller on a phone. Each is a design call for his eye.
- **5. A seat played on another of the style's instruments is exported with that instrument's General MIDI program.** `toMidi` takes the take's `instruments`; the program of a chosen pack is the instrument list's (`SOLO_INSTRUMENTS`, keyed by pack: the nylon-string guitar is 24, the steel-string 25), and the style's own number where the choice is the style's own pack. The app's worker and the CLI pass it, so smoke journey 5's bytes still agree. The soloist was already exported with the program of the instrument that played (from its notes' voice); checked, not changed. Track names name the seat ("Chords", "Solo") in every file, the style's own instrument included, so they were left: naming the instrument there would change every golden.
- **6. A kept take's Rename says the take's own name**: "Called “Kept take, 9:47 PM”" (the name the chart's More gives it) until it is named, and the box starts empty with that as its placeholder. A take is kept under its chart's name, which the app already reads as no name of its own (`takeName`, now in `takes.ts`); Rename was the one place that did not.
- **7. No change: a take or a recent entry whose chart was cut already behaves as asked.** Checked with a take naming `blues-numerals-bb` (cut), an old take naming no chart with the cut chart's text and title, and recents for the cut chart and that take: neither take's screen offers "Open its chart", the recent chart is not listed on home, and the take is listed, opens and plays from its own text. No cut chart's title is carried by a chart still in the library, so the old take's match by title finds nothing.
- **8. A chart's title on its screen runs to two lines, then is cut** (`.chart-title`, a two-line clamp). A title that fits on one line is the height it was (the line under it starts at 76 px, as before). The lists already wrap a title over as many lines as it needs and were left so; the More sheet's heading is still one line.
- **9. No change: the page already gives the dark paper to the dark theme** (`index.html` has had a `theme-color` for each scheme since the app went offline; Chrome in the dark scheme matches `#15132b`). The manifest's `theme_color` and `background_color` are the light paper, and a manifest cannot vary them by scheme; an installed app's splash and title bar before the page loads may be light. Not changed.
- **10. Left: the search box.** The first letter already keeps the box, its focus and the caret (one component at one place in the tree); what moves is where it is drawn, from under the name (78 px down at 390, at the left at 1280) to the library's pinned bar (2 px down, beside Home; at the right on a laptop). Keeping it under the finger would take the library showing what was found to keep home's top while the search came from home, with the way home somewhere else, or home's box moved to where the library's is: either reorganises the two screens.
- **`out/tidy-1/`** (the pictures of this work) is ignored by git.

## small things in the app, 1: checked and merged (stage 6)

An Opus build from `prompts/app-tidy-1.md`. On the main thread: the whole diff read (172 lines); typecheck, lint and the push suite pass on the merged tree; no golden in the diff; the smoke journeys pass with no step changed.

- **Done**: the editing mode's way out says "Stop editing" (Done is the keyboard dock's alone); a copy of a built-in is "<title> copy"; More in the mode sets the meter (4/4, 3/4, 6/8, 12/8, 6/4), a step Undo takes back; exported MIDI gives a seat the program of the instrument it was played on; a take's Rename shows the take's name; a chart's title runs to two lines on its screen.
- **Already right**: a take or recent entry of a cut chart; the toolbar colour in each theme.
- **Left, each a design call for Brandon if it bothers him**: a style's list on a phone starts 364 to 443 px down (the poster name alone ends near 300; reaching the list sooner means a smaller name, the two lines moved out of the head, or the strip in one scrolling row); the search box is drawn in another place once a letter is typed (focus and caret are kept).

## the poster wall in motion: a study (stage 6, during gate 6)

Built to `prompts/app-motion-study.md`, with the owner's addition of the same day ("i still want to keep the look uniquely ours"): two more switches whose motion is the poster wall's own (9, 10), and the two most Metro-like things (6, 7) set in our type and inks. A study for his hands, not for merging as it stands. Nothing in the engine, the styles or the audio package changed; no test was added and no journey step changed.

**How it is held together**

- **`packages/app/src/motion/`**: `switches.ts` (the ten switches and the speed, in `localStorage` under `ensemble.motion-study.1`, said to the stylesheet as `m-<id>` classes on `<html>` and `--m-speed`), `moves.ts` (tilt, feather, print, page turn, continuum, the flood), `live.ts` (live tiles), `Switchboard.tsx` (the corner control and `#/motion`). The stylesheet's rules are all under one heading at its end, "The poster wall in motion: a study", each behind its switch's class.
- **All on to begin with; a build made with `VITE_MOTION=off` begins all off.** That is how the smoke journeys are run with the switches off without touching the journeys: `VITE_MOTION=off pnpm smoke` (Playwright's web server inherits the variable and builds with it). Plain `pnpm smoke` runs them with everything on.
- **Every motion is the browser's own animation (`Element.animate`, CSS keyframes on a mark, or a view transition) of `transform` and `opacity` only**, started in the frame of the press or of the screen's first render. Nothing waits on one; a new press finishes or cancels what is under way. Every one checks `prefers-reduced-motion` at the moment it would start; the marks' keyframes are inside a `no-preference` query.
- **The corner control is a 15 by 44 px slip in the top right corner, inside the page's right gutter**, where nothing of the app's is pressed on any screen. A 30 px square there covered the end of "More" on a chart's screen. It opens the switchboard as a sheet; `#/motion` is the same board as a page.
- **The address keeps what the screens are drawn for (`shown`) apart from where the app is (`current`)**, and `onArrival` lets the study tell the screens itself, from inside a view transition. Without the study the two are always the same and the screens are told at once, as before.

**What each was decided to be**

- **1. Tilt**: the innermost of tile, poster, bill, a row's play button, the poster's Play, the dock's Play, a player, a sheet's option or menu line. Up to 10° on a small thing and 4° on a large one (600/size, then 900/size after a first look at 2.7° on a tile), scale 0.97 to 0.985, perspective three times the thing's size; written inline in the `pointerdown`, sprung back over 100 ms with a 0.4 % overshoot. Not the switchboard's own buttons.
- **2. Feather**: home's poster, bills, the first charts' rows and tiles, any list's rows, a sheet's options. Each moves 28 px from the right and fades in over 110 ms; pieces at the same height come together, a line every 22 ms, and from the fifth line on the rest come with the fifth: in by 198 ms. Only what is in view at the first frame. Not in a sheet over a chart while the band plays. A search being typed is not an arrival.
- **3. Continuum**: a same-document view transition with the page itself not captured (`view-transition-name: none` on the root while it runs), so only the pair moves and the rest changes at once; `pointer-events: none` on the transition's layer. The pair is the words of a link to where the press leads (a tile's name, a row's or the poster's title) and the heading there (a style's poster name, a chart's title), or going up, the heading left and the link to it on the screen arrived at. Not from a play button: the band would start a frame later for it. A press during one skips it.
- **4. Page turn**: the screen's root moves in 32 px over 150 ms. Back is the browser's history or a screen higher than the one left (home, the library, then a chart, a take, credits); a move between parts of the library is forward. Edit and the chart are one screen.
- **5. Live tiles**: a tile's back is one of two facts on its own field of ink, "6 charts written for blues" or "Last played in blues" with the chart's title (where one has been played in that style); each turn to the back shows the next fact. The turn is the tile's `rotateX` to edge-on and round, the faces' opacity swapped at the middle. 6 to 10 s apart, a tile not the last, in view, not pressed, nothing turning; none while a dialog is open or a chart's screen is playing, none while the page is hidden.
- **6. Pivot**: at every width, not only a phone, since it is a study and a laptop's strip already fits one row: the words in the poster's capitals (2.75 rem, 3.25 from 900 px), the place shown in full ink with a 4 px rule under it, the rest at 36 %, on the field the strip stood on. Scrolled so the place shown is at the left edge on arrival (again once the type's letters are in). Each style's own bill colour is gone from the strip with it: a style's ink as type on paper is what the palette rules out.
- **7. Oversized titles, on a phone only (under 900 px)**: home's ENSEMBLE at 28 vw (about 1.1 times the screen), with Charts and Takes under its right end on a line of their own; a style's name at 1.3 times the measure it filled. Not on a laptop: a name wider than 1280 px would be taller than the screen. It costs a phone's first rows their place (figures below); the brief's "only where it does not cost the chart list its place" is not met on a phone either, and is left for the owner to weigh rather than the switch made to do nothing.
- **8. The flood**: with 8 or 9 on, the dock stays paper and the style's ink is a field laid under its words (`.flood`), so it can arrive by transform. 8: from Play's own box to the dock's in 120 ms. The dock's words take the press ink at the press, as before, so for those 120 ms the words outside the risen ink are press ink on paper (in the dark theme, dark on dark).
- **9. Print**: the poster, the bills, the tiles in view and a style's head land from 3 % oversize and nothing to size and full in 120 ms, all at once; the flood from 2 %. Where 2 and 9 are both on, the ink fields are printed and the rest feathered; where 8 and 9 are both on, the flood is printed.
- **10. Marks**: the underlines of the sentence's parts (drawn when the chart's screen opens and when the band stops and they come back), the strip's frame or All's or Yours' fill round the place shown (the pivot's rule, with 6), and a sheet's chosen option (the filled block, or a style's frame), each laid as a mark of its own and drawn by `scaleX` from its left edge in 120 ms. Never the chart's marks.

**Measured (headless Chrome 157, the dev server for the motions, the built app for timings)**

- A style's page, first chart row from the top at 390 by 844: jazz 443 (as is), 409 with the pivot, 490 with the titles, 456 with both; neo-soul 366, 332, 391, 357; acoustic 364, 330, 388, 354. The pivot saves 34 px, not "much higher": it is 60 px where the wrapped strip was 94, and the name and the two lines under it are as they were. Getting far higher would take the pivot's word standing for the poster's name, a design call left to the owner. Home's poster with the titles: 142 to 244.
- Continuum: the screen's DOM changes 32 ms after the press (the browser captures the old screen first), where it otherwise changes in the press's task.
- **`out/motion-study/`** (pictures, frames and the probe that took them) is ignored by git.
- Smoke journeys: 5 of 5 with every switch on (`pnpm app:build && pnpm smoke`, 12.0 s) and with every switch off (`VITE_MOTION=off pnpm smoke`, 11.6 s; that build's switches start false, checked in its script). `pnpm check` passes (19.2 s of 20; a run while a live render and two servers shared the machine went to 21.7 s, with nothing changed in what it tests).
- Late notes, `pnpm render:audio … jazz-rhythm-changes-bb.chart live=1`, before and after: 3088 on time, 0 late, 0 dropped, both. It does not open the app's screens.
- The built app, every switch on and every switch off, four runs each: a walk of entrances (home, a style, a chart, back, back, the library, another style) had one long task of 63 to 201 ms in every run either way (the chart's screen being made), and in one run with everything on four (to 195 ms) and a 317 ms frame. Twelve seconds of the band playing with players pressed and More opened and closed: no frame over 20 ms in any run, no long task.

## the poster wall in motion (stage 6, during gate 6)

His verdict on the study, tried on his iPhone 17 with every switch on, 2026-11-16: **"looks great! the live tiles are a bit much, but everything else looks wonderful"**. Then, after more time with it: **"on mobile, the app name is cut off on an iphone 17. we should scale appropriately"**. Built to `prompts/app-motion-build.md` with that note applied: what he saw with everything on at the speed "as specified", less the live tiles, with no title cut by the screen's edge. **The earlier rule "nothing moves on load" (the poster wall's briefs, parts 1 to 3 and the tidy) is relaxed by his word.** What replaces it, now in `docs/BRIEF.md` section 11: motion is short and eased out, says where a thing came from, never delays a press, and is off where the device asks for less. Only `transform` and `opacity` animate.

**How it is held together**

- **`packages/app/src/motion.ts`** (the study's `motion/moves.ts`, less its switches): the tilt, the arrival (turn, print, feather), a sheet's options, the dock's flood, the continuum. `App.tsx` calls `arrived` from a layout effect, `Sheet.tsx` calls `stageSheet`, `Stage.tsx` calls `flood`; `address.ts` keeps the study's hold on an arrival (`shown`, `onArrival`), which the continuum needs. The rules in `style.css` stand where their subjects are (the pivot with the library's places, the marks with the sentence and the sheet, the flood with the dock), with no `html.m-*` gate.
- **The times and distances are tokens at the top of the stylesheet** (`--move-*`); `motion.ts` reads the ones it plays itself once, on first use, so there is one place to change them.
- **Taken out**: the switches, the switchboard and its corner slip, `#/motion`, the speed, `VITE_MOTION`, the live tiles (`live.ts`, the tiles' backs and their styles), the flood's wipe from Play (8; with 9 on it was printed, so he never saw it), the marks' rules for the wrapped strip (they applied only with the pivot off). The stored switches (`ensemble.motion-study.1`) are removed from a browser that has them, at start (`main.tsx`).

**Each motion as it is**

- **Tilt**: as the study's (a tile, the poster and its bills, a row's play button, Play, a player, a sheet's option or menu line; 4 to 10 degrees by size; written in the `pointerdown`'s own task; back in 100 ms with a 0.4 % overshoot). Not on Play in the editing mode's dock. The old `:active` `translateY(1px)` is gone from the buttons that tilt, kept for them under reduced motion and for Play in the editor's dock, where they do not tilt.
- **Arrival**: the screen's root turns in 32 px over 150 ms (from the right going forward, the left going back; not on the first screen); the ink fields in view (poster, bills, tiles, a style's head) are printed from 3 % oversize in 120 ms; a list's rows in view are feathered 28 px from the right over 110 ms, a line every 22 ms, the fifth line and after together. **Not into the editing mode** (an address `#/edit/…` arrived at directly: New chart, Edit a copy): the keyboard may be coming up, and the frame holds still for it.
- **Continuum**: as the study's, 200 ms, only the pair captured. Not from a play button, not into or out of the editing mode, and **a press while a flight is under way ends it**: before the browser has captured the screen being left, the screen arrived at is put in the DOM in the press's own task rather than after the capture. Where the browser has no view transitions the screen changes at once (measured with the API removed: the screen changed in the address's own task).
- **Sheets**: rise as before (140 ms, 28 px); their options feather as on arrival, never while the band plays.
- **Marks**: the sentence's underlines, the pivot's rule under the place shown, a sheet's chosen option, each drawn by `scaleX` from its left in 120 ms. **Not in the editing mode** (the sentence comes and goes there as the keyboard does), and **not in a sheet while the band plays** (`:root:has(.play:not([data-state="idle"]))`): there nothing new moves.
- **The flood**: the dock stays paper and a field of the style's ink (`.flood`) is printed under its words from 2 % oversize in 120 ms at Play's press. It goes at once at Stop.
- **The pivot**: the library's places as one row of large words that scrolls sideways, at every width, as he saw it; on a laptop it keeps to the page's width.
- **Titles**: see below; the study's oversized titles are not kept.

**The mended things**

- **An arriving screen is readable from its first frame.** A feathered piece starts at half its opacity, 28 px out (it was nothing, held invisible up to 88 ms by its place in the stagger); the stagger is unchanged. The printed fields start at half too (they started from nothing, so a style's head was blank in its first frame), and so does the dock's flood (from nothing, the dark theme's dock words were press ink on dark paper for its first frames). Frames in `out/motion-build/c2-*` show the rock page's head and rows legible in the first frame after the press.
- **The continuum's "about 45 px" was not reproduced.** Read frame by frame (Chrome 157, the animations slowed to a tenth and a quarter by the devtools protocol), the first frame of the screen arrived at is offset by exactly the page turn (32 px), and its rows by the turn and their own feather together (60 px, at half opacity); the flight starts where the pressed words were, within 6 px (the tilt under the finger is in what is captured), at scrolls of 0, 45, 153 and 300 px, and ends on the heading, which the browser follows as the turn settles. Run on the study's own commit the frames are the same. The likeliest source of the figure is the turn and feather read together at a slowed frame; nothing was changed for it.
- **The hold**: kept (the screen changes a frame or two after the press when a flight runs, 26 to 70 ms in headless Chrome, noisy); play buttons never fly; Play, Stop and a mute do not change the address, and during a flight the page under it is live and pressable.
- **Titles: a title is never cut by the screen's edge (his note).** Home's ENSEMBLE on a phone is fitted to the width inside the gutters, measured in the real letters (`useLettersIn`, `posterWidth` in `PosterName.tsx`, the same fitting as a style's name); until the letters are in it is at its old size, so it is never fitted to a guess. Charts and Takes stand under its right end, where the study put them: the fitted name leaves no room beside it. **A style's name on its page is the fitted poster name again** (the engineer's reading of his note, applied because it was cut the same way; his to overrule). A laptop is unchanged.
- **Measured at 390 by 844 (dev server, Chrome 157)**: home's poster from the top, main 142, the study 244, now 227. A style's first chart row, main / the study / now: jazz 443 / 456 / 409, neo-soul 366 / 357 / 332, acoustic 364 / 354 / 330. The name's letters end 4 px inside the right gutter at 320, 375, 390, 402 and 430 wide (89 px type at 390); with the web font refused they are at the old size and end at 236 of 374.
- **The name twice on a style's page** (the pivot's word and the poster): left, as he saw it. Removing one would take the poster name off on a phone and the pivot's word standing as the page's heading (its `h1`, and the continuum landing on it), giving the head's ink field over to the two lines under it: the name's 159 px box and its 12 px margin back at 390 (jazz's first row near 240).
- **The editing mode and the sheets**: walked on a phone and a laptop with every animation listed as it started (`out/motion-build/walk.ts`). In the mode, nothing animates entering it, pressing a bar, typing, Enter or Escape, Text or Chart; the two that did, and were switched off there, were the sentence's marks (redrawn each time the keyboard took the line away and gave it back) and the arrival's turn into a `#/edit/` address. Every sheet (played as, key, tempo, how long, More, More in the mode) rises and feathers its options in view when the band is idle; while it plays More only rises, and a choice made in it does not draw.

**Checked**

- `pnpm check` passes, 18.0 s of 20. The five smoke journeys pass against the built app (`pnpm app:build && pnpm smoke`, 11.6 s); no step changed.
- Late notes, `pnpm render:audio … jazz-rhythm-changes-bb.chart live=1`: 3088 on time, 0 late, 0 dropped, on main (`099c1ea`) and on this branch.
- The built app at 390 by 844 with touch, eight runs each of a walk (home, the jazz tile, a row, Play, a mute and back, More and Done, Stop), long tasks (over 50 ms) and long animation frames (over 50 ms): **entrances**, this branch two long tasks in eight runs (82, 86 ms) and one to four long frames a run (51 to 117 ms); main four long tasks (83 to 113 ms) and none to two long frames a run (77 to 118 ms). **While playing and at Stop**, this branch none in any run; main one run with two (137, 70 ms). The arrivals cost frames as the screen changes, none while the band plays.
- Frames, pictures and probes in `out/motion-build/` (ignored by git): `cast.ts` (a screencast through a motion, slowed), `walk.ts` (every animation as it starts, step by step), `hold.ts` and `hold2.ts` (the continuum's hold), `measure.ts`, `jank.ts`, `sheets.ts`.


## the poster wall in motion: checked and merged (stage 6)

An Opus build from `prompts/app-motion-build.md`. On the main thread: `motion.ts` read (the tilt is written in the press's own task; arrivals are the browser's own animations of transform and opacity; everything asks the device's reduced-motion setting when it would start), no trace of the study's switches left but the line that removes its stored key, nothing outside the app and `docs/BRIEF.md` in the diff; typecheck and lint pass on the merged tree; photographed at 402 by 874 (an iPhone 17): ENSEMBLE and a style's name each fit whole inside the gutters. The builder's `pnpm check` was 18.0 s of 20 on its branch; the smoke journeys pass with no step changed.

- **Two things the builder extended beyond the list, kept**: an ink field being printed, and the dock's flood, start at half strength where the study's started from nothing (a style's head was blank on its first frame, and the dark theme's dock words were dark on dark).
- **A style's name fitted whole on a phone is the engineer's reading of Brandon's note about the app's name**: his to overrule.
- **Left**: the name twice on a style's page on a phone (the pivot's word and the poster name; taking the poster name off there would put jazz's first chart near 240 px where it is 409); on a laptop the pivot row's next word is cut at the page's edge, as a row that scrolls. Not seen on an iPhone: Safari's view transitions, the tilt under a finger, the fitted name in iOS's fonts.

## the soloist's settings in the app (stage 6, during gate 6)

Built to `prompts/app-soloist-settings.md`: how busy the soloist is, and when it comes in, set on the chart's screen before Play and passed to the engine as `soloDensity` and `soloFromTop`. Only `packages/app/` changed.

- **The two are reached from a block in the dock, "Solo", in the place Keep takes once there is a take**: to the left of Play from 820 px (so it stands beside the soloist's switch, the last of the players) and to its right on a phone (so it stands under that switch). It is there only before Play, as the line's parts are pressed only before Play; while the band plays Keep and Finish have the row. More was ruled out by the brief; the setup sentence is at the top of the screen, far from the switch; a fifth block among the players would have squeezed the four on a phone.
- **The block says under its name how the soloist will play** ("as usual", "busier", "sparser", "from the top", or two of those), and "not playing", pencilled in as the switch is, with the soloist sitting out. So the dock says whether anything is off its default without opening the sheet.
- **A sheet, "The soloist", in the manner of the tempo sheet**: "How busy" over the tempo sheet's own slider (0 to 1 in steps of 0.05; no number), "Sparse" and "Busy" at its ends, and between them, when it is off the middle, "Back to <style>'s own", as the tempo sheet has its way back. Over the slider the setting in words, since no number means anything to a player: "As jazz plays it" at the middle, "A little busier" / "Busier" / "As busy as it goes" (and the same sparser) at a quarter and the ends. Then "Comes in": "After the band's first time round" or "From the top", each with a line saying what it does.
- **With the soloist sitting out, the sheet opens as ever, and says first, in ink, that the soloist is sitting out and none of it is heard until it plays.** The settings are kept and can be changed.
- **For a song played once through, "Comes in" is shown pencilled in and cannot be pressed, with a line saying it is for a jam**; how busy still applies.
- **The setup sentence says the soloist only when it is off the style's own and is in the take**, as it says a meter only when it is not four: "…, about 3 min, a busier soloist from the top" (or "a sparser soloist", or "the soloist from the top"). It is a part of the line like the others, pressed to open the same sheet. With the soloist out, or a song (for from-the-top), it says nothing, since nothing would be heard different. While the band plays it reads the take's own options, so switching the soloist off or on mid-take does not change what the line says was started.
- **Passed to the engine only where they change what is played**: `soloDensity` only off 0.5 and with the soloist in; `soloFromTop: true` only when chosen, with the soloist in, in a jam. So a take set up at the defaults is option for option the take it was before, and a recipe carries no setting that played no part in it.
- **Kept with the settings that are every chart's** (`settings.ts`: `soloDensity`, default 0.5; `soloFromTop`, default false), as the band and the length are: the player's taste, not the chart's. A settings file kept before them reads without them as the defaults; a density that is not a number from 0 to 1 is read as the middle.
- **A kept take carries them in its recipe's options, as it carries everything else, and plays again with them**; one kept before has none and plays as before. The kept take's line says them in the same words as the chart's line ("A take kept Nov 17: Jazz in Bb, 176 bpm, 2:57, a busier soloist from the top"), so what a take was is read on it.
- **The slider's thumb is the browser's own, as on the tempo sheet**: the one slider look in the app, and on an iPhone the system's thumb.

## the soloist's settings in the app: checked and merged, not yet deployed (stage 6, 2026-11-17)

- **Read**: the diff (app only), and the builder's pictures at 390 by 844 and 1280 by 800, light and dark. At the middle the app passes neither option, so every take made before is the same take; a kept take carries what it was played with.
- **Held from the test site** until the engine reads the two options: a slider that changes nothing would be a fault in his hands.
- **For his hands on the iPhone**: whether the Solo block beside Play (it narrows Play by about 84 px before a take) is where he wants it, and the slider's thumb under a thumb.
## the app's icon (stage 6, 2026-11-18)

Brandon asked "what about an icon?"; the one in place was a placeholder from the app's first commit. Two pages of candidates (`prompts/icon-study.md`, `prompts/icon-study-2.md`, pages in `out/icon-study/` and `out/icon-study-2/`): of the first nine he "liked b the best" (the wall: tiles of style ink) "but i don't think we're done with it yet. how can we make it look more musical?"; of eight variations on it, "b1 is my pick, let's go in that direction. feel free to refine".

- **The icon is B1**: four tiles in the inks of blues, funk, jazz and rock are the four bars of a chart's first line; the first carries E7 as the chart sets a chord, the other three the mark for the same bar again.
- **Refined on the main thread, by eye from renders**: the chord larger and centred in its tile (it sat low and right, pulled toward the middle for Android's circle); the three marks larger (about 20 px at home-screen size before, about 37 now) and centred in theirs.
- **Android gets its own drawing** (`icon-maskable-512.png`): the same icon at 74% about the middle with the tiles run on to the edges, so the iPhone's icon is not composed around a crop it never gets.
- **A tab gets the simpler one** (`favicon.svg`): the four tiles and E7 alone, larger; the marks are dust at 16 px.
- **One script draws all of it** (`scripts/icons.ts`, pictures by headless Chrome), so a change is made once.
- Not checked: a real iPhone's home screen (an installed app keeps its old icon until it is removed and added again), a real Android launcher.


## a gap of paper between the coloured blocks (2026-11-21, #2264)

Brandon: "we might want to have some slight padding between the squares - right now they can run together and make recent songs visually run together". On home the last-played poster and the two bills under it were pasted flush, so two recent charts in one style read as one block; the wall of styles was edge to edge by design. Asked where the gap should go, he chose everywhere.

- **One gap, a token** (`--gap` beside `--gutter` in `style.css`): 6px on a phone, 8px from 900px wide, the paper showing through. Chosen by looking: wide enough that two blocks in one ink are plainly two, narrow enough that the wall still reads as one wall.
- **Where it applies**: between the last-played poster and the bills under it, between those bills, between the wall's tiles both ways, and between the bills of the style picker (the wall in small, so it keeps the wall's rule though its neighbours never share an ink).
- **Not changed**: any block's own size, type or padding; the shorter wall column's last tile still runs down to meet the other's. The other blocks in a style's ink (the trail's crumb, the badge, a style's head, the dock's flood, the play button) each stand alone and touch no other.
- Pictures before and after, light and dark, phone and wide: `out/home-gaps/` (not committed). Waits on his eye on the test site.

## dark mode that extensions leave alone, no light flash, and a pass over every screen in dark (2026-11-21, #2265)

Brandon: "i'd like to make sure we have a real automatic dark mode that looks great and hopefully signals to extensions that there's a native dark mode already active". The app already followed the system; what he saw was an extension recolouring it on top. Still no switch in the app: it follows the system.

- **Dark Reader is asked to keep out** with `<meta name="darkreader-lock" />` in `index.html`, the one thing its documentation gives a site for this. Dark Reader's `CONTRIBUTING.md`, "Disabling Dark Reader on your site" (https://github.com/darkreader/darkreader/blob/main/CONTRIBUTING.md#disabling-dark-reader-on-your-site): "Website pages can request Dark Reader to disable itself by embedding a "Dark Reader lock". The "lock" is a `<meta>` tag with `name` attribute set to `darkreader-lock` which is a child of `<head>` tag in the document." Its README says nothing more for a site's author.
- **Browsers' own forced dark: nothing added, since nothing documented fits.** Chrome's Auto Dark Theme (https://developer.chrome.com/blog/auto-dark-theme) documents one opt-out, `color-scheme: only light`, which would also turn off our own dark theme; it applies to "light themed sites". Android's WebView documentation says algorithmic darkening is not applied to content that uses `prefers-color-scheme` and recommends `<meta name="color-scheme" content="dark light">`, which the page has had all along. Samsung Internet's own post (https://developer.samsung.com/internet/blog/en/2020/12/15/dark-mode-in-samsung-internet) says its "Prefer Media Query Over Force Dark" setting "will only work as expected when the web developer specifies the supported color schemes for the page": the same meta tag, again already there. Nothing more is documented to keep a forced-dark mode off a page that has its own dark.
- **No light flash**: the paper and ink for each scheme are set inline in `index.html` (`html` background and colour, with a `prefers-color-scheme: dark` block), so the first paint is right before `style.css` arrives. A comment in each place says the other must agree. Checked in headless Chrome, dark, with every stylesheet and script refused: the page painted `#15132b`, the paper; the test site's painted `#121212`, Chrome's own dark canvas (dark already, from the `color-scheme` meta, but not the paper). In light the same canvas is white, now the light paper.
- **The manifest is left as it is.** The manifest spec now has `color_scheme_dark` (an override of `theme_color` and `background_color` "when the operating system uses a dark color theme"; w3c/manifest#1207, merged 2026-04-09), but no browser the app runs on is documented to honour it: WebKit landed it (bug 311727, 2026-05-28) and no Safari release notes through 27.3 beta mention it; Chrome's "Dark mode support for web apps" (chromestatus 5714780426862592) still says origin trial, last updated 2022. Worth adding when a Safari release note names it. The `theme-color` metas, light and dark, already colour the bar.
- **Contrast on paper (WCAG; AA is 4.5 for text, 3 for large text and for a line that carries meaning)**: ink 13.99 light, 15.33 dark; faint 5.42 light, 6.66 dark; the search box's placeholder 5.35 light, 7.54 dark; `--rule` 1.48 light, 1.63 dark. The rule failed in both themes, so the lines that carry meaning were moved off it.
- **`--line`, a new token, for a line that carries meaning**: `#8887a6` light (3.04 on paper), `#625f88` dark (3.03), each the rule moved toward the faint ink until it passes three to one. It draws a chart's bar lines (on the chart and in the editor), the edge of an arrangement cell, and the edge of the chart's text box. `--rule` stays for the hairlines that are not the only thing telling two things apart (rows, More's lines) and for what is switched off (WCAG asks nothing of a disabled control), and as the key dock's ground. This changes light mode too, the fault being in both.
- **Text chosen is marked with the highlighter** (`::selection`: `--marker` under `--on-marker`, 12.56 light, 11.50 dark) instead of the browser's own blue, which in dark was a deep blue under light ink. In both themes, the fault being in both.
- **Looked at and left**: focus rings (the ink, or the press ink on a spot colour: they show in both); the tempo and soloist sliders (the browser's own, tinted with `accent-color: var(--ink)`, as decided with the soloist's settings); scrollbars (the chart's are hidden; the page's are the system's own, dark under `color-scheme`); the file picker (its control is hidden behind the "Import a chart" label); selects (More's soloist picker draws in the theme under `color-scheme`); autofill (not to be had in a fresh headless browser, so not seen; nothing added on a guess). The highlighter (`#ffd83b` under `#1e1a4f`, 11.50) and pencil (`#ff8176`, 7.46 on dark paper) pass in dark. The spot colours are unchanged; the underline under a sentence's parts is the spot at 62% over the paper, darker on dark paper, and stays so: at full strength light ink would stand on a bright field where the two meet.
- **The light pencil, a shade darker**: `#cf3d35` was 4.21 on light paper, under 4.5 for the "Delete" button's 15 px type. It is `#c5352d` now, 4.69: the same red, the least change that passes. (Found by this pass in light only, and settled at review: a design call, his to overrule.) The dark pencil is unchanged.
- Pictures before (the test site) and after, light and dark, at 390 by 844 and 1280 by 900: `out/dark-pass/` (not committed). Not checked: a real Dark Reader, a real iPhone or Android. Waits on his eye with the extension on.

## his check of dark mode with the extension on (2026-11-21, #2265)

Brandon, in his own browser with Dark Reader on, the test site serving `342636fd` or later: "browser check worked with dark reader btw". The `darkreader-lock` tag does what its documentation says; with his pass of the pictures the same day ("everything sounds (and looks) good"), #2265 is closed. Not tried: another dark-mode extension, a phone.
