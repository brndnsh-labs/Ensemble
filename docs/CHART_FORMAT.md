# Chart format

Version 1. File extension `.chart`. UTF-8 plain text.

A chart is the source of truth for a song. The app stores the text exactly as typed and renders every view from it. The app rewrites a user's text only when asked to: by Format, or by an edit made on the drawn chart (a bar typed there, a bar or a section added, duplicated, renamed or deleted), which rewrites the section it touches in the formatter's layout and leaves the rest of the text as it was.

## 1. Design goals

1. Fast to type on a laptop. Simple songs look simple.
2. Usable on a phone with one extra row of keys: `|  .  %  #  b  /  :  [  ]`.
3. Style-neutral. A chart says what the harmony is, not how a genre plays it.
4. Forgiving. One bad token never breaks the rest of the chart.
5. Easy for an agent to read and write.

## 2. A complete example

```
title: Blues in F
key: F
tempo: 120
style: blues

[A]
| F7  | Bb7 | F7    | %      |
| Bb7 | %   | F7    | D7     |
| Gm7 | C7  | F7 D7 | Gm7 C7 |
```

## 3. File structure

A chart is a header followed by one or more sections.

- Blank lines are ignored everywhere.
- `//` starts a comment that runs to the end of the line. It must be at the start of a line, preceded by whitespace, or directly after a bar line.
- Column alignment and extra spaces are cosmetic.

### 3.1 Header

`name: value` lines at the top of the file, before the first section or bar line.

| Field | Value | Default |
|---|---|---|
| `title` | free text | `Untitled` |
| `key` | root plus optional `m` for minor: `C`, `Bb`, `F#m` | see below |
| `tempo` | pulses per minute, integer: see below | from the style |
| `meter` | `n/d`, with `d` one of 2, 4, 8 | `4/4` |
| `style` | a style pack id | chosen in the app |

- Unknown fields are preserved and ignored, with an info diagnostic.
- A line in the header that is neither `name: value` nor chords (a title typed without `title:`, `tempo 120` without its colon) is an error on that line. The header continues after it.
- **Key.** Required if the chart uses numerals (an error on each numeral otherwise). If absent in a chart of absolute chords, the parser warns and uses the root of the first chord as the tonic, major unless that chord has a minor third. Endings and numeral display depend on the key, so charts should state it.
- Only major and minor keys in version 1. No modes.
- **Tempo.** The figure counts the pulse the meter is felt in, as a metronome mark does.
  - In 3/8, 6/8, 9/8 and 12/8, where the eighths go in threes, the pulse is the dotted quarter. `meter: 12/8` with `tempo: 60` is 60 dotted quarters a minute: four to the bar, a bar every four seconds.
  - In every meter over 4 (3/4, 4/4, 5/4, 6/4) it is the quarter note. `meter: 6/4` with `tempo: 138` is 138 quarter notes a minute, six to the bar.
  - In the other meters over 8 (5/8, 7/8) the pulses are uneven, two eighths or three, and the figure counts the quarter note, the short pulse: 7/8 at 120 is 4/4 at 120 with an eighth missing.
  - In a meter over 2 (2/2, 3/2) it counts the quarter note too. The band plays a bar of 2/2 as four quarter notes.
  - A chart has one tempo. It counts the pulse of the header's meter; a section in another meter keeps the eighth note at the same speed.
- **Meter.** Six can be written two ways, and they are different music. `6/8` is two slow beats to the bar, three eighths in each. `6/4` is six beats to the bar, a waltz twice. Write the one that is counted, and the tempo counts the same thing.

### 3.2 Sections

A section starts with a label in square brackets on its own line, followed by its bars.

```
[Verse]
| C | Am | F | G |
```

- Labels are free text: `[A]`, `[Verse 1]`, `[Bridge]`.
- A chart with bars and no section header has one implicit section labeled `A`. In a chart that does have headers, bars before the first one form a section with no label.
- **Overrides.** Header-style lines directly after a section label apply to that section only. Allowed: `key`, `meter`.

  ```
  [Bridge]
  key: Ab
  | ii7 | V7 | Imaj7 | % |
  ```

- **References.** A section header with no bars repeats the earlier section with the same label. A 32-bar AABA is 16 bars of typing:

  ```
  [A]
  | ... eight bars ... |
  [A]
  [B]
  | ... eight bars ... |
  [A]
  ```

  A reference to a label that has not been defined is an error. Defining bars under a label that already has bars is an error, and the section plays its first definition; use a distinct label (`Verse 2`). Labels match without regard to case. A reference may carry its own `key:` (it plays transposed) but not its own `meter:`.

