// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// S4 routing critique: genreFeel='Minimal' with bass style='smart' must resolve
// to 'whole' via SMART_BASS_STYLE_MAP (config.ts:114). Before this story Minimal
// silently fell through to fallback 'rock' and played driving 8ths — the
// antithesis of the minimal-bass floor. The tests below assert (1) the routing
// is no longer rock (sparse hits, downbeat-anchored) and (2) the 'whole' floor
// behavior holds: one hit per chord/measure, root-dominant.
//
// NOTE: thresholds are intentionally banded (not toBe) because the current
// 'whole' route ships the drone-end of minimalism. If a future story upgrades
// Minimal to a broken-chord pattern strategy (Reich/Glass-style), hit counts
// will rise and root purity will dilute as 3rds/5ths enter the line. The
// ranges below allow that upgrade without forcing a test rewrite, while still
// failing loudly if routing slips back to rock (rock would hit 100+/bar).
describe('Minimal Bassist Critique (Smart routing → whole)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.5, complexity: 0.5, bpm: 100 },
            groove: {
                genreFeel: 'Minimal',
                lastDrumPreset: 'Minimal',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: numBars * 16,
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const chordC = { rootMidi: 48, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            // Pass 'smart' so SMART_BASS_STYLE_MAP routing is exercised end-to-end.
            const active = isBassActive(getState(), 'smart', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'smart',
                    0,
                    globalStep,
                    globalStep % 16,
                    {},
                    info,
                );
                if (note) {
                    performance.push({
                        step: globalStep,
                        loopStep: globalStep % 16,
                        info,
                        note,
                        chord: chordC,
                    });
                    prevFreq = note.freq || 0;
                }
            }
        }
        return performance;
    };

    it('should route Minimal away from rock (sparse hits, not driving 8ths)', () => {
        // Rock style fires every 8th (8 hits/bar at intensity 0.5+ → ~128 hits
        // over 16 bars). The 'whole' floor fires once per bar (16 hits/16 bars).
        // A broken-chord upgrade later could push that to ~32-48 (quarters or
        // pulsed halves) without becoming rock-like. Floor: ≥ 8 (sanity
        // that something fires); Ceiling: ≤ 64 (cleanly under rock's ~128).
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.85, complexity: 0.5, bpm: 100 },
        });

        console.log(`[Minimal Routing] Hits over 16 bars: ${performance.length}`);
        expect(performance.length).toBeGreaterThanOrEqual(8);
        expect(performance.length).toBeLessThanOrEqual(64);
    });

    it('should anchor on the downbeat of each measure', () => {
        const performance = simulatePerformance(16);

        // Every measure must have its downbeat hit. Off-downbeat hits would
        // appear if a future broken-chord pattern lands; that's fine. What we
        // guard against is the rock-style off-beat-dominant texture (where
        // downbeats can be ducked).
        const downbeatHits = performance.filter((p) => p.info.isMeasureStart).length;
        console.log(
            `[Minimal Routing] Downbeat coverage: ${downbeatHits}/16 measures, total=${performance.length}`,
        );
        expect(downbeatHits).toBe(16);
    });

    it('should be strongly root-dominant', () => {
        const performance = simulatePerformance(16);

        const rootHits = performance.filter(
            (p) => p.note.midi % 12 === p.chord.rootMidi % 12,
        ).length;
        const ratio = rootHits / (performance.length || 1);
        console.log(`[Minimal Routing] Root dominance: ${(ratio * 100).toFixed(1)}%`);
        // 'whole' branch ships pure root (ratio === 1.0); a future broken-chord
        // upgrade would weave in 3rds/5ths and dilute to ~0.5. Floor 0.5 keeps
        // both regimes valid and still rejects rock (which adds 5ths/octaves
        // but also a lot of scalar passing tones at high intensity).
        expect(ratio).toBeGreaterThanOrEqual(0.5);
    });

    it('should stay sparse across intensity levels (no rock-style escalation)', () => {
        // Sparseness is what 'minimal' means — intensity must NOT push the
        // line into rock-density 8ths. The 'whole' floor is invariant; a
        // future broken-chord upgrade may add a modest scale with intensity
        // but should never approach rock's ~128 hits/16 bars at intensity 0.95.
        const low = simulatePerformance(8, {
            playback: { bandIntensity: 0.2, complexity: 0.2, bpm: 100 },
        });
        const high = simulatePerformance(8, {
            playback: { bandIntensity: 0.95, complexity: 0.9, bpm: 100 },
        });
        console.log(`[Minimal Routing] Density: low=${low.length} high=${high.length}`);
        // Both windows ≤ 32 over 8 bars: cleanly under rock (which would be
        // ~64+ at high intensity). 'whole' currently ships low=8/high=8.
        expect(low.length).toBeLessThanOrEqual(32);
        expect(high.length).toBeLessThanOrEqual(32);
        // Sanity floor: something must fire.
        expect(low.length).toBeGreaterThanOrEqual(4);
        expect(high.length).toBeGreaterThanOrEqual(4);
    });
});
