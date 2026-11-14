# Music notes, part A: drums, bass, the conductor, endings

What the old band knew about the rhythm section, the shape of a performance, and how to stop. Written for the people rebuilding it, who will never see the old band.

Conventions used throughout:

- **Grid.** One bar of 4/4 is 16 sixteenths. Grids are written one character per sixteenth, beats separated here by spaces for reading: `x... x... x... x...` is four quarter notes. Positions are counted "1 e & a 2 e & a ...". 480 ticks per quarter note, so a sixteenth is 120 ticks.
- **Stroke levels.** In every drum grid: `X` accent = velocity 118, `x` normal = 96, `o` soft = 72, `g` ghost = 36, `.` rest. These are the written levels before energy scaling (X-A-06) and humanizing (X-A-17, X-A-18). Every velocity quoted in this document is a written level in that sense unless it says otherwise.
- **Pitch.** MIDI note numbers, with middle C = 60 = C4. So 28 = E1 (the open low E of a 4-string bass), 38 = D2, 52 = E3.
- **Energy tiers.** `low`, `mid`, `high` as defined in CO-02.
- **Tags.** `[property]` must always hold; `[metric]` score it; `[style-data]` belongs in a style's data; `[taste]` a judgment worth knowing. `(solid)` code and tests agree; `(unclear)` intent ambiguous or looks accidental. The tag names the rule's main use. Many rules also end with a "Target:" clause: that clause is always a metric (a floor, a ceiling or a band the old band was scored against), whatever the rule's tag.
- **Weights and probabilities.** "Weights 3/2/1" means a weighted choice among the listed options; "low/mid/high 6/3/1" gives one option's weight in each energy tier. Percentages are probabilities of a seeded choice. "Per section" means chosen once and held for every bar of that section (CO-50).
- **Old band, earlier band.** "The old band" is the version this was extracted from. "An earlier band" is the generation before it, known only through the lessons the old band recorded.

## Cross-cutting rules

### Register

X-A-01. The bass never plays below MIDI 28 (E1, the open low E string): a note under it is a note the instrument does not have. [property] (solid)

X-A-02. Bass roots are placed between MIDI 28 and 52 (E1 to E3); ornaments above a root (an octave pop, a fifth or seventh over a high root) may reach MIDI 57 (A3), and anything that would go higher folds down an octave. [property] (solid)

X-A-03. The middle of the bass register is D2 (MIDI 38): a line that places each root near its previous note is pulled about a third of the way back toward D2 on every placement, so it climbs and dives but always comes home. When two octaves are equally near, the lower one wins. [property] (solid)

X-A-04. With a bassist in the band, a guitar keeps off the low strings (nothing below C3, MIDI 48) unless the low note doubles the bass's own job (the chord's bass note, root or fifth in a grip whose lowest note is the root or bass note). [property] (solid)

X-A-05. A design note states the bass "slot" as MIDI 23 to 57, but every rule and test that is actually enforced uses 28 as the floor; treat 23 as a stale number. [property] (unclear)

### Energy to dynamics and density

X-A-06. Every written velocity is multiplied by (0.72 + 0.40 × energy) and clamped to 1 to 127: energy 0 plays at 72%, 0.55 at 94%, 0.70 at 100%, 1.0 at 112%. A quieter band plays softer, not just sparser. [property] (solid)

X-A-07. Density is not a dial: each player has up to three distinct parts (low, mid, high tier), and the change of part at a tier line is the audible change of section. Within a tier only loudness moves. [property] (solid)

X-A-08. The low tier strips ornament everywhere: no ghost notes, no octave pops, no dead notes, few or no lead-ins, short or no fills, cross-stick instead of snare at the very bottom (below energy 0.30 in most styles, 0.35 in neo-soul). The high tier adds motion (sixteenth hats, ride, double kick, octave pops, more lead-ins, longer fills). [style-data] (solid)

X-A-09. Things that define the genre survive every tier: reggae's drop on 3, disco's kick on every beat, the backbeat in rock, funk and hip hop, the bossa clave, the bass's root on a chord's arrival. Energy changes weight, never identity. [property] (solid)

### Time

X-A-10. Everyone writes on a straight sixteenth grid (480 ticks per quarter, 120 per sixteenth); all timing feel is applied afterwards in one place, in three layers: swing, lean, character. No player carries a private timing trick. [property] (solid)

X-A-11. Swing is geometry, not tempo: a swing amount of 0 to 100 places the offbeat of each pair at 50% + (amount ÷ 100 × 16.67%) of the pair, so 0 is straight, 60 puts the offbeat at 60%, and 100 at 66.7% (a true triplet). Beats never move. Each style swings either eighths or sixteenths, never both. [property] (solid)

X-A-12. A swung note's end is swung too, so a note still ends where its written end lands after swing. [property] (solid)

X-A-13. Swing applies only in bars whose every pulse is a quarter note; 6/8, 7/8 and the like always play straight. [property] (solid)

X-A-14. Style swing amounts and which note value swings (offbeat position in its pair): rock 0, eighths; jazz 60, eighths (60%); funk 15, sixteenths (52.5%); bossa 0, sixteenths; reggae 20, sixteenths (53.3%); blues 100, eighths (66.7%); country 0, eighths; hip hop 25, sixteenths (54.2%); disco 0, sixteenths; neo-soul 45, sixteenths (57.5%); metal 0, sixteenths; ska-punk 0, eighths; acoustic 15, eighths (52.5%). The drum grids in this document assume these values (X-A-32). [style-data] (solid)

X-A-15. The drums are the clock and never lean. Each other instrument sits a constant number of milliseconds ahead of or behind the drums, per style; that differential is the pocket. Bass lean in ms (positive = behind): rock 0, jazz −2, funk −5, bossa −3, reggae +8, blues +2, country 0, hip hop +4, disco −2, neo-soul +32, metal 0, ska-punk 0, acoustic +5. [style-data] (solid)

X-A-16. There is no whole-band time shift of any kind: an offset applied to every instrument including the drums is only latency, and is forbidden. "The band lays back" must be expressed as everyone but the drums laying back. [property] (solid)

X-A-17. Human placement is at most ±9 ms at humanize 100, scaled linearly by the style's humanize amount, and is drawn per (instrument, voice or drum piece, position within the bar): the same sixteenth is pushed the same way in every bar, so it reads as a settled pocket rather than noise. At humanize 0 playback is exactly on the grid. [property] (solid)

X-A-18. Human velocity variation is at most ±10 at humanize 100, drawn per note position within the chorus, so every chorus repeats the same touch at the same place. [property] (solid)

X-A-19. Style humanize amounts (0 to 100): rock 35, jazz 40, funk 25, bossa 30, reggae 30, blues 35, country 25, hip hop 20, disco 15, neo-soul 60, metal 10, ska-punk 20, acoustic 30. Machine genres are tight, neo-soul is "drunk", metal is nearly rigid. [style-data] (solid)

X-A-20. Lean stays under about 10 ms where two low instruments must fuse into one hit (the hip hop sub at +4 ms against the kick) and goes large only where the lag itself is the style (neo-soul bass +32 ms). [taste] (solid)

### Harmony as the rhythm section hears it

X-A-21. Under N.C. every pitched instrument rests; no pitched note may start in a bar or part-bar with no chord. The drums play on. [property] (solid)

X-A-22. The bass note struck where a chord is written is always a tone of that chord. At a real change of chord it is the chord's bass note in every style but jazz (which takes the third about one arrival in ten); where the chart merely restates the same chord in the next bar, a pattern may continue instead (the blues box turns from the b7, a country waltz alternates to the fifth). [property] (solid)

X-A-23. Over a slash chord the bass's "root" is the slash note, while its fifth, seventh and third are still the real chord's tones measured from the real root: over C/E the bass stands on E and its "fifth" is G, never B. [property] (solid)

X-A-24. The bass's "fifth" is the chord's own fifth: the b5 of a diminished or half-diminished chord, the #5 of an augmented one, the b13 in the fifth's seat of an altered dominant. It never invents a natural fifth the chord does not have. [property] (solid)

X-A-25. An earlier version of the band handled X-A-24 differently (diminished chords kept their b5, every other chord without a perfect fifth restated the root, leaving the altered fifth to the comp); country's bass still restates the root when the chord writes no fifth. Both readings avoid the wrong natural fifth; they differ on whether the bass should outline the altered one. [taste] (unclear)

X-A-26. Passing and approach tones come from the scale of the chord being left, which is chosen by the chord's function in the key (for example a dominant resolving down a fifth to a minor chord takes the scale with b9 and b13, so a walk into D minor from A7 uses Bb and C#, not B natural and C natural). The scale table belongs to another part; what matters here is that bass passing tones and comp voicings must read the same scale, or they clash. [property] (solid)

X-A-27. No instrument sounds the same pitch twice at once: a re-struck note cuts the one before it. [property] (solid)

X-A-28. Every note starts inside its own bar; nothing rings past the end of a performance that ends. [property] (solid)

### Repetition and variation

X-A-29. A groove, a riff, a register and an ornament pattern belong to the section, not the bar: they are chosen once per section and held, so a verse sounds like the same verse every bar and every time it returns. Re-choosing per bar was measured as clearly worse (kick-pattern consistency fell from 1.0 to about 0.63). [property] (solid)

X-A-30. Variation inside a section comes from structure, not chance: a two-bar statement-and-answer shape (DR-05), fills at phrase and section ends, and lead-ins at chord changes. [property] (solid)

X-A-31. A figure is chosen whole, never stroke by stroke: one draw picks a fill, a comping figure or a riff from a written vocabulary. A coin per stroke reads as scatter, not as a figure. [property] (solid)

## Drums

**What the drummer does well.** He sounds like one drummer with a part, not a pattern generator: a section keeps its groove, the second bar of each pair answers the first, fills are whole figures sized to the boundary they mark, the crash means "we have arrived", and each genre's non-negotiables (the hole on 1 in reggae, the floor in disco, the ride in jazz) are never traded away for variety. Thirteen genres each fill and end in their own words.

### The kit and its levels

DR-01. The kit is: kick, snare, ghost snare, cross-stick, closed hat, open hat, hat foot (pedal), ride, crash, high/mid/low tom, shaker. A ride bell is named but no groove uses it. [style-data] (solid)

DR-02. Four stroke levels cover everything: accent 118, normal 96, soft 72, ghost 36 (before energy scaling); a snare stroke written at ghost level is played as the separate ghost-snare sound, not as a quiet full snare. [style-data] (solid)

DR-03. One hand, one cymbal: where an open hat is written, the closed hat is removed from that sixteenth; where a crash lands on 1, the timekeeping cymbal's stroke on 1 is removed. [property] (solid)

### How a groove is built

DR-04. A style's groove is one bar of 4/4, written per kit piece, with a separate version for each energy tier; the kick pattern, hat pattern, ghost set and similar options are chosen once per section from weighted lists and kept for every bar of it. [property] (solid)

DR-05. Bars 2 and 4 of each four-bar phrase are answer bars (also bar 6 of a six-bar phrase): the front half (beats 1 and 2) is identical to the statement bar, and only the back half (beats 3 and 4) is changed by one small "turn" (a pushed kick, a ghost run, an open hat, an extra snare). [property] (solid)

DR-06. The turn is chosen once per section, so every answer bar in a section turns round the same way; if the chosen turn would change nothing in that groove (the kick is already there), the next turn in the list that is audible is used instead. Measured: answer bars really differ from statements in about 99% of cases; a section holds one turn in 100% (66% if each answer bar draws its own). [metric] (solid)

DR-07. A quiet band answers with the foot alone (a soft kick), never with an open hat or an extra snare crack; several styles do not answer at all at low energy (reggae, hip hop). [style-data] (solid)

DR-08. Styles with answer bars: rock, funk, reggae, country, acoustic, hip hop (its two-bar loop). Styles with none: jazz (which phrases through its snare comping instead), blues, bossa (whose two-bar clave already is one), disco, metal, neo-soul, ska-punk; several of those vary the second bar of each pair another way (DR-44, DR-68, DR-73, DR-77, DR-82). [style-data] (solid)

DR-09. The kick is on beat 1 of essentially every groove bar (target at least 95% of bars) in every style except two: reggae's one drop (at most 35% of bars, and 2% or less when quiet) and jazz, whose bass drum is only feathered, or silent when quiet and under the light head. [metric] (solid)

DR-10. In any meter other than 4/4 the drummer builds the bar from one-beat cells by pulse role: "down" (the first pulse), "back" (where a snare lands: odd-numbered positions and the last pulse) and "strong" (other downbeats). 3/4 is down-back-back, 5/4 is down-back-strong-back-back, 7/8 grouped 2+2+3 is down-back-back. A dotted-quarter pulse keeps the cell's downbeat and moves its "and" to the last eighth of the group. [property] (solid)

DR-11. Outside 4/4 there are no answer bars and no written fill shapes beyond what fits; only 4/4 was treated as fully idiomatic. [taste] (solid)

### Fills

DR-12. A fill replaces the time: over its span every piece plays only what the fill writes, except the kick and the hat foot, which keep the groove's own part unless the fill writes one for them. [property] (solid)

DR-13. A fill always occupies the end of the bar and its last stroke lands just before the barline; the first beat of a fill bar always keeps time. [property] (solid)

DR-14. Fill lengths in sixteenths, as phrase fill low/mid/high then section fill low/mid/high: rock 2/4/4, 4/4/8; jazz 0/2/4, 4/4/8; funk 2/2/4, 4/4/4; bossa 0/0/2, 2/2/4; reggae 0/2/4, 2/4/4; blues 0/2/4, 2/4/8; country 0/2/4, 2/4/4; hip hop 0/4/4, 4/4/8; disco 2/2/4, 4/8/8; neo-soul 0/0/2, 2/2/4; metal 2/4/4, 4/8/8; ska-punk 2/4/4, 4/4/8; acoustic 0/0/2, 2/2/4. Zero means the drummer plays time straight through that boundary. [style-data] (solid)

