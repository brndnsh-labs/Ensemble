import type { EnsembleState, Mutable } from '../types.js';
import { safeDisconnect } from '../utils.js';
import {
    createSimplePanner,
    HUMANIZE_PROFILES,
    humanizeNote,
    humanizeSeed,
    playPercussiveStrike,
    playResonantTone,
    rampGain,
    velocityTimbre,
} from './synth-utils.js';

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

// synth-audit Epic 2 S3 — the velocity "bright" wave. Energy is concentrated
// in partials 3-7 with a deliberately light fundamental, so layering it adds
// upper-harmonic shimmer (an EP-leaning tine bite) without doubling the body's
// low end. The `new` voice crossfades this in by velocity: soft chords stay on
// the mellow `pianoWave` body alone, hard hits bloom this layer in on top.
function createBrightWave(audioCtx: AudioContext): PeriodicWave {
    const real = new Float32Array([
        0, 0.15, 0.25, 0.4, 0.5, 0.45, 0.35, 0.28, 0.2, 0.14, 0.09, 0.05,
    ]);
    const imag = new Float32Array(real.length).fill(0);
    return audioCtx.createPeriodicWave(real, imag);
}

let pianoWave: PeriodicWave | null = null;
let brightWave: PeriodicWave | null = null;
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
    (playback as Mutable<typeof playback>).sustainActive = active; // @direct-mutation

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
    (playback as Mutable<typeof playback>).sustainActive = false; // @direct-mutation
}

interface PlayNoteOptions {
    vol?: number;
    index?: number;
    instrument?: string;
    muted?: boolean;
    numVoices?: number;
}

// synth-audit Epic 0 S1 — A/B voice seam. The exported entry dispatches on the
// instrument's `voice` setting; `*New` is a placeholder until Epic 2 fills it in.
export function playNote(...args: Parameters<typeof playNoteCurrent>): void {
    (args[0].chords.voice === 'new' ? playNoteNew : playNoteCurrent)(...args);
}

// synth-audit Epic 2 S1 — strum-stagger. The `current` voice always received
// the dead `index: 0` from the scheduler, so every chord note started
// perfectly simultaneously. The `new` voice gets a real ascending pitch rank
// and turns it into a low→high roll: a base ~4 ms-per-voice spread plus a
// small deterministic timing jitter so the roll isn't mechanically linear.
// The offset is applied to `time` here and the delegated call gets `index: 0`
// so `playNoteCurrent`'s legacy `Math.random()` stagger stays off (no double
// strum). The lowest note (index 0) is anchored exactly on the beat.
// `freq` is assumed finite here — `playNoteCurrent` is the guarding layer,
// and the scheduler's `.filter(n => n.freq)` keeps non-finite notes out.
const CHORD_STRUM_STEP = 0.004; // seconds of roll per chord-voice index
const CHORD_STRUM_JITTER = 0.15; // humanize scale — keeps jitter well under one step

