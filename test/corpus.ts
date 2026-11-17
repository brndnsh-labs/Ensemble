// The chart format, illustrated: every rule and every example of
// docs/CHART_FORMAT.md as a chart and what it must come to. Read top to bottom
// alongside the spec; the headings follow its sections.
//
// A row's `bars` are the song as played, in ticks (480 to a quarter note):
//   "C:1440 G:480 | ~G:1920 | NC:1920"
// is three bars: C for three beats then G for one; G held over the bar line
// (`~` is a tie: the chord is not struck again); a bar of no chord.
// Chords are shown by their absolute spelling, so a numeral row proves how the
// numeral resolved.

export interface Row {
  /** The rule of the format this row demonstrates. */
  readonly name: string;
  readonly text: string;
  /** The song as played. An array is joined with bar lines, to keep long charts readable. */
  readonly bars: string | readonly string[];
  /**
   * Exactly these, in order of position. Each is severity, where, and a
   * fragment of the message. Where is a line, or `"line:column"` to pin the column too.
   */
  readonly diagnostics?: readonly (readonly [
    "error" | "warning" | "info",
    number | `${number}:${number}`,
    string,
  ])[];
  /** The canonical printing (`fmt`). */
  readonly print?: string;
  /** The bars shown as numerals, without durations. */
  readonly numerals?: string;
  /** Resolved header values; only the ones given are checked. */
  readonly header?: {
    readonly title?: string;
    readonly key?: string;
    readonly tempo?: number | null;
    readonly meter?: string;
    readonly style?: string | null;
  };
  /** For each bar played, the section it is played under and that section's key and meter: `A in C 4/4`. */
  readonly places?: readonly string[];
  /** Each section as `label: role, key, meter`. */
  readonly sections?: readonly string[];
  /** What jam mode gets: the intro, the looping body, and the written ending. */
  readonly jam?: { readonly intro: string; readonly body: string; readonly ending: string };
  /** The canonical printing after a change of key. */
  readonly transposed?: { readonly to: string; readonly print: string };
  /**
   * Keys to visit in turn, each time by transposing, printing, and parsing the
   * printed text. Brought back to its own key the same way, the chart must
   * print exactly as it did before it left.
   */
  readonly thereAndBack?: readonly string[];
}

/** A chart written as an indented block. The common indent is removed. */
function chart(strings: TemplateStringsArray): string {
  const lines = strings.join("").split("\n");
  if (lines[0]?.trim() === "") lines.shift();
  if (lines.at(-1)?.trim() === "") lines.pop();
  const indents = lines.filter((l) => l.trim() !== "").map((l) => l.length - l.trimStart().length);
  const indent = Math.min(...indents);
  return `${lines.map((l) => l.slice(indent)).join("\n")}\n`;
}

/** One line of bars in C major. */
const inC = (bars: string): string => `key: C\n${bars}\n`;

// ── 2. A complete example ───────────────────────────────────────────────────

const completeExample: Row[] = [
  {
    name: "a complete chart: a header, one section, twelve bars (spec 2)",
    text: chart`
      title: Blues in F
      key: F
      tempo: 120
      style: blues

      [A]
      | F7  | Bb7 | F7    | %      |
      | Bb7 | %   | F7    | D7     |
      | Gm7 | C7  | F7 D7 | Gm7 C7 |
    `,
    bars: [
      "F7:1920 | Bb7:1920 | F7:1920 | F7:1920",
      "Bb7:1920 | Bb7:1920 | F7:1920 | D7:1920",
      "Gm7:1920 | C7:1920 | F7:960 D7:960 | Gm7:960 C7:960",
    ],
    header: { title: "Blues in F", key: "F", tempo: 120, meter: "4/4", style: "blues" },
    sections: ["A: body, F, 4/4"],
    print: chart`
      title: Blues in F
      key: F
      tempo: 120
      style: blues

      [A]
      | F7  | Bb7 | F7    | %      |
      | Bb7 | %   | F7    | D7     |
      | Gm7 | C7  | F7 D7 | Gm7 C7 |
    `,
    numerals: "I7 | IV7 | I7 | I7 | IV7 | IV7 | I7 | VI7 | ii7 | V7 | I7 VI7 | ii7 V7",
  },
];

// ── 3. File structure ───────────────────────────────────────────────────────

const fileStructure: Row[] = [
  {
    name: "blank lines are ignored everywhere",
    text: "title: Blanks\n\nkey: C\n\n\n[A]\n\n| C | F |\n\n| G | C |\n\n",
    bars: "C:1920 | F:1920 | G:1920 | C:1920",
    print: chart`
      title: Blanks
      key: C

      [A]
      | C | F |
      | G | C |
    `,
  },
  {
    name: "a comment starts with // at the start of a line or after a space, and runs to the end of the line",
    text: chart`
      // a chart with comments
      key: C
      [A] // the only section
      | C | F | // first line
      // between the lines
      | G | C |
    `,
    bars: "C:1920 | F:1920 | G:1920 | C:1920",
    print: chart`
      // a chart with comments
      key: C

      [A] // the only section
      | C | F | // first line
      // between the lines
      | G | C |
    `,
  },
  {
    name: "// inside a word is not a comment",
    text: "title: AC//DC\nkey: C\n| C |\n",
    bars: "C:1920",
    header: { title: "AC//DC" },
  },
  {
    name: "// touching the colon of a field is not a comment either, and stays touching it when printed",
    text: "title://nowhere\nkey: C\n| C |\n",
    bars: "C:1920",
    header: { title: "//nowhere" },
    print: "title://nowhere\nkey: C\n\n| C |\n",
  },
  {
    name: "a byte-order mark at the start of the file is ignored",
    text: "\uFEFFkey: C\n| C |\n",
    bars: "C:1920",
    header: { key: "C" },
    print: "key: C\n\n| C |\n",
  },
  {
    name: "column alignment, extra spaces, and tabs are cosmetic",
    text: "key:\tC\n|C|F\t|   G   |C|\n",
    bars: "C:1920 | F:1920 | G:1920 | C:1920",
    print: "key: C\n\n| C | F | G | C |\n",
  },
  {
    name: "Windows line endings read the same as any other",
    text: "key: C\r\n| C | F |\r\n| G | C |\r\n",
    bars: "C:1920 | F:1920 | G:1920 | C:1920",
    print: "key: C\n\n| C | F |\n| G | C |\n",
  },

  // 3.1 Header
  {
    name: "header defaults: Untitled, 4/4, tempo and style left to the app",
    text: inC("| C |"),
    bars: "C:1920",
    header: { title: "Untitled", key: "C", tempo: null, meter: "4/4", style: null },
  },
  {
    name: "header: title is free text",
    text: "title: Don't Stop (live, 2nd take)\nkey: C\n| C |\n",
    bars: "C:1920",
    header: { title: "Don't Stop (live, 2nd take)" },
  },
  {
    name: "header: key C is C major",
    text: "key: C\n| I | IV | V |\n",
    bars: "C:1920 | F:1920 | G:1920",
    header: { key: "C" },
  },
  {
    name: "header: key Bb takes a flat",
    text: "key: Bb\n| I | IV | V |\n",
    bars: "Bb:1920 | Eb:1920 | F:1920",
    header: { key: "Bb" },
  },
  {
    name: "header: key F#m is a sharp root and m for minor",
    text: "key: F#m\n| i | iv | V7 |\n",
    bars: "F#m:1920 | Bm:1920 | C#7:1920",
    header: { key: "F#m" },
  },
  {
    name: "header: a key may spell out minor or major, and prints in the short form",
    text: "key: A minor\n| i | iv |\n[B]\nkey: C major\n| I |\n",
    bars: "Am:1920 | Dm:1920 | C:1920",
    header: { key: "Am" },
    print: "key: Am\n\n| i | iv |\n\n[B]\nkey: C\n| I |\n",
  },
  {
    name: "header: tempo is a whole number of beats per minute",
    text: "key: C\ntempo: 96\n| C |\n",
    bars: "C:1920",
    header: { tempo: 96 },
  },
  {
    name: "header: a tempo that is not a whole number is an error, and the style's tempo stands",
    text: "key: C\ntempo: fast\n| C |\n",
    bars: "C:1920",
    header: { tempo: null },
    diagnostics: [["error", 2, "is not a tempo"]],
    print: "key: C\ntempo: fast\n\n| C |\n",
  },
  {
    name: "header: tempo runs from 1 to 999, and meter from 1 to 32 beats",
    text: "key: C\ntempo: 1200\nmeter: 64/4\n| C |\n",
    bars: "C:1920",
    header: { tempo: null, meter: "4/4" },
    diagnostics: [
      ["error", 2, "is not a tempo"],
      ["error", 3, "is not a meter"],
    ],
  },
  {
    name: "header: meter n/2",
    text: "key: C\nmeter: 2/2\n| C G |\n",
    bars: "C:960 G:960",
    header: { meter: "2/2" },
  },
  {
    name: "header: meter n/4",
    text: "key: C\nmeter: 3/4\n| C |\n",
    bars: "C:1440",
    header: { meter: "3/4" },
  },
  {
    name: "header: meter n/8",
    text: "key: C\nmeter: 6/8\n| C G |\n",
    bars: "C:720 G:720",
    header: { meter: "6/8" },
  },
  {
    name: "header: a meter over anything but 2, 4, or 8 is an error, and the chart is read in 4/4",
    text: "key: C\nmeter: 4/16\n| C |\n",
    bars: "C:1920",
    header: { meter: "4/4" },
    diagnostics: [["error", 2, "is not a meter"]],
  },
  {
    name: "header: style is a style pack id",
    text: "key: C\nstyle: bossa-nova\n| C |\n",
    bars: "C:1920",
    header: { style: "bossa-nova" },
  },
  {
    name: "header: an unknown field is kept and ignored, with a note",
    text: "title: Tune\ncomposer: B. Example\nkey: C\n| C |\n",
    bars: "C:1920",
    diagnostics: [["info", 2, "not a field this version knows"]],
    print: "title: Tune\ncomposer: B. Example\nkey: C\n\n| C |\n",
  },
  {
    name: "header: field names are not case-sensitive, and print in lowercase",
    text: "Title: Caps\nKEY: G\n| G |\n",
    bars: "G:1920",
    header: { title: "Caps", key: "G" },
    print: "title: Caps\nkey: G\n\n| G |\n",
  },
  {
    name: "header: a field set twice keeps its first value, with a warning",
    text: "key: C\nkey: G\n| I |\n",
    bars: "C:1920",
    diagnostics: [["warning", 2, "already set above"]],
    print: "key: C\nkey: G\n\n| I |\n",
  },
  {
    name: "header: a key that is not a note name is an error",
    text: "key: H\n| C | F |\n",
    bars: "C:1920 | F:1920",
    diagnostics: [["error", 1, "is not a key"]],
  },
  {
    name: "key: without a key line, absolute chords are read in the major key of the first chord, with a warning",
    text: "| A7 | D7 | E7 |\n",
    bars: "A7:1920 | D7:1920 | E7:1920",
    header: { key: "A" },
    diagnostics: [["warning", 1, "read in A major"]],
    numerals: "I7 | IV7 | V7",
  },
  {
    name: "key: without a key line, a minor first chord makes the key minor",
    text: "| Am7 | Dm7 | E7 |\n",
    bars: "Am7:1920 | Dm7:1920 | E7:1920",
    header: { key: "Am" },
    diagnostics: [["warning", 1, "read in A minor"]],
  },
  {
    name: "key: a numeral without a key is an error on each numeral",
    text: "| I | IV |\n",
    bars: "NC:1920 | ~NC:1920",
    diagnostics: [
      ["error", 1, "numerals need a key"],
      ["error", 1, "numerals need a key"],
    ],
  },
  {
    name: "key: without a key line, a first chord with a minor third of any kind makes the key minor: half-diminished",
    text: "| Bm7b5 | E7 | Am |\n",
    bars: "Bm7b5:1920 | E7:1920 | Am:1920",
    header: { key: "Bm" },
    diagnostics: [["warning", "1:3", "read in B minor"]],
  },
  {
    name: "key: without a key line, a diminished first chord makes the key minor too",
    text: "| Bdim7 | C |\n",
    bars: "Bdim7:1920 | C:1920",
    header: { key: "Bm" },
    diagnostics: [["warning", 1, "read in B minor"]],
  },

  // Slips in the header. Before any bars, a line is bars only if it has a bar
  // line or every word on it could stand in a bar.
  {
    name: "a header line missing its colon is one error on that line, kept in the text, and the header goes on",
    text: chart`
      title: X
      tempo 120
      key: G

      [A]
      | I | IV | V | I |
    `,
    bars: "G:1920 | C:1920 | D:1920 | G:1920",
    header: { title: "X", key: "G", tempo: null },
    sections: ["A: body, G, 4/4"],
    diagnostics: [["error", "2:1", "Did you mean `tempo: 120`?"]],
    print: chart`
      title: X
      tempo 120
      key: G

      [A]
      | I | IV | V | I |
    `,
  },
  {
    name: "a title typed without title: is a header mistake, not the start of the bars",
    text: chart`
      Blues in F
      key: F

      [A]
      | I7 | IV7 | I7 | % |
    `,
    bars: "F7:1920 | Bb7:1920 | F7:1920 | F7:1920",
    header: { title: "Untitled", key: "F" },
    diagnostics: [["error", "1:1", "neither a `name: value` line nor chords"]],
    print: chart`
      Blues in F
      key: F

      [A]
      | I7 | IV7 | I7 | % |
    `,
  },
  {
    name: "a field name of two words is a header mistake, and the lines after it still count",
    text: "title: Foo\ncomposer name: Bob // who?\nkey: C\n| I | IV | V | I |\n",
    bars: "C:1920 | F:1920 | G:1920 | C:1920",
    header: { title: "Foo", key: "C" },
    diagnostics: [["error", 2, "neither a `name: value` line nor chords"]],
    print: "title: Foo\ncomposer name: Bob // who?\nkey: C\n\n| I | IV | V | I |\n",
  },
  {
    name: "a first line of chords with no bar line is still bars, when every word on it is a chord",
    text: "key: C\nC . Am F\n| G |\n",
    bars: "C:960 Am:480 F:480 | G:1920",
    print: "key: C\n\n| C . Am F |\n| G        |\n",
  },
];

