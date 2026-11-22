# Testing policy

This policy is binding. The previous version of Ensemble accumulated nearly 8,000 unit tests and a slow browser suite, because every change added tests and nothing ever removed them. The suite came to protect the implementation instead of the behavior. This project rations tests on purpose.

## The principle

A test earns its place by protecting a rule that a musician or a user would care about, at a boundary that will not move when the code is refactored. Ensemble has dozens of such rules, not thousands. The suite should read top to bottom as a description of what the band is supposed to do.

## The four kinds of test

Nothing outside these four may be committed.

### 1. Fixture corpus (chart format)

One table of chart text and expected result, with one runner. Expected results cover both valid parses and diagnostics.

- A new edge case is a new row, not a new test.
- One round-trip check runs over the whole corpus: parse, print, parse again, same model.
- Every example in `docs/CHART_FORMAT.md` is in the corpus.

### 2. Musical properties

Invariants checked across many seeds, charts, and styles. Each property states a rule about music, never about code.

Examples of the form:

- The bass never leaves its range.
- No voicing has a note below the register floor.
- Comping stays below the soloist's lowest current note where the style requires it.
- Every timed jam is a whole number of passes and ends on a resolution to the tonic.
- No event starts outside the plan's duration.
- The same chart, style, options, and seed produce identical events.
- Extending an open-ended plan does not change passes already generated.
- A chart with errors still produces a playable take.

Expect roughly 40 to 60 properties when the engine is mature. The findings in `docs/MUSIC_NOTES.md` should mostly land here or in the critic.

### 3. Golden takes

A fixed chart, style, and seed that must produce exactly a stored MIDI file.

- One or two per style. Ten to twenty in total.
- They detect unintended change. They do not prove the music is good.
- Updating a golden requires a line in `docs/decisions/` (its area's file) saying why the output changed.

### 4. Browser smoke journeys

Playwright specs for things only a real browser can prove. The list is fixed:

1. The app loads and shows the library.
2. After install, the app loads offline.
3. A chart typed in the editor renders, and an error shows a diagnostic in place.
4. Pressing play starts audio and advances the playhead.
5. Export downloads a MIDI file that matches the CLI's output for the same take.

- No spec waits for music to play in real time. Timing logic is checked in the engine with an injected clock.
- No sleeps, no retries. A flaky spec is fixed or deleted the same day.
- These run on merge to the main branch, not on every push.

## The critic scorecard is not a test

Musical quality is statistical. "Is the soloist aimless" is a distribution over hundreds of seeds, so it is reported, not asserted.

- `ensemble score` prints each metric's mean and spread per style across N seeds.
- A committed baseline file records the last accepted scores. CI reports movement, and fails only when a metric drops past a stated tolerance.
- Improving the band means moving the scorecard, then confirming by ear at a gate.

## What gets no tests

- UI components and layout.
- Glue code, private helpers, and anything reachable only through internals.
- Anything the type system already guarantees.
- The audio layer, beyond smoke journey 4. Ears test audio.

## Rules

1. **Public API only.** Engine tests call `parse`, `print`, `plan`, `render`, and the critic. Nothing imports internals.
2. **No mocks in the engine.** Pure functions do not need them. Wanting one signals a boundary problem.
3. **Every test names its rule** in plain musical or user-facing language. If the rule cannot be named, the test does not exist.
4. **A bug found by ear becomes a stronger property or a new critic metric.** A one-off example test is the last resort and needs a comment saying why no property could express it.
5. **Deleting a test that no longer earns its place is normal maintenance.**
6. **Playwright is for looking, not for accumulating.** Drive the app freely to verify your own work in a headless session. Do not commit a spec unless it is one of the five journeys.

## Budgets

| Suite | Limit | When it runs |
|---|---|---|
| Engine (corpus, properties, goldens) | 4 CPU seconds, and 24 more for each style (196 at eight styles) | every push |
| Engine, six seeds | three times the push budget (588) | before a gate |
| Scorecard | 150 CPU seconds | every push, report only except for tolerance failures |
| Browser smoke | 60 seconds on the clock | merge to main |

A budget for work the machine does is counted in **CPU seconds**: the processor time the command and everything it started used. That is the work done, and it hardly moves with what else the machine is doing; the time on the clock does (the engine suite measured alone, back to back, beside a scorecard run and two at once: the clock ranged from 26.0 to 39.7 seconds, the CPU time from 182.5 to 190.3). The browser journeys wait on a browser, so theirs is time on the clock. `scripts/budget.ts` measures both and prints the clock beside the CPU time.

A budget is kept on the machine the work is done on; CI says the figure and does not judge it. The response to an exceeded budget is to consolidate or delete, never to raise the limit without an entry in `docs/decisions/`.

The engine's budget grows with what the band can play and with nothing else. Every style is held to every property, in a process of its own, so a style added is the same rules checked on one more band: the cost is real (about 22.6 CPU seconds a style, beside the others) and is not the suite growing, and `budget.ts` works the limit out from the styles that ship. A meter a style writes its parts for, and a chart added to the library, cost almost nothing here (a style's tests cost the same with a written meter taken away, and jazz's twenty charts cost little more than another style's seven), so neither earns anything. What is rationed is the rules. A new property, a new kind of take, or more seeds on a push still has to fit inside the budget as it stands, by consolidating or deleting.

Property tests can use a small seed count on every push and a larger one nightly, so long as the push run stays inside the budget.