DR-15. Each fill is one whole written shape, drawn once, from a vocabulary that depends on where the fill sits: a phrase end, a section end, or a "top" (a new chorus or loop wrap, a section in a higher tier than this one, or the set-up into the final hit). The bigger the boundary, the bigger the gesture. [property] (solid)

DR-16. Shapes are written at 2, 4 and 8 sixteenths; a length with no written version plays the tail of the next longer one, so the last stroke still lands on the eve of the barline. [property] (solid)

DR-17. No two styles may share most of their fill vocabulary: the share of fill shapes any two styles have in common is at most 0.6, measured at most 0.2 (rock and metal share an eighth-note tom run). Before this, seven styles played the same descending tom run. [metric] (solid)

DR-18. Fills crescendo into the downbeat: the last stroke of nearly every shape is the accent. [property] (solid)

DR-19. The kick never drops out under a fill by accident: either the groove's own kick continues (DR-12) or the fill writes quarter-note kicks of its own, so the fill never floats. Hip hop's drop (DR-65) is the one deliberate exception. [property] (solid)

### Crashes and lifts

DR-20. An arrival crash is: crash at 112 on beat 1, the timekeeping cymbal's own stroke on 1 dropped, and a kick at 100 added on 1 if the groove has none there (so even a reggae one drop gets a kick on 1 under a crash). [property] (solid)

DR-21. In the last bar before a crashed arrival, when that bar has no fill, several styles lift on the "and" of 4: rock (mid tier) and reggae open the hat there, metal accents a crash there. [style-data] (solid)

### The drummer's solo turns (trading)

DR-22. A drum solo turn is written across the whole bar in place of the time, but the hat foot keeps the groove's own pattern in every meter: the form is never lost. [property] (solid)

