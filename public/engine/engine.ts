import { MIXER_GAIN_MULTIPLIERS } from '../config.js';
import { MODULES } from '../constants.js';
import type { GlobalContext } from '../state/playback.js';
import type { EnsembleState, Mutable } from '../types.js';
import { createReverbImpulse, createSoftClipCurve } from '../utils.js';
import { audioWatchdog } from './audio-recovery.js';
import { killBassNote, playBassNote } from './synth-bass.js';
// Facade: Re-export synthesis logic from specialized modules
import {
    INSTRUMENT_PRESETS,
    killAllPianoNotes,
    playChordScratch,
    playNote,
    updateSustain,
} from './synth-chords.js';
import { killDrumNote, playDrumSound } from './synth-drums.js';
import { killHarmonyNote, playHarmonyNote } from './synth-harmonies.js';
import { killSoloistNote, playSoloNote } from './synth-soloist.js';

export {
    INSTRUMENT_PRESETS,
    killAllPianoNotes,
    killBassNote,
    killDrumNote,
    killHarmonyNote,
    killSoloistNote,
    playBassNote,
    playChordScratch,
    playDrumSound,
    playHarmonyNote,
    playNote,
    playSoloNote,
    updateSustain,
};

let isChromium: boolean | null = null;
export function _resetChromiumCheck() {
    isChromium = null;
}

