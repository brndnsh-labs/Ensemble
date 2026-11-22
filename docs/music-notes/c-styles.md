# MUSIC_NOTES, part C: the styles

What each genre's definition in the old band says, written so it can be transcribed into style data. Parts A, B and D cover the general mechanisms; where a style leans on one, it is described here only as far as the musical result.

## How to read the grids

- **Grid.** Every pattern is one 4/4 bar of sixteen sixteenth-note steps unless marked otherwise. Counting: `1 e & a 2 e & a 3 e & a 4 e & a` are steps 0 to 15. One step is 120 ticks at 480 ticks per quarter note. Players write on this straight grid; swing and lean are applied afterwards.
- **Drum letters.** `X` accent (velocity 118), `x` normal (96), `o` soft (72), `g` ghost (36), `.` rest. A snare stroke written under 50 is played as a ghost-note articulation.
- **Strum letters (guitar).** `x` strum (downstroke 86, upstroke 72), `X` accented strum (100), `-` muted scratch (downstroke 50, upstroke 36), `.` the hand passes without touching. Stroke direction is never chosen: it follows a pendulum on the stated grid (eighth pendulum: down on beats, up on "and"s; sixteenth pendulum: down on beats and "and"s, up on "e"s and "a"s). An upstroke sounds only the top three strings of the grip.
- **Lead rhythm cells.** `x` an attack, `-` the note held, `.` silence.
- **Velocities** are as written, before two later adjustments that apply everywhere: the energy scale (velocity times 0.72 + 0.4 x energy, energy 0 to 1) and the humanize jitter (up to plus or minus 10 at humanize 100).
- **Energy tiers.** Low is energy under 0.42, mid is 0.42 to under 0.70, high is 0.70 and up. Nearly every style keeps three versions of each part, one per tier.
- **Swing amount** is 0 to 100. The off-beat of a swung pair lands at 50% + (swing / 6)% of the pair: 0 is straight (50%), 60 is 60%, 100 is a true triplet (66.7%). "Swung eighths" bends each beat; "swung sixteenths" bends each half-beat.
- **Lean** is a constant per instrument in milliseconds against the drums, who never lean. Positive is behind the beat, negative ahead.
- **Humanize** is 0 to 100: the largest seeded placement offset is plus or minus 9 ms at 100, and it repeats at the same place in every bar (a settled pocket, not noise).
- **Weights.** Where a list of patterns carries numbers like "(3)", "(2)", "(1)", they are relative weights of a seeded draw. "Per section" means the draw is made once and held for every bar of that section; "per song" means once for the whole performance.
- **MIDI note numbers**: 60 is middle C (C4); 28 is the bass's open low E (E1).

## Styles: overview

The old band has thirteen styles. None carries a tempo of its own and nothing in any style adapts to tempo; the tempo column below is assembled from the stock song catalog, the import table for named feels, the loudness reference scenes and remarks in the styles. Treat it as (unclear) throughout.

| Style | Tempo (BPM), where stated | Feel | Nearest of the eight | Identity in one line |
| :-- | :-- | :-- | :-- | :-- |
| Blues | 66 to 140, default 100 | Swing 100 on eighths (hard triplet); band behind the beat | blues | Shuffle: kick on 1 and 3, loping hat, boogie-box bass, piano chops or pumps |
| Jazz | 66 to 240, default about 135 | Swing 60 on eighths; bass ahead, piano and horn behind | jazz | Ride and walking bass; head played lightly in two on the hi-hat, solos opened up |
| Funk | 95 to 120, default about 105 | Swing 15 on sixteenths; bass and comp ahead | funk | Syncopated kick off the backbeat, one-bar bass riff on the kick, clipped stabs |
| Rock | 85 to 140, default 120 | Straight eighths; comp a hair behind | rock | Backbeat, eighth-note roots, triads, tom fills, everyone hits the last chord |
| Disco | default 120 | Straight sixteenths, machine-tight; bass a hair ahead | disco | Four on the floor, open hat on every "and", octave pump, sixteenth chuck |
| Neo-Soul | 77 to 91, default 85 | Swing 45 on sixteenths; bass 32 ms and keys 25 ms behind | neo-soul | A soft two-bar drum loop with the band far behind it; held Rhodes chords in fourths |
| Reggae | 60 to 90 (slow count), default 76 | Swing 20 on sixteenths; band behind | reggae | One drop on beat 3, empty One, skank on 2 and 4, deep bass with holes |
| Acoustic | 90 to 100 | Swing 15 on eighths (a lilt); band on the beat | acoustic | Fingerpicked when quiet, open-chord strum when loud, root-fifth bass, brushes or cross-stick |
| Country | 100 to 110 | Dead straight; on the beat | acoustic | Boom-chick two-step turning into a train beat; walk-ups; a 6-to-5 stinger at the end |
| Bossa | 130 to 160 | Straight; bass and comp slightly ahead | jazz | Two-bar cross-stick clave, surdo kick, nylon figure that anticipates every bar |
| Hip Hop | default 90 | Swing 25 on sixteenths; sample 12 ms behind | neo-soul | One two-bar boom-bap loop for the whole song; fills are drop-outs |
| Metal | 140 to 160 | Straight, nobody leans, humanize 10 | rock | Guitar, bass and kick play one riff; half time when quiet, double kick when loud |
| Ska-Punk | 150 to 200 (fast count) | Straight; comp and horn ahead | reggae (verses), rock (choruses) | Ska verses and punk choruses, the whole band changing gear at the section line |

Feel values side by side (lean in ms, positive is behind):

| Style | Swing | Swung unit | Bass | Keys | Guitar comp | Lead | Humanize |
| :-- | --: | :-- | --: | --: | --: | --: | --: |
| Blues | 100 | eighths | +2 | +6 | +2 | +8 | 35 |
| Jazz | 60 | eighths | -2 | +8 | -2 | +10 | 40 |
| Funk | 15 | sixteenths | -5 | -3 | -3 | 0 | 25 |
| Rock | 0 | (eighths) | 0 | +3 | +3 | +4 | 35 |
| Disco | 0 | (sixteenths) | -2 | 0 | 0 | +4 | 15 |
| Neo-Soul | 45 | sixteenths | +32 | +25 | +25 | +25 | 60 |
| Reggae | 20 | sixteenths | +8 | +5 | +5 | +12 | 30 |
| Acoustic | 15 | eighths | +5 | 0 | 0 | 0 | 30 |
| Country | 0 | (eighths) | 0 | +3 | 0 | 0 | 25 |
| Bossa | 0 | (sixteenths) | -3 | -3 | -3 | +5 | 30 |
| Hip Hop | 25 | sixteenths | +4 | +12 | +12 | +12 | 20 |
| Metal | 0 | (sixteenths) | 0 | 0 | 0 | 0 | 10 |
| Ska-Punk | 0 | (eighths) | 0 | -4 | -4 | -4 | 20 |

Endings side by side:

| Style | Final chord (major / minor / dominant tonic) | Gesture | Set-up fill | Drums on the last bar | Bass weight |
| :-- | :-- | :-- | :-- | :-- | --: |
| Blues | 9 / m9 / 9 | hold | yes | crash and kick on 1 | 100 |
| Jazz | 6 / m6 / 6 | button on the "and" of 4 | no | ride and kick on 1; snare and kick on the "and" of 4 | 96 |
| Funk | 6/9 / m9 / 9 | stop (an eighth) | yes | kick, snare, closed hat on 1; no cymbal | 108 |
| Rock | triad / minor triad | hold | yes | crash, kick, floor tom on 1 | 100 |
| Disco | maj7 / m7 / 9 | hold | yes | crash, kick, snare, shaker on 1 | 106 |
| Neo-Soul | maj9 / m9 / 9 | soft | no | soft kick and soft open hat on 1 | 96 |
| Reggae | triad / minor triad | stop | yes | kick and cross-stick on 1; no cymbal | 104 |
| Acoustic | triad / minor triad | soft | no | soft kick and soft snare on 1 | 96 |
| Country | triad / minor triad | hold, with walk-up and stinger | yes | crash and kick on 1 | 100 |
| Bossa | maj7 / m6 / 9 | soft | no | cross-stick and soft kick on 1 | 92 |
| Hip Hop | maj7 / m7 / 7 | stop | no | kick alone on 1 | 110 |
| Metal | power chord | three hits on 1, 2, 3 | yes | kick and snare on each, crash on the last | 108 |
| Ska-Punk | triad / minor triad | stop | yes | crash, kick, snare on 1 | 104 |

Gestures: "hold" strikes beat 1 and rings to the bar's end; "stop" strikes beat 1 for an eighth and is silent; "soft" rings with no crash, comp at velocity 72 and bass at 80% weight; "button" holds from 1 then adds one short accented hit on the "and" of 4; "hits" are short unison hits with the last one ringing. Except in "soft", the comp strikes the final chord at velocity 92.

## Style: blues

A Chicago shuffle band. Everything is written on the eighth-note grid and swung into a hard triplet.

### Tempo and feel

- ST-blues-01 `[style-data]` (unclear) The style itself carries no tempo; the old band is tempo-blind. Tempos attached to blues elsewhere: stock 12-bar blues 100 BPM, minor blues 90, 8-bar blues 110, jazz blues 140; imported "Blues" 100, "Shuffle" 110, "Slow Blues" 66; the loudness reference scene 96. A working range of 66 to 140 with a default of 100 is the best reading.
- ST-blues-02 `[style-data]` (solid) Swing 100 on eighths: the off-beat eighth lands at 66.7% of the beat (320 of 480 ticks), a hard triplet. It was first tuned at 90 and raised to 100 by ear.
- ST-blues-03 `[property]` (solid) At swing 100 the "e" sixteenth lands on the middle triplet (33.3% of the beat) and the "a" lands at 83.3%, between triplet positions. So grooves use only beats and "and"s, fills may use the "e" to spell a full triplet, and nothing ever uses the "a" (it reads as a flam).
- ST-blues-04 `[style-data]` (solid) Lean: bass +2 ms (a hair behind, for weight), piano +6 ms (lazy), rhythm guitar +2 ms (its chops sit with the snare), lead +8 ms. Blues is behind the beat.
- ST-blues-05 `[style-data]` (solid) Humanize 35.
- ST-blues-06 `[style-data]` (solid) Meter: written for 4/4. In other meters the drums play one cell per pulse (kick on downbeat pulses, snare on backbeat pulses, hat on every eighth) and the bass walks the ascending half of its box on the pulses. There is no 12/8 slow-blues groove.
- ST-blues-07 `[taste]` (solid) Feel does not change with tempo anywhere in the style.

### Drums

All grids are sixteenth-step grids; the feel pass swings them.

- ST-blues-08 `[property]` (solid) The kick is on 1 and 3 in every bar, no exceptions; the snare backbeat is on 2 and 4 in every bar (measured floors: 95% of bars each).
- ST-blues-09 `[style-data]` (solid) Kick, chosen per section. Weights are low / mid / high.
  ```
  plain   KK x.......x.......   (3 / 2 / 0)
  push    KK x.......x.....o.   (1 / 3 / 1)   soft kick on the swung "and" of 4 kicks the band into the next bar
  ```
  High energy always pushes.
- ST-blues-10 `[style-data]` (solid) Low tier groove:
  ```
  HH o.g.o.g.o.g.o.g.     hat on every swung eighth, the "and"s at half weight
  SN ....x.......x...     below energy 0.30 this is a cross-stick (rim) instead of the snare
  KK (per ST-blues-09)
  ```
- ST-blues-11 `[style-data]` (solid) Mid tier groove:
  ```
  HH x.o.x.o.x.o.x.o.
  SN ....X.......X...     30% of sections play ....X.......X.g. (a ghost on the "and" of 4 loping into the one)
  KK (per ST-blues-09)
  ```
- ST-blues-12 `[style-data]` (solid) High tier groove:
  ```
  HH X.o.X.o.X.o.X.o.
  SN one per section:  ....X.......X...  (2)   plain backbeat
                       ....X.g.....X.g.  (2)   ghosts on the "and"s of 2 and 4, rolling into 3 and 1
                       ..g.X.g...g.X.g.  (1)   Texas shuffle: a light snare on every swung "and"
  KK the section's kick; 60% of sections also feather beats 2 and 4 with a ghost kick (felt four-on-the-floor)
  ```
- ST-blues-13 `[style-data]` (solid) At high energy, on a section's second written repeat the shuffle moves from the hat to the ride (`RD x.o.x.o.x.o.x.o.`) with the hat foot on 2 and 4 (`....x.......x...`). The whole section commits together. It is tied to the written repeat, not to laps of a loop or counted choruses, so a single written 12-bar chorus never reaches the ride.
- ST-blues-14 `[style-data]` (solid) Open hat: at mid and high, on the second bar of each two-bar pair, a section that chooses to (35% of sections at mid, 60% at high) replaces the closed hat on the "and" of 4 with a soft open hat. It is the turnaround breath.
- ST-blues-15 `[style-data]` (solid) Lope: the cymbal (hat or ride) on the "and" of 2 and the "and" of 4 is played at 80% of its written velocity, so the shuffle circles in two beats instead of ticking evenly.
- ST-blues-16 `[style-data]` (solid) Fill length in sixteenth steps. Phrase end: low 0, mid 2, high 4. Section end: low 2, mid 4, high 8. A quiet blues plays straight through its phrase ends.
- ST-blues-17 `[style-data]` (solid) Fill vocabulary. Half of all fills are the triplet kind, half the eighth kind (one draw per fill).
  ```
  2 steps          SN X.                        pickup on the "and" of 4
  4 steps, eighth  SN x.X.                      backbeat kept on 4, the "and" accented
  4 steps, triplet SN xoX.                      "DA-da-DA" on beat 4
  8 steps, eighth  SN x.......  TH ..o.....  TM ....x...  TL ......X.
  8 steps, triplet SN xo......  TH ..o.....  TM ....xo..  TL ......X.
  ```
  Under the 8-step fills the kick plays each quarter with 70% chance. A short fill never drops the backbeat on 4 (a dropped backbeat in a two-beat fill reads as a mistake).
- ST-blues-18 `[style-data]` (solid) Time is carried by the hat (ride at ST-blues-13). A crash on an arrival replaces the timekeeper's stroke on 1.
- ST-blues-19 `[metric]` (solid) The cymbal plays every eighth and never a sixteenth (floor 90% of bars); a section keeps one kick pattern (consistency floor 75%); 15% to 50% of fill bars are the triplet fill.

### Bass

- ST-blues-20 `[style-data]` (solid) Register: the line lives between E1 (28) and A2 (45) for its roots so the box's b7 stays under the bass's ceiling (57). Each section picks an anchor between C2 and E2 (36 to 40); a root is placed nearest the previous note, pulled 30% back toward the anchor.
- ST-blues-21 `[style-data]` (solid) Low tier, 4/4: a two-feel. The chord's bass note on its arrival (velocity 98), the fifth on beat 3 (88; below the root when the root sits high), each held 92% of its space. When the next chord has a different bass note and the last note is at least a half note long, 35% of the time a quarter-note approach is added on beat 4 (velocity 84). Approach kinds: fifth of the target (3), nearest scale tone (3), half step below (2), half step above (1).
- ST-blues-22 `[style-data]` (solid) Mid and high tier: the boogie box in quarter notes, one degree per beat, ascending on the bar a chord arrives and descending on the next bar of the same chord, alternating two bars to a box. A chord that starts mid-bar walks up.
  ```
  major or dominant          up  R  3  5  6      down  b7 6  5  3     (down starts on the octave where the chord has no b7)
  minor with a natural 6th   up  R  b3 5  6      down  b7 6  5  b3
  minor without one          up  R  b3 4  5      down  b7 5  4  b3    (minor pentatonic box)
  power chord                up  R  5  6  5      down  8  6  5  6     (the Chuck Berry figure)
  no 6th in the scale        up  R  3  5  b7     down  b7 5  3  5
  slash chord                the bass note repeated on every beat (a pedal)
  ```
  The 6 steps up to the b7 and the 3 sits a half step under the IV, which is why the box walks a I to IV by itself.
- ST-blues-23 `[style-data]` (solid) The 6th the box rocks through comes from the chord's own scale, not its third alone: a secondary dominant resolving to a minor chord (A7 to Dm) has no natural 6th, so its box turns at the b7 instead. Otherwise the bass plants an F# against the piano's F natural.
- ST-blues-24 `[style-data]` (solid) The lope: the beat's note struck again on the swung "and", long-short ("da-DUM"). Beat note length 1.8 steps, the lope note 0.8 steps at velocity 70. High energy lopes every beat. Mid energy picks per section: no lope (2), the "and" of 4 only (2), beats 2 and 4 (1). Without a lope a quarter is held 85% of the beat.
- ST-blues-25 `[property]` (solid) The lope repeats the beat's pitch; it never moves on the "and" (floor 95%).
- ST-blues-26 `[style-data]` (solid) Box velocities: 100 on the first beat of a chord, 94 on beat 3, 88 on 2 and 4.
- ST-blues-27 `[style-data]` (solid) Into a change: if the box's last note already is the next chord's bass note, it is replaced by the half step below the next root (never sound the arrival a beat early). If the last note is a half or whole step from the next root, it is moved to the octave beside that root so it leads in rather than leaps.
- ST-blues-28 `[metric]` (solid) 15% to 40% of changes resolve by a half step in actual pitch; under 5% of lead-ins leap; 15% to 35% of bass notes on dominant chords are the 6th; at low energy the bass plays 0.45 to 0.75 notes per beat with no repeated notes.

### Chords

Piano (the default).

- ST-blues-29 `[style-data]` (solid) Voicing: rootless. A dominant is its 3rd and b7 with the 9th and 13th; the bass has the root. One hand, E3 (52) and up.
- ST-blues-30 `[style-data]` (solid) One rhythm figure per section, drawn by tier. Positions are steps on the sixteenth grid (0 = beat 1, 6 = "and" of 2, 14 = "and" of 4).
  ```
  low    x...............  (3)   held
         x.............x.  (2)   held, with a push on the "and" of 4
         x.....x.........  (1)   Charleston lean
  mid    ....x.......x...  (3)   chops on 2 and 4 like a second snare
         x.....x.........  (2)
         ......x.......x.  (2)   pushes on the "and"s
         ....x.....x...x.  (1)
  high   x.x.x.x.x.x.x.x.  (2)   the boogie pump
         ....x.x.....x.x.  (2)   2, 4 and the "and"s after them
         x.....x...x...x.  (1)
  ```
- ST-blues-31 `[style-data]` (solid) Articulation. Low: each chord held 95% of the way to the next strike, velocity 74 on a beat and 80 off it (a pad that breathes). Mid and high stabs: 1.5 steps long, velocity 90 on an off-beat or on a 2-and-4 chop, 78 otherwise. The pump: on the beat 1.5 steps at 84, on the "and" 1 step at 66 (the same long-short as the bass).
- ST-blues-32 `[style-data]` (solid) On a pump bar the voicing switches from rootless to close position (plain triads, 6ths and 7ths with the root): hammering rootless 9ths and 13ths in eighths mixes idioms.
- ST-blues-33 `[style-data]` (solid) Call and response with a lead: a strike under a sounding lead note lays out 45% of the time, and a breath of a dotted quarter or more that the figure left empty gets a stab 60% of the time. The pump never does this; it is a groove.

Rhythm guitar.

