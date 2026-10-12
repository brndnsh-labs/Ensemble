import { gainForPack } from '../data/sound-packs.js';
import type { GrooveState } from '../state/groove.js';
import type { EnsembleState, Mutable } from '../types.js';
import { clamp01 } from '../utils.js';
import { safeDisconnect } from './audio-graph-utils.js';
import { scrambleHash } from './hash-utils.js';
import {
    getPackBufferVariants,
    packIdFromVoice,
    resolveInstrumentSource,
} from './instrument-registry.js';
import {
    pickRoundRobin,
    playSampledStrike,
    releaseSampledVoices,
    type SampleVoiceHandle,
} from './sample-voice.js';
import {
    createSimplePanner,
    duckGain,
    playPercussiveStrike,
    playResonantTone,
    rampGain,
    updateDensityDucking,
    velocityTimbre,
} from './synth-utils.js';

type CymbalName = 'HiHat' | 'Open' | 'Ride' | 'Crash';

interface CymbalBufferProfile {
    key: string;
    duration: number;
    baseFreq: number;
    partials: number[];
    metalMix: number;
    noiseMix: number;
    transientMix: number;
    partialDecay: number;
    partialSpread: number;
    noiseDecay: number;
    smooth: number;
    saturation: number;
    jitter: number;
}

interface CymbalRuntimeProfile {
    volumeScale: number;
    playbackRate: number;
    playbackVariance: number;
    bandpassBase: number;
    bandpassVelocity: number;
    bandpassCap: number;
    highpassBase: number;
    highpassVelocity: number;
    highpassCap: number;
    q: number;
    attack: number;
    decayDelay: number;
    decayBase: number;
    decayVelocityFocus: number;
    decayIntensityFocus: number;
    minDecay: number;
    stopTime: number;
    pingFreq?: number;
    pingVolume?: number;
}

interface TomVoiceProfile {
    baseFreq: number;
    stickRatioBase: number;
    stickRatioVelocity: number;
    stickVolume: number;
    skinFreqMultiplier: number;
    skinVolume: number;
    skinQ: number;
    bodyStartRatio: number;
    bodyVolume: number;
    bodyDecay: number;
    bodyDuration: number;
    shellVolume: number;
    shellDecay: number;
    shellDuration: number;
    shellAttack: number;
}

interface CymbalVoiceConfig {
    volumeScale: number;
    playbackRate: number;
    playbackVariance: number;
    q: number;
    attack: number;
    decayDelay: number;
    decayTime: number;
    stopTime: number;
    bandpassFreq: number;
    highpassFreq: number;
    pingFreq?: number;
    pingVolume?: number;
}

interface KickVoiceConfig {
    beaterFreq: number;
    beaterEndFreq: number;
    beaterVolume: number;
    beaterDecay: number;
    skinVolume: number;
    skinFreq: number;
    knockStartFreq: number;
    knockEndFreq: number;
    knockVolume: number;
    knockDecay: number;
    shellFreq: number;
    shellVolume: number;
    shellDecay: number;
    shellDuration: number;
}

interface SnareVoiceConfig {
    lowBodyFreq: number;
    highBodyFreq: number;
    lowBodyVolume: number;
    highBodyVolume: number;
    bodyDecay: number;
    wiresVolume: number;
    wiresFreq: number;
    wiresQ: number;
    wiresDecay: number;
    wiresDuration: number;
    crackFreq: number;
    crackEndFreq: number;
    crackVolume: number;
    crackDecay: number;
}

type TomRegister = 'High' | 'Mid' | 'Low';

interface TomVoiceConfig {
    register: TomRegister;
    baseFreq: number;
    stickFreqStart: number;
    stickFreqEnd: number;
    stickVolume: number;
    skinVolume: number;
    skinFreq: number;
    skinQ: number;
    bodyFreqStart: number;
    bodyFreqEnd: number;
    bodyVolume: number;
    bodyDecay: number;
    bodyDuration: number;
    shellFreq: number;
    shellVolume: number;
    shellDecay: number;
    shellDuration: number;
    shellAttack: number;
}

interface DrumMixState {
    recentHits: number;
    densityDuck: number;
    lastTick: number;
}

// Ensemble pan map (Epic 7 S1 widening 2026-05-25 — see playDrumSound below
// for the full drum dispatch):
//   center 0     — Kick (anchored; jitter attempt removed — see playDrumSound)
//   center +0.25 — Soloist (bus offset; per-note ±0.05 jitter on top)
//   left   -0.2  — Snare/Sidestick
//   left   -0.3  — Chords (at bus)
//   right  +0.35 — HiHat / Open / Crash / Ride / shaker family
//   spread ±0.25 — Toms (per-hit randomized)
const RIGHT_PANNED_INSTRUMENTS = new Set(['HiHat', 'Open', 'Crash', 'Shaker']);

/**
 * Registry of every soundName the synth-drums dispatcher knows how to render.
 * If a groove writes a soundName not in this set, we warn once per name per session
 * — surfaces typos and stub voices without spamming the console or throwing.
 * Keep this in sync with the voices `playDrumSound` dispatches to.
 */
const KNOWN_SOUND_NAMES = new Set<string>([
    'Kick',
    'Snare',
    'Sidestick',
    'HiHat',
    'Open',
    'HiHatPedal',
    'Ride',
    'Crash',
    'Shaker',
    // why: no-space tom variants are inert — every fill template emits the
    // space-form (`'High Tom'`/`'Mid Tom'`/`'Low Tom'`). The
    // `name.includes('Tom')` substring exemption in `maybeWarnUnknownSound`
    // also catches the space-form, so the no-space entries added literally
    // nothing to the warning suppression. Removed to keep the registry honest.
]);

const warnedUnknownSounds = new Set<string>();

// why: enumerate the exact suffix vocabulary that each per-family dispatcher
// branch in `playDrumSound` actually recognizes. Substring matching was too lax — a
// typo would be exempt from the warning. Listing the legal suffixes here makes
// typos warn loudly while preserving the exemption for canonical names. Each
// entry is a tuple of `{ root, suffixes, spacedForm }`:
//   - `root` matches both the bare name (`'Tom'`) and `<root><suffix>`.
//   - `suffixes` are the exact dispatcher-recognized variants.
//   - `spacedForm` allows the `'<Suffix> <Root>'` emission style used by Toms
//     (live grooves emit `'High Tom'`, which the dispatcher matches via
//     `name.includes('Tom')`).
const DISPATCHER_FAMILIES: ReadonlyArray<{
    root: string;
    suffixes: readonly string[];
    spacedForm?: boolean;
}> = [{ root: 'Tom', suffixes: ['High', 'Mid', 'Low'], spacedForm: true }];

