// @ts-nocheck
// Comper Q&A response critique (#1157) — the comper CATCHES the soloist's question.
//
// #1009 carves a real breath after every question cadence; #1157 lets the comper
// answer into it: ONE lean echo of the hang tone (the question's own tension PC on
// top) a beat into the ring, then a top-voice re-landing on a chord pillar during
// the answer bar. This gate is PRODUCTION-FAITHFUL end-to-end minus tick-logic:
// real preset → real generateSessionSeed (the #1009 Q&A plan) → real getQaHangAt
// (the seed-frame digest tick-logic publishes) → the real comper
// (getAccompanimentNotes), compared as PAIRED runs (window feed on vs off, same
// RNG stub) so every claim is about what the gesture actually changed.
//
// Why it is NOT tautological: the coordination window only LOCATES the gap — an
// echo counts ONLY as a paired difference at the echo step (an attack the off-run
// didn't emit, or a top voice the off-run voiced differently that now matches the
// hang PC). A cell hit that merely coincides with an echo step counts as nothing.
//
// Seed-frame note (reference_soloist_seed_frame_vs_loop): the seed unrolls a
// ≤128-bar development span, so each Q&A window lives at ONE absolute lap. The
// participation draw is per-window; its rate is the lap's loop tier — so "the
// conversation warms up" expresses as later-lap windows firing more often, which
// is exactly what the ramp metric measures.
//
// Metrics (aggregated across seeds, laps 0-7):
//   • windows    — Q&A windows the seed actually planned (sanity: harness can see)
//   • fired      — windows whose echo is a real paired diff (the catch, live)
//   • pcMatch    — fired echoes carry the hang PC on top (it echoes, not stabs)
//   • livePc     — the digest pc IS what the soloist sounds (#1159 cross-check)
//   • delta      — attacks(on) - attacks(off) ≤ inserted echoes (no spam)
//   • ramp       — late-lap windows (tier 3+) fire more often than laps 0-1
//   • resolution — fired windows' answer-bar top voices land chord pillars
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import {
    getQaHangAt,
    getSoloistNotePhraseFirst,
} from '../../public/engine/soloist-phrase-first.js';
import { chordTargetTones } from '../../public/engine/soloist-pitch-engine.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

const LOOPS = 8;

function buildState(presetName, genre, bpm, chordStyle) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: genre });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'monophonic' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.5);
    dispatch(ACTIONS.SET_BPM, bpm);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    const ts = preset.settings?.timeSignature || preset.sections[0]?.timeSignature || '4/4';
    dispatch(ACTIONS.SET_TIME_SIGNATURE, ts);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    state.chords.enabled = true;
    // Production note (review P0): the genre picker sets chords.style via the
    // smart-genres `chord:` key — 'jazz' for Jazz/Blues/Bossa, 'arp' for
    // Acoustic, NOT 'smart'. Cases drive the real per-genre value so the
    // harness exercises the path production actually runs; one case keeps
    // 'smart' to cover the manually-picked Smart Comping lane.
    state.chords.style = chordStyle;
    state.bass.enabled = true;
    validateProgression(state);
    return state;
}

function resetComping() {
    compingState.currentCell = new Array(16).fill(0);
    compingState.lockedUntil = 0;
    compingState.grooveRetentionCount = 0;
    compingState.lastSectionId = null;
    compingState.lastVoicingMidis = [];
    compingState.statementChordKey = null;
    compingState.statementVoicingMidis = [];
    compingState.ringSuppressStep = -1;
    compingState.ringSuppressChordKey = null;
}

/**
 * Drive the real comper over `LOOPS` arrangement laps. When `useQa` is set, the
 * coordination carries the digested Q&A window exactly as tick-logic publishes
 * it (getQaHangAt on the real seed); otherwise null — the paired baseline.
 * Math.random is stubbed to a per-run seeded LCG so the comper's non-compDraw
 * gates are identical across the on/off pair and the diff isolates the gesture.
 */
