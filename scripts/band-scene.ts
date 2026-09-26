/**
 * The listening-gate tools' band adapter: a `mix:report` scene in, the band engine's
 * performance of it out. Pure and node-side — the page (`prototypes/v2/lib/render-bridge.ts`)
 * only turns these events into audio — so what a render plays is decided here, under test, by
 * the same `compileTimeline` → `performPass` the app runs.
 *
 * A scene carries only what the band has a setting for: the chart (sections of `|`-separated
 * bars in the chart editor's bar syntax), key, meter, tempo, genre, energy, which lanes play and
 * which sound each lane is heard on. Old-engine scene fields (`drumPreset`, `complexity`,
 * `chordStyle`, `bassStyle`, `density`, `includeHarmony`, …) are accepted and ignored: the band
 * has no such setting.
 */
import {
    type BandEvent,
    type BandSettings,
    type CompInstrument,
    compileTimeline,
    DEFAULT_SETTINGS,
    GM_DRUMS,
    type Lane,
    type LeadInstrument,
    type PassMemory,
    PPQ,
    performPass,
    STYLES,
    type StyleId,
    type Timeline,
} from '../band/index.js';
import {
    COMP_FOR_VOICE,
    LEAD_FOR_VOICE,
    STYLE_FOR_GENRE,
} from '../prototypes/v2/lib/band-voices.js';
import { parseChordBar } from '../public/songbook/score-text.js';
import type { ScoreMeasure, ScoreSection, SemanticScore } from '../public/songbook/score-types.js';

/** A sixteenth in ticks: the step grid the report's per-step analysis and event meta use. */
const STEP_TICKS = PPQ / 4;

export interface SceneSection {
    id?: string;
    label?: string;
    /** The section's bars, `|`-separated, in the chart editor's bar syntax (`C:2 G7:2 | N.C.`). */
    value: string;
    repeat?: number;
    key?: string;
    isMinor?: boolean;
    timeSignature?: string;
}

/** A lane's sound pin, by the state module that holds it: `groove`, `bass`, `chords`, `soloist`. */
export interface VoicePin {
    module: string;
    voice: string;
}

export interface MixScene {
    id: string;
    label?: string;
    /** One of the 13 canonical genres; it picks the band's style. */
    genreFeel: string;
    bpm: number;
    key: string;
    isMinor?: boolean;
    timeSignature?: string;
    /** The band's energy, 0–1, held for the whole render. */
    intensity?: number;
    sections: SceneSection[];
    includeDrums?: boolean;
    includeBass?: boolean;
    includeChords?: boolean;
    includeSoloist?: boolean;
    voices?: VoicePin[];
    /** The comp instrument; default: the chords lane's pinned sound's instrument, else the style's. */
    comp?: CompInstrument;
    /** The lead instrument; default: the soloist lane's pinned pack's instrument, else the style's. */
    lead?: LeadInstrument;
    /** 0–100; default: the style's own feel. */
    swing?: number;
    humanize?: number;
}

/** The state modules that hold a lane's sound, keyed by the band lane they voice. */
export const LANE_MODULE: Record<Lane, string> = {
    drums: 'groove',
    bass: 'bass',
    comp: 'chords',
    lead: 'soloist',
};
const LANE_MODULES = Object.values(LANE_MODULE);

/** The report's historical track names for the band's lanes (the stems keep their names). */
export const LANE_TRACK: Record<Lane, string> = {
    drums: 'drums',
    bass: 'bass',
    comp: 'chords',
    lead: 'soloist',
};

