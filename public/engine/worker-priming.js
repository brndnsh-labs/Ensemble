import { getBassNote, isBassActive } from '../bass-engine.js';
import { TIME_SIGNATURES } from '../config.js';
import { getSoloistNote } from '../soloist.js';
import { getFrequency, getStepInfo } from '../utils.js';
import { createCoordinationContext, updateCoordinationContext } from './coordination-engine.js';
import { workerContext } from './worker-orchestrator.js';
import { getChordAtStep } from './worker-utils.js';

/**
 * Primes the generative engines by running them "silently" for a number of steps.
 * @param {import('../types.js').EnsembleState} state
 * @param {number} steps
 */
export function handlePrime(state, steps) {
    const { soloist, arranger, playback, bass } = state;
    if (!soloist.enabled || arranger.totalSteps === 0) {
        return;
    }
    const stepsToPrime = steps || arranger.totalSteps * 2;
    if (playback.workerLogging) {
        console.log(`[Worker] Priming engine for ${stepsToPrime} steps...`);
    }
    soloist.isResting = true; // @worker-mutation
    soloist.phrasingState = 'rest'; // @worker-mutation
    /** @type {any} */ (soloist).transitionState = null; // @worker-mutation
    soloist.rhythmicMotif = []; // @worker-mutation
    soloist.busySteps = 0; // @worker-mutation
    bass.busySteps = 0; // @worker-mutation
    soloist.activeSteps = 0; // @worker-mutation
    soloist.restSteps = 0; // @worker-mutation
    soloist.hookBuffer = []; // @worker-mutation
    soloist.lastAttackStep = -100; // @worker-mutation
    soloist.sessionSteps = 0; // @worker-mutation
    const primeCursor = { index: 0, sectionIndex: 0 };
    const primeLookaheadCursor = { index: 0, sectionIndex: 0 };
    const start = performance.now();
    for (let i = 0; i < stepsToPrime; i++) {
        const s = i;
        const chordData = getChordAtStep(s, arranger, primeCursor);
        if (chordData) {
            const { chord, stepInChord } = chordData;
            const nextChordData = getChordAtStep(s, arranger, primeLookaheadCursor);
            const ts =
                /** @type {any} */ (TIME_SIGNATURES)[arranger.timeSignature] ||
                TIME_SIGNATURES['4/4'];
            const stepInfo = getStepInfo(s, ts, arranger.measureMap, TIME_SIGNATURES) || {
                mStep: 0,
                isMeasureStart: false,
                isBeatStart: false,
                isBackbeat: false,
                isGroupStart: false,
                beatIndex: 0,
                isOffbeat: false,
                isEOfBeat: false,
                isAOfBeat: false,
                tsConfig: ts,
            };
            const coordination = createCoordinationContext(s, /** @type {any} */ (stepInfo));
            const { sectionStart, sectionEnd } = chordData;
            const soloResult = getSoloistNote(
                chord || '',
                nextChordData?.chord || '',
                s,
                /** @type {any} */ (soloist.lastFreq || null),
                soloist.octave,
                soloist.style || '',
                stepInChord,
                true,
                { sectionStart, sectionEnd, stepCoordination: coordination },
            );
            if (soloResult) {
                const results = Array.isArray(soloResult) ? soloResult : [soloResult];
                results.forEach((res) => {
                    if (res.freq || res.midi) {
                        if (!res.freq) {
                            res.freq = 440 * 2 ** ((res.midi - 69) / 12);
                        }
                        if (!res.isDoubleStop) {
                            soloist.lastFreq = res.freq; // @worker-mutation
                        }
                    }
                });
                updateCoordinationContext(coordination, 'soloist', soloResult);
            }
            if (bass.enabled) {
                if (isBassActive(bass.style, s, stepInChord, stepInfo, coordination)) {
                    const centerMidi = bass.octave;
                    const bassResult = getBassNote(
                        chord,
                        nextChordData?.chord || '',
                        stepInChord / ts.stepsPerBeat,
                        bass.lastFreq || null,
                        centerMidi,
                        bass.style,
                        chordData.chordIndex,
                        s,
                        stepInChord,
                        { sectionStart, sectionEnd, stepCoordination: coordination },
                        stepInfo || null,
                    );
                    if (bassResult && (bassResult.freq || bassResult.midi)) {
                        if (!bassResult.freq) {
                            bassResult.freq = 440 * 2 ** ((bassResult.midi - 69) / 12);
                        }
                        bass.lastFreq = bassResult.freq; // @worker-mutation
                        updateCoordinationContext(coordination, 'bass', bassResult);
                    }
                }
            }
        }
    }
    const elapsed = performance.now() - start;
    if (playback.workerLogging) {
        console.log(`[Worker] Priming complete in ${elapsed.toFixed(2)}ms`);
    }
    soloist.busySteps = 0; // @worker-mutation
    bass.busySteps = 0; // @worker-mutation
    soloist.sessionSteps = 0; // @worker-mutation
}
