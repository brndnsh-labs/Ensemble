import {
    type BandSettings,
    compileTimeline,
    DEFAULT_SETTINGS,
    type LeadInstrument,
    PPQ,
    STYLE_IDS,
    STYLES,
    type StyleId,
    toMidi,
} from '@band/index';
import { transposeKey } from '@engine/controllers/arranger-controller';
import {
    flushBuffers,
    loadDrumPreset,
    togglePower,
} from '@engine/controllers/instrument-controller';
import {
    loopSection as armSectionLoop,
    clearPracticeLoop,
    getSectionStepBounds,
} from '@engine/controllers/practice-controller';
import { autoVoiceForGenre } from '@engine/data/genre-sound-map';
import { GENRE_NAMES, SMART_GENRES } from '@engine/data/smart-genres';
import { validateProgression } from '@engine/engine/chords-engine';
import {
    initAudio,
    killAllNotes,
    playNote,
    restoreGains,
    syncBusReverbSend,
} from '@engine/engine/engine';
import { isPackInstalled } from '@engine/engine/instrument-registry';
import {
    startPlatformAudioAndWakeLock,
    stopPlatformAudioAndWakeLock,
} from '@engine/engine/platform-orchestrator';
import { transposeChordText } from '@engine/engine/transpose';
import { proposeLegacyScoreConversion } from '@engine/songbook/legacy-score';
import type { SemanticScore } from '@engine/songbook/score-types';
import {
    type ChartContent,
    type ChartLaneMix,
    type ChartNotation,
    DEFAULT_SOLOIST_TRADE_CHORUSES,
    type SoloistMode,
    type SoloistTradeBars,
    type SoloistTradeChoruses,
    type SoloistTradeWith,
} from '@engine/songbook/types';
import { dispatch, getState, subscribe } from '@engine/state';
import {
    deriveSoloistModeOnBoot,
    handleEffects,
    reconcileUrlGenreOnBoot,
    resolveAutoVoices,
} from '@engine/state/state-effects';
import {
    ACTIONS,
    type EnsembleState,
    type InstrumentModule,
    type InstrumentVoice,
    type SwingSub,
} from '@engine/types';
import { getFrequency, transposeKeyName } from '@engine/utils';
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
    COMP_FOR_VOICE,
    LEAD_FOR_VOICE,
    STYLE_FOR_GENRE,
    VOICE_FOR_COMP,
    VOICE_FOR_LEAD,
} from './band-voices';
import {
    type ChartDocument,
    type DocumentContent,
    scoreArrangementView,
    validateDocument,
} from './documents';
import { checkPlayable } from './engine-mode';
import { masterVolumePreference, rememberMasterVolume } from './session';
import {
    initializeSounds,
    prepareSound,
    prepareSounds,
    seedInstalledSounds,
    validateVoice,
} from './sounds';

export type { ChartContent, ChartDocument, StemInstrument };
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
const AUTO_LANES = ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const;
/**
 * Ceiling on waiting for the band to reach the barline that plays a new feel (#1185). One bar
 * at the engine's slowest tempo is ~6s; past this the audio clock is not running
 * (a suspended context, a hidden tab) and waiting longer only strands the UI.
 */
const STAGED_FEEL_TIMEOUT_MS = 12_000;
// Authored source belongs to the host document, never to generated runtime state.
let currentScore: SemanticScore | null = null;

// ---------------------------------------------------------------- the band engine
// The band engine (`band/`, docs/design/band-engine.md) plays, through the shared voices,
// buses and sound packs. The old worker/scheduler generator no longer runs in the app (#1404).
/** One sixteenth in band ticks: the old engine's step, so step maps convert exactly. */
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
let bandScore: { key: string; score: SemanticScore } | null = null;
let playhead: ReturnType<typeof setInterval> | null = null;
/**
 * The chart sheet's view of the open score, read from the score and its timeline
 * (`band-chart.ts`). Null for a measure-less chart, which the old engine's maps still draw.
 */
