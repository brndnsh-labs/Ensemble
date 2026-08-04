import { describe, expect, it } from 'vitest';
import {
    ATTENUATED_LEVEL_SCALE,
    CLICK_DISCONTINUITY,
    detectOnsets,
    effectiveLevel,
    formatVerificationTable,
    groupSimultaneous,
    isPitchResolvable,
    measureAttackEvidence,
    measureDiscontinuity,
    midiToFreq,
    PITCH_CONFIRM_RATIO,
    PRESENCE_RISE_DB,
    pearson,
    probeHarmonicPresence,
    type RenderMeta,
    refineOnsetTime,
    type ScheduledEvent,
    splitBands,
    verifyStem,
} from '../../scripts/audio-verify.js';

const SAMPLE_RATE = 44100;

// 120 bpm → a sixteenth step is 0.125s. Mirrors the render harness geometry
// (`renderLeadIn = 0.25`) so step indices in assertions read like real ones.
const META: RenderMeta = {
    sampleRate: SAMPLE_RATE,
    leadInSeconds: 0.25,
    stepSeconds: 0.125,
    stepsPerLoop: 16,
    loopCount: 1,
    bpm: 120,
};

const RENDER_SECONDS = 3.5;

/** Steps 0,2,4…14 — eight attacks with varying velocity so vel→peak has variance. */
function buildEvents(): ScheduledEvent[] {
    const velocities = [1.0, 0.45, 0.85, 0.5, 0.95, 0.4, 0.75, 0.6];
    return velocities.map((velocity, index) => ({
        track: 'bass',
        time: META.leadInSeconds + index * 2 * META.stepSeconds,
        midi: 45,
        duration: 0.2,
        velocity,
    }));
}

/**
 * A crude but honest stand-in for a rendered stem: 4 ms linear attack, fast
 * exponential decay, fundamental + second harmonic. The attack ramp matters —
 * a synthesized note rises over milliseconds, which is exactly what separates it
 * from the injected click below.
 */
function renderEvents(
    events: ScheduledEvent[],
    options: { amplitudes?: number[] } = {},
): Float32Array {
    const out = new Float32Array(Math.ceil(RENDER_SECONDS * SAMPLE_RATE));
    const attackSamples = Math.floor(0.004 * SAMPLE_RATE);
    const noteSamples = Math.floor(0.25 * SAMPLE_RATE);

    events.forEach((event, index) => {
        const freq = midiToFreq(event.midi);
        const amplitude = options.amplitudes?.[index] ?? event.velocity ?? 1;
        const start = Math.floor(event.time * SAMPLE_RATE);
        for (let i = 0; i < noteSamples && start + i < out.length; i++) {
            const t = i / SAMPLE_RATE;
            const envelope = i < attackSamples ? i / attackSamples : Math.exp(-(t - 0.004) * 25);
            const tone =
                Math.sin(2 * Math.PI * freq * t) + 0.35 * Math.sin(2 * Math.PI * freq * 2 * t);
            out[start + i] += amplitude * envelope * tone * 0.6;
        }
    });
    return out;
}

function plantClick(samples: Float32Array, time: number, amplitude = 0.9): void {
    const index = Math.floor(time * SAMPLE_RATE);
    samples[index] += amplitude;
    samples[index + 1] -= amplitude;
}

