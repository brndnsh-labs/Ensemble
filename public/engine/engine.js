import { MIXER_GAIN_MULTIPLIERS } from '../config.js';
import { MODULES } from '../constants.js';
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

/** @type {boolean | null} */
let isChromium = null;
export function _resetChromiumCheck() {
    isChromium = null;
}

/**
 * Initializes the Web Audio context and global audio nodes.
 * Must be called in response to a user gesture.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 * @param {{audioContext?: AudioContext, enableWatchdog?: boolean}} [options]
 */
export function initAudio(state, options = {}) {
    const { playback, groove, chords, bass, soloist, harmony, midi } = state;
    const providedAudioContext = options.audioContext;
    const usingOfflineContext = Boolean(
        providedAudioContext &&
            typeof (/** @type {any} */ (providedAudioContext).startRendering) === 'function',
    );
    const enableWatchdog = options.enableWatchdog ?? !usingOfflineContext;

    if (!playback.audio || playback.audio.state === 'closed' || providedAudioContext) {
        if (!providedAudioContext && /** @type {any} */ (navigator).audioSession) {
            /** @type {any} */ (navigator).audioSession.type = 'playback';
        }

        if (providedAudioContext) {
            playback.audio = providedAudioContext; // @direct-mutation
        } else {
            const AudioContextClass =
                window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
            playback.audio = new AudioContextClass(); // @direct-mutation
        }

        if (playback.audio && !usingOfflineContext) {
            playback.audio.onstatechange = () => {
                if (playback.audio && playback.audio.state === 'suspended' && playback.isPlaying) {
                    playback.audio
                        .resume()
                        .catch((e) => console.error('[DSP] Auto-resume failed:', e));
                }
            };
        }

        if (playback.audio) {
            playback.masterGain = playback.audio.createGain(); // @direct-mutation
            const initMasterVol = (playback.masterVolume || 0.4) * MIXER_GAIN_MULTIPLIERS.master;
            playback.masterGain.gain.setValueAtTime(0.0001, playback.audio.currentTime);
            playback.masterGain.gain.exponentialRampToValueAtTime(
                initMasterVol,
                playback.audio.currentTime + 0.04,
            );
        }

        // Attach the Watchdog
        if (enableWatchdog && playback.masterGain) {
            audioWatchdog.attachToMaster(playback.masterGain, playback);
        }
        if (enableWatchdog) {
            audioWatchdog.onRecover = async (
                /** @type {import('../state/playback.js').GlobalContext} */ pbState,
            ) => {
                await killAllNotes(state);
                if (pbState.audio) {
                    pbState.audio.close().then(() => {
                        pbState.audio = null; // @worker-mutation
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
            playback.saturator = playback.audio.createWaveShaper(); // @direct-mutation
            playback.saturator.curve = createSoftClipCurve();
            playback.saturator.oversample = '4x';

            playback.masterLimiter = playback.audio.createDynamicsCompressor(); // @direct-mutation
            playback.masterLimiter.threshold.setValueAtTime(-1.5, playback.audio.currentTime);
            playback.masterLimiter.knee.setValueAtTime(30, playback.audio.currentTime);
            playback.masterLimiter.ratio.setValueAtTime(12, playback.audio.currentTime);
            playback.masterLimiter.attack.setValueAtTime(0.002, playback.audio.currentTime);
            playback.masterLimiter.release.setValueAtTime(0.08, playback.audio.currentTime);
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
            playback.reverbNode = playback.audio.createConvolver(); // @direct-mutation
            playback.reverbNode.buffer = createReverbImpulse(playback.audio, 1.5, 3.0);
            playback.reverbNode.connect(playback.masterGain);

            // --- Pro Mix: Abbey Road Reverb Filters ---
            const reverbHPF = playback.audio.createBiquadFilter();
            reverbHPF.type = 'highpass';
            reverbHPF.frequency.setValueAtTime(600, playback.audio.currentTime);

            const reverbLPF = playback.audio.createBiquadFilter();
            reverbLPF.type = 'lowpass';
            reverbLPF.frequency.setValueAtTime(6000, playback.audio.currentTime);

            reverbHPF.connect(reverbLPF);
            reverbLPF.connect(playback.reverbNode);
            playback.reverbPreFilter = reverbHPF; // @direct-mutation
        }

        const modules = [
            { name: MODULES.CHORDS, state: chords, mult: MIXER_GAIN_MULTIPLIERS.chords },
            { name: MODULES.BASS, state: bass, mult: MIXER_GAIN_MULTIPLIERS.bass },
            { name: MODULES.SOLOIST, state: soloist, mult: MIXER_GAIN_MULTIPLIERS.soloist },
            { name: MODULES.HARMONIES, state: harmony, mult: MIXER_GAIN_MULTIPLIERS.harmonies },
            { name: 'drums', state: groove, mult: MIXER_GAIN_MULTIPLIERS.drums },
        ];

        modules.forEach((/** @type {any} */ m) => {
            if (!playback.audio || !playback.masterGain) {
                return;
            }
            const gainNode = playback.audio.createGain();
            const isLocalMuted = midi.enabled && midi.muteLocal;

            let isMuted = !m.state.enabled;
            if (m.state === soloist && playback.modals?.performance) {
                isMuted = false;
            }
            if (m.name === 'drums' && playback.modals?.drumPad) {
                isMuted = false;
            }

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

                playback.chordsEQ = busEQ; // @direct-mutation
                playback.chordsPanner = panner; // @direct-mutation
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

                playback.bassSidechain = sidechain; // @direct-mutation
                playback.bassEQ = busEQ; // @direct-mutation
            } else if (m.name === 'soloist') {
                const presence = playback.audio.createBiquadFilter();
                presence.type = 'peaking';
                presence.frequency.setValueAtTime(3500, playback.audio.currentTime);
                presence.gain.setValueAtTime(2, playback.audio.currentTime);
                presence.Q.setValueAtTime(1.0, playback.audio.currentTime);

                gainNode.connect(busEQ);
                busEQ.connect(presence);
                presence.connect(playback.masterGain);

                playback.soloistEQ = busEQ; // @direct-mutation
            } else if (m.name === 'harmonies') {
                const warmth = playback.audio.createBiquadFilter();
                warmth.type = 'peaking';
                warmth.frequency.setValueAtTime(1200, playback.audio.currentTime);
                warmth.gain.setValueAtTime(2, playback.audio.currentTime);

                const panner = playback.audio.createStereoPanner();
                panner.pan.setValueAtTime(0.2, playback.audio.currentTime);

                gainNode.connect(busEQ);
                busEQ.connect(warmth);
                warmth.connect(panner);
                panner.connect(playback.masterGain);
                playback.harmoniesEQ = busEQ; // @direct-mutation
                playback.harmoniesPanner = panner; // @direct-mutation
            } else if (m.name === 'drums') {
                gainNode.connect(playback.masterGain);
            }

            /** @type {any} */ (playback)[`${m.name}Gain`] = gainNode;

            const reverbGain = playback.audio.createGain();
            const targetReverb = Math.max(0.0001, m.state.reverb);
            reverbGain.gain.setValueAtTime(0.0001, playback.audio.currentTime);
            reverbGain.gain.exponentialRampToValueAtTime(
                targetReverb,
                playback.audio.currentTime + 0.04,
            );
            gainNode.connect(reverbGain);
            reverbGain.connect(
                playback.reverbPreFilter || /** @type {any} */ (playback.reverbNode),
            );
            /** @type {any} */ (playback)[`${m.name}Reverb`] = reverbGain;
        });

        const bufSize = playback.audio.sampleRate * 2;
        /** @type {any} */
        const buffer = playback.audio.createBuffer(1, bufSize, playback.audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        /** @type {any} */ (groove.audioBuffers).noise = buffer;
    }
    if (playback.audio && playback.audio.state === 'suspended') {
        if (playback.audio) {
            playback.audio.resume();
        }
    }
}

/**
 * Kill the chord bus.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 */
export function killChordBus(state) {
    const { playback } = state;
    if (playback.chordsGain && playback.audio) {
        playback.chordsGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.chordsGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

/**
 * Kill the bass bus.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 */
export function killBassBus(state) {
    const { playback } = state;
    if (playback.bassGain && playback.audio) {
        playback.bassGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.bassGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

/**
 * Kill the soloist bus.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 */
export function killSoloistBus(state) {
    const { playback } = state;
    if (playback.soloistGain && playback.audio) {
        playback.soloistGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.soloistGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

/**
 * Kill the harmony bus.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 */
export function killHarmonyBus(state) {
    const { playback } = state;
    if (playback.harmoniesGain && playback.audio) {
        playback.harmoniesGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.harmoniesGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

/**
 * Kill the drum bus.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 */
export function killDrumBus(state) {
    const { playback } = state;
    if (playback.drumsGain && playback.audio) {
        playback.drumsGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.drumsGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

/**
 * Kills all instrument notes immediately.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 */
export async function killAllNotes(state) {
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

/**
 * Restores instrument buses to their state-defined volumes.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 */
export function restoreGains(state) {
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
    modules.forEach((/** @type {any} */ m) => {
        if (m.node && playback.audio) {
            const isLocalMuted = midi.enabled && midi.muteLocal;

            let isMuted = !m.state.enabled;
            if (m.state === soloist && playback.modals?.performance) {
                isMuted = false;
            }
            if (m.name === 'drums' && playback.modals?.drumPad) {
                isMuted = false;
            }

            const target = !isMuted && !isLocalMuted ? m.state.volume * m.mult : 0.0001;
            m.node.gain.cancelScheduledValues(t);
            m.node.gain.setTargetAtTime(target, t, 0.04);
        }
    });
}

let lastAudioTime = 0;
let lastPerfTime = 0;

/**
 * Unified getter for the visualizer clock.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 */
export function getVisualTime(state) {
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