let bandView: BandChart | null = null;

function bandHost(): BandHost {
    band ??= new BandHost({ state: getState, silence: () => void killAllNotes(getState()) });
    return band;
}

/** The chart as a semantic score; a measure-less (v1) chart converts on the fly. */
function scoreForBand(): SemanticScore {
    if (currentScore) {
        return currentScore;
    }
    const content = captureContent();
    const key = JSON.stringify(content.arrangement);
    if (bandScore?.key === key) {
        return bandScore.score;
    }
    const now = new Date(0).toISOString();
    const proposal = proposeLegacyScoreConversion(
        JSON.stringify({
            schemaVersion: 1,
            id: 'live',
            title: 'live',
            createdAt: now,
            updatedAt: now,
            revision: 0,
            chart: content,
        }),
    );
    if (proposal.kind !== 'candidate') {
        throw new Error(
            'This chart cannot play on the new engine yet. Convert it to measures first.',
        );
    }
    bandScore = { key, score: proposal.value.chart.score };
    return bandScore.score;
}

/** The band style the chart's genre plays. */
function bandStyle(): StyleId {
    const genre = getState().groove.lastSmartGenre;
    // A persisted genre string indexes this table: guard with hasOwn (the #1266 rule), so
    // 'constructor' or a retired key can't read an Object prototype member as a style.
    return Object.hasOwn(STYLE_FOR_GENRE, genre) ? STYLE_FOR_GENRE[genre] : 'rock';
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
        comp: COMP_FOR_VOICE[chords.voice] ?? 'piano',
        lead: bandLead(style),
        intensity: playback.autoIntensity ? null : playback.bandIntensity,
        swing: groove.swing,
        swingGrid: groove.swingSub === '16th' ? 16 : 8,
        humanize: groove.humanize,
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
    };
}

function bandLoop(): { from: number; to: number } | null {
    const { playback } = getState();
    return playback.loopStartStep >= 0 && playback.loopEndStep > playback.loopStartStep
        ? { from: playback.loopStartStep * STEP_TICKS, to: playback.loopEndStep * STEP_TICKS }
        : null;
}

function startBand(): void {
    const host = bandHost();
    const state = getState();
    const { arranger, playback } = state;
    host.setScore(scoreForBand());
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
    if (!playback.chartLocked) {
        dispatch(ACTIONS.SET_CHART_LOCKED, true);
    }
    if (playback.audio?.state === 'suspended') {
        void playback.audio.resume();
    }
    restoreGains(state);
    startPlatformAudioAndWakeLock();
    host.start(bandSettings(), playback.bpm, (playback.startStep || 0) * STEP_TICKS, bandLoop());
    param('playback', 'isPlaying', true);
    playhead ??= setInterval(followPlayhead, 50);
}

function stopBand(): void {
    band?.stop();
    if (playhead) {
        clearInterval(playhead);
        playhead = null;
    }
    param('chords', 'lastActiveChordIndex', null);
    if (getState().playback.isPlaying) {
        param('playback', 'isPlaying', false);
    }
    dispatch(ACTIONS.SET_START_STEP, 0);
    stopPlatformAudioAndWakeLock();
    void killAllNotes(getState());
}

/** Publish the written event under the playhead for the chart sheet, as the old scheduler did. */
function followPlayhead(): void {
    const tick = band?.songTick();
    if (tick == null) {
        return;
    }
    const { arranger, chords } = getState();
    let index: number;
    if (bandView) {
        index = slotAt(bandView, tick);
    } else {
        const step = Math.floor(tick / STEP_TICKS);
        index = arranger.stepMap.findIndex((entry) => entry.start <= step && step < entry.end);
    }
    if (index >= 0 && index !== chords.lastActiveChordIndex) {
        param('chords', 'lastActiveChordIndex', index);
    }
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
            drum?: string;
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
        if (payload.drum) {
            void loadDrumPreset(payload.drum);
        }
    }
    // The genre-change effect in `public/` picks the old engine's Auto sound; on the band,
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
    host.setLoop(bandLoop());
    host.update(bandSettings());
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const param = (module: string, name: string, value: unknown) =>
    dispatch(ACTIONS.SET_PARAM, { module, param: name, value });

