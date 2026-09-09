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

export type ScoreDestination =
    | { kind: 'end' }
    | { kind: 'fine'; label: string }
    | { kind: 'coda'; via: string; target: string }
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
      };

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
}
