# Ensemble v2: a home for your music

Status: product direction approved in conversation, 2026-09-07. Framework and deployment
choices remain subject to a working prototype and measured evidence. This document describes
intent; GitHub milestones/issues own delivery status. The earlier Songbook milestone (#12)
retains the completed foundation and codec work (#1029, #1044).

## Product promise

Ensemble supplies the musicians you are missing so you can play. It remains a dependable
practice reference with faithful, bounded genre coverage. A visitor can start a jam without an
account. A returning musician can keep a repertoire and the band setups that make it useful.

Primary use: solo practice with accompaniment. Songwriting and teacher-to-student examples
extend the same chart-and-band interaction. Classroom management, collaborative editing,
payments, a public community catalog, and a visualizer redesign are outside the first release.

## Agreed journeys

1. **Quick jam:** choose a blues/preset, vary key/genre/tempo, mute the part you play, start.
2. **Keep a song:** enter a chart such as Minor Swing, customize the band, explicitly Save.
3. **Return:** reopen the latest device-local experiment, visibly unsaved, with Revert to saved.
   Keep one evolving setup; Save a copy creates a separate song when an experiment earns it.
4. **Another device:** optional passkey account; explicit saves upload, including a frozen
   queued snapshot when offline. Later unsaved edits never enter that queued snapshot.
   Automatically download the whole cloud library and required sounds for offline use.
5. **Teach:** share a stable snapshot, playable without an account. Keeping it makes an
   independent copy. Subsequent author edits do not alter the snapshot. Existing links survive.
6. **Write/import:** retain efficient text entry, add chart-based editing and guided chord
   choices, preview imports and explain unsupported musical semantics. Chord discovery is a
   planned extension, not a first-checkpoint requirement.
7. **Operate:** registrations, meaningful return use, bounded error reports, and suggestions.
   Background synchronization is not meaningful return use. Private chart contents stay out
   of analytics. Adapt Songs I Know's proven patterns, not its payments or P2P audio transfer.

## Interface direction

The approved HTML study is in Brandon's Downloads/ensemble-v2 folder. It is a visual reference,
not a production file format or runtime. Home exposes quick jam, recent songs, songbook and
new/import. The chart is a music stand during playback. Tempo, genre, instrument mutes and
transport are primary controls; key is one obvious action away. Loop/start belongs at the
relevant section. Detailed band, sound, practice and device controls get deliberate homes.

Test laptop at approximately 1300x940, phone portrait/landscape, and tablet. Preserve whole
measures and readable chord symbols. Compare two versus four bars per phone row and scrolling
versus pagination. Following must respect manual browsing and resume explicitly. Editing should
retain the chart's spatial structure. Keyboard, touch, contrast, reduced motion and audible
error/recovery behavior are acceptance criteria, not a final polish phase.

The September 8 follow-up makes the music-stand view part of the preview now: remove duplicate
branding/metadata above an open chart, put sound details in a dialog, and hide editing/save
controls during playback with a reversible Show controls action. An explicit install-all action
downloads the existing catalog and applies established genre defaults to the current draft.
Follow feel and manual overrides belong to the saved setup; installation never rewrites other
saved songs. This is not a new sound-design or whole-library migration project.

This approved v2 direction supersedes VISION's absolute no-accounts/no-backend language and the
old no-navigation premise for this preview. It does not change the production app until an
explicitly reviewed rollout. The existing conductor project and reserved gestures are separate.

## Boundaries and sequence

Keep the musical generators and worker contracts. Isolate browser startup and UI subscription
from the framework. Next.js/React is the leading application-shell candidate because accounts,
administration and server conventions can reuse Songs I Know patterns. Validate worker bundles,
actual audio, navigation, offline cold startup and data safety before choosing it permanently.
Test hosting initially uses static export under /v2/ beside the current app; this is not evidence
that accounts are implemented or that the eventual service needs no server. Docker is a separate
packaging decision, to be measured against the current deployment loop.

Checkpoint 1: written brief, working Next browser-engine/local-songbook preview and test-server
verification. Accounts, cloud storage and iReal import are unavailable; portable Ensemble JSON
file import/export is included. Tracked in milestone 15 and #1170; chart/import design is #1171,
and account/sync/hosting contracts are #1172.
The #1174 follow-on connects existing sound packs, explicit install-all, Follow feel/manual pins,
offline verification and focused playback. Whole-library cloud sync remains later work.
The #1175 usability slice makes typed chords part of Save/copy/export, preserves section buffers,
reveals editing on compact screens, and separates tempo typing and last-opened preference from
document commits. Update chart is an optional preview; unsupported text is retained for correction.
Unchecked text is tab-only, with an unload warning, rather than a new durable recovery format.
Checkpoint 2: settle explicit rhythmic chart representation and bounded import compatibility.
Checkpoint 3: account, sync, shared snapshot and admin services; migration/restore/conflict proof.
Production cutover follows real-device review and compatibility gates, not mockup approval.

## Storage contract updates

The canonical ChartDocument and ownership codecs remain the portable boundary. The older
songbook.md autosave policy is superseded for v2: draft recovery is automatic; Save explicitly
commits a song version. A tab/device's unsaved experiment never silently changes a saved version.
Writes compare revisions atomically. A conflict preserves both versions, including unsaved work.
Errors, unknown versions, quota failures and offline readiness must be explicit, not empty data.

The prototype uses an isolated IndexedDB database and writer-scoped recovery keys. It must not
read/write legacy currentState or overwrite saved progression presets. Production migration is a
separate story preserving the source records and allowing rollback. Local-only preview files are
portable, validated ChartDocuments, not evidence of cloud sync.

## Chart/import design target

Current section text is separated by barlines and divides each bar equally among chord tokens.
It cannot naturally express C for two beats, Dm for one and G7 for one. Parsing also performs
voicing work. Introduce a semantic representation of measures, explicit chord durations and
musical directions, separated from page geometry and generated voicings. Retain a defined
text round trip; do not let graphical and text representations become competing authorities.

First import support must be fixture-backed against real current iReal exports, distinguishing
irealb exports from the documented irealbook generation protocol. Preview before keeping,
preserve source, and refuse musical transformations that silently change timing/form. Repeats,
endings/jumps, N.C., unsupported meters, alternate chords and composer/style metadata need
explicit dispositions. These are decisions to test with a chart corpus, not guessed support.

## Still to decide before production

- Precise import and rhythmic/form compatibility, including how text expresses explicit lengths.
- Account recovery, account switching/sign-out cache policy and cloud deletion semantics.
- Conflict-resolution UX and crash-safe outbox/idempotency protocol.
- Offline sound installation, browser eviction/recovery and shared-device privacy.
- OS audio interruption behavior, safe service-worker upgrades and migration coexistence.
- Measured framework/build/deploy costs; final API/database/container topology.