function runComper(state, seed, useQa, rngSeed, pinLoop = null) {
    const origRandom = Math.random;
    let rng = rngSeed;
    Math.random = () => {
        rng = (rng * 1664525 + 1013904223) >>> 0;
        return rng / 0x100000000;
    };
    resetComping();

    const ts = TIME_SIGNATURES[state.arranger.timeSignature || '4/4'];
    const spb = ts.stepsPerBeat;
    const spm = ts.beats * ts.stepsPerBeat;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;

    const attackTops = new Map(); // abs step → top-voice PC
    const windows = new Map(); // hangStartStep → window meta
    const resolutionSamples = []; // { hangStartStep, topPc, pillars }

    for (let loop = 0; loop < LOOPS; loop++) {
        state.playback.currentLoopCount = pinLoop ?? loop;
        for (let s = 0; s < total; s++) {
            const abs = loop * total + s;
            const entry = stepMap.find((e) => s >= e.start && s < e.end);
            if (!entry?.chord) {
                continue;
            }
            const qaHang = useQa ? getQaHangAt(seed, abs, spb, spm, total) : null;
            if (qaHang && !windows.has(qaHang.hangStartStep)) {
                windows.set(qaHang.hangStartStep, qaHang);
            }
            const mStep = abs % spm;
            const notes = getAccompanimentNotes(
                state,
                entry.chord,
                abs,
                s - entry.start,
                mStep,
                {
                    isBeatStart: mStep % spb === 0,
                    isGroupStart: mStep === 0,
                    mStep,
                    beatIndex: Math.floor(mStep / spb),
                    tsConfig: { beats: ts.beats, stepsPerBeat: spb },
                },
                {
                    soloistQaHang: qaHang,
                    soloistResting: false,
                    soloistNotesInPhrase: 0,
                    bassHit: false,
                    soloistActive: false,
                    soloistBusy: false,
                },
            );
            const sounding = notes.filter((n) => n.midi > 0 && !n.muted);
            if (sounding.length === 0) {
                continue;
            }
            const topPc = ((Math.max(...sounding.map((n) => n.midi)) % 12) + 12) % 12;
            attackTops.set(abs, topPc);
            if (qaHang && abs >= qaHang.resolutionBarStart && abs < qaHang.resolutionBarEnd) {
                const { pillars } = chordTargetTones(entry.chord.rootMidi, entry.chord.quality);
                resolutionSamples.push({
                    hangStartStep: qaHang.hangStartStep,
                    abs,
                    topPc,
                    pillars,
                });
            }
        }
    }

    Math.random = origRandom;
    return { attackTops, windows, resolutionSamples, total };
}

/**
 * Pair an on/off run: a window FIRED iff its echo step shows a real difference —
 * an inserted attack the baseline didn't emit, or a re-voiced top now matching
 * the hang PC where the baseline didn't. Coincidental identical hits count as
 * nothing (that's the honesty fix over counting any attack at an echo step).
 */
function pairRuns(on, off) {
    const fired = [];
    let inserted = 0;
    let pcMatches = 0;
    for (const [hangStart, w] of on.windows) {
        const onTop = on.attackTops.get(w.echoStep);
        const offTop = off.attackTops.get(w.echoStep);
        if (onTop === undefined) {
            continue;
        }
        const isInserted = offTop === undefined;
        const isReVoiced = !isInserted && onTop !== offTop;
        if (!isInserted && !isReVoiced) {
            continue;
        }
        fired.push(hangStart);
        if (isInserted) {
            inserted++;
        }
        if (onTop === w.pc) {
            pcMatches++;
        }
    }
    return { fired, inserted, pcMatches };
}