- **Reserved labels** (case-insensitive) have roles in jam mode:
  - `Intro`: played once at the start, not looped. Only intro sections before the first body section count; a later one is part of the body.
  - `Outro`, `Ending`, `Coda`, `Tag`: played once at the end, replacing the style's generated ending.
  - Everything else is the body, which loops.
  - A reserved word followed by a number (`Intro 2`, `Tag 2`) keeps its role. Anything longer (`Intro vamp`) is body.

  In song mode, all sections play once in file order.

## 4. Bars

Bars are separated by `|`.

- Leading and trailing `|` on a line are optional.
- A run of `|` characters (`||`) counts as one bar line. Bar lines with only spaces between them (`| |`) also make no bar, with a warning: use `%` or `.` for a bar that repeats or holds.
- A line break also ends a bar.
- Four bars per line is conventional and not required.

### 4.1 Slots: rhythm inside a bar

One rule: **the tokens in a bar divide it into equal slots.**

```
| Cmaj7 |            one chord, whole bar
| Dm7 G7 |           two slots: half a bar each
| C . . G |          four slots: C for three, G for one
| C . F G |          C for two, F for one, G for one
```

- A chord occupies its slot.
- `.` extends the chord before it by one slot. At the start of a bar, it extends the chord sounding from the previous bar.

**Valid slot counts.** For a meter with numerator `n`, a bar may have a number of slots that either divides `n` or equals `n` times a power of two.

| Meter | Valid slot counts |
|---|---|
| 4/4 | 1, 2, 4, 8, 16 |
| 3/4 | 1, 3, 6, 12 |
| 6/8 | 1, 2, 3, 6, 12 |
| 6/4 | 1, 2, 3, 6, 12 |
| 12/8 | 1, 2, 3, 4, 6, 12, 24 |
| 5/4 | 1, 5, 10 |

The rule is the definition; the table shows the common counts. Any other count is an error on that bar. Two chords in 3/4 must say how they split: `| C . G |`.

### 4.2 Other bar tokens

| Token | Meaning |
|---|---|
| `%` | Repeat the bar played before it, in the same section. Must be alone in its bar. After a repeat, that is the last bar the repeat played; at the start of an ending, the last bar before the endings. |
| `NC` | No chord. Also accepted: `N.C.`, `nc`. Occupies a slot like a chord. |
| `!word` | Reserved for hits and stops (`!stop`, `!hit`). Version 1 parses and ignores these with an info diagnostic. They do not occupy a slot. |

### 4.3 Harmony is written on the beat

Do not notate idiomatic pushes. Anticipating a chord change is the style's job, and writing it into the chart makes the chart wrong in every other style.

Composed syncopation that is part of a song's identity can be written by subdividing:

```
| C . . G . . . . |        eight slots: G arrives on the "and" of 2
| F . . . . . . G | G |    G arrives an eighth before the bar line
```

This is intentionally verbose.

## 5. Repeats and endings

Borrowed from common notation and kept to one level.

```
|: Dm7 | G7 | Cmaj7 | A7 :|              play twice
|: Dm7 | G7 | Cmaj7 | A7 :| x4           play four times in total

|: Dm7 | G7 |1 Cmaj7 | A7 :|2 Cmaj7 | % |
```

- `|:` opens a repeat and `:|` closes it. Default is two times. `xN` after `:|` sets the total count (1 to 99). A repeat with numbered endings takes its count from them, and `xN` there is an error.
- `|1` begins a first ending. `:|2` closes the repeat and begins the second ending, which runs to the end of the line or the next section. More endings (`:|3`) follow the same pattern.
- The ending number must touch the bar line with no space.
- Repeats do not nest and do not cross section boundaries.
- Because the last ending runs to the end of its line, line breaks carry meaning there. The formatter keeps an ending's bars on one line.

## 6. Chords

A chord is either absolute or a numeral. Both may appear in the same chart.

### 6.1 Absolute chords

`root` `quality` optionally `/bass`

- **Root:** `A` to `G`, uppercase, optionally followed by `#` or `b`. The characters `♯` and `♭` are accepted.
- **Bass:** a note name after a slash: `C/E`, `Dm7/G`.

### 6.2 Numerals

`accidental` `numeral` `quality` optionally `/target` or `/degree`

- **Numeral:** `I` to `VII` or `i` to `vii`.
- **Accidental:** `b` or `#` before the numeral: `bVII`, `#iv`.
- **Reference scale.** Numerals are always measured from the tonic against the major scale, in major and minor keys alike. In A minor: `i  bIII  iv  v  bVI  bVII`. There is no relative-major interpretation.
- **Case sets the third.** Uppercase is major, lowercase is minor. The quality suffix is then applied on top:

  | Written | Meaning |
  |---|---|
  | `I` | major triad |
  | `ii` | minor triad |
  | `V7` | dominant seventh |
  | `ii7` | minor seventh |
  | `Imaj7` | major seventh |
  | `imaj7` | minor-major seventh |
  | `viio7`, `vii°7` | diminished seventh |
  | `iiø7` | half-diminished |
  | `IIm7` | minor seventh (an explicit `m` after uppercase is allowed) |

