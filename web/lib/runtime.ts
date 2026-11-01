import {
    type BandSettings,
    compileTimeline,
    DEFAULT_SETTINGS,
    type LeadInstrument,
    PPQ,
    STYLE_IDS,
    STYLES,
    type StyleId,
    type Timeline,
    toMidi,
} from '@band/index';
import { flushBuffers, togglePower } from '@core/controllers/instrument-controller';
import { autoVoiceForGenre } from '@core/data/genre-sound-map';
import { GENRE_NAMES, SMART_GENRES } from '@core/data/smart-genres';
import {
    initAudio,
    killAllNotes,
    playNote,
    restoreGains,
    syncBusReverbSend,
} from '@core/engine/engine';
import { isPackInstalled } from '@core/engine/instrument-registry';
import {
    startPlatformAudioAndWakeLock,
    stopPlatformAudioAndWakeLock,
} from '@core/engine/platform-orchestrator';
import { warmDrumBuffers } from '@core/engine/synth-drums';
import { transposeChordText } from '@core/engine/transpose';
import { unlockAudio } from '@core/platform';

import type { SemanticScore } from '@core/songbook/score-types';
import {
    type ChartLaneMix,
    type ChartNotation,
    DEFAULT_SOLOIST_TRADE_CHORUSES,
    type SoloistMode,
    type SoloistTradeBars,
    type SoloistTradeChoruses,
    type SoloistTradeWith,
} from '@core/songbook/types';
import { dispatch, getState, subscribe } from '@core/state';
import { DEFAULT_BAND_INTENSITY as DEFAULT_ENERGY } from '@core/state/playback';
import {
    deriveSoloistModeOnBoot,
    handleEffects,
    resolveAutoVoices,
} from '@core/state/state-effects';
import {
    ACTIONS,
    type ActionPayloadSetParam,
    type EnsembleState,
    type InstrumentModule,
    type InstrumentVoice,
    type ParamModule,
    type ParamSlices,
    type SwingSub,
} from '@core/types';
import { getFrequency, respellKeyForMode, transposeKeyName } from '@core/utils';
import { auditionMidis, type BandChart, bandChart, sectionSteps, slotAt } from './band-chart';
import {
    downloadExportResult,
    renderBandMixToWav,
    renderBandStemsToWav,
    STEM_INSTRUMENTS,
    type StemInstrument,
} from './band-export';
import { BandHost } from './band-host';
import {
    AUTO_VOICE_FOR_STYLE,
    compForChordsLane,
    LEAD_FOR_VOICE,
    styleForGenre,
    VOICE_FOR_COMP,
    VOICE_FOR_LEAD,
} from './band-voices';
import { type ChartDocument, type DocumentContent, validateDocument } from './documents';
import { checkPlayable } from './engine-mode';
import { bandHumanize } from './genre-humanize';
import { genreSwing } from './genre-swing';
import {
    countInPreference,
    masterVolumePreference,
    rememberCountIn,
    rememberMasterVolume,
    rememberSongMode,
    type SongMinutes,
    songModePreference,
} from './session';
import { planSong, type SongPlan } from './song-mode';
import {
    initializeSounds,
    prepareSound,
    prepareSounds,
    type SoundProgress,
    seedInstalledSounds,
    validateVoice,
} from './sounds';
import { track } from './telemetry';

export type { ChartDocument, SongMinutes, StemInstrument };
export { GENRE_NAMES };

let boot: Promise<void> | undefined;
let loading = false;
let playIntent = 0;
/**
 * Bumped by {@link cancelExportAudio}; an in-flight {@link exportAudio} call
 * checks this after every await and discards its work (no download) once its
 * own captured value falls behind. Same superseded-intent shape as
 * `playIntent` above — the one difference is a cancelled export is expected
 * (a user action), not a race to quietly lose, so callers must not surface it
 * as an error.
 */
let exportIntent = 0;

/** Thrown from inside {@link exportAudio}'s stem-progress hook to unwind `renderBandStemsToWav`'s loop the moment a cancel lands, rather than waiting for it to finish every remaining stem. Never escapes {@link exportAudio}. */
class ExportCancelled extends Error {}
/** Lanes whose voice follows the feel while they are left on Auto (#675). */
const AUTO_LANES = ['groove', 'bass', 'chords', 'soloist'] as const;
/**
 * Ceiling on waiting for the band to reach the barline that plays a new feel (#1185). One bar
 * at the engine's slowest tempo is ~6s; past this the audio clock is not running
 * (a suspended context, a hidden tab) and waiting longer only strands the UI.
 */
const STAGED_FEEL_TIMEOUT_MS = 12_000;
// Authored source belongs to the host document, never to generated runtime state.
let currentScore: SemanticScore | null = null;
/**
 * The timeline the open score compiled to, with the score object it belongs to: the band is
 * handed it instead of compiling the chart again (`handScore`, #1665). Matched by identity, so
 * a score replaced by anything but `apply` simply compiles when the band next asks.
 */
let currentTimeline: { score: SemanticScore; timeline: Timeline } | null = null;

// ---------------------------------------------------------------- the band engine
// The band engine (`band/`, docs/design/band-engine.md) plays, through the shared voices,
// buses and sound packs. The old worker/scheduler generator no longer runs in the app (#1404).
/** One sixteenth in band ticks: the unit of `playback.startStep` (`sectionSteps`). */
const STEP_TICKS = PPQ / 4;
/** A native style with a lead picks its lead instrument's sound. */
function bandAutoLead(genre: string | undefined): InstrumentVoice | null {
    const style = STYLE_IDS.find((id) => STYLES[id].name === genre);
    const lead = style ? STYLES[style].lead : undefined;
    return lead ? VOICE_FOR_LEAD[lead.prefers] : null;
}
/**
 * The lead instrument the band plays. The soloist's sound names it — except the built-in
 * voice on Follow feel, which is only the sound a device without packs has: the style's own
 * instrument still decides how the lead plays (a rock guitarist bends, whatever it sounds on).
 */
function bandLead(style: StyleId): LeadInstrument {
    const { soloist } = getState();
    const preferred = STYLES[style].lead?.prefers ?? DEFAULT_SETTINGS.lead;
    if (soloist.autoSound && soloist.voice === 'synth') {
        return preferred;
    }
    return LEAD_FOR_VOICE[soloist.voice] ?? preferred;
}
/** A genre the band plays natively picks its own comp instrument's sound. */
function bandAutoComp(genre: string | undefined): InstrumentVoice | null {
    const style = STYLE_IDS.find((id) => STYLES[id].name === genre);
    if (!style) {
        return null;
    }
    return AUTO_VOICE_FOR_STYLE[style] ?? VOICE_FOR_COMP[STYLES[style].prefers];
}
let band: BandHost | null = null;
let bandSeed = '';
let drumWarmup: ReturnType<typeof setTimeout> | null = null;
/**
 * The chart sheet's view of the open score, read from the score and its timeline
 * (`band-chart.ts`). Null until a chart is open.
 */
let bandView: BandChart | null = null;

/**
 * Song mode (#1784): about how long a looping chart plays, in minutes, or null for Off. A device
 * preference (`songModePreference`), never part of a chart.
 */
let songMinutes: SongMinutes | null = null;
/**
 * The performance song mode planned for the band now playing: the open score counted to the
 * chosen number of choruses, its timeline, and the chart sheet's view of it. Null while stopped,
 * and while the band plays the chart as written.
 *
 * Planned when the band starts from stopped (`startBand`), which covers a fresh Play and every
 * restart from the top — an edit, transpose or mode change while playing stops the band first.
 * Cleared when it stops (`stopBand`). A tempo change while playing does NOT plan again: that
 * would restart the song from the top for a tempo nudge, so the performance simply runs a little
 * long or short. Nor does changing the setting itself: it takes effect at the next Play.
 *
 * While it is set, the band plays this copy and the stand draws it (`bandChartView`,
 * `playheadSlot`), so the playhead follows every chorus; `currentScore` — what Save, the chart
 * footer and `captureContent` see — stays the document, which still loops.
 */
let songPlan: (SongPlan & { view: BandChart; minutes: SongMinutes }) | null = null;

