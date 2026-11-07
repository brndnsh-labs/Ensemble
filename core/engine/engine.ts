import { MASTER_MAKEUP_DB, MIXER_GAIN_MULTIPLIERS } from '../config.js';
import { MODULES } from '../constants.js';
import { reverbSendForPack } from '../data/sound-packs.js';
import type { GlobalContext } from '../state/playback.js';
import type {
    AlgorithmicReverb,
    AudioGraph,
    EnsembleState,
    InstrumentBus,
    InstrumentModule,
    InstrumentVoice,
    Mutable,
} from '../types.js';
import { audioWatchdog } from './audio-recovery.js';
import { MODULE_BUS_KEY, packIdFromVoice } from './instrument-registry.js';
import { wireMasterLimiter } from './master-limiter.js';
import { ensurePacksForVoices } from './pack-runtime.js';
import { createAlgorithmicReverb, REVERB_PRESETS } from './reverb.js';
import { isInstrumentEverActive } from './section-overrides.js';
import { killBassNote } from './synth-bass.js';
// Facade: Re-export synthesis logic from specialized modules
import { killAllPianoNotes, playNote } from './synth-chords.js';
import { killDrumNote } from './synth-drums.js';
import { killSoloistNote } from './synth-soloist.js';

export { killAllPianoNotes, killBassNote, killDrumNote, killSoloistNote, playNote };

