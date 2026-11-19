# Study: the app's icon (stage 6, during gate 6)

You are working on Ensemble, a backing band in a browser: pick a chord chart, press Play, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles while you practise over it. The owner uses it daily from his iPhone 17's home screen and in a laptop tab. This is not a build. It is a page of candidate icons for him to choose from, as he chose the app's look, its typeface and its motion from pages of candidates. Nothing in `packages/` changes.

## The owner's words

2026-11-18, as the app nears replacing the old version in production: "what about an icon?" Of the look he chose ("the poster wall"): "reminds me of metro ui in the best way". Of what the app should be: "welcoming vibes, fun place to practice, but still snappy and responsive". He judges by eye from real screens and his verdicts are short.

## What is there now

`packages/app/public/icon.svg` (and `icon-180.png`, `icon-192.png`, `icon-512.png`, `manifest.webmanifest`; the links in `packages/app/index.html`): a yellow slab, tilted, with a heavy E cut out of it, on indigo. It was drawn in the app's first commit as a placeholder, before the look existed. It may be a candidate as it is, or redrawn; it has never been chosen.

## Read first

`CLAUDE.md`; `docs/BRIEF.md` sections 1, 2 and 11; in `DECISIONS.md` "the poster wall is chosen", "the poster wall, part 1" to "part 3" and "the poster wall in motion"; `packages/app/src/style.css` (its opening comment states the identity; the tokens: ink `#1e1a4f`, paper `#eef0f4`, the yellow marker `#ffe53b`, a red pencil, eight spot inks, one a style; Archivo in heavy condensed widths for the interface, Roboto Serif for the chart). Serve the app (`pnpm app --port <a free port over 8790>`) and photograph home and a chart's screen at 390 by 844, light and dark, with `node scripts/look.ts`, before drawing anything: the icon is the door to those screens and should look like it. Load the `frontend-design` skill first if you have it and follow its process: an icon that could belong to any app is the failure here.

## What to make

**Eight to ten candidates**, each a different idea and not one idea in ten colours. Each must be the poster wall's own: flat ink, print, heavy type or a plain cut shape, the tilt of a thing pressed, the app's colours. Some directions to draw from, not a list to fill: the letter E as type (Archivo at its heaviest and narrowest, cropped, cut, tilted); the wall itself (a few tiles of spot ink); a bar of chart (slashes, a chord symbol, a repeat sign, a bar line) set as a poster; four of something for four players; the marker's stroke over ink. No gradients, no gloss, no shadows, no musical clip art (no eighth-note pair, no treble clef, no guitar silhouette), no photograph, nothing that needs a caption.

Each candidate is one square SVG, drawn by hand, with no outside fonts or images (type converted to paths or drawn as shapes), and has to hold up in every place an icon is seen:

- **An iPhone's home screen**: 180 px, corners rounded by the phone (draw full bleed, no transparency, nothing you need within the outer tenth), beside other apps, on a light and a dark wallpaper, with its name "Ensemble" under it in the system's small type.
- **Android's maskable icon**: everything that matters inside the middle circle of 80% of the width.
- **A browser tab**: 32 px and 16 px. If the idea does not survive at 16 px, draw a simpler favicon of the same idea for it and show both.
- **The splash and the app switcher**: 512 px, where it is seen large.

## The page

`out/icon-study/index.html` (not committed; add `out/icon-study/` to `.gitignore`), made for a phone held upright and readable on a laptop, with each SVG beside it in `out/icon-study/icons/`. Light and dark by the device's setting.

1. **At the top, all the candidates on one mock home screen**: a grid of rounded-corner icons at the phone's real size with their names under them, as an iPhone shows them, among four or five plain invented neighbours (flat coloured squares with a glyph: not real apps or brands), once on a light wallpaper and once on a dark one. This is where he will choose from: it answers "which one would I find and want to press".
2. **Then each candidate on its own**, with a letter (A, B, C ...) and a name of two or three words: large (256 px, phone corners), at 180 on both wallpapers, in the maskable circle, as a tab at 32 and 16 px in a drawn tab strip beside the title "Ensemble", and one sentence of what the idea is. No sentence says it looks good.
3. **The present icon** among them, marked as what is there now.

Photograph the page yourself at 390 by 844 and 1280 by 800, light and dark (`node scripts/look.ts`), read the pictures, and fix what you see: an icon that reads as a smudge at 16 px, two candidates that are the same idea, anything clipped by the corner mask. Save the final photographs in `out/icon-study/shots/`.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/iconstudy`, on a branch `iconstudy`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests, add no dependency. The only thing to commit is the `.gitignore` line (message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with).

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`); port 8765 is someone else's: leave it alone. In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## The report

Your final message is read by the engineer who will put the page in front of the owner. It should say: each candidate's letter, name and idea in a line; which needed a separate favicon and why; what you changed after looking at your own photographs; anything a candidate does badly in one of the four places; what you could not check (a real iPhone's home screen above all). Do not say that any of them looks good, and do not recommend one: say what each is.
