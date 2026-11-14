# Start here

This bundle is the handoff package for the Ensemble rewrite. It is written for a coding agent working in an empty folder on a headless machine, with Brandon as the only human in the loop.

## What is in the bundle

| File | Purpose |
|---|---|
| `CLAUDE.md` | Standing rules the agent reads every session. Short on purpose. |
| `docs/BRIEF.md` | What Ensemble is, how it is structured, and why. The main document. |
| `docs/CHART_FORMAT.md` | The text format for songs. Treat as a spec. |
| `docs/TESTING.md` | What may be tested, how, and the budgets that keep the suite small. |
| `docs/MILESTONES.md` | Build stages, agent-checkable exit criteria, and the human listening gates. |
| `prompts/extract-music-notes.md` | Prompt to run once in the OLD Ensemble repo. Produces `docs/MUSIC_NOTES.md`. |
| `prompts/kickoff.md` | Prompt for the first session in the NEW folder. |

## Order of operations

1. **Extract the musical knowledge from the old repo.**
   Open a session in the old Ensemble repo and paste `prompts/extract-music-notes.md`. It is read-only work that ends with one file, `MUSIC_NOTES.md`. Skim it. If it reads like a description of code, send it back; it should read like notes from a music director.

2. **Set up the new folder.**

   ```sh
   mkdir ensemble && cd ensemble
   unzip ../ensemble-brief.zip
   cp /path/to/old/MUSIC_NOTES.md docs/MUSIC_NOTES.md
   git init
   ```

   Do not copy any code from the old repo. The old architecture should not be visible from here.

3. **Kick off.**
   Start a session in the new folder and paste `prompts/kickoff.md`. It asks for stages 1 through 3 in one push, with audition files written at each stage.

4. **Listen at the gates.**
   Each stage leaves MIDI files under `out/gate-N/` and a short `GATE_REPORT.md`. Copy the MIDI files to the laptop and open them in Logic Pro. `docs/MILESTONES.md` says what to listen for at each gate.

5. **Reject with words about music, not code.**
   When something sounds wrong, describe what you heard ("the bass sits on the root too long in bars 9 and 10", "the solo never repeats an idea"). The agent's first move must be to capture that as a property or a critic metric, then fix it. That is how your ear ends up encoded in the project.

## Later stages

- **Stage 5 (audio)** needs the permissively licensed instrument packs. Copy them into `assets/packs/` with their license files before starting that stage.
- **Stages 5 and 6** need a browser. Forward the dev server port over SSH so the laptop browser sees it as `localhost`. Service workers and some audio features require a secure context, and `localhost` qualifies.

## If you change your mind about something

Edit the docs, not just the conversation. The docs are the source of truth for every future session, and `DECISIONS.md` (which the agent creates) is where deviations get recorded.
