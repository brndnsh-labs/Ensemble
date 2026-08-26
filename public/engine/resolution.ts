import { KEY_ORDER } from '../config.js';
import type { ArrangerState } from '../state/arranger.js';
import type { EnsembleState } from '../types.js';
import { getFrequency, normalizeKey } from '../utils.js';
import { getBestInversion, getIntervals } from './chords-engine.js';

/**
 * PUBLIC/RESOLUTION.JS
 *
 * Generates the musical events for the final resolution of a song.
 * Optimized for clean "Final Button" landings on the Tonic.
 */

const RESOLUTION_NORMALIZER = 0.85; // Global tamer to prevent limiter crushing
const RESOLUTION_STAGGER = 0.015; // Max jitter in seconds for sample-accurate peak reduction

interface CadenceStep {
    label: string;
    degree: number;
    quality: string;
    beats: number;
    baseVelocity: number;
}

interface GenreConfig {
    profile: string;
    ritardando: number;
}

const CADENCE_PROFILES: Record<string, CadenceStep[]> = {
    // Single tonic landing, kept in the same lane as the band.
    BUTTON: [{ label: 'I', degree: 0, quality: 'major', beats: 4, baseVelocity: 0.8 }],

    // Standard V -> I resolution with a blended tonic landing.
    STANDARD_V_I: [
        { label: 'V', degree: 7, quality: 'major', beats: 2, baseVelocity: 0.75 },
        { label: 'I', degree: 0, quality: 'major', beats: 4, baseVelocity: 0.74 },
    ],

    // Jazz ii -> V -> I (Condensed) with a softer tonic arrival.
    JAZZ_V_I: [
        { label: 'V7', degree: 7, quality: '13', beats: 2, baseVelocity: 0.7 },
        { label: 'I6/9', degree: 0, quality: '6', beats: 4, baseVelocity: 0.68 },
    ],
};

// why: keyed by `groove.genreFeel`, not the picker name — see the
// GENRE-NAMING AUTHORITY block in data/smart-genres.ts. Epic 2 S3 fixed three
// dead/missing keys:
//   - Bossa: rekeyed to its feel (the picker-name key never matched, so bossa
//     charts got the Rock button instead of their jazz ritardando).
//   - Ska-Punk: rekeyed to its feel; punk-ska ends hard, so the BUTTON value is
//     unchanged — the rekey just makes it reachable/explicit.
//   - Added 'Hip Hop' and 'Country' (both were absent → Rock button fallback).
//     Hip Hop keeps a hard BUTTON cut: it's metronomic loop music, a ritardando
//     (tempo slow-down) would read as wrong. Country resolves with a clear V-I
//     authentic cadence and a gentle slow-down — matched to Blues' 0.8 (its
//     roots-Americana neighbor), not Acoustic's balladic 1.5.
const GENRE_MAP: Record<string, GenreConfig> = {
    Jazz: { profile: 'JAZZ_V_I', ritardando: 1.2 },
    'Bossa Nova': { profile: 'JAZZ_V_I', ritardando: 1.0 },
    'Neo-Soul': { profile: 'JAZZ_V_I', ritardando: 1.5 },
    Blues: { profile: 'STANDARD_V_I', ritardando: 0.8 },
    Country: { profile: 'STANDARD_V_I', ritardando: 0.8 },
    Rock: { profile: 'BUTTON', ritardando: 0.0 },
    Metal: { profile: 'BUTTON', ritardando: 0.0 },
    Ska: { profile: 'BUTTON', ritardando: 0.0 },
    Disco: { profile: 'BUTTON', ritardando: 0.0 },
    Funk: { profile: 'BUTTON', ritardando: 0.0 },
    'Hip Hop': { profile: 'BUTTON', ritardando: 0.0 },
    Acoustic: { profile: 'STANDARD_V_I', ritardando: 1.5 },
    Reggae: { profile: 'BUTTON', ritardando: 0.0 },
};

// --- #830: infer the tune's TRUE tonal center from the progression's cadence ----
// The cadence engine used to land on the NOTATED key's degree-0 (`arranger.key` +
// `isMinor`), which is wrong whenever a chart is written relative to one tonic but
// cadences to another — the relative-minor case (Autumn Leaves is notated in the
// relative major, `isMinor:false`, but resolves home to vi) and modal charts. The
// fix reads `arranger.progression` — a flat array of already-parsed chords each
// carrying an ABSOLUTE `rootMidi` and a canonical `quality` (chords-engine.ts) — so
// keyShift and relative-minor notation are already resolved for us. It works
// identically for presets and arbitrary user-typed charts.