function isDispatcherRecognizedFamilyName(name: string): boolean {
    for (const { root, suffixes, spacedForm } of DISPATCHER_FAMILIES) {
        if (name === root) {
            return true;
        }
        for (const sfx of suffixes) {
            if (name === root + sfx) {
                return true;
            }
            if (spacedForm && name === `${sfx} ${root}`) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Emit a single console.warn for any unknown drum soundName. Once per name
 * per session — drummer engines should never crash playback, just degrade.
 * The Tom family is exempted only for the exact suffix variants the dispatcher
 * actually renders (see `DISPATCHER_FAMILIES` above); typos like `'TomMidd'` will warn.
 */
function maybeWarnUnknownSound(name: string): void {
    if (KNOWN_SOUND_NAMES.has(name) || isDispatcherRecognizedFamilyName(name)) {
        return;
    }
    if (warnedUnknownSounds.has(name)) {
        return;
    }
    warnedUnknownSounds.add(name);
    // eslint-disable-next-line no-console
    console.warn(`[synth-drums] unknown soundName "${name}" — no audio voice will play.`);
}

export { KNOWN_SOUND_NAMES };

const TAU = Math.PI * 2;

const CYMBAL_BUFFER_PROFILES: Record<CymbalName, CymbalBufferProfile> = {
    HiHat: {
        key: 'hihatMetal',
        duration: 0.6,
        baseFreq: 2050,
        partials: [1, 1.29, 1.67, 2.18, 2.86, 3.62],
        metalMix: 0.61,
        noiseMix: 0.17,
        transientMix: 0.18,
        partialDecay: 14,
        partialSpread: 4.2,
        noiseDecay: 22,
        smooth: 0.17,
        saturation: 1.18,
        jitter: 0.018,
    },
    Open: {
        key: 'openHatMetal',
        duration: 3.0,
        baseFreq: 1700,
        partials: [1, 1.24, 1.63, 2.09, 2.71, 3.32, 4.07],
        metalMix: 0.54,
        noiseMix: 0.17,
        transientMix: 0.13,
        partialDecay: 4.2,
        partialSpread: 1.2,
        noiseDecay: 7.0,
        smooth: 0.16,
        saturation: 1.12,
        jitter: 0.016,
    },
    Ride: {
        key: 'rideMetal',
        duration: 4.4,
        baseFreq: 1120,
        partials: [1, 1.19, 1.49, 1.98, 2.57, 3.19, 3.89],
        metalMix: 0.48,
        noiseMix: 0.14,
        transientMix: 0.09,
        partialDecay: 2.0,
        partialSpread: 0.8,
        noiseDecay: 4.6,
        smooth: 0.19,
        saturation: 1.03,
        jitter: 0.02,
    },
    Crash: {
        key: 'crashMetal',
        duration: 9.0,
        baseFreq: 860,
        partials: [1, 1.34, 1.79, 2.27, 2.96, 3.56, 4.23, 5.02],
        metalMix: 0.38,
        noiseMix: 0.28,
        transientMix: 0.22,
        partialDecay: 0.8,
        partialSpread: 0.5,
        noiseDecay: 1.0,
        smooth: 0.22,
        saturation: 0.98,
        jitter: 0.024,
    },
};

const CYMBAL_RUNTIME_PROFILES: Record<CymbalName, CymbalRuntimeProfile> = {
    HiHat: {
        volumeScale: 0.69,
        playbackRate: 1.0,
        playbackVariance: 0.022,
        bandpassBase: 6500,
        bandpassVelocity: 520,
        bandpassCap: 7600,
        highpassBase: 3600,
        highpassVelocity: 220,
        highpassCap: 4200,
        q: 0.85,
        attack: 0.0015,
        decayDelay: 0.006,
        decayBase: 0.058,
        decayVelocityFocus: 0.01,
        decayIntensityFocus: 0.006,
        minDecay: 0.041,
        stopTime: 0.46,
    },
    Open: {
        volumeScale: 0.62,
        playbackRate: 1.0,
        playbackVariance: 0.02,
        bandpassBase: 5150,
        bandpassVelocity: 380,
        bandpassCap: 5900,
        highpassBase: 2700,
        highpassVelocity: 160,
        highpassCap: 3150,
        q: 0.72,
        attack: 0.01,
        decayDelay: 0.07,
        decayBase: 0.62,
        decayVelocityFocus: 0.06,
        decayIntensityFocus: 0.03,
        minDecay: 0.42,
        stopTime: 3.1,
    },
    Ride: {
        volumeScale: 0.74,
        playbackRate: 1.0,
        playbackVariance: 0.015,
        bandpassBase: 4300,
        bandpassVelocity: 340,
        bandpassCap: 5200,
        highpassBase: 2100,
        highpassVelocity: 130,
        highpassCap: 2550,
        q: 0.46,
        attack: 0.004,
        decayDelay: 0.1,
        decayBase: 1.55,
        decayVelocityFocus: 0.08,
        decayIntensityFocus: 0.04,
        minDecay: 1.1,
        stopTime: 4.8,
        pingFreq: 1580,
        pingVolume: 0.05,
    },
    Crash: {
        volumeScale: 0.9,
        playbackRate: 1.0,
        playbackVariance: 0.02,
        bandpassBase: 3500,
        bandpassVelocity: 260,
        bandpassCap: 4300,
        highpassBase: 1450,
        highpassVelocity: 100,
        highpassCap: 1750,
        q: 0.45,
        attack: 0.004,
        decayDelay: 0.16,
        decayBase: 3.5,
        decayVelocityFocus: 0.08,
        decayIntensityFocus: 0.05,
        minDecay: 2.8,
        stopTime: 9.0,
    },
};

const TOM_VOICE_PROFILES: Record<TomRegister, TomVoiceProfile> = {
    High: {
        baseFreq: 188,
        stickRatioBase: 4.1,
        stickRatioVelocity: 1.7,
        stickVolume: 0.34,
        skinFreqMultiplier: 11.5,
        skinVolume: 0.18,
        skinQ: 1.45,
        bodyStartRatio: 1.24,
        bodyVolume: 0.96,
        bodyDecay: 0.11,
        bodyDuration: 0.42,
        // why (low-end declutter): the shell is a pure low sine that lingered
        // ~1s, smearing the bass register during fills. High tom sits at ~184 Hz
        // (least bass overlap), so it gets the gentlest trim. Decay shortened so
        // the fundamental thumps and clears; duration kept ≥ ~5× decay to stay
        // click-free on the hard stop.
        shellVolume: 0.52,
        shellDecay: 0.18,
        shellDuration: 0.9,
        shellAttack: 0.006,
    },
    Mid: {
        baseFreq: 140,
        stickRatioBase: 3.5,
        stickRatioVelocity: 1.5,
        stickVolume: 0.36,
        skinFreqMultiplier: 9.5,
        skinVolume: 0.2,
        skinQ: 1.35,
        bodyStartRatio: 1.2,
        bodyVolume: 1.04,
        bodyDecay: 0.16,
        bodyDuration: 0.56,
        // why (low-end declutter): mid tom (~137 Hz) overlaps the bass low-mids;
        // pull the sustained shell back and shorten its tail so fills read as
        // punch, not a lingering low cloud.
        shellVolume: 0.6,
        shellDecay: 0.24,
        shellDuration: 1.1,
        shellAttack: 0.008,
    },
    Low: {
        baseFreq: 94,
        stickRatioBase: 2.9,
        stickRatioVelocity: 1.3,
        stickVolume: 0.38,
        skinFreqMultiplier: 7.8,
        skinVolume: 0.24,
        skinQ: 1.2,
        bodyStartRatio: 1.16,
        bodyVolume: 1.14,
        bodyDecay: 0.22,
        bodyDuration: 0.7,
        // why (low-end declutter): the low tom (~92 Hz) sits right on a bass
        // guitar's low E/F#, and its shell was the loudest (0.9) AND longest
        // (0.52s decay / 1.75s) of the three — backwards for mud. It gets the
        // biggest pull-back: quieter and a much shorter tail so it punches and
        // gets out of the bass's way. duration (1.4) stays ≥ ~5× decay (was
        // only ~3×, which cut an audible residual on stop).
        shellVolume: 0.66,
        shellDecay: 0.3,
        shellDuration: 1.4,
        shellAttack: 0.012,
    },
};

function getCymbalBuffer(groove: GrooveState, name: CymbalName): AudioBuffer | null {
    const profile = CYMBAL_BUFFER_PROFILES[name];
    return profile ? groove.audioBuffers[profile.key] || null : null;
}

function ensureCymbalBuffer(
    audioCtx: AudioContext,
    groove: GrooveState,
    name: CymbalName,
): AudioBuffer {
    const profile = CYMBAL_BUFFER_PROFILES[name];
    if (!profile) {
        return groove.audioBuffers.noise;
    }
    if (!groove.audioBuffers[profile.key]) {
        groove.audioBuffers[profile.key] =
            finishWarming(groove, profile.key) ?? createMetallicBuffer(audioCtx, profile);
    }
    return groove.audioBuffers[profile.key];
}

// synth-audit Epic 4 S4 — per-hit cymbal variation.
// One cached metallic buffer per cymbal would make fast hat patterns replay a
// byte-identical sample — a clear "looped" tell. The closed hat, pedal chick, open hat
// and ride instead draw from a small runtime-generated pool (the crash, struck
// seldom, keeps the single cached buffer): `createMetallicBuffer` already
// randomizes partial phases, per-partial detune/weight and the noise/transient
// layers on every call, so N independent generations are N genuinely different
// cymbals. Pool size 4 is the sweet spot from `drums.md` §6 — enough that a
// fast 16th hat run never repeats a sample within earshot. All buffers are
// synthesized at runtime, so the bundle is unchanged.
//
// Resident-RAM ceiling: `CYMBAL_POOL_SIZE × (distinct cymbal keys reaching
// `getVariedCymbalBuffer`)`. Today that key set is fixed at 3 (`hihatMetal`,
// `openHatMetal`, `rideMetal`), so 12 metallic buffers — negligible. NOTE for future stories:
// `groove.audioBuffers` is created once (`state/groove.ts`) and has no reset or
// prune path, so a `#pool` entry lives for the page lifetime. If a future story
// derives `profile.key` dynamically (per groove / velocity / articulation), the
// key set multiplies and this becomes unbounded — add pruning there.
//
// The no-immediate-repeat guarantee in `getVariedCymbalBuffer` requires
// `CYMBAL_POOL_SIZE >= 2`; do not drop it to 1.
const CYMBAL_POOL_SIZE = 4;

// Per-cymbal cursor for the last buffer handed out, so the picker can avoid an
// immediate repeat — a non-repeating random walk over the pool reads as more
// varied than a fixed round-robin cycle (which is itself just a period-4 loop).
// Keyed by the `audioBuffers` cache the pool lives in, as `warming` is, so it lives
// and dies with it: the offline-render clone starts with a fresh `audioBuffers`
// (`cloneStateForDetachedGeneration`), and a module-level record here made a
// seeded render's hat picks depend on what had rendered before it in the same
// page (#1552) — the first render took the no-previous branch, the next one the
// other, with the first's last index.
const cymbalPoolLastIndex = new WeakMap<object, Record<string, number>>();

function lastIndexFor(groove: GrooveState): Record<string, number> {
    let cursors = cymbalPoolLastIndex.get(groove.audioBuffers);
    if (!cursors) {
        cursors = {};
        cymbalPoolLastIndex.set(groove.audioBuffers, cursors);
    }
    return cursors;
}

/**
 * Variation-pool buffer fetch for the hat and ride voices (Epic 4 S4).
 *
 * Lazily grows a pool of `CYMBAL_POOL_SIZE` independently-synthesized metallic
 * buffers under a derived `audioBuffers` key. While the pool is still filling,
 * each call generates and returns a fresh buffer — this spreads the synthesis
 * cost across the first few hits (one `createMetallicBuffer` per hit, the same
 * per-hit cost the single-buffer crash pays on its first hit) and means even
 * hits 1–4 are already distinct. Once the pool is full it returns a random
 * member, never the one used immediately before, so a fast hat pattern has no
 * audible loop period.
 *
 * The crash does not use it: `playKickSnareCrashTom` keeps the single-buffer
 * `getCymbalBuffer`/`ensureCymbalBuffer` path.
 */
function getVariedCymbalBuffer(
    audioCtx: AudioContext,
    groove: GrooveState,
    name: CymbalName,
): AudioBuffer {
    const profile = CYMBAL_BUFFER_PROFILES[name];
    if (!profile) {
        return groove.audioBuffers.noise;
    }
    const poolKey = `${profile.key}#pool`;
    let pool: AudioBuffer[] = groove.audioBuffers[poolKey];
    if (!pool) {
        pool = [];
        groove.audioBuffers[poolKey] = pool;
    }
    // Still filling — synthesize one more distinct buffer and use it now.
    if (pool.length < CYMBAL_POOL_SIZE) {
        const fresh = finishWarming(groove, poolKey) ?? createMetallicBuffer(audioCtx, profile);
        pool.push(fresh);
        return fresh;
    }
    // Full pool — pick a random buffer, but never repeat the previous one.
    const cursors = lastIndexFor(groove);
    const last = cursors[profile.key] ?? -1;
    let index: number;
    if (last < 0) {
        // First pick after the pool filled — no previous buffer to avoid.
        index = Math.floor(Math.random() * pool.length);
    } else {
        // Draw uniformly from the `pool.length - 1` non-`last` slots and shift
        // past `last`: this keeps every non-`last` member equally likely (a
        // plain "redraw collisions to last+1" would double one neighbor's odds).
        index = Math.floor(Math.random() * (pool.length - 1));
        if (index >= last) {
            index++;
        }
    }
    cursors[profile.key] = index;
    return pool[index];
}

// synth-audit Epic 4 S7 — voice-specific colored noise.
// Every noise layer reads one shared flat 2 s white-noise buffer, started from
// sample 0 every hit — spectrally flat AND static, two "synthy" tells at once.
// `createColoredNoiseBuffer` pre-renders a longer (4 s) buffer with a per-voice
// spectral tilt; the closed hat and the shaker read a random per-hit offset into it (via
// `playPercussiveStrike`'s `bufferOffset`), so a noise layer is both textured
// and varied hit-to-hit. Runtime-generated — no bundle-size change.
// Length of every colored-noise buffer, and the range `noiseOffset` draws from
// — one symbol so the two can never drift apart.
const NOISE_BUFFER_SECONDS = 4;

/**
 * Render a 4 s mono noise buffer with a spectral tilt: `bright`, a one-pole
 * differentiator (+slope) — airy, fine hiss for hat sizzle / shaker.
 *
 * The result is RMS-normalized to match flat white noise (RMS ≈ 0.577), so
 * swapping a voice's buffer changes its *timbre* without changing its level —
 * the A/B stays an honest timbre comparison. A final `tanh` tames stray peaks
 * the normalization can lift past unity.
 */
function createColoredNoiseBuffer(audioCtx: AudioContext): AudioBuffer {
    const length = Math.max(1, Math.floor(audioCtx.sampleRate * NOISE_BUFFER_SECONDS));
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    let prev = 0;
    let sumSq = 0;
    for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        // differentiator (white − previous white) — emphasizes the top
        const v = white - prev;
        prev = white;
        data[i] = v;
        sumSq += v * v;
    }

    // Normalize to white-noise RMS so the colored buffer is a like-for-like
    // timbre swap, not a level change.
    const rms = Math.sqrt(sumSq / length);
    const norm = rms > 1e-6 ? 0.5774 / rms : 1;
    for (let i = 0; i < length; i++) {
        data[i] = Math.tanh(data[i] * norm);
    }
    return buffer;
}

/**
 * Lazily create and cache the one colored-noise buffer under its `groove.audioBuffers`
 * key. One 4 s buffer for the page lifetime — negligible RAM, no reset path needed.
 */
function getColoredNoiseBuffer(audioCtx: AudioContext, groove: GrooveState): AudioBuffer {
    const key = 'noise#bright';
    if (!groove.audioBuffers[key]) {
        groove.audioBuffers[key] = createColoredNoiseBuffer(audioCtx);
    }
    return groove.audioBuffers[key];
}

/** A fresh random read position into a colored-noise buffer. */
function noiseOffset(): number {
    return Math.random() * NOISE_BUFFER_SECONDS;
}

/**
 * The pitched lanes (bass, chords, soloist) the cymbal trim counts when no performance says
 * otherwise: the ones switched on. This is the one rule for a hit with no section behind it (a
 * preview, a test); a band hit is handed the count of the lanes its own section sounds
 * (`soundingLayers` in `prototypes/v2/lib/band-host.ts`).
 */
export function enabledLayerCount(state: EnsembleState): number {
    return [state.bass, state.chords, state.soloist].filter((lane) => lane?.enabled).length;
}

/**
 * Keep cymbals supportive when the full arrangement is active. `layers` is how many pitched
 * lanes are sounding at the hit (0-3).
 */
export function getCymbalMixScale(state: EnsembleState, name: CymbalName, layers: number): number {
    const bandIntensity = clamp01(state.playback?.bandIntensity ?? 0.5);
    // Over 4, the lane count before the harmony lane went (#1436): kept so the cymbal mix
    // for today's three pitched lanes is unchanged.
    const crowding = layers / 4;
    const genreFeel = state.groove?.genreFeel;
    const instrumentBase =
        name === 'HiHat' ? 0.96 : name === 'Ride' ? 0.92 : name === 'Open' ? 0.82 : 0.95;
    const intensityTrim = 1 - Math.max(0, bandIntensity - 0.6) * 0.18;
    const crowdingTrim =
        1 -
        crowding *
            (name === 'HiHat' ? 0.05 : name === 'Ride' ? 0.09 : name === 'Open' ? 0.16 : 0.14);
    const genreBoost = name === 'Ride' && genreFeel === 'Jazz' ? 1.03 : 1;

    return Math.max(0.55, instrumentBase * intensityTrim * crowdingTrim * genreBoost);
}

/**
 * Keep the snare present as the backbeat anchor, with a small lift for rock/blues.
 */
export function getSnareMixScale(state: EnsembleState, velocity: number): number {
    const bandIntensity = clamp01(state.playback?.bandIntensity ?? 0.5);
    const genreFeel = state.groove?.genreFeel;
    const genreBoost =
        genreFeel === 'Rock' || genreFeel === 'Blues' ? 1.06 : genreFeel === 'Jazz' ? 1.03 : 1;
    const intensityLift = 1 + Math.max(0, bandIntensity - 0.55) * 0.04;
    const velocityLift = 1 + Math.max(0, velocity - 0.9) * 0.08;

    return Math.max(0.94, genreBoost * intensityLift * velocityLift);
}

/**
 * Keep the rhythm section's low-mid body a touch more forward in Blues/Jazz without
 * inflating cymbal presence.
 */
export function getRhythmBodyMixScale(state: EnsembleState, name: string): number {
    const genreFeel = state.groove?.genreFeel;

    if (name === 'Kick') {
        return genreFeel === 'Jazz' ? 1.05 : genreFeel === 'Blues' ? 1.04 : 1;
    }

    if (name.includes('Tom')) {
        return genreFeel === 'Jazz' ? 1.04 : genreFeel === 'Blues' ? 1.03 : 1;
    }

    return 1;
}

/**
 * Runtime cymbal shaping keeps high-intensity hits focused instead of simply brighter/longer.
 */
export function getCymbalVoiceConfig(
    name: CymbalName,
    velocity: number,
    bandIntensity = 0.5,
): CymbalVoiceConfig | null {
    const base = CYMBAL_RUNTIME_PROFILES[name];
    if (!base) {
        return null;
    }

    const intensity = clamp01(bandIntensity);
    const vel = Math.max(0.3, velocity);
    const brightnessGuard = 1 - Math.max(0, vel - 1.0) * 0.1 - Math.max(0, intensity - 0.8) * 0.08;
    const brightness = Math.max(0.76, brightnessGuard);
    const openBarkAmount = name === 'Open' ? 1 - clamp01((vel - 0.62) / 0.1) : 0;
    const baseDecayTime = Math.max(
        base.minDecay,
        base.decayBase -
            Math.max(0, vel - 0.95) * base.decayVelocityFocus -
            Math.max(0, intensity - 0.75) * base.decayIntensityFocus,
    );

    return {
        ...base,
        attack: Math.max(0.004, base.attack - openBarkAmount * 0.003),
        decayTime: Math.max(base.minDecay, baseDecayTime - openBarkAmount * 0.12),
        stopTime: Math.max(base.minDecay, base.stopTime - openBarkAmount * 0.08),
        bandpassFreq: Math.min(
            base.bandpassCap,
            (base.bandpassBase + vel * base.bandpassVelocity + openBarkAmount * 140) * brightness,
        ),
        highpassFreq: Math.min(
            base.highpassCap,
            (base.highpassBase + vel * base.highpassVelocity + openBarkAmount * 90) * brightness,
        ),
        q: base.q + openBarkAmount * 0.08,
    };
}

/**
 * Keep the kick centered on body/punch while trimming overly clicky top-end in dense sections.
 */
export function getKickVoiceConfig(velocity: number, bandIntensity = 0.5): KickVoiceConfig {
    const vel = clamp01(Math.max(0.2, velocity));
    const intensity = clamp01(bandIntensity);
    const denseMix = Math.max(0, intensity - 0.6);
    const beaterFocus = 1 - denseMix * 0.28;

    return {
        beaterFreq: Math.max(1700, (2150 + vel * 950) * beaterFocus),
        beaterEndFreq: 520 + vel * 70,
        beaterVolume: Math.max(0.24, 0.3 + vel * 0.06 - denseMix * 0.08),
        beaterDecay: 0.0025 + vel * 0.0015,
        skinVolume: 0.12 + vel * 0.06,
        skinFreq: Math.max(650, 820 + vel * 260 - denseMix * 160),
        knockStartFreq: 150 + vel * 24,
        knockEndFreq: 54 + vel * 4,
        knockVolume: 1.12 + vel * 0.16,
        knockDecay: 0.035 + vel * 0.012,
        shellFreq: 48 + vel * 4,
        shellVolume: 0.94 + denseMix * 0.12 + vel * 0.04,
        shellDecay: 0.09 + denseMix * 0.03 + vel * 0.02,
        shellDuration: 0.55 + denseMix * 0.12,
    };
}

/**
 * Strong snare hits should crack and bloom; ghost notes should stay short and papery.
 */
export function getSnareVoiceConfig(velocity: number): SnareVoiceConfig {
    const vel = clamp01(Math.max(0.1, velocity));
    const accent = clamp01((vel - 0.55) / 0.35);
    const ghost = 1 - clamp01((vel - 0.35) / 0.45);

    return {
        lowBodyFreq: 182 + accent * 10,
        highBodyFreq: 318 + accent * 28,
        lowBodyVolume: 0.16 + vel * 0.08 + accent * 0.04,
        highBodyVolume: 0.14 + vel * 0.06 + accent * 0.03,
        bodyDecay: 0.038 + accent * 0.022,
        wiresVolume: 0.62 + vel * 0.34 + accent * 0.08,
        wiresFreq: 1350 + vel * 280 + accent * 620,
        wiresQ: 1.0 + accent * 0.18,
        wiresDecay: 0.045 + accent * 0.03 - ghost * 0.012,
        wiresDuration: 0.24 + accent * 0.22 - ghost * 0.08,
        crackFreq: 2200 + accent * 950,
        crackEndFreq: 1500 + accent * 260,
        crackVolume: 0.02 + accent * 0.18,
        crackDecay: 0.006 + accent * 0.008,
    };
}

// Key → pitch-class (0–11). A stable 12-name music constant, kept local (it mirrored
// KEY_PC in the old engine's soloist-phrase-first.ts, to avoid a soloist→drum-synth import edge).
const TOM_KEY_PC: Record<string, number> = {
    C: 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    F: 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11,
};

// The default Low tom (94 Hz) sits ~F#2 (MIDI 42, pc 6); the three toms already
// form ~root/fifth/octave (94 : 140 : 188 ≈ 1 : 1.49 : 2). So #730 "key-tunes"
// the kit by ONE uniform semitone offset that lands the Low tom on the selected
// key's tonic in its native register — Mid then rings the fifth, High the octave.
// A single scalar on all three baseFreqs preserves every internal ratio, the
// High>Mid>Low ordering, AND the low-end-declutter sustain relationships.
// F# — the pitch-class the default 94 Hz Low tom already voices (94 Hz ≈ F#2
// +28 cents), so key=F# is the zero-shift no-op that preserves the hand-tuned
// timbre. This anchor is REQUIRED for correctness, not a free knob: to make the
// Low tom land on the actual tonic, the pc the untuned voice sits at must be the
// zero point. (The ~+28 cents rides along, so tuned tonics are ~a quarter-tone
// sharp — inaudible on fast-decaying inharmonic toms, and arguably less sterile.)
const TOM_ANCHOR_PC = 6;

/**
 * Semitones to transpose the whole tom kit so its Low tom lands on `key`'s
 * tonic, wrapped to the NEAREST tonic (range [-6, +5]) so the shift stays
 * subtle — most keys move only 1–4 semitones; the tritone key (C) resolves
 * DOWN a tritone (-6) rather than up, keeping the tom lower = more bass
 * reinforcement (the #730 goal). Unknown/absent key → 0 (no shift). Synth-only:
 * recorded sample-pack toms can't be retuned, so this never touches them.
 */
export function getTomKeyTuneSemitones(key: string | undefined): number {
    if (!key) {
        return 0;
    }
    const tonicPc = TOM_KEY_PC[key];
    if (tonicPc === undefined) {
        return 0;
    }
    // Nearest-tonic wrap into [-6, +5]: a tritone (delta 6) resolves downward (-6).
    return ((((tonicPc - TOM_ANCHOR_PC + 6) % 12) + 12) % 12) - 6;
}

/**
 * Toms should separate more clearly by shell size, pitch drop, and sustain.
 *
 * `keyTuneSemitones` (#730) transposes the whole kit to the selected key's
 * tonic — see `getTomKeyTuneSemitones`. Default 0 keeps the untuned voice.
 */
export function getTomVoiceConfig(
    name: string,
    velocity: number,
    keyTuneSemitones = 0,
): TomVoiceConfig {
    const register: TomRegister = name.includes('High')
        ? 'High'
        : name.includes('Mid')
          ? 'Mid'
          : 'Low';
    const base = TOM_VOICE_PROFILES[register];
    const vel = clamp01(Math.max(0.2, velocity));
    // Uniform transpose: one scalar on the fundamental keeps all ratios intact.
    const baseFreq = base.baseFreq * 2 ** (keyTuneSemitones / 12);

    return {
        register,
        baseFreq,
        stickFreqStart: baseFreq * (base.stickRatioBase + vel * base.stickRatioVelocity),
        stickFreqEnd: baseFreq * (register === 'Low' ? 1.08 : register === 'Mid' ? 1.1 : 1.12),
        stickVolume: base.stickVolume + vel * 0.04,
        skinVolume: base.skinVolume * vel,
        skinFreq: baseFreq * base.skinFreqMultiplier,
        skinQ: base.skinQ,
        bodyFreqStart: baseFreq * base.bodyStartRatio,
        bodyFreqEnd: baseFreq,
        bodyVolume: base.bodyVolume + vel * 0.08,
        bodyDecay: base.bodyDecay + vel * 0.03,
        bodyDuration: base.bodyDuration,
        shellFreq: baseFreq * 0.98,
        shellVolume: base.shellVolume + vel * 0.06,
        shellDecay: base.shellDecay + vel * 0.04,
        shellDuration: base.shellDuration,
        shellAttack: base.shellAttack,
    };
}

/**
 * Stop any currently decaying drum sounds (specifically hat/ride).
 * @param state - Global ensemble state.
 */
export function killDrumNote(state: EnsembleState): void {
    const { playback, groove } = state;
    if (!playback.audio) {
        return;
    }
    if (groove.lastHatGain) {
        rampGain(groove.lastHatGain.gain, 0, playback.audio.currentTime, 0.005);
        (groove as Mutable<typeof groove>).lastHatGain = null; // @direct-mutation
    }
    if (groove.lastSampledHatVoice) {
        // Choke the ringing sampled open hat too (#679), then drop the slot —
        // parallel to lastHatGain above so a stop/reset doesn't leave it ringing.
        groove.lastSampledHatVoice.choke(playback.audio.currentTime);
        (groove as Mutable<typeof groove>).lastSampledHatVoice = null; // @direct-mutation
    }
    if (groove.lastRideGain) {
        rampGain(groove.lastRideGain.gain, 0, playback.audio.currentTime, 0.05);
        (groove as Mutable<typeof groove>).lastRideGain = null; // @direct-mutation
    }
    if (groove.lastCrashGain) {
        rampGain(groove.lastCrashGain.gain, 0, playback.audio.currentTime, 0.12);
        (groove as Mutable<typeof groove>).lastCrashGain = null; // @direct-mutation
    }
    // Every other sampled hit — a crash or ride still ringing — is silenced with its lane (#1530).
    releaseSampledVoices(playback.audio, 'drums', playback.audio.currentTime);
}

// Mix state for density-aware normalization, one per audio context (#1531): an offline render
// has its own clock and its own run of hits, and must neither inherit the live band's count nor
// leave its own behind for the next play.
const mixStates = new WeakMap<BaseAudioContext, DrumMixState>();

function mixStateFor(audio: BaseAudioContext): DrumMixState {
    let mixState = mixStates.get(audio);
    if (!mixState) {
        mixState = { recentHits: 0, densityDuck: 1.0, lastTick: 0 };
        mixStates.set(audio, mixState);
    }
    return mixState;
}

/**
 * Drum synthesis engine.
 * @param state - Global ensemble state.
 * @param name - Drum instrument name.
 * @param time - Start time in seconds.
 * @param velocity - Note velocity (0.0 - 1.0).
 */
// synth-audit Epic 6 S1 / Epic 7 #662 — instrument-source seam. When the groove
// voice is a `pack:<id>` whose buffers have loaded, route each strike to the
// sampled kit; a hit the pack doesn't cover (or a
// not-yet-loaded buffer) falls through to the synth voice for that one hit, so a
// sampled kit and the synth voice coexist seamlessly. With no pack installed the
// `sample` branch is never taken and the synth path is bit-identical.
//
// The synth voices each keep their own preamble (density ducking, the 2 ms scheduling guard,
// the per-hit panner and its pan value), and the two groups differ in the order and constants
// they use, so the dispatch only routes: the hats, ride and shaker use `setupPercussiveHit`
// (NaN-guarded velocity, fixed pan); `playKickSnareCrashTom` carries the older preamble the
// kick, snare, sidestick, crash and toms share, and is where a name no voice plays (RideBell on
// the synth kit, a typo) is warned about and its panner freed. Do not hoist the preambles into
// the dispatch: `tests/unit/engine/drum-dispatch.test.ts` pins the order of every side effect.
// `layers` is how many pitched lanes sound at this hit, for the cymbal trim (`getCymbalMixScale`); a
// caller with no section behind the hit leaves it to `enabledLayerCount`.
export function playDrumSound(
    state: EnsembleState,
    name: string,
    time: number,
    velocity = 1.0,
    layers = enabledLayerCount(state),
): void {
    if (resolveInstrumentSource(state.groove.voice).kind === 'sample') {
        if (tryPlaySampledDrum(state, name, time, velocity)) {
            return;
        }
        // articulation not in the pack (or buffer unavailable) → synth this hit
    }
    switch (name) {
        case 'HiHat':
            playClosedHat(state, time, velocity, layers);
            return;
        case 'Open':
            playOpenHat(state, time, velocity, layers);
            return;
        case 'HiHatPedal':
            playPedalChick(state, time, velocity, layers);
            return;
        case 'Ride':
            playRide(state, time, velocity, layers);
            return;
        case 'Shaker':
            playShaker(state, time, velocity);
            return;
        default:
            playKickSnareCrashTom(state, name, time, velocity, layers);
    }
}

/**
 * Map a groove-engine drum `name` to its pack manifest key (#662). A `null`
 * means the kit has no sample for it — the caller then plays the synth voice for
 * that hit. The tom map mirrors the synth voice's own naming.
 */
export function drumArticulationKey(name: string): string | null {
    switch (name) {
        case 'Kick':
            return 'kick';
        case 'Snare':
            return 'snare';
        case 'Sidestick':
            return 'sidestick';
        case 'HiHat':
            return 'hihat-closed';
        case 'Open':
            return 'hihat-open';
        case 'HiHatPedal':
            return 'hihat-pedal';
        case 'Ride':
            return 'ride';
        case 'RideBell':
            return 'ride-bell';
        case 'Crash':
            return 'crash';
        case 'Shaker':
            return 'shaker';
        default:
            // Tom names arrive space-formed (`High Tom`/`Mid Tom`/`Low Tom`); the
            // kit carries two tom samples, so mid folds onto the high rack tom.
            if (name.includes('Tom')) {
                return name.includes('Low') ? 'tom-low' : 'tom-high';
            }
            return null; // no sample for it → synth
    }
}

/**
 * The static stereo seat for a sampled drum hit — mirrors the synth path's
 * `panValue` logic (hi-hats/ride right, snare/sidestick left, toms spread) so the
 * sampled kit images the same as the synth kit. The tom spread is seeded off the
 * scheduling time (deterministic phrasing — never `Math.random`, which would also
 * desync the synth path's PRNG stream if this hit later fell back).
 */
function drumPanValue(name: string, time: number): number {
    if (RIGHT_PANNED_INSTRUMENTS.has(name)) {
        return 0.35;
    }
    if (name === 'Snare' || name === 'Sidestick') {
        return -0.2;
    }
    if (name.includes('Tom')) {
        return (scrambleHash(Math.round(time * 1000)) * 2 - 1) * 0.25;
    }
    return 0;
}

/**
 * Play one drum hit from the installed groove pack, or return `false` so the
 * caller falls back to the synth voice. Resolves the articulation → manifest key
 * → the zone's round-robin take set (#657), picks a take deterministically from
 * the scheduling time (so repeated hits don't machine-gun, and an offline render
 * is reproducible), and strikes it through the shared per-hit drum panner — the
 * identical bus (EQ / reverb / ducking / limiting) the synth voice uses. The
 * pack's calibrated `gainForPack` folds into the strike velocity.
 */
function tryPlaySampledDrum(
    state: EnsembleState,
    name: string,
    time: number,
    velocity = 1.0,
): boolean {
    const packId = packIdFromVoice(state.groove.voice);
    if (!packId) {
        return false;
    }
    const key = drumArticulationKey(name);
    if (!key) {
        return false;
    }
    const takes = getPackBufferVariants(packId, key);
    if (!takes || takes.length === 0) {
        return false; // pack lacks this articulation, or its buffers haven't loaded yet
    }
    const buffer = pickRoundRobin(takes, Math.round(time * 1000));
    if (!buffer) {
        return false;
    }
    // setupPercussiveHit allocates the per-hit panner, so resolve the buffer FIRST —
    // a bail after this point would orphan that panner (it frees only via the
    // strike's onEnded → releasePanner below). setupPercussiveHit returns null only
    // when there's no audio context, before it allocates anything.
    const ctx = setupPercussiveHit(state, time, velocity, drumPanValue(name, time));
    if (!ctx) {
        return false;
    }
    // Hi-hat choke (#679): the kit is one physical hi-hat, so any new hat hit
    // silences a still-ringing open hat — cut it at this hit's onset before
    // the new strike sounds. This is what lets an open hat carry a natural decay
    // (the sample rings out) yet stay tight in hat-dense genres like disco, where
    // the downbeat closed hat chokes the offbeat open (the classic "tss-chk"). The
    // active voice lives on `groove` state (per-host, like `lastHatGain`), written
    // via @direct-mutation — the sanctioned audio hot-path escape hatch.
    const groove = state.groove as Mutable<typeof state.groove>;
    if (isHatName(name) && groove.lastSampledHatVoice) {
        groove.lastSampledHatVoice.choke(ctx.playTime); // @direct-mutation
        groove.lastSampledHatVoice = null; // @direct-mutation
    }
    // `let` (not `const`) so the onEnded closure below can reference `voice`
    // without a temporal-dead-zone hazard on playSampledStrike's synchronous bail.
    let voice: SampleVoiceHandle | null = null;
    voice = playSampledStrike(ctx.audio, buffer, ctx.panner, ctx.playTime, {
        velocity: ctx.masterVol * gainForPack(packId),
        lane: 'drums',
        onEnded: () => {
            // Clear the slot if this voice is the active one and ended naturally,
            // so a later choke never pokes a freed source.
            if (groove.lastSampledHatVoice === voice) {
                groove.lastSampledHatVoice = null; // @direct-mutation
            }
            ctx.releasePanner();
        },
    });
    // Only the ringing hat (open) is worth choking later; closed and
    // pedal hits are already short, so they choke others but aren't tracked themselves.
    if (voice && isRingingHat(name)) {
        groove.lastSampledHatVoice = voice; // @direct-mutation
    }
    return true;
}

/** Any hi-hat articulation — all of these choke a ringing open hat. */
export function isHatName(name: string): boolean {
    return name === 'HiHat' || name === 'Open' || name === 'HiHatPedal';
}

/**
 * The hat that rings long enough to be worth tracking + choking (open).
 * Deliberately a **strict subset** of {@link isHatName}: closed and
 * pedal hats *choke* a ringing voice (so they're in `isHatName`) but are too
 * short to need choking themselves (so they're excluded here). Keep this asymmetry
 * — widening it to match `isHatName` would re-introduce the closed-hat pile-up.
 */
export function isRingingHat(name: string): boolean {
    return name === 'Open';
}

/**
 * Shared preamble for the hats, ride, shaker and the sampled strikes: density
 * ducking, the 2 ms scheduling guard, NaN-guarded velocity, the per-hit panner
 * (wired to the drums bus) and its release callback. Returns `null` when there
 * is no audio context. These voices carry no un-seeded `velJitter` — `masterVol`
 * derives straight from the already-humanized incoming velocity.
 */
function setupPercussiveHit(
    state: EnsembleState,
    time: number,
    velocity: number,
    panValue: number,
): {
    audio: AudioContext;
    playTime: number;
    hitVelocity: number;
    masterVol: number;
    panner: ReturnType<typeof createSimplePanner>;
    releasePanner: () => void;
} | null {
    const { playback } = state;
    if (!playback.audio) {
        return null;
    }
    const now = playback.audio.currentTime;
    const playTime = Math.max(time, now + 0.002);
    // why: counted on the hit's own time, not the context's clock (#1531). An offline render
    // schedules every hit before its clock moves, so on the clock the count never decayed and
    // the kit sank 2.5 dB over the first four bars of every export.
    const densityDuck = updateDensityDucking(mixStateFor(playback.audio), playTime);
    const hitVelocity = Number.isFinite(velocity) ? velocity : 1.0;
    const masterVol = hitVelocity * 1.3 * densityDuck;
    const panner = createSimplePanner(playback.audio, panValue, playTime);
    if (playback.audioGraph) {
        panner.connect(playback.audioGraph.drums.gain);
    }
    return {
        audio: playback.audio,
        playTime,
        hitVelocity,
        masterVol,
        panner,
        releasePanner: () => safeDisconnect([panner]),
    };
}

/**
 * The shaker — Epic 4 S6.
 * Velocity opens the highpass (a hard shake is brighter, more present) and
 * lengthens the decay slightly so a hard shake sustains its "sh" tail.
 */
function playShaker(state: EnsembleState, time: number, velocity = 1.0): void {
    const ctx = setupPercussiveHit(state, time, velocity, 0.35);
    if (!ctx) {
        return;
    }
    const { audio, playTime, hitVelocity, masterVol, panner, releasePanner } = ctx;
    const rr = (amt = 0.03) => 1 + (Math.random() - 0.5) * amt;
    const t = velocityTimbre(hitVelocity, { curve: 1.5, cutoffRange: [0.72, 1.34] });
    const vol = masterVol * 0.45 * rr();

    // S7 — `bright` colored noise read at a random per-hit offset: a fine,
    // airy, granular "sh" that varies shake-to-shake, not a flat static slice.
    // S8 — two-stage decay: the fast `decay` is the bead-impact transient, then
    // `bodyDecay` carries the longer "sh" wash. `bodyDecay` (not `decay`) now
    // carries the S6 velocity→sustain intent — a harder shake washes longer.
    playPercussiveStrike(audio, getColoredNoiseBuffer(audio, state.groove), panner, playTime, {
        volume: vol,
        filterType: 'highpass',
        freq: 6000 * t.cutoffMult,
        attack: 0.01,
        decay: 0.016,
        holdTime: 0.022,
        bodyDecay: 0.07 * (1 + t.brightness * 0.5),
        // why: 0.6 s clears the worst-case body tail (~0.105 s bodyDecay at
        // full velocity) by ~5 time-constants, so the stop is inaudible.
        duration: 0.6,
        onEnded: releasePanner,
        bufferOffset: noiseOffset(),
    });
}

/**
 * Shared preamble for the closed/open hat, pedal chick and ride: layers the family's `getCymbalVoiceConfig` lookup on top of
 * `setupPercussiveHit`'s density-duck/panner/velocity preamble, pinned to the
 * cymbal family's fixed right-pan (0.35 — see RIGHT_PANNED_INSTRUMENTS).
 * Returns `null` when there's no audio context or the family has no runtime
 * profile. `setupPercussiveHit` already created + connected the panner by the
 * time the `voiceConfig` guard runs, so the no-profile bail disconnects it
 * (mirrors the same guard-after-panner shape in `playKickSnareCrashTom`'s
 * Crash branch) rather than leaking a live node into the drums bus.
 */
function setupCymbalHit(
    state: EnsembleState,
    time: number,
    velocity: number,
    family: CymbalName,
): {
    audio: AudioContext;
    playTime: number;
    hitVelocity: number;
    masterVol: number;
    panner: ReturnType<typeof createSimplePanner>;
    voiceConfig: CymbalVoiceConfig;
} | null {
    const ctx = setupPercussiveHit(state, time, velocity, 0.35);
    if (!ctx) {
        return null;
    }
    const voiceConfig = getCymbalVoiceConfig(
        family,
        ctx.hitVelocity,
        state.playback.bandIntensity || 0.5,
    );
    if (!voiceConfig) {
        safeDisconnect([ctx.panner]);
        return null;
    }
    return {
        audio: ctx.audio,
        playTime: ctx.playTime,
        hitVelocity: ctx.hitVelocity,
        masterVol: ctx.masterVol,
        panner: ctx.panner,
        voiceConfig,
    };
}

/**
 * Closed hihat — synth-audit Epic 4 S2 ("un-choke the closed hat").
 *
 * The closed hat before S2 was choked: three independent decay-shorteners stack on
 * the gain envelope — `getCymbalVoiceConfig`'s velocity/intensity focus, the
 * 0.92–1.10 `hatDecayMult`, and the `decayDelay` jitter — collapsing the gain
 * time-constant to ~0.04 s. That guillotines the hat well before the `hihatMetal`
 * buffer's own `partialDecay` (≈0.22 s natural ring) has finished, so the tail is
 * cut off and the hit reads as clipped/toy-ish.
 *
 * This voice un-chokes it two ways: (1) a single, gentle velocity-driven decay
 * term instead of three stacked shorteners — a real closed hat tightens a little
 * when struck harder but is never guillotined; (2) a long gain time-constant
 * (~0.11–0.16 s) so the gain envelope barely shapes the tail and the buffer's
 * `partialDecay` does the choking, exactly as the discovery report prescribed.
 *
 * Per `epic-4-drums.md`, this voice does NOT carry the un-seeded `Math.random()`
 * `velJitter` the kick/snare preamble once had: the old scheduler's seeded velocity
 * humanizing (Epic 0 S6) already humanized the incoming velocity, and dropping the second,
 * un-seeded layer keeps the voice reproducible.
 */
function playClosedHat(state: EnsembleState, time: number, velocity: number, layers: number): void {
    const { groove } = state;
    const ctx = setupCymbalHit(state, time, velocity, 'HiHat');
    if (!ctx) {
        return;
    }
    const { audio, playTime, hitVelocity, masterVol, panner, voiceConfig } = ctx;

    const rr = (amt = 0.03) => 1 + (Math.random() - 0.5) * amt;
    const vel = clamp01(Math.max(0.3, hitVelocity));

    // --- The un-choke: ONE decay-shortener, not three -----------------------
    // `decayTc` is the sole decay modulator. A long 0.16 s base means the gain
    // envelope is nearly flat across the buffer's audible life, so the metallic
    // buffer's `partialDecay` shapes the tail. The single velocity term tightens
    // hard hits a touch (0.16 s soft → ~0.11 s hard) — physically real, never a
    // guillotine. No `hatDecayMult`, no `decayDelay` jitter.
    const decayTc = Math.max(0.085, 0.16 - Math.max(0, vel - 0.7) * 0.18);
    const decayDelay = 0.012; // fixed short hold — lets the transient bloom

    const hatArticulation = 0.985 + Math.random() * 0.035;
    const vol =
        masterVol *
        voiceConfig.volumeScale *
        getCymbalMixScale(state, 'HiHat', layers) *
        (0.95 + Math.random() * 0.03) *
        rr();

    // Choke the previous hat so successive closed hats don't pile up — this
    // matters more than it did before S2 because this hat now rings longer.
    if (groove.lastHatGain) {
        rampGain(groove.lastHatGain.gain, 0, playTime, 0.008);
    }

    const source = audio.createBufferSource();
    // Epic 4 S4 — draw from the variation pool so successive closed hats are
    // not byte-identical replays of one cached buffer.
    source.buffer = getVariedCymbalBuffer(audio, groove, 'HiHat');
    source.playbackRate.value =
        voiceConfig.playbackRate * hatArticulation * rr(voiceConfig.playbackVariance);

    const bpFilter = audio.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.frequency.setValueAtTime(
        voiceConfig.bandpassFreq * (1.06 + Math.random() * 0.08),
        playTime,
    );
    bpFilter.frequency.setTargetAtTime(
        voiceConfig.bandpassFreq * (0.98 + Math.random() * 0.04),
        playTime + 0.008,
        0.02,
    );
    bpFilter.Q.value = voiceConfig.q * (0.92 + Math.random() * 0.22);

    const hpFilter = audio.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.setValueAtTime(
        voiceConfig.highpassFreq * (1.03 + Math.random() * 0.09),
        playTime,
    );
    hpFilter.frequency.setTargetAtTime(
        voiceConfig.highpassFreq * 0.97 * (0.98 + Math.random() * 0.03),
        playTime + 0.008,
        0.025,
    );

    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, playTime);
    gain.gain.setTargetAtTime(vol, playTime, voiceConfig.attack);
    gain.gain.setTargetAtTime(0, playTime + decayDelay, decayTc);
    (groove as Mutable<typeof groove>).lastHatGain = gain; // @direct-mutation

    source.connect(bpFilter);
    bpFilter.connect(hpFilter);
    hpFilter.connect(gain);
    gain.connect(panner);

    // Sizzle: thin 2–4 kHz presence layer under the bright buffer. S7 — a
    // `bright` colored-noise buffer read at a random per-hit offset, so the
    // sizzle is fine/airy and varies hit-to-hit instead of a flat static slice.
    playPercussiveStrike(audio, getColoredNoiseBuffer(audio, groove), panner, playTime, {
        volume: vol * 0.12,
        filterType: 'bandpass',
        freq: 3200 + Math.random() * 400,
        Q: 1.2,
        attack: 0.001,
        decay: 0.04,
        duration: 0.06,
        bufferOffset: noiseOffset(),
    });

    source.start(playTime);
    // why: stop at +0.45 s — long after the buffer's ≈0.22 s natural ring has
    // died. The buffer *content* (not the gain envelope) is silent by then, so
    // the stop produces no click regardless of the long gain time-constant.
    source.stop(playTime + 0.45);

    source.onended = () => {
        if (groove.lastHatGain === gain) {
            (groove as Mutable<typeof groove>).lastHatGain = null; // @direct-mutation
        }
        safeDisconnect([source, bpFilter, hpFilter, gain, panner]);
    };
}

/**
 * Fully-open hi-hat — synth-audit Epic 4 S3.
 *
 * Sounds the `openHatMetal` buffer (which rings ≈1 s naturally) with the gain
 * envelope letting that ring run. The band only ever plays the fully-open hat,
 * so the constants below are the old openness continuum evaluated at its top
 * (`openness` = 1): a quarter- or half-open hat is the same buffer choked
 * shorter, with a steeper (`openness²`) decay and a darker band/highpass.
 * Like the closed hat this carries no `velJitter` — the old scheduler's
 * seeded humanizing already humanized `velocity`.
 *
 * NOTE: the decay/stop/brightness constants are by-ear starting points; expect
 * to retune them at the listening gate.
 */
function playOpenHat(state: EnsembleState, time: number, velocity: number, layers: number): void {
    const { groove } = state;
    const ctx = setupCymbalHit(state, time, velocity, 'Open');
    if (!ctx) {
        return;
    }
    const { audio, playTime, hitVelocity, masterVol, panner, voiceConfig } = ctx;

    const rr = (amt = 0.03) => 1 + (Math.random() - 0.5) * amt;
    const vel = clamp01(Math.max(0.3, hitVelocity));

    // --- The fully open hat ---------------------------------------------------
    // Each constant is the openness continuum at `open` = 1 (fully open). `decayTc`
    // (the gain `setTargetAtTime` time-constant) lets the long-ringing `openHatMetal`
    // buffer ring. A harder hit reads a touch tighter, as a real hat does.
    // `brightness` is the filters' openness term.
    const decayTc = (0.045 + 0.5) * (1 - Math.max(0, vel - 0.7) * 0.18);
    const decayDelay = 0.014; // fixed short hold — no jitter
    // why: source must outlive the audible ring. The stop (3.2 s) lands past the
    // openHatMetal buffer's own 3.0 s duration, where the source already outputs
    // pure zero — no click.
    const stopTime = 0.4 + 2.8;
    const brightness = 0.82 + 0.18;

    const hatArticulation = 0.985 + Math.random() * 0.04;
    const vol =
        masterVol *
        voiceConfig.volumeScale *
        getCymbalMixScale(state, 'Open', layers) *
        // a fully-open hat is the loudest of the family
        (0.86 + 0.16) *
        rr();

    // Choke the previous hat — an open hat ringing into a following closed or
    // pedal hat must duck out cleanly (the foot-close gesture).
    if (groove.lastHatGain) {
        rampGain(groove.lastHatGain.gain, 0, playTime, 0.012);
    }

    const source = audio.createBufferSource();
    // Epic 4 S4 — variation pool: fast runs vary stick-to-stick.
    source.buffer = getVariedCymbalBuffer(audio, groove, 'Open');
    source.playbackRate.value =
        voiceConfig.playbackRate * hatArticulation * rr(voiceConfig.playbackVariance);

    const bpFilter = audio.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.frequency.setValueAtTime(voiceConfig.bandpassFreq * brightness * 1.08, playTime);
    bpFilter.frequency.setTargetAtTime(
        voiceConfig.bandpassFreq * brightness,
        playTime + 0.01,
        0.05,
    );
    bpFilter.Q.value = voiceConfig.q * (0.9 + Math.random() * 0.2);

    const hpFilter = audio.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.setValueAtTime(voiceConfig.highpassFreq * (0.9 + 0.1), playTime);

    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, playTime);
    gain.gain.setTargetAtTime(vol, playTime, voiceConfig.attack);
    gain.gain.setTargetAtTime(0, playTime + decayDelay, decayTc);
    (groove as Mutable<typeof groove>).lastHatGain = gain; // @direct-mutation

    source.connect(bpFilter);
    bpFilter.connect(hpFilter);
    hpFilter.connect(gain);
    gain.connect(panner);

    source.start(playTime);
    // stop past the audible ring — see the `stopTime` derivation above.
    source.stop(playTime + stopTime);

    source.onended = () => {
        if (groove.lastHatGain === gain) {
            (groove as Mutable<typeof groove>).lastHatGain = null; // @direct-mutation
        }
        safeDisconnect([source, bpFilter, hpFilter, gain, panner]);
    };
}

