# Foundation review receipt

Scope: #1170, isolated preview. No production adoption or musical acceptance implied.

Independent source review plus an inline correctness/security pass covered document ownership,
worker synchronization, input validation, asynchronous UI intent, recovery, offline installation
and TEST deployment. No new original-engine fields/messages or generators were added.

Findings fixed before audition:

1. Older competing drafts hidden after newer saves: expose retained drafts explicitly.
2. Async navigation/title races: disable competing intents while an operation is pending.
3. Automatic sound selection could load packs: reject that unsupported input without alteration.
4. Reverb hydration left existing buses stale: use the engine's canonical per-lane send sync.
5. Failed recovery could lose a draft on navigation: keep a per-song in-memory fallback, mark
   it tab-only, retain a persistent warning and request the browser's unload prompt.
6. Opening an older recovery could overwrite the current recovery: open an independent copy.
7. Worker-only updates shared cache/release identity: include the offline recipe in cache
   fingerprints and stage each deployment in a unique directory before switching.
8. Existing root service worker could falsely satisfy readiness: await the preview registration.

The independent closure pass found no remaining source-review blocker. Automated browser checks
cover actual nonzero audio, offline reload, explicit save/revert, draft recovery, competing tabs,
quota failures, detached import/export, 13 feel selections, transposition/mutes, long charts and
responsive legibility. Chromium and WebKit use the same application artifact; the WebKit offline
harness refuses real server sockets because offline emulation fails a minimal independent cached
HTML reproduction (documented in README). This is not a skipped offline assertion.

Human test still required: audible continuity/quality, laptop usability, real iPhone touch,
legibility and offline startup. Remaining product limitations are in README. A heavyweight human
code review is worthwhile before turning this prototype bridge into the production runtime.