// Canonical dominant-seventh qualities our parser emits (major-3rd + ♭7). A chord of
// one of these FUNCTIONS as a dominant — its presence a P5 above a chord is the
// evidence that that chord is a tonicized arrival (`aug` also covers aug7 / 7#5,
// which collapse to quality 'aug' with is7th — a dominant ♯5, e.g. Autumn Leaves' III7+).
const DOMINANT_QUALITIES = new Set([
    '7',
    '9',
    '11',
    '13',
    '7alt',
    '7b13',
    '7#11',
    '7b9',
    '7#9',
    '7sus4',
]);
// Minor-family qualities → the landing tonic is voiced minor.
// (the parser collapses m7 → 'minor', so 'm7' is intentionally absent.)
const MINOR_QUALITIES = new Set(['minor', 'm6', 'm9', 'm11', 'm13', 'halfdim', 'dim']);

function isDominantChord(c: any): boolean {
    return DOMINANT_QUALITIES.has(c.quality) || (c.quality === 'aug' && c.is7th === true);
}

/**
 * Resolve where the ending cadence should land, as `{ keyIndex, isMinor }`, from the
 * progression's own cadence — feeding the ENTIRE gesture below (anchor register, the
 * V→I degrees, the tonic landing, and the soloist's landing PC + 3-2-1 pickup mode).
 *
 * A chord is treated as the true tonic if EITHER:
 *   (a) its root already IS the local key tonic (blues I7, All Blues G7, every
 *       Imaj7/i ending) — mode taken from the final chord's own quality; OR
 *   (b) it is a tonicized ARRIVAL: preceded by its own dominant a P5 above it,
 *       scanning back past REPEATS of the final chord (guard 2 — Autumn Leaves ends
 *       `…III7+ | vi7 | vi7`, so the duplicate vi7 must be skipped to see III7+),
 *       and the approach must be dominant-QUALITY (guard 1 — a plain I a P5 above IV
 *       must NOT read as a cadence, so a plagal IV ending keeps landing on I).
 * Otherwise (half-cadence on V, plagal IV, deceptive vi, borrowed iv, sus) → resolve
 * to the established LOCAL tonic (the final section's key/mode, so a modulating chart
 * lands in the key it ended in), preserving mode.
 */
function inferResolutionTonic(
    progression: any[],
    fallbackKeyIndex: number,
    fallbackIsMinor: boolean,
): { keyIndex: number; isMinor: boolean } {
    if (!progression || progression.length === 0) {
        return { keyIndex: fallbackKeyIndex, isMinor: fallbackIsMinor };
    }
    const final = progression[progression.length - 1];
    const finalPC = (((final.rootMidi % 12) + 12) % 12) as number;
    // Established local tonic for the fallback = the FINAL section's key/mode.
    const localKeyIndex = KEY_ORDER.indexOf(normalizeKey(final.key));
    const localTonicPC = localKeyIndex >= 0 ? localKeyIndex : fallbackKeyIndex;
    const localIsMinor = typeof final.keyIsMinor === 'boolean' ? final.keyIsMinor : fallbackIsMinor;
    const finalQualityIsMinor = MINOR_QUALITIES.has(final.quality);

    // (a) The chart already ended ON its local tonic root.
    if (finalPC === ((localTonicPC % 12) + 12) % 12) {
        return { keyIndex: finalPC, isMinor: finalQualityIsMinor };
    }

    // (b) The final chord is a tonicized arrival (preceded by its own dominant).
    for (let i = progression.length - 2; i >= 0; i--) {
        const prev = progression[i];
        const prevPC = ((prev.rootMidi % 12) + 12) % 12;
        if (prevPC === finalPC) {
            continue; // skip repeats of the final chord (guard 2)
        }
        // A dominant sits a P5 above its tonic → (final - dom) mod 12 === 5.
        if ((finalPC - prevPC + 12) % 12 === 5 && isDominantChord(prev)) {
            return { keyIndex: finalPC, isMinor: finalQualityIsMinor };
        }
        break; // first differing chord isn't final's dominant → not a tonic arrival
    }

    // (c) Not a tonic arrival → land on the established local tonic, mode preserved.
    return { keyIndex: localTonicPC, isMinor: localIsMinor };
}

