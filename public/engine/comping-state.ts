export interface CompingState {
    currentVibe: string;
    currentCell: number[];
    lockedUntil: number;
    soloistActivity: number;
    lastChordIndex: number;
    lastChordQuality: string | null;
    grooveRetentionCount: number;
    maxGrooveLength: number;
    lastSectionId: string | null;
    lastVoicingMidis: number[];
    // why: per-hit comp economy (#715) — the most recent "statement" voicing
    //      (the full voicing emitted on a structural/downbeat hit) and the chord
    //      it belonged to. Offbeat hits on the SAME chord answer it with a leaner,
    //      moving fragment instead of re-striking it identically. Reset implicitly
    //      whenever a structural hit or a fresh chord makes a new statement.
    statementVoicingMidis: number[];
    statementChordKey: string | null;
    // why: #766 restate-vs-ring — when a statement decides to RING through the next
    //      offbeat answer (sustain instead of re-attack), it records the absolute
    //      step of that answer here so the later per-step call suppresses the
    //      re-attack. `ringSuppressChordKey` guards it so a chord change between the
    //      statement and the answer cancels a stale ring. `-1` / null = no pending
    //      ring. Consumed (cleared) on the marked step.
    ringSuppressStep: number;
    ringSuppressChordKey: string | null;
    // why: epic-deterministic-phrasing S1 — counter incremented every time the
    //      STICKY (Funk) cell-bank picker fires (initial pick + each rotation).
    //      Used as the phrase-index input to the cell-bank hash so cell choice
    //      is tied to rotation events, not to bar arithmetic that collides with
    //      the rotation-length snap interval. Reset on section change.
    funkRotationIndex: number;
    // why: epic-coordination-consistency S5.c follow-up — same shape as
    //      funkRotationIndex but for Bossa. Bossa partido-alto needs 2-bar
    //      STICKY retention (call/answer alternation across bar A and bar B is
    //      the genre's defining cycle); the original `barIndex >> 1` hash aliased
    //      against the 4/8-bar STICKY retention to one or two reachable cells.
    //      A dedicated rotation counter advances by 1 per picker call so the cell
    //      bank sweeps consecutively. Reset on section change.
    bossaRotationIndex: number;
}

/**
 * Module-level persistent comping state.
 * Mutated each bar (and each section change) by {@link updateRhythmicIntent}.
 * Survives across calls to {@link getAccompanimentNotes} to provide groove memory,
 * voice-leading continuity, and soloist-aware density adjustment.
 */
export const compingState: CompingState = {
    currentVibe: 'balanced',
    currentCell: new Array(16).fill(0),
    lockedUntil: 0,
    soloistActivity: 0,
    lastChordIndex: -1,
    lastChordQuality: null, // Track quality for tension resolution
    grooveRetentionCount: 0,
    maxGrooveLength: 4,
    lastSectionId: null,
    lastVoicingMidis: [],
    statementVoicingMidis: [],
    statementChordKey: null,
    ringSuppressStep: -1,
    ringSuppressChordKey: null,
    funkRotationIndex: 0,
    bossaRotationIndex: 0,
};

/**
 * Reset the per-song comp memory both worker hosts clear on NEW_SONG / export start.
 * One home for the ritual — the live worker (logic-worker.ts) and the offline export
 * (midi-worker-logic.ts) both call this so they can never drift (#1013).
 */
export function resetCompingState(compingState: CompingState): void {
    compingState.lastChordIndex = -1;
    compingState.lockedUntil = 0;
    compingState.grooveRetentionCount = 0;
    compingState.lastVoicingMidis = [];
    // #715 — clear the per-hit-economy statement memory too, or a new song that opens
    // on the same chord the last one ended on treats its first downbeat as an "answer"
    // (thin shell) instead of a statement (full voicing).
    compingState.statementChordKey = null;
    compingState.statementVoicingMidis = [];
}