// ── 3.2 Sections ────────────────────────────────────────────────────────────

const sections: Row[] = [
  {
    name: "a section is a label in square brackets on its own line, followed by its bars (spec 3.2)",
    text: inC("[Verse]\n| C | Am | F | G |"),
    bars: "C:1920 | Am:1920 | F:1920 | G:1920",
    sections: ["Verse: body, C, 4/4"],
  },
  {
    name: "section labels are free text: [A], [Verse 1], [Bridge]",
    text: "key: C\n[A]\n| C |\n[Verse 1]\n| F |\n[Bridge]\n| G |\n",
    bars: "C:1920 | F:1920 | G:1920",
    sections: ["A: body, C, 4/4", "Verse 1: body, C, 4/4", "Bridge: body, C, 4/4"],
    print: "key: C\n\n[A]\n| C |\n\n[Verse 1]\n| F |\n\n[Bridge]\n| G |\n",
  },
  {
    name: "bars with no section header are one section labeled A, and print without a label",
    text: inC("| C | F |"),
    bars: "C:1920 | F:1920",
    sections: ["A: body, C, 4/4"],
    print: "key: C\n\n| C | F |\n",
  },
  {
    name: "bars before the first label are a section of their own with no label, which a label below cannot collide with",
    text: "key: C\n| C | G |\n[A]\n| F | G |\n",
    bars: "C:1920 | G:1920 | F:1920 | G:1920",
    sections: [": body, C, 4/4", "A: body, C, 4/4"],
    places: [" in C 4/4", " in C 4/4", "A in C 4/4", "A in C 4/4"],
    print: "key: C\n\n| C | G |\n\n[A]\n| F | G |\n",
  },
  {
    name: "unlabeled bars, then labeled sections, with no key line: every bar plays, in the key of the first chord",
    text: "| C | G |\n[A]\n| F | G |\n[B]\n| Am | % |\n",
    bars: "C:1920 | G:1920 | F:1920 | G:1920 | Am:1920 | Am:1920",
    header: { key: "C" },
    diagnostics: [["warning", "1:3", "read in C major"]],
  },
  {
    name: "a key line directly under a label applies to that section only (spec 3.2)",
    text: chart`
      [Bridge]
      key: Ab
      | ii7 | V7 | Imaj7 | % |
    `,
    bars: "Bbm7:1920 | Eb7:1920 | Abmaj7:1920 | Abmaj7:1920",
    sections: ["Bridge: body, Ab, 4/4"],
  },
  {
    name: "a section's key ends with the section: the next one is back in the chart's key",
    text: "key: C\n[A]\n| I | V |\n[Bridge]\nkey: Ab\n| I | V |\n[C]\n| I | V |\n",
    bars: "C:1920 | G:1920 | Ab:1920 | Eb:1920 | C:1920 | G:1920",
    sections: ["A: body, C, 4/4", "Bridge: body, Ab, 4/4", "C: body, C, 4/4"],
    print: "key: C\n\n[A]\n| I | V |\n\n[Bridge]\nkey: Ab\n| I | V |\n\n[C]\n| I | V |\n",
  },
  {
    name: "a meter line directly under a label applies to that section only",
    text: "key: C\n[A]\n| C G |\n[Waltz]\nmeter: 3/4\n| C . G |\n",
    bars: "C:960 G:960 | C:960 G:480",
    sections: ["A: body, C, 4/4", "Waltz: body, C, 3/4"],
    places: ["A in C 4/4", "Waltz in C 3/4"],
  },
  {
    name: "a section's field line missing its colon is an error on that line, and does not become a bar",
    text: "key: C\n[Bridge]\nkey Ab\n| ii7 | V7 |\n",
    bars: "Dm7:1920 | G7:1920",
    sections: ["Bridge: body, C, 4/4"],
    diagnostics: [["error", "3:1", "Did you mean `key: Ab`?"]],
    print: "key: C\n\n[Bridge]\nkey Ab\n| ii7 | V7 |\n",
  },
  {
    name: "only key and meter can be set for one section; any other field there is an error, kept and ignored",
    text: "key: C\n[A]\ntempo: 90\n| C |\n",
    bars: "C:1920",
    header: { tempo: null },
    diagnostics: [["error", 3, "Only `key` and `meter`"]],
    print: "key: C\n\n[A]\ntempo: 90\n| C |\n",
  },
  {
    name: "a section header with no bars repeats the earlier section with that label: AABA from half the typing (spec 3.2)",
    text: chart`
      key: C
      [A]
      | C | Am |
      [A]
      [B]
      | F | G |
      [A]
    `,
    bars: ["C:1920 | Am:1920", "C:1920 | Am:1920", "F:1920 | G:1920", "C:1920 | Am:1920"],
    sections: ["A: body, C, 4/4", "A: body, C, 4/4", "B: body, C, 4/4", "A: body, C, 4/4"],
    print: "key: C\n\n[A]\n| C | Am |\n\n[A]\n\n[B]\n| F | G |\n\n[A]\n",
  },
  {
    name: "labels match without regard to case or spacing: [verse  1] repeats [Verse 1]",
    text: "key: C\n[Verse 1]\n| C | F |\n[verse  1]\n",
    bars: "C:1920 | F:1920 | C:1920 | F:1920",
  },
  {
    name: "a repeated section keeps the key of the section it repeats",
    text: "key: C\n[Bridge]\nkey: Ab\n| I | V |\n[A]\n| I |\n[Bridge]\n",
    bars: "Ab:1920 | Eb:1920 | C:1920 | Ab:1920 | Eb:1920",
    sections: ["Bridge: body, Ab, 4/4", "A: body, C, 4/4", "Bridge: body, Ab, 4/4"],
  },
  {
    name: "a repeated section with its own key line plays in that key, every chord keeping its degree",
    text: "key: C\n[A]\n| I | V7 | Am | F/A |\n[A]\nkey: D\n",
    bars: "C:1920 | G7:1920 | Am:1920 | F/A:1920 | D:1920 | A7:1920 | Bm:1920 | G/B:1920",
    sections: ["A: body, C, 4/4", "A: body, D, 4/4"],
    places: [
      "A in C 4/4",
      "A in C 4/4",
      "A in C 4/4",
      "A in C 4/4",
      "A in D 4/4",
      "A in D 4/4",
      "A in D 4/4",
      "A in D 4/4",
    ],
    print: "key: C\n\n[A]\n| I | V7 | Am | F/A |\n\n[A]\nkey: D\n",
  },
  {
    name: "a repeated section keeps its meter: a meter line under it is an error",
    text: "key: C\n[A]\n| C G |\n[A]\nmeter: 3/4\n",
    bars: "C:960 G:960 | C:960 G:960",
    sections: ["A: body, C, 4/4", "A: body, C, 4/4"],
    diagnostics: [["error", 5, "keeps the meter"]],
  },
  {
    name: "a reference to a label that has not been defined is an error on the header line, and the section is skipped",
    text: "key: C\n[A]\n| C |\n[B]\n[C]\n| G |\n",
    bars: "C:1920 | G:1920",
    diagnostics: [["error", "4:1", "no section above is labeled `B`"]],
    print: "key: C\n\n[A]\n| C |\n\n[B]\n\n[C]\n| G |\n",
  },
  {
    name: "bars under a label that already has bars are an error on the header line: the first definition is played there, and the new bars are kept in the text",
    text: "key: C\n[A]\n| C |\n[A]\n| G |\n",
    bars: "C:1920 | C:1920",
    diagnostics: [["error", 4, "already has bars above (line 2)"]],
    print: "key: C\n\n[A]\n| C |\n\n[A]\n| G |\n",
  },
  {
    name: "Intro and Outro are reserved labels, in any case: once at the start, once at the end, around a body that loops",
    text: "key: C\n[intro]\n| C |\n[A]\n| F |\n[OUTRO]\n| G |\n",
    bars: "C:1920 | F:1920 | G:1920",
    sections: ["intro: intro, C, 4/4", "A: body, C, 4/4", "OUTRO: ending, C, 4/4"],
    jam: { intro: "C:1920", body: "F:1920", ending: "G:1920" },
  },
  {
    name: "Ending, Coda, and Tag are reserved labels that end the tune like Outro",
    text: "key: C\n[A]\n| C |\n[Ending]\n| F |\n[Coda]\n| G |\n[Tag]\n| Am |\n",
    bars: "C:1920 | F:1920 | G:1920 | Am:1920",
    sections: [
      "A: body, C, 4/4",
      "Ending: ending, C, 4/4",
      "Coda: ending, C, 4/4",
      "Tag: ending, C, 4/4",
    ],
    jam: { intro: "", body: "C:1920", ending: "F:1920 | G:1920 | Am:1920" },
  },
  {
    name: "a reserved label keeps its role with a number after it (Intro 2, Tag 2), but not with other words (Intro vamp, Introduction)",
    text: "key: C\n[Intro]\n| C |\n[Intro 2]\n| F |\n[Intro vamp]\n| G |\n[Introduction]\n| Am |\n[Tag 2]\n| Dm |\n",
    bars: "C:1920 | F:1920 | G:1920 | Am:1920 | Dm:1920",
    sections: [
      "Intro: intro, C, 4/4",
      "Intro 2: intro, C, 4/4",
      "Intro vamp: body, C, 4/4",
      "Introduction: body, C, 4/4",
      "Tag 2: ending, C, 4/4",
    ],
    jam: { intro: "C:1920 | F:1920", body: "G:1920 | Am:1920", ending: "Dm:1920" },
  },
  {
    name: "in song mode all sections play once in file order, wherever the reserved ones are written",
    text: "key: C\n[Outro]\n| G |\n[Intro]\n| F |\n[A]\n| C |\n",
    bars: "G:1920 | F:1920 | C:1920",
    jam: { intro: "F:1920", body: "C:1920", ending: "G:1920" },
  },
  {
    name: "an Intro is the intro only before the body begins: one that returns after it is part of the body",
    text: "key: C\n[Intro]\n| C | G |\n[A]\n| F | G |\n[Intro]\n[Outro]\n| C |\n",
    bars: "C:1920 | G:1920 | F:1920 | G:1920 | C:1920 | G:1920 | C:1920",
    sections: [
      "Intro: intro, C, 4/4",
      "A: body, C, 4/4",
      "Intro: body, C, 4/4",
      "Outro: ending, C, 4/4",
    ],
    jam: {
      intro: "C:1920 | G:1920",
      body: "F:1920 | G:1920 | C:1920 | G:1920",
      ending: "C:1920",
    },
  },
  {
    name: "bars on the same line as a label are read, with a warning, and print on their own line",
    text: "key: C\n[A] | C | F |\n",
    bars: "C:1920 | F:1920",
    diagnostics: [["warning", 2, "line of its own"]],
    print: "key: C\n\n[A]\n| C | F |\n",
  },
  {
    name: "a label missing its closing bracket is an error, and still starts the section",
    text: "key: C\n[Verse\n| C |\n",
    bars: "C:1920",
    sections: ["Verse: body, C, 4/4"],
    diagnostics: [["error", 2, "missing its closing `]`"]],
    print: "key: C\n\n[Verse]\n| C |\n",
  },
  {
    name: "an empty label is an error",
    text: "key: C\n[]\n| C |\n",
    bars: "C:1920",
    diagnostics: [["error", 2, "label is empty"]],
  },
];

