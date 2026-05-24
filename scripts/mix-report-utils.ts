// @ts-nocheck
import { normalizeSeedList } from './ensemble-analysis-utils.js';
import {
    parseCliArgs,
    readBooleanOption,
    readNumberOption,
    readStringOption,
} from './soloist-analysis-utils.js';

const DEFAULT_SEED = 'MIX_AUDIT';

// Per-scene finding thresholds calibrated 2026-05-24 against pro reference
// mixes via `npm run mix:analyze` (see tmp/references/calibration.json):
//   Jazz target  — Miles Davis "So What": sub+low 47%, air 4.5%, corr 0.59
//   Rock target  — Stone Temple Pilots "Interstate Love Song": 73% / 1.7% / 0.70
//   Blues target — B.B. King "The Thrill Is Gone": 79% / 3.6% / 0.72
//   Funk target  — Chic "I Want Your Love": 75% / 1.7% / 0.83
// Genre-agnostic defaults (used when a finding consumer doesn't pass scene
// targets — e.g. mix:analyze on an arbitrary file) are looser; they only fire
// on values none of the references hit.
export const DEFAULT_FINDING_THRESHOLDS = {
    subPlusLowMax: 0.85,
    airMin: 0.01,
    stereoCorrelationMax: 0.92,
};

export const DEFAULT_MIX_REPORT_SCENES = [
    {
        id: 'rock-backbeat',
        label: 'Rock Backbeat',
        genreFeel: 'Rock',
        drumPreset: 'Basic Rock',
        bpm: 118,
        intensity: 0.72,
        complexity: 0.58,
        key: 'C',
        sections: [
            {
                id: 'rock-a',
                label: 'Rock Groove',
                value: 'C | G | Am | F | C | G | F | G',
            },
        ],
        findingThresholds: {
            subPlusLowMax: 0.8,
            airMin: 0.015,
            stereoCorrelationMax: 0.85,
        },
    },
    {
        id: 'blues-shuffle',
        label: 'Blues Shuffle',
        genreFeel: 'Blues',
        drumPreset: 'Blues Shuffle',
        bpm: 96,
        intensity: 0.7,
        complexity: 0.6,
        key: 'C',
        sections: [
            {
                id: 'blues-a',
                label: 'Blues',
                value: 'C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | G7 | F7 | C7 | G7',
            },
        ],
        findingThresholds: {
            subPlusLowMax: 0.85,
            airMin: 0.025,
            stereoCorrelationMax: 0.85,
        },
    },
    {
        id: 'jazz-ride',
        label: 'Jazz Ride',
        genreFeel: 'Jazz',
        drumPreset: 'Jazz',
        bpm: 138,
        intensity: 0.64,
        complexity: 0.55,
        key: 'C',
        sections: [
            {
                id: 'jazz-a',
                label: 'Jazz Head',
                value: 'Dm7 | G7 | Cmaj7 | A7 | Dm7 | G7 | Cmaj7 | Cmaj7',
            },
        ],
        findingThresholds: {
            subPlusLowMax: 0.55,
            airMin: 0.035,
            stereoCorrelationMax: 0.7,
        },
    },
    {
        id: 'funk-pocket',
        label: 'Funk Pocket',
        genreFeel: 'Funk',
        drumPreset: 'Funk',
        bpm: 104,
        intensity: 0.78,
        complexity: 0.66,
        key: 'E',
        sections: [
            {
                id: 'funk-a',
                label: 'Funk Vamp',
                value: 'Em7 | Em7 | A7 | A7 | Em7 | Em7 | A7 | B7',
            },
        ],
        findingThresholds: {
            subPlusLowMax: 0.8,
            airMin: 0.015,
            stereoCorrelationMax: 0.85,
        },
    },
];

