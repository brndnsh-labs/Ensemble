import { MIXER_GAIN_MULTIPLIERS } from '../config.js';
import { MODULES } from '../constants.js';
import type { GlobalContext } from '../state/playback.js';
import type {
    AlgorithmicReverb,
    AudioGraph,
    EnsembleState,
    InstrumentBus,
    Mutable,
} from '../types.js';
import { createSoftClipCurve } from '../utils.js';
import { audioWatchdog } from './audio-recovery.js';
import { createAlgorithmicReverb, REVERB_PRESETS } from './reverb.js';
import { killBassNote, playBassNote } from './synth-bass.js';
// Facade: Re-export synthesis logic from specialized modules
import { killAllPianoNotes, playNote, updateSustain } from './synth-chords.js';
import { killDrumNote, playDrumSound } from './synth-drums.js';
import { killHarmonyNote, playHarmonyNote } from './synth-harmonies.js';
import { killSoloistNote, playSoloNote } from './synth-soloist.js';

export {
    killAllPianoNotes,
    killBassNote,
    killDrumNote,
    killHarmonyNote,
    killSoloistNote,
    playBassNote,
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

        // The audio graph is built into typed locals, then assembled into a
        // single typed `AudioGraph` object and assigned to `playback.audioGraph`
        // once every node exists (see assembly block after the module loop).
        let masterGain: GainNode | null = null;
        let glueCompressor: DynamicsCompressorNode | null = null;
        let saturator: WaveShaperNode | null = null;
        let masterLimiter: DynamicsCompressorNode | null = null;
        let reverb: AlgorithmicReverb | null = null;
        let reverbPreFilter: BiquadFilterNode | null = null;
        const buses: Partial<Record<string, InstrumentBus>> = {};

        if (playback.audio) {
            masterGain = playback.audio.createGain();
            const initMasterVol = (playback.masterVolume || 0.4) * MIXER_GAIN_MULTIPLIERS.master;
            masterGain.gain.setValueAtTime(0.0001, playback.audio.currentTime);
            masterGain.gain.exponentialRampToValueAtTime(
                initMasterVol,
                playback.audio.currentTime + 0.04,
            );
        }

        // Attach the Watchdog
        if (enableWatchdog && masterGain) {
            audioWatchdog.attachToMaster(masterGain, playback);
        }
        if (enableWatchdog) {
            audioWatchdog.onRecover = async (pbState: GlobalContext) => {
                await killAllNotes(state);
                if (pbState.audio) {
                    pbState.audio.close().then(() => {
                        (pbState as Mutable<GlobalContext>).audio = null; // @worker-mutation
                        initAudio(state);
                        restoreGains(state);
                        const recoveredMaster = pbState.audioGraph?.master.gain;
                        if (recoveredMaster) {
                            audioWatchdog.attachToMaster(recoveredMaster, pbState);
                        }
                    });
                }
            };
            audioWatchdog.start(() => state.playback);
        }

        if (playback.audio) {
            // Glue bus compressor (synth-audit Epic 0 S5): a gentle, slow-ish
            // compressor ahead of the brick-wall limiter. When the whole band
            // peaks together it evens the sum out musically, so the limiter
            // doesn't yank everything down — which is what was burying the
            // chord bed. Soft knee + 2:1 ratio + 25 ms attack lets transients
            // through; the threshold is high enough that quiet passages pass
            // untouched.
            glueCompressor = playback.audio.createDynamicsCompressor();
            glueCompressor.threshold.setValueAtTime(-18, playback.audio.currentTime);
            glueCompressor.knee.setValueAtTime(6, playback.audio.currentTime);
            glueCompressor.ratio.setValueAtTime(2, playback.audio.currentTime);
            glueCompressor.attack.setValueAtTime(0.025, playback.audio.currentTime);
            glueCompressor.release.setValueAtTime(0.25, playback.audio.currentTime);

            saturator = playback.audio.createWaveShaper();
            saturator.curve = createSoftClipCurve();
            saturator.oversample = '4x';

            masterLimiter = playback.audio.createDynamicsCompressor();
            masterLimiter.threshold.setValueAtTime(-2.0, playback.audio.currentTime);
            masterLimiter.knee.setValueAtTime(3, playback.audio.currentTime);
            masterLimiter.ratio.setValueAtTime(20, playback.audio.currentTime);
            masterLimiter.attack.setValueAtTime(0.001, playback.audio.currentTime);
            masterLimiter.release.setValueAtTime(0.15, playback.audio.currentTime);
        }

        if (
            masterGain &&
            glueCompressor &&
            saturator &&
            masterLimiter &&
            playback.audio?.destination
        ) {
            masterGain.connect(glueCompressor);
            glueCompressor.connect(saturator);
            saturator.connect(masterLimiter);
            masterLimiter.connect(playback.audio.destination);
        }

        if (playback.audio && masterGain) {
            // Algorithmic reverb (Schroeder/Freeverb), replacing the old static
            // white-noise convolver. Same input/output node contract.
            reverb = createAlgorithmicReverb(playback.audio, REVERB_PRESETS.hall);
            reverb.output.connect(masterGain);

            // --- Pro Mix: Abbey Road Reverb Filters ---
            const reverbHPF = playback.audio.createBiquadFilter();
            reverbHPF.type = 'highpass';
            reverbHPF.frequency.setValueAtTime(600, playback.audio.currentTime);

            const reverbLPF = playback.audio.createBiquadFilter();
            reverbLPF.type = 'lowpass';
            reverbLPF.frequency.setValueAtTime(6000, playback.audio.currentTime);

            reverbHPF.connect(reverbLPF);
            reverbLPF.connect(reverb.input);
            reverbPreFilter = reverbHPF;
        }

        const modules = [
            { name: MODULES.CHORDS, state: chords, mult: MIXER_GAIN_MULTIPLIERS.chords },
            { name: MODULES.BASS, state: bass, mult: MIXER_GAIN_MULTIPLIERS.bass },
            { name: MODULES.SOLOIST, state: soloist, mult: MIXER_GAIN_MULTIPLIERS.soloist },
            { name: MODULES.HARMONIES, state: harmony, mult: MIXER_GAIN_MULTIPLIERS.harmonies },
            { name: 'drums', state: groove, mult: MIXER_GAIN_MULTIPLIERS.drums },
        ];

        modules.forEach((m) => {
            if (!playback.audio || !masterGain) {
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

            // Per-bus struct fields, populated by the branch below. `busEqEntry`
            // is the EQ node the bus struct exposes (chords/bass/soloist/harmonies
            // expose `busEQ`; drums exposes its own highpass).
            let busEqEntry: BiquadFilterNode = busEQ;
            let busPanner: StereoPannerNode | null = null;
            let busSidechain: GainNode | null = null;

            if (m.name === 'chords') {
                const lowShelf = playback.audio.createBiquadFilter();
                lowShelf.type = 'lowshelf';
                lowShelf.frequency.setValueAtTime(350, playback.audio.currentTime);
                lowShelf.gain.setValueAtTime(-2, playback.audio.currentTime);

                // Presence band (synth-audit Epic 0 S5): this used to be a
                // -2 dB *cut* at 2.5 kHz, which scooped out exactly the band
                // the ear uses to localize an instrument — a third mechanism
                // burying the chords. Inverted to a gentle, broad (Q 0.7)
                // +2 dB lift so the chord bed reads through the mix.
                const presence = playback.audio.createBiquadFilter();
                presence.type = 'peaking';
                presence.frequency.setValueAtTime(2500, playback.audio.currentTime);
                presence.Q.setValueAtTime(0.7, playback.audio.currentTime);
                presence.gain.setValueAtTime(2, playback.audio.currentTime);

                const panner = playback.audio.createStereoPanner();
                panner.pan.setValueAtTime(-0.2, playback.audio.currentTime);

                gainNode.connect(busEQ);
                busEQ.connect(lowShelf);
                lowShelf.connect(presence);
                presence.connect(panner);
                panner.connect(masterGain);

                busPanner = panner;
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
                definition.connect(masterGain);

                busSidechain = sidechain;
            } else if (m.name === 'soloist') {
                const presence = playback.audio.createBiquadFilter();
                presence.type = 'peaking';
                presence.frequency.setValueAtTime(3500, playback.audio.currentTime);
                presence.gain.setValueAtTime(2, playback.audio.currentTime);
                presence.Q.setValueAtTime(1.0, playback.audio.currentTime);

                gainNode.connect(busEQ);
                busEQ.connect(presence);
                presence.connect(masterGain);
            } else if (m.name === 'harmonies') {
                // Harmony bus character (synth-audit Epic 1 S5): the old
                // bus was a single +1 dB peaking filter at 1.2 kHz — an
                // inaudible no-op, the thinnest bus in the mixer. Harmony
                // is a *sweetener* layer that should float above the chord
                // comp, so the bus now does two things:
                //
                // 1. Low-mid scoop — peaking 500 Hz, Q 1.0, -3 dB. The
                //    chord bus owns the low-mids (its lowshelf sits at
                //    350 Hz); scooping harmony here keeps it from
                //    competing with the comp and muddying that band.
                const scoop = playback.audio.createBiquadFilter();
                scoop.type = 'peaking';
                scoop.frequency.setValueAtTime(500, playback.audio.currentTime);
                scoop.Q.setValueAtTime(1.0, playback.audio.currentTime);
                scoop.gain.setValueAtTime(-3, playback.audio.currentTime);

                // 2. Air high-shelf — +3 dB from 7.5 kHz up. Sits well
                //    above the chord bus's 2.5 kHz presence lift, so the
                //    harmony gets its own presence/air slot rather than
                //    fighting the chords for the same band.
                const air = playback.audio.createBiquadFilter();
                air.type = 'highshelf';
                air.frequency.setValueAtTime(7500, playback.audio.currentTime);
                air.gain.setValueAtTime(3, playback.audio.currentTime);

                const panner = playback.audio.createStereoPanner();
                panner.pan.setValueAtTime(0.2, playback.audio.currentTime);

                gainNode.connect(busEQ);
                busEQ.connect(scoop);
                scoop.connect(air);
                air.connect(panner);
                panner.connect(masterGain);

                busPanner = panner;
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
                drumsAir.connect(masterGain);

                // Drums route through their own highpass, not the neutral `busEQ`.
                busEqEntry = drumsHP;
            }

            const reverbGain = playback.audio.createGain();
            const targetReverb = Math.max(0.0001, m.state.reverb);
            reverbGain.gain.setValueAtTime(0.0001, playback.audio.currentTime);
            reverbGain.gain.exponentialRampToValueAtTime(
                targetReverb,
                playback.audio.currentTime + 0.04,
            );
            gainNode.connect(reverbGain);
            if (reverbPreFilter) {
                reverbGain.connect(reverbPreFilter);
            } else if (reverb) {
                reverbGain.connect(reverb.input);
            }

            buses[m.name] = {
                gain: gainNode,
                reverb: reverbGain,
                eq: busEqEntry,
                panner: busPanner,
                sidechain: busSidechain,
            };
        });

        // Assemble the typed graph once every node exists.
        if (
            masterGain &&
            glueCompressor &&
            saturator &&
            masterLimiter &&
            reverb &&
            reverbPreFilter &&
            buses.chords &&
            buses.bass &&
            buses.soloist &&
            buses.harmonies &&
            buses.drums
        ) {
            const audioGraph: AudioGraph = {
                master: {
                    gain: masterGain,
                    glue: glueCompressor,
                    saturator,
                    limiter: masterLimiter,
                    reverb,
                    reverbPreFilter,
                },
                chords: buses.chords,
                bass: buses.bass,
                soloist: buses.soloist,
                harmonies: buses.harmonies,
                drums: buses.drums,
            };
            (playback as Mutable<typeof playback>).audioGraph = audioGraph; // @direct-mutation
        }

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

function killBus(state: EnsembleState, bus: InstrumentBus | undefined) {
    const { playback } = state;
    if (bus && playback.audio) {
        bus.gain.gain.cancelScheduledValues(playback.audio.currentTime);
        bus.gain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.005);
    }
}

export function killChordBus(state: EnsembleState) {
    killBus(state, state.playback.audioGraph?.chords);
}

export function killBassBus(state: EnsembleState) {
    killBus(state, state.playback.audioGraph?.bass);
}

export function killSoloistBus(state: EnsembleState) {
    killBus(state, state.playback.audioGraph?.soloist);
}

export function killHarmonyBus(state: EnsembleState) {
    killBus(state, state.playback.audioGraph?.harmonies);
}

export function killDrumBus(state: EnsembleState) {
    killBus(state, state.playback.audioGraph?.drums);
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
    const graph = playback.audioGraph;
    const modules = [
        {
            node: graph?.chords.gain ?? null,
            state: chords,
            mult: MIXER_GAIN_MULTIPLIERS.chords,
            name: 'chords',
        },
        {
            node: graph?.bass.gain ?? null,
            state: bass,
            mult: MIXER_GAIN_MULTIPLIERS.bass,
            name: 'bass',
        },
        {
            node: graph?.soloist.gain ?? null,
            state: soloist,
            mult: MIXER_GAIN_MULTIPLIERS.soloist,
            name: 'soloist',
        },
        {
            node: graph?.harmonies.gain ?? null,
            state: harmony,
            mult: MIXER_GAIN_MULTIPLIERS.harmonies,
            name: 'harmonies',
        },
        {
            node: graph?.drums.gain ?? null,
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
