**How this repo works.** `CLAUDE.md` and the docs it lists are the rules; this pipeline is only the order of work. Where they disagree, `CLAUDE.md` wins and the disagreement is a finding.

- **You cannot hear.** Never write that something sounds or looks good, in an issue, a PR or a report. Say what the properties and the scorecard measured, write a page under `out/`, and leave the verdict to Brandon.
- **Feedback from his ear becomes a property or a critic metric first**, then a code change.
- **Tests are rationed** to the four kinds in `docs/TESTING.md`. An issue whose Acceptance asks for a unit test, a mock or a new Playwright spec is mis-scoped: restate it as a property, a corpus row, a golden or a scorecard metric.
- **Styles are data.** A style change that needs an engine edit means the engine lacks a concept: add the concept, then express the style as data.
- **Decide and log.** A call the docs do not settle gets one line of rationale in `DECISIONS.md`; where the work stands is on the issues and pull requests, never in a file. The issue is the unit of work; `PLAN.md` is the map and `DECISIONS.md` the record.
