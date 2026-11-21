## The listening lane

Most hands-on items here are `status:needs-ear`: built, merged, on the test site, and waiting on Brandon's ear or eye. Gather them with the decisions.

- **Before asking**, check the page exists under `out/<name>/` and was rendered from the commit now on `main`; re-render it if not. Serve it with `pnpm audition --host 0.0.0.0 --port 8765` and give him the address of the page. For something in the app itself, check the test site's `/build.json` names the commit, and say whether it wants his phone.
- **The card** adds one line: `What was measured: <the properties and scorecard numbers beside each clip>`. Where the change went to his ear because it left what he has passed, the measures that left their range come first, each with its value and the range (`pnpm score` on the branch printed them; the PR body has them). The recommendation says which clip to start with and what to listen for, never which one sounds better.
- **Verdicts**: **Passed** / **Not right** / **Not now**. His words are usually a few; record them verbatim.
- **Passed** → close the issue with his words in a comment, and a `DECISIONS.md` line if a choice was made (a setting chosen from a study).
- **Not right** → his words go verbatim into a `finding` issue, which first becomes a property or a critic metric and then a code change (the standing rule); the original closes pointing at it.
- **Not now** → stays `status:needs-ear`, untouched.
- **Every verdict about the notes becomes an ear case**, or the ranges a change is sorted against never move. Commit his words first (the `DECISIONS.md` line, or the `finding` issue's number in it), then add the case to `scorecard/ear-cases.json` with that commit as its `recorded`: the band he heard is the one before it. A pass widens what later changes may do unheard; a "not right" with its answer's commit takes back the passes before it on that seat. `pnpm ears` reads the result.