describe('audio-verify — primitives against synthetic signals', () => {
    it('detects every synthesized attack', () => {
        const events = buildEvents();
        const onsets = detectOnsets(renderEvents(events), SAMPLE_RATE);
        expect(onsets.length).toBe(events.length);
    });

    it('reports attack times without frame-center bias', () => {
        // A 1024-sample frame lags its transient by up to ~12 ms. If detection
        // reported frame centers, every offset here would read late by that much
        // — a fabricated behind-the-beat feel indistinguishable from real swing.
        const events = buildEvents();
        const onsets = detectOnsets(renderEvents(events), SAMPLE_RATE);
        for (let i = 0; i < events.length; i++) {
            expect(Math.abs(onsets[i].time - events[i].time) * 1000).toBeLessThan(5);
        }
    });

    it('refineOnsetTime pulls a late candidate back onto the attack', () => {
        const events = buildEvents().slice(0, 1);
        const samples = renderEvents(events);
        const refined = refineOnsetTime(samples, SAMPLE_RATE, events[0].time + 0.011);
        expect(Math.abs(refined - events[0].time) * 1000).toBeLessThan(3);
    });

    it('separates a musical attack from a click by discontinuity', () => {
        const events = buildEvents();
        const clean = renderEvents(events);
        expect(measureDiscontinuity(clean, SAMPLE_RATE, events[0].time)).toBeLessThan(
            CLICK_DISCONTINUITY,
        );

        const clicked = renderEvents(events);
        const clickTime = META.leadInSeconds + 15 * META.stepSeconds;
        plantClick(clicked, clickTime);
        expect(measureDiscontinuity(clicked, SAMPLE_RATE, clickTime)).toBeGreaterThanOrEqual(
            CLICK_DISCONTINUITY,
        );
    });

    it('confirms the right pitch and REJECTS its semitone neighbors', () => {
        // The previous version asserted only `absent < present`, which was nearly
        // free: against the old tritone reference a pitch 13 semitones away still
        // scored 5.43 — comfortably "confirmed" in production. The guard that matters
        // is that a neighbor lands BELOW the threshold, not merely below the correct
        // note. MIDI 76 sits above the resolvable floor.
        const midi = 76;
        const at = META.leadInSeconds;
        const samples = renderEvents([{ track: 'soloist', time: at, midi, velocity: 0.9 }]);

        expect(probeHarmonicPresence(samples, SAMPLE_RATE, at, midi)).toBeGreaterThan(
            PITCH_CONFIRM_RATIO,
        );
        for (const wrong of [midi - 1, midi + 1, midi + 3]) {
            expect(probeHarmonicPresence(samples, SAMPLE_RATE, at, wrong)).toBeLessThan(
                PITCH_CONFIRM_RATIO,
            );
        }
    });

    it('declines to score pitch below the frequency-resolvable floor', () => {
        // A semitone at MIDI 45 is 6.5 Hz against an 80 ms window's ~12.5 Hz. Below
        // the floor the probe confirmed 8 of 10 WRONG pitches when measured, so the
        // claim is refused rather than made badly.
        expect(isPitchResolvable(45)).toBe(false);
        expect(isPitchResolvable(76)).toBe(true);
    });

    it('groups simultaneous events into one attack, bracketing the 15 ms window', () => {
        const base = META.leadInSeconds;
        const chord: ScheduledEvent[] = [60, 64, 67, 71].map((midi) => ({
            track: 'chords',
            time: base,
            midi,
            velocity: 0.8,
        }));
        expect(groupSimultaneous(chord, META)).toHaveLength(1);
        expect(groupSimultaneous(chord, META)[0].midis).toHaveLength(4);

        // Bracket the threshold rather than sampling mid-band: a pair inside the
        // window must merge and a pair just outside it must not.
        const near: ScheduledEvent[] = [
            { track: 'chords', time: base, midi: 60 },
            { track: 'chords', time: base + 0.014, midi: 64 },
        ];
        const far: ScheduledEvent[] = [
            { track: 'chords', time: base, midi: 60 },
            { track: 'chords', time: base + 0.016, midi: 64 },
        ];
        expect(groupSimultaneous(near, META)).toHaveLength(1);
        expect(groupSimultaneous(far, META)).toHaveLength(2);
    });

    it('counts an onset as unscheduled only outside the tolerance window', () => {
        // Brackets the boundary rather than sampling inside the band, so a change
        // to the tolerance actually moves a result. Placed in the silent tail: an
        // impulse riding a sustaining note adds almost nothing to a 1024-sample
        // frame's ENERGY and is invisible to novelty detection at any offset —
        // a real limit of this detector, documented rather than papered over.
        const lonely: ScheduledEvent[] = [
            ...buildEvents(),
            { track: 'bass', time: 3.0, midi: 45, velocity: 0.8 },
        ];
        const [inside, outside] = [0.02, 0.04].map((offset) => {
            const samples = renderEvents(buildEvents());
            plantClick(samples, 3.0 + offset);
            return verifyStem({
                stemId: 'bass',
                tracks: ['bass'],
                samples,
                events: lonely,
                meta: META,
                pitched: true,
                singleLane: true,
                outputLatencyMs: 0,
                toleranceMs: 25,
            });
        });
        expect(inside.unscheduled).toHaveLength(0);
        expect(outside.unscheduled).toHaveLength(1);
    });

    it('pearson tracks a linear relationship', () => {
        expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 5);
        expect(pearson([1, 1, 1, 1], [2, 4, 6, 8])).toBeNull();
    });

    it('sees a quiet treble hit masked by a loud low tone — the two-band rescue', () => {
        // The single highest-value case from the real render: on a funk kit a
        // vel-0.4 hat riding a ringing kick measured +0.4 dB BROADBAND (invisible)
        // and +15.1 dB above 800 Hz. Broadband-only presence lost 44 of 128 kit
        // hits this way. If this regresses, dense percussion silently under-reports.
        const samples = new Float32Array(SAMPLE_RATE);
        const hatTime = 0.5;
        // A loud sustained 60 Hz tone across the whole second.
        for (let i = 0; i < samples.length; i++) {
            samples[i] = 0.5 * Math.sin((2 * Math.PI * 60 * i) / SAMPLE_RATE);
        }
        // A much quieter 8 kHz burst buried inside it. Kept above the one-pole's
        // residual leak (~f/fc of the low tone, so ~7.5% here) — below that, band
        // splitting cannot separate them either, which is the method's real bound.
        const start = Math.floor(hatTime * SAMPLE_RATE);
        for (let i = 0; i < Math.floor(0.02 * SAMPLE_RATE); i++) {
            const t = i / SAMPLE_RATE;
            samples[start + i] += 0.15 * Math.exp(-t * 120) * Math.sin(2 * Math.PI * 8000 * t);
        }

        const bands = splitBands(samples, SAMPLE_RATE);
        const evidence = measureAttackEvidence(bands, SAMPLE_RATE, hatTime);
        expect(evidence.lowRiseDb).toBeLessThan(PRESENCE_RISE_DB);
        expect(evidence.highRiseDb).toBeGreaterThan(PRESENCE_RISE_DB);
        expect(evidence.riseDb).toBe(evidence.highRiseDb);
    });

    it('estimates constant graph latency and leaves per-note deviation alone', () => {
        // The render's master chain delays audio ~20 ms behind the scheduled time.
        // Folding that into per-note numbers would make every lane read laid-back,
        // so it is measured once and removed.
        const events = buildEvents();
        const delayedSec = 0.02;
        const delayed = events.map((event) => ({ ...event, time: event.time + delayedSec }));
        const samples = renderEvents(delayed);

        const result = verifyStem({
            stemId: 'bass',
            tracks: ['bass'],
            samples,
            events,
            meta: META,
            pitched: true,
            singleLane: true,
        });
        expect(result.outputLatencyMs ?? 0).toBeGreaterThan(15);
        expect(result.outputLatencyMs ?? 0).toBeLessThan(25);
        expect(result.matchRate).toBe(1);
        // The constant is removed, so what remains is the real per-note spread.
        expect(Math.abs(result.medianOffsetMs ?? 99)).toBeLessThan(5);
    });
});