export function initAudio(
    state: EnsembleState,
    options: { audioContext?: AudioContext; enableWatchdog?: boolean } = {},
) {
    const { playback, groove, chords, bass, soloist, harmony, midi } = state;
    const providedAudioContext = options.audioContext;
    const usingOfflineContext = Boolean(
        providedAudioContext &&
            typeof (providedAudioContext as unknown as { startRendering?: unknown })
                .startRendering === 'function',
    );
    const enableWatchdog = options.enableWatchdog ?? !usingOfflineContext;

    if (!playback.audio || playback.audio.state === 'closed' || providedAudioContext) {
        if (
            !providedAudioContext &&
            (navigator as unknown as { audioSession?: { type: string } }).audioSession
        ) {
            (navigator as unknown as { audioSession: { type: string } }).audioSession.type =
                'playback';
        }

        if (providedAudioContext) {
            (playback as Mutable<typeof playback>).audio = providedAudioContext; // @direct-mutation
        } else {
            const AudioContextClass =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext: typeof AudioContext })
                    .webkitAudioContext;
            (playback as Mutable<typeof playback>).audio = new AudioContextClass(); // @direct-mutation
        }

        if (playback.audio && !usingOfflineContext) {
            // @direct-mutation
            playback.audio.onstatechange = () => {
                if (playback.audio && playback.audio.state === 'suspended' && playback.isPlaying) {
                    playback.audio
                        .resume()
                        .catch((e) => console.error('[DSP] Auto-resume failed:', e));
                }
            };
        }

        if (playback.audio) {
            const masterGain = playback.audio.createGain();
            (playback as Mutable<typeof playback>).masterGain = masterGain; // @direct-mutation
            const initMasterVol = (playback.masterVolume || 0.4) * MIXER_GAIN_MULTIPLIERS.master;
            masterGain.gain.setValueAtTime(0.0001, playback.audio.currentTime);
            masterGain.gain.exponentialRampToValueAtTime(
                initMasterVol,
                playback.audio.currentTime + 0.04,
            );
        }

        // Attach the Watchdog
        if (enableWatchdog && playback.masterGain) {
            audioWatchdog.attachToMaster(playback.masterGain, playback);
        }
        if (enableWatchdog) {
            audioWatchdog.onRecover = async (pbState: GlobalContext) => {
                await killAllNotes(state);
                if (pbState.audio) {
                    pbState.audio.close().then(() => {
                        (pbState as Mutable<GlobalContext>).audio = null; // @worker-mutation
                        initAudio(state);
                        restoreGains(state);
                        if (pbState.masterGain) {
                            audioWatchdog.attachToMaster(pbState.masterGain, pbState);
                        }
                    });
                }
            };
            audioWatchdog.start(() => state.playback);
        }

        if (playback.audio) {
            const saturator = playback.audio.createWaveShaper();
            (playback as Mutable<typeof playback>).saturator = saturator; // @direct-mutation
            saturator.curve = createSoftClipCurve(); // @direct-mutation
            saturator.oversample = '4x'; // @direct-mutation

            const masterLimiter = playback.audio.createDynamicsCompressor();
            (playback as Mutable<typeof playback>).masterLimiter = masterLimiter; // @direct-mutation
            masterLimiter.threshold.setValueAtTime(-2.0, playback.audio.currentTime);
            masterLimiter.knee.setValueAtTime(3, playback.audio.currentTime);
            masterLimiter.ratio.setValueAtTime(20, playback.audio.currentTime);
            masterLimiter.attack.setValueAtTime(0.001, playback.audio.currentTime);
            masterLimiter.release.setValueAtTime(0.15, playback.audio.currentTime);
        }

        if (
            playback.masterGain &&
            playback.saturator &&
            playback.masterLimiter &&
            playback.audio?.destination
        ) {
            playback.masterGain.connect(playback.saturator);
            playback.saturator.connect(playback.masterLimiter);
            playback.masterLimiter.connect(playback.audio.destination);
        }

        if (playback.audio && playback.masterGain) {
            const reverbNode = playback.audio.createConvolver();
            (playback as Mutable<typeof playback>).reverbNode = reverbNode; // @direct-mutation
            reverbNode.buffer = createReverbImpulse(playback.audio, 1.5, 3.0); // @direct-mutation
            reverbNode.connect(playback.masterGain);

            // --- Pro Mix: Abbey Road Reverb Filters ---
            const reverbHPF = playback.audio.createBiquadFilter();
            reverbHPF.type = 'highpass';
            reverbHPF.frequency.setValueAtTime(600, playback.audio.currentTime);

            const reverbLPF = playback.audio.createBiquadFilter();
            reverbLPF.type = 'lowpass';
            reverbLPF.frequency.setValueAtTime(6000, playback.audio.currentTime);

            reverbHPF.connect(reverbLPF);
            reverbLPF.connect(reverbNode);
            (playback as Mutable<typeof playback>).reverbPreFilter = reverbHPF; // @direct-mutation
        }

        const modules = [
            { name: MODULES.CHORDS, state: chords, mult: MIXER_GAIN_MULTIPLIERS.chords },
            { name: MODULES.BASS, state: bass, mult: MIXER_GAIN_MULTIPLIERS.bass },
            { name: MODULES.SOLOIST, state: soloist, mult: MIXER_GAIN_MULTIPLIERS.soloist },
            { name: MODULES.HARMONIES, state: harmony, mult: MIXER_GAIN_MULTIPLIERS.harmonies },
            { name: 'drums', state: groove, mult: MIXER_GAIN_MULTIPLIERS.drums },
        ];

        modules.forEach((m) => {
            if (!playback.audio || !playback.masterGain) {
                return;
            }
            const gainNode = playback.audio.createGain();
            const isLocalMuted = midi.enabled && midi.muteLocal;

            const isMuted = !m.state.enabled;

            const targetGain =
                !isMuted && !isLocalMuted ? Math.max(0.0001, m.state.volume * m.mult) : 0.0001;
            gainNode.gain.setValueAtTime(0.0001, playback.audio.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(
                targetGain,
                playback.audio.currentTime + 0.04,
            );

            // New Bus Architecture with EQs, Panning, and Sidechain
            const busEQ = playback.audio.createBiquadFilter();
            busEQ.type = 'highpass';
            busEQ.frequency.setValueAtTime(20, playback.audio.currentTime); // Neutral by default

            if (m.name === 'chords') {
                const lowShelf = playback.audio.createBiquadFilter();
                lowShelf.type = 'lowshelf';
                lowShelf.frequency.setValueAtTime(350, playback.audio.currentTime);
                lowShelf.gain.setValueAtTime(-2, playback.audio.currentTime);

                const notch = playback.audio.createBiquadFilter();
                notch.type = 'peaking';
                notch.frequency.setValueAtTime(2500, playback.audio.currentTime);
                notch.Q.setValueAtTime(0.7, playback.audio.currentTime);
                notch.gain.setValueAtTime(-2, playback.audio.currentTime);

                const panner = playback.audio.createStereoPanner();
                panner.pan.setValueAtTime(-0.2, playback.audio.currentTime);

                gainNode.connect(busEQ);
                busEQ.connect(lowShelf);
                lowShelf.connect(notch);
                notch.connect(panner);
                panner.connect(playback.masterGain);

                (playback as Mutable<typeof playback>).chordsEQ = busEQ; // @direct-mutation
                (playback as Mutable<typeof playback>).chordsPanner = panner; // @direct-mutation
            } else if (m.name === 'bass') {
                const sidechain = playback.audio.createGain();
                sidechain.gain.setValueAtTime(1.0, playback.audio.currentTime);

                const weight = playback.audio.createBiquadFilter();
                weight.type = 'lowshelf';
                weight.frequency.setValueAtTime(100, playback.audio.currentTime);
                weight.gain.setValueAtTime(2, playback.audio.currentTime);

                const scoop = playback.audio.createBiquadFilter();
                scoop.type = 'peaking';
                scoop.frequency.setValueAtTime(450, playback.audio.currentTime);
                scoop.Q.setValueAtTime(1.2, playback.audio.currentTime);
                scoop.gain.setValueAtTime(-3, playback.audio.currentTime);

                const definition = playback.audio.createBiquadFilter();
                definition.type = 'peaking';
                definition.frequency.setValueAtTime(2000, playback.audio.currentTime);
                definition.Q.setValueAtTime(1.2, playback.audio.currentTime);
                definition.gain.setValueAtTime(3, playback.audio.currentTime);

                gainNode.connect(sidechain);
                sidechain.connect(busEQ);
                busEQ.connect(weight);
                weight.connect(scoop);
                scoop.connect(definition);
                definition.connect(playback.masterGain);

                (playback as Mutable<typeof playback>).bassSidechain = sidechain; // @direct-mutation
                (playback as Mutable<typeof playback>).bassEQ = busEQ; // @direct-mutation
            } else if (m.name === 'soloist') {
                const presence = playback.audio.createBiquadFilter();
                presence.type = 'peaking';
                presence.frequency.setValueAtTime(3500, playback.audio.currentTime);
                presence.gain.setValueAtTime(2, playback.audio.currentTime);
                presence.Q.setValueAtTime(1.0, playback.audio.currentTime);

                gainNode.connect(busEQ);
                busEQ.connect(presence);
                presence.connect(playback.masterGain);

                (playback as Mutable<typeof playback>).soloistEQ = busEQ; // @direct-mutation
            } else if (m.name === 'harmonies') {
                const warmth = playback.audio.createBiquadFilter();
                warmth.type = 'peaking';
                warmth.frequency.setValueAtTime(1200, playback.audio.currentTime);
                warmth.gain.setValueAtTime(1, playback.audio.currentTime);

                const panner = playback.audio.createStereoPanner();
                panner.pan.setValueAtTime(0.2, playback.audio.currentTime);

                gainNode.connect(busEQ);
                busEQ.connect(warmth);
                warmth.connect(panner);
                panner.connect(playback.masterGain);
                (playback as Mutable<typeof playback>).harmoniesEQ = busEQ; // @direct-mutation
                (playback as Mutable<typeof playback>).harmoniesPanner = panner; // @direct-mutation
            } else if (m.name === 'drums') {
                const drumsHP = playback.audio.createBiquadFilter();
                drumsHP.type = 'highpass';
                drumsHP.frequency.setValueAtTime(40, playback.audio.currentTime);

                const drumsAir = playback.audio.createBiquadFilter();
                drumsAir.type = 'peaking';
                drumsAir.frequency.setValueAtTime(5000, playback.audio.currentTime);
                drumsAir.Q.setValueAtTime(1.2, playback.audio.currentTime);
                drumsAir.gain.setValueAtTime(2, playback.audio.currentTime);

                gainNode.connect(drumsHP);
                drumsHP.connect(drumsAir);
                drumsAir.connect(playback.masterGain);
                (playback as Mutable<typeof playback>).drumsEQ = drumsHP; // @direct-mutation
            }

            (playback as unknown as Record<string, GainNode>)[`${m.name}Gain`] = gainNode;

            const reverbGain = playback.audio.createGain();
            const targetReverb = Math.max(0.0001, m.state.reverb);
            reverbGain.gain.setValueAtTime(0.0001, playback.audio.currentTime);
            reverbGain.gain.exponentialRampToValueAtTime(
                targetReverb,
                playback.audio.currentTime + 0.04,
            );
            gainNode.connect(reverbGain);
            reverbGain.connect(playback.reverbPreFilter || (playback.reverbNode as AudioNode));
            (playback as unknown as Record<string, GainNode>)[`${m.name}Reverb`] = reverbGain;
        });

        const bufSize = playback.audio!.sampleRate * 2;
        const buffer = playback.audio!.createBuffer(1, bufSize, playback.audio!.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        (groove.audioBuffers as unknown as Record<string, AudioBuffer>).noise = buffer;
    }
    if (playback.audio && playback.audio.state === 'suspended') {
        if (playback.audio) {
            playback.audio.resume();
        }
    }
}

