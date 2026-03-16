import { MIXER_GAIN_MULTIPLIERS, PRO_MIX_MULTIPLIERS } from '../config.js';
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

let isChromium = null;
export function _resetChromiumCheck() {
    isChromium = null;
}

/**
 * Initializes the Web Audio context and global audio nodes.
 * Must be called in response to a user gesture.
 * @param {Object} state - Global ensemble state.
 */
export function initAudio(state) {
    const { playback, groove, chords, bass, soloist, harmony, midi } = state;
    if (!playback.audio || playback.audio.state === 'closed') {
        if (navigator.audioSession) {
            navigator.audioSession.type = 'playback';
        }

        playback.audio = new (window.AudioContext || window.webkitAudioContext)(); // @direct-mutation

        playback.audio.onstatechange = () => {
            if (playback.audio.state === 'suspended' && playback.isPlaying) {
                playback.audio.resume().catch((e) => console.error('[DSP] Auto-resume failed:', e));
            }
        };

        playback.masterGain = playback.audio.createGain(); // @direct-mutation
        const volEl = document.getElementById('masterVolume');
        const initMasterVol = (parseFloat(volEl?.value) || 0.4) * MIXER_GAIN_MULTIPLIERS.master;
        playback.masterGain.gain.setValueAtTime(0.0001, playback.audio.currentTime);
        playback.masterGain.gain.exponentialRampToValueAtTime(
            initMasterVol,
            playback.audio.currentTime + 0.04,
        );

        // Attach the Watchdog
        audioWatchdog.attachToMaster(playback.masterGain);
        audioWatchdog.onRecover = async (pbState, mapState) => {
            await killAllNotes(mapState);
            pbState.audio.close().then(() => {
                pbState.audio = null; // @worker-mutation
                initAudio(mapState);
                restoreGains(mapState);
                if (pbState.masterGain) {
                    audioWatchdog.attachToMaster(pbState.masterGain);
                }
            });
        };
        audioWatchdog.start();

        playback.saturator = playback.audio.createWaveShaper(); // @direct-mutation
        playback.saturator.curve = createSoftClipCurve();
        playback.saturator.oversample = '4x';

        playback.masterLimiter = playback.audio.createDynamicsCompressor(); // @direct-mutation
        playback.masterLimiter.threshold.setValueAtTime(-1.5, playback.audio.currentTime);
        playback.masterLimiter.knee.setValueAtTime(30, playback.audio.currentTime);
        playback.masterLimiter.ratio.setValueAtTime(20, playback.audio.currentTime);
        playback.masterLimiter.attack.setValueAtTime(0.002, playback.audio.currentTime);
        playback.masterLimiter.release.setValueAtTime(0.5, playback.audio.currentTime);

        playback.masterGain.connect(playback.saturator);
        playback.saturator.connect(playback.masterLimiter);
        playback.masterLimiter.connect(playback.audio.destination);

        playback.reverbNode = playback.audio.createConvolver(); // @direct-mutation
        playback.reverbNode.buffer = createReverbImpulse(playback.audio, 1.5, 3.0);
        playback.reverbNode.connect(playback.masterGain);

        // --- Pro Mix: Abbey Road Reverb Filters ---
        const reverbHPF = playback.audio.createBiquadFilter();
        reverbHPF.type = 'highpass';
        reverbHPF.frequency.setValueAtTime(
            playback.useNewMix ? 600 : 20,
            playback.audio.currentTime,
        );

        const reverbLPF = playback.audio.createBiquadFilter();
        reverbLPF.type = 'lowpass';
        reverbLPF.frequency.setValueAtTime(
            playback.useNewMix ? 6000 : 20000,
            playback.audio.currentTime,
        );

        reverbHPF.connect(reverbLPF);
        reverbLPF.connect(playback.reverbNode);
        playback.reverbPreFilter = reverbHPF; // @direct-mutation

        const modules = [
            { name: MODULES.CHORDS, state: chords, mult: MIXER_GAIN_MULTIPLIERS.chords },
            { name: MODULES.BASS, state: bass, mult: MIXER_GAIN_MULTIPLIERS.bass },
            { name: MODULES.SOLOIST, state: soloist, mult: MIXER_GAIN_MULTIPLIERS.soloist },
            { name: MODULES.HARMONIES, state: harmony, mult: MIXER_GAIN_MULTIPLIERS.harmonies },
            { name: 'drums', state: groove, mult: MIXER_GAIN_MULTIPLIERS.drums },
        ];

        modules.forEach((m) => {
            const gainNode = playback.audio.createGain();
            const isLocalMuted = midi.enabled && midi.muteLocal;

            let isMuted = !m.state.enabled;
            if (m.state === soloist && playback.modals?.performance) {
                isMuted = false;
            }
            if (m.name === 'drums' && playback.modals?.drumPad) {
                isMuted = false;
            }

            const mult = playback.useNewMix ? PRO_MIX_MULTIPLIERS[m.name] || m.mult : m.mult;
            const targetGain =
                !isMuted && !isLocalMuted ? Math.max(0.0001, m.state.volume * mult) : 0.0001;
            gainNode.gain.setValueAtTime(0.0001, playback.audio.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(
                targetGain,
                playback.audio.currentTime + 0.04,
            );

            // New Bus Architecture with EQs and Sidechain
            const busEQ = playback.audio.createBiquadFilter();
            busEQ.type = 'highpass';
            busEQ.frequency.setValueAtTime(20, playback.audio.currentTime); // Neutral by default

            if (m.name === 'chords') {
                const lowShelf = playback.audio.createBiquadFilter();
                lowShelf.type = 'lowshelf';
                lowShelf.frequency.setValueAtTime(350, playback.audio.currentTime);
                lowShelf.gain.setValueAtTime(
                    playback.useNewMix ? -2 : -6,
                    playback.audio.currentTime,
                );

                const notch = playback.audio.createBiquadFilter();
                notch.type = 'peaking';
                notch.frequency.setValueAtTime(2500, playback.audio.currentTime);
                notch.Q.setValueAtTime(0.7, playback.audio.currentTime);
                notch.gain.setValueAtTime(playback.useNewMix ? -2 : -4, playback.audio.currentTime);

                const panner = playback.audio.createStereoPanner();
                panner.pan.setValueAtTime(
                    playback.useNewMix ? -0.2 : 0,
                    playback.audio.currentTime,
                );

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
                scoop.gain.setValueAtTime(
                    playback.useNewMix ? -6 : -12,
                    playback.audio.currentTime,
                );

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
                presence.gain.setValueAtTime(
                    playback.useNewMix ? 2 : 4,
                    playback.audio.currentTime,
                );
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
                panner.pan.setValueAtTime(playback.useNewMix ? 0.2 : 0, playback.audio.currentTime);

                gainNode.connect(busEQ);
                busEQ.connect(warmth);
                warmth.connect(panner);
                panner.connect(playback.masterGain);
                playback.harmoniesEQ = busEQ; // @direct-mutation
                playback.harmoniesPanner = panner; // @direct-mutation
            } else if (m.name === 'drums') {
                gainNode.connect(playback.masterGain);
            }

            playback[`${m.name}Gain`] = gainNode;

            const reverbGain = playback.audio.createGain();
            const targetReverb = Math.max(0.0001, m.state.reverb);
            reverbGain.gain.setValueAtTime(0.0001, playback.audio.currentTime);
            reverbGain.gain.exponentialRampToValueAtTime(
                targetReverb,
                playback.audio.currentTime + 0.04,
            );
            gainNode.connect(reverbGain);
            reverbGain.connect(playback.reverbPreFilter || playback.reverbNode);
            playback[`${m.name}Reverb`] = reverbGain;
        });

        const bufSize = playback.audio.sampleRate * 2;
        const buffer = playback.audio.createBuffer(1, bufSize, playback.audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        groove.audioBuffers.noise = buffer;
    }
    if (playback.audio.state === 'suspended') {
        playback.audio.resume();
    }
}

/**
 * Kill the chord bus.
 * @param {Object} state - Global ensemble state.
 */
export function killChordBus(state) {
    const { playback } = state;
    if (playback.chordsGain) {
        playback.chordsGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.chordsGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

/**
 * Kill the bass bus.
 * @param {Object} state - Global ensemble state.
 */
export function killBassBus(state) {
    const { playback } = state;
    if (playback.bassGain) {
        playback.bassGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.bassGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

/**
 * Kill the soloist bus.
 * @param {Object} state - Global ensemble state.
 */
export function killSoloistBus(state) {
    const { playback } = state;
    if (playback.soloistGain) {
        playback.soloistGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.soloistGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

/**
 * Kill the harmony bus.
 * @param {Object} state - Global ensemble state.
 */
export function killHarmonyBus(state) {
    const { playback } = state;
    if (playback.harmoniesGain) {
        playback.harmoniesGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.harmoniesGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

/**
 * Kill the drum bus.
 * @param {Object} state - Global ensemble state.
 */
export function killDrumBus(state) {
    const { playback } = state;
    if (playback.drumsGain) {
        playback.drumsGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.drumsGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

/**
 * Kill all ringing notes and silence all buses.
 * @param {Object} state - Global ensemble state.
 */
export async function killAllNotes(state) {
    killAllPianoNotes(state);
    killSoloistNote(state);
    killBassNote(state);
    killHarmonyNote(state);
    killDrumNote(state);

    killChordBus(state);
    killBassBus(state);
    killSoloistBus(state);
    killHarmonyBus(state);
    killDrumBus(state);

    try {
        const { panic } = await import('../midi-controller.js');
        panic();
    } catch {
        /* ignore panic error */
    }
}

/**
 * Restores instrument buses to their state-defined volumes.
 * @param {Object} state - Global ensemble state.
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
    modules.forEach((m) => {
        if (m.node) {
            const isLocalMuted = midi.enabled && midi.muteLocal;

            let isMuted = !m.state.enabled;
            if (m.state === soloist && playback.modals?.performance) {
                isMuted = false;
            }
            if (m.name === 'drums' && playback.modals?.drumPad) {
                isMuted = false;
            }

            const mult = playback.useNewMix ? PRO_MIX_MULTIPLIERS[m.name] || m.mult : m.mult;
            const target = !isMuted && !isLocalMuted ? m.state.volume * mult : 0.0001;
            m.node.gain.cancelScheduledValues(t);
            m.node.gain.setTargetAtTime(target, t, 0.04);
        }
    });
}

let lastAudioTime = 0;
let lastPerfTime = 0;

/**
 * Unified getter for the visualizer clock.
 * @param {Object} state - Global ensemble state.
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
        isChromium =
            typeof navigator !== 'undefined' &&
            /Chrome/.test(navigator.userAgent) &&
            /Google Inc/.test(navigator.vendor);
    }
    const offset = outputLatency > 0 ? outputLatency : isChromium ? 0.015 : 0.045;

    return smoothAudioTime - offset;
}
