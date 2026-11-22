# Build: a moved idea keeps the lengths it was heard at (#2283)

The issue is the specification, with the diagnosis already done:
`gh api repos/brndnsh-labs/Ensemble/issues/2283 --jq .body`. Read it, then `CLAUDE.md` (binding),
`docs/TESTING.md`, `docs/music-notes/b-comping-soloist.md` (the soloist's ideas, how one comes back, and the
horn's breath), `docs/decisions/soloist.md`, and the soloist's engine (`packages/engine/src/players/soloist/`,
`play.ts` and `phrases.ts` above all).

## Where you are

A git worktree at `/home/brandon/code/ensemble/.work/2283`, branch `idea-keeps-lengths`, from `origin/main`,
dependencies installed. Work only inside it. Explicit paths only (never `git add -A`, never `--no-verify`,
never amend, never bare `git stash`). Do not push, open a pull request or touch GitHub beyond reading the
issue. Do not read the `legacy` branch or `~/code/ensemble-legacy`. Nothing about this project goes to an
outside service. Another build is using the machine: never two heavy runs at once, and a gate that looks over
its time is run again alone before it is believed.

## The work

1. **Reproduce first.** The take in the issue is reproducible on `main` as it stands (the chart is in the
   library; only the suite's allotment of takes differs): read it and confirm the two lengths, 1360 and 1600.
   Then write a scratch sweep (the scratchpad directory
   `/tmp/claude-1000/-home-brandon-code-ensemble/3001e2ba-6e91-487f-adea-58ceea1c543a/scratchpad/idea/`, not
   committed) that, for a style, chart, instrument and tempo over N seeds, counts ideas moved a beat and how
   many hold a note longer than the statement was heard, by the property's own tolerance. Before: every
   style, alto at tempo 60, on two of its charts, 30 seeds. Record the table.
2. **Verify the diagnosis** by reading the code, not by trusting the issue: where the statement's air starts,
   what `sounds(inPlace)` realises, why `keepsLengths` passes. If the cause is other than stated, stop and say.
3. **Fix it in the engine** so a moved idea is held to the lengths the motif was actually heard at, breath
   and all, which is what the code's own comment says it does. Choose between keeping the heard lengths with
   the motif and realising the moved idea with the statement's air moved along with it; say which and why in
   one line. The engine stays pure and deterministic. No style's data changes.
4. **Held from now on.** The property exists ("an idea comes back a beat early or late"). Find out whether any
   take the suite plays on a push, or on the full run, reaches the fault as `main` stands (the soloist kinds
   in `test/takes.ts` include alto at tempo 60); if none does, do not add a take kind or a test: say so, and
   say which take will reach it once the library grows (the issue names it). No new property, nothing
   loosened, no floor or tolerance changed.
5. **After**: the same sweep (zero held longer), and the share of ideas that come back moved, for every
   style, before and after, against each style's floor for it. If a floor is no longer met, stop and report;
   do not touch the floor.
6. **Goldens and scorecards**: `pnpm goldens` and say exactly which files changed, and for each the notes
   that moved and why (a moved idea whose length changed); if none, say none. `pnpm score` alone: report
   movement; do not `--update` unless a measure moved for this reason and inside tolerance, and then say so.
7. The decision in `docs/decisions/soloist.md`: what was wrong, what was chosen, what moved.

## Gates

`pnpm check`, `pnpm test:full`, `pnpm score`, each alone. Report the figures.

## Report

Under 400 words: the reproduction, the cause as you verified it, the fix and its size, the before and after
tables, goldens and scorecard movement, what holds it from now on. Kill every shell before reporting.
