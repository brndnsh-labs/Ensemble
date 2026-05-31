import { setSectionInstrumentEnabled, setSectionIntensity } from '../../arranger-controller.js';
import type { Section, SectionInstrumentKey } from '../../types.js';
import { useEnsembleState } from '../../ui-bridge.js';
import { Icon, type IconName } from '../Icon.jsx';

interface Lane {
    key: SectionInstrumentKey;
    icon: IconName;
    title: string;
}

// Each lane carries its instrument glyph; the per-instrument color is applied
// in CSS via the `section-strip__lane--<key>` modifier so the dot reads as the
// same identity used in the rail and visualizer (drums taupe, bass green,
// chords blue, harmony violet, soloist magenta).
const LANES: Lane[] = [
    { key: 'groove', icon: 'drums', title: 'Drums' },
    { key: 'bass', icon: 'bass', title: 'Bass' },
    { key: 'chords', icon: 'chords', title: 'Chords' },
    { key: 'harmony', icon: 'harmony', title: 'Harmony' },
    { key: 'soloist', icon: 'soloist', title: 'Soloist' },
];

// Tri-state cycle: follow (undefined) → on (true) → off (false) → follow.
function nextOverride(current: boolean | undefined): boolean | undefined {
    if (current === undefined) {
        return true;
    }
    if (current === true) {
        return false;
    }
    return undefined;
}

/**
 * Discrete sheet-music dynamic marks. Six steps from `pp` (very soft) to `ff`
 * (very loud) — the compact-mode replacement for the precise 0–1 slider.
 * Tapping cycles to the next step. Includes a `follow` sentinel meaning
 * "use the global band-intensity — no per-section override."
 */
const DYNAMIC_STEPS: Array<{
    id: string;
    label: string;
    value: number | undefined;
    title: string;
}> = [
    { id: 'follow', label: '—', value: undefined, title: 'Following global' },
    { id: 'pp', label: 'pp', value: 0.15, title: 'Very soft (pp)' },
    { id: 'p', label: 'p', value: 0.3, title: 'Soft (p)' },
    { id: 'mp', label: 'mp', value: 0.45, title: 'Medium-soft (mp)' },
    { id: 'mf', label: 'mf', value: 0.6, title: 'Medium-loud (mf)' },
    { id: 'f', label: 'f', value: 0.78, title: 'Loud (f)' },
    { id: 'ff', label: 'ff', value: 0.95, title: 'Very loud (ff)' },
];

/**
 * Map an arbitrary numeric override back to the nearest dynamic step. When the
 * section's targetIntensity was set via the unlocked-mode slider, the value may
 * not match a step exactly — round to the closest one for display + cycling.
 */
function findCurrentStep(value: number | undefined): number {
    if (value === undefined) {
        return 0; // follow
    }
    let bestIdx = 1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 1; i < DYNAMIC_STEPS.length; i++) {
        const d = Math.abs((DYNAMIC_STEPS[i].value as number) - value);
        if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
        }
    }
    return bestIdx;
}

interface SectionHeaderStripProps {
    section: Section;
    /** Optional compact density when the strip is rendered alongside chart cells. */
    compact?: boolean;
}

/**
 * Per-section direction strip: an intensity slider plus five tri-state instrument
 * dots (Drums / Bass / Chords / Harmony / Soloist). Mounted above each section in
 * both the locked chord-visualizer view and the unlocked section-card editor — the
 * conductor's "softer here / drop the drums / build it up" gestures expressed as
 * persistent, tactile controls on the section itself.
 */
