# Gate 4: three different bands?

Jazz and funk are now style packs beside the blues: each has its own drummer, bassist, chord player and soloist, written as data. Nobody but you can hear these, so this report says what was built, what was measured, and what to listen for. Nothing here claims it sounds good.

Written 2026-11-15. Rewrite the files with `pnpm gate:4`.

## The two questions

1. **Are these three different bands?** Same chart, same seed, three styles: is each one its own band, or the blues band in a different hat?
2. **Did the blues get worse?** On paper it cannot have: every gate 3 file regenerates byte for byte, and the five blues files here are gate 3's. Section 4 is there if you want to hear it beside the new bands.

## How to audition

Open the `.mid` files in Logic as before. Tracks: Drums (channel 10), Bass, Chords, Solo.

| | Blues | Jazz | Funk |
|---|---|---|---|
| Bass | acoustic bass (program 32) | acoustic bass (32) | electric bass, finger (33) |
| Chords | piano (0) | piano (0) | clean electric guitar (27) |
| Solo | vibraphone (11) | alto sax (65) | alto sax (65) |
| Default tempo | 100 | 138 | 105 |

Every file has a recipe beside it (`.json`); `pnpm -s ensemble replay out/gate-4/<name>.json --out again.mid` writes the same file.

## The files

Start with section 1. The rest is there to check a band on its own tunes.

| Files | What they are |
|---|---|
| `1-same-12-bar-a-as-blues`, `-as-jazz`, `-as-funk` | **The main comparison.** A 12-bar blues in A at 100, five times through with a solo, seed 1, played by each band. The blues one is gate 3's `seed-001`. |
| `1-same-jazz-blues-f-as-…` | A jazz blues in F (two chords a bar in places), each band at its own tempo: 100, 138, 105. Seed 2. |
| `1-same-two-chord-dm-as-…` | A two-chord vamp in D minor at 100 with no soloist: the three rhythm sections alone. Seed 3. |
| `2-jazz-rhythm-changes-bb-seed-1`, `-2`, `-3` | Jazz on a 32-bar AABA at 176: the head in two, the bridge walking, then the solo. Three seeds. |
| `2-jazz-two-five-one-c`, `-minor-two-five-cm`, `-falling-fifths-gm`, `-modal-dm` | Other jazz tunes, 120 to 138. |
| `2-jazz-ballad-eb`, `2-jazz-waltz-f` | A ballad at 66 and a waltz at 150: the two edges, both with known limits (below). |
| `2-jazz-rhythm-changes-bb-no-solo`, `-vibes` | The rhythm section alone; the same tune with a vibraphone, which does not have to breathe. |
| `3-funk-vamp-a-seed-1`, `-2`, `-3` | Funk on a four-bar vamp in A at 108. Three seeds. |
| `3-funk-one-chord-e`, `-two-chord-dm`, `-minor-am`, `-verse-bridge-e` | Other funk tunes: one chord, two chords, a 16-bar minor form, verse-chorus-bridge. |
| `3-funk-intro-outro-c-song` | A chart played once as a song, with its intro and written ending. |
| `3-funk-vamp-a-no-solo`, `-timed-4min` | The rhythm section alone; a four-minute jam with two solos. |
| `4-blues-…` | Gate 3's `seed-002`, `seed-004`, slow blues, minor blues and the four-minute jam, unchanged. |

**About the seeds.** The files use different seeds on purpose. At one seed, every chart whose section is called `[A]` gets the same beat, bass riff and strum, so funk files that all used seed 1 would have been one groove on six tunes. The seeds were picked to differ, not by ear or by score. The cause is in "The groove and the seed" below.

## What to listen for

### Across the three

- **Is each seat a different player?** On paper the drummers, bassists and soloists share nothing but the engine, and the funk guitar is its own instrument. The jazz piano and the blues piano play the same pitches on the same chord 80% of the time (the blues piano has been rootless since gate 2); they differ in rhythm, length and a step of register. You have said that is normal, jazz harmony leaning on the blues as it does, so it is here as a fact, not a question.
- **Does jazz swing and funk not?** Jazz is swung eighths, lighter than the blues shuffle, with nothing on a sixteenth in any seat. Funk is straight sixteenths.

### Jazz

