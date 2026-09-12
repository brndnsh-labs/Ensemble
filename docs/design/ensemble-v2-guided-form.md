# V2 guided repeat and ending authoring

Implements the range-based interaction approved in #1176 on 2026-09-12. This preview-only
change adds no notation semantics, document migration or playback authority. Physical
iPhone and Edge/macOS usability acceptance remains separate from automated browser checks.

## Interaction

In the bar editor, **Repeats and endings** opens a detached review. Choose a section, then
select the first and last written bars using two clicks/taps or Tab and Enter. Explicit
From/Through selectors offer the same operation through standard keyboard controls.
**Repeat these bars** defaults to two total plays; the count includes the original pass.

**Add first and second endings** identifies a repeated body and two contiguous ending ranges
over existing bars. The ranges must follow in written order without gaps or overlap. No
chords or bars are invented. First/second endings always use two total plays; more elaborate
pass assignments remain under **Advanced · per-bar repeat and ending markers**.

Before Apply, the guide labels the written repeat boundaries and ending brackets and displays
the whole-chart itinerary from `compileScoreForm`. A four-bar study reads
`1–2–3 → 1–2–4`. Section repeats and navigation participate in this same compiler-derived
route. `prepareScorePlayback` also checks supported chord, duration and reference semantics
before Apply becomes available. Errors stay beside the selected ranges.

Each recognized group offers Edit to change its ranges/count or preview removing its form
markers. Removal keeps all written content, identities, contexts, annotations and unrelated
navigation. A section containing nested, implicit or nonstandard marker arrangements remains
available through Advanced; opening the guide preserves it and explains this limitation.
The guide recognizes exact common-case notation patterns, never rewrites a complex form
into a simpler interpretation. Disjoint simple groups can be edited independently.

## Draft and adoption boundaries

Opening first validates pending chord/context/Advanced buffers into a detached score. It does
not adopt them, clear them, write recovery or save a revision. Invalid raw text stays in its
original bar for correction. Cancel (including Escape) discards only the guide's local edits.

Apply passes the complete validated score, including pending chord edits, through the existing
synchronous `applyScore` runtime-adoption and recovery boundary. Raw buffers retire only after
successful adoption; a thrown failure leaves the dialog and original buffers available. Save,
copy/export, transpose and Revert retain their existing document semantics. Only explicit Save
updates the stored songbook revision. The guide's temporary range choices are not persisted.

The browser modal makes background editing unavailable during the detached review. A fresh
opening creates fresh local state using the existing conditional-mount pattern; background
transport renders cannot reset an in-progress selection.

## Evidence surfaces

- `tests/unit/songbook/guided-form.test.ts`: exact visit order, immutable source/content,
  invalid ranges/counts, group overlap, complex notation preservation and global navigation.
- `prototypes/v2/checks/guided-form.spec.ts`: keyboard/tap interaction, draft cancellation,
  create/edit/remove, preview failures, layouts and saved/offline round trips.
- Existing `semantic-form-editor.spec.ts` continues to exercise Advanced pending forms,
  saved documents, import rejection, transpose and offline reopening.

These checks do not establish listening acceptance, physical-device usability or a public
release. No production target exists for this isolated preview.
