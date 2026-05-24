/**
 * Diff two `npm run mix:report -- --json` outputs and surface stems whose
 * dynamics or spectral balance moved more than the noise floor. The goal
 * isn't to judge "better" vs "worse" — that's the user's ear — but to
 * draw their attention to the stems where something actually changed
 * since the baseline, so they don't have to listen to identical renders.
 */

export interface MixDiffThresholds {
    /** Absolute dB delta on peak/RMS/crest beyond which a change is "significant". */
    db: number;
    /** Relative change in a normalized spectral band ratio (e.g. 0.05 = 5% relative). */
    spectralRelative: number;
    /** Absolute change in transient spike rate (spikes/sec). */
    spikeRate: number;
}

export const DEFAULT_DIFF_THRESHOLDS: MixDiffThresholds = {
    db: 1.5,
    spectralRelative: 0.05,
    spikeRate: 1.5,
};

export const DB_METRICS = ['peakDb', 'rmsDb', 'crestDb'] as const;
export const SPECTRAL_BANDS = ['sub', 'low', 'lowMid', 'mid', 'presence', 'air'] as const;

interface StemMetrics {
    peakDb?: number;
    rmsDb?: number;
    crestDb?: number;
    transients?: { maxDelta?: number; spikeRate?: number };
    probes?: Partial<Record<(typeof SPECTRAL_BANDS)[number], number>> & { centroid?: number };
}

interface SeedRow {
    seed: string;
    stems: Record<string, StemMetrics>;
}

interface SceneRow {
    id: string;
    label?: string;
    seeds: SeedRow[];
}

interface MixReport {
    reportType?: string;
    scenes: SceneRow[];
}

export type StemDeltaStatus = 'significant' | 'no-change' | 'missing';

export interface StemDelta {
    sceneId: string;
    seed: string;
    stem: string;
    status: StemDeltaStatus;
    metrics: Array<{
        name: string;
        before: number;
        after: number;
        delta: number;
        relative?: number;
        significant: boolean;
    }>;
}

export interface MixDiffReport {
    reportType: 'mix-diff';
    thresholds: MixDiffThresholds;
    stems: StemDelta[];
    summary: {
        compared: number;
        significant: number;
        missing: number;
    };
}

export function loadMixReport(json: string): MixReport {
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.scenes)) {
        throw new Error('Input is not a mix-report --json document (missing scenes[])');
    }
    return parsed as MixReport;
}

export function diffMixReports(
    before: MixReport,
    after: MixReport,
    thresholds: MixDiffThresholds = DEFAULT_DIFF_THRESHOLDS,
): MixDiffReport {
    const stems: StemDelta[] = [];
    let significant = 0;
    let missing = 0;

    const beforeScenes = new Map(before.scenes.map((scene) => [scene.id, scene]));

    for (const afterScene of after.scenes) {
        const beforeScene = beforeScenes.get(afterScene.id);
        if (!beforeScene) {
            // Whole scene is new on the after side — surface as missing-baseline.
            for (const seedRow of afterScene.seeds) {
                for (const stemId of Object.keys(seedRow.stems)) {
                    stems.push({
                        sceneId: afterScene.id,
                        seed: seedRow.seed,
                        stem: stemId,
                        status: 'missing',
                        metrics: [],
                    });
                    missing++;
                }
            }
            continue;
        }

        const beforeSeeds = new Map(beforeScene.seeds.map((row) => [row.seed, row]));
        for (const afterSeed of afterScene.seeds) {
            const beforeSeed = beforeSeeds.get(afterSeed.seed);
            if (!beforeSeed) {
                for (const stemId of Object.keys(afterSeed.stems)) {
                    stems.push({
                        sceneId: afterScene.id,
                        seed: afterSeed.seed,
                        stem: stemId,
                        status: 'missing',
                        metrics: [],
                    });
                    missing++;
                }
                continue;
            }

            for (const [stemId, afterStem] of Object.entries(afterSeed.stems)) {
                const beforeStem = beforeSeed.stems[stemId];
                if (!beforeStem) {
                    stems.push({
                        sceneId: afterScene.id,
                        seed: afterSeed.seed,
                        stem: stemId,
                        status: 'missing',
                        metrics: [],
                    });
                    missing++;
                    continue;
                }

                const metrics = compareStems(beforeStem, afterStem, thresholds);
                const isSignificant = metrics.some((m) => m.significant);
                if (isSignificant) {
                    significant++;
                }
                stems.push({
                    sceneId: afterScene.id,
                    seed: afterSeed.seed,
                    stem: stemId,
                    status: isSignificant ? 'significant' : 'no-change',
                    metrics,
                });
            }
        }
    }

    return {
        reportType: 'mix-diff',
        thresholds,
        stems,
        summary: {
            compared: stems.length - missing,
            significant,
            missing,
        },
    };
}

