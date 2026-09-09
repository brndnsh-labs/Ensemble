# Foundation review receipt

Scope: #1170, isolated preview. No production adoption or musical acceptance implied.

Independent source review plus an inline correctness/security pass covered document ownership,
worker synchronization, input validation, asynchronous UI intent, recovery, offline installation
and TEST deployment. No new original-engine fields/messages or generators were added.

Findings fixed before audition:

1. Older competing drafts hidden after newer saves: expose retained drafts explicitly.
2. Async navigation/title races: disable competing intents while an operation is pending.
3. Automatic sound selection could load packs: the initial foundation rejected it without
   alteration; the explicit installation follow-on below now supports and prepares these choices.
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

## Manual sounds follow-on (#1174)

An inline pass and an independent second-model review covered the injected asset-fetch boundary,
compatible manual voice validation, asynchronous selection/play preparation, content-addressed
cache integrity, v1 isolation, and on-demand packaging. The independent review found stale
built-in-only documentation (F1); it was corrected and independently confirmed closed. No further
source-review blocker was found. No generator, sample, gain, or audio-graph tuning changed.

Browser checks instrument decoded nonzero sample buffers at actual source playback, exercise all
catalog downloads and all five sampled lanes, Save/Revert/export/import, offline cold reload,
partial eviction, corrupt responses, storage quota failure, and successful retry. These are
functional checks, not a human judgment of timbre or real-device audio continuity.

The test-host cache prerequisite was resolved on 2026-09-08 with a test-preview-only Caddy rule
and a user-performed Cloudflare purge. Deployment verified all 258 assets, the canonical worker,
the manifest and unchanged original test root. The first manual-sound audition source was
`62ef0b3e`; GitHub PR #1173 records the current artifact and human-test status.

Live acceptance exposed an import-test timing race: disabled Save also meant "busy," so the test
could submit an invalid second file before the first import finished. A slow file-read fixture
reproduced the failure; waiting for Song actions to become enabled fixes the test without
changing the application or weakening invalid-input assertions.

## Install-all and focused stand follow-on (#1174)

The user requested one installation action that immediately improves the current band's sounds,
less space above the chart, and minimal playback controls. The reported missing desktop menu was
withdrawn after it loaded; this iteration does not claim to fix a reproduced desktop-picker bug.

An inline correctness pass and independent second-model review covered complete-catalog
installation, manual pins versus Follow feel, saved-document compatibility, offline failures,
playback intent and responsive layout. Three findings were fixed and received a clean closure:

1. Failed feel preparation restored the old setup but stranded an active band stopped. Verify
   the previous required files before resuming it, honor Stop during either preparation path,
   and report when even the old sounds cannot safely resume.
2. The temporary engine pause expanded the focused controls and displaced the chart. Retain
   playback intent in the UI until preparation settles, with an enabled Stop throughout.
3. Reopening the editor after playback reset unapplied chord text. Keep it in the current tab
   when switching views; Apply and Save remain explicit, with no new durable text-recovery claim.

Browser regression coverage now includes bulk quota failure and cached retry, all five automatic
choices, a manually pinned lane across feels, exported/imported Follow feel, offline cold reload
and genre changes, verified rollback/resume, Stop during preparation, and unavailable old sounds.
Responsive checks exercise laptop, portrait/landscape phone and tablet layouts, modal focus,
automatic playback focus and preservation of unapplied editor text. The preparation-focus test
failed against the pre-fix artifact before passing against the repaired build in both engines.

No sample, gain, generator or worker-contract changes were made. Existing genre mappings and
their soloist-phrasing reconciliation are reused. Other saved songs are not rewritten. Read the
README rollback caveat before trying an older manual-only build with new Follow feel documents.
Automated routing and layout evidence still do not replace a real laptop/iPhone audition.

All 26 final preview checks passed across Chromium and WebKit. During the original-app regression
run, the unchanged settings-scroll test once observed an 85px difference. A read-only, 20-run
isolation probe then observed exactly 407px before and after every toggle (0 failures). That does
not establish a cause or a fixed flake; no assertion, timeout, test or original-app code was
changed. PR #1173 retains this diagnostic and the final full-suite result.

