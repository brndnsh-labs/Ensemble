# Prompt: an independent review of one new style (stage 4)

A brief for a subagent. One reviewer per style; give it the style's name where this says STYLE (`jazz` or `funk`).

---

Review the STYLE band of a generative backing band, as a working STYLE musician who can also read TypeScript. The project is at the repo root you were started in (Ensemble: a ground-up rewrite, stage 4 of 6: "jazz and funk as data"). Four seats (drums, bass, chords, soloist) were each written by a different builder from a different brief, each verified by its own builder. Nobody has yet read the four together as one band, and nobody on the project can hear: the owner will audition MIDI files and ask **does it sound like STYLE, and unlike the other two styles, on the same chart?** Your job is to find what he will hear as wrong before he hears it.

Do not take any builder's report, comment or test at face value. A property that passes proves the property, not the music.

## Read first

- `CLAUDE.md`, `docs/TESTING.md`, and in `DECISIONS.md` every section from "stage 4 begins" to the end.
- `docs/MUSIC_NOTES.md` and, in `docs/music-notes/c-styles.md`, "Style: STYLE" in full: these are the rules the style was written from. Where the data departs from them, `DECISIONS.md` should say so.
- `packages/styles/src/STYLE/` (all of it), and enough of `packages/engine/src/players/` to know what each setting does.

## What to do

1. **Read the band bar by bar.** Write a throwaway script (outside the repo, in a temporary folder) that renders takes and prints all four seats on one grid under the chords: drums by piece, the bass line with note names, the chord seat's strikes with their notes, the solo line. Render each of the style's own charts (`library/STYLE-*.chart`) as a five-pass jam with a solo, a four-pass jam without, and a song; two blues charts in this style; seeds 1 to 5. Read at least a dozen takes from top to bottom, including a slow one, a fast one and a quiet one (`energy: 0.3`).
2. **Ask a player's questions of what you read.** Do the bass and the kick agree where the style says they must? Do the chord seat and the bass collide in register, or double the third in the mud? Does the comping answer the soloist or sit on him? Does anything play the same bar for sixteen bars where a player would not? Do the fills, the pushes and the ending land together, the whole band, every time? Does the first chorus differ from the last (does the band build)? Is anything on a grid the style does not use (a straight sixteenth in a swung-eighth band)? At the seams between sections and at the last bar, is anything left ringing, doubled or missing?
3. **Compare the three bands on one chart.** `library/blues-12-bar-a.chart` and `library/funk-two-chord-dm.chart` in blues, jazz and funk, same seed. Say in what ways STYLE differs from the other two in each seat, and whether any seat is the same player in a different hat.
4. **Read the scorecard and its worst takes.** `pnpm -s ensemble score --style STYLE --seeds 200`: for each target missed, and for the three worst takes of the costliest measures, read the take and say whether the number is telling the truth.
5. **Check the claim "styles are data".** Search the engine for anything that names or tests for a style, a genre, or a number that only makes sense in one (`grep -rn "blues\|jazz\|funk\|swing" packages/engine/src`). Each engine change listed in `DECISIONS.md` for this stage claims to be a general concept: say which, if any, are a special case in disguise, and why.

## Rules

- **Change nothing in the repo.** No edits, no commits, no `pnpm goldens`, no `score --update`. Scripts and output go in a temporary folder outside the repo.
- The older project at `/home/brandon/code/ensemble` is off limits: do not read it.
- You cannot hear. Never say something sounds good or bad; say what is played and what a player would say of it, with the rule ID from the music notes where one applies.

## Report back

Findings, most serious first, each with: what is played (chart, seed, options, bar numbers, the notes), why a STYLE player would call it wrong or a listener would not hear STYLE (rule ID if there is one), how often it happens (count it across takes, do not guess), and where in the data or the engine it comes from if you found it. Separate **defects** (wrong notes, collisions, seats disagreeing, a rule of the style broken) from **judgement calls** (thin, busy, plain) and from **things to ask the owner to listen for**. Then: what distinguishes the three bands seat by seat, in a small table; any engine change that is a style special case; any property you believe always holds for the whole band in this style that no test checks, stated as a player would. Be specific and brief; an empty section is a fine answer.