export function SectionHeaderStrip({ section, compact = false }: SectionHeaderStripProps) {
    // Defensive reads: tests stub useEnsembleState with bespoke shapes that may
    // omit the slices the strip needs. Production state always has all five
    // instrument slices and playback wired.
    const selected = useEnsembleState((s) => ({
        globalIntensity: s?.playback?.bandIntensity ?? 0,
        isPlaying: !!s?.playback?.isPlaying,
        globalEnabled: {
            groove: s?.groove?.enabled ?? true,
            bass: s?.bass?.enabled ?? true,
            chords: s?.chords?.enabled ?? true,
            harmony: s?.harmony?.enabled ?? true,
            soloist: s?.soloist?.enabled ?? true,
        },
    }));
    const globalIntensity = selected?.globalIntensity ?? 0;
    const isPlaying = !!selected?.isPlaying;
    const globalEnabled = selected?.globalEnabled ?? {
        groove: true,
        bass: true,
        chords: true,
        harmony: true,
        soloist: true,
    };

    // While the band is playing in the locked sheet-music view, hide the
    // direction controls so the chart reads clean — you direct between takes,
    // not during them. The unlocked SectionCard view keeps the strip visible
    // because edit-while-playing is already paused by the lock controller.
    if (compact && isPlaying) {
        return (
            <div class="section-strip section-strip--compact section-strip--playing">
                <span class="section-strip__label" aria-hidden="true">
                    {section.label}
                </span>
            </div>
        );
    }

    const hasIntensityOverride = typeof section.targetIntensity === 'number';
    const intensityValue = hasIntensityOverride
        ? (section.targetIntensity as number)
        : globalIntensity;

    return (
        <div
            class={`section-strip${compact ? ' section-strip--compact' : ''}${
                hasIntensityOverride ? '' : ' section-strip--intensity-follow'
            }`}
            role="group"
            aria-label={`${section.label} direction controls`}
        >
            {compact && (
                // In the locked chord-visualizer view this label IS the section
                // identifier — replaces the prior `(A)` row-marker slot. The
                // unlocked SectionCard view already shows the label as an
                // editable input, so we skip rendering it twice.
                <span class="section-strip__label" aria-hidden="true">
                    {section.label}
                </span>
            )}
            <div class="section-strip__intensity">
                {compact ? (
                    // Compact (locked chart) — sheet-music dynamic mark: tap
                    // to cycle through pp/p/mp/mf/f/ff, long-press / right-click
                    // to clear back to "follow global."
                    (() => {
                        const stepIdx = findCurrentStep(section.targetIntensity);
                        const step = DYNAMIC_STEPS[stepIdx];
                        const nextStep = DYNAMIC_STEPS[(stepIdx + 1) % DYNAMIC_STEPS.length];
                        return (
                            <button
                                type="button"
                                class={`section-strip__dynamic${stepIdx === 0 ? ' section-strip__dynamic--follow' : ''}`}
                                aria-label={`${section.label} dynamic: ${step.title}. Click to set ${nextStep.title}.`}
                                title={`${step.title} — click to cycle`}
                                onClick={() => setSectionIntensity(section.id, nextStep.value)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setSectionIntensity(section.id, undefined);
                                }}
                            >
                                {step.label}
                            </button>
                        );
                    })()
                ) : (
                    <label class="section-strip__intensity-label">
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={intensityValue}
                            aria-label={`${section.label} intensity${
                                hasIntensityOverride ? '' : ' (following global)'
                            }`}
                            title={
                                hasIntensityOverride
                                    ? `${Math.round(intensityValue * 100)}% — double-click to follow global`
                                    : `Following global (${Math.round(globalIntensity * 100)}%) — drag to override`
                            }
                            onInput={(e) => {
                                const v = parseFloat((e.target as HTMLInputElement).value);
                                if (Number.isFinite(v)) {
                                    setSectionIntensity(section.id, v);
                                }
                            }}
                            onDblClick={() => setSectionIntensity(section.id, undefined)}
                        />
                        <span class="section-strip__intensity-text" aria-hidden="true">
                            {hasIntensityOverride ? `${Math.round(intensityValue * 100)}%` : '—'}
                        </span>
                    </label>
                )}
            </div>
            <div class="section-strip__lanes" role="group" aria-label="Instrument overrides">
                {LANES.map((lane) => {
                    const override = section.instruments?.[lane.key];
                    const isFollow = override === undefined;
                    const effective = isFollow ? globalEnabled[lane.key] : override;
                    const stateClass = isFollow
                        ? 'section-strip__lane--follow'
                        : override
                          ? 'section-strip__lane--on'
                          : 'section-strip__lane--off';
                    const dimClass = effective ? '' : ' section-strip__lane--muted';
                    return (
                        <button
                            type="button"
                            key={lane.key}
                            class={`section-strip__lane section-strip__lane--${lane.key} ${stateClass}${dimClass}`}
                            title={
                                isFollow
                                    ? `${lane.title}: follow global (${effective ? 'on' : 'off'})`
                                    : `${lane.title}: forced ${override ? 'ON' : 'OFF'} — click to cycle`
                            }
                            aria-label={`${lane.title} ${
                                isFollow
                                    ? `follow global, currently ${effective ? 'on' : 'off'}`
                                    : override
                                      ? 'forced on'
                                      : 'forced off'
                            }`}
                            aria-pressed={!isFollow}
                            onClick={() =>
                                setSectionInstrumentEnabled(
                                    section.id,
                                    lane.key,
                                    nextOverride(override),
                                )
                            }
                        >
                            <Icon name={lane.icon} />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