Captured UI evidence from the tested preview (not generated mockups):

- [Focused laptop stand](evidence/focused-laptop.png)
- [Focused portrait-phone stand](evidence/focused-phone.png)
- [Install-all Sounds dialog](evidence/sounds-dialog.png)

## Editing usability follow-on (#1175)

An inline correctness pass and independent second-model source review covered per-section raw
buffers, full-token checking for changed text, atomic Save/copy/export, failed writes/conflicts,
navigation/transformations, tempo event ordering and the last-opened preference. The independent
source pass found no actionable defect. Main-thread browser inspection found a small section
selector tap target (F1); the patch gives it a 44px minimum and a responsive regression assertion.
Independent finding closure confirmed F1 fixed with no nearby regression. The full 48-case
preview suite passed; after the final selector-only patch, all 24 usability/responsive checks
passed again across Chromium and WebKit. The original-app gates are recorded in PR #1173.

The strict editor boundary reuses existing chord-quality recognition without imposing new rules
on untouched saved text. Unknown roots and partially understood spellings no longer silently
become substitute chords when saving new text. Invalid text stays tab-only, with explicit status
and an unload guard; validated work enters existing recovery before a potentially failing Save.
No saved schema, old browser data, generator, worker contract or sound behavior was changed.

The tempo regression failed against the previous built preview: sequentially typing 90 produced
240. An initial new upper-bound assertion also exposed an old UI/engine mismatch: the input
advertised 300, but both the engine and canonical codec already enforce 240. The preview now
matches that established 40–240 contract; no musical range was expanded.

Browser checks cover raw-only Save, multiple edited sections, copy/export isolation, unsupported
tokens and document bounds, failed Save recovery, competing-tab conflicts, transposition,
navigation, tempo Enter/blur/Escape/steppers, preference failure, and editor visibility across
laptop, phone portrait/landscape and tablet. Real-device keyboard/touch and musical audition
remain human checks; this PR stays a test-only draft, not a production cutover.

Captured from the final tested interface:

- [Laptop editor](evidence/editor-laptop.png)
- [Portrait-phone editor, WebKit](evidence/editor-phone.png)

## Playable semantic charts (part of #1171)

The user approved an additive measure-based document and this bounded playable/editor slice.
New songs use schema 2; existing songs and starters remain schema 1 unless the user explicitly
creates an editable copy with a fresh ID. No original record is rewritten. Production adoption,
old/new-client coexistence, full form execution and iReal import are still separate work.

An inline correctness/trust-boundary pass and independent music/state/worker plus document/UI
reviews covered exact timing, sticky context, legacy musical parity, bounded preparation,
detached renders, version-aware persistence, recovery, pending buffers and failed imports.
Three P2 findings were fixed and independently confirmed closed:

1. F1: a mode-only key change did not earn a bar-context marker. Compare mode as well as tonic
   and meter; the browser regression checks the marker and the saved IndexedDB document.
2. F2: detached chord-only stems read the prepared plan's authored bass override instead of
   the render's effective section mask. Read the passed-state override; a production-clone
   regression verifies root inclusion, legacy equivalence and unchanged source/live state.
3. F3: the dedicated MIDI worker received an unused semantic rebuild plan. Exclude it at
   `startExport`'s wire seam and assert against the actual posted request. Local WAV clones
   retain the plan; both workers still receive the existing exact performance maps.

The optional renderer is registered by the v2 host. Original-app startup does not import the
semantic renderer/codec; no size limit was raised. Tests compare valid on-grid voicings across
all 13 genres, observe exact 2+1+1 offsets and effective meter/grouping, and instrument actual
worker messages, chord highlighting and nonzero audio output across two complete chart laps.
Browser checks include source-preserving conversion, pending multiple bars, hidden-editor Save,
transposition, Revert, offline reload/playback, revision conflicts, recovery and unsupported-import
atomicity. Exact final gate/deployed-revision results are recorded in PR #1173.

Laptop and WebKit phone editor captures were inspected on the main thread. Automated evidence
does not constitute musical or actual-device acceptance. N.C., holds, alternates, navigation,
unsupported meters/qualities and off-grid timing remain explicit playback errors, not silent
substitutions. The schema can represent more than this first playable editor supports.