/**
 * #1159 — LIVE-vs-digest cross-check. The `pcMatch` metric above compares the
 * comp echo against the same `getQaHangAt` digest the engine consumes, so it
 * proves the plumbing, not "the echo matches what the soloist actually sounds."
 * This drives the real `getSoloistNotePhraseFirst` at each fired window's
 * `hangStartStep` and compares its emitted pitch class to the digest pc.
 *
 * It is EXACT, by construction: at a `qaRole === 'question'` step the live
 * engine pins `primary.midi + bodyOctaveFold` (octave-only, so the pc
 * survives), and both branches that override the hang near the apex — the apex
 * step itself and the 2-bar dovetail into it — are exactly what
 * `computeQaWindows` excludes from its window list. So this is a real guard,
 * not a restatement: a soloist-side pitch override at a question cadence would
 * silently make the comper echo a tone the lead never played, and only this
 * assertion sees it. It already caught one — the apex-coincident window, fixed
 * in the same pass (#1159); a 14.5k-window sweep across every preset × 7 genres
 * is clean after that fix.
 *
 * Mismatches are collected as DESCRIPTORS, not just counted, so a future
 * failure names its own cause. That matters here specifically: a
 * `soloist-seeder.ts` change that shifts the PRNG stream re-rolls every seed
 * (reference: the stream-shift attribution trap), and a bare count would send
 * the author hunting in their own diff instead of at the digest/live gate pair.
 *
 * Known non-coverage, deliberate: the harness runs `mode: 'monophonic'`, so the
 * double-stop return shape (`[harmony, lead]`, lead last) never fires here —
 * reading the last voice is future-proofing, not an exercised path. The probe
 * also passes `coordination = {}`, disabling the #1020 seam terms; those move
 * density and velocity only, never pitch, so the probe stays pitch-faithful.
 */
function probeLiveHangPc(state, seed, on, firedSet, acc) {
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordAt = (abs) => {
        const w = ((abs % total) + total) % total;
        return stepMap.find((e) => w >= e.start && w < e.end) || null;
    };
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing.isResting = false;
    for (const [hangStart, w] of on.windows) {
        if (!firedSet.has(hangStart)) {
            continue;
        }
        const entry = chordAt(hangStart);
        if (!entry?.chord) {
            continue;
        }
        state.playback.currentLoopCount = Math.floor(hangStart / total);
        const res = getSoloistNotePhraseFirst(
            state,
            entry.chord,
            chordAt(hangStart + 1)?.chord ?? null,
            hangStart,
            null,
            state.soloist.octave,
            'smart',
            (((hangStart % total) + total) % total) - entry.start,
            {},
            null,
        );
        acc.liveProbed++;
        const voices = res ? (Array.isArray(res) ? res : [res]) : [];
        const lead = voices[voices.length - 1];
        // A rest here is a miss, and a loud one: a question cadence is exempt
        // from the density gate precisely so the hang always sounds.
        const livePc = typeof lead?.midi === 'number' ? ((lead.midi % 12) + 12) % 12 : -1;
        if (livePc === w.pc) {
            acc.liveMatched++;
            continue;
        }
        // Diagnostics that separate the two known divergence mechanisms: an
        // apex/dovetail override the digest failed to exclude (`here` holds one
        // note, the question), vs. the live gate reading `qaRole` off `here[0]`
        // when several seed notes share the step and the question isn't first.
        const loopLen = seed.loopLengthSteps || total;
        const sIL = ((hangStart % loopLen) + loopLen) % loopLen;
        const here = seed.notes.filter((n) => ((n.step % loopLen) + loopLen) % loopLen === sIL);
        acc.liveMismatches.push(
            `@${hangStart} live=${livePc === -1 ? 'REST' : livePc} digest=${w.pc}` +
                ` here=${here.length} here[0].qaRole=${here[0]?.qaRole ?? '-'}`,
        );
    }
}

