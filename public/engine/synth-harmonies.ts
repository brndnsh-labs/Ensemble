import type { EnsembleState, Mutable } from '../types.js';
import { clampFreq, safeDisconnect } from '../utils.js';
import { createSimplePanner, killActiveVoices } from './synth-utils.js';

/**
 * Polyphonic Synthesizer for the Harmony Module (harmony).
 * Optimized for Horns (stabs) and Strings (pads).
 */

const HARMONY_VOICE_LIMIT_FADE = 0.02;

/**
 * Same-pitch retriggers are common in funk and horn writing. Crossfade them instead of
 * hard-choking the old voice so repeated hits can re-articulate without zipper-like clicks.
 */
function getHarmonyRetriggerProfile(style: string): {
    fadeTime: number;
    attackFloor: number;
    suppressClick: boolean;
} {
    if (style === 'organ') {
        return { fadeTime: 0.02, attackFloor: 0.012, suppressClick: true };
    }
    if (style === 'plucks' || style === 'disco' || style === 'stabs') {
        return { fadeTime: 0.02, attackFloor: 0.012, suppressClick: false };
    }
    return { fadeTime: 0.03, attackFloor: 0.02, suppressClick: false };
}

export function killHarmonyNote(state: EnsembleState, fadeTime = 0.05) {
    const { playback, harmony } = state;
    if (!playback.audio) {
        return;
    }
    killActiveVoices(harmony.activeVoices, playback.audio.currentTime, fadeTime);
}