/** The chart view of what the band plays: the song-mode performance, else the open chart. */
function playedView(): BandChart | null {
    return songPlan?.view ?? bandView;
}

/** What song mode would play if Play were pressed now, or null when it would not apply. */
function planForPlay(): SongPlan | null {
    if (!songMinutes || !currentScore) {
        return null;
    }
    return planSong(currentScore, getState().playback.bpm, songMinutes * 60);
}

function bandHost(): BandHost {
    band ??= new BandHost({
        state: getState,
        silence: () => void killAllNotes(getState()),
        onEnd: endPerformance,
    });
    return band;
}

/**
 * Hand the host the chart to play, and its timeline when the open chart already compiled it.
 * During a song-mode performance that is its counted copy: handing the host anything else would
 * restart the band (`BandHost.setScore`), and an export taken while it plays renders what is
 * heard.
 */
function handScore(host: BandHost): void {
    if (songPlan) {
        host.setScore(songPlan.score, songPlan.timeline);
        return;
    }
    const score = scoreForBand();
    host.setScore(score, currentTimeline?.score === score ? currentTimeline.timeline : undefined);
}

/** The open chart's score: what the band plays. */
function scoreForBand(): SemanticScore {
    if (!currentScore) {
        throw new Error('Open a chart first.');
    }
    return currentScore;
}

/** The band style the chart's genre plays. */
function bandStyle(): StyleId {
    // A persisted genre string indexes the table: `styleForGenre` guards it (the #1266 rule), so
    // 'constructor' or a retired key can't read an Object prototype member as a style.
    return styleForGenre(getState().groove.lastSmartGenre);
}

function bandSettings(): BandSettings {
    const { groove, bass, chords, soloist, playback } = getState();
    const style = bandStyle();
    return {
        style,
        lanes: {
            drums: groove.enabled,
            bass: bass.enabled,
            comp: chords.enabled,
            lead: soloist.enabled,
        },
        comp: compForChordsLane(chords, STYLES[style].prefers),
        lead: bandLead(style),
        intensity: playback.autoIntensity ? null : playback.bandIntensity,
        swing: groove.swing,
        swingGrid: groove.swingSub === '16th' ? 16 : 8,
        // A stored 20 is "not set": the style's own humanize plays (#2010).
        humanize: bandHumanize(groove.humanize),
        seed: bandSeed,
        // The player trades with the soloist or the drummer; the band decides when it can.
        trade:
            soloist.tradeWith === 'off'
                ? null
                : {
                      with: soloist.tradeWith === 'soloist' ? 'lead' : 'drums',
                      bars: soloist.tradeBars,
                      choruses: soloist.tradeChoruses === 0 ? null : soloist.tradeChoruses,
                  },
        // A song-mode performance is a jam: its energy breathes across the counted choruses
        // (#1785). The band applies it only on Auto intensity.
        arc: songPlan ? 'jam' : null,
    };
}

/**
 * `freshPlay` marks a genuine Play-from-stopped gesture (`toggle`, `startSection` when
 * stopped) — the only case a count-in is even considered, and only then if the
 * `playback.countIn` preference is on. Every other caller (a genre-change resume, a transpose/
 * mode/edit restart while playing, `startSection` while already playing) passes nothing and
 * gets the default `false`, so the band resumes exactly where it was asked to, with no click
 * bar in front of it.
 */
function startBand(freshPlay = false): void {
    const host = bandHost();
    const state = getState();
    const { arranger, playback } = state;
    if (!host.playing && !songPlan) {
        planPerformance();
    }
    handScore(host);
    // The same take-to-take rule as the old engine: a fresh seed per play unless locked —
    // and the fresh one is recorded, so locking it later reproduces the take you heard.
    if (arranger.randomizeSeed || !arranger.seed) {
        dispatch(
            ACTIONS.SET_SONG_SEED,
            Math.floor(Math.random() * 0xffffff)
                .toString(16)
                .padStart(6, '0')
                .toUpperCase(),
        );
    }
    bandSeed = String(getState().arranger.seed);
    if (playback.audio?.state === 'suspended') {
        void playback.audio.resume();
    }
    restoreGains(state);
    startPlatformAudioAndWakeLock();
    try {
        host.start(
            bandSettings(),
            playback.bpm,
            (playback.startStep || 0) * STEP_TICKS,
            freshPlay && playback.countIn,
        );
    } catch (error) {
        // A band that never started plays no planned performance.
        if (!host.playing) {
            songPlan = null;
        }
        throw error;
    }
    param('playback', 'isPlaying', true);
    track('play_started');
    warmDrums();
}

/**
 * Render the synth kit's cymbals ahead of their first hits (`warmDrumBuffers`), a few
 * milliseconds per task so the stand keeps painting between them. Left to the hit, the crash's
 * nine seconds of additive synthesis ran on the main thread at the lap wrap and stalled the
 * chart for up to a second under load (#1240).
 */
function warmDrums(): void {
    if (drumWarmup) {
        return;
    }
    const slice = () => {
        drumWarmup = null;
        if (!warmDrumBuffers(getState(), performance.now() + DRUM_WARM_SLICE_MS)) {
            drumWarmup = setTimeout(slice, 0);
        }
    };
    drumWarmup = setTimeout(slice, 0);
}

// Short enough that a warm-up task never holds a frame, even when the CPU is shared.
const DRUM_WARM_SLICE_MS = 4;

/**
 * `ringOut` lets the notes already sounding finish instead of cutting them: only the end of a
 * counted performance (`endPerformance`) asks for it.
 */
function stopBand(ringOut = false): void {
    band?.stop();
    songPlan = null;
    if (getState().playback.isPlaying) {
        param('playback', 'isPlaying', false);
    }
    dispatch(ACTIONS.SET_START_STEP, 0);
    stopPlatformAudioAndWakeLock();
    if (!ringOut) {
        void killAllNotes(getState());
    }
}

/**
 * The song tick sounding this instant, or null while stopped, counting in, or between two queued
 * segments. Read it ONCE per paint and hand that one value to `playheadSlot`, `inLastBeat` and
 * `inLastBeatOfSlot`
 * (#1506): the audio clock runs on its own thread and can cross a barline between two reads in
 * the same task, and a stand that asked each question separately once painted the bar just left
 * with the new bar's cue.
 */
export function songTick(): number | null {
    return band?.songTick() ?? null;
}

/**
 * The chart slot `songTick()`'s `tick` falls in, or -1 when none does. For the stand to call
 * every animation frame (#1240): publishing it through state on a poll made the chart a sample of
 * a sample, and a chord shorter than the two periods together could go unpainted.
 */
export function playheadSlot(tick: number | null): number {
    const view = playedView();
    return tick == null || !view ? -1 : slotAt(view, tick);
}

/** Where the performance is, for the transport's readout and the chart's trade turns (#1990). */
export interface PerformancePlace {
    /** Which time through the song, from 1: a looping chart's laps, a counted one's choruses. */
    chorus: number;
    /** How many times through the song ends on its own; null when it repeats continuously. */
    of: number | null;
    /** What the lead is doing in a counted performance ("Head", "Solo 2", "Out"), else null. */
    part: string | null;
    /** The band's pass, and the bar's chorus: with them `tradeTurns` reads the same plan. */
    pass: number;
    barChorus: number;
    /** The performed bar sounding, so a bar played twice shows the turn of the visit heard. */
    bar: number;
    /** The band's trade settings now: a change mid-play replans the turns. */
    tradeKey: string;
    /** The bar sounding is in a traded stretch. */
    trading: boolean;
}

/**
 * Where the band is at `tick` (the one `songTick()` read for this paint, as `playheadSlot` is):
 * read off the host's playing segment and the plan's own `leadRole`, never a UI timer. Null
 * while stopped, counting in, or between two queued segments.
 */
