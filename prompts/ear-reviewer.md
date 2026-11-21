# Build: a take read as a transcription, and a reviewer that reads it (#2231)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. Nobody on this side can hear. The band is written as notes, so what a musician would judge in a transcription (phrasing, voice leading, register, repetition, how the seats answer each other) can be read. Today nothing prints a take that way, and `/review` has no reviewer for the music. `PLAN.md` records that "every independent review found audible bugs the builder's own checks missed".

Build two things: `ensemble read`, which prints a take as a transcription a musician can read, and `ear-reviewer`, an agent that reads those against the music notes.

## Read first

`CLAUDE.md` (the standing rules bind you); `docs/TESTING.md` (binding: you add no test); `docs/MUSIC_NOTES.md` and skim the four parts under `docs/music-notes/` so the agent's instructions point at the right ones; `.claude/skills/DOCTRINE.md` and `.claude/skills/review/SKILL.md` (the reporting format the agent must follow); `.cycle/overlays/review-routing.md`; `packages/cli/src/commands/render.ts`, `score.ts`, `ears.ts` and `packages/cli/src/take-output.ts`; `packages/engine/src/take.ts`, `plan/types.ts` (`PlanBar`, `ChordSpan`, `SoloMark`, `FillMark`), `perform/notes.ts` (`NoteEvent`, `MarkerEvent`), `perform/pitch.ts` (`PitchMove`), `perform/meter.ts`, `theory/pitch.ts`, `theory/chord.ts`, `chart/display.ts`, and `players/drums/kit.ts` (voices).

## Part 1: `ensemble read`

`pnpm -s ensemble read <chart> [the same take flags as render] [--bars 13-24] [--seats solo,bass]`

