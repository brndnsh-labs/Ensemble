# Prompt: kickoff for the new project

Run this in the new, empty Ensemble folder after unzipping the bundle and adding `docs/MUSIC_NOTES.md`. Paste everything below the line.

---

You are starting a new project in this folder. It contains only documentation. Read all of it before writing anything:

- `CLAUDE.md`
- `docs/BRIEF.md`
- `docs/CHART_FORMAT.md`
- `docs/TESTING.md`
- `docs/MILESTONES.md`
- `docs/MUSIC_NOTES.md` (musical knowledge carried over from the previous version; treat it as domain knowledge, not as a design to copy)

Then build stages 1, 2, and 3 from `docs/MILESTONES.md` in one continuous push.

## How to work

- Start by writing a short plan to `PLAN.md`: the package layout, the core types (chart model, plan, event, style pack, critic), and the order you will build things in. Resolve the open questions listed at the end of the brief where they affect these stages, and record each choice in `DECISIONS.md`. Then proceed without waiting for approval.
- At the end of each stage, write the audition files and `GATE_REPORT.md` to `out/gate-N/` as the milestones describe, commit, and continue to the next stage. I will listen to them later and send feedback.
- Commit in small, coherent steps with clear messages.
- When the docs do not settle something, decide, log it in `DECISIONS.md`, and move on. Stop and ask only if a choice would be expensive to reverse and could reasonably go either way.
- Follow `docs/TESTING.md` exactly. If you find yourself wanting a kind of test it does not allow, write down why in `DECISIONS.md` and do not add the test.
- You cannot hear the output. Do not describe how anything sounds. Report properties, scores, and what you would ask me to listen for.
- Turn the tagged rules in `docs/MUSIC_NOTES.md` into what their tags say: properties, critic metrics, or style data. Tell me in the gate report which rules you used, which you deferred, and which you chose to drop.
- Fill in the Commands section of `CLAUDE.md` once the commands exist.

## Stop when

Stage 3 is complete and its gate files are written. Then give me:

1. The three gate reports' locations.
2. The current scorecard for the blues style.
3. The exact commands to render a take and to run the scorecard.
4. The five things you are least sure about, in order.

Do not start stage 4.