function mix(lane: ChartLaneMix): ChartLaneMix {
    return {
        enabled: lane.enabled,
        voice: lane.voice,
        autoSound: lane.autoSound,
        volume: lane.volume,
        reverb: lane.reverb,
    };
}

/** Explicit semantic projection, never a clone of the live/audio state tree. */
export function captureContent(): ChartContent {
    const {
        arranger: a,
        playback: p,
        chords: c,
        bass: b,
        soloist: s,
        harmony: h,
        groove: g,
    } = getState();
    return clone({
        arrangement: {
            sections: a.sections,
            key: a.key,
            timeSignature: a.timeSignature,
            grouping: a.grouping,
            isMinor: a.isMinor,
            notation: a.notation,
            lastChordPreset: a.lastChordPreset,
        },
        performance: {
            bpm: p.bpm,
            complexity: p.complexity,
            seed: a.seed,
            randomizeSeed: a.randomizeSeed,
        },
        band: {
            chords: {
                ...mix(c),
                style: c.style,
                instrument: (c as unknown as { instrument?: string }).instrument,
                octave: c.octave,
                density: c.density,
            },
            bass: { ...mix(b), style: b.style, octave: b.octave },
            soloist: {
                ...mix(s),
                style: s.style,
                preset: s.preset,
                octave: s.octave,
                mode: s.mode,
                autoMode: s.autoMode,
                phrasingIntensity: s.phrasingIntensity,
                tradeMode: s.tradeMode,
                // Written only while trading, so a chart that never traded saves as before.
                ...(s.tradeWith === 'off'
                    ? {}
                    : {
                          tradeWith: s.tradeWith,
                          tradeBars: s.tradeBars,
                          tradeChoruses: s.tradeChoruses,
                      }),
            },
            harmony: { ...mix(h), style: h.style, octave: h.octave, complexity: h.complexity },
            groove: {
                ...mix(g),
                measures: g.measures,
                swing: g.swing,
                swingSub: g.swingSub,
                humanize: g.humanize,
                lastDrumPreset: g.lastDrumPreset,
                genreFeel: g.genreFeel,
                lastSmartGenre: g.lastSmartGenre,
                pattern: g.instruments.map((i) => ({ name: i.name, steps: i.steps })),
            },
        },
    } as ChartContent);
}

function rebuild(): void {
    validateProgression(getState(), dispatch);
    // A score on the band engine installs no plan for the old engine, so it derives nothing
    // from it (empty maps, an idle worker): that is expected, not an unplayable chart.
    if (!bandView && !getState().arranger.progression.length) {
        throw new Error('The chart has no playable chords. Check your chord text.');
    }
    // Silences whatever is still sounding. (Its worker flush does nothing: no worker runs.)
    flushBuffers();
    restoreGains(getState());
    for (const lane of ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const) {
        syncBusReverbSend(getState(), lane);
    }
}

function captureSessionContent(): DocumentContent {
    const content = captureContent();
    return currentScore
        ? { score: clone(currentScore), performance: content.performance, band: content.band }
        : content;
}

export function captureDocument(document: ChartDocument): ChartDocument {
    return validateDocument({ ...document, chart: captureSessionContent() });
}

