// What the app remembers between visits: how the player likes to read a chart
// and set up a band, and what they changed for each chart. Kept in the
// browser; nothing here is worth losing sleep over if it is cleared.

import type { Seat } from "@ensemble/engine";
import type { Reading } from "./play/ChordSymbol.tsx";

export interface ChartChoices {
  readonly style?: string;
  /** A key as it is typed in a chart: `Bb`, `F#m`. */
  readonly key?: string;
  readonly tempo?: number;
  /**
   * Played as a song, once through, in place of a jam of the length chosen
   * for every chart. Unset: a song when the chart's arrangement fits it.
   */
  readonly song?: boolean;
  /**
   * The soloist's instrument, where the player has chosen one for this chart.
   * Unset: the style's own (a lead guitar in rock, an alto in the blues).
   */
  readonly soloInstrument?: string;
}

export interface Settings {
  readonly reading: Reading;
  /** Minutes, or null to go round until stopped. */
  readonly minutes: number | null;
  readonly band: Readonly<Record<Seat, boolean>>;
  readonly charts: Readonly<Record<string, ChartChoices>>;
}

const KEY = "ensemble.settings.1";

const DEFAULTS: Settings = {
  reading: "names",
  minutes: 3,
  // The soloist sits out until asked: someone practising wants the band.
  band: { drums: true, bass: true, chords: true, solo: false },
  charts: {},
};

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    return { ...DEFAULTS, ...stored, band: { ...DEFAULTS.band, ...stored.band } };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private browsing, or a full disk: the choice lasts for this visit only.
  }
}
