import type { EnsembleState } from '../types.js';
import { safeDisconnect } from '../utils.js';
import { createSimplePanner, playPercussiveStrike, rampGain } from './synth-utils.js';

interface ChordInstrumentPreset {
    attack: number;
    decay: number;
    filterBase: number;
    filterDepth: number;
    resonance: number;
    gainMult: number;
    tine?: boolean;
    fundamental?: OscillatorType;
    harmonic?: OscillatorType;
    fifth?: OscillatorType;
    weights?: number[];
    reverbMult?: number;
}

export const INSTRUMENT_PRESETS: Record<string, ChordInstrumentPreset> = {
    Warm: {
        attack: 0.03,
        decay: 0.6,
        filterBase: 600,
        filterDepth: 1800,
        resonance: 2.2,
        tine: true,
        fundamental: 'triangle',
        harmonic: 'sine',
        fifth: 'sine',
        weights: [1.2, 0.3, 0.1],
        reverbMult: 1.1,
        gainMult: 1.0,
    },
    Piano: {
        attack: 0.001,
        decay: 5.0,
        filterBase: 400,
        filterDepth: 2400,
        resonance: 1.2,
        gainMult: 1.25,
    },
};

function createPianoWave(audioCtx: AudioContext): PeriodicWave {
    const real = new Float32Array([0, 1, 0.6, 0.4, 0.25, 0.15, 0.1, 0.08, 0.05, 0.03]);
    const imag = new Float32Array(real.length).fill(0);
    return audioCtx.createPeriodicWave(real, imag);
}

let pianoWave: PeriodicWave | null = null;
let cachedShaperCurve: Float32Array<ArrayBuffer> | null = null;
let cachedShaperDrive = -1;

export function updateSustain(
    state: EnsembleState,
    active: boolean,
    time: number | null = null,
): void {
    const { playback } = state;
    if (!playback.audio) {
        return;
    }
    const scheduleTime = time !== null ? time : playback.audio.currentTime;
    playback.sustainActive = active; // @direct-mutation

    if (!active && playback.heldNotes) {
        playback.heldNotes.forEach((note: any) => {
            note.stop(scheduleTime);
        });
        playback.heldNotes.clear();
    }
}

export function killAllPianoNotes(state: EnsembleState): void {
    const { playback } = state;
    const now = playback.audio?.currentTime || 0;
    if (playback.heldNotes) {
        playback.heldNotes.forEach((note: any) => {
            if (typeof note.stop === 'function') {
                note.stop(now, true);
            }
        });
        playback.heldNotes.clear();
    }
    playback.sustainActive = false; // @direct-mutation
}

interface PlayNoteOptions {
    vol?: number;
    index?: number;
    instrument?: string;
    muted?: boolean;
    numVoices?: number;
}