function measureCase(presetName, genre, bpm, chordStyle, seedCount) {
    const acc = {
        windows: 0,
        fired: 0,
        inserted: 0,
        pcMatches: 0,
        attacksOn: 0,
        attacksOff: 0,
        earlyWindows: 0,
        earlyFired: 0,
        lateWindows: 0,
        lateFired: 0,
        rampLowFired: 0,
        rampHighFired: 0,
        resolutionTops: 0,
        resolutionPillarTops: 0,
        resolutionOffTops: 0,
        resolutionOffPillarTops: 0,
        liveProbed: 0,
        liveMatched: 0,
        liveMismatches: [],
    };
    for (let i = 0; i < seedCount; i++) {
        const state = buildState(presetName, genre, bpm, chordStyle);
        const seed = generateSessionSeed(
            state,
            state.arranger,
            'smart',
            0.5,
            `CQA_${presetName}_${i}`,
        );
        const rngSeed = 0xc0ffee ^ (i * 7919);
        const on = runComper(state, seed, true, rngSeed);
        const off = runComper(state, seed, false, rngSeed);
        const paired = pairRuns(on, off);
        const firedSet = new Set(paired.fired);

        // Ramp mechanism, isolated from lap placement: drive the SAME window
        // set with the loop tier PINNED at 0 (rate 25%) and at 3 (rate 55%).
        // The participation threshold is monotone per window, so the pinned-3
        // fired set must strictly contain the pinned-0 one — a structural
        // claim, robust to the small deterministic samples that make natural
        // early-vs-late lap rates noisy (those are still logged, info-only).
        const rampLow = pairRuns(
            runComper(state, seed, true, rngSeed, 0),
            runComper(state, seed, false, rngSeed, 0),
        );
        const rampHigh = pairRuns(
            runComper(state, seed, true, rngSeed, 3),
            runComper(state, seed, false, rngSeed, 3),
        );
        acc.rampLowFired += rampLow.fired.length;
        acc.rampHighFired += rampHigh.fired.length;

        acc.windows += on.windows.size;
        acc.fired += paired.fired.length;
        acc.inserted += paired.inserted;
        acc.pcMatches += paired.pcMatches;
        acc.attacksOn += on.attackTops.size;
        acc.attacksOff += off.attackTops.size;
        for (const [hangStart, w] of on.windows) {
            const lap = Math.floor(w.echoStep / on.total);
            const isFired = firedSet.has(hangStart);
            if (lap <= 1) {
                acc.earlyWindows++;
                if (isFired) {
                    acc.earlyFired++;
                }
            } else if (lap >= 3) {
                acc.lateWindows++;
                if (isFired) {
                    acc.lateFired++;
                }
            }
        }
        for (const sample of on.resolutionSamples) {
            if (!firedSet.has(sample.hangStartStep)) {
                continue;
            }
            acc.resolutionTops++;
            if (sample.pillars.includes(sample.topPc)) {
                acc.resolutionPillarTops++;
            }
            // Paired baseline for the same step (review P2 #3): the natural
            // top-pillar rate without the snap, so the assertion measures the
            // LIFT the gesture provides, not an absolute floor that might sit
            // below the un-snapped baseline anyway.
            const offTop = off.attackTops.get(sample.abs);
            if (offTop !== undefined) {
                acc.resolutionOffTops++;
                if (sample.pillars.includes(offTop)) {
                    acc.resolutionOffPillarTops++;
                }
            }
        }

        // #1159 — run LAST: it assigns the session seed onto `state`, and every
        // comper run above must see the same state the paired baseline did.
        probeLiveHangPc(state, seed, on, firedSet, acc);
    }
    return acc;
}

