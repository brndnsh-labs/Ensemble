# Music notes, part B: the chord (comping) player and the soloist

What the old band knows about comping and soloing, written for people who will never see the old band. Pitch names use middle C = C4 = MIDI 60. Rhythm grids are one bar of 4/4 in sixteenths, sixteen characters, beat 1 first: `x` an attack, `X` an accented attack, `-` the note held (in a strum grid, `-` is a muted scratch and is labelled as such), `.` silence. "Low / mid / high" means the band's energy tier (X-B-16). Probabilities are per decision, 0 to 1. Tags and confidence marks follow the governing brief.

Two generations of soloist and comper are described. "The last band" is the version that was playing at the end (September to November 2026). "The first band" is the note-at-a-time generator it replaced (to June 2026) and "the phrase-first soloist" is the intermediate rewrite of the soloist alone (June to September 2026). Unless a rule says otherwise it describes the last band.

## Cross-cutting rules

X-B-01. Register slots, lowest to highest: bass E1 to A3 (28 to 57) with its home around D2 (38); keyboard comp C3 to C6 (48 to 84) with its top voice aimed at C5 (72); steel or electric comp guitar E2 to A5 (40 to 81); nylon comp guitar E2 to G5 (40 to 79); soloist E3 (52) and up, per instrument (SO-01). No note of any player leaves its instrument's range. [property] (solid)

X-B-02. A keyboard chord played with one hand has no note below E3 (52); the only keyboard note allowed below E3 is the single lowest note of a two-handed open voicing, and the next voice above it must be a perfect 4th (5 semitones) or more away. [property] (solid)

X-B-03. When a bassist is playing, a comp guitar plays nothing below C3 (48), with one exception: the chord's root, fifth or written bass note may sit below C3 in a grip whose lowest note is the root or the written bass (it doubles the bassist on purpose). A third, seventh or tension below C3 is always wrong. [property] (solid)

X-B-04. Low-interval limits: the lower note of two adjacent chord voices must not sit below this pitch for the interval between them. Minor 2nd: E3 (52). Major 2nd: Eb3 (51). Minor 3rd: C3 (48). Major 3rd: Bb2 (46). Perfect 4th: Bb2 (46). Tritone: B2 (47). Perfect 5th: Bb1 (34). Minor 6th: G2 (43). Major 6th, minor 7th, major 7th: F2 (41). For most voicings this is a strong preference; for a guitar that is the band's lowest instrument (no bassist) it is binding on the two lowest voices. [property] for the guitar-as-bottom case, [metric] otherwise (solid)

X-B-05. The players hear each other in one direction only: drums play first, the bass hears the drums, the soloist hears drums and bass, and the comper hears all three before choosing a voicing or a rhythm. So the comper can react to the soloist's whole bar (it knows the notes that will sound over each chord before it places the chord), but the soloist never hears the comp and the drummer never hears anybody. [taste] (solid)

X-B-06. A chord change is an arrival for every pitched player: the bass note struck on the change is a chord tone, a soloist's note struck on the change is a chord tone, and a comp chord of two or more notes carries the chord's guide tones (X-B-09). [property] (solid)