- ST-blues-34 `[style-data]` (solid) Grips: four strings, close voicing (7th and 6th chords; a written 13 takes the 5th's place), between D3 and E5 (50 to 76), top note aimed at E4 (64), no open strings (a chop is damped by releasing the fretting hand). No rootless colour: under 20% of strikes carry a 9th or 13th.
- ST-blues-35 `[style-data]` (solid) Strum lines, eighth pendulum:
  ```
  low   ....x.......x...                 chop on 2 and 4, each rings 1.2 steps
  mid   ....X.-.....X.-.  (2)            chop plus a muted scratch on the "and"
        x.-.X.-.x.-.X.-.  (1)            the chuck
  high  x.x.X.x.x.x.X.x.                 full shuffle strum, each rings 1.6 steps
  ```
  At low energy with no bassist it plays `x...x...x...x...` so beats 1 and 3 are not empty.
- ST-blues-36 `[style-data]` (solid) With no bassist the guitar becomes the bottom: five-string root-position grips down to E2 (40), and wherever the chord has a plain root and perfect 5th (no slash, no altered 5th, 4/4, no fermata) it plays the Jimmy Reed boogie instead of the strum. Two strings together on every swung eighth: root with its 5th on beats 1 and 3, root with its 6th on 2 and 4, reaching to the b7 on beat 3 at high energy on a dominant. Each chord's arrival is the full chord. Beats are downstrokes (velocity 92 on 1 and 3, 86 on 2 and 4, 1.8 steps), the "and"s the same two notes as an upstroke (72, 0.8 steps). At low energy it is quarter notes only (72 and 66).
- ST-blues-37 `[style-data]` (solid) An organ in the comp seat holds each chord as a pad and strikes only on a change or a push (1 to 1.6 strikes a bar); the written figures are for struck instruments.

### Soloist

Default lead is a guitar.

- ST-blues-38 `[style-data]` (solid) Notes: the key's blues scale (1 b3 4 b5 5 b7) plus the current chord's own tones. Changes land on the chord's 3rd, then root, b7, 5th. Phrases come to rest on the 3rd, root or 5th.
- ST-blues-39 `[style-data]` (solid) Rhythm cells, swung eighths:
  ```
  sparse  x-x-x-------....   ..x-x-x-----....   x---x-x-----....   ....x-x-x-x-----
  mid     x-x-x-x-x-------   ..x-x-x-x-x-x---   x-x-x---x-x-----   x---x-x-x-x-----
          x-x-x---x---x-x-   ..x-x-x-----..x-       (the last two run over the barline)
  busy    x-x-x-x-x-x-x-x-   x-x-x-x-x-x-x---   ..x-x-x-x-x-x-x-   x-x-x-x-x---x-x-
  phrase endings  x-----------....   x-x-x-----------   x---------------   ..x-x-x---------
  ```
- ST-blues-40 `[style-data]` (solid) The head is AAB: a call, the same call again over the IV, then a different answer. Head cells: `x-x-x-------....`, `..x-x-x-----....`, `x---x-x---x-----`, `x-x---x-x-------`, `x-x-x-------..x-`; head endings `x---------------`, `x-x-x-----------`.
- ST-blues-41 `[style-data]` (solid) Habits, as chances: chromatic approach note 0.20; enclosure 0.05; a solo bar repeats the bar before it (a riff) 0.35; a phrase takes a roomier shape 0.30; a landing on the 3rd is bent up from the blue third 0.65; a landing on the root is bent up from the b7 0.45; a bent note inside a phrase is let back down 0.40; an unbent landing is slid into 0.25; a horn scoops into a long note 0.15; every held note of 6 steps or longer gets vibrato.
- ST-blues-42 `[style-data]` (solid) Pickups: 65% of solo phrases that would start on a downbeat (50% of head phrases) start on beat 4 of the bar before, using `..x-` (the "and" of 4), `x-x-` (two eighths) or `xxx-` (a triplet on 4), walking in by the scale. 40% of the barlines a lick could lean over, its last eighth is tied into the next downbeat.
  - This band, since 2026-11-17: the chance is still 0.65 in the data, of a phrase that would start on the one after a breath and has SO-37's air for it. It is not the share of phrases that start with a pickup, and the two must not be read as one. `solo.entered-early` (of the solo's phrases with notes, the share whose first note comes before the phrase's first bar, the solo's first phrase included) reads a mean of 0.19 at the default setting (one take in ten 0, one in ten above 0.42; 0.22 at `soloDensity` 0): few phrases leave the air a pickup needs, since an end bar's last note is cut to leave its breath before the barline (docs/decisions/soloist.md, "the soloist's pickups"). Brandon passed the pickups by ear on 2026-11-19 (`soloist-changes-awesome`).
- ST-blues-43 `[style-data]` (solid) When the lead is a horn it falls off the last note of a phrase 30% of the time, mostly at the chorus's close; a horn never releases a bend.
- ST-blues-44 `[style-data]` (solid) Guide-tone head of a known standard, blues phrasing: a few notes, one long one, beat 4 left open for the band's answer. Cells `x-----x-----....`, `..x-x---x---....`, `x---x-x-----....`, `x-x-----x---....`, `x---x---x---....`; turns `x-------x---....`, `..x-----x---....`, `x-x-x---x-------`; endings `x-----------....`, `x-------------..`; section close `x-------------..`.
- ST-blues-45 `[metric]` (solid) Head: 15% to 40% rests, beat 4 left open in at least half the bars of a guide-tone head, 80% chord tones on beats. Solo: 20% to 50% rests, 75% chord tones on beats, a 3rd or 7th on 40% to 85% of changes, 4% to 30% of notes bent, under 5% wide leaps.
  - This band, since 2026-11-17, by Brandon's ear (`soloist-a-little-sparse`, `busier-soloist-defaults-and-range`): a solo is not 20% to 50% rests. `solo.empty-bars` (bars of the solo with no note struck) reads a mean of 0.09 at the default setting, one take in ten at 0 and one in ten above 0.17, and 0.13 at the sparse end (`soloDensity` 0). The old 20% to 50% is the last band's (SO-11 and the table under it in part B).

### Anticipation

- ST-blues-46 `[style-data]` (solid) Piano: the last strike before a barline, if it falls on the "and" of 4 and the next bar starts a different chord, plays the next chord an eighth early and ties over the barline: 30% low, 40% mid, 50% high. The next bar's downbeat strike is then dropped.
- ST-blues-47 `[style-data]` (solid) Piano, mid-bar change (a quick IV, the turnaround's two-chord bars): any strike in the eighth before the change plays the new chord and ties over it. On a pump bar the pushed chord is struck again on the beat instead of tied (the pump must not have a hole).
- ST-blues-48 `[property]` (solid) The strike before a mid-bar change is never the outgoing chord (measured 0).
- ST-blues-49 `[style-data]` (solid) Guitar: no anticipation at low or mid; at high the upstroke on the "and" of 4 anticipates 20% of the time.
- ST-blues-50 `[style-data]` (solid) Drums push the bar with the soft kick on the "and" of 4 (ST-blues-09); the bass never anticipates, it approaches.
- ST-blues-51 `[metric]` (solid) 35% to 60% of changes are anticipated by the piano overall (about 25% at low energy, 73% at high).

### Endings and turnarounds

- ST-blues-52 `[style-data]` (solid) Final chord: the I9 in a major key, the im9 in minor, and the I9 when the chart's tonic is a dominant. A blues band ends even a non-blues tune on its I9.
- ST-blues-53 `[style-data]` (solid) Gesture: the bar before the end gets the style's biggest fill (8 steps) whatever the energy, then the whole band strikes beat 1 and lets it ring to the end of the bar. Drums: crash and kick on 1, accented, no snare. Bass: the low root at velocity 100. Comp at velocity 92.
- ST-blues-54 `[style-data]` (solid) Turnaround behaviour is not a separate device: the open hat on the "and" of 4 in the second bar of a pair, the kick push, the box's leading tones and the piano's pushes into the IV, V and turnaround do the job.

### Arrangement arc

- ST-blues-55 `[style-data]` (solid) Blues takes the band's full default arc (no style-specific depth) and lets lifts cross into the high tier.
- ST-blues-56 `[style-data]` (solid) What the tiers add up to: low is hat with soft "and"s, cross-stick or light snare, bass in two, piano holding; mid is the full hat shuffle, the box in quarters with some lope, piano chopping 2 and 4; high is accented hats or ride, ghosted snare, feathered kick, the bass loping every beat, the piano pumping eighths.

### Instruments and mix

- ST-blues-57 `[style-data]` (solid) Defaults: piano on chords, clean electric guitar on lead, upright bass, acoustic kit.
- ST-blues-58 `[style-data]` (unclear) Two tables disagree. The style says piano and guitar (an organ default would silence the written piano figures). An older genre table says Hammond organ on chords and alto sax on lead; it is consulted only when the style's own choice is not installed.
- ST-blues-59 `[style-data]` (solid) Mix: master make-up gain +11.1 dB to reach -16 LUFS; snare +6%, kick +4%, toms +3% on the built-in kit.

## Style: jazz

Medium swing: ride and walking bass, a comping piano, a bebop alto.

### Tempo and feel

- ST-jazz-01 `[style-data]` (unclear) No tempo in the style. Tempos attached elsewhere, by imported feel name: ballad 66, slow swing 90, medium slow 100, cool 120, medium swing 130, swing 140, jazz waltz 150, medium up 160, bebop 190, up tempo 200. Stock standards run 120 to 240. The loudness reference scene is 138.
- ST-jazz-02 `[style-data]` (solid) Swing 60 on eighths: the off-beat eighth at 60% of the beat (288 of 480 ticks), lighter than a triplet. First tuned at 72 and lowered by ear.
- ST-jazz-03 `[taste]` (solid) The swing amount does not ease off with tempo: 60 was judged right at 138 BPM and still right at 200.
- ST-jazz-04 `[style-data]` (solid) Lean: bass -2 ms (a hair ahead, on top of the ride, driving), piano +8 ms (laid back), swing rhythm guitar -2 ms (locked with the bass), lead +10 ms (laid back against the ride).
- ST-jazz-05 `[style-data]` (solid) Humanize 40.
- ST-jazz-06 `[property]` (solid) Only swung-eighth positions are used by drums and comp. A sixteenth would land between triplet positions once swung and read as a flam.
- ST-jazz-07 `[style-data]` (solid) Other meters: one cell per pulse. Downbeat pulse: ride `x...` and a ghost kick. Backbeat pulse: ride `X.x.` and the hat foot. The bass walks one note per pulse; the two-feel is 4/4 only.

### Drums

- ST-jazz-08 `[style-data]` (solid) Time:
  ```
  RD  low        o...x.o.o...x.o.        soft and spacious
  RD  mid, high  x...X.x.x...X.x.        "spang, spang-a-lang": 2 and 4 accented, skip notes on the "and" of 2 and of 4
  HF  ....x.......x...                   hat foot on 2 and 4, always
  KK  low        (none)
  KK  mid, high  g...g...g...g...        feathered quarters, felt not heard
  ```
- ST-jazz-09 `[style-data]` (solid) The light head: on the head's A sections, below the high tier, the swing pattern moves to the closed hi-hat (`HH x...X.x.x...X.x.`), the ride is silent, the kick stops feathering and the snare stops comping. The move to the ride for the bridge and the solos is the cue the listener hears as the band opening up. At the high tier the head is played on the ride from the top (a burner).
- ST-jazz-10 `[style-data]` (solid) Snare comping reads the chart the way the pianist does and is chosen per phrase position, never stroke by stroke. A phrase's first and third bars share a figure; its second bar may take another. None at low energy. The first stroke of a figure is soft (72); later strokes are ghosts (36) at mid and soft at high.
  ```
  one chord, no change at the barline     "and" of 2 (3) | "and" of 2 + "and" of 3 (1) | "and" of 1 + "and" of 2 (1) | nothing (2)
  one chord, a change at the barline      "and" of 2 (2) | "and" of 4 (2) | both (2) | nothing (2)
  two chords in the bar                   "and" of 3 (2) | "and" of 4 (2) | both (1) | beat 3 (1) | nothing (1)
  ```
  At high energy "nothing" is half as likely. The snare never comps on 1 (the kick's), or on 2 or 4 (the hat's).
- ST-jazz-11 `[style-data]` (solid) The last bar of a phrase is its set-up. At a boundary the arrangement fills (an eight-bar phrase, a section, the chorus top): a snare stroke on the "and" of 4 with a kick "bomb" (the kick drops its feathered beat 4 and hits the "and" of 4 at normal weight), plus a soft snare on the "and" of 3 at high energy. At a plain four-bar phrase end, drawn per phrase position: before a change, the shot with bomb (3), a snare alone on the "and" of 4 (1), the "and" of 3 and "and" of 4 (1), nothing (1); with no change, snare on the "and" of 4 (1), both "and"s (1), nothing (2), and never a bomb.
- ST-jazz-12 `[style-data]` (solid) Fill length in steps. Phrase: low 0, mid 2, high 4. Section: low 4, mid 4, high 8.
- ST-jazz-13 `[style-data]` (solid) Fill shapes, written at 2, 4 and 8 steps before the barline, swung eighths only:
  ```
  the shot          2: SN X.  KK X.        4: SN ..X.  KK ..X.          8: SN ......X.  KK ......X.
  two-shot          2: SN X.  KK x.        4: SN o.X.  KK ..x.          8: SN ..o...X.  KK ......X.
  eighths           2: SN x.               4: SN o.X.  KK ..x.          8: SN o.o.o.X.  KK ......x.
  round the toms    2: TL X.  KK x.        4: TH o...  TL ..X.  KK ..x. 8: SN o.o.....  TH ....o...  TL ......X.  KK ......x.
  soft shot         2: SN x.  KK o.        4: SN o.x.  KK ..o.          8: SN ..o...x.  KK ......o.
  whisper           2: SN o.               4: SN g.o.                   8: SN g.g.o.o.
  ```
- ST-jazz-14 `[style-data]` (solid) Which fill where. Phrase end: shot (2), two-shot (2), eighths (1). Section end: eighths (2), two-shot (1), round the toms (1). Top of the chorus, a lift into a louder section, or the set-up into an ending: round the toms (2), eighths (1), two-shot (1). Under the light head the drummer stays off the toms: phrase end whisper; section end whisper (1) or soft shot (1); top eighths (1) or soft shot (1).
- ST-jazz-15 `[style-data]` (solid) The time-keeping cymbal plays on through a fill; only "round the toms" takes the stick hand off it after the fill's first stroke.
- ST-jazz-16 `[style-data]` (solid) Trading with the drummer (fours, fitted to twos and eights), swung eighths only, hat foot kept on 2 and 4. One two-beat motif per turn, from `xx.x`, `x.xx`, `x..x`, `xxx.` (eighth positions). Bar 1 states it on the snare and answers on the high tom, kick on 1. Bar 2 displaces it an eighth late on high and floor tom. Bar 3 plays it as accents in a stream of ghosted snare eighths, each figure's first accent doubled by the kick. The last bar states it for two beats, runs down the three toms in eighths getting louder, and ends on a snare-and-kick shot on the "and" of 4. The band returns on a crash.
- ST-jazz-17 `[metric]` (solid) The snare lands where the piano strikes at least 45% of the time; 46% to 67% of phrase ends get the "and"-of-4 shot (not every phrase); the ride is on every beat in solos (floor 90%).

### Bass

- ST-jazz-18 `[style-data]` (solid) Register E1 to E3 (28 to 52), home D2 (38). Each note is placed nearest a point 35% of the way from the previous note back toward home.
- ST-jazz-19 `[style-data]` (solid) In two: at low energy everywhere (a ballad stays in two through the solos), and under the light head's A sections. Root on 1 (velocity 96), fifth on 3 (86; the third if the fifth would repeat the root), each 92% of its length. 35% of bars that lead to a new chord split the second half note with a quarter-note approach on 4; that choice is keyed to the bar's place in its section, so a repeated A plays the same two-feel rhythm.
- ST-jazz-20 `[style-data]` (solid) The head's last bar before a solo chorus walks, so the bass sets up the solo across the barline instead of switching on its downbeat. The head's bridge walks for contrast; the solos walk.
- ST-jazz-21 `[style-data]` (solid) In four: one note per beat, 92% length, velocity 98 on a chord's arrival, 90 on beats 2 and 4, 86 on beat 3 (and on a beat 1 that is not a chord arrival).
  1. The arrival is the chord's bass note. One time in ten it is the 3rd instead, but never right after a stepwise approach, never in a section's first bar, never under a slash chord.
  2. The last beat before the next chord is an approach, chosen before the middle is walked: half step below (4), half step above (3), nearest scale tone (3), the target's fifth (2; taken from below if that is nearer). It never repeats the note before it and is never the target itself.
  3. The middle beats move toward the approach, each within a fourth (5 semitones) of the last, chord or scale tones only. Weights: chord tone on beat 1 or 3 is 3, on 2 or 4 is 1.6; scale tone on 1 or 3 is 0.5, on 2 or 4 is 1.4; divided by the distance in semitones; doubled when moving toward the goal, times 0.6 when moving away. The note before the approach sits within a major third of it.
- ST-jazz-22 `[property]` (solid) The walk never repeats a pitch (ceiling 2%); a held half note is a chord tone, never a passing tone (floor 97%); a lead-in sits beside the note it leads to (leaps under 5%).
- ST-jazz-23 `[style-data]` (solid) A scale approach into a root at the very bottom of the instrument (E1, F1) aims at the octave above, and the next bar keeps that octave. Otherwise the line sits on the open string and rocks back and forth.
- ST-jazz-24 `[metric]` (solid) Walking: 0.85 to 1.05 notes per beat, mean interval 1.5 to 4.5 semitones, 30% to 80% of changes approached by half step, 75% or more of arrivals on the chord's bass note.

### Chords

Piano (the default).

- ST-jazz-25 `[style-data]` (solid) Voicing: rootless, one hand in the middle of the keyboard (mean lowest note between Bb3 and E4, 58 to 64). Seventh chords: 3rd, 7th and two colours. Dominants take the 9th and 13th (or their written alterations) in place of root and 5th; major and minor take the 5th and 9th; half-diminished is b3, 11, b5, b7; a plain triad is root, 3rd, 5th, 9th. At least 60% of strikes carry a 9th or 13th.
- ST-jazz-26 `[style-data]` (solid) Rhythm, drawn fresh for each chord span of each bar. Whole-bar spans:
  ```
  x.....x.........  (4)   Charleston
  ..x.....x.......  (2)   reverse Charleston
  ......x.........  (3)   the "and" of 2 alone
  x...............  (2)
  ..x...x.........  (1)
  ....x.....x.....  (2)
  ......x.......x.  (2)
  ```
  Half-bar spans (two chords in a bar), positions within the half: on the chord (3), on its "and" (2), on the chord and its "and" of 2 (1).
- ST-jazz-27 `[style-data]` (solid) Articulation: mostly short stabs of 1.5 steps; a strike is held to the end of its chord 50% of the time at low energy and 25% otherwise. Velocity 78 on a beat, 88 off it. At high energy 40% of full bars add one more stab on the "and" of 3 or the "and" of 4 (velocity 84).
- ST-jazz-28 `[style-data]` (solid) At low energy a bar whose chord is simply held over from the bar before is left empty.
- ST-jazz-29 `[style-data]` (solid) With a soloist: a strike under a sounding lead note lays out 60% of the time, but never below two strikes in the bar and never a chord's first strike; a breath of a dotted quarter or more gets a stab 90% of the time, played 8 louder, on the first off-beat eighth at least an eighth after the lead lets go.
- ST-jazz-30 `[metric]` (solid) With a soloist, under 21% of bars have a single strike; the comp is 1.1 to 2 times denser in the soloist's breaths than under the line; 40% to 70% of breaths get an answer.

Swing rhythm guitar.

- ST-jazz-31 `[style-data]` (solid) Grip: the Freddie Green shell. Three notes, root, 3rd, 7th (or 6th); the root on the 6th or 5th string, doubling the walking bass an octave up on purpose; one muted string skipped inside the grip; E2 to G4 (40 to 67) with the top aimed at D4 (62); no open strings. Half-diminished adds its b5.
- ST-jazz-32 `[style-data]` (solid) Mid and high: four to the bar. Beats 1 and 3 longer and softer (2.4 steps, velocity 70); beats 2 and 4 short, crisp and leaned on (1.2 steps, velocity 86). The long-short pull is the swing. Struck as one sound, no audible roll.
- ST-jazz-33 `[style-data]` (solid) Low: it comps like the piano (ST-jazz-26), root still on the bottom.

### Soloist

Default lead is alto sax.

- ST-jazz-34 `[style-data]` (solid) Notes: the chord's own scale plus one bebop passing tone that puts chord tones on the beats of an eighth-note run (the major 7th on a mixolydian dominant, the major 3rd on a dorian minor, the #5 on a major chord; none over altered or diminished chords). Changes land on the 3rd or 7th (then 9th, 5th, root). Phrases rest on the 3rd, root, 5th.
- ST-jazz-35 `[style-data]` (solid) Rhythm cells, swung eighths:
  ```
  sparse  ..x-x-x-----....   x-x---x-----....   ....x-x-x-------   x---..x-x---....   ..x-----x-x-x---
  mid     x---x-x-x-----..   ..x-x-x---..x-x-   x-x-x-----..x-x-   ....x-x-x---x---   ..x---x-x---....
  busy    x-x-x-x-x-x-x-x-   ..x-x-x-x-x-x-x-   x-x-x-x-x-x-x---   ....x-x-x-x-x-x-   x-x-x---x-x-x-x-
  phrase endings  x-x-x-------....   ..x-x-x-----....   x-x---..........   x---x-------....   ..x-x-x-x-------   x-------........
  ```
- ST-jazz-36 `[style-data]` (solid) The head is a period: statement, answer, contrast, statement back. Head cells: `x---x---x-------`, `x-x-x---x-------`, `..x-x-x-x-------`, `x-----x-x---x---`, `....x-x-x-x-x---`, `x-----x-x-----x-` (Charleston, then the "and" of 4 pushed over the barline). Head endings: `x---------------`, `x-----------....`, `x-x-x-----------`.
- ST-jazz-37 `[style-data]` (solid) Habits, as chances: chromatic approach 0.45; enclosure (scale step above, then half step below) 0.25; riff repeat 0.08; roomier phrase 0.25; no bends; scoop into a long note 0.15; vibrato only on notes of a half note (8 steps) or longer.
- ST-jazz-38 `[style-data]` (solid) Pickups: a solo phrase that would enter on the one is led in from beat 4 85% of the time (head phrases 70%), using `..x-` (weighted double), `x-x-` or `xxx-`. A solo pickup ends on a half step below its target or an enclosure; a head pickup walks in by the scale. A run's last eighth is tied over the barline on half the barlines it could be.
  - This band, since 2026-11-17: the chance is still 0.85 in the data, of a phrase that would start on the one after a breath and has SO-37's air for it; it is not the share of phrases led in. `solo.entered-early` (of the solo's phrases with notes, the share whose first note comes before the phrase's first bar) reads a mean of 0.28 at the default setting (one take in ten below 0.06, one in ten above 0.56; 0.30 at `soloDensity` 0). Passed by Brandon's ear on 2026-11-19 (`soloist-changes-awesome`).
- ST-jazz-39 `[style-data]` (solid) Guide-tone head of a known standard: two or three notes a bar, each cell with an attack on or an eighth before beat 3. Cells `x-----x-x-------`, `x---x---x-------`, `x-------x-----x-`, `..x-----x---x-..`, `x-----x-----x-..`, `x-x-----x-------`; turns `x-------x-------`, `x---x-------x-..`, `x-------..x-x-..`; endings `x-----------....`, `..x-----------..`, `x-------------..`; section close `x-------------..`.
- ST-jazz-40 `[metric]` (solid) Head: 2 to 4.5 notes a bar, under 15% rests, a guide tone on 70% of changes, under 10% chromatic approaches (a tune steps into its chords). Solo: 60% to 95% of notes are eighths or shorter, 20% to 50% rests, 18% to 60% chromatic approaches, 55% to 90% stepwise, a guide tone on 60% of changes, range of 10 to 24 semitones in a chorus, 7% to 22% of phrases restate the previous phrase's opening.
  - This band, since 2026-11-17, by Brandon's ear (`soloist-a-little-sparse`, `busier-soloist-defaults-and-range`): a solo is not 20% to 50% rests. `solo.empty-bars` (bars of the solo with no note struck) reads a mean of 0.09 at the default setting, one take in ten below 0.03 and one in ten above 0.15, and 0.14 at the sparse end (`soloDensity` 0). The old figure is the last band's (SO-11 and the table under it in part B).

### Anticipation

- ST-jazz-41 `[style-data]` (solid) Piano, two stages. First, before a chord change over the barline, a strike on the "and" of 4 is added to the bar's figure (never moved from another position): 25% low, 40% mid, 45% high. Second, when the bar's last strike is on the "and" of 4, it plays the next chord early and ties an eighth past the barline: 60% low, 75% mid, 85% high; otherwise it is a stab of the outgoing chord. The next bar's strikes in its first eighth are dropped.
- ST-jazz-42 `[style-data]` (solid) Piano, mid-bar change (a ii-V in one bar): a strike in the eighth before the change always plays the new chord and ties over; the new chord is not struck again on its beat (struck twice it sounds "ba-DAHM").
- ST-jazz-43 `[property]` (solid) No anticipation into a fermata, into the final chord, or into a bar the comp sits out; those land together on the beat.
- ST-jazz-44 `[style-data]` (solid) Guitar: four-to-the-bar never anticipates. The sparse low-energy comp pushes over the barline 15% of the time and pushes mid-bar changes like the piano.
- ST-jazz-45 `[style-data]` (solid) Drums mirror the pushes with the "and"-of-4 snare and bomb (ST-jazz-11). The bass does not anticipate. The lead ties over half of its available barlines (ST-jazz-38).
- ST-jazz-46 `[metric]` (solid) 25% to 45% of changes are anticipated by the piano; 2.5% to 10% by the low-energy guitar.

### Endings and turnarounds

- ST-jazz-47 `[style-data]` (solid) Final chord: the tonic 6th in major (no major-7th rub under a melody resting on the root), the minor 6th in minor. A chart whose tonic is a dominant gets the same 6th colour.
- ST-jazz-48 `[style-data]` (solid) Gesture: the button. No set-up fill. The band holds the last chord from beat 1, then plays one short unison hit an eighth long on the "and" of 4, 12 velocity points harder than the held chord ("doo-BOP"). Drums: ride accent and normal kick on 1; snare and kick accent together on the "and" of 4. Bass velocity 96, comp 92.
- ST-jazz-49 `[style-data]` (solid) Turnarounds are handled by the set-ups: bigger boundaries get bigger fills (ST-jazz-14) and the comp pushes into the top.

### Arrangement arc

- ST-jazz-50 `[style-data]` (solid) The rhythm section reads the form: head A sections light (bass in two, closed hat, no kick, no snare comping), the head's bridge opened up (walking, ride), solos driven, the out-head light again. A "bridge" is a section labelled so, or else the contrasting second-to-last section of a chorus of three or more.
- ST-jazz-51 `[style-data]` (solid) At high energy the head walks on the ride from the top (under 10% of head bars in two). At low energy everything stays in two, solos included.
- ST-jazz-52 `[style-data]` (solid) Jazz is the only style whose drummer takes solos, so it is the only one that offers trading with the drums.
- ST-jazz-53 `[style-data]` (solid) Full default arc; lifts may cross into the high tier.

### Instruments and mix

- ST-jazz-54 `[style-data]` (solid) Defaults: grand piano, alto sax, upright bass, acoustic kit. Both tables agree.
- ST-jazz-55 `[style-data]` (solid) Mix: master make-up +12.4 dB (the quietest style before make-up). Jazz alone changes the bus EQ: chord bus low shelf -5 dB (others -2), bass bus high-pass at 55 Hz with a -1 dB weight shelf (others 20 Hz and +2 dB), drum bus high-pass at 95 Hz (others 40 Hz). Built-in kit trims: ride +3%, snare +3%, kick +5%, toms +4%.

### The jazz waltz, from published sources

Not the old band's: a study of published transcriptions and teaching pages (2026-11-21, #2241; `prompts/jazz-waltz-study.md` holds the sources' addresses, the grids bar by bar, and what was re-read). Grids are one bar of 3/4 in eighths, `1 & 2 & 3 &`: `x` a strike, `X` an accented one, `-` held, `.` nothing. Most of it rests on one pianist on one record: proportions, not rates.