/** One runtime per browser page, independent of React mount/unmount and route views. */
export function initialize(): Promise<void> {
    if (!boot) {
        boot = (async () => {
            initializeSounds();
            await loadDrumPreset('Basic Rock');
            // #1405 — before any chart opens, so Follow feel resolves against what this device
            // really holds. Local and bounded (`seedInstalledSounds`); no network.
            await seedInstalledSounds();
            // Guest startup must not download audio without an install/selection gesture.
            for (const module of ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const) {
                param(module, 'autoSound', false);
            }
            subscribe((action, state, context) => {
                if (loading) {
                    return;
                }
                // The async genre effect is awaited explicitly by setGenre below.
                if (action.type !== ACTIONS.SET_GENRE_FEEL) {
                    handleEffects(action, state, context);
                }
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
                installRenderBridge();
                document.documentElement.dataset.renderBridge = 'ready';
            }
        })();
    }
    return boot;
}

export function stop(): void {
    playIntent++;
    // #1211 — Stop always releases an armed/live practice loop; the drill is a
    // performance-mode overlay on the transport, not a setting that survives it.
    // Stop the band before clearing the loop, so the loop change can't restart it.
    if (band?.playing || getState().playback.isPlaying) {
        stopBand();
    }
    clearPracticeLoop();
}

/**
 * Arm a section-practice loop (#1211). Wraps the practice controller so the app
 * shell never imports `@engine/controllers/*` directly. Returns false (and
 * changes nothing) when the section id doesn't resolve to a step span — e.g. a
 * stale id from a chart that changed shape after this render.
 */
export function loopSection(sectionId: string): boolean {
    if (bandView) {
        // The old engine's section map is empty for a band-engine score; the timeline has it.
        const bounds = sectionSteps(bandView, sectionId);
        if (!bounds) {
            return false;
        }
        dispatch(ACTIONS.SET_PRACTICE_LOOP, bounds);
        return true;
    }
    if (!getSectionStepBounds(sectionId)) {
        return false;
    }
    armSectionLoop(sectionId);
    return true;
}

/** Drop out of a running or armed practice loop (#1211). */
export function clearLoop(): void {
    clearPracticeLoop();
}

/**
 * The id of the section currently armed/looping, or null when no loop is set.
 * Maps `playback.loopStartStep/loopEndStep` back to the `arranger.sectionMap`
 * entry with the matching span — using `getSectionStepBounds` so a section with
 * more than one map entry (a written repeat) resolves the same collapsed span
 * `loopSection` armed it with, rather than a single raw map row (#1211).
 */
export function loopedSection(): string | null {
    const { playback, arranger } = getState();
    if (playback.loopStartStep < 0) {
        return null;
    }
    if (bandView) {
        const view = bandView;
        const match = view.sections.find(({ id }) => {
            const bounds = sectionSteps(view, id);
            return bounds?.start === playback.loopStartStep && bounds.end === playback.loopEndStep;
        });
        return match?.id ?? null;
    }
    const ids = new Set(arranger.sectionMap.map((entry) => entry.id));
    for (const id of ids) {
        const bounds = getSectionStepBounds(id);
        if (
            bounds &&
            bounds.start === playback.loopStartStep &&
            bounds.end === playback.loopEndStep
        ) {
            return id;
        }
    }
    return null;
}

export async function toggle(progress: (text: string) => void): Promise<void> {
    if (getState().playback.isPlaying) {
        stop();
        return;
    }
    // Keep AudioContext creation on the gesture stack for mobile Safari.
    initAudio(getState());
    const intent = ++playIntent;
    await prepareSounds(captureContent(), progress);
    if (intent !== playIntent) {
        return;
    }
    startBand();
}

export async function setVoice(
    module: InstrumentModule,
    voice: InstrumentVoice,
    progress: (text: string) => void,
    auto = false,
): Promise<void> {
    validateVoice(module, voice);
    if (voice !== 'synth') {
        await prepareSound(voice.slice(5), progress);
    }
    // Keep the old selection throughout download/failure. Dispatch through the
    // established effects and worker delta (including crunch chord voicing).
    dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module, voice, auto });
    if (auto && module === 'soloist') {
        // Auto dispatch normally runs inside genre resolution; this explicit
        // picker also needs its established voice-to-phrasing reconciliation.
        deriveSoloistModeOnBoot(getState(), dispatch);
    }
    rebuild();
}

