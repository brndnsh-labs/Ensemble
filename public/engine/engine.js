import { audioWatchdog } from '../audio-recovery.js';
import { MIXER_GAIN_MULTIPLIERS } from '../config.js';
import { getState } from '../state.js';
import { createReverbImpulse, createSoftClipCurve } from '../utils.js';
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

export { playNote, playChordScratch, updateSustain, killAllPianoNotes, INSTRUMENT_PRESETS };
export { playBassNote, killBassNote };
export { playSoloNote, killSoloistNote };
export { playHarmonyNote, killHarmonyNote };
export { playDrumSound, killDrumNote };

let isChromium = null;
export function _resetChromiumCheck() {
    isChromium = null;
}

/**
 * Initializes the Web Audio context and global audio nodes.
 * Must be called in response to a user gesture.
 */
export function initAudio() {
    const { playback, groove, chords, bass, soloist, harmony, midi } = getState();
    if (!playback.audio || playback.audio.state === 'closed') {
        if (navigator.audioSession) {
            navigator.audioSession.type = 'playback';
        }

        playback.audio = new (window.AudioContext || window.webkitAudioContext)();

        playback.audio.onstatechange = () => {
            // console.log(`[DSP] AudioContext state changed to: ${playback.audio.state}`);
            if (playback.audio.state === 'suspended' && playback.isPlaying) {
                // console.log("[DSP] Unexpected suspension. Attempting auto-resume...");
                playback.audio.resume().catch((e) => console.error('[DSP] Auto-resume failed:', e));
            }
        };

        playback.masterGain = playback.audio.createGain();
        const volEl = document.getElementById('masterVolume');
        const initMasterVol = (parseFloat(volEl?.value) || 0.4) * MIXER_GAIN_MULTIPLIERS.master;
        playback.masterGain.gain.setValueAtTime(0.0001, playback.audio.currentTime);
        playback.masterGain.gain.exponentialRampToValueAtTime(
            initMasterVol,
            playback.audio.currentTime + 0.04,
        );

        // Attach the Watchdog
        audioWatchdog.attachToMaster(playback.masterGain);
        audioWatchdog.start();

        playback.saturator = playback.audio.createWaveShaper();
        playback.saturator.curve = createSoftClipCurve();
        playback.saturator.oversample = '4x';

        playback.masterLimiter = playback.audio.createDynamicsCompressor();
        playback.masterLimiter.threshold.setValueAtTime(-1.5, playback.audio.currentTime);
        playback.masterLimiter.knee.setValueAtTime(30, playback.audio.currentTime);
        playback.masterLimiter.ratio.setValueAtTime(20, playback.audio.currentTime);
        playback.masterLimiter.attack.setValueAtTime(0.002, playback.audio.currentTime);
        playback.masterLimiter.release.setValueAtTime(0.5, playback.audio.currentTime);

        playback.masterGain.connect(playback.saturator);
        playback.saturator.connect(playback.masterLimiter);
        playback.masterLimiter.connect(playback.audio.destination);

        playback.reverbNode = playback.audio.createConvolver();
        playback.reverbNode.buffer = createReverbImpulse(playback.audio, 1.5, 3.0);
        playback.reverbNode.connect(playback.masterGain);

        const modules = [
            { name: 'chords', state: chords, mult: MIXER_GAIN_MULTIPLIERS.chords },
            { name: 'bass', state: bass, mult: MIXER_GAIN_MULTIPLIERS.bass },
            { name: 'soloist', state: soloist, mult: MIXER_GAIN_MULTIPLIERS.soloist },
            { name: 'harmonies', state: harmony, mult: MIXER_GAIN_MULTIPLIERS.harmonies },
            { name: 'drums', state: groove, mult: MIXER_GAIN_MULTIPLIERS.drums },
        ];

        modules.forEach((m) => {
            const gainNode = playback.audio.createGain();
            const isLocalMuted = midi.enabled && midi.muteLocal;
            const targetGain =
                m.state.enabled && !isLocalMuted
                    ? Math.max(0.0001, m.state.volume * m.mult)
                    : 0.0001;
            gainNode.gain.setValueAtTime(0.0001, playback.audio.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(
                targetGain,
                playback.audio.currentTime + 0.04,
            );

            if (m.name === 'chords') {
                const hp = playback.audio.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.setValueAtTime(180, playback.audio.currentTime);

                const lowShelf = playback.audio.createBiquadFilter();
                lowShelf.type = 'lowshelf';
                lowShelf.frequency.setValueAtTime(350, playback.audio.currentTime);
                lowShelf.gain.setValueAtTime(-6, playback.audio.currentTime); // Reduce mud

                const notch = playback.audio.createBiquadFilter();
                notch.type = 'peaking';
                notch.frequency.setValueAtTime(2500, playback.audio.currentTime);
                notch.Q.setValueAtTime(0.7, playback.audio.currentTime);
                notch.gain.setValueAtTime(-4, playback.audio.currentTime);

                gainNode.connect(hp);
                hp.connect(lowShelf);
                lowShelf.connect(notch);
                notch.connect(playback.masterGain);
                playback.chordsEQ = hp;
            } else if (m.name === 'bass') {
                const weight = playback.audio.createBiquadFilter();
                weight.type = 'lowshelf';
                weight.frequency.setValueAtTime(100, playback.audio.currentTime);
                weight.gain.setValueAtTime(2, playback.audio.currentTime);

                const scoop = playback.audio.createBiquadFilter();
                scoop.type = 'peaking';
                scoop.frequency.setValueAtTime(450, playback.audio.currentTime); // Slightly lower scoop
                scoop.Q.setValueAtTime(1.2, playback.audio.currentTime);
                scoop.gain.setValueAtTime(-12, playback.audio.currentTime); // Clear room for low-mids

                const definition = playback.audio.createBiquadFilter();
                definition.type = 'peaking';
                definition.frequency.setValueAtTime(2000, playback.audio.currentTime);
                definition.Q.setValueAtTime(1.2, playback.audio.currentTime);
                definition.gain.setValueAtTime(3, playback.audio.currentTime);

                const comp = playback.audio.createDynamicsCompressor();
                comp.threshold.setValueAtTime(-16, playback.audio.currentTime);
                comp.knee.setValueAtTime(12, playback.audio.currentTime);
                comp.ratio.setValueAtTime(4, playback.audio.currentTime);
                comp.attack.setValueAtTime(0.005, playback.audio.currentTime);
                comp.release.setValueAtTime(0.125, playback.audio.currentTime);

                gainNode.connect(weight);
                weight.connect(scoop);
                scoop.connect(definition);
                definition.connect(comp);
                comp.connect(playback.masterGain);
                playback.bassEQ = weight;
            } else if (m.name === 'soloist') {
                const presence = playback.audio.createBiquadFilter();
                presence.type = 'peaking';
                presence.frequency.setValueAtTime(3500, playback.audio.currentTime);
                presence.gain.setValueAtTime(4, playback.audio.currentTime); // Cut through the mix
                presence.Q.setValueAtTime(1.0, playback.audio.currentTime);

                const air = playback.audio.createBiquadFilter();
                air.type = 'highshelf';
                air.frequency.setValueAtTime(8000, playback.audio.currentTime);
                air.gain.setValueAtTime(3, playback.audio.currentTime);

                gainNode.connect(presence);
                presence.connect(air);
                air.connect(playback.masterGain);
                playback.soloistEQ = presence;
            } else if (m.name === 'harmonies') {
                const hp = playback.audio.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.setValueAtTime(300, playback.audio.currentTime); // Keep it above bass/piano fundamentals

                const warmth = playback.audio.createBiquadFilter();
                warmth.type = 'peaking';
                warmth.frequency.setValueAtTime(1200, playback.audio.currentTime);
                warmth.gain.setValueAtTime(2, playback.audio.currentTime);

                gainNode.connect(hp);
                hp.connect(warmth);
                warmth.connect(playback.masterGain);
                playback.harmoniesEQ = hp;
            } else if (m.name === 'drums') {
                // Parallel-style Drum Compression (Internal Routing)
                const drumComp = playback.audio.createDynamicsCompressor();
                drumComp.threshold.setValueAtTime(-20, playback.audio.currentTime);
                drumComp.ratio.setValueAtTime(8, playback.audio.currentTime);
                drumComp.attack.setValueAtTime(0.001, playback.audio.currentTime);
                drumComp.release.setValueAtTime(0.1, playback.audio.currentTime);

                gainNode.connect(drumComp);
                drumComp.connect(playback.masterGain);
                // Also connect dry for punch
                gainNode.connect(playback.masterGain);
            } else {
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
            reverbGain.connect(playback.reverbNode);
            playback[`${m.name}Reverb`] = reverbGain;
        });

        const bufSize = playback.audio.sampleRate * 2;
        const buffer = playback.audio.createBuffer(1, bufSize, playback.audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        groove.audioBuffers.noise = buffer;

        // console.log(`[DSP] Audio Context Initialized: SampleRate=${playback.audio.sampleRate}, Latency=${(playback.audio.baseLatency * 1000).toFixed(1)}ms`);
    }
    if (playback.audio.state === 'suspended') {
        playback.audio.resume();
    }
}

export function killChordBus() {
    const { playback } = getState();
    if (playback.chordsGain) {
        playback.chordsGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.chordsGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

export function killBassBus() {
    const { playback } = getState();
    if (playback.bassGain) {
        playback.bassGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.bassGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

export function killSoloistBus() {
    const { playback } = getState();
    if (playback.soloistGain) {
        playback.soloistGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.soloistGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

export function killHarmonyBus() {
    const { playback } = getState();
    if (playback.harmoniesGain) {
        playback.harmoniesGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.harmoniesGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

export function killDrumBus() {
    const { playback } = getState();
    if (playback.drumsGain) {
        playback.drumsGain.gain.cancelScheduledValues(playback.audio.currentTime);
        playback.drumsGain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

export async function killAllNotes() {
    killAllPianoNotes();
    killSoloistNote();
    killBassNote();
    killHarmonyNote();
    killDrumNote();

    killChordBus();
    killBassBus();
    killSoloistBus();
    killHarmonyBus();
    killDrumBus();

    try {
        const { panic } = await import('../midi-controller.js');
        panic();
    } catch {
        /* ignore panic error */
    }
}

/**
 * Restores instrument buses to their state-defined volumes.
 */
export function restoreGains() {
    const { playback, chords, bass, soloist, harmony, groove, midi } = getState();
    if (!playback.audio) {
        return;
    }
    const t = playback.audio.currentTime;
    const modules = [
        { node: playback.chordsGain, state: chords, mult: MIXER_GAIN_MULTIPLIERS.chords },
        { node: playback.bassGain, state: bass, mult: MIXER_GAIN_MULTIPLIERS.bass },
        { node: playback.soloistGain, state: soloist, mult: MIXER_GAIN_MULTIPLIERS.soloist },
        { node: playback.harmoniesGain, state: harmony, mult: MIXER_GAIN_MULTIPLIERS.harmonies },
        { node: playback.drumsGain, state: groove, mult: MIXER_GAIN_MULTIPLIERS.drums },
    ];
    modules.forEach((m) => {
        if (m.node) {
            const isLocalMuted = midi.enabled && midi.muteLocal;
            const target = m.state.enabled && !isLocalMuted ? m.state.volume * m.mult : 0.0001;
            m.node.gain.cancelScheduledValues(t);
            m.node.gain.setTargetAtTime(target, t, 0.04);
        }
    });
}

let lastAudioTime = 0;
let lastPerfTime = 0;

export function getVisualTime() {
    const { playback } = getState();
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
