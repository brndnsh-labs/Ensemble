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

            // Epic 7 S1: pseudo-stereo widener on the reverb wet only. The
            // reverb internal chain is mono (single comb/allpass network), so
            // by default the wet sums to L=R and contributes 0% side energy.
            // Splitting into a direct path (pan -0.5) plus a 12 ms-delayed
            // path (pan +0.5) gives the wet a real stereo image via the Haas
            // precedence effect: source localization is unchanged (dry sources
            // still define where each instrument sits) but the ambient bed
            // develops genuine stereo width. Each path is attenuated 0.5 so
            // the total reverb amplitude matches the original single-path
            // setup; without this the two ±0.5 pan paths sum to ~2.4 dB
            // louder reverb and a noticeably warmer top end. Mono-sum is
            // safe: H(f) = 0.5 + 0.5·e^{-j2π·f·0.012} has full nulls at odd
            // multiples of 41.7 Hz (41.7, 125, 208, 292, 375, 458, 542 Hz);
            // every one falls under the 600 Hz reverbHPF and contributes no
            // audible cancellation. Above 600 Hz the wet picks up a
            // 12 ms-period comb-filter coloring when collapsed to mono,
            // which is the accepted Haas trade for the side-energy gain.
            const widenerGain = 0.5;
            const reverbDirectGain = playback.audio.createGain();
            reverbDirectGain.gain.setValueAtTime(widenerGain, playback.audio.currentTime);
            const reverbDirectPan = playback.audio.createStereoPanner();
            reverbDirectPan.pan.setValueAtTime(-0.5, playback.audio.currentTime);

            const reverbHaasDelay = playback.audio.createDelay(0.05);
            reverbHaasDelay.delayTime.setValueAtTime(0.012, playback.audio.currentTime);
            const reverbDelayedGain = playback.audio.createGain();
            reverbDelayedGain.gain.setValueAtTime(widenerGain, playback.audio.currentTime);
            const reverbDelayedPan = playback.audio.createStereoPanner();
            reverbDelayedPan.pan.setValueAtTime(0.5, playback.audio.currentTime);

            reverb.output.connect(reverbDirectGain);
            reverbDirectGain.connect(reverbDirectPan);
            reverbDirectPan.connect(masterGain);
            reverb.output.connect(reverbHaasDelay);
            reverbHaasDelay.connect(reverbDelayedGain);
            reverbDelayedGain.connect(reverbDelayedPan);
            reverbDelayedPan.connect(masterGain);

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

            // Epic 7 S2 prototype: jazz-ride sits at 91% sub+low vs Miles
            // "So What" reference 47%. A soft bass low-shelf + extra chord
            // low-mid pull-back recovers headroom in the lows for a small
            // sextet feel. Hardcoded conditional for the prototype only —
            // the long-term plumbing (per-scene mix profile) lives in
            // `tmp/overnight-s2-design.md`.
            const isJazz = groove.genreFeel === 'Jazz';

            if (m.name === 'chords') {
                const lowShelf = playback.audio.createBiquadFilter();
                lowShelf.type = 'lowshelf';
                lowShelf.frequency.setValueAtTime(350, playback.audio.currentTime);
                // Jazz: extra -3 dB on top of the standard -2 dB so the chord
                // bus doesn't fight the sextet's natural low-mid space.
                lowShelf.gain.setValueAtTime(isJazz ? -5 : -2, playback.audio.currentTime);

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

                // Epic 7 S1 widened from -0.2 to -0.3: the chord bus needs
                // to carry more side energy because bass is mono by design.
                const panner = playback.audio.createStereoPanner();
                panner.pan.setValueAtTime(-0.3, playback.audio.currentTime);

                gainNode.connect(busEQ);
                busEQ.connect(lowShelf);
                lowShelf.connect(presence);
                presence.connect(panner);
                panner.connect(masterGain);

                busPanner = panner;
            } else if (m.name === 'bass') {
                const sidechain = playback.audio.createGain();
                sidechain.gain.setValueAtTime(1.0, playback.audio.currentTime);

                // Epic 7 S2 prototype: jazz uses an upright/double-bass voicing
                // that doesn't carry the same sub-bass weight as a finger or
                // pick electric. Push the bus highpass up from 20 → 55 Hz and
                // flatten the +2 dB low-shelf to -1 dB so the bass sits in
                // the upper-bass register where a jazz bass actually lives.
                if (isJazz) {
                    busEQ.frequency.setValueAtTime(55, playback.audio.currentTime);
                }

                const weight = playback.audio.createBiquadFilter();
                weight.type = 'lowshelf';
                weight.frequency.setValueAtTime(100, playback.audio.currentTime);
                weight.gain.setValueAtTime(isJazz ? -1 : 2, playback.audio.currentTime);

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

                // Epic 7 S1: place the lead opposite the chord bus (-0.3) so
                // the soloist owns its own slot. Per-note jitter in
                // synth-soloist.ts (±0.05) cascades through this bus panner,
                // which gives the lead an audible drift around +0.25 (not a
                // strict sum — each cascaded StereoPannerNode re-positions
                // its own input rather than adding). Pan at +0.25 contributes
                // ~4% side energy from a single source; the goal is full-mix
                // sideRatio ≥ 0.03 across all scenes, and bass is mono by
                // design (low frequencies don't localize), so the other buses
                // carry the side budget.
                const panner = playback.audio.createStereoPanner();
                panner.pan.setValueAtTime(0.25, playback.audio.currentTime);

                gainNode.connect(busEQ);
                busEQ.connect(presence);
                presence.connect(panner);
                panner.connect(masterGain);

                busPanner = panner;
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

                // Epic 7 S1 widened from +0.2 to +0.3: harmony stays opposite
                // the chord bus (-0.3) and gives the upper-mid air content
                // a dedicated right-side slot.
                const panner = playback.audio.createStereoPanner();
                panner.pan.setValueAtTime(0.3, playback.audio.currentTime);

                gainNode.connect(busEQ);
                busEQ.connect(scoop);
                scoop.connect(air);
                air.connect(panner);
                panner.connect(masterGain);

                busPanner = panner;
            } else if (m.name === 'drums') {
                const drumsHP = playback.audio.createBiquadFilter();
                drumsHP.type = 'highpass';
                // Epic 7 S2 prototype: jazz scenes use a softer kick voicing —
                // pull the drum-bus highpass from 40 → 95 Hz to roll off the
                // kick's sub-bass content. Combined with the bass-bus changes
                // above, brings jazz-ride sub+low closer to the Miles
                // reference (47%). Non-jazz scenes keep 40 Hz.
                drumsHP.frequency.setValueAtTime(isJazz ? 95 : 40, playback.audio.currentTime);

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
    if (!usingOfflineContext && playback.audio && playback.audio.state === 'suspended') {
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