// ── 4. Bars ─────────────────────────────────────────────────────────────────

const dots = (n: number): string => " .".repeat(n);

/** Chords with their lengths, as one row of bars: `timed("C F | G", [960, 960, 1920])`. */
const timed = (chords: string, ticks: readonly number[]): string => {
  let next = 0;
  return chords
    .split(" ")
    .map((word) => (word === "|" ? word : `${word}:${ticks[next++]}`))
    .join(" ");
};

const bars: Row[] = [
  {
    name: "bars are separated by |, and the leading and trailing | on a line are optional",
    text: inC("C | Am | F | G"),
    bars: "C:1920 | Am:1920 | F:1920 | G:1920",
    print: "key: C\n\n| C | Am | F | G |\n",
  },
  {
    name: "a run of | characters counts as one bar line",
    text: inC("|| C || F ||"),
    bars: "C:1920 | F:1920",
    print: "key: C\n\n| C | F |\n",
  },
  {
    name: "bar lines with only spaces between them are one bar line too, with a warning that a bar may be missing",
    text: inC("| C | | | G |"),
    bars: "C:1920 | G:1920",
    diagnostics: [["warning", "2:5", "nothing between these bar lines"]],
    print: "key: C\n\n| C | G |\n",
  },
  {
    name: "a line break also ends a bar",
    text: inC("| C | F\nG | C |"),
    bars: "C:1920 | F:1920 | G:1920 | C:1920",
    print: "key: C\n\n| C | F |\n| G | C |\n",
  },
  {
    name: "four bars per line is conventional and not required: three to a line stays three to a line",
    text: inC("| C | F | G |\n| Am | F | G |"),
    bars: "C:1920 | F:1920 | G:1920 | Am:1920 | F:1920 | G:1920",
    print: "key: C\n\n| C  | F | G |\n| Am | F | G |\n",
  },

  // 4.1 Slots
  {
    name: "slots: one chord takes the whole bar (spec 4.1)",
    text: inC("| Cmaj7 |"),
    bars: "Cmaj7:1920",
  },
  {
    name: "slots: two tokens are half a bar each (spec 4.1)",
    text: inC("| Dm7 G7 |"),
    bars: "Dm7:960 G7:960",
  },
  {
    name: "slots: four slots, C for three and G for one (spec 4.1)",
    text: inC("| C . . G |"),
    bars: "C:1440 G:480",
  },
  {
    name: "slots: C for two, F for one, G for one (spec 4.1)",
    text: inC("| C . F G |"),
    bars: "C:960 F:480 G:480",
  },
  {
    name: "a dot at the start of a bar extends the chord sounding from the previous bar, tied over the bar line",
    text: inC("| C G | . Am |"),
    bars: "C:960 G:960 | ~G:960 Am:960",
  },
  {
    name: "a dot at the start of a section extends the last chord of the section before it",
    text: "key: C\n[A]\n| C | G |\n[B]\n| . | F |\n",
    bars: "C:1920 | G:1920 | ~G:1920 | F:1920",
  },
  {
    name: "a dot with no chord before it anywhere is an error, and plays as no chord",
    text: inC("| . C | F |"),
    bars: "NC:960 C:960 | F:1920",
    diagnostics: [["error", 2, "nothing has been played yet"]],
  },
  {
    name: "dots are separate tokens: run together they are an error that says so",
    text: inC("| C ... | F |"),
    bars: "C:1920 | F:1920",
    diagnostics: [["error", 2, "Put a space between dots"]],
  },
  {
    name: "the same chord written twice is struck twice, not held",
    text: inC("| C C | C . |"),
    bars: "C:960 C:960 | C:1920",
  },
  {
    name: "slot counts in 4/4: 1, 2, 4, 8, 16",
    text: inC(`| C | C G | C G C G | C . G . C . G . | C${dots(7)} G${dots(7)} |`),
    bars: [
      "C:1920",
      "C:960 G:960",
      "C:480 G:480 C:480 G:480",
      "C:480 G:480 C:480 G:480",
      "C:960 G:960",
    ],
  },
  {
    name: "slot counts in 3/4: 1, 3, 6, 12",
    text: `key: C\nmeter: 3/4\n| C | C F G | C . F . G . | C${dots(3)} F${dots(3)} G${dots(3)} |\n`,
    bars: ["C:1440", "C:480 F:480 G:480", "C:480 F:480 G:480", "C:480 F:480 G:480"],
  },
  {
    name: "slot counts in 6/8: 1, 2, 3, 6, 12",
    text: `key: C\nmeter: 6/8\n| C | C G | C F G | C . . G . . | C${dots(5)} G${dots(5)} |\n`,
    bars: ["C:1440", "C:720 G:720", "C:480 F:480 G:480", "C:720 G:720", "C:720 G:720"],
  },
  {
    name: "slot counts in 12/8: 1, 2, 3, 4, 6, 12, 24",
    text: `key: C\nmeter: 12/8\n| C | C G | C F G | C F G Am |\n| C . . G . . | C${dots(5)} G${dots(5)} | C${dots(11)} G${dots(11)} |\n`,
    bars: [
      "C:2880",
      "C:1440 G:1440",
      "C:960 F:960 G:960",
      "C:720 F:720 G:720 Am:720",
      "C:1440 G:1440",
      "C:1440 G:1440",
      "C:1440 G:1440",
    ],
  },
  {
    name: "slot counts in 5/4: 1, 5, 10",
    text: `key: C\nmeter: 5/4\n| C | C . . G . | C${dots(5)} G${dots(3)} |\n`,
    bars: ["C:2400", "C:1440 G:960", "C:1440 G:960"],
  },
  {
    name: "the slot rule goes past the spec's table: any power of two times the beats, so 32 slots in 4/4 and 20 in 5/4",
    text: `key: C\n| C${dots(15)} G${dots(15)} |\n[B]\nmeter: 5/4\n| C${dots(11)} G${dots(7)} |\n`,
    bars: "C:960 G:960 | C:1440 G:960",
  },
  {
    name: "any other slot count is an error on the bar, which plays its first chord for the whole bar",
    text: inC("| C F G | Am |"),
    bars: "C:1920 | Am:1920",
    diagnostics: [
      ["error", "2:3", "3 slots, but a bar of 4/4 takes 1, 2, 4, 8, 16, 32, 64 or 128."],
    ],
  },
  {
    name: "two chords in 3/4 are an error: they must say how they split",
    text: "key: C\nmeter: 3/4\n| C G |\n",
    bars: "C:1440",
    diagnostics: [["error", 3, "2 slots, but a bar of 3/4 takes 1, 3, 6, 12, 24, 48 or 96."]],
  },
  {
    name: "two chords in 3/4, split with a dot: | C . G | (spec 4.1)",
    text: "key: C\nmeter: 3/4\n| C . G |\n",
    bars: "C:960 G:480",
  },
  {
    name: "a bar with a bad slot count that starts with a dot still plays its first chord",
    text: inC("| C | . F G |"),
    bars: "C:1920 | F:1920",
    diagnostics: [["error", 2, "3 slots"]],
  },

  // 4.2 Other bar tokens
  {
    name: "% repeats the previous bar",
    text: inC("| C G | % |"),
    bars: "C:960 G:960 | C:960 G:960",
  },
  {
    name: "% after % repeats the same bar again",
    text: inC("| C | % | % |"),
    bars: "C:1920 | C:1920 | C:1920",
  },
  {
    name: "% repeats a held bar as held",
    text: inC("| C | . | % |"),
    bars: "C:1920 | ~C:1920 | ~C:1920",
  },
  {
    name: "a dot after a % bar holds the chord that bar ended on",
    text: inC("| C G | % | . |"),
    bars: "C:960 G:960 | C:960 G:960 | ~G:1920",
  },
  {
    name: "% copies what the bar before it sounded like, even when that bar began with a tie",
    text: inC("| C G | . Am | % |"),
    bars: "C:960 G:960 | ~G:960 Am:960 | G:960 Am:960",
  },
  {
    name: "% at the start of a section has no bar before it in that section: an error",
    text: "key: C\n[A]\n| C |\n[B]\n| % | F |\n",
    bars: "C:1920 | NC:1920 | F:1920",
    diagnostics: [["error", 5, "no bar before this one"]],
  },
  {
    name: "NC is no chord",
    text: inC("| C | NC |"),
    bars: "C:1920 | NC:1920",
  },
  {
    name: "N.C. is accepted for NC, and prints as NC",
    text: inC("| C | N.C. |"),
    bars: "C:1920 | NC:1920",
    print: "key: C\n\n| C | NC |\n",
  },
  {
    name: "nc is accepted for NC",
    text: inC("| C | nc |"),
    bars: "C:1920 | NC:1920",
    print: "key: C\n\n| C | NC |\n",
  },
  {
    name: "NC occupies a slot like a chord",
    text: inC("| C NC | NC . . G |"),
    bars: "C:960 NC:960 | NC:1440 G:480",
  },
  {
    name: "a dot after a bar of NC holds the silence",
    text: inC("| NC | . |"),
    bars: "NC:1920 | ~NC:1920",
  },
  {
    name: "!word annotations (!stop, !hit) are read and ignored with a note, and do not occupy a slot",
    text: inC("| C !stop G | !hit C |"),
    bars: "C:960 G:960 | C:1920",
    diagnostics: [
      ["info", 2, "`!stop` is reserved for hits and stops"],
      ["info", 2, "`!hit` is reserved"],
    ],
    print: "key: C\n\n| C !stop G | !hit C |\n",
  },
  {
    name: "a bar with only an annotation has no chord in it: an error, and it holds the chord before",
    text: inC("| C | !stop |"),
    bars: "C:1920 | ~C:1920",
    diagnostics: [
      ["info", 2, "reserved"],
      ["error", 2, "no chord in it"],
    ],
  },

  // 4.3 Harmony is written on the beat
  {
    name: "composed syncopation by subdividing: eight slots, G arrives on the and of 2 (spec 4.3)",
    text: inC("| C . . G . . . . |"),
    bars: "C:720 G:1200",
  },
  {
    name: "composed syncopation: G arrives an eighth before the bar line (spec 4.3)",
    text: inC("| F . . . . . . G | G |"),
    bars: "F:1680 G:240 | G:1920",
  },
];