/** Live bus gain — mirrors `InstrumentSettings.tsx`'s `updateInstrumentAudio`. */
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

// `playback.bandIntensity`/`autoIntensity`/`metronome` are `runtime-derived` —
// session-only by design (`docs/design/write-ownership.md` §3), never part of
// `ChartContent` or a preferences key. A user dispatch onto them is fine (the law
// only forbids a *runtime system* writing a document/preferences field); they
// simply reset to their engine defaults on next boot, same as v1.

/** Manual band-energy override; ignored by the engine while `autoIntensity` is on. */
export function setBandIntensity(value: number): void {
    dispatch(ACTIONS.SET_BAND_INTENSITY, value);
}

/** Hands band energy to the conductor's own ramp, mirroring `InstrumentRail.tsx`. */
export function setAutoIntensity(auto: boolean): void {
    dispatch(ACTIONS.SET_AUTO_INTENSITY, auto);
}

/** Click track on/off — session-only, like the two above. */
export function setMetronome(enabled: boolean): void {
    dispatch(ACTIONS.SET_METRONOME, enabled);
}

/**
 * `preferences`-owned: persists to its own device-local key (`session.ts`)
 * immediately, independent of the chart's own Save — mirrors v1's
 * `debounceSaveState` persisting `masterVolume` outside the chart-dirty flow
 * (`state/persistence.ts`). The live bus ramp itself is `state-effects.ts`'s
 * `SET_PARAM(masterVolume)` case, run by the `handleEffects` call already wired
 * into this module's dispatch subscriber.
 */
export function setMasterVolume(value: number): void {
    dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'masterVolume', value });
    rememberMasterVolume(value);
}

