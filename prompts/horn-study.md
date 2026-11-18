# Study: what an alto does with a note's pitch, for the owner's ear (stage 6, during gate 6)

You are working on Ensemble, a generative backing band in a browser. Its soloist plays the alto sax with every note plain: no vibrato, no scoop into a note, no fall off one. Before the soloist is allowed any of these, the owner hears each one drawn on these samples and says which sound like a horn. This brief makes that page and nothing else. **No change to the engine, the styles, the app or the tests.**

## What was done for the guitar, and what he said

`scripts/pitch-study.ts` did exactly this for the lead guitar: one short line played nine ways, a page of clips (`out/pitch-study/`, copied into your clone). He chose two ("the wide/60 cent vibrato really sounds good and realistic"; "quick bends sound great"), refused one ("slides don't sound very good as they are, so we should leave them out") and chose nothing else. Of the old band's bends he had said they "didn't sound great" and "we've probably been overdoing the bends... we'll want to be thoughtful as we reimplement other devices". So: each way is heard alone and plainly labelled, a plain take comes first, and nothing is stacked until the end.

Read: `CLAUDE.md`; `scripts/pitch-study.ts` whole (your script is its sibling); `packages/engine/src/perform/pitch.ts` (`PitchMove`: glide points and a vibrato; what a note's pitch can do); `scripts/render-audio.ts`; in `docs/music-notes/b-comping-soloist.md` SO-52, SO-54, SO-57 and KF-B-10; in `DECISIONS.md` "the lead guitar bends and shakes".

## What to make

`scripts/horn-study.ts`, in the manner of `pitch-study.ts`, writing clips and `out/horn-study/index.html`:

- **The line**: a jazz line for alto of about eight bars at a medium tempo (near 120) over a chart in the library with the jazz band under it, written by hand as `pitch-study.ts` writes its line: two phrases, with at least two held notes (a half note or longer), a note a phrase lands on at a chord change, and a last note of each phrase with a beat or more of silence after it. Inside the alto's range (`SOLO_INSTRUMENTS["alto-sax"]` in `packages/engine/src/players/solo/instruments.ts`). Also the same line once at a ballad tempo (near 66) for the vibrato clips, where held notes are long.
- **The ways, one clip each, the plain line first**:
  1. Plain, as it is today.
  2. Vibrato, narrow: about 15 cents either side, 5 a second, starting late (0.4 s in) and growing, on notes of a half or longer.
  3. Vibrato, wider: about 30 cents either side, otherwise the same.
  4. Vibrato on the last note of each phrase only (a "terminal" vibrato), at the width of 3.
  5. Scoop, quick: a landing struck about a half step flat and eased up in about 60 ms.
  6. Scoop, slow: the same over about 150 ms.
  7. Fall, long: the last note of a phrase, a half or longer, sounds its length and then drops 5 to 7 semitones over about a quarter note (SO-54).
  8. Fall, short: a shorter last note drops 3 or 4 semitones inside its own last eighth (SO-54).
  9. A player's choice: the terminal vibrato, one quick scoop on the first phrase's landing, one fall at the very end; nothing else.
  Clips 2 to 4 also at the ballad tempo. If `PitchMove` cannot draw one of these as described (a fall wants the note to fade as it drops, and a note has no such fade), draw the nearest thing it can, and say on the page and in your report exactly what is and is not drawn. Do not change `pitch.ts`.
- **The page**: each clip with its name and one plain sentence saying what was done to which notes, in the order above, the ballad clips grouped after. No claim about how any of it sounds.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/hornstudy`, on a branch `hornstudy`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble`, do not push, fetch or deploy, make no network requests, add no dependency. Commit the script (and a `.gitignore` line for `out/horn-study/`) on the branch, the message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

Rendering goes through headless Chrome (`render-audio.ts`). Render a few clips per command so no single command runs for many minutes. Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running. `pnpm -s typecheck` and `pnpm -s lint` must pass; do not run the timed test suite.

## The report

Read by the engineer who will put the page in front of the owner: the line (bars, notes, where the held notes and landings are); for each clip exactly what was drawn, in cents, seconds and which notes; anything `PitchMove` could not draw and what you drew in its place; what you checked in the rendered audio and how (the measured pitch of a held note with vibrato, if you can measure it, as the guitar's build did); the commit. Nothing about how it sounds.