// ── 5. Repeats and endings ──────────────────────────────────────────────────

const repeats: Row[] = [
  {
    name: "|: and :| play the bars between them twice (spec 5)",
    text: inC("|: Dm7 | G7 | Cmaj7 | A7 :|"),
    bars: [
      "Dm7:1920 | G7:1920 | Cmaj7:1920 | A7:1920",
      "Dm7:1920 | G7:1920 | Cmaj7:1920 | A7:1920",
    ],
    print: "key: C\n\n|: Dm7 | G7 | Cmaj7 | A7 :|\n",
  },
  {
    name: "xN after :| sets the total count: x4 plays four times in all (spec 5)",
    text: inC("|: Dm7 | G7 | Cmaj7 | A7 :| x4"),
    bars: [
      "Dm7:1920 | G7:1920 | Cmaj7:1920 | A7:1920",
      "Dm7:1920 | G7:1920 | Cmaj7:1920 | A7:1920",
      "Dm7:1920 | G7:1920 | Cmaj7:1920 | A7:1920",
      "Dm7:1920 | G7:1920 | Cmaj7:1920 | A7:1920",
    ],
    print: "key: C\n\n|: Dm7 | G7 | Cmaj7 | A7 :| x4\n",
  },
  {
    name: "|1 begins a first ending, and :|2 closes the repeat and begins the second (spec 5)",
    text: inC("|: Dm7 | G7 |1 Cmaj7 | A7 :|2 Cmaj7 | % |"),
    bars: [
      "Dm7:1920 | G7:1920 | Cmaj7:1920 | A7:1920",
      "Dm7:1920 | G7:1920 | Cmaj7:1920 | Cmaj7:1920",
    ],
    print: "key: C\n\n|: Dm7 | G7 |1 Cmaj7 | A7 :|2 Cmaj7 | % |\n",
  },
  {
    name: "more endings follow the same pattern: :|3",
    text: inC("|: C |1 F :|2 G :|3 Am |"),
    bars: "C:1920 | F:1920 | C:1920 | G:1920 | C:1920 | Am:1920",
    print: "key: C\n\n|: C |1 F :|2 G :|3 Am |\n",
  },
  {
    name: "a second ending closed by its own :| leaves a third time through that takes no ending",
    text: inC("|: C |1 F :|2 G | Am :|\n| Dm |"),
    bars: "C:1920 | F:1920 | C:1920 | G:1920 | Am:1920 | C:1920 | Dm:1920",
    print: "key: C\n\n|: C  |1 F :|2 G | Am :|\n|  Dm |\n",
  },
  {
    name: "the last ending runs to the end of its line: bars on the next line come after the repeat",
    text: inC("|: C |1 F :|2 G |\n| Am |"),
    bars: "C:1920 | F:1920 | C:1920 | G:1920 | Am:1920",
    print: "key: C\n\n|: C  |1 F :|2 G |\n|  Am |\n",
  },
  {
    name: "the last ending runs to the next section when that comes first",
    text: "key: C\n[A]\n|: C |1 F :|2 G | Am |\n[B]\n| Dm |\n",
    bars: "C:1920 | F:1920 | C:1920 | G:1920 | Am:1920 | Dm:1920",
  },
  {
    name: "a new |: on the same line also ends the last ending",
    text: inC("|: C |1 F :|2 G |: Am :|"),
    bars: "C:1920 | F:1920 | C:1920 | G:1920 | Am:1920 | Am:1920",
    print: "key: C\n\n|: C   |1 F :|2 G |\n|: Am :|\n",
  },
  {
    name: "the ending number must touch the bar line: with a space it is not an ending",
    text: inC("|: C | 1 F :|"),
    bars: "C:1920 | ~C:960 F:960 | C:1920 | ~C:960 F:960",
    diagnostics: [
      ["error", "2:8", "An ending number must touch its bar line, with no space: `|1`"],
    ],
  },
  {
    name: "repeats do not nest: a second |: is an error and reads as a plain bar line",
    text: inC("|: C |: F :| G |"),
    bars: "C:1920 | F:1920 | C:1920 | F:1920 | G:1920",
    diagnostics: [["error", 2, "Repeats do not nest"]],
    print: "key: C\n\n|: C | F :| G |\n",
  },
  {
    name: "repeats do not cross section boundaries: one left open closes at the end of its section, with an error",
    text: "key: C\n[A]\n|: C | F |\n[B]\n| G |\n",
    bars: "C:1920 | F:1920 | C:1920 | F:1920 | G:1920",
    diagnostics: [["error", 3, "never closed"]],
    print: "key: C\n\n[A]\n|: C | F :|\n\n[B]\n| G |\n",
  },
  {
    name: "a repeat can run over several lines",
    text: inC("|: C | F | G | Am |\n| F | G | C | % :|"),
    bars: [
      "C:1920 | F:1920 | G:1920 | Am:1920 | F:1920 | G:1920 | C:1920 | C:1920",
      "C:1920 | F:1920 | G:1920 | Am:1920 | F:1920 | G:1920 | C:1920 | C:1920",
    ],
    print: "key: C\n\n|: C | F | G | Am  |\n|  F | G | C | %  :|\n",
  },
  {
    name: "one repeat can follow another on the same bar line: :|:",
    text: inC("|: C :|: F :|"),
    bars: "C:1920 | C:1920 | F:1920 | F:1920",
    print: "key: C\n\n|: C :|: F :|\n",
  },
  {
    name: "bars go on after a counted repeat on the same line",
    text: inC("|: C :| x3 | F |"),
    bars: "C:1920 | C:1920 | C:1920 | F:1920",
    print: "key: C\n\n|: C :| x3 | F |\n",
  },
  {
    name: "x2 is the default and is not printed",
    text: inC("|: C | F :| x2"),
    bars: "C:1920 | F:1920 | C:1920 | F:1920",
    print: "key: C\n\n|: C | F :|\n",
  },
  {
    name: "x1 is legal and plays the bars once, with a warning that it is no repeat",
    text: inC("|: C | F :| x1"),
    bars: "C:1920 | F:1920",
    diagnostics: [["warning", 2, "no repeat at all"]],
    print: "key: C\n\n|: C | F :| x1\n",
  },
  {
    name: "a count of zero is an error: the repeat plays twice, and the token stays in the text without adding a bar",
    text: inC("|: C | F :| x0"),
    bars: "C:1920 | F:1920 | C:1920 | F:1920",
    diagnostics: [["error", 2, "from 1 to 99 times"]],
    print: "key: C\n\n|: C | F :| x0 |\n",
  },
  {
    name: "a count anywhere but after :| is an error: it stays in the text and takes no slot",
    text: inC("| C x4 | F |"),
    bars: "C:1920 | F:1920",
    diagnostics: [["error", 2, "goes right after `:|`"]],
    print: "key: C\n\n| C x4 | F |\n",
  },
  {
    name: "a count cannot be combined with numbered endings: it is an error, stays in the text, and adds no bar",
    text: inC("|: C |1 F :| x3\n| G |"),
    bars: "C:1920 | F:1920 | C:1920 | G:1920",
    diagnostics: [["error", 2, "Numbered endings already say"]],
    print: "key: C\n\n|: C |1 F :| x3 |\n|  G |\n",
  },
  {
    name: ":| with no |: before it is an error and reads as a plain bar line",
    text: inC("| C | F :| G |"),
    bars: "C:1920 | F:1920 | G:1920",
    diagnostics: [["error", 2, "none is open here"]],
    print: "key: C\n\n| C | F | G |\n",
  },
  {
    name: "an ending number outside a repeat is an error and reads as a plain bar line",
    text: inC("| C |1 F | G |"),
    bars: "C:1920 | F:1920 | G:1920",
    diagnostics: [["error", 2, "An ending needs a repeat"]],
  },
  {
    name: "a first ending with no second: the second time through skips it and goes on",
    text: inC("|: C | Am |1 F | G :| Dm | C |"),
    bars: "C:1920 | Am:1920 | F:1920 | G:1920 | C:1920 | Am:1920 | Dm:1920 | C:1920",
    print: "key: C\n\n|: C | Am |1 F | G :| Dm | C |\n",
  },
  {
    name: "a later ending may start on its own line: :| at the end of one line, |2 at the start of the next",
    text: inC("|: C | F |1 G | Am :|\n|2 G | C |"),
    bars: "C:1920 | F:1920 | G:1920 | Am:1920 | C:1920 | F:1920 | G:1920 | C:1920",
    print: "key: C\n\n|: C | F |1 G | Am :|\n|2 G | C |\n",
  },
  {
    name: "printing never moves a bar into or out of the last ending: bars after it start a new line",
    text: inC("|: C |1 F :|2 G |\n| Am | Dm | Em | F |\n| G |"),
    bars: "C:1920 | F:1920 | C:1920 | G:1920 | Am:1920 | Dm:1920 | Em:1920 | F:1920 | G:1920",
    print: "key: C\n\n|: C  |1 F  :|2 G  |\n|  Am |  Dm  |  Em | F |\n|  G  |\n",
  },
  {
    name: "|2 without its colon inside a first ending can only mean :|2, and prints that way",
    text: inC("|: C |1 F |2 G |"),
    bars: "C:1920 | F:1920 | C:1920 | G:1920",
    print: "key: C\n\n|: C |1 F :|2 G |\n",
  },
  {
    name: "a later ending needs a first ending: :|2 after a plain repeat is an error",
    text: inC("|: C :|2 F |"),
    bars: "C:1920 | C:1920 | F:1920",
    diagnostics: [["error", 2, "needs a first ending"]],
    print: "key: C\n\n|: C :| F |\n",
  },
  {
    name: "endings count up from 1: out of order is an error, and they are read in the order written",
    text: inC("|: C |2 F :|1 G |"),
    bars: "C:1920 | F:1920 | C:1920 | G:1920",
    diagnostics: [
      ["error", 2, "read as ending 1"],
      ["error", 2, "read as ending 2"],
    ],
    print: "key: C\n\n|: C |1 F :|2 G |\n",
  },
  {
    name: "an ending with no bars is an error",
    text: inC("|: C |1 :|2 F |"),
    bars: "C:1920 | C:1920 | F:1920",
    diagnostics: [
      ["error", 2, "Ending 1 has no bars"],
      ["warning", 2, "nothing between these bar lines"],
      ["error", 2, "needs a first ending"],
    ],
  },
  {
    name: "a repeat with no bars is an error",
    text: inC("| C |: :| F |"),
    bars: "C:1920 | F:1920",
    diagnostics: [
      ["error", 2, "no bars in it"],
      ["warning", 2, "nothing between these bar lines"],
    ],
  },
  {
    name: "% at the start of a second ending repeats the last bar before the endings, which is what was just played",
    text: inC("|: C | Am |1 F :|2 % | G |"),
    bars: "C:1920 | Am:1920 | F:1920 | C:1920 | Am:1920 | Am:1920 | G:1920",
  },
  {
    name: "% after a repeat repeats the bar played last, not the bar written last: here the first ending is skipped the second time",
    text: inC("|: C | D |1 E :|\n| % |"),
    bars: "C:1920 | D:1920 | E:1920 | C:1920 | D:1920 | D:1920",
  },
  {
    name: "% after a repeat whose last time through takes no ending repeats the last bar before the endings",
    text: inC("|: C |1 F :|2 G :|\n| % |"),
    bars: "C:1920 | F:1920 | C:1920 | G:1920 | C:1920 | C:1920",
  },
  {
    name: "% after a repeat that ends on its last ending repeats that ending's last bar",
    text: inC("|: C |1 F :|2 G |\n| % |"),
    bars: "C:1920 | F:1920 | C:1920 | G:1920 | G:1920",
  },
  {
    name: "a dot at the top of a repeat holds whatever was sounding: the bar before the first time, the end of the repeat the second",
    text: inC("| C |: . | G :|"),
    bars: "C:1920 | ~C:1920 | G:1920 | ~G:1920 | G:1920",
  },
];

