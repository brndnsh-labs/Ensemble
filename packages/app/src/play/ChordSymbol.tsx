// A chord symbol set as type: a large root, a small quality, one set of signs.
// The accidentals and the major-seventh triangle are drawn here, since few
// typefaces carry them and none agree on how they look.

import type { ChartChord } from "@ensemble/engine";
import { chordParts } from "@ensemble/engine";
import type { ReactNode } from "react";

/** How chords are read: as names, as numerals, or names with the numerals under them. */
export type Reading = "names" | "numerals" | "both";

const SIGNS: Readonly<Record<string, ReactNode>> = {
  "♭": (
    <svg className="sign" viewBox="0 0 9 20" aria-hidden="true">
      <path d="M2 1.5v15.5c3.2-1.6 5.6-3.8 5.6-6.4 0-2.9-3.6-2.9-5.6-.4" />
    </svg>
  ),
  "♯": (
    <svg className="sign" viewBox="0 0 11 20" aria-hidden="true">
      <path d="M3.6 3.5v15M7.4 1.5v15" strokeWidth="1.3" />
      <path d="M1 9.2l9-2.4M1 14.2l9-2.4" strokeWidth="2.3" />
    </svg>
  ),
  "△": (
    <svg className="sign" viewBox="0 0 13 20" aria-hidden="true">
      <path d="M1.5 16.5l5-12 5 12z" />
    </svg>
  ),
};

/** Text with its musical signs drawn. */
function signs(text: string): ReactNode[] {
  return [...text].map((character, i) => {
    const sign = SIGNS[character];
    // biome-ignore lint/suspicious/noArrayIndexKey: the characters of a fixed string never reorder
    return sign ? <span key={i}>{sign}</span> : character;
  });
}

/** A root as it is set: `Bb` and `bVII` with a drawn flat. */
function rootText(root: string, numeral: boolean): string {
  const flat = (text: string) => text.replaceAll("b", "♭").replaceAll("#", "♯");
  if (numeral) return root.replace(/^[b#]+/, flat);
  return root[0] + flat(root.slice(1));
}

/** A quality in the one symbol set: a triangle for major seven, a circle for diminished. */
function qualityText(quality: string): string {
  return quality
    .replace(/^m7b5/, "ø7")
    .replace(/^mMaj/, "m△")
    .replace(/^maj/, "△")
    .replace(/^dim/, "°")
    .replace(/^o/, "°")
    .replace(/^aug/, "+")
    .replace(/sus4/, "sus")
    .replace(/b(?=\d)/g, "♭")
    .replace(/#(?=\d)/g, "♯");
}

function Parts({ chord, as }: { chord: ChartChord; as: "name" | "numeral" }) {
  const { root, quality, of, bass } = chordParts(chord, as);
  const numeral = as === "numeral";
  const under = of ?? bass;
  return (
    <>
      <span className="root">{signs(rootText(root, numeral))}</span>
      {quality && <span className="quality">{signs(qualityText(quality))}</span>}
      {under !== null && <span className="under">/{signs(rootText(under, numeral))}</span>}
    </>
  );
}

export function ChordSymbol({ chord, reading }: { chord: ChartChord | null; reading: Reading }) {
  if (chord === null) return <span className="chord rest">N.C.</span>;
  if (reading === "both")
    return (
      <span className="chord stacked">
        <span className="over">
          <Parts chord={chord} as="name" />
        </span>
        <span className="below">
          <Parts chord={chord} as="numeral" />
        </span>
      </span>
    );
  return (
    <span className="chord">
      <Parts chord={chord} as={reading === "names" ? "name" : "numeral"} />
    </span>
  );
}

/** The sign for "the bar before, again". */
export function Simile() {
  return (
    <svg className="simile" viewBox="0 0 20 20" role="img" aria-label="repeat the bar before">
      <path d="M5 16L15 4" />
      <circle cx="5.5" cy="6.5" r="1.7" />
      <circle cx="14.5" cy="13.5" r="1.7" />
    </svg>
  );
}
