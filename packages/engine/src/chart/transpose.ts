// Transposition is a change of key. Every chord keeps its degree and is
// spelled again in the new key. The text each chord was typed as is left
// alone; printing the result is the "transpose and rewrite".

import type { Key } from "../theory/pitch.ts";
import { degreeOf, keyToString, noteAtDegree } from "../theory/pitch.ts";
import { parseKey } from "./fields.ts";
import type { Bar, Chart, ChartComment, ChartField, RepeatItem, Section } from "./model.ts";
import { respellChord } from "./symbol.ts";

export function transpose(chart: Chart, toKey: Key): Chart {
  /** A section's own key moves by the same interval as the chart's. */
  const moved = (key: Key): Key => ({
    tonic: noteAtDegree(degreeOf(key.tonic, chart.key), toKey),
    mode: key.mode,
  });

  const sections: Section[] = [];
  for (const section of chart.sections) {
    const ownKeyLine = keyLine(section);
    // A section that repeats an earlier one follows it; `sections` holds only earlier ones.
    const repeated = section.barsFrom === null ? undefined : sections[section.barsFrom];
    const key = ownKeyLine ? moved(section.key) : (repeated?.key ?? toKey);
    const bar = (item: Bar): Bar => ({
      ...item,
      tokens: item.tokens.map((token) =>
        token.kind === "chord" ? { ...token, chord: respellChord(token.chord, key) } : token,
      ),
    });
    const each = <T extends RepeatItem>(item: T): T | Bar | ChartField => {
      if (item.kind === "bar") return bar(item);
      return item === ownKeyLine ? { ...ownKeyLine, value: keyToString(key) } : item;
    };
    sections.push({
      ...section,
      key,
      items: section.items.map((item) =>
        item.kind !== "repeat"
          ? each(item)
          : {
              ...item,
              body: item.body.map(each),
              endings: item.endings.map((ending) => ({ ...ending, items: ending.items.map(each) })),
            },
      ),
    });
  }
  return { ...chart, key: toKey, header: headerIn(chart, toKey), sections };
}

/** The `key:` line that sets a section's own key: the first one, above its bars, if it reads. */
function keyLine(section: Section): ChartField | null {
  for (const item of section.items) {
    if (item.kind === "bar" || item.kind === "repeat") break;
    if (item.kind === "field" && item.name === "key") return parseKey(item.value) ? item : null;
  }
  return null;
}

/** The header with its key line rewritten, or with one added after the title if it had none. */
function headerIn(chart: Chart, key: Key): (ChartField | ChartComment)[] {
  const value = keyToString(key);
  const existing = chart.header.find((item) => item.kind === "field" && item.name === "key");
  if (existing)
    return chart.header.map((item) => (item === existing ? { ...existing, value } : item));
  const added: ChartField = {
    kind: "field",
    name: "key",
    value,
    range: { start: 0, end: 0, line: 1, column: 1 },
  };
  const title = chart.header.findIndex((item) => item.kind === "field" && item.name === "title");
  return [...chart.header.slice(0, title + 1), added, ...chart.header.slice(title + 1)];
}
