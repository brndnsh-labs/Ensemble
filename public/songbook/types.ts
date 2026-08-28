import type {
    ChordDensity,
    InstrumentVoice,
    Palette,
    SectionInstrumentKey,
    SwingSub,
    ThemeMode,
} from '../types.js';

export const CHART_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_PREFERENCES_SCHEMA_VERSION = 1 as const;

export type ChartDocumentSchemaVersion = typeof CHART_DOCUMENT_SCHEMA_VERSION;
export type WorkspacePreferencesSchemaVersion = typeof WORKSPACE_PREFERENCES_SCHEMA_VERSION;
export type ChartNotation = 'roman' | 'name' | 'nns';
export type SoloistMode = 'monophonic' | 'guitar';
export type SoloistTradeMode = 'manual' | 'sections' | 'loops';
export const CHART_GROOVE_PATTERN_LANE_NAMES = [
    'Kick',
    'Snare',
    'HiHat',
    'Open',
    'Clave',
    'Conga',
    'Bongo',
    'Perc',
    'Shaker',
    'Guiro',
    'High Tom',
    'Mid Tom',
    'Low Tom',
] as const;
export type ChartGroovePatternLaneName = (typeof CHART_GROOVE_PATTERN_LANE_NAMES)[number];

export interface ChartSection {
    id: string;
    label: string;
    value: string;
    repeat?: number;
    key?: string;
    isMinor?: boolean;
    timeSignature?: string;
    seamless?: boolean;
    targetIntensity?: number;
    instruments?: Partial<Record<SectionInstrumentKey, boolean>>;
}

export interface ChartArrangement {
    sections: ChartSection[];
    key: string;
    timeSignature: string;
    grouping: number[] | null;
    isMinor: boolean;
    notation: ChartNotation;
    lastChordPreset: string;
}

export interface ChartPerformance {
    bpm: number;
    complexity: number;
    seed: string;
    randomizeSeed: boolean;
}

export interface ChartLaneMix {
    enabled: boolean;
    voice: InstrumentVoice;
    autoSound: boolean;
    volume: number;
    reverb: number;
}

export interface ChartChords extends ChartLaneMix {
    style: string;
    instrument?: string;
    octave: number;
    density: ChordDensity;
}

export interface ChartBass extends ChartLaneMix {
    style: string;
    octave: number;
}

export interface ChartSoloist extends ChartLaneMix {
    style: string;
    preset: 'trumpet';
    octave: number;
    mode: SoloistMode;
    autoMode: boolean;
    phrasingIntensity: number;
    tradeMode: SoloistTradeMode;
}

export interface ChartHarmony extends ChartLaneMix {
    style: string;
    octave: number;
    complexity: number;
}

export interface ChartGroovePatternLane {
    name: ChartGroovePatternLaneName;
    steps: number[];
}

export interface ChartGroove extends ChartLaneMix {
    measures: number;
    swing: number;
    swingSub: SwingSub;
    humanize: number;
    lastDrumPreset: string;
    genreFeel: string;
    lastSmartGenre: string;
    pattern: ChartGroovePatternLane[];
}

export interface ChartBand {
    chords: ChartChords;
    bass: ChartBass;
    soloist: ChartSoloist;
    harmony: ChartHarmony;
    groove: ChartGroove;
}

/**
 * Portable authored content. This shape is intentionally semantic rather than a
 * projection of the live state slices: repositories can persist it without
 * importing or reading those slices.
 */
export interface ChartContent {
    arrangement: ChartArrangement;
    performance: ChartPerformance;
    band: ChartBand;
}

export interface ChartDocument {
    schemaVersion: ChartDocumentSchemaVersion;
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    revision: number;
    chart: ChartContent;
}

export interface WorkspaceAppearancePreferences {
    palette: Palette;
    mode: ThemeMode;
    visualFlash: boolean;
    qualityColors: boolean;
    visualizerEnabled: boolean;
}

export interface WorkspacePracticePreferences {
    countIn: boolean;
    applyPresetSettings: boolean;
    sessionTimer: number;
    songMode: boolean;
    practiceMode: boolean;
    rampBpmPerLoop: number;
    rampStartPct: number;
}

export interface WorkspaceMidiPreferences {
    enabled: boolean;
    selectedOutputId: string | null;
    inputEnabled: boolean;
    selectedInputId: string | null;
    chordsChannel: number;
    bassChannel: number;
    soloistChannel: number;
    harmonyChannel: number;
    drumsChannel: number;
    chordsOctave: number;
    bassOctave: number;
    soloistOctave: number;
    harmonyOctave: number;
    drumsOctave: number;
    latency: number;
    muteLocal: boolean;
    velocitySensitivity: number;
}

export interface WorkspacePreferences {
    schemaVersion: WorkspacePreferencesSchemaVersion;
    appearance: WorkspaceAppearancePreferences;
    practice: WorkspacePracticePreferences;
    masterVolume: number;
    midi: WorkspaceMidiPreferences;
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
        | 'unknown-field'
        | 'too-many-sections';
    message: string;
}

export type CodecDecodeResult<T> =
    | { kind: 'ok'; value: T }
    | { kind: 'invalid'; issues: CodecIssue[] }
    | { kind: 'future-version'; schemaVersion: number; source: unknown };

export type CodecEncodeResult =
    | { kind: 'ok'; json: string }
    | { kind: 'invalid'; issues: CodecIssue[] };
