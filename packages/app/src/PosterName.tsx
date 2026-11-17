// A style's name set the way wood type is: in capitals, as narrow and heavy
// as the face goes, and as large as fills the measure it is given. The
// stylesheet does the fitting (the type's size is the measure divided by the
// name's width in ems); this finds that width, once for each name, by setting
// the name in the real letters and measuring it.

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

/** The poster face, as the browser's font loader names it. The stylesheet narrows it (`.poster-name`). */
const FACE = '900 100px "Archivo Variable"';

/** About what a capital is wide, in ems: used only until the real letters have arrived. */
const ABOUT = 0.49;

const measured = new Map<string, number>();
let arrived = false;

function widthOf(name: string): number {
  let width = measured.get(name);
  if (width === undefined) {
    const probe = document.createElement("span");
    probe.className = "poster-name measuring";
    probe.textContent = name;
    document.body.append(probe);
    // Set at 100 px, so a hundredth of its width is its width in ems.
    width = probe.getBoundingClientRect().width / 100 || name.length * ABOUT;
    probe.remove();
    measured.set(name, width);
  }
  return width;
}

/** Whether the poster face's own letters are in the browser, so that a size worked out for them holds. */
export function useLettersIn(): boolean {
  const [ready, setReady] = useState(() => arrived || document.fonts.check(FACE));
  useEffect(() => {
    if (ready) {
      arrived = true;
      return;
    }
    let current = true;
    document.fonts.load(FACE).then(
      () => {
        arrived = true;
        if (current) setReady(true);
      },
      () => {
        // The letters could not be fetched: the guess stands, set in whatever face the device has.
      },
    );
    return () => {
      current = false;
    };
  }, [ready]);
  return ready;
}

/** A name's width in ems in the poster face, measured once its letters are in (`useLettersIn`). */
export const posterWidth = (name: string): number => widthOf(name);

/**
 * Each name's width in ems. Until the type's own letters are in the browser
 * the widths are a guess, so a name is never set in the wrong letters at a
 * size worked out for the right ones; then they are measured, and kept.
 */
export function usePosterWidths(): (name: string) => number {
  const ready = useLettersIn();
  return (name) => (ready ? widthOf(name) : name.length * ABOUT);
}

interface Props {
  readonly name: string;
  /** From `usePosterWidths`. */
  readonly width: number;
  /** A heading where the name is the screen's own; otherwise a line of a larger thing. */
  readonly heading?: boolean;
}

export function PosterName({ name, width, heading = false }: Props) {
  const Tag = heading ? "h1" : "span";
  return (
    <Tag className="poster-name" style={{ "--w": width.toFixed(3) } as CSSProperties}>
      {name}
    </Tag>
  );
}
