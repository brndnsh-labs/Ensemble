import type { InstrumentVoice, SwingSub } from '../types.js';

export type ChartNotation = 'roman' | 'name' | 'nns';
export type SoloistMode = 'monophonic' | 'guitar';
/**
 * Trading with the player on the band engine: who the band trades with ('off' when it doesn't)
 * and how many bars a turn lasts.
 */
export type SoloistTradeWith = 'off' | 'soloist' | 'drums';
export type SoloistTradeBars = 2 | 4 | 8;
export const SOLOIST_TRADE_BARS: readonly SoloistTradeBars[] = [2, 4, 8];
/**
 * How many traded choruses before the head returns. `0` keeps trading forever (the original
 * behavior, before this setting existed) — the band engine's `TradeSettings.choruses` reads
 * that as `null`. Absent (a chart saved before this setting) reads as 2.
 */
export type SoloistTradeChoruses = 0 | 1 | 2 | 3 | 4;
export const DEFAULT_SOLOIST_TRADE_CHORUSES: SoloistTradeChoruses = 2;

/**
 * The band's energy for this chart: a fixed level (0-1, the band engine's
 * `BandSettings.intensity`), or `'auto'` to let the band shape it over the form. Absent (a chart
 * saved before energy was saved with it) reads as `'auto'`.
 */
export type ChartEnergy = number | 'auto';

/*
 * What a chart holds: the music plus the settings the band honours (DECISION 2026-09-26, #1404).
 * The old worker-based engine's band and performance fields (deleted with it in #1415) are gone
 * from the format too (#1741): a document that still carries one is refused, like any other
 * unknown field.
 */

export interface ChartPerformance {
    bpm: number;
    seed: string;
    randomizeSeed: boolean;
    /** Absent reads as `'auto'`. See {@link ChartEnergy}. */
    energy?: ChartEnergy;
}

export interface ChartLaneMix {
    enabled: boolean;
    voice: InstrumentVoice;
    autoSound: boolean;
    volume: number;
    reverb: number;
}

export interface ChartSoloist extends ChartLaneMix {
    /** How the built-in lead voice phrases; the synth soloist reads it. */
    mode: SoloistMode;
    /** On: `mode` follows the lead's sound and the genre rather than staying pinned. */
    autoMode: boolean;
    /** Absent (a chart saved before trading, or not trading) reads as 'off'. */
    tradeWith?: SoloistTradeWith;
    /** Absent reads as 4. */
    tradeBars?: SoloistTradeBars;
    /** Absent reads as 2. See `SoloistTradeChoruses`. */
    tradeChoruses?: SoloistTradeChoruses;
}

export interface ChartGroove extends ChartLaneMix {
    swing: number;
    swingSub: SwingSub;
    humanize: number;
    /** The chart's genre: a canonical genre NAME (`GENRE_NAMES` in `core/data/smart-genres.ts`). */
    genre: string;
}

export interface ChartBand {
    chords: ChartLaneMix;
    bass: ChartLaneMix;
    soloist: ChartSoloist;
    groove: ChartGroove;
}

/**
 * The settings a chart holds beside its music (DECISION 2026-09-26, #1404): what the band
 * honours. The music itself is the chart's `score` (`ChartDocumentV2` in `score-types.ts`).
 */
export interface ChartSettings {
    performance: ChartPerformance;
    band: ChartBand;
}

export interface CodecIssue {
    path: string;
    code:
        | 'input-too-large'
        | 'invalid-json'
        | 'structure-too-deep'
        | 'structure-too-large'
        | 'cyclic-input'
        | 'invalid-type'
        | 'invalid-value'
        | 'missing-field'
        | 'unknown-field';
    message: string;
}

export type CodecDecodeResult<T> =
    | { kind: 'ok'; value: T }
    | { kind: 'invalid'; issues: CodecIssue[] }
    | { kind: 'future-version'; schemaVersion: number; source: unknown };

export type CodecEncodeResult =
    | { kind: 'ok'; json: string }
    | { kind: 'invalid'; issues: CodecIssue[] };