- [Measure editor, laptop](evidence/semantic-editor-laptop.png)
- [Measure editor, WebKit phone](evidence/semantic-editor-phone.png)

## Repeat/ending form and compact written stand (part of #1171)

The next approved checkpoint adds nested repeat barlines and alternate ending passes within
self-contained sections. A bounded syntax tree unfolds into source-indexed visits; written
context is resolved before traversal, and exact duration maps still drive the existing worker
and detached renderer. No new document version, worker payload field, generator or audio-graph
change was needed. Unknown navigation and malformed/crossing form fail before adoption.

The music stand displays each written measure once, including whole-section repeats, and maps
every performed event back to its written slot. Repeats and endings live in a default-closed
bar-editor disclosure. Raw multi-bar edits remain pending until checked together; Save/export,
transpose, Revert and offline recovery retain authored form rather than unfolded copies.
React documentation informed raw controlled strings rather than keystroke normalization.

Independent form tests and isolated controls/browser work were reviewed and re-run on the main
thread. An inline pass plus independent form/playback and second-model UI reviews found four
issues; all were fixed and independently closed:

1. FP1 (P2): an outer first ending eagerly consumed an inner final ending's closure. Resolve
   inside-out, then consume an optional still-unclaimed outer closure.
2. FP2 (P2): an ending could close inside a nested repeated passage while the compiler silently
   extended it. Claim only complete-child boundaries and exhaustively reject unclaimed markers.
3. FP3 (P2): a nested repeat's co-located ending-start could be read as a peer ending. Inside
   an open ending, the new repeat owns that start; an explicit outer closure makes it independent.
4. F1 (P1, UI): compact seamless sections could lose their individual section repeat counts.
   Show each joined section's own label/count at its written seam, including a single pass.

All three compiler repros were red before the repair and green afterward. Independent closure
also executed nearby crossing and explicitly independent repeat variants. Root validation
passed with 411 files / 4,381 tests; the existing bundle limits were unchanged. The full preview
suite passed 66 cases before review patches, then all 20 semantic-editor/form/playback cases
passed across Chromium and WebKit after the patches (including two new seam-count cases).
Final exact-head CI and test-deployment receipts belong in PR #1173, not this historical count.

Browser observations cover the actual module worker, exact maps, repeated chart highlighting
and nonzero audio over two complete form laps. Multi-bar draft failures, hidden-editor Save,
exported source identities, transposition, rejected imports, Revert and offline reopening are
also covered. Main-thread visual inspection checked both editor and focused stand captures:

- [Repeat/ending stand, laptop](evidence/repeat-stand-laptop.png)
- [Repeat/ending stand, WebKit phone](evidence/repeat-stand-phone.png)
- [Form controls, laptop](evidence/form-editor-laptop.png)
- [Form controls, WebKit phone](evidence/form-editor-phone.png)

This is not full iReal parity: importer, measure-repeat signs, cross-section repeat bars,
D.C./D.S./coda/Fine and the remaining notation/lane contracts are still staged work. The PR
remains draft and test-only. Automated audio checks are not a by-ear or real-device verdict.

### Startup-size delivery repair

The clean repeat/ending commit exposed a pre-existing near-zero startup-size margin:
the original-app initial graph measured 125.034 kB locally (125.002 kB in CI) against
the unchanged 125 kB budget, despite the dirty-tree validation passing. The new form
modules were absent from that graph; revision/chunk-name compression moved the boundary.

The bounded repair loads the original app's chord picker only when opened, with pending
Escape, outside-pointer, focus-exit and playback cancellation, a visible loading status,
and a non-destructive download-error toast. Its existing chord/spelling implementation
is unchanged. The canonical note-name array is now a dependency-free leaf re-exported
by config, avoiding a transitive genre-table dependency in the deferred editor.
The initial deferral alone grew the graph and was not accepted as a size win; the leaf
extraction brought the measured graph below budget. This is a startup-download reduction,
not a claim that all JavaScript or offline-cache bytes shrink. No thresholds, build-revision
rules, musical generators, persisted data or worker contracts changed.

Regression coverage includes a delayed response after dismissal, loaded selection/focus
restoration, a failed download preserving authored chords, and an installed service worker
opening the never-used picker after a cold offline reload. Final exact-commit size and
gate receipts are recorded in PR #1173.