function playNoteNew(...args: Parameters<typeof playNoteCurrent>): void {
    const [state, freq, time, duration, opts = {}] = args;
    const { vol = 0.1, index = 0, instrument = 'Piano', muted = false, numVoices = 1 } = opts;
    const { playback, groove } = state;

    // Bail to the delegate's own guard if the context is unusable — never
    // schedule a transient for a note `playNoteCurrent` will reject.
    if (!playback.audio || !Number.isFinite(freq)) {
        playNoteCurrent(state, freq, time, duration, { ...opts, index: 0 });
        return;
    }

    // Strum offset (Epic 2 S1) — 0 for the lowest note (index 0), ascending
    // thereafter. The transient below fires at the strum-shifted start so it
    // lands exactly on each note's onset, including the index-0 anchor.
    let strum = 0;
    if (index > 0) {
        const seed = humanizeSeed(index, 'chords', Math.round(freq));
        const { timeOffset } = humanizeNote(seed, HUMANIZE_PROFILES.chords, CHORD_STRUM_JITTER);
        strum = index * CHORD_STRUM_STEP + timeOffset;
    }
    const startTime = Math.max(time + strum, playback.audio.currentTime);

    // Epic 2 targets the electric-piano voice — for any other instrument
    // (i.e. Warm) the `new` voice keeps the legacy delegated body untouched.
    const resolvedInstrument =
        instrument === 'Piano' || instrument === 'Warm' ? instrument : 'Piano';
    if (resolvedInstrument !== 'Piano') {
        playNoteCurrent(state, freq, time + strum, duration, { ...opts, index: 0 });
        return;
    }

    // --- The `new` Piano voice ---------------------------------------------
    // It no longer delegates to `playNoteCurrent`: a per-partial additive
    // body (S4) replaces the legacy single-oscillator body, and the attack
    // transient (S2) + bright layer (S3) sit on top.
    const finalVol = vol / Math.sqrt(Math.max(1, numVoices));

    // synth-audit Epic 2 S2 — real attack transient. `playNoteCurrent`'s only
    // onset cue is a quiet (`finalVol*0.15`), diffuse noise blip — nothing for
    // the ear to latch onto, a primary cause of chord burial. The `new` voice
    // gives the onset a defined two-part transient:
    //   1. a boosted noise "chiff" — the hammer strike, ~3x the legacy level;
    //   2. a fast-decaying pitched click at the note frequency, so the onset
    //      has a pitched edge that cuts a full-band mix.
    // Both track velocity + polyphony via `finalVol`. Levels are first
    // guesses, tuned at the listening gate.
    if (!muted && playback.audioGraph) {
        const dest = playback.audioGraph.chords.gain;
        // Hammer "chiff" — bandpass noise, a touch brighter than the legacy
        // strike's 800-4000 Hz band so it reads as an edge, not a thud.
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, dest, startTime, {
            volume: finalVol * 0.45,
            filterType: 'bandpass',
            freq: Math.max(900, Math.min(5000, 1200 + (freq / 440) * 700 + finalVol * 600)),
            Q: 1.2,
            attack: 0.0008,
            decay: 0.008,
            duration: 0.08,
        });
        // Pitched click — a ~45 ms triangle blip at the note pitch. The fast
        // 6 ms decay keeps it a transient tick, not an audible doubled tone.
        playResonantTone(playback.audio, dest, startTime, {
            type: 'triangle',
            freqStart: freq,
            freqEnd: freq,
            volume: finalVol * 0.3,
            attack: 0.001,
            decay: 0.006,
            duration: 0.045,
        });

        // synth-audit Epic 2 S3 — velocity → brightness. `playNoteCurrent`
        // moves only cutoff + gain with velocity; its wave content never
        // changes, so soft and hard hits are timbrally identical. This layer
        // crossfades a fundamental-light "bright" wave in by velocity — the
        // convex `velocityTimbre` curve keeps soft chords on the mellow body
        // alone and blooms upper-harmonic shimmer in only on harder hits.
        const { brightness } = velocityTimbre(vol, { curve: 1.6 });
        if (brightness > 0.01) {
            if (!brightWave) {
                brightWave = createBrightWave(playback.audio);
            }
            const brightOsc = playback.audio.createOscillator();
            const brightGain = playback.audio.createGain();
            brightOsc.setPeriodicWave(brightWave);
            brightOsc.frequency.setValueAtTime(freq, startTime);
            // Upper partials die first: a fast attack then an immediate decay
            // (time-constant 0.18 s) makes this an attack-brightness bloom,
            // not a sustained ring — which also sidesteps sustain-pedal
            // coordination, since the layer is gone long before pedal-up.
            brightGain.gain.setValueAtTime(0, startTime);
            brightGain.gain.setTargetAtTime(finalVol * brightness * 0.45, startTime, 0.004);
            rampGain(brightGain.gain, 0, startTime + 0.03, 0.18);
            brightOsc.connect(brightGain);
            brightGain.connect(dest);
            brightOsc.start(startTime);
            // Stop is decoupled from note `duration`: the `setTargetAtTime`
            // decay only approaches 0, so the osc must run long enough that
            // it is inaudible (~5 time-constants ≈ 0.9 s) before the hard
            // `stop()` cut, otherwise short/staccato chords click. A fixed
            // 1.0 s tail gives ~5.4 τ — residual well under 0.5% of peak.
            brightOsc.stop(startTime + 1.0);
            brightOsc.onended = () => safeDisconnect([brightOsc, brightGain]);
        }
    }

    // synth-audit Epic 2 S4 — per-partial additive body (replaces the legacy
    // delegated single-oscillator-through-one-LPF body).
    playAdditiveBody(state, freq, startTime, duration, finalVol, muted);
}