- **Secondary function.** A slash followed by a numeral means "of": `V7/ii` is the dominant of the two chord.
- **Bass note.** A slash followed by an Arabic scale degree (1 to 7, optional accidental) sets the bass: `I/3`, `IV/1`, `I/5`. Degrees are measured from the tonic, same as numerals.

### 6.3 Qualities

Input is lenient. Display is canonical. Matching is case-sensitive (`M` is major, `m` is minor).

| Canonical | Also accepted |
|---|---|
| (major triad) | `M`, `maj` |
| `m` | `min`, `mi`, `-` |
| `dim` | `o`, `°` |
| `aug` | `+` |
| `5` | |
| `sus4` | `sus` |
| `sus2` | |
| `6` | |
| `m6` | `min6`, `-6` |
| `69` | `6/9` |
| `m69` | `m6/9` |
| `add9` | `add2` |
| `madd9` | |
| `7` | |
| `maj7` | `M7`, `ma7`, `^7`, `^`, `Δ`, `Δ7` |
| `m7` | `min7`, `mi7`, `-7` |
| `mMaj7` | `m(maj7)`, `mM7`, `m^7`, `-^7` |
| `m7b5` | `ø`, `ø7`, `h`, `h7`, `min7b5`, `-7b5` |
| `dim7` | `o7`, `°7` |
| `7sus4` | `7sus` |
| `9`, `maj9`, `m9` | same alternates as the sevenths |
| `11`, `m11` | same alternates as the sevenths |
| `13`, `maj13`, `m13` | same alternates as the sevenths |
| `9sus4`, `13sus4` | `9sus`, `13sus` |
| `7alt` | `alt` |
| `7#5` | `+7`, `aug7` |

**Alterations** may follow a seventh-family quality, in any order, with or without parentheses and commas: `C7b9`, `C7(b9,#11)`, `C7#9b13`, `Cmaj7#11`, `Cmaj7#5`, `Cm7b5`. Recognized: `b5`, `#5`, `b9`, `#9`, `#11`, `b13`.

**Not in version 1:** polychords, `omit` and `no3`, quartal voicings, arbitrary added tones.

### 6.4 Parsing rules that remove ambiguity

- **An accidental binds to the root first.** `Bb7` is B-flat seven. `Bb5` is a B-flat power chord. `Eb9` is E-flat nine.
- **An alteration directly after a root needs parentheses.** B with a flat five is `B(b5)`. E with a flat nine is `E7b9` or `E(b9)`.
- **`6/9` is a quality**, not a slash chord. A slash followed by `9` is never a bass.
- **Slash targets are told apart by what follows:** a note name is a bass note, a roman numeral is a secondary function, a digit 1 to 7 is a bass degree.
- **Roman numerals use only `I` and `V` letters**, so they never collide with note names.

## 7. Diagnostics

The parser never throws on user input. It returns a chart and a list of diagnostics, each with a severity (error, warning, info), a message a musician can act on, and a source range.

| Problem | Behavior |
|---|---|
| Unrecognized chord token | Error on the token. The slot holds the previous chord, or no chord if there is none. |
| Invalid slot count | Error on the bar. The bar plays its first chord for the whole bar. |
| `%` with other tokens, or with no previous bar | Error on the bar. Treated as no chord. |
| Numeral without a key | Error on the token. Treated as unrecognized. |
| Unknown or duplicate section label | Error on the header line. The section is skipped (unknown) or kept as first defined (duplicate). |
| Unclosed repeat | Error. The repeat closes at the end of the section. |
| Missing key | Warning. Fallback as described in 3.1. |
| A stray line in the header | Error on the line. The header continues. |
| Nothing between two spaced bar lines | Warning. No bar is made. |
| `xN` away from `:|`, or on a repeat with numbered endings | Error. It occupies no bar. |
| A header-style line among the bars | Error. Ignored when playing. |

The formatter never deletes a chord, a comment, or a field line, including the ones the parser ignores.

A chart with errors still plays.

## 8. The parsed model

The exact types are the implementer's call. Requirements:

- Every chord keeps three things: the text as typed, its absolute spelling in the section's key, and its degree and quality relative to the key. Display as names, numerals, or both is derived from these.
- Spelling. A note at a degree of the key is spelled by letter (bIII in C is Eb), unless that needs a double accidental or gives Cb, Fb, E#, or B# where the key's own scale has no such note; then it takes the plain enharmonic (bVI in Db is A). Reading a typed name back into a degree is the inverse of this, so a chart survives transposition through text and back.
- Transposition is a change of key, after which absolute spellings are recomputed. A section's own key moves by the same interval and takes its conventional spelling (Db, not C#). Chords typed as absolute names are re-spelled; the stored text can be rewritten only by an explicit "transpose and rewrite" action.
- Repeats, endings, `%`, and section references are preserved in the model for display, and a separate function expands them into a flat list of bars for the planner.
- Every node keeps its source range, for diagnostics and for linking the playhead to the text.

## 9. Canonical printing

`fmt` prints a chart in normalized form: canonical quality spellings, one space between tokens, bars padded to align in columns, four bars per line unless the source used another consistent width. It preserves the author's choice of names versus numerals, comments, unknown header fields, and section structure.

Round trip: parsing the printed form of a chart yields the same model as parsing the original.

## 10. More examples

**AABA in numerals, 32 bars from 16 typed:**

```
title: Rhythm-style changes
key: Bb
tempo: 180
style: jazz

[A]
| I vi7   | ii7 V7     | iii7 VI7 | ii7 V7 |
| I I7    | IV #ivo7   | I/5 V7   | I      |
[A]
[B]
| III7 | % | VI7 | % |
| II7  | % | V7  | % |
[A]
```

**Minor key, mixed names and numerals:**

```
title: Minor vamp
key: Am

| i | bVII | bVI | E7 |
```

**Waltz with an uneven bar:**

```
title: Waltz sketch
key: G
meter: 3/4

| G | Em | C . D | G |
```

**A slow blues in twelve, 60 dotted quarters a minute, its turnaround a chord a beat:**

```
title: Slow blues sketch
key: G
tempo: 60
meter: 12/8

| G7 | C7 | G7 G7/B C7 C#dim7 | G7/D D7 |
```

**Intro, looping body, and a written ending:**

```
title: Two-chord groove
key: Em
style: funk

[Intro]
| Em7 | % | % | % |

[A]
|: Em7 | A7 :| x4

[Outro]
| Em7 | A7 | Em9 | . |
```

## 11. Arrangement block

Layer two: who plays in each section of the song, and how hard. It is optional, it is edited mainly through the grid in the app, and it is read in song mode only. A jam's shape is the band's to plan.

```
--- arrangement
//       energy  drums  bass  chords  solo
Intro    1       .      -     -       .
Verse    2       -      -     -       .
Chorus   4       -      -     -       .
Verse 2  2       -      -     -       .
Solo     3       -      -     -       -
Chorus   4       -      -     -       -
Outro    2       1      -     -       .
```

- The block starts at a line `--- arrangement` and runs to the end of the file.
- **One line for each section the song plays, in the order it plays them.** A section that comes round twice has two lines. (The provisional design had sections across and players down, as the grid shows them. As text that grows sideways with the song and cannot hold a label with a space in it, so the text is turned on its side. The grid is not.)
- A line is the section's label, then five values: the section's energy, then drums, bass, chords and solo. The values are read from the right, so a label may have spaces.
- **Energy** is `1` to `4`, or `-` for the level the style gives a section of that name. `1` is the band at its quietest, `2` and `3` are its ordinary playing at two strengths, `4` is flat out. Where a style changes its groove for its loudest playing, `4` is that groove.
- **A player's value** is `-` to play at the section's energy, `1` to `4` to play at a level of its own, or `.` to lay out.
- **The soloist** has the lead in every section where its value is not `.`. An arrangement the app writes starts with the soloist where it plays in a song with no arrangement: in the sections labelled `Solo` when the song has any, and otherwise everywhere but an intro and a written ending.
- A block of nothing but `-` for the band plays the band exactly as the chart does without one.
- Comments (`//`) and blank lines are allowed. The canonical form writes the heading comment and aligns the columns.
- A player switched off on the play screen stays off, whatever the block says. The block decides where the soloist plays; the play screen decides whether there is one.

Diagnostics:

| Problem | What happens |
|---|---|
| A line that is not a label and five values, or a value that is not `-`, `.` or `1` to `4` | Error on the line or the value. The value counts as `-`, and formatting leaves the block as typed. |
| The lines do not match the song: a different number of them, or a label that is not the label of the section played at that place (case does not matter) | Warning on the first line that does not fit, saying what the song plays there. The block is kept and not used, since nobody can say which section a line was meant for. The grid in the app lines it up again. |
| `---` followed by anything but `arrangement` | Info on the line. The text from there on is kept and not read. |

## 12. Reserved for later

- `!` annotations for hits and stops.
- Nashville digits as an alternative to roman numerals. Note the interaction with ending markers: an ending number touches the bar line, so digit chords would need a space after it.
- Tempo changes within a song.
- Modes other than major and minor.
