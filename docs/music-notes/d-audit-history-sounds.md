# Music notes, part D: the audit, the history, the owner's ear, and the sounds

What the old project learned about its own playing: what a panel of reviewers found wrong with it, what was tried and thrown away, what the owner said when he listened, how quality was measured and which measurements could be trusted, and what the band sounds like through its instruments and its mix. Parts A, B and C describe what the band plays; this part describes how the band found out.

Conventions used throughout:

- **Two bands.** "The first band" is the generator that played until September 2026: it decided one sixteenth at a time, with a live conductor whose energy drifted while the song played. "The last band" replaced it on 2026-09-25 and is the one parts A to C describe. The audits below were all carried out on the first band. A finding marked **fixed** was fixed there; where the last band is known to play it differently, the line says so.
- **Grid.** One bar of 4/4 is 16 sixteenths, written one character per sixteenth with beats separated by spaces: `x... x... x... x...` is four quarter notes. A 6/8 bar is 12 sixteenths in two groups: `x..... x.....` is the two dotted-quarter pulses. Positions are counted "1 e & a 2 e & a ...".
- **Energy / intensity** is 0 to 1. The first band called it intensity; the last band calls it energy. Same dial.
- **Pitch.** MIDI numbers, middle C = 60 = C4, 28 = E1 (the bass's open low E).
- **Tags.** `[property]` must always hold; `[metric]` score it; `[style-data]` belongs in a style's data; `[taste]` a judgment worth knowing. `(solid)` the record is clear and consistent; `(unclear)` the record is thin, the intent ambiguous, or two sources disagree.
- **Cross-references** such as BA-12, CH-40, KF-B-17, ST-surprise-08 point into parts A, B and C.

## The audit

There were four audits, all recorded in the old project's own notes, plus later reviews that survive only as issue-tracker entries and merge notes.

1. **The music theory audit** (2026-05-16 to 2026-05-25). Six reviewers, one each for soloist, bass, chords, drums, the background-harmony layer with the band's listening to itself, and form. 95 findings; 80 pieces of work shipped over twelve rounds; every listening question was closed with the owner on 2026-05-25.
2. **The meter audit** (2026-05-27 to 2026-05-29), triggered by one sentence from the owner (EAR-19). 33 pieces of work.
3. **The sound audit** (2026-05-21 to 2026-05-25), six reviewers on the synthesized instrument voices and the mix.
4. **An owner-requested drum audit** (2026-05-30) and a **chords and background-harmony audit** (2026-06-22). The first is recorded; the second survives only as a summary.

Each line below is one finding stated as the rule it implies.

### The band listening to itself

AU-01. A part that makes room for the soloist must remember the soloist's last sounded note through the soloist's rests; reading only "the note sounding right now" never works, because that part has been told to play in the gaps. **Fixed:** the last note is remembered for up to 32 sixteenths (two bars). [property] (solid)

AU-02. Over an altered dominant the soloist leans on the written alterations (b9, #9, #11, b13), measurably more than over a plain dominant (target: at least 15 percentage points more). **Fixed:** those notes made twice as likely. Three times as likely was tried and pushed them past 60% of all notes on the chord, which was heard as playing the alterations instead of colouring with them. [metric] (solid)

AU-03. Bass and chords set up a new section with the drummer; they do not arrive cold on the downbeat behind his fill. **Fixed:** the bass approaches the new section's first root by a half step on the last eighth, and the comp plays the new chord on the "and" of 4, in jazz, funk, neo-soul, blues and bossa only. The last band's versions are BA-05 and CH-36 to CH-40. [property] (solid)

AU-04. The soloist does not sit on a pitch the comp is voicing. **Fixed:** such pitch classes made 20 times less likely, except on the last note of an answering phrase, where the root and fifth are the intended landings; making them only half as likely was inaudible. Achieved about 23 percentage points fewer unisons against a target of 30; the rest came from pre-written licks that walk chord tones by design. The last band solves it from the comp's side (CH-59 to CH-63). [metric] (solid)

AU-05. The order in which the players decide is part of the music and must be fixed: whoever yields has to decide after whoever is yielded to. The first band decided soloist, bass, chords, background. The last band decides drums, bass, lead, comp. Both work; an accidental reorder silently stops the yielding. **Fixed** by pinning the order. [property] (solid)

AU-06. The bass locks to the kick only in styles where bassists do: rock, funk, metal, disco. Locking in jazz walking, the reggae one drop, the country two-step, the blues shuffle and hip hop was wrong. **Fixed** before the audit proper; see BA-94 for the later refinement (the lock is a floor under written figures, never an override). [style-data] (solid)

AU-07. A background part's lowest note follows the bass: never below E3 (MIDI 52), and never less than a perfect fifth above the bass note sounding. A fixed floor at E3 gave muddy E3-to-A3 clusters whenever the bass walked high. **Fixed.** [property] (solid)

AU-08. The register rule and the test of the register rule must state the same range. The rule said the bass may use MIDI 23 to 57; its test guarded 28 to 51. **Fixed** by aligning them. X-A-05 reports the same two numbers still disagreeing in the last band's notes, so treat this as recurring. [property] (unclear)

AU-09. When the soloist finishes a phrase, the comp reacts. **Fixed** in the first band for jazz only as a brief thinning; bossa was added and removed again within a day because its comp is a continuous ostinato and the thinning punched holes in it. The last band's answer (fill the breath, do not merely thin under the line) is CH-68 to CH-72 and KF-B-35. [taste] (solid)

AU-10. A reggae bass fill at a phrase end walks in from a scale tone; it does not replace a clean root with a chromatic neighbour. **Fixed.** [style-data] (solid)

AU-11. The bass and the soloist can land on the same pitch and blur both lines. **Open:** never fixed in either band (KF-B-07). [property] (solid)

### Form and arrangement

AU-12. Every player knows which section it is in, not only the drummer and the soloist. In the first band the bass and chords played the same line in verse, chorus, bridge and outro. **Fixed** only partly there (variation on repeats, AU-14); solved in the last band by giving every section an energy from its role (part A, the conductor). [property] (solid)

AU-13. The third time through the form is not the first time through, for the whole band. **Fixed:** the drummer's pattern was held to its plainest version for the first two times through and allowed one step busier from the third. A month later this cap was found to have done nothing: it adjusted a number the pattern chooser ignored, and the first and third times through were identical. The lever that works is which pattern is chosen; and a "more open" pattern should develop the groove, not simply add strokes. [metric] (solid)

AU-14. A repeated section differs from its first statement in one small way per player; an exact repeat is the strongest "this is a machine" tell. **Fixed:** bass, from the second occurrence, moves one chosen beat in each four-bar phrase by an octave (same pitch class); drums toggle one ghost note per bar on snare or hi-hat (kick, and beats 1, 2 and 4, exempt); the comp lifts its lowest voice an octave from a chosen bar onward (never in power-chord styles, where that leaves a doubled chord with no root underneath). [property] (solid)

AU-15. The repeat variation of AU-14 must be allowed in quiet sections. It was first switched off below intensity 0.4, which removed it from the quiet second verse where subtle variation is most musical. **Fixed:** floor lowered to 0.25 by the owner's decision. [style-data] (solid)

AU-16. The whole band ends together: on the final bar the drummer crashes with the kick, the bass holds the tonic for the bar, and the comp plays a cadence chord. **Fixed**, with two corrections: the cadence chord uses only the written chord's own intervals (an early version added a third and fifth to power chords and a natural fifth to diminished chords), and its register is led from the previous voicing between E3 and C6. See EN-59 to EN-62 for the last band. [property] (solid)

AU-17. Silencing the hi-hat on the final bar for a cymbal swell sounds abrupt in styles whose hi-hat is the spine. **Fixed:** the hat stops only in sparse-hat styles (jazz, bossa, acoustic, country, blues, reggae); it keeps going in disco, funk, rock, metal, ska-punk, hip hop and neo-soul. [style-data] (solid)

AU-18. Each style ends in its own way; one shared final-bar drum hit for every style is wrong. **Fixed** after the owner confirmed "all genres currently end the same way" (EAR-22): jazz, blues and bossa end on ride and cross-stick; country and acoustic keep the backbeat with one cross-stick flourish on beat 3 only; metal swaps the crash for a china with a harder kick; reggae puts the cross-stick on 1. Superseded in detail by EN-14 to EN-23. [style-data] (solid)

AU-19. An intro layers in and an outro thins out. **Fixed**, the same in every style: bass enters after 2 bars, chords after 3, background after 4; going out, the background leaves 4 bars before the end, chords 3, bass 1. A 4-bar wait for the chords collapsed the staircase on a 4-bar intro. [style-data] (unclear)

AU-20. Whether each style should layer its intro differently. **Open by decision:** the owner said intros "feel natural across genres" and that there is no single correct stagger; decide by ear per style, not by a blind change. [taste] (solid)

AU-21. A section labelled "Drop" or "Breakdown" does something structural. **Fixed:** one bar where the whole band cuts out, a crash on the next downbeat, and everyone back in. [property] (solid)

AU-22. Automatic energy must not park below the level where a style's defining sound switches on. It sat at 0.35 to 0.5 while funk's snare replaced its cross-stick only above 0.4, so funk had no backbeat. **Fixed** three ways: a floor per style (funk 0.45, disco 0.45, neo-soul 0.40, ska 0.40, rock and metal 0.35, jazz and bossa 0.30); snare thresholds lowered from 0.4 to 0.3 (country's quietest pattern keeps its rim click up to 0.4, the honky-tonk sound); and energy made to rise faster than it falls. [style-data] (solid)

AU-23. Energy rises a little faster than it falls ("bands settle in and build"), but not in lurches. Rising 1.5 times as fast and falling half as fast jumped a quarter of the whole range in one bar; the owner chose 1.25 and 0.75. Result: 0.5 reached by bar 6 from a cold start. The last band has no drifting energy at all (CO-58). [style-data] (solid)

AU-24. An open-ended jam has a smooth swell shaped to the style, not an eight-step ladder that repeats. **Fixed**; the last band's counted-performance arc is CO-13 onward. [taste] (solid)

AU-25. The band's "we are winding down" and the soloist's "this is my concluding phrase" must be one decision. In the first band they could disagree (a soloist concluding at the band's peak). **Open** there; the last band takes both from one plan. [property] (unclear)

AU-26. The vocabulary of section roles that the arranger reads must be the vocabulary the form analysis writes. Six of seven role cases could never occur. **Fixed.** [property] (solid)

AU-27. A harmonic push (the bass anticipating the next chord) is a signal, used near section changes. Rock's bass was pushing about 55% of changes at medium intensity, which was heard as twitchy. **Fixed:** 10 to 25%, concentrated on the approach to a section change. The last band's rock comp does not push at all (ST-surprise-22). [metric] (solid)

### Repetition and variation

AU-28. A funk comping part is a one- or two-bar cell that loops; it is not a fresh draw of sixteenth positions every bar. **Fixed.** [property] (solid)

AU-29. A jazz, blues or bossa comper commits to a rhythmic idea for a phrase and develops it; it does not pick a new figure each bar. **Fixed**; see KF-B-24 for what was really wrong (three separate causes). Bossa first inherited the jazz figures and later got its own, with the anticipation of beat 1 that the jazz set lacked. [property] (solid)

AU-30. Phrase lengths are musical lengths (4 or 8 bars). A comp groove that lasted a uniformly random 4 to 8 bars mixed in 5-, 6- and 7-bar phrases. **Status unclear** in the first band; the last band's phrases come from the form. [property] (unclear)

AU-31. Variation follows structure, not a coin per note. Octave jumps in the bass (a 2 to 10% chance on every note) and the walking bass's per-note random choice made every time through different for no reason. **Fixed:** jumps tied to structural points and reproducible. [property] (solid)

AU-32. Small loudness differences between repeated strokes belong to the position in the bar, so they recur every time round as a player's touch; drawn fresh each time they are noise. **Fixed.** [property] (solid)

AU-33. Within one held chord the comp does not swap which extension is on top from stab to stab. **Fixed:** one voicing per chord, changed on purpose at the next chord. [property] (solid)

### Soloist

AU-34. Bebop needs half-step neighbours of chord tones in the pool of candidate notes. They were being discarded before any preference could apply, so a style's "chromaticism" setting did nothing. **Fixed:** admitted at a low base likelihood scaled by that setting. (KF-B-05.) [property] (solid)

AU-35. A bebop run is built from where the line is, so that its next beat lands on a chord tone; built from the chord root it leaps in and leaps out. **Fixed**, later extended so half-diminished and augmented-major-seventh chords get their own passing tone. [property] (solid)

AU-36. An answering phrase keeps the long-and-short shape of the phrase it answers. The answer was coming back as equal sixteenths at the call's positions. **Fixed.** [property] (solid)

AU-37. Which extensions a player favours depends on the chord quality: the 6th is colour on a dominant or major seventh and an avoid note on a minor seventh. **Fixed:** per-quality sets; on Dm7 the clashing note fell from 6.5% to 2.2% of notes. The same profile had been avoiding the root entirely and was allowed it back at cadences. [property] (solid)

AU-38. A restatement is a paraphrase: the same rhythm, the same direction of contour, looser landings than the statement. A slightly stronger pull to chord tones was inaudible. **Fixed**, and it is one of the few soloist changes the owner confirmed by ear (EAR-21). [taste] (solid)

AU-39. Later times through the form change the soloist's rhythm as well as its notes. **Fixed** in the first band as 15% more density per time through, to a cap of four. The last band's arc across choruses is in part B. [metric] (solid)

AU-40. A varied restatement of the head moves notes by scale steps, never by raw semitones (a fifth became a flatted fifth). **Fixed.** [property] (solid)

AU-41. A soloist's "manner" should not change faster than a listener can identify it. It was being redrawn at 80% of section boundaries (about every 1.25 sections). **Fixed** by holding it. [taste] (solid)

AU-42. A rhythmic displacement meant to be heard must be large and rare. Plus or minus 12.5 ms on 30% of notes is below what the ear reads as placement (the reviewers put that edge near 30 ms); the suggestion was 25 to 35 ms on phrase entries only. **Open.** [taste] (unclear)

AU-43. A ranked list of ornaments must be chosen by rank. The list was ranked carefully and then picked uniformly. **Fixed.** [property] (solid)

AU-44. A pre-written lick must fit the rhythm already planned: six sixteenths or longer only where no planned attack falls inside it, four or five may swallow one planned attack, three or fewer are free. **Fixed** (measured: 122 licks over 8,000 sixteenths of blues, none burying a planned attack). [property] (solid)

AU-45. The first statement of the head carries no licks on its anchor notes. **Fixed.** [property] (solid)

AU-46. Phrase endings resolve according to the phrase's job (a call may hang, an answer lands), and the pull is applied at the phrase's last note, not on every note. **Fixed**; see ME-16 for why the old measurement had hidden the problem. [property] (solid)

AU-47. A style setting that nothing reads is worse than none: a "chromaticism 0.9" that changed nothing made the style look tuned. **Fixed** by wiring or deleting each one. [property] (solid)

### Bass

AU-48. A style with no bass idiom of its own must not silently play rock eighths (Latin, a minimal style and a shred style all did). **Fixed** by routing; relevant to a rewrite as "a style with a missing part must fail loudly". [property] (solid)

AU-49. An approach note is never moved by an octave: its whole point is one step of motion into the target. **Fixed.** The last band learned the same thing again at greater length (BA-87 to BA-89). [property] (solid)

AU-50. A rule that silences beat 1 belongs to the pattern that has no beat 1. A reggae "one drop silencer" was dropping beat 1 on 80% of bars in patterns that do play it, and doing nothing in the one drop. **Fixed** by removing it. [property] (solid)

AU-51. Approaching the next root by a half step or scale step on the last eighth is universal bass vocabulary, not a jazz device. **Fixed** for rock; country already walked. [style-data] (solid)

AU-52. There is no approach without a destination: no neighbour-note figure on the last eighth inside a held chord (heard as a wrong-note stumble), and the test for "the chord is changing" reads the sounding bass note, so a change of slash bass counts. Funk above intensity 0.75 was wiggling on the last sixteenth of every beat 60% of the time. **Fixed.** [property] (solid)

AU-53. A country walk-up is two to four stepwise notes over the last two beats, not one chromatic note; above intensity 0.6 the bass plays root and fifth in quarters. **Fixed**; BA-54 and BA-91 are the last band's version. [style-data] (solid)

AU-54. A hip hop sub-bass glide is a slide between chord roots across the chord change, not a leap of a fifth or octave inside a chord. **Fixed** in the notes; it was then silent for some time because the instrument did not play the slide. [style-data] (solid)

AU-55. A sixth in a walking line takes the chord's own sixth: a major sixth over a minor or half-diminished chord is a wrong note. **Fixed.** [property] (solid)

AU-56. A walking line is defined by its target: beats 2 and 3 lead toward the next root. **Fixed**; the first attempt's pull was too weak to register and had to be made eight times stronger. [metric] (solid)

AU-57. In an acoustic folk bass part, "occasional" fifths and octaves means occasional; 40 to 70% of beats sounded like jazz fingerstyle. **Open** as far as the record shows. [taste] (unclear)

AU-58. Bossa and samba are different feels (samba is more driving, leans on beat 2 of a two-beat bar). **Open by decision:** the owner does not reach for samba and wants a strong bossa identity; samba, if ever wanted, is a separate style. [taste] (solid)

AU-59. A bossa bass that plays the identical four notes for sixteen bars is mechanical. **Fixed** by moving octaves on chosen bars; target at least three distinct bar shapes in sixteen. [metric] (solid)

AU-60. A slide into a note from a half step away is a style choice, not a universal bass habit: it has no place in metal's palm-muted precision or disco's clean octave line. **Fixed** (found when asked to justify the number, EAR-06). [style-data] (solid)

### Comping and voicing

AU-61. A neo-soul minor ninth puts the 9th above the flat 3rd, an octave apart; the 2nd and flat 3rd side by side is heard as a wrong note. **Fixed.** [property] (solid)

AU-62. A power chord respects the chord's quality: diminished, half-diminished, augmented and suspended chords keep the interval that names them. **Fixed**; SU-B-09 is the last band's sharper statement. [property] (solid)

AU-63. Successive chords are connected: common tones held, guide tones moved by step. **Fixed** for jazz, bossa and blues only; switched on everywhere it broke neo-soul, where snapping a common tone to another octave disturbed the pocket. Confirmed by the owner's ear. [property] (solid)

AU-64. Every altered dominant spelling (7b9, 7#9, 7b13, 7#11, 7b5, augmented seventh, as well as "alt") gets the altered-dominant treatment: guide tones plus one or two of its altered colours. **Fixed.** [property] (solid)

AU-65. In a four-note voicing of a 7b9, the b9 stays; it names the chord. The audit asked for the fifth to outrank colour tones; a reviewer showed that this would drop the b9, and the change was withdrawn. **Fixed by leaving it alone**, with a guard. [property] (solid)

AU-66. Reggae keyboards play one job each: the chord instrument plays the skank on 2 and 4, an organ plays the bubble. Both on one instrument was busier than the music. **Fixed.** ST-surprise-10 adds the last band's exception (an organ alone borrows the chop). [style-data] (solid)

AU-67. A country boom-chick alternates root and fifth strictly (90% of the time sounds like forgetting), uses a real strum shape, and keeps a suspension suspended. **Fixed.** [style-data] (solid)

AU-68. Pop, acoustic, neo-soul and country chords carry some colour at ordinary levels. **Fixed** as an added 9th from intensity 0.35. The last band decides the add9 by the chord's job in the key (ST-surprise-16), which refines this. [style-data] (solid)

AU-69. A funk clavinet voicing is three notes, 3rd, flat 7th and 9th (or 13th); two guide tones alone is a jazz shell. **Fixed.** [style-data] (solid)

AU-70. With a bassist in the band, a country guitar's own bass notes move up out of the bassist's register. **Fixed** (at least E3, and at least a fourth above the bass). X-A-04 is the last band's rule. [property] (solid)

### Drums

AU-71. A crash accent plays a crash cymbal. Section-start accents were playing a louder open hi-hat. **Fixed.** [property] (solid)

AU-72. The first time through is the plain time through. A rule to that effect was running backwards whenever the song's length was unknown. **Fixed.** [property] (solid)

AU-73. Random extra strokes do not belong in a sparse style's quiet playing. At intensity 0.3 a 4.5% chance per sixteenth put 12 to 25 stray hits into a 32-bar verse, filling the one drop's empty beat 1 and the jazz ride's space. **Fixed:** none below 0.5 in reggae, 0.45 in jazz, 0.5 in acoustic. [style-data] (solid)

AU-74. In reggae the kick and snare lay back and the hi-hat stays on the grid as the reference. **Fixed** in the first band. The last band contradicts the mechanism: its drums never move off the grid and the lay-back belongs to the other players (ST-surprise-08). [style-data] (unclear)

AU-75. A drum pattern that names an instrument must have that instrument. Disco's cowbells were silent. **Fixed**, and disco's four patterns were reduced to two (plain and busy) with ghost snares and cowbells no longer reserved for intensity above 0.7, where only about 6% of sections ever heard them. [style-data] (solid)

AU-76. Fills use toms in every style, each style in its own vocabulary. Nine of fifteen styles filled on snare alone. **Fixed**; DR-94 is what the last band learned on top. [style-data] (solid)

AU-77. A blast beat alternates kick and snare; they never coincide. **Fixed** as snare `x... x... x... x...` against kick `..x. ..x. ..x. ..x.`. The last band alternates twice as fast with the kick on the eighths (DR-78); both obey the rule. Metal accents on a china cymbal, set slightly louder than the crash. [style-data] (solid)

AU-78. Quiet jazz is brushes, not a cross-stick on 2 and 4 (which reads as bossa or country). **Fixed** with a brush sound below intensity 0.35. Still limited by the sounds: no freely licensed brush samples were found (SN-22). [style-data] (solid)

AU-79. A displaced funk backbeat is moved for a whole phrase and then returns; a coin flip per stroke is scatter. **Fixed:** per two-bar phrase, 50% no displacement, 35% one sixteenth late (snare on the "e" of 2 and 4), 15% an eighth late (the "and" of 2 and 4), and the eighth-late version lasts one bar before returning. [style-data] (solid)

AU-80. A trap hi-hat roll is a burst: all four sixteenths of one beat, rising in loudness (about 55, 60, 70, 85% of full), on beat 3 half the time and beats 1 or 2 otherwise, in roughly three phrases in ten. **Fixed.** The last band's hip hop is boom-bap and has no such roll. [style-data] (solid)

AU-81. A country train beat is continuous sixteenths with the backbeat accented; gaps make it stutter. **Fixed** (DR-98). [style-data] (solid)

AU-82. A pattern's name must match what it plays: kick on 1 and snare on 3 is a half-time backbeat, not "minimal folk"; and a punk D-beat is kick `x.x. .... x.x. ....`, snare `.... x... .... x...`, open hat on the "and" of 4. **Fixed.** [style-data] (solid)

AU-83. Arriving in a louder section, the drummer crashes, in every style, not only in rock, blues, disco and ska-punk. **Fixed.** [property] (solid)

AU-84. A section always playing the same pattern, with the busy patterns never heard in the head, was reported as a fault. **Resolved as intended:** the last band states it as a law, grooves belong to sections (X-A-29). [taste] (solid)

AU-85. From the owner's drum audit ("a solid session or house-band drummer that knows the rules"): no accented snare stab on a downbeat or on the sixteenths either side of the backbeat; fewer fills at minor seams (chance 0.15 plus 0.25 times intensity, down from 0.35 plus 0.35); and the drummer leaves out a non-structural fill when the soloist plays six or more notes in that bar. **Fixed**, approved by ear. [style-data] (solid)

AU-86. A drummer breathes inside a long section: a short snare lead-in on the last beat of interior four-bar phrases (45 to 80% of them by intensity), smaller than a section fill, no crash, backbeat untouched; never in jazz, reggae, bossa or acoustic. **Fixed.** The last band's phrase turns are DR-05 and DR-06. [style-data] (solid)

### The background layer (pads and horns)

AU-87. A pad sustains: a note common to two chords is held across the change, not re-struck. **Fixed.** [property] (solid)

AU-88. A background part at ballad level plays sparse swells; it does not switch off. It was silent below intensity 0.22. **Fixed:** silent below 0.15, swells up to 0.4. [style-data] (solid)

AU-89. An "answer" to the soloist has some relation to what the soloist played. The first band's was an ordinary stab with a label on it. **Open:** only ska-punk's horns ever echoed the soloist's own figure. [taste] (solid)

AU-90. The whole layer was removed in September 2026 (HI-05). Every finding in this group is moot unless the new band has a background part. [taste] (solid)

### Meter

AU-91. Tempo means quarter notes per minute in every meter. Counting 6/8 in dotted quarters was tried and reverted the next day at the owner's request, so that one number is one speed everywhere and matches other music software; a slow 6/8 jazz waltz felt at 60 dotted quarters is written 90. **Fixed.** [property] (solid)

AU-92. The jazz ride in 6/8 plays each pulse and the last eighth before the next pulse: `x...x. x...x.`. Placing the skip on the last sixteenth (`x....x x....x`) was "the single most audible source" of the jumbled feel. Target: at least 90% of ride strokes on those four positions. **Fixed.** [style-data] (solid)

AU-93. A jazz-waltz bass plays the two pulses and at most a pickup or two: 2 to 5 notes a bar up to intensity 0.7 (aim 3), 3 to 7 above (aim 5). One per eighth is running, not walking. **Fixed.** [metric] (solid)

AU-94. A jazz-waltz comp plays 1 to 4 chords a bar, at least 70% of them on a pulse or the eighth before one. It had been striking on 80% of sixteenths ("thick mush"); after the fix, 2.7 a bar. **Fixed.** [metric] (solid)

AU-95. A soloist must be made to breathe; the first band's could play 50 to 90 bars without a rest. **Fixed** with a budget: a phrase may run 4 bars when quiet and up to 8 when loud, then a rest whose length grows as the band gets quieter (3 to 4 bars in a quiet jazz ballad). Applied to every style it damaged neo-soul's recall of its own motifs, so it was kept to jazz and blues. KF-B-17 is the same lesson in the last band from the other direction (rests too long). [metric] (solid)

AU-96. Drums written for 4/4 are too busy when squeezed into 6/8: kick and snare on every eighth at any level. Density must taper: pulses when quiet, a backbeat at medium, eighth-note activity sparingly when loud. **Fixed** style by style. [style-data] (solid)

AU-97. Any rule that says "beat 3" means "the second strong pulse" and has to be restated for each meter. In 6/8 the 4/4 rule put an acoustic snare on a weak eighth, and every fix in this audit turned out to have an overlooked twin (the kick was corrected, the snare beside it was not). **Fixed**, with the lesson. [property] (solid)

AU-98. A clave or bell pattern is derived from how the bar is grouped, not from 4/4 positions; in odd meters the son clave lost its tail, and a first attempt at a 6/8 bell had the wrong rhythm until a reviewer supplied the standard seven-stroke bell. **Fixed.** [style-data] (unclear)

AU-99. A pedal bass in 5/4 or 7/4 plays the grouping pulse (3+2, 4+3), not every quarter. **Fixed.** [style-data] (solid)

AU-100. One name per style, used everywhere. Ska-punk's rules were filed in four places under a name the band never looked up, and bossa's in one, so whole features (fills, floors, endings) were silently absent and nobody heard them missing. **Fixed.** [property] (solid)

### Sound (the synthesized voices)

AU-101. Hitting harder makes an instrument brighter, not only louder. Missing from chords, soloist and most percussion. **Fixed** in the synthesized voices; the sampled instruments that replaced them have one loudness layer each, so this is **open** again (SN-21). [property] (solid)

AU-102. No two repeated notes are identical in tone. **Fixed** by small reproducible variation per note; on the sampled kit by rotating takes (SN-39). [property] (solid)

AU-103. A held note moves: its tone does not freeze once the attack is over. **Fixed** in the synthesized lead (slow brightness movement, vibrato that fades in). [taste] (solid)

AU-104. Three expressive features had been built and never switched on: the stagger of a strummed chord, the soloist's legato slide between notes, and a tremolo on pads. When the legato was woken its settings were found to be backwards (a slur with a sharper attack than a tongued note), because no one had ever heard it. **Fixed.** [property] (solid)

AU-105. "The chords get buried" was three mix faults pushing the same way, not a weak chord sound: the lowest fader, a 2 dB cut in the chords' own presence band at 2.5 kHz, and automatic attenuation of thick chords. **Fixed** (SN-30). [property] (solid)

AU-106. The audit's "honest list" said only three instruments truly need samples (an acoustic grand, acoustic cymbals, a string section) and that bass, electric piano, organ, horns, leads and drums could be synthesized convincingly. **Overturned by ear:** within a month every seat had a sampled instrument as its default wherever one existed (EAR-12, SN-01). [taste] (solid)

### Where the later findings are

AU-107. After June 2026 findings were filed in the project's online issue tracker and not in the repository. What survives locally is the merge note for each fix, and from those: a chord-identity sweep in September 2026 (minor triads and minor sixths no longer voiced as their relative major; a chord with no perfect fifth gets no natural fifth from any player; a written chord is never read as a different chord), and a style-by-style theory review of all thirteen styles as the last band was built. Their outcomes are the rules in parts A, B and C; the findings themselves cannot be listed from local sources. [taste] (solid)

## Lessons from the history

About 4,100 recorded changes from December 2025 to November 2026. Parts A and B already list what was tried for drums, bass, the conductor, endings (DR-94 to DR-102, BA-87 to BA-95, CO-53 to CO-59, EN-59 to EN-64), comping and the soloist (KF-B-01 to KF-B-39). The items here are the ones that belong to no single player, or that those lists do not carry.

### Tried and abandoned

HI-01. Reharmonizing on later choruses. In jazz and blues, from the third time through the form, the band substituted turnaround chords on its own: a tritone substitute for a V7 resolving down a fifth, and a dominant in place of a minor ii or a vi. Jazz substituted about one turnaround in three, rising to two in three; blues only occasionally. The chart kept showing the written chords. Shipped 2026-07-11, removed 2026-07-12: "subs weren't landing by ear". Every player agreed on the substituted chord and it still sounded wrong, so agreement was not the problem. [taste] (solid)

HI-02. Tempo that breathes with the music. Proposed, never allowed on by default, and a practice feature that ramped the tempo was deleted. The owner's reason is EAR-01. Energy may change how much is played and how hard; it may never change how fast. (CO-11.) [property] (solid)

HI-03. A time shift applied to the whole band. A "the band leans back together" offset added to drums and everyone else alike is the same value on both sides, so nothing moves relative to anything: it is latency. A version that varied from step to step was a wobble of at most about 3 ms, below hearing and against HI-02 anyway. Several generations of such machinery were found to be doing nothing and deleted. Any "the band pushes or drags" idea must be stated as some players against the drums. (CO-58, X-A-16, ST-surprise-08.) [property] (solid)

HI-04. Folding scattered timing numbers into one table changes any number that was tuned on top of an old one. The neo-soul bass had a lag of 10 to 25 ms added on top of a 5 ms base (about 24 ms in all); when the base became the style's 25 ms the same addition gave 44 to 50 ms, nearly double, and no test noticed because the test only asked for "at least". It was re-tuned to about 33 ms and given an upper bound. The last band's neo-soul bass sits 32 ms behind. [style-data] (solid)

HI-05. A fifth, always-on background player (pads, strings, horn stabs). Built up over months to style-specific parts: offbeat horn stabs in ska, disco strings, harmonised thirds and sixths in rock, a pedal-steel sixth in country, power chords in metal, a fingerpicked arpeggio in acoustic, sparse B.B. King-style horn answers in blues. Dropped whole when the last band was designed (decision of 2026-09-23): the band is drums, bass, comp and lead, and a second comping instrument or horn backgrounds behind a soloist are arrangement features to be asked for, not a part that always plays. [taste] (solid)

HI-06. Before it was dropped, the background layer taught two things about sound. A fast stream of notes through a voice designed for three sustained pad notes clicks and "sucks"; fixing the artifacts one at a time by ear did not converge, and the owner's reading was that the fast part only made an old fault constant and obvious. And a string section whose release tails run into the next chord turns to mud above about 100 bpm; the tail must shorten with the note. [property] (solid)

HI-07. A "recurring hook" cannot be had by raising the chance of reusing earlier material. Switching that reuse on and off moved the measured rhythm reuse between 61.9% and 65.9% and the contour echo between 43.0% and 41.8%, sometimes the wrong way, because the head was already being replayed underneath. A hook needs to be written once and placed on purpose. (SO-32 and SU-B-12 are the last band's version of the same wall.) [metric] (solid)

HI-08. Soloist "manners" named after famous players (one favouring extensions and avoiding roots, one favouring wide leaps, one displacing notes by a few milliseconds). Most were inaudible: their preferences were added in early and cancelled by general rules applied later (a wide-interval preference of 1.5 times met leap penalties that left it at 0.06), or were tuned to pass a test instead of to sound like anything (one carried a huge constant "to reliably exceed 40%"). (KF-B-02.) [taste] (solid)

HI-09. Expressive devices as a blanket chance per note. The first band scattered bends and ornaments by probability; the first time the owner heard a soloist with none at all he preferred it (EAR-02). What survived is ornament tied to phrase intent: bends on landings and peaks, in clusters, then space (KF-B-10, SO-55). [taste] (solid)

HI-10. Deciding drum patterns from an energy that changes during the bar. With energy drifting upward, the same bar played kick `x.x. ..x. x.x. ..x.` at 0.58 and `x... x... x... x...` at 0.64, with the eighth-note hat vanishing, and the change could land mid-bar. It was heard as the drums skipping. The pattern may change only at a barline; loudness and ghost notes may follow the energy continuously. [property] (solid)

HI-11. Energy controlling register. A bass anchor computed from intensity flipped by two octaves (MIDI 33 to 57) in the middle of a bar whenever intensity crossed a step. A bassist digs in; he does not move up the neck. Energy belongs on probability and loudness, never on position. [property] (solid)

HI-12. Loudness multiplied in three places. Style, intensity and conductor each scaled the bass's velocity, which ran into the ceiling at chorus level, so every note in the bar came out equally loud and the accents disappeared. One term now owns the swell (level 0.40 at intensity 0 to 1.50 at intensity 1, a measured 7 dB against a target of 6 to 8), and written accents are untouched by it. An accent of 1.15 times must come out at least 1 dB louder to be heard on a low note in a mix; through a square-root loudness curve it was 0.6 dB and inaudible. [property] (solid)

HI-13. In funk the One is the anchor, not necessarily the loudest note. Written levels that worked: the popped note brightest at 1.25, the slap on beat 3 at 1.12, fretted lead-ins 1.02, a flicked pop 0.92, a hammer-on 0.90, all clearly above the muted "chuck". This widened a verse's loudness spread from 0.6 dB to 1.5 dB and a chorus's from 2.0 to 3.5. [style-data] (solid)

HI-14. Synthesizing everything. The project began with the aim that a listener would say "I can't believe there's nothing to download". The synthesized voices were rebuilt with real craft (AU-101 to AU-104) and then, instrument by instrument, lost to samples at the first side-by-side listen. The synthesized set remains as the fallback before samples have loaded. [taste] (solid)

HI-15. A harmonica as the blues lead. Sourced, built and scrapped: the reed buzz of the free samples was heard as a rattle. [taste] (solid)

HI-16. Sampling a lead guitar convincingly. Judged too hard: sustain and drive can be had from samples, bends and vibrato cannot. The same recordings turned out to work better for rhythm guitar (SN-08, SN-09). [taste] (solid)

HI-17. Fixing a wrong-sounding instrument with tone controls on its group. A full round of equaliser moves aimed at a bottom-heavy jazz mix changed the low-frequency share from 91.3% to 90.8%: the bass sound itself was an electric bass, and no filter makes it an upright. The same applies in the other direction: brightness cannot be boosted into a sound that has none. Change the instrument first. [property] (solid)

HI-18. Re-shaping a response curve when the routing is wrong. A synthesized bass judged "too aggressive" was given a gentler drive curve and was still rejected, because the gritty layer was being sent through the distortion at any setting. When a second tuning by ear fails, suspect how the sound is built, not the number. [taste] (solid)

### Found by ear

HI-19. "The country band feels awkward." The swing amount (60) was applied to sixteenths, a lazy hip hop pocket lurching against a two-step. Moving it to eighths at 30 helped; it was still off, and the owner finally picked dead straight from ten rendered variants (DR-98, EAR-08). The diagnostic order that came out of it: check which note value swings, then the patterns, and only then the amount. [taste] (solid)

HI-20. For some weeks every listening link for a swung style played straight, because the link carried the style's name but not its swing. The owner approved many swung items on a straight feel before catching it on the jazz ride. Whatever is auditioned must be reached the way a user reaches it. [property] (solid)

HI-21. "Occasionally out of tune" on a sampled instrument is one sampled note recorded off pitch and labelled as if it were on. The upright bass had three such notes (12 cents flat, 23 and 18 sharp); the clavinet's were about 30 cents flat throughout. The cure is to record each sample's true pitch as a fraction, not the nearest note. (SN-16.) [property] (solid)

HI-22. A plucked upright note drifts in pitch as it rings, and the band's notes are mostly heard in their first 400 ms. Measuring pitch over the whole recording left one note 43 cents flat where it mattered. Measure where the note is heard. [property] (solid)

HI-23. A thin, metallic overtone on a sampled instrument that vanishes when that instrument is muted is a note played above the highest recorded sample, stretched upward. The cure is to fold such notes down an octave (SN-17). It appears only on the few highest notes, so it is easy to miss. [property] (solid)

HI-24. On an organ, the previous chord rang into the next bar and clashed. Nothing told a held chord to stop when the harmony changed; fading sounds had hidden it and the organ's flat sustain exposed it. Any sustaining instrument needs an explicit release at the chord change. [property] (solid)

HI-25. The kit crowded the bass. Noticed by the owner while playing along on a real bass: toms and kick body sat on the bass guitar's most-played register. A 2.5 dB cut centred on 120 Hz across the whole kit fixed it "immediately" (SN-30). [taste] (solid)

HI-26. A feathered jazz kick was pulling the upright bass down by about 7 dB every beat, because every kick dipped the bass by the same amount. The dip now follows how hard the kick is hit (SN-31). [property] (solid)

HI-27. An open hi-hat that is never closed piles up: disco stacked about fifteen overlapping washes. A hi-hat is one instrument; any new hat stroke cuts the open one ("tss-chk"). Trimming the open hat's ring short as a workaround was undone once the choke existed. [property] (solid)

HI-28. A classical guitar's vibrato at a horn's depth and speed (plus or minus 18 cents at 5.5 times a second) sounded seasick; it needs about 11 cents at 4.6. [style-data] (solid)

HI-29. "I hear no bends" on a twelve-bar blues. A recurring gesture had been scheduled "once every so many times through the progression", which is every 24 bars on a four-bar loop and every 72 bars on a blues (twice in three and a half minutes). How often something recurs is counted in bars, not in forms. [property] (solid)

HI-30. A shuffle that sounded like a dotted eighth and a sixteenth. Within each swung eighth the two sixteenths were being split 3 to 1 where they should be even; the long-short ratio between eighths was right the whole time. Swing has to be right at the subdivision below the one being swung. [property] (solid)

HI-31. A sound exported to a file sagged by 2.5 dB after its first bars, and chords were found ringing on after Stop, both discovered by listening to renders and not by any test. Stopping, exporting and looping are part of the music the owner hears. [property] (unclear)

### Hard to get right

HI-32. Stereo width took three attempts. Panning each group a little gave a side-energy share of 0.3 to 1.0%. A delayed copy of the reverb panned apart barely helped (funk reached 1.4%) because the two copies were the same signal. A reverb with separately tuned left and right halves took every reference scene to 5.5 to 10%. Width came from the room, not from moving the players. [property] (solid)

HI-33. Loudness took two. Originally the volume control fed a limiter, so turning up drove the band into distortion at the top. The second design brings each style to the same loudness first, limits, and applies the volume last (SN-36, SN-37). [property] (solid)

HI-34. Levels of sampled instruments were first matched to the synthesized instrument they replaced. The grand piano matched that way sat about 13 dB under the rest of the band. The reference is the band, and the final number is set by ear (SN-18, EAR-15). [taste] (solid)

HI-35. Charts of real tunes written from memory were wrong and a second opinion from memory confirmed them: "Night and Day" was entered as 32 bars of invented harmony (it is 48 bars, opening Abmaj7, G7, Cmaj7), and a correct bar of "Stella by Starlight" was "fixed" into an error. Every tune's chart must be checked bar by bar against a published source. [property] (solid)

HI-36. A complaint about how a tune flows may be a choice between published readings, not a mistake: the owner disliked bars 28 and 29 of "Autumn Leaves", the chart matched one standard source, and the lead-sheet reading was adopted in its place. Find out which before calling it wrong. [taste] (solid)

HI-37. Reading chord symbols. A long run of fixes ended in the rule that a written chord is never read as a different chord, with every spelling checked against an outside dictionary. The cases that had been wrong: minor triads and minor sixths voiced as their relative major; a natural fifth supplied under chords that have none; a lowercase numeral with an 11 read as major. [property] (solid)

HI-38. Compound and odd meters. Every fix exposed a neighbouring rule that still assumed four beats (AU-97), and a rule that only removes strokes can never restore one the 4/4 logic had already left out: in 6/8 the second pulse falls where 4/4 has its backbeat, so "kick on the beats except the backbeat" left one kick a bar, and it had to be put back explicitly. [property] (solid)

HI-39. A plan for a fix is itself a claim to test. During the first audit about 60% of the planned fixes turned out to rest on a wrong premise once someone traced it; in November 2026, reviewing fourteen musical fixes in one sitting, most had a real musical defect and the commonest source was the fix as originally proposed (protecting a note that did not exist, measuring a floor against the wrong player, a fallback note outside both chords). [taste] (solid)

HI-40. Three kinds of checking catch three different things, and none replaces another: breaking the rule on purpose to see the check fail catches a check that guards nothing; a fresh reader catches a check that guards the wrong thing (four out of four times in one session); and reading the rendered bars one after another, as a listener would hear them, catches what averages hide (ME-11). [taste] (solid)

## What the owner's ear has said

The owner is a bassist who also plays guitar and ukulele. He judges by listening, not by theory, and has said so. Words in quotation marks are his as recorded; everything else is a recorded paraphrase. Dates are when it was said.

### Standing preferences

EAR-01. "I'm still approaching this app as a fancy metronome at its core." (2026-07-06, on a proposal to let tempo breathe.) A player who mutes his own instrument and plays along cannot lock to a reference that moves; time stays rock-steady by default and anything expressive in time is opt-in. [property] (solid)

EAR-02. "The phrasing sounds really good." "This makes me think we've probably been overdoing the bends, haha — we'll want to be thoughtful as we reimplement other devices." (2026-06-27, first listen to a soloist that played plain notes with space, an arc and deliberate landings, and no bends or vibrato at all, mid-tempo jazz.) Plain but deliberate beats busy but decorated. [taste] (solid)

EAR-03. "Let's do this right. As usual, we should think about it in terms of the way pros actually play and the way a teacher would teach." (2026-10-11, on guitar fingerings.) A standard shape beats a cleverer one; a nice label that is shaky gets cut, not kept. [taste] (solid)

EAR-04. He asked for "a solid session or house-band drummer that knows the rules". (2026-05-30.) Not a flashy one. [taste] (solid)

EAR-05. "I trust your recommendations ... You probably know more music theory than I do at this point." (2026-09-18, on a voicing question.) Theory forks get one recommendation and proceed; how it sounds is still his call. [taste] (solid)

EAR-06. On three unexplained probabilities (a bass slide rate, the jazz ride's skip-beat chance, the jazz snare's comping chance): "I don't recall why those values were selected, and I'm open to input." (2026-07-16.) Two were judged right as they stood and one wrong (AU-60). An unexplained number is a question about the number, not a request for a comment. [taste] (solid)

EAR-07. Musical phrasing and idiom he has been willing to delegate to a careful reader; anything about the sound of an instrument or the mix (levels, room, placement) he keeps for his own ears. (2026-11-08.) Warm general praise is not approval of a particular change. [taste] (solid)

### Time and feel

EAR-08. Swing amounts passed by ear on 2026-09-26, on a 0 to 100 dial where 100 is a triplet: jazz 60, blues 100, neo-soul 45 on sixteenths, funk 15 on sixteenths, hip hop 25 on sixteenths, reggae 20 on sixteenths, acoustic 15, country 30. Country "still sounds off" at 30; a preset's 55 had "sounded stilted"; on 2026-10-13 he chose straight (0), with an even hat, a short bass note and a dry piano chop, from ten rendered variants. [style-data] (solid)

EAR-09. Jazz at swing 60 passed at 200 bpm as well as at medium tempo: no easing of swing as tempo rises. [style-data] (solid)

EAR-10. Shown a study of recorded human drummers (jazz players swing at what would be 85 to 100 on the dial; humans wander 8 to 13 ms where the band wanders about 1 ms), he chose to leave every swing value as it was. Live drummers on electronic kits are the wrong yardstick for programmed hip hop swing, jazz at 60 is his ear's call, and the band's steadiness is its identity. Do not reopen these from data. [taste] (solid)

EAR-11. In 6/8, all styles: "drums feel too busy in 6/8, especially obvious on rock; the genre-specific drum energy pushes too hard depending on genre." (2026-05-27.) [taste] (solid)

### The band's sound

EAR-12. On the first sampled drum kit: "really awesome", after asking for the crash 4 dB down and the disco open hat tamed. Then: a live drummer is the better default for most styles; the synthesized kit stays only where drums are programmed or triggered (hip hop, metal). (2026-06-22.) [taste] (solid)

EAR-13. "Sax sounds good!" (2026-06-22, the alto saxophone as soloist.) The only lead instrument with a plain yes on record. [taste] (solid)

EAR-14. Upright bass: "sounds really great ... especially the levels." (2026-06-22.) Later, "occasionally out of tune", which led to HI-21. [taste] (solid)

EAR-15. Nylon-string guitar lead: the tone is great, but it sat low and back in the full mix. Cured without changing the tone by more level (it is a dark sound and reads quieter than it measures) and less reverb, because reverb pushes a lead back. (2026-06-23.) [taste] (solid)

EAR-16. Overdriven guitar lead, first version: "a little brittle". Cured by a darker speaker simulation and a bump of body around 450 Hz, not by less drive. (2026-06-23.) [taste] (solid)

EAR-17. Two electric basses side by side: the fingered one "sits in the mix"; the brighter jazz bass read as harsh beside it. The reason electric basses were needed at all: through a tablet speaker the synthesized bass, nearly a pure tone, vanished. (2026-11-07.) [taste] (solid)

EAR-18. Instrument choices he made by ear: the clean electric guitar is the right lead for funk and for country (more idiomatic there than the nylon); bossa's lead guitar is nylon ("bossa nova is the nylon guitar"); rock's chords stay on the grand piano, with the guitar a choice; metal's power chords, first voiced around E3, "read too high" and belong an octave down as a low E chug. (June and July 2026.) Part C and SN-27 record that the last band's defaults differ in places. [style-data] (unclear)

EAR-19. "6/8 playback feels jumbled — All Blues + 6/8 should sound like a Miles Davis jazz waltz but doesn't." (2026-05-27.) This one sentence caused the meter audit (AU-91 to AU-99). Confirmed fixed by ear the next day. [taste] (solid)

EAR-20. Mix balance, from his first full pass (2026-05-23): drums were too far down to follow the beat; the soloist was buried for a lead; the bass sat "a touch forward"; the chords, once lifted, were "still slightly too present in some genres". The targets that came out of it are ME-33. On the sampled strings and horns later: "everything sounding pretty good ... levels right on the money." [taste] (solid)

### The soloist and the comp

EAR-21. On restatement as paraphrase (AU-38): he can "guess where the soloist might be going as the song progresses". (2026-05-25.) Recorded as the sign that structure had become audible. [taste] (solid)

EAR-22. "All genres currently end the same way." (2026-05-25.) Led to an ending per style. [taste] (solid)

EAR-23. "Some of the rests seem a bit long." (2026-09-24, first listen to the last band's soloist.) Measured afterwards: up to six bars of silence. (KF-B-17.) [taste] (solid)

EAR-24. A soloist's high point that happens once a song undersells it; a recurring peak reads as "a thing the lead does". One per 24 bars was still too sparse; one per 12 bars was right. One decorated note at each peak read as an isolated ornament; a cluster of expression around the peak, then space, read as a player getting lyrical. (2026-06-27; KF-B-09, KF-B-10.) [taste] (solid)

EAR-25. Organ comping: he was "hearing distinct beats" where an organ should hold. Swing rhythm guitar: "could swing better". (2026-09-23; KF-B-33, KF-B-34.) [taste] (solid)

EAR-26. He heard the jazz piano as thin under the saxophone when it laid out too readily. (2026-09-26; KF-B-35.) [taste] (solid)

EAR-27. Country rhythm guitar with offbeat strums placed by chance: "not musical, like math.random." And at fast tempos with sixteenth-note pickups: it "sounds busy in some scenarios". (June 2026; KF-B-25.) Deterministic is not the same as musical. [taste] (solid)

EAR-28. He noticed a single chord, the IVmaj7 in "Stella by Starlight", suddenly voiced twice as wide as its neighbours. (2026-06-22; KF-B-28.) He hears one out-of-family voicing in a tune. [taste] (solid)

EAR-29. A melody for a known standard built from one held guide tone per chord was "a bit sparse for the soloist". (November 2026; KF-B-20.) [taste] (solid)

EAR-30. The band dropping out for the drummer's four bars "unasked" does not fit a play-along tool; trading is something the player switches on. (2026-09-26; CO-32 onward.) [taste] (solid)

EAR-31. "Keep the pump." (2026-11-12.) When a rule against repeating the note before an approach was added, rock's eighth-note pump into the next root was explicitly exempted. [style-data] (solid)

### Decisions not to change something

EAR-32. Intros "feel natural across genres" as they are (AU-20). The range from sparse to busy comping "feels usable end-to-end"; a predicted collapse at the sparse end and collision at the busy end were not audible, and were left alone. (2026-05-25.) [taste] (solid)

EAR-33. He prefers a strong bossa identity to a split into bossa and samba, and does not reach for samba (AU-58). He found the idea of a horn section answering the soloist's own figure in ska appealing, and it was built. (2026-05-25.) [taste] (solid)

EAR-34. Going into the rewrite, his summary of the last band: the soloist is sometimes excellent and sometimes aimless or out of place; the comping is acceptable but rhythmically weak (KF-B-23, KF-B-39). [taste] (solid)

EAR-35. What he has not said. No recorded verdict exists on: the lead's pickups and tied barlines (KF-B-22), most of the soloist additions of July 2026 (KF-B-14), the clean electric guitar used for chords (its level was set on the lead and never re-checked), the rhythm-guitar crunch tone, or a per-style table of room and placement, which he reserved for his own ears and which was not built. [taste] (solid)

## Measuring quality

The old project could not hear and knew it. It measured the notes in two ways, measured the sound in four, and reserved the verdict for the owner. Its own statement of the limit: a passing score means the rules hold; it does not mean it grooves.

### What existed for the notes

ME-01. Two kinds of check were kept strictly apart. Properties, which must hold in every bar of every performance (ranges, no note under a silent bar, bass arrivals on chord tones, every comp chord carrying its guide tones, a guitar chord a hand can fret, no pitch struck on top of itself). And claims, which are a number measured over whole performances and required to fall in a range. A property never has a tolerance; a claim always does. [property] (solid)

ME-02. Properties were checked on every style, on six test charts, on each comping instrument, with eight seeds, looping and ending, first and second time through. A new style was subject to all of them the moment it existed. [property] (solid)

ME-03. A claim is four things: what is measured, a floor, a ceiling, and one sentence saying what it means musically ("the walk keeps moving: no repeated pitches", 0 to 2% of consecutive bass notes). Each style had its own list, grouped into takes (which comping instrument, a fixed energy or automatic, bass in or out, the lead playing the head or soloing or trading). About 130 measures were shared between styles and each style added its own. [metric] (solid)

ME-04. Every take was played on the same six charts (a 12-bar jazz blues, rhythm changes, a pop song with intro, verse, chorus and outro, a minor funk vamp with a bridge, a two-section bossa, a chart written in roman numerals), four seeds each, two times through for the rhythm section and a whole head-and-solos cycle for the lead, with swing switched off so that every note's position is exact. The numbers were pooled over all of it. [metric] (solid)

ME-05. Examples of ranges that the owner's ear later agreed with (jazz): bass notes per beat 0.85 to 1.05 when walking; half-step approach into 30 to 80% of chord changes; the comp's top note moving 3.5 semitones or less on average; the soloist never more than 8 bars without a breath, and at most 12% of its breaths two bars or longer; 95% or more of phrases ending on a chord tone; trilling in at most 4% of four-note runs; the comp sharing the soloist's exact pitch at most 15% of the time; comp activity in the soloist's breaths 1.1 to 2 times its activity under the line. Part B (Q-01 onward) and the style sections of part C carry the full set. [metric] (solid)

ME-06. Before any listening, the first bars of a new style were printed as a text grid and read. The instruction was to read the grid before asking for an ear. Later this became a formal "taste read": a fresh reader goes through the rendered bars, old against new on the same seeds, quoting sequences of bars. [taste] (solid)

ME-07. Listening itself was organised as a menu: one link per thing to listen for, each opening the app on exactly that chart, style, tempo, energy and seed, with an old-against-new pair where there was a change; only questions of taste or timing went on the menu. Anything a measurement could settle was not put in front of the owner. [taste] (solid)

### How claims go wrong

ME-08. Five recurring ways a claim looked healthy while guarding nothing: (a) it computed the expected pattern from the same rule the band used, so a wrong rule passed at 100% (the bossa clave was wrong this way, "every eighth except beat 3" labelled as a clave); (b) its floor was below what random notes would score; (c) it measured something other than its name said; (d) the report printed one target and the check enforced a looser one; (e) the test fed the band an incomplete situation, so the part being judged never played and only the fallback was measured. [property] (solid)

ME-09. Every floor and ceiling should say which kind it is. An intent bound is true whatever the band currently plays ("a backbeat is louder than a ghost note"); loosening it is a musical decision. A measured bound sits a stated margin from what the band currently delivers, with the chance level alongside ("delivers 0.62, random gives 0.33, floor 0.50"); loosening it needs a new measurement. Without the label, each deliberate change quietly loosens whatever it trips and the numbers stop meaning anything. [property] (solid)

ME-10. The best measured bounds were set between ablations: the value with the behaviour switched off, the value as it plays, and the value with it always on, with the floor and ceiling between them. A claim that still passes with its behaviour switched off is not a claim. [property] (solid)

ME-11. An average hides a split. The comp's top-note movement averaged 1.19 semitones and passed; inside that were 65% held notes and 14% leaps, heard as the top of the chord flipping an octave on alternate downbeats. Report the shape (how many holds, steps, leaps) and read sequences of bars, not only the mean. [metric] (solid)

ME-12. A rate measured on nothing passes any ceiling. A style that played no half-step lead-ins scored 0% "lead-ins from too far away" and passed. Every rate needs a floor on how many cases it was measured over. [metric] (solid)

ME-13. A gesture with a direction needs a signed measure and a list of legal moves. "An octave between the beat and its offbeat" scored disco's octave pump at 88.8% while the line was descending more often than ascending (243 times to 209) and holding the low root on only 48% of downbeats; measured as "the offbeat is exactly an octave above", the same playing scored about 41%. The list of legal moves (same note, or an octave up) also caught a two-octave leap and a unison that no rate would have. [metric] (solid)

ME-14. "Fixed" means fixed with respect to what was varied. Eighteen tests at a constant energy passed while a bass register jumped two octaves whenever energy crossed a step (HI-11). Anything the music reads while playing has to be swept across its boundaries in a test, not held still. [property] (solid)

ME-15. A rule with a threshold is tested on both sides of the threshold, not in the middle of each band. Tests that sampled one comfortable value per band kept passing when a boundary was moved from 0.80 to 0.75. [property] (solid)

ME-16. Measure at the musical event. "Share of chord tones in an answering phrase" was really the blues scale's natural share (40 to 48%) and said nothing about endings until it was measured on the last note before each silence. "Chromatic approaches" counted any half step on any offbeat (random notes scored 8%) until it was measured only on the last eighth before a real chord change, where the band delivered 85% and the floor could be 50%. [metric] (solid)

ME-17. Choose the denominator a musician would. "Does funk comping hit the One" as hits on the One divided by all stabs can never exceed about 18% in a syncopated part and punishes syncopation; as bars with a hit on the One divided by bars, it reads 100% and can be held above 95%. [metric] (solid)

ME-18. Know the chance level. A check that chord tones exceed 15% of notes passes on random notes (4 of 12 pitch classes is 33%). [metric] (solid)

ME-19. Test the embellishment, not only the skeleton. Country's random strum scatter survived because the check looked only at beats 1 to 4. For a steady idiom the right check is that bars are identical. [property] (solid)

ME-20. Measure what the listener hears, by the route the listener hears it. A comping pattern with no downbeat passed its check while the finished part hit the downbeat in about 80% of bars, because a later stage filled it back in. A voice feature keyed to a name the band never used passed a listening test, because the owner heard the fallback and approved it. Listening links that dropped the swing passed for weeks (HI-20). [property] (solid)

ME-21. Ask "above what?" A rule about a chord's fifth is stated from the root; a bass line is built from the sounding bass note. Over a chord on its own third (C/E), a fifth above the bass is the chord's major seventh. The check never saw it because its test chords had no slash bass. Test material must be able to express the hard case. [property] (solid)

ME-22. Repetition can only be measured over several times through the form, and sparseness lowers a reuse share: a sparse hip hop lead scored 0.35 on rhythm reuse against a busy neo-soul lead's 0.45 while sounding more repetitive. A count of the same figure coming back in the same place is the honest measure (SO-32). [metric] (solid)

ME-23. Several preferences pushing the same way hide the one being measured; isolate it. And a preference strong enough to produce a wide statistical gap often sounds mechanical (an answer that always lands on the root). The settings that sounded right were weaker and reliably directional. [taste] (solid)

ME-24. When comparing two times through the form, assert that they differ, not that the later one has "more"; which way a varied note moves is not the point and direction-based checks were flaky. [metric] (solid)

ME-25. Adding one more option to a set of weighted choices changes every measure that recognised the old options by their traces in the notes: a new "half drop" in a bass variation was at first counted as a full drop, because "no note on the downbeat" matched both. Each gesture needs its own recogniser, and expected rates must be re-measured, not re-derived. [metric] (solid)

ME-26. Four seeds are not a population. One floor was nearly tripped by a change that had not made anything worse: the four standard seeds happened to sit at the low end of what seeds produce. Bounds were set from the four; nothing reported the spread across many. A scorer over hundreds of seeds should report the distribution and its worst cases, not one pooled number. [metric] (solid)

### Which measures tracked the owner's ear

ME-27. Tracked: length and frequency of the soloist's silences (EAR-23); comp strikes per bar under a solo, with a floor (EAR-26); trilling; the comp's unison with the soloist; lead-ins that resolve by step in the actual octave (BA-87); a swing table stating for each style which note value swings and where the offbeat falls, which caught country (HI-19); the share of bars identical to the section's usual bar for steady grooves; integrated loudness per style; side-energy share for stereo width. [metric] (solid)

ME-28. Misled: any pooled average of interval size; share-of-notes measures taken over whole phrases; reuse shares (ME-22); absolute intervals (ME-13); a target that jazz comping should play the Charleston figure in over 70% of bars, when what passed by ear had it in about 25% (KF-B-38); and every sound threshold set by guess before reference recordings were measured (ME-31). [metric] (solid)

ME-29. Not measured at all, and where the owner's remaining complaints live: whether one phrase follows from the one before, whether a chorus goes anywhere, whether the comp's rhythm has a shape over four bars, whether the band sounds like one group of people (KF-B-23, KF-B-39). Everything the old measures scored was local: a note, a bar, a change. [taste] (solid)

### What existed for the sound

ME-30. A report per instrument group and for the whole mix on four reference scenes (a rock backbeat, a blues shuffle, a jazz ride, a funk pocket) and one scene per style at a typical tempo (rock 118, jazz 138, funk 104, disco 120, hip hop 90, blues 96, neo-soul 84, reggae 76, acoustic 100, bossa 130, country 110, metal 140, ska-punk 160 bpm): peak, average level, loudness and true peak by the broadcast standard, share of energy in low, middle and high bands, brightness, stereo width, and how many notes sounded at once. [metric] (solid)

ME-31. Thresholds for "something is wrong with the mix" were first set by guess and all three were wrong. Eight commercial recordings measured the same way (level at seven probe frequencies, 60, 140, 380, 1000, 2800, 5000 and 7200 Hz, each as a share of their sum) gave: the two lowest probes together from 47% (a jazz sextet with horns and upright bass) through 73 to 83% (rock, funk, blues, a piano trio) to 91% (ska-punk); side-energy share from 3% (modern pop) through 8 to 15% (funk, rock, blues) to 45% (a 1961 hard-panned trio); "air" at one high probe never above 4.5%. The guessed limits (bottom-heavy above 55%, air below 8%) would have condemned almost every reference. [metric] (solid)

ME-32. What the references taught. Bottom-heaviness depends on the instruments present, not the genre: a jazz trio is heavier below than a blues band, and an electric bass cannot be judged against an upright recording (the old band's jazz scene, at about 75%, was re-judged against electric-bass jazz records at 57 to 70% and given a ceiling of 76%). Stereo width is judged by side-energy share, not by left-right correlation: a record can be 0.94 correlated and sound properly stereo. Target 3% or more, and no more than 20%. A single narrow probe for "air" was in the wrong place and misread a record with obviously bright hi-hats as dull. [metric] (solid)

ME-33. Balance targets from the owner's passes, each against the whole mix: drums 4 to 5 dB under (quieter in jazz, naturally), bass about 5 dB under, lead 3 to 4 dB under, chords about 10 dB under. The first measurements had drums 7 to 9 dB under and the lead 5 to 7 dB under: beat hard to follow, lead buried. [style-data] (solid)

ME-34. The loudest group hides the rest. Levels combine so that the whole-mix number is nearly the bass's number; a build in which drums, chords and lead each rose 2 dB read as "flat" because the bass rose 1 dB. Judge a build on each group and on the mix the listener hears with the lead in, and require a change of at least 1.5 dB before calling it one. [metric] (solid)

ME-35. Matching a sampled instrument's level to the one it replaces by average level is a starting point. Dark sounds read quieter than they measure and want 1 to 3 dB more (nylon guitar, Rhodes, organ, upright); bright or percussive ones read louder and want about 1 dB less (clavinet, saxophone); a sound of matching brightness can sit at the measured match (clean electric guitar). The band, not the replaced instrument, is the reference, and the final value is set by ear on a real device. [taste] (solid)

ME-36. A check of the sound against the notes, readable without ears: for each note the band asked for, did it sound, on time, at about the loudness asked, at the pitch written, and in tune (more than 10 cents out on a sampled note flags a badly labelled sample); and did anything sound that was not asked for (a click). It deliberately gives no verdict and cannot judge whether the notes were good ones, only whether they became sound. Its known blind spot is very quiet notes. [property] (solid)

ME-37. A frozen set of notes rendered through the instruments and reduced to a fingerprint (level, peak, eight frequency bands, width, level every half second) fails when the sound changes and ignores changes to what the band plays. It repeats to 0.02 dB and tolerates 0.1 dB, which is fine enough to catch half a decibel on the bass, a reverb filter moved from 600 to 500 Hz, a level changed from 1.5 to 1.55, or one sample 10 cents out. [property] (solid)

ME-38. The live band's clock was measured against the grid: within 1 ms of where each note should be and under 0.35 ms of drift per bar. Human drummers in a public corpus wander 8 to 13 ms. The steadiness is deliberate (EAR-10). When quoting human swing, convert a position in the beat to the dial with (position minus 0.5) times 600: a position of 0.64 to 0.77 is 85 to 100, not "64 to 77". [metric] (solid)

ME-39. Chord reading was held to an outside dictionary: every chord spelling must mean what the dictionary says, and no comping chord may contain a note its symbol rules out. The bass and the soloist were deliberately not held to that second rule, because a line reaches for wrong notes on purpose. [property] (solid)

## Sounds

Thirteen sample packs exist on this machine, all already cut, levelled and encoded for the old app. Every seat also has a built-in synthesized instrument, which is what plays until a pack has been fetched.

### Inventory

All packs live under `/home/brandon/code/ensemble/core/packs/`, one folder per pack. Each folder holds one audio file per sampled note or drum take (AAC in `.m4a`), a `manifest.json` listing each file with the pitch it was recorded at, and a `CREDITS.txt` with the attribution text. The original recordings they were cut from are not on this machine; the recipe for fetching, cutting and encoding them again is `/home/brandon/code/ensemble/docs/guides/sample-pack-sourcing.md`.

Every pitched pack has exactly one recording per sampled note: one loudness layer, no alternate takes. Loud and soft are the same recording turned up or down.

| ID | Folder | Instrument | Source and author | Licence | What is sampled | Level, room, tone (SN-18 to SN-20) |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| SN-01 | `grand` (1.6 MB) | Acoustic grand piano (a Yamaha C5) | Salamander Grand Piano V3, Alexander Holm | CC BY 3.0, credit required | 21 notes, C2 to C7 (MIDI 36 to 96) every minor third; stereo; about 6 s each | level ×8; room ×1 |
| SN-02 | `rhodes` (0.8 MB) | Tine electric piano | jRhodes3c, Jeff Learman | CC BY-NC-SA 4.0: non-commercial use only | 15 notes, F1 to C7 (29 to 96), about every fourth; stereo on purpose | level ×4.5; room ×1.4 |
| SN-03 | `hammond-organ` (0.8 MB) | Drawbar organ (an emulation, not a recorded Hammond; no rotating speaker) | FreePats Drawbar Organ Emulation | CC0 | 16 notes, C2 to C7 (36 to 96) every major third; 4 s each, extended for held notes (SN-23) | level ×6.6; room ×1.5 |
| SN-04 | `clavinet` (0.2 MB) | Clavinet | GeneralUser GS soundfont, S. Christian Collins | GeneralUser GS licence 2.0 (free to use and modify; the author cannot vouch for every sample's origin) | 8 notes, about B1 to E6, roughly every 7 semitones, each recorded pitch a fraction (35.12, 41.97, 49.65, 56.70, 63.65, 73.72, 80.68, 87.64); mono; 2.2 s each | level ×6.5; room ×1.6 |
| SN-05 | `sax-alto` (0.7 MB) | Alto saxophone | Weresax, Karoryfer Samples | CC0 | 11 notes, C#3 to G5 (49 to 79) every minor third | level ×3; room ×1.2; tone −1.5 dB (darker) |
| SN-06 | `nylon-guitar` (0.6 MB) | Nylon-string (classical) guitar | FreePats Spanish Classical Guitar | CC0 | 19 notes, C3 to C6 (48 to 84) every whole step; mono | level ×5; room ×1.0; tone +2 dB (brighter) |
| SN-07 | `electric-guitar-clean` (0.7 MB) | Clean electric guitar (single coil) | FreePats FSBS Electric Guitar Clean #1, small set | CC0 | 13 notes, C2 to C#6 (36 to 85) about every major third; mono; sustained, with a fade at the end | level ×3; room ×1.1 |
| SN-08 | `electric-guitar-driven` (0.7 MB) | Overdriven lead guitar | The same 13 recordings as SN-07 put through an amplifier simulation offline (SN-25) | CC0 | as SN-07 | level ×3.4; room ×1.2 |
| SN-09 | `electric-guitar-rhythm` (0.7 MB) | Crunch rhythm guitar | The same files as SN-08 under a second name, so it can have its own level as a chord instrument | CC0 | as SN-07 | level ×4.2; room ×1.2 |
| SN-10 | `acoustic-kit` (1.6 MB) | Acoustic drum kit | Versilian Community Sample Library (most pieces) and Virtuosity Drums (ride, bell, crash, pedal hat), Versilian Studios and Karoryfer Samples | CC0 | 45 mono takes: kick 4, snare 4, cross-stick 2, closed hat 4, open hat 2, pedal hat 4, ride 4, ride bell 3, crash 4, high tom 3, mid tom 3, low tom 4, shaker 4. One loudness per piece. | level ×1.6; room ×0.7 |
| SN-11 | `upright-bass` (0.2 MB) | Upright bass, plucked | VSCO-2 Community Edition, solo contrabass pizzicato, Versilian Studios | CC0 | 8 notes, E1 to E3, every 3 to 4 semitones, each recorded pitch a fraction (27.96, 30.88, 34.01, 38.03, 41.74, 45.34, 49.00, 52.02); mono | level ×1.5; room ×0.6 |
| SN-12 | `electric-bass-fingered` (0.7 MB) | Electric bass, fingered, neck pickup (a five-string Washburn) | Black And Blue Basses, Karoryfer Samples | CC0 | 12 notes, B0 to G#3 (23 to 56) every minor third; medium-loud layer of the source's four; mono; 5 s each | level ×2.9; room ×0.6 |
| SN-13 | `electric-bass-jazz` (0.9 MB) | Electric jazz bass, recorded direct, both pickups | Growlybass, Karoryfer Samples | CC0 | 12 notes, C#1 to A3 (25 to 57) every minor third; loud layer of four; mono; 6 s each | level ×3.1; room ×0.6 |

SN-14. Two more packs existed from June to September 2026 and were deleted with the background layer (HI-05): a string section (sustained violins with vibrato, top sampled note D5) and a horn section (staccato trumpets, top sampled note C5), both from VSCO-2 Community Edition, CC0. They can be recovered from the old repository's history before 2026-09-29, where the packs folder was `public/packs/` and the two were named `strings-ensemble` and `horns-section`. [taste] (solid)

SN-15. Licence obligations. The grand needs its author credited wherever the app lists credits. The Rhodes may be used only while the project is non-commercial; if that changes it must be replaced or licensed from its author. Sources checked and rejected because their terms forbid serving the samples as files: Sonatina Symphonic Orchestra, Philharmonia, Pianobook, the free Native Instruments and M-Audio kits, 99sounds, SampleRadar. The Salamander drum kit is share-alike, heavier than the piano's terms. [property] (solid)

### Quality notes

SN-16. Each sample's recorded pitch must be measured (three methods agreeing, in the stretch just after the attack) and stored as a fraction; the names on the source files are wrong often enough to be useless (one library labels every note an octave high, another calls a G1 "B2", a third calls middle C "C3"). A scattered error of tens of cents between samples is a fault; a smooth rise toward the top of the piano (8 cents sharp at A5 to 24 at C7) is the piano's own stretch tuning and is left alone. [property] (solid)

SN-17. A note above a pack's highest sample is played an octave (or two) lower, not stretched up: stretching upward by more than about two semitones rings thin and metallic. The old band's ranges overshot the packs: the lead could ask for MIDI 90 against a saxophone that stops at 79 and guitars that stop at 84 or 85; the bass for 57 against an upright that stops at 52. Either give the players each instrument's real range or keep the fold. [property] (solid)

SN-18. Level. Each pack has one multiplier that seats it in the band, found by measuring against the instrument it replaces and then set by ear on a real device (ME-35). The grand needed ×8 after ×3.5 left it about 13 dB under the band; bass and drums sat at their measured match (they are the foundation, and the synthesized ones were already seated); the electric basses were deliberately set where the upright sits, 3.4 dB under the synthesized bass, so that the bass level does not jump between a jazz tune and a rock tune. A sample may be played at up to 8 times its recorded level; a quiet source must also be encoded loud, or no multiplier can rescue it. [style-data] (solid)

SN-19. Room. Each pack scales its seat's reverb send: dry direct-recorded instruments get more (clavinet ×1.6, organ ×1.5, Rhodes ×1.4, saxophone and driven guitars ×1.2, clean guitar ×1.1) so they are not pasted on top of the band; recordings that carry their own room get less (kit ×0.7, basses ×0.6, the deleted strings ×0.7 and horns ×0.9). More reverb pushes a lead back, which is why the nylon guitar was returned to ×1.0. [style-data] (solid)

SN-20. Tone. A pack matched in level can still be the wrong brightness for tone shaping that was designed around another instrument. Two packs carry a tilt (highs up and lows down by the same amount, or the reverse, so level is unchanged): saxophone −1.5 dB, nylon guitar +2 dB. The crunch rhythm guitar measured clearly brighter than the instrument it replaced and was left for a listening pass that did not happen. [style-data] (unclear)

SN-21. The largest known weakness of the set: no loudness layers anywhere. A hard note is a soft note turned up. The snare has one stroke, so a ghost note is that same backbeat recording darkened (highs removed above 2.8 kHz), held for 25 ms and then closed off within about a third of a second. The source libraries for both electric basses and the kit have more layers, and staccato and muted takes, that were never brought in. [taste] (solid)

SN-22. Missing instruments, as far as free sources go: no brushes on the snare and no clean china cymbal exist under a usable licence (those stay synthesized, stroke by stroke); no trumpet (the built-in synthesized lead is a trumpet and is what a "trumpet" lead plays); no bowed solo strings; no better clavinet than the eight-note one, which is the thinnest pack and the one stretched furthest between samples. The mid tom is not a recording: it is the high tom lowered two semitones. [taste] (solid)

SN-23. The organ's recordings are four seconds long and a band holds a chord for bars, so a held organ note is continued by starting the recording again after its attack and crossfading, at equal power. Looping a fixed slice does not work on this source because its tones are not in step with each other. Only sustaining instruments get this; a struck or plucked note must die with its recording. [property] (solid)

SN-24. Spacing of samples: about every minor third for sustained instruments, every whole step for plucked ones, because a plucked attack gives away the stretching sooner. Mono unless the stereo is the sound: the Rhodes's shimmer is a chorus between its two channels that cancels when summed. Drum takes are mono because each is placed by the mix. [style-data] (solid)

SN-25. The overdriven guitar is the clean guitar reprocessed, not a recording of a driven amp: low end trimmed below about 90 Hz, soft clipping at four times drive with a slight asymmetry for warmth, then a speaker simulation, which makes or breaks it. The first speaker voicing (highs to 5.2 kHz, +4 dB at 2.6 kHz, scooped low mids) was the "brittle" one (EAR-16); the kept one rolls off at 4.0 kHz, adds +2.5 dB at 450 Hz and only +1.5 dB at 2.4 kHz. Drive is the main knob by ear: 3 for a bluesy edge, 5 to 6 for more grit. [style-data] (solid)

SN-26. Which leads convince. Alto saxophone: yes, by the owner's word (EAR-13), and it is the lead of five styles in the last band (jazz, funk, disco, reggae, bossa). Nylon guitar: tone "great" once seated (EAR-15); bossa in the earlier defaults, acoustic in both. Clean electric guitar: chosen by ear for funk and country and never complained about; the last band also gives it blues, neo-soul and hip hop. Overdriven guitar: the weakest; by its makers' own note it approximates a lead tone, and what makes a lead guitar (bends, vibrato) has to be added by the player in performance, as pitch movement applied to the samples. Built-in trumpet: what the packs were made to replace, still ska-punk's lead; no verdict recorded since. Harmonica: rejected (HI-15). [taste] (unclear)

SN-27. Which sounds each style gets is decided in two places that disagree. An older table by style says blues is organ and saxophone, reggae and ska-punk organ, disco Rhodes, rock grand with overdriven lead. The last band's styles each name a comping instrument and a lead: blues piano and clean guitar; reggae, disco and ska-punk clean guitar; no style names the organ at all, though the band can play one when asked. Bass and drums follow the older table in both: upright for jazz, blues, bossa, acoustic and country, fingered electric for the other eight; the sampled kit everywhere except hip hop and metal. (ST-surprise-25.) [style-data] (unclear)

### The mix

SN-28. Signal path. Four groups (drums, bass, comp, lead), each with its own level, tone shaping, place between the speakers and send to one shared reverb; their sum goes through a gentle compressor, a make-up gain chosen by style, a limiter, and last the listener's volume. Synthesized and sampled instruments share their group's whole treatment, so one change to a group reaches every sound that can sit in it. [property] (solid)

SN-29. Group levels relative to each other: drums 0.38, lead 0.20, comp 0.135, bass 0.135 (drums 9 dB over comp and bass, lead 3.4 dB over them), and the sum is scaled by 0.34 into the compressor. These were set to reach the balance of ME-33. The synthesized chord instrument is trimmed to 0.85 beside the sampled ones. [style-data] (solid)

SN-30. Tone shaping per group. Comp: lows shelved down 2 dB below 350 Hz, a broad 2 dB lift at 2.5 kHz (this had been a cut, one of the three things burying the chords, AU-105). Bass: +2 dB shelf below 100 Hz, −3 dB at 450 Hz, +3 dB at 2 kHz for definition. Lead: +2 dB at 3.5 kHz. Drums: rumble removed below 40 Hz, a broad −2.5 dB at 120 Hz to leave the bass its register (HI-25), +2 dB at 5 kHz. [style-data] (solid)

SN-31. The kick dips the bass under it: a full-strength kick takes the bass to 45% (about 7 dB down) within about 5 ms and lets it back over about a tenth of a second; a softer kick dips it proportionally less, a feathered one hardly at all. Both the synthesized and the sampled kick must do it. [property] (solid)

SN-32. Jazz is the only style with tone shaping of its own, because it has an upright and a soft kick: comp lows shelved down 5 dB (not 2), bass shelf −1 dB (not +2) with rumble removed below 55 Hz (not 20), drums below 95 Hz (not 40). It changes over smoothly when the style changes mid-song. [style-data] (solid)

SN-33. One reverb for the whole band: a hall with a decay of 2.2 seconds, highs damped above 3 kHz inside it, and only 600 Hz to 6 kHz allowed into it, so no bass or kick muddies it and no hiss rides on it. Its left and right halves are tuned separately, which is where most of the band's stereo width comes from (HI-32). Sends: lead 0.6, comp 0.3, drums 0.2, bass 0.05, each then scaled by the pack's room figure (SN-19). [style-data] (solid)

SN-34. Places between the speakers, on a scale from −1 (left) to +1 (right): bass and kick centre; comp −0.3; lead +0.25 with each note drifting up to 0.05 either side; snare and cross-stick −0.2; hi-hats, crash and shaker +0.35; toms spread up to 0.25 either side, differently for each stroke but the same every time the passage is played. Bass stays centre because low notes cannot be placed by ear anyway. [style-data] (solid)

SN-35. Glue. One compressor on the whole band, deliberately mild: it starts working at −18 dB, 2 to 1, soft knee, 25 ms attack so drum hits pass, a quarter-second release. Its purpose is that when everyone peaks together the sum is evened out before the limiter, which otherwise pulled everything down and buried the chords. No group has a compressor of its own. [style-data] (solid)

SN-36. Loudness. Every style is brought to the same loudness, −16 LUFS integrated with the lead off and each style on its own instruments, by a make-up gain per style applied before the limiter: jazz 12.4 dB, country 12.1, blues 11.1, reggae 10.8, bossa 10.2, funk 9.4, acoustic 9.0, neo-soul 8.8, hip hop 8.4, rock 8.1, ska-punk 7.8, disco 7.3, metal 7.2. These are measured, not set by ear, and must be measured again whenever an instrument's level, a group's shaping or the compressor changes; a style more than 1 LU off is re-derived. Changing which bass eight styles use moved four of them by more than that. [style-data] (solid)

SN-37. The limiter looks 5 ms ahead, holds true peaks to −1 dB and recovers in 100 ms, fast enough to let go between drum hits. The listener's volume comes after it, so volume only ever turns the band down. An ordinary compressor used as a limiter was rejected: it misses peaks between samples, adds gain of its own and behaves differently from browser to browser. [property] (solid)

SN-38. Drum kit balance is baked into the recordings, since the kit is levelled as one instrument. Peak targets set by ear, in dB below full scale: kick and snare 7; toms 8; ride bell 11; crash 12; ride 13; cross-stick 13; open and closed hat 15 (open hat ringing 2.2 seconds); shaker 18; pedal hat 19. The first listen asked for the crash 4 dB lower than first cut. [style-data] (solid)

SN-39. Repeated strokes rotate through a piece's takes and never play the same take twice running, which is what stops a roll from sounding like a machine gun; the choice is reproducible, so an export is identical every time. An open hi-hat is cut by the next hat stroke of any kind (HI-27). [property] (solid)

SN-40. Vibrato on a sampled lead is added by the player, not recorded: by default up to 18 cents either side at 5.5 times a second, fading in after the note starts so that only the sustained part moves; 11 cents at 4.6 for the nylon guitar. A horn's fall-off at the end of a note takes the note's last eighth and sinks about 8 dB as it drops; the vibrato stops when the fall starts. [style-data] (solid)

SN-41. Things the mix does not do, and their status. No per-style room, placement or reverb amount: proposed, reserved by the owner for his own ears, not built. No difference in loudness response between instruments other than the bass. Measured side by side on one performance, an all-sampled band came out about 2.6 dB quieter than the all-synthesized one and narrower (side-energy share at the 3% floor), because most packs are mono; widening mono samples was listed as a next step and not done. [taste] (solid)

## Surprises

SU-D-01. A feature that is silently absent sounds exactly like a feature that makes no difference. The drummer's "busier on later choruses" rule did nothing for a month; a hip hop bass slide was written into the notes and never sounded; a new horn voice was approved by ear while the old one was playing; and the reworked synthesized instruments were being auditioned through a switch while every ordinary listener still heard the old ones. Before asking anyone to listen, prove the thing is sounding. [property] (solid)

SU-D-02. A test can agree with a wrong rule perfectly. The bossa clave was wrong (every eighth except beat 3 in one bar, a single stroke in the next) and its test passed at 100%, because the test worked out the expected clave from the same rule. Expected patterns are written out by hand: bar 1 `x... ..x. .... x...`, bar 2 `.... x... x... ....`. [property] (solid)

SU-D-03. A reviewer's recommendation can be right about the place and wrong about the music. The audit asked for the fifth to outrank colour tones in a four-note voicing; done literally it removes the b9 from a 7b9. About six fixes in ten needed their premise corrected before they were safe (HI-39). [property] (solid)

SU-D-04. Which note value swings matters more than how much. 30 on eighths is a country lilt and 30 on sixteenths is a lazy hip hop pocket; the long-short ratio is identical. Any statement or check of a swing amount is incomplete without the note value. [style-data] (solid)

SU-D-05. The band's stereo width comes from the reverb, not from where the players sit. Panning alone left it effectively mono; and because most sample packs are mono, a fully sampled band is narrower than the synthesized one. [property] (solid)

SU-D-06. Reverb pushes a lead back and down; a dark instrument reads quieter than it measures and a bright one louder. Seating an instrument is level, room and brightness together, in that order of reach, and the last decibel is set by ear on a real device. [taste] (solid)

SU-D-07. Changing one instrument changes a style's loudness. Swapping the bass for eight styles took four of them more than 1 LU off target, and their make-up gains had to be measured again. Loudness per style is a property of the style on its instruments, not of the style. [property] (solid)

SU-D-08. The bass has to be audible on a small speaker, where its fundamental does not exist. The near-pure synthesized bass vanished on a tablet; the electric basses were compared through a stand-in that removes everything below 150 Hz, and the one whose body sits at 200 to 400 Hz carried better there, yet the owner chose the rounder one for how it sits on real speakers. Both checks are needed. [taste] (solid)

SU-D-09. "Bottom-heavy" is about who is in the band. A jazz sextet with an upright and a piano trio differ more in low-end share than jazz differs from rock, and an electric bass can never be judged against an upright recording. Calibrate a mix against records with the same instruments. [metric] (solid)

SU-D-10. A plucked sample's pitch is not one number: it drifts as it rings, and the part of the note the band actually uses is the first 400 ms. A sample tuned on its whole length can be 40 cents out where it is heard. [property] (solid)

SU-D-11. How often something recurs must be stated in bars. Stated in "times through the progression" it was right on a four-bar loop and three times too rare on a twelve-bar blues (HI-29). [property] (solid)

SU-D-12. A style filed under two spellings of its name loses features without any error: ska-punk's fills, energy floor and ending, and bossa's ending, were absent for weeks. The same trap caught a test that was meant to guard a bossa rule and used the other spelling. [property] (solid)

SU-D-13. The organ is the one comping instrument in the inventory that no style of the last band chooses by default, although an older table gives it blues, reggae and ska-punk and a good deal of care went into making it hold, re-press and sustain correctly (SN-23, SU-B-07). Decide on purpose where it plays. [style-data] (unclear)

SU-D-14. In 6/8 the tempo number still counts quarter notes, the jazz ride's skip is on the last eighth of each group and not the last sixteenth, and the second pulse sits exactly where a 4/4 rule expects a backbeat. Each of the three was got wrong first. [property] (solid)

SU-D-15. The same lesson was learned twice, a season apart, in both bands: an approach note must resolve by step in the octave actually played (AU-49, BA-87); a soloist must be made to breathe, but not for too long (AU-95, KF-B-17); the bass's lowest note is written as two different numbers (AU-08, X-A-05). Rules that exist only as habits of one band do not survive a rebuild; they have to be written as properties. [property] (solid)

SU-D-16. What passed the owner's ear was often plainer than what the measures were built to reward: no bends over many bends, straight country over a lilt, the Charleston in a quarter of bars and not most, a weak reliable preference over a strong one. When a number and his ear disagreed, the number was measuring the wrong thing. [taste] (solid)

