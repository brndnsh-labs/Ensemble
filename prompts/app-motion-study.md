# Study: the poster wall in motion, in the manner of Metro (stage 6, during gate 6)

You are working on Ensemble, a backing band in a browser. Its look ("the poster wall") is built and passed: flat fields of one ink per style, square corners, heavy condensed capitals, the chart in a serif. The owner chose it saying it "reminds me of metro ui in the best way". He is playing with the app daily on an iPhone 17 and a laptop, and now wants to go further that way. This brief builds a **study**: the real app, with a set of motions and two layout signatures taken from Metro (Windows Phone 7 and 8), each behind a switch, for him to try on his phone and choose from. It is not for merging as it stands; what he chooses is built properly afterwards.

## The owner's words

- 2026-11-16: "as i've been using the app, i think i really want to lean into the (now retro?) metro ui look. i always thought that was cool, and it works well for what we're doing here. i think some very light and fast animations might be appropriate."
- Earlier, of what the app must be: "welcoming vibes, fun place to practice, but still snappy and responsive".

## What Metro is, for this purpose

Type is the interface and content comes before chrome. Motion is quick, eased out, and says where something came from: a tile tilts under the finger; a page's pieces arrive one after another on a hinge ("turnstile", "feather"); the thing pressed becomes the next page's heading ("continuum"); tiles on the start screen are alive. Read up from what you know of it; make no network requests. This app keeps its own type (the heavy condensed capitals, the serif chart) and its words in place of icons: the study is a nod to Metro, not a copy of it.

## What to build, each behind its own switch

1. **Tilt on press.** A tile, a poster, a list row's round play button, the big Play, a player's block, a sheet's option: pressed, it pushes in toward the point it was pressed at (a small 3D tilt and a slight scale, as Metro's tilt effect), in the same frame as the press, and springs back on release in under 120 ms. No delay to the press's action.
2. **Feathered entrances.** When a screen is arrived at, its pieces come in one after another: home's poster and wall tiles, a list's rows, a sheet's options. Each a short move and fade (transform and opacity only), 20 to 30 ms apart, the whole within 200 ms; only what is on the screen is staged. The screen is there and pressable from the first frame: the motion decorates the arrival and never holds it.
3. **Continuum.** The thing pressed becomes the heading where it leads: a style's tile on home becomes the style page's poster name; a chart's title in a list becomes the title on its screen (and back again on the way back). Use the browser's same-document view transitions where they exist (check what the installed Chrome supports and what current Safari on iOS supports from what you know; where the API is missing, the navigation is simply instant). 200 ms at most.
4. **A page turn.** Going forward the arriving screen's content comes from the right by a short distance, going back from the left, 150 ms, with no exit animation that makes anyone wait. (Switches 2, 3 and 4 overlap: make each work alone and say which combinations you would not use together.)
5. **Live tiles on home.** A style's tile turns over, slowly and one at a time, between its name and a fact (how many charts are written for it; the last chart played in it): a flip of about 400 ms every 6 to 10 s, never two at once, never while the band is playing or a sheet is open, and stopped when the page is hidden.
6. **A pivot.** The library's strip of places (All, Yours, the eight styles) as one row of large words that scrolls sideways, the current one in full ink and the rest dimmed, the next peeking in at the right edge, as Metro's pivot header. On a phone this replaces the wrapped strip, and with it the first chart's row on a style's page should start much higher than its present 364 to 443 px: measure and report.
7. **Oversized titles.** On home and on a style's page the page's name is set larger than the screen is wide and runs off the right edge, as Metro's panorama titles do. Only where it does not cost the chart list its place.
8. **The flood wipes in.** When Play is pressed the dock's flood of the style's ink rises from the Play button in 120 ms where it is now instant. The band's start is not delayed by it.

**The switchboard**: a small panel reached from a discreet corner control on every screen (and at `#/motion`), listing the eight with a switch each, an "all on / all off", and one setting for speed (as specified; half the time; one and a half times). Kept in the browser's storage, so a reload keeps the choices. All on to begin with. It is the study's own furniture and need not be beautiful, but it must be usable with a thumb.

## What must stay true, in every combination

- **A press answers in the same frame.** No motion delays navigation, Play, Stop, a mute, or the editor's keyboard. Motions are interruptible: a press during one acts at once.
- **The chart's screen while the band plays is still**: the chart, the playhead, the highlighter and the players' lights are as they are; nothing new moves there but the tilt under a finger.
- **The band is not late for it.** Only `transform` and `opacity` animate (and what view transitions do themselves); nothing lays the page out again on a frame. With every switch on, play a chart in the app in headless Chrome and report what you can measure (long tasks or dropped frames during entrances; and `pnpm render:audio wall-motion chart=jazz-rhythm-changes-bb.chart live=1` before and after for late notes, knowing it does not exercise the app's screens).
- **Under `prefers-reduced-motion` nothing moves** (the pivot and the titles, being layout, stay).
- With every switch off, the app is exactly the app as it is: the five smoke journeys pass with the switches off **and** with them all on (`pnpm app:build && pnpm smoke`; say how you ran the second). `pnpm check` passes. Add no test.
- Nothing in `packages/engine`, `packages/styles` or `packages/audio`. Other builders are at work on those in other clones.
- A phone held upright (390 by 844) and a laptop (1280 by 800), light and dark. No new dependency. The stylesheet stays one file; keep the study's rules together under one heading so that what is chosen can be lifted out.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/motion`, on a branch `motion`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests. Commit on the branch, one commit a motion where that is natural, each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

Read first: `CLAUDE.md`; `docs/BRIEF.md` sections 2 and 11; in `DECISIONS.md` "the poster wall is chosen", "the poster wall, part 1", "part 2", "part 3" with their "checked and merged" sections, and "small things in the app, 1"; `packages/app/src/` whole (`address.ts` is how screens change; `play/lamps.ts` is how something already moves without re-rendering; `play/Sheet.tsx` already rises in 140 ms).

Look at your own work: `pnpm app --port <a free port over 8790>` serves the app; `node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]` photographs it in headless Chrome. A still cannot show motion: for each motion capture a few frames through it (a short run of screenshots, or computed styles read on successive frames) and say what they show; photograph the pivot and the titles at both sizes and themes. Save them in `out/motion-study/` in your clone (not committed; add the folder to `.gitignore`).

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish: the engineer will serve the study to the owner's phone.

## Decisions and the report

Write what you decided in a new section at the end of `DECISIONS.md` ("the poster wall in motion: a study"). Where something cannot be built as written, do not invent a different design: build the rest and say what you left. Your final message is read by the engineer who will check the branch and put it in front of the owner. It should say, motion by motion: what a user sees, in a sentence; how it is built (what animates, how long, what triggers it) and roughly how much code it is; what you measured or captured; what does not combine with what; what Safari on an iPhone is likely to do differently and why; what merging it properly would take. Then: the first chart row's place on a style's page with the pivot on; the smoke results with switches off and on; `pnpm check`; the late-note counts; the commits; what you could not verify (a real iPhone above all); anything you saw that is wrong and did not fix. Do not say that anything looks or feels good: say what it does and what you checked.