/**
 * Foot-pedal "chick" — synth-audit Epic 4 S3.
 *
 * A closed hi-hat sounded by the foot pedal rather than the stick: the two
 * cymbals snap together. Versus a stick-closed hat it is darker (little stick
 * attack or top sizzle), softer, and shorter — a "chk" rather than a "tick".
 * Idiomatically it lands on the off-beats (the jazz 2-and-4 pedal). It sounds
 * the same `hihatMetal` buffer as the closed hat, but with a slightly slower
 * attack (the cymbals *meet*, they are not struck), a darker bandpass, a fast
 * decay, and no sizzle layer.
 */
function playPedalChick(
    state: EnsembleState,
    time: number,
    velocity: number,
    layers: number,
): void {
    const { groove } = state;
    const ctx = setupCymbalHit(state, time, velocity, 'HiHat');
    if (!ctx) {
        return;
    }
    const { audio, playTime, masterVol, panner, voiceConfig } = ctx;

    const rr = (amt = 0.03) => 1 + (Math.random() - 0.5) * amt;

    // A pedal chick is quieter and darker than a struck closed hat.
    const vol =
        masterVol *
        voiceConfig.volumeScale *
        getCymbalMixScale(state, 'HiHat', layers) *
        0.55 *
        rr();

    if (groove.lastHatGain) {
        rampGain(groove.lastHatGain.gain, 0, playTime, 0.006);
    }

    const source = audio.createBufferSource();
    // Epic 4 S4 — variation pool shared with the closed hat (same HiHat family).
    source.buffer = getVariedCymbalBuffer(audio, groove, 'HiHat');
    source.playbackRate.value =
        voiceConfig.playbackRate * (0.95 + Math.random() * 0.03) * rr(voiceConfig.playbackVariance);

    const bpFilter = audio.createBiquadFilter();
    bpFilter.type = 'bandpass';
    // why: dark and rounded — the pedal close has little top sizzle. A lower
    // centre (0.6×) pulls the metallic edge down, and a low Q (0.85×, below the
    // stick hat's) widens the band so it reads as a soft "chk" rather than the
    // peaky, resonant "tss" scratch a tight high-Q band gives on this buffer.
    bpFilter.frequency.setValueAtTime(voiceConfig.bandpassFreq * 0.6, playTime);
    bpFilter.Q.value = voiceConfig.q * 0.85;

    const hpFilter = audio.createBiquadFilter();
    hpFilter.type = 'highpass';
    // lower highpass than the stick hat — keep more warm low-mid body
    hpFilter.frequency.setValueAtTime(voiceConfig.highpassFreq * 0.62, playTime);

    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, playTime);
    // why: soft attack — the cymbals *meet*, they are not struck. Slow enough
    // (7 ms) to round off the buffer's 8 ms transient burst, which is what
    // otherwise reads as a scratchy onset.
    gain.gain.setTargetAtTime(vol, playTime, 0.007);
    // fast decay — a chick is short
    gain.gain.setTargetAtTime(0, playTime + 0.01, 0.035);
    (groove as Mutable<typeof groove>).lastHatGain = gain; // @direct-mutation

    source.connect(bpFilter);
    bpFilter.connect(hpFilter);
    hpFilter.connect(gain);
    gain.connect(panner);

    source.start(playTime);
    // why: stop at +0.2 s — both the hihatMetal buffer content and the fast
    // gain envelope are silent well before then, so the stop produces no click.
    source.stop(playTime + 0.2);

    source.onended = () => {
        if (groove.lastHatGain === gain) {
            (groove as Mutable<typeof groove>).lastHatGain = null; // @direct-mutation
        }
        safeDisconnect([source, bpFilter, hpFilter, gain, panner]);
    };
}