DR-23. One two-beat motif of swung eighths (one of `xx.x`, `x.xx`, `x..x`, `xxx.` in eighths, always starting on the beat) is chosen for the whole turn and developed, never just repeated: in fours, bar 1 states it on the snare and answers on the high tom with a kick on 1; bar 2 displaces it an eighth late and moves it to high and floor tom; bar 3 plays it as accents in a stream of eighths (ghosts between, a kick under each figure's first accent); bar 4 restates it for two beats, then runs every eighth down the three toms getting louder to a snare-and-kick accent on the "and" of 4. Twos are statement plus run home; eights say the cycle twice. [property] (solid)

DR-24. The crash on the next downbeat belongs to the band coming back in, not to the solo. Targets: motif recurs displaced in at least 90% of turns; verbatim repetition in at most 10%. [metric] (solid)

DR-25. Drum solos use swung eighths only, never sixteenths, for the same reason as DR-34. [property] (solid)

### Rock

DR-26. Kick, one of five, always on 1 and 3: `x... .... x... ....`, `x... .... x.x. ....`, `x... ..x. x... ....`, `x... .... x... ..x.`, `x.x. .... x.x. ....`, weighted low/mid/high 6/3/1, 2/4/4, 1/3/3, 1/2/3, 0/1/3 (quiet favors plain 1 and 3; loud favors the pushed "and" of 3 and "and" of 4). [style-data] (solid)

DR-27. Low: hat `o.g. o.g. o.g. o.g.`, snare at normal level on 2 and 4 (cross-stick below energy 0.30). Mid: hat `x.o. x.o. x.o. x.o.`, snare accented on 2 and 4. High: half the sections move to the ride `x.o.` ×4 with the hat foot on 2 and 4, the rest play hat `X.x.` ×4. [style-data] (solid)

DR-28. Turns: loud, kick on the "and" of 4 (weight 3), kick on the "and" of 3 (2), hat opened on the "and" of 4 when the hat keeps time (2), soft snare on the "and" of 4 (1); quiet, a soft kick on the "and" of 4 (2) or of 3 (1). [style-data] (solid)

DR-29. Fills: phrase end, a snare "and-a" pickup under a continuing hat (3), a snare build of eighths then sixteenths (2), a tom run (1); section end, the tom run in eighths snare-high-mid-floor (3), snare build (2), snare and floor tom in unison eighths (2); top, round the kit in sixteenths (3), floor unison (2), tom run (1). [style-data] (solid)

DR-30. Targets: snare on 2 and 4 in at least 90% of bars; a section keeps its kick pattern (at least 0.75). [metric] (solid)

### Jazz

DR-31. Ride: `x... X.x. x... X.x.` ("ding, ding-a, ding, ding-a" with 2 and 4 leaned on), softened to `o... x.o. o... x.o.` at low energy; hat foot on 2 and 4 always; the kick "feathers" all four quarters at ghost level from mid energy up and is silent at low energy; no backbeat ever. [style-data] (solid)

DR-32. Under the head's A sections, below the high tier, the swing pattern moves to the closed hi-hat (`x... X.x. x... X.x.`), the ride is silent, there is no feathered kick and no snare comping; the move to the ride at the bridge and the solos is the audible cue that the band has opened up (a merely softer ride barely registered). At the high tier the head is on the ride from the top. [property] (solid)

DR-33. The snare comps where a pianist would, reading the chart rather than hearing the piano: in a one-chord bar with no change at the barline, the "and" of 2 (weight 3), "and" of 2 plus "and" of 3 (1), "and" of 1 plus "and" of 2 (1), or nothing (2); before a change at the barline, "and" of 2 (2), "and" of 4 (2), both (2), nothing (2); in a two-chord bar, "and" of 3 (2), "and" of 4 (2), both (1), beat 3 (1), nothing (1). Never on 2 or 4 (the hat foot's), never on 1 (the kick's). The empty bar is part of the comping; its weight halves at high energy. [style-data] (solid)

DR-34. Jazz drums use only beats and swung-eighth offbeats; the "e" and "a" sixteenths are forbidden because once swung they land between triplet positions and sound like flams. [property] (solid)

DR-35. A comping figure's first stroke is played soft and the rest ghosted (all soft at high energy); bars 1 and 3 of a phrase share a figure and bar 2 may take another; the figure is drawn per phrase position, not per stroke. A snare on beat 3 bar after bar squares the time into a two-beat, so it is rare. [style-data] (solid)

DR-36. The last bar of a phrase sets up the next: at a boundary the plan fills (8-bar, section, chorus top) the snare and bass drum hit the "and" of 4 together (the "bomb": the kick drops its feathered 4), with the "and" of 3 before it when loud; at a plain 4-bar phrase end, before a chord change, the bomb (weight 3), snare alone on the "and" of 4 (1), "and" of 3 into "and" of 4 (1), or nothing (1); with no change coming, never a bomb, and nothing half the time. Target: 46% to 67% of phrase ends get the shot, deliberately not every one. [metric] (solid)

DR-37. Jazz fills are set-ups played under the time (the ride or hat keeps going), except round the toms where the stick hand leaves the cymbal after the first stroke: phrase end, the shot (2), two-shot "and" of 3 then "and" of 4 (2), swung eighths on the snare into the shot (1); section end, eighths (2), two-shot (1), snare-high tom-floor tom (1); top, round the toms (2), eighths (1), two-shot (1). [style-data] (solid)

DR-38. Under the light head the drummer stays off the toms and nearly off the bass drum: a phrase end only whispers (ghost and soft swung eighths), a section end whispers or plays the two-shot softly, and only the head's last bar into the first solo chorus may play the fuller swung-eighths set-up (half the time; otherwise the soft two-shot). [style-data] (solid)

DR-39. Targets: ride on every beat in at least 90% of solo bars; hat foot on 2 and 4 at least 90%; the snare strikes where the piano strikes in at least 45% of comping bars (measured 0.51, up from 0.29 before the snare read the chart); about one snare stroke per bar at mid energy. [metric] (solid)

### Blues (shuffle)

DR-40. Everything is written on eighths and swung at 100, so each beat's first three sixteenths land on the triplet; the "e" is the triplet's middle note and is used only in fills; the "a" is never used (it lands at 83% of the beat and flams). [property] (solid)

DR-41. Kick on 1 and 3 in every bar without exception, plus in some sections a soft push on the "and" of 4: weights plain/pushed are low 3/1, mid 2/3, high always pushed. [style-data] (solid)

DR-42. Low: hat `o.g. o.g. o.g. o.g.`, snare on 2 and 4 (cross-stick below 0.30). Mid: hat `x.o.` ×4, accented backbeat, and 30% of sections ghost the "and" of 4. High: hat `X.o.` ×4; snare is plain backbeat (weight 2), backbeat with ghosts on the "and" of 2 and 4 (2), or ghosts on every "and" under the backbeat (1); 60% of sections feather the kick on 2 and 4 at ghost level. [style-data] (solid)

DR-43. The cymbal lopes in a two-beat circle: the "and" of 2 and the "and" of 4 are played at 80% of the other offbeats. [style-data] (solid)

DR-44. From mid energy, in sections that choose it (35% at mid, 60% at high), every second bar opens the hat on the "and" of 4: the turnaround breath. [style-data] (solid)

DR-45. At high energy the shuffle moves to the ride (hat foot on 2 and 4) only on a section's second written repeat, so a once-through 12-bar blues never reaches the ride however many choruses are played. [style-data] (unclear)

DR-46. Fills: up to one beat, a snare pickup that keeps the backbeat on 4 and accents the "and" (a dropped backbeat in a short fill reads as a mistake), or half the time the snare triplet "DA-da-DA"; longer, half the time a triplet run snare-high-mid-floor and half the time an eighth-note tom run, the kick holding quarters under both (each quarter 70% likely). Target: 15% to 50% of fills are triplets. [style-data] (solid)

### Funk

DR-47. Kick, one of five syncopated sixteenth patterns that never touch 2 or 4: `x... ...x ..x. ....`, `x.x. .... ..x. .x..`, `x... ..x. ..x. ....`, `x..x .... ..x. .x..`, `x... .... xx.. .x..` (weights low/mid/high 3/3/2, 1/3/3, 3/2/1, 1/2/3, 1/2/3). [style-data] (solid)

DR-48. Snare: accented backbeat always; from mid energy one of four ghost sets around it (`.... ...g .g.. ..g.`, `..g. ...g .... ...g`, `.g.. ...g ..g. ...g`, `.... ...g .... ..gg`); target 1 to 5 ghosts per bar. Hat: eighths `x.o.` at low; sixteenths `xoxo` above, with the open hat on the "and" of 4 in every bar at high energy and in 35% of sections at mid. [style-data] (solid)

DR-49. Turns: kick on the "a" of 3, kick on the "a" of 4, ghosts on the "e" and "a" of 4, or the hat opened on the "and" of 4; quiet sections use only the two kicks. [style-data] (solid)

DR-50. Funk fills are at most one beat and never a tom run: the left hand and foot fill while the right hand keeps the hat going (ghosts dragging into an accented "and-a"; kick and snare trading sixteenths; the hat opening on 4 and closing with the foot, snare on the "a"; a snare sixteenth crescendo). Only the band "hit" (snare on 4, kick on its "and", snare on the "a") stops the hat. [style-data] (solid)

### Bossa

DR-51. Cross-stick plays the two-bar clave, restarting at each section: bar 1 on 1, the "and" of 2, and 4; bar 2 on 2 and the "and" of 3. Kick is the surdo: 1 and 3 with soft pickups on the "and" of 2 and "and" of 4 (just soft 1 and 3 at low energy). Hat `o.g.` ×4 below high; at high the time moves to the ride `x.o.` ×4 with a soft hat foot on 2 and 4. Target: clave present in at least 90% of bars. [style-data] (solid)

DR-52. Bossa fills are a cross-stick figure on eighths with one soft floor-tom note on the last sixteenth; nothing at all at phrase ends below high energy. [style-data] (solid)

### Reggae

DR-53. One drop (mid tier): nothing on 1; kick and cross-stick together, accented, on 3; hat either `x.o.` ×4 (55% of sections) or shuffled `x.oo` ×4 (45%); the hat opens on the "and" of 4 in 40% of sections and always in the bar before a new section. Low tier: the same drop played soft under `o.g.` hats, no lift. Target: the drop on 3 in at least 90% of bars at every tier. [style-data] (solid)

DR-54. High tier is a different groove, chosen once for the whole performance: steppers (kick on all four beats, snare accent on 3, closed hat on the beats, open hat on every "and") or rockers (kick on 1 and 3, snare accent on 3, shuffled hats). The drop on 3 survives in both. [style-data] (solid)

DR-55. Turns (never at low energy, never touching beat 1 or the drop): a soft cross-stick on the "and" of 4 (2), the drop echoed softly on the "and" of 3 (2), or a hat lift on the "and" of 4 (1). [style-data] (solid)

DR-56. Reggae fills are short and late, at most one beat: cross-stick pickups and "the drop" (time stops, rimshot and kick on the "a" of 4) at phrase ends; toms "a-di-dum", a snare drag, or a cross-stick roll at section ends and tops. [style-data] (solid)

DR-57. In odd meters the drop moves to the secondary downbeat if the meter has one, else to the backbeats; beat 1 stays empty below high energy. [style-data] (solid)

### Country

DR-58. Low (ballad): quarter-note hat clicks, kick on 1 with a softer one on 3, cross-stick on 2 and 4. Mid: 70% of sections play the two-step (even eighth hats at one level, kick 1 and 3, snare 2 and 4) and 30% the light train (quarter hat clicks, kick 1 and 3, snare `g.g. X.g. g.g. X.g.`). A soft offbeat hat made the two-step limp; the eighths must be even. [style-data] (solid)

DR-59. High (train beat): quarter hats, kick 1 and 3, snare either the full sixteenth lattice `gggg Xggg gggg Xggg` (60% of sections) or steady eighths `o.o. X.o. o.o. X.o.` (40%). The lattice must be continuous: gaps in it sound like a stutter, not a train. Above energy 0.80 the kick adds soft hits on 2 and 4; above 0.82 the hat opens on beat 4. [style-data] (solid)

DR-60. Turns: soft kick on the "and" of 4, snare doubling the backbeat on the "and" of 4, or soft kick on the "and" of 3; a ballad uses only the first. Fills are pickups ("4-and, ONE" on the snare; a rimshot with kick on the "and" of 4), with a sixteenth roll or a floor-tom push only at tops when loud; a fill that starts on a backbeat keeps the backbeat's accent. [style-data] (solid)

### Hip hop

DR-61. The kick is a two-bar loop chosen once for the whole performance (statement / answer): `X... .... ..x. ....` / `X... .... ..x. ...x`; `X... ..x. ..x. ....` / `X... ..x. x... ....`; `X... ...x ..x. ....` / `X... ...x ..x. ..x.`; `X.x. .... ..x. ....` / `X.x. .... ..x. .x..`. Every loop owns 1, avoids 2 and 4, and kicks the "and" of 3 in its statement. [style-data] (solid)

DR-62. Snare hard on 2 and 4 at every energy (normal level when quiet, accented otherwise); at high energy one ghost set from `.... ...g .... ....`, `.... ...g .g.. ....`, `.... .... ..g. ...g`. [style-data] (solid)

DR-63. Hats: low, soft eighths `o.g.`, or no hats at all in the opening section and any intro or break (the beat before the hats come in); mid, a per-section choice between eighths `x.o.` and three-level sixteenths `xgog`; high, always the sixteenths. The three-level sixteenths make the style's sixteenth swing audible as a lazy lilt. [style-data] (solid)

DR-64. At low energy the loop is one bar (no answer); at high energy the answer bar also opens the hat softly on the "and" of 4. [style-data] (solid)

DR-65. A hip hop fill is a drop, not a fill: kick, snare and hats all go silent for the fill's length and slam back on the next 1. Only into a section in a higher tier does the drummer play in, with a snare roll (eighths then sixteenths, crescendo) and no kick. Targets: loop bars repeat in at least 90%; the answer bar's kick differs in at least 60%; the kick is really silent in at least half of phrase-end drops. [property] (solid)

### Disco

DR-66. Kick on all four beats in every bar at every energy, including through every fill (at least 98%); soft when quiet. Snare on 2 and 4 (cross-stick below 0.30). [property] (solid)

DR-67. From mid energy the open hat barks on every "and" (at least 85% of them), over a closed-hat part that is either just the beats (one section in three at mid) or `xo.o` ×4 (beat, "e" and "a"; always at high). A shaker fills the "e" and "a" at ghost level whenever the closed hat leaves them empty and always at high energy. Quiet: closed eighths, no open hat at all. [style-data] (solid)

DR-68. At high energy the second bar of each pair lifts: an accented open hat on the "and" of 4 and a snare on the "a" of 4. A lift is louder than the time around it, never a ghost. [style-data] (solid)

DR-69. Fills: up to an eighth, the open hat barks and a snare closes it; one beat, snare sixteenths building; two beats at mid, eighths on 3 then sixteenths crescendo on 4; at high, toms in sixteenths down the kit. Whenever a fill takes the hand off the open hat (mid and up), the hat foot plays every "and" in its place so the offbeat never stops (target coverage at least 85%). [property] (solid)

### Neo-soul

DR-70. Kick, per section: `x... .... ..x. ....` (low/mid/high weights 3/3/1), `x... .... x... ....` (2/2/1), `x... ...x ..x. ....` (0/2/2), `x..x .... ..x. ....` (0/1/2), `x... ...x ..x. ...x` (0/0/3). The busy patterns are held back for the high tier so a quiet section reads laid-back, not busy. [style-data] (solid)

DR-71. Hat: `o.g.` ×4 at low; three-level sixteenths `xgog` ×4 above; every closed-hat stroke is then played at 80% so kick and snare speak through it. Snare: accented backbeat; cross-stick instead below energy 0.35. [style-data] (solid)

DR-72. Ghost snares are the drag into and out of the backbeats, one set per section, and the high tier's set contains the mid tier's: ("a" of 2, 3, 4) growing to add "a" of 1 and "e" of 3; ("a" of 1, "and" of 3, "a" of 4) adding "and" of 2 and "a" of 3; ("e" of 2, "a" of 2, "a" of 4) adding "and" of 1 and "e" of 4. None when quiet. Target 2.5 to 4.5 ghosts per bar above quiet. The stated intent was "only on e's and a's"; two of the three sets also use an "and", so the intent and the patterns disagree slightly. [style-data] (unclear)

DR-73. In 35% of sections (not at low energy), every second bar moves the backbeat on 4 a whole sixteenth late, to the "e" of 4: a written two-bar turnaround. Target: 5% to 30% of bars. At high energy every second bar also opens the hat on the "and" of 2 or of 4 (the section's choice). [style-data] (solid)

DR-74. The loop barely fills: nothing at phrase ends below high energy, a beat or two at section ends. [style-data] (solid)

### Metal

DR-75. Each section is either backbeat (snare on 2 and 4) or half time (snare on 3 only): always half time at low energy, three sections in four backbeat otherwise. [style-data] (solid)

DR-76. Kick always on 1. Low: `x... .... ..x. ....`, `x... ..x. .... ....`, `x.x. .... ..x. ....`. Mid backbeat: `x... ..x. x... ....`, `x.x. .... x.x. ....`, or straight eighths; mid half time: `x... ..x. ..x. ....`, `x.x. .... ..x. x...`. High (double kick): continuous sixteenths, the gallop `x.xx` ×4, eighths then sixteenths through beats 3 and 4, or straight eighths. Targets: sixteenth-kick density at least 0.75 at high and 0.15 to 0.55 at mid. [style-data] (solid)

DR-77. Cymbals: low, eighths on the ride (two sections in three) or on the floor tom (one in three), cross-stick on 3 below 0.30; mid, hat eighths `x.o.`; high, ride eighths with a crash on 1 of every second bar (two in three) or crash on every quarter (one in three). [style-data] (solid)

DR-78. A blast (kick on the eighths, snare on the sixteenths between, crash on quarters; kick and snare alternate, never together) is one bar only, only at energy 0.85 or more, only on the bar before the fill that ends each second phrase, and only in performances that blast at all (half of them). Target: 3% to 20% of bars at the peak, zero below it. [style-data] (solid)

DR-79. Fills are tom runs: eighths when quiet, sixteenths otherwise, and at high energy the double kick keeps rolling underneath; up to an eighth, a snare pickup. [style-data] (solid)

### Ska-punk

DR-80. The band has two gears. Punk: any section labelled chorus/hook/refrain at any energy, and every section at the high tier. Ska: everything else. [property] (solid)

DR-81. Ska time (per section): kick 1 and 3, snare 2 and 4, and a hat that is either only the "and"s accented (weight 3), every eighth with the "and"s accented and beats soft (3), or "and"s only over a kick on all four beats (2). Quiet ska: soft offbeat hat, cross-stick below 0.30 (a full snare there reads as punk). Target: hat loudest on the "and"s in at least 90% of verse bars. [style-data] (solid)

DR-82. Punk time: in a chorus at the high tier, the skate beat (kick on every beat, snare on every "and", hat on every eighth); otherwise the eighth-note rock beat with a kick on the "and" of 3 (`x... .... x.x. ....`; plain 1 and 3 when quiet), backbeat on 2 and 4. At the high tier the crash replaces the hat on 1 of every second bar (40% to 70% of bars). [style-data] (solid)

DR-83. Fills are fast snare rolls in sixteenths, crescendo into the downbeat, never toms; the kick keeps its part underneath. [style-data] (solid)

### Acoustic

DR-84. Quiet, per section: kick on 1 with cross-stick on 3 and shaker eighths (weight 2); kick on 1 with cross-stick on 2 and 4 (2); or kick on 1 with only shaker eighths (1). 3 to 8 strokes a bar and essentially never a full snare. [style-data] (solid)

DR-85. Mid: kick `x... .... o... ....` (weight 3), `x... ..o. o... ....` (1) or `x... .... o... ..o.` (1); then 35% of sections play "brushes" (shaker on every sixteenth `oggg` ×4 as the sweep, soft snare taps and hat foot on 2 and 4) and the rest play cross-stick on 2 and 4 over hat or shaker eighths. [style-data] (solid)

DR-86. High: full accented snare backbeat, hat eighths, shaker on every "e" and "a" at ghost level; 40% of sections open the hat softly on the "and" of 4. 16 to 24 strokes a bar. [style-data] (solid)

DR-87. Turns are all soft (kick pickups, a hat breathing open, one ghost on the "a" of 4); fills are light pickups on cross-stick, snare or hat, a brush "swirl" of ghosted sixteenths, and toms only when driving. A drummer serving a singer varies with the foot and the hat, never with a crack. [taste] (solid)

### Known weaknesses

DR-88. Blues, bossa, disco, metal, neo-soul and ska-punk never got written fill vocabularies or answer bars; several still use two generic fills built stroke by stroke (a tom run whose kick lands on each beat with 70% chance; a snare figure whose early strokes each have 60% chance), exactly the "coin per stroke" the other seven styles were moved away from. [taste] (solid)

DR-89. The drummer plays before everyone else and hears nobody: he cannot catch a comp push or a soloist's phrase. Jazz works around this by reading the chart the way the pianist does; no other style has an equivalent. [taste] (solid)

DR-90. No drum piece can be placed early or late relative to another (no dragged snare, no pushed hat): drums are the clock. Neo-soul's lazy snare is therefore a whole sixteenth late, a written figure, not a drag of 6 to 18 ms as an earlier band had. [taste] (solid)

DR-91. Nothing in the drum part reads the tempo: a pattern that blurs at 200 bpm or drags at 60 is played anyway (country's sixteenth train beat is a per-section choice where it should be a tempo choice). [taste] (solid)

DR-92. There are no triplet subdivisions as such; the blues triplet fill exists only because swing 100 turns three of four sixteenths into a triplet. If the player lowers the swing setting, those fills stop being triplets; jazz at swing 60 cannot play a triplet fill at all. [property] (unclear)

DR-93. Odd meters get a generic cell groove with none of the style's phrasing. [taste] (solid)

## Bass

**What the bassist does well.** Every chord change gets its root where it lands; lead-ins resolve by a real step into the exact note played next, even across a section change or into the final note; riffs keep their octave; the line locks to the kick the drummer actually played; and each genre's bass is a recognizable part (a walk, a boogie box, a pump, a sub, a boom) rather than one line re-skinned.

### Shared craft

BA-01. A chord's arrival is stated: wherever a new chord is struck (on a beat or off it) the bass plays that chord's bass note there, even if the style's riff has a rest at that spot. The licensed exceptions are jazz's occasional third (BA-22), a reggae riff keeping its hole on beat 1 at a barline change (BA-48), and a pattern continuing over a restated chord (X-A-22). Per-style targets for "arrives on the bass note" run from 75% (jazz) and 80% (blues) to 95% (most others). [property] (solid)

BA-02. There are four ways to choose a root's octave, and a style uses exactly one. (a) Near the previous note, drifting toward D2: free lines (jazz, ska). (b) One register per section, anchored on a note chosen once per section from C2 to E2 (MIDI 36 to 40): ostinato lines that must keep their octave from bar to bar (rock, funk, bossa, country, acoustic; blues uses the same anchor as a pull, BA-33; reggae uses a lower anchor, BA-49). (c) One register per performance: loop music where a given chord is always the same note (hip hop, disco, neo-soul). (d) A fixed string (metal). [style-data] (solid)

BA-03. A lead-in is the last note before a chord change, within a beat of it, aimed at the next chord's bass note. There are four kinds: a half step below the target; a half step above; the target's own fifth (a V to I in miniature: a fifth above, or a fourth below when that is in range and nearer the line); or the nearest tone of the current chord's scale within a whole step of the target. [property] (solid)

BA-04. Lead-in kinds are weighted by style family: jazz half-step below 4, half-step above 3, fifth 2, scale 3; everyone else half-step below 2, above 1, fifth 3, scale 3; neo-soul below 5, scale 2, fifth 2, above 1 (a half step into a root slides up from below far more than it falls from the b9 above). [style-data] (solid)

BA-05. A lead-in resolves by step in pitch, not merely in pitch class: it aims at the exact octave in which the next root will be played, and the next bar is obliged to play that octave (the lead-in "promises" the landing). Target: at most 5% of lead-ins land more than a step from the note they lead to. [property] (solid)

BA-06. Across a section change the lead-in aims at the root as the *next* section will place it (its own register), and the new section starts on exactly that note, so a new section begins in its own octave rather than inheriting the old one for a bar. [property] (solid)

BA-07. A riff tone that happens to sit a half or whole step (by pitch class) from the next root but more than a fifth away in pitch is moved an octave to sit beside the root: on paper it is a leading tone, but a seventh away the ear hears a wrong note or a leap. [property] (solid)

BA-08. At the bottom of the instrument (a target of E1 or F1), a lead-in comes down onto the string from above: a half-step-below approach becomes the half step above; a scale approach takes the chord's own scale step above the target; the note is never taken from under the open E and never folded up an octave (Eb2 into E1 is a leap of a seventh, not a lead-in). [property] (solid)

BA-09. When a floor lead-in has to come from above, it must be a tone of the chord being left, of the chord being approached, or of the key; otherwise it takes the current chord's own scale step above the target (over B7 into E the lead-in is F#1, not F1). Over a chord whose scale has no step there (a sus or power chord) it takes the whole step above the target (Dsus4 into Em: F#1 into E1). [property] (solid)

BA-10. A scale-step lead-in is never the same pitch as the note before it (that is a repeat, not a lead-in): take the scale step on the other side, then the whole step above, then the half step; the one exception is when the chord's own half step above the target is that note and is the only way onto the string (F then C/E: F1 into E1). Only some lines apply this check (reggae does; rock's does not). [property] (unclear)

BA-11. There is nothing to approach, so no lead-in is played, when the next bar starts on N.C., the performance ends without a following chord, the band lays out in the next bar (a drum solo turn), or the next chord has the same bass note. [property] (solid)

BA-12. Because a ceiling on bad lead-ins passes trivially when there are none, each style also has a floor on how many half-step lead-ins it plays across the standard test charts (jazz 450, disco 160, blues 150, country 85, acoustic 80, rock 70, reggae 53, hip hop 47, funk 18): roughly half of what was measured. Use the ratios between styles, not the absolute counts. [metric] (solid)

BA-13. "Locked to the kick" means the kicks the drummer actually played in this bar, fills and crashes included; ghosted or feathered kicks (velocity 45 or under after scaling) do not count as kicks to lock to. [property] (solid)

BA-14. No bass note is shorter than half a sixteenth (60 ticks). [property] (solid)

BA-15. A held bass note (a half note or longer) is always a chord tone, never a passing tone (target at least 97%); passing tones are a beat or shorter. [property] (solid)

BA-16. In any meter other than 4/4 each style falls back to a plain version of itself: roots on the strong pulses, perhaps a fifth or octave on a pulse's last eighth, no riffs and no walk-ups. [style-data] (solid)

### Jazz: the walk

BA-17. Above low energy, outside the light head: four quarter notes a bar (0.85 to 1.05 notes per beat), each 92% of its beat; velocity 98 on a chord's arrival, 90 on beats 2 and 4, 86 on beat 3 and unaccented arrivals. Accents are nearly even. [style-data] (solid)

BA-18. The line for one chord is built in this order: the arrival note first; then the approach note into the next chord, on the last beat (only if that last note is a beat or shorter: a held note is never an approach); then the beats between, walked toward the approach. [property] (solid)

BA-19. Each middle note is chosen among notes 1 to 5 semitones from the previous note that are in the chord or its scale, weighted: chord tone on beat 1 or 3 weight 3, chord tone on 2 or 4 weight 1.6, scale tone on 2 or 4 weight 1.4, scale tone on 1 or 3 weight 0.5; all divided by the interval in semitones (steps beat leaps); doubled when moving toward the approach note, times 0.6 when moving away. [style-data] (solid)

BA-20. The walk never repeats a pitch (target at most 2% repeated notes), averages 1.5 to 4.5 semitones per move, and the note before the approach is within a major third of it. [metric] (solid)

BA-21. The approach note is never the target itself and never the note just before it; if four tries fail, it is the half step below (or above). The fifth-type approach takes whichever octave is nearer the line so it never leaps an octave to get there. Target: 30% to 80% of changes are approached by half step. [property] (solid)

BA-22. One arrival in ten plays the chord's third instead of its bass note, for motion, but never right after an approach that pointed at the root (within a whole step), never on the first bar of a section, and never under a slash chord. Target: the walk lands on the chord's bass note at least 75% of the time. [style-data] (solid)

BA-23. Two-feel (4/4 only): half notes on 1 and 3, the chord's bass note then its fifth (its third if the fifth would repeat the same pitch), 92% length, velocity 96 then 86; 0.45 to 0.75 notes per beat. In 35% of bars where a change follows, the second half note splits and beat 4 is a quarter-note approach; whether a bar splits is decided per section and bar position, so a repeated A section splits in the same bars. [style-data] (solid)

BA-24. The bass plays in two at low energy everywhere (a ballad stays in two through the solos), and under the head's A sections below the high tier; it walks for the bridge and the solos; a hot (high tier) head walks from the top. Targets: head in two at least 80%, bridge walking at least 90%, solos walking at least 90%. [property] (solid)

BA-25. The head's last bar before a solo chorus already walks, so the solo is set up across the barline rather than switched on at its downbeat (target at least 90%). [property] (solid)

BA-26. Mid-song, a scale-step approach into a root at the very bottom (E1, F1) aims at that root's upper octave instead and the next bar keeps the promise; aimed at the floor, the line sat on the open string and swung back and forth (F1 A1 F1 G1, F1). [property] (solid)

BA-27. The walking bass sits 2 ms ahead of the ride: on top of the beat, driving the time, while the comp lays back. [style-data] (solid)

### Blues: the boogie box

BA-28. Low energy, 4/4: a two-feel, the chord's bass note on its arrival (velocity 98) and its fifth on beat 3 (88), 92% length; when a change follows a half note, beat 4 is an approach 35% of the time (velocity 84). 0.45 to 0.75 notes per beat, no repeated notes. [style-data] (solid)

BA-29. Mid and high: the boogie box in quarter notes, two bars per box on one chord: root, 3rd, 5th, 6th going up in the bar the chord arrives; b7, 6th, 5th, 3rd coming down in the next bar; then up again. A chord arriving mid-bar starts going up. The 3rd at the end of the down bar is a half step under the IV, which is why the box walks a blues by itself. [style-data] (solid)

BA-30. The box is fitted to the chord: a chord with no b7 (a major triad or 6th) turns at the octave instead of the b7; the 6th is used only when the chord's scale has a major 6th (a dominant heading to a minor chord has none and plays root, 3rd, 5th, b7 instead); a minor chord without a major 6th plays the minor-pentatonic box root, b3, 4, 5 (down: top, 5, 4, b3); a sus chord uses its 4th or 2nd in the 3rd's place; a power chord plays root, 5, 6, 5; a chord with an altered 5th keeps its own 5th; under a slash chord the line pedals on the slash note. Target: the 6th appears in 15% to 35% of bass notes over dominant chords. [style-data] (solid)

BA-31. The shuffle lope: a beat's note is struck on the beat (1.8 sixteenths long) and re-struck at the same pitch on the swung "and" (0.8 sixteenths, velocity 70), long-short. The lope always repeats the beat's pitch; it never moves to a new note on the "and" (target at least 95%). [property] (solid)

BA-32. Which beats lope: none at low energy; at mid a per-section choice of none (weight 2), beat 4 only (2), or beats 2 and 4 (1); every beat at high energy. Un-loped quarters are detached at 85%. Velocities: 100 on a chord's first beat, 94 on beat 3, 88 elsewhere. [style-data] (solid)

BA-33. The box's root is kept at or below A2 (MIDI 45) so its b7 stays inside the register, and each root is placed nearest the previous note pulled 30% toward the section's anchor: nearest-to-anchor alone made the line drop over an octave between bars after the box had climbed to its 6th. [property] (solid)

BA-34. If the box's last note before a change would be the next chord's own bass note, it is replaced by the half step below that root (otherwise the arrival is heard a beat early); if it is a step away from the next root it is kept as the lead-in and placed beside the root (BA-07). Target: 15% to 40% of changes resolve by half step in pitch. [property] (solid)

### Rock

BA-35. Low energy: a root with every kick (and on each chord's arrival), each held 95% of the way to the next. Mid and high: straight root eighths, each 85% of an eighth; velocity 102 on the beat, 86 on the offbeat. Target 1.2 to 2.2 notes per beat at normal energy, essentially no sixteenth syncopation (at most 5%). [style-data] (solid)

BA-36. At high energy the root jumps an octave on offbeat eighths chosen once per section from: none, the "and" of 2, the "and" of 4, both, or the "and" of 3. The part repeats instead of flickering. [style-data] (solid)

BA-37. The last eighth before a change to a different root becomes a lead-in 35% of the time (20% at low energy), kind drawn by BA-04. [style-data] (solid)

### Funk

BA-38. One of five one-bar sixteenth riffs per section (R root, O octave up, 5 fifth, 7 the b7 or the octave when the chord has no b7, m a dead note on the root): `R..m R.O. m.R. .7O.`, `R... m.R. O..R .m5.`, `R..m ..RO ..R. .7.m`, `R.O. m.R. ..R. m.O.`, `R... ...7 O.R. .5..`. [style-data] (solid)

BA-39. Low energy: roots only, on the riff's root positions and on every kick; no dead notes, no octaves. Mid: the riff, minus dead notes that fall on the "a" of a beat, plus a root wherever the kick plays and the riff is silent. High: the whole riff plus those kick roots. [style-data] (solid)

BA-40. Funk notes are short: 75% of the gap to the next note and never longer than 2.25 sixteenths; a dead note is half a sixteenth at velocity 52. Velocity 112 on the beat, 94 off it. Targets: 10% to 60% of notes on syncopated sixteenths; at least 35% of kicks doubled by the bass. [style-data] (solid)

BA-41. The b7 is played below the root when above would leave the register. A note on the very last sixteenth before a change becomes a half step below the next root 30% of the time; a riff tone within the last beat that sits a step from the next root is placed beside it (BA-07). [style-data] (solid)

BA-42. The bass and comp push 5 ms and 3 ms ahead of the drums: funk leans forward on the One. [style-data] (solid)

### Bossa

BA-43. Root on 1 (a dotted quarter), fifth on the "and" of 2, the fifth again on 3 (or the new root if the chord changes there), and on the "and" of 4 the next bar's root, anticipated; when the next chord differs, that pickup is the half step below it 30% of the time; when it does not, the pickup is this root again. The rhythm is the kick's (target at least 70% in unison). [style-data] (solid)

BA-44. The fifth goes below the root when the root is high; velocity 96 on 1 and 3, 78 on the "and"s; notes 90% of their slot. [style-data] (solid)

BA-45. The bossa bass plays the same figure at every energy; only loudness changes. [style-data] (unclear)

### Reggae

BA-46. One riff per section, with written rests and ties (`-` holds, `.` is silence; 3 is the third or a sus chord's fourth, 6 the scale's sixth as a passing tone): `..R- R-.5 O--- 5-3.` (weights low/mid/high 0/3/3), `R--- .... R-5- O-5.` (1/3/2), `..R- ..3- R--- 5-6-` (0/2/2), `R--- ---- R--- --5-` (3/1/0), `.... .... R--- ----` (2/0/0). Rests are as composed as notes: 20% to 60% of the bar is silence. [style-data] (solid)

BA-47. The bass leaves beat 1 empty only while the drummer does: if a kick sounds on 1 (steppers, rockers, a crash after a fill) the bass plays the root there too, for at most a beat, and the riff's own root entry on the "and" of 1 is dropped (root-root is a stutter, not a line). Target: the bass plays beat 1 in 15% to 75% of bars. [property] (solid)

BA-48. A chord change inside the bar is stated with its root where it happens (for at most a beat); a change at the barline may keep the riff's hole on 1. A riff that would arrive on the octave arrives on the root instead when the note before was a lead-in to that root. [property] (solid)

BA-49. The register is the lowest octave, anchored per section on A1 to C2 (MIDI 33 to 36); mean pitch 32 to 42. Velocity 104 on beats 1 and 3 and on arrivals, 88 on pickups; notes last 92% of their written length. The bass sits 8 ms behind the drums. [style-data] (solid)

BA-50. The last note before a change, within an eighth of it, becomes a lead-in 35% of the time (kinds by BA-04, never repeating the note before). [style-data] (solid)

### Country

BA-51. Boom-chick: root on 1, fifth on 3 (the fifth below the root where the register allows), beats 2 and 4 left to the snare and comp; velocity 100 then 92. Over a slash chord whose bass is the fifth, the alternate note is the root. Target: root on 1 and fifth on 3 in at least 90% of bars; 0.5 to 0.75 notes per beat. [style-data] (solid)

BA-52. Low energy is a ballad two-beat: the two notes ring as half notes (92%), and nothing else is ever played (exactly two notes a bar; no walks). Mid: each boom lasts 55% of a beat, short, so the "chick" answers into air (set by ear). High: 75% of a beat. Walking notes connect at 92%. [style-data] (solid)

BA-53. The walk-up: into a chord with a different bass note a third to a tritone away, the root is held from 1 and two stepping notes on beats 3 and 4 run up or down into the new root ("G, A-B, C"), velocity 96 then 102 (beat 4 hardest: the pickup is a gesture into the landing). Only above low energy, only in 4/4, only into a chord actually struck. Probability 90% into a new section, otherwise 65% at high and 45% at mid. Target: 20% to 60% of changes walked. [style-data] (solid)

BA-54. The note on beat 4 of a walk is the one the ear judges, so it must be a tone of the current chord or its scale and outweighs beat 3 two to one when choosing the run: into D minor from A7 the walk is A, C, C#, D (or A, B, C#, D), never A, Bb, C natural, D. [property] (solid)

BA-55. A chord lasting only two beats may walk with one note on its second beat (a scale step, else a half step, from the side the line comes from) at 0.8 of the walk-up probability. [style-data] (solid)

BA-56. In a meter with one boom per bar (a waltz), the bass alternates root one bar, fifth the next while the chord holds. [style-data] (solid)

### Hip hop

BA-57. The sub lives in the lowest octave, in one fixed twelve-semitone window for the whole performance whose bottom is E1 to G1 (MIDI 28 to 31), so a given chord is always the same note. Mean pitch 30 to 38. [style-data] (solid)

BA-58. Mid and high: one long note struck with every kick the drummer played and held 95% of the way to the next (mean length 4 to 16 sixteenths; at least 75% of bass notes coincide with a kick); a chord that changes where no kick plays is still stated there. Low: only beat 1 and chord arrivals, held. Velocity 112 on beat 1, 102 elsewhere. [style-data] (solid)

BA-59. When the beat drops out for a fill, the sub drops out with it at exactly the same sixteenth; with no drummer there is no drop, and the sub hears kicks on 1 and the "and" of 3. [property] (solid)

BA-60. On answer bars (not at low energy) the note on the bar's last kick may leave the root, by a per-section choice: stay on the root (weight 3), drop to the fifth below (2; the fifth above if below is off the instrument), or jump the octave (1); never under a slash chord. Velocity 98. [style-data] (solid)

BA-61. On an answer bar that leads into a barline change, the 808 glide is played as a grace note on the last sixteenth, a half step from the next root on the side the line comes from (velocity 92), but only when the next root is within a minor third of the note being left; wider than that, the sub simply jumps. Target: at least 85% of slides stay within that span. [style-data] (solid)

BA-62. The sub sits 4 ms behind the kick: close enough to fuse into one fatter hit. [style-data] (solid)

### Disco

BA-63. The octave pump (R low root, O its octave), one figure per section by tier. Low: `R... R... R... R...` (weight 3) or `R... R... R... R.O.` (2). Mid: `R.O. R.O. R.O. R.O.` (4), `R.R. R.O. R.R. R.O.` (1), `R.R. R.R. R.O. R.O.` (1). High: the pump (2) or the gallop `R.OR R.OR R.OR R.OR` (2). Target: an octave on 50% to 90% of beats above quiet, 20% or fewer when quiet. [style-data] (solid)

BA-64. Register is fixed for the performance: every root lies in the octave above E1 or F1, so its octave never passes E3 and the pump never has to fold into an inversion; mean pitch 34 to 42. A fixed anchor is essential: placing each root near the previous one (voice leading between chords) breaks the pump. [property] (solid)

BA-65. The pump bounces: each note is 80% of at most an eighth (at most a dotted eighth when quiet). Velocity 102 for a root on the beat, 78 for a root off it, 94 for the octave, 90 for a lead-in. The bass sits 2 ms ahead of the drums. [style-data] (solid)

BA-66. Lead-ins are a half step below the next root (above, at the floor) on the last note within an eighth of the change: never at low energy; always at the end of a phrase; and at every change in sections whose bassist "walks" (30% of sections at mid, 60% at high). Target: 25% to 60% of changes. [style-data] (solid)

### Neo-soul

BA-67. One riff per section (`-` holds, `.` silence; 9 is a hammer-on to the 2nd, m a dead note): `R--- ---- ---- ..5-` (weights low/mid/high 3/1/0), `R--- ---- ...5 -7-.` (2/3/1), `R--- --.R --5- ..7-` (0/3/2), `R--9 -.R- ...O -5-.` (0/1/3), `R-.m R--- ..5- m7-.` (0/0/2). Offbeat entries sit on "e"s and "a"s (25% to 60% of notes); 15% to 45% of the bar is rest so the kick can speak. [style-data] (solid)

BA-68. The fifth and seventh are placed nearest the note before, so from the root they fall below it (the fifth a fourth under, the b7 a step under): the deep shape. On a triad the "seventh" is the major sixth if the scale has one, else the root; the hammered 2nd is played only where the chord's scale has a major 2nd (never over a b9) and not on a slash chord; a dead note takes the pitch of the note before it. [style-data] (solid)

BA-69. Register is one deep anchor for the whole performance (A1 to C2), mean pitch 31 to 38, regardless of energy. Velocity 100 on arrivals, 90 on beats, 84 on offbeat sixteenths, 80 on lead-ins, 50 for dead notes; notes ring 92% of their written length. The bass sits 32 ms behind the drums, deeper than the keys' 25. [style-data] (solid)

BA-70. Half the sections lead into their changes and half let the riff's own last notes carry them (a lead-in on every change is a mannerism); the last bar of a phrase always leads in, adding a pickup on the final sixteenth if the riff has nothing in its last beat. A lead-in is played only when the line is within a fifth of the target; otherwise it is left out. Targets: 25% to 60% of changes by half step; 60% to 95% of those from below. [style-data] (solid)

### Metal

BA-71. Roots only, on the low E string (E1 to D#2, MIDI 28 to 39), the same octave for the whole performance, an octave under the guitar's power chords. No approach notes, no passing tones, no walking, ever: under a power chord a passing tone rubs against the riff instead of leading it. Targets: at least 98% of notes on the chord's bass note; mean pitch 30 to 36. [property] (solid)

BA-72. Low energy: long roots with each kick, held 95%. Mid: root eighths (1.8 to 2.3 notes per beat). High: eighths plus a note on every kick, so every double-kick burst and gallop is the bass's too (at least 95% of kicks doubled). Above low energy notes are damped to 70% of at most an eighth. Velocity 106 on beats, 92 on offbeat eighths, 86 on sixteenths. [style-data] (solid)

### Ska-punk

BA-73. Ska gear: a walking line in quarter notes (at least 97% of notes on beats, 0.85 to 1.05 per beat), plucked short at 80%; velocity 100 on the arrival, 94 on the approach, 86 between. Quiet ska walks in two (0.5 to 0.8 per beat), keeping the last-beat approach when a chord lasts the whole bar. [style-data] (solid)

BA-74. The ska walk is the cheapest path under these costs: a step (up to a whole tone) is free, a third costs 1.5, a fourth 3, a tritone or fifth 5, anything wider or a repeated note is forbidden; reversing direction costs 0.9 and stepping straight back to the note before costs 2; a non-chord tone on beat 3 costs 1.2; the next chord's bass note may not be touched early. Target: 55% to 95% of moves are steps. [style-data] (solid)

BA-75. The last beat approaches the next root by scale step or from its fifth (free) or by half step (cost 1.6). Left free, the half step took 75% to 85% of changes; the premium brings it to 30% to 60%: chromaticism as seasoning. A chord that simply repeats is walked home to by scale step or fifth, never by a manufactured half step (at most 25%). [metric] (solid)

BA-76. Punk gear: root eighths (quarters when quiet), even and detached at 80%, velocity 100 on beats and 88 off; the last eighth leads into a change by a half step from the side the line is on, always into a new section and otherwise in half the sections. Target: at least 90% of chorus notes are driving roots. [style-data] (solid)

BA-77. Every bar decides the exact pitch of the next chord's root and the next bar arrives exactly there, in either gear and across the switch between them. [property] (solid)

### Acoustic

BA-78. One figure per section by tier, root and fifth only: low, `R--- ---- 5--- ----` (weight 2) or a whole-note root (1); mid, the same half notes (2) or with the root again on the "and" of 2 (1); high, quarters root, root, fifth, fifth (2) or `R--- --R- 5--- 5---` (1). Energy adds notes; the harmony stays root and fifth (at least 97% of notes on 1 and 3 are one or the other). [style-data] (solid)

BA-79. The fifth is taken below the root where it fits (an upright's low warmth). Notes ring 95% when quiet, 88% at mid, 80% at high. Velocity 96 on arrivals, 86 on repeated roots, 88 on fifths, 84 on passing tones. The bass sits 5 ms behind the drums. [style-data] (solid)

BA-80. A passing tone on beat 4 into a change (a whole step from the new root if that note is in the current chord's scale, else a half step, from the side the line is coming from): never when quiet, 85% of the time into a new section, otherwise 55% at high and 40% at mid. Targets: 2% to 12% of notes are passing tones (1% or less when quiet); at least 97% of them resolve by step. [style-data] (solid)

### Known weaknesses

BA-81. The bass plans one chord at a time: it knows the chord it is on and the next one, nothing further. There is no line shaped across a phrase, no pedal point, no sequence, and no awareness of a ii-V-I as a unit. [taste] (solid)

BA-82. Chord function reaches the bass only through the chord's scale and the next chord's root (plus the key, in two narrow places: BA-09 and the country ending walk). The bass never chooses a different note because a chord is, say, a tonic versus a subdominant. [taste] (solid)

BA-83. The bass never fills, and the drums and bass never share or trade a fill; an earlier band piloted that (one of drums or bass given "ownership" of a transition embellishment in rock) and it was not carried forward. [taste] (solid)

BA-84. There is no band-wide push: kick, bass and comp cannot anticipate a chord together, so rock's comp pushes were switched off (keys pushing alone put the new chord over the old bass note). The bass anticipates only in bossa. [taste] (solid)

BA-85. Nothing in the bass reads the tempo. [taste] (solid)

BA-86. The loudness swing between a quiet and a loud band is narrow (velocity times 0.72 to 1.12). An earlier band gave the bass its own wider curve (gain 0.40 + 1.10 × intensity, about 7 dB from quiet to loud, measured) and one owner for it after three stacked intensity multipliers had saturated the ceiling. [taste] (solid)

## Conductor and energy

The old band has no live conductor. Everything below is decided once, from the written form and the settings, before anyone plays a note. Energy never drifts while the song plays; the same chart and seed always give the same arrangement.

### How energy is represented

CO-01. Energy is one number per bar, 0 to 1, shared by the whole band; no instrument has a private energy. [property] (solid)

CO-02. Players choose *what* to play from three tiers of that number (low: under 0.42; mid: 0.42 up to but not including 0.70; high: 0.70 and up) and choose *how loud* from the raw number, so a bar is tier-stable by construction and dynamics still move smoothly inside a tier. [property] (solid)

CO-03. A section's base energy comes from the start of its name: Intro 0.35; Verse (also "V", "V2") 0.50; Pre-chorus (anything starting "pre") 0.60; Chorus, Hook or Refrain 0.75; Bridge 0.60; Solo 0.65; Break or Breakdown 0.30; Outro, Coda, Ending or Tag 0.45; a section with a plain letter or any unknown name (A, C, Head) sits at 0.55. [style-data] (solid)

CO-04. A section may carry its own written target energy, which replaces the name-based value outright. [property] (solid)

CO-05. With the player's intensity left on Auto, the bar's level is the section's base energy; with a manual intensity, the level is that intensity plus half of the section's distance from 0.55, so the form still breathes around the chosen level at half depth. [property] (solid)

CO-06. A manual intensity holds the same level every time round the form: no per-pass lift and no jam arc is ever added to it. [property] (solid)

CO-07. A section named exactly "B" is read as a Bridge for energy (0.60; a deliberate fix so the B of AABA gets bridge energy), while the reading of "which section is the head's bridge" (CO-27) does not trust a bare letter, because in some tunes B is the second A. The two readings can disagree on the same section. [taste] (unclear)

### How energy moves

CO-08. The last bar of a section that leads into a section more than 0.05 higher gets +0.06: a one-bar build into the bigger section, not a ramp across the whole section. [property] (solid)

CO-09. A song that loops (Auto only) gains +0.03 each time round, capped at +0.09 from the fourth time on: later choruses are a little fuller but the band never runs away from the player. [style-data] (solid)

CO-10. Energy moves at section tops and phrase tops, never mid-phrase; a groove change on bar 3 of a 4-bar phrase sounds mechanical. [property] (solid)

CO-11. Tempo never moves with energy; the band is metronomic and all shaping is density and dynamics (the one exception is a fermata, EN-41). [property] (solid)

CO-12. Phrases are four bars, counted from the top of each section; a section of 5 bars or fewer is one phrase; a leftover of 1 or 2 bars joins the last phrase (6 bars = one 6-bar phrase, 9 = 4+5, 10 = 4+6) and a leftover of 3 is its own 3-bar phrase. [property] (solid)

### The jam arc (a counted performance in song mode)

CO-13. When a performance has a fixed number of choruses, does not loop, and intensity is on Auto, energy follows a jam-session arc instead of the per-pass lift (it replaces that lift, never stacks on it): a mid-low head, a build chorus by chorus to a climax about two-thirds in, one chorus of breath before the last, then a lift through the last chorus into the ending. [property] (solid)

CO-14. The arc is an offset added to each bar's section energy, so the form still shapes inside every chorus (a verse stays under its chorus, an intro under both). [property] (solid)

CO-15. The arc's offsets, as chorus means: head −0.03; climax +0.19; choruses after the climax but before the breath +0.12; the breath +0.04, held flat; last chorus from +0.09 rising to +0.20 by its final phrase. On a plain chart (base 0.55) that reads 0.52 head (mid), 0.74 climax (high), 0.67 settle, 0.59 breath (mid), 0.64 rising to 0.75 at the end (high from about mid-chorus). [style-data] (solid)

CO-16. Inside each building chorus the band leans in: the offset runs from 0.05 under the chorus mean at its top to 0.05 over at its end, stepped per phrase (value taken at the phrase's middle), so the climax chorus opens in upper mid and crosses into high by its second phrase. The breath chorus does not lean: holding back is not building. [style-data] (solid)

CO-17. The climax chorus is chosen so that it *ends* about two-thirds of the way through (between half and four-fifths in tests): for n choruses counted from 0 it is chorus round(2n/3) − 1, at least chorus 1 and at most chorus n − 3. [property] (solid)

CO-18. With three choruses the middle one is the climax and the breath is only the top of the last chorus (the out-head comes back in under the solo it follows, then lifts); with two, the head sits at −0.03 and the last chorus lifts from +0.09 to +0.20; with one, a single build from −0.03 to +0.20. [property] (solid)

CO-19. In the last chorus the lift is read at each phrase's end, so the closing phrase always plays at the full ending level whatever the phrase lengths. [property] (solid)

CO-20. The head must not open so low that a verse falls into the low tier: the head offset was set at −0.03 so a verse (0.50) lands near 0.43 on its first phrase, just clear of the 0.42 line, and keeps its normal groove rather than the breakdown groove. [taste] (solid)

CO-21. A once-only intro sits low in the head and a once-only outro or coda plays on the last chorus's lift at its own lower base energy, so the tune lands on it rather than peaking on it. [property] (solid)

CO-22. A style may scale the whole arc: reggae plays it at 0.5 depth (a plain chart's climax about 0.65) and bossa at 0.6 (about 0.67); every other style plays the full arc. The scaled arc keeps its shape, and its climax and last chorus still lean in phrase by phrase. [style-data] (solid)

CO-23. Some styles have a high tier that is a different groove rather than a bigger one (bossa moving to the ride, reggae changing riddim). For those, no lift of any kind (the one-bar build, the per-pass lift, the jam arc) may carry a bar across the 0.70 line in either direction: a section under the line tops out at 0.69, a section over it never drops below 0.70. Only the chart's own section energy or a manual intensity can cross it. [property] (solid)

### Who plays what, when

CO-24. Within a bar the players decide in a fixed order, drums, then bass, then lead, then comp, and each hears what the earlier ones played in that bar: the bass can lock to the kick it actually heard, and the comp can answer the lead. Nobody hears a later player. [property] (solid)

CO-25. The lead's job is set per time through the form: head the first time, then three solo choruses (build, build, wind down), then the head again, repeating (head, solo 1, solo 2, solo 3, head, ...). A section labelled "Solo" is a solo even the first time through. [property] (solid)

CO-26. An intro belongs to the band: the lead rests through any section labelled as an intro. [property] (solid)

CO-27. The rhythm section reads each bar's place in the form as one of four roles: head (the melody's A sections), bridge, solo (any solo or trade), or band (intro, lead resting). The bridge is a section labelled "Bridge", or failing that the second-to-last section of a chorus of three or more sections when it differs from both the chorus's first and last sections (the B of AABA, the C of ABCD); ABAC, two-part tunes and a blues have no bridge. The role is available even with the lead switched off. [property] (solid)

CO-28. A counted performance of two or more choruses always ends on the out-head: the last chorus is the head whatever the cycle had reached, and any trading hands back to the band for it. [property] (solid)

CO-29. The head is never played twice running at the end: the chorus before the out-head stays a solo (as the wind-down chorus) or keeps trading; and the solos wind down only once, so if the chorus before that would also have been a wind-down it holds the build instead (..., solo 2, solo 2, solo 3, head). [property] (solid)

CO-30. A section can silence any instrument for its duration (a written tacet), and an instrument switched off in settings is silent everywhere. [property] (solid)

CO-31. The musician's own instrument is a hole, not an absence: that part is still planned and "played" so the rest of the band reacts exactly as if the player were there (the guitar keeps its with-a-bassist shapes for a bassist), and only then left out of what sounds. The band never trades with the musician's own instrument. [property] (solid)

### Trading

CO-32. Trading starts the chorus after the head: the form is cut into turns of 2, 4 or 8 bars counted from the top of each chorus (an intro is never part of a turn; a chorus that does not divide evenly ends on a short turn), and the sides alternate. [property] (solid)

CO-33. Trading with the soloist, the band's soloist goes first (a phrase for you to answer); trading with the drummer, you go first and the drummer answers. [property] (solid)

CO-34. On your turn the band's soloist lays out and the rhythm section keeps playing; on the drummer's turn the bass and comp lay out and the drums play alone. [property] (solid)

CO-35. Alternation runs over the turns actually played, across chorus boundaries, so neither side ever gets two turns in a row when choruses have different numbers of turns. [property] (solid)

CO-36. With a set number of traded choruses N, the cycle is head, N traded choruses, head, N traded choruses, ...; with none set, trading continues forever after the first head. [property] (solid)

CO-37. Asking to trade with the drummer makes you the soloist on every chorus but a returning head, so the band's soloist never plays over you even in a style whose drummer cannot solo. [property] (solid)

CO-38. Only a style with a written drum-solo vocabulary can trade with the drummer; in the old band that was jazz alone (DR-22 to DR-25). [style-data] (solid)

### Fills and crashes are the drummer marking the form

CO-39. A section fill is planned on the last bar of every section, on the bar before a loop wraps to the top, and on the last bar of each chorus of a counted performance. A section can be flagged "seamless": it then gets no fill at its own end (unless that end is a wrap or a chorus seam) and no crash on its own first bar. [property] (solid)

CO-40. A phrase fill is planned on the last bar of every second phrase inside a section (bars 8, 16, 24 ... of a section in 4-bar phrases) when that bar is not already a section end. [property] (solid)

CO-41. A crash is planned on the first bar of a new section (unless seamless, unless it is the very first bar of the performance, unless it opens the drummer's own trading turn), on the downbeat after a phrase fill when that bar's energy is at least 0.50, and on the bar where the band comes back in after a drum solo turn. Never on the ending bar, whose cymbal is the ending's own. [property] (solid)

CO-42. A performance never opens with a crash: there is nothing before the first bar to arrive from. Starting playback mid-chart counts as a first bar; resuming after a settings change does not. [property] (solid)

CO-43. A fill is sized by where the music is going: it uses the bigger of this bar's tier and the next bar's tier, so the fill into a chorus is chorus-sized even from a quiet verse. Tests check, for every style, that a fill into a higher tier is at least as long as the fill out of it. [property] (solid)

CO-44. Fill length is per style, per tier, for phrase fills and section fills separately, in sixteenths before the barline (rock: phrase 2/4/4, section 4/4/8 for low/mid/high; jazz: phrase 0/2/4, section 4/4/8); no fill is ever longer than the bar minus one beat, so beat 1 of the fill bar always keeps time. [style-data] (solid)

CO-45. A form shorter than 8 bars that just goes round (a vamp, looping or counted as choruses of one section) is not filled and crashed every lap: the drummer counts bars played and plays a phrase fill on the lap that crosses each 8-bar line and a section fill (with a crash after it) on the lap that crosses each 16-bar line, whatever the loop length (a 7-bar vamp still fills about every 8 bars). A 4-bar loop crashes at most every 16 bars. A loop of 8 bars or more fills every lap. [property] (solid)

CO-46. On those short loops the fills alternate small and full so consecutive laps differ: the section fills at 16 and 48 bars are half length and those at 32 and 64 are full; the phrase fills at 8 and 40 are half length and those at 24 and 56 are full. Half length applies only when the full fill is at least 4 sixteenths. [property] (solid)

CO-47. A short form with two real sections keeps its fill at the section seam and at the wrap: lap counting applies only to a single-section vamp. [property] (solid)

CO-48. The drummer's turn in a trade gets no fill (it is a solo, not a fill) and opens without a crash; the crash is the band coming back in on the bar after it. [property] (solid)

### Contrast between sections

CO-49. Section contrast comes from four things only: the tier the section's energy lands in (which selects a different groove, bass rhythm and comping pattern per style), the raw energy scaling every velocity, the form role (CO-27: a jazz head is lighter than its bridge and solos), and choices drawn once per section (a kick pattern, a bass register, an octave-pop pattern, a strum pattern) that stay fixed for every bar of that section. [property] (solid)

CO-50. A repeat of a section is the same section: A, A2, A3 and A′ share one set of per-section choices, so the second A has the first A's groove and bass register. Sections with no letter are told apart by position. [property] (solid)

CO-51. Some choices are made once for the whole performance, such as which riddim a reggae band plays; a band does not switch those between choruses. [property] (solid)

CO-52. Every random choice is tied to its musical position (seed, style, instrument, time through the form, bar's place in the chorus, and the purpose of the choice), never to how many choices came before it; so bar 40 is the same whether or not bars 0 to 39 were generated first, and chorus k of a counted chart plays exactly what lap k of the looping chart plays. [property] (solid)

## Endings and transitions

An ending has three independent decisions: which chord the band ends on, the gesture it is played in, and whether the bar before sets it up. All three are fixed before the pass is played, so every instrument agrees.

### When there is an ending at all

EN-01. Only a performance that stops has an ending, and the ending is exactly its final bar. A pass that will go round again plays its last bar as written, turnaround included, with a section fill into the top (CO-39). [property] (solid)

EN-02. On the ending bar the whole band plays one chord: the bass one note, the comp one full chord with nothing left out for the lead, the lead its last note. [property] (solid)

### Which chord

EN-03. If the last bar is not already home (a ii-V, a V7, a tritone sub: anything written to send the form round again), the band does not play it: the whole bar becomes the tonic, struck on the downbeat. Only that bar's harmony changes. [property] (solid)

EN-04. The bar before the ending is played on its written chords, but its lead-ins aim at the chord the band is about to hold, not at the turnaround it replaces: a bassist who hears the last turnaround coming walks into the tonic. [property] (solid)

EN-05. The last bar is played exactly as written when: it opens on N.C. (the chart's own ending); its first chord carries a fermata (a written hold is how a chart asks to end somewhere other than the tonic); it is the last bar of a written coda; or its first chord is already home. [property] (solid)

EN-06. "Home" means: rooted on the key's tonic, with the tonic in the bass (C/E is a passing sound, not home), in a family that can rest (major, minor, dominant or power chord; never sus, diminished, half-diminished or augmented), and not on its way somewhere: a dominant on the tonic that falls a fifth, or turns minor on the same root, is moving; a minor chord on the tonic of a major key that falls a fifth to a dominant is a ii, not a i. A home chord keeps the color the chart gave it (Bb6, C7, Em9, a Picardy major). [property] (solid)

EN-07. A last bar that reaches home partway through (G7 then C; Csus4 then C) is played as written: what comes before home is struck where it is written, and home is held from where the chart puts it. [property] (solid)

EN-08. A tune whose last bar comes to rest on the same root the chart opens on (both stable, root position, acting as a tonic) is home there whatever the key setting says: G, C, D, G typed without a key ends on G, not on a default C. This outranks the key. [property] (solid)

EN-09. A key the chart never rests on is not trusted (a chart typed without a key reads as C major): the band will not "resolve" an F tune to C. Such a last bar is played as written, except that if it writes its own V7 to I (E7 then Am) the band holds the I it arrives on. A key counts as backed if the chart opens on a stable tonic chord or rests on one anywhere. [property] (solid)

EN-10. When a major key's tonic is backed by nothing but a dominant seventh (or nothing), the last chord is the V7 of the chart's opening chord, and the chart rests on its opening chord longer than on any rival, the band resolves to the opening chord instead of the key's tonic (an 8-bar blues in G left on C ends on G). An opening that is a power chord, or the first of a chain of dominants falling by fifths, does not qualify; a tie keeps the key's reading. [property] (solid)

EN-11. Known miss, recorded as such: G, C, D, D7 typed without a key (so read as C) ends on C rather than G. The band cannot tell a key the player set from the default. [property] (unclear)

EN-12. The resolved tonic's family (major, minor, or dominant) comes from the chart, weighed by how long the chart rests on each kind of tonic chord, ignoring chords that only pass through the tonic (a V7 of IV, a ii of a ii-V, a V of iv). Minor wins if it rests longer than all major-third chords together (ties go to the key's mode). Dominant is taken only when no major-seventh tonic chord appears anywhere and dominant tonic chords out-rest the plain triads and sixths (a blues with one plain C in bar 11 is still a blues; a pop song with one passing C7 is not). [property] (solid)

EN-13. The color on that tonic is the style's, and must never change what the tonic is. As major / minor / dominant-tonic: rock I / i; jazz I6 / im6; funk I6/9 / im9 / I9; bossa Imaj7 / im6 / I9; reggae I / i; blues I9 / im9 / I9; country I / i; hip hop Imaj7 / im7 / I7; disco Imaj7 / im7 / I9; neo-soul Imaj9 / im9 / I9; metal the power chord in both modes; ska-punk I / i; acoustic I / i. Styles whose major color has no seventh use it on a dominant tonic too. Funk's I9 on a major tune would turn the last chord into a V of IV, hence its 6/9; the blues keeps its I9 on any tune as the genre's own sound. [style-data] (solid)

### The five gestures

EN-14. Hold: everyone strikes the chord on 1 and lets it ring to the end of the bar. [style-data] (solid)

EN-15. Stop: everyone strikes on 1, an eighth long, then silence for the rest of the bar. [style-data] (solid)

EN-16. Soft: as hold, but quietly and with no crash: the comp strikes at 72 instead of 92 and the bass at four fifths of its usual ending weight. [style-data] (solid)

EN-17. Button: the chord is struck on 1 and held up to the "and" of 4, where the whole band plays one short (eighth) unison hit, 12 velocity steps harder than the held chord: the swing "doo-bop", and the "bop" is the accent. The button is always the "and" of the bar's last beat, in any meter. [style-data] (solid)

EN-18. Hits: short (eighth) unison stabs on a list of beats, the last one ringing to the end of the bar. The beats are the bar's pulses, so in 6/8 they are dotted quarters. [style-data] (solid)

EN-19. The comp's ending strike is written at 92 and the bass's at a per-style weight (rock 100, jazz 96, funk 108, bossa 92, reggae 104, blues 100, country 100 or the walk-up's last note if harder, hip hop 110, disco 106, neo-soul 96, metal 108, ska-punk 104, acoustic 96), all before energy scaling. [style-data] (solid)

EN-20. A sustaining instrument (an organ) keeps the gesture's lengths in the ending bar: a stop is short on an organ too. [property] (solid)

EN-21. The final chord is never anticipated: no instrument pushes into the ending bar or into a fermata; the band lands on the downbeat together. [property] (solid)

### Each style's ending

EN-22. Each style has one gesture, one answer to "does the bar before set it up", and one drum last bar, as tabled below. [style-data] (solid)

| Style | Gesture | Set-up fill | Drums in the last bar |
| --- | --- | --- | --- |
| Rock | hold | yes | crash, kick and floor tom, all accented, on 1 |
| Jazz | button | no | ride accent and normal kick on 1; snare and kick accents on the "and" of 4 |
| Funk | stop | yes | kick, snare and closed hat accents on 1; no cymbal (a crash would ring over the silence) |
| Bossa | soft | no | a normal cross-stick and a soft kick on 1; no cymbal |
| Reggae | stop | yes | kick and cross-stick accents on 1 (the one drop's pair moved to the One); no crash |
| Blues | hold | yes | crash and kick accents on 1; no snare |
| Country | hold | yes | crash and kick accents on 1 (same as blues; see EN-45) |
| Hip hop | stop | no | one accented kick on 1; nothing else (the record cuts) |
| Disco | hold | yes | crash, kick and snare accents on 1, with a normal shaker stroke |
| Neo-soul | soft | no | a soft kick and a soft open hat on 1 |
| Metal | hits on 1, 2, 3 | yes | kick and snare accents on 1, 2 and 3; crash only on 3, left to ring |
| Ska-punk | stop | yes | crash, kick and snare accents on 1 |
| Acoustic | soft | no | a soft kick and a soft snare tap on 1 |

EN-23. No two styles end on the same drum bar except blues and country, and a soft ending never contains a crash. [property] (solid)

EN-24. The ending bar never takes the ordinary arrival crash; its cymbal, or lack of one, is the style's. So the bar before never lifts into a crash that nobody plays. [property] (solid)

### The bar before

EN-25. In styles that set up, the bar before the ending gets a fill whatever the form would have given it, and that fill is the style's longest section fill (its high-tier length, DR-14) however quiet the band is, drawn from the "top" vocabulary: a quiet song still rolls into its last hit. [property] (solid)

EN-26. In styles that do not set up (jazz, bossa, hip hop, neo-soul, acoustic), the bar before plays plain time into the end. [style-data] (solid)

### The bass's last note

EN-27. The bass's final note is the lowest root on the instrument (E1 to D#2), under the whole band, even when the line had been living an octave higher. All the strikes of the final chord go low together (a button or the last of the hits an octave below the rest would be a wrong note); a chord before home in the same bar keeps the line's own octave. [property] (solid)

EN-28. So the bar before aims its lead-in at that low root, and a step approach lands by step. But only if the low root's lead-in is within an octave of the line's previous note: a lead-in reached by a two-octave drop is a leap, so in that case the line approaches the root in its own octave and the ending lands there instead. [property] (solid)

EN-29. No note in the bar before the ending is reached by a leap of more than an octave. A deep line (reggae) that would need such a drop plays no lead-in at all; a walk into a low E or F (ska) aims at the octave above and ends there. [property] (solid)

EN-30. In an ending that rings (hold, soft, button), a chord change over the same bass note (Csus4 to Cmaj7) is not a new bass note: the bass holds while the chord resolves above. In a short ending it is struck again. [property] (solid)

EN-31. The held note lasts the bar, whatever the meter: five beats in 5/4, not four. Nothing rings past the end of the performance. [property] (solid)

### The lead in the ending (the band rule, not the soloist's craft)

EN-32. Hold and soft: the lead's last note rings to the end with the band; a lead that had already stopped stays out (nothing is struck into a chord the band is letting ring). [property] (solid)

EN-33. Stop and hits: the band's final hit is the lead's too, every time, whatever its phrase did: a note sounding under a strike lets go with that strike, and a lead that had stopped comes back in on the hit, on the home chord's resting tone nearest where it left off. In hits it plays every stab after its last note (all of them if it was silent); a horn that played 1 and 3 but not 2 would be the one player who missed. [property] (solid)

EN-34. Every lead note on one of the final chord's strikes in a short ending, and the button in a button ending, is played at no less than the band's accent (92 + 12 before energy scaling), however softly the phrase had died away; it is a floor, not a boost. [property] (solid)

EN-35. Button: a lead note still sounding is cut at the button and plays it; a note on the final chord that had let go early is rung up to the button ("baaah, bop") rather than leaving a beat and a half of silence. Only the button is joined; the held chord before it is the band's. [property] (solid)

EN-36. A lead note held from over a V into the final chord is re-struck on a resting tone of the final chord, never left as the V's leading tone against the I. [property] (solid)

### A last bar that gets home itself (V then I inside the bar)

EN-37. The V is struck on 1 (ringing into the I in a ringing ending, an eighth long in a short one) and the gesture is then played from where the I lands, so every instrument's last hit lands with the I. [property] (solid)

EN-38. The drummer catches the V with a kick alone, at the level of the style's own downbeat kick and never louder than the I's; the style's ending bar is then played at the I. Two crashes two beats apart would announce the end twice, the first time under the wrong chord. [property] (solid)

EN-39. A button stays on the "and" of the last beat wherever the I arrived, and is dropped if the I arrives too late to leave room before it (the I is then struck once and rings). Hits keep as many as fit after the I, dropping the first ones; the last, ringing hit is always played. [property] (solid)

EN-40. A written rest after home (two beats of G7, two of N.C.) is honored: the tonic sounds up to the rest and nothing is struck in it. [property] (solid)

### Fermatas

EN-41. A fermata stretches its span to twice its written length (the only tempo event the band has) and is a held chord, not a slow groove. Mid-song, everything the band would have played inside it is replaced by: a crash (100) and kick (96) at its start; one bass note (92) on the chord's bass note nearest the last bass note played; the comp's chord and the lead's note if they struck there; all held for the whole stretched span. Those three levels are fixed; they are not scaled by energy. [property] (solid)

EN-42. A fermata on a tied hold strikes nothing: the last bass note and comp chord before it are simply extended through it. A fermata on a tie of a rest lengthens the silence; nothing rings across it. [property] (solid)

EN-43. A fermata on the ending bar holds the style's own gesture, not the generic crash: the kit plays its normal last bar, and each pitched instrument's last strike in the span rings to the end of the stretched span. So a stop's eighth becomes the hit held, a button is played as written, and the last of the hits rings on; a soft ending still crashes nowhere. A lead note held half the bar or longer under it sings with vibrato. [property] (solid)

EN-44. A tied fermata on the ending bar (the last chord is struck in the bar before and tied through a held final bar) is the hardest case. The band still ends on one drum hit under the ringing chord: the kit plays only the gesture's final strokes, once (rock's crash, kick and tom; jazz's ride and kick but not the button; metal's last hit). The bass and comp turn their last strike in the bar before into the ending's arrival (the low root and a full chord, not the approach note and half-voicing they happened to be playing), and they land on one tick: if either's last strike was on or after the "and" of the last beat, both push there, ring over the barline, and the kit's hit moves to the push with them (the fill's tail gives way); otherwise both land on the beat they were in (the later of the two), and the kit's hit stays on the following downbeat. If both already share one tick on an eighth (hip hop's "and" of 3, with the kick), that stays. Any strike closer than an eighth before the arrival is dropped as a flam, and earlier notes are cut where the arrival is struck. Before this was fixed the band arrived three times for one chord. [property] (solid)

### Country's own ending

EN-45. Country has no last drum hit of its own; its ending is the bass walking up into the final root and the guitar's stinger over it. Both play only when the ending bar is one chord struck on its downbeat. A "Nashville tag" (the last line played again) was identified and not built. [style-data] (solid)

EN-46. The walk-up is played in the bar before the ending every time, at any energy including a ballad, in 4/4: the bar's root on 1 (velocity 100), then the 5th, 6th and 7th degrees counted from the landing root (a fourth below it, then stepping up) on beats 2, 3 and 4 (92, 96, 102) into the root on the next downbeat. Over the V the 5th is already sounding and holds through beat 2 ("G, A-B, C"). The 7th is the current chord's own tone a whole step under the landing if it has one (C7 gives Bb: 5, 6, b7, 1), else the leading tone. The final root is struck at least as hard as the walk's last note. [style-data] (solid)

EN-47. Variants: from the IV the line walks down instead (F, then E and D on 3 and 4, into C). When the bar's root already lies inside the 5-6-7 run (the vi, the bVII), it keeps boom-chick (root on 1, its fifth on 3) and walks in on beat 4 only, from the note of the run above it or else the leading tone. A chord struck on beat 3 keeps its root there and adds at most one note on 4 (the landing's fifth, a scale step down, or the 7th from below; a V on 3 may simply drop a fifth onto the low root). [style-data] (solid)

EN-48. The whole walk is played in the lowest octave whose 5th is still on the instrument: the low root, or for landings on E through Ab the octave above (a country bassist never ends on the top string). A starting note that is more than an octave above the run walks down to the low root (C3, B2, A2, G2, then C2) rather than dropping and climbing. [style-data] (solid)

EN-49. The stinger: on the final tonic chord only, the rhythm guitar strikes the chord with its 6th on top (the b6 in minor) and pulls it off to the 5th an eighth later, 10% softer, which then rings: the pedal steel's pedal let up. It is played only if it sits in the top two voices on one string within the hand's reach, and not where the 6th would rub a half step under another chord note; some open shapes (C, D) have no stinger. The piano plays none. [style-data] (solid)

### Transitions between sections

EN-50. The standard section change, in order: the last bar rises 0.06 if the next section is bigger (CO-08); the drummer plays a fill sized to the destination (CO-43) or, in styles that have one and when there is no fill, a lift on the "and" of 4 (DR-21); the bass leads in, aiming at the new section's register (BA-06); the new section opens with crash and kick on 1 (DR-20) and the bass on the promised root. [property] (solid)

EN-51. A bass lead-in is much likelier into a new section than inside one: country walks up 90% of the time (45% to 65% inside), acoustic passes 85% (40% to 55% inside), ska-punk's punk gear always leads into a new section (half the sections inside); disco and neo-soul always lead into a new phrase. [style-data] (solid)

EN-52. Hip hop changes section by subtraction: the beat and the sub cut out together for the length of the fill and slam back on 1. Only into a louder section does the drummer roll in on the snare. "Louder" is judged from the two sections' own levels, before any lift, so it does not change with how many times round the tune has gone. [property] (solid)

EN-53. Jazz head into solos: the head's last bar walks, the drummer plays his one full set-up of the head, and on the downbeat the time moves from the closed hat to the ride. The out-head goes back to two-feel on the hat. [property] (solid)

EN-54. Ska-punk verse into chorus: the gear change is the transition. A verse near the top of mid can cross into the punk beat on its last bar through the one-bar build, which is how a band kicks into a chorus. [style-data] (unclear)

EN-55. A loop's wrap and a counted chart's chorus seam are treated as section ends (fill, then crash at the top) even out of a seamless section; short vamps are the exception (CO-45). [property] (solid)

EN-56. After a drum solo turn the band comes back in on a crash, and nothing from before the turn is allowed to ring into it (a held organ chord is released). [property] (solid)

### Turnarounds while looping

EN-57. A turnaround is harmony, and while the form repeats the band simply plays it; the turnaround gestures are small and belong to the second bar of each pair (DR-05, DR-44, DR-68, DR-73) and to the lead-in on its last beat. There is no special "turnaround mode". [property] (solid)

EN-58. In jazz the bar before a chord change at the barline is where the snare (and at phrase ends the bass drum) hits the "and" of 4, matching the piano's push into the new chord. [style-data] (solid)

## Known failures and things tried

Open weaknesses are listed at the end of each player's section (DR-88 to DR-93, BA-81 to BA-86) and at EN-11 and CO-07. This section records what was tried, in the order the lessons were learned, so the rewrite does not repeat the experiments.

### Drums

DR-94. Tried: one descending tom run as the fill for seven styles, and fills assembled stroke by stroke with a probability per stroke. Result: every style filled alike (reggae's and neo-soul's fill sets were identical) and the fills read as scatter. What helped: a written vocabulary of whole shapes per style, chosen once per fill by its place in the form (DR-15 to DR-17). [taste] (solid)

DR-95. Tried: every bar of a section the same bar. Result: correct but lifeless, "one bar four times". Tried next: re-drawing the groove every bar. Result: no identity (X-A-29). What helped: the same front half with one section-wide turn in the back half of bars 2 and 4 (DR-05, DR-06). [taste] (solid)

DR-96. Tried: jazz snare comping drawn freely on swung eighths. Result: it coincided with the piano only 29% of the time, played 1.35 strokes a bar, and landed on beat 3 often enough to square the time. What helped: having the snare read the chart exactly as the comping book does, one figure per phrase position (51% coincidence, 1.05 strokes a bar). [metric] (solid)

DR-97. Tried: marking the jazz head with a softer ride. Result: barely audible as a change. What helped: the head on the closed hi-hat, the ride saved for the bridge and solos. Tried: the light head at every energy. Result: under a hot tune the quiet time sounded like the band dropping out; the light head now applies only below the high tier. [taste] (solid)

DR-98. Tried, country: a swing of 55 (stilted), then 30 (still off); straight eighths was right by ear. A soft offbeat hat made the two-step limp; even eighths fixed it. Gaps in the train beat's sixteenths read as a machine-gun stutter. [taste] (solid)

DR-99. Tried, swing amounts settled by ear: blues 90 then 100 (a hard triplet); jazz 72 then 60, which sat right at both 138 and 200 bpm so it is not eased off with tempo; neo-soul 30 then 45. [style-data] (solid)

DR-100. Tried, neo-soul: an earlier band dragged the snare 6 to 18 ms and pushed the hat. With drums as the clock that is unavailable; the replacement (the backbeat on 4 moved a full sixteenth late in some sections, DR-73) is a different device and does not pretend to be a drag. Whether the pocket lost something is an open listening question. [taste] (unclear)

DR-101. Tried, disco: fills that took the stick off the open hat killed the offbeat, the genre's marker; a hat-foot "and" through every fill restored it (DR-69). [property] (solid)

DR-102. Tried, hip hop: judging "is the next section louder" from the bar's lifted energy. Result: after the first time round, the intro's last bar had been lifted into the verse's tier and the roll into the verse disappeared. What helped: judging from the sections' own levels (EN-52). [property] (solid)

### Bass

BA-87. Tried: lead-ins aimed at the next root's pitch class. Result: a correct leading tone followed by a root an octave away, heard as a wrong note. What helped, in sequence: aim at the exact pitch the next bar will play and make the next bar keep it (BA-05); do the same across section changes (BA-06); move a stray leading tone beside its root (BA-07); and measure it (lead-in leap at most 5%, with a floor on the count, BA-12). [property] (solid)

BA-88. Tried: after the ending's last note was sent to the low octave (EN-27), approaches still aimed at the old octave and resolved by a leap; then approaches aimed low from two octaves up, which is also a leap. What helped: aim low only within an octave of the line, otherwise keep the line's octave and end there (EN-28). [property] (solid)

BA-89. Tried, at the bottom of the instrument: a half step below the open E was folded up an octave (a seventh leap); a mirrored half step above was sometimes a note in neither chord nor key (F natural over B7 into E); a sus chord had no scale step there at all; jazz, sent to the floor, pendulumed on the open string. Each got its own rule (BA-08, BA-09, BA-26). Expect the floor to be where a new bass breaks first. [property] (solid)

BA-90. Tried, blues: placing each box root nearest a fixed anchor. Result: the box climbed to its 6th and the next bar's root dropped over an octave. What helped: nearest the previous note, pulled 30% toward the anchor (BA-33). [property] (solid)

BA-91. Tried, country: weighting the walk-up's beat-3 note over its beat-4 note. Result: into D minor from A7 the line walked through C natural against the chord's C#. What helped: beat 4 outweighs beat 3 (BA-54). [property] (solid)

BA-92. Tried, ska: forcing a half-step approach on every change (100%), then leaving all approaches equally free (still 75% to 85%, because the nearest scale tone under a root is so often a half step). What helped: an explicit cost on the half step (BA-75). [metric] (solid)

BA-93. Tried, disco (earlier band): voice-leading the pump between chords, and varying a repeat by adding another octave. Result: the pump folded into inversions and lost its identity. What helped: a fixed anchor (BA-64), and making the repeat-pass variation a rest rather than another note. [taste] (solid)

BA-94. Tried (earlier band): kick-lock as a rule that overrode the bass's written figures. Lesson recorded: kick-lock is a floor under authored gestures, not an interceptor; funk's note on the One must survive both the backbeat accent and the kick-lock. The later band follows it (funk adds kick roots only where the riff is silent, BA-39). [property] (solid)

BA-95. Tried (earlier band): a natural fifth under altered chords, a semitone from the fifth the comp was voicing. Fixed as in X-A-24 and X-A-25. [property] (solid)

### Conductor

CO-53. Tried: a fill and a crash at every wrap of a short loop. Result: "a loop, not a band". What helped: counting laps toward 8- and 16-bar lines (CO-45). A first version alternated small and full fills the wrong way round (the full fill on the smaller boundary); the full fill belongs on the bigger boundary (CO-46). [property] (solid)

CO-54. Tried: sizing a fill by the energy of the bar it is in. Result: a quiet verse ticked a two-sixteenth pickup into a loud chorus. What helped: size by the destination (CO-43). [property] (solid)

CO-55. Tried: the jam arc applied uniformly. Result: reggae flipped from one drop to steppers and bossa from hat to ride between choruses of the same take. What helped: reduced depth for those two styles and the rule that no lift crosses the high line (CO-22, CO-23). The same crossing then turned up from the per-pass lift and the one-bar build, and was closed for all lifts. [property] (solid)

CO-56. Tried: letting a manually chosen intensity still rise each time round. Result: the band drifted away from the level the player had set. Now pinned (CO-06). [property] (solid)

CO-57. Tried: returning to the head on schedule in the chorus before the out-head. Result: the melody twice in a row. Now CO-29. [property] (solid)

CO-58. Abandoned (earlier bands): a live conductor whose energy drifted while the song played; replaced by energy decided once from the form and the settings (see the opening of the Conductor section). Also abandoned: any whole-band timing offset, including a "gravity" model of instruments following each other and a band-global lazy feel; all were proven inaudible because they moved everyone equally (X-A-16). [property] (solid)

CO-59. Lost, not rejected: an earlier band scaled the lean with energy ("the band digs in or lays back as it builds"). The later band's lean is a per-style constant. If revived it must be a differential against the drums. [taste] (solid)

### Endings

EN-59. Tried: holding the written last chord. Result: the band sat for a bar on a turnaround. Then: resolving to the key's tonic in the style's color. Result: funk's I9 turned a Cmaj7 tune's last chord into a dominant, and charts typed without a key resolved to C. What helped: family from the chart, color from the style (EN-12, EN-13), and the trust tests on the key (EN-08 to EN-10). One miss remains (EN-11). [property] (solid)

EN-60. Tried: one shared ending for every style (crash and kick on 1, chord held). Result: a bossa ending on a metal crash. What helped: the five gestures and a drum last bar per style (EN-14 to EN-23). No country-specific last drum hit could be found that anyone would stand behind; its identity went into the walk-up and stinger (EN-45). [taste] (solid)

EN-61. Tried: a fermata on the last bar using the generic fermata (crash, kick, one note). Result: it overwrote the style's ending. Then a tied fermata wiped the kit entirely and the band ended on no drum hit; then it held whatever approach note and half-chord the bar before happened to end on; then bass, comp and kit each arrived on a different tick. Each is now part of EN-43 and EN-44. [property] (solid)

EN-62. Tried: the lead plays the final hit only if its phrase was still sounding. Result: in several styles the horn was the one player missing from the last stab. Then: joining at the level the phrase had faded to (velocity 72 to 78 against a kick at 107 to 111): inaudible. Then: a floor at the comp's plain strike: still the quietest thing on the hit. What helped: a floor at the comp's accented strike (EN-34). [property] (solid)

EN-63. Tried: a held ending note of four beats in every meter. Result: it rang past the end in 3/4 and stopped short in 5/4 (EN-31). [property] (solid)

EN-64. Pending a decision, not rejected: letting the country stinger stretch one fret beyond the normal hand span so open C can play it. It is off because the playability rule for guitar chords would have to be loosened. [taste] (unclear)

## Surprises

### In this slice

X-A-32. The pattern grids are only correct at their style's swing. Jazz bans the "e" and "a" because at swing 60 they flam; blues uses the "e" as a triplet's middle note because swing is 100; three-level sixteenth hats in hip hop and neo-soul exist to make sixteenth swing audible. The player can override swing, and nothing re-checks the grids when they do. [property] (unclear)

X-A-33. A bar carries two energies for two different questions: the lifted energy (what to play, how loud, how big a fill) and the section's own level before any lift (is the next section louder than this one). Using the lifted number for the second question made form decisions change with how many times round the tune had gone. [property] (solid)

X-A-34. A lead-in can only promise a landing if this bar can predict the next bar's choices. The old band made every per-section and per-performance choice reproducible from position alone, and let a bar ask what the next bar's section register will be. A rewrite that draws choices in sequence cannot do this. [property] (solid)

X-A-35. Section identity is the label with trailing digits and primes removed, lower-cased: A, A2 and A′ are one section for every held choice. Two sections that should differ must be named differently. [property] (solid)

DR-103. The arrival crash edits the groove rather than layering on it: it deletes the timekeeper's stroke on 1 and supplies a kick if there is none. Styles that already ride a crash as timekeeper (metal, ska-punk) declare the crash a timekeeper so an arrival replaces their written crash instead of doubling it. [property] (solid)

DR-104. "Top" fills are not only at the top of the form: a fill into any section in a higher tier, and the set-up into the last hit, also draw from the biggest vocabulary. [property] (solid)

DR-105. Feathered and ghosted kicks are invisible to the bass (BA-13): jazz's four-on-the-floor feathering and a blues section's feathered 2 and 4 never count as kicks to lock to, while a soft kick (level 72) still does. [property] (solid)

DR-106. Two styles apply a touch to cymbals after the groove is written: blues plays the "and" of 2 and of 4 at 80% (the lope), neo-soul plays every closed hat at 80% (the feather). These are easy to lose because they are not in the pattern grids. [style-data] (solid)

DR-107. A very quiet backbeat changes instrument, not just level: cross-stick below energy 0.30 (0.35 in neo-soul), inside the low tier. Acoustic keeps the cross-stick all the way up to the high tier. [style-data] (solid)

DR-108. In a tied fermata ending, metal's three hits collapse to the last one, and jazz loses its button: the kit plays only what the gesture would play on its final struck beat, moved to the one. [property] (solid)

DR-109. The blues ride depends on written repeats of a section, not on choruses or laps; this is deliberate in the old band but means most blues charts never hear the ride (DR-45). Decide it again on purpose. [taste] (unclear)

BA-96. The reggae bass's hole on beat 1 is conditional on the drummer's: an arrival crash adds a kick on 1 (DR-20), and the bass then plays 1 as well. Bass and drums agree on the hole bar by bar. [property] (solid)

BA-97. Which half of the blues box a bar plays (up or down) is derived from how many bars the chart has already spent on this chord, not from what the bass remembers, so any bar can be regenerated alone and still be the right half. [property] (solid)

BA-98. Whether a jazz two-feel bar splits its second half note is decided per section and bar position, not per bar, so a repeated A plays the first A's rhythm even though its pitches follow the line. [property] (solid)

BA-99. In the ending, all strikes of the final chord go to the low octave together, and the country ending root is struck at least as hard as the walk-up's last note: the landing must be the accent, not the note before it. [property] (solid)

BA-100. Four bass styles (country, ska-punk, acoustic, neo-soul) write their own single held note under a fermata (velocity 92 to 96), but the band-wide fermata rule (EN-41) then replaces whatever was played with one note at 92. Two authorities; the band-wide one wins. [property] (unclear)

BA-101. Disco's stated intent is that the pumped octave stays at or below D3; the actual register window allows E3. [style-data] (unclear)

BA-102. With no bassist, the bass's job does not vanish: the comp guitar takes it over (root on the bottom, a bossa thumb, an alternating thumb, boogie dyads), and with a bassist it gives the low strings back (X-A-04). Hip hop's sub, with no drummer, assumes kicks on 1 and the "and" of 3. Every "who is in the band" combination changes somebody else's part. [property] (solid)

CO-60. A vamp is detected by length, not by label: one section under 8 bars, looped or counted. A 7-bar chorus is a lap; an 8-bar one is a section. [property] (solid)

CO-61. Starting playback mid-chart must not crash on its first bar, but resuming after a settings change must still crash if the form says so. The old band tracked where a pass truly began to tell them apart. [property] (solid)

CO-62. The last chorus of a counted performance keeps its place in the solo/energy cycle for everything except the lead's job: it is the out-head for the lead and the head again for the rhythm section's form role, but its energy is the jam arc's last-chorus lift. [property] (solid)

EN-65. The ending's "is this home" test and the "which family is the tonic" test read a dominant differently on purpose: for "home", a tonic dominant that falls a fifth to anything is moving; for weighing the family and for trusting an opening chord, a tonic dominant that falls to another dominant (a blues I7 to IV7) still counts as resting. [property] (solid)

EN-66. A triad, a sixth or a 6/9 on the tonic says "major, not minor" but says nothing about the seventh (each sits inside a dominant thirteenth), so only a written major seventh rules out a dominant ending. [property] (solid)

EN-67. The set-up fill and the lack of an arrival crash go together: the fill rolls into the ending bar, but what it lands on is the style's last bar, which may have no cymbal at all (funk, reggae). [property] (solid)

### Seen in passing, belongs to another part

- Part B: the comp never pushes into the final bar, a fermata, a bar it sits out, or (on a sustaining instrument) across the loop's wrap.
- Part B: rock's comp pushes are switched off until the band can push together; jazz and blues keyboards, bossa and neo-soul push mid-bar changes an eighth early and tie over.
- Part B: a keyboard yields its register to the lead (a voice at or above the lead drops an octave, never below middle C), and a keyboard note below E3 may only be the foot of an open shell.
- Part B: a sustaining organ holds each chord to the next strike, releases at N.C. and at a bar it sits out, and re-presses a held chord only at a phrase top.
- Part B: the lead's ending behavior (EN-32 to EN-36) is implemented in the soloist; the band-level rule is stated here, the note choice ("resting tone nearest") is the soloist's.
- Part B: with no bassist the guitar's grips change (five strings, root on the bottom); there is a low-interval limit on the bottom two notes of the band.
- Part C: each style's ending color (EN-13), gesture (EN-22), swing, lean and humanize values are style data; they are repeated here only because the rhythm section's rules do not make sense without them.
- Part C: ska-punk's gear switch (DR-80) keys on the section label "chorus", not on energy alone.
- Part D: the chord-scale table that bass passing tones read (X-A-26), including the implied b9/b13 on a dominant resolving to minor and dorian on a minor tonic beside a major IV.
- Part D: three swing values and several pocket numbers were inherited from an earlier band's presets and then confirmed or changed by ear; the dates are in the project notes.