- **The head.** The first chorus is played a level down: bass in two, the swing pattern on the closed hat, no bass drum. The bridge opens up (walking, ride) and the last A drops back. From the second chorus the band is on the ride and walking. Does that read as "stating the tune, then blowing"?
- **The walk.** A note on every beat, into each new chord by a half step (about half the time), a whole step, a fourth or a fifth. Does it sound like a line, or like scales?
- **The piano's comping.** Short stabs with about one chord in six held. It can leave a bar empty. Under the alto it should push into some changes and answer the breaths. Mannerism, or comping?
- **Drums and piano into a change.** The drummer's kick on the "and" of 4 and the piano's push onto the new chord are separate decisions on the same grid: when both happen they are exactly together, and otherwise one plays alone. The piano's push has the snare with it half the time. Left as it is (you said they need not line up all the time); worth a mention only if going into a change ever sounds like two people guessing.
- **The piano against the alto.** In a solo's first chorus the alto plays low, in the piano's register, and the piano's top note is above it on about two thirds of its notes. Left as it is: the low first chorus is what the solo builds from. Overall the piano is on the soloist's own note 18% of the time (target 15%).
- **The solo.** Eighth-note lines on the chord's scale with chromatic passing tones that resolve by half step. A phrase repeats the rhythm of the one before it 35% of the time. Does it develop, or loop? `2-jazz-ballad-eb` is the worst case for this.
- **The ballad** (66): the piano is about two strikes a bar and the bass walks in four once the band opens up, where a player would stay in two. Too busy underneath, too thin on top, or fine?
- **The waltz**: the piano is one held chord a bar throughout, under the soloist too. The comping vocabulary is written in 4/4 only. You have accepted this for now; a waltz comp written from what the great compers play in three is on the list for later.
- **The modal tune**: on a chord that lasts 16 bars the piano keeps one voicing. Static?

### Funk

- **The guitar's scratches.** A deadened stroke is the chord's own notes played very short and quiet on a clean guitar patch. Does it read as a "chick", or as a quiet chord? If the second, they can go on their own track with a muted-guitar patch.
- **The bass register.** In E the riff sits on E2 with octave pops to E3. You said after gate 3 that the blues bass was an octave high, so listen to `3-funk-one-chord-e` first. Moving it down puts E on the open string and costs a drop of a seventh between D and E chords.
- **Dead notes on the bass**: through a General MIDI bass these are a very short, quiet note on the root. A thump, or a blip?
- **The kick and the bass.** There is a bass note (or a dead note) under every bass-drum hit, and the bass drum is on the One of every bar. Locked, or stiff?
- **The two-bar beat.** Every second bar turns its back half around. On a one-chord vamp the guitar varies only by one extra flick at the end of each phrase. Hypnotic, or stuck?
- **The quiet level**: the guitar plays dry stabs with no scratches. Right for a breakdown?
- **Minor chords** on the guitar are b3, 5, b7 with no 9th (a written m9 gets its 9th).
- **The solo** is built from short riffs said again, with repeated notes. By design it repeats far more than the blues or jazz soloist. Riffing, or stuck on one idea?
- **The alto and the guitar.** In its first chorus the alto plays around E4, inside the guitar's chords (it is on one of the guitar's own notes about a quarter of the time). A funk horn usually sits above the rhythm guitar. Crowded?
- **The guitar leaning into a change.** One time in ten (one in five when hot) the guitar plays the next chord on the "and" of 4. The bass does not go with it: it is still on the old chord or playing its own lead-in, and in about a third of those pushes it is a half step off one of the guitar's notes for an eighth. `3-funk-minor-am` going from E7#9 to Am7 is where to hear it. A rub, or just a push?
- **Where the ending lands.** The final hit replaces the last bar of the chorus, so the turnaround written there (the D9 E9 bar of the vamp in A) is not played the last time. A funk band might play the turnaround and hit the One after it. This is the blues ending's rule, shared.
- **The bass's octave pop** comes down an octave in the bar before a change to a low root, so it never leaps more than an octave to the next One. Smooth, or does the riff lose its top?

## What the checks say

- `pnpm check` passes: all three styles are held to every property, 78 in all, in about 9 s of the 10 s limit. `pnpm test:full` (six seeds a property instead of two) passes in 19 s.
- `pnpm score` matches its accepted baselines for all three styles (200 takes each).
- Golden takes: three blues (unchanged), two funk, two jazz.
- The blues: goldens identical, scorecard no movement, every `out/gate-3` file byte for byte what you passed.
- Each seat was built from its own brief by a separate agent; I read every diff and the printed parts, wrote tests from each builder's claims, and broke each rule on purpose to see the test catch it. Then a fresh reviewer read each band as a band, all four seats together. Its findings are in `DECISIONS.md`; the ones I did not fix are the listening questions above.