// ── 6. Chords ───────────────────────────────────────────────────────────────

/** One token alone in a bar, in C major, and the chord it must be read as. */
const reads = (name: string, token: string, chord: string, more: Partial<Row> = {}): Row => ({
  name,
  text: inC(`| ${token} |`),
  bars: `${chord}:1920`,
  ...more,
});

/** The same, where canonical printing spells the token differently. */
const readsAndPrints = (name: string, token: string, chord: string, printed: string): Row =>
  reads(name, token, chord, { print: inC(`\n| ${printed} |`) });

const absoluteChords: Row[] = [
  {
    name: "absolute chords: the root is a letter from A to G",
    text: inC("| A B C D | E F G A |"),
    bars: "A:480 B:480 C:480 D:480 | E:480 F:480 G:480 A:480",
    numerals: "VI VII I II | III IV V VI",
  },
  {
    name: "absolute chords: the root may be followed by # or b",
    text: inC("| C# Eb | F#m7 Bb7 |"),
    bars: "C#:960 Eb:960 | F#m7:960 Bb7:960",
    numerals: "#I bIII | #iv7 bVII7",
  },
  {
    name: "the sharp and flat signs ♯ and ♭ are accepted, and print as # and b",
    text: "key: B♭\n| C♯ E♭ | F♯m7 B♭7 |\n",
    bars: "C#:960 Eb:960 | F#m7:960 Bb7:960",
    header: { key: "Bb" },
    print: "key: Bb\n\n| C# Eb | F#m7 Bb7 |\n",
  },
  {
    name: "roots are uppercase: a lowercase note name is an error that says what to type",
    text: inC("| C | am7 |"),
    bars: "C:1920 | ~C:1920",
    diagnostics: [["error", 2, "did you mean `Am7`?"]],
  },
  reads("a bass note is a note name after a slash: C/E", "C/E", "C/E", { numerals: "I/3" }),
  reads("a bass note under any quality: Dm7/G", "Dm7/G", "Dm7/G", { numerals: "ii7/5" }),
  readsAndPrints("a bass note that is the root is no slash chord at all", "C/C", "C", "C"),
  {
    name: "after a note name, only a note name can follow the slash",
    text: inC("| C | C/3 C/ii |"),
    bars: "C:1920 | ~C:1920",
    diagnostics: [
      ["error", 2, "Unrecognized chord `C/3`"],
      ["error", 2, "Unrecognized chord `C/ii`"],
    ],
  },
];

const numerals: Row[] = [
  {
    name: "numerals I to VII in uppercase are major triads on the degrees of the major scale",
    text: inC("| I II III IV | V VI VII I |"),
    bars: "C:480 D:480 E:480 F:480 | G:480 A:480 B:480 C:480",
  },
  {
    name: "numerals i to vii in lowercase are minor triads on the same degrees",
    text: inC("| i ii iii iv | v vi vii i |"),
    bars: "Cm:480 Dm:480 Em:480 Fm:480 | Gm:480 Am:480 Bm:480 Cm:480",
  },
  {
    name: "a b or # before a numeral lowers or raises it: bVII, #iv",
    text: inC("| bVII #iv |"),
    bars: "Bb:960 F#m:960",
    print: "key: C\n\n| bVII #iv |\n",
  },
  {
    name: "numerals are measured against the major scale in minor keys too: i bIII iv v bVI bVII in A minor (spec 6.2)",
    text: "key: Am\n| i bIII iv v | bVI bVII i . |\n",
    bars: "Am:480 C:480 Dm:480 Em:480 | F:480 G:480 Am:960",
  },
  {
    name: "there is no relative-major reading: III in A minor is C sharp major",
    text: "key: Am\n| III | bIII |\n",
    bars: "C#:1920 | C:1920",
  },
  {
    name: "numerals spell their chords in the key: IV in F is Bb, and in E it is A",
    text: "key: F\n| IV | V7 |\n[B]\nkey: E\n| IV | V7 |\n",
    bars: "Bb:1920 | C7:1920 | A:1920 | B7:1920",
  },
  // Spelling. A numeral is spelled by letter; a double accidental, or a Cb,
  // Fb, E#, or B# that the key's own scale does not have, becomes the plain note.
  ...(
    [
      ["F#", "F# G#m A#m B | C# D#m E#dim", "G A Cdim7 | D E F#"],
      ["Gb", "Gb Abm Bbm Cb | Db Ebm Fdim", "G A Cdim7 | D E Gb"],
      ["Db", "Db Ebm Fm Gb | Ab Bbm Cdim", "D E Gdim7 | A B Db"],
      ["Ab", "Ab Bbm Cm Db | Eb Fm Gdim", "A B Ddim7 | E Gb Ab"],
      ["Eb", "Eb Fm Gm Ab | Bb Cm Ddim", "E Gb Adim7 | B Db Eb"],
      ["B", "B C#m D#m E | F# G#m A#dim", "C D Fdim7 | G A B"],
    ] as const
  ).map(
    ([key, diatonic, chromatic]): Row => ({
      name: `numerals in ${key}: the scale chords, then bII bIII #ivo7 bVI bVII, spelled as a player in ${key} reads them`,
      text: `key: ${key}\n| I ii iii IV | V vi viio . |\n| bII bIII #ivo7 . | bVI bVII I . |\n`,
      bars: [
        timed(diatonic, [480, 480, 480, 480, 480, 480, 960]),
        timed(chromatic, [480, 480, 960, 480, 480, 960]),
      ],
    }),
  ),
  {
    name: "numerals in C# minor: the raised seventh is B#, the leading tone; III, which the key's scale does not have as E#, is F",
    text: "key: C#m\n| i iv V7 viio7 | bIII bVI bVII III |\n",
    bars: "C#m:480 F#m:480 G#7:480 B#dim7:480 | E:480 A:480 B:480 F:480",
  },
  {
    name: "numerals in Eb minor: bVI is Cb, which the key's own scale has",
    text: "key: Ebm\n| i iv V7 viio7 | bIII bVI bVII bII |\n",
    bars: "Ebm:480 Abm:480 Bb7:480 Ddim7:480 | Gb:480 Cb:480 Db:480 E:480",
  },
  {
    name: "a note name is read as the degree that spells it in the key: A in Db is bVI, G# in C is #V, and Ab in C# minor is V",
    text: "key: Db\n| A | B |\n[B]\nkey: C\n| G# | Ab |\n[C]\nkey: C#m\n| Ab7 | G#7 |\n",
    bars: "A:1920 | B:1920 | G#:1920 | Ab:1920 | Ab7:1920 | G#7:1920",
    numerals: "bVI | bVII | #V | bVI | V7 | V7",
  },
  // The table in 6.2: case sets the third, and the suffix is applied on top.
  reads("numeral table: I is a major triad", "I", "C"),
  reads("numeral table: ii is a minor triad", "ii", "Dm"),
  reads("numeral table: V7 is a dominant seventh", "V7", "G7"),
  reads("numeral table: ii7 is a minor seventh", "ii7", "Dm7"),
  reads("numeral table: Imaj7 is a major seventh", "Imaj7", "Cmaj7"),
  reads("numeral table: imaj7 is a minor-major seventh", "imaj7", "CmMaj7"),
  reads("numeral table: viio7 is a diminished seventh", "viio7", "Bdim7"),
  readsAndPrints("numeral table: vii°7 is a diminished seventh too", "vii°7", "Bdim7", "viio7"),
  reads("numeral table: iiø7 is half-diminished", "iiø7", "Dm7b5"),
  readsAndPrints(
    "numeral table: IIm7 is a minor seventh (an explicit m after uppercase), and prints as ii7",
    "IIm7",
    "Dm7",
    "ii7",
  ),
  // Lenient input, canonical printing.
  readsAndPrints("numerals: iim7b5 is understood, and prints as iiø7", "iim7b5", "Dm7b5", "iiø7"),
  readsAndPrints("numerals: ii7b5 is understood, and prints as iiø7", "ii7b5", "Dm7b5", "iiø7"),
  readsAndPrints(
    "numerals: VIIdim7 is understood, and prints as viio7",
    "VIIdim7",
    "Bdim7",
    "viio7",
  ),
  readsAndPrints("numerals: Im is a minor triad, and prints as i", "Im", "Cm", "i"),
  reads("numerals: a diminished triad is lowercase with o", "viio", "Bdim"),
  reads("numerals: a minor sixth is lowercase with 6", "iv6", "Fm6"),
  reads("numerals: a suffix with its own accidental stays on the suffix: V7b9", "V7b9", "G7b9"),
  {
    name: "numerals: lowercase with a major-third quality contradicts itself, and is an error",
    text: inC("| I | iaug |"),
    bars: "C:1920 | ~C:1920",
    diagnostics: [["error", 2, "A lowercase numeral has a minor third"]],
  },
  reads("secondary function: V7/ii is the dominant of the two chord", "V7/ii", "A7", {
    numerals: "V7/ii",
    print: inC("\n| V7/ii |"),
  }),
  reads("secondary function: V7/V is the dominant of the dominant", "V7/V", "D7", {
    numerals: "V7/V",
  }),
  reads("secondary function: viio7/V leads to the dominant", "viio7/V", "F#dim7", {
    numerals: "viio7/V",
  }),
  reads("secondary function: any numeral can be 'of' another: ii7/IV", "ii7/IV", "Gm7"),
  reads("bass degree: I/3 puts the third of the key in the bass", "I/3", "C/E"),
  reads("bass degree: IV/1 is measured from the tonic, not from the chord", "IV/1", "F/C"),
  reads("bass degree: I/5", "I/5", "C/G"),
  reads("bass degree: an accidental is allowed, as in I/b7", "I/b7", "C/Bb", {
    print: inC("\n| I/b7 |"),
  }),
  {
    name: "bass degree: one a half step from the chord's own third gets a warning that offers the third (i/3 in A minor is Am over C sharp)",
    text: "key: Am\n| i/3 | i/b3 | I/3 |\n",
    bars: "Am/C#:1920 | Am/C:1920 | A/C#:1920",
    diagnostics: [["warning", "2:3", "for the third, write `i/b3`"]],
  },
  {
    name: "a chord typed as a name can be shown as a numeral, and one typed as a numeral is shown by name here",
    text: inC("| Dm7 G7/B | ii7 V7/7 |"),
    bars: "Dm7:960 G7/B:960 | Dm7:960 G7/B:960",
    numerals: "ii7 V7/7 | ii7 V7/7",
    print: "key: C\n\n| Dm7 G7/B | ii7 V7/7 |\n",
  },
];

