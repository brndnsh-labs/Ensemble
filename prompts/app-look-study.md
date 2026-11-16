# Study: how the app is found, and how it looks (stage 6, before gate 6)

You are working on Ensemble, a backing band in a browser: pick a chord chart, press Play, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles while you practise over it. Every part of the app works and is deployed. This is not a build. It is a study the owner will open on his phone to choose a direction from, as he chose the chart's typeface from a page of candidates. Nothing in `packages/` changes.

## The owner's words

Brandon is a bassist and guitarist; the phone sits beside his instrument, and he also uses a laptop. After the last interface pass, verbatim:

- "works great on iphone, awesome job"
- "seems difficult to navigate though - we should work on that. the audio we've cooked up is genuinely impressive, and i want the app to look and feel visually impressive as well. welcoming vibes, fun place to practice, but still snappy and responsive"

Earlier: "i consider this to largely be a draft state"; "let's make this look nice! :)"; of the previous version, "serif fonts on the chart itself to differentiate from the interface" (done: the chart is in Roboto Serif, and he chose it). He has an iPhone 17. He judges by eye from real screens and his verdicts are short.

## What is there now, and what is wrong with it

Read `packages/app/src/` (the stylesheet's opening comment states the identity: ink on paper, the blue-violet of a duplicated band chart, cool paper, a yellow highlighter for the bar being played, a red pencil for what is wrong; Archivo for the interface, Roboto Serif for the chart). Serve the app (`pnpm app --port <a free port over 8770>`) and photograph every screen at 390 by 844 and 1280 by 800 with `node scripts/look.ts` before drawing anything. What the engineer who wrote this brief saw; check it and add your own:

- **One colour, one kind of box.** Every control is the same outlined rectangle in the same ink: on a chart's screen, before Play, there are fourteen of them at equal weight (Edit a copy; C7, V7, Both; Focus; Style; Key; Tempo; Length; Drums, Bass, Chords, Soloist; Play). Nothing says which matter. "C7 / V7 / Both" (chord names or numerals) is a riddle.
- **No map.** There are three kinds of thing (charts, kept takes, the editor) and one back arrow. Takes live under a chart when it is not playing and in Recent; a built-in chart is changed through "Edit a copy", which lands on a different chart; the editor has its own three-way switch (Chart, Text, Arrangement). Nothing shows where you are or what else there is.
- **Home is a list of lists**: a wordmark, three starter rows, an empty "Your charts", then the built-in library as eight text rows. Eight styles of music and not one of them looks different from another. It is tidy and it is not a welcome.
- **Nothing moves with the music** but the highlighter on the bar. The band is the impressive thing and it is invisible.

## What to make

Two directions, each as a small set of real pages he can walk through on his phone, and one page that introduces them.

**The same structure in both** (structure is less a matter of taste than looks are; improve on this if you see better, and say what you changed and why):

- **Two levels and no more.** Home, and a chart. Everything else is a sheet or a menu over one of those. Back from a chart always goes home.
- **Home** welcomes and gets someone playing in a tap: what was last played, large, with its Play; the eight styles as things you would want to press, each plainly itself; his own charts with New chart; search. Charts and Takes are two views of home (a switch or a bar, yours to place), not two places.
- **A chart's screen** has the chart as the page and little else: its title; Play and Edit as two modes of the one screen (the same drawn chart, so editing is the page with a pencil, not somewhere else); one line that says the setup (style, key, tempo, length), each part pressed to change it, in place of four boxes; the rarely used things (names or numerals, focus mode, rename, duplicate, export, delete) behind one menu; the four players as the band, there to be muted, and alive while it plays (each one showing when it plays a note is a suggestion, not a requirement); one large Play, which becomes Stop with Finish beside it. A kept take is this screen in another state.
- On a laptop the same two levels, using the width (home beside the chart is allowed if it earns it).

**Direction A: the poster wall.** Keep the paper and the ink and take them where they lead: print. Each style gets its own ink (one spot colour each, chosen so the eight sit together and each still holds the indigo ink and the yellow highlighter beside it), home is a wall of them set in Archivo's heavy condensed widths at poster size, and a chart's screen takes its style's ink for the things that are alive (Play, the band, the playhead's surroundings) while the chart itself stays ink on paper. The brief's writer thinks this is the one; you are free to find it wanting, and to say so.

**Direction B: yours.** A different answer to "welcoming, a fun place to practise, visually impressive", different from A in more than palette, and not a default (the `frontend-design` skill lists the looks a generated page falls into; load it first and follow its process for both directions). The chart stays in Roboto Serif and stays the most legible thing on its screen. Say in two sentences what B is and why someone would choose it over A.

**For each direction, pages at phone size that are real enough to feel:**

1. Home, with something recent and two charts of his own, and home as a first visit with nothing played.
2. A style opened (its charts).
3. A chart before Play, using a real chart from `library/` (the twelve-bar blues, and one long enough to scroll, such as rhythm changes).
4. The same playing: pressing Play on the page starts a pretended playhead moving at the chart's tempo and whatever the band's players do while they play; Stop stops it. No sound. This is where "snappy" is judged: every press answers within a frame or two, movement is short (about 150 ms at most) and never in the way, and `prefers-reduced-motion` is respected.
5. The setup line opened to change one thing (the tempo, say), and the menu opened.
6. The Takes view of home.
7. One of these again in the dark theme, and home at laptop width.

The pages link to one another the way the app would (home to a style to a chart, back), so he can walk it with a thumb. Each is a page of plain HTML and CSS with a little script, self-contained in the study's folder, using the two typefaces already installed (copy the font files from `node_modules/@fontsource-variable/` into the folder; make no network request and add no dependency; if a direction wants a third typeface, name it and say why, and draw the page with what is here). Real content throughout: the app's real chart titles, real keys and tempos, the real names of the styles and players, no lorem ipsum. Tap targets 44 px. Visible focus.

**The index page** (`index.html`): what the two directions are, in his language and briefly, a link into each, and nothing else. He reads it on a phone.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/look`, on a branch `look`. Work only inside it. Write the study to `/home/brandon/code/ensemble2/.work/look/out/look-study/` (it is not committed; commit nothing but, if you must, a `.gitignore` line). Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble`, do not push, fetch or deploy, make no network requests.

Photograph your own pages as you go (`node scripts/look.ts <out.png> <width>x<height> file:///...` or through `node scripts/serve.ts --port <a free port over 8770>`), read the pictures, and revise: this is judged by eye, and yours is the first. Save final pictures of every page beside the pages, in `shots/`.

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## The report

Your final message is read by the engineer who will check the study and put it in front of the owner. Say: what you saw in the app as it is; the structure you drew and where it departs from this brief; what each direction is, its palette as named hex values, its type and its one bold thing; what moves and for how long; what building each for real would take in the app as it stands (which files, what is new, what is risky on an iPhone); what you would choose and why; the list of pages and pictures; anything you could not check. Do not say that anything looks good: say what you checked.