- **One way to say what take is meant.** `render.ts` parses the take's flags inline (style, seed, minutes, passes, song, solo, solo-instrument, solo-density, solo-from-top, tempo, energy, key, without, no-count-in). Move that into `take-output.ts` as one shared piece (the flag table and the function that turns parsed values into `TakeOptions` and a style) and have `render` and `read` both use it. `render`'s behaviour and messages must not change: `pnpm smoke` journey 5 compares the app's export with the CLI's.
- **The text, bar by bar.** A header for the take (chart, style, tempo, meter, key, seed, the options, passes, bars), then each bar of music (not the count-in; the tail only if something sounds in it). For a bar: its number in the performance, the pass, the section's label and the bar's place in it, the chord or chords with where each begins, the band's energy, and marks where they apply (solo has the lead, a fill, a crash, last pass, the ending). Then one line for each seat that plays.
- **Where a note is, said in the bar's own counting.** In 4/4, 3/4 and 6/4 by the quarter: `1`, `2&`, `3e`, `4a`, and a triplet's middle and last as `2t` and `2l`. In 6/8 and 12/8 by the dotted pulse and its eighths: `1`, `1la`, `1li`, `2` (and a sixteenth after any of them with `+`). Anything else on the grid as the beat and a fraction (`3+5/12`). Decide the exact spelling, keep it one token per position, and print a one-line legend in the header. This is the straight grid (`tick`), not the played time.
- **Bass and soloist as a line**: each note as position, pitch name with octave (spelled by the key's lean, `spellPitchClass`), its role against the chord under it (`R`, `b3`, `5`, `b7`, `9`, `#11` and so on, from the chord's root; say `out` only if you can decide it by the chord's own tones and tensions from `theory/chord.ts`, otherwise just the interval), length in beats, velocity. Mark what the note does: a bend, a slide, a scoop, a fall (`fade`), a shake (vibrato), a slur (hammer-on or pull-off): look at how `PitchMove` glide points and `vibrato` are shaped by `players/solo` to name them truthfully, and if a move cannot be named, print `move`. Mark the soloist's phrases: a rest of a beat or more ends one, shown with ` | ` in the line, and number them across the take so a reader can say "phrase 14".
- **Chords as strikes**: notes struck together are one strike: position, the pitches low to high, length, velocity, and the top note's role. If the seat is a guitar and the style strums or picks, it is still strikes of whatever sounds together.
- **Drums by voice**: one segment per voice that plays in the bar (kick, snare, each cymbal, toms), each with its positions; a ghost in parentheses and an accent marked, by thresholds you state in the legend.
- **Feel on request only.** `--timing` adds how far each note was played from the grid (`offset`, in ticks, and the tick's length in milliseconds in the header). Off by default: it triples the width.
- **Line length.** A reader is a language model with a budget: no line over about 160 characters (wrap a long seat line with a hanging indent), nothing repeated that the header said, a whole 12-bar blues of four passes with all seats in well under 600 lines.
- **Pure where it can be.** Put the formatting in one module that takes a `Take` and a `StylePack` and returns text (in `packages/cli/src/`, not the engine: the engine gains nothing), and keep the command a thin wrapper. The same four inputs give the same text.
- A `pnpm` script is not needed (`pnpm -s ensemble read` is the way); add the command to the CLI block in `CLAUDE.md`.

## Part 2: the `ear-reviewer` agent

`.claude/agents/ear-reviewer.md`, hand-written (it is not under `.claude/skills/`, which is rendered: never touch that tree by hand). Frontmatter `name`, `description` (when `/review` should use it), `tools` (read-only: Read, Grep, Glob, Bash), `model: opus`. Its instructions, in the second person, plainly:

- **What it is given**: an issue number or a description of the change, the diff or branch, and which takes to read (or it chooses: for each style the change touches, two of the style's own charts, three seeds, with the soloist and without, a quiet and a loud take, and the worst takes the scorecard names for the measures the change moved). Before and after, when a base ref is given: it prints the same takes at both (a `git worktree` of the base in its scratch folder, never a checkout in the main tree).
- **How it reads**: with `ensemble read`, a few bars at a time where it matters (`--bars`, `--seats`), against `docs/MUSIC_NOTES.md` and the part under `docs/music-notes/` for the seat and the style. It reads as a transcriber would: each seat alone first (range and register, repetition from chorus to chorus, how phrases begin and end, what lands on the changes), then the seats together (the bass against the kick, the comp against the soloist's register and rhythm, who fills the holes, whether the band builds with the arc).
- **What it reports**: findings in `/review`'s format (ID, severity, where), and "where" for a musical finding is the take (chart, style, seed, options), the bar numbers and the notes quoted from the transcription. Each finding names the rule it breaks (a numbered note from the music notes where there is one) and says what a property or a measure could hold. It says when it read a take and found nothing.
- **What it never does**: say that anything sounds good or bad (nobody here can hear: it reports what the notes are); pass or fail on taste; edit files; treat the builder's report as true. A doubt about idiom is an observation for Brandon's ear, marked as one.
- **Its limits, said in the file**: timbre, level, the mix and feel in milliseconds are not in a transcription (`--timing` shows offsets; `pnpm levels` measures loudness).

Then route to it: in `.cycle/overlays/review-routing.md`, the `packages/engine/src/players/**` and `packages/styles/src/**` rows name `ear-reviewer` beside the general review, and the opening sentence no longer says there are no reviewer agents (there is one; the other rows are still the backlog). Run `cycle update` and check `cycle check` is clean. Do not edit anything under `.claude/skills/` by hand.

## What is yours to decide, and say

The exact notation; how moves are named; the thresholds for ghost and accent; what a "strike" is at the edges (a rolled chord, a strum's strokes a few ticks apart); whether the chord seat's line shows roles for every pitch or only the top and bottom. Decide for a reader who knows music and has little room. Log each call in a new section at the end of `DECISIONS.md` (plain words, like the sections above it).

## What you must not do

- No change under `packages/engine`, `packages/styles`, `packages/audio`, `packages/app`, `test/`, `scorecard/`, `library/`. If the printer seems to need an engine export that does not exist, stop and say so in your report; do not add it.
- No new test, no golden, no baseline. No new dependency.
- Do not read the `legacy` branch or `~/code/ensemble-legacy`.
- Nothing private in anything committed: the repository is public.
- Leave no shell running when you finish.

## Check before you report

- `pnpm check` green (the budget is 28 s; it must not grow: you add no test) and `pnpm score` reports no movement in any style.
- `pnpm app:build && pnpm smoke` green (journey 5 is the one `render`'s refactor could break).
- `ensemble render` gives byte-identical MIDI before and after your change for three different flag sets (compare against `origin/main` in a scratch worktree, or keep the files from before you start).
- `ensemble read` on one chart of every style, with and without the soloist, in 4/4 and in a compound meter where the style has a chart in one: no crash, no line over the limit, and read ten bars of each yourself for something that is plainly wrong (a position that cannot be, a role that contradicts the chord, a phrase mark inside a held note).
- `cycle check` clean.

## Commit and report

Work on the branch you are given. Commit in two commits with explicit paths (never `git add -A`): `feat(cli): ensemble read, a take as a transcription` and `feat(review): the ear-reviewer agent, routed for players and styles`. Conventional titles, a body of a few plain lines, and end each message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Check `git log -2 --format=%ae` is the repository's no-reply address. Do not push and do not open a pull request.

Report, in under 400 words: what you built and each decision; the output of each check above (the numbers); three bars of real output from two different styles, pasted; anything you saw in a take that looked wrong musically (bar numbers and notes), which is the first thing the reviewer would have found; and what you are unsure of.