export function generateResolutionNotes(
    state: EnsembleState,
    step: number,
    arranger: ArrangerState,
    enabled: any,
    bpm = 100,
    groove: any = {},
    soloist: any = {},
): any[] {
    const notes: any[] = [];
    const { playback } = state;
    const genre = groove.genreFeel || 'Rock';
    const config = GENRE_MAP[genre] || GENRE_MAP.Rock;

    // Scale the raw energy of the ending based on the current band intensity.
    // This ensures a chill track doesn't end with a jarring peak-velocity hit.
    const intensity = playback?.bandIntensity ?? 0.5;
    const intensityScale = 0.6 + intensity * 0.4; // 0.6 (min) to 1.0 (max)

    const getFinalVel = (baseVel: number): number =>
        baseVel * intensityScale * RESOLUTION_NORMALIZER;

    const getStagger = (maxMs = RESOLUTION_STAGGER): number => Math.random() * maxMs;

    const resolutionKey = arranger.key || 'C';
    const notatedKeyIndex = KEY_ORDER.indexOf(normalizeKey(resolutionKey));
    // #830: resolve onto the tune's TRUE tonal center (from the progression's
    // cadence) rather than the notated key's degree-0. The resolved {keyIndex,isMinor}
    // feed the ENTIRE cadence below — anchor register, V→I degrees, the tonic
    // landing, and the soloist's landing PC + 3-2-1 pickup mode — so the whole
    // gesture transposes as one (e.g. Autumn Leaves lands on vi/minor, not the
    // relative-major I, while 12-bar blues still resolves V7→I).
    const resolved = inferResolutionTonic(
        arranger.progression as any[],
        notatedKeyIndex >= 0 ? notatedKeyIndex : 0,
        arranger.isMinor,
    );
    const keyIndex = resolved.keyIndex;
    const isMinor = resolved.isMinor;

    const cadenceSteps = CADENCE_PROFILES[config.profile] || CADENCE_PROFILES.BUTTON;
    const ritardandoAmount = config.ritardando;

    // 1. Timing Map
    const spb = 60.0 / bpm;
    let currentTime = 0;
    const timingMap: { time: number; step: CadenceStep }[] = cadenceSteps.map((s, idx) => {
        const time = currentTime;
        let duration = s.beats * spb;

        if (ritardandoAmount > 0 && idx < cadenceSteps.length - 1) {
            duration *= 1.0 + ritardandoAmount;
        }
        currentTime += duration;
        return { time, step: s };
    });

    const anchor = 60 + keyIndex; // Middle C range
    let lastMidis = [60, 64, 67];

    timingMap.forEach((entry, idx) => {
        const { time, step: cadenceStep } = entry;
        const isLast = idx === cadenceSteps.length - 1;
        const targetPC = (keyIndex + cadenceStep.degree) % 12;

        // Base voicing quality
        let quality = cadenceStep.quality;
        if (isMinor) {
            quality = 'minor';
        }

        const density = genre === 'Jazz' || genre === 'Neo-Soul' ? 'rich' : 'standard';
        const is7th =
            quality.includes('7') ||
            quality.includes('9') ||
            quality.includes('6') ||
            quality.includes('minor');
        const intervals = getIntervals(
            state,
            quality,
            is7th,
            density,
            genre,
            Boolean(enabled.bass),
        );

        let playRoot = anchor - (anchor % 12) + targetPC;
        if (playRoot > anchor + 6) {
            playRoot -= 12;
        }
        if (playRoot < anchor - 6) {
            playRoot += 12;
        }

        const voicings = getBestInversion(state, playRoot, intervals, lastMidis, {
            anchor,
            min: 48,
            max: 80,
            quality,
        });
        lastMidis = voicings;

        // --- CHORDS ---
        if (enabled.chords) {
            if (idx === 0) {
                // Initial Sustain Pedal
                notes.push({
                    midi: 0,
                    module: 'chords',
                    step,
                    timingOffset: 0,
                    ccEvents: [{ controller: 64, value: 127, timingOffset: 0 }],
                });
            }
            voicings.forEach((m: number, vIdx: number) => {
                const vel = getFinalVel(cadenceStep.baseVelocity || 0.85);
                // Acoustic strum + global stagger
                const offset = (genre === 'Acoustic' ? vIdx * 0.035 : 0) + getStagger();
                notes.push({
                    midi: m,
                    freq: getFrequency(m),
                    velocity: vel,
                    midiVelocity: Math.round(vel * 127),
                    durationSteps: 16,
                    module: 'chords',
                    step,
                    timingOffset: time + Math.max(0, offset),
                });
            });
        }

        // --- BASS ---
        if (enabled.bass) {
            let bassMidi = targetPC + 36;
            if (bassMidi < 33) {
                bassMidi += 12;
            }
            const baseVel = isLast ? 0.76 : 0.8;
            const vel = getFinalVel(baseVel);
            const offset = getStagger(0.005); // Tighter stagger for bass/kick lock
            notes.push({
                midi: bassMidi,
                freq: getFrequency(bassMidi),
                velocity: vel,
                midiVelocity: Math.round(vel * 127),
                durationSteps: 16,
                module: 'bass',
                step,
                timingOffset: time + offset,
            });
        }

        // --- DRUMS ---
        if (enabled.groove) {
            const kickVel = getFinalVel(isLast ? 0.86 : 1.0);
            // Kick on every change
            notes.push({
                module: 'groove',
                name: 'Kick',
                velocity: kickVel,
                midiVelocity: Math.round(kickVel * 127),
                step,
                timingOffset: time,
            });
            if (isLast) {
                // Final Crash
                const crashVel = getFinalVel(0.82);
                notes.push({
                    module: 'groove',
                    name: 'Crash',
                    velocity: crashVel,
                    midiVelocity: Math.round(crashVel * 127),
                    step,
                    timingOffset: time + getStagger(0.008),
                });
            } else {
                const snareVel = getFinalVel(0.7);
                notes.push({
                    module: 'groove',
                    name: 'Snare',
                    velocity: snareVel,
                    midiVelocity: Math.round(snareVel * 127),
                    step,
                    timingOffset: time + getStagger(0.005),
                });
            }
        }

        // --- SOLOIST ---
        if (enabled.soloist) {
            const soloOctave = soloist.octave || 72;
            // Force resolution to Tonic (0) or 5th (7) relative to resolutionKey
            const soloPC = (isLast ? 0 : 7) + keyIndex;
            const soloMidi = soloOctave + (soloPC % 12);
            const baseVel = isLast ? 0.68 : 0.7;
            const vel = getFinalVel(baseVel);

            // Closing gesture (#830): after a whole song of singing, the lead used
            // to JUMP to a bare held tonic — a flat-footed sign-off next to how
            // melodic it's become. On a graceful (ritardando) ending it now plays a
            // short stepwise turn that resolves INTO the final note — a 3-2-1
            // descent (♭3-2-1 in minor) landing on the tonic the way a singer lands
            // a last phrase, two quick pickups leading onto the final downbeat where
            // the band arrives. BUTTON genres keep the single tight tonic hit — a
            // melodic turn would fight their hard, metronomic cut.
            if (isLast && ritardandoAmount > 0) {
                const grace = (60.0 / bpm) * 0.4; // ~an eighth ahead of the landing
                const pushPickup = (m: number, t: number, v: number): void => {
                    const pv = getFinalVel(v);
                    notes.push({
                        midi: m,
                        freq: getFrequency(m),
                        velocity: pv,
                        midiVelocity: Math.round(pv * 127),
                        durationSteps: 2,
                        module: 'soloist',
                        step,
                        timingOffset: Math.max(0, t),
                    });
                };
                pushPickup(soloMidi + (isMinor ? 3 : 4), time - grace * 2, 0.6); // 3 …
                pushPickup(soloMidi + 2, time - grace, 0.64); // … 2 …
            }

            notes.push({
                midi: soloMidi, // … 1 — the tonic landing, held + vibrato'd as the band arrives
                freq: getFrequency(soloMidi),
                velocity: vel,
                midiVelocity: Math.round(vel * 127),
                durationSteps: 16,
                module: 'soloist',
                step,
                timingOffset: time + getStagger(),
                vibrato: isLast ? { delay: 0.2, depth: 0.4 } : null,
            });
        }

        // --- HARMONY ---
        if (enabled.harmony) {
            // Pads follow the top notes of the voicing
            voicings.slice(-3).forEach((m: any) => {
                const vel = getFinalVel(0.5);
                notes.push({
                    midi: m,
                    freq: getFrequency(m),
                    velocity: vel,
                    midiVelocity: Math.round(vel * 127),
                    durationSteps: 16,
                    module: 'harmony',
                    step,
                    timingOffset: time + getStagger(),
                    style: 'pads',
                });
            });
        }
    });

    return notes;
}