export function performancePlace(tick: number | null): PerformancePlace | null {
    const view = playedView();
    const at = tick == null ? null : (band?.placeAt(tick) ?? null);
    if (!band || !view || !at) {
        return null;
    }
    const role = band.roleAt(at.bar, at.pass);
    const of = songPlan?.choruses ?? currentScore?.choruses ?? null;
    const barChorus = band.chorusOf(at.bar);
    let part: string | null = null;
    if (of !== null && of > 1 && role && getState().soloist.enabled) {
        if (role.kind === 'head') {
            part = barChorus === of - 1 ? 'Out' : 'Head';
        } else if (role.kind === 'solo') {
            part = `Solo ${role.chorus}`;
        }
    }
    return {
        chorus: at.pass + 1,
        of,
        part,
        pass: at.pass,
        barChorus,
        bar: at.bar,
        tradeKey: band.tradeKey(),
        trading: role?.kind === 'trade',
    };
}

/** One written bar's place in a trade: whose turn it is, and whether the turn opens on it. */
export interface TradeTurn {
    turn: 'you' | 'band';
    /** "You", or the partner who answers: "Drums" or "Soloist". */
    label: string;
    first: boolean;
}

/**
 * The turns of the chorus `place` is in, keyed by the first chord's `globalIndex` of each written
 * bar (the chart sheet's bar). Derived from `BandHost.roleAt`, the plan's own `leadRole`: the
 * stand tints exactly the bars the band leaves to the player. A bar written once but played twice
 * in a chorus (a repeat) shows the turn of the visit at or after the bar sounding, else its first.
 */
export function tradeTurns(place: PerformancePlace): Map<number, TradeTurn> {
    const turns = new Map<number, TradeTurn>();
    const view = playedView();
    if (!band || !view) {
        return turns;
    }
    // Slots run in performance order, so a visit already passed is replaced by the next one
    // once the playhead is past it: the first visit at or after `place.bar` wins.
    const settled = new Set<number>();
    for (const slot of view.slots) {
        const chord = view.chords[slot.display];
        if (
            !chord ||
            settled.has(chord.globalIndex) ||
            band.chorusOf(slot.bar) !== place.barChorus
        ) {
            continue;
        }
        if (slot.bar >= place.bar) {
            settled.add(chord.globalIndex);
        }
        const role = band.roleAt(slot.bar, place.pass);
        if (role?.kind === 'trade') {
            turns.set(chord.globalIndex, {
                turn: role.turn,
                label: role.turn === 'you' ? 'You' : role.with === 'drums' ? 'Drums' : 'Soloist',
                first: role.at === 0,
            });
        }
    }
    return turns;
}

/**
 * The chart slot the count-in leads into (the bar Play starts from), or -1 while no count-in
 * sounds. The stand draws the countdown over that bar, so it reads from the same clock as
 * `countInBeat`, with no timer of its own.
 */
export function countInSlot(): number {
    const view = playedView();
    if (!view || band?.countingInBeat() == null) {
        return -1;
    }
    return slotAt(view, (getState().playback.startStep || 0) * STEP_TICKS);
}

/** The count-in beat sounding now (0 is "1"), or null when no count-in is. */
export function countInBeat(): number | null {
    return band?.countingInBeat() ?? null;
}

/** Keep the band in step with every change the app makes to the shared state. */
function syncBand(): void {
    const host = band;
    const { playback, groove } = getState();
    if (groove.pendingGenreFeel) {
        // The band takes a new feel at its next barline by itself; commit the staged
        // genre now so the app's view of it (and setGenre's wait) settles at once.
        const payload = groove.pendingGenreFeel as {
            feel?: string;
            swing?: number;
            sub?: string;
        };
        param('groove', 'pendingGenreFeel', null);
        if (payload.feel) {
            param('groove', 'genreFeel', payload.feel);
        }
        if (payload.swing !== undefined) {
            param('groove', 'swing', payload.swing);
        }
        if (payload.sub === '8th' || payload.sub === '16th') {
            param('groove', 'swingSub', payload.sub);
        }
    }
    // The genre-change effect in `core/` picks the old engine's Auto sound; on the band,
    // a native genre's own comp instrument wins (bossa is heard on nylon). Only an installed
    // pack is taken, since Follow feel never downloads (#1405).
    const { chords, soloist } = getState();
    const auto = bandAutoComp(groove.lastSmartGenre);
    if (auto && chords.autoSound && chords.voice !== auto && isPackInstalled(auto.slice(5))) {
        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module: 'chords', voice: auto, auto: true });
        return; // that dispatch syncs the band again
    }
    // The same for the lead: a native style's own lead instrument, when its pack is installed
    // (the built-in voice needs no pack).
    const autoLead = bandAutoLead(groove.lastSmartGenre);
    if (
        autoLead &&
        soloist.autoSound &&
        soloist.voice !== autoLead &&
        (autoLead === 'synth' || isPackInstalled(autoLead.slice(5)))
    ) {
        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module: 'soloist', voice: autoLead, auto: true });
        return;
    }
    if (!host?.playing) {
        return;
    }
    if (!playback.isPlaying) {
        stopBand();
        return;
    }
    host.setTempo(playback.bpm);
    host.update(bandSettings());
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
/**
 * One `SET_PARAM` write. The compiler checks `name` against the named slice's fields; the one
 * cast builds the payload, because TypeScript cannot correlate a generic `M` with the
 * per-slice union `ActionPayloadSetParam` is.
 */
const param = <M extends ParamModule>(
    module: M,
    name: keyof ParamSlices[M] & string,
    value: unknown,
) => dispatch(ACTIONS.SET_PARAM, { module, param: name, value } as ActionPayloadSetParam);

function mix(lane: ChartLaneMix): ChartLaneMix {
    return {
        enabled: lane.enabled,
        voice: lane.voice,
        autoSound: lane.autoSound,
        volume: lane.volume,
        reverb: lane.reverb,
    };
}

/** The settings a chart saves beside its score. */
export type ChartSettings = Pick<DocumentContent, 'performance' | 'band'>;
/** What `apply` installs: a score (null before any chart is open) and its settings. */
type Session = ChartSettings & { score: SemanticScore | null };

/**
 * Explicit semantic projection, never a clone of the live/audio state tree. It writes the
 * settings the band honours, nothing else (DECISION 2026-09-26).
 */
export function captureContent(): ChartSettings {
    const { arranger: a, playback: p, chords: c, bass: b, soloist: s, groove: g } = getState();
    return clone({
        performance: {
            bpm: p.bpm,
            seed: a.seed,
            randomizeSeed: a.randomizeSeed,
            energy: p.autoIntensity ? 'auto' : p.bandIntensity,
        },
        band: {
            chords: mix(c),
            bass: mix(b),
            soloist: {
                ...mix(s),
                mode: s.mode,
                autoMode: s.autoMode,
                // Written only while trading, so a chart that never traded saves as before.
                ...(s.tradeWith === 'off'
                    ? {}
                    : {
                          tradeWith: s.tradeWith,
                          tradeBars: s.tradeBars,
                          tradeChoruses: s.tradeChoruses,
                      }),
            },
            groove: {
                ...mix(g),
                swing: g.swing,
                swingSub: g.swingSub,
                humanize: g.humanize,
                // The genre, stored once, by name. The slice keeps name and feel apart because
                // the band reads one and the voices the other; the chart needs only the name.
                genre: g.lastSmartGenre,
            },
        },
    } as ChartSettings);
}

function rebuild(): void {
    // Silences whatever is still sounding. (Its worker flush does nothing: no worker runs.)
    flushBuffers();
    restoreGains(getState());
    for (const lane of ['groove', 'bass', 'chords', 'soloist'] as const) {
        syncBusReverbSend(getState(), lane);
    }
}

function captureSession(): Session {
    return { score: currentScore && clone(currentScore), ...captureContent() };
}

export function captureDocument(document: ChartDocument): ChartDocument {
    return validateDocument({
        ...document,
        chart: { score: clone(scoreForBand()), ...captureContent() },
    });
}