// 6.3: the quality table. Each line is a canonical spelling, the other
// spellings accepted for it, and how it is written after a numeral on the tonic.
const QUALITY_TABLE: readonly (readonly [canonical: string, accepted: string, numeral: string])[] =
  [
    ["", "M maj", "I"],
    ["m", "min mi -", "i"],
    ["dim", "o °", "io"],
    ["aug", "+", "Iaug"],
    ["5", "", "I5"],
    ["sus4", "sus", "Isus4"],
    ["sus2", "", "Isus2"],
    ["6", "", "I6"],
    ["m6", "min6 -6", "i6"],
    ["69", "6/9", "I69"],
    ["m69", "m6/9", "i69"],
    ["add9", "add2", "Iadd9"],
    ["madd9", "", "iadd9"],
    ["7", "", "I7"],
    ["maj7", "M7 ma7 ^7 ^ Δ Δ7", "Imaj7"],
    ["m7", "min7 mi7 -7", "i7"],
    ["mMaj7", "m(maj7) mM7 m^7 -^7", "imaj7"],
    ["m7b5", "ø ø7 h h7 min7b5 -7b5", "iø7"],
    ["dim7", "o7 °7", "io7"],
    ["7sus4", "7sus", "I7sus4"],
    ["9", "", "I9"],
    ["maj9", "M9 ma9 ^9 Δ9", "Imaj9"],
    ["m9", "min9 mi9 -9", "i9"],
    ["11", "", "I11"],
    ["m11", "min11 mi11 -11", "i11"],
    ["13", "", "I13"],
    ["maj13", "M13 ma13 ^13 Δ13", "Imaj13"],
    ["m13", "min13 mi13 -13", "i13"],
    ["9sus4", "9sus", "I9sus4"],
    ["13sus4", "13sus", "I13sus4"],
    ["7alt", "alt", "I7alt"],
    ["7#5", "+7 aug7", "I7#5"],
  ];

const qualities: Row[] = QUALITY_TABLE.flatMap(([canonical, accepted, numeral]) => [
  reads(
    `quality: C${canonical} is canonical, and is ${numeral} as a numeral`,
    `C${canonical}`,
    `C${canonical}`,
    {
      print: inC(`\n| C${canonical} |`),
      numerals: numeral,
    },
  ),
  readsAndPrints(
    `quality as a numeral: ${numeral} is C${canonical} in C, and prints unchanged`,
    numeral,
    `C${canonical}`,
    numeral,
  ),
  ...accepted
    .split(" ")
    .filter((spelling) => spelling !== "")
    .map((spelling) =>
      readsAndPrints(
        `quality: C${spelling} is accepted for C${canonical}`,
        `C${spelling}`,
        `C${canonical}`,
        `C${canonical}`,
      ),
    ),
]);

const alterations: Row[] = [
  {
    name: "quality matching is case-sensitive: M is major and m is minor, and MAJ is neither",
    text: inC("| CM7 Cm7 | CMAJ7 |"),
    bars: "Cmaj7:960 Cm7:960 | ~Cm7:1920",
    diagnostics: [["error", 2, "`MAJ7` is not a quality"]],
  },
  {
    name: "look-alike characters from other keyboards are read as the ones they resemble: ∆ º ˚ Ø",
    text: inC("| C∆7 Cº7 | CØ7 C˚ |"),
    bars: "Cmaj7:960 Cdim7:960 | Cm7b5:960 Cdim:960",
    print: "key: C\n\n| Cmaj7 Cdim7 | Cm7b5 Cdim |\n",
  },
  reads("alterations follow a seventh-family quality: C7b9 (spec 6.3)", "C7b9", "C7b9"),
  readsAndPrints(
    "alterations may be in parentheses with commas: C7(b9,#11) (spec 6.3)",
    "C7(b9,#11)",
    "C7b9#11",
    "C7b9#11",
  ),
  reads("alterations may run together: C7#9b13 (spec 6.3)", "C7#9b13", "C7#9b13"),
  reads("alterations on a major seventh: Cmaj7#11 (spec 6.3)", "Cmaj7#11", "Cmaj7#11"),
  reads("alterations on a major seventh: Cmaj7#5 (spec 6.3)", "Cmaj7#5", "Cmaj7#5"),
  reads(
    "a minor seventh with a flat five is the half-diminished chord: Cm7b5 (spec 6.3)",
    "Cm7b5",
    "Cm7b5",
  ),
  ...["b5", "#5", "b9", "#9", "#11", "b13"].map((alteration) =>
    reads(`alteration ${alteration} is recognized`, `C13${alteration}`, `C13${alteration}`),
  ),
  readsAndPrints(
    "alterations may come in any order, and print in a fixed one",
    "C7b13#9b5",
    "C7b5#9b13",
    "C7b5#9b13",
  ),
  readsAndPrints(
    "alterations: parentheses without commas, and commas without parentheses",
    "C9(#11b13)",
    "C9#11b13",
    "C9#11b13",
  ),
  {
    name: "alterations: an unknown one makes the chord unrecognized",
    text: inC("| C7 | C7b7 C7#4 |"),
    bars: "C7:1920 | ~C7:1920",
    diagnostics: [
      ["error", 2, "Unrecognized chord `C7b7`"],
      ["error", 2, "Unrecognized chord `C7#4`"],
    ],
  },
  {
    name: "not in version 1: omit and no3",
    text: inC("| C | Comit3 Cno3 |"),
    bars: "C:1920 | ~C:1920",
    diagnostics: [
      ["error", 2, "`omit3` is not a quality"],
      ["error", 2, "`no3` is not a quality"],
    ],
  },
  {
    name: "not in version 1: arbitrary added tones, polychords, quartal voicings",
    text: inC("| C | Cadd11 . C/D/E Cq |"),
    bars: "C:1920 | ~C:1920",
    diagnostics: [
      ["error", 2, "Unrecognized chord `Cadd11`"],
      ["error", 2, "Unrecognized chord `C/D/E`"],
      ["error", 2, "Unrecognized chord `Cq`"],
    ],
  },
];

// 6.4 Parsing rules that remove ambiguity
const ambiguity: Row[] = [
  reads("an accidental binds to the root first: Bb7 is B-flat seven", "Bb7", "Bb7", {
    numerals: "bVII7",
  }),
  reads("an accidental binds to the root first: Bb5 is a B-flat power chord", "Bb5", "Bb5"),
  reads("an accidental binds to the root first: Eb9 is E-flat nine", "Eb9", "Eb9"),
  reads(
    "an alteration directly after a root needs parentheses: B(b5) is B with a flat five",
    "B(b5)",
    "B(b5)",
    {
      print: inC("\n| B(b5) |"),
    },
  ),
  reads("E with a flat nine is E7b9", "E7b9", "E7b9"),
  reads("E with a flat nine and no seventh is E(b9)", "E(b9)", "E(b9)"),
  {
    name: "an alteration after a triad or sixth without parentheses is an error that says how to write it",
    text: inC("| C | C6b9 Cmb5 |"),
    bars: "C:1920 | ~C:1920",
    diagnostics: [
      ["error", 2, "An alteration goes after a seventh or in parentheses"],
      ["error", 2, "An alteration goes after a seventh or in parentheses"],
    ],
  },
  readsAndPrints("6/9 is a quality, not a slash chord", "C6/9", "C69", "C69"),
  readsAndPrints(
    "a slash followed by 9 is never a bass, so C6/9/E is C69 over E",
    "C6/9/E",
    "C69/E",
    "C69/E",
  ),
  {
    name: "slash targets are told apart by what follows: a note name is a bass, a numeral is 'of', a digit is a bass degree",
    text: inC("| C/E V7/ii | I/3 I6/5 |"),
    bars: "C/E:960 A7:960 | C/E:960 C6/G:960",
    numerals: "I/3 V7/ii | I/3 I6/5",
  },
  {
    name: "roman numerals use only I and V letters, so they never collide with note names",
    text: inC("| C I | D V | vi A | IV F |"),
    bars: "C:960 C:960 | D:960 G:960 | Am:960 A:960 | F:960 F:960",
    print: "key: C\n\n| C I | D V | vi A | IV F |\n",
  },
  {
    name: "a numeral of mixed case is not a numeral",
    text: inC("| I | Ii iV |"),
    bars: "C:1920 | ~C:1920",
    diagnostics: [
      ["error", 2, "Unrecognized chord `Ii`"],
      ["error", 2, "Unrecognized chord `iV`"],
    ],
  },
];

// ── 7. Diagnostics ──────────────────────────────────────────────────────────
// The table in section 7. Its other rows are shown where their rules are:
// slot counts in 4.1, numerals without a key and the missing key in 3.1,
// section labels in 3.2, the unclosed repeat in 5.

const diagnosticsTable: Row[] = [
  {
    name: "an unrecognized chord is an error on the token, and its slot holds the previous chord",
    text: inC("| C Xyz | F |"),
    bars: "C:1920 | F:1920",
    diagnostics: [["error", "2:5", "Unrecognized chord `Xyz`"]],
    print: "key: C\n\n| C Xyz | F |\n",
  },
  {
    name: "an unrecognized chord with no chord before it plays as no chord",
    text: inC("| Xyz C | F |"),
    bars: "NC:960 C:960 | F:1920",
    diagnostics: [["error", 2, "Unrecognized chord `Xyz`"]],
  },
  {
    name: "an unrecognized chord at the start of a bar holds the chord from the bar before",
    text: inC("| C G | Xyz F |"),
    bars: "C:960 G:960 | ~G:960 F:960",
    diagnostics: [["error", 2, "Unrecognized chord `Xyz`"]],
  },
  {
    name: "% with other tokens in its bar is an error on the bar, which plays as no chord",
    text: inC("| C | % G | F |"),
    bars: "C:1920 | NC:1920 | F:1920",
    diagnostics: [["error", "2:7", "must be alone in its bar"]],
    print: "key: C\n\n| C | % G | F |\n",
  },
  {
    name: "% with no previous bar is an error on the bar, which plays as no chord",
    text: inC("| % | C |"),
    bars: "NC:1920 | C:1920",
    diagnostics: [["error", 2, "no bar before this one"]],
  },
  {
    name: "diagnostics say where: one bad token is reported at its own line",
    text: "key: C\n\n[A]\n| C | F |\n| G | Hm7 |\n",
    bars: "C:1920 | F:1920 | G:1920 | ~G:1920",
    diagnostics: [["error", "5:7", "Unrecognized chord `Hm7`"]],
  },
  {
    name: "a bar played many times reports its mistake once",
    text: "key: C\n[A]\n|: C F G :| x4\n[A]\n",
    bars: "C:1920 | C:1920 | C:1920 | C:1920 | C:1920 | C:1920 | C:1920 | C:1920",
    diagnostics: [["error", 3, "3 slots"]],
  },
  {
    name: "a chart with errors still plays: every mistake is recovered from, and the rest is untouched",
    text: chart`
      key: C
      tempo: quick
      [A]
      | C | Fmaj79 | % x | G7 |
      [B]
      [A]
      | Am |
      [C]
      |: F | G
    `,
    bars: [
      "C:1920 | ~C:1920 | NC:1920 | G7:1920",
      "C:1920 | ~C:1920 | NC:1920 | G7:1920",
      "F:1920 | G:1920 | F:1920 | G:1920",
    ],
    diagnostics: [
      ["error", 2, "is not a tempo"],
      ["error", 4, "Unrecognized chord `Fmaj79`"],
      ["error", 4, "must be alone in its bar"],
      ["error", 4, "Unrecognized chord `x`"],
      ["error", 5, "no section above is labeled `B`"],
      ["error", 6, "already has bars above"],
      ["error", 9, "never closed"],
    ],
  },
];