/**
 * Chord-notation preference — `document`-owned, but the ONE Feel-sheet field split
 * across the dual chart schema: a schemaVersion-1 chart keeps it on `arranger.notation`
 * directly (what `dispatch` below writes, and what `captureContent()`'s `arrangement`
 * projection reads), while a schemaVersion-2 (score) chart's saved copy lives on the
 * authored `currentScore.notation` instead — `captureSessionContent()` clones
 * `currentScore` verbatim for that schema and never reads `arranger.notation` for it.
 * Patch both so either schema's next `captureDocument()` reflects the change. No
 * `rebuild()`/`editScore()`: notation is a pure display selector over the chord's
 * already-precomputed `display: FormattedChordNames` (all three notations are always
 * present), so it never touches arrangement layout, generation, or the worker.
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
export async function applyGenreSounds(progress: (text: string) => void): Promise<void> {
    for (const module of AUTO_LANES) {
        const voice = recommendedVoice(module);
        if (voice !== 'synth') {
            await prepareSound(voice.slice(5), progress);
        }
    }
    for (const module of ['groove', 'bass', 'chords', 'harmony', 'soloist'] as const) {
        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, {
            module,
            voice: recommendedVoice(module),
            auto: true,
        });
    }
    deriveSoloistModeOnBoot(getState(), dispatch);
    rebuild();
}

function apply(content: DocumentContent): void {
    const score = 'score' in content ? clone(content.score) : null;
    // A score is drawn from the band's own timeline; the old engine's plan, which would refuse
    // holds, N.C., fermatas and off-grid lengths, is never built. With no plan the old engine's
    // maps derive empty (`rebuild`), so nothing stale answers for this chart.
    const view = score ? bandChart(score, compileTimeline(score)) : null;
    const arrangement = score ? scoreArrangementView(score) : (content as ChartContent).arrangement;
    param('arranger', 'scorePlan', null);
    currentScore = score;
    bandView = view;
    for (const [key, value] of Object.entries(arrangement)) {
        param('arranger', key, value);
    }
    param('arranger', 'seed', content.performance.seed);
    param('arranger', 'randomizeSeed', content.performance.randomizeSeed);
    param('playback', 'bpm', content.performance.bpm);
    param('playback', 'complexity', content.performance.complexity);
    for (const module of ['chords', 'bass', 'soloist', 'harmony', 'groove'] as const) {
        for (const [key, value] of Object.entries(content.band[module])) {
            if (key !== 'pattern') {
                param(module, key, value);
            }
        }
    }
    // Optional legacy source selector must not leak from the outgoing chart.
    param('chords', 'instrument', content.band.chords.instrument);
    // Nor may trading: a chart saved without it doesn't trade.
    param('soloist', 'tradeWith', content.band.soloist.tradeWith ?? 'off');
    param('soloist', 'tradeBars', content.band.soloist.tradeBars ?? 4);
    param(
        'soloist',
        'tradeChoruses',
        content.band.soloist.tradeChoruses ?? DEFAULT_SOLOIST_TRADE_CHORUSES,
    );
    param(
        'groove',
        'instruments',
        getState().groove.instruments.map((instrument) => ({
            ...instrument,
            muted: false,
            steps: [
                ...(content.band.groove.pattern.find((p) => p.name === instrument.name)?.steps ||
                    []),
            ],
        })),
    );
    dispatch(ACTIONS.SET_PRACTICE_LOOP, null);
    dispatch(ACTIONS.SET_START_STEP, 0);
    param('arranger', 'history', []);
}

export function load(document: ChartDocument): void {
    const checked = validateDocument(document);
    if (checked.schemaVersion === 2) {
        checkPlayable(checked.chart.score);
    }
    stop();
    const previous = captureSessionContent();
    loading = true;
    try {
        apply(checked.chart);
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
async function prepareFeelSounds(name: string, progress: (text: string) => void): Promise<void> {
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

export async function setGenre(
    name: string,
    progress: (text: string) => void = () => {},
): Promise<void> {
    if (!Object.hasOwn(SMART_GENRES, name)) {
        throw new Error('Unknown genre.');
    }
    const wasPlaying = getState().playback.isPlaying;
    const previous = captureSessionContent();
    const payload = { genreName: name, ...SMART_GENRES[name] };
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
        // While playing, that reducer stages the feel and the band commits it at once
        // (`syncBand`), playing it from its next barline. So this dispatch plus the
        // auto-voice effects are the entire engine change: no teardown, no rebuild, no
        // restart. A `rebuild()` here would kill the notes the band has just scheduled.
        await reconcileUrlGenreOnBoot(getState(), name, null, dispatch);
        if (!staged) {
            rebuild();
            return;
        }
        progress('Switching feel at the next bar…');
        // Wait for the barline that plays it, so the switch reads as pending until it is
        // heard. A Stop inside the wait leaves nothing half-changed: the feel is committed.
        await awaitBandChange();
        if (payload.drum && getState().groove.lastDrumPreset !== payload.drum) {
            // The commit fires its drum preset without awaiting it (it carries the chart's
            // swing, `loadDrumPreset`). Settle that here so the document the caller captures
            // next cannot pair the new feel with the outgoing genre's.
            await loadDrumPreset(payload.drum);
        }
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
                    'Could not change feel or resume the previous sounds. Reconnect and press Play.',
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
export function setEnabled(module: InstrumentModule, enabled: boolean): void {
    if (getState()[module].enabled !== enabled) {
        togglePower(module);
    }
}
export function transpose(delta: number): void {
    if (currentScore) {
        const score = clone(currentScore);
        score.key = transposeKeyName(score.key, delta);
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
                            event.symbol = transposeChordText(event.symbol, delta);
                            if (event.alternates) {
                                event.alternates = event.alternates.map((symbol) =>
                                    transposeChordText(symbol, delta),
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
        return;
    }
    transposeKey(delta);
    // The band reads its score only when it starts, so a playing band hears the new key only
    // when it is handed the chart again; `setScore` restarts the song from the top, as a
    // measure-based chart's key change does (`editScore`).
    if (band?.playing) {
        band.setScore(scoreForBand());
    }
}
/**
 * The song's own major/minor (#1375) — `score.isMinor` only, never a section or bar override.
 * Chord names are not rewritten, and the key stays where it is: unlike v1's relative-key toggle,
 * v2's key is the score's own, so a musician who wants A minor picks A, then Minor. Measure-based
 * charts only, like the Edit panel's Song meter that sits beside it.
 */