/** One runtime per browser page, independent of React mount/unmount and route views. */
export function initialize(): Promise<void> {
    if (!boot) {
        boot = (async () => {
            initializeSounds();
            // #1405 — before any chart opens, so Follow feel resolves against what this device
            // really holds. Local and bounded (`seedInstalledSounds`); no network.
            await seedInstalledSounds();
            // Guest startup must not download audio without an install/selection gesture.
            for (const module of ['groove', 'bass', 'chords', 'soloist'] as const) {
                param(module, 'autoSound', false);
            }
            subscribe((action, state, context) => {
                if (loading) {
                    return;
                }
                handleEffects(action, state, context);
                syncBand();
            });
            // #1276 — `playback.masterVolume` is `preferences`-owned (never part of a
            // saved chart), so it's hydrated from its own device-local key here rather
            // than from `apply()`. `initAudio()` reads `playback.masterVolume` straight
            // off state at graph-build time (`engine.ts`), so setting it this early is
            // enough even though guest startup defers `initAudio()` past this point.
            const storedMasterVolume = masterVolumePreference();
            if (storedMasterVolume !== null) {
                param('playback', 'masterVolume', storedMasterVolume);
            }
            // Count-in (#1422) is the same `preferences` pattern: hydrate from its own
            // device-local key, falling back to the slice's own default (`true`) when this
            // device has never recorded a choice.
            const storedCountIn = countInPreference();
            if (storedCountIn !== null) {
                param('playback', 'countIn', storedCountIn);
            }
            // Song mode (#1784) is a device preference too, but no state field: the runtime
            // holds it, since only a Play reads it.
            songMinutes = songModePreference();
            rebuild();
            document.addEventListener('visibilitychange', () => {
                const { playback } = getState();
                if (
                    document.visibilityState === 'visible' &&
                    playback.isPlaying &&
                    playback.audio?.state === 'suspended'
                ) {
                    void playback.audio.resume().catch(() => {});
                }
            });
            window.addEventListener('pagehide', stop);
            // The listening-gate tools (`scripts/mix-report.ts`) render offline through
            // `window.ensemble`. Next inlines the flag at build time, so a production build
            // compiles this branch — and the bridge module — out entirely.
            if (process.env.NEXT_PUBLIC_RENDER_BRIDGE === '1') {
                const { installRenderBridge } = await import('./render-bridge');
                // The live transport too (#1562), so `scripts/live-capture.ts` can record what
                // the real graph plays: this file is the one that may touch the engine's state.
                installRenderBridge({
                    prime: warmAudio,
                    play: async () => {
                        if (!getState().playback.isPlaying) {
                            await toggle(() => {});
                        }
                    },
                    stop,
                    audio: () => {
                        const { playback } = getState();
                        return { audio: playback.audio, graph: playback.audioGraph };
                    },
                    voices: () => {
                        const state = getState();
                        return [
                            { module: 'groove', voice: state.groove.voice },
                            { module: 'bass', voice: state.bass.voice },
                            { module: 'chords', voice: state.chords.voice },
                            { module: 'soloist', voice: state.soloist.voice },
                        ];
                    },
                    settings: bandSettings,
                    countIn: () => getState().playback.countIn,
                    score: scoreForBand,
                });
                document.documentElement.dataset.renderBridge = 'ready';
            }
        })();
    }
    return boot;
}

export function stop(): void {
    halt(false);
}

/**
 * A counted chart's last chorus has played its final bar (#1475): the band has stopped by
 * itself, so the transport goes to stopped by the same path as pressing Stop — the UI reads
 * stopped exactly when the band falls silent. One difference: the last notes ring out rather
 * than being cut at the barline, as they do at the end of the exported performance
 * (`band-export.ts` renders a release tail after the final bar). Stop is the musician
 * interrupting; this is the song ending.
 */
function endPerformance(): void {
    halt(true);
}

function halt(ringOut: boolean): void {
    playIntent++;
    if (band?.playing || getState().playback.isPlaying) {
        stopBand(ringOut);
    }
}

/**
 * Section tap menu's "Start here" (#1422). `bounds.start` is already the section's FIRST
 * PERFORMED visit, not a written position: `sectionSteps` (band-timeline visits) collapses every
 * occurrence of the id to `{ min(start), max(end) }`, and since ticks only increase across one
 * pass, that min is the earliest one. So a repeated section (a
 * second ending, a `repeat` count) still lands on the bar a musician would actually call "the
 * top of the section," not wherever it happens to recur.
 *
 * Stopped: prepares sounds like a normal Play and starts from there, count-in included per the
 * `countIn` preference (a fresh Play, same as `toggle`'s). Already playing: restarts the band
 * immediately at that point (`BandHost.start`'s own restart, the same one `transpose`/`setMode`
 * use) rather than waiting for the next barline — `update()`'s barline-swap machinery only
 * carries a *settings* change forward, not a new start tick, so an immediate restart is the
 * one this host supports cleanly.
 */
export async function startSection(
    sectionId: string,
    progress: SoundProgress = () => {},
): Promise<boolean> {
    const view = playedView();
    const bounds = view && sectionSteps(view, sectionId);
    if (!bounds) {
        return false;
    }
    if (getState().playback.isPlaying) {
        dispatch(ACTIONS.SET_START_STEP, bounds.start);
        startBand();
        return true;
    }
    bringUpAudio();
    const intent = ++playIntent;
    await prepareSounds(captureContent(), progress);
    if (intent !== playIntent) {
        return true;
    }
    // From stopped, song mode plans the performance first, so the section's first bar is found
    // in the timeline the band is about to play (a counted chart's once-only intro moves it).
    planPerformance();
    const start = (songPlan && sectionSteps(songPlan.view, sectionId)) || bounds;
    dispatch(ACTIONS.SET_START_STEP, start.start);
    startBand(true);
    return true;
}

export async function toggle(progress: SoundProgress): Promise<void> {
    if (getState().playback.isPlaying) {
        stop();
        return;
    }
    // Keep AudioContext creation on the gesture stack for mobile Safari.
    bringUpAudio();
    const intent = ++playIntent;
    await prepareSounds(captureContent(), progress);
    if (intent !== playIntent) {
        return;
    }
    startBand(true);
}

/** What a browser without Web Audio (or one that refuses to start it) is told, in one sentence. */
export const AUDIO_UNAVAILABLE = "This browser can't play audio.";

/**
 * `initAudio`, with its failure said plainly: a missing or refusing `AudioContext` surfaces from
 * the engine as "AudioContextClass is not a constructor" or a DOMException, neither of which tells
 * a musician anything (#1982).
 */
function bringUpAudio(): void {
    try {
        initAudio(getState());
    } catch {
        throw new Error(AUDIO_UNAVAILABLE);
    }
}

/**
 * Warm the audio path on the gesture stack (#1441), for a Play that has to read storage BEFORE it
 * can call `toggle`: the songbook's Continue ▶ Play opens its song first, and by then mobile
 * Safari no longer counts the tap as a user gesture. So the click handler calls this
 * synchronously, before any await — the same three things `toggle` and `startBand` do at the
 * front of a gesture: create the AudioContext (`initAudio`), resume it, and play the platform's
 * silent unlock element (`unlockAudio`, the iOS mute-switch workaround). Idempotent; `toggle`
 * repeats the first two harmlessly.
 */
export function warmAudio(): void {
    // Outside `run()`'s catch, so a browser without Web Audio is not said here: the press's own
    // `toggle`/`startSection` runs the same call inside `run()` and says it (#1982).
    try {
        bringUpAudio();
    } catch {
        return;
    }
    const audio = getState().playback.audio;
    if (audio?.state === 'suspended') {
        void audio.resume().catch(() => {});
    }
    unlockAudio();
}

export async function setVoice(
    module: InstrumentModule,
    voice: InstrumentVoice,
    progress: SoundProgress,
    auto = false,
): Promise<void> {
    validateVoice(module, voice);
    if (voice !== 'synth') {
        await prepareSound(voice.slice(5), progress);
    }
    // Keep the old selection throughout download/failure. Dispatch through the
    // established effects (including crunch chord voicing).
    dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module, voice, auto });
    if (auto && module === 'soloist') {
        // Auto dispatch normally runs inside genre resolution; this explicit
        // picker also needs its established voice-to-phrasing reconciliation.
        deriveSoloistModeOnBoot(getState(), dispatch);
    }
    rebuild();
}

/** Live bus gain — mirrors v1's `InstrumentSettings.tsx` `updateInstrumentAudio` (deleted). */
export function setVolume(module: InstrumentModule, value: number): void {
    dispatch(ACTIONS.SET_VOLUME, { module, value });
}

/** Live reverb send — the `SET_REVERB` sibling of `setVolume`. */
export function setReverb(module: InstrumentModule, value: number): void {
    dispatch(ACTIONS.SET_REVERB, { module, value });
}