// ── 8. The parsed model ─────────────────────────────────────────────────────

const transposition: Row[] = [
  {
    name: "transposition is a change of key: chords typed as names are spelled again in the new key",
    text: inC("| C | Am | F/A | G7 |"),
    bars: "C:1920 | Am:1920 | F/A:1920 | G7:1920",
    transposed: { to: "D", print: "key: D\n\n| D | Bm | G/B | A7 |\n" },
  },
  {
    name: "transposing a chart in numerals changes only its key line",
    text: inC("| I | vi | IV/1 | V7/ii |"),
    bars: "C:1920 | Am:1920 | F/C:1920 | A7:1920",
    transposed: { to: "Eb", print: "key: Eb\n\n| I | vi | IV/1 | V7/ii |\n" },
  },
  {
    name: "transposing keeps each chord's degree, so chromatic chords are spelled for the new key",
    text: inC("| C | Eb | F# | Bb7 |"),
    bars: "C:1920 | Eb:1920 | F#:1920 | Bb7:1920",
    numerals: "I | bIII | #IV | bVII7",
    transposed: { to: "F", print: "key: F\n\n| F | Ab | B | Eb7 |\n" },
  },
  {
    name: "transposing moves a section's own key by the same interval",
    text: "key: C\n[A]\n| C | G |\n[Bridge]\nkey: Ab\n| Ab | I |\n",
    bars: "C:1920 | G:1920 | Ab:1920 | Ab:1920",
    transposed: {
      to: "D",
      print: "key: D\n\n[A]\n| D | A |\n\n[Bridge]\nkey: Bb\n| Bb | I |\n",
    },
  },
  {
    name: "transposing a chart with no key line gives it one, after the title",
    text: "title: Shuffle\n| A7 | D7 |\n",
    bars: "A7:1920 | D7:1920",
    diagnostics: [["warning", 2, "read in A major"]],
    transposed: { to: "C", print: "title: Shuffle\nkey: C\n\n| C7 | F7 |\n" },
  },
  {
    name: "transposing to a minor key keeps the chords' degrees and qualities",
    text: "key: Am\n| Am | F | E7 |\n",
    bars: "Am:1920 | F:1920 | E7:1920",
    transposed: { to: "Dm", print: "key: Dm\n\n| Dm | Bb | A7 |\n" },
  },
  {
    name: "transposing spells for the new key: Cm7 B7 in Bb becomes F#m7 F7 in E, and comes back as it was",
    text: "key: Bb\n| Cm7 B7 | Bbmaj7 |\n",
    bars: "Cm7:960 B7:960 | Bbmaj7:1920",
    numerals: "ii7 bII7 | Imaj7",
    transposed: { to: "E", print: "key: E\n\n| F#m7 F7 | Emaj7 |\n" },
    thereAndBack: ["E"],
  },
  {
    name: "there and back: C to Db and back to C through the printed text changes nothing",
    text: inC("| C | Ab | Bb | C |"),
    bars: "C:1920 | Ab:1920 | Bb:1920 | C:1920",
    transposed: { to: "Db", print: "key: Db\n\n| Db | A | B | Db |\n" },
    thereAndBack: ["Db"],
  },
  {
    name: "there and back: a section's own key is written as a conventional key on the way (Ab becomes A, not Bbb) and returns",
    text: "key: C\n[A]\n| C | G |\n[B]\nkey: Ab\n| Imaj7 | Dbmaj7 |\n",
    bars: "C:1920 | G:1920 | Abmaj7:1920 | Dbmaj7:1920",
    transposed: {
      to: "Db",
      print: "key: Db\n\n[A]\n| Db | Ab |\n\n[B]\nkey: A\n| Imaj7 | Dmaj7 |\n",
    },
    thereAndBack: ["Db"],
  },
  {
    name: "a moved section key takes the spelling with fewer accidentals, and on a tie the side the new chart key leans: Gb under Db",
    text: "key: C\n[A]\n| C |\n[B]\nkey: F\n| I |\n[C]\nkey: Am\n| i |\n",
    bars: "C:1920 | F:1920 | Am:1920",
    transposed: {
      to: "Db",
      print: "key: Db\n\n[A]\n| Db |\n\n[B]\nkey: Gb\n| I |\n\n[C]\nkey: Bbm\n| i |\n",
    },
    thereAndBack: ["Db"],
  },
  {
    name: "a moved section key on a tie goes sharp under a sharp chart key: F# under G",
    text: "key: C\n[A]\n| C |\n[B]\nkey: B\n| I |\n",
    bars: "C:1920 | B:1920",
    transposed: { to: "G", print: "key: G\n\n[A]\n| G |\n\n[B]\nkey: F#\n| I |\n" },
    thereAndBack: ["G"],
  },
  {
    name: "there and back: through all twelve keys in turn and home again, by way of the text each time",
    text: inC("| C | Ab | Bb | Dm7 G7 |\n| F#dim7 | Eb | Db | C/E |"),
    bars: [
      "C:1920 | Ab:1920 | Bb:1920 | Dm7:960 G7:960",
      "F#dim7:1920 | Eb:1920 | Db:1920 | C/E:1920",
    ],
    thereAndBack: ["Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"],
  },
  {
    // Was the library's "12-Bar Blues in Numerals" (numerals are a setting in the app, so the
    // chart left the library); this keeps what it proved there.
    name: "there and back: a whole chart written in numerals moves to every key by its key line alone, and comes home",
    text: chart`
      title: 12-Bar Blues in Numerals
      key: Bb
      tempo: 120
      style: blues

      [A]
      | I7  | IV7 | I7 | %  |
      | IV7 | %   | I7 | %  |
      | V7  | IV7 | I7 | V7 |
    `,
    bars: [
      "Bb7:1920 | Eb7:1920 | Bb7:1920 | Bb7:1920",
      "Eb7:1920 | Eb7:1920 | Bb7:1920 | Bb7:1920",
      "F7:1920 | Eb7:1920 | Bb7:1920 | F7:1920",
    ],
    numerals: "I7 | IV7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7",
    transposed: {
      to: "E",
      print:
        "title: 12-Bar Blues in Numerals\nkey: E\ntempo: 120\nstyle: blues\n\n[A]\n| I7  | IV7 | I7 | %  |\n| IV7 | %   | I7 | %  |\n| V7  | IV7 | I7 | V7 |\n",
    },
    thereAndBack: ["Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"],
  },
];

// ── 9. Canonical printing ───────────────────────────────────────────────────

const printing: Row[] = [
  {
    name: "fmt: canonical quality spellings, one space between tokens",
    text: inC("|CM7   D-7|G7(b9,#11)    Calt|"),
    bars: "Cmaj7:960 Dm7:960 | G7b9#11:960 C7alt:960",
    print: "key: C\n\n| Cmaj7 Dm7 | G7b9#11 C7alt |\n",
  },
  {
    name: "fmt: bars are padded to align in columns",
    text: inC("| C | Fmaj7 G7 | Am | % |\n| Dm7 | G | C . . G7 | C |"),
    bars: [
      "C:1920 | Fmaj7:960 G7:960 | Am:1920 | Am:1920",
      "Dm7:1920 | G:1920 | C:1440 G7:480 | C:1920",
    ],
    print: "key: C\n\n| C   | Fmaj7 G7 | Am       | % |\n| Dm7 | G        | C . . G7 | C |\n",
  },
  {
    name: "fmt: four bars per line when the source's lines are uneven",
    text: inC("| C | F | G |\n| Am | F | G | C | C |"),
    bars: "C:1920 | F:1920 | G:1920 | Am:1920 | F:1920 | G:1920 | C:1920 | C:1920",
    print: "key: C\n\n| C | F | G | Am |\n| F | G | C | C  |\n",
  },
  {
    name: "fmt: another consistent width is kept, with a shorter last line",
    text: inC("| C | F |\n| G | Am |\n| C |"),
    bars: "C:1920 | F:1920 | G:1920 | Am:1920 | C:1920",
    print: "key: C\n\n| C | F  |\n| G | Am |\n| C |\n",
  },
  {
    name: "fmt: one long line is a consistent width of its own",
    text: inC("| C | F | G | Am | F | G |"),
    bars: "C:1920 | F:1920 | G:1920 | Am:1920 | F:1920 | G:1920",
    print: "key: C\n\n| C | F | G | Am | F | G |\n",
  },
  {
    name: "fmt: the author's choice of names or numerals is kept, chord by chord",
    text: inC("| I | F | V7 | C |"),
    bars: "C:1920 | F:1920 | G7:1920 | C:1920",
    print: "key: C\n\n| I | F | V7 | C |\n",
  },
  {
    name: "fmt: comments directly above a label stay with that section, and a blank line separates sections",
    text: chart`
      key: C
      // about the whole tune

      // the verse comes in softly
      [Verse]
      | C | F |
      // and builds
      | G | C |
      //ends cold
      [Chorus]
      | F | G |
    `,
    bars: "C:1920 | F:1920 | G:1920 | C:1920 | F:1920 | G:1920",
    print: chart`
      key: C
      // about the whole tune

      // the verse comes in softly
      [Verse]
      | C | F |
      // and builds
      | G | C |

      // ends cold
      [Chorus]
      | F | G |
    `,
  },
  {
    name: "fmt: a comment at the end of a line of bars keeps that line as it is",
    text: inC("| C | F | // turnaround next\n| G | C | Am | F |"),
    bars: "C:1920 | F:1920 | G:1920 | C:1920 | Am:1920 | F:1920",
    print: "key: C\n\n| C | F | // turnaround next\n| G | C | Am | F |\n",
  },
  {
    name: "fmt: a comment inside a repeat stays where it is",
    text: inC("|: C | F |\n// second half\n| G | C :|"),
    bars: "C:1920 | F:1920 | G:1920 | C:1920 | C:1920 | F:1920 | G:1920 | C:1920",
    print: "key: C\n\n|: C | F  |\n// second half\n|  G | C :|\n",
  },
  {
    name: "fmt: comments after a repeat and between its endings stay where they are",
    text: inC("|: C |1 F :| // first time\n// then\n|2 G | // second time\n// after\n| Am |"),
    bars: "C:1920 | F:1920 | C:1920 | G:1920 | Am:1920",
    print:
      "key: C\n\n|: C  |1 F :| // first time\n// then\n|2 G  | // second time\n// after\n|  Am |\n",
  },
  {
    name: "fmt: a comment directly above the bars of a chart with no labels stays above them",
    text: "key: C\n\n// the vamp\n| C | F |\n",
    bars: "C:1920 | F:1920",
    print: "key: C\n\n// the vamp\n| C | F |\n",
  },
  {
    name: "fmt: section structure is kept: references stay references, repeats stay repeats",
    text: "key: C\n[A]\n|: C | F :| x3\n[B]\n| G |\n[A]\n",
    bars: [
      "C:1920 | F:1920 | C:1920 | F:1920 | C:1920 | F:1920",
      "G:1920",
      "C:1920 | F:1920 | C:1920 | F:1920 | C:1920 | F:1920",
    ],
    print: "key: C\n\n[A]\n|: C | F :| x3\n\n[B]\n| G |\n\n[A]\n",
  },
  {
    name: "fmt never deletes text: a field line among the bars is an error, and is printed back where it was",
    text: inC("| C | F |\ntempo: 90 // slower here\n| G | C |"),
    bars: "C:1920 | F:1920 | G:1920 | C:1920",
    header: { tempo: null },
    diagnostics: [["error", "3:1", "Here among the bars it is ignored"]],
    print: "key: C\n\n| C | F |\ntempo: 90 // slower here\n| G | C |\n",
  },
  {
    name: "fmt never deletes text: unrecognized tokens are printed as typed",
    text: inC("| C  Hm7 | wat? F |"),
    bars: "C:1920 | ~C:960 F:960",
    diagnostics: [
      ["error", 2, "Unrecognized chord `Hm7`"],
      ["error", 2, "Unrecognized chord `wat?`"],
    ],
    print: "key: C\n\n| C Hm7 | wat? F |\n",
  },
  {
    name: "an empty chart is empty: no sections, no diagnostics, nothing printed",
    text: "",
    bars: "",
    header: { title: "Untitled", key: "C" },
    sections: [],
    print: "",
  },
  {
    name: "a chart with only a header has no bars and no complaints",
    text: "title: Not yet\n\n\n",
    bars: "",
    print: "title: Not yet\n",
  },
];

