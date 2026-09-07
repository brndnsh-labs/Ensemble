# Chords 3.0 — players and performances

Implementation and listening status live in [issue #1150](https://github.com/brndnsh-labs/Ensemble/issues/1150).

## Direction

Chords is the harmonic accompanist. Its instrumental identity should determine
voicing, rhythm, articulation, and sound together. The first two identities are a
keyboard player and a rhythm guitarist. Genre selects a coherent default profile;
the user may choose an alternative part or pin a different sound.

The intended model is:

```
chart harmonic facts + meter/form/band context
    → player and phrase plan
    → keyboard hands / guitar shapes and gestures
    → resolved attacks, releases, expression
    → audio, live MIDI, exported MIDI, visualization
```

The chart owns root, quality, explicit extensions/alterations, slash bass, and
duration. Each player derives its own voicing. `Chord.intervals` is still the
legacy comper's voicing and is not suitable as canonical harmonic truth. The
first migration boundary is `chordFacts`, which reads harmonic fields without
the old genre/density/intensity coloring.

Preserve a dependable accompaniment when enabled. Protect chord arrivals and a
profile's defining pulse; interest should come from voice leading, accents,
articulation, recognizable patterns, and bounded phrase development. Soloist-off
still leaves space for the human player. Harmony retains its supporting color
and sectional-answer role; coordination must not habitually erase either part.

## Acoustic pilot

The existing Acoustic piano arpeggio remains the default. Its chord settings
offer **Piano arpeggio** and **Acoustic guitar strum**. The new style uses the
existing `chords.style` field (`acoustic-strum`); it adds no persistent state or
share-URL schema. Genre selection continues to apply the existing genre style.

With Auto sound, guitar strum resolves to the existing Nylon Guitar pack when
installed. An absent pack uses the built-in synth while preserving the guitar's
authored rhythm and harmony. Pinned sounds remain user-owned. This is a nylon
sample audition, not a newly sampled steel-string instrument. Pack gain/tone
values remain the existing catalog values and require listening in this new seat.

`getGuitarNotes` bypasses the legacy keyboard comp emitter. It chooses a playable
shape and a stroke, then returns the same note representation that existing
consumers use, with additive `chordPerformance` metadata:

- String index (low E = 0), fret, stroke direction, and player identity.
- Explicit physical onset spread in `timingOffset`.
- An explicit gate in `durationSteps`, shortened by the individual string's
  onset spread so strings release at the intended gesture/chord boundary.
- `dry: false` and `muted: false`: no second export shortening or silent ghost
  interpretation. Existing silent CC carriers retain their old meaning.

The scheduler passes zero additional strum rank and ignores piano sustain for
authored guitar notes. MIDI export preserves their fractional gate instead of
rounding it to a step or imposing the legacy minimum duration. Existing shared
swing/humanization authorities remain in place. Audio envelopes may have a
release tail; the shared contract is intended onset and release, not identical
waveforms from different instruments.

The shape search uses standard tuning, contiguous groups of three to six
strings, a four-fret hand window, and at most four fretting fingers (including
a possible barre that cannot cross an open string). Candidates are inside the
existing chord register so later register enforcement cannot change a fingering.
The guitar style also bypasses source-dependent power-chord reduction: changing
sound must not erase a planned third or altered extension.

Selection prioritizes defining tones, bass support when needed, root coverage,
and then hand position and movement from the preceding chart chord. The bounded
candidate cache contains only content-derived shapes, not session memory; seek,
deep-merged worker updates, and detached exports cannot inherit another take's
guitar phrase state. Selecting a player uses the existing rebuild → sync → flush
controller sequence so the new choice reaches the buffered live performance.

The pilot has a regular pulse with lighter upper-string answers: quarter-note
downstrokes and selected eighth-note upstrokes in simple meter; grouping-based
downstrokes and last-eighth answers in compound/asymmetric meter. Every chord
arrival is articulated. All strings damp at the next gesture/change in this
first version; independently ringing unstruck strings is a later technique.

## Modern jazz piano pilot

The optional `modern-piano` style is offered in Jazz and Acoustic chord settings.
Auto sound chooses the installed Acoustic Grand Piano; a pinned source remains
user-owned. Existing genre defaults are unchanged. This is a restrained keyboard
part: a four-bar statement, displaced answer, return and settling bar, with
meter-native answer placement. Harmonic density changes voicings, not attack count.

`piano-voicings.ts` derives defining tones from `chordFacts`, adds only a small
optional color vocabulary, and enumerates three-to-five-key voicings with at most
an octave in either hand. A bass-free part includes the root and explicit slash
bass; bass-active extended chords can omit the root. Ranked hand movement,
common pitches and a more strongly weighted top line guide successive choices.

`piano-player.ts` prepares each phrase with four preceding chart chords, then
follows the actual prior planned voicing within that phrase. Its bounded caches
are keyed by harmonic content, density, register and bass participation, so a
deep-merged edit cannot leave an identity-keyed stale plan. The phrase position
uses the measure map and folded practice position. This is bounded chart-based
continuity; it does not maintain a hidden global performance history.

The left hand holds through a lighter right-hand answer. Authored note releases
stop before the next chord or bar; common-tone pitch retention across changes
does not yet imply a physically held key through the change. The player shares
the guitar's authored-performance transport seam, with piano hand/gesture
metadata, no added strum, and no inherited sustain-pedal reinterpretation.
Soloist activity softens the part and can reduce the answer to one right-hand
voice. Harmony participation softens the lower hand; neither creates a random
whole-part rest. Explicit arrangement mutes remain authoritative.

The first audition compares Modern jazz piano with existing Jazz comping over
`Dm7 | G7 | Cmaj7 | Cmaj7`, exposed and with backing. Supportive piano and Open
modal were proposed as next profile directions. Open modal now has a bounded
implementation below; Supportive piano remains a future direction. Neither
profile implies microphone listening.

Reproducible comparison scenes are
[existing Jazz comping](../../scripts/scenes/chords-3-jazz.json) and
[Modern jazz piano](../../scripts/scenes/chords-3-modern-piano.json). Both pin the
same grand piano, tempo, seed scene ID and chart, so their playing approaches can
be compared using `mix:report --scenes-from=...`.

The production-chart audit also corrected `7b5` parsing: a dominant flat-five
retains its major third, while `m7b5` remains half-diminished. The legacy rootless
voicing path now preserves that explicit flat fifth as well.

## Open modal piano

[Issue #1152](https://github.com/brndnsh-labs/Ensemble/issues/1152) adds optional
`open-modal` in the Jazz and Acoustic player picker. It shares the same literal
chord admission, playable hands, source selection and authored release contract
as Modern piano. Profile identity participates in the content-based voicing-plan
cache, so changing players cannot reuse the previous profile's plan.

Chord identity is a hard constraint; openness is only a ranking preference.
Required thirds/suspensions, sevenths and written alterations/extensions survive
every density. The existing small optional color vocabulary supplies an unaltered
ninth at Standard, and an eleventh over minor chords or a thirteenth over
major/dominant chords at Rich where
appropriate. The profile does not introduce substitutions, side-slipping or an
automatic sharp eleventh. Root and written slash-bass support return when Bass is
off. Density can exceed its nominal note count when the written chord needs it.

Among valid candidates, Open modal prefers a spread near an octave and a half,
space between low voices and up to two adjacent fourths. Mixed interval shapes
remain available for every chord, with the shared hand/top-line movement costs
still enforcing restraint. The register and per-hand reach do not expand.

Every bar and actual chord arrival receives a full statement. Bar two of each
four-bar phrase permits one lighter upper-hand answer on the last group boundary,
or the last beat when the bar has only one group (such as 3/4). Bar four settles.
The left hand supports the answer. Density adds keys rather
than attacks, and explicit arrangement mutes remain authoritative. The normal
Modern piano pattern remains unchanged.

The shared piano critique runs both profiles through all-key harmonic identity,
hand reach, meter, release, practice-loop, seek and detached-state contracts.
Open-specific checks cover the allowed color vocabulary, wider/fourth-bearing
voicings with a restrained top line, a less busy vamp and profile-cache switching.
Audible chord recognition and the balance against a human player still require
a TEST listening pass before merge.

[Open modal comparison scene](../../scripts/scenes/chords-3-open-modal.json)
uses the same chart, Grand Piano source, tempo and intensity as the Modern scene.

## Neo-Soul Rhodes pilot

[Issue #1163](https://github.com/brndnsh-labs/Ensemble/issues/1163) extends the
keyboard engine with optional **Neo-Soul Rhodes** (`neo-soul-rhodes`). Neo-Soul's
player chooser keeps **Neo-Soul comping** (`smart`) as its default. Existing saved
styles and pinned sounds retain their meaning. Auto selects installed Rhodes,
with the built-in synth as fallback; a restored Rhodes player keeps its identity
and source even outside Neo-Soul.

This profile shares Modern piano's literal chord facts, bounded hand reach and
movement scoring. It adds no new harmonic substitutions or suspension vocabulary.
A full statement marks every bar and written chord arrival. Bars one and three
of each four-bar phrase answer with at most two upper-hand keys; bars two and
four leave space, with the fourth bar settling. In simple meter the answer is on
the and of two; in eighth-note meters it is on the last eighth of the first
written group. Short bars omit an answer that cannot fit.

Right-hand statements last at most one and a half notated beats and answers
at most half a beat. The left hand supports through the chord or bar. All hands
re-strike at their authored attacks; retained pitches do not imply ties or a
pedal model. Release gates subtract the positive pocket delay, so notes end before the
chart boundary even when the next section moves closer to the beat. The profile takes the genre's existing band pocket once, sharing
the established swing and humanization authorities.

Density changes the full voicing, and intensity changes dynamics. Neither adds
attacks or expands the two-key answer. Muting Soloist leaves the same reserved
space for a human lead. Intro/outro and subtraction follow the established
arrangement rules, including final-cadence precedence; explicit lane and section
mutes still win.

Matched scenes compare [existing Neo-Soul comping](../../scripts/scenes/chords-3-neo-soul-existing.json)
with [Neo-Soul Rhodes](../../scripts/scenes/chords-3-neo-soul-rhodes.json), using the
same scene ID, chart, seed, 82 BPM and installed Rhodes. Render them into separate
output directories. Repeat with `voices[0].voice` set to `synth` for the fallback,
and at low, normal and high intensity. The normal renderer includes both exposed
chords and full-band stems, with and without its generated soloist.

The shared piano critique checks harmonic identity, playable hands, meter,
practice, seek and detached output. Profile-specific checks pin the proposed
phrase/articulation and measure actual generated events. Rendered audio and
these checks provide technical evidence; the exact TEST revision still needs a
human listening verdict for feel, balance and usefulness before merge.

## Staged migration

Existing keyboard styles remain on their established path. Their genre banks, rootless
voicings, anticipation, structural statements, ring-through, and coordination
are valuable reference behavior. This pilot does not claim to replace them.

Next architectural steps, after the first audition:

1. Plan coherent two/four-bar parts with explicit essential support and optional
   decoration, respecting chord boundaries, meter, section changes, and live
   invalidation. Extend actual-previous-shape continuity beyond the pilot's
   stateless preceding-chord reference.
2. Develop a keyboard realization with hand/upper-voice continuity, common-tone
   retention, pedal and re-strike decisions. Piano, Rhodes, organ and clav share
   mechanics but need distinct phrase and sustain policies.
3. Extend guitar techniques: independently ringing strings, alternating bass,
   fingerstyle, shorter chops, and palm-muted rhythm. Add suitable assets only
   after the gesture model establishes what is missing.
4. Migrate profile by profile behind the existing adapter. Preserve saved choices
   and choose any new defaults through matched listening comparisons.

Directions retained: Acoustic/Country rhythm guitar and deliberate piano;
Bossa nylon fingerstyle/piano; Jazz pianist; Neo-Soul/Hip Hop Rhodes;
Funk clav/clean guitar; Disco guitar/Rhodes; distinct Reggae/Ska organ and guitar;
Rock/Blues keyboard and rhythm-guitar bands; Metal dedicated muted rhythm guitar.
Rock piano and Acoustic piano/strings were prior user choices and remain defaults.

## Verification and audition

The [piano scene](../../scripts/scenes/chords-3-piano.json) and
[guitar scene](../../scripts/scenes/chords-3-guitar.json) render both installed
sample paths through the normal scheduler. They deliberately share a scene ID:
the renderer includes that ID in its musical seed. Separate output directories
keep the same-seed comparison from overwriting its own files.

```bash
npm run mix:report -- --scenes-from=scripts/scenes/chords-3-piano.json --seed=CHORDS_3 --loops=2 --write-wav=/tmp/chords3-audition/piano --write-events=/tmp/chords3-audition/piano
npm run mix:report -- --no-build --scenes-from=scripts/scenes/chords-3-guitar.json --seed=CHORDS_3 --loops=2 --write-wav=/tmp/chords3-audition/guitar --write-events=/tmp/chords3-audition/guitar
```

The guitar critique uses actual chart parsing and production tick generation.
It checks finite events, defining tones, bounded shapes, string-order strokes,
register preservation, repeated loops, seeking, rapid changes, and several
meters. The playback/export parity test checks the same authored note's audio
and MIDI timing. The Ska critique now includes chord duration and rejects
non-finite measurements before reporting staccato bounds.

For listening, choose Acoustic, `C | G | Am | F`, C major, 108 BPM. Install Nylon
Guitar and Acoustic Grand Piano in Settings → Packs; leave Chords sound on Auto.
Compare Playing style **Piano arpeggio** and **Acoustic guitar strum** at matched
perceived loudness, first exposed and then with the band. Repeat with bass and
soloist off, with Harmony enabled, with `Dm7 | G7 | Cmaj7 | C/E`, and in 3/4 and
6/8. Confirm the part supports practice, has a clear instrumental identity,
keeps chord arrivals dependable, and does not ring across unrelated harmony.

Human listening on the exact TEST build is required before merge. A statistical
critique or rendered-audio check cannot approve the guitar's feel or mix seat.
