import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { setSectionInstrumentEnabled, setSectionIntensity } from '../../arranger-controller.js';
import {
    clearPracticeLoop,
    getSectionStepBounds,
    loopSection,
    setPracticeRamp,
    startSectionFromHere,
} from '../../practice-controller.js';
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
        // #1016 — section-practice loop bounds, so the header can show which
        // section is being drilled and offer to clear it mid-play.
        loopStartStep: s?.playback?.loopStartStep ?? -1,
        loopEndStep: s?.playback?.loopEndStep ?? -1,
        // #1021 — practice tempo-ramp config, surfaced in the loop popover. `bpm`
        // is the prospective goal (shown until play-start captures it as
        // `rampBpmTarget`); the drill climbs from `rampStartPct` of the goal up to it.
        bpm: s?.playback?.bpm ?? 120,
        rampBpm: !!s?.playback?.rampBpm,
        rampBpmPerLoop: s?.playback?.rampBpmPerLoop ?? 4,
        rampStartPct: s?.playback?.rampStartPct ?? 0.66,
        rampBpmTarget: s?.playback?.rampBpmTarget ?? 0,
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

    // #1016 — section practice. The popover that offers "start from here" /
    // "loop this section" lives on the section label (compact chart view only).
    const [isPracticeOpen, setIsPracticeOpen] = useState(false);
    // Fixed-position coords for the popover menu, computed from the trigger's
    // rect at open time (see `openPracticeMenu`). Fixed positioning lets the menu
    // escape the chart's nested isolate/overflow stacking contexts — and #1043
    // portals the menu to document.body (see below) so a transformed ancestor
    // (`.lead-sheet-section-group`) can't hijack it as its containing block.
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
    const practiceRef = useRef<HTMLDivElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!isPracticeOpen) {
            return;
        }
        const close = () => setIsPracticeOpen(false);
        const onDocClick = (e: MouseEvent) => {
            if (
                e.target instanceof Node &&
                !practiceRef.current?.contains(e.target) &&
                !menuRef.current?.contains(e.target)
            ) {
                close();
            }
        };
        document.addEventListener('mousedown', onDocClick);
        // The menu is viewport-fixed at its open-time coords, so close it on
        // scroll rather than let it drift away from its section label.
        window.addEventListener('scroll', close, true);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            window.removeEventListener('scroll', close, true);
        };
    }, [isPracticeOpen]);

    // Toggle the popover, anchoring it below the trigger. Clamped so a wide menu
    // near the right edge (mobile) doesn't overflow the viewport.
    const openPracticeMenu = (e: MouseEvent) => {
        if (isPracticeOpen) {
            setIsPracticeOpen(false);
            return;
        }
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const menuWidth = 176; // min-width 11rem
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
        setMenuPos({ top: rect.bottom + 4, left });
        setIsPracticeOpen(true);
    };

    // Is THIS section the one currently being drilled? Compared against the live
    // loop bounds so the badge shows on the right header and clears the right loop.
    const bounds = getSectionStepBounds(section.id);
    const isThisLooping =
        !!bounds && selected.loopStartStep === bounds.start && selected.loopEndStep === bounds.end;

    // #1021 — practice tempo ramp (the woodshed drill): start below tempo and
    // climb back up to your set BPM a step per loop. The goal is your current
    // tempo (captured at play-start as `rampBpmTarget`; until then it's the live
    // `bpm`), so there's no cap to invent — just how slow to start and how fast to
    // climb. Config flows through `setPracticeRamp`; the transport BPM readout
    // shows the live climb.
    const rampGoal = selected.rampBpmTarget || selected.bpm;
    const rampStart = Math.max(40, Math.round(rampGoal * selected.rampStartPct));
    const rampControls = (
        <div class="section-strip__ramp" role="group" aria-label="Practice tempo ramp">
            <label class="section-strip__ramp-toggle">
                <input
                    type="checkbox"
                    checked={selected.rampBpm}
                    onChange={(e) =>
                        setPracticeRamp({ enabled: (e.target as HTMLInputElement).checked })
                    }
                />
                Ramp tempo up ↑
            </label>
            {selected.rampBpm && (
                <div class="section-strip__ramp-fields">
                    <label class="section-strip__ramp-field">
                        <span>Start at</span>
                        <span class="section-strip__ramp-value">
                            <input
                                type="number"
                                min="40"
                                max="95"
                                step="1"
                                value={Math.round(selected.rampStartPct * 100)}
                                aria-label="Start speed, percent of goal tempo"
                                onInput={(e) =>
                                    setPracticeRamp({
                                        startPct:
                                            parseInt((e.target as HTMLInputElement).value, 10) /
                                            100,
                                    })
                                }
                            />
                            %
                        </span>
                    </label>
                    <label class="section-strip__ramp-field">
                        <span>Climb</span>
                        <span class="section-strip__ramp-value">
                            +
                            <input
                                type="number"
                                min="1"
                                max="20"
                                value={selected.rampBpmPerLoop}
                                aria-label="BPM added each loop"
                                onInput={(e) =>
                                    setPracticeRamp({
                                        perLoop: parseInt((e.target as HTMLInputElement).value, 10),
                                    })
                                }
                            />
                            /loop
                        </span>
                    </label>
                    <p class="section-strip__ramp-summary" aria-live="polite">
                        {rampStart} → {rampGoal} BPM
                    </p>
                </div>
            )}
        </div>
    );

    // The popover content adapts to whether this section is actively being
    // drilled: once a loop is armed the popover expands in place to the drill
    // setup (tempo ramp + an explicit stop); before that, the start-from-here /
    // loop entry points (#1016). Arming the loop does NOT close the popover or
    // start playback (#1021) — you configure the drill, then press the main
    // transport START.
    const menuInner = isThisLooping ? (
        <>
            <p class="section-strip__practice-heading">Looping {section.label}</p>
            {rampControls}
            <button
                type="button"
                class="section-strip__practice-item"
                onClick={() => {
                    setIsPracticeOpen(false);
                    clearPracticeLoop();
                }}
            >
                ⏹ Stop looping
            </button>
        </>
    ) : (
        <>
            <button
                type="button"
                class="section-strip__practice-item"
                onClick={() => {
                    setIsPracticeOpen(false);
                    startSectionFromHere(section.id);
                }}
            >
                ▶ Start from here
            </button>
            <button
                type="button"
                class="section-strip__practice-item"
                // Arms the loop and lets the popover expand to the drill setup —
                // no auto-play. Deliberately does NOT close the menu (#1021).
                onClick={() => loopSection(section.id)}
            >
                🔁 Loop this section
            </button>
        </>
    );

    // One portal, shared by both triggers (the section label and the loop badge)
    // — whichever is live anchors the menu; click-away/scroll close it via the
    // effect above. Portaled to document.body to escape the chart's transformed
    // stacking contexts (#1043).
    const practiceMenu =
        isPracticeOpen && menuPos
            ? createPortal(
                  <div
                      ref={menuRef}
                      class="section-strip__practice-menu"
                      // A labeled group, not a role="menu": while looping it hosts
                      // the tempo-ramp form (a checkbox + number inputs), which the
                      // ARIA menu pattern forbids and some AT trap. Plain buttons +
                      // Tab order is the honest structure (the menu keyboard pattern
                      // was never implemented here anyway). #1021.
                      role="group"
                      aria-label={`Practice ${section.label}`}
                      style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }}
                  >
                      {menuInner}
                  </div>,
                  document.body,
              )
            : null;

    // The section label doubles as the practice trigger: tap → start-from-here /
    // loop popover. Shared between the stopped strip and the playing view so a
    // practicing musician can jump to (or loop) a section MID-PLAY — during
    // playback this label is the one live control on the chart (chord cards are
    // inert, gated in ChordVisualizer). #1016.
    const practiceControl = (
        <div class="section-strip__practice" ref={practiceRef}>
            <button
                type="button"
                class={`section-strip__label section-strip__label--practice${
                    isThisLooping ? ' section-strip__label--looping' : ''
                }`}
                aria-haspopup="true"
                aria-expanded={isPracticeOpen}
                title={
                    isThisLooping
                        ? `${section.label} armed to loop — tap to set up the drill or start playback`
                        : `Practice ${section.label}`
                }
                aria-label={
                    isThisLooping
                        ? `${section.label} armed to loop. Tap to configure the tempo drill or stop.`
                        : `Practice ${section.label} — start from here or loop`
                }
                onClick={openPracticeMenu}
            >
                {isThisLooping ? `🔁 ${section.label}` : section.label}
            </button>
            {practiceMenu}
        </div>
    );

    // While the band is playing in the locked sheet-music view, hide the
    // DIRECTION controls (intensity + instrument dots) so the chart reads clean
    // — you direct between takes, not during them. The practice affordance stays,
    // though: tap a section label to start/loop it mid-play (or the badge to drop
    // a live loop). The unlocked SectionCard view keeps the full strip.
    if (compact && isPlaying) {
        return (
            <div
                class={`section-strip section-strip--compact section-strip--playing${
                    isThisLooping ? ' section-strip--looping' : ''
                }`}
            >
                {isThisLooping ? (
                    // The one control that persists on the drilled section. #1021 —
                    // tapping it opens the practice popover (tempo ramp + stop),
                    // since the collapsed label is the only surface left for the
                    // ramp config while looping mid-play.
                    <div class="section-strip__practice" ref={practiceRef}>
                        <button
                            type="button"
                            class="section-strip__loop-badge"
                            aria-haspopup="true"
                            aria-expanded={isPracticeOpen}
                            title={`Looping ${section.label} — tap for tempo ramp or to stop`}
                            aria-label={`Looping ${section.label}. Tap for tempo-ramp options or to stop.`}
                            onClick={openPracticeMenu}
                        >
                            🔁 {section.label}
                        </button>
                        {practiceMenu}
                    </div>
                ) : (
                    practiceControl
                )}
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
            {/* In the locked chord-visualizer view this label IS the section
                identifier — replaces the prior `(A)` row-marker slot, and doubles
                as the practice trigger. The unlocked SectionCard view already
                shows the label as an editable input, so skip it there. #1016. */}
            {compact && practiceControl}
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