X-B-07. The eighth-note rule for early notes, shared by comp and soloist: a note or chord struck within one eighth note before a chord change and still sounding over it belongs to the new chord (it is an anticipation, and must be made of the new chord's tones); a soloist's note struck earlier than that stops at the change instead of ringing into it. [property] (solid)

X-B-08. A held note a half step away from a chord tone, and not itself a chord tone, is a rub, not a colour (a flat 9th held over a minor seventh, a minor 3rd held against a major 3rd, a natural 4th held over a major chord). Notes longer than an eighth avoid these; a passing note of an eighth or less may brush them. [metric] (solid)

X-B-09. Guide tones: the 3rd and the 7th. A 6th chord's 6th stands in for the 7th. A suspended chord's 4th (or 2nd) stands in for the 3rd. A plain triad has one written guide tone, its 3rd; when a melody needs a second one, the triad's unwritten 7th is read from what the chord does: a diminished triad takes the diminished 7th, a major triad on the key's fifth degree (or any major triad off the tonic that falls a fifth to the next chord) takes the flat 7th, and any other triad takes the 7th its chord scale holds (the tonic's major 7th, a minor chord's flat 7th). The tonic triad moving to the IV stays a tonic, not a dominant of IV. [property] (solid)

X-B-10. Chord scale by quality and function, used for passing notes, colour tones and tension choice. Major: Ionian; Lydian on the IV of a major key, on the flat VI of a minor key, or when a #11 is written; Lydian augmented when the fifth is raised; a plain triad on V of a major key is Mixolydian (its major 7th would be a leading tone to V). Dominant: Mixolydian; Lydian dominant with a written #11; Mixolydian b13 with a written b13; whole tone with a raised fifth; half-whole diminished with a written b9 or #9 alone; Phrygian dominant with b9 and b13 over a natural fifth; altered with #9 plus b13 or a non-natural fifth, or b9 over #5. Dominant sus: Mixolydian without the 3rd, taking a written b9 or b13. Minor: Dorian by default (the ii of a major key, the iv of a minor key, anything chromatic); Phrygian on the iii of a major key; Aeolian on the vi of a major key, on the i and v of a minor key, or with a written b6; Dorian with a written 6th; melodic minor with a major 7th. Half-diminished: Locrian, or Locrian natural 2 when a 9th is written. Diminished: whole-half. Augmented: whole tone. Sus: Mixolydian without the 3rd (a sus2 takes the major pentatonic). Power chord: minor pentatonic. Any written chord tone the template lacks replaces the template tone a half step away. [property] (solid)

X-B-11. A dominant seventh with a natural fifth that resolves down a fifth to a minor-family chord implies the minor key's tensions even when the chart writes none: its scale becomes Phrygian dominant and voicings take b9 and b13 in place of 9 and 13 (G7 to Cm7 must never sound E natural). A written b9 or #9 keeps its own colour but still gets the b13; a written 13 or b13 wins. [property] (solid)

X-B-12. A minor tonic's mode is read from its neighbours: beside a major or dominant IV it is Dorian (Em7 beside A7: the C# is shared, never C natural over the Em7), beside a flat VI it is natural minor. [property] (solid)

X-B-13. Chord identity outranks everything else. The 3rd (or suspension), the 7th (or 6th) and any written alteration survive every thinning, register squeeze and energy level; the root and the perfect 5th are the tones to give up first, because the bass has the root. A written 9th, 11th, 13th or their alterations must be heard in the comp chord at least 90 percent of the time. No comp or soloist note may be a pitch class the chord symbol rules out. [property] (solid)

X-B-14. Figures belong to sections, not to bars. A comping figure, a strum pattern, a riff or a two-bar pattern is chosen once per written section and played every time that section returns; a head melody is keyed to the section's letter so every A is the same tune. Only improvised solo phrases are keyed to the time through the form. [style-data] (solid)

X-B-15. Players write on a straight sixteenth grid and never move their own notes in time. Swing is applied afterwards to every pitched player identically (the soloist gets exactly the swing the ride gets), then each lane gets one constant lean against the drums, which never lean. Leans that matter for these two seats, in milliseconds behind the beat (negative is ahead): jazz piano comp +8, jazz rhythm guitar -2 (with the walking bass), jazz soloist +10; blues comp +6 (guitar +2), soloist +8; neo-soul comp +25, soloist +25; hip hop comp +12, soloist +12; reggae comp +5, soloist +12; rock comp +3, soloist +4; funk comp -3, soloist 0; bossa comp -3, soloist +5; ska-punk comp -4, soloist -4; country comp +3 (guitar 0), soloist 0; disco comp 0, soloist +4; metal and acoustic 0. [style-data] (solid)

X-B-16. Energy is a number from 0 to 1 that changes density and dynamics, never tempo. Players read it as three tiers: low below 0.42, mid from 0.42 to below 0.70, high from 0.70. Every written velocity is multiplied by (0.72 + 0.4 x energy), so the same figure is played at 72 percent of its written level at energy 0 and 112 percent at energy 1. [property] (solid)

X-B-17. Human variation is small and settled: at full humanize a note moves at most 9 ms either way and its velocity at most 10 either way, and the timing offset is a function of where in the bar the note falls (so the same sixteenth leans the same way every bar and reads as a pocket, not as noise). A strummed chord moves as one gesture. [property] (solid)

X-B-18. Nothing pitched is struck under a written N.C., a pitch never overlaps itself within one player (a re-strike cuts the earlier note), and the soloist is one voice: each note ends before the next begins. [property] (solid)

X-B-19. Every random choice is tied to its place in the music (which section, which bar of the chorus, which time through), never to how many choices came before, so the same chart and seed give the same performance from any starting bar, and adding a new kind of decision does not change the others. [property] (solid)

## Chords (comping)

### What it does well

CH-01. The comp is one role played by one of six instruments: piano, Rhodes, organ, clavinet, steel or electric guitar, nylon guitar. A style supplies one rhythm book for keyboards and one for guitars; the instrument adds its range, whether it strums and whether it sustains. [style-data] (solid)

CH-02. Its strengths, as measured and as heard: every chord in the chart is always stated; chord identity is never lost; guitar chords are always fingerable; voice leading from chord to chord is smooth (the top voice moves 3.5 semitones or less on average at a change in jazz, blues, bossa and neo-soul; 2 or less in acoustic); it stays out of the bass's register; and since November 2026 it stays off the soloist's note. [metric] (solid)

### Which tones are played (voicing vocabulary)

CH-03. Close voicing (rock, country, acoustic, boogie piano, disco when quiet): root, 3rd and 5th of a triad; root, 3rd, 5th and 7th of a seventh chord. A written tension takes the 5th's seat in a seventh chord (Fmaj9 is F A E G); on a triad it joins the whole triad (add9 keeps root, 3rd and 5th). Only one written tension is voiced, chosen in this order on a dominant: b13, #11, b9, #9, 13, 9, 11; on any other chord: #11, b13, b9, #9, 9, 13, 11. A second written tension is left to the melody. [style-data] (solid)

CH-04. A written 11th over a major 3rd drops the 3rd (the two form a minor 9th), so the chord sounds as the suspension it is. [property] (solid)

CH-05. A dominant 7#9 is always root, 3rd, flat 7th, #9, with the #9 above the 3rd; a #9 voiced below the 3rd is a cluster and is heavily penalised. [property] (solid)

CH-06. Rootless voicing (jazz piano, blues piano, hip hop and neo-soul fallback, disco from mid energy): four notes in one hand. Major and minor sevenths: 3rd, 7th (or 6th), 9th, and the 5th (or a written 13th or #11 in its place). Dominants: 3rd, flat 7th, 9th, 13th, each replaced by its written or implied alteration. Half-diminished: flat 3rd, 11th, flat 5th, flat 7th (no root, no 9th). Diminished seventh: all four chord tones, in every voicing kind. A triad with no 7th or 6th: root, 3rd, 5th plus the 9th (or its written tensions). The inversions with the 3rd on the bottom and with the 7th on the bottom are the two standard forms. [style-data] (solid)

CH-07. Choice of 9th when the chart writes none: natural 9 if the chord scale has it; on a Phrygian minor seventh (iii in a major key) the 11th takes the 9th's seat (flat 3rd, 5th, flat 7th, 11th) because the flat 9 is an avoid note on a minor chord; a dominant whose scale has only the flat 9 takes the flat 9. Choice of 13th: natural 13 unless the scale has a flat 13 and no natural 13. [property] (solid)

CH-08. Three-note stab (funk keys and guitar, hip hop guitar, disco guitar): 3rd, 7th and 9th, the "E9" chord of funk; a dominant with a written 13th takes the 13th on top instead; half-diminished is flat 3rd, flat 5th, flat 7th; a plain triad is root, 3rd, 5th. [style-data] (solid)

CH-09. Shell (swing rhythm guitar, reggae and ska skank): root, 3rd and 7th (or 6th; on a triad the 5th); half-diminished adds its flat 5th (root, flat 3rd, flat 5th, flat 7th), the tone that tells it from a minor seventh. [style-data] (solid)

CH-10. Bossa drop-2: 3rd, 5th, 7th and 9th with the second voice from the top dropped an octave; a written b13, #11 or dominant 13 replaces the 5th; half-diminished keeps its root in place of the 9th. A plain major or minor triad is coloured as a 6/9 (3rd, 5th, 6th, 9th); a minor triad whose scale has no natural 6th takes the flat 7th instead. [style-data] (solid)

CH-11. Power chord (metal, punk): root, fifth and the root's octave, never inverted, whatever the chord quality; the fifth is the chord's own (a diminished chord gets the tritone); a chord whose fifth is raised (augmented, or an altered dominant) has no clean fifth and plays root and octave only. Over a slash chord the power chord still stands on the root, not the slash note. [style-data] (solid)

CH-12. Spread voicing, two hands, five notes (neo-soul and hip hop Rhodes on seventh chords): the left hand holds a two-note shell with its lower note between C3 and B3 (root and 7th, or 3rd and 7th either way up); the right hand stacks three colour tones in perfect 4ths, starting no more than a perfect 4th above the shell and never doubling a shell tone. Cmaj7: C3 B3 | E4 A4 D5. Dm7: F3 C4 | E4 A4 D5. G7: F3 B3 | E4 A4 D5. C7: E3 Bb3 | D4 G4 C5. Off a dominant, a stack note a minor 9th above a shell note is left out (Cmaj7 as E3 B3 | D4 G4). Chords with no three stackable 4ths (altered dominants, half-diminished, diminished) play the rootless voicing instead. [style-data] (solid)

CH-13. The colours a spread's right hand may draw from: the rootless voicing's tones, the root, the 3rd, the 5th (unless an altered 5th or 13th holds its seat), and the natural 13th on a major or minor chord whose scale owns it. [style-data] (solid)

CH-14. Styles that play jazz colour and styles that do not are kept measurably apart: the share of comp chords carrying a 9th or 13th is 0.5 to 1.0 in jazz, bossa, blues piano, funk, hip hop, neo-soul and loud disco, and 0 to 0.15 in rock, country, reggae, ska-punk and quiet disco. Neo-soul and hip hop keyboards share at most 30 percent of their seventh-chord voicings with the jazz piano (measured 5 percent). [metric] (solid)

### Where the tones are placed (keyboard voicing selection)

CH-15. Candidates are every inversion (rotation) of the chosen tones in close position, in every octave, with the lowest note at C3 or above and the highest at E6 or below. The comper picks the candidate with the lowest total penalty; there is no randomness in voicing. [property] (solid)

CH-16. The penalties, in comparable units: each note outside the instrument's slot 40; distance of the top voice from its target pitch 0.35 per semitone (target C5 for keyboards); movement from the previous voicing 0.5 per semitone per voice, voices paired from the bottom up; movement of the top voice an extra 0.6 per semitone; a minor 9th between any two voices 12; a minor 2nd between any two voices 8 in a voicing of four or more notes and 24 in a voicing of three or fewer; a #9 below the 3rd of a dominant 20; each adjacent pair of voices breaking its low-interval limit 10. Dominant chords are exempt from the minor-9th and minor-2nd penalties because their half-step rubs (7th against 13th, 3rd against b9) are their colour. [metric] (solid)

CH-17. Consequence of CH-16 that is worth keeping: the top note of the comp forms a mostly stepwise line across the changes, and a voicing only changes inversion when that is cheaper than moving every voice. Measured: the top voice leaps more than a 4th at 16 percent of changes for the two-handed Rhodes (27 percent when it was led from the bottom voice instead of the top). [metric] (solid)

CH-18. Between two spread voicings the hands are led separately: shell to nearest shell, and the right hand's stack matched to the next voicing's top voices from the top down. A one-hand voicing after a spread is led from the spread's right hand, so the top line keeps its place instead of dropping a 5th onto the left hand. [property] (solid)

CH-19. Measured register of the lowest comp note: jazz piano 58 to 64 (about C#4, measured 60.5); neo-soul and hip hop Rhodes 50 to 57; swing rhythm guitar 40 to 52; metal guitar 40 to 48; reggae, ska and hip hop guitar 52 to 67; country guitar 50 to 56. [style-data] (solid)

### Guitar

CH-20. A guitar chord is found on the fretboard, never placed on a keyboard and hoped playable: standard tuning (E2 A2 D3 G3 B3 E4), one note per string, on adjacent strings (a style may allow one muted string inside the grip), all fretted notes within a four-fret hand (three frets between lowest and highest), nothing above the 15th fret, pitch rising from string to string. Every guitar chord the band plays must pass this test. [property] (solid)

CH-21. A grip covers every tone of its voicing; when it has more strings than tones, only the root or the fifth is doubled. A chord too dense for the style's string count is played on exactly as many strings as it has tones before any tone is given up. Grips are then chosen by the same penalties as CH-16, with a style-set target top note and a style-set pull toward it. [property] (solid)

CH-22. Grip shapes by idiom. Swing rhythm guitar: three notes with the root on the 6th or 5th string, 7th and 3rd above, one muted string skipped (8x89xx), no open strings, range E2 to G4, top aimed at D4. Funk: three strings, top aimed at F#4, strong pull (0.8) so the hand stays in one position, no open strings. Reggae and ska skank: three strings high on the neck, G3 to A5, top aimed at C5. Disco: four strings, Bb3 to G5, top aimed at C5. Rock: four strings, D3 to G5, top aimed at G4. Bossa nylon: four strings plucked together, D3 to E5, top aimed at G4. Blues: four strings, D3 to E5, top E4, no open strings. Metal and punk: three-string power chords on the low strings, E2 to E4, top aimed at E3, very strong pull (2.0). [style-data] (solid)

CH-23. Open strings are forbidden wherever the idiom mutes by releasing the fretting hand (swing chunk, funk and disco scratch, reggae and ska chop, blues chop), because an open string would ring on through the release. They are welcome where chords ring (acoustic, country, rock). [property] (solid)

CH-24. Open-position acoustic guitar: where a chord has a shape with every fretted note at the 4th fret or below, it is played there (x32010, x02210, xx0232, 133211) and not wherever voice leading would drift. Up to six strings sound; each open string and each sounding string is rewarded (an open string is worth about 6 semitones of voice-leading movement, a sounding string about 4); the chord stands on its root or written bass; root, fifth and bass double freely, the 3rd may double once with one copy in the top two strings; a seventh chord may drop its perfect fifth over a bassist (C7 as x32310); no more than four fingers, a barre counting as one and never crossing an open string. Only the top string is voice-led from chord to chord. [style-data] (solid)

CH-25. With a bassist, an open G chord is 3x0003 (A string muted), not 320003, because the B2 on the A string is a 3rd inside the bass's register. [property] (solid)

CH-26. When no bassist is playing, the guitar becomes the band's bottom and changes shape: rock, blues and neo-soul play five-string root-position chords down to E2 (blues also plays low root-and-5th, 6th or flat-7th boogie pairs); bossa puts the root on the grip's bottom string and the thumb fills root and fifth between plucks; acoustic plays full open chords and a Travis thumb; country plays the boom of boom-chick itself. When the bass is merely muted because the user is the bassist, the guitar keeps its with-bass shapes. [property] (solid)

CH-27. The strumming hand is a pendulum on the grid it strums (eighths or sixteenths): down on the beat side of each pair, up on the offbeat side. Direction is therefore a function of position and is never chosen. Written velocities: accented stroke 100, downstroke 86, upstroke 72. An upstroke sounds only the top three strings of the grip. [property] (solid)

CH-28. A muted scratch is the same pendulum with the fretting hand released: half a sixteenth long, pitchless, velocity 50 on a downstroke and 36 on an upstroke. It deadens the grip the hand is holding at that moment; after an anticipation the hand already holds the next chord, so a scratch never jumps back to the old shape. [property] (solid)

CH-29. A strummed chord rolls across its strings: low string first on a downstroke, high string first on an upstroke, 6 ms between adjacent strings on steel or electric guitar and 3 ms on nylon (fingers plucking together barely roll). Keyboards do not roll at all. [style-data] (solid)

CH-30. A palm-muted stroke keeps its pitches but is short and dark (about 80 to 130 ms sounding); in metal 45 to 90 percent of strokes are palm-muted chugs and the open power chord rings only on accents. [style-data] (solid)

CH-31. A guitarist holds a grip until the next chord arrives and changes shape only then; a pianist re-voices every strike, each led from the one before. [taste] (solid)

CH-32. Fingerpicking (acoustic): at low energy the guitar picks instead of strumming, at high energy it strums, and at mid energy the section decides once (0.35 chance of picking). With a bassist the picking hand breaks the open grip into single notes; alone it plays a Travis pattern: the thumb on every beat (chord bass on 1, an upper string on 2, the alternate bass on 3, the upper string on 4; the alternate is the fifth, on a lower string than the upper note), fingers on the "and"s rolling the top strings in one of three orders chosen per section. Thumb velocity 74 on beat 1, 66 elsewhere; fingers 58. [style-data] (solid)

### Rhythm: how a bar of comping is built

CH-33. A style's book writes, for each chord in the bar, where the hand strikes, how long, how hard, and (guitar) stroke and mute. Shared rules then apply in this order: fermata, anticipation over the barline, anticipation of a mid-bar change, the guarantee that every chord is struck, the conversation with the soloist, sustain. [taste] (solid)

CH-34. Every chord the chart writes is struck at least once. If a figure skips a chord, a strike is added on the chord's arrival: one beat long (or to the chord's end), velocity 80, a downstroke on guitar; a scratch already sitting on that arrival gives way to it. A figure may skip beats, never a chord. [property] (solid)

CH-35. One hand, one chord: a new strike cuts whatever the comp was sounding. Nothing rings past a barline except an anticipation. The shortest comp note is half a sixteenth. [property] (solid)

CH-36. Anticipation over the barline (the push): when the bar's last strike falls in the last eighth of the bar, the next bar opens on a different chord that is struck on its downbeat, the strike plays the next chord early with the style's probability for the current energy tier, ties an eighth note into the next bar, and the next bar's own strikes in its first eighth are dropped. Never a muted scratch; never into a fermata, into the final held chord, or into a bar the comp sits out; on a sustaining organ never across the loop point back to the top. [property] (solid)

CH-37. Push probabilities (low / mid / high energy). Jazz piano 0.6 / 0.75 / 0.85; bossa piano and guitar 0.6 / 0.7 / 0.75; blues piano 0.3 / 0.4 / 0.5; neo-soul Rhodes 0.1 / 0.25 / 0.35; neo-soul guitar 0 / 0.1 / 0.2; disco keys 0 / 0.3 / 0.5; disco guitar 0 / 0 / 0.15; funk keys 0 / 0.15 / 0.25; funk guitar 0 / 0.1 / 0.2; acoustic guitar 0 / 0.2 / 0.3 (strummed bars only); blues guitar 0 / 0 / 0.2; swing rhythm guitar 0.15 / 0 / 0; hip hop Rhodes 1 / 1 / 1 (a chopped loop pushes the same way every time round); rock, country, reggae, ska-punk, metal, hip hop guitar 0 at every tier. [style-data] (solid)

CH-38. Rock keys and guitar never push because in rock a push is an ensemble hit (kick, bass and chords together), and a comp that pushes alone puts the new chord over the old bass note. The old band could not make the whole band push, so rock pushes were switched off, not designed out. [taste] (solid)

CH-39. The jazz pianist sets its own push up: when the chord changes over the barline, an extra strike is added on the "and" of 4 with probability 0.25 / 0.4 / 0.45 (low / mid / high), and that strike then becomes the new chord early by CH-37. The figure is never moved to make room; the strike is added. Result: 34 percent of all chord changes are anticipated at default energy (21 percent low, 39 percent high; 3 percent before this rule existed). Target range 25 to 45 percent: a comper lets some changes land on the beat. [style-data] (solid)

CH-40. Anticipating a mid-bar change (jazz and blues piano, bossa piano and guitar, neo-soul Rhodes, swing guitar at low energy only): any strike in the eighth before a change inside the bar plays the new chord and ties over the change, the new chord's own strikes in its first eighth are dropped, and the pushed strike takes over the length of the longest strike it replaced (a stab stays a stab, a held chord stays held). The comp must never stab the outgoing chord an eighth before a change, and must never strike a pushed chord again on the beat ("ba-DAHM"). Before this rule the jazz piano stuttered into 14 percent of mid-bar changes and the blues piano into 96 percent. [property] (solid)

CH-41. The exception to CH-40 is a figure that hammers every eighth (the boogie piano pump, the neo-soul guitar's picked line): the eighth before the change plays the new chord and the hand strikes it again on the beat, because a hole on the beat would break the pump. [style-data] (solid)

CH-42. A fermata is one chord struck on its beat and held for the fermata's length, velocity 84, the whole band together; it is never anticipated. [property] (solid)

CH-43. Jazz piano figures, one drawn per chord per bar from a weighted list (positions in sixteenths, weight in brackets): Charleston, beat 1 and the "and" of 2 `x.....x.........` [4]; the "and" of 2 alone `......x.........` [3]; reverse Charleston, the "and" of 1 and beat 3 `..x.....x.......` [2]; beat 1 alone [2]; beat 2 and the "and" of 3 `....x.....x.....` [2]; the "and" of 2 and the "and" of 4 `......x.......x.` [2]; the "and" of 1 and the "and" of 2 `..x...x.........` [1]. A chord lasting two beats draws from: on the chord [3], on its "and" [2], both the chord and the "and" of its second beat [1]. Each strike is a short stab (a dotted sixteenth long) or, with probability 0.5 at low energy and 0.25 otherwise, held to the end of the chord. On-beat strikes are written at velocity 78, off-beat strikes at 88. At high energy a bar-long chord gets one more stab on the "and" of 3 or the "and" of 4 with probability 0.4. At low energy a chord tied in from the previous bar gets no strikes at all. [style-data] (solid)

CH-44. Swing rhythm guitar (Freddie Green): four to the bar at mid and high energy, beats 1 and 3 longer and softer (0.6 of a beat, velocity 70), beats 2 and 4 short and leaned on (0.3 of a beat, velocity 86); the long-to-short length ratio stays between 1.5 and 3; it never anticipates. At low energy it comps sparsely like the piano. [style-data] (solid)

CH-45. Bossa figure, two bars, the same for guitar and piano (it is the guitar's pattern, which the piano borrowed). Either `x.....x...x.....` then `....x...x.....x.`, or `x.....x.....x...` then `....x.....x...x.`, chosen per section; the last strike of the second bar is the classic anticipation of the next bar. A mid-bar chord with no figure strike within an eighth of it gets one on its arrival. At low energy the second strike of each bar is dropped. On-beat strikes velocity 74, off-beat 82, each up to three sixteenths long. [style-data] (solid)

CH-46. Funk keyboard stabs: one of four one-bar riffs per section (`..x..x.x...x.x..`, `.x..x..x.x..x...`, `..x...x...x..x.x`, `x..x..x...x.x...`), each stab just under a sixteenth long, velocity 98 on the "and"s and 88 elsewhere. Low energy keeps only the stabs on the "and"s; mid energy drops one stab, the same one in every bar of the section; high energy plays the whole riff. [style-data] (solid)

CH-47. Funk guitar: the hand never stops. One of three sixteenth-note lines per section mixing chord stabs and muted scratches (stabs `x`, accents `X`, scratches `-`, hand passing `.`): `-.-xX-x--.-xX-x-`, `x--x--x--x-xX-x-`, `--x-X--x-x--X-x-`. A stab sounds for under a sixteenth. Low energy plays the stabs only; mid energy keeps scratches on the eighths only; high energy scratches every remaining sixteenth at velocity 40. Scratches are 30 to 80 percent of strokes (disco 60 to 85 percent). [style-data] (solid)

CH-48. Rock keyboard: low energy one sustained chord per change (velocity 80, or 64 when re-struck at a barline on a held chord); mid energy quarter notes; high energy eighth notes; beats written at 92, offbeats at 76, each note 85 percent of its slot. Rock guitar: low energy one ringing downstroke per chord; mid energy one of two strum lines per section, backbeat accented (`x...X.x...x.X.x.` or `x...X...x.x.X.x.`); high energy driving eighth-note downstrokes (velocity 104 on beats 2 and 4, 92 on beats 1 and 3, 80 on the "and"s). At most 35 percent of rock comp strikes are off the beat. [style-data] (solid)

CH-49. Acoustic strum lines (eighth-note pendulum). Mid energy: `x...x.x...x.x.x.` (weight 3), `x...x.x.x...x.x.` (2), `x...x.x.x.x.x.x.` (1). High energy: `x...X.x...x.X.x.` or `x.x.X.x.x.x.X.x.`. Strums ring until the next stroke (never choked). A chord arriving mid-bar is struck where it arrives even if the line passes there. In other meters: down on each pulse, up on its last eighth. [style-data] (solid)

CH-50. Blues piano figures, one per section per energy tier (positions in sixteenths). Low: beat 1 held [weight 3]; beat 1 and the "and" of 4 [2]; Charleston [1]. Mid: chops on 2 and 4 [3]; Charleston [2]; the "and" of 2 and the "and" of 4 [2]; beat 2, the "and" of 3, the "and" of 4 [1]. High: every swung eighth, long on the beat (velocity 84) and short and light on the "and" (66), which is the boogie pump and switches the voicing to plain triads and 6ths [2]; beats 2 and 4 and the "and"s after them [2]; beat 1 and three "and"s [1]. Blues rhythm guitar with a bassist chops on 2 and 4 with a muted scratch on the following "and" (`....X.-.....X.-.`), damped at once. [style-data] (solid)

CH-51. Neo-soul Rhodes holds its chords for beats and re-strikes lazily off the beat. Figures per section (`-` held): low `x-------------..`, `x--------.x-----`, `.x------------..`; mid `x-----.x------x-`, `.x-------.x---x-`, `x--...x-----.x--`; high `x--x---x--x---x-`, `.x----x---x--x--`, `x-----.x--x---.x`. On-beat strikes are laid in softly (72), off-beat ones lean (80). No more than 25 percent of its strikes are short. Two to 4.5 strikes a bar. [style-data] (solid)

CH-52. Strike counts per bar that tell the idioms apart: hip hop Rhodes and guitar 1 to 3.5; held blues organ pad 1 to 1.6; metal 0.8 to 3.2 ringing chords, or every eighth downpicked when driving; reggae 1.8 to 4.5; neo-soul 2 to 4.5; swing guitar 3 to 4.2; funk guitar 8 to 16; disco guitar 13 to 16. Reggae and ska never strike on beats 1 or 3 (at most 5 percent). Share of strikes off the beat: disco 0.85 to 1.0, reggae 0.75 to 0.95, funk 0.6 to 1.0, neo-soul 0.5 to 0.9, blues piano 0.3 to 0.8, rock 0 to 0.35, swing guitar 0 to 0.2. [style-data] (solid)

CH-53. Articulation by idiom: funk, disco, hip hop, reggae and ska strikes are damped at once (90 percent or more are short); blues chops are damped at once; neo-soul chords ring; jazz piano mixes short stabs with held chords; rock at low energy rings to the next change. [style-data] (solid)

CH-54. In any meter other than 4/4 the books fall back to plain patterns on the meter's pulses (a strike or held chord per pulse). Only 4/4 is idiomatic. [taste] (solid)

### Sustain: the organ

CH-55. A sustaining instrument presses once per chord (on the arrival, or on a push just before it) and holds until the next press, across barlines; the style's comping rhythm is ignored. It lets go at an N.C. and at any bar the comp sits out. Re-striking a held organ chord on every comping hit was heard as "distinct beats", a stutter. [property] (solid)

CH-56. A chord the organ has held for a full bar or more is pressed again, in the same voicing, at the first bar of each phrase (phrases are three to six bars), so no chord is held silently through a long vamp and the top of every time round the form is articulated. A chord struck after the previous bar's downbeat is too fresh to press again. [property] (solid)

CH-57. The organ never presses the same chord twice within an eighth (a figure with two strikes in the push's eighth is one press), and its voicing never drops or blinks a voice for the soloist's sake. [property] (solid)

CH-58. A style can declare its figure "percussive", which makes even the organ play it short as written: the reggae bubble and the ska organ skank are chopped, never held. [style-data] (solid)

### With a soloist

CH-59. The comp leaves the soloist its note. Each voicing or grip is chosen with an extra penalty for every comp voice on a pitch the soloist will sound over that chord: 26 for a unison and 7 for an octave, each multiplied by the share of the chord's sounding time that soloist note fills (so a passing sixteenth barely counts and a held note decides the voicing). 26 was tuned: at 14 the keyboards sat on the soloist's note 12 to 24 percent of the time, at 30 they began leaping an octave to escape. [metric] (solid)

CH-60. What the search cannot clear, the strike leaves out: a comp voice on the soloist's exact pitch for half the strike's length or for a full beat is omitted, top voice first, but never a guide tone, never the bottom voice, and never below two sounding voices. An open-position strum gives up only its top string. The organ gives up nothing. [property] (solid)

CH-61. A strummed three-string chord whose guide tone the soloist holds for the whole strike becomes a two-note double stop of the other two strings, provided they include the other guide tone (the 3-7-9 grip under a sax holding the 3rd plays 7 and 9). [taste] (solid)

CH-62. Target: the share of the time the soloist sounds over the comp during which some comp voice is on the soloist's exact pitch is at most 15 percent (it was 19 to 55 percent before CH-59 and CH-60, at most 12 percent after). Octave doublings are not counted. [metric] (solid)

CH-63. The comp gives the soloist its register: while a soloist's note sounds, any keyboard voice at or above the lowest sounding soloist pitch (or within a half step below it) drops an octave, provided it does not go below middle C, does not land on a pitch the soloist is playing, does not land on a pitch already in the chord, and does not go beneath the chord's own bottom note. A voice that cannot drop is left out only if another voice staying in the chord doubles it. A guitar grip is a hand shape and never changes for this. [property] (solid)

CH-64. Under a soloist a keyboard never takes a voicing with any note outside E3 to C6. [property] (solid)

CH-65. The two-handed keyboard closes up for the soloist by phrase, not by strike: a spread voicing is replaced by the compact rootless voicing for every bar in which the soloist's phrase is "live", meaning a soloist note sounds in this bar or sounded in the bar before. The hands open again only after a whole bar of silence, and are chosen once for the whole bar so a chord struck twice in a bar never changes hands. Deciding strike by strike flipped the top of the comp an octave up and down on alternate downbeats (15 to 25 percent of consecutive strikes; under 1 percent with the phrase rule). [property] (solid)

CH-66. While the phrase is live, the styles that spread (neo-soul, hip hop keyboards) keep the whole voicing under the line: the top comp note is a whole step or more below the lowest soloist note sounding over the strike. If no full voicing fits, play as many voices as fit while keeping both guide tones; if even that does not fit, play the bare two-note shell (3rd and 7th) with its lower note between C3 and B3. Under this cap no voicing may have a minor 2nd between its two lowest notes, except on a dominant from E4 up (the 13th under the 7th is a colour in the middle of the keyboard and a growl over the bass). Result: comp notes at or above the soloist's line fell from 5 to 11 percent to 0.1 percent. [property] (solid)

CH-67. Whether every other keyboard style should also keep wholly under the soloist, at the cost of its register, was left undecided. [taste] (unclear)

CH-68. Conversational comping exists only for the jazz piano, the neo-soul Rhodes and the blues piano's rootless comp. Strummed and chopped grooves (funk, rock, reggae, disco, ska, country, metal, all guitars) and the organ keep their figure unchanged under a soloist. With the soloist off nothing changes. [style-data] (solid)

CH-69. Laying out: a comp strike that falls while a soloist note is sounding is dropped with the style's probability (jazz 0.6, blues 0.45, neo-soul 0.4), except a chord's first strike and any anticipation, which always stay. On the Rhodes the strike before the dropped one rings on through it, so the comp leans back instead of going silent. [style-data] (solid)

CH-70. A floor keeps the time: the jazz piano never lays out below two strikes in a bar (an anticipation counts as a strike). Without the floor 41 percent of bars under a solo had a single strike and the owner heard the piano as thin; with it, 19 percent (target at most 21 percent). [metric] (solid)

CH-71. Answering: a breath is six sixteenths (a dotted quarter) or more with no soloist note sounding; silence before the barline counts toward a breath that continues after it; a bar the soloist sits out straight after playing counts as a breath, but a longer rest (the soloist resting by form) does not. If the comp's own figure already has a strike inside the breath, that strike is played 8 velocity steps louder. If the breath is empty, a stab is added with the style's probability (jazz 0.9, blues 0.6, neo-soul 0.5): on the first offbeat eighth (an "and") that is at least an eighth after the soloist lets go, at least a quarter note clear of every other comp strike (an "and" straight after a struck beat is a stutter, not an answer), and not in the eighth before a chord change (that eighth belongs to the new chord). The stab is an eighth long at most, written velocity 92. [style-data] (solid)

CH-72. Measured targets for the conversation (jazz, under a solo): comp strikes per sixteenth in the soloist's breaths divided by the same under the line 1.1 to 2.0 (measured 1.15 to 1.34; 0.87 with no conversation); share of breaths containing a strike the comper chose 0.4 to 0.7 (measured 0.48); answers louder than strikes under the line by 1 to 12 velocity steps (measured 3); strikes per sixteenth under the line 0.10 to 0.13. Funk, a groove, must stay at 0.7 to 1.0 on the first ratio (its figure does not react). [metric] (solid)

CH-73. The jazz drummer cannot hear the piano (X-B-05), so to "comp with the piano" the snare reads the chart the same way the pianist does and plays where the piano's figures are likely to strike (the Charleston's "and" of 2, the "and" of 4 before a change, the upbeats of a two-chord bar). Measured: 51 percent of snare comping strokes inside a phrase coincide with a piano strike (29 percent when the snare chose its spots independently). [metric] (solid)

### Endings (the comp's part only)

CH-74. On the final held chord the comp strikes its whole voicing (nothing is left out for the soloist) at written velocity 92, or 72 in a soft ending; a short accented final hit is 12 louder than the held chord; a guitar plays it as a downstroke. The comp never anticipates the final chord. A two-handed keyboard spreads on the final chord whenever a spread fits wholly under the soloist's last note. [property] (solid)

### Known weaknesses

CH-75. Comping rhythm has no phrase. In jazz the figure is drawn fresh for every chord of every bar from seven one-bar cells; nothing relates bar 2 to bar 1, there is no two- or four-bar comping idea, no build toward a phrase end, and no memory of what was just played. A listener hears correct, well-placed stabs that never add up to a part. Bossa (a fixed two-bar figure) and the section-scoped riffs (funk, neo-soul, blues) repeat exactly instead; nothing sits between "random per bar" and "identical every bar". [taste] (solid)

CH-76. The comp does not lock with the drums. The drummer plays before the comper and cannot hear it; the comper hears the drums but no comp book reads them. Any coincidence of comp stabs with kick or snare accents comes from both being written against the same grid (backbeat chops with the snare, CH-73's guess). No shared accent plan exists, which is also why rock cannot push (CH-38). [taste] (solid)

CH-77. The voicing is greedy and local: each chord is voiced only from the previous one, with no look ahead to where the progression is going and no planned top-voice melody. The top note is whatever the penalties produce, pulled weakly (0.35 per semitone) toward C5. Register can drift for several bars and then correct with a leap. [taste] (solid)

CH-78. Voicing size does not respond to energy or to the soloist except in special cases (disco plain when quiet and lush from mid energy; blues triads for the pump; the spread closing up). A quiet jazz chorus and a loud one use the same four-note shapes; only the rhythm and velocity change. [taste] (solid)

CH-79. Rhodes and clavinet play the piano's part exactly (they differ only in sound), and the organ differs only by holding. Distinct keyboard idioms (a rolled Rhodes chord, clavinet sixteenths, organ swells) were never written. A rolled Rhodes chord was wanted and blocked because rolling was only available to strummed instruments. [taste] (solid)

CH-80. The conversation with the soloist is a set of independent coin flips per strike and per breath (CH-69, CH-71). It thins under sound and stabs in holes, but it does not echo the soloist's rhythm, does not answer a question phrase differently from an answer phrase, and does not build with the solo's arc. The first band had an explicit "the comper catches the soloist's question" gesture and a rock "catch the soloist's peak" hit; neither survived into the last band. [taste] (solid)

CH-81. Comp dynamics are per-strike constants scaled by energy; there is no dynamic shape across a phrase. [taste] (solid)

CH-82. Country piano fills (honky-tonk answers) were identified as a missing idiom and never built. [taste] (solid)

## Soloist

### What it does well

SO-01. Soloist instruments and their comfortable solo registers (the extreme ends are kept for climaxes): alto sax F3 to Bb5 (53 to 82), home G4 (67); trumpet G3 to Bb5 (55 to 82), home A4 (69); clean electric guitar G3 to D6 (55 to 86), home A4 (69); overdriven guitar G3 to E6 (55 to 88), home B4 (71); nylon guitar E3 to A5 (52 to 81), home F#4 (66). Horns scoop and fall off; guitars bend, release and slide. [property] (solid)

SO-02. What reliably works, by measurement across every style: 72 to 100 percent of notes on a beat are chord tones; 85 to 100 percent of phrases end on a chord tone; every note struck on a chord change is a chord tone (this one is a hard rule); leaps wider than a fifth are 5 percent of moves or fewer; four-note trills (a-b-a-b) are 4 to 5 percent of runs or fewer; the third solo chorus has 1.5 to 4 times the notes of the first; the highest note of a three-chorus solo is in the third chorus 85 to 100 percent of the time; a head comes back note for note. [metric] (solid)

SO-03. The laws the last band's soloist was built on, carried over from the earlier soloists as lessons: a phrase is planned whole before any note is chosen; rhythm is chosen before pitch; strong beats land on chord tones and a chord change lands on a chosen target tone by rule, never by weighted chance; motifs belong to phrases and sections, not to single notes; expression devices take turns and do not stack on one note; there is one peak note per solo. [taste] (solid)

### Form: what the soloist is for

SO-04. The soloist is off unless asked for (someone practising wants the band, not a soloist). The first time through the form it plays the head; if the song loops, it solos for three choruses and brings the head back on the fourth (head, solo, solo, solo, head, and so on). It rests through an intro. A section labelled "Solo" is a solo on any pass. A performance with a counted number of choruses ends on the head, and the chorus before that is the wind-down solo chorus, never a second head. [property] (solid)

SO-05. The three solo choruses are one arc. Chorus 1: first half sparse and centred 3 semitones below home, second half medium and 1 below home. Chorus 2: first half medium at home, second half busy and 2 above home. Chorus 3: busy and 3 above home; its second-to-last phrase is the peak (a climbing phrase ending on the solo's one top note, held for a dotted half); its last phrase winds down (medium density, at home, falling) so the head can return. [style-data] (solid)

SO-06. The band's energy tier moves the arc's density one step (low energy one step sparser, high energy one step busier), except that the peak phrase is never made sparser. Energy does not move the soloist's register. [property] (solid)

SO-07. Where a style sits the soloist: home is the instrument's home raised by the style's offset (acoustic +5, disco +4, neo-soul +4, reggae +4, hip hop +3, others 0) so the soloist plays over the comp's register and not inside it. The top note of the peak is one semitone under the instrument's top unless the style caps it (hip hop 9 semitones above home, reggae 10, bossa 11, acoustic 12: "a lift, not a scream"). No non-peak phrase can reach higher than a minor 3rd below that top note, so the peak really is the top. [style-data] (solid)

### Phrases and space

SO-08. The unit of planning is the form's phrase, normally four bars (three to six). Each bar of a phrase is one of three kinds: a line bar (carries the line), an end bar (a short figure that lands on a long note: an arrival), or a rest bar. [property] (solid)

SO-09. Solo phrase shapes and their weights, by density (L line, E end, R rest). Sparse: L E R R (3), R L E R (3), E R L E (3), L L E R (2). Medium: L L E R (5), E R L E (3), L E L E (2). Busy: L L L E (4), L L E R (4), L E L E (2). The shapes with an end bar in the middle are the call-and-answer shapes: two short statements with a breath between. A longer phrase adds line bars at the front; a shorter one is cut but keeps an end bar. The peak phrase is always L L L E. [style-data] (solid)

SO-10. Limits on silence, set after the owner heard the first audition's rests as too long (13 to 27 percent of breaths were two bars or more, the longest over six bars): a phrase leaves at most one empty bar; only the very first phrase of a solo may leave two; a phrase that follows an empty bar must start on its first bar; no phrase rests whole. Target: breaths of two bars or more are at most 12 percent of all breaths in a solo and at most 2 percent in a head. [metric] (solid)

SO-11. A style's "space" value (metal 0.12, ska-punk 0.15, disco 0.2, jazz, rock and country 0.25, funk, blues, hip hop and acoustic 0.3, bossa 0.35, neo-soul and reggae 0.45) acts twice: it is the chance that a medium or busy phrase takes a shape from the next sparser list (keeping its busier rhythm cells), and each rest bar in a shape multiplies that shape's weight by (space / 0.25). Resulting share of empty bars in a solo: metal 0.10 to 0.20, ska-punk and disco 0.10 to 0.35, jazz, rock and blues 0.20 to 0.50, neo-soul and reggae 0.22 to 0.50. [style-data] (solid)

This band, since 2026-11-17: the shares of empty bars above are the last band's and are not what this band plays, at its default or at any setting. Brandon heard the soloist as "a little sparse ... makes sense to ramp things up" and then passed the busier one and the range of its setting ("i agree with your defaults, the range seems really good"; ear cases `soloist-a-little-sparse` and `busier-soloist-defaults-and-range` in `scorecard/ear-cases.json`, and `soloist-changes-awesome` on 2026-11-19). The space values are still the ones above, and they act in full only at the bottom of the player's setting (`soloDensity` 0). At the default (0.5) each style gives up a share of that room (blues, funk and acoustic 0.3; jazz, rock and disco 0.4; neo-soul and reggae 0.2) and lifts every other phrase or so a level. The measure is `solo.empty-bars`: of the bars of the solo's phrases, the share with no note struck in them, where a pickup and a note in a bar's last beat belong to the next bar and a note tied over the barline plays in the bar it is held into. Per style, the mean over the scorecard's takes with a soloist (one take in ten below, one in ten above), then the mean at `soloDensity` 0 and at 1 (48 takes each, counted 2026-11-20):

| Style | SO-11 (last band) | Default: mean (p10 to p90) | At 0 | At 1 |
| --- | --- | --- | --- | --- |
| Blues | 0.20 to 0.50 | 0.09 (0 to 0.17) | 0.13 | 0.04 |
| Jazz | 0.20 to 0.50 | 0.09 (0.03 to 0.15) | 0.14 | 0.03 |
| Rock | 0.20 to 0.50 | 0.12 (0.03 to 0.20) | 0.18 | 0.06 |
| Funk | not given | 0.14 (0.04 to 0.23) | 0.17 | 0.07 |
| Disco | 0.10 to 0.35 | 0.14 (0.06 to 0.21) | 0.20 | 0.08 |
| Neo-soul | 0.22 to 0.50 | 0.15 (0.02 to 0.23) | 0.20 | 0.10 |
| Reggae | 0.22 to 0.50 | 0.11 (0.06 to 0.20) | 0.15 | 0.07 |
| Acoustic | not given | 0.16 (0.06 to 0.23) | 0.19 | 0.10 |

Even the sparse end of the setting leaves fewer empty bars than the last band did (only disco's sits inside its old range), so the old figures are not "this band turned down": read them as history. The blues' target for `solo.empty-bars` (0.05 to 0.30) is the band's; a solo with 0.09 of its bars empty is the default he chose, not a fault.

SO-12. Phrase register: a sparse phrase's contour travels 6 semitones, a medium phrase's 9, a busy phrase's 12; all of a phrase's notes stay within that span plus 3 semitones either side of the phrase's centre, inside the instrument. A line that reaches the edge of its register turns round; it does not pin against the edge. [property] (solid)

SO-13. Contours and their weights: arch 4, fall 3, climb 2, wave 2. An arch starts a third of its span below centre, peaks two thirds of its span above centre in the middle and returns; a fall runs from half a span above centre to half a span below; a climb is the reverse; a wave is one full up-and-down cycle of half a span either side. The wind-down phrase always falls and the peak phrase always climbs. The contour is measured by note count, not by time. [style-data] (solid)

SO-14. Phrases connect: a phrase's first note is pulled halfway from its contour's starting pitch toward the last pitch the soloist played, and a phrase never comes to rest on the same pitch the previous phrase ended on (a first chorus that settles on the same F every time the Dm comes round has stopped going anywhere). [property] (solid)

### Rhythm vocabulary

SO-15. Rhythm is the style's dialect, written as one-bar cells on the sixteenth grid: four or five cells for each density (sparse, medium, busy), four to six ending cells, and a separate set of head cells and head endings. A line bar plays one cell; an end bar plays an ending cell. An ending cell always finishes on a long note. [style-data] (solid)

SO-16. Jazz (bebop alto) cells as the model. Sparse: `..x-x-x-----....`, `x-x---x-----....`, `....x-x-x-------`, `x---..x-x---....`, `..x-----x-x-x---`. Medium: `x---x-x-x-----..`, `..x-x-x---..x-x-`, `x-x-x-----..x-x-`, `....x-x-x---x---`, `..x---x-x---....`. Busy: `x-x-x-x-x-x-x-x-`, `..x-x-x-x-x-x-x-`, `x-x-x-x-x-x-x---`, `....x-x-x-x-x-x-`, `x-x-x---x-x-x-x-`. Endings: `x-x-x-------....`, `..x-x-x-----....`, `x-x---..........` (the "doo-dat"), `x---x-------....`, `..x-x-x-x-------`, `x-------........`. Bebop lines start on an upbeat as often as on a beat. [style-data] (solid)

SO-17. Other dialects in one line each: rock is quarter and eighth figures with sixteenth bursts only when busy (`x-x-xxxxx-x-x---`) and long held endings; funk is clipped sixteenth stabs with rests inside every bar (`x..x..x.x.x.....`), 40 to 85 percent of the sixteenths in a playing bar silent; hip hop is a sparse hook, 1.8 to 3.5 notes a bar; reggae enters after beat 1 (a phrase starts on beat 1 at most 35 percent of the time) and holds long notes; ska-punk punches the "and"s (55 to 80 percent of attacks off the beat); metal is gallops and continuous sixteenths, 4.5 to 9 notes a bar; bossa strikes the "and"s (40 to 65 percent of attacks) and holds; neo-soul enters late (58 percent or more of phrases) and pushes on sixteenths. [style-data] (solid)

SO-18. Within a phrase each line bar draws its cell independently from the density's list, except that with the style's "riff" probability a bar plays the bar before it again, rhythm and pitches (moved only where the chord moved). Riff probability: jazz 0.08, neo-soul 0.15, bossa 0.2, acoustic 0.25, blues, country and disco 0.35, rock 0.4, reggae, metal and ska-punk 0.45, funk 0.5, hip hop 0.7. [style-data] (solid)

SO-19. The soloist is one voice: a note never outlasts the next note or its phrase, and the shortest note is half a sixteenth. In the last bar of a performance that ends, the soloist plays one long note. [property] (solid)

### Pitch: targets first, then the line between them

SO-20. Targets are fixed before any other pitch: the phrase's first note, its last note, every note that falls on or anticipates a chord change (even after a rest), and every note followed by a beat or more of silence. Each style ranks where a change lands (its "arrive" tones) and where a phrase rests (its "settle" tones). The last note of a phrase takes a settle tone; every other target takes an arrive tone. [property] (solid)

SO-21. A target is the ranked tone nearest the contour's ideal pitch at that point, where each step down the ranking costs 1.25 semitones (a better-ranked tone wins unless the next one is more than a step closer to the contour). A target never repeats the note immediately before it. A target more than a major 6th (9 semitones) from the previous target is moved an octave closer when that stays in the phrase's register. [metric] (solid)

SO-22. Arrive and settle rankings by style. Jazz, bossa, disco, hip hop, acoustic arrive on 3rd, 7th (or 6th), then a written tension, 5th, root. Blues and country arrive on 3rd, root, 7th, 5th (over the IV the 3rd is the note that says the chord moved). Rock, funk and ska-punk arrive on 5th, 3rd, 7th, root last (a soloist that lands on the root at every change is the bass line up an octave). Metal arrives like rock, but on the leading tone first over the V of a minor key. Neo-soul arrives on 3rd, written colour, 7th, 5th, root. Reggae arrives on 3rd, root, 5th. Settle: jazz, blues, country, disco, hip hop, acoustic on 3rd, root, 5th (then a 6th); rock, funk, reggae, ska-punk, metal on root, 5th, 3rd; bossa on 3rd, then major 7th or 6th, written 9th, #11 or 13th, then 5th, root last (never a dominant's flat 7th or an altered 9th); neo-soul on a written 9th first, so phrases float. [style-data] (solid)

SO-23. Measured consequence of SO-22: the share of chord changes landed on a 3rd or 7th is 0.6 to 1.0 in jazz, bossa, disco and acoustic, 0.55 to 0.95 in neo-soul, 0.4 to 0.85 in blues and country, 0.2 to 0.55 in rock; the share landed on root or 5th is 0.4 to 0.85 in rock, funk, metal and ska-punk. [style-data] (solid)

SO-24. The notes between two targets walk from one toward the other through the style's note pool. About 1.8 semitones per note is a scale run's pace. With more notes than the distance needs, the line overshoots and comes back (by up to a perfect 5th) instead of repeating itself; with fewer notes than the distance needs (over 2.6 semitones per note) it skips through chord tones as an arpeggio. [metric] (solid)

SO-25. Each walking note is the pool note nearest its ideal pitch, with three corrections: it is never the same pitch as either of the two notes before it (returning to the note two back is a trill); on a beat, a chord tone up to 1.5 semitones further away beats a passing tone; a note longer than an eighth that would rub (X-B-08) counts as 3 semitones further away. [metric] (solid)

SO-26. The note before a target is its approach, chosen in this order. If it is longer than an eighth it steps in from the scale step beside the target, or from a chord tone about a 3rd away if that step would rub or would repeat the previous target. Else, with the style's enclosure probability (needs two short notes, the last one off the beat): the scale step above the target, then the half step below, then the target. Else, with the style's chromatic probability (only a short note off the beat, and only if the leap into it is a major 3rd or less): the half step below the target, or the half step above when the line is falling and that note is in the scale. Otherwise: the scale step beside the target on the side the line comes from. [property] (solid)

SO-27. Chromatic approach and enclosure probabilities: jazz 0.45 and 0.25; neo-soul 0.3 and 0.12; funk 0.25 and 0.05; country 0.25 and 0.05; blues 0.2 and 0.05; metal 0.2 and 0.15; bossa 0.15 and 0.08; disco 0.15 and 0.05; ska-punk 0.15 and 0.05; rock 0.1 and 0; reggae 0.1 and 0; hip hop 0.1 and 0; acoustic 0.05 and 0. In a head the chromatic chance is multiplied by 0.3 and enclosures are off: a tune steps into its chords. Measured share of change landings approached by an out-of-scale half step: jazz solo 0.18 to 0.6 (0.21 measured), heads 0 to 0.1. [style-data] (solid)

SO-28. A single sixteenth flicked into a longer note is a grace note from the scale step below, never a leap. After the whole line is written, any a-b-a-b trill that an approach note completed is broken by re-choosing its free middle note. [property] (solid)

SO-29. Note pools by style. Jazz: the chord scale plus one bebop passing tone that puts chord tones on the beats of an eighth-note run, added only over the mode it belongs to (the major 7th over a Mixolydian dominant, the major 3rd over a Dorian minor, the #5 over a major chord with a 6th and major 7th in its scale). Bossa: the chord scale. Blues: the key's blues scale (1, b3, 4, b5, 5, b7) plus the chord's own tones. Rock: the key's pentatonic (major pentatonic in a major key, minor in a minor key) plus the chord's own tones, plus the blue third. Funk and major-key hip hop: the chord scale plus the key's minor pentatonic. Disco, neo-soul, ska-punk: a pentatonic built on each chord's own root (major chord 1 2 3 5 6; dominant adds b7; minor 1 2 b3 4 5 b7; sus 1 2 4 5 b7), keeping only degrees the chord scale owns, so there are no half-step rubs. Country and acoustic: the key's pentatonic filtered to notes the chord scale has and that are not a half step above a chord tone, plus chord tones (no blue third). Reggae: chord scale in major keys, key pentatonic in minor. Metal in a minor key: natural minor bent to fit each chord (harmonic minor over the V, Phrygian over the flat II), never moving the tonic or the fifth. [style-data] (solid)

SO-30. The blue third (the key's minor pentatonic over a major key) is only allowed over the I and the IV chord; over the V or the vi it is a wrong note held, not a blue one. [property] (solid)

### Motif, riff, loop and the repeated-note stab

SO-31. A solo phrase's motif is its opening bar: that bar's rhythm cell, the phrase's contour, and the intervals of the bar's notes measured from its first note. The next phrase develops it with probability 0.4 (never the peak or wind-down phrase): the same cell opens the phrase, with the same contour and the same intervals from wherever the new first note lands, each note adjusted to the new chord. In 0.3 of those cases the cell is instead displaced an eighth later and only the rhythm is kept. Otherwise the phrase says something new. [style-data] (solid)

SO-32. How audible SO-31 is: of the bars that open a phrase with three or more notes, the share that repeat the previous opening's onsets and up/down shape is 13 to 16 percent (jazz 0.13, blues 0.13, rock 0.15, funk 0.16). With development switched off it is 2 to 5 percent; with every phrase forced to develop it is still only 26 to 40 percent, because chord adjustment changes the shape. For five weeks the motif's intervals were applied to the wrong bar (the phrase's first bar, when the rhythm sat on the first bar after a rest); fixing that raised rock from 0.07 to 0.15. [metric] (solid)

SO-33. A replayed note (riff bar, developed motif, restated head, looped hook) follows the same rules as a fresh one: it keeps its pitch if that still fits the new chord's pool, otherwise moves by the same interval the chord's root moved (the short way, down a 4th to up a tritone), otherwise takes the nearest pool or chord tone; a replayed note on a beat or on a target is always a chord tone; a held one never rubs; two replayed notes never collapse onto one pitch; and everything folds into the current phrase's register so a riff moved with its chord cannot climb past the peak. [property] (solid)

SO-34. A looped hook (hip hop probability 0.5, reggae 0.25): a solo phrase plays an earlier phrase again whole, preferring the phrase played at the same place in the form on the previous chorus, moved as one block by the root motion (or that plus or minus an octave, whichever keeps most of it in register) so it keeps its intervals. Measured share of phrases that are a loop: hip hop 0.12 to 0.6, reggae 0.05 to 0.4, every other style 0. [style-data] (solid)

SO-35. Repeated notes as a riff (funk chance 0.45 per solo figure, ska-punk 0.65, hip hop 0.3, disco 0.8; in heads 0.2, 0.9, 0.35, 0.8, at most two figures per section): the decision is made once per rhythm figure, never per note; every bar that plays a stabbed figure says one pitch (a chord tone) for a run of two to four notes, then the line moves on. The run stops at a chord change or a target, never takes the bar's last note, and never makes five in a row. Funk and hip hop stab on the figure's own sixteenths, disco on eighths, ska-punk on eighths starting and ending on an "and". Target: same-pitch moves are 8 to 20 percent of moves in these styles and 7 percent or fewer everywhere else. A per-note coin flip for repeats is arrhythmic and was ruled out. [style-data] (solid)

### Pickups and arrivals pushed over the barline (jazz, blues, bossa only)

SO-36. A phrase that would start on a downbeat after a breath may be led into from the last beat of the bar before. Chance per phrase: jazz 0.85 in solos and 0.7 in heads; blues 0.65 and 0.5; bossa 0.3. Figures (the last beat in sixteenths): the "and" alone `..x-` (twice as likely in jazz and bossa), two eighths `x-x-`, three quick notes `xxx-` (two sixteenths and an eighth, meant as a triplet on beat 4 under swing; not in bossa). The pickup walks the style's scale into the phrase's first note from one side (drawn from below with probability 0.6), its last note a step or a 3rd away; a note on a beat or a change is a chord tone. In a jazz solo the last pickup note is instead the line's own approach (half step below, or an enclosure) at the style's usual chances. Pickups are 6 velocity steps under the line. [style-data] (solid)

SO-37. A pickup lives only in the breath the previous phrase left: it needs an eighth of silence after that phrase's last note, and the previous arrival is never shortened to make room. No pickup into the first bar of a pass, across a chorus boundary, into or out of a trade, into a section the soloist sits out, in a guide-tone head, or after a phrase that ended with a fall-off or a released bend (that gesture says the player has let go). [property] (solid)

SO-38. Inside a phrase, a note struck on the last eighth of a bar that runs straight into the next downbeat may be tied over the barline as one note belonging to the downbeat's chord. Chance per barline: jazz 0.5, blues 0.4, bossa 0.7. Never into a riff bar or the final bar. Measured: 10 to 20 percent of the barlines a line crosses are tied in jazz and bossa. A line that restrikes every downbeat treats the barline as a wall. [style-data] (solid)

SO-39. Targets for early entry: of the phrases the soloist enters, 20 to 30 percent are entered on the last beat of the bar before in jazz (2 percent before this rule), 25 to 50 percent in blues, 5 to 30 percent in bossa. A tune that leads into every phrase it can is a mannerism; the ceiling matters as much as the floor. Pickups rise into their target 62 to 95 percent of the time in jazz and blues solos. [metric] (solid)

### The head when the tune is not known (an invented melody)

SO-40. For any chart that is not a known standard, the soloist writes a tune from the changes and plays it the same way every time: the tune is tied to the written section's letter (A2 and A3 count as A), not to the time through. [property] (solid)

SO-41. Song-form heads ("period" styles: jazz, rock, funk, bossa, country, disco, neo-soul, metal, ska-punk, acoustic) run in four-phrase groups: statement, answer, contrast, answer. The statement uses two head cells and an ending; the answer uses the same two cells with the next ending in the list; the contrast uses two cells the statement did not use, its own ending, an arch contour, and is centred a perfect 4th higher. Every bar plays (L L L E). Blues-form heads ("AAB" styles: blues, reggae, hip hop) run call, call, answer, each call three bars and a bar of room for the band (L L E R); an eight-bar section is call then answer. [style-data] (solid)

SO-42. A statement or answer that is not the section's first phrase restates the first phrase's pitches note for note wherever the same cell falls in the same bar, adjusted to the chords under it (SO-33): the melody comes back, not only the rhythm. A head spans about an octave (11 semitones) and is written at velocity 84. [property] (solid)

SO-43. A head breathes like a singer: the last beat of a four-bar phrase is silent and the last two beats of an eight-bar period or a section are silent. The breath is made by shortening whatever note sounds into it, never by deleting a struck note; if the last note is struck inside the breath, the breath shrinks to the beats after it (at least one), and a note struck in the last beat sounds for an eighth. Target: no head runs more than 6 bars without a beat of silence (8 bars for blues, funk, hip hop and reggae heads); before this rule heads ran up to 20 bars without a breath. [metric] (solid)

### The head when the tune is a known standard (the guide-tone head)

SO-44. On a known standard the soloist does not pretend to know the melody. It sings the changes' guide-tone line: every chord change, the first note and the last note of each phrase are a 3rd or 7th of the chord, each moving to the nearest guide tone of the next chord (a minor 3rd at most), a common tone held or tied and never struck twice. Decided by the owner on 2026-11-04 as the honest alternative to an invented tune under a real title. [taste] (solid)

SO-45. Guide-tone line placement: the chorus opens on the first chord's 3rd if that lies from 2 below to 4 above home, otherwise on the guide tone nearest home within 3 below to 7 above. A phrase's first note that has drifted outside that band starts again toward home, moving a 5th at most. A chord held more than two bars is struck again on the same tone. An A section that returns starts on the pitch the first A started on, so it recurs pitches and all. No note passes the top note of the style's solo. On a tie between two candidates the one nearer home wins, so a line falling by half steps through a ii-V chain leans back up. [property] (solid)

SO-46. The contrast section (the bridge; with none, the last section with a different letter) lifts: each of its phrases starts on the guide tone nearest a perfect 4th above the pitch the line entered from; its last phrase starts a whole step above where the A opens, so the line drifts down into the last A. No move into, inside or out of the contrast exceeds a 4th, except that a phrase start may climb a 5th when the line has sunk below the A's average pitch (in the last phrase at any shortfall; earlier only when more than a minor 3rd under, so a bridge built as a descending sequence keeps stepping down). Going into the contrast, the A's last chord takes whichever guide tone lets the bridge climb. It is played louder: A sections 74, contrast 82, final A 78. [style-data] (solid)

SO-47. The guide-tone head's rhythm is drawn once per chorus so every A is identical. An A phrase is four bars: a figure, a "turn" that moves on (a half note at most), a second figure, then the phrase's one long arrival (three beats or more). The answering phrase says the first figure an eighth late, takes a different turn, and closes on a whole note less an eighth. The contrast takes figures and a turn the A did not use. A 12-bar chorus with no bridge is sung as a blues (call, call, answer); a vamp after the 12 bars does not count. Only a phrase's last bar may hold a note three beats or longer. Turns never strike beat 4. [style-data] (solid)

SO-48. Default guide-tone figures (straight eighths, two to four notes a bar, each with an attack on or an eighth before beat 3, where a two-chord bar changes): `x---x---x-------`, `x---x-x-x-------`, `x-----x-----x---`, `..x-x---x-------`, `x-x---x-x-------`, `x-------x-----x-` (the last eighth tied over the barline). Turns: `x-------x-------`, `x-x-x---x-------`, `x-x-x-x-x-------`. Arrivals: `x-----------....`, `x-------------..`. Jazz and most other styles write their own (jazz adds the Charleston `x-----x-x-------` and a late arrival `..x-----------..`). [style-data] (solid)

SO-49. Between guide tones the head walks, with no chromatic notes and no enclosures: a half or whole step is free, a minor 3rd costs 1, a major 3rd 3, anything wider 10, a repeated pitch 50, returning to the note two back 0.6, completing an a-b-a-b trill 4; no single move exceeds a 4th. A note held a beat or more, or struck on beat 1 or 3, must be a chord tone (under a half note its natural 9th may stand in for the root); only notes of an eighth or less off beats 1 and 3 may be scale steps. In an A section the walk goes above the line in the first half of the phrase and below it after; in the contrast it goes above. [metric] (solid)

SO-50. Guide-tone head targets: change landings on a 3rd or 7th 0.9 to 1.0; 1.6 to 3 notes a bar in jazz (2 to 4 elsewhere); bars containing a note of three beats or more at most 25 percent; held non-chord tones at most 3 percent; the same pitch struck again across a barline at most 5 percent; steps (a whole step or less) 60 percent or more of moves; moves wider than a minor 3rd inside a phrase at most 5 percent; A sections recur in the same rhythm 85 to 100 percent bar for bar; the bridge's first note 2 to 7 semitones above the A's last. [metric] (solid)

### Dynamics and articulation

SO-51. Written velocity: 88 for a solo phrase (96 for the peak phrase), 84 for an invented head; plus 0.8 per semitone above home (minus below); plus 5 on a note of an eighth or less on an "and"; minus 10 on a note lower than both its neighbours (the valley of a run is ghosted); kept between 40 and 118; then scaled by energy (X-B-16). There is no other dynamic shape across a phrase. [style-data] (solid)

SO-52. Vibrato goes on any note at least this long: metal a quarter; rock, blues and disco a dotted quarter; jazz, country, reggae, hip hop, neo-soul and acoustic a half note; funk, bossa and ska-punk a dotted half. On a horn a scooped note stays plain. [style-data] (solid)

SO-53. A guitar bends only into the notes a phrase lands on (targets and the peak), never a passing note, and only on a note of an eighth or longer: into a major 3rd from a half step below with the style's "blue" chance, into a root or perfect 5th of a quarter note or longer from a whole step below with the style's "root" chance. Blue and root chances: blues 0.65 and 0.45; country 0.6 and 0.4; rock 0.45 and 0.55; neo-soul 0.4 and 0.08; disco 0.3 and 0.2; metal 0.25 and 0.75; hip hop 0.25 and 0.1; acoustic 0.25 and 0. The peak's top note is always bent if the style bends at all. A horn scoops into a note of a quarter or longer from a half step below: neo-soul 0.35, disco 0.3, reggae 0.25, funk 0.2, jazz and blues 0.15, ska-punk 0.1, bossa 0.05; half as often in a guide-tone head. [style-data] (solid)

SO-54. A horn falls off the last note of a phrase only: a note of an eighth or longer with a beat of silence after it, never a note that scooped in, never a note inside the line. A note of a half or longer sounds its full length and then drops 5 to 7 semitones into the rest over about a quarter note; a shorter note drops 3 or 4 semitones within its own last eighth (a 2-semitone drop that short reads as a flat note, not a fall). Base chance funk 0.35, blues, disco and ska-punk 0.3, multiplied by 1.5 in the last two bars of a section and 0.7 elsewhere, and by one third straight after a phrase that fell. A head's falls are fixed per section and ending figure so they recur. [style-data] (solid)

SO-55. A guitar lets a bend back down (blues 0.4, rock 0.35) on a bent note of a quarter or longer over one chord: inside a phrase only if the next note is lower than the bent pitch; at a phrase end only onto the minor 3rd over a chord with no major 7th, or onto the flat 7th over a dominant or plain triad, never onto the 4th. [property] (solid)

SO-56. A guitar slides (blues 0.25, rock 0.2) into a note struck on a chord change that it does not bend, an eighth or longer, from a scale tone two to five frets away, mostly from below: b7, 6 or 5 up to the root; 4 or 3 up to the 5th; 5 up to the b7; root up to a minor 3rd; 2 up to a major 3rd, plus the one allowed one-fret slide, minor 3rd up to major 3rd; from above 2 to root, 6 to 5, 4 to minor 3rd, root to b7. The starting note must be in the style's pool at that chord (never a chromatic note picked by distance), and a four- or five-fret shift is only offered when a nearer start also exists. One or two frets take a thirty-second note, more take a sixteenth. [property] (solid)

SO-57. One device per note: a note that bends does not slide; a note that scoops does not fall; no falls, releases or slides in the bar the band ends on. [property] (solid)

### Trading and the ending (the soloist's part only)

SO-58. Trading with the user (turns of 2, 4 or 8 bars): the band's soloist goes first so the user has something to answer; its turn is phrases of four bars, each played straight through to an arrival, busy (medium in the spacious styles, one step calmer at low energy), centred 2 semitones above home, with no rests; it lays out for the user's turn while the band keeps comping. Trading is only ever on request: an earlier version that started trading by itself was rejected. [taste] (solid)

SO-59. On the final held chord the soloist's last note moves to the nearest resting tone of the chord the band actually holds, rings to the band's last release in a held ending, and in a short ending is cut with the band and joins the band's final hit at accent level even if its phrase had already ended. Details are in the endings notes of part A. [property] (solid)

### Known weaknesses

SO-60. Every phrase is one unscored draw. Shape, each bar's rhythm cell, contour and whether to develop the last motif are drawn independently, and the first result is played. Nothing compares alternatives or rejects a weak phrase, so quality varies with the draw. [taste] (solid)

SO-61. The line between targets has no vocabulary. It is a straight interpolation from one chord tone to the next through a scale, with an overshoot when there are spare notes, and every style shares this one line writer with a different scale. There are no licks, no characteristic intervals, no sequences inside a phrase. In a busy bebop phrase a listener hears correct scale running that goes up and down a contour: "wandering". [taste] (solid)

SO-62. Rhythm does not cohere inside a phrase. In jazz each line bar's cell is unrelated to the one before it 92 percent of the time (riff chance 0.08), so a four-bar phrase can be three different rhythms and an ending. The styles that repeat (hip hop 0.7, funk 0.5, rock 0.4) sound more intentional for that reason alone. [taste] (solid)

SO-63. Phrases relate weakly. Only 13 to 16 percent of phrase openings audibly restate the previous one (SO-32); there is no question-and-answer pairing between phrases (every phrase ends on a resting tone, so every phrase is an answer); successive phrases in the same half-chorus share one centre pitch and span, so they cover the same ground again. The intermediate phrase-first soloist had explicit question-then-answer pairing (a question ending on a tension tone, a gap, an answer resolving it); it was not carried into the last band. [taste] (solid)

SO-64. Change landings are chosen one at a time. Each chord change takes the ranked tone nearest the contour, not the tone that continues a voice-led line from the previous landing, so the classic 7th-to-3rd resolution through a ii-V happens only by accident. The voice-led guide-tone line exists but is used only for known-standard heads, never under solos. [taste] (solid)

SO-65. The soloist is deaf. It plays before the comp and ignores the drums and bass it could hear. Its density follows the chorus arc and the energy tier, never what the band just played; it never answers a drum fill or leaves room for a comp figure. Phrases "feel out of place" when the arc asks for a busy phrase at a moment the band is doing something else. [taste] (solid)

SO-66. Phrases start and stop on the form's four-bar grid. Outside jazz, blues and bossa every phrase starts inside its own first or second bar and nothing crosses a phrase boundary, so the solo is audibly chopped into four-bar boxes. [taste] (solid)

SO-67. Contour is counted in notes, not time, so the same "arch" lands its high point on a different beat depending on the rhythm cells; the high point is not aimed at a strong beat or a chord change. Only the single peak phrase aims its top note anywhere. [taste] (solid)

SO-68. The solo has one climax per three choruses and no smaller high points, and dynamics follow pitch height only. The intermediate soloist found by ear that a peak has to recur about every 12 bars to be heard as something the player does (KF-B-09); the last band went back to one peak per cycle. [taste] (unclear)

SO-69. Tempo is ignored. Density is notes per bar regardless of tempo, though the intermediate soloist learned that a slow tune (86 bpm) needs more notes per bar to be recognisable and that a breath should be about 0.4 to 0.8 seconds whatever the tempo. [taste] (solid)

## Known failures and things tried

### Soloist: the first band (a note-at-a-time picker, to June 2026)

KF-B-01. The first soloist chose every note separately by adding up weighted bonuses (chord tone, contour, common tone, style profile) and picking by chance. The notes were usually right; the line had no intention over time. Symptoms a listener heard: a mechanical rhythm (four-sixteenth cells chosen in isolation), octave jumps on 28 percent of moves in neo-soul and funk, three or more bars of dead air at high intensity in jazz, and low intensity sometimes sounding busier than high. [taste] (solid)

KF-B-02. Lesson from tuning it: when many additive bonuses push the same way, a new bias added to the sum is washed out (a restatement bonus of 1.15 times was inaudible beside chord-tone bonuses of 150 to 300; a "wide intervals" boost was cancelled by the general leap penalty). A bias only showed up when applied as the last multiplier on the total. And a bias strong enough to produce a clean statistic often sounded robotic (an answer phrase that always lands on the root); a weaker bias that is reliably directional kept the music. [taste] (solid)

KF-B-03. Fixes tried on the first soloist and their effect: forcing re-entry after 1.5 bars of rest cured the dead air; a stepwise bonus plus a 95 percent penalty on octave jumps halved the jumping; a non-linear intensity scale made density follow intensity; a register anchored to E4 to E5 with an intensity-based ceiling stopped "register wandering". [taste] (solid)

KF-B-04. Layers of phrase logic added on top of the picker (a statement, restatement, departure, conclusion cycle; a "maturity" factor; motif memory) produced brittle edge cases: permanent silence in blues and one note repeating in jazz. They were stripped back to a simple play-or-rest countdown, and later partly re-added. The pattern repeated: features meant to add intention were wired in at one corner and then cancelled or ignored elsewhere (two motif memories that were written and never read; a syncopation setting that reached only the opening statement; a fatigue rule overridden exactly in the styles it was built for). [taste] (solid)

KF-B-05. Bebop vocabulary was impossible in the first soloist: non-scale notes were filtered out before any chromatic preference could apply, so half-step approaches and enclosures could never occur, and the bebop run device was built from the chord's root, not from where the line was, so it leapt in and out. [taste] (solid)

KF-B-06. Its "development" was erosion. A complete head melody was fixed when play started; on later times through, the soloist replayed that melody with notes randomly dropped, pitches nudged one to three scale steps, and ornaments added. The line could only become less itself, never grow. The arc was a 5 percent intensity rise per time through, a ramp with no peak or resolution. Rests happened when a budget ran out, not when a phrase ended. [taste] (solid)

KF-B-07. The first soloist never listened to the bass or the comp, so it could double the bass note or disappear into a comp voicing. (The last band fixed the second from the comp's side, CH-59 to CH-63, and never fixed the first.) [taste] (solid)

### Soloist: the intermediate "phrase-first" soloist (June to September 2026)

KF-B-08. What it changed, and what the measurements said: it stated a singable theme, rested wherever the theme had no note, entered sparse and opened up over about four times through the form, and treated beat 1 and beat 3 as targets (a non-chord tone there was pulled to a 3rd or 7th within a minor 3rd, else the nearest chord tone; a note already on a chord tone was left alone so the theme was not bent), with the weak note before a target stepping into it by scale step and a change on the beat anticipated over the barline. Result across jazz, neo-soul, rock and blues: 97 to 100 percent of strong beats on chord tones and 44 to 62 percent on guide tones. It became the band's only soloist the day it was written. [metric] (solid)

KF-B-09. Peaks, tuned by ear in three steps. A single climax (the theme's highest note lifted to the key's tonic or fifth 3 to 9 semitones above it, no higher than F#6) sounded once per 128-bar span: too rare to notice. One peak per 24 bars (about every 40 seconds) was still too sparse. One per 12 bars (about every 23 seconds) read as "a thing the lead does", a signature. The peak held the key's tonic or fifth over whatever chord was sounding (a pedal climax), slightly louder, and was never rested away. [taste] (solid)

KF-B-10. Expression in bursts: one bent or shaken note per peak sounded like an isolated ornament; a cluster of bends and vibrato around each peak followed by space sounded like a player getting lyrical. Vibrato only on a peak actually held a beat or more (about half of them). [taste] (solid)

KF-B-11. Development as sequence: each time through the form the whole theme was moved up the key's scale by a larger step, contour intact, returning to the plain theme every three to six times through (three, plus one for every eight bars of form). Transposition changed only at the top of the form, never mid-phrase. This kept the theme recognisable (the bounded transposition was the leash) but every phrase moved together; individual phrases did not relate to each other. [taste] (solid)

KF-B-12. Tempo lessons: at 86 bpm the same line was too sparse to recognise while at 110 bpm it worked, so below about 120 bpm the soloist filled more notes per bar. A real breath is about 0.4 to 0.8 seconds whatever the tempo, which is why fast playing has fewer rest beats without sounding breathless. [taste] (solid)

KF-B-13. Question and answer: within a four-bar block, a two-bar question ending on a non-chord "hanging" tone, one beat of silence, then a two-bar answer ending on a chord tone. It was added because the exposed early choruses otherwise "wandered". An earlier build's hanging tone was pulled back onto a chord tone by the later chord-snapping stages and the effect vanished; the cadence notes had to be protected from every later stage and from being rested away. In blues a good question often hangs on the dominant chord's flat 7th, which is a chord tone, so "non-chord tone" was the wrong test there: a blues question is a pitch outside the key's tonic triad (92 to 98 percent of questions when the rule held, about 55 percent when it was washed out) and preferably off the sounding chord's root, 3rd and 5th (75 to 78 percent). [property] (solid)

KF-B-14. Other things added to that soloist in July 2026, with no recorded verdict on whether each helped: a protected hook cell built on the chord root in the head; density and loudness following the band's intensity ("ears"); resting into a section change and entering big after a build; a loudness envelope across each phrase; a motif carried from one section role to the next; locking the soloist to the band's groove pocket. Three separate "hook" mechanisms were found to do nothing and were removed. [taste] (unclear)

KF-B-15. The soloist used to be given only a quarter to a half of the band's swing (35 percent by default; a deliberate "straightening" blend), so it floated ahead of a shuffled ride instead of locking with it. Removing the blend, so the soloist takes exactly the band's swing plus its own constant lean, fixed it. [property] (solid)

KF-B-16. Disagreement over time on guitar bends: in July 2026 the rule was "bend up and hold the target, not bend-and-release"; in November 2026 bend-and-release came back as its own device at a 0.35 to 0.4 chance with strict rules about what note it may come to rest on (SO-55). Both are in the record; the later rule is the more specific. [taste] (unclear)

### Soloist: the last band (September to November 2026)

KF-B-17. First audition: "some of the rests seem a bit long". Measured, 13 to 27 percent of solo breaths were two bars or more and the longest passed six bars (15 seconds at a blues tempo), with no comp answering to fill them. Fix: SO-10. After: 2 to 10 percent in solos, none in heads, nothing reaching three bars. [metric] (solid)

KF-B-18. Trilling: 10 to 17 percent of four-note runs were a-b-a-b. Cause: the walk between targets pinned at the edge of its register and bounced. Fix: turn round at the edge, never return to the note two back, re-check after approach notes are placed. After: 1 to 2 percent. [metric] (solid)

KF-B-19. Review findings fixed in the first week, each a rule now: chromatic approaches only off the beat and from the correct side; held notes avoid rubs; a head restates its pitches, not only its rhythm; riffs repeat their pitches; the peak is one held top note with the phrases around it a 3rd or more lower; bends only on landings and the peak; rock and funk land mid-phrase on the 5th or 3rd and keep the root for the end; the blue third only over I and IV; a bebop passing tone only over its own mode; a head spans most of an octave (it was a 7th and sounded cramped); a phrase does not end on the note the previous phrase ended on. [taste] (solid)

KF-B-20. The known-standard head went through three versions. One guide tone held per chord: honest but "a bit sparse for the soloist". The same pitches in a tune's rhythm with the ordinary line writer filling between them: 18 percent of moves inside a phrase were wider than a minor 3rd, because a guide-tone line moves by half step and the step beside the target was usually the note just left, so the fill leapt to a chord tone a 3rd or 4th away. A dedicated stepwise walk with trill and leap costs (SO-49): under 5 percent. The first sung version also put a note of three beats or more in a third of all bars (every other bar within a phrase) and lifted the bridge a 5th over a fixed home pitch, which could be as much as an octave above where the A section had ended; both were heard as wrong and replaced by one long note per phrase and a 4th above the entry pitch. [metric] (solid)

KF-B-21. Heads ran phrase into phrase for up to 20 bars with no silence. Fixed by the singer's breath (SO-43), then corrected once because the first version deleted the notes that fell in the breath (losing a beat-3 resolution) where it should have shortened them. [metric] (solid)

KF-B-22. Pickups and tied barlines (SO-36 to SO-39) were added because only 2 percent of phrases started before their barline. They shipped in jazz, blues and bossa a few days before the rewrite began and were described at the time as awaiting the owner's listen, so their musical value is measured but not confirmed by ear. [taste] (unclear)

KF-B-23. What was never fixed, and the best reading of why quality still varied: SO-60 to SO-69. In one sentence: the soloist got every local rule right (chord tones on beats, targets at changes, approaches, breaths) and still had no way to make one phrase follow from another or to prefer a good phrase over a poor one, so a chorus was as good as its run of independent draws. The styles with the most built-in repetition (hip hop, funk, rock, reggae) were the most consistent and bebop, with the least repetition and the most notes, the least. [taste] (unclear)

### Comping: the first band

KF-B-24. "The comp doesn't lock in as the chords change." Three causes found: the figure was re-rolled with fresh randomness every bar; a rule forced each bar's figure to differ from the last, making a repeating figure impossible; and the pattern was keyed to how many times round the form the band was, so every lap differed. Fix that held: the figure is tied to the bar's place in the form, a phrase-level skeleton is held for four bars, and only a small ornament varies bar to bar. [taste] (solid)

KF-B-25. Country: offbeat strums were placed by a coin flip per sixteenth, a different arrhythmic spray every bar over a solid boom-chick, heard as random chords. Fix: a regular subdivision that is identical every bar, chosen by intensity: bare boom-chick at 0.2 or below; a "chicka" on every "and" from 0.2 to 0.6; the "a" sixteenth added above 0.6. A per-position coin flip is not a rhythm. [property] (solid)

KF-B-26. Re-striking the same full voicing on every hit in a bar read as spammy and mechanical even with right notes. Fix tried (jazz, blues, bossa, acoustic only): the on-beat hit is the statement (full voicing); an offbeat repeat of the same chord is a leaner answer (guide tones only), and 55 percent of answers move the top voice to a neighbouring chord tone so consecutive answers are not identical. A second step let about one statement in four ring through the next hit instead of re-attacking, at moderate intensity and above only (at low intensity dropping a hit made the comp limp), and never in bossa, whose identity is its attack pattern. Neither idea survived into the last band, where every strike of a chord uses the whole voicing. [taste] (solid)

KF-B-27. The stab on beat 4 before a change played the outgoing chord: "a quick C7 right before the F7". First fix (jazz and blues): the last beat before a change becomes a single short stab of the incoming chord on its "and", with the rest of that beat silent. The last band's version of the same idea is CH-36 to CH-40, which also had to learn not to strike the pushed chord again on the beat. [property] (solid)

KF-B-28. A major-seventh-only "open voicing" gesture raised a middle voice an octave, so the I chord of a ii-V-I suddenly spanned 15 to 17 semitones while its neighbours spanned 7 to 9. The owner heard it immediately. Rule kept: hand width is consistent across neighbouring chords in a section; an open colour, if used, is used for the whole section. [property] (solid)

KF-B-29. A voice-leading refinement moved a dominant's 13th down an octave onto a half step from the flat 7th (D4 against Eb4 at the IV chord of a blues), heard as a wrong note. Rule kept: never accept a smoother voice leading that introduces a minor 2nd the plain voicing did not have. [property] (solid)

KF-B-30. The comp's timing wandered by the same 12 ms at ballad intensity and at full drive. Fix: the spread shrinks as intensity rises (12 ms at 0.2 to under 7 ms at 0.9) so the comp tightens as the band pushes. The last band replaced this with a fixed lean and a small fixed spread (X-B-15, X-B-17) and does not tighten with energy. [taste] (unclear)

KF-B-31. The nearest the old band came to phrase-level comping were three optional keyboard players added in September 2026 and dropped two weeks later in the rewrite of the band. "Modern jazz piano": a four-bar plan of statement, displaced answer, return, settling bar; three to five keys with at most an octave in either hand; the left hand holds through a lighter right-hand answer; density changes the size of the voicing, never the number of attacks; a soloist playing softens the part and can reduce the answer to one right-hand note. "Open modal piano": the same, preferring voicings about an octave and a half wide with up to two stacked 4ths; every bar and chord arrival gets a full statement, bar 2 of each four gets one lighter upper-hand answer on its last beat, bar 4 settles. "Neo-soul Rhodes": a full statement on every bar and chord arrival, an answer of at most two upper keys on the "and" of 2 in bars 1 and 3, space in bars 2 and 4; statements last a beat and a half at most and answers half a beat. No listening verdict on any of the three was found in the record. [taste] (unclear)

KF-B-32. Gestures linking comp and soloist that existed in the first band and were lost: the comper "catching the soloist's question" (one lean chord a beat into the breath after a question phrase, with the question's hanging note on top, then a top-voice landing on a chord tone during the answer bar; it fired more often on later times through the form, so the conversation warmed up); the rock comp hitting with the soloist's peaks; one chosen responder (chords or bass, never both) filling a rock soloist's breath. [taste] (unclear)

### Comping: the last band

KF-B-33. Organ: the first listening pass heard "distinct beats" because the comping rhythm re-struck the held chord on every hit. Fix: CH-55. Later the opposite failure appeared: a one-chord vamp was tied silently for its whole length and the top of every lap was silent. Fix: CH-56. [property] (solid)

KF-B-34. Swing rhythm guitar "could swing better": it had inherited the piano's 8 ms lay-back. Fix: it sits 2 ms ahead with the walking bass and plays long-short (CH-44). [style-data] (solid)

KF-B-35. The conversation's first version (lay out 0.6, fill 0.7, no floor) left 41 percent of bars under a jazz solo with one strike and the owner heard the piano as thin. Fix: a floor of two strikes a bar and more answering (0.9): the conversation comes from adding in the holes more than from thinning under the line. [taste] (solid)

KF-B-36. The jazz piano anticipated only 3 percent of chord changes because a push could only happen when the random figure happened to end on the "and" of 4. Fix: CH-39. The same change exposed pushes arriving an eighth before a fermata, hence the rule that a held chord is never pushed. [metric] (solid)

KF-B-37. Neo-soul and hip hop keyboards were striking the jazz piano's exact notes on 99 to 100 percent of seventh chords; the two-handed spread voicing (CH-12) brought that to 5 percent. Its first version flipped between open and closed hands strike by strike under a sparse solo, sat higher under the line than before, and on one tune stranded the Rhodes above the soloist for four bars; fixed by CH-65 and CH-66. Under a low line it also produced G7 as E3 F3 A3 B3 (a minor 2nd at E3 over the bass), fixed by the foot rule in CH-66. [metric] (solid)

KF-B-38. An old target said the jazz comp should play the Charleston figure in more than 70 percent of bars. The last band's jazz piano draws the Charleston with weight 4 out of 16 (25 percent of bar-long chords). The two disagree; the later band was the one that passed the owner's ear for jazz. [style-data] (unclear)

KF-B-39. What was never fixed in comping: CH-75 to CH-82. The owner's assessment going into the rewrite: acceptable but rhythmically weak, with voicings and register left partly to chance. [taste] (solid)

## What separates a good phrase or voicing from a bad one

Each item is stated so it can be computed from the notes played. Ranges are the old band's own targets; where a style is named the range is that style's. "Measured by the old band" items were checked on every style over several seeds and several times through the form; the last group was never measured and is inferred from the failures above.

### Voicings

Q-01. Every comp chord of two or more notes contains all of its chord's guide tones (X-B-09). Allowed exceptions: a two-note guitar double stop (one guide tone is enough), an upstroke (it follows a downstroke that carried the chord), a power chord in a power-chord style, and a root-plus-5th/6th/flat-7th dyad on a guitar playing the bass role with no bassist. [property] (solid)

Q-02. Every guitar chord is fingerable by the test in CH-20, and every comp note is inside the floors of X-B-02 and X-B-03. [property] (solid)

Q-03. Count of voicings with any of: a minor 2nd between the two lowest notes (below E4 on a dominant, anywhere on other chords); a minor 9th between any two voices on a non-dominant chord; a #9 below the 3rd; an adjacent pair below its low-interval limit (X-B-04). A good comp has almost none; the first is a hard rule when the voicing is squeezed under a soloist. [metric] (solid)

Q-04. Mean movement of the comp's top voice between consecutive chords: 3.5 semitones or less (jazz, blues, bossa), 3 or less (neo-soul), 2 or less (acoustic), 1.75 or less (hip hop Rhodes). [metric] (solid)

Q-05. Share of chord changes at which the comp's top voice moves more than a perfect 4th from the strike before: 0.22 or less with no soloist, 0.10 or less under a solo. [metric] (solid)

Q-06. Hand width (lowest to highest note) of a voicing compared with its neighbours in the same section: a chord twice as wide as the chords either side (15 to 17 semitones among 7 to 9) is a fault. Guarded by a single test in the first band, never a running metric. [metric] (unclear)

Q-07. Share of chords with a written 9th, 11th, 13th or alteration in which that tone is actually sounded: 0.9 or more (0.8 for a fingerpicked guitar, which may sound part of its grip). [metric] (solid)

Q-08. Share of comp chords containing a 9th or 13th the chord symbol did not have to imply: 0.5 to 1.0 in colour styles, 0 to 0.15 in triad styles (CH-14). The same number that is a virtue in jazz is a fault in country. [metric] (solid)

Q-09. Mean pitch of the comp's lowest note, per instrument and style (CH-19). Too low crowds the bass; too high crowds the soloist. [metric] (solid)

Q-10. No comp or soloist note on a pitch class the harmony rules out. Two concrete guards: no E natural over G7b9 resolving to Cm7; no C natural over Em7 beside A7 in the first half of the bar. Every colour tone the comp adds is in the chord scale (0.99 or more). [property] (solid)

Q-11. Share of the time the soloist sounds over the comp during which a comp voice is on the soloist's exact pitch: 0.15 or less (0.10 or less under a guide-tone head). Share of comp notes at or above the lowest soloist note sounding over them, for styles that keep under the line: about 0.001. [metric] (solid)

Q-12. Share of consecutive seventh-chord strikes that switch between an open two-handed voicing and a compact one: under 0.01 across a solo; within one bar 0.045 to 0.07 or less. [metric] (solid)

### Comping rhythm

Q-13. Share of chord changes where a comp strike within the eighth before the change already plays the new chord: jazz piano 0.25 to 0.45, blues piano 0.35 to 0.6, swing guitar at low energy 0.025 to 0.1. Both a floor and a ceiling: never pushing is stiff, always pushing is a mannerism. [metric] (solid)

Q-14. In a style that pushes: the number of strikes of the outgoing chord inside the eighth before a mid-bar change is zero, and the number of pushed chords struck again within the eighth after the change is zero (boogie pump excepted). [property] (solid)

Q-15. Under a solo, share of bars in which a sparse comper plays only one strike: 0.21 or less. [metric] (solid)

Q-16. Conversation measures (CH-72): comp density in the soloist's breaths divided by density under the line (1.1 to 2.0 conversational, 0.7 to 1.0 for a groove that should not react); share of breaths holding a strike the comper chose (0.4 to 0.7: most, not all); answers louder than strikes under the line by 1 to 12 velocity steps; density under the line 0.10 to 0.155 strikes per sixteenth. [metric] (solid)

Q-17. Style fingerprints: strikes per bar, share of strikes off the beat, share of strikes an eighth or shorter, share of muted scratches, share of upstrokes (CH-47, CH-52, CH-53). Each style has a range on each and several styles differ on only one of them. [metric] (solid)

Q-18. A section's comping figure is the same every time the section returns, and no part of a figure is decided by an independent coin flip per subdivision. [property] (solid)

Q-19. Share of the jazz drummer's snare comping strokes that coincide with a piano strike: 0.45 or more. The only measured link between comp rhythm and drums in the old band. [metric] (solid)

Q-20. Swing guitar: beats 1 and 3 are 1.5 to 3 times as long as beats 2 and 4. Reggae: beats 2 and 4 are 1.15 to 1.4 times as loud as the rest of the hand. [metric] (solid)

### Soloist: pitch

Q-21. A soloist note struck on a chord change, or held across one, is a chord tone of the new chord. [property] (solid)

Q-22. Share of soloist notes on a beat that are chord tones: 0.72 or more in solos, 0.75 to 0.85 or more in heads. (For calibration: a note chosen at random from a seven-note scale is a chord tone 0.43 of the time over a triad and 0.57 over a seventh chord.) [metric] (solid)

Q-23. Share of change landings on a 3rd or 7th, or on a root or 5th, per style (SO-23). The mix is the style: guide tones for jazz, bossa, disco; root and 5th for rock, funk, metal, ska-punk. [metric] (solid)

Q-24. Share of phrase-ending notes that are chord tones of the chord they end over (or arrive on): 0.85 or more in solos, 0.95 or more in heads. [metric] (solid)

Q-25. Share of notes held a beat or more, or struck on beat 1 or 3, that are neither chord tones nor a natural 9th under a half note: 0.03 or less. This is the measurable form of "no avoid notes held". [metric] (solid)

Q-26. Interval profile inside a phrase: share of moves that are a whole step or less (jazz solo 0.55 to 0.9, bossa 0.5 to 0.85, a voice-led head 0.6 or more, pentatonic styles 0.35 to 0.75); mean interval (jazz and bossa 1.6 to 3.2 semitones, neo-soul 2 to 3.8, a guide-tone head 2.3 or less); share of moves wider than a fifth, 0.05 or less everywhere. [metric] (solid)

Q-27. Share of four-note runs that are a-b-a-b: 0.04 to 0.05 or less. Counted across target notes as well as the notes between them, or trills hide at the joins. [metric] (solid)

Q-28. Share of moves that repeat the same pitch: 0.03 to 0.07 or less in line styles; 0.08 to 0.2 in riff styles (funk, disco, hip hop, ska-punk), where too few is as wrong as too many. [metric] (solid)

Q-29. Share of change landings approached from an out-of-scale half step: jazz solo 0.18 to 0.6; neo-soul 0.08 to 0.4; country and bossa solos about 0.01 to 0.25; any head 0.1 or less; acoustic 0.05 or less. [metric] (solid)

### Soloist: rhythm and space

Q-30. Share of breaths (silences of a beat or more) that last two bars or more: 0.12 or less in a solo, 0.02 or less in a head. This separates phrasing from dropping out. [metric] (solid)

Q-31. Longest stretch without a beat of silence: 6 bars or less for a song-form head, 8 or less for call-style heads. This separates a sung tune from a stream. [metric] (solid)

Q-32. Share of bars the soloist leaves empty, by role and style: heads 0 to 0.15 (call-style heads 0.15 to 0.4); solos from 0.10 to 0.20 (metal) to 0.22 to 0.50 (neo-soul) (SO-11). [metric] (solid)

This band, since 2026-11-17, by Brandon's ear (`soloist-a-little-sparse`, `busier-soloist-defaults-and-range`): the solo figures above are the last band's. `solo.empty-bars` reads a mean of 0.09 (jazz, blues) to 0.16 (acoustic) at the default setting, and one take in ten at 0 (blues) to 0.06 (disco, reggae, acoustic) or below; the table under SO-11 has every style, and the setting's two ends.

Q-33. Share of sixteenths left silent inside the bars the soloist plays in: funk 0.4 to 0.85, hip hop 0.28 to 0.6, ska-punk 0.2 to 0.45, country 0.15 to 0.4, neo-soul 0.08 to 0.4, metal 0.15 or less. [metric] (solid)

Q-34. Notes per bar and share of notes an eighth or shorter, per style: jazz solo short share 0.6 to 0.95; bossa 0.35 to 0.65; funk 0.8 or more; a song-form head 2 to 4.5 notes a bar; metal solo 4.5 to 9. [metric] (solid)

Q-35. Of the phrases the soloist enters, the share entered on the last beat of the previous bar (jazz 0.2 to 0.3); of the barlines a line crosses, the share tied over (0.1 to 0.2); of pickups, the share rising into their target (0.62 to 0.95). [metric] (solid)

### Soloist: phrase to phrase and across the form

Q-36. Of the bars that open a phrase with three or more notes, the share with the same onsets and the same up/down shape as the previous phrase's opening: 0.07 to 0.27, judged only over a sample of 100 or more openings. [metric] (solid)

Q-37. Share of solo phrases that are an earlier phrase played again whole: hip hop 0.12 to 0.6, reggae 0.05 to 0.4, others 0. [metric] (solid)

Q-38. Arc: notes in the third solo chorus divided by notes in the first, 1.5 to 4; the highest note of the three choruses is in the third, 0.85 to 1.0 of solos; pitch range across a chorus 10 to 26 semitones. [metric] (solid)

Q-39. A head is identical, note for note, every time it returns. For a guide-tone head: A sections match the first A bar for bar in rhythm 0.85 or more; the contrast matches the A's rhythm 0.3 or less; the contrast's first note is 2 to 7 semitones above the A's last; the contrast is 3 to 20 velocity steps louder; no move into or out of the contrast exceeds 5 semitones. [property] for identity, [metric] for the rest (solid)

Q-40. Question and answer, as the intermediate soloist measured it: the question's last note sounds (is not rested away) 0.98 or more; it is a non-chord tone (or, in blues, outside the key's tonic triad, 0.85 or more); the beat after it is silent; the answer's last note is a chord tone. [metric] (solid)

Q-41. Articulation placement: fall-offs only on phrase-ending notes (zero inside a line); two phrase ends in a row both falling 0.11 to 0.25 or less; 0.35 to 0.77 or more of falls in a section's last two bars; a released bend at a phrase end never rests on the 4th; the line never climbs straight after a released bend; slides only into notes struck on a chord change. [property] (solid)

Q-42. How the old band kept its measures honest, worth keeping: every range was set between the value measured with the behaviour on and the value with it switched off (and, for a ceiling, the value with it always on); a threshold below what random notes would score, or one computed by replaying the player's own rule, proves nothing; and each threshold is marked as either a musical intent or a measured calibration, because loosening the two means different things. [metric] (solid)

### Not measured by the old band; implied by its failures

Q-43. Rhythmic coherence inside a phrase: the share of line bars whose onset pattern equals, or is a shift of, another bar in the same phrase. The old soloist's value was simply its riff chance (0.08 in jazz to 0.7 in hip hop), and the consistent styles were the high ones. [metric] (unclear)

Q-44. Voice leading between consecutive change landings in a solo: the share of landings within a minor 3rd of the previous landing. Measured only for guide-tone heads (where 5 percent or fewer of all moves inside a phrase exceed a minor 3rd); solos were never held to it. [metric] (unclear)

Q-45. Where a phrase's highest note falls: on a beat, a chord change or a long note, versus on a passing sixteenth. The old contours were counted in notes, so this was left to chance. [metric] (unclear)

Q-46. Recurrence of high points: a local peak about every 12 bars was the spacing the owner heard as a signature; one per three choruses was the last band's. [metric] (unclear)

Q-47. Breath length in seconds, not beats: about 0.4 to 0.8 seconds, and notes per second (not per bar) as the density that has to stay recognisable at slow tempos. [metric] (unclear)

Q-48. Comp phrase shape: whether a four-bar comping phrase repeats a figure with one varied bar (statement, displaced answer, return, settle), versus four unrelated bars or four identical ones. [metric] (unclear)

Q-49. Comp and drums: the share of comp accents that coincide with a kick or snare accent, and whether an anticipated chord is played by bass and kick as well. The old band could not make the band push together and never measured it. [metric] (unclear)

Q-50. Comp answering the soloist's content, not only its silence: whether the comp's answer carries the soloist's last held note on top, or echoes its last rhythm. The first band measured the former for its "catch the question" gesture. [metric] (unclear)

## Surprises

SU-B-01. An anticipated chord must swallow the strike it anticipates. The first eighth of the new chord's own figure is dropped, and the pushed strike inherits the dropped strike's length; otherwise the chord is hit twice an eighth apart ("ba-DAHM") or rings an eighth and leaves a hole. [property] (solid)

SU-B-02. Decide by the bar or the phrase, never by the strike, anything that changes the comp's register or size. Strike-by-strike decisions (open or closed hands, lay out or play) flip back and forth under a sparse soloist and are heard as jitter. [property] (solid)

SU-B-03. The penalty for the comp doubling the soloist's pitch has a narrow sweet spot: too low and guide tones (which cannot be dropped) stay on the soloist's note; too high and the comp leaps an octave to escape, which is worse. The right behaviour is to shift by one inversion. [metric] (solid)

SU-B-04. When a keyboard voice moves out of the soloist's way by an octave, it must not land on a pitch the soloist is playing, on a pitch already in the chord, or below the chord's own bottom note (two octave roots of a power chord once cancelled each other and left a lone fifth). [property] (solid)

SU-B-05. A comp answer stab must stay a quarter note clear of other strikes and out of the eighth before a chord change. An "and" straight after a struck downbeat is a stutter; a stab in the eighth before a change plays the wrong chord. [property] (solid)

SU-B-06. A chord's first strike and an anticipation are not "answers" and must not be counted or made louder as answers; otherwise the measures of conversation pass with no conversation happening. [metric] (solid)

SU-B-07. The organ is a different player, not a piano with a long release: one press per chord, a re-press at each phrase top for any chord held a bar or more, one press for a double-struck anticipation, no anticipation across the loop point, and no voice dropped for the soloist (a voice missing on one press and back on the next blinks). [property] (solid)

SU-B-08. A scratch after an anticipation deadens the new chord's grip. Jumping back to the old shape for one sixteenth is physically absurd and audible. [property] (solid)

SU-B-09. A power chord on a chord with a raised fifth is root and octave only: root plus #5 sounds like another chord's root and 3rd (B7alt as B and G reads as G over B). [property] (solid)

SU-B-10. A dominant's 13th a half step under its 7th is a colour from E4 upward and a growl below it. The same rub is right or wrong by register alone. [property] (solid)

SU-B-11. Chord-root pentatonics and key pentatonics both need the chord's own tones added, or a borrowed chord (a flat VII, a minor iv, a secondary dominant) has nothing to land on. And a key pentatonic note that is a half step above a chord tone (the key's C over a G chord) has to be removed in the styles that hold notes. [property] (solid)

SU-B-12. The same melodic material must be re-fitted when it is repeated over a new chord, and re-fitting changes its shape enough that a listener often cannot hear the repeat (SO-32: forced development is recognisable only 26 to 40 percent of the time). Repetition that is meant to be heard has to be protected from the chord-fitting rules, as the looped hook is (moved as one block, intervals intact). [taste] (solid)

SU-B-13. A motif displaced by an eighth carries only its rhythm in the old band; its pitches are written fresh. So the "same idea a beat-space later" is rhythmic only. [style-data] (solid)

SU-B-14. A roomier phrase shape keeps the busier density's rhythm cells and register span. "Space" changes how many bars play, not how the playing bars sound. [style-data] (solid)

SU-B-15. A breath is taken by shortening the note that sounds into it. Deleting struck notes to make a breath removed phrase-ending resolutions and had to be undone. [property] (solid)

SU-B-16. A two-semitone fall-off on a short note is heard as a flat note. Short falls are 3 or 4 semitones; long ones 5 to 7. (An earlier note in the record says 2 to 4 and 4 to 5; the larger figures are the ones that were kept.) Likewise the blues horn's fall chance is recorded as 0.45 in one place and 0.3 where it was finally set. [style-data] (solid)

SU-B-17. A slide must start on a note of the scale under the hand. Choosing the start by distance alone gave slides from the flat 2 into the 3rd and from the flat 6 into the flat 7. And when the only available start is a five-fret shift, it comes round every time the head does and becomes a tic, so a long shift is offered only when a near start is also possible. [property] (solid)

SU-B-18. The head has to be tied to the section's letter, with numbered repeats (A2, A3) counted as the same letter, or a written-out second A gets a different tune. [property] (solid)

SU-B-19. Going into a bridge, the guide-tone line must take the voice that can rise. A dominant's 7th wants to resolve down, and if the line arrives on it the bridge can only fall; so the last A chord takes its other guide tone. A bridge that is a descending sequence must be allowed to keep descending until its last phrase. [taste] (solid)

SU-B-20. A 12-bar chorus is a blues (call, call, answer) only if it has no bridge of its own, and a vamp tacked on after the 12 bars must not be counted. [property] (solid)

SU-B-21. Turn figures in a head never strike beat 4, because a note struck in a phrase's last beat leaves only an eighth of breath where a singer takes a beat. [style-data] (solid)

SU-B-22. Open strings must be switched off for any guitar idiom that damps by lifting the fretting hand, and an open G chord over a bassist has to mute its A string. Both are single-string details that make a strum sound wrong if missed. [property] (solid)

SU-B-23. An upstroke that sounds all the strings sounds like a second downstroke. Top three strings only. [property] (solid)

SU-B-24. Rhodes and clavinet were the piano in everything but sound, and four instruments shared one keyboard register, so lowering the floor for one voicing style lowered it for all of them. [taste] (solid)

SU-B-25. The comper's lean depends on the instrument as well as the style: in jazz the piano lays back 8 ms while the rhythm guitar sits 2 ms ahead with the bass. One comp lean per style is wrong. [style-data] (solid)

SU-B-26. The jazz comp figure that looks like the classic (Charleston in 70 percent of bars, an old target) was not what passed the owner's ear; a mixed table with the Charleston at a quarter of bars did. Recorded as a disagreement, not a conclusion (KF-B-38). [taste] (unclear)

SU-B-27. The design notes describe the soloist's slot as "each four-bar phrase"; in practice the slot is the form's phrase of three to six bars and the four-bar shapes are stretched or cut to fit. Shapes written for four bars are not automatically right for three or six. [taste] (unclear)

SU-B-28. Belongs to other parts, met here. Part A: the bass floor is recorded as 23 in one place and as the open E string (28) in the tests; the jazz head is played in 2 on the hi-hat and the solos walk on the ride; the band's final-bar gestures and the rule that the soloist joins the last hit; the user's own muted lane is "a hole, not a missing player". Part C: every style's cell lists, strum lines and push tables in full. Part D: the chord-scale table of X-B-10 overlaps the theory audit; how falls, releases, slides and vibrato are rendered in sound (a fall sinks to about 40 percent level; an older vibrato was about 5.5 Hz and 18 cents wide), and which soloist instruments sound convincing. [taste] (solid)
