# Review: the app, part 1 (play view and library)

You are reviewing work you did not write. Find what is wrong with it. Do not take the author's notes at face value: `DECISIONS.md` ("stage 6 begins: the play view and the library") says what was intended, and your job is to find where the code does something else, or where the intent itself fails a musician using the app.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/review-app`. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, and do not push or fetch anything. You may edit files in your clone to probe (add logging, write scratch scripts) but **your deliverable is a report, not a patch**: the main session will make the fixes.

Read first: `CLAUDE.md`, `docs/BRIEF.md` section 11 (the app) and 4.2 (timed jams), `docs/TESTING.md`, and the last three sections of `DECISIONS.md`.

## What to review

The three commits `0893aba`, `061d8e0`, `d72d730` (`git show --stat` each):

1. **`packages/app/`**: a Vite and React app. `src/play/` is the play screen (`rig.ts` audio wiring, `jam.ts` take to sounds and playhead, `useJam.ts` the play/finish/stop state, `page.ts` and `ChartView.tsx` the chart on screen, `ChordSymbol.tsx`, `StatusStrip.tsx`, `PlayView.tsx`). `src/offline.ts`, `service-worker.js` and `vite.config.ts` are install and offline. `src/LibraryView.tsx`, `src/CreditsView.tsx`, `src/settings.ts`, `src/App.tsx`.
2. **Engine**: `PlanOptions.endAfter` in `packages/engine/src/plan/plan.ts` and `arc.ts` (a jam told to finish), and `PlanBar.section.index`.
3. **Audio**: `Scheduler.replace` in `packages/audio/src/schedule.ts`.
4. **Tests**: the two new properties (`test/audio.test.ts` "when what is to come is changed", `test/band.test.ts` "a jam told to finish") and `smoke/app.spec.ts`.

## How to look

- `pnpm check` (typecheck, lint, engine suite) and `pnpm smoke` should pass; say so if they do not.
- Run the app: `pnpm app --host 127.0.0.1 --port 8770` in the background (use port 8770; 8765 to 8767 are taken), and for the built app `pnpm app:build` then `pnpm --filter @ensemble/app exec vite preview --host 127.0.0.1 --port 8771`.
- Drive it headless: `node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]`, then Read the PNG. Write your own Playwright scripts for anything that needs more (`import { chromium } from "@playwright/test"`, launch with `channel: "chrome"` and `args: ["--password-store=basic"]`, or Chrome waits 25 s for a keyring). Put scratch scripts under `scripts/` in your clone so they can resolve the dependency.
- Do not use `pkill -f` and do not wrap node in `timeout`; stop servers by port (`fuser -k 8770/tcp`).
- You cannot hear. Do not say anything sounds good or bad. What you can do is measure: note lists, plan bars, counts, timings, screenshots.

## What to hunt for

Correctness first; rank by what a musician would hit.

- **The join when Finish is pressed** (`turnForHome` in `jam.ts`, `finish` in `useJam.ts`, `Scheduler.replace`). Can a note sound twice, or a stretch go silent? What if Finish is pressed during the count-in, in an intro, in the last three seconds of a pass, on a one-pass jam, on a vamp (`funk-vamp-a`, `funk-one-chord-e`), on a chart with a written ending (`funk-intro-outro-c`, `blues-intro-outro-d`), or twice quickly? Compare the note lists of the open take and the told take around the join for a few charts and seeds and report the worst disagreement you find before the join (the author assumes none before the last pass and "small" inside its first phrase).
- **An open-ended jam being extended** (`useJam.ts`): is anything dropped, doubled or reordered at an extension? Does the position/playhead stay right? What happens to a very long one?
- **`endAfter` in the planner**: any input that gives a wrong or inconsistent plan (0, past the end, with `passes: 1`, song mode, a chart with only an intro or only an ending, `energy` set, a seat left out). Does a normal plan (no `endAfter`) come out byte-identical to before? (The goldens say yes; check anything they cannot see.) Is the new property able to fail: break the rule a few ways and see.
- **The playhead against the page** (`page.ts`, `pageBarOf`, `nextChange`): repeats, numbered endings, `%`, a section repeated by name, a reference in another key, a 3/4 chart, a bar with a leading hold, charts with errors (`test/charts/` has a corpus). Does every planned bar map to a bar on the page? Does the highlight ever land on the wrong bar or none?
- **The chart's fit** (`ChartView.tsx`): widths 320, 390, 844x390, 1280, 1920; the longest and the densest library charts; "Both" reading; focus mode. Look for overflow, clipped or overlapping chords, a chart that scrolls or is cut off, type that is unreadably small.
- **State and lifecycle** (`useJam.ts`, `PlayView.tsx`, `App.tsx`): play pressed twice, stop during loading, leaving the screen while loading or playing, changing a setting, the library's play button (one tap to sound), React StrictMode's double effects, a failed pack fetch, timers or listeners left behind, the wake lock.
- **Install and offline** (`service-worker.js`, `offline.ts`, `vite.config.ts`): a second build with changed files (does the old cache go, does the page get the new build, can a page be left half old and half new), a changed pack, a failed install, a request the worker should not answer, the app served from a subfolder (`base` is relative), cache growth.
- **Anything in the brief's section 11 for the Play and Library views that is missing** and not listed as a later part.
- **Accessibility basics**: keyboard reach and focus, names on controls, contrast in both themes, reduced motion.
- **Code a careful reader would trip on**: a comment that is wrong, a name that lies, dead code. Brandon reads the code.

## Report

Return findings ranked most severe first. For each: what happens, the exact way to make it happen (chart, seed, steps, or a script), the file and line, and how sure you are (confirmed by running it, or read from the code). Separate "confirmed bugs" from "risks I could not confirm" from "judgement calls". Say what you checked and found sound, briefly, so the main session knows what was covered. Do not pad: ten real findings beat thirty guesses.