export function initAudio(
    state: EnsembleState,
    options: { audioContext?: AudioContext; enableWatchdog?: boolean } = {},
) {
    const { playback, groove, chords, bass, soloist } = state;
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
        let makeupGain: GainNode | null = null;
        let volumeGain: GainNode | null = null;
        let reverb: AlgorithmicReverb | null = null;
        let reverbPreFilter: BiquadFilterNode | null = null;
        const buses: Partial<Record<string, InstrumentBus>> = {};

        if (playback.audio) {
            // The bus sum's level into the glue compressor: fixed since #2002, when the master
            // volume moved after the limiter. The fade-in from silence is the one the master
            // always had.
            masterGain = playback.audio.createGain();
            masterGain.gain.setValueAtTime(0.0001, playback.audio.currentTime);
            masterGain.gain.exponentialRampToValueAtTime(
                MIXER_GAIN_MULTIPLIERS.master,
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
                        (pbState as Mutable<GlobalContext>).audio = null; // @direct-mutation
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

            // #2002: the style's make-up gain, so every style plays at about the same loudness
            // (`MASTER_MAKEUP_DB`), then the look-ahead true-peak limiter (`master-limiter.ts`),
            // then the master volume: a plain level after the limiter, so the slider turns the
            // band down and never drives it into the ceiling. The soft-clip waveshaper and the
            // brick-wall `DynamicsCompressorNode` that used to end the chain are gone: at 100%
            // they hit 0 dBTP with audible distortion, and the slider was a drive knob.
            makeupGain = playback.audio.createGain();
            makeupGain.gain.setValueAtTime(makeupFor(state), playback.audio.currentTime);
            volumeGain = playback.audio.createGain();
            volumeGain.gain.setValueAtTime(
                masterVolumeGain(playback.masterVolume),
                playback.audio.currentTime,
            );
        }

        if (
            masterGain &&
            glueCompressor &&
            makeupGain &&
            volumeGain &&
            playback.audio?.destination
        ) {
            masterGain.connect(glueCompressor);
            glueCompressor.connect(makeupGain);
            // The limiter's module loads asynchronously; the gap between the make-up gain and
            // the volume is closed when it has (`masterChainReady` says when).
            void wireMasterLimiter(playback.audio, makeupGain, volumeGain);
            volumeGain.connect(playback.audio.destination);
        }

        if (playback.audio && masterGain) {
            // Algorithmic reverb (Schroeder/Freeverb), replacing the old static
            // white-noise convolver. Same input/output node contract.
            reverb = createAlgorithmicReverb(playback.audio, REVERB_PRESETS.hall);

            // Epic 7 S1 follow-up: reverb is now natively stereo (independent
            // L/R comb networks with offset tunings inside `reverb.ts`), so
            // the wet picks up genuinely uncorrelated side energy at the
            // source. The earlier Haas widener (a 12 ms-delayed copy panned
            // ±0.5) only nudged the side ratio from ~0% to 1.4% on funk
            // because the two paths still correlated ~1 with each other.
            // True-stereo comb banks drive the L/R correlation down at every
            // frequency the combs resonate at — moving funk full+solo from
            // 1.4% to the ≥ 3.0% target without changing any source position.
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
            {
                name: MODULES.CHORDS,
                key: 'chords' as const,
                state: chords,
                mult: MIXER_GAIN_MULTIPLIERS.chords,
            },
            {
                name: MODULES.BASS,
                key: 'bass' as const,
                state: bass,
                mult: MIXER_GAIN_MULTIPLIERS.bass,
            },
            {
                name: MODULES.SOLOIST,
                key: 'soloist' as const,
                state: soloist,
                mult: MIXER_GAIN_MULTIPLIERS.soloist,
            },
            {
                name: 'drums',
                key: 'groove' as const,
                state: groove,
                mult: MIXER_GAIN_MULTIPLIERS.drums,
            },
        ];

        modules.forEach((m) => {
            if (!playback.audio || !masterGain) {
                return;
            }
            const gainNode = playback.audio.createGain();

            const isMuted = !isInstrumentEverActive(state, m.key);

            const targetGain = !isMuted ? Math.max(0.0001, m.state.volume * m.mult) : 0.0001;
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
            // is the EQ node the bus struct exposes (chords/bass/soloist
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
            const eq = busEqFor(state);
            let busShelf: BiquadFilterNode | null = null;

            if (m.name === 'chords') {
                const lowShelf = playback.audio.createBiquadFilter();
                lowShelf.type = 'lowshelf';
                lowShelf.frequency.setValueAtTime(350, playback.audio.currentTime);
                // Jazz: extra -3 dB on top of the standard -2 dB so the chord
                // bus doesn't fight the sextet's natural low-mid space.
                lowShelf.gain.setValueAtTime(eq.chordsShelfDb, playback.audio.currentTime);

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
                busShelf = lowShelf;
            } else if (m.name === 'bass') {
                const sidechain = playback.audio.createGain();
                sidechain.gain.setValueAtTime(1.0, playback.audio.currentTime);

                // Epic 7 S2 prototype: jazz uses an upright/double-bass voicing
                // that doesn't carry the same sub-bass weight as a finger or
                // pick electric. Push the bus highpass up from 20 → 55 Hz and
                // flatten the +2 dB low-shelf to -1 dB so the bass sits in
                // the upper-bass register where a jazz bass actually lives.
                busEQ.frequency.setValueAtTime(eq.bassHighpassHz, playback.audio.currentTime);

                const weight = playback.audio.createBiquadFilter();
                weight.type = 'lowshelf';
                weight.frequency.setValueAtTime(100, playback.audio.currentTime);
                weight.gain.setValueAtTime(eq.bassWeightDb, playback.audio.currentTime);

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
                busShelf = weight;
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
            } else if (m.name === 'drums') {
                const drumsHP = playback.audio.createBiquadFilter();
                drumsHP.type = 'highpass';
                // Epic 7 S2 prototype: jazz scenes use a softer kick voicing —
                // pull the drum-bus highpass from 40 → 95 Hz to roll off the
                // kick's sub-bass content. Combined with the bass-bus changes
                // above, brings jazz-ride sub+low closer to the Miles
                // reference (47%). Non-jazz scenes keep 40 Hz.
                drumsHP.frequency.setValueAtTime(eq.drumsHighpassHz, playback.audio.currentTime);

                // why (low-end declutter): a bell cut in the ~120 Hz mud band where
                // tom fundamentals (~92-188 Hz) and the kick's body (~54-174 Hz)
                // pile onto a bass guitar's most-played register, blurring the
                // low end — worst with the sampled acoustic kit, whose recorded
                // toms carry natural sustain a synth voice doesn't (and which the
                // per-voice synth-drums tom trim can't reach). This sits on the
                // shared drum bus, so it treats BOTH the synth and sampled paths
                // (and any future pack) in one place. A peaking (not shelf) cut
                // is deliberate: it carves the mud while leaving the kick's deep
                // sub-thump below it and the snare crack above it intact, so the
                // kit stays punchy and full — it just stops fighting the bass.
                // Q 0.8 spans ~80-180 Hz; gain is a conservative first pass tuned
                // by ear on the test box.
                const drumsMud = playback.audio.createBiquadFilter();
                drumsMud.type = 'peaking';
                drumsMud.frequency.setValueAtTime(120, playback.audio.currentTime);
                drumsMud.Q.setValueAtTime(0.8, playback.audio.currentTime);
                drumsMud.gain.setValueAtTime(-2.5, playback.audio.currentTime);

                const drumsAir = playback.audio.createBiquadFilter();
                drumsAir.type = 'peaking';
                drumsAir.frequency.setValueAtTime(5000, playback.audio.currentTime);
                drumsAir.Q.setValueAtTime(1.2, playback.audio.currentTime);
                drumsAir.gain.setValueAtTime(2, playback.audio.currentTime);

                gainNode.connect(drumsHP);
                drumsHP.connect(drumsMud);
                drumsMud.connect(drumsAir);
                drumsAir.connect(masterGain);

                // Drums route through their own highpass, not the neutral `busEQ`.
                busEqEntry = drumsHP;
            }

            const reverbGain = playback.audio.createGain();
            // #686 — scale the bus send by the active voice's pack multiplier so
            // a dry pack gets more hall / a roomy pack less; synth voice → ×1.
            const targetReverb = reverbSendTarget(m.state.reverb, m.state.voice);
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
                shelf: busShelf,
                panner: busPanner,
                sidechain: busSidechain,
            };
        });

        // Assemble the typed graph once every node exists.
        if (
            masterGain &&
            glueCompressor &&
            makeupGain &&
            volumeGain &&
            reverb &&
            reverbPreFilter &&
            buses.chords &&
            buses.bass &&
            buses.soloist &&
            buses.drums
        ) {
            const audioGraph: AudioGraph = {
                master: {
                    gain: masterGain,
                    glue: glueCompressor,
                    makeup: makeupGain,
                    volume: volumeGain,
                    reverb,
                    reverbPreFilter,
                },
                chords: buses.chords,
                bass: buses.bass,
                soloist: buses.soloist,
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
        // The white-noise buffer is a one-shot audio asset cached on the slice during
        // initAudio(), before any dispatch subscriber exists — the same init-only
        // sanctioned category as the `audioGraph` write above.
        (groove.audioBuffers as unknown as Record<string, AudioBuffer>).noise = buffer; // @direct-mutation
    }
    if (!usingOfflineContext && playback.audio && playback.audio.state === 'suspended') {
        if (playback.audio) {
            playback.audio.resume();
        }
    }

    // #666 — load any selected `pack:<id>` voice as soon as audio is live, on
    // whatever path brought audio up (play, preview, performance). Idempotent;
    // a persisted pack voice would otherwise stay unloaded (silent synth
    // fallback) until the Sounds panel dispatched ACTIONS.INIT_AUDIO (deleted, #1381). Offline
    // render/export contexts manage packs explicitly, so they're excluded.
    if (!usingOfflineContext && playback.audio) {
        ensurePacksForVoices(playback.audio, [
            chords.voice,
            bass.voice,
            soloist.voice,
            groove.voice,
        ]);
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
}

export function restoreGains(state: EnsembleState) {
    const { playback, chords, bass, soloist, groove } = state;
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
            key: 'chords' as const,
        },
        {
            node: graph?.bass.gain ?? null,
            state: bass,
            mult: MIXER_GAIN_MULTIPLIERS.bass,
            name: 'bass',
            key: 'bass' as const,
        },
        {
            node: graph?.soloist.gain ?? null,
            state: soloist,
            mult: MIXER_GAIN_MULTIPLIERS.soloist,
            name: 'soloist',
            key: 'soloist' as const,
        },
        {
            node: graph?.drums.gain ?? null,
            state: groove,
            mult: MIXER_GAIN_MULTIPLIERS.drums,
            name: 'drums',
            key: 'groove' as const,
        },
    ];
    modules.forEach((m) => {
        if (m.node && playback.audio) {
            const isMuted = !isInstrumentEverActive(state, m.key);

            const target = !isMuted ? m.state.volume * m.mult : 0.0001;
            m.node.gain.cancelScheduledValues(t);
            m.node.gain.setTargetAtTime(target, t, 0.04);
        }
    });
    // The style's make-up gain is a gain the graph holds too (#2002). Opening a chart sets its
    // genre while the runtime's dispatch subscriber is off (`load`), so no genre effect runs:
    // every rebuild restores the make-up for the style now set, as it restores the buses.
    syncMasterMakeup(state);
    syncBusEq(state);
}