/**
 * Trading with the player (the band engine's `BandSettings.trade`): who the band trades with,
 * how long a turn is, and how many traded choruses before the head returns (0 keeps trading
 * forever). Trading with the soloist turns it on: it is the one you trade with.
 */
export function setTrade(
    tradeWith: SoloistTradeWith,
    bars: SoloistTradeBars,
    choruses: SoloistTradeChoruses,
): void {
    param('soloist', 'tradeBars', bars);
    param('soloist', 'tradeChoruses', choruses);
    param('soloist', 'tradeWith', tradeWith);
    if (tradeWith === 'soloist' && !getState().soloist.enabled) {
        togglePower('soloist');
    }
}

/**
 * Who the current genre's band can trade with: always the soloist; the drummer only where
 * the style's drummer can take a solo.
 */
export function tradePartners(): { soloist: boolean; drums: boolean } {
    return { soloist: true, drums: Boolean(STYLES[bandStyle()].drums.solos) };
}

/**
 * Why the band can't trade the way the chart asks, or null when it can (or isn't asked to).
 * Mirrors the gate in `planBars` (band/arrange/plan.ts), so the Trade control never claims a
 * trade the band won't play.
 */
export function tradeBlocked(): 'soloist-off' | 'drums-off' | 'drummer-no-solo' | null {
    const { soloist, groove } = getState();
    if (soloist.tradeWith === 'soloist') {
        return soloist.enabled ? null : 'soloist-off';
    }
    if (soloist.tradeWith === 'drums') {
        return !groove.enabled ? 'drums-off' : tradePartners().drums ? null : 'drummer-no-solo';
    }
    return null;
}

// #1276 — Feel sheet. `groove.swing`/`swingSub`/`humanize` are `document`-owned
// (`STATE_OWNERSHIP_MANIFEST`): they ride `captureContent()`'s `band.groove` projection, so
// only the dispatch is needed here; the band re-reads them at its next barline (`syncBand`).

/** `SET_SWING`'s reducer stores the raw 0-100 shuffle amount, not a 0-1 fraction. */
export function setSwing(value: number): void {
    dispatch(ACTIONS.SET_SWING, value);
}

/** `SET_SWING_SUB`'s reducer ignores an unrecognized grid rather than defaulting it. */
export function setSwingSub(sub: SwingSub): void {
    dispatch(ACTIONS.SET_SWING_SUB, sub);
}

/** Also a raw 0-100 value, like `setSwing` — not the 0-1 scale `setVolume`/`setReverb` use. */
export function setHumanize(value: number): void {
    dispatch(ACTIONS.SET_HUMANIZE, value);
}

// The chart's energy (DECISION 2026-09-26): `playback.bandIntensity`/`autoIntensity` are
// `document`-owned and ride `captureContent()`'s `performance.energy` (`'auto'` or the level),
// so, like swing, only the dispatch is needed here; the band re-reads them (`syncBand`). The
// user is their only writer — no runtime system touches either (write-ownership law).

/** A fixed band energy (0-1); ignored by the band while `autoIntensity` is on. */
export function setBandIntensity(value: number): void {
    dispatch(ACTIONS.SET_BAND_INTENSITY, value);
}

/** Auto energy: the band shapes it over the form itself. */
export function setAutoIntensity(auto: boolean): void {
    dispatch(ACTIONS.SET_AUTO_INTENSITY, auto);
    if (auto) {
        // Auto saves no level (`energy: 'auto'`), and a chart opened on auto starts at the
        // default (`apply`). The voices still read the level while on auto, so reset it here too:
        // what plays after ticking Auto is what plays when the chart is reopened.
        setBandIntensity(DEFAULT_ENERGY);
    }
}

/**
 * Click track on/off — `runtime-derived`, session-only by design, never part of a saved chart
 * or a preferences key; it resets to its default on the next boot.
 */
export function setMetronome(enabled: boolean): void {
    dispatch(ACTIONS.SET_METRONOME, enabled);
}

/**
 * `preferences`-owned: persists to its own device-local key (`session.ts`)
 * immediately, independent of the chart's own Save. The live bus ramp itself is
 * `state-effects.ts`'s `SET_PARAM(masterVolume)` case, run by the `handleEffects` call
 * already wired into this module's dispatch subscriber.
 */
export function setMasterVolume(value: number): void {
    dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'masterVolume', value });
    rememberMasterVolume(value);
}

/**
 * One bar of clicks before a fresh Play, at the chart's own tempo and meter — a practice
 * habit, so like `masterVolume` it's `preferences`-owned and persists to its own device-local
 * key rather than riding the saved chart. Read by `startBand`'s `freshPlay` gate, never by a
 * mid-song resume (genre change, transpose, "Start here" while already playing).
 */
export function setCountIn(enabled: boolean): void {
    dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'countIn', value: enabled });
    rememberCountIn(enabled);
}

/** Plan song mode's performance for a start from stopped (`songPlan`), or clear it. */
function planPerformance(): void {
    const plan = planForPlay();
    if (!plan || !songMinutes || !bandView) {
        songPlan = null;
        return;
    }
    const view = bandChart(plan.score, plan.timeline);
    // The written blocks are the same chart either way; keeping the open chart's array keeps the
    // stand's fit (`useChartFit`, keyed on it) from re-choosing its step at Play and Stop.
    songPlan = { ...plan, minutes: songMinutes, view: { ...view, blocks: bandView.blocks } };
}

/**
 * What an export renders: what Play plays (#1784). During a song-mode performance that is its
 * counted copy; stopped with song mode on, the performance Play would plan now; else the chart.
 * Returns the song-mode plan it handed the host (null for the chart), for `exportSettings`.
 */
function exportScore(host: BandHost): SongPlan | null {
    const plan = songPlan ?? (host.playing ? null : planForPlay());
    if (plan) {
        host.setScore(plan.score, plan.timeline);
    } else {
        handScore(host);
    }
    return plan;
}

/**
 * Song mode (#1784): Off (null), or about how many minutes a looping chart plays before the band
 * wraps up on its held ending. A device preference, remembered here and never written to the
 * chart. A band already playing keeps the performance it started with; the next Play counts the
 * new length.
 */
export function setSongMode(minutes: SongMinutes | null): void {
    songMinutes = minutes;
    rememberSongMode(minutes);
}

export function songMode(): SongMinutes | null {
    return songMinutes;
}

/**
 * Song mode's readout (`≈3:12 · 4 choruses`): the performance playing now, else what Play would
 * plan at the current tempo. Null when song mode is off or the chart counts its own choruses.
 * Stopped, this compiles the chart a few times over, so a caller reads it when the chart, tempo,
 * setting or transport change — not every frame.
 */
export function songModeReadout(): { choruses: number; seconds: number } | null {
    // The running performance only while it is what the setting asks for; changed mid-play, the
    // readout shows what the next Play will count.
    const plan = songPlan && songPlan.minutes === songMinutes ? songPlan : planForPlay();
    return plan && { choruses: plan.choruses, seconds: plan.seconds };
}

/**
 * Chord-notation preference — `document`-owned, saved on the score (`currentScore.notation`,
 * which `captureDocument()` clones); the arranger slice mirrors it as `apply` does. No
 * `rebuild()`/`editScore()`: notation is a pure display selector over the chord's
 * already-precomputed `display: FormattedChordNames` (all three notations are always
 * present), so it never touches arrangement layout or the band.
 */
export function setNotation(notation: ChartNotation): void {
    dispatch(ACTIONS.SET_NOTATION, notation);
    if (currentScore) {
        currentScore = { ...currentScore, notation };
    }
}

/**
 * The voice an Auto lane resolves to. `genre`/`chordStyle` default to the live
 * setup; pass them to resolve against a feel that has not been applied yet.
 */
