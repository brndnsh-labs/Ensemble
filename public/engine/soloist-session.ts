import type { EnsembleState, Mutable } from '../types.js';

/**
 * Resets the internal generative state of the soloist.
 * Called when the transport is flushed or reset.
 *
 * Relocated from the retired `soloist.ts` (epic #10): this is the one symbol the
 * legacy engine exported that production still needs (logic-worker + midi-worker),
 * so it lives in its own small module rather than dragging the deleted engine's
 * 2300-line file along.
 *
 * @worker-mutation — clears the `session` sub-tree and the `audio` runtime
 * (`lastMidiPlayed` / `lastFreq` etc.) to their initial shape. `session.seed`
 * is owned by `state-effects.generateSessionSeed()` and is not touched here.
 */
export function resetSoloistState(state: EnsembleState): void {
    const session = state.soloist.session as Mutable<typeof state.soloist.session>;
    const phrasing = session.phrasing as Mutable<typeof session.phrasing>;
    const memory = session.memory as Mutable<typeof session.memory>;
    const currentPhrase = session.currentPhrase as Mutable<typeof session.currentPhrase>;
    const context = currentPhrase.context as Mutable<typeof currentPhrase.context>;

    session.sessionSteps = 0;

    phrasing.state = 'rest';
    phrasing.isResting = true;
    phrasing.transitionState = null;
    phrasing.restSteps = 0;
    phrasing.activeSteps = 0;
    phrasing.busySteps = 0;
    phrasing.barsSinceRest = 0;

    currentPhrase.startStep = null;
    currentPhrase.loopCount = null;
    currentPhrase.sectionLabel = null;
    currentPhrase.sectionOccurrence = 0;

    context.role = 'call';
    context.skeleton = [];
    context.lastInterval = null;
    context.signature = null;
    context.responseSignature = null;
    context.restatementEcho = null;
    context.responseMode = 'free';
    context.responseSource = 'free';
    context.sectionLabel = null;
    context.sectionOccurrence = 0;

    memory.recentNotes = [];
    memory.sharedHookBuffer = [];
    memory.sectionRecall = {};
    memory.sectionRecallLoop = null;
    memory.formArcRecall = {};

    // why: the `audio` runtime carries cross-call voice-leading state —
    // `lastMidiPlayed` feeds the pitch engine's interval decision. A reset that
    // left it stale made the first note after a transport flush voice-lead off
    // the previous session's final pitch. activeVoices/buffer are main-thread
    // synth voice tracking — owned by the synth lifecycle, not cleared here.
    const audio = state.soloist.audio as Mutable<typeof state.soloist.audio>;
    audio.lastFreq = null;
    audio.lastMidiPlayed = null;
    audio.lastRenderedFreq = null;
    audio.lastPlayedFreq = null;
    audio.lastNoteEnd = 0;
}