/**
 * Effective bus reverb send (#686): the lane's reverb value scaled by the active
 * voice's per-pack multiplier. Synth voice → ×1 (unchanged). Floored above 0 so
 * the exponential init ramp never targets zero.
 */
function reverbSendTarget(reverb: number, voice: InstrumentVoice): number {
    return Math.max(0.0001, reverb * reverbSendForPack(packIdFromVoice(voice)));
}

/**
 * Re-trim a lane's live bus reverb send for its current voice (#686). Called on
 * a voice change (manual pick or auto-follow) so a pack's send takes effect
 * immediately rather than only at the next `initAudio`. No-op before the graph
 * exists.
 */
export function syncBusReverbSend(state: EnsembleState, module: InstrumentModule): void {
    const { playback } = state;
    const graph = playback.audioGraph;
    if (!playback.audio || !graph) {
        return;
    }
    const inst = state[module];
    const bus = graph[MODULE_BUS_KEY[module]];
    const t = playback.audio.currentTime;
    bus.reverb.gain.cancelScheduledValues(t);
    bus.reverb.gain.setTargetAtTime(reverbSendTarget(inst.reverb, inst.voice), t, 0.04);
}

/**
 * Re-trim a lane's live bus gain for its current volume slider (#1111). Only
 * the reverb send had a live-ramp path (#688); volume silently only took
 * effect at the next `restoreGains`/`initAudio` (a mute toggle, transport
 * start). Mirrors `syncBusReverbSend`'s per-module surgical update instead of
 * calling `restoreGains` for every lane on a single slider drag.
 */