export function killChordBus(state: EnsembleState) {
    const { playback } = state;
    if (playback.chordsGain && playback.audio) {
        playback.chordsGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.chordsGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

export function killBassBus(state: EnsembleState) {
    const { playback } = state;
    if (playback.bassGain && playback.audio) {
        playback.bassGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.bassGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

export function killSoloistBus(state: EnsembleState) {
    const { playback } = state;
    if (playback.soloistGain && playback.audio) {
        playback.soloistGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.soloistGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

export function killHarmonyBus(state: EnsembleState) {
    const { playback } = state;
    if (playback.harmoniesGain && playback.audio) {
        playback.harmoniesGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.harmoniesGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

export function killDrumBus(state: EnsembleState) {
    const { playback } = state;
    if (playback.drumsGain && playback.audio) {
        playback.drumsGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.drumsGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

export async function killAllNotes(state: EnsembleState) {
    const { playback } = state;
    if (!playback.audio) {
        return;
    }
    killAllPianoNotes(state);
    killBassNote(state);
    killDrumNote(state);
    killSoloistNote(state);
    killHarmonyNote(state);
}

export function restoreGains(state: EnsembleState) {
    const { playback, chords, bass, soloist, harmony, groove, midi } = state;
    if (!playback.audio) {
        return;
    }
    const t = playback.audio.currentTime;
    const modules = [
        {
            node: playback.chordsGain,
            state: chords,
            mult: MIXER_GAIN_MULTIPLIERS.chords,
            name: 'chords',
        },
        { node: playback.bassGain, state: bass, mult: MIXER_GAIN_MULTIPLIERS.bass, name: 'bass' },
        {
            node: playback.soloistGain,
            state: soloist,
            mult: MIXER_GAIN_MULTIPLIERS.soloist,
            name: 'soloist',
        },
        {
            node: playback.harmoniesGain,
            state: harmony,
            mult: MIXER_GAIN_MULTIPLIERS.harmonies,
            name: 'harmonies',
        },
        {
            node: playback.drumsGain,
            state: groove,
            mult: MIXER_GAIN_MULTIPLIERS.drums,
            name: 'drums',
        },
    ];
    modules.forEach((m) => {
        if (m.node && playback.audio) {
            const isLocalMuted = midi.enabled && midi.muteLocal;

            const isMuted = !m.state.enabled;

            const target = !isMuted && !isLocalMuted ? m.state.volume * m.mult : 0.0001;
            m.node.gain.cancelScheduledValues(t);
            m.node.gain.setTargetAtTime(target, t, 0.04);
        }
    });
}

let lastAudioTime = 0;
let lastPerfTime = 0;

export function getVisualTime(state: EnsembleState): number {
    const { playback } = state;
    if (!playback.audio) {
        return 0;
    }

    const audioTime = playback.audio.currentTime;
    const perfTime = performance.now();

    if (audioTime !== lastAudioTime) {
        lastAudioTime = audioTime;
        lastPerfTime = perfTime;
    }

    const dt = (perfTime - lastPerfTime) / 1000;
    const smoothAudioTime = audioTime + Math.min(dt, 0.1);

    const outputLatency = playback.audio.outputLatency || 0;
    if (isChromium === null) {
        isChromium = !!(
            navigator.userAgent.includes('Chrome') && navigator.vendor.includes('Google Inc')
        );
    }

    return isChromium ? smoothAudioTime : audioTime - outputLatency;
}
