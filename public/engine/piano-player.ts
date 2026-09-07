import { getEffectiveTimeSignature } from '../meter.js';
import type { Chord, EnsembleState, Mutable, StepInfo } from '../types.js';
import { binarySearchMapIndex, secondsPerStepFor } from '../utils.js';
import { INTRO_MUTES, OUTRO_MUTES } from './arrangement-layering.js';
import type { AccompanimentCoordination } from './comping-emit.js';
import { getBandPocket } from './coordination-engine.js';
import { scrambleHash, stringHash31 } from './hash-utils.js';
import { type PianoKey, type PianoProfile, voicePianoChord } from './piano-voicings.js';
import { foldPracticeStep } from './section-overrides.js';

export interface PianoPerformance {
    player: PianoProfile;
    hand: 'left' | 'right';
    gesture: 'statement' | 'answer' | 'settle';
}

// Cached plans are pure functions of chart CONTENT. No prior playback state,
// object-identity keys, or random stream survives a seek/export/deep-merged edit.
const voicingPlans = new Map<string, readonly PianoKey[]>();

function voicingAt(
    state: EnsembleState,
    chord: Chord,
    chartStep: number,
    phraseStart: number,
    bassPresent: boolean,
    profile: PianoProfile,
) {
    const map = state.arranger.stepMap;
    const index = binarySearchMapIndex(map, chartStep);
    const first = Math.max(0, binarySearchMapIndex(map, phraseStart));
    // Four preceding chords prepare the phrase's first hand position. Within
    // the phrase, every choice follows the actual preceding planned voicing.
    const preceding = map.slice(Math.max(0, first - 4), index + 1).map((entry) => entry.chord);
    if (!preceding.length) {
        preceding.push(chord);
    }
    const density = state.chords.density;
    const center = Math.max(61, Math.min(70, state.chords.octave || 65));
    const key = `${profile}/${bassPresent}/${density}/${center}/${preceding
        .map((c) => `${c.rootMidi},${c.bassMidi},${c.quality},${c.is7th}`)
        .join(';')}`;
    const cached = voicingPlans.get(key);
    if (cached) {
        return cached;
    }
    let keys: PianoKey[] = [];
    for (const c of preceding) {
        keys = voicePianoChord(c, bassPresent, density, keys, center, profile);
    }
    if (voicingPlans.size >= 64) {
        voicingPlans.clear();
    }
    voicingPlans.set(key, keys);
    return keys;
}

/** A four-bar statement/answer/return/settle, on this meter's actual pulse grid. */
function gestures(info: StepInfo, barInPhrase: number, variant: number, profile: PianoProfile) {
    const ts = info.tsConfig;
    const beat = ts.stepsPerBeat;
    const bar = ts.beats * beat;
    const settling = barInPhrase === 3;
    const result: { at: number; gesture: PianoPerformance['gesture'] }[] = [
        { at: 0, gesture: settling ? 'settle' : 'statement' },
    ];
    if (profile === 'neo-soul-rhodes') {
        // A repeated two-bar upper-hand hook, then space: the and of two
        // in simple meter, the last eighth of the first group otherwise.
        // Every bar/change still receives its full harmonic statement.
        const answer = beat === 2 ? (ts.grouping[0] - 1) * beat : beat * 1.5;
        if (barInPhrase % 2 === 0 && answer > 0 && answer < bar) {
            result.push({ at: answer, gesture: 'answer' });
        }
        return result;
    }
    if (profile === 'open-modal') {
        // Broad statements keep every bar legible. A single response in bar
        // two gives the four-bar phrase an answer without crowding practice.
        // Honor grouped quarter-note meters too (5/4, 7/4, or authored groups).
        // A single-group bar such as 3/4 still gets a late-pulse answer, rather
        // than collapsing the response onto its opening statement.
        const lastGroup = ts.grouping.length > 1 ? ts.grouping.at(-1)! : 1;
        const answer = bar - lastGroup * beat;
        if (barInPhrase === 1 && answer > 0) {
            result.push({ at: answer, gesture: 'answer' });
        }
        return result;
    }
    if (!settling) {
        const early = (barInPhrase === 1 ? 1 - variant : variant) === 0;
        const answer =
            beat === 2
                ? (ts.grouping[0] - 1) * beat + (early ? 0 : beat)
                : (early ? Math.min(1, ts.beats - 2) : Math.max(1, ts.beats - 2)) * beat +
                  Math.max(1, beat / 2);
        if (answer > 0 && answer < bar) {
            result.push({ at: answer, gesture: 'answer' });
        }
    }
    return result;
}