export const MIX_REPORT_STEMS = [
    {
        id: 'full',
        label: 'Full Mix',
        enabled: { drums: true, bass: true, chords: true, harmony: true, soloist: false },
        schedule: { modules: ['bass', 'chords', 'harmony'], voiceLimit: 8 },
    },
    {
        id: 'full+solo',
        label: 'Full Mix + Soloist',
        enabled: { drums: true, bass: true, chords: true, harmony: true, soloist: true },
        schedule: { modules: ['bass', 'chords', 'harmony', 'soloist'], voiceLimit: 9 },
    },
    {
        id: 'drums',
        label: 'Drums',
        enabled: { drums: true, bass: false, chords: false, harmony: false, soloist: false },
        schedule: null,
    },
    {
        id: 'bass',
        label: 'Bass',
        enabled: { drums: false, bass: true, chords: false, harmony: false, soloist: false },
        schedule: { modules: ['bass'], voiceLimit: 1 },
    },
    {
        id: 'chords',
        label: 'Chords',
        enabled: { drums: false, bass: false, chords: true, harmony: false, soloist: false },
        schedule: { modules: ['chords'], voiceLimit: 5 },
    },
    {
        id: 'harmony',
        label: 'Harmony',
        enabled: { drums: false, bass: false, chords: false, harmony: true, soloist: false },
        schedule: { modules: ['harmony'], voiceLimit: 3 },
    },
    {
        id: 'soloist',
        label: 'Soloist',
        enabled: { drums: false, bass: false, chords: false, harmony: false, soloist: true },
        schedule: { modules: ['soloist'], voiceLimit: 1 },
    },
];