describe('audio-verify — validation deck (planted defects)', () => {
    const events = buildEvents();

    function verify(samples: Float32Array, eventList: ScheduledEvent[] = events) {
        return verifyStem({
            stemId: 'bass',
            tracks: ['bass'],
            samples,
            events: eventList,
            meta: META,
            pitched: true,
            singleLane: true,
            // Synthetic renders have no graph latency; pin it so the deck exercises
            // the presence logic rather than the latency estimator (covered separately).
            outputLatencyMs: 0,
        });
    }

    // The control. Without this the deck proves only that the detector fires at
    // something — a detector that flagged everything would pass every defect case.
    it('clean render: every attack accounted for, nothing spurious', () => {
        const result = verify(renderEvents(events));
        expect(result.expectedAttacks).toBe(8);
        expect(result.matchRate).toBe(1);
        expect(result.missed).toHaveLength(0);
        expect(result.unscheduled).toHaveLength(0);
        expect(Math.abs(result.medianOffsetMs ?? 99)).toBeLessThan(5);
        expect(result.velocityPeakR ?? 0).toBeGreaterThan(0.9);
        // The deck runs at MIDI 45, below the pitch-resolvable floor — so the honest
        // result is a refusal, not a score. Asserting that here keeps the gate from
        // being quietly removed.
        expect(result.pitchConfirmedRate).toBeNull();
        expect(result.notVerifiable.pitchConfirmedRate).toContain('resolvable');
    });

    it('muted scheduled note: reported missing, and localized to its step', () => {
        const sounded = events.filter((_, index) => index !== 3);
        const result = verify(renderEvents(sounded));
        expect(result.missed).toHaveLength(1);
        expect(result.missed[0].step).toBe(6);
        expect(result.matchRate).toBeLessThan(1);
    });

    it('injected click: surfaces as unscheduled with a sub-millisecond rise', () => {
        const samples = renderEvents(events);
        const clickTime = META.leadInSeconds + 15 * META.stepSeconds;
        plantClick(samples, clickTime);
        const result = verify(samples);
        expect(result.unscheduled).toHaveLength(1);
        expect(result.unscheduled[0].discontinuity).toBeGreaterThanOrEqual(CLICK_DISCONTINUITY);
        expect(Math.abs(result.unscheduled[0].time - clickTime) * 1000).toBeLessThan(5);
        // The planted defect must not cost us any real attack.
        expect(result.matchRate).toBe(1);
    });

    it('dropped lane: every attack missing, not silently reported as clean', () => {
        const result = verify(new Float32Array(Math.ceil(RENDER_SECONDS * SAMPLE_RATE)));
        expect(result.matchedAttacks).toBe(0);
        expect(result.missed).toHaveLength(8);
        expect(result.matchRate).toBe(0);
    });

    it('flattened velocity accents: onsets all present, correlation collapses', () => {
        // The defect this catches is invisible to onset matching by construction —
        // every note still sounds, on time. Only the velocity→level relationship is
        // gone, which is the #1273 "the accent is not expressing" class.
        //
        // Levels still vary slightly (a real limiter leaves residue) but no longer
        // track velocity — flattening to one exact amplitude would instead make the
        // metric unmeasurable, which is a different, weaker finding.
        const flattened = [0.8, 0.8, 0.81, 0.81, 0.8, 0.8, 0.81, 0.81];
        const result = verify(renderEvents(events, { amplitudes: flattened }));
        expect(result.matchRate).toBe(1);
        expect(Math.abs(result.velocityPeakR ?? 1)).toBeLessThan(0.5);
    });
});