**Where each band misses its own targets** (share of takes inside the target band, for measures under 90%):

| Style | Measure | In target |
|---|---|---|
| Jazz | piano on the soloist's note (target at most 15%; mean 18%) | 35% |
| Jazz | phrase ends that get the drummer's shot (46 to 67%; mean 60%; a take has only 10 to 15 phrase ends) | 41% |
| Jazz | bottom of the piano's hand (58 to 64; mean 58.9) | 68% |
| Jazz | held chords (5 to 40% of strikes; mean 17%) | 85% |
| Jazz | solos that build | 87% |
| Funk | guitar close above the bass | 79% |
| Funk | repeated notes in the solo | 87% |
| Blues | unchanged from gate 3 | |

## Engine changes in this stage, and why each was a missing concept

The rule is that a style is data: if a style needs an engine change, the engine was missing a concept. No engine code names a style (the reviewer searched for it). Each change below is used through data, and the blues either does not use it or carries the old value and plays what it played.

**The planner**

| Change | Why it is a concept, not a style case |
|---|---|
| A short vamp is a chorus of several laps | A one- or two-bar vamp had three special cases in the planner. Now a pass of a vamp is a section of 2 to 16 laps, and fills, solos and phrases work with no special case. |
| The head is an offset in the arc (`ArcStyle.head`) | "The first time through the tune is played lighter" is true of any style that states a tune. Zero for the blues. No player tests for "the head"; the change of part at a tier line is what the tiers are for. |
| A bridge is a bridge whatever it is called | The notes' rule for which section is the bridge (the B of AABA). Before, only the word "Bridge" counted. |
| The bar before a step up plays the tier it is going to (`stepsUpEarly`) | The bass sets up a louder section across the barline in any style. |

**Drums**

| Change | Why |
|---|---|
| A layer can take a stroke away | Layers could only add. A variation that drops a note is as common as one that adds one. |
| Conditions on the phrase's last bar, on a fill, and on the harmony | The drummer reads the chart as the pianist does: he plays first and cannot hear him. |
| A turn must be heard (`audible`) | If the drawn variation would change nothing in the bar, the next one that would is played. True of any style with answer bars. |
| A fill vocabulary per tier; fills played under the time (`keepTime`, `handOff`) | A quiet passage stays off the toms; a cymbal can keep going through a fill. |
| The drummer's button | The band's short last hit was played by every seat but the drums. |

**Bass**

| Change | Why |
|---|---|
| A walked line (`BassLine.walked`) | A line made a note at a time toward a chosen approach. Ska and a country walk-up are this with other weights. |
| A figure that names its own tones; a named draw shared by tiers | A riff is a rhythm that belongs to its notes; a section's quiet part is its loud part thinned. |
| A dead note | A percussive stroke with no pitch to speak of, as a guitar's scratch is. |
| Following the kick | A root wherever the bass drum falls and the figure is silent. |
| A turn at a phrase end; length as a share of the gap to the next note; a level for notes off the beat; tones under the root; lead-ins only on notes the figure already has; coming down through the octave | Each is a setting the blues line had fixed in code. |

**Chords**

| Change | Why |
|---|---|
| A second instrument (`Idiom`: keys, or a guitar) | A chord is found on a fretboard: one note a string, inside a four-fret hand. Strings, where the hand sits and the strum are data; the builder wrote a rock guitar and a reggae skank as data over it and both played. |
| A deadened stroke; a deliberate downstroke; a plain rhythm on every pulse | What a strummed instrument does that a piano does not. |
| A groove that ties over a change; a figure's own turn at a phrase end | A third way to meet a change (the piano rests, the boogie pump strikes again, a groove ties); a groove answers with itself. |
| An instrument can hold its voicing while the chord stays, and place the same notes where the hand is | A guitarist keeps a grip; a pianist re-voices. |
| A figure can be a bar of rest | Any comper may lay out for a bar. A chord that changes in that bar is still struck. |
| A held chord pushed into a change stays held (`Anticipation.held`) | Without it a held chord became a stab when it anticipated. Off for the blues, where turning it on changes what you passed. |
| Two faults in the answering stab | It could land on the soloist's next entrance (one in nine did), and could never answer a breath over an empty bar. Rules of the stab, found because jazz exercises it. |

