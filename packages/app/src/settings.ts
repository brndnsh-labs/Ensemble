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
  /**
   * The instrument a seat is played on, by its pack, where the style offers
   * more than one and the player has chosen for this chart. Unset: the style's own.
   */
  readonly instruments?: Readonly<Partial<Record<Exclude<Seat, "solo">, string>>>;
}

export interface Settings {
  readonly reading: Reading;
  /** Minutes, or null to go round until stopped. */
  readonly minutes: number | null;
  readonly band: Readonly<Record<Seat, boolean>>;
  /**
   * How busy the soloist is, 0 the sparsest to 1 the busiest, 0.5 the style's
   * own. The player's taste, so one for every chart, as the band is.
   */
  readonly soloDensity: number;
  /** In a jam, the soloist has the lead from the first time round, not after the band has played the form once. */
  readonly soloFromTop: boolean;
  /**
   * In a jam, the tempo breathes with the band: a touch quicker as it builds, easing as it
   * settles. Off unless chosen: the tempo set, in every bar, is what someone practises to.
   */
  readonly breathe: boolean;
  readonly charts: Readonly<Record<string, ChartChoices>>;
}

const KEY = "ensemble.settings.1";

const DEFAULTS: Settings = {
  reading: "names",
  minutes: 3,
  // The soloist sits out until asked: someone practising wants the band.
  band: { drums: true, bass: true, chords: true, solo: false },
  soloDensity: 0.5,
  soloFromTop: false,
  breathe: false,
  charts: {},
};

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    // Settings kept before a setting existed lack it, and take its default.
    const density = stored.soloDensity;
    return {
      ...DEFAULTS,
      ...stored,
      band: { ...DEFAULTS.band, ...stored.band },
      soloDensity:
        typeof density === "number" && density >= 0 && density <= 1
          ? density
          : DEFAULTS.soloDensity,
      soloFromTop: stored.soloFromTop === true,
      breathe: stored.breathe === true,
    };
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