export function setMode(isMinor: boolean): void {
    if (!currentScore) {
        throw new Error('Open a measure-based chart first.');
    }
    if (currentScore.isMinor === isMinor) {
        return;
    }
    const wasPlaying = getState().playback.isPlaying;
    editScore({ ...clone(currentScore), isMinor });
    if (wasPlaying) {
        startBand();
    }
}
export function editScore(score: SemanticScore): void {
    checkPlayable(score);
    const before = captureSessionContent();
    stop();
    loading = true;
    try {
        const { performance, band } = before;
        apply({ score, performance, band });
        rebuild();
    } catch (error) {
        apply(before);
        rebuild();
        throw error;
    } finally {
        loading = false;
    }
}
export function editSections(sections: ChartContent['arrangement']['sections']): void {
    if (currentScore) {
        throw new Error('Use the measure editor for this chart.');
    }
    const before = captureSessionContent();
    stop();
    loading = true;
    try {
        param('arranger', 'sections', clone(sections));
        rebuild();
    } catch (error) {
        apply(before);
        rebuild();
        throw error;
    } finally {
        loading = false;
    }
}
export function audition(index: number): void {
    if (getState().playback.isPlaying) {
        return;
    }
    initAudio(getState());
    const state = getState();
    let freqs: number[] | undefined;
    if (bandView) {
        // Band-engine chords are named and voiced by the band's chord authority; a hold or
        // N.C. has nothing of its own to sound.
        const chord = bandView.chords[index]?.chord;
        freqs = chord ? auditionMidis(chord).map(getFrequency) : undefined;
    } else {
        freqs = state.arranger.progression[index]?.freqs;
    }
    if (!freqs || !state.playback.audio) {
        return;
    }
    for (const frequency of freqs) {
        playNote(state, frequency, state.playback.audio.currentTime, 0.65, {
            vol: 0.12,
            instrument: 'Piano',
            ignoreSustain: true,
        });
    }
}
/**
 * Downloads a multi-track `.mid` of the current arrangement (#1277): the band's own event
 * stream, the one it plays live (`BandHost.render`), written by `toMidi`. Rendered on the side,
 * so it never touches the live band or the audio graph — safe while the band is playing.
 */
export function exportMidi(filename: string): Promise<void> {
    const host = bandHost();
    host.setScore(scoreForBand());
    bandSeed ||= String(getState().arranger.seed || 'ensemble');
    const settings = bandSettings();
    const { events, timeline } = host.render(settings);
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
    return Promise.resolve();
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
    progress: (text: string) => void,
    instruments: StemInstrument[] = STEM_INSTRUMENTS,
): Promise<void> {
    const intent = ++exportIntent;
    await prepareSounds(captureContent(), progress);
    if (intent !== exportIntent) {
        return;
    }
    const host = bandHost();
    host.setScore(scoreForBand());
    bandSeed ||= String(getState().arranger.seed || 'ensemble');
    const bpm = getState().playback.bpm;
    if (kind === 'mix') {
        progress('Rendering mix…');
        const { events, timeline } = host.render(bandSettings());
        const result = await renderBandMixToWav(events, timeline, bpm, { filename });
        if (intent !== exportIntent) {
            return;
        }
        downloadExportResult(result);
        return;
    }
    // A stem always renders its lane even if it's muted live, so force every lane on for the
    // one pass every stem below is sliced from, rather than muting/soloing per-stem state.
    const { events, timeline } = host.render({
        ...bandSettings(),
        lanes: { drums: true, bass: true, comp: true, lead: true },
    });
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

/** The band's view of the open score, or null for a measure-less chart, which the old maps draw. */
export function bandChartView(): BandChart | null {
    return bandView;
}