/** The scene's chart as a semantic score — the same shape a v2 chart carries. */
export function sceneScore(scene: MixScene): SemanticScore {
    const meter = scene.timeSignature || '4/4';
    const sections = scene.sections.map((section, s): ScoreSection => {
        const sectionMeter = section.timeSignature || meter;
        const measures = section.value
            .split('|')
            .map((bar) => bar.trim())
            .filter(Boolean)
            .map((bar, m): ScoreMeasure => {
                const parsed = parseChordBar(bar, sectionMeter);
                if (parsed.kind !== 'ok') {
                    const why =
                        parsed.kind === 'invalid'
                            ? parsed.issues.map((issue) => issue.message).join('; ')
                            : parsed.kind;
                    throw new Error(
                        `scene "${scene.id}" section ${s + 1} bar ${m + 1} ("${bar}"): ${why}`,
                    );
                }
                return {
                    id: `${scene.id}-s${s}-m${m}`,
                    content: { kind: 'events', events: parsed.value },
                };
            });
        return {
            id: section.id || `${scene.id}-s${s}`,
            label: section.label || `Section ${s + 1}`,
            repeat: section.repeat ?? 1,
            measures,
            ...(section.timeSignature && section.timeSignature !== meter
                ? { meter: section.timeSignature }
                : {}),
            ...(section.key && section.key !== scene.key ? { key: section.key } : {}),
            ...(section.isMinor !== undefined ? { isMinor: section.isMinor } : {}),
        };
    });
    return {
        notation: 'name',
        key: scene.key,
        isMinor: scene.isMinor ?? false,
        meter,
        grouping: null,
        sections,
    };
}

/** The band's style for a scene's genre; a genre outside the 13 is refused, not guessed. */
export function sceneStyle(scene: MixScene): StyleId {
    if (!Object.hasOwn(STYLE_FOR_GENRE, scene.genreFeel)) {
        throw new Error(
            `scene "${scene.id}": genre "${scene.genreFeel}" has no band style (one of ${Object.keys(STYLE_FOR_GENRE).join(', ')})`,
        );
    }
    return STYLE_FOR_GENRE[scene.genreFeel];
}

/**
 * Every lane's sound for a render: the synth, unless the scene pins a sound, unless `overrides`
 * pins another (a calibration or cohesion leg). Pins for a module with no band lane (`harmony`)
 * are dropped.
 */
export function sceneVoices(scene: MixScene, overrides: VoicePin[] = []): VoicePin[] {
    const voices = new Map(LANE_MODULES.map((module) => [module, 'synth']));
    for (const pin of [...(scene.voices ?? []), ...overrides]) {
        if (pin && typeof pin.voice === 'string' && voices.has(pin.module)) {
            voices.set(pin.module, pin.voice);
        }
    }
    return [...voices].map(([module, voice]) => ({ module, voice }));
}

/**
 * The band's settings for a scene and seed. `voices` decides the comp and lead instruments the
 * way the stand does (a nylon-guitar sound plays nylon grips); the built-in synth names no
 * instrument, so the style's own plays. Callers comparing two sounds (calibration, cohesion)
 * pass the SAME voices for both legs, so the legs differ only in sound, never in notes.
 */
export function sceneSettings(scene: MixScene, seed: string, voices: VoicePin[]): BandSettings {
    const style = sceneStyle(scene);
    const voiceOf = (module: string): string | undefined =>
        voices.find((pin) => pin.module === module && pin.voice !== 'synth')?.voice;
    const chordsVoice = voiceOf('chords');
    const soloistVoice = voiceOf('soloist');
    return {
        style,
        lanes: {
            drums: scene.includeDrums ?? true,
            bass: scene.includeBass ?? true,
            comp: scene.includeChords ?? true,
            lead: scene.includeSoloist ?? true,
        },
        comp:
            scene.comp ??
            (chordsVoice ? COMP_FOR_VOICE[chordsVoice] : undefined) ??
            STYLES[style].prefers,
        lead:
            scene.lead ??
            (soloistVoice ? LEAD_FOR_VOICE[soloistVoice] : undefined) ??
            STYLES[style].lead?.prefers ??
            DEFAULT_SETTINGS.lead,
        intensity: scene.intensity ?? 0.7,
        swing: scene.swing ?? null,
        swingGrid: null,
        humanize: scene.humanize ?? null,
        seed: `${scene.id}:${seed}`,
    };
}

