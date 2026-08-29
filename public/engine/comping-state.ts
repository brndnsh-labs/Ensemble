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
function createInitialCompingState(): CompingState {
    return {
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
}

export const compingState: CompingState = createInitialCompingState();

/**
 * Reset every field of the module-level comp memory at a fresh generation boundary.
 * Building the singleton and resetting it share the same initializer, so adding a
 * new CompingState field cannot silently create cross-run memory (#1013, #1043).
 */
export function resetCompingState(compingState: CompingState): void {
    Object.assign(compingState, createInitialCompingState());
}
