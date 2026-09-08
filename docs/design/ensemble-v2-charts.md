# V2 charts: explicit music, flexible page

Status: **direction accepted; first codec foundation implemented under #1171**, 2026-09-08.
Brandon explicitly approved changing the document format and targeting full iReal chart
compatibility, while retaining quick text entry and Ensemble's additional capabilities.
This supersedes the earlier proposal's permanently limited compatibility boundary.
There is no implemented importer or live migration yet. The current preview remains v1.

## Recommended next build

Build the semantic chart and exact-timing foundation, a measure-aware editor, then faithful
iReal import and form playback in verifiable slices. Keep quick text entry and the
music-stand appearance. Full chart compatibility is the destination, not a claim about the
first slice. Accounts and cross-device songbooks (#1172) need not wait for every symbol.
The scope is chart notation, form, entry, import and playback meaning—not a clone of iReal's
accompaniment engine or every unrelated app feature.

The user-facing result should be: select a bar, enter its chords, choose when they change,
and Save. The chart stays visible. A musician who likes typing can keep using text.

### Entry examples

These inputs are supported by the new bar parser, **not yet by the current preview**.

| Meter | Text | Meaning |
| --- | --- | --- |
| 4/4 | `C` | One chord for the whole bar. |
| 4/4 | `Dm7 G7` | Two chords, two quarter-note counts each. |
| 4/4 | `C:2 Dm:1 G7:1` | C for two counts, then Dm and G7 for one each. |
| 3/4 | `Am:2 E7:1` | Two quarter-note counts, then one. |
| 6/8 | `Am:3 E7:3` | Three eighth-note counts each; the editor labels the unit explicitly. |
| 4/4 | `C/E:2 F:2` | Slash bass and duration are separate concepts. |
| 4/4 | `Am6[Dm7]:2 E7:2` | Preserve an alternate chord without choosing it for playback. |
| 4/4 | `C:2 /:1 N.C.:1` | Chord, continued harmony, then no-chord are distinct events. |

Spaces and newlines are formatting; `|` separates measures. Do not make the number of
spaces determine timing in Ensemble. If any chord in a bar has an explicit length, require
lengths on all chords in that bar and require their sum to fill the meter. No inferred
remainder or silently repaired overfull bar. The count picker starts with whole counts;
half/quarter counts are available only when they map exactly to engine steps. Decimal text
is parsed as an exact rational, not rounded floating-point time. Tuplets remain outside the
initial bridge. Existing valid fractional lengths remain visible and editable.

Without lengths, the authored model retains exact equal division, including thirds. The
initial engine bridge must separately require that timing maps exactly to its grid. For
an off-grid new bar, show a visual choice of lengths instead of rounding. For
example, `C Dm G7` in 4/4 offers 2+1+1, 1+2+1 and 1+1+2, with no default silently chosen.
The authored score remains representable even when the engine cannot yet play it. This
playback restriction must not retroactively invalidate untouched legacy songs.

### Small editor, not a notation workstation

- Keep Edit chart as the explicit entry point; playback is still a music stand.
- Within editing, selecting a measure opens its chords and a meter-labelled count strip.
  Desktop uses a side panel; phone places it directly above the selected measure.
- Replacing a chord retains its duration. Adding a chord asks how to divide the available
  counts. Removing a chord requires an explicit choice for the resulting space.
- Plain-text section editing remains available. The graphical editor and text editor
  operate on the same validated candidate, never independent saved representations.
- Save includes pending text, as it does now. Invalid text is retained with a measure-specific
  explanation. Switching editing modes must not discard invalid buffers or silently fix them.
- Section names, repeat counts and key/meter overrides get one section settings surface.
  Preserve the reserved conductor gestures; do not overload playback section taps.

## Current-code evidence

`ChartSection.value` in `public/songbook/types.ts` is authored text. Its codec allows
1,000 characters per section, 500 sections, and repeat counts from 1 to 64. There is no
canonical measure/event field. Codec validation is not proof the music is playable.

`parseProgressionPart` in `public/engine/chords-engine.ts` divides a bar's meter counts
equally between tokens, resolves chord identity and generates voicings in the same pass.
`updateProgressionCache` independently rounds each chord to sixteenth-note steps. The
lead-sheet model uses those generated chords, not an authored measure model.

A local diagnostic invoking the real `validateProgression` on a detached state reproduced:

| 4/4 input | Step ranges | Total steps |
| --- | --- | --- |
| `C G7` | 0–8, 8–16 | 16 |
| `C Dm G7` | 0–5, 5–10, 10–15 | 15 |
| `C C Dm G7` | 0–4, 4–8, 8–12, 12–16 | 16 |

The middle row is an existing timing defect, **not desired behavior to pin as correct**.
The last row is not a proposed workaround: duplicating a token introduces extra chord
events and can change generation. A migration must not silently reinterpret the middle
row as 2+1+1 or claim a lossless conversion. This codec foundation does not fix the engine defect.

## Accepted semantic boundary and first implementation

Use a versioned chart representation with sections containing ordered measures;
measures contain ordered chord events and exact durations. Page geometry, line breaks,
generated voicings, playback cursors and unfolded repeats are derived, not musical authority.

The additive `ChartDocumentV2` codec retains the document envelope, performance and band
settings, replacing `chart.arrangement` with `chart.score`. Existing readers still use v1;
they reject v2 as a future version. No browser record, share schema, engine state or worker
contract changes in this first slice. The new types live in `public/songbook/score-types.ts`.

```text
section: identity, label, key/mode and meter overrides, repeat count, measures
measure: identity, context changes, events or explicit source-measure repeat, directions, annotations
event: authored chord spelling, exact duration, optional alternates and fermata
duration: rational quarter-note units (numerator / denominator)
```

Persist exact rational durations rather than floats or pixel widths. In the initial bridge,
every event duration multiplied by four must be a positive integer number of sixteenth
steps, and the sum must equal the measure length. No rounding. Text `:n` counts the meter's
denominator unit: multiply n by 4/denominator to obtain quarter-note units. Thus `Am:3` in
6/8 is 3/2 quarter notes, or six engine steps. Display that distinction clearly; tempo
continues to follow Ensemble's existing quarter-note convention.

Authored chord spelling stays separate from voice-leading output. Resolve/validate the
whole chord token, including bass and quality, before voicing. Transposition changes chord
identity and key context without changing duration or form. Resolve relative notation
against the owning section's key/mode. Do not run new syntax through the tolerant v1 parser.

The first authored form model already retains section repeats, repeat barlines, ending
passes, D.C./D.S., coda/Fine destinations and explicit repeat-policy-after-jump. It does not
yet execute them. The next compiler must validate nesting, ending reachability, ambiguity
and bounded traversal into an itinerary with source measure IDs and pass numbers. A codec
success proves authored-data validity and references, not that the form can be performed.
Never use an unfolded chord list as the only retained chart.

Context is deliberately explicit: each section starts from the global key/mode/meter plus
its overrides. Within that section, measure key/mode/meter changes persist until changed
again; a new section resets to its own global-plus-section context. Writing a meter resets
grouping to `null` unless grouping is written alongside it; otherwise grouping inherits.
Measure-repeat references copy the earlier authored events, not generated voicings or its
context changes. They resolve the copied symbols in the destination context. A performance
adapter must implement and test this rule, not infer it from an unfolded array.

The bar-text printer represents only events; it refuses fermatas rather than dropping them.
Sections, annotations, navigation and unsupported editing buffers must remain owned by the
chart editor. No claim of a full-score text serialization is made yet.

The pure `proposeLegacyScoreConversion` API returns either a detached candidate or a blocked
report, always alongside the exact original JSON string. It does not persist anything or
certify audible equivalence. It accepts a conservative full-token legacy spelling subset
and exact-grid lengths, retains section/band settings, and reports the detached preset
association. Timing anomalies and uncertain spellings produce no partial candidate.

### Engine bridge and gates

1. Validate the complete detached candidate, including event lengths and bounded expansion.
2. Separate chord resolution/voicing from text tokenization. Preserve existing v1 behavior
   through a legacy adapter; add the semantic input as a separately tested path.
3. Build exact progression, measure and section maps from authored durations. One map
   builder owns offsets for the chart, worker generation and export paths.
4. Apply through the existing document-open/dispatch boundary, rebuild derived state and
   use the sanctioned full worker-sync/flush sequence. No component writes engine maps.
5. Prove identical valid legacy output before changing the host adapter. Then prove explicit
   2+1+1 yields offsets 0, 8, 12, 16 in chart highlighting, live scheduling and exports.

A worker/state-contract change is a separate review gate, not permission granted by this
document. Same for N.C.: it needs a defined contract for every lane, not a fake tonic chord
or a UI-only symbol. Keep it unsupported for initial playback until that contract is built.

## iReal evidence and staged compatibility target

iReal's official developer documentation distinguishes generated `irealbook://` links from
the app's `irealb://` HTML exports. Treat these as separate decoders, not aliases.
[Developer documentation](https://www.irealpro.com/developer-docs/).

Its chart cells carry rhythm, not just layout. Consequently, splitting decoded content on
whitespace is insufficient; preserve cell positions through parsing and validate their
timing interpretation before adapting to Ensemble. Layout can be discarded only after
recovering musical meaning. [Chart layout](https://www.irealpro.com/learn/chart-layout/).

The open protocol describes musical symbols beyond chord names, including measure repeats,
endings, navigation, N.C. and alternate chords. Each needs an explicit disposition below;
unknown material is never stripped until something playable remains.
[Custom protocol](https://www.irealpro.com/ireal-pro-custom-chord-chart-protocol/).

### Real export supplied by Brandon

`Blues var. 2.html`, self-entered and provided for this investigation, is a 1,504-byte
HTML export marked iReal Pro 2026.7 / iOS 26.6. It was inspected as text, not executed;
no embedded links/images were fetched. The original remains in Downloads, unmodified.
The checked-in fixture is a **metadata-sanitized derivative**, not the original HTML.

Local decoding recovered a 12-bar 4/4 chart with dominant sevenths and previous-measure
repeats in bars 4, 6 and 8. It exercises a genuine modern obfuscated payload, an empty
header field, style metadata, transposition metadata, and whole-song playback repetitions.
It does not exercise unequal durations, slash basses, alternate endings or key/meter changes.

The stored key is C; a separate transposition field is `10`. Preserve both until the
displayed/played key is confirmed in iReal. Tempo `0` is not zero BPM; its default/unset
meaning must be verified. The trailing `6` is not six copies to append to the saved form.
Keep raw metadata distinct from accepted Ensemble playback settings.

Context7 had no matching ireal-reader documentation. Inspection of its primary source
provided a reference for the reversible payload permutation, but **no dependency was added**.
Its full parser discards timing spaces and skips unknown characters; it is not the proposed
lossless import boundary. [Decoder source](https://github.com/pianosnake/ireal-reader/blob/master/unscramble.js),
[parser source](https://github.com/pianosnake/ireal-reader/blob/master/Parser.js).

The decoded body and hand-reviewed bar expectation are in
[`fixtures/ensemble-v2-charts.json`](fixtures/ensemble-v2-charts.json). They establish a
fixture for this specific export, not general import or by-ear compatibility.

### Compatibility ledger (all rows remain targets)

| Feature | First-slice state / next work | Proof still required |
| --- | --- | --- |
| Single-song modern export, simple 4/4 | Target | Actual importer against the supplied fixture; key/tempo interpretation. |
| Generated open-protocol link | Target, separate decoder | Synthetic protocol fixtures and current-app round trip. |
| Whole-bar chords and previous-measure repeat | Target; retain source provenance | Correct source references and playback event equivalence. |
| Unequal chord durations | Target only for verified cell patterns | Short real exports for 2+1+1 and 1+1+2; no guessed cell rounding. |
| Qualities and slash bass | Whole-token spelling vocabulary in new codec; voicing adapter pending | Complete official vocabulary mapping and harmonic-identity fixtures; no partial matches. |
| Whole-section repeats | Target after a real fixture | Distinguish written repeats from player chorus count. |
| First/second endings, D.C./D.S., coda, Fine | Authored directions represented; form compiler pending | Bounded traversal, import mapping and auditioned fixtures. |
| N.C., holds, alternate chords, fermatas | Authored events represented; playback pending | Per-lane meaning, editing and faithful import mapping. |
| Other rhythmic notation, rests and pushes | Inventory and represent without guessing equivalence | Current protocol/app fixtures and explicit lane semantics. |
| Meter/key changes | Authored contexts represented; adapter pending | Boundary-position and inheritance fixtures; exact engine-supported meters. |
| Unsupported meters or off-grid timing | Block, explain location | Never substitute 4/4 or round durations. |
| Long charts | No fixed page limit | Synthetic 64/128-bar layouts and explicit input/expansion bounds. |
| Playlist HTML | Import-surface follow-up | Per-song selection/diagnostics; no silent first-song-only import. |
| Composer, title, style, transpose, tempo | Basic document metadata represented; source mapping pending | Preserve raw import metadata separately; no style-to-genre or zero-tempo guess. |

Unsupported-at-this-stage means visibly unavailable until implemented, not intentionally
excluded from v2. The ledger must distinguish authored representation, editor support,
import decoding, display and actual playback; checking one column never implies parity.

Brandon also supplied `Minor Swing.html` and an iReal screenshot. Local inspection confirms
repeat barlines, first/second endings, a coda, alternate chords, N.C., and break annotations.
These give useful next-form examples; neither the full chart nor the screenshot is published
in this repository. Use original minimal synthetic forms for public contract tests. The
supplied chart still needs importer and performance-order verification; it is not an audition.

An import preview shows source title, measures, effective key/meter and a visible
interpretation report. Keep as new song mints an independent document only when there are
no blocking musical diagnostics. Cancel changes nothing. Source download remains possible
even for rejected imports. Do not offer a playable preview that silently drops bad measures.

Extract allowed links from bounded untrusted input without executing HTML, loading remote
assets, following URLs or uploading charts. Preserve positional empty header fields;
validate percent escapes and supported envelopes; reject search links and unknown variants.
Use byte/node/measure/expanded-event ceilings and bounded form traversal. Prototype-member
keys, markup-bearing metadata and malformed nesting need negative fixtures. Source text
never enters analytics or error payloads.

## Compatibility and rollout

- Do not append new duration syntax to a version-1 `value` field and call it compatible.
  An old client could accept the envelope and misplay the text.
- The new schema version is approved and implemented as an additive codec. Keep v1
  decoding/playback available. Unknown versions remain downloadable, never empty data.
- Convert only a detached copy. Retain the exact original record and a migration report;
  validate and persist the new record before advancing any pointer. Repeated migration is
  idempotent; interruption/quota/conflict tests must prove the original survives.
- Exact-grid, fully understood v1 charts may convert after equivalence checks. Charts
  affected by timing rounding, unsupported spellings or ambiguous form remain legacy until
  the musician explicitly resolves them. No automatic 3-chord timing correction.
- Old shares remain on their compatibility route. New-format charts never emit old share
  payloads unless a lossless conversion is proven. Snapshot sharing remains detached.
- No boot-time bulk rewrite. A production rollback must retain access to v1 records and
  preserve newer records for re-upgrade/export; it must not overwrite them through an old app.

## Device acceptance and next stories

Four measures per normal laptop/tablet row; two per portrait phone row as the starting
layout. Whole measures never split. Dense measures may take a wider row; long charts
scroll instead of shrinking every symbol to fit a page. Text size and touch targets remain
usable at 1300x940, phone portrait/landscape and tablet sizes. Manual scrolling pauses
following; Resume following is explicit. Repeated passes retain a stable source measure ID.

Delivery slices after the accepted format decision:

1. Exact-duration semantic codec + conservative source-preserving conversion proposals
   (this slice); no migration writes or audio-equivalence claim yet.
2. Shared map/engine adapter + measure editing, with Save/recovery/transpose and actual-audio
   tests; separate worker-contract review and test-server audition.
3. Form compiler and full iReal chart import in fixture-backed stages, source retention
   and negative tests; no permanent notation/form exclusions.
4. Source-preserving migration and old/new-client coexistence, before production adoption.

Account/sync contracts can proceed once the document envelope/version policy is settled;
they need not wait for every import symbol. The document-format approval has been given;
production adoption, real-device acceptance and listening remain separate gates. This
foundation and its fixtures do not close #1171.