- ST-jazz-56 `[metric]` (solid) Behind a soloist in a medium waltz the pianist strikes about two chords a bar, one to four, and leaves beat 1 to the bass more often than he plays it: Wynton Kelly behind Miles Davis, 31 strikes in 16 bars, 6 of the 16 struck on 1, 4 of them one strike, while the bass holds a root on every downbeat. Pamies Rodríguez, Sergio, "Wynton Kelly: A Model for Soloing, Comping, and Rhythm Section Interplay", *Jazz-hitz* 04 (2021); Walsh, Josh, "The 2 Upbeats That Make Jazz Waltzes Swing", Jazz-Library (undated): "the bass on beat one".
- ST-jazz-57 `[style-data]` (solid) The two off-beats: the "and" of 1 and the "and" of 2, short (`. x . x . .`), mixed with each alone and an occasional stab on 2 or 3. Walsh (undated); Kelly's bars 72, 73 and 79 in Pamies Rodríguez (2021).
- ST-jazz-58 `[style-data]` (solid) The dotted-quarter cell: 1 held a dotted quarter, then the "and" of 2 short (`x - - x . .`), the commonest figure as Kelly builds toward a section's arrival; varied with an accented "and" of 3 (`x - - x . X`). Two dotted quarters across the bar (`x - - x - -`) once, at the build's peak (unclear as a figure). Pamies Rodríguez (2021).
- ST-jazz-59 `[style-data]` (solid) Held chords: one chord laid in and held the bar (the head's bridge, a section's arrival), the "and" of 1 held to the barline (where the tension is released), beat 2 held a half note. Pamies Rodríguez (2021).
- ST-jazz-60 `[style-data]` (solid) Short figures of one or two strikes: 1 and 3 (`x . . . x .`), the "and" of 2 alone (`. . . x . .`). Pamies Rodríguez (2021); Walsh (undated) for the "and" of 2.
- ST-jazz-61 `[style-data]` (solid) The hemiola: three short chords over two bars, a chord every two beats (`x . . . x . | . . x . . .`), behind the melody of the head's A sections for six to eight bars at a time, released at the section's end; not found under the soloist, and no source says where else in a form it goes. Pamies Rodríguez (2021); the device named in Herberman, Steve, "Comping Concepts Part Two: Ballads and Jazz Waltz", Mike's Masterclasses (course page).
- ST-jazz-62 `[style-data]` (solid) The comp follows the form and the line: at the end of an eight-bar phrase denser, louder and higher (one bar of four strikes, `. X x x . x`, unclear as a figure); under a busy line sparse, answering in its gaps. Pamies Rodríguez (2021), quoting Kelly: "In general, I like to stay out of a man's way."
- ST-jazz-63 `[style-data]` (solid) Bill Evans lays out under Scott LaFaro's bass solo on "Alice in Wonderland" (1961). Clark, Rowan, *An Analysis of the Bass Playing of Scott LaFaro as Part of the Bill Evans Trio 1959-1961*, MMus thesis, New Zealand School of Music (2014).
- ST-jazz-64 `[style-data]` (unclear) The "and" of 3 is struck in about half of Kelly's solo bars, short or accented at a phrase's end; the one instance first read as tied over the barline is the "and" of 2 held inside the bar. No source gives a rate of anticipating the next bar in a waltz. Pamies Rodríguez (2021).
- ST-jazz-65 `[style-data]` (solid) The waltz's ride: 1, 2, the "and" of 2, 3 (`x . x x x .`); the hi-hat foot on 2, or on 2 and 3, or on all three. Butterfield, Matthew W., "Variant Timekeeping Patterns and Their Effects in Jazz Drumming", *Music Theory Online* 16.4 (2010); Mastering MuseScore School, *A Jazz Improvisation Primer* (undated); Motian's foot on 2 in Clark (2014).
- ST-jazz-66 `[style-data]` (unclear) The bass in three feels: in one (a dotted half on each downbeat, often with a pickup: a half then two eighths, or a half then a quarter), two dotted quarters, or walking a note a beat, moving between them to build and release. Chambers stays in one under Davis's solo on the Kelly record, the opposite of head-in-one and solos-walking. "Joe", "Playing in 3: Jazz Waltz Bass Lines in One, Two and Three", nerdboy.co.uk (2026); Pamies Rodríguez (2021).

## Style: funk

Sixteenth-note funk: a syncopated kick that stays off the backbeat, a one-bar bass riff locked to it, clipped stabs, a horn section on top.

### Tempo and feel

- ST-funk-01 `[style-data]` (unclear) No tempo in the style. Attached elsewhere: imported "Funk" 100 BPM; stock grooves 108, 110 and 115; loudness reference scene 104. A range of about 95 to 120 with a default near 105 is the best reading.
- ST-funk-02 `[style-data]` (solid) Swing 15 on sixteenths: the off-sixteenth lands at 52.5% of its eighth-note pair (126 of 240 ticks). A trace, not a shuffle.
- ST-funk-03 `[style-data]` (solid) Lean: bass -5 ms and comp -3 ms, both ahead (funk pushes on the One); the lead 0 ms, right on the grid on top of the pocket.
- ST-funk-04 `[style-data]` (solid) Humanize 25.
- ST-funk-05 `[style-data]` (solid) Other meters: per-pulse drum cells (downbeat pulse kick `x..x`; backbeat pulse snare `X..g`; strong pulse kick `.x.x`; hat `xoxo`, or `x.o.` at low energy); the bass riff is cut or padded to the bar length.

### Drums

- ST-funk-06 `[style-data]` (solid) Kick, one per section, weights low / mid / high:
  ```
  KK x......x..x.....   (3 / 3 / 2)
  KK x.x.......x..x..   (1 / 3 / 3)
  KK x.....x...x.....   (3 / 2 / 1)
  KK x..x......x..x..   (1 / 2 / 3)
  KK x.......xx...x..   (1 / 2 / 3)
  ```
  Every pattern has the One and none touches beats 2 or 4.
- ST-funk-07 `[style-data]` (solid) Snare: the backbeat accented, `....X.......X...`, plus one ghost pattern per section at mid and high (none at low), equal weights:
  ```
  .......g.g....g.
  ..g....g.......g
  .g.....g..g....g
  .......g......gg
  ```
- ST-funk-08 `[style-data]` (solid) Hat:
  ```
  low        HH x.o.x.o.x.o.x.o.        eighths
  mid, high  HH xoxoxoxoxoxoxoxo        sixteenths, the off-sixteenths soft
  open       HH xoxoxoxoxoxoxo..  OH ..............x.     the hat opens on the "and" of 4
  ```
  The open hat is every bar at high energy and a per-section choice (35% of sections) at mid; never at low.
- ST-funk-09 `[style-data]` (solid) The two-bar beat: in the second and fourth bars of each phrase, beats 3 and 4 are "turned round" one way, chosen once per section so every answer bar of the section matches. Quiet sections: add a kick on the "a" of 3 (1) or on the "a" of 4 (1). Mid and high: kick on the "a" of 3 (2), kick on the "a" of 4 into the One (2), ghost snares on the "e" and "a" of 4 (2), or the hat opened on the "and" of 4 (1). If the chosen turn would change nothing in a bar, the next one in the list is used.
- ST-funk-10 `[style-data]` (solid) Fill length in steps. Phrase: low 2, mid 2, high 4. Section: 4 at every tier. Funk fills are never longer than one beat.
- ST-funk-11 `[style-data]` (solid) Fill shapes: snare, ghosts and the kick between them, never a run down the toms; the right hand keeps the hat going except in the hit and the crescendo.
  ```
  ghost drag        2: HH xo  SN gX              4: HH x.x.  SN ggxX
  the hit (stab)    2: SN .X  KK x.              4: SN X..X  KK ..x.
  kick-snare        2: HH xo  SN .X  KK x.       4: HH xoxo  SN .g.X  KK x.x.
  hat cut           2: OH x.  HF .x  SN .X       4: OH X...  HF ..x.  SN ..gX
  snare sixteenths  2: SN xX                     4: SN oxxX
  ```
  (HF is the hat foot closing the open hat.) At low energy a fill's hat line is eighths.
- ST-funk-12 `[style-data]` (solid) Which fill where. Phrase end: ghost drag (3), hat cut (2), kick-snare (1). Section end: kick-snare (2), the hit (2), ghost drag (1), snare sixteenths (1). Top of the form, a lift into a louder section, or the set-up into the ending: the hit (3), snare sixteenths (2), hat cut (1).
- ST-funk-13 `[style-data]` (solid) Time is on the hi-hat throughout; there is no ride pattern.
- ST-funk-14 `[metric]` (solid) Backbeat in at least 90% of bars; kick on the One in 95%; 1 to 5 ghosts per bar; at least half of answer bars audibly differ from the bar before; a section turns round the same way in at least 86% of its answer bars.

### Bass

