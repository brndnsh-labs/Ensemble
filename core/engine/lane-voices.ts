/**
 * What Stop can reach, per audio context and lane (#1530, #1569, #1999).
 *
 * The band host sends each note to its voice up to a lookahead before it sounds, so at Stop a
 * lane holds two kinds of voice: ones sounding (a held organ chord, a ringing cymbal) and ones
 * scheduled just ahead of the clock (a bass note, a kick, a lead note due in the next 150 ms).
 * Both must go quiet: the first fades in a few milliseconds, the second never sounds at all.
 *
 * - {@link trackLaneVoice}: a voice that can silence itself from any moment (each sampled voice,
 *   each synth chord voice). It joins when it is made and leaves when it ends, so the set stays
 *   as small as what is ringing.
 * - {@link cancelAheadOnStop}: a synth voice that only needs the ahead case (the synth drums,
 *   bass and lead, whose sounding notes their lane's kill function already fades, or which are
 *   short enough to finish). A Stop before its start disconnects its outputs, so its sources
 *   run into nothing and free themselves on their own `onended`.
 *
 * Keyed by the context, not the state tree: an offline render's voices are its own, and a
 * handle closes over audio nodes no slice should hold. Leaf module: no engine imports.
 */

/** The lane a voice sounds in: what a stop silences together. */
export type VoiceLane = 'chords' | 'bass' | 'soloist' | 'drums';

type Silence = (when: number) => void;

const soundingVoices = new WeakMap<BaseAudioContext, Map<VoiceLane, Set<Silence>>>();

/** Register `silence` for `lane`; returns the function that takes it out again. */
export function trackLaneVoice(
    audio: BaseAudioContext,
    lane: VoiceLane | undefined,
    silence: Silence,
): () => void {
    if (!lane) {
        return () => {};
    }
    let lanes = soundingVoices.get(audio);
    if (!lanes) {
        lanes = new Map();
        soundingVoices.set(audio, lanes);
    }
    let voices = lanes.get(lane);
    if (!voices) {
        voices = new Set();
        lanes.set(lane, voices);
    }
    voices.add(silence);
    return () => voices.delete(silence);
}

interface AheadVoice {
    readonly start: number;
    readonly outputs: readonly AudioNode[];
}

const aheadVoices = new WeakMap<BaseAudioContext, Map<VoiceLane, AheadVoice[]>>();

/**
 * Stop before `startTime` must keep this voice from sounding: disconnect `outputs` (the nodes
 * that carry it to its lane's bus). Disconnecting, not fading: a voice that has not started has
 * nothing to fade, and a cancelled envelope would leave its gain at the default of 1 — a click
 * (the trap #1569 met). Entries are kept in the order sent and dropped once the clock passes
 * their start, so the list holds about a lookahead's worth of notes.
 *
 * An offline render is never stopped, so nothing is kept for one: its notes are all scheduled
 * before its clock moves, and the list would grow to the whole song.
 */
export function cancelAheadOnStop(
    audio: BaseAudioContext,
    lane: VoiceLane,
    startTime: number,
    outputs: readonly AudioNode[],
): void {
    if ('startRendering' in audio) {
        return;
    }
    let lanes = aheadVoices.get(audio);
    if (!lanes) {
        lanes = new Map();
        aheadVoices.set(audio, lanes);
    }
    let voices = lanes.get(lane);
    if (!voices) {
        voices = [];
        lanes.set(lane, voices);
    }
    // Notes arrive about in time order; an entry left behind the front is skipped at Stop.
    while (voices.length > 0 && voices[0].start < audio.currentTime) {
        voices.shift();
    }
    voices.push({ start: startTime, outputs });
}

/**
 * Silence every voice of `lane` from `when`: the ones sounding fade in a few milliseconds, the
 * ones scheduled at or after `when` never sound.
 */
export function releaseLaneVoices(audio: BaseAudioContext, lane: VoiceLane, when: number): void {
    const sounding = soundingVoices.get(audio)?.get(lane);
    if (sounding) {
        for (const silence of [...sounding]) {
            silence(when);
        }
    }
    const lanes = aheadVoices.get(audio);
    const ahead = lanes?.get(lane);
    if (!ahead) {
        return;
    }
    lanes?.delete(lane);
    for (const voice of ahead) {
        if (voice.start < when) {
            continue;
        }
        for (const output of voice.outputs) {
            try {
                output.disconnect();
            } catch {
                /* already disconnected */
            }
        }
    }
}