/**
 * Ride cymbal — synth-audit Epic 4 S5 ("ride ping on every hit").
 *
 * The ride before S5 fired its stick "ping" (the triangle-osc attack transient)
 * only above `velocity > 0.92` — every softer ride hit is pure metallic wash
 * with no stick definition, so a quiet ride pattern reads as indistinct hiss.
 *
 * This voice drops the velocity gate: the ping fires on EVERY hit, with its
 * volume scaled continuously from velocity. The scale curve *rises* as the hit
 * gets softer (`pingScale` 1.0 hard → 1.7 soft) on purpose — a light ride tap
 * is physically predominantly the stick attack, with the bow wash blooming
 * only when struck harder, so boosting the ping on soft hits is what gives a
 * quiet ride its definition rather than just making it uniformly louder.
 *
 * Otherwise this is the earlier ride: the `rideMetal` buffer (now drawn from
 * the Epic 4 S4 variation pool, which honors S4's "fast ride patterns" clause),
 * the same bandpass/highpass chain, gain envelope and `lastRideGain` choke. Per the
 * epic note this voice carries no un-seeded `velJitter` — the old scheduler's seeded
 * humanizing already humanized `velocity`.
 *
 * NOTE: `pingScale`'s curve constants are by-ear starting points; expect to
 * retune them at the listening gate.
 */