export function recommendedVoice(
    module: InstrumentModule,
    genre?: string,
    chordStyle?: string,
): InstrumentVoice {
    const state = getState();
    const bandVoice =
        module === 'chords'
            ? bandAutoComp(genre ?? state.groove.lastSmartGenre)
            : module === 'soloist'
              ? bandAutoLead(genre ?? state.groove.lastSmartGenre)
              : null;
    if (bandVoice && (bandVoice === 'synth' || isPackInstalled(bandVoice.slice(5)))) {
        return bandVoice;
    }
    // Follow feel plays only what this device has installed and never downloads by itself
    // (#1405, as v1 did); "Install all & use genre sounds" is the download gesture. Installed
    // is the cache (`seedInstalledSounds`) plus whatever this page has loaded, and every caller
    // still prepares — verifies and decodes — the files before committing the choice or playing.
    return autoVoiceForGenre(
        genre ?? state.groove.lastSmartGenre,
        module,
        isPackInstalled,
        chordStyle ?? state.chords.style,
    );
}

/** Called only after the explicit bulk install has fully succeeded. */
export async function applyGenreSounds(progress: SoundProgress): Promise<void> {
    for (const module of AUTO_LANES) {
        const voice = recommendedVoice(module);
        if (voice !== 'synth') {
            await prepareSound(voice.slice(5), progress);
        }
    }
    for (const module of AUTO_LANES) {
        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, {
            module,
            voice: recommendedVoice(module),
            auto: true,
        });
    }
    deriveSoloistModeOnBoot(getState(), dispatch);
    rebuild();
}

/**
 * Install a chart's genre: the name the band reads (`groove.lastSmartGenre`), the feel the
 * voices read (`groove.genreFeel`), and the per-lane styles the genre routes — the same values
 * picking it sets (`SET_GENRE_FEEL`). A chart no longer stores those styles: the app has only
 * ever set them from the genre, so they follow it on open rather than whatever chart came before.
 */
function applyGenre(name: string): void {
    const genre = SMART_GENRES[name];
    param('groove', 'lastSmartGenre', name);
    param('groove', 'genreFeel', genre.feel);
    param('chords', 'style', genre.chord);
    param('bass', 'style', genre.bass ?? 'smart');
}

/**
 * `compiled` is the timeline `checkPlayable` just compiled from this same score, when the caller
 * asked: the chart is then compiled once on its way to the stand, not twice (#1665).
 */
function apply(content: Session, compiled?: Timeline): void {
    const score = content.score && clone(content.score);
    // A score is drawn and played from the band's own timeline.
    const timeline = score ? (compiled ?? compileTimeline(score)) : null;
    currentScore = score;
    currentTimeline = score && timeline ? { score, timeline } : null;
    bandView = score && timeline ? bandChart(score, timeline) : null;
    if (score) {
        // The arranger slice mirrors the score's settings for the engine's readers (the synth
        // kit tunes its toms to `arranger.key`; a section's `instruments` mute lanes), by name.
        const sections = score.sections.map(
            ({ measures: _measures, meter, grouping: _grouping, ...section }) => ({
                ...section,
                ...(meter ? { timeSignature: meter } : {}),
            }),
        );
        param('arranger', 'sections', sections);
        param('arranger', 'key', score.key);
        param('arranger', 'timeSignature', score.meter);
        param('arranger', 'grouping', score.grouping);
        param('arranger', 'isMinor', score.isMinor);
        param('arranger', 'notation', score.notation);
    }
    const { performance, band } = content;
    param('arranger', 'seed', performance.seed);
    param('arranger', 'randomizeSeed', performance.randomizeSeed);
    param('playback', 'bpm', performance.bpm);
    // Energy rides the chart; a chart saved before it did lets the band shape it (auto). A
    // fixed level is the one the chart names; on auto the level resets to the default, so the
    // outgoing chart's energy never carries over into this one.
    const energy = performance.energy ?? 'auto';
    param('playback', 'autoIntensity', energy === 'auto');
    param('playback', 'bandIntensity', energy === 'auto' ? DEFAULT_ENERGY : energy);
    // Each lane's mix, by name.
    for (const module of ['chords', 'bass', 'soloist', 'groove'] as const) {
        const lane = band[module];
        for (const key of ['enabled', 'voice', 'autoSound', 'volume', 'reverb'] as const) {
            param(module, key, lane[key]);
        }
    }
    param('soloist', 'mode', band.soloist.mode);
    param('soloist', 'autoMode', band.soloist.autoMode);
    // A chart saved without trading doesn't trade.
    param('soloist', 'tradeWith', band.soloist.tradeWith ?? 'off');
    param('soloist', 'tradeBars', band.soloist.tradeBars ?? 4);
    param('soloist', 'tradeChoruses', band.soloist.tradeChoruses ?? DEFAULT_SOLOIST_TRADE_CHORUSES);
    param('groove', 'swing', band.groove.swing);
    param('groove', 'swingSub', band.groove.swingSub);
    param('groove', 'humanize', band.groove.humanize);
    applyGenre(band.groove.genre);
    dispatch(ACTIONS.SET_START_STEP, 0);
}

export function load(document: ChartDocument): void {
    const checked = validateDocument(document);
    const timeline = checkPlayable(checked.chart.score);
    stop();
    const previous = captureSession();
    loading = true;
    try {
        apply(checked.chart, timeline);
        // #1405 — a lane on Follow feel stores the sound it last resolved to, which says nothing
        // about this device. Resolve it again against what is installed here, by the same rule a
        // feel change uses.
        resolveAutoVoices(getState(), getState().groove.lastSmartGenre, dispatch);
        rebuild();
    } catch (error) {
        apply(previous);
        rebuild();
        throw error;
    } finally {
        loading = false;
    }
}

/**
 * `document` as {@link load} just resolved it on this device (#1405): each Follow-feel lane's
 * sound, and the soloist's phrasing when that follows too. Only for the document that was
 * loaded. The shell shows and baselines this rather than the stored copy, so the Sounds panel
 * names what is actually playing and a sound resolved on open is not an unsaved change.
 */
export function withLoadedSounds<T extends ChartDocument>(document: T): T {
    const state = getState();
    const next = structuredClone(document);
    for (const module of AUTO_LANES) {
        if (next.chart.band[module].autoSound) {
            next.chart.band[module].voice = state[module].voice;
        }
    }
    if (next.chart.band.soloist.autoMode) {
        next.chart.band.soloist.mode = state.soloist.mode as SoloistMode;
    }
    return next;
}

/**
 * Verify — downloading only if a file is missing — every sound the incoming feel
 * will select for a lane still on Auto. Deliberately runs before any engine state
 * changes: nothing is committed while this is in flight, so a failure has nothing
 * to undo and a band that is already playing keeps its time straight through it.
 */
async function prepareFeelSounds(name: string, progress: SoundProgress): Promise<void> {
    const state = getState();
    // `resolveAutoVoices` reads the style the feel is about to install, so resolve
    // the chords lane against that rather than the outgoing style.
    const chordStyle = SMART_GENRES[name].chord ?? state.chords.style;
    for (const module of AUTO_LANES) {
        if (!state[module].autoSound) {
            continue;
        }
        const voice = recommendedVoice(module, name, chordStyle);
        if (voice !== 'synth') {
            await prepareSound(voice.slice(5), progress);
        }
    }
}

/**
 * Resolve once the band reaches the barline where its last settings change is heard, or
 * `false` if it stops first (or the audio clock stalls).
 */
function awaitBandChange(): Promise<boolean> {
    const deadline = Date.now() + STAGED_FEEL_TIMEOUT_MS;
    return new Promise((resolve) => {
        const check = () => {
            if (!band?.playing || Date.now() > deadline) {
                resolve(false);
            } else if (band.changeHeard()) {
                resolve(true);
            } else {
                setTimeout(check, 50);
            }
        };
        check();
    });
}