export function syncBusVolume(state: EnsembleState, module: InstrumentModule): void {
    const { playback } = state;
    const graph = playback.audioGraph;
    if (!playback.audio || !graph) {
        return;
    }
    const inst = state[module];
    const busKey = MODULE_BUS_KEY[module];
    const bus = graph[busKey];
    const mult = MIXER_GAIN_MULTIPLIERS[busKey];
    const isMuted = !isInstrumentEverActive(state, module);
    const target = !isMuted ? Math.max(0.0001, inst.volume * mult) : 0.0001;
    const t = playback.audio.currentTime;
    bus.gain.gain.cancelScheduledValues(t);
    bus.gain.gain.setTargetAtTime(target, t, 0.04);
}

/**
 * The master volume's gain: the slider's value as a plain linear level after the limiter (#2002),
 * 1 being the band at its full calibrated loudness. A non-finite value falls back to full, and
 * the floor keeps the exponential ramps off zero.
 */
function masterVolumeGain(value: number | null | undefined): number {
    const level = typeof value === 'number' && Number.isFinite(value) ? value : 1;
    return Math.max(0.0001, Math.min(1, level));
}

/**
 * The make-up gain for the style playing (`groove.lastSmartGenre`, one of the 13 genre names),
 * linear. Looked up with `Object.hasOwn` (the persisted genre is untrusted, #1266); a genre with
 * no entry plays at 0 dB.
 */
function makeupFor(state: EnsembleState): number {
    const genre = state.groove.lastSmartGenre;
    const db =
        typeof genre === 'string' && Object.hasOwn(MASTER_MAKEUP_DB, genre)
            ? MASTER_MAKEUP_DB[genre as keyof typeof MASTER_MAKEUP_DB]
            : 0;
    return Number.isFinite(db) ? 10 ** (db / 20) : 1;
}