describe('audio-verify — thresholds and fallbacks', () => {
    /** A steady tone whose amplitude steps by `factor` at `stepTime`. */
    function steppedTone(stepTime: number, factor: number): Float32Array {
        const out = new Float32Array(Math.ceil(1.5 * SAMPLE_RATE));
        const stepIndex = Math.floor(stepTime * SAMPLE_RATE);
        for (let i = 0; i < out.length; i++) {
            const amplitude = (i < stepIndex ? 0.2 : 0.2 * factor) * 0.8;
            out[i] = amplitude * Math.sin((2 * Math.PI * 200 * i) / SAMPLE_RATE);
        }
        return out;
    }

    it('brackets the presence threshold instead of sampling inside the band', () => {
        // PRESENCE_RISE_DB decides every MISSED verdict in the tool, but the deck's
        // own signals clear it by 40-130 dB and fail it by -64 dB — so any threshold
        // in a ~100 dB range keeps the deck green, including values that would change
        // every real verdict. This pins the boundary itself.
        const at = 0.6;
        const justUnder = 10 ** ((PRESENCE_RISE_DB - 0.4) / 20);
        const justOver = 10 ** ((PRESENCE_RISE_DB + 0.4) / 20);

        const under = measureAttackEvidence(
            splitBands(steppedTone(at, justUnder), SAMPLE_RATE),
            SAMPLE_RATE,
            at,
        );
        const over = measureAttackEvidence(
            splitBands(steppedTone(at, justOver), SAMPLE_RATE),
            SAMPLE_RATE,
            at,
        );
        expect(under.riseDb).toBeLessThan(PRESENCE_RISE_DB);
        expect(over.riseDb).toBeGreaterThan(PRESENCE_RISE_DB);
    });

    it('returns the input time when there is no attack to snap to', () => {
        // The old fallback returned the search window's first index, i.e. a fixed
        // ~-13 ms reading regardless of the truth — and sign-inverted, so a LATE note
        // reported early. That silently poisoned the median deviation.
        const steady = steppedTone(9, 1);
        expect(refineOnsetTime(steady, SAMPLE_RATE, 0.5)).toBeCloseTo(0.5, 6);
    });

    it('refuses a presence claim on a multi-lane stem', () => {
        // groupSimultaneous clusters ACROSS lanes and evidence is a band-energy rise,
        // so a co-located kick satisfies a bass note's evidence: a `full` render with
        // the bass lane muted entirely still measured 100%.
        const events = buildEvents();
        const result = verifyStem({
            stemId: 'full',
            tracks: ['bass', 'drums'],
            samples: renderEvents(events),
            events,
            meta: META,
            pitched: false,
            singleLane: false,
            outputLatencyMs: 0,
        });
        expect(result.matchRate).toBeNull();
        expect(result.notVerifiable.matchRate).toContain('multi-lane');
        expect(formatVerificationTable([result], META)).toContain('presence NOT VERIFIABLE');
    });

    it('labels a dropped pitched lane by midi, never with drum names', () => {
        // Bass range 23-57 overlaps DRUM_LABELS at 36-51, and a fully dropped lane
        // has no pitch rate to infer "pitched" from — so inferring it printed
        // "tom-low" for a missing bass note on the report that matters most.
        const events: ScheduledEvent[] = [0, 2, 4].map((step) => ({
            track: 'bass',
            time: META.leadInSeconds + step * META.stepSeconds,
            midi: 45,
            velocity: 0.8,
        }));
        const result = verifyStem({
            stemId: 'bass',
            tracks: ['bass'],
            samples: new Float32Array(Math.ceil(RENDER_SECONDS * SAMPLE_RATE)),
            events,
            meta: META,
            pitched: true,
            singleLane: true,
            outputLatencyMs: 0,
        });
        const table = formatVerificationTable([result], META);
        expect(table).toContain('midi 45');
        expect(table).not.toContain('tom-low');
    });

    it('marks timing UNCOMPENSATED when the graph latency could not be fitted', () => {
        // A sparse lane cannot fit a latency of its own, and the constant is then
        // still inside the deviation — printing a bare "+20.7ms" would read as a
        // deliberate laid-back pocket.
        const sparse = buildEvents().slice(0, 3);
        const late = sparse.map((event) => ({ ...event, time: event.time + 0.02 }));
        const result = verifyStem({
            stemId: 'harmony',
            tracks: ['harmony'],
            samples: renderEvents(late),
            events: sparse,
            meta: META,
            pitched: false,
            singleLane: true,
        });
        expect(result.outputLatencyMs).toBeNull();
        expect(formatVerificationTable([result], META)).toContain('UNCOMPENSATED');
    });
});

