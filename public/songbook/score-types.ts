import type { SectionInstrumentKey } from '../types.js';
import type { ChartBand, ChartDocument, ChartNotation, ChartPerformance } from './types.js';

/** Reduced rational quarter-note units. Never seconds, pixels, or generated engine steps. */
export type ScoreDuration = [numerator: number, denominator: number];

export type ScoreEvent =
    | {
          kind: 'chord';
          symbol: string;
          duration: ScoreDuration;
          alternates?: string[];
          fermata?: boolean;
      }
    | { kind: 'no-chord' | 'hold'; duration: ScoreDuration; fermata?: boolean };

/** Depart at the `via` coda marker, arrive at the `target` coda marker. */
export interface ScoreCodaDestination {
    kind: 'coda';
    via: string;
    target: string;
}

/**
 * Where a last-chorus coda goes. With no `via` it is a tag (#1487): the chart writes no
 * departure sign, so the last chorus plays the whole form and on into the coda at `target`.
 */
export interface ScoreLastChorusDestination {
    kind: 'coda';
    via?: string;
    target: string;
}

export type ScoreDestination =
    | { kind: 'end' }
    | { kind: 'fine'; label: string }
    | ScoreCodaDestination
    | { kind: 'ending'; pass: number };

/** Authored navigation, not an already-unrolled list of performed measures. */
export type ScoreDirection =
    | { kind: 'repeat-start' | 'ending-end' }
    | { kind: 'repeat-end'; times: number }
    | { kind: 'ending-start'; passes: number[] }
    | { kind: 'segno' | 'coda' | 'fine'; label: string }
    | {
          kind: 'jump';
          from: 'start' | 'segno';
          segno?: string;
          destination: ScoreDestination;
          repeats: 'play' | 'skip';
      }
    /**
     * "To Coda, last time" (#1472). Only the final chorus of a counted performance
     * (`SemanticScore.choruses`) hops from `via` to `target`. Every other chorus, and every
     * chorus of an uncounted one, ends where `target` begins: the bars from there on are
     * written outro material. Sits on the same boundary as its `via` marker; with no `via`
     * (#1487) nothing is skipped, and it sits on its `target` marker's boundary instead.
     */
    | { kind: 'last-chorus'; destination: ScoreLastChorusDestination };

export interface ScoreContext {
    key?: string;
    isMinor?: boolean;
    meter?: string;
    /** Denominator counts. A written meter resets grouping to null unless supplied here. */
    grouping?: number[] | null;
}

export interface ScoreMeasure extends ScoreContext {
    // Context changes persist until changed again within this section, not across sections.
    id: string;
    content:
        | { kind: 'events'; events: ScoreEvent[] }
        | {
              kind: 'repeat';
              /** Explicit earlier source identity; reordering cannot silently change its music. */
              measureId: string;
              display: 'one-bar' | 'two-bar-start' | 'two-bar-end';
          };
    start?: ScoreDirection[];
    end?: ScoreDirection[];
    annotations?: { text: string; at: ScoreDuration; placement: 'above' | 'below' }[];
}

export interface ScoreSection extends ScoreContext {
    id: string;
    label: string;
    repeat: number;
    measures: ScoreMeasure[];
    seamless?: boolean;
    targetIntensity?: number;
    instruments?: Partial<Record<SectionInstrumentKey, boolean>>;
}

export interface SemanticScore {
    notation: ChartNotation;
    key: string;
    isMinor: boolean;
    meter: string;
    grouping: number[] | null;
    sections: ScoreSection[];
    /**
     * Choruses in a performance, 1–64 (#1472): the form is played this many times and a
     * last-chorus coda is taken on the final one. Absent, one chorus loops forever and a
     * last-chorus coda is never taken.
     */
    choruses?: number;
}

/** Semantic document; the isolated preview reads both versions. V1 sources are never rewritten. */
export interface ChartDocumentV2 extends Omit<ChartDocument, 'schemaVersion' | 'chart'> {
    schemaVersion: 2;
    chart: {
        score: SemanticScore;
        performance: ChartPerformance;
        band: ChartBand;
    };
    metadata?: { composer?: string; style?: string };
    /** Exact local import source, never interpreted as markup or sent to telemetry. */
    importSource?: { format: 'irealbook' | 'irealb'; text: string };
}
