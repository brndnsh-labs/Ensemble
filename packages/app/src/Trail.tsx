// The way back, at the top left of every screen below home: the places above
// this one, each a link named for where it goes. Home first, then the part of
// the library the screen belongs under. It is the same row however the player
// arrived, so it can be learned.

import type { Chart } from "@ensemble/engine";
import { styleById } from "@ensemble/styles";
import type { ReactNode } from "react";
import { HOME, LIBRARY, showing } from "./address.ts";

/** A place above a screen. */
export interface Place {
  readonly href: string;
  readonly name: string;
  /** A style's id, when the place is the library showing that style: its name is drawn as its bill, small. */
  readonly style?: string;
}

/** Where a chart is found in the library: under the style its text names, or among all the charts when it names none. */
export function placeOf(chart: Chart): Place {
  const style = styleById(chart.styleId ?? "");
  return style
    ? { href: showing(style.id), name: style.name, style: style.id }
    : { href: LIBRARY, name: "Charts" };
}

interface Props {
  /** The place between home and this screen, if there is one. */
  readonly place?: Place | undefined;
  /** This screen's own name, said after the places above it where a screen has no other heading in view. */
  readonly here?: ReactNode;
}

export function Trail({ place, here }: Props) {
  return (
    <nav className="trail" aria-label="Where you are">
      <a className="crumb to-home" href={HOME}>
        <svg viewBox="0 0 22 22" aria-hidden="true">
          <path d="M13.5 4.5L7 11l6.5 6.5" />
        </svg>
        <span>Home</span>
      </a>
      {place && (
        <>
          <span className="crumb-sep" aria-hidden="true">
            /
          </span>
          <a
            className={`crumb place${place.style ? " style" : ""}`}
            data-style={place.style}
            href={place.href}
          >
            {place.name}
          </a>
        </>
      )}
      {here}
    </nav>
  );
}