function playRide(state: EnsembleState, time: number, velocity: number, layers: number): void {
    const { groove } = state;
    const ctx = setupCymbalHit(state, time, velocity, 'Ride');
    if (!ctx) {
        return;
    }
    const { audio, playTime, hitVelocity, masterVol, panner, voiceConfig } = ctx;

    const rr = (amt = 0.03) => 1 + (Math.random() - 0.5) * amt;
    const vol =
        masterVol * voiceConfig.volumeScale * getCymbalMixScale(state, 'Ride', layers) * rr();

    // Choke any prior ride tail so successive rides don't pile up.
    if (groove.lastRideGain) {
        rampGain(groove.lastRideGain.gain, 0, playTime, 0.05);
    }

    const source = audio.createBufferSource();
    // Epic 4 S4 variation pool — fast ride patterns vary stick-to-stick.
    source.buffer = getVariedCymbalBuffer(audio, groove, 'Ride');
    source.playbackRate.value = voiceConfig.playbackRate * rr(voiceConfig.playbackVariance);

    const bpFilter = audio.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.frequency.setValueAtTime(voiceConfig.bandpassFreq * 1.14, playTime);
    bpFilter.frequency.setTargetAtTime(voiceConfig.bandpassFreq * 0.96, playTime + 0.008, 0.08);
    bpFilter.Q.value = voiceConfig.q;

    const hpFilter = audio.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.setValueAtTime(voiceConfig.highpassFreq * 1.1, playTime);
    hpFilter.frequency.setTargetAtTime(voiceConfig.highpassFreq * 0.95, playTime + 0.008, 0.1);

    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, playTime);
    gain.gain.setTargetAtTime(vol, playTime, voiceConfig.attack);
    gain.gain.setTargetAtTime(0, playTime + voiceConfig.decayDelay, voiceConfig.decayTime);
    (groove as Mutable<typeof groove>).lastRideGain = gain; // @direct-mutation

    source.connect(bpFilter);
    bpFilter.connect(hpFilter);
    hpFilter.connect(gain);
    gain.connect(panner);

    // --- The un-gated ping --------------------------------------------------
    // Every ride hit gets a stick "ping" — no `velocity > 0.92` gate. `pingScale`
    // rises as the hit softens so a quiet ride keeps stick definition instead of
    // collapsing to pure wash (see the doc comment).
    if (voiceConfig.pingFreq && voiceConfig.pingVolume) {
        const velNorm = clamp01((hitVelocity - 0.3) / 0.7);
        const pingScale = 1.0 + (1 - velNorm) * 0.7;
        playResonantTone(audio, panner, playTime, {
            type: 'triangle',
            freqStart: voiceConfig.pingFreq * rr(0.02),
            freqEnd: voiceConfig.pingFreq * 0.84,
            rampDuration: 0.01,
            volume: vol * voiceConfig.pingVolume * pingScale,
            attack: 0.0008,
            decay: 0.01,
            duration: 0.08,
        });
    }

    source.start(playTime);
    source.stop(playTime + voiceConfig.stopTime);

    source.onended = () => {
        if (groove.lastRideGain === gain) {
            (groove as Mutable<typeof groove>).lastRideGain = null; // @direct-mutation
        }
        safeDisconnect([source, bpFilter, hpFilter, gain, panner]);
    };
}