describe('Comper Q&A response critique (#1157)', () => {
    const CASES = [
        // style 'jazz' = what the genre picker actually sets for Blues (P0)
        { preset: '12-Bar Blues', genre: 'Blues', bpm: 100, style: 'jazz' },
        // style 'smart' = the manually-picked Smart Comping lane
        { preset: 'Pop (Ballad)', genre: 'Jazz', bpm: 72, style: 'smart' },
    ];

    for (const { preset, genre, bpm, style } of CASES) {
        it(`${preset} (${genre}/${style}): the comper catches questions — echo, no spam, warms up`, () => {
            const r = measureCase(preset, genre, bpm, style, 4);
            const delta = r.attacksOn - r.attacksOff;
            const firedRate = r.windows > 0 ? r.fired / r.windows : 0;
            const pcMatchRate = r.fired > 0 ? r.pcMatches / r.fired : 0;
            const earlyRate = r.earlyWindows > 0 ? r.earlyFired / r.earlyWindows : 0;
            const lateRate = r.lateWindows > 0 ? r.lateFired / r.lateWindows : 0;
            const resolutionRate =
                r.resolutionTops > 0 ? r.resolutionPillarTops / r.resolutionTops : 0;
            const resolutionOffRate =
                r.resolutionOffTops > 0 ? r.resolutionOffPillarTops / r.resolutionOffTops : 0;

            console.log(
                `\n--- ${preset} (${genre}) COMP Q&A RESPONSE CRITIQUE ---\n` +
                    `[Windows planned]        ${r.windows}\n` +
                    `[Windows fired]          ${r.fired}  (${(100 * firedRate).toFixed(1)}%; ${r.inserted} inserted)\n` +
                    `[Echo PC match]          ${(100 * pcMatchRate).toFixed(1)}%  (Target: ≥ 90%)\n` +
                    `[Attack delta on-off]    ${delta}  (Cap: ≤ inserted = ${r.inserted})\n` +
                    `[Ramp pinned 0 → 3]      ${r.rampLowFired} → ${r.rampHighFired} fired  (natural laps, info: ${(100 * earlyRate).toFixed(1)}% early → ${(100 * lateRate).toFixed(1)}% late)\n` +
                    `[Resolution pillar tops] ${(100 * resolutionRate).toFixed(1)}% on vs ${(100 * resolutionOffRate).toFixed(1)}% off  (Target: ≥ 80% and ≥ baseline)\n` +
                    `[Live hang pc == digest] ${r.liveMatched}/${r.liveProbed}  (Target: exact)\n` +
                    '-------------------------------------------------------\n',
            );

            // Sanity: the seed planned Q&A windows at all (else everything below
            // is vacuous — the harness must be able to SEE the property).
            expect(r.windows).toBeGreaterThan(0);
            // The catch is live end-to-end: paired-diff echoes actually sound.
            expect(r.fired).toBeGreaterThan(0);
            // Participation is a fraction of windows, not wall-to-wall — the
            // gesture stays an event (per-lap rates 25-55%, so the aggregate
            // falls well inside this band).
            expect(firedRate).toBeGreaterThan(0.15);
            expect(firedRate).toBeLessThan(0.8);
            // The echo ECHOES: fired top voices carry the question's tension PC.
            expect(pcMatchRate).toBeGreaterThanOrEqual(0.9);
            // Anti-spam covenant (#715): the gesture may add at most its own
            // inserted echoes — never a general density lift. Known slack
            // mechanism if this ever fails after a tuning change: an echo that
            // lands on a natural statement hit skips the #766 ring decision
            // (`!qaEcho`), so the OFF run may ring-suppress a LATER hit the ON
            // run keeps — check that divergence before suspecting real spam.
            expect(delta).toBeLessThanOrEqual(r.inserted);
            // The conversation warms up: at the loop-3 tier strictly more
            // windows fire than at the loop-0 tier (monotone rate, same
            // windows — the pinned comparison isolates the mechanism).
            expect(r.rampHighFired).toBeGreaterThan(r.rampLowFired);
            // Fired windows resolve WITH the soloist: answer-bar top voices land
            // pillars far more often than not — and at least as often as the
            // un-snapped baseline (the paired lift is what the snap provides).
            expect(resolutionRate).toBeGreaterThanOrEqual(0.8);
            expect(resolutionRate).toBeGreaterThanOrEqual(resolutionOffRate);
            // #1159 — the echo echoes the LEAD, not just the digest: driving the
            // real soloist at each fired hang step reproduces the digest pc
            // exactly. Guards a soloist-side pitch override at a question cadence
            // silently diverging the two — the comper would answer a tone the lead
            // never played, and every metric above would stay green. Asserted on
            // the descriptor list, not a count, so a failure names its own cause.
            expect(r.liveProbed).toBeGreaterThan(0);
            expect(r.liveMismatches).toEqual([]);
        });
    }

    it('Bossa Nova: NOT a catch genre — partido-alto already answers (zero fired, zero delta)', () => {
        // why: Bossa is deliberately excluded (not in RING_THROUGH_GENRES) — its
        // ostinato identity IS an answering figure, and the echo needs the ring
        // to connect to the resolution. The window feed must be a strict no-op.
        // Production Bossa carries style 'jazz' (smart-genres) but keeps genre
        // 'Bossa Nova' through the accompaniment Style Override — the RING
        // gate, not the style gate, is what excludes it. Drive that exact shape.
        const state = buildState('Pop (Ballad)', 'Bossa Nova', 84, 'jazz');
        const seed = generateSessionSeed(state, state.arranger, 'smart', 0.5, 'CQA_bossa_0');
        const on = runComper(state, seed, true, 0xb055a);
        const off = runComper(state, seed, false, 0xb055a);
        const paired = pairRuns(on, off);

        expect(on.windows.size).toBeGreaterThan(0); // windows exist…
        expect(paired.fired.length).toBe(0); // …but the comper never catches
        expect(on.attackTops.size).toBe(off.attackTops.size); // and emits identically
    });
});