function compareStems(
    before: StemMetrics,
    after: StemMetrics,
    thresholds: MixDiffThresholds,
): StemDelta['metrics'] {
    const rows: StemDelta['metrics'] = [];

    for (const name of DB_METRICS) {
        const b = numeric(before[name]);
        const a = numeric(after[name]);
        const delta = a - b;
        rows.push({
            name,
            before: b,
            after: a,
            delta,
            significant: Math.abs(delta) >= thresholds.db,
        });
    }

    for (const band of SPECTRAL_BANDS) {
        const b = numeric(before.probes?.[band]);
        const a = numeric(after.probes?.[band]);
        const delta = a - b;
        // Relative change vs the larger of the two so a tiny baseline doesn't
        // produce an infinite ratio. Floor at a small epsilon so absent bands
        // don't trigger noise.
        const denom = Math.max(Math.abs(b), Math.abs(a), 1e-4);
        const relative = delta / denom;
        rows.push({
            name: `probe.${band}`,
            before: b,
            after: a,
            delta,
            relative,
            significant: Math.abs(relative) >= thresholds.spectralRelative,
        });
    }

    const spikeBefore = numeric(before.transients?.spikeRate);
    const spikeAfter = numeric(after.transients?.spikeRate);
    rows.push({
        name: 'transients.spikeRate',
        before: spikeBefore,
        after: spikeAfter,
        delta: spikeAfter - spikeBefore,
        significant: Math.abs(spikeAfter - spikeBefore) >= thresholds.spikeRate,
    });

    return rows;
}

function numeric(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function formatMixDiffHuman(diff: MixDiffReport): string {
    const lines: string[] = [];
    lines.push('=== Mix Diff ===');
    lines.push(
        `Compared: ${diff.summary.compared}  Significant: ${diff.summary.significant}  Missing baseline: ${diff.summary.missing}`,
    );
    lines.push(
        `Thresholds: ±${diff.thresholds.db} dB · ±${(diff.thresholds.spectralRelative * 100).toFixed(0)}% spectral · ±${diff.thresholds.spikeRate} spikes/sec`,
    );

    const significantStems = diff.stems.filter((stem) => stem.status === 'significant');
    if (significantStems.length === 0) {
        lines.push('');
        lines.push('No stems exceeded the diff threshold.');
        if (diff.summary.missing > 0) {
            lines.push(`(${diff.summary.missing} stem(s) had no baseline to compare against.)`);
        }
        return lines.join('\n');
    }

    for (const stem of significantStems) {
        lines.push('');
        lines.push(`[${stem.sceneId} / ${stem.seed} / ${stem.stem}]`);
        for (const metric of stem.metrics) {
            if (!metric.significant) {
                continue;
            }
            const deltaLabel = formatDelta(metric.name, metric.delta, metric.relative);
            lines.push(
                `  ${metric.name.padEnd(22)} ${formatNumber(metric.before)} → ${formatNumber(metric.after)}  (${deltaLabel})`,
            );
        }
    }

    return lines.join('\n');
}

function formatDelta(name: string, delta: number, relative?: number): string {
    const sign = delta >= 0 ? '+' : '';
    if (name.startsWith('probe.') && typeof relative === 'number') {
        return `${sign}${(relative * 100).toFixed(1)}%`;
    }
    if (name.endsWith('Db')) {
        return `${sign}${delta.toFixed(2)} dB`;
    }
    return `${sign}${delta.toFixed(3)}`;
}

function formatNumber(value: number): string {
    if (Math.abs(value) >= 1000) {
        return value.toFixed(0);
    }
    if (Math.abs(value) >= 1) {
        return value.toFixed(2);
    }
    return value.toFixed(4);
}
