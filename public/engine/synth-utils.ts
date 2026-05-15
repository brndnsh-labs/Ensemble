import { safeDisconnect } from '../utils.js';

/**
 * Standardized WebAudio utilities for instrument synthesis.
 */

export function rampGain(
    param: AudioParam,
    target: number,
    time: number,
    duration = 0.01,
    isExponential = false,
): void {
    try {
        param.cancelScheduledValues(time);
        if (isExponential && target > 0.0001) {
            // We skip setValueAtTime(value, time) to match existing test expectations
            // and avoid the "automation curve overlap" warning in some browsers
            // when not strictly necessary for these simple fades.
            param.exponentialRampToValueAtTime(target, time + duration);
        } else {
            param.setTargetAtTime(target, time, duration);
        }
    } catch {
        /* ignore audio graph errors */
    }
}

export function killActiveVoices(voices: any[], time: number, fadeTime = 0.01): void {
    if (!voices || voices.length === 0) {
        return;
    }
    voices.forEach((v) => {
        if (v.gain) {
            // Support both { gain: GainNode } and { gain: AudioParam }
            const g = v.gain.gain || v.gain;
            rampGain(g, 0, time, fadeTime);
        }
        if (v.nodes) {
            v.nodes.forEach((node: AudioNode & { stop?: (t: number) => void }) => {
                try {
                    if (node.stop) {
                        node.stop(time + fadeTime + 0.05);
                    }
                } catch {
                    /* ignore stop errors */
                }
            });
        }
    });
    voices.length = 0; // Clear the array in-place
}

interface MixState {
    recentHits: number;
    lastTick: number;
    densityDuck: number;
}

export function updateDensityDucking(
    mixState: MixState,
    now: number,
    threshold = 4,
    factor = 0.02,
): number {
    if (now - mixState.lastTick > 0.5) {
        mixState.recentHits *= 0.5;
        mixState.lastTick = now;
    }
    mixState.recentHits++;

    mixState.densityDuck = Math.max(
        0.75,
        1.0 - Math.max(0, mixState.recentHits - threshold) * factor,
    );
    return mixState.densityDuck;
}

export function createSimplePanner(
    ctx: AudioContext,
    panValue: number,
    time: number,
): StereoPannerNode | GainNode {
    const panner =
        typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : ctx.createGain();
    if (typeof ctx.createStereoPanner === 'function' && 'pan' in panner) {
        (panner as StereoPannerNode).pan.setValueAtTime(panValue, time);
    }
    return panner;
}

export function duckGain(
    param: AudioParam,
    target: number,
    time: number,
    attack = 0.01,
    release = 0.1,
): void {
    try {
        param.cancelScheduledValues(time);
        param.setTargetAtTime(target, time, attack);
        param.setTargetAtTime(1.0, time + attack, release);
    } catch {
        /* ignore audio graph errors */
    }
}

interface PercussiveStrikeOptions {
    volume?: number;
    filterType?: BiquadFilterType;
    freq?: number;
    Q?: number;
    attack?: number;
    decay?: number;
    duration?: number;
}

export function playPercussiveStrike(
    audio: AudioContext,
    buffer: AudioBuffer | null,
    destination: AudioNode,
    time: number,
    {
        volume = 0.1,
        filterType = 'bandpass',
        freq = 1200,
        Q = 1.5,
        attack = 0.001,
        decay = 0.01,
        duration = 0.1,
    }: PercussiveStrikeOptions = {},
): void {
    if (!audio || !buffer || !destination) {
        return;
    }

    try {
        const source = audio.createBufferSource();
        source.buffer = buffer;
        const filter = audio.createBiquadFilter();
        const gain = audio.createGain();

        filter.type = filterType;
        filter.frequency.setValueAtTime(freq, time);
        filter.Q.setValueAtTime(Q, time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.setTargetAtTime(volume, time, attack);
        gain.gain.setTargetAtTime(0, time + attack, decay);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(destination);

        source.start(time);
        source.stop(time + duration);

        source.onended = () => safeDisconnect([source, filter, gain]);
    } catch {
        /* ignore audio errors */
    }
}

interface ResonantToneOptions {
    type?: OscillatorType;
    freqStart?: number;
    freqEnd?: number;
    rampDuration?: number;
    volume?: number;
    attack?: number;
    decay?: number;
    duration?: number;
    detune?: number;
}

export function playResonantTone(
    audio: AudioContext,
    destination: AudioNode,
    time: number,
    {
        type = 'sine',
        freqStart = 100,
        freqEnd = 100,
        rampDuration = 0.02,
        volume = 0.1,
        attack = 0.001,
        decay = 0.05,
        duration = 0.5,
        detune = 0,
    }: ResonantToneOptions = {},
): void {
    if (!audio || !destination) {
        return;
    }

    try {
        const osc = audio.createOscillator();
        const gain = audio.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, time);
        if (freqStart !== freqEnd) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), time + rampDuration);
        }
        if (detune !== 0) {
            osc.detune.setValueAtTime(detune, time);
        }

        gain.gain.setValueAtTime(0, time);
        gain.gain.setTargetAtTime(volume, time, attack);
        gain.gain.setTargetAtTime(0, time + attack, decay);

        osc.connect(gain);
        gain.connect(destination);

        osc.start(time);
        osc.stop(time + duration);

        osc.onended = () => safeDisconnect([osc, gain]);
    } catch {
        /* ignore audio errors */
    }
}