export async function setGenre(name: string, progress: SoundProgress = () => {}): Promise<void> {
    if (!Object.hasOwn(SMART_GENRES, name)) {
        throw new Error('Unknown genre.');
    }
    const wasPlaying = getState().playback.isPlaying;
    const previous = captureSession();
    // The genre's swing is its band style's (`genreSwing`), the one swing authority.
    const swing = genreSwing(name);
    const payload = {
        genreName: name,
        ...SMART_GENRES[name],
        ...(swing ? { swing: swing.swing, sub: swing.swingSub } : null),
    };
    // Captured before anything can stop the transport, so a Stop pressed during
    // preparation is still detectable as a cancellation further down.
    const intent = playIntent;
    try {
        // #1185 — prepare first, commit second. The old order stopped the band up
        // front so that preparation could not fail into a half-changed engine; the
        // same protection comes free from mutating nothing until the sounds are
        // verified, and the band plays on through the check.
        await prepareFeelSounds(name, progress);
        // Read before the dispatch, not after: the reducer only stages a feel when
        // the transport is already running, and `syncBand` commits it inside the
        // dispatch itself — so the state afterwards cannot tell the two paths apart.
        const staged = getState().playback.isPlaying;
        dispatch(ACTIONS.SET_GENRE_FEEL, payload);
        // #1389 — NOT tracked here: this used to run for `lib/starters.ts`'s one-time sample
        // seeding too, which called this function directly (never through the transport bar) to
        // build its 3 starter charts on a brand-new device — #1439 retired that seeding (the
        // standards catalog, `lib/standards.ts`, never calls `setGenre` at all), but the shape
        // stands: `app/ensemble.tsx`'s `onGenre` handler, the transport bar's actual call site,
        // is still the one place that tracks the real, user-driven change.
        // While playing, that reducer stages the feel and the band commits it at once
        // (`syncBand`), playing it from its next barline. So this dispatch plus the
        // auto-voice effects are the entire engine change: no teardown, no rebuild, no
        // restart. A `rebuild()` here would kill the notes the band has just scheduled.
        resolveAutoVoices(getState(), name, dispatch);
        if (!staged) {
            rebuild();
            return;
        }
        progress('Switching style at the next bar…');
        // Wait for the barline that plays it, so the switch reads as pending until it is
        // heard. A Stop inside the wait leaves nothing half-changed: the feel is committed.
        await awaitBandChange();
    } catch (error) {
        // A Stop that landed while we were preparing cancels the change outright:
        // the musician asked for silence, not for a band that resurrects itself.
        const cancelled = intent !== playIntent;
        stop();
        const resumeIntent = playIntent;
        loading = true;
        try {
            // A failure after the `SET_GENRE_FEEL` dispatch can leave a staged feel
            // behind: `apply()` restores the previous *document* content, but
            // `pendingGenreFeel` is runtime-derived and not part of that content,
            // so nothing else clears it. Left set, `syncBand` would commit the very
            // feel we just failed to verify once playback resumes below — landing the
            // band on the failed genre while `groove.genreFeel`/the UI still
            // (correctly) read the previous one.
            param('groove', 'pendingGenreFeel', null);
            apply(previous);
            rebuild();
        } finally {
            loading = false;
        }
        if (wasPlaying && !cancelled) {
            // A failed new feel must not strand a still-playable old band. Recheck
            // its files too: an evicted old pack cannot earn silent synth fallback.
            try {
                await prepareSounds(previous, progress);
            } catch {
                throw new Error(
                    'Could not change style or resume the previous sounds. Reconnect and press Play.',
                );
            }
            if (resumeIntent === playIntent) {
                startBand();
            }
        }
        throw error;
    }
}

export function setTempo(bpm: number): void {
    dispatch(ACTIONS.SET_BPM, Math.max(40, Math.min(240, Math.round(bpm))));
}
/** `InstrumentModule`'s state-slice name for the drum lane; the telemetry event names it `drums`. */
const TELEMETRY_PART: Record<InstrumentModule, 'drums' | 'bass' | 'chords' | 'soloist'> = {
    groove: 'drums',
    bass: 'bass',
    chords: 'chords',
    soloist: 'soloist',
};

export function setEnabled(module: InstrumentModule, enabled: boolean): void {
    if (getState()[module].enabled !== enabled) {
        togglePower(module);
        track('part_toggled', { part: TELEMETRY_PART[module] });
    }
}
/**
 * Moves the song by `delta` semitones. `key` is the name the key picker chose (`F#`, not `Gb`),
 * stored as the song's key so its chords spell the way that key reads; without it the key is the
 * flat pitch-class name.
 */
export function transpose(delta: number, key?: string): void {
    const score = clone(scoreForBand());
    score.key = key ?? transposeKeyName(score.key, delta);
    // Chords are spelled from the key they land in (sharps in E minor, flats in F minor).
    const target = { key: score.key, isMinor: score.isMinor === true };
    for (const section of score.sections) {
        if (section.key) {
            section.key = transposeKeyName(section.key, delta);
        }
        for (const measure of section.measures) {
            if (measure.key) {
                measure.key = transposeKeyName(measure.key, delta);
            }
            if (measure.content.kind === 'events') {
                for (const event of measure.content.events) {
                    if (event.kind === 'chord') {
                        event.symbol = transposeChordText(event.symbol, delta, target);
                        if (event.alternates) {
                            event.alternates = event.alternates.map((symbol) =>
                                transposeChordText(symbol, delta, target),
                            );
                        }
                    }
                }
            }
        }
    }
    const wasPlaying = getState().playback.isPlaying;
    editScore(score);
    if (wasPlaying) {
        startBand();
    }
}
/**
 * The song's own major/minor (#1375) — `score.isMinor` only, never a section or bar override.
 * Chord names are not rewritten, and the key stays where it is: unlike v1's relative-key toggle,
 * v2's key is the score's own, so a musician who wants A minor picks A, then Minor.
 * Beside the song's meter in the transport's Key popover (#1757).
 */
export function setMode(isMinor: boolean): void {
    if (!currentScore) {
        throw new Error('Open a chart first.');
    }
    if (currentScore.isMinor === isMinor) {
        return;
    }
    const wasPlaying = getState().playback.isPlaying;
    // The key is respelled for the new mode (Gb major turns F# minor, not 9-flat Gb minor).
    editScore({
        ...clone(currentScore),
        isMinor,
        key: respellKeyForMode(currentScore.key, isMinor),
    });
    if (wasPlaying) {
        startBand();
    }
}
/**
 * How many choruses the song plays before the band stops (#1475): `score.choruses`, 1–16 from the
 * chart footer's form-length menu. `undefined` is Loop ("Repeats continuously"), the default — the field is removed, so
 * the band loops the form forever as every chart did before. A playing
 * band restarts from the top, as a mode change does.
 */
export function setChoruses(choruses: number | undefined): void {
    if (!currentScore) {
        throw new Error('Open a chart first.');
    }
    if (currentScore.choruses === choruses) {
        return;
    }
    const wasPlaying = getState().playback.isPlaying;
    const next = clone(currentScore);
    if (choruses === undefined) {
        delete next.choruses;
    } else {
        next.choruses = choruses;
    }
    editScore(next);
    if (wasPlaying) {
        startBand();
    }
}
export function editScore(score: SemanticScore): void {
    const timeline = checkPlayable(score);
    const before = captureSession();
    stop();
    loading = true;
    try {
        const { performance, band } = before;
        apply({ score, performance, band }, timeline);
        rebuild();
    } catch (error) {
        apply(before);
        rebuild();
        throw error;
    } finally {
        loading = false;
    }
}
/**
 * Sound `freqs` once on the chord voice, stopped only (while the band plays, the band is the
 * sound). `stagger` seconds between successive notes: 0 is a block chord, more is a strum. The
 * one body behind `audition` and `auditionPitches`, so the two can't drift in voice or gain.
 */
function sound(
    freqs: (state: ReturnType<typeof getState>) => number[] | undefined,
    stagger: number,
) {
    if (getState().playback.isPlaying) {
        return;
    }
    try {
        bringUpAudio();
    } catch {
        // An audition is a nicety; Play is where a browser without audio is told.
        return;
    }
    const state = getState();
    const notes = freqs(state);
    if (!notes || !state.playback.audio) {
        return;
    }
    const start = state.playback.audio.currentTime;
    notes.forEach((frequency, i) => {
        playNote(state, frequency, start + i * stagger, 0.65, { vol: 0.12 });
    });
}
export function audition(index: number): void {
    sound(() => {
        // Chords are named and voiced by the band's chord authority; a hold or N.C. has nothing
        // of its own to sound.
        const chord = bandView?.chords[index]?.chord;
        return chord ? auditionMidis(chord).map(getFrequency) : undefined;
    }, 0);
}
/**
 * Strum the neck's grip (#1596): `midis` in the order the strings are struck (the caller's
 * `gripMidis`, lowest string first), each 25ms after the last — a quick downstroke, slow enough
 * to hear the strings one by one, quick enough to stay one chord. Stopped only, like `audition`.
 */