export function playHarmonyNote(
    state: EnsembleState,
    freq: number,
    time: number,
    duration: number,
    vol = 0.4,
    style = 'stabs',
    midi: number | null = null,
    slideInterval = 0,
    slideDuration = 0,
    vibrato = { rate: 0, depth: 0 },
    isLegato = false,
) {
    const { playback, harmony, groove } = state;
    if (!Number.isFinite(freq) || !playback.audio) {
        return;
    }

    const now = playback.audio.currentTime;
    const playTime = Math.max(time, now);
    const feel = groove.genreFeel;
    let retriggerProfile: ReturnType<typeof getHarmonyRetriggerProfile> | null = null;

    if (!harmony.activeVoices) {
        (harmony as Mutable<typeof harmony>).activeVoices = []; // @direct-mutation
    }

    for (let i = harmony.activeVoices.length - 1; i >= 0; i--) {
        const voice = harmony.activeVoices[i];
        if (voice.time + voice.duration + 1.0 <= playTime) {
            harmony.activeVoices.splice(i, 1); // @worker-mutation
        }
    }

    // Legato continuation (epic-harmony-polish S1):
    // why: when the harmony engine flags a note as a held continuation of a
    // voice that's already sounding at this exact MIDI (pad-mode common-tone
    // carryover), extend the existing voice in place instead of choking + re-
    // attacking. This is what makes "The Sea" / strings actually sustain across
    // chord changes — without it, every common tone hears a stab-stab-stab
    // re-articulation.
    //
    // Implementation:
    //   1. Find the existing voice at the same midi.
    //   2. Cancel its scheduled release ramp.
    //   3. Extend its `duration` so the new fade-out happens at
    //      playTime + duration instead of the original (earlier) end time.
    //   4. Re-schedule the gain release using a short release tail (matches
    //      the original setTargetAtTime release for pad-style voices).
    //   5. Return early — do NOT spawn new oscillators. This keeps the
    //      audio graph leak-free (no orphan nodes; the existing voice's
    //      onended/stop chain still cleans up at the new stopTime).
    if (isLegato && midi !== null) {
        const existing = harmony.activeVoices.find((v: { midi: number | null }) => v.midi === midi);
        if (existing?.gain && playback.audio) {
            const releaseTail = style === 'stabs' ? 0.1 : style === 'plucks' ? 0.02 : 0.5;
            try {
                existing.gain.gain.cancelScheduledValues(playTime);
            } catch {
                /* some test mocks don't implement cancelScheduledValues */
            }
            // Restore gain to the freshly-attacked level so the survivor voice
            // rides the new chord at full volume rather than continuing to
            // decay from wherever the previous release ramp had reached.
            // why: cancelScheduledValues only blocks future events — if the
            // previous release had already started ramping toward 0, the
            // AudioParam value is mid-decay and would otherwise continue
            // dropping. Without this restore, a survivor voice would sit
            // audibly behind the freshly-attacked sibling voices in the same
            // emission; this is especially audible on short-release styles
            // (stabs/plucks). 5 ms ramp avoids a zipper click.
            const polyphonyDucking = harmony.activeVoices.length > 1 ? 0.85 : 1.0;
            const restoreVol = vol * polyphonyDucking;
            try {
                existing.gain.gain.linearRampToValueAtTime(restoreVol, playTime + 0.005);
            } catch {
                existing.gain.gain.setValueAtTime?.(restoreVol, playTime);
            }
            // Schedule the new release window relative to the extended end time.
            const newEnd = playTime + duration;
            existing.gain.gain.setTargetAtTime(
                0,
                Math.max(playTime + 0.005, newEnd - releaseTail),
                releaseTail,
            );
            // Update the voice record so subsequent legato extensions chain
            // correctly and the stale-voice GC sees the new end time.
            existing.duration = newEnd - existing.time;
            // Push oscillator stop times out to the new end (best-effort —
            // not every voice's nodes implement .stop; that's fine, the gain
            // ramp to 0 is the audible truth and stale-voice GC will clean up).
            const stopAt = newEnd + 0.5;
            if (existing.nodes) {
                for (const node of existing.nodes as Array<
                    AudioNode & { stop?: (t: number) => void }
                >) {
                    try {
                        node.stop?.(stopAt);
                    } catch {
                        /* ignore: node may already be stopped */
                    }
                }
            }
            return;
        }
        // No existing voice to extend — fall through and create one normally.
        // This handles the edge case where the engine flagged legato but the
        // synth had already cleaned up the voice (voice timed out, killed by
        // an earlier non-legato chord change, etc.).
    }

    // Pitch-aware Stealing — gated on !isLegato so same-midi legato voices
    // are NOT choked here (they're handled by the legato block above).
    if (!isLegato && midi !== null) {
        const existing = harmony.activeVoices.find((v: { midi: number | null }) => v.midi === midi);
        if (existing) {
            retriggerProfile = getHarmonyRetriggerProfile(style);
            killActiveVoices([existing], playTime, retriggerProfile.fadeTime);
            const existingIndex = harmony.activeVoices.indexOf(existing);
            if (existingIndex !== -1) {
                harmony.activeVoices.splice(existingIndex, 1); // @worker-mutation
            }
        }
    }

    // Polyphonic Limit (Max 3 voices)
    if (harmony.activeVoices.length >= 3) {
        const oldest = harmony.activeVoices.shift();
        if (oldest) {
            killActiveVoices([oldest], playTime, HARMONY_VOICE_LIMIT_FADE);
        }
    }

    const polyphonyDucking = harmony.activeVoices.length > 1 ? 0.85 : 1.0;
    const finalVol = vol * polyphonyDucking;

    const gain = playback.audio.createGain();
    gain.gain.value = 0;

    const filter = playback.audio.createBiquadFilter();
    filter.type = 'lowpass';

    const panRange = 0.1 + playback.bandIntensity * 0.7;
    const panValue = (Math.random() * 2 - 1) * panRange;
    const panner = createSimplePanner(playback.audio, panValue, playTime);

    const osc1 = playback.audio.createOscillator();
    const osc2 = playback.audio.createOscillator();

    const useSub = freq > 250;
    const sub = useSub ? playback.audio.createOscillator() : null;

    const voiceNodes: AudioNode[] = [gain, filter, panner, osc1, osc2];
    if (sub) {
        voiceNodes.push(sub);
    }

    let lfo: OscillatorNode | null = null;
    let lfoGain: GainNode | null = null;
    let tremoloLfo: OscillatorNode | null = null;
    let tremoloGain: GainNode | null = null;
    let fifthOsc: OscillatorNode | null = null;
    let click: OscillatorNode | null = null;
    let clickGain: GainNode | null = null;
    let saturator: WaveShaperNode | null = null;
    let subGain: GainNode | null = null;
    let hp: BiquadFilterNode | null = null;

    if (style === 'organ') {
        const intensityForLeslie = playback.bandIntensity || 0.5;
        const leslieSpeed =
            intensityForLeslie < 0.4
                ? 0.7
                : intensityForLeslie > 0.6
                  ? 6.2
                  : 0.7 + ((intensityForLeslie - 0.4) / 0.2) * 5.5;
        saturator = playback.audio.createWaveShaper();
        saturator.curve = (() => {
            const n = 44100;
            const curve = new Float32Array(n);
            const k = 2;
            for (let i = 0; i < n; ++i) {
                const x = (i * 2) / n - 1;
                curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
            }
            return curve;
        })();
        voiceNodes.push(saturator);

        lfo = playback.audio.createOscillator();
        lfoGain = playback.audio.createGain();
        lfo.frequency.setValueAtTime(leslieSpeed, playTime);
        lfoGain.gain.setValueAtTime(5, playTime);
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);
        if (sub) {
            lfoGain.connect(sub.frequency);
        }
        lfo.start(playTime);
        voiceNodes.push(lfo, lfoGain);

        tremoloLfo = playback.audio.createOscillator();
        tremoloGain = playback.audio.createGain();
        tremoloLfo.type = 'sine';
        tremoloLfo.frequency.setValueAtTime(leslieSpeed, playTime);
        const tremDepth = 0.2;
        tremoloGain.gain.setValueAtTime(1.0 - tremDepth, playTime);
        const tremAmp = playback.audio.createGain();
        tremAmp.gain.setValueAtTime(tremDepth, playTime);
        tremoloLfo.connect(tremAmp);
        tremAmp.connect(gain.gain);
        tremoloLfo.start(playTime);
        voiceNodes.push(tremoloLfo, tremoloGain, tremAmp);
    } else if (vibrato && (vibrato.rate || 0) > 0 && (vibrato.depth || 0) > 0) {
        lfo = playback.audio.createOscillator();
        lfoGain = playback.audio.createGain();
        lfo.frequency.setValueAtTime(vibrato.rate || 0, playTime);
        lfoGain.gain.setValueAtTime(vibrato.depth || 0, playTime);
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);
        if (sub) {
            lfoGain.connect(sub.frequency);
        }
        lfo.start(playTime);
        voiceNodes.push(lfo, lfoGain);
    }

    if (feel === 'Rock' || feel === 'Metal') {
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(15, playTime);
        if (sub) {
            sub.type = 'sawtooth';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else if (feel === 'Neo-Soul' || feel === 'Acoustic') {
        osc1.type = 'triangle';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(2, playTime);
        if (sub) {
            sub.type = 'triangle';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else if (style === 'organ') {
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 2, playTime);
        fifthOsc = playback.audio.createOscillator();
        fifthOsc.type = 'sine';
        fifthOsc.frequency.setValueAtTime(freq * 1.5, playTime);
        voiceNodes.push(fifthOsc);

        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
            subGain = playback.audio.createGain();
            subGain.gain.setValueAtTime(0.5, playTime);
            sub.connect(subGain);
            if (saturator) {
                subGain.connect(saturator);
            }
            voiceNodes.push(subGain);
        }

        if (!retriggerProfile?.suppressClick) {
            click = playback.audio.createOscillator();
            clickGain = playback.audio.createGain();
            click.type = 'square';
            click.frequency.setValueAtTime(freq * 4, playTime);
            clickGain.gain.setValueAtTime(finalVol * 0.6, playTime);
            clickGain.gain.exponentialRampToValueAtTime(0.001, playTime + 0.04);
            click.connect(clickGain);
            clickGain.connect(gain);
            click.start(playTime);
            click.stop(playTime + 0.1);
            voiceNodes.push(click, clickGain);
        }

        if (saturator) {
            osc1.connect(saturator);
            osc2.connect(saturator);
            fifthOsc.connect(saturator);
            hp = playback.audio.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.setValueAtTime(120, playTime);
            saturator.connect(filter);
            filter.connect(hp);
            hp.connect(gain);
            voiceNodes.push(hp);
        } else {
            osc1.connect(filter);
            osc2.connect(filter);
            fifthOsc.connect(filter);
            filter.connect(gain);
        }

        fifthOsc.start(playTime);
        fifthOsc.stop(playTime + duration + 0.5);
        if (lfoGain) {
            lfoGain.connect(fifthOsc.frequency);
        }
    } else if (style === 'plucks') {
        osc1.type = 'sawtooth';
        osc2.type = 'square';
        osc2.detune.setValueAtTime(5, playTime);
        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else if (style === 'disco') {
        osc1.type = 'triangle';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(4, playTime);
        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else if (style === 'counter') {
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(4, playTime);
    } else if (style === 'stabs') {
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(12, playTime);
        if (sub) {
            sub.type = 'triangle';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else {
        osc1.type = 'triangle';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(8, playTime);
        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    }

    // Slides
    if (slideInterval !== 0 && slideDuration > 0) {
        const startFreq = freq * 2 ** (slideInterval / 12);
        osc1.frequency.setValueAtTime(startFreq, playTime);
        osc2.frequency.setValueAtTime(startFreq, playTime);
        if (sub) {
            sub.frequency.setValueAtTime(startFreq * 0.5, playTime);
        }
        osc1.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
        osc2.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
        if (sub) {
            sub.frequency.exponentialRampToValueAtTime(freq * 0.5, playTime + slideDuration);
        }
    } else {
        osc1.frequency.setValueAtTime(freq, playTime);
        osc2.frequency.setValueAtTime(freq, playTime);
        if (sub) {
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    }

    // Bloom
    const intensity = playback.bandIntensity;
    const brightnessMult = 1.0 + intensity * 2.0;

    if (style === 'stabs') {
        const qVal = feel === 'Rock' || feel === 'Metal' ? 5 + intensity * 5 : 3 + intensity * 2;
        const startFreq = Math.min(freq * 8 * brightnessMult, 12000);
        filter.frequency.setValueAtTime(clampFreq(startFreq), playTime);
        filter.frequency.exponentialRampToValueAtTime(
            clampFreq(freq * 2 * brightnessMult),
            playTime + 0.1,
        );
        filter.Q.setValueAtTime(qVal, playTime);
    } else if (style === 'plucks') {
        filter.frequency.setValueAtTime(clampFreq(freq * 8), playTime);
        filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 1.5), playTime + 0.1);
        filter.Q.setValueAtTime(5 + intensity * 5, playTime);
    } else if (style === 'disco') {
        filter.frequency.setValueAtTime(clampFreq(freq * 6), playTime);
        filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 2), playTime + 0.12);
        filter.Q.setValueAtTime(2 + intensity * 3, playTime);
    } else if (style === 'counter') {
        const start = freq * 1.5;
        const peak = freq * 3.0 * brightnessMult;
        filter.frequency.setValueAtTime(clampFreq(start), playTime);
        filter.frequency.linearRampToValueAtTime(clampFreq(peak), playTime + duration * 0.6);
        filter.Q.setValueAtTime(1.0, playTime);
    } else {
        const cutoff =
            feel === 'Neo-Soul' ? freq * 1.5 * brightnessMult : freq * 3 * brightnessMult;
        filter.frequency.setValueAtTime(clampFreq(cutoff), playTime);
        filter.frequency.exponentialRampToValueAtTime(
            clampFreq(cutoff * 1.2),
            playTime + duration * 0.5,
        );
        filter.frequency.exponentialRampToValueAtTime(clampFreq(cutoff), playTime + duration);
        filter.Q.setValueAtTime(1 + intensity, playTime);
    }

    // Envelope
    const isFastAttack = style === 'stabs' || style === 'plucks' || style === 'organ';
    const baseAttack = isFastAttack ? 0.01 : 0.2;
    const attackFloor = retriggerProfile?.attackFloor || 0.005;
    const attack = Math.max(attackFloor, baseAttack - finalVol * 0.15);
    let release = 0.5;
    if (style === 'stabs') {
        release = 0.1;
    }
    if (style === 'plucks') {
        release = 0.02;
    }

    const detuneMult = 1.0 + finalVol * 0.5;
    osc1.detune.setValueAtTime((Math.random() - 0.5) * 4, playTime);
    osc2.detune.setValueAtTime(
        (style === 'stabs' ? 12 : 8) * detuneMult + (Math.random() - 0.5) * 4,
        playTime,
    );

    gain.gain.setValueAtTime(0, playTime);
    gain.gain.linearRampToValueAtTime(finalVol, playTime + attack);
    gain.gain.setTargetAtTime(0, playTime + duration - release, release);

    // Routing
    if (style !== 'organ') {
        osc1.connect(filter);
        osc2.connect(filter);
        if (sub) {
            sub.connect(filter);
        }
        filter.connect(gain);
    }

    gain.connect(panner);
    if (playback.harmoniesGain) {
        panner.connect(playback.harmoniesGain);
    }

    // Register active voice
    const voiceRefs = { gain, time: playTime, duration, midi, nodes: voiceNodes };
    harmony.activeVoices.push(voiceRefs);

    osc1.start(playTime);
    osc2.start(playTime);
    if (sub) {
        sub.start(playTime);
    }

    const stopTime = playTime + duration + 0.5;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    if (sub) {
        sub.stop(stopTime);
    }
    if (lfo) {
        lfo.stop(stopTime);
    }
    if (tremoloLfo) {
        tremoloLfo.stop(stopTime);
    }

    osc1.onended = () => safeDisconnect(voiceNodes);
}
