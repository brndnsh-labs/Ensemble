# V2 charts: explicit music, flexible page

Status: **direction accepted; iReal import and navigation checkpoint under verification in #1171**, 2026-09-09.
Brandon explicitly approved changing the document format and targeting full iReal chart
compatibility, while retaining quick text entry and Ensemble's additional capabilities.
This supersedes the earlier proposal's permanently limited compatibility boundary.
There is a conservative iReal importer. The app reads one document version, schema 2 (see
[Compatibility](#compatibility)). Test deployment and human audition are separate from the
implementation described here.

## Current playable checkpoint

- Every chart the app opens is a semantic document, and since #1740 the only kind there is. A v1
  text chart arriving as a file or a link is refused with a plain message; one left in a store is
  left out, never read. "Upgrade old songs" (#1738), which converted them in place, was deleted
  with the v1 codec once every device was upgraded.
- The measure editor accepts chord text and optional length pickers. Save, export, key/feel
  transforms, playback and Home check every pending bar first. Failed validation retains raw
  buffers; successful adoption retires them before a subsequent transpose. Revert clears them
  explicitly. Checked edits use writer-scoped recovery and revision-aware saves.
- Linear sections, whole-section repeats, nested repeat barlines and alternate endings,
  unequal exact-grid chord lengths, and sticky bar key/mode/meter/grouping contexts compile
  (`compileScoreForm`, `resolveScoreContext`) to the band's timeline, which the band performs
  and the chart draws (`lib/band-chart.ts`). The old engine's score playback
  (`prepareScorePlayback`, `arranger.scorePlan`) is gone: it refused holds, N.C., alternates,
  fermatas and off-grid lengths, all of which the band plays. A performed form is bounded to
  16,384 measures by `compileScoreForm` and to 65,536 chord events by `compileTimeline`
  (`MAX_PERFORMED_SPANS`, #1632); the wider authored codec remains separate, and
  ambiguous navigation fails visibly before adoption.

## Import/navigation foundation and remaining scope

The implemented batch adds source-preserving import review, context-checked one-/two-bar reference
resolution, and bounded native D.C./D.S. to end/Fine/coda. Global performed order is authoritative;
the written stand uses detached display maps for bypassed bars. Native repeat-after-jump policy
is explicit (`play` restarts repeats, `skip` selects final passes), not inferred for ambiguous
iReal forms. Jump commands within repeats remain blocked; al-Nth-ending destinations are
implemented (#1473, below).
The optional document `importSource` holds inert original text and its format, not runtime state.
This is additive preview work, not production adoption or complete iReal compatibility.

**A whole playlist imports as a collection (#1478, decided on #1443).** The decoder keeps the
playlist's own name and reads up to 2,000 songs (the account's document cap); the import-wide
measure cap is 65,536, sized from Jazz 1460 (34,510 written measures across the 1,220 tunes that
build a score, measured 2026-10-02). The review dialog offers "Import all N as a collection"
beside the single-song picker and states, before anything is written: the songs to import;
duplicates by case- and whitespace-insensitive title + composer, skipped by default with an
"Import duplicates anyway" checkbox (a skipped duplicate stays in the collection as the copy the
songbook already holds, in its playlist position); songs the importer refuses, listed with their
diagnostics and never half-imported; and, signed in, the account cap — past it nothing is
written. A collection of the same name (not Starred) is added to rather than duplicated. Each
song keeps ITS OWN link as `importSource` (`songSourceLink`), never the whole playlist: 1,350
copies of a 650 KB playlist would pass the account's 256 MiB storage cap on their own. The parse
and the per-song checks run in slices (`parseIRealImportInSteps`, `planPlaylist`): parsing Jazz
1460 took 1.1-2.3 s and building and checking its documents 2.1-4.3 s in one go on a desktop (Node, Chromium and WebKit),
several times that on a phone.

With the exact-timing foundation and first measure-aware editor implemented, build faithful
iReal import and form playback in verifiable slices. Keep quick text entry and the
music-stand appearance. Full chart compatibility is the destination, not a claim about the
first slice. Accounts and cross-device songbooks (#1172) need not wait for every symbol.
The scope is chart notation, form, entry, import and playback meaning—not a clone of iReal's
accompaniment engine or every unrelated app feature.

The user-facing result should be: select a bar, enter its chords, choose when they change,
and Save. The chart stays visible. A musician who likes typing can keep using text.

### Entry examples

These inputs are supported by the authored bar parser. The linear preview plays the first
six examples; alternates, holds and N.C. remain representation-only pending lane/form work.

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
The authored score remains representable even when the engine cannot yet play it.

The bar field implements this (#1980). Chords typed with no lengths are "off-grid" when the
equal share of the bar is not a whole number of sixteenths (`offGridBarSplit` in
`score-text.ts`: 3 chords in 4/4, 5 in 6/8; 2 in 3/4 or 5/4 and 8 in 4/4 are on the grid and
need no question). The field then shows each chord taking the same whole number of counts
with the left-over counts going one apiece to a chord (4/4: 2+1+1, 1+2+1, 1+1+2; 3 in 5/4:
2+2+1, 2+1+2, 1+2+2), first highlighted but not applied. A click, or Enter on the highlighted
one (Up/Down move it), writes explicit lengths into the text; until then the bar stays
pending and Save refuses it. With more chords than counts, or more than six splits, no short
list is offered and the bar asks for written lengths. Explicit lengths bypass all of it.

### Editor direction (some controls remain follow-on work)

- Keep Edit chart as the explicit entry point; playback is still a music stand.
- Within editing, selecting a measure opens its chords and a meter-labelled count strip.
  Desktop uses a side panel; phone places it directly above the selected measure.
- Replacing a chord retains its duration. Adding a chord asks how to divide the available
  counts. Removing a chord requires an explicit choice for the resulting space.
- The section text editor went with text charts (#1739): a bar's chords are typed in the bar
  itself (#1723), and there is one saved representation, the score.
- Save includes pending text, as it does now. Invalid text is retained with a measure-specific
  explanation. Switching editing modes must not discard invalid buffers or silently fix them.
- Section names, repeat counts and key/mode/meter overrides get one section settings surface
  (shipped #1374; since #1726 opened from the section letter in Edit chart, `app/section-menu.tsx`
  with `app/section-settings.tsx`'s fields). Preserve the reserved conductor gestures; outside
  Edit the letter's tap stays "Start here".

## Legacy-code evidence (historical: the v1 path was deleted in #1740)

What follows describes the v1 code as it stood when this contract was written; none of it is in
the tree any more. `ChartSection.value` in `core/songbook/types.ts` was authored text. Its codec allows
1,000 characters per section, 500 sections, and repeat counts from 1 to 64. There is no
canonical measure/event field. Codec validation is not proof the music is playable.

`parseProgressionPart` in `core/engine/chords-engine.ts` divided a bar's meter counts
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
row as 2+1+1 or claim a lossless conversion. The v1 path stayed unchanged; the new exact-duration
path avoided this defect without silently reinterpreting a saved text chart.

## Accepted semantic boundary and first implementation

Use a versioned chart representation with sections containing ordered measures;
measures contain ordered chord events and exact durations. Page geometry, line breaks,
generated voicings, playback cursors and unfolded repeats are derived, not musical authority.

The `ChartDocumentV2` codec (`core/songbook/document-v2.ts`) holds the document envelope,
performance and band settings, and the music as `chart.score` (it replaced v1's
`chart.arrangement`). It is the only chart codec since #1740. The types live in
`core/songbook/score-types.ts`.

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
against the owning section's key/mode.

The authored form model retains section repeats, repeat barlines, ending passes, D.C./D.S.,
coda/Fine destinations and explicit repeat-policy-after-jump. Playback executes section counts
and self-contained section repeat/ending form through `compileScoreForm`. It validates nesting,
ending reachability, ambiguity and bounded traversal into an itinerary with written
section/measure indices and pass numbers. Bounded D.C./D.S./coda/Fine traversal now preserves
that global order; unsupported/ambiguous jump forms still fail explicitly. A codec
success proves authored-data validity and references, not that the form can be performed.
Never use an unfolded chord list as the only retained chart.

Choruses and "last time" (#1472; decision on #1450, option (a)). A score may carry
`choruses`, an integer from 1 to 64. `compileScoreForm` unrolls that many passes of the form,
and every visit carries a 0-based `chorus` (the band timeline's section visits carry it too).
Absent means one chorus that the band loops forever, which is the behavior every chart had
before; a before/after differential test against the frozen pre-#1472 compiler pins that.
D.C./D.S. jumps are taken afresh in every chorus. A `last-chorus` direction,
`{ kind: 'last-chorus', destination: { kind: 'coda', via, target } }`, is "To Coda, last
chorus": only the final chorus of a counted performance hops from `via` to `target` and plays
on to the end. Every other chorus, and every chorus of an uncounted chart, ends where `target`
begins, so the bars from there on are written outro material. Its arrival may share its
departure's barline (an outro written straight after the form). `via` is optional (#1487,
DECISION 2026-10-08): with none the coda is a tag, the direction sits on its `target` sign's
boundary, and the last chorus skips nothing: it plays the whole form and on into the coda. A
tag may itself be a repeat, but needs at least one bar of form before it. The compiler refuses, rather
than guesses, a last-chorus coda that is not on the same boundary as its `via` sign, a second
one in the chart, one whose departure the written route goes back behind (inside a repeated
passage, a first ending or a repeated section: which pass is the last time?), one whose arrival
is behind its departure, and, for now, any chart that also has a D.C./D.S. jump: the departure
is then passed both before and after the jump.
A counted chart plays an intro and an outro once (#1483, DECISION 2026-10-08): a section whose
label starts with "Intro" (`isIntroLabel`, the test the band's `leadRole` uses) is played in the
first chorus only, and one whose label starts with "Outro" (`isOutroLabel`) in the last only.
By place as well as label: the intro is the sections so labelled that open the chart and the
outro those that close it, so an "Intro" between two verses is an interlude and plays every
chorus. Only the bars are left out: the signs and jumps on their barlines are still read. If
leaving them out would empty a chorus, the chart is played as written. A section labelled
"Ending", "Tag" or "Coda" is not an outro by this rule; whether it should be is open. An uncounted chart
loops as written, intro included; whether it should is not decided. iReal Pro does the same
with its own intro mark: "IN" plays once and later passes return to "A"
(https://www.irealpro.com/learn/how-to-add-an-intro-to-a-song/). An imported iReal chart's
`i` mark becomes a section labelled "i", not "Intro" (#2004): the marked bars are often the
tune's head, and the label would rest the lead and play them once, so that is the musician's
call to make in Edit.

The band plays a counted chart once and stops (#1475): every chorus, the last-chorus coda on
the final one, then the transport returns to stopped at the end of the last bar, its notes
ringing out as they do at the end of an export. `.mid` and audio export render
the whole counted performance. The chart footer's form-length menu sets the count (#1511; the
Song menu's Choruses select was retired in #1756): Repeats continuously (the default, which
removes the field) or 1–16; a chart that already counts more keeps its number.

iReal coda signs with no D.C./D.S. text (#1476) import as a last-chorus coda, after iReal Pro's
own rule (https://irealpro.com/how-the-coda-symbol-works-in-ireal-pro/). Its worked example,
500 Miles High, has a coda sign in the form and the Coda section below it: "Set the player to
repeat 5 times and the main form repeats 5 times, then jumps to the Coda on the final pass";
"The player jumps to the Coda only on the last repeat". Only that shape is mapped: exactly two
coda signs and no other unpaired sign, the departure at the end of a bar and the target at the
start of a later one (the page's convention: 'put the "jump from" Coda symbol at the end of a
measure, and the "jump to" Coda symbol at the beginning of the first measure of the Coda
section'). The page's other form is mapped too (#1487): a chart may "mark only the Coda section
at the end, as in Alley Cat", and "with no jump symbol in the form, the repeats play in full
and the Coda is added once as a tag at the end". That lone sign at the start of a bar imports
as a last-chorus coda with no `via`, so no departure sign the chart didn't write is added to
it. The import sets no chorus count, so the chart loops without its coda until the
musician sets one, and a note says so. Everything else is refused with the message it had
before: a lone coda sign on the first bar or at the end of one, a segno or Fine with no jump,
more than two coda signs, and signs the score form
refuses. The score form refuses a departure the written route goes back behind, inside a
repeat or a first ending: which pass is the last time is ambiguous. Coda signs beside
navigation prose ("Original takes Coda every time") stay ignored signs with a note: the prose
says when the coda is taken. Across the Jazz 1460 playlist, 66 charts now import; 8 more with
the same pair were still refused, by their multi-chord bars in a meter the importer didn't
time yet (3/4, since shipped: see below); every other chart's import is unchanged. Of the playlist's 11 lone-sign charts
(#1487), 7 import (Blood Count, Desert Air, Happiness Is A Thing Called Joe, Ladies In
Mercedes, Lady Sings The Blues, Search For Peace, Unrequited); 3 are now refused by a
different blocker, named in their message, and Brazilian Suite by its unclosed repeat, with
the message it had before. Repeats replayed after a D.C./D.S. jump are
still refused: no primary source says whether iReal replays them.

Multi-chord bars in 3/4 (#1546). iReal draws every bar four cells wide, so in 3/4 a cell is
half a beat and a plain two-chord bar splits a beat and a half each, the change on the "and"
of 2. The reference converter says so but calls its own timing rule "unknown", so 3/4 waited
for an ear: Brandon heard iReal Pro play *502 Blues* that way (#1454, 2026-10-08). Only that
plain two-chord case was heard; the other 3/4 layouts follow the same half-beat cell. Across
the Jazz 1460 playlist 55 more charts import (1293 to 1348) and no chart that imported before
changes. 3/2 (same cell, never heard) and 6/8 (no multi-chord bar in the playlist) are still
refused.

D.C./D.S. al Nth ending (#1473), `destination: { kind: 'ending', pass }`, follows iReal Pro's
own definition (https://www.irealpro.com/learn/repeats-endings-and-jumps/): "D.C. al 2nd ending
returns to the top, skips the first ending, and takes the second", and it "needs a Fine to mark
where to stop". After the return, the one repeat with an ending N is played once (as its pass N),
straight into ending N, and the performance goes on to the first Fine on the way; the chorus
ends there. Like every jump it is taken afresh in each chorus. The compiler refuses, rather than
guesses: no repeat with ending N after the return point, or more than one; any other repeat in
the replayed passage (one around the return point, around or inside the taken repeat, before the
Fine, or a repeated section), since whether it replays after the jump is undocumented (#1476); a
Fine before ending N; another jump on the way; and no Fine before the route comes back to the
command. Unlike other jumps, the command may sit inside a final ending, as iReal charts write it
(a last ending runs to the section's end): only a command the form reaches more than once has
ambiguous timing. The iReal importer maps "D.C./D.S. al 1st/2nd/3rd End." (iReal's spelling)
and "... ending". Since "the jump only takes effect at that closing barline", the jump sits at
the closing barline of its text's bar, or of the next bar when that bar is bare (no sign,
rehearsal mark, staff text or meter change), as charts set the long text one bar early. It is
applied only as the chart's one jump, with one Fine between the return point and the jump, no
coda sign, and a route the score form accepts. Otherwise the text is imported exactly as before:
the inert annotation, with its note.

The current form grammar pairs repeat barlines within each section (an unmatched end repeat
starts at that section's beginning). An explicit start must close in the same section; repeated
regions cannot cross or share an ambiguous start. Nesting is capped at 16. Ending pass sets
must be disjoint and cover exactly the repeat's total passes, including non-monotonic sets
such as `1,3` / `2`. The first ending closes at the repeat-end. Later consecutive endings close
at an explicit ending-end, the next ending-start, or section end. A start-boundary ending-end
excludes its own measure from the prior ending. Whole-section repeats replay the complete
inner itinerary, resetting its pass counters. All source bars remain addressable on the stand.
Cross-section repeats and jump navigation are explicit future capabilities, not discarded data.
Inside an already open ending, a new repeat-start owns an ending-start on the same bar;
it is a nested form, not a sibling ending of the outer repeat. Close the outer ending
explicitly before that bar to make the next repeat independent. Inner endings claim their
closures before an enclosing first ending's optional close; the enclosing repeat-end already
closes that first ending. An ending closure cannot cut through an inner repeated passage.

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

Historical (deleted with the v1 codec in #1740): the pure `proposeLegacyScoreConversion` API
(`core/songbook/legacy-score.ts`) returned either a detached candidate or a blocked
report, always alongside the exact original JSON string. It does not persist anything or
certify audible equivalence. Since #1737 it converts everything the old parser
(`validateProgression`) read and played: each token as written when the chart vocabulary holds
it, else respelled with no tone changed (case, `()`, `,`, alteration order, an equivalent
spelling: a `respelled` note), else the longest written part the vocabulary holds or the chord
the old parser played (a `tones-dropped` note); `N.C.` as no chord and a bar of `%` as a
measure repeat. Each bar's chords sit at the old parser's rounded onsets, the last filling the
bar, unless that would leave it under half the others' length, when they spread evenly. Empty
bars and sections are dropped, as the old parser gave them no time. It retains section/band
settings and reports the detached preset association. What the old parser only guessed at
(no root or quality it knew), a sus with no spelling that keeps it, and a bar with more chords
than sixteenths block the song, with a reason per bar (song, section, bar as the sheet numbers
it, why); there was no partial candidate. `tests/unit/songbook/legacy-score.test.ts` was the
old-vs-new differential. For it the vocabulary gained `7#9b13`, `9b13` and `13b9#11`.

### Engine bridge and gates

*Historical: the plan for the first score bridge, written while the old engine, its worker and
the v1 path still ran. All three are gone (#1404, #1740); the band compiles the score itself
(`compileScoreForm`, `compileTimeline`).*

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

### Compatibility ledger (full compatibility remains a target)

| Feature | Current preview / next work | Proof still required |
| --- | --- | --- |
| Single-song modern export, simple 4/4 | Conservative decoder/import review implemented | Supplied Blues import/browser evidence; displayed-key interpretation remains explicit rather than guessed. |
| Generated open-protocol link | Separate decoder implemented | Synthetic protocol fixtures; current-app round trip still outstanding. |
| Whole-bar chords and previous-measure repeat | Context-checked native playback and import implemented | Source retention and exact engine maps; physical-device audition. |
| Unequal chord durations | Native editing/playback implemented; import only for verified cell patterns | Short real exports for 2+1+1 and 1+1+2; no guessed cell rounding. |
| Qualities and slash bass | Wider authored vocabulary; conservative existing-engine subset playable | Complete official vocabulary mapping and harmonic-identity fixtures; no partial matches. |
| Whole-section repeats | Native playback/display implemented; authoring remains limited | Distinguish section repetition, written repeat barlines and player chorus count; broader editor/import coverage. |
| Repeat barlines and first/second endings | Native compact display/edit/play and conservative import within sections | Real-device audition and cross-section repeat forms. |
| D.C./D.S., coda, Fine | Native global traversal, al-Nth-ending destinations, last-chorus codas and conservative unambiguous import implemented | Jumps inside repeats, repeats replayed after a jump, ambiguous import repeat policy and physical-device audition. |
| N.C., holds, alternate chords, fermatas | Authored events represented; playback pending | Per-lane meaning, editing and faithful import mapping. |
| Other rhythmic notation, rests and pushes | Inventory and represent without guessing equivalence | Current protocol/app fixtures and explicit lane semantics. |
| Meter/key changes | Native bar editing, sticky contexts and supported-meter playback tested; the song's own meter is set from the transport's Key popover (#1371, #1726, #1757), re-dividing equal-length bars and blocking — never rounding — on a bar whose written lengths cannot follow | Real-device and audible acceptance; source import mapping. A section's own key/meter is set from its letter in Edit (#1374, #1726). |
| Unsupported meters or off-grid timing | Block, explain location | Never substitute 4/4 or round durations. |
| Long charts | No fixed page limit | Synthetic 64/128-bar layouts and explicit input/expansion bounds. |
| Playlist HTML | Bounded supported-envelope selection/diagnostics implemented; a whole playlist (up to 2,000 songs, the account cap) imports as a collection named after it (#1478) | Additional real playlist envelopes; no silent first-song-only import. |
| Composer, title, style, tempo (#2004) | Style maps to a canon genre (`core/songbook/ireal-style.ts`; an unknown style keeps the current band, with a note) and the tempo is the export's when set (`0` is unset; outside 40-240 is ignored), else the style's default; both are shown and editable in the preview, and a playlist keeps each song's own unless one tempo is typed for all. Rehearsal marks become sections (`v` is Verse, the rest keep their letter) where no repeat, ending or two-bar repeat crosses them and the split performs the same bars in the same order; otherwise the mark stays a letter in its bar, with a preview note. New section boundaries bring the band's section fills and arrival crashes. Source retained | Transpose and player repetitions stay raw metadata: verify their meanings before applying them automatically. |

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

## Compatibility

There is one chart schema, 2. Every reader and writer uses `ChartDocumentV2`
(`core/songbook/document-v2.ts`), strict: an unknown field is refused, the old engine's band
and performance fields included (#1741).

- **Schema 1 is refused, with a plain message.** A v1 text chart arriving as a file or a
  `#chart=` link is not opened; the app says why in words (`isRetiredSchema`,
  `OLD_FORMAT_REFUSAL` in `web/lib/documents.ts`, `RETIRED_CHART_LINK` in
  `core/songbook/chart-link.ts`) and changes nothing. The API refuses a schema-1 Save body.
- **There is no converter.** The v1 codec, the text-to-score converter
  (`proposeLegacyScoreConversion`) and "Upgrade old songs" were deleted in #1740, once every
  device was upgraded and `/admin` showed no schema-1 chart.
- **One still sitting in a store is stepped over, never thrown on**, so it cannot crash the app
  or stop sync. `web/CLAUDE.md`'s "Retired text charts" row lists where.
- **Old v1 share links (`?s=`, `?prog=`) are not read at all (#1735).** The page opens as the
  songbook.
- A future schema change needs its own decision: a new version, its reader, and what happens to
  stored charts. Nothing here pre-approves one.
- **The bump rule (DECISION 2026-10-18, #1782).** Any change to the chart codec that an older
  build would reject — a new field, a new value, a wider range — bumps `schemaVersion`. There is
  no separate codec-version stamp. A tab still on the older build shares the account database
  with the newer one, and `schemaVersion` is the only thing it can tell a newer chart by: bumped,
  it reads the chart as `future-version` and leaves it alone (a queued Save is stepped over,
  `newerSchema` in `web/lib/sync/repository.ts`; a downloaded body is kept as a candidate). Not
  bumped, it reads the chart as `invalid`, retires the queue that holds it and drops the song's
  remote revision, so the newer tab shows the song as not uploaded with nothing queued.
  A bump cannot help the other direction: a *narrowing*, where a newer build refuses what an
  older one wrote (#1741's kind), leaves charts the newer build cannot read, and needs its own
  decision or a reader for the old shape.

### History: how schema 1 was retired

The rules this section used to hold (additive codec, keep v1 decoding, convert only a detached
copy, no boot-time rewrite, old shares on their compatibility route) governed the move from
schema 1 to 2. The decision below overrode them for one explicit action, and #1740 then removed
schema 1 altogether.

*Done and retired: #1740 deleted the card below, its converter and every v1 reader once every
device was upgraded and `/admin` showed no schema-1 chart. The decision is kept as the record.*

> **DECISION 2026-10-16 (#1738, Retire v1).** Supersedes "convert only a detached copy" and
> "no boot-time bulk rewrite" for ONE explicit action: the songbook home's **Upgrade old songs**
> card. Brandon is the only user, and the schema-1 readers and legacy band/performance fields can
> only be deleted once nothing stored uses them. There is still no startup or background rewrite.
>
> - **What counts.** A schema-1 chart; a chart whose stored content differs from what today's
>   writer stores (`writtenChart` + `withFollowFeel`: the legacy fields `/admin` counts, a missing
>   groove `genre`, an old built-in sound pin); a retained draft that is schema 1 or carries legacy
>   fields; and an old-format row that will not read. Never a collection. Both songbooks on the
>   device — the guest one always, the account one once its library has downloaded
>   (`needsUpgrade`, `draftNeedsUpgrade`, `planUpgrade` in `web/lib/upgrade.ts`). The
>   card stays on the home while ANY of that remains, so its absence means nothing old is stored
>   on this device.
> - **Backup first: one file, and exactly what the run changes.** A single human-readable JSON
>   archive of the songs and drafts the run will change and of the leftovers it cannot (below),
>   each as it is stored, with store, id and title (`upgradeBackup`). The run then touches ONLY
>   what that plan holds: each song is saved against its planned revision and each draft
>   rewritten only while it holds its planned bytes, so anything changed after the file was
>   written is left alone ("Changed since your backup — upgrade again"). Opening a song, or the
>   songbooks changing under the backup step, ends it. "Upgrade without a backup" plans at the
>   musician's confirm instead.
> - **In place, through the ordinary Save, same edit date.** Same id, a new revision, the song's
>   own `updatedAt` kept (an upgrade is not an edit; the songbook's order and the server body
>   keep it too): the guest repository's `save` and the account's Save, each with one
>   upgrade-only option (`keepUpdatedAt`, `upgrade`). The account Save queues an ordinary outbox
>   operation, so account songs reach the server by the normal drain. A text chart goes through
>   `proposeLegacyScoreConversion` (#1737); a refusal leaves the song exactly as it was and lists
>   its section, bar and reason with a way to open it in the text editor. A lossy conversion
>   (`tones-dropped`) is listed as "upgraded with changes", for songs and drafts alike.
> - **Never over unsaved work or a stuck queue — checked when writing.** A song with a live draft
>   or this tab's unsaved text is skipped. The account Save re-checks inside its own transaction
>   and refuses over a live draft, a conflicted or refused outbox head, an account version waiting
>   or a frozen delete; the guest Save re-checks the recovery slots just before writing. Each is
>   listed, never forced.
> - **The run never deletes anything.** A live draft is never rewritten (it is unsaved work, with
>   Open). A dead draft is rewritten in place (same writer, same `capturedAt`). The upgrade Save
>   does not sweep superseded draft rows as an ordinary Save does.
> - **Leftovers are the musician's to remove, one at a time, after a backup.** What the upgrade
>   cannot fix — a dead draft the converter refuses, an orphan draft, a draft of a song row that
>   will not read, an old row or draft that will not read (one a newer app wrote is not listed) —
>   is listed with "Remove — it's in your backup", offered only once a backup file holds that row
>   byte for byte ("Download these first" writes one after a run without a backup); a row with no
>   stored document has no bytes to hold and is never removable. Remove deletes exactly that row
>   and only while it still holds those bytes, in one transaction or check: a guest recovery slot,
>   an account draft row, an unreadable song row — never a live draft of a song that reads. It is a
>   LOCAL delete — never a tombstone, an outbox operation or a request — so an account song row the
>   server holds (a confirmed `remoteRevision`), with a Save queued, an account version waiting or
>   a delete frozen is never removed. A songbook that would not read is an error with "Try
>   again", never removable.
> - **Interrupt-safe and idempotent.** Each document is one transaction, so a closed tab leaves
>   every song wholly old or wholly new; the next run re-reads and finishes the rest. An upgraded
>   document is checked to need no upgrade itself, so a second run is a no-op.
>
> **Amended 2026-10-17 (#1741).** The gate held (every device upgraded, `/admin` at 0), so the
> legacy band/performance fields are gone from the codec: a chart carrying one is refused on the
> client and by the API. "What counts" is now a schema-1 chart or one that differs from
> `writtenChart` alone (`withFollowFeel` is deleted); a row still carrying a retired field no
> longer reads, so it is listed as a leftover, removable once backed up.

## Device acceptance and next stories

Four measures per normal laptop/tablet row; two per portrait phone row as the starting
layout. Whole measures never split. Dense measures may take a wider row; long charts
scroll instead of shrinking every symbol to fit a page. Text size and touch targets remain
usable at 1300x940, phone portrait/landscape and tablet sizes. Manual scrolling pauses
following; Resume following is explicit. Repeated passes retain a stable source measure ID.

Delivery slices after the accepted format decision:

*The slices as planned; slice 4 was overtaken by the Retire v1 milestone (#1740: one schema, no
converter).*

1. Exact-duration semantic codec + conservative source-preserving conversion proposals
   (implemented foundation); no automatic migration or audible-equivalence claim.
2. Shared map/engine adapter + measure editing, with Save/recovery/transpose and actual-audio
   tests (current playable checkpoint); separate worker-contract review and test-server audition.
3. Form compiler and full iReal chart import in fixture-backed stages, source retention
   and negative tests; no permanent notation/form exclusions.
4. Source-preserving migration and old/new-client coexistence, before production adoption.

Account/sync contracts can proceed once the document envelope/version policy is settled;
they need not wait for every import symbol. The document-format approval has been given;
production adoption, real-device acceptance and listening remain separate gates. This
foundation and its fixtures do not close #1171.

For new sessions, use [the v2 handoff](../../web/CLAUDE.md) and pick a bounded child,
not a cycle across this whole compatibility target. Source preservation and rejection tests
can be mechanical; unresolved N.C./break/hold/alternate playback meaning cannot. Record the
musical decision and exact fixtures before labeling such implementation ready. #1176 remains
the deferred repeat/ending authoring interaction decision, not a blocker for account work.