const STRUM_GAP = 0.025;
export function auditionPitches(midis: number[]): void {
    sound(() => (midis.length ? midis.map(getFrequency) : undefined), STRUM_GAP);
}
/**
 * The settings an export renders with: the live band's, on the open chart's own seed. A Play
 * records its seed on the chart (`startBand`), so this is the take just heard, or the one the
 * next Play of a locked seed will give. `bandSeed` is not it: that is the last PLAYED chart's,
 * and it outlives the chart it came from.
 */
function exportSettings(plan: SongPlan | null): ReturnType<typeof bandSettings> {
    return {
        ...bandSettings(),
        seed: String(getState().arranger.seed || 'ensemble'),
        // The song-mode performance `exportScore` handed the host is shaped as Play shapes it
        // (#1785), stopped as well as playing.
        arc: plan ? 'jam' : null,
    };
}
/**
 * Downloads a multi-track `.mid` of the current arrangement (#1277): the band's own event
 * stream, the one it plays live (`BandHost.render`, which gives the page a turn between chunks), written by `toMidi`. Rendered on the side,
 * so it never touches the live band or the audio graph — safe while the band is playing.
 */
export async function exportMidi(filename: string): Promise<void> {
    const host = bandHost();
    const settings = exportSettings(exportScore(host));
    const { events, timeline } = await host.render(settings);
    const bytes = toMidi(events, timeline, {
        bpm: getState().playback.bpm,
        title: filename,
        comp: settings.comp,
        lead: settings.lead,
    });
    const name = `${filename.replace(/[^a-zA-Z0-9\s\-_()]/g, '').trim() || 'ensemble'}.mid`;
    downloadExportResult({
        blob: new Blob([bytes], { type: 'audio/midi' }),
        durationSeconds: 0,
        sampleRate: 0,
        filename: name,
    });
    track('midi_exported');
}

/** Cancels the in-flight {@link exportAudio} call, if any (#1278). Cooperative,
 * not a true mid-render abort — see {@link exportAudio}'s doc comment. */
export function cancelExportAudio(): void {
    exportIntent++;
}

/**
 * Downloads a WAV mix, or one WAV per stem, of the current arrangement (#1278).
 * `band-export.ts`'s `renderBandMixToWav`/`renderBandStemsToWav` render `BandHost.render()`'s
 * event stream on a detached state clone in an `OfflineAudioContext`, through the same
 * `playBandEvent` voice mapping the live band host schedules with, so an exported mix matches
 * what was heard live and nothing here dispatches. Stems are drums/bass/chords (the comp)/
 * soloist (the lead).
 *
 * Sampled voices must be installed before the render can use them —
 * `resolveInstrumentSource` (instrument-registry.ts) silently resolves an
 * uninstalled `pack:<id>` voice to the built-in synth, which would export
 * audio that doesn't match what the Sounds picker shows as selected for this
 * chart. Reuse the exact install path `toggle()` (Play) already runs before
 * playback — `prepareSounds` with the same progress callback shape — so a
 * missing pack visibly downloads first instead of the render silently
 * proceeding on a synth stand-in; a failed/declined install throws here and
 * the caller surfaces that as an error rather than exporting anyway.
 *
 * Cancellation is cooperative: `OfflineAudioContext` has no cancel primitive,
 * so a mix export (one render) can only be discarded after it finishes
 * (checked once more before the download fires). A stems export can stop
 * between stems — `onStemProgress` fires synchronously before each one starts,
 * so throwing {@link ExportCancelled} there unwinds the stem loop before any
 * further stem renders — but a stem already in flight still finishes. Either
 * way, a cancelled call never reaches `downloadExportResult`.
 */
export async function exportAudio(
    kind: 'mix' | 'stems',
    filename: string,
    progress: SoundProgress,
    instruments: StemInstrument[] = STEM_INSTRUMENTS,
): Promise<void> {
    const intent = ++exportIntent;
    await prepareSounds(captureContent(), progress);
    if (intent !== exportIntent) {
        return;
    }
    const host = bandHost();
    const plan = exportScore(host);
    const bpm = getState().playback.bpm;
    if (kind === 'mix') {
        progress('Rendering mix…');
        const { events, timeline } = await host.render(exportSettings(plan));
        if (intent !== exportIntent) {
            return;
        }
        const result = await renderBandMixToWav(events, timeline, bpm, { filename });
        if (intent !== exportIntent) {
            return;
        }
        downloadExportResult(result);
        track('wav_exported', { stems: false });
        return;
    }
    // A stem always renders its lane even if it's muted live, so force every lane on for the
    // one pass every stem below is sliced from, rather than muting/soloing per-stem state.
    const { events, timeline } = await host.render({
        ...exportSettings(plan),
        lanes: { drums: true, bass: true, comp: true, lead: true },
    });
    if (intent !== exportIntent) {
        return;
    }
    try {
        const results = await renderBandStemsToWav(events, timeline, bpm, instruments, {
            filename,
            onStemProgress: ({ instrument, index, total }) => {
                if (intent !== exportIntent) {
                    throw new ExportCancelled();
                }
                progress(`Rendering ${instrument} (${index + 1}/${total})…`);
            },
        });
        if (intent === exportIntent) {
            for (const result of results) {
                downloadExportResult(result);
            }
            track('wav_exported', { stems: true });
        }
    } catch (error) {
        if (!(error instanceof ExportCancelled)) {
            throw error;
        }
    }
}

export function state(): EnsembleState {
    return getState();
}

/**
 * The band's view of what it plays: the open score, or during a song-mode performance its
 * counted copy (`songPlan`) — so a reader must read it again when playback starts and stops.
 * Null before a chart is open.
 */
export function bandChartView(): BandChart | null {
    return playedView();
}

/**
 * Is playback in the last FELT pulse of its performed bar right now, or already within the
 * jump-ahead's fixed real-time lead of the barline at a fast tempo (#1458's Following
 * look-ahead)? `BandHost.inLastPulse` does the actual work, off the timeline it plays.
 *
 * Pure engine read off `songTick()`'s `tick`, not the chart's `active` slot: React only commits
 * `active` on its next render, so a caller that read `active`'s bar from the DOM (the Following
 * look-ahead's, #1458) could still see the bar just left after `songTick()` had already crossed
 * into the next one — firing "last beat" a bar early, at the new bar's downbeat. Reading the bar
 * straight from the timeline via `tick` has no such lag: it always names whichever bar `tick` is
 * ACTUALLY in. The caller passes the same `tick` it gave `playheadSlot` (#1506). False while
 * stopped or counting in.
 */
export function inLastBeat(tick: number | null): boolean {
    return tick != null && (band?.inLastPulse(tick) ?? false);
}

/**
 * Is playback in the last FELT pulse before performed slot `slot` ends — the last beat before
 * the chord under the playhead gives way (#1590)? Neck mode's strong preview reads this, not
 * `inLastBeat`: the grip it previews is the next different chord (`nextVoicedSlot`), which can
 * land inside the bar (`| Dm7 G7 |`), and a cue timed to the barline never fired for that change.
 * The chart sheet's next-BAR cue stays on `inLastBeat`; it is per bar by design (`nextBarIndex`).
 *
 * `tick` and `slot` are the pair the stand already read this paint (`songTick()`, then
 * `playheadSlot(tick)`, #1506), so this costs one slot lookup and `BandHost.inLastPulseBefore`'s
 * bar search — no second walk of the slots per frame. The slot's end is the band chart's
 * `BandSlot.to`. The beat itself is the host's (`inLastPulseBefore`), the meter's own pulse or
 * 600ms; a slot no longer than that is in it throughout. False while stopped, counting in, or off
 * any slot.
 */
export function inLastBeatOfSlot(tick: number | null, slot: number): boolean {
    if (tick == null || slot < 0 || !band) {
        return false;
    }
    const end = playedView()?.slots[slot]?.to;
    return end !== undefined && band.inLastPulseBefore(tick, end);
}