/**
 * Live-ramp the master volume to `playback.masterVolume`. Sibling of `syncBusVolume` — #1128
 * moved this out of v1's `Settings.tsx handleMasterVolume` into a `handleEffects` case, so any
 * non-slider writer also gets the ramp. An exponential ramp over 40 ms, as it always was; since
 * #2002 it moves the post-limiter volume, not the level into the master chain.
 */
export function syncMasterVolume(state: EnsembleState): void {
    const { playback } = state;
    const graph = playback.audioGraph;
    if (!playback.audio || !graph) {
        return;
    }
    const volume = graph.master.volume;
    const target = masterVolumeGain(playback.masterVolume);
    const t = playback.audio.currentTime;
    volume.gain.cancelScheduledValues(t);
    volume.gain.setValueAtTime(Math.max(0.0001, volume.gain.value), t);
    volume.gain.exponentialRampToValueAtTime(target, t + 0.04);
}

/**
 * Glide the master make-up gain to the style now set (#2002): on a genre change and on every
 * `restoreGains`. The glide starts when the genre is set — at the press, since the reducer writes
 * `lastSmartGenre` at once — not at the barline where a playing band takes the new style, so it
 * can lead the music by up to a bar; a quarter second's time constant keeps that a fade, not a
 * jump. Once it has settled, a repeat call changes nothing.
 */
export function syncMasterMakeup(state: EnsembleState): void {
    const { playback } = state;
    const graph = playback.audioGraph;
    if (!playback.audio || !graph) {
        return;
    }
    const t = playback.audio.currentTime;
    graph.master.makeup.gain.cancelScheduledValues(t);
    graph.master.makeup.gain.setTargetAtTime(makeupFor(state), t, 0.25);
}

/**
 * The bus EQ values that follow the playing style (#2106). Jazz plays an upright bass and a
 * softer kick, so its bus tone differs from every other style's: the chord bus's low shelf pulls
 * back 3 dB more, the bass bus trades its +2 dB weight shelf for -1 dB and its 20 Hz highpass for
 * 55 Hz, and the drum bus highpass rises from 40 to 95 Hz (the reasons are at the `initAudio`
 * sites that apply them). Keyed on `groove.genreFeel`, the feel the band is playing.
 */
function busEqFor(state: EnsembleState): {
    chordsShelfDb: number;
    bassHighpassHz: number;
    bassWeightDb: number;
    drumsHighpassHz: number;
} {
    return state.groove.genreFeel === 'Jazz'
        ? { chordsShelfDb: -5, bassHighpassHz: 55, bassWeightDb: -1, drumsHighpassHz: 95 }
        : { chordsShelfDb: -2, bassHighpassHz: 20, bassWeightDb: 2, drumsHighpassHz: 40 };
}

/**
 * Glide the style-dependent bus EQ to the feel now set (#2106): on a genre change and on every
 * `restoreGains`. `initAudio` reads the feel once per AudioContext, so without this a session
 * that switched genre kept the EQ of the one it started on. The same shape as
 * `syncMasterMakeup`; a short time constant keeps a filter change a glide, not a step. No-op
 * before the audio graph exists.
 */
export function syncBusEq(state: EnsembleState): void {
    const { playback } = state;
    const graph = playback.audioGraph;
    if (!playback.audio || !graph) {
        return;
    }
    const t = playback.audio.currentTime;
    const eq = busEqFor(state);
    const glide = (param: AudioParam, value: number) => {
        param.cancelScheduledValues(t);
        param.setTargetAtTime(value, t, 0.05);
    };
    if (graph.chords.shelf) {
        glide(graph.chords.shelf.gain, eq.chordsShelfDb);
    }
    glide(graph.bass.eq.frequency, eq.bassHighpassHz);
    if (graph.bass.shelf) {
        glide(graph.bass.shelf.gain, eq.bassWeightDb);
    }
    glide(graph.drums.eq.frequency, eq.drumsHighpassHz);
}