- ST-funk-15 `[style-data]` (solid) One riff per section, on the sixteenth grid. `R` root, `O` octave above, `5` fifth, `7` the b7 (on a chord with no b7, the root's octave takes that seat), `m` a muted dead note on the root:
  ```
  R..mR.O.m.R..7O.
  R...m.R.O..R.m5.
  R..m..RO..R..7.m
  R.O.m.R...R.m.O.
  R......7O.R..5..
  ```
- ST-funk-16 `[style-data]` (solid) By energy. Low: roots only, on the riff's root positions and wherever the kick plays; no ghosts, no octave pops. Mid: the riff, minus dead notes that fall on an "a" sixteenth, plus a root wherever the kick plays and the riff is silent. High: the whole riff, plus roots on unclaimed kicks.
- ST-funk-17 `[style-data]` (solid) A chord's arrival always gets its root, whatever the riff says there.
- ST-funk-18 `[style-data]` (solid) Articulation: short. A note lasts 75% of the gap to the next note, counted as at most 3 steps (so never more than 2.25 steps); a dead note is half a step. Velocity 112 on a beat, 94 off it, 52 for a dead note.
- ST-funk-19 `[style-data]` (solid) Register: each section fixes its octave (root nearest a per-section anchor between C2 and E2, within E1 to E3), so the riff keeps its octave from bar to bar. Octave pops fold down if they would pass A3 (57); the b7 drops below the root when it would leave the register.
- ST-funk-20 `[style-data]` (solid) Over a slash chord the 5 and 7 are still measured from the chord's root, not from the bass note (over C/E the 5 is G, never B; over C7/E the 7 is Bb).
- ST-funk-21 `[style-data]` (solid) Into a change: when the riff's last note falls on the last sixteenth before the next chord, 30% of the time it becomes the half step below the next root. A riff tone within a beat of the change that sits a half or whole step from the next root is moved to the octave beside that root.
- ST-funk-22 `[metric]` (solid) 10% to 60% of bass notes are sixteenth syncopations; at least 35% of kicks have the bass in unison.

### Chords

Clavinet (the default keyboard).

- ST-funk-23 `[style-data]` (solid) Voicing: the three-note stab. On a seventh chord: 3rd, 7th and the 9th on top (a dominant with a written 13th takes the 13th on top; half-diminished is b3, b5, b7). On a triad: root, 3rd, 5th.
- ST-funk-24 `[style-data]` (solid) One stab riff per section, equal weights:
  ```
  ..x..x.x...x.x..
  .x..x..x.x..x...
  ..x...x...x..x.x
  x..x..x...x.x...
  ```
  Low energy keeps only the stabs that fall on an "and". Mid drops one stab, the same one in every bar of the section (a thinner riff, not a stuttering one). High plays it all. If a chord would get no stab, it gets one on its first "and".
- ST-funk-25 `[style-data]` (solid) Articulation: every stab 0.9 of a sixteenth; velocity 98 on an "and", 88 elsewhere. The keyboard keeps its figure under a soloist (no call and response).

Rhythm guitar.

- ST-funk-26 `[style-data]` (solid) Grip: three strings, the "E9" shape (3rd, 7th, 9th on the top strings), D3 to G5 (50 to 79), top aimed at F#4 (66) and held there firmly (the hand stays in one position on the neck), no open strings.
- ST-funk-27 `[style-data]` (solid) Chicken scratch, one line per section, sixteenth pendulum (the hand never stops):
  ```
  -.-xX-x--.-xX-x-     backbeat stabs with a sixteenth pickup
  x--x--x--x-xX-x-     the One, then dotted-eighth stabs (three against four) landing on beat 4
  --x-X--x-x--X-x-     stabs on the "and"s and around the backbeat
  ```
  Low energy: the stabs only, no scratches. Mid: scratches on the eighths only. High: every sixteenth sounds (the written rests become scratches at velocity 40). A stab rings 0.9 of a sixteenth.
- ST-funk-28 `[metric]` (solid) Keys and guitar: at least 60% of strikes off the beat, at least 90% short. Guitar: 8 to 16 strikes a bar, 30% to 80% of them scratches.

### Soloist

Default lead is alto sax, phrased like a horn section.

- ST-funk-29 `[style-data]` (solid) Notes: the chord's own scale, plus the key's minor pentatonic where it suits (always in a minor key; in a major key only over the I and the IV). Changes land on the 5th first, then 3rd, 7th, root last. Phrases rest on the root first, then 5th, 3rd.
- ST-funk-30 `[style-data]` (solid) Rhythm cells, clipped sixteenths with rests inside the bar:
  ```
  sparse  x..x..x.........   ..x.x..x........   x.x...x.x.......   ....x..x.x......
  mid     x..x..x.x.x.....   ..x.xx.x..x.x...   x.xx..x.x..x....   x..x.x..x..x.x..
  busy    x.xx.xx.x.xx.x..   xxx.x.xx.x.x.x..   ..xx.x.xx.x.xx..   x.x.xx.x.xx.x.x.
  phrase endings  x.x.x-----......   x-------........   ..x.x.x---......   x..x..x-----....
  ```
- ST-funk-31 `[style-data]` (solid) Head: period form. Cells `x..x..x.x.......`, `..x.x..x..x.....`, `x.x...x.x-......`, `x..x.x..x-......`; endings `x-------........`, `x.x.x-------....`.
- ST-funk-32 `[style-data]` (solid) Habits: chromatic approach 0.25; enclosure 0.05; riff repeat 0.50 (a riff repeated bar after bar more often than not); a solo figure is played as a stab on one repeated pitch before the line moves 0.45 of the time (head figures 0.20); roomier phrase 0.30; no bends; scoop 0.20; vibrato only on notes of 12 steps or longer; a fall off the last note of a phrase 0.35.
- ST-funk-33 `[style-data]` (solid) No pickups and no barline ties in the solo book.
  - This band, since 2026-11-17: funk's solo does lead in, three phrases in ten of those that would start on the one after a breath, with sixteenth figures into the One (docs/decisions/soloist.md, "the soloist's pickups": "A horn section mostly hits the one: three in ten"); Brandon passed the pickups by ear on 2026-11-19 (`soloist-changes-awesome`). `solo.entered-early` reads a mean of 0.19 at the default setting (one take in ten above 0.33). Still no barline ties (`solo.barlines-tied` 0).
- ST-funk-34 `[style-data]` (solid) Guide-tone head: cells `x-.x-.x-------..` (the 3+3+2), `x-..x-.x------..`, `..x-.x..x-.x-...`, `x-x-...x---.x-..`, `x--x----x------x` (the "a" of 4 tied over the barline: the anticipated One); turns `x-.x-.x-x-......`, `x---...x-------.`, `..x-.x..x-......`; endings `x-----------....`, `x-------------..`; close `x-------------..`.
- ST-funk-35 `[metric]` (solid) At least 80% of notes short; rests inside 40% to 85% of bars; 8% to 20% repeated notes; roots and fifths on 45% to 80% of changes; under 5% leaps.

### Anticipation

- ST-funk-36 `[style-data]` (solid) Keyboard: a stab in the last eighth of the bar plays the next chord early and ties over: 0% low, 15% mid, 25% high. No mid-bar pushes.
- ST-funk-37 `[style-data]` (unclear) Only one of the four keyboard riffs has a stab in the last eighth (on the "a" of 4), so the keyboard's real push rate depends on the section's riff and is near zero for three of them. This looks accidental.
- ST-funk-38 `[style-data]` (solid) Guitar: 0% low, 10% mid, 20% high, on a stab in the last eighth (every scratch line has one on the "and" of 4).
- ST-funk-39 `[style-data]` (solid) Drums: the answer bar's kick on the "a" of 4 pushes into the One. Bass: the last-sixteenth chromatic approach (ST-funk-21). The lead's guide-tone head can anticipate the One by a sixteenth.

### Endings and turnarounds

- ST-funk-40 `[style-data]` (solid) Final chord: the I9 when the chart's tonic is a dominant; the 6/9 on a tune whose tonic is not a dominant (a b7 there would turn the last chord into V7 of IV); the im9 in minor.
- ST-funk-41 `[style-data]` (solid) Gesture: the dead stop. The bar before gets a set-up fill (one beat), then the whole band hits beat 1 for an eighth and is silent. Drums: kick, snare and closed hat accented on 1, and no cymbal (a crash would ring over the silence). Bass velocity 108, comp 92.

### Arrangement arc

- ST-funk-42 `[style-data]` (solid) Full default arc; lifts may cross into the high tier.
- ST-funk-43 `[style-data]` (solid) Tier summary: low is eighth-note hat, no ghosts, bass roots on the kick, off-beat stabs only; mid adds sixteenth hats, ghosts, the riff, the full stab riff minus one; high adds the open hat every bar, dead notes and pops in the bass, every stab, the guitar scratching every sixteenth.

### Instruments and mix

- ST-funk-44 `[style-data]` (solid) Defaults: clavinet, alto sax lead, fingered electric bass, acoustic kit.
- ST-funk-45 `[style-data]` (unclear) The older genre table names a clean electric guitar as the funk lead; the style says sax and wins when the sax is installed.
- ST-funk-46 `[style-data]` (solid) Mix: master make-up +9.4 dB.

## Style: rock

Straight-eighth backbeat rock: kick on 1 and 3, driving eighth-note bass, triads.

### Tempo and feel

- ST-rock-01 `[style-data]` (unclear) No tempo in the style. Attached elsewhere: imported "Rock", "Pop Rock", "Even 8ths" 120 BPM; stock grooves 85 (pop ballad), 110, 120, 120 and 140 (50s rock); loudness reference 118. Read as 85 to 140, default 120.
- ST-rock-02 `[style-data]` (solid) Straight eighths (swing 0). Lean: bass 0 ms (right on the drummer), comp +3 ms (the chords sit under the backbeat, not on top of it), lead +4 ms. Humanize 35.
- ST-rock-03 `[style-data]` (solid) Other meters: per-pulse cells (kick on downbeat pulses, doubled on its "and" on strong pulses at high energy; snare on backbeat pulses; eighth-note hat); the guitar strums once per pulse and lets it ring.

### Drums

- ST-rock-04 `[style-data]` (solid) Kick, one per section, weights low / mid / high. All keep 1 and 3.
  ```
  KK x.......x.......   (6 / 3 / 1)
  KK x.......x.x.....   (2 / 4 / 4)   "and" of 3
  KK x.....x.x.......   (1 / 3 / 3)   "and" of 2
  KK x.......x.....x.   (1 / 2 / 3)   "and" of 4
  KK x.x.....x.x.....   (0 / 1 / 3)
  ```
- ST-rock-05 `[style-data]` (solid) Grooves:
  ```
  low    HH o.g.o.g.o.g.o.g.   SN ....x.......x...   (cross-stick instead of snare below energy 0.30)
  mid    HH x.o.x.o.x.o.x.o.   SN ....X.......X...
  high   half of sections:  RD x.o.x.o.x.o.x.o.   HF ....x.......x...   SN ....X.......X...   (the chorus sound)
         the other half:    HH X.x.X.x.X.x.X.x.   SN ....X.......X...
  ```
- ST-rock-06 `[style-data]` (solid) Lift at mid energy: in the last bar before a new section's crash, when that bar has no fill, the hat opens on the "and" of 4 (`HH x.o.x.o.x.o.x...`, `OH ..............x.`).
- ST-rock-07 `[style-data]` (solid) Answer bars (second and fourth of a phrase, back half only, one turn per section). Quiet: a soft kick on the "and" of 4 (2) or the "and" of 3 (1). Mid and high: kick on the "and" of 4 (3), kick on the "and" of 3 (2), hat opened on the "and" of 4 (2; only when the hat is keeping time), a soft snare on the "and" of 4 answering its own backbeat (1).
- ST-rock-08 `[style-data]` (solid) Fill length in steps. Phrase: low 2, mid 4, high 4. Section: low 4, mid 4, high 8.
- ST-rock-09 `[style-data]` (solid) Fill shapes; the kick holds the quarter notes under any fill that leaves the time:
  ```
  tom run        2: TM x.  TL .X     4: TH x...  TL ..X.  KK x...                   8: SN x.......  TH ..o.....  TM ....o...  TL ......X.  KK x...x...
  sixteenth run  2: TH o.  TL .X     4: SN x...  TH .o..  TM ..o.  TL ...X  KK x... 8: SN xooo....  TH ....oo..  TM ......o.  TL .......X  KK x...x...
  snare build    2: SN xX            4: SN oxxX  KK x...                            8: SN o.o.oxxX  KK x...x...
  floor unison   2: SN X.  TL X.     4: SN x.X.  TL x.X.  KK x...                   8: SN x.x.x.X.  TL x.x.x.X.  KK x...x...
  pickup         2: SN oX            4: HH x...  SN ..oX
  ```
- ST-rock-10 `[style-data]` (solid) Which fill where. Phrase end: pickup (3), snare build (2), tom run (1). Section end: tom run (3), snare build (2), floor unison (2). Top of the form or a lift into a louder section: sixteenth run (3), floor unison (2), tom run (1).
- ST-rock-11 `[metric]` (solid) Backbeat in 90% of bars, kick on 1 in 95%, answer bars differ at least half the time and hold one way within a section at least 83%.

### Bass

- ST-rock-12 `[style-data]` (solid) Low tier: roots locked to the kick (one note wherever the kick plays, plus the chord's arrival), each held 95% of the gap.
- ST-rock-13 `[style-data]` (solid) Mid and high: driving eighth-note roots, each 0.85 of an eighth, velocity 102 on a beat and 86 on an "and".
- ST-rock-14 `[style-data]` (solid) High tier: octave pops on off-beat eighths the section chose once, from: none, the "and" of 2, the "and" of 4, both, or the "and" of 3.
- ST-rock-15 `[style-data]` (solid) The last eighth before a chord with a different root becomes an approach note 35% of the time (20% at low energy): fifth of the target (3), nearest scale tone (3), half step below (2), half step above (1).
- ST-rock-16 `[style-data]` (solid) Register: one octave per section (anchor C2 to E2). No sixteenth syncopation at all (ceiling 5%); 1.2 to 2.2 notes per beat at normal energy.

### Chords

- ST-rock-17 `[style-data]` (solid) Piano (the default): close-position triads and sevenths with the root; a written 9th, 11th or 13th takes the 5th's place; a written 7#9 is voiced root, 3rd, b7, #9. Under 15% of strikes carry a jazz extension.
- ST-rock-18 `[style-data]` (solid) Piano rhythm. Low: one sustained strike per chord (velocity 80; a soft 64 re-strike at a barline when the chord continues). Mid: quarter notes, each 3.4 steps long. High: pumped eighths, each 1.7 steps. Velocity 92 on a beat, 76 on an "and". At most 35% of strikes are off the beat.
- ST-rock-19 `[style-data]` (solid) Guitar grips: four strings, close voicing, D3 to G5 (50 to 79), top aimed at G4 (67), open strings allowed. With no bassist: five strings with the root on the bottom, down to E2.
- ST-rock-20 `[style-data]` (solid) Guitar rhythm. Low: one downstroke per chord, left to ring. Mid: one strum line per section on the eighth pendulum, left to ring until the next strum:
  ```
  x...X.x...x.X.x.     "old faithful": down, down-up, up-down-up
  x...X...x.x.X.x.     downstrokes on the beat, a lift into 3 and 4
  ```
  High: eighth-note downstrokes throughout, each 1.6 steps, velocity 104 on beats 2 and 4, 92 on 1 and 3, 80 on the "and"s.

### Soloist

Default lead is an overdriven guitar.

- ST-rock-21 `[style-data]` (solid) Notes: the key's pentatonic (major pentatonic in a major key, with the blue minor third added over the I and IV; minor pentatonic in a minor key) plus the current chord's tones. Changes land on the 5th first, then 3rd, 7th, root. Phrases rest on the root.
- ST-rock-22 `[style-data]` (solid) Rhythm cells:
  ```
  sparse  x-------x-------   x-----x-x-------   ....x---x-------   x---x-------....
  mid     x-x-x---x-------   x---x-x-x---x---   ..x-x-x-x-------   x-x-x-x-x-------
  busy    x-x-xxxxx-x-x---   xxxxx-x-x-------   x-x-x-x-x-x-x-x-   x-xxx-x-x-xxx---     (sixteenth bursts at the peak)
  phrase endings  x---------------   x-x-x-----------   x---x-----------   ..x-x-x---------
  ```
- ST-rock-23 `[style-data]` (solid) Head: period form; cells `x---x---x-x-x---`, `x-x-x---x-------`, `x-----x-x-------`, `x-x-x-x-x---x---`; endings `x---------------`, `x-------x-------`.
- ST-rock-24 `[style-data]` (solid) Habits: chromatic approach 0.10; no enclosures; riff repeat 0.40; roomier phrase 0.25; bend into the 3rd from the blue third 0.45; bend into the root from the b7 (or the 5th from the 4th) 0.55; bend let back down 0.35; slide into an unbent landing 0.20; no scoops; vibrato on every held note of 6 steps or more. No pickups or barline ties.
  - This band, since 2026-11-17: rock's solo does lead in, at a chance of 0.45 of a phrase that would start on the one after a breath (docs/decisions/soloist.md, "the soloist's pickups": "ST-rock-24 said none because none was built for rock; the owner asked"); Brandon passed the pickups by ear on 2026-11-19 (`soloist-changes-awesome`). `solo.entered-early` reads a mean of 0.26 at the default setting (one take in ten above 0.50). Still no barline ties (`solo.barlines-tied` 0).
- ST-rock-25 `[style-data]` (solid) Guide-tone head: cells `x-x-x---x-------`, `..x-x-x-x-------`, `x-----x-x-----x-`, `x---x-x---x-x---`; turns `x-x-x-x-x-------`, `x---x-x-x-------`, `x-------x-------`; endings `x-----------....`, `x-------------..`; close `x-------------..`.
- ST-rock-26 `[metric]` (solid) Solo: 5ths and roots on 45% to 80% of changes, the 3rd or 7th on 20% to 55%, under 20% chromatic approaches, range 11 to 26 semitones.

### Anticipation

- ST-rock-27 `[style-data]` (solid) None from the comp, at any energy, keyboard or guitar. In rock a push is an ensemble hit (kick, bass and chords together); a keyboard pushing alone puts the next chord over the old bass note. It was switched off until the whole band could push together, which was never built.
- ST-rock-28 `[style-data]` (solid) What pushes exists in the drums (kick on the "and" of 4 in the kick patterns and answer bars) and in the bass's approach eighth.

### Endings and turnarounds

- ST-rock-29 `[style-data]` (solid) Final chord: the plain triad, I or i.
- ST-rock-30 `[style-data]` (solid) Gesture: the drummer rolls the band in (set-up fill of 8 steps in the bar before), everyone hits beat 1 together and the chord rings out. Drums: crash, kick and floor tom accented on 1. Bass velocity 100, comp 92.

### Arrangement arc

- ST-rock-31 `[style-data]` (solid) Full default arc. The tiers map onto song sections: verse (0.5) is mid, chorus (0.75) is high and may move to the ride, intro and breakdown are low with cross-stick below 0.30.

### Instruments and mix

- ST-rock-32 `[style-data]` (solid) Defaults: grand piano on chords, overdriven electric guitar lead, fingered electric bass, acoustic kit. The piano was a deliberate choice to stay close to the earlier default; the guitar book is the alternative.
- ST-rock-33 `[style-data]` (solid) Mix: master make-up +8.1 dB; snare +6% on the built-in kit.

## Style: disco

A machine for the dance floor: four on the floor that never lets up, the open hat on every "and", an octave-pumping bass, a guitar hand that never stops. Energy changes how hard the band digs in, never the pulse.

### Tempo and feel

- ST-disco-01 `[style-data]` (unclear) No tempo in the style. Imported "Disco" 120 BPM; loudness reference 120. Default 120.
- ST-disco-02 `[style-data]` (solid) Straight sixteenths (swing 0), machine-tight. Lean: bass -2 ms (pulling the four on the floor forward), comp 0 ms (the stabs double the open hat; any lag flams), lead +4 ms (floating over the machine). Humanize 15.
- ST-disco-03 `[style-data]` (solid) Other meters: kick on every pulse, snare on backbeat pulses, open hat on each pulse's last eighth, bass root on every pulse with the octave on its last eighth, stabs and chops on each pulse's last eighth.

### Drums

- ST-disco-04 `[property]` (solid) The kick plays all four beats in every bar at every energy, and straight through every fill (floor 98%).
- ST-disco-05 `[style-data]` (solid) Low tier:
  ```
  KK o...o...o...o...     softer, still every beat
  HH x.o.x.o.x.o.x.o.     closed eighths, no open hat yet
  SN ....x.......x...     cross-stick instead below energy 0.30
  ```
- ST-disco-06 `[style-data]` (solid) Mid and high:
  ```
  KK x...x...x...x...
  OH ..x...x...x...x.     the open hat barks on every "and"
  SN ....X.......X...
  HH skeleton    x...x...x...x...     a closed chick on each beat
     sixteenths  xo.oxo.oxo.oxo.o     beat, "e" and "a" closed; the "a" chokes the open hat ("ts-TSS-t")
  SH .g.g.g.g.g.g.g.g     shaker on the "e"s and "a"s
  ```
  Mid picks the hat per section: skeleton (1), sixteenths (2). High always plays sixteenths. The shaker plays whenever the hat is the skeleton, and always at high.
- ST-disco-07 `[style-data]` (solid) High-energy lift, every second bar: the open hat on the "and" of 4 is accented and a normal-weight snare lands on the "a" of 4 (`SN ....X.......X..x`), kicking into the next bar. A lift is louder than the time around it, never a ghost.
- ST-disco-08 `[style-data]` (solid) Fill length in steps. Phrase: low 2, mid 2, high 4. Section: low 4, mid 8, high 8.
- ST-disco-09 `[style-data]` (solid) Fills:
  ```
  2 steps (the bark)         OH X.   SN .X
  4 steps, low               SN .oxX
  4 steps, mid               SN oxxX
  8 steps, mid (disco roll)  SN x.x.xxxX        eighths on 3, sixteenths crescendo into the One
  high (the Philly fill)     toms in sixteenths down the kit: snare, high, mid, floor, a quarter of the fill each, last stroke accented
  ```
  From mid energy up, when a fill takes the hand off the open hat, the hat foot plays the "and"s so the off-beat motion never stops.
- ST-disco-10 `[metric]` (solid) At low energy the open hat is absent (ceiling 2%).

### Bass

- ST-disco-11 `[style-data]` (solid) The octave pump, one figure per section. `R` the low root, `O` its octave:
  ```
  low    R...R...R...R...   (3)     quarter roots with the kick
         R...R...R...R.O.   (2)     one octave pickup on the "and" of 4
  mid    R.O.R.O.R.O.R.O.   (4)     the pump
         R.R.R.O.R.R.R.O.   (1)     octave only on the "and"s of 2 and 4
         R.R.R.R.R.O.R.O.   (1)     pump saved for the back half
  high   R.O.R.O.R.O.R.O.   (2)
         R.ORR.ORR.ORR.OR   (2)     the gallop: a sixteenth root on each "a"
  ```
- ST-disco-12 `[style-data]` (solid) Register is fixed for the whole song: every root sits in one octave starting at E1 or F1 (28 or 29, chosen once), so the octave above always stays on the neck. Mean pitch 34 to 42.
- ST-disco-13 `[style-data]` (solid) Articulation: bouncing. Each note is 80% of its gap, counted as at most 2 steps (3 at low energy). Velocity: root on a beat 102, root off the beat 78, octave 94.
- ST-disco-14 `[style-data]` (solid) Passing tones: never at low energy. Otherwise the last bar of a phrase always leads into the next phrase's first chord, and a section whose bassist "walks" (30% of sections at mid, 60% at high) leads into every change. The lead-in replaces the last note within an eighth of the change with the half step below the next root (above if below is off the instrument), velocity 90.
- ST-disco-15 `[style-data]` (solid) A slash chord pumps its slash note. A chord always arrives on its root.

### Chords

Guitar (the default).

- ST-disco-16 `[style-data]` (solid) Grip: small and bright, high on the neck. Up to four strings of the stab voicing (3rd, 7th, 9th; a triad on a plain chord), Bb3 to G5 (58 to 79), top aimed at C5 (72) and held there, no open strings. It stays up there even with no bassist: the chuck is a texture, not a bottom. Mean lowest note 60 to 68.
- ST-disco-17 `[style-data]` (solid) The chuck, one line per section on the sixteenth pendulum. Every sixteenth is a stroke; the chord sounds only where marked.
  ```
  ands    --X---X---X---X-     the chop on every "and", with the open hat
  pickup  --Xx--X---Xx--X-     a light upstroke on the "a" of 1 and 3
  push    -xX--xX--xX--xX-     a light upstroke on each "e" into the chop ("a-CHANK")
  nile    X-----Xx------Xx     an accented chop on the One, the "and"s of 2 and 4 kept, "a" pickups
  ```
  Low: ands only, with the scratches thinned to eighths. Mid: ands (1) or nile (1). High: ands (1), pickup (1), push (2), with the scratches louder (downstroke 58, upstroke 44). A chop rings 0.9 of a sixteenth.

Keyboard (Rhodes or piano).

- ST-disco-18 `[style-data]` (solid) Stab figures per section:
  ```
  low    ..x...x...x...x.
  mid    ..x...x...x...x.  (3)    ..x...xx..x...xx  (1)
  high   ..x...xx..x...xx  (2)    ..x...x...x...x.  (1)    ..x..x.x..x..x.x  (1)
  ```
  The stab on every "and" doubles the open hat; the extra sixteenths push into 3 and into the next bar. Stabs never land on 1 or 3 (ceiling 10%).
- ST-disco-19 `[style-data]` (solid) Stab length 0.9 of a sixteenth (1.5 at low energy). Velocity on the "and": 94 (100 at high); on the other sixteenths: 82 (90 at high).
- ST-disco-20 `[style-data]` (solid) Voicing by energy: low plays plain close triads and sevenths; from mid up the stabs go lush, rootless with the 9th (and a written 6th) on top. An organ in this seat holds each chord as a pad, the strings' role.

### Soloist

Default lead is alto sax: a horn soaring over the floor.

- ST-disco-21 `[style-data]` (solid) Notes: the pentatonic on each chord's own root (major: 1 2 3 5 6; dominant adds b7; minor: 1 2 b3 4 5 b7), so it sings and never rubs. Changes land on the 3rd or 7th. Phrases rest on 3rd, root, 5th.
- ST-disco-22 `[style-data]` (solid) Register: the line's home is a major 3rd (4 semitones) above the instrument's usual home, over the chuck rather than inside it.
- ST-disco-23 `[style-data]` (solid) Rhythm cells (funk's sixteenths made legato):
  ```
  sparse  x-------x-x-----   ..x-x-------....   x-----x-x-------   ......x-x-x-----   x---x-------....
  mid     x-xx-x-x---x-x--   x-x-xx-x----x-x-   ..x-x-xx-x------   x--x--x-x-x-----   x-x-x--x-x------
  busy    xxxxx-x-xxxx-x--   x-xxx-xxx-xxx-x-   xxxxxxxx-x-x-x--   ..xxxxxxx-x-x---   x-x-xxxxx-x-----
  phrase endings  x---------------   x-x-x-----------   ..x-x-----------   x.x-x-----------   x--x------------
  ```
  Every phrase ends on a big held note.
- ST-disco-24 `[style-data]` (solid) Head: period form, a singable hook. Cells `x-x-x---x-x-----`, `x--x--x-x-------` (3-3-2), `..x-x-x-x---x---`, `x---x-x-x-x-----`, `x-x---x-x-------`; endings `x---------------`, `x--x------------`, `x-x-x-----------`.
- ST-disco-25 `[style-data]` (solid) Habits: chromatic approach 0.15; enclosure 0.05; riff repeat 0.35; a figure pumps one repeated pitch on the eighths before lifting off it 0.80 (solo and head alike; never two sixteenths running on one pitch); roomier phrase 0.20; scoop into a long note 0.30; vibrato on every note of 6 steps or more; fall off a phrase end 0.30; on a guitar, bend into the 3rd 0.30 and into the root 0.20.
- ST-disco-26 `[style-data]` (solid) Guide-tone head: cells `x-x-x---x-------`, `x---x---x-----x-`, `x--x--x-x-------`, `x-------x-x---x-`, `x-x-----x-----x-`; turns `x-x-x-x-x-------`, `x---x-x-x-------`, `x-------x-------`; endings `x-------------..`, `x-----------....`; close `x-------------..`. 18% to 40% of bars push into the next One.
- ST-disco-27 `[metric]` (solid) Head: 2.5 to 5.5 notes a bar, a guide tone on 65% of changes. Solo: 10% to 35% rests (it breathes but keeps the floor moving), 60% to 90% short notes, range 11 to 24 semitones.

### Anticipation

- ST-disco-28 `[style-data]` (solid) Disco changes land on the One with the kick. Guitar: 0% low and mid, 15% at high (the chop on the "and" of 4). Keyboard: 0% low, 30% mid, 50% high, on a stab in the last eighth. No mid-bar pushes.
- ST-disco-29 `[style-data]` (solid) On an organ, when a figure has two stabs in the last eighth, both are pushes of the same chord and only the first is pressed (pressing twice a sixteenth apart is a stutter).

### Endings and turnarounds

- ST-disco-30 `[style-data]` (solid) Final chord: major 7th in major, minor 7th in minor, and the I9 when the chart's tonic is a dominant (a major 7th would contradict the chart's b7).
- ST-disco-31 `[style-data]` (solid) Gesture: held, with a set-up fill (the snare roll or tom run, 8 steps). Drums on 1: crash, kick and snare accented, plus the shaker. Bass velocity 106, comp 92.

### Arrangement arc

- ST-disco-32 `[style-data]` (solid) Full default arc. The pulse never changes; low energy closes the hat, softens the kick and plays quarter-note roots; mid opens the hat and starts the pump; high adds sixteenth hats, shaker, the every-other-bar lift, the gallop and tom fills.

### Instruments and mix

- ST-disco-33 `[style-data]` (solid) Defaults: clean electric guitar on chords, alto sax lead, fingered electric bass, acoustic kit.
- ST-disco-34 `[style-data]` (unclear) The older genre table says Rhodes on chords. The style overrides it on purpose: drums and bass already own the beat and the "and", so a Rhodes stab on every "and" only doubles the open hat, while the continuous sixteenth chuck is the motion that tells disco from four-on-the-floor pop. The Rhodes remains a strong alternative.
- ST-disco-35 `[style-data]` (solid) Mix: master make-up +7.3 dB.

## Style: neo-soul

The pocket: a soft drum loop of one or two bars with a lazily syncopated kick, and a bass and Rhodes that sit well behind it, the bass deepest.

### Tempo and feel

- ST-neosoul-01 `[style-data]` (unclear) No tempo in the style. Stock groove 85 BPM; loudness reference 84. A note in the style puts one sixteenth at 165 to 195 ms, which is about 77 to 91 BPM. Default 85.
- ST-neosoul-02 `[style-data]` (solid) Swing 45 on sixteenths: the off-sixteenth lands at 57.5% of its pair (138 of 240 ticks), an MPC swing of about 57. First tuned at 30 and raised by ear.
- ST-neosoul-03 `[style-data]` (solid) Lean: Rhodes +25 ms, bass +32 ms, lead +25 ms. The deepest pocket of any style; the bass is the bottom of it and nothing leans further.
- ST-neosoul-04 `[style-data]` (solid) Humanize 60 (about plus or minus 5.4 ms of settled placement), the loosest of any style. Bass lean plus humanize stays inside 40 ms.
- ST-neosoul-05 `[style-data]` (solid) Other meters: kick on downbeat pulses, snare on backbeat pulses, a secondary downbeat gets the kick late on its "and"; bass root on each strong pulse with a fifth leading on; the keyboard strikes each pulse and holds.

### Drums

- ST-neosoul-06 `[style-data]` (solid) Kick, one per section, weights low / mid / high:
  ```
  KK x.........x.....   (3 / 3 / 1)   boom-bap: the One and the "and" of 3
  KK x.......x.......   (2 / 2 / 1)   plain 1 and 3
  KK x......x..x.....   (0 / 2 / 2)   pickup on the "a" of 2 stumbling into the "and" of 3
  KK x..x......x.....   (0 / 1 / 2)   stumble on the "a" of 1
  KK x......x..x....x   (0 / 0 / 3)   the Dilla skip
  ```
  The expressive kicks are held back until high energy so a quiet section reads as laid-back, not busy.
- ST-neosoul-07 `[style-data]` (solid) Snare: accented backbeat on 2 and 4. Ghosts on "e"s and "a"s, one set per section; none at low energy, and high energy only adds to the mid set:
  ```
  set 1   mid .......g...g...g      high ...g...g.g.g...g
  set 2   mid ...g......g....g      high ...g..g...gg...g
  set 3   mid .....g.g.......g      high ..g..g.g.....g.g
  ```
  Below energy 0.35 the backbeat is a cross-stick and there is no snare at all.
- ST-neosoul-08 `[style-data]` (solid) The displaced four: at mid and high, 35% of sections move the backbeat on 4 a whole sixteenth late, to the "e" of 4, on the second bar of every pair. It makes the loop two bars long, like a sampled break. It is a written rhythm, not a micro-drag; the drums never lean.
- ST-neosoul-09 `[style-data]` (solid) Hat: low `o.g.o.g.o.g.o.g.`; mid and high `xgogxgogxgogxgog` (swung sixteenths, "e" and "a" ghosted). The whole hat part is then played at 80% of its written velocity (the feather touch, so kick and snare speak through it).
- ST-neosoul-10 `[style-data]` (solid) At high energy, on the second bar of each pair, the hat opens on the "and" of 2 or the "and" of 4 (one choice per section).
- ST-neosoul-11 `[style-data]` (solid) Fills barely exist. Length in steps: phrase low 0, mid 0, high 2; section low 2, mid 2, high 4. Two steps is a short snare figure ending in an accent; four steps is a snare on beat 4 and an accented mid tom on its "and". A busy fill breaks the loop's spell.
- ST-neosoul-12 `[metric]` (solid) 2.5 to 4.5 ghosts a bar (under 0.5 at low energy); a section keeps its kick in at least 90% of bars; 5% to 30% of bars have the late four.

### Bass

- ST-neosoul-13 `[style-data]` (solid) One line per section, on the sixteenth grid, weights low / mid / high. `R` the chord's bass note, `5` fifth, `7` seventh, `9` a hammer-on to the 2nd, `O` octave, `m` dead note, `-` hold, `.` silence:
  ```
  R-----------..5-   (3 / 1 / 0)   a long root and a fifth on the "and" of 4
  R-------...5-7-.   (2 / 3 / 1)   half note, a breath, fifth on the "a" of 3, seventh on the "e" of 4
  R-----.R--5-..7-   (0 / 3 / 2)   the lazy re-strike on the "a" of 2
  R--9-.R-...O-5-.   (0 / 1 / 3)   the hammer-on; octave on the "a" of 3 falling to the fifth
  R-.mR---..5-m7-.   (0 / 0 / 2)   dead-note chatter around the backbeat
  ```
  The rests are written as carefully as the notes; the kick is left room to speak.
- ST-neosoul-14 `[style-data]` (solid) Pitches: the fifth and seventh are placed nearest the previous note, so from the root they fall below it (the 5th a fourth under, the b7 a step under). On a triad the "seventh" is the major 6th if the scale has one, else the root. The hammer-on's 2nd sounds only where the chord's scale has a natural 2nd.
- ST-neosoul-15 `[style-data]` (solid) Register: deep, and fixed for the whole song at every energy. Roots sit nearest a song-wide anchor between A1 and C2 (33 to 36); mean pitch 31 to 38.
- ST-neosoul-16 `[style-data]` (solid) Articulation: warm, not punchy. Notes last 92% of their written hold. Velocity 100 on a chord's arrival, 90 on other beats, 84 on off-beat sixteenths, 80 on an approach note, 50 for a dead note (half a step long).
- ST-neosoul-17 `[style-data]` (solid) Lead-ins. The last bar of a phrase always leads into the next phrase's first chord (adding a pickup on the last sixteenth if the line has nothing in its last beat). Inside a phrase, half the sections lead into every change and the other half let the line's own ending carry them. Kinds: half step from below (5), a scale step (2), the target's fifth (2), half step from above (1). A lead-in is played only when the line is already within a fifth of the target.
- ST-neosoul-18 `[metric]` (solid) 25% to 60% sixteenth syncopation; 15% to 45% of the bar silent; 60% to 95% of half-step approaches come from below.

### Chords

Rhodes (the default).

- ST-neosoul-19 `[style-data]` (solid) Voicing is chosen chord by chord, the richest colour the chord's own scale allows. Seventh chords: a two-handed spread of five notes, a low left-hand shell (root and 7th, or 3rd and 7th) with the colours stacked in fourths above it (Dm9 as F-C | E-A-D; Cmaj7 as C-B | E-A-D). Plain triads: the open 6/9 (3, 5, 6, 9). Where the scale lacks a colour (a natural 9 over a phrygian minor, a 6th over an aeolian triad), the plain close chord.
- ST-neosoul-20 `[style-data]` (solid) Register: the keyboard may reach down to C3 (48) for the spread's left hand; mean lowest note 50 to 56.5.
- ST-neosoul-21 `[style-data]` (solid) While a soloist's phrase is live the spread closes up to the one-hand rootless voicing and the whole voicing stays under the line; it opens up again in the gaps. All strikes in one bar use the same hands.
- ST-neosoul-22 `[style-data]` (solid) Figures, one per section. `x` strike, `-` held:
  ```
  low    x-------------..  (3)    x--------.x-----  (2)    .x------------..  (1)
  mid    x-----.x------x-  (3)    .x-------.x---x-  (2)    x--...x-----.x--  (2)
  high   x--x---x--x---x-  (2)    .x----x---x--x--  (2)    x-----.x--x---.x  (1)
  ```
  Chords are held for beats, not stabbed. Lazy re-strikes sit on the "a" of 2 dragging into 3, or on the "e" of 1 leaving the One to the bass.
- ST-neosoul-23 `[style-data]` (solid) Velocity 72 on a beat (laid in softly), 80 off it (the lazy re-strikes lean).
- ST-neosoul-24 `[style-data]` (solid) With a soloist: a strike under the line lays out 40% of the time and the previous chord simply rings on through it; a breath gets a stab 50% of the time.
- ST-neosoul-25 `[taste]` (unclear) Rolled Rhodes chords were wanted and not built; every keyboard chord is struck with all notes together.

Guitar.

- ST-neosoul-26 `[style-data]` (solid) Grips: four strings in the middle of the neck, E3 to G5 (52 to 79), top aimed at A4 (69); the rootless extended grip where the scale allows (an add9 over a triad), else close. With no bassist: five strings, root on the bottom.
- ST-neosoul-27 `[style-data]` (solid) Lines, one per section, sixteenth pendulum. `x` the whole grip, `d` a double-stop picked out of the grip the hand is holding:
  ```
  low    x.........d.....  (2)    x.......d.......  (1)
  mid    x......d..d.....  (3)    ..x...d....d..d.  (2)    x.....d..d...d..  (2)
  high   x..d..d.x..d.d..  (2)    X.....d.d.d...d.  (2)    ..x.d..dx..d..d.  (1)
  ```
  No scratches. Strokes are gentle (85% of normal strum velocity) and ring for a beat. The whole grip always falls on a downstroke position.
- ST-neosoul-28 `[style-data]` (solid) A double-stop is two strings, adjacent or one apart. Preference order: it must contain a guide tone (3rd, 7th or 6th); then the interval is a 3rd or a 6th; then adjacent strings; then the higher strings. At least 70% are 3rds or 6ths and 90% carry a guide tone.

### Soloist

Default lead is a clean electric guitar, behind a singer.

- ST-neosoul-29 `[style-data]` (solid) Notes: the pentatonic on each chord's own root. Changes land on the 3rd, then the chord's written colour (9th, a minor chord's 11th, 13th, a major chord's #11; never an altered tension), then 7th, 5th, root. Phrases rest on the written 9th where there is one (the phrase floats), else the 3rd.
- ST-neosoul-30 `[style-data]` (solid) Register: home is a major 3rd above the instrument's usual home, over the Rhodes.
- ST-neosoul-31 `[style-data]` (solid) Rhythm cells, late entries on "e"s and "a"s:
  ```
  sparse  ...x-x------....   ..x-x--x-----...   x--x-----.......   ......x-xx-x----   .x-x-------.....
  mid     ..xx-x---x-x----   x--x-xx-x-------   ...x-x-xx-x--...   x-.x-x---..x-x--   .x-x-x--x-x-----
  busy    x-xxx-x-xx-x----   ..xxxx-x-x-xx-x-   xxx-x--xx-x-x---   x-x-xxx-x--x-x--   .xxx-x-x-xxx-x--
  phrase endings  ..x-x-----------   x--x------------   ...x-x----------   x-----------....   .x-x-x----------
  ```
- ST-neosoul-32 `[style-data]` (solid) Head: period form, a vocal line. Cells `..x-x--x-x------`, `x---..x-x-x-----`, `...x-x-x---x----`, `x--x--x-----....`, `.x-x-x-x-x------`; endings `x---------------`, `..x-------------`, `x--x------------`.
- ST-neosoul-33 `[style-data]` (solid) Habits: chromatic approach 0.30; enclosure 0.12; riff repeat 0.15; roomier phrase 0.45 (the most space of any lead); half-step slide up into the 3rd 0.40; bend into the root 0.08; scoop (on a horn) 0.35; vibrato only on notes of 8 steps or longer.
- ST-neosoul-34 `[style-data]` (solid) Guide-tone head: cells `...x-x--x-----..`, `x-----.x---x----`, `..x-x--x--------`, `x---..x-x--x----`; turns `..x-----x-------`, `...x-x--x-------`, `x--x---x-------.`; endings `.x------------..`, `..x-----------..`, `x-------------..`; close `x-------------..`.

### Anticipation

- ST-neosoul-35 `[style-data]` (solid) Rhodes over the barline: 10% low, 25% mid, 35% high, on a strike in the last eighth.
- ST-neosoul-36 `[style-data]` (solid) Rhodes mid-bar: a strike in the eighth before a change (the "a" of 2 before a chord on 3) always plays the new chord and ties over it.
- ST-neosoul-37 `[style-data]` (solid) Guitar over the barline: 0% low, 10% mid, 20% high. Mid-bar: the pair picked just before a change belongs to the new chord, and the line's next pick on the beat still plays (a picked line runs through the change).
- ST-neosoul-38 `[style-data]` (solid) Kick on the "a" of 4 (the Dilla skip) anticipates the One at high energy. The bass's sixteenth pickup at phrase ends is the other push.

### Endings and turnarounds

- ST-neosoul-39 `[style-data]` (solid) Final chord: maj9 in major, m9 in minor, the dominant 9 on a dominant tonic.
- ST-neosoul-40 `[style-data]` (solid) Gesture: soft. No set-up fill, no crash. The chord is struck on 1 and rings to the end of the bar, quietly: comp velocity 72 (not the usual 92), bass at 80% of its ending weight of 96. Drums: a soft kick and a soft open hat on 1.
- ST-neosoul-41 `[style-data]` (solid) The turnaround is the two-bar loop itself: the displaced four and the open-hat breath on the second bar of each pair.

### Arrangement arc

- ST-neosoul-42 `[style-data]` (solid) Full default arc. Energy adds: ghosts, sixteenth hats, the syncopated kicks, the busier bass lines and re-strikes. The register and the pocket never change.

### Instruments and mix

- ST-neosoul-43 `[style-data]` (solid) Defaults: Rhodes, clean electric guitar lead, fingered electric bass, acoustic kit. Both tables agree on the Rhodes; the older table names no lead.
- ST-neosoul-44 `[style-data]` (solid) Mix: master make-up +8.8 dB.

## Style: reggae

Roots reggae in the slow count: the one drop on beat 3, the skank on 2 and 4, a deep melodic bass with holes in it.

### Tempo and feel

- ST-reggae-01 `[style-data]` (solid) Written in the slow count, about 60 to 90 BPM; imported "Reggae" and the loudness reference are both 76. A chart written in the fast count (skank on every "and") plays the same music at double the written tempo.
- ST-reggae-02 `[style-data]` (solid) Swing 20 on sixteenths: the off-sixteenth at 53.3% of its pair (128 of 240 ticks). It lopes the hats, the organ's tap and the bass pickups without becoming a shuffle.
- ST-reggae-03 `[style-data]` (solid) Lean: bass +8 ms (drags most), comp +5 ms (a touch less, so the chop stays crisp against the hat), lead +12 ms (the horn lays back furthest). Humanize 30.
- ST-reggae-04 `[style-data]` (solid) Other meters: the drop lands on the bar's secondary downbeat when it has one, else on its backbeat pulses; the One stays empty below high energy; the skank chops at the start of every pulse but the first.

### Drums

- ST-reggae-05 `[property]` (solid) The drop on beat 3 (kick and cross-stick together, or snare in the high riddims) is in every bar at every energy (floor 90%). Beat 1 has no kick below high energy (ceiling 2% at low energy).
- ST-reggae-06 `[style-data]` (solid) Low tier, the soft one drop:
  ```
  HH o.g.o.g.o.g.o.g.
  KK ........o.......
  RM ........x.......     cross-stick
  ```
  No lift, no pickups, no answer bars.
- ST-reggae-07 `[style-data]` (solid) Mid tier, the one drop:
  ```
  KK ........X.......
  RM ........X.......
  HH per section:  x.o.x.o.x.o.x.o.  (55)   straight eighths
                   x.oox.oox.oox.oo  (45)   shuffled sixteenths: each beat's "a" is a pickup into the next
  ```
  40% of sections lift every bar with an open hat on the "and" of 4 (the closed hat removed there); every section does so in the bar before a new section when that bar has no fill.
- ST-reggae-08 `[style-data]` (solid) High tier, one riddim for the whole performance (equal chance), never switched between choruses:
  ```
  steppers   KK x...x...x...x...   SN ........X.......   HH x...x...x...x...   OH ..x...x...x...x.
  rockers    KK x.......x.......   SN ........X.......   HH x.oox.oox.oox.oo
  ```
  Both keep the drop on 3 (now a snare) and put the kick back on the One.
- ST-reggae-09 `[style-data]` (solid) Answer bars at mid and high (back half only, one turn per section): a soft cross-stick (or snare) on the "and" of 4, a pickup into the empty One (2); the drop echoed softly on the "and" of 3 (2); the hat lifted on the "and" of 4 where the section does not already lift (1).
- ST-reggae-10 `[style-data]` (solid) Fill length in steps. Phrase: low 0, mid 2, high 4. Section: low 2, mid 4, high 4. Short and late, never a bar-long run.
- ST-reggae-11 `[style-data]` (solid) Fill shapes:
  ```
  rim pickup    2: RM oX                4: RM .oxX
  the drop      2: RM .X                4: RM ...X  KK ...x          time stops; rimshot and kick on the "a" of 4
  tom pickup    2: TH o.  TL .X         4: RM x...  TH ..o.  TL ...X     "a-di-dum"
  snare drag    2: SN oX                4: SN .goX
  rim roll      2: RM xX                4: RM ooxX
  ```
  Phrase end: rim pickup (3), the drop (2). Section end: tom pickup (2), snare drag (2), rim roll (1), rim pickup (1). Top of the form or the set-up into the ending: tom pickup (3), snare drag (1).

### Bass

- ST-reggae-12 `[style-data]` (solid) One riff per section, sixteenth grid, weights low / mid / high. `R` root, `O` octave, `5` fifth, `3` third (a sus chord's 4th), `6` the scale's sixth as a passing tone, `-` hold, `.` silence:
  ```
  ..R-R-.5O---5-3.   (0 / 3 / 3)   leaves the One open, climbs to the octave on the drop, walks down the arpeggio
  R---....R-5-O-5.   (1 / 3 / 2)   plays the One, rests through 2, answers
  ..R-..3-R---5-6-   (0 / 2 / 2)   hole on 1, a third into the drop, a scale step leading on
  R-------R-----5-   (3 / 1 / 0)   heavy halves with a fifth pickup
  ........R-------   (2 / 0 / 0)   just the drop
  ```
- ST-reggae-13 `[style-data]` (solid) The bass leaves the One open only while the drummer does. Whenever the kick plays beat 1 (steppers, rockers, a crash after a fill), the bass plays the root there for a beat, and drops a root entry on the "and" of 1 so it does not stutter.
- ST-reggae-14 `[style-data]` (solid) A chord that changes mid-bar is stated on its root where it changes; a change at the barline may keep the riff's hole on the One.
- ST-reggae-15 `[style-data]` (solid) Register: deep. Roots nearest a per-section anchor between A1 and C2 (33 to 36); mean pitch 32 to 42. Notes last 92% of their written hold. Velocity 104 on beats 1 and 3 and on arrivals, 88 on pickups.
- ST-reggae-16 `[style-data]` (solid) The last note within an eighth of a change becomes a lead-in 35% of the time (fifth of the target 3, scale tone 3, half step below 2, half step above 1), and never repeats the note before it. A riff tone left a step from the next root is moved to sit beside it.
- ST-reggae-17 `[metric]` (solid) The bass plays the One in 15% to 75% of bars; 20% to 60% of the bar is silent.

### Chords

Guitar (the default).

- ST-reggae-18 `[style-data]` (solid) Grip: three strings high on the neck, a triad or root-3rd-7th, G3 to A5 (55 to 81), top aimed at C5 (72) and held there, no open strings. It stays up there with no bassist: the skank is a chop, not a bottom.
- ST-reggae-19 `[style-data]` (solid) Skank figures, one per section, sixteenth pendulum, each chop 0.8 of a sixteenth:
  ```
  plain    ....X.......X...
  double   ....Xx......Xx..     the chop and a sixteenth flick after it ("chk-a")
  ands     ..x.X.x...x.X.x.     2 and 4 plus lighter "and"s (the rockers and steppers lift)
  ```
  Low: plain. Mid: plain (3), double (1). High: plain (1), double (2), ands (2). Every chop on a beat or an "and" is a downstroke; only the flick comes up.
- ST-reggae-20 `[property]` (solid) The chop on 2 and 4 is always the loudest stroke in the hand (1.15 to 1.4 times the others at high energy) and nothing is ever played on 1 or 3 (ceiling 5%).

Keyboards.

- ST-reggae-21 `[style-data]` (solid) Voicing: tight three-note chords (triad, or root, 3rd, 7th). No extensions (ceiling 15%).
- ST-reggae-22 `[style-data]` (solid) Piano, Rhodes or clav double the skank: plain at low; plain (3) or double (1) at mid; plain (1) or double (2) at high. Chop 0.9 of a sixteenth, velocity 96, the flick 72.
- ST-reggae-23 `[style-data]` (solid) The organ bubbles instead, chopped and never held. Per beat: a hole on the beat, a felt touch on the "e" (velocity 46, half a sixteenth), the chord on the "and" (88, 0.9 of a sixteenth), a felt touch on the "a" (46). At low energy only the "and". Because it is the band's only comp, it also plays a right-hand chop on 2 and 4 (velocity 96) at every energy.
  So at mid and high, beats 1 and 3 are "rest, touch, chord, touch" and beats 2 and 4 are "chop, touch, chord, touch". The light sixteenth swing drags the "a" late, which is the bubble's lope.

### Soloist

Default lead is alto sax, the nearest thing in the band to a melodica.

- ST-reggae-24 `[style-data]` (solid) Notes: in a minor key, the key's minor pentatonic plus chord tones (dark and modal); in a major key, the chord's own scale (sweet, no blue third). Changes land on the 3rd, then root, 5th. Phrases come home to the root.
- ST-reggae-25 `[style-data]` (solid) Phrases start after the One and rest on the drop:
  ```
  sparse  ..x-x-------....   ....x---x-------   ......x-x-x-----   ..x---..x-------
  mid     ..x-x-x-x-------   x---..x-x---x---   ..x-x-..x-x-x---   ....x-x-x---..x-
  busy    ..x-x-x-x-x-x---   x-x-..x-x-x-x-x-   ..xxx-x-x---x-x-   ....x-xxx-x-x---
  phrase endings  ..x-x-----------   ....x-----------   ..x-x-x---------   ......x-x-------
  ```
- ST-reggae-26 `[style-data]` (solid) Head: AAB (a call, the call again, an answer). Cells `..x-x-x-x-------`, `....x-x-x-------`, `..x---x-x---x---`, `x---..x-x-------`; endings `..x-------------`, `..x-x-----------`.
- ST-reggae-27 `[style-data]` (solid) Habits: chromatic approach 0.10; no enclosures; riff repeat 0.45; a whole solo phrase is played again on the new chords 0.25; roomier phrase 0.45; no bends; scoop 0.25; vibrato on notes of 8 steps or longer; home register a major 3rd up; the peak stays within 10 semitones of home (a lift, not a scream).
- ST-reggae-28 `[style-data]` (solid) Guide-tone head: cells `..x-----x-------`, `..x-x---x-------`, `....x-x-x-------`, `..x---..x---x---`, `..x-----x-----x-`; turns `....x---x-------`, `..x-x-x-x-------`, `..x---x-x-------`; endings `..x-------------`, `x-------------..`; close `x-------------..`. A change on the One is sung on its "and", an eighth late.

### Anticipation

- ST-reggae-29 `[style-data]` (solid) None from the comp, guitar or keys, at any energy. The skank is the clock's off-beat and a push would smear it.
- ST-reggae-30 `[style-data]` (solid) The answer bar's cross-stick on the "and" of 4 and the bass's lead-in are the only pushes.

### Endings and turnarounds

- ST-reggae-31 `[style-data]` (solid) Final chord: the plain triad, I or i.
- ST-reggae-32 `[style-data]` (solid) Gesture: the stop. A set-up fill in the bar before (a beat of rimshots or toms), then bass and chord hit the One together for an eighth and the band drops out. Drums: kick and cross-stick accented on 1 (the one drop's own pair moved onto the One), no crash. Bass velocity 104.

### Arrangement arc

- ST-reggae-33 `[style-data]` (solid) Reggae holds its side of the high-energy line: no build, arc or repeat lift may carry a section from the one drop into steppers or rockers, or back. A section that sits under 0.70 is capped at 0.69; one that sits at or over 0.70 stays there.
- ST-reggae-34 `[style-data]` (solid) The song-length arc runs at half depth (a plain chart's climax reaches about 0.65), so the build and the breath are heard in dynamics only.

### Instruments and mix

- ST-reggae-35 `[style-data]` (solid) Defaults: clean electric guitar on the skank, alto sax lead, fingered electric bass, acoustic kit.
- ST-reggae-36 `[style-data]` (unclear) The older genre table says Hammond organ on chords. The style overrides it: on a record the organ bubbles between the skank's chops, and alone it could be rocksteady or ska, so the guitar is the default and the organ borrows the 2-and-4 chop to stay credible.
- ST-reggae-37 `[style-data]` (solid) Mix: master make-up +10.8 dB.

## Style: acoustic

The singer-songwriter and the acoustic house band: restraint around a guitar. Quiet, the guitar fingerpicks and the drummer barely plays. Louder, the guitar strums open-position chords, the bass plays root and fifth, and the backbeat fills out to a full snare.

### Tempo and feel

- ST-acoustic-01 `[style-data]` (unclear) No tempo in the style. The one stock groove (a canon progression) is 90 BPM; the loudness reference is 100. Default about 95.
- ST-acoustic-02 `[style-data]` (solid) Straight eighths with a light lilt: swing 15 on eighths, the off-beat eighth at 52.5% of the beat (252 of 480 ticks).
- ST-acoustic-03 `[style-data]` (solid) Lean: the upright bass +5 ms; comp 0; lead 0. Honest time, no affected pocket. Humanize 30 (human, never sloppy).
- ST-acoustic-04 `[style-data]` (solid) Other meters are supported with intent: kick on the first pulse, cross-stick (snare when loud) on the others, so a 3/4 folk waltz is boom-tick-tick; the strum is down on each pulse and up on its last eighth; the bass plays the root on the first pulse and the fifth on strong pulses above quiet.

### Drums

- ST-acoustic-05 `[style-data]` (solid) Low tier, one groove per section:
  ```
  half-time (2)     KK o...............   RM ........x.......   SH o.g.o.g.o.g.o.g.     kick on 1, cross-stick on 3, shaker eighths
  cross-stick (2)   KK o...............   RM ....x.......x...
  shaker only (1)   KK o...............   SH o.g.o.g.o.g.o.g.
  ```
  Never a full snare when quiet (ceiling 2%); 3 to 8 drum strokes a bar.
- ST-acoustic-06 `[style-data]` (solid) Kick at mid and high, one per section: `x.......o.......` (3), `x.....o.o.......` (1), `x.......o.....o.` (1). Beat 3 and the pickups are soft.
- ST-acoustic-07 `[style-data]` (solid) Mid tier. 35% of sections play brushes: a soft shaker on every sixteenth swelling on each beat (`SH ogggogggogggoggg`) standing in for the sweep, a soft snare tap on 2 and 4 (`SN ....o.......o...`) with the hat foot. The rest play a cross-stick backbeat (`RM ....x.......x...`) over eighths (`o.g.o.g.o.g.o.g.`) on either the hat or the shaker (half each).
- ST-acoustic-08 `[style-data]` (solid) High tier:
  ```
  SN ....X.......X...
  HH x.o.x.o.x.o.x.o.     (40% of sections: x.o.x.o.x.o.x... with a soft open hat on the "and" of 4)
  SH .g.g.g.g.g.g.g.g     shaker shimmering on the "e"s and "a"s
  ```
  16 to 24 drum strokes a bar.
- ST-acoustic-09 `[style-data]` (solid) Answer bars, all soft. Quiet: a soft kick on the "and" of 3 (1) or the "and" of 4 (1). Mid and high: soft kick on the "and" of 4 (2), on the "and" of 3 (1), a soft open hat on the "and" of 4 where the hat keeps time (1), or at high a ghost snare on the "a" of 4 (1). The drummer varies with the foot and the hat, never with a crack.
- ST-acoustic-10 `[style-data]` (solid) Fill length in steps. Phrase: low 0, mid 0, high 2. Section: low 2, mid 2, high 4.
- ST-acoustic-11 `[style-data]` (solid) Fill shapes and where:
  ```
  snare pickup   2: SN ox       4: SN o.x.
  cross pickup   2: RM ox       4: RM o.ox           never accented: no crack into a verse
  hat breath     2: OH o.  SN .o     4: HH x...  OH ..o.  SN ...o
  swirl          2: SN go       4: SN ggoo           the brush's swirl
  tom pickup     2: TL x.       4: TH o...  TL ..x.
  ```
  Low: phrase cross pickup; section cross pickup (2) or swirl (1); top cross pickup (1) or swirl (1). Mid: phrase snare pickup (2) or hat breath (1); section snare pickup (2), hat breath (1), swirl (1); top hat breath (2), snare pickup (1). High: phrase snare pickup (2) or hat breath (1); section snare pickup, tom pickup, hat breath (1 each); top tom pickup (2), snare pickup (1).

### Bass

- ST-acoustic-12 `[style-data]` (solid) Root and fifth only; energy adds notes, never harmony. One figure per section:
  ```
  low    R-------5-------  (2)    R---------------  (1)
  mid    R-------5-------  (2)    R-----R-5-------  (1)     a pickup on the "and" of 2
  high   R---R---5---5---  (2)    R-----R-5---5---  (1)
  ```
  The fifth is taken below the root where the register allows (an upright's low warmth).
- ST-acoustic-13 `[style-data]` (solid) Note length: 95% of the gap at low, 88% at mid, 80% at high (quiet notes ring into the next; louder ones breathe). Velocity 96 on a chord's arrival, 86 on a repeated root, 88 on the fifth.
- ST-acoustic-14 `[style-data]` (solid) Passing tone: never at low energy. At mid 40% and at high 55% of changes to a new bass note, and 85% of changes into a new section, replace beat 4 with a step into the new root (velocity 84): a whole step if that note is in the current chord's scale, else a half step, from the side the line is coming from. The next chord then arrives exactly where it pointed.
- ST-acoustic-15 `[metric]` (solid) Roots and fifths on beats 1 and 3 at least 97% of the time; passing tones are 2% to 12% of notes and resolve by step 97% of the time; at low energy notes average 7 to 16 steps long.

### Chords

Nylon-string guitar (the default).

- ST-acoustic-16 `[style-data]` (solid) Grips: open position, up to six strings, open strings on (the ringing open strings are the sound), every fretted note at or below the 4th fret where the chord has such a shape (x32010, x02210, xx0232, 133211). C3 (48) to C5 (72), top aimed at E4 (64). With a bassist, only the root or a fifth over it may go below C3, doubling the bassist's own note; G is therefore played 3x0003, not 320003. With no bassist the grip stands on the chord's bass down to E2, and its two lowest notes must obey the low-interval limits (no F2-A2, no G2-B2).
- ST-acoustic-17 `[style-data]` (solid) Picking or strumming: low energy always fingerpicks; high always strums; at mid 35% of sections pick and the rest strum, the choice held for the section.
- ST-acoustic-18 `[style-data]` (solid) Fingerpicking with a bassist: broken chords on the eighths, one pattern per section, as places in the held shape (0 lowest, 3 highest):
  ```
  0 1 2 3 2 1 2 3      up the shape and rocking back
  0 1 2 3 0 1 2 3      up the shape twice
  0 2 3 2 0 2 3 2      thumb on 1 and 3, fingers rocking on top
  ```
  Each note rings until its string is plucked again or the chord changes. The thumb's note is 72 on beat 1 and 66 elsewhere; fingers 56. Low strings below C3 are left out unless they are the chord's root or bass.
- ST-acoustic-19 `[style-data]` (solid) Fingerpicking with no bassist: the Travis hand. The thumb alternates on every beat: the chord's bass, the upper string, the alternate bass (the fifth, below the bass where a finger can reach it: C plays C3 E3 G2 E3), the upper string. The fingers pluck treble strings on the "and"s in one roll per section: 2nd-3rd-1st-3rd, 2nd-3rd-2nd-3rd, or 1st-2nd-3rd-2nd string. Thumb 74 on beat 1 and 66 elsewhere; fingers 58.
- ST-acoustic-20 `[style-data]` (solid) Strum lines, eighth pendulum, one per section, each strum ringing up to two beats (never choked):
  ```
  mid    x...x.x...x.x.x.  (3)   D-DU-UDU, "old faithful"
         x...x.x.x...x.x.  (2)   down on every beat, up on the "and"s of 2 and 4
         x...x.x.x.x.x.x.  (1)   D-DU-DU-DU
  high   x...X.x...x.X.x.  (2)   accents on 2 and 4 with the snare
         x.x.X.x.x.x.X.x.  (2)
  ```
  30% to 55% of strokes are upstrokes; 1.2 to 2.2 open strings ring per downstroke.
- ST-acoustic-21 `[style-data]` (solid) The add9: above low energy, a plain triad whose scale has a natural 9th may ring as an add9 (Cadd9, Am(add9)). The chance depends on the chord's job in the key and is decided once per section per chord. Major key: I 0.75, IV 0.75, bVII 0.50, vi 0.45, ii 0.35, V 0.15. Minor key: bVI 0.75, i 0.60, bIII 0.60, bVII 0.45, iv 0.40, v or V 0.15. Any other triad 0.20. A bar takes the colour only if all of its chords do. At low energy triads stay bare.
- ST-acoustic-22 `[style-data]` (solid) Seventh chords are played as written, never jazz-extended; a written 9th, 11th or b9 is always in the chord.

Piano.

- ST-acoustic-23 `[style-data]` (solid) Close voicings (triad, add9 by the rule above, or the written seventh). Low energy, per section: broken chords in eighths (2), using the same three patterns, pedalled, with a three-note voicing's lowest note doubled an octave up; or a soft chord on each beat held to the next (1; velocity 72 on beat 1, 60 otherwise).
- ST-acoustic-24 `[style-data]` (solid) Mid and high figures, one per section:
  ```
  mid    x...x...x...x...  (2)   the ballad pulse, pedalled
         x.....x.x...x...  (2)   a push into 3 on the "and" of 2
         x...x...x...x.x.  (1)   a lift on the "and" of 4
  high   x.x.x.x.x.x.x.x.  (2)   driving eighths
         x..x..x.x..x..x.  (2)   the 3+3+2 pop syncopation
         x...x.x.x...x.x.  (1)
  ```
  Mid chords ring a beat; high chords 1.8 steps. Velocity 84 on beat 1, 78 on beats 2 and 4, 74 on beat 3, 68 on off-beats.

### Soloist

Default lead is a second nylon guitar: the verse melody's cousin.

- ST-acoustic-25 `[style-data]` (solid) Notes: the key's major pentatonic (minor pentatonic in a minor key), keeping only notes the current chord's scale has and dropping any note a half step above a chord tone, plus the chord's tones. No blue third. Over a chord from outside the key the pentatonic gives way to the chord. Changes land on the 3rd (then a written 7th, 5th, root); phrases rest on the 3rd or root.
- ST-acoustic-26 `[style-data]` (solid) Rhythm cells, quarters and eighths in the rhythm of a sung line (`.xx-` is a hammer-on: a grace sixteenth flicked into the next note):
  ```
  sparse  x---x---x-------   x-----x-x-------   ..x-x-x-----....   x---x-x-----....
  mid     x-x-x---x-x-x---   x---x-x-x---x---   ..x-x-x-x-x-----   x-x-x-.xx---x---   x-----x-x-x-x---
  busy    x-x-x-x-x---x---   ..x-x-x-x-x-x---   x-x-.xx-x-x-x---   x---x-x-x-.xx---
  phrase endings  x---------------   x---x-----------   x-x-x-----------   ..x-x-----------
  ```
  Never a run of sixteenths.
- ST-acoustic-27 `[style-data]` (solid) Head: period form. Cells `x---x---x---x---`, `x-----x-x-------`, `x-x-x---x-------`, `..x-x-x-x---x---`, `x---x-x-x-------`; endings `x---------------`, `x-------x-------`, `x---x-----------`.
- ST-acoustic-28 `[style-data]` (solid) Habits: chromatic approach 0.05; no enclosures; riff repeat 0.25; roomier phrase 0.30; a slur into the 3rd from the half step below 0.25 (the only "bend"); no whole-step bends, no scoops; vibrato on notes of 8 steps or more; home a fourth (5 semitones) above the instrument's usual home; the peak stays within an octave of home.
- ST-acoustic-29 `[style-data]` (solid) Guide-tone head: cells `x-----x-x-------` (the folk lilt), `x-----x-x---x-..`, `x---x---x-----x-`, `....x-x-x---x-..`; turns `x-----x-x-------`, `x---x---x-------`, `x-------x-------`; endings `x-----------....`, `x-------------..`; close `x-------------..`.

### Anticipation

- ST-acoustic-30 `[style-data]` (solid) Strummed guitar: the last upstroke changes early to the next chord 20% of the time at mid, 30% at high. A picked bar never pushes.
- ST-acoustic-31 `[style-data]` (solid) Piano: 25% mid, 35% high, never at low.
- ST-acoustic-32 `[style-data]` (solid) A bar ringing add9s does not push into a chord that will not take the add9 (a V, a quiet bar): the colour is the part, the push is optional.
- ST-acoustic-33 `[style-data]` (solid) No mid-bar pushes. The bass anticipates nothing; its passing tone on beat 4 is the lead-in.

### Endings and turnarounds

- ST-acoustic-34 `[style-data]` (solid) Final chord: the open tonic triad, I or i, left ringing.
- ST-acoustic-35 `[style-data]` (solid) Gesture: soft. No fill, no crash. One strum on 1 at velocity 72 rings out; the bass plays at 80% of its ending weight of 96; the drummer gives a soft kick and a soft snare tap on 1.

### Arrangement arc

- ST-acoustic-36 `[style-data]` (solid) Full default arc. The arc is carried by texture more than volume: fingerpicking, shaker and cross-stick when quiet; a picked or lightly strummed verse with cross-stick or brushes; a full strum, snare backbeat, hat and shaker when it opens up. The add9 colour appears only above quiet.

### Instruments and mix

- ST-acoustic-37 `[style-data]` (solid) Defaults: nylon-string guitar on chords and on lead, upright bass, acoustic kit.
- ST-acoustic-38 `[style-data]` (unclear) The older genre table says grand piano on chords. The style chose nylon because the genre's real instrument is a steel-string acoustic, which has no sound pack; the picked electric reads as indie jangle and the piano makes Acoustic sound like a quieter Rock. To be revisited when a steel-string pack exists.
- ST-acoustic-39 `[style-data]` (solid) Mix: master make-up +9.0 dB. Nylon strum roll is 3 ms between strings (a steel-string or electric is 6 ms).

## Style: country

Not one of the eight targets. Nearest: acoustic (and rock for the train beat). Compact entry.

### Tempo and feel

- ST-country-01 `[style-data]` (unclear) Imported "Country" 110 BPM; stock groove 100; loudness reference 110.
- ST-country-02 `[style-data]` (solid) Dead straight eighths (swing 0). Any lilt read as a shuffle that isn't one: 55 was stilted, 30 still off. Lean: bass 0, piano +3 ms, guitar 0, lead 0. Humanize 25 ("rock solid").

### Drums

- ST-country-03 `[style-data]` (solid) The boom-chick. Low (ballad): `HH o...o...o...o...`, `KK x.......o.......`, cross-stick on 2 and 4. Mid: the two-step, `HH x.x.x.x.x.x.x.x.` (even eighths; a soft off-beat made it limp), `KK x.......x.......`, `SN ....X.......X...`; 30% of sections play the light train instead, `HH o...o...o...o...`, `SN g.g.X.g.g.g.X.g.`. High: the train beat, `SN ggggXgggggggXggg` (60% of sections) or `SN o.o.X.o.o.o.X.o.`, hat on quarters; above energy 0.80 the kick feathers 2 and 4 (`x...o...x...o...`); above 0.82 the hat opens on beat 4.
- ST-country-04 `[style-data]` (solid) Fills are pickups ("4-and, ONE"), 2 or 4 steps, and never erase the backbeat they start on. Toms only for a driving band at the top of the form.

### Bass

- ST-country-05 `[style-data]` (solid) Root on 1, fifth on 3, the fifth below the root where the register allows; 2 and 4 are left to the chick. Into a change a third to a tritone away it walks two notes on beats 3 and 4 (G, A-B into C); the note on beat 4 must fit the chord, and outweighs beat 3 two to one. A waltz alternates root and fifth bar by bar.

### Chords

- ST-country-06 `[style-data]` (solid) Piano (default): close triads, a dry chick on 2 and 4 (`....X.......X...`, 1.2 steps, velocity 90), optionally a lighter lift on the "and" of 4; high energy "boom-chicka" `..x.X.x...x.X.x.`. Low energy holds half notes with the bass. A plain major triad on I or IV takes an added major 6th (the pedal-steel colour); never on V.
- ST-country-07 `[style-data]` (solid) Guitar: the top four strings in open position, chick on 2 and 4 choked after an eighth; with no bassist the pick plays the boom on the low strings itself.

### Soloist

- ST-country-08 `[style-data]` (solid) Clean electric guitar (a Telecaster's snap). The songwriter's pentatonic; lands like the blues book (3rd, root, b7, 5th); chromatic 0.25; riff 0.35; space 0.25; curl into the major 3rd 0.60; whole-step "steel" bend into root or 5th 0.40; vibrato only on half notes.

### Anticipation

- ST-country-09 `[style-data]` (solid) None from the comp: the boom states the chord on the One.

### Endings and turnarounds

- ST-country-10 `[style-data]` (solid) Plain I or i. Held, with a set-up pickup. What makes it country is not the last hit (crash and kick, the same as blues) but two things only this style plays: the bass always walks up into the last root in the bar before (5-6-7 into 1; from the IV it walks down), and the rhythm guitar plays a stinger on the final chord, the 6th struck with the chord and pulled off to the 5th an eighth later (the pedal steel's release), on top of the chord and only where the hand can reach it. A Nashville tag (the last line repeated) was wanted and not built.

### Arrangement arc

- ST-country-11 `[style-data]` (solid) Full default arc: ballad, two-step, train.

### Instruments and mix

- ST-country-12 `[style-data]` (solid) Grand piano, clean electric lead, upright bass, acoustic kit. Piano was chosen because there is no steel-string acoustic pack. Make-up +12.1 dB.

## Style: bossa

Not one of the eight. Nearest: jazz (harmony and lead) and acoustic (nylon guitar). Compact entry.

### Tempo and feel

- ST-bossa-01 `[style-data]` (unclear) Imported "Bossa Nova" 130 BPM, "Latin" 140, "Samba" 160 (all played as bossa; the faster ones are a stretch); loudness reference 130.
- ST-bossa-02 `[style-data]` (solid) Straight. Lean: bass -3 ms and comp -3 ms (slightly forward: bossa floats, it never drags), lead +5 ms (the horn a hair behind the guitar). Humanize 30.

### Drums

- ST-bossa-03 `[style-data]` (solid) The cross-stick plays the two-bar clave, realigned at each section: bar 1 `RM x.....x.....x...`, bar 2 `RM ....x.....x.....`. Kick is the surdo: `x.....o.x.....o.` (low: `o.......o.......`). Hat `o.g.o.g.o.g.o.g.`; at high energy the ride `x.o.x.o.x.o.x.o.` with a soft hat foot on 2 and 4. Fills are tiny (0 to 4 steps): cross-stick figure and a soft floor tom on the last sixteenth.

### Bass

- ST-bossa-04 `[style-data]` (solid) Root and fifth in the surdo rhythm, in unison with the kick: root on 1, fifth on the "and" of 2, beat 3 (fifth, or the new root), and the "and" of 4 which plays the next bar's root early (or, 30% of the time, the half step below it).

### Chords

- ST-bossa-05 `[style-data]` (solid) Nylon guitar (default), four strings plucked together mid-neck, or piano, both playing the same two-bar figure (steps): bar A `0, 6, 10` then bar B `4, 8, 14`, or bar A `0, 6, 12` then bar B `4, 10, 14`. Voicing: four notes with the 9th replacing the root on seventh chords; a plain triad is coloured as a 6/9. With no bassist the guitarist's thumb adds the root on 1 and the fifth on 3.

### Soloist

- ST-bossa-06 `[style-data]` (solid) Alto sax (Getz over Gilberto). Chord scale, lands on guide tones, rests on the 3rd then the maj7, 6th or 9th. Pickups 0.30; ties over the barline on 0.70 of the barlines it could, the highest of any style.

### Anticipation

- ST-bossa-07 `[style-data]` (solid) The signature: the comp's last hit of the bar (the "and" of 4) plays the next chord early, 60% low, 70% mid, 75% high; mid-bar changes are pushed too. The bass anticipates with it.

### Endings and turnarounds

- ST-bossa-08 `[style-data]` (solid) Imaj7 in major, im6 in minor, I9 on a dominant tonic. Soft: no fill, no crash, the last voicing left to ring; a cross-stick click and a soft kick on 1.

### Arrangement arc

- ST-bossa-09 `[style-data]` (solid) Holds its side of the high line (hat and ride never flip between choruses) and takes the song arc at 0.6 depth.

### Instruments and mix

- ST-bossa-10 `[style-data]` (solid) Nylon guitar, alto sax, upright bass, acoustic kit. Make-up +10.2 dB.

## Style: hip hop

Not one of the eight. Nearest: neo-soul. Compact entry.

### Tempo and feel

- ST-hiphop-01 `[style-data]` (unclear) Imported "Hip Hop" 90 BPM; loudness reference 90.
- ST-hiphop-02 `[style-data]` (solid) Swing 25 on sixteenths (off-sixteenth at 54.2%). Lean: sub bass +4 ms (under about 10 ms it fuses with the kick into one fatter hit), Rhodes +12 ms and lead +12 ms (the chopped sample dragging behind a programmed beat). Humanize 20.

### Drums

- ST-hiphop-03 `[style-data]` (solid) Boom-bap is loop music: one two-bar kick loop for the whole song, the second bar answering the first. Loops (bar 1 / bar 2): `X.........x.....` / `X.........x....x`; `X.....x...x.....` / `X.....x.x.......`; `X......x..x.....` / `X......x..x...x.`; `X.x.......x.....` / `X.x.......x..x..`. Snare hard on 2 and 4 at every energy. Hats thin and thicken with energy (`o.g.o.g.o.g.o.g.`, `x.o.x.o.x.o.x.o.`, `xgogxgogxgogxgog`); none at all in a quiet intro or break.
- ST-hiphop-04 `[style-data]` (solid) Fills are drops, not runs: kick, snare and hats cut out and slam back in on the One. Only into a louder section does the drummer play a snare roll instead.

### Bass

- ST-hiphop-05 `[style-data]` (solid) A sub bass in one fixed low octave for the whole tune: long notes struck with the kick and held to the next kick, mostly the root. It drops out with the drums' drops.

### Chords

- ST-hiphop-06 `[style-data]` (solid) Rhodes: one held or lightly syncopated figure for the whole song (a chopped sample), never a pulse on every beat; two-handed spread voicings as in neo-soul.

### Soloist

- ST-hiphop-07 `[style-data]` (solid) Clean guitar playing a sampled hook; phrases are repeated whole.

### Anticipation

- ST-hiphop-08 `[style-data]` (solid) The Rhodes pushes with certainty, not by chance: whenever its loop has a strike on the "and" of 4 (added at high energy where the figure lacks one), that strike always plays the next chord and ties over the barline. A chopped loop pushes the same way every time round. The guitar never pushes.

### Endings and turnarounds

- ST-hiphop-09 `[style-data]` (solid) Tonic maj7, m7, or plain dominant 7. A stop with no set-up: the loop cuts on the One like a record edit; the kick alone on 1.

### Arrangement arc

- ST-hiphop-10 `[style-data]` (solid) Full default arc; energy changes layers (hats, ghosts), not the beat.

### Instruments and mix

- ST-hiphop-11 `[style-data]` (solid) Rhodes, clean guitar, fingered electric bass, the synthesized kit (programmed drums). Make-up +8.4 dB.

## Style: metal

Not one of the eight. Nearest: rock. Compact entry.

### Tempo and feel

- ST-metal-01 `[style-data]` (unclear) Imported "Metal" 160 BPM; stock groove 160; loudness reference 140.
- ST-metal-02 `[style-data]` (solid) Straight, on the grid, nobody leans (0 ms everywhere), humanize 10. The riff is three instruments on the same sixteenths and any lag smears the chug.

### Drums

- ST-metal-03 `[style-data]` (solid) A section is either backbeat (snare on 2 and 4) or half time (snare on 3 alone); quiet is always half time, louder sections are half time one time in four. Kicks: low sparse (`x.........x.....`); mid `x.....x.x.......` or driving eighths; high the double kick, `xxxxxxxxxxxxxxxx` or the gallop `x.xxx.xxx.xxx.xx`. Time moves from hat to ride or crash quarters at high energy. At energy 0.85 and above, once every eight bars, a blast burst: kick and snare on alternating sixteenths under crash quarters.

### Bass

- ST-metal-04 `[style-data]` (solid) Every root on the low E string (E1 to Eb2), one register for the whole tune. Locked to the guitar and the kick: no walking, no approach notes. Quiet: long roots with the kick. Mid: picked eighths. High: it doubles every kick, so the double kick's bursts and gallops are the bass's too.

### Chords

- ST-metal-05 `[style-data]` (solid) The rhythm guitar plays palm-muted power chords (root and fifth, whatever the chord quality; a chord with a raised fifth is played as root and octave) with the bass on the same root and the kick under both. A keyboard in this seat plays power chords too.

### Soloist

- ST-metal-06 `[style-data]` (solid) Overdriven guitar; whole-step bend into root or 5th 0.75, half-step bend into a major 3rd 0.25; wide vibrato on any note of a beat or longer; lands on fifths and roots.

### Anticipation

- ST-metal-07 `[style-data]` (solid) None from the comp. A lift in the last bar before a new section is an accented crash on the "and" of 4.

### Endings and turnarounds

- ST-metal-08 `[style-data]` (solid) Final chord: the tonic power chord in either mode. Gesture: three unison stabs on beats 1, 2 and 3 out of a tom-run set-up, each an eighth long, the last ringing; kick and snare on each stab, the crash only on the last. Bass velocity 108.

### Arrangement arc

- ST-metal-09 `[style-data]` (solid) Full default arc: half-time sway, driving eighths, double kick.

### Instruments and mix

- ST-metal-10 `[style-data]` (solid) Crunch rhythm guitar (the style asks for "guitar" and the app substitutes the distorted pack, because power chords on a clean guitar sound thin), overdriven lead, fingered electric bass, synthesized kit (the natural kit read too soft). Make-up +7.2 dB.

## Style: ska-punk

Not one of the eight. Nearest: reggae for the ska half, rock for the punk half. Compact entry.

### Tempo and feel

- ST-skapunk-01 `[style-data]` (solid) Written in the fast count, about 150 to 200 BPM; imported "Ska" 170; loudness reference 160.
- ST-skapunk-02 `[style-data]` (solid) Straight. Lean: bass 0, comp -4 ms, lead -4 ms (ahead: the urgency that tells ska-punk from reggae's deep pocket). Humanize 20.

### Drums

- ST-skapunk-03 `[style-data]` (solid) The genre is a gear change the whole band makes together at the section line. A section labelled chorus is punk at any energy; anything else is ska until the high tier, where everything goes punk.
- ST-skapunk-04 `[style-data]` (solid) Ska time, one per section: `KK x.......x.......  SN ....X.......X...  HH ..X...X...X...X.` (3); the same with `HH o.X.o.X.o.X.o.X.` (3); or the two-step, kick on all four beats under the off-beat hat (2). Quiet ska uses a cross-stick below energy 0.30 (a full snare there reads as punk).
- ST-skapunk-05 `[style-data]` (solid) Punk time: in a chorus at high energy the skate beat, `KK x...x...x...x...  SN ..X...X...X...X.  HH x.x.x.x.x.x.x.x.`; otherwise an eighth-note rock beat with a pushed "and" of 3. At high energy a crash on the One of every second bar. Fills are fast snare rolls only.

### Bass

- ST-skapunk-06 `[style-data]` (solid) Ska: a walking line. Punk: driving root eighths.

### Chords

- ST-skapunk-07 `[style-data]` (solid) Ska: an upstroke skank on every "and". Punk: down-picked chords. An organ can play the skank in both gears but cannot play the punk half.

### Soloist

- ST-skapunk-08 `[style-data]` (solid) Trumpet, stating tunes rather than licks: off-beat stabs, straight tone, a fall off phrase ends 0.30.

### Anticipation

- ST-skapunk-09 `[style-data]` (solid) None from the comp.

### Endings and turnarounds

- ST-skapunk-10 `[style-data]` (solid) Plain triad; one big hit on the One out of a snare-roll set-up, then stop (crash, kick and snare together).

### Arrangement arc

- ST-skapunk-11 `[style-data]` (solid) Full default arc, but the audible arc is the gear change: ska verses, punk choruses.

### Instruments and mix

- ST-skapunk-12 `[style-data]` (solid) Guitar comp (the older table says organ), trumpet lead (played on the built-in synth voice; there is no trumpet pack), fingered electric bass, acoustic kit. Make-up +7.8 dB.

## What differs between styles and what does not

What a style pack must contain, read off what actually varies across the thirteen styles.

### Varies by style

- X-C-01 `[style-data]` (solid) **Feel**: swing amount; which unit swings (eighths or sixteenths); a lean in ms for bass, comp and lead separately; an optional different comp lean per instrument family (keyboard versus guitar: blues, jazz, country); humanize.
- X-C-02 `[style-data]` (solid) **Drum groove per energy tier**: one bar of lines per drum voice, usually with several weighted alternatives for the kick (and sometimes snare ghosts, hat part, ride or hat). In several styles the tiers are different grooves, not louder versions of one (reggae one drop versus steppers, metal half time versus double kick, jazz light head versus ride, ska versus punk).
- X-C-03 `[style-data]` (solid) **How long each drum choice is held**: per bar, per phrase position, per section or per song. This is part of the style. Hip hop fixes its kick loop per song and reggae its riddim per song; most styles fix the kick per section; jazz keys its snare comping to the phrase position within the chorus.
- X-C-04 `[style-data]` (solid) **The answer bar**: an optional list of weighted ways the second and fourth bars of a phrase change beats 3 and 4, with separate lists for quiet and loud. Present in funk, rock, reggae, acoustic, country, hip hop; absent in blues, jazz, disco, neo-soul, bossa, metal, ska-punk (blues, disco and neo-soul instead write their own every-second-bar variation into the groove).
- X-C-05 `[style-data]` (solid) **Fills**: a length in sixteenths for each of phrase end and section end at each tier (from 0 to 8); a vocabulary of written shapes at 2, 4 and 8 steps; and which shapes are allowed at a phrase end, a section end, and the top of the form. Acoustic and country also vary the vocabulary by tier.
- X-C-06 `[style-data]` (solid) **Which cymbals count as the timekeeper** (the stroke a crash replaces on an arrival): hat only, hat and ride, or including the crash itself (metal, ska-punk).
- X-C-07 `[style-data]` (solid) **Per-pulse drum cells for meters other than 4/4**: one short cell each for downbeat, backbeat and strong pulses.
- X-C-08 `[style-data]` (solid) **Cross-stick threshold**: the energy under which the snare becomes a cross-stick (0.30 in blues, rock, disco, metal, ska; 0.35 in neo-soul; the whole low tier in acoustic, country, reggae).
- X-C-09 `[style-data]` (solid) **Whether the drummer can take a solo** (jazz only), and so whether trading with the drums is offered.
- X-C-10 `[style-data]` (solid) **Bass pattern vocabulary per tier**: a figure or riff alphabet (root, octave, fifth, third, seventh, sixth, second, dead note, hold, rest) or a generative rule (walking, boogie box, kick-following).
- X-C-11 `[style-data]` (solid) **Bass register policy**: the anchor pitch and whether the octave is fixed per section (funk, rock, reggae, acoustic, blues), per song (disco, neo-soul, hip hop, metal) or follows the previous note (jazz).
- X-C-12 `[style-data]` (solid) **Whether the bass follows the kick** the drummer actually played: funk, rock at low energy, reggae on beat 1, hip hop and metal do; the others do not.
- X-C-13 `[style-data]` (solid) **Bass lead-ins**: how often (from never to always), where in the bar (last beat, last eighth, last sixteenth), whether it is a per-change coin or a per-section habit, and the weights of the four kinds (half step below, half step above, the target's fifth, a scale tone).
- X-C-14 `[style-data]` (solid) **Bass articulation**: note length as a share of the gap (0.75 to 0.95), an optional cap on the gap, and velocities for arrival, beat, off-beat, approach and dead note.
- X-C-15 `[style-data]` (solid) **Comp voicing kind**: close, rootless, three-note stab, three-note shell, four-note drop voicing, power chord, two-handed spread. It can change with energy (disco, blues pump bars), with the chord (neo-soul, acoustic add9), or with whether a soloist is playing.
- X-C-16 `[style-data]` (solid) **Comp rhythm per tier**, separately for keyboard and guitar, with weighted alternatives; and whether the choice is redrawn every bar (jazz) or held per section (nearly everything else) or per song (hip hop).
- X-C-17 `[style-data]` (solid) **Comp articulation**: strike length and velocities.
- X-C-18 `[style-data]` (solid) **Guitar grip shape**: number of strings, register window and target top note, how firmly the hand stays in position, whether the root must be on the bottom, whether a string may be skipped, whether open strings are allowed, whether open-position chord shapes are required.
- X-C-19 `[style-data]` (solid) **Strum pendulum grid** (eighth or sixteenth), which follows from the style's tempo frame, and how long a strum rings.
- X-C-20 `[style-data]` (solid) **What the guitar does with no bassist**: a fuller root-position grip (rock, neo-soul, blues), a boogie (blues), a thumb bass (bossa, acoustic Travis), a bass-strum split (country), or nothing different (disco, reggae, funk, jazz).
- X-C-21 `[style-data]` (solid) **Barline anticipation chance per tier**, separately for keyboard and guitar (0 to 0.85; 1.0 in hip hop).
- X-C-22 `[style-data]` (solid) **Mid-bar anticipation mode**: off, tie the new chord over the change, strike it early and again on the beat, or on in some tiers only.
- X-C-23 `[style-data]` (solid) **Whether the comp converses with a soloist**: chance of laying out under the line, chance of answering in a breath, whether a laid-out strike lets the previous chord ring on, and a floor on strikes per bar. Only jazz, blues and neo-soul have it; every groove style keeps its figure.
- X-C-24 `[style-data]` (solid) **Whether a sustaining keyboard plays the rhythm as written** (reggae's bubble) or holds chords as a pad (everywhere else).
- X-C-25 `[style-data]` (solid) **Lead book**: rhythm cells at three densities, phrase endings, head cells and head endings, head form (period or AAB), guide-tone head figures, the note pool, where changes land, where phrases rest, and a set of chances (chromatic approach, enclosure, riff repeat, space, bends into the 3rd and into the root, scoop, release, slide, fall, repeated-note stabs, whole-phrase loop, pickups, barline ties), a vibrato threshold, a register offset and a peak ceiling.
- X-C-26 `[style-data]` (solid) **Default comp instrument and default lead instrument.**
- X-C-27 `[style-data]` (solid) **Final chord quality** for a major key, a minor key and a dominant tonic.
- X-C-28 `[style-data]` (solid) **Ending gesture**: hold, stop, soft, button, or hits on named beats; whether the bar before gets a set-up fill; the drummer's own last-bar line; the bass's ending velocity.
- X-C-29 `[style-data]` (solid) **Arc shape**: a depth multiplier for the song-length arc (reggae 0.5, bossa 0.6, everyone else 1) and whether lifts may move a section across the high-energy line (reggae and bossa may not).
- X-C-30 `[style-data]` (solid) **Mix**: a per-style master make-up gain (from +7.2 dB for metal to +12.4 dB for jazz); jazz's own bus EQ; small kit trims for jazz, blues and rock; which bass (upright or electric) and which kit (acoustic or synthesized).

### The same in every style

- X-C-31 `[property]` (solid) The sixteenth-step grid and its resolution; the four velocity levels of a drum line; the strum velocities.
- X-C-32 `[property]` (solid) The three energy tiers and their thresholds (0.42 and 0.70); the energy-to-velocity scale; the energy each section role starts from.
- X-C-33 `[property]` (solid) Where fills and crashes fall in the form, and that a fill is sized by the louder of the bar it is in and the bar it leads to. Styles decide only how long and what.
- X-C-34 `[property]` (solid) The drums never lean; lean is always measured against them. Humanize's largest offset (9 ms) and largest velocity jitter (10).
- X-C-35 `[property]` (solid) Instrument ranges: bass E1 to E3 for line roots with a ceiling of A3; keyboards C3 to C6 with one-hand voicings from E3; guitar E2 to A5; lead ranges per instrument.
- X-C-36 `[property]` (solid) An anticipated chord ties one eighth past the barline, and the downbeat it anticipates is not struck again.
- X-C-37 `[property]` (solid) Every chord the chart writes is struck at least once by the comp, whatever the figure; a chord's arrival always gets its root (or bass note) from the bass, except where a style deliberately keeps a hole on beat 1 (reggae).
- X-C-38 `[property]` (solid) A fermata is one held strike by everyone; nothing anticipates into a fermata or into the final chord.
- X-C-39 `[property]` (solid) The form of a performance: head first, three solo choruses as one arc, head back; the lead is off by default.
- X-C-40 `[property]` (solid) The ending's fixed weights: comp 92 (72 when soft), the button 12 harder than the chord it ends, short hits an eighth long, the bass's last note on its lowest root.
- X-C-41 `[property]` (solid) The answer-the-soloist thresholds: a breath worth answering is a dotted quarter, and an answer plays 8 louder.

### Varied by style that one would not expect

- X-C-42 `[taste]` (solid) The time span a random choice is held for (X-C-03, X-C-16) turned out to be one of the most audible style parameters: "loop music" is literally "choose once per song".
- X-C-43 `[taste]` (solid) The lead has its own lean, and it is often not the comp's: in funk the horn sits on the grid while the rhythm section pushes; in disco it floats 4 ms behind a machine; in reggae it drags furthest of all.
- X-C-44 `[taste]` (solid) The final chord's quality needs a third case, the dominant tonic, and getting it wrong changes the tonic's job (funk's 9 on a major tune sounds like V7 of IV; disco's maj7 on a blues contradicts the chart).
- X-C-45 `[taste]` (solid) The bass's ending velocity, the strum grid, the cross-stick threshold and the timekeeper list are all per style.
- X-C-46 `[taste]` (solid) Whether energy is allowed to cross the high line at all is a style property, because in some styles "high" is a different groove a band would not flip into mid-take.
- X-C-47 `[taste]` (solid) Voicing kind is not one value per style: it moves with energy, with the chord's function, and with the presence of a soloist.
- X-C-48 `[taste]` (unclear) Tempo is not a style property in the old band at all, and no pattern changes with tempo. One note records that an earlier version switched the country train beat from sixteenths to eighths at fast tempos, and the current one turned that into a per-section coin instead.

## Surprises

Style-specific details that took effort and would be easy to lose.

- ST-surprise-01 `[style-data]` (solid) At a triplet swing the written "e" sixteenth is the middle triplet. That is how the blues gets triplet fills from a sixteenth grid, and why neither blues nor jazz may ever write on the "a".
- ST-surprise-02 `[taste]` (solid) Three swing values were re-tuned by ear against the first guess, all in the same session: blues 90 to 100, jazz 72 to 60, neo-soul 30 to 45. Country went the other way, from 55 through 30 to 0.
- ST-surprise-03 `[style-data]` (solid) The blues cymbal's lope (the "and" of 2 and of 4 at 80%) and the neo-soul hat's feather touch (everything at 80%) are velocity shapes laid over the written grid, not part of it.
- ST-surprise-04 `[style-data]` (solid) The jazz snare cannot hear the pianist (drums play first), so it reads the chart's harmonic rhythm exactly as the pianist does and lands where the piano statistically strikes.
- ST-surprise-05 `[style-data]` (solid) The jazz head on the closed hi-hat with the bass in two, then the ride and the walk for the bridge and solos, is what makes the band sound like it knows the form. A softer ride alone barely registered.
- ST-surprise-06 `[style-data]` (solid) Neo-soul's lazy snare had to be written as a full sixteenth displacement on a two-bar loop, because drums are the clock and cannot drag by milliseconds.
- ST-surprise-07 `[style-data]` (solid) Hip hop's sub bass leans only 4 ms: under about 10 ms it fuses with the kick into one fatter hit, while 12 ms flams.
- ST-surprise-08 `[style-data]` (solid) A lean applied to the whole band is just latency. Styles that were "the whole band 8 or 12 ms back" had to be re-expressed as different leans per instrument against unmoved drums.
- ST-surprise-09 `[style-data]` (solid) Reggae's bass riffs have a hole on beat 1 that must close the moment the drummer plays the One (steppers, rockers, a crash after a fill).
- ST-surprise-10 `[style-data]` (solid) Reggae alone with an organ is not recognisably reggae unless the organ borrows the 2-and-4 chop; the bubble by itself could be rocksteady or ska.
- ST-surprise-11 `[style-data]` (solid) Disco keeps both of its markers through fills: the kick never stops, and the hat foot takes over the "and"s when the stick hand leaves the open hat.
- ST-surprise-12 `[style-data]` (solid) Disco's octave pump is the Philly and Hi-NRG bass, not Chic's; and the guitar's "nile" line was moved down to mid energy because every mid-energy section sounded like one generic chop without it.
- ST-surprise-13 `[style-data]` (solid) In styles whose guitar mutes by releasing the fretting hand (blues chop, swing chunk, funk scratch, disco chuck, reggae skank) open strings are forbidden, because an open string rings through the release. In acoustic and country they are required.
- ST-surprise-14 `[style-data]` (solid) An upstroke catches only the top three strings, so any full chord a guitar line needs must fall on a downstroke position; neo-soul's lines are written around this.
- ST-surprise-15 `[style-data]` (solid) The acoustic G chord over a bassist is 3x0003, not 320003: the B on the A string is a third in the bass's register.
- ST-surprise-16 `[style-data]` (solid) The add9 is a function of the chord's job in the key (resting chords take it, the dominant almost never), decided per section so a verse's I rings the same way every time.
- ST-surprise-17 `[style-data]` (solid) The blues bass's 6th must come from the chord's scale. On a secondary dominant heading to a minor chord the natural 6th clashes with the piano's b13.
- ST-surprise-18 `[style-data]` (solid) The boogie pump is the one place the blues piano stops playing rootless voicings.
- ST-surprise-19 `[style-data]` (solid) A blues fill of one beat or less keeps the backbeat on 4; dropping it sounded like a mistake, not a fill. Country fills do the same.
- ST-surprise-20 `[style-data]` (solid) Funk's bass tones over a slash chord are measured from the chord root, not the bass note.
- ST-surprise-21 `[style-data]` (solid) Funk at mid energy thins its stab riff by dropping the same stab every bar; dropping a random one each bar sounded like stuttering.
- ST-surprise-22 `[style-data]` (solid) Rock has no comp anticipation at all, on purpose: a keyboard pushing alone puts the new chord over the old bass note. The ensemble push it was waiting for was never built.
- ST-surprise-23 `[style-data]` (solid) The mid-bar push must replace the on-beat strike, not add to it, or the chord is heard twice ("ba-DAHM"). The two exceptions are figures that hammer every subdivision (the boogie pump) and picked lines that run through the change (neo-soul guitar).
- ST-surprise-24 `[style-data]` (solid) Country's identity at the end is the bass walk-up and the 6-to-5 stinger, not the drum hit, which it shares with the blues.
- ST-surprise-25 `[style-data]` (unclear) Default instruments are decided twice. The style names a comp and lead instrument; an older per-genre table names sounds for all four seats and still decides bass and drums, and decides chords and lead whenever the style's choice is not installed. They disagree for blues (organ and sax versus piano and guitar), funk lead, disco, reggae, acoustic and ska-punk comp.
- ST-surprise-26 `[style-data]` (unclear) A stored humanize of exactly 20 means "not set" and plays the style's own amount, because every chart was once saved with 20. For hip hop and ska-punk, whose own amount is 20, the two cannot be told apart.
- ST-surprise-27 `[style-data]` (solid) The bar before a non-looping ending gets the style's largest section fill regardless of energy, so a quiet tune still rolls into its last hit. Styles that end softly or by cutting (neo-soul, acoustic, bossa, jazz, hip hop) opt out.

General mechanisms met on the way, noted in one line each and left to parts A and B:

- The energy model: section-role energies (intro 0.35, verse 0.5, pre-chorus 0.6, chorus 0.75, bridge 0.6, solo 0.65, break 0.3, outro 0.45, unlabelled 0.55), a 0.06 build into a bigger section, a capped lift per repeat, and the song-length arc.
- Fill and crash placement, including the rule that a short looping vamp fills on 8- and 16-bar lines rather than every lap, alternating a half-size pickup with the full fill.
- The two-bar answer mechanism (only beats 3 and 4 of the answering bar change, and a section commits to one turn).
- Bass craft shared by all styles: placing a note near the last with a pull toward home, the four approach kinds, what happens at the bottom of the instrument, the promise of a landing octave across a barline or into an ending, and the final note going to the lowest root.
- Comp craft shared by all styles: voice leading, leaving the soloist's exact pitch out of the chord, the two-stage anticipation, how an organ holds and re-presses at phrase tops, and the upstroke-catches-three-strings rule.
- The lead's phrase planner, solo arc, pickups, pushes, bends, falls and slides; styles only set the chances.
- The ending resolver that turns a final turnaround into the tonic in the style's colour, and the five gestures.