function playKickSnareCrashTom(
    state: EnsembleState,
    name: string,
    time: number,
    velocity: number,
    layers: number,
): void {
    const { playback, groove } = state;
    if (!name || !playback.audio) {
        return;
    }
    // why: surface engine typos / stub soundNames as a one-shot warning instead of silent
    // audio dropouts.
    maybeWarnUnknownSound(name);
    const now = playback.audio.currentTime;

    // Add a tiny 2ms buffer to ensure scheduling always happens slightly in the future
    const playTime = Math.max(time, now + 0.002);

    // --- Density Normalization Logic --- (on the hit's own time: see `setupPercussiveHit`)
    const densityDuck = updateDensityDucking(mixStateFor(playback.audio), playTime);

    // #1068: the un-seeded `velJitter = 1 + (Math.random() - 0.5) * humanize * 0.4`
    // that used to sit here is gone. It was the largest humanize term in the
    // engine (±20% at knob 100 — 2.5× the seeded scheduler path that three
    // separate comments in this file already claimed had replaced it), it made
    // every drum hit irreproducible, and it survived `humanize: 0` only by
    // accident of multiplying to zero. Velocity humanization for the kit is seeded
    // upstream, in the band's feel pass (`band/feel/feel.ts`), so it reaches the
    // `.mid` export too.
    // Apply the density ducking factor to the master drum volume
    const masterVol = velocity * 1.3 * densityDuck;

    // --- Mix Separation: Stereo Panning ---
    let panValue = 0;
    if (RIGHT_PANNED_INSTRUMENTS.has(name)) {
        panValue = 0.35;
    } else if (name === 'Snare' || name === 'Sidestick') {
        // why: widened from -0.1 to -0.2 in Epic 7 S1 to better balance the +0.35
        // hi-hat mass on the right.
        panValue = -0.2;
    } else if (name.includes('Tom')) {
        panValue = (Math.random() * 2 - 1) * 0.25;
    }
    // why (Epic 7 S1, tried-and-reverted): kicked around a ±0.10 per-hit
    // Math.random() jitter on the kick to give the drums stem some side
    // energy. It worked numerically but consumed an extra random draw per
    // kick, shifting all the downstream Math.random consumers (hi-hat
    // velocity jitter) out of step — which halved the hi-hat's air-band
    // content. PRNG stream coupling, captured in repo memory. Kick stays
    // at 0; a deterministic per-kick offset (hash of step index) would get
    // the side energy without the stream coupling — follow-up story.
    const panner = createSimplePanner(playback.audio, panValue, playTime);
    if (playback.audioGraph) {
        panner.connect(playback.audioGraph.drums.gain);
    }
    // why: this per-hit panner must be disconnected once the hit fully decays, or it
    // leaks one StereoPannerNode per drum hit — dozens/second at tempo (synth-audit
    // Epic 4 S1). The crash branch already frees it via its own
    // buffer-source `onended`; the helper-only branches below hand `onEnded` to their
    // longest-lived (or tied-longest) `playResonantTone`/`playPercussiveStrike` call.
    // When tied, sibling layers stop at the same instant and are already silent, so
    // freeing the panner microseconds early is inaudible and leaks nothing (each
    // sibling still disconnects its own chain via its own `onended`).
    const releasePanner = () => safeDisconnect([panner]);

    // Round-robin variation (±1.5%)
    const rr = (amt = 0.03) => 1 + (Math.random() - 0.5) * amt;

    if (name === 'Kick') {
        const voiceConfig = getKickVoiceConfig(velocity, playback.bandIntensity || 0.5);
        const vol = masterVol * getRhythmBodyMixScale(state, 'Kick') * rr();

        // --- Sidechain Trigger ---
        if (playback.audioGraph?.bass.sidechain) {
            duckGain(playback.audioGraph.bass.sidechain.gain, 0.45, playTime);
        }

        // 1. Beater Snap: Higher velocity = Sharper snap
        const beater = playback.audio.createOscillator();
        const beaterGain = playback.audio.createGain();
        beaterGain.gain.setValueAtTime(0, playTime);
        beater.type = 'sine';
        const snapFreq = voiceConfig.beaterFreq * rr();
        beater.frequency.setValueAtTime(snapFreq, playTime);
        beater.frequency.exponentialRampToValueAtTime(voiceConfig.beaterEndFreq, playTime + 0.006);
        beaterGain.gain.setTargetAtTime(vol * voiceConfig.beaterVolume, playTime, 0.001);
        beaterGain.gain.setTargetAtTime(0, playTime + 0.004, voiceConfig.beaterDecay);

        // 2. Head "Skin": Higher velocity = More high-frequency noise
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * voiceConfig.skinVolume,
            filterType: 'bandpass',
            freq: voiceConfig.skinFreq * rr(0.02),
            Q: 0.9,
            attack: 0.0015,
            decay: 0.012,
            duration: 0.12,
        });

        // 3. The "Knock": Fundamental impact
        playResonantTone(playback.audio, panner, playTime, {
            type: 'triangle',
            freqStart: voiceConfig.knockStartFreq * rr(0.01),
            freqEnd: voiceConfig.knockEndFreq,
            rampDuration: 0.02,
            volume: vol * voiceConfig.knockVolume,
            attack: 0.001,
            decay: voiceConfig.knockDecay,
            duration: 0.24,
        });

        // 4. The "Shell": Deep resonance — longest-lived Kick layer, so it owns panner release.
        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: voiceConfig.shellFreq * rr(0.01),
            freqEnd: voiceConfig.shellFreq * rr(0.006),
            volume: vol * voiceConfig.shellVolume,
            attack: 0.003,
            decay: voiceConfig.shellDecay,
            duration: voiceConfig.shellDuration,
            onEnded: releasePanner,
        });

        // 5. Click: 2–4kHz presence peak that cuts through on small speakers/earbuds
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * 0.25,
            filterType: 'bandpass',
            freq: 2500 + velocity * 800,
            Q: 4,
            attack: 0.0003,
            decay: 0.008,
            duration: 0.05,
        });

        // Connections
        beater.connect(beaterGain);
        beaterGain.connect(panner);

        beater.start(playTime);
        beater.stop(playTime + 0.1);

        beater.onended = () => safeDisconnect([beater, beaterGain]);
    } else if (name === 'Snare' || name === 'Sidestick') {
        const isSidestick = name === 'Sidestick';
        const vol =
            masterVol * getSnareMixScale(state, velocity) * rr() * (isSidestick ? 0.8 : 1.0);

        if (isSidestick) {
            playResonantTone(playback.audio, panner, playTime, {
                type: 'sine',
                freqStart: 6500 * rr(),
                volume: vol * 0.4,
                attack: 0.001,
                decay: 0.005,
                duration: 0.1,
            });

            playResonantTone(playback.audio, panner, playTime, {
                type: 'triangle',
                freqStart: 330 * rr(),
                freqEnd: 330 * rr() * 0.9,
                rampDuration: 0.1,
                volume: vol * 0.8,
                attack: 0.002,
                decay: 0.04,
                duration: 0.5,
            });

            playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
                volume: vol * 0.35,
                filterType: 'highpass',
                freq: 3500,
                attack: 0.002,
                decay: 0.02,
                duration: 0.5,
                onEnded: releasePanner,
            });

            return;
        }
        const voiceConfig = getSnareVoiceConfig(velocity);

        playResonantTone(playback.audio, panner, playTime, {
            type: 'triangle',
            freqStart: voiceConfig.lowBodyFreq * rr(0.015),
            freqEnd: voiceConfig.lowBodyFreq * 0.9,
            rampDuration: 0.05,
            volume: vol * voiceConfig.lowBodyVolume,
            attack: 0.001,
            decay: voiceConfig.bodyDecay,
            duration: 0.45,
        });

        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: voiceConfig.highBodyFreq * rr(0.015),
            freqEnd: voiceConfig.highBodyFreq * 0.88,
            rampDuration: 0.04,
            volume: vol * voiceConfig.highBodyVolume,
            attack: 0.001,
            decay: voiceConfig.bodyDecay * 0.9,
            duration: 0.4,
        });

        if (voiceConfig.crackVolume > 0.03) {
            playResonantTone(playback.audio, panner, playTime, {
                type: 'triangle',
                freqStart: voiceConfig.crackFreq * rr(0.02),
                freqEnd: voiceConfig.crackEndFreq,
                rampDuration: 0.015,
                volume: vol * voiceConfig.crackVolume,
                attack: 0.0008,
                decay: voiceConfig.crackDecay,
                duration: 0.12,
            });
        }

        // wires are the longest-lived Snare layer (wiresDuration ~0.16-0.46s) — own panner release.
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * voiceConfig.wiresVolume,
            filterType: 'bandpass',
            freq: voiceConfig.wiresFreq * rr(0.02),
            Q: voiceConfig.wiresQ,
            attack: 0.0008,
            decay: voiceConfig.wiresDecay,
            duration: voiceConfig.wiresDuration,
            onEnded: releasePanner,
        });
    } else if (name === 'Crash') {
        const cymbalName: CymbalName = name;
        const voiceConfig = getCymbalVoiceConfig(
            cymbalName,
            velocity,
            playback.bandIntensity || 0.5,
        );
        if (!voiceConfig) {
            safeDisconnect([panner]);
            return;
        }
        const vol =
            masterVol *
            voiceConfig.volumeScale *
            getCymbalMixScale(state, cymbalName, layers) *
            rr();

        if (groove.lastHatGain) {
            rampGain(groove.lastHatGain.gain, 0, playTime, 0.04);
            (groove as Mutable<typeof groove>).lastHatGain = null; // @direct-mutation
        }
        if (groove.lastRideGain) {
            rampGain(groove.lastRideGain.gain, 0, playTime, 0.12);
            (groove as Mutable<typeof groove>).lastRideGain = null; // @direct-mutation
        }
        if (groove.lastCrashGain) {
            rampGain(groove.lastCrashGain.gain, 0, playTime, 0.18);
        }

        const source = playback.audio.createBufferSource();
        source.buffer =
            getCymbalBuffer(groove, cymbalName) ||
            ensureCymbalBuffer(playback.audio, groove, cymbalName);
        source.playbackRate.value = voiceConfig.playbackRate * rr(voiceConfig.playbackVariance);

        const bpFilter = playback.audio.createBiquadFilter();
        bpFilter.type = 'bandpass';
        bpFilter.frequency.setValueAtTime(voiceConfig.bandpassFreq * 1.12, playTime);
        bpFilter.frequency.setTargetAtTime(voiceConfig.bandpassFreq * 0.96, playTime + 0.01, 0.12);
        bpFilter.Q.value = voiceConfig.q;

        const hpFilter = playback.audio.createBiquadFilter();
        hpFilter.type = 'highpass';
        hpFilter.frequency.setValueAtTime(voiceConfig.highpassFreq * 1.08, playTime);
        hpFilter.frequency.setTargetAtTime(voiceConfig.highpassFreq * 0.94, playTime + 0.012, 0.16);

        const gain = playback.audio.createGain();
        gain.gain.setValueAtTime(0, playTime);
        gain.gain.linearRampToValueAtTime(vol, playTime + voiceConfig.attack);
        // Slightly higher sustain floor (0.42 vs old 0.35) gives the crash body room to bloom
        // before the long tail takes over. tc 0.06 keeps the transient crisp.
        gain.gain.setTargetAtTime(vol * 0.42, playTime + 0.015, 0.06);
        gain.gain.setTargetAtTime(0, playTime + voiceConfig.decayDelay, voiceConfig.decayTime);
        (groove as Mutable<typeof groove>).lastCrashGain = gain; // @direct-mutation

        source.connect(bpFilter);
        bpFilter.connect(hpFilter);
        hpFilter.connect(gain);
        gain.connect(panner);

        source.start(playTime);
        source.stop(playTime + voiceConfig.stopTime);

        source.onended = () => {
            if (groove.lastCrashGain === gain) {
                (groove as Mutable<typeof groove>).lastCrashGain = null; // @direct-mutation
            }
            safeDisconnect([source, bpFilter, hpFilter, gain, panner]);
        };
    } else if (name.includes('Tom')) {
        // #730: tune the synth tom kit to the selected key so fills reinforce the
        // bass register harmonically instead of beating against it. Reads the live
        // key at play time (main-thread synth voice), so nothing has to sync it.
        const voiceConfig = getTomVoiceConfig(
            name,
            velocity,
            getTomKeyTuneSemitones(state.arranger?.key),
        );
        const vol = masterVol * 0.8 * getRhythmBodyMixScale(state, name) * rr();

        // 1. Stick Impact (The "Thwack")
        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: voiceConfig.stickFreqStart * rr(0.015),
            freqEnd: voiceConfig.stickFreqEnd,
            rampDuration: 0.015,
            volume: vol * voiceConfig.stickVolume,
            attack: 0.001,
            decay: 0.009,
            duration: 0.1,
        });

        // 2. Head "Skin" Noise
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * voiceConfig.skinVolume,
            filterType: 'bandpass',
            freq: voiceConfig.skinFreq,
            Q: voiceConfig.skinQ,
            attack: 0.002,
            decay: 0.02,
            duration: 0.2,
        });

        // 3. Resonant Body
        playResonantTone(playback.audio, panner, playTime, {
            type: 'triangle',
            freqStart: voiceConfig.bodyFreqStart * rr(0.01),
            freqEnd: voiceConfig.bodyFreqEnd,
            rampDuration: 0.05,
            volume: vol * voiceConfig.bodyVolume,
            attack: 0.002,
            decay: voiceConfig.bodyDecay,
            duration: voiceConfig.bodyDuration,
        });

        // 4. Shell Resonance — longest-lived Tom layer (shellDuration ~0.9-1.4s), owns panner release.
        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: voiceConfig.shellFreq * rr(0.01),
            volume: vol * voiceConfig.shellVolume,
            attack: voiceConfig.shellAttack,
            decay: voiceConfig.shellDecay * rr(),
            duration: voiceConfig.shellDuration,
            onEnded: releasePanner,
        });
    } else {
        // No branch matched (unknown `name` — already surfaced by maybeWarnUnknownSound).
        // Nothing feeds the panner, so free it immediately rather than leaking it.
        releasePanner();
    }
}