export function getPianoNotes(
    state: EnsembleState,
    chord: Chord,
    step: number,
    stepInChord: number,
    info: StepInfo,
    coordination: AccompanimentCoordination,
    bassPresent: boolean,
) {
    const profile: PianoProfile =
        state.chords.style === 'neo-soul-rhodes'
            ? 'neo-soul-rhodes'
            : state.chords.style === 'open-modal'
              ? 'open-modal'
              : 'modern-piano';
    const rhodes = profile === 'neo-soul-rhodes';
    if (
        rhodes &&
        !coordination.isFinalMeasure &&
        (((coordination.introBarsElapsed ?? -1) >= 0 &&
            coordination.introBarsElapsed! < INTRO_MUTES.chords) ||
            ((coordination.outroBarsRemaining ?? -1) >= 0 &&
                coordination.outroBarsRemaining! <= OUTRO_MUTES.chords))
    ) {
        return [];
    }
    const ts =
        info.tsConfig ||
        getEffectiveTimeSignature(state.arranger.timeSignature, state.arranger.grouping);
    const barSteps = ts.beats * ts.stepsPerBeat;
    const total = state.arranger.totalSteps || barSteps;
    const chartStep = ((foldPracticeStep(step, state.playback) % total) + total) % total;
    const measures = state.arranger.measureMap;
    const bar = Math.max(0, binarySearchMapIndex(measures, chartStep));
    const sectionBar = Math.max(0, binarySearchMapIndex(measures, coordination.sectionStart || 0));
    const barInPhrase = (bar - sectionBar) % 4;
    const phraseStart = measures[bar - barInPhrase]?.start ?? 0;
    const variant = Math.floor(
        scrambleHash(
            stringHash31(
                `${state.arranger.seed}/${chord.sectionLabel || ''}/${Math.floor((bar - sectionBar) / 4)}`,
            ),
        ) * 2,
    );
    const plan = gestures(
        { ...info, tsConfig: ts },
        coordination.isFinalMeasure ? 3 : barInPhrase,
        variant,
        profile,
    );
    (state.chords as Mutable<typeof state.chords>).rhythmicMask = plan.reduce(
        (mask, g) => mask | (1 << g.at),
        0,
    ); // @worker-mutation
    const gesture =
        stepInChord === 0
            ? { at: info.mStep, gesture: plan[0].gesture }
            : plan.find((g) => g.at === info.mStep);
    if (
        !gesture ||
        (coordination.subtractionMutedLanes?.includes('chords') &&
            !(rhodes && coordination.isFinalMeasure))
    ) {
        return [];
    }
    const voicing = voicingAt(state, chord, chartStep, phraseStart, bassPresent, profile);
    const answering = gesture.gesture === 'answer';
    let selected = answering ? voicing.filter((n) => n.hand === 'right') : voicing;
    // The generated lead can soften a response without removing its pulse.
    // A human playing along retains the same reserved space with Soloist off.
    if (answering && rhodes) {
        // Keep the hook's upper voices and its budget even when the human
        // takes over the lead; muting Soloist must not invite more decoration.
        selected = selected.slice(-2);
    }
    if (answering && !rhodes && coordination.soloistBusy && selected.length > 1) {
        selected = selected.slice(0, 1);
    }
    // Chord beats use the meter's denominator, matching the parsed step map.
    const remaining = Math.min(chord.beats * ts.stepsPerBeat - stepInChord, barSteps - info.mStep);
    const answer = plan.find((g) => g.at > info.mStep);
    const intensity = Number.isFinite(state.playback.bandIntensity)
        ? Math.max(0, Math.min(1, state.playback.bandIntensity))
        : 0.5;
    const timingOffset = rhodes ? getBandPocket(state.groove.genreFeel, chord.sectionLabel) : 0;
    // A laid-back attack must not push its release past the chart boundary,
    // especially when the next section's pocket moves closer to the beat.
    const releaseOffset = rhodes
        ? Math.max(0, timingOffset) / secondsPerStepFor(state.playback.bpm)
        : 0;
    return selected.map((n, index) => {
        const gate =
            rhodes && (answering || n.hand === 'right')
                ? Math.min(
                      remaining,
                      ts.stepsPerBeat * (answering ? 0.5 : 1.5),
                      answer ? answer.at - info.mStep : remaining,
                  )
                : answering
                  ? Math.min(remaining, ts.stepsPerBeat * (profile === 'open-modal' ? 1.5 : 0.8))
                  : n.hand === 'right' && answer
                    ? Math.min(remaining, answer.at - info.mStep)
                    : remaining;
        return {
            midi: n.midi,
            velocity:
                (0.4 + intensity * 0.22) *
                (answering ? 0.63 : 1) *
                (n.hand === 'left' ? 0.82 : index === selected.length - 1 ? 1.06 : 0.94) *
                (coordination.harmonyEffectiveEnabled && n.hand === 'left' ? 0.9 : 1) *
                (coordination.soloistBusy ? 0.88 : 1),
            durationSteps: Math.max(0.05, gate - 0.12 - releaseOffset),
            timingOffset,
            instrument: 'Piano' as const,
            dry: false,
            muted: false,
            // Clear any pedal left by a previous style on external MIDI too.
            // This player's hand gates own the release on every playback sink.
            ccEvents: index === 0 ? [{ controller: 64, value: 0, timingOffset: 0 }] : undefined,
            chordPerformance: {
                player: profile,
                hand: n.hand,
                gesture: gesture.gesture,
            } satisfies PianoPerformance,
        };
    });
}
