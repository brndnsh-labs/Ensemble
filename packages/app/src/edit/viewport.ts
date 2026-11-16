// The part of the screen a phone's keyboard leaves. A browser on a phone does
// not make the page shorter when the keyboard comes up: it shrinks and moves
// the "visual viewport" over the page instead, and says so on
// `window.visualViewport`. The editor fits itself to that, so the key row sits
// on top of the keyboard and the text being typed stays above both.

import { useEffect, useState } from "react";

/** In page pixels: how far down the screen's visible part starts, and how tall it is. */
export interface Area {
  readonly top: number;
  readonly height: number;
}

/** The visible area while `active` and on a touch screen; undefined otherwise, when the page is the screen. */
export function useVisibleArea(active: boolean): Area | undefined {
  const [area, setArea] = useState<Area>();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport || !matchMedia("(pointer: coarse)").matches) {
      setArea(undefined);
      return;
    }
    const measure = () =>
      setArea((last) =>
        last?.top === viewport.offsetTop && last.height === viewport.height
          ? last
          : { top: viewport.offsetTop, height: viewport.height },
      );
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, [active]);
  return area;
}

/**
 * Whether the screen is one that is touched, and so types on a keyboard that
 * covers half of it: there a bar is typed in a dock on top of that keyboard,
 * and under a mouse it is typed where it stands.
 */
export function useTouchScreen(): boolean {
  const [touch, setTouch] = useState(() => matchMedia("(pointer: coarse)").matches);
  useEffect(() => {
    const query = matchMedia("(pointer: coarse)");
    const changed = () => setTouch(query.matches);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  return touch;
}