describe('audio-verify — output discipline', () => {
    const events = buildEvents();

    it('prints a reason for every unmeasurable metric instead of omitting it', () => {
        const result = verifyStem({
            stemId: 'full',
            tracks: ['bass', 'chords', 'drums'],
            samples: renderEvents(events),
            events,
            meta: META,
            pitched: false,
            singleLane: false,
        });
        const table = formatVerificationTable([result], META);
        expect(table).toContain('NOT VERIFIABLE: velocityPeakR');
        expect(table).toContain('NOT VERIFIABLE: pitchConfirmedRate');
        expect(result.velocityPeakR).toBeNull();
    });

    it('refuses to score pitch on polyphonic attacks rather than guessing', () => {
        // chords and harmony are both single-lane AND polyphonic, so without this
        // gate they would print an unqualified "pitch confirmed N%" from a probe
        // that assumes nothing else is sounding — on exactly the two stems a reader
        // is most likely to read as "the voicing came out".
        const chordEvents: ScheduledEvent[] = [0, 1, 2, 3].flatMap((index) =>
            [55, 59, 62, 66].map((midi) => ({
                track: 'chords',
                time: META.leadInSeconds + index * 4 * META.stepSeconds,
                midi,
                velocity: 0.7,
            })),
        );
        const result = verifyStem({
            stemId: 'chords',
            tracks: ['chords'],
            samples: renderEvents(chordEvents),
            events: chordEvents,
            meta: META,
            pitched: true,
            singleLane: true,
            outputLatencyMs: 0,
        });
        expect(result.pitchConfirmedRate).toBeNull();
        expect(result.notVerifiable.pitchConfirmedRate).toContain('polyphonic');
    });

    it('reports an empty lane as unscheduled rather than a 0% failure', () => {
        const result = verifyStem({
            stemId: 'soloist',
            tracks: ['soloist'],
            samples: new Float32Array(Math.ceil(RENDER_SECONDS * SAMPLE_RATE)),
            events: [],
            meta: META,
            pitched: true,
            singleLane: true,
        });
        // 0 would render as "0.0%", which reads identically to "every note dropped".
        expect(result.matchRate).toBeNull();
        expect(formatVerificationTable([result], META)).toContain('nothing scheduled');
    });

    it('emits no aggregate verdict a reader could mistake for an audition pass', () => {
        const result = verifyStem({
            stemId: 'bass',
            tracks: ['bass'],
            samples: renderEvents(events),
            events,
            meta: META,
            pitched: true,
            singleLane: true,
        });
        const table = formatVerificationTable([result], META).toLowerCase();
        for (const verdict of ['sounds good', 'sounds right', 'all good', 'looks good', 'passed']) {
            expect(table).not.toContain(verdict);
        }
    });
});