function average(values) {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundValue(value, digits = 3) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function cloneScene(scene) {
    return {
        ...scene,
        sections: (scene.sections || []).map((section) => ({ ...section })),
    };
}

function rankFocusRows(rows) {
    return [...rows].sort((left, right) => {
        const leftIssue = Number(left.issueScore || 0);
        const rightIssue = Number(right.issueScore || 0);
        if (rightIssue !== leftIssue) {
            return rightIssue - leftIssue;
        }

        const leftLock = Number(left.bassKickLockMs || 0);
        const rightLock = Number(right.bassKickLockMs || 0);
        if (rightLock !== leftLock) {
            return rightLock - leftLock;
        }

        const leftOverlap = Number(left.chordSoloistOverlapShare || 0);
        const rightOverlap = Number(right.chordSoloistOverlapShare || 0);
        if (rightOverlap !== leftOverlap) {
            return rightOverlap - leftOverlap;
        }

        return String(left.seed || '').localeCompare(String(right.seed || ''));
    });
}

function buildStemAggregate(samples) {
    if (samples.length === 0) {
        return null;
    }

    const schedules = samples.map((sample) => sample.schedule).filter(Boolean);
    const onsetGaps = schedules
        .map((schedule) => schedule.minOnsetGapMs)
        .filter((value) => Number.isFinite(value) && value > 0);

    return {
        sampleCount: samples.length,
        peakDb: roundValue(average(samples.map((sample) => sample.peakDb)), 2),
        rmsDb: roundValue(average(samples.map((sample) => sample.rmsDb)), 2),
        crestDb: roundValue(average(samples.map((sample) => sample.crestDb)), 2),
        transients: {
            maxDelta: roundValue(
                average(samples.map((sample) => sample.transients?.maxDelta || 0)),
                4,
            ),
            spikeRate: roundValue(
                average(samples.map((sample) => sample.transients?.spikeRate || 0)),
                2,
            ),
        },
        probes: {
            sub: roundValue(average(samples.map((sample) => sample.probes?.sub || 0)), 4),
            lowMid: roundValue(average(samples.map((sample) => sample.probes?.lowMid || 0)), 4),
            presence: roundValue(average(samples.map((sample) => sample.probes?.presence || 0)), 4),
            air: roundValue(average(samples.map((sample) => sample.probes?.air || 0)), 4),
            centroid: roundValue(average(samples.map((sample) => sample.probes?.centroid || 0)), 2),
        },
        schedule:
            schedules.length === 0
                ? null
                : {
                      eventCount: roundValue(
                          average(schedules.map((schedule) => schedule.eventCount || 0)),
                          2,
                      ),
                      maxNotesPerStep: roundValue(
                          average(schedules.map((schedule) => schedule.maxNotesPerStep || 0)),
                          2,
                      ),
                      overLimitSteps: roundValue(
                          average(schedules.map((schedule) => schedule.overLimitSteps || 0)),
                          2,
                      ),
                      maxSimultaneousVoices: roundValue(
                          average(schedules.map((schedule) => schedule.maxSimultaneousVoices || 0)),
                          2,
                      ),
                      sameMidiOverlapCount: roundValue(
                          average(schedules.map((schedule) => schedule.sameMidiOverlapCount || 0)),
                          2,
                      ),
                      voiceLimitPressureCount: roundValue(
                          average(
                              schedules.map((schedule) => schedule.voiceLimitPressureCount || 0),
                          ),
                          2,
                      ),
                      minOnsetGapMs: roundValue(average(onsetGaps), 2),
                  },
    };
}

function buildSceneAggregate(seedRows) {
    const stemIds = new Set();
    seedRows.forEach((seedRow) => {
        Object.keys(seedRow.stems || {}).forEach((stemId) => stemIds.add(stemId));
    });

    return {
        sampleCount: seedRows.length,
        stems: Object.fromEntries(
            [...stemIds].map((stemId) => [
                stemId,
                buildStemAggregate(
                    seedRows.map((seedRow) => seedRow.stems[stemId]).filter(Boolean),
                ),
            ]),
        ),
    };
}

function buildReportAggregate(sceneRows) {
    const stemIds = new Set();
    sceneRows.forEach((sceneRow) => {
        sceneRow.seeds.forEach((seedRow) => {
            Object.keys(seedRow.stems || {}).forEach((stemId) => stemIds.add(stemId));
        });
    });

    return {
        sceneCount: sceneRows.length,
        seedCount: sceneRows.reduce((sum, sceneRow) => sum + sceneRow.seeds.length, 0),
        sampleCount: sceneRows.reduce((sum, sceneRow) => sum + sceneRow.seeds.length, 0),
        stems: Object.fromEntries(
            [...stemIds].map((stemId) => [
                stemId,
                buildStemAggregate(
                    sceneRows.flatMap((sceneRow) =>
                        sceneRow.seeds.map((seedRow) => seedRow.stems[stemId]).filter(Boolean),
                    ),
                ),
            ]),
        ),
    };
}

export function resolveMixReportCliOptions(argv = []) {
    const options = parseCliArgs(argv);
    const baseSeed = readStringOption(options, 'seed', DEFAULT_SEED);
    const seedSweepOption = readStringOption(options, 'seeds', '');
    const sceneOption = readStringOption(options, 'scenes', readStringOption(options, 'scene', ''));

    return {
        baseSeed,
        seeds: normalizeSeedList(baseSeed, seedSweepOption),
        seedsExplicit: Object.hasOwn(options, 'seed') || seedSweepOption.trim().length > 0,
        sceneIds: sceneOption
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        json: readBooleanOption(options, 'json', false),
        jsonl: readBooleanOption(options, 'jsonl', false),
        pretty: readBooleanOption(options, 'pretty', false),
        focusFrom: readStringOption(options, 'focus-from', '') || null,
        focusLimit: Math.max(1, Math.floor(readNumberOption(options, 'focus-limit', 3))),
        noBuild: readBooleanOption(options, 'no-build', false),
        writeWav: readStringOption(options, 'write-wav', '') || null,
        // Render each scene through N loops of its progression so the
        // soloist's chorus-evolution architecture (Loop 0 head → Loop 1
        // themed → Loop 2+ exploratory) actually expresses. The per-loop
        // RMS arc gets reported per stem so front-loaded / arc-shaped /
        // flat intensity trajectories surface as hard numbers.
        loops: Math.max(1, Math.floor(readNumberOption(options, 'loops', 1))),
    };
}

export function selectMixReportScenes(scenes, requestedIds = []) {
    if (requestedIds.length === 0) {
        return scenes.map(cloneScene);
    }

    const selected = requestedIds.map((requestedId) => {
        const match = scenes.find((scene) => scene.id === requestedId);
        if (!match) {
            throw new Error(`Unknown mix report scene: ${requestedId}`);
        }
        return cloneScene(match);
    });

    return selected;
}

export function parseEnsembleAuditInput(text, options = {}) {
    const { focusLimit = 3 } = options;
    const trimmed = String(text || '').trim();
    if (!trimmed) {
        throw new Error('Focus input is empty');
    }

    try {
        const payload = JSON.parse(trimmed);
        if (payload && payload.reportType === 'ensemble-audit') {
            const ranked = rankFocusRows(
                payload.focusSeeds?.length ? payload.focusSeeds : payload.seeds,
            );
            const focusSeeds = ranked.slice(0, focusLimit).map((row, index) => ({
                focusRank: index + 1,
                ...row,
            }));
            if (focusSeeds.length === 0) {
                throw new Error('Ensemble audit did not include any seed rows');
            }
            return {
                reportType: payload.reportType,
                renderScene: payload.renderScene || null,
                focusSeeds,
                seeds: focusSeeds.map((row) => row.seed),
            };
        }
    } catch {
        // Fall through to NDJSON parsing.
    }

    const rows = trimmed
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    const aggregateRow = rows.find(
        (row) => row.kind === 'aggregate' && row.reportType === 'ensemble-audit',
    );
    if (!aggregateRow) {
        throw new Error('Focus input was not a supported ensemble audit JSON or JSONL payload');
    }

    const focusRows = rows.filter((row) => row.kind === 'focus');
    const seedRows = focusRows.length > 0 ? focusRows : rows.filter((row) => row.kind === 'seed');
    const ranked = rankFocusRows(seedRows);
    const limited = ranked.slice(0, focusLimit).map((row, index) => ({
        focusRank: index + 1,
        ...row,
    }));
    if (limited.length === 0) {
        throw new Error('Ensemble audit did not include any focus seeds');
    }

    return {
        reportType: aggregateRow.reportType,
        renderScene: aggregateRow.renderScene || null,
        focusSeeds: limited,
        seeds: limited.map((row) => row.seed),
    };
}

export function summarizeRenderedFindings(stems, thresholds = DEFAULT_FINDING_THRESHOLDS) {
    const subPlusLowMax = thresholds?.subPlusLowMax ?? DEFAULT_FINDING_THRESHOLDS.subPlusLowMax;
    const airMin = thresholds?.airMin ?? DEFAULT_FINDING_THRESHOLDS.airMin;
    const stereoCorrelationMax =
        thresholds?.stereoCorrelationMax ?? DEFAULT_FINDING_THRESHOLDS.stereoCorrelationMax;
    const full = stems.full;
    const fullWithSolo = stems['full+solo'];
    const drums = stems.drums;
    const bass = stems.bass;
    const chords = stems.chords;
    const harmony = stems.harmony;
    const soloist = stems.soloist;
    const notes = [];

    if (drums && full) {
        if (drums.rmsDb < full.rmsDb - 8.5) {
            notes.push('drums sit fairly far behind the master bed');
        } else if (drums.rmsDb > full.rmsDb - 5) {
            notes.push('drums are very forward in the mix');
        } else {
            notes.push('drums are in a healthy backing-band range');
        }

        if (drums.probes?.presence > (chords?.probes?.presence || 0) * 1.4) {
            notes.push('drums dominate the presence band more than chords');
        }
    }

    if (bass?.probes?.sub > (chords?.probes?.sub || 0) * 3) {
        notes.push('bass owns the sub slot cleanly');
    }

    if (chords?.probes?.lowMid > (bass?.probes?.lowMid || 0) * 1.2) {
        notes.push('chords carry most of the low-mid harmonic body');
    }

    if (harmony?.rmsDb > -80 && harmony.probes?.air > (chords?.probes?.air || 0) * 0.9) {
        notes.push('harmony contributes meaningful top-end air');
    }

    const fullReference = fullWithSolo || full;
    if (soloist && fullReference) {
        if (soloist.rmsDb < fullReference.rmsDb - 8) {
            notes.push('soloist gets buried behind the bed');
        } else if (soloist.rmsDb > fullReference.rmsDb - 2) {
            notes.push('soloist sits very forward — almost solo');
        } else {
            notes.push('soloist sits forward of the bed at a lead level');
        }
    }

    if ((harmony?.schedule?.voiceLimitPressureCount || 0) > 0) {
        notes.push(
            `harmony exceeds the 3-voice live cap ${harmony.schedule.voiceLimitPressureCount} times`,
        );
    }

    if ((harmony?.schedule?.sameMidiOverlapCount || 0) > 0) {
        notes.push(
            `harmony retriggers the same pitch before release ${harmony.schedule.sameMidiOverlapCount} times`,
        );
    }

    if ((harmony?.transients?.maxDelta || 0) > 0.08 || (harmony?.transients?.spikeRate || 0) > 6) {
        notes.push('harmony stem shows sharp waveform edges worth auditing');
    }

    // Architectural-bias findings, calibrated 2026-05-24 against pro reference
    // mixes (see DEFAULT_FINDING_THRESHOLDS comment for sources). Defaults are
    // genre-agnostic and intentionally loose; scene-aware callers pass tighter
    // thresholds via the `findingThresholds` field on each scene.
    if (full?.probes) {
        const subPlusLow = (full.probes.sub || 0) + (full.probes.low || 0);
        if (subPlusLow > subPlusLowMax) {
            notes.push(
                `full mix is bottom-heavy — ${Math.round(subPlusLow * 100)}% of energy in sub+low bands`,
            );
        }
    }

    const allStems = [full, fullWithSolo, drums, bass, chords, harmony, soloist].filter(Boolean);
    const maxAir = allStems.reduce((max, s) => Math.max(max, s.probes?.air || 0), 0);
    if (allStems.length > 0 && maxAir < airMin) {
        notes.push(
            `no stem owns the air band above 5 kHz (max air ratio across stems: ${maxAir.toFixed(3)})`,
        );
    }

    if (full?.stereo?.correlation != null && full.stereo.correlation > stereoCorrelationMax) {
        notes.push(
            `full mix is functionally mono — L/R correlation ${full.stereo.correlation.toFixed(3)}, side energy ${((full.stereo.sideRatio || 0) * 100).toFixed(1)}%`,
        );
    }

    if (full?.arc === 'front-loaded') {
        notes.push(
            'full mix intensity is front-loaded across loops — energy in loop 0 then collapses',
        );
    } else if (full?.arc === 'flat' && Array.isArray(full.loopRmsDb) && full.loopRmsDb.length > 1) {
        // Only flag flatness as a finding when we actually rendered multiple
        // loops — single-loop renders are always "flat" by definition.
        notes.push('full mix dynamics are flat across loops — no intensity arc');
    }

    return notes;
}

export function buildRenderedMixReport({ sceneRuns, options, source = { kind: 'manual' } }) {
    const focusLookup = new Map(
        (source.focusSeeds || []).map((focusRow, index) => [
            focusRow.seed,
            {
                ...focusRow,
                focusRank: focusRow.focusRank || index + 1,
            },
        ]),
    );

    const scenes = sceneRuns.map((sceneRun) => {
        const seeds = sceneRun.seeds.map((seedRun) => ({
            seed: seedRun.seed,
            focus: focusLookup.get(seedRun.seed) || null,
            findings: summarizeRenderedFindings(seedRun.stems, sceneRun.findingThresholds),
            stems: seedRun.stems,
        }));

        return {
            id: sceneRun.id,
            label: sceneRun.label || sceneRun.id,
            genreFeel: sceneRun.genreFeel,
            bpm: sceneRun.bpm,
            intensity: sceneRun.intensity,
            source: sceneRun.source || 'default',
            seeds,
            aggregate: buildSceneAggregate(seeds),
        };
    });

    return {
        reportType: 'rendered-audio-audit',
        options,
        source: {
            ...source,
            focusSeeds: undefined,
        },
        aggregate: buildReportAggregate(scenes),
        scenes,
    };
}

export function formatRenderedMixReport(report, options = {}) {
    const { jsonl = false, pretty = false } = options;
    if (!jsonl) {
        return JSON.stringify(report, null, pretty ? 2 : undefined);
    }

    const lines = [
        JSON.stringify({
            kind: 'aggregate',
            reportType: report.reportType,
            options: report.options,
            source: report.source,
            aggregate: report.aggregate,
        }),
    ];

    report.scenes.forEach((scene) => {
        lines.push(
            JSON.stringify({
                kind: 'scene',
                reportType: report.reportType,
                sceneId: scene.id,
                label: scene.label,
                genreFeel: scene.genreFeel,
                bpm: scene.bpm,
                intensity: scene.intensity,
                source: scene.source,
                aggregate: scene.aggregate,
            }),
        );

        scene.seeds.forEach((seedRow) => {
            lines.push(
                JSON.stringify({
                    kind: 'seed',
                    reportType: report.reportType,
                    sceneId: scene.id,
                    label: scene.label,
                    seed: seedRow.seed,
                    focus: seedRow.focus,
                    findings: seedRow.findings,
                }),
            );

            Object.entries(seedRow.stems).forEach(([stemId, metrics]) => {
                lines.push(
                    JSON.stringify({
                        kind: 'stem',
                        reportType: report.reportType,
                        sceneId: scene.id,
                        label: scene.label,
                        seed: seedRow.seed,
                        stem: stemId,
                        ...metrics,
                    }),
                );
            });
        });
    });

    return lines.join('\n');
}