/**
 * `loops` choruses of the band, each a pass that remembers the one before, the last one playing
 * the ending — the stand looping the song, then stopping. Events keep their pass-relative ticks;
 * the render places pass `p` after the `p` passes before it.
 */
export function performScene(
    timeline: Timeline,
    settings: BandSettings,
    loops: number,
): BandEvent[][] {
    const passes: BandEvent[][] = [];
    let memory: PassMemory | undefined;
    for (let pass = 0; pass < loops; pass++) {
        const result = performPass(timeline, settings, {
            pass,
            looping: pass < loops - 1,
            memory,
        });
        memory = result.memory;
        passes.push(result.events);
    }
    return passes;
}

export interface ScenePerformance {
    score: SemanticScore;
    timeline: Timeline;
    settings: BandSettings;
    /** The whole band, lead included (when the scene lets it play). */
    band: BandEvent[][];
    /** The bed: the same band with the lead lane off, so the comp plays as it does alone. */
    bed: BandEvent[][];
}

export function performSceneForReport(
    scene: MixScene,
    seed: string,
    loops: number,
    voices: VoicePin[],
): ScenePerformance {
    const score = sceneScore(scene);
    const timeline = compileTimeline(score);
    const settings = sceneSettings(scene, seed, voices);
    return {
        score,
        timeline,
        settings,
        band: performScene(timeline, settings, loops),
        bed: performScene(
            timeline,
            { ...settings, lanes: { ...settings.lanes, lead: false } },
            loops,
        ),
    };
}

/** The passes, filtered to the lanes a stem hears. */
export function laneEvents(passes: BandEvent[][], lanes: readonly Lane[]): BandEvent[][] {
    return passes.map((events) => events.filter((event) => lanes.includes(event.lane)));
}

/** One event as the render's voice received it (`DispatchedBandEvent` in the render bridge). */
export interface DispatchedEvent {
    pass: number;
    lane: Lane;
    tick: number;
    bar: number;
    time: number;
    durationSeconds: number;
    midi: number | null;
    piece: string | null;
    velocity: number;
    level: number;
    levelScale: number | null;
    muted: boolean;
    palm: boolean;
}

/** The event dump's `meta`: the grid `mix:verify`, `mix:spectro`, `mix:ab` and `mix:plant` read. */
export interface RenderMeta {
    sampleRate: number;
    leadInSeconds: number;
    stepSeconds: number;
    stepsPerLoop: number;
    loopCount: number;
    bpm: number;
}

export function renderMeta(
    timeline: Timeline,
    bpm: number,
    loopCount: number,
    render: { sampleRate: number; leadInSeconds: number },
): RenderMeta {
    return {
        sampleRate: render.sampleRate,
        leadInSeconds: render.leadInSeconds,
        // A straight sixteenth: the grid bars are numbered on. Swing and feel move the events,
        // not the grid; a fermata stretches real time past it (no default scene has one).
        stepSeconds: 60 / bpm / 4,
        stepsPerLoop: Math.round(timeline.ticks / STEP_TICKS),
        loopCount,
        bpm,
    };
}

export interface ScheduleMetrics {
    eventCount: number;
    maxNotesPerStep: number;
    overLimitSteps: number;
    maxSimultaneousVoices: number;
    sameMidiOverlapCount: number;
    voiceLimitPressureCount: number;
    minOnsetGapMs: number;
}

/**
 * Voice pressure in the first pass of a stem's pitched lanes, from the events as dispatched:
 * how many notes share a sixteenth, how many sound at once, how often one pitch is struck again
 * before it has ended, and how often a new note lands with `voiceLimit` already sounding.
 */