/** A metallic buffer part-way through its render, resumable where it stopped. */
interface MetallicRender {
    buffer: AudioBuffer;
    /** Render on until `deadline` (a `performance.now()` time) or the end; true once complete. */
    render(deadline: number): boolean;
}

/**
 * `createMetallicBuffer`'s render, one resumable pass: the same draws in the same order, so a
 * buffer rendered in slices is the buffer rendered at once. It checks the clock every
 * `METALLIC_SLICE_SAMPLES` samples rather than every sample.
 */
function startMetallicBuffer(audioCtx: AudioContext, profile: CymbalBufferProfile): MetallicRender {
    const sampleRate = audioCtx.sampleRate;
    const requestedLength = Math.max(1, Math.floor(sampleRate * profile.duration));
    const buffer = audioCtx.createBuffer(1, requestedLength, sampleRate);
    const data = buffer.getChannelData(0);
    const phases = profile.partials.map((_, index) => Math.random() * TAU + index * 0.73);
    const detunes = profile.partials.map(() => 1 + (Math.random() - 0.5) * profile.jitter);
    const partialWeights = profile.partials.map(() => 0.7 + Math.random() * 0.45);
    const transientSamples = Math.max(1, Math.floor(sampleRate * 0.008));
    let smoothed = 0;
    let i = 0;

    return {
        buffer,
        render(deadline: number): boolean {
            while (i < data.length) {
                const end = Math.min(data.length, i + METALLIC_SLICE_SAMPLES);
                for (; i < end; i++) {
                    const t = i / sampleRate;
                    let metallic = 0;

                    for (let p = 0; p < profile.partials.length; p++) {
                        const partialEnv = Math.exp(
                            -t * (profile.partialDecay + p * profile.partialSpread),
                        );
                        metallic +=
                            (Math.sin(
                                TAU * profile.baseFreq * profile.partials[p] * detunes[p] * t +
                                    phases[p],
                            ) *
                                partialWeights[p] *
                                partialEnv) /
                            (1 + p * 0.26);
                    }

                    const noiseEnv = Math.exp(-t * profile.noiseDecay);
                    const noise = (Math.random() * 2 - 1) * profile.noiseMix * noiseEnv;
                    const transient =
                        i < transientSamples
                            ? (1 - i / transientSamples) *
                              profile.transientMix *
                              (Math.random() * 2 - 1)
                            : 0;
                    const raw =
                        (metallic / profile.partials.length) * profile.metalMix + noise + transient;
                    smoothed = smoothed * profile.smooth + raw * (1 - profile.smooth);
                    data[i] = Math.tanh(smoothed * profile.saturation);
                }
                if (i < data.length && performance.now() >= deadline) {
                    return false;
                }
            }
            return true;
        },
    };
}