export function playNote(
    state: EnsembleState,
    freq: number,
    time: number,
    duration: number,
    {
        vol = 0.1,
        index = 0,
        instrument = 'Piano',
        muted = false,
        numVoices = 1,
    }: PlayNoteOptions = {},
): void {
    const { playback, groove } = state;
    if (!playback.audio || !Number.isFinite(freq)) {
        return;
    }

    const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));
    const finalVol = vol * polyphonyComp;

    if (!playback.heldNotes) {
        playback.heldNotes = new Set(); // @direct-mutation
    }

    try {
        if (instrument !== 'Piano' && instrument !== 'Warm') {
            instrument = 'Piano';
        }

        const preset = INSTRUMENT_PRESETS[instrument] || INSTRUMENT_PRESETS.Piano;
        const now = playback.audio.currentTime;
        const baseTime = Math.max(time, now);

        const isPiano = instrument === 'Piano';
        if (isPiano && !pianoWave) {
            pianoWave = createPianoWave(playback.audio);
        }

        const staggerMult = muted ? 0.4 : 1.0;
        const stagger = index * (0.005 + Math.random() * 0.01) * staggerMult;
        const startTime = baseTime + stagger;

        const intensity = playback.bandIntensity;
        const intensityShift = (intensity - 0.5) * 2400;
        const intensityDepthMult = 0.5 + intensity * 2.5;
        const lowMidCut =
            muted || numVoices < 2
                ? 0
                : Math.min(4, Math.max(0, numVoices - 1) * 0.8 + Math.max(0, intensity - 0.5) * 3);
        const velocityCutoff = Math.max(
            100,
            preset.filterBase + intensityShift + finalVol * preset.filterDepth * intensityDepthMult,
        );

        // --- Component A: The Hammer Strike ---
        if (isPiano && !muted && playback.chordsGain) {
            playPercussiveStrike(
                playback.audio,
                groove.audioBuffers.noise,
                playback.chordsGain,
                startTime,
                {
                    volume: finalVol * 0.15,
                    filterType: 'bandpass',
                    freq: Math.max(800, Math.min(4000, 800 + (freq / 440) * 600 + finalVol * 500)),
                    Q: 1.5,
                    attack: 0.001,
                    decay: 0.01,
                    duration: 0.1,
                },
            );
        }

        // --- Component B: The Harmonic Body ---
        const osc = playback.audio.createOscillator();
        const mainGain = playback.audio.createGain();
        const filter = playback.audio.createBiquadFilter();
        let unisonOsc: OscillatorNode | null = null;
        let unisonGain: GainNode | null = null;

        if (isPiano && pianoWave) {
            osc.setPeriodicWave(pianoWave);
            unisonOsc = playback.audio.createOscillator();
            unisonGain = playback.audio.createGain();
            unisonOsc.setPeriodicWave(pianoWave);
            unisonOsc.frequency.setValueAtTime(freq, startTime);
            unisonOsc.detune.setValueAtTime(6 + Math.random() * 4, startTime);
            unisonGain.gain.setValueAtTime(0.6, startTime);
            unisonOsc.connect(unisonGain);
            unisonGain.connect(filter);
        } else {
            osc.type = preset.fundamental || 'sine';
        }

        osc.frequency.setValueAtTime(freq, startTime);
        osc.detune.setValueAtTime(Math.random() * 4 - 2, startTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(velocityCutoff, startTime);
        filter.frequency.setTargetAtTime(preset.filterBase, startTime, isPiano ? 0.35 : 0.1);
        filter.Q.setValueAtTime(preset.resonance, startTime);

        mainGain.gain.setValueAtTime(0, startTime);
        mainGain.gain.setTargetAtTime(
            finalVol * (preset.gainMult || 1.0),
            startTime,
            preset.attack,
        );

        const stopNote = (t: number, isPanic = false): void => {
            const dampingConstant = isPanic ? 0.005 : duration < 0.2 ? 0.02 : 0.12;
            rampGain(mainGain.gain, 0, t, dampingConstant);
            try {
                osc.stop(t + 0.5);
            } catch {
                /* ignore */
            }
            if (unisonOsc) {
                try {
                    unisonOsc.stop(t + 0.5);
                } catch {
                    /* ignore */
                }
            }
        };

        if (playback.sustainActive && !muted) {
            const noteRef = { stop: stopNote };
            playback.heldNotes.add(noteRef);
            if (playback.heldNotes.size > 64) {
                const firstNote = playback.heldNotes.values().next().value;
                firstNote.stop(now);
                playback.heldNotes.delete(firstNote);
            }
        } else {
            const actualDuration = muted ? 0.015 : duration;
            rampGain(mainGain.gain, 0, startTime + actualDuration, 0.03);
        }

        osc.connect(filter);

        let shaper: WaveShaperNode | null = null;
        let lastNode: AudioNode = filter;
        if (!muted) {
            shaper = playback.audio.createWaveShaper();
            const drive = Math.max(0.001, (intensity - 0.5) * 4.0);

            if (!cachedShaperCurve || Math.abs(drive - cachedShaperDrive) > 0.01) {
                const n_samples = 44100;
                cachedShaperCurve = new Float32Array(n_samples);
                for (let i = 0; i < n_samples; ++i) {
                    const x = (i * 2) / n_samples - 1;
                    cachedShaperCurve[i] =
                        ((Math.PI + drive) * x) / (Math.PI + drive * Math.abs(x));
                }
                cachedShaperDrive = drive;
            }

            shaper.curve = cachedShaperCurve;
            shaper.oversample = '2x';
            filter.connect(shaper);
            lastNode = shaper;
        }

        lastNode.connect(mainGain);

        const bodyShape = playback.audio.createBiquadFilter();
        bodyShape.type = 'peaking';
        bodyShape.frequency.setValueAtTime(isPiano ? 330 : 300, startTime);
        bodyShape.Q.setValueAtTime(0.85, startTime);
        bodyShape.gain.setValueAtTime(-lowMidCut, startTime);

        const hpf = playback.audio.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.setValueAtTime(150, startTime);

        const panner = createSimplePanner(playback.audio, -0.2, startTime);

        mainGain.connect(bodyShape);
        bodyShape.connect(hpf);
        hpf.connect(panner);
        if (playback.chordsGain) {
            panner.connect(playback.chordsGain);
        }

        osc.start(startTime);
        if (unisonOsc) {
            unisonOsc.start(startTime);
        }
        if (!playback.sustainActive || muted) {
            const stopAt = startTime + (muted ? 0.1 : duration + 1.0);
            osc.stop(stopAt);
            if (unisonOsc) {
                unisonOsc.stop(stopAt);
            }
        }

        osc.onended = () =>
            safeDisconnect([
                osc,
                filter,
                mainGain,
                hpf,
                panner,
                ...(unisonOsc && unisonGain ? [unisonOsc, unisonGain] : []),
                ...(shaper ? [shaper] : []),
            ]);
    } catch (err) {
        console.error('playNote error:', err);
    }
}

export function playChordScratch(state: EnsembleState, time: number, vol = 0.1): void {
    const { playback, groove } = state;
    if (!playback.audio || !playback.chordsGain) {
        return;
    }
    const randomizedVol = vol * (0.8 + Math.random() * 0.4);
    playPercussiveStrike(playback.audio, groove.audioBuffers.noise, playback.chordsGain, time, {
        volume: randomizedVol,
        filterType: 'bandpass',
        freq: 1200 + Math.random() * 400,
        Q: 1.5,
        attack: 0.005,
        decay: 0.02,
        duration: 0.2,
    });
}