describe('audio-verify — effective level & intended attenuation (#1351)', () => {
    // Eight audible attacks whose FINAL scalar (renderVelocity) varies while the
    // authored velocity is deliberately flat — only the audit field can explain
    // the rendered dynamics.
    function buildRenderVelocityEvents(): ScheduledEvent[] {
        const renderVelocities = [1.0, 0.45, 0.85, 0.5, 0.95, 0.4, 0.75, 0.6];
        return renderVelocities.map((renderVelocity, index) => ({
            track: 'bass',
            time: META.leadInSeconds + index * 2 * META.stepSeconds,
            midi: 45,
            duration: 0.2,
            renderVelocity,
        }));
    }

    it('effectiveLevel prefers renderVelocity over velocity and applies levelScale', () => {
        expect(effectiveLevel({ track: 'bass', time: 0, midi: 45 })).toBeNull();
        expect(effectiveLevel({ track: 'bass', time: 0, midi: 45, velocity: 0.8 })).toBe(0.8);
        expect(
            effectiveLevel({
                track: 'bass',
                time: 0,
                midi: 45,
                velocity: 0.8,
                renderVelocity: 0.6,
            }),
        ).toBe(0.6);
        expect(
            effectiveLevel({
                track: 'bass',
                time: 0,
                midi: 45,
                renderVelocity: 0.8,
                levelScale: 0.15,
            }),
        ).toBeCloseTo(0.12, 10);
    });

    it('velocityPeakR: no level at all is NOT VERIFIABLE; renderVelocity alone makes it real', () => {
        // Mutation 6b, both directions: omit the final velocity → the metric must
        // refuse; carry it → the metric must exist and track the render.
        const bare = buildRenderVelocityEvents().map(({ renderVelocity, ...event }) => event);
        const bareResult = verifyStem({
            stemId: 'bass',
            tracks: ['bass'],
            samples: renderEvents(bare, {
                amplitudes: buildRenderVelocityEvents().map((e) => e.renderVelocity as number),
            }),
            events: bare,
            meta: META,
            pitched: true,
            singleLane: true,
            outputLatencyMs: 0,
        });
        expect(bareResult.velocityPeakR).toBeNull();
        expect(bareResult.notVerifiable.velocityPeakR).toMatch(
            /neither velocity nor renderVelocity/,
        );

        const carried = buildRenderVelocityEvents();
        const carriedResult = verifyStem({
            stemId: 'bass',
            tracks: ['bass'],
            samples: renderEvents(carried, {
                amplitudes: carried.map((e) => e.renderVelocity as number),
            }),
            events: carried,
            meta: META,
            pitched: true,
            singleLane: true,
            outputLatencyMs: 0,
        });
        expect(carriedResult.velocityPeakR ?? 0).toBeGreaterThan(0.9);
    });

    it('a silent palm-muted attack lands in quietAttenuated and leaves the match-rate denominator', () => {
        const events = buildRenderVelocityEvents();
        // Two extra attacks the render omits entirely: both carry a healthy
        // renderVelocity, but only the palm-muted one is *marked* attenuated.
        const muted: ScheduledEvent = {
            track: 'bass',
            time: META.leadInSeconds + 9 * META.stepSeconds,
            midi: 45,
            renderVelocity: 0.8,
            levelScale: 0.15,
        };
        const all = [...events, muted];
        const result = verifyStem({
            stemId: 'bass',
            tracks: ['bass'],
            samples: renderEvents(events, {
                amplitudes: events.map((e) => e.renderVelocity as number),
            }),
            events: all,
            meta: META,
            pitched: true,
            singleLane: true,
            outputLatencyMs: 0,
        });
        expect(result.quietAttenuated).toHaveLength(1);
        expect(result.quietAttenuated[0].step).toBe(9);
        expect(result.missed).toHaveLength(0);
        // 8 audible of (9 groups − 1 intended-quiet) — the chuck is not a failure.
        expect(result.matchRate).toBeCloseTo(1.0, 10);
        expect(formatVerificationTable([result], META)).toContain('QUIET (intended, unverifiable)');
    });

    it('an unattenuated dropped note still reads MISSED — the quiet bucket cannot hide real drops', () => {
        // Mutation 6c, over-reach direction: if the attenuation exemption were any
        // looser, a genuinely dropped open note would vanish into the quiet bucket.
        const events = buildRenderVelocityEvents();
        const dropped: ScheduledEvent = {
            track: 'bass',
            time: META.leadInSeconds + 9 * META.stepSeconds,
            midi: 45,
            renderVelocity: 0.8,
        };
        const result = verifyStem({
            stemId: 'bass',
            tracks: ['bass'],
            samples: renderEvents(events, {
                amplitudes: events.map((e) => e.renderVelocity as number),
            }),
            events: [...events, dropped],
            meta: META,
            pitched: true,
            singleLane: true,
            outputLatencyMs: 0,
        });
        expect(result.quietAttenuated).toHaveLength(0);
        expect(result.missed).toHaveLength(1);
        expect(result.matchRate).toBeCloseTo(8 / 9, 10);
    });

    it('ATTENUATED_LEVEL_SCALE brackets: at the threshold is attenuated, just above is not', () => {
        const at = groupSimultaneous(
            [
                {
                    track: 'bass',
                    time: 1.0,
                    midi: 45,
                    renderVelocity: 0.8,
                    levelScale: ATTENUATED_LEVEL_SCALE,
                },
            ],
            META,
        );
        const above = groupSimultaneous(
            [
                {
                    track: 'bass',
                    time: 1.0,
                    midi: 45,
                    renderVelocity: 0.8,
                    levelScale: ATTENUATED_LEVEL_SCALE + 0.01,
                },
            ],
            META,
        );
        expect(at[0].attenuated).toBe(true);
        expect(above[0].attenuated).toBe(false);
    });

    it('a cluster is intended-quiet only when every leveled member is', () => {
        const groups = groupSimultaneous(
            [
                { track: 'bass', time: 1.0, midi: 45, renderVelocity: 0.8, levelScale: 0.15 },
                { track: 'bass', time: 1.001, midi: 57, renderVelocity: 0.8 },
            ],
            META,
        );
        expect(groups).toHaveLength(1);
        expect(groups[0].attenuated).toBe(false);
    });

    it('attacks rows carry per-attack rendered evidence for every scheduled group', () => {
        const events = buildRenderVelocityEvents();
        const result = verifyStem({
            stemId: 'bass',
            tracks: ['bass'],
            samples: renderEvents(events, {
                amplitudes: events.map((e) => e.renderVelocity as number),
            }),
            events,
            meta: META,
            pitched: true,
            singleLane: true,
            outputLatencyMs: 0,
        });
        expect(result.attacks).toHaveLength(result.expectedAttacks);
        for (const row of result.attacks) {
            expect(Number.isFinite(row.riseDb)).toBe(true);
            expect(Number.isFinite(row.peak)).toBe(true);
            expect(row.level).not.toBeNull();
        }
        // The louder scheduled attack must show the larger rendered peak — the
        // grouped-position relationship a story asserts against (#1351 accept. 4).
        const loudest = result.attacks.reduce((a, b) => ((a.level ?? 0) > (b.level ?? 0) ? a : b));
        const quietest = result.attacks.reduce((a, b) => ((a.level ?? 1) < (b.level ?? 1) ? a : b));
        expect(loudest.peak).toBeGreaterThan(quietest.peak);
    });
});