// synth-audit Epic 2 S4 — per-partial additive body. The legacy body is one
// static periodic-wave oscillator dragged through a single lowpass sweep —
// every partial decays in lockstep, so a held chord freezes into a "buzzy
// stable" sustain. This rebuilds the body as N harmonic sine partials, each
// individually enveloped: upper partials are given progressively shorter
// decay time-constants, so the spectrum darkens naturally as the note rings
// (upper partials die first) instead of a uniform LPF faking it. Harmonic
// only — systematic inharmonic stretch is S5.
function playAdditiveBody(
    state: EnsembleState,
    freq: number,
    startTime: number,
    duration: number,
    finalVol: number,
    muted: boolean,
): void {
    const { playback } = state;
    if (!playback.audio || !playback.audioGraph) {
        return;
    }
    const audio = playback.audio;
    const preset = INSTRUMENT_PRESETS.Piano;

    if (!playback.heldNotes) {
        (playback as Mutable<typeof playback>).heldNotes = new Set(); // @direct-mutation
    }

    // Master body level — velocity gain + the note's release envelope.
    const bodyGain = audio.createGain();
    bodyGain.gain.setValueAtTime(0, startTime);
    bodyGain.gain.setTargetAtTime(finalVol * (preset.gainMult || 1.0), startTime, preset.attack);

    // Mix chain: a highpass to keep dense voicings out of the mud, then a
    // gentle pan. The legacy per-note LPF sweep is deliberately gone — the
    // per-partial decay below is the real spectral evolution.
    const hpf = audio.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.setValueAtTime(150, startTime);
    const panner = createSimplePanner(audio, -0.2, startTime);
    bodyGain.connect(hpf);
    hpf.connect(panner);
    panner.connect(playback.audioGraph.chords.gain);

    // Which partials survive: harmonic n·f0, capped below 16 kHz so high
    // notes naturally trim their bank (also keeps the voice budget down).
    const MAX_PARTIALS = 9;
    const MAX_PARTIAL_HZ = 16000;
    const TAU_BASE = 2.8; // s — the fundamental's decay time-constant
    const TAU_K = 0.6; // upper partials decay faster: τ_n = TAU_BASE/(1+K·(n-1))
    const partialNs: number[] = [];
    let weightSum = 0;
    for (let n = 1; n <= MAX_PARTIALS; n++) {
        if (n * freq > MAX_PARTIAL_HZ) {
            break;
        }
        partialNs.push(n);
        weightSum += 1 / n; // ~1/n harmonic rolloff
    }
    // Normalize so the partials sum to ~unity at onset regardless of how many
    // survived the ceiling — keeps the body level matched to `finalVol`.
    const norm = weightSum > 0 ? 1 / weightSum : 1;

    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    for (const n of partialNs) {
        const osc = audio.createOscillator();
        const pg = audio.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n * freq, startTime);
        // ±2 cents of per-note humanization — not inharmonicity (that is S5).
        osc.detune.setValueAtTime(Math.random() * 4 - 2, startTime);
        const tau = TAU_BASE / (1 + TAU_K * (n - 1));
        pg.gain.setValueAtTime(0, startTime);
        pg.gain.setTargetAtTime(norm / n, startTime, preset.attack);
        // Decay starts once the attack has settled (~12 ms): upper partials,
        // with the shortest τ, fall away first.
        pg.gain.setTargetAtTime(0, startTime + 0.012, tau);
        osc.connect(pg);
        pg.connect(bodyGain);
        oscs.push(osc);
        gains.push(pg);
    }

    if (oscs.length === 0) {
        // Defensive — unreachable for any real chord pitch, but never leave
        // the mix chain dangling without a source to drive `onended`.
        safeDisconnect([bodyGain, hpf, panner]);
        return;
    }

    // Release / panic stop — mirrors the legacy voice's `stopNote` semantics
    // so `heldNotes` eviction and `killAllPianoNotes` keep working.
    const stopBody = (t: number, isPanic = false): void => {
        const damping = isPanic ? 0.005 : duration < 0.2 ? 0.02 : 0.12;
        rampGain(bodyGain.gain, 0, t, damping);
        for (const o of oscs) {
            try {
                o.stop(t + 0.5);
            } catch {
                /* already stopped */
            }
        }
    };

    if (playback.sustainActive && !muted) {
        // Pedal down: the note rings on the per-partial decay, bounded only
        // by pedal-up or the 64-note cap — exactly the legacy behavior.
        const noteRef = { stop: stopBody };
        playback.heldNotes.add(noteRef);
        if (playback.heldNotes.size > 64) {
            const firstNote = playback.heldNotes.values().next().value;
            firstNote.stop(audio.currentTime);
            playback.heldNotes.delete(firstNote);
        }
    } else {
        // No pedal: the damper falls at note-end — release, then stop the
        // oscillators with enough tail for the release ramp to reach silence.
        const effectiveDuration = muted ? 0.015 : duration;
        rampGain(bodyGain.gain, 0, startTime + effectiveDuration, 0.03);
        const stopAt = startTime + effectiveDuration + 0.6;
        for (const o of oscs) {
            o.stop(stopAt);
        }
    }

    // The fundamental (n=1) always exists and is stopped no later than any
    // other partial — in the no-pedal path every osc shares one `stopAt`; in
    // the pedal path `stopBody` stops every osc at the same `t`. Tearing the
    // graph down off its `onended` therefore fires `safeDisconnect` once.
    oscs[0].onended = () => safeDisconnect([...oscs, ...gains, bodyGain, hpf, panner]);
    for (const o of oscs) {
        o.start(startTime);
    }
}

function playNoteCurrent(
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
        (playback as Mutable<typeof playback>).heldNotes = new Set(); // @direct-mutation
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
        if (isPiano && !muted && playback.audioGraph) {
            playPercussiveStrike(
                playback.audio,
                groove.audioBuffers.noise,
                playback.audioGraph.chords.gain,
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
        if (playback.audioGraph) {
            panner.connect(playback.audioGraph.chords.gain);
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
    if (!playback.audio || !playback.audioGraph) {
        return;
    }
    const randomizedVol = vol * (0.8 + Math.random() * 0.4);
    playPercussiveStrike(
        playback.audio,
        groove.audioBuffers.noise,
        playback.audioGraph.chords.gain,
        time,
        {
            volume: randomizedVol,
            filterType: 'bandpass',
            freq: 1200 + Math.random() * 400,
            Q: 1.5,
            attack: 0.005,
            decay: 0.02,
            duration: 0.2,
        },
    );
}