export function analyzeSchedule(
    dispatched: DispatchedEvent[],
    lanes: readonly Lane[],
    voiceLimit: number,
): ScheduleMetrics {
    const notes = dispatched
        .filter((event) => event.pass === 0 && event.midi !== null && lanes.includes(event.lane))
        .map((event) => ({
            midi: event.midi as number,
            step: Math.floor(event.tick / STEP_TICKS),
            start: event.time,
            end: event.time + event.durationSeconds,
        }));

    const perStep = new Map<number, number>();
    for (const note of notes) {
        perStep.set(note.step, (perStep.get(note.step) ?? 0) + 1);
    }
    const counts = [...perStep.values()];

    notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
    let maxSimultaneousVoices = 0;
    let sameMidiOverlapCount = 0;
    let voiceLimitPressureCount = 0;
    let minOnsetGapMs = Number.POSITIVE_INFINITY;
    let previousStart: number | null = null;
    let sounding: Array<{ end: number }> = [];
    const lastEnd = new Map<number, number>();
    for (const note of notes) {
        if (previousStart !== null) {
            const gapMs = (note.start - previousStart) * 1000;
            if (gapMs > 0) {
                minOnsetGapMs = Math.min(minOnsetGapMs, gapMs);
            }
        }
        previousStart = note.start;
        sounding = sounding.filter((voice) => voice.end > note.start + 1e-6);
        if (sounding.length >= voiceLimit) {
            voiceLimitPressureCount++;
        }
        const priorEnd = lastEnd.get(note.midi) ?? Number.NEGATIVE_INFINITY;
        if (priorEnd > note.start + 1e-6) {
            sameMidiOverlapCount++;
        }
        lastEnd.set(note.midi, Math.max(priorEnd, note.end));
        sounding.push({ end: note.end });
        maxSimultaneousVoices = Math.max(maxSimultaneousVoices, sounding.length);
    }

    return {
        eventCount: notes.length,
        maxNotesPerStep: counts.length ? Math.max(...counts) : 0,
        overLimitSteps: counts.filter((count) => count > voiceLimit).length,
        maxSimultaneousVoices,
        sameMidiOverlapCount,
        voiceLimitPressureCount,
        minOnsetGapMs: Number.isFinite(minOnsetGapMs) ? minOnsetGapMs : 0,
    };
}

/** One entry of an event dump's `dispatchEvents`, in the shape `audio-verify.ts` reads. */
export interface DumpEvent {
    track: string;
    time: number;
    midi: number;
    duration: number | null;
    /** MIDI velocity scaled to 0–1. */
    velocity: number;
    /** The scalar the voice received. */
    renderVelocity: number;
    /** The palm-mute gain on a muted bass note, else null (played open). */
    levelScale: number | null;
    bar: number;
    piece?: string;
}

/**
 * The `--write-events` sidecar for one stem: every event exactly as its voice was handed it,
 * render-absolute. A drum hit carries its General MIDI key as `midi`, and its piece.
 *
 * There is no separate intent stream (the old engine's `intentEvents`): the band is one event
 * stream, and the render hands every event to `playBandEvent` — there is no generator→scheduler
 * stage between them that could drop a note, so nothing to reconcile.
 */
export function buildEventDump(input: {
    scene: string;
    stem: string;
    seed: string;
    lanes: readonly Lane[];
    meta: RenderMeta;
    dispatched: DispatchedEvent[];
}) {
    const dispatchEvents: DumpEvent[] = input.dispatched
        .filter((event) => input.lanes.includes(event.lane))
        .map((event) => ({
            track: LANE_TRACK[event.lane],
            time: event.time,
            midi: event.midi ?? GM_DRUMS[event.piece as keyof typeof GM_DRUMS] ?? 0,
            duration: event.lane === 'drums' ? null : event.durationSeconds,
            velocity: event.velocity / 127,
            renderVelocity: event.level,
            levelScale: event.levelScale,
            bar: event.bar,
            ...(event.piece ? { piece: event.piece } : {}),
        }))
        .sort((a, b) => a.time - b.time || a.midi - b.midi);
    return {
        engine: 'band' as const,
        scene: input.scene,
        stem: input.stem,
        seed: input.seed,
        tracks: input.lanes.map((lane) => LANE_TRACK[lane]),
        meta: input.meta,
        // `events` stays as the alias `mix:ab` reads (#1351's compatibility name).
        events: dispatchEvents,
        dispatchEvents,
    };
}