Bundle review also closed two loading-boundary findings: BR1 removes pending-dismiss
listeners synchronously before exposing the loaded picker (an immediate first-input
regression covers the passive-effect window); BR2 replaces an inaccurate retry promise
with reconnect/reload guidance after a browser reproduction showed a failed module fetch
remains cached in the current page. Reload recovery preserves the chart and is tested;
the application never reloads automatically on a failed download.

## iReal import, navigation and measure-reference checkpoint (part of #1171)

The next user-approved parallel batch separates import decoding/notation, global navigation,
written measure references and independent contracts. The main thread owns host integration,
source retention, review and verification. These notes supersede the earlier checkpoints'
statements that import, D.C./D.S./Fine/coda and measure-repeat playback were unavailable.

Import chart now reviews bounded HTML exports or direct chart links without creating a DOM,
fetching resources or writing the songbook. Explicit Add makes an independent local document.
Exact input survives as inert `importSource`, including after transpose/save/export; blocked
input can be downloaded as plain text. Stored key and chosen starting tempo are explicit;
unverified export transpose, style and chorus-count meanings are not silently applied.

The compiler preserves one global performed route across sections. Native repeat-after-jump
policy is explicit; ambiguous imported policy, jumps within repeated passages and al-Nth-ending
destinations remain blocked. One-/two-bar signs resolve earlier written identities with matching
key/mode/meter/grouping, not preceding performed events. The stand remains compact and preserves
bypassed written bars through detached display-only maps. No worker field or generator changed.

Main-thread integration found and closed alias/title-boundary mismatches and a missing display
path for valid coda-bypassed bars. Independent tests caught an empty interior bar being dropped;
the importer now rejects it without offering partial music. Independent safety and navigation/
adapter reviews found no remaining blocking defects. Two narrow follow-ups were independently
closed: memoized capability checks and exact active timing metadata for collapsed repeat bars.

Local evidence: 328 focused chart/import tests pass. After the narrow review refinements,
all 76 full-preview browser cases pass in Chromium and WebKit, including eight import cases
with exact multi-chord-repeat and D.C. al Fine highlight sequences through the next loop.
Tests also exercise inert source, explicit adoption, stored-key interpretation,
transposition, persistence, exported source, offline cold reopening and rejected imports.
Main-thread visual inspection checked both review and focused-stand captures:

- [Import review, laptop](evidence/ireal-import-review-laptop.png)
- [Import review, WebKit phone](evidence/ireal-import-review-phone.png)
- [Imported stand, laptop](evidence/ireal-import-stand-laptop.png)
- [Imported stand, WebKit phone](evidence/ireal-import-stand-phone.png)

The real local Blues export imports twelve written bars. Minor Swing still blocks at its bass
break annotation; private original HTML was not copied into the repository. N.C., holds/breaks,
alternates, fermatas, unsupported compression/rhythm and the remaining compatibility ledger
are not claimed as playable. Original-app regression, exact-head CI and isolated deployment
receipts belong in PR #1173. This remains draft/test-only, without by-ear or physical-device
acceptance, production adoption, downgrade compatibility or a persisted-data rewrite.

### Original-app Settings regression precondition

Two full root E2E runs reported an 85px Settings scroll delta. A faithful isolated run reproduced
it once in five attempts. Trace evidence placed the 407-to-322 movement in Playwright's own
actionability/scroll preparation, before the state-changing click; the entrance animation was
still active. A standalone probe that explicitly installed the E2E flag did not reproduce it,
which was not sufficient evidence to dismiss the suite failure.

The bounded test-only repair performs a trial click before capturing a positive scroll baseline,
then verifies the real checkbox change and keeps the existing delayed less-than-5px assertion.
It adds no retries or longer timeout and changes no application behavior. Twenty measured probe
runs and twenty actual retry-free test repetitions pass. Five simulated old delayed-refocus
mutations still move 407 to zero and fail the original assertion. Independent exact-diff closure
is clean; final full-suite results belong in the PR receipt. The ineffective global E2E-flag
configuration was not broadly rewritten as part of this checkpoint.