**Soloist**

| Change | Why |
|---|---|
| The book: which ways of making a phrase are offered, and when | These were four `if` branches that said "blues" without saying so. |
| Forms by length; a contrast and a return (`c`, `b`); a statement set apart and lifted | A 32-bar chorus is not a 12-bar one; a bridge is a contrast set beside the idea. |
| The peak and the wind-down as data; what a move costs the line; how a landing is ranked; how alike is alike | Constants that were tuned for the blues by ear. |
| Habits: a tie over the barline, a stabbed note, a riff as a sequence or note for note, a pickup ending a half step under | Things a soloist does or does not do in a style. |
| An idea can be outgrown by being thin | A riff from a sparse first chorus is too thin to carry a busy last one. |
| A tone from outside the chord's scale goes somewhere | A chromatic passing tone must be off the beat with its resolution straight after. Only a style that adds passing tones has any. |

**The critic**

| Change | Why |
|---|---|
| A measure of one way of playing is reported only where a style targets it (`idiom`) | "The backbeat" read off a jazz take says 0% and means nothing. |
| New features and measures for each of the above | So each new concept can be weighed and reported. |

Two fixes changed what the blues *style* plays on *other styles' charts* (none in the blues library, none in anything you have heard): an ending note struck too late to leave a breath in 3/4, and a one-phrase solo that stopped on its top note.

## The groove and the seed

**The groove follows the seed and the section's name, not the tune.** A choice a section keeps (its beat, its bass figure, its strum, the piano's figure) is drawn from the seed and the section's label. So at seed 1, every chart with a section called `[A]` gets the same choices, in every style. It matters most in funk, where the groove is most of the tune, and there the pool is small: three kick patterns, about six riffs and four strums at the working level.

This report first recommended making the draw depend on the chart as well. That change was withdrawn after the gate, before any code (see `DECISIONS.md`, "gate 4 passed; and the groove does not follow the chart after all"). Two tunes share a groove only when played at one seed, which only the gate script did; the app will draw a fresh seed for each jam. Tying the draw to the chart's content would make one edited chord change the whole tune's groove, and would turn every saved take into a different one. What stays open is the small funk vocabulary, which is style data to widen later.

## Tests added this stage

Sixteen, one line each. Strike any that do not earn their place.

1. A short vamp is played in choruses of several laps.
2. A bridge is a bridge whatever it is called.
3. A button ending is the whole band's: the drummer plays the short last hit too.
4. Jazz: the whole band plays swung eighths only.
5. Jazz: once the band has opened up the ride is on every beat, the hat foot on 2 and 4, the snare off 1, 2 and 4.
6. Jazz: the head is played a level down, on the closed hat with no bass drum, all but its bridge.
7. Jazz: once the band has opened up the bass walks, a note a beat, never the same note twice, into a change by a half step, whole step, fourth or fifth.
8. Jazz: the piano is one hand, at most four notes inside an octave, and leaves the root to the bass.
9. Jazz: a solo note from outside the chord's scale is off the beat and resolves by half step straight away.
10. Funk: the kick is on the One and off 2 and 4, the snare on 2 and 4, nobody near the toms or the ride.
11. Funk: the beat is two bars long.
12. Funk: the bass is on the One and under every kick, on the sixteenths, with short notes.
13. Funk: the bass riff is the section's.
14. A guitar's chords can be held: one note a string, inside a four-fret hand.
15. A guitarist holds a grip until the chord changes.
16. The strumming hand is a pendulum: down on the beat's halves, up between them.

## Known and left

- **Jazz:** the last chorus (the head out) is not played light again; a level you set by hand still holds on every pass; the comping has no notion of tempo; three slow-waltz takes in about 1,250 run nine seconds on one alto breath.
- **Funk:** the chord seat is a guitar only (a clavinet is data for later). Played as a song, a vamp chart is one lap of the vamp, as the chart format says: three of the six funk charts are too short to audition that way.
- **The alto** can reach Bb5, a step over a real alto's top (30 notes of 6,594 in funk solos were above Ab5). Shared instrument data; changing it would change the gate 3 alto takes.
- **Both:** an arrival crash opens every section, the eight-bar sections of a jazz head included (the old band's rule).