// About 21 ms of audio at 48 kHz: well under a millisecond of work between clock reads.
const METALLIC_SLICE_SAMPLES = 1024;

function createMetallicBuffer(audioCtx: AudioContext, profile: CymbalBufferProfile): AudioBuffer {
    const render = startMetallicBuffer(audioCtx, profile);
    render.render(Number.POSITIVE_INFINITY);
    return render.buffer;
}

/**
 * Renders `warmDrumBuffers` has started, by the `audioBuffers` key each will land under (a
 * cymbal's own key, or its `#pool` key for the pool's next member). Keyed by the cache they fill,
 * so they live and die with it.
 */
const warming = new WeakMap<object, Map<string, MetallicRender>>();

function warmingFor(groove: GrooveState): Map<string, MetallicRender> {
    let pending = warming.get(groove.audioBuffers);
    if (!pending) {
        pending = new Map();
        warming.set(groove.audioBuffers, pending);
    }
    return pending;
}

/** A hit that needs a buffer the warm-up has started finishes it rather than starting over. */
function finishWarming(groove: GrooveState, key: string): AudioBuffer | null {
    const pending = warmingFor(groove);
    const render = pending.get(key);
    if (!render) {
        return null;
    }
    render.render(Number.POSITIVE_INFINITY);
    pending.delete(key);
    return render.buffer;
}

/**
 * The metallic buffers the synth kit renders on a cymbal's first hits, most urgent first. The
 * crash is 9 s of additive synthesis, and its first hit is usually a section arrival or the
 * wrap into the next lap — the moment the chart most needs painting (#1240). The pooled cymbals
 * fill on their first four hits each.
 */
const WARM_ORDER: ReadonlyArray<readonly [CymbalName, 'single' | 'pool']> = [
    ['Crash', 'single'],
    ['Ride', 'pool'],
    ['HiHat', 'pool'],
    ['Open', 'pool'],
];

/**
 * Render the synth kit's cymbal buffers ahead of their first hits, until `deadline` (a
 * `performance.now()` time), so no hit renders one on the main thread mid-performance. Returns
 * true once every buffer is in place; call again with a fresh deadline until it does. A render
 * left part-way is finished by the hit that needs it. A sampled kit plays its own hats and ride,
 * so only the crash is warmed for it. Nothing to do before audio is up.
 */
export function warmDrumBuffers(state: EnsembleState, deadline: number): boolean {
    const audio = state.playback.audio;
    const { groove } = state;
    if (!audio) {
        return true;
    }
    const sampled = resolveInstrumentSource(groove.voice).kind === 'sample';
    const pending = warmingFor(groove);
    for (const [name, kind] of WARM_ORDER) {
        if (sampled && kind === 'pool') {
            continue;
        }
        const profile = CYMBAL_BUFFER_PROFILES[name];
        const key = kind === 'single' ? profile.key : `${profile.key}#pool`;
        const missing = () =>
            kind === 'single'
                ? !groove.audioBuffers[key]
                : (groove.audioBuffers[key]?.length ?? 0) < CYMBAL_POOL_SIZE;
        while (missing()) {
            let render = pending.get(key);
            if (!render) {
                render = startMetallicBuffer(audio, profile);
                pending.set(key, render);
            }
            if (!render.render(deadline)) {
                return false;
            }
            pending.delete(key);
            if (kind === 'single') {
                groove.audioBuffers[key] = render.buffer;
            } else {
                groove.audioBuffers[key] ??= [];
                groove.audioBuffers[key].push(render.buffer);
            }
        }
    }
    return true;
}