// ── 10. More examples ───────────────────────────────────────────────────────

const A_OF_RHYTHM_CHANGES = [
  "Bb:960 Gm7:960 | Cm7:960 F7:960 | Dm7:960 G7:960 | Cm7:960 F7:960",
  "Bb:960 Bb7:960 | Eb:960 Edim7:960 | Bb/F:960 F7:960 | Bb:1920",
];

const moreExamples: Row[] = [
  {
    name: "AABA in numerals, 32 bars from 16 typed (spec 10)",
    text: chart`
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
    `,
    bars: [
      ...A_OF_RHYTHM_CHANGES,
      ...A_OF_RHYTHM_CHANGES,
      "D7:1920 | D7:1920 | G7:1920 | G7:1920",
      "C7:1920 | C7:1920 | F7:1920 | F7:1920",
      ...A_OF_RHYTHM_CHANGES,
    ],
    header: { title: "Rhythm-style changes", key: "Bb", tempo: 180, style: "jazz" },
    sections: ["A: body, Bb, 4/4", "A: body, Bb, 4/4", "B: body, Bb, 4/4", "A: body, Bb, 4/4"],
    print: chart`
      title: Rhythm-style changes
      key: Bb
      tempo: 180
      style: jazz

      [A]
      | I vi7 | ii7 V7   | iii7 VI7 | ii7 V7 |
      | I I7  | IV #ivo7 | I/5 V7   | I      |

      [A]

      [B]
      | III7 | % | VI7 | % |
      | II7  | % | V7  | % |

      [A]
    `,
  },
  {
    name: "a minor key, mixing names and numerals (spec 10)",
    text: chart`
      title: Minor vamp
      key: Am

      | i | bVII | bVI | E7 |
    `,
    bars: "Am:1920 | G:1920 | F:1920 | E7:1920",
    header: { title: "Minor vamp", key: "Am" },
    numerals: "i | bVII | bVI | V7",
    print: chart`
      title: Minor vamp
      key: Am

      | i | bVII | bVI | E7 |
    `,
  },
  {
    name: "a waltz with an uneven bar (spec 10)",
    text: chart`
      title: Waltz sketch
      key: G
      meter: 3/4

      | G | Em | C . D | G |
    `,
    bars: "G:1440 | Em:1440 | C:960 D:480 | G:1440",
    header: { title: "Waltz sketch", key: "G", meter: "3/4" },
  },
  {
    name: "a slow blues in twelve, a chord a beat in its turnaround (spec 10)",
    text: chart`
      title: Slow blues sketch
      key: G
      tempo: 60
      meter: 12/8

      | G7 | C7 | G7 G7/B C7 C#dim7 | G7/D D7 |
    `,
    bars: "G7:2880 | C7:2880 | G7:720 G7/B:720 C7:720 C#dim7:720 | G7/D:1440 D7:1440",
    header: { title: "Slow blues sketch", key: "G", tempo: 60, meter: "12/8" },
  },
  {
    name: "an intro, a looping body, and a written ending (spec 10)",
    text: chart`
      title: Two-chord groove
      key: Em
      style: funk

      [Intro]
      | Em7 | % | % | % |

      [A]
      |: Em7 | A7 :| x4

      [Outro]
      | Em7 | A7 | Em9 | . |
    `,
    bars: [
      "Em7:1920 | Em7:1920 | Em7:1920 | Em7:1920",
      "Em7:1920 | A7:1920 | Em7:1920 | A7:1920 | Em7:1920 | A7:1920 | Em7:1920 | A7:1920",
      "Em7:1920 | A7:1920 | Em9:1920 | ~Em9:1920",
    ],
    header: { title: "Two-chord groove", key: "Em", tempo: null, style: "funk" },
    sections: ["Intro: intro, Em, 4/4", "A: body, Em, 4/4", "Outro: ending, Em, 4/4"],
    jam: {
      intro: "Em7:1920 | Em7:1920 | Em7:1920 | Em7:1920",
      body: "Em7:1920 | A7:1920 | Em7:1920 | A7:1920 | Em7:1920 | A7:1920 | Em7:1920 | A7:1920",
      ending: "Em7:1920 | A7:1920 | Em9:1920 | ~Em9:1920",
    },
    print: chart`
      title: Two-chord groove
      key: Em
      style: funk

      [Intro]
      | Em7 | % | % | % |

      [A]
      |: Em7 | A7 :| x4

      [Outro]
      | Em7 | A7 | Em9 | . |
    `,
  },
];

// ── 11. Arrangement block ───────────────────────────────────────────────────

/** A song of seven sections, for an arrangement to be written against. */
const arrangedSong = `key: C

[Intro]
| C | F |

[Verse]
| C | F | G | C |

[Chorus]
| F | G | C | Am |

[Verse 2]
| C | F | G | C |

[Solo]
| Am | F | G | C |

[Chorus]

[Outro]
| F | C |
`;
const arrangedBars =
  "C:1920 | F:1920 | C:1920 | F:1920 | G:1920 | C:1920 | F:1920 | G:1920 | C:1920 | Am:1920 | " +
  "C:1920 | F:1920 | G:1920 | C:1920 | Am:1920 | F:1920 | G:1920 | C:1920 | " +
  "F:1920 | G:1920 | C:1920 | Am:1920 | F:1920 | C:1920";
const arranged = (block: string): string => `${arrangedSong}\n${block}`;

const arrangement: Row[] = [
  {
    name: "an arrangement: one line for each section the song plays, a label then five values (spec 11)",
    text: arranged(chart`
      --- arrangement
      //       energy  drums  bass  chords  solo
      Intro    1       .      -     -       .
      Verse    2       -      -     -       .
      Chorus   4       -      -     -       .
      Verse 2  2       -      -     -       .
      Solo     3       -      -     -       -
      Chorus   4       -      -     -       -
      Outro    2       1      -     -       .
    `),
    bars: arrangedBars,
    diagnostics: [],
  },
  {
    name: "an arrangement is printed with its heading and its columns in line; its comments stay",
    text: arranged(chart`
      ---arrangement
      // the band comes in after the intro
      intro 1 . - - .
      Verse 2 - - - .
      Chorus 4 - - - .  // loud
      Verse  2 2 - - - .

      Solo 3 - - - -
      Chorus 4 - - - -
      Outro 2 1 - - .
      // and out
    `),
    bars: arrangedBars,
    diagnostics: [],
    print: arranged(chart`
      --- arrangement
      //       energy  drums  bass  chords  solo
      // the band comes in after the intro
      intro    1       .      -     -       .
      Verse    2       -      -     -       .
      Chorus   4       -      -     -       .  // loud
      Verse 2  2       -      -     -       .
      Solo     3       -      -     -       -
      Chorus   4       -      -     -       -
      Outro    2       1      -     -       .
      // and out
    `),
  },
  {
    name: "an arrangement value that is not a level is an error at the value, and the block prints as typed",
    text: arranged(chart`
      --- arrangement
      Intro 1 . - - .
      Verse 5 - x - .
      Chorus . - - - .
      Verse 2 - - -
      Solo 3 - - - -
      Chorus 4 - - - -
      Outro 2 1 - - .
    `),
    bars: arrangedBars,
    diagnostics: [
      ["error", "25:7", "`5` is not a level"],
      ["error", "25:11", "`x` is not a level"],
      ["error", "26:8", "A section cannot lay out"],
      ["error", "27:1", "a section's label and five values"],
      // The short line reads as `Verse`, which is not what the song plays there.
      ["warning", "27:1", "The song plays `Verse 2` here"],
    ],
    print: arranged(chart`
      --- arrangement
      Intro 1 . - - .
      Verse 5 - x - .
      Chorus . - - - .
      Verse 2 - - -
      Solo 3 - - - -
      Chorus 4 - - - -
      Outro 2 1 - - .
    `),
  },
  {
    name: "an arrangement whose lines are not the song's sections in order is kept and not used: a wrong label",
    text: arranged(chart`
      --- arrangement
      Intro 1 . - - .
      Verse 2 - - - .
      Bridge 4 - - - .
    `),
    bars: arrangedBars,
    diagnostics: [
      ["warning", "26:1", "The song plays `Chorus` here, and this line is for `Bridge`"],
    ],
  },
  {
    name: "an arrangement with too few lines for the song is marked where it starts; one with too many, at the first to spare",
    text: chart`
      key: C
      [A]
      | C | F |
      [B]
      | G | C |
      --- arrangement
      A - - - - .
    `,
    bars: "C:1920 | F:1920 | G:1920 | C:1920",
    diagnostics: [["warning", 6, "The song plays 2 sections, and the arrangement has 1 line"]],
  },
  {
    name: "an arrangement with a line to spare is marked at that line",
    text: chart`
      key: C
      | C | F |
      --- arrangement
      A - - - - .
      B - - - - .
    `,
    bars: "C:1920 | F:1920",
    diagnostics: [["warning", 5, "The song plays 1 section, and this is line 2"]],
  },
  {
    name: "--- followed by anything but `arrangement` ends the chart: what follows is kept, not read, and noted",
    text: chart`
      key: C
      [Intro]
      | C | F |
      [A]
      | G | C |
      --- notes
      play it twice as fast
    `,
    bars: "C:1920 | F:1920 | G:1920 | C:1920",
    diagnostics: [["info", 6, "kept and not read"]],
    print: chart`
      key: C

      [Intro]
      | C | F |

      [A]
      | G | C |

      --- notes
      play it twice as fast
    `,
  },
];

// ── 12. Reserved for later ──────────────────────────────────────────────────

const reserved: Row[] = [
  {
    name: "reserved: Nashville digits are not chords yet, and the error points to roman numerals",
    text: inC("| 1 | 4 | 5 | 1 |"),
    bars: "NC:1920 | ~NC:1920 | ~NC:1920 | ~NC:1920",
    diagnostics: [
      ["error", 2, "use a roman numeral"],
      ["error", 2, "use a roman numeral"],
      ["error", 2, "use a roman numeral"],
      ["error", 2, "use a roman numeral"],
    ],
  },
  {
    name: "reserved: modes other than major and minor are not keys yet",
    text: "key: D dorian\n| Dm7 | G7 |\n",
    bars: "Dm7:1920 | G7:1920",
    header: { key: "Dm" },
    diagnostics: [["error", 1, "is not a key"]],
    print: "key: D dorian\n\n| Dm7 | G7 |\n",
  },
];

export const corpus: readonly Row[] = [
  ...completeExample,
  ...fileStructure,
  ...sections,
  ...bars,
  ...repeats,
  ...absoluteChords,
  ...numerals,
  ...qualities,
  ...alterations,
  ...ambiguity,
  ...diagnosticsTable,
  ...transposition,
  ...printing,
  ...moreExamples,
  ...arrangement,
  ...reserved,
];
