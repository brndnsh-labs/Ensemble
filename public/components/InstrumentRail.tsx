import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { COMPACT_MQ } from '../breakpoints.js';
import { togglePower } from '../controllers/instrument-controller.js';
import { GENRE_NAMES, SMART_GENRES } from '../data/smart-genres.js';
import { dispatch } from '../state.js';
import { track } from '../telemetry.js';
import { ACTIONS, type InstrumentModule } from '../types.js';
import { useEnsembleState, useMediaQuery } from '../ui-bridge.js';
import type { StyleObject } from '../ui-types.js';
import { Icon, type IconName } from './Icon.jsx';
import { InstrumentMixerStrip, InstrumentSpecificSettings } from './InstrumentSettings.jsx';
import { SoloistControls } from './SoloistControls.jsx';
import { Select, SettingGroup, SettingRow, Slider, Toggle } from './UIControls.jsx';
import { useModalA11y } from './use-modal-a11y.js';

interface StudioInstrumentConfig {
    id: string;
    module: InstrumentModule;
    label: string;
    icon: IconName;
    summary: string;
    accent: string;
}

const STUDIO_INSTRUMENTS: StudioInstrumentConfig[] = [
    {
        id: 'panel-grooves',
        module: 'groove',
        label: 'Drums',
        icon: 'drums',
        summary: 'Pocket and dynamics',
        accent: 'groove',
    },
    {
        id: 'panel-bass',
        module: 'bass',
        label: 'Bass',
        icon: 'bass',
        summary: 'Roots and motion',
        accent: 'bass',
    },
    {
        id: 'panel-chords',
        module: 'chords',
        label: 'Chords',
        icon: 'chords',
        summary: 'Comping and voicing',
        accent: 'chords',
    },
    {
        id: 'panel-harmonies',
        module: 'harmony',
        label: 'Harmony',
        icon: 'harmony',
        summary: 'Pads and color',
        accent: 'harmony',
    },
    {
        id: 'panel-soloist',
        module: 'soloist',
        label: 'Soloist',
        icon: 'soloist',
        summary: 'Lead phrasing',
        accent: 'soloist',
    },
];

type ActiveSurface = { kind: null | 'genre' | 'settings'; module: string | null };

function getClosedSurface(): ActiveSurface {
    return {
        kind: null,
        module: null,
    };
}

function setGenre(genreName: string) {
    const config = SMART_GENRES[genreName];
    const payload = {
        genreName,
        ...config,
    };
    dispatch(ACTIONS.SET_GENRE_FEEL, payload);
    // #1128 — no explicit syncWorker here: main.ts's subscribe block forwards
    // every dispatch to the worker (syncWorker(action, payload)), so a manual
    // call sent the SET_GENRE_FEEL delta twice.
    // #856 — the soloist phrasing mode is now derived from the lead voice + genre
    // by `resolveAutoVoices` (the SET_GENRE_FEEL effect), which respects the user's
    // Auto/pin flag. The old #567 explicit `SET_SOLOIST_MODE` dispatch here is gone:
    // it force-set the mode and would have overridden a user's pin. The derived
    // mode dispatches from the effect, which the global subscriber syncs to the
    // worker — so Neo-Soul → guitar still holds, via the genre fallback.
}

function formatBandIntensity(bandIntensity: number) {
    return `${Math.round(bandIntensity * 100)}%`;
}

// Meters whose own notation already carries the shuffle feel — see #1065. Both are
// stepsPerBeat:2, same as 7/8, but calculateStepDuration (groove-engine.ts) only
// swings 7/8; keep this list and that engine gate in sync.
const SWING_DISABLED_METERS = new Set(['6/8', '12/8']);

/**
 * #1070 — `harmony.complexity` is a two-state field in practice. Its only
 * consumers are the two `effectiveComplexity < 0.4` branches in
 * `buildHarmonyNotes` (`harmonies.ts`): below the threshold the pad collapses to
 * guide tones, at or above it the full voicing is kept, and every value inside
 * either band behaves identically. Presenting it as a percentage slider meant the
 * upper 60% of the track was inert (45% and 100% were the same sound), so the
 * control is now the choice it really is. The field itself stays a 0–1 number —
 * it is persisted, share-URL encoded and worker-synced under that shape — so the
 * two states map onto values well clear of the threshold, and any pre-existing
 * value reads back as whichever branch it was already taking.
 *
 * Note the conductor still layers `playback.conductorHarmonyComplexity` over this
 * at read time while Auto intensity ramps (#1064); the user's choice here is the
 * baseline it falls back to, exactly as `chords.density` works.
 */
const HARMONY_GUIDE_TONE_MAX = 0.4;
const HARMONY_COLOR_GUIDE = 0.2;
const HARMONY_COLOR_FULL = 0.8;

function harmonyColorOf(complexity: number | undefined) {
    return (complexity ?? 0.5) < HARMONY_GUIDE_TONE_MAX ? 'guide' : 'full';
}

function getBandFeelValue(activeGenre: string, autoIntensity: boolean, bandIntensity: number) {
    return `${activeGenre} · ${autoIntensity ? 'Auto' : formatBandIntensity(bandIntensity)}`;
}

function getStudioState(enabled: boolean, tradeMode: string | undefined, module: string) {
    const isQueued = module === 'soloist' && !enabled && tradeMode !== 'manual';
    return {
        isQueued,
        stateLabel: isQueued ? 'Queued' : enabled ? 'On' : 'Off',
        stateClass: isQueued
            ? 'workspace-instrument-state--queued'
            : enabled
              ? 'workspace-instrument-state--on'
              : 'workspace-instrument-state--off',
    };
}

interface StudioSurfaceProps {
    accent: string;
    anchorElement?: HTMLElement | null;
    className?: string;
    closeLabel: string;
    isCompactViewport: boolean;
    isOpen: boolean;
    meta?: ComponentChildren;
    onClose: () => void;
    subtitle?: string;
    title: string;
    children: ComponentChildren;
}

export function StudioSurface({
    accent,
    anchorElement = null,
    className = '',
    closeLabel,
    isCompactViewport,
    isOpen,
    meta,
    onClose,
    subtitle,
    title,
    children,
}: StudioSurfaceProps) {
    const surfaceRef = useRef<HTMLDivElement | null>(null);
    const [surfaceStyle, setSurfaceStyle] = useState<StyleObject | undefined>(undefined);

    // Non-modal: the StudioSurface sheets nest (mobile Mix sheet → an
    // instrument-settings sheet), so they must NOT each claim aria-modal or trap
    // focus; the shared overlay stack (Escape closes only the topmost) handles
    // the nesting. #1129.
    useModalA11y(surfaceRef, isOpen, onClose, title, { modal: false });

    useLayoutEffect(() => {
        if (!isOpen || isCompactViewport || typeof window === 'undefined') {
            setSurfaceStyle(undefined);
            return undefined;
        }

        const updatePosition = () => {
            const surface = surfaceRef.current;
            if (!surface) {
                return;
            }

            const anchorRect =
                anchorElement?.getBoundingClientRect() || document.body.getBoundingClientRect();
            const viewportPadding = 16;
            const isGenreSurface = className.includes('--genre');
            const isBandFeelSurface = className.includes('--band-feel');
            const isMixerSurface = className.includes('--mixer-panel');
            const isSettingsSurface = className.includes('--settings') && !isMixerSurface;
            const preferredWidth = isBandFeelSurface
                ? 420
                : isGenreSurface
                  ? 360
                  : isMixerSurface
                    ? 540
                    : isSettingsSurface
                      ? 500
                      : 560;
            const maxWidth = window.innerWidth - viewportPadding * 2;
            const width = Math.min(preferredWidth, maxWidth);
            const measuredHeight = surface.offsetHeight || 0;
            const preferredTop = Math.max(viewportPadding, anchorRect.top - 8);
            let top = preferredTop;

            if (measuredHeight > 0) {
                top = Math.min(
                    preferredTop,
                    Math.max(
                        viewportPadding,
                        window.innerHeight - measuredHeight - viewportPadding,
                    ),
                );
            }

            const maxHeight = Math.max(240, window.innerHeight - top - viewportPadding);
            const left = Math.min(
                Math.max(viewportPadding, anchorRect.right - width),
                window.innerWidth - width - viewportPadding,
            );

            setSurfaceStyle({
                position: 'fixed',
                top: `${top}px`,
                left: `${left}px`,
                width: `${width}px`,
                maxHeight: `${maxHeight}px`,
            });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [anchorElement, className, isCompactViewport, isOpen]);

    if (!isOpen) {
        return null;
    }

    const modeClass = isCompactViewport
        ? 'workspace-studio-surface--modal'
        : 'workspace-studio-surface--anchored';

    const surfaceLayer = (
        <div class="workspace-studio-surface-layer">
            <button
                type="button"
                class="workspace-studio-surface-backdrop"
                aria-label={closeLabel}
                onClick={onClose}
            />
            <div
                ref={surfaceRef}
                // role="dialog" self-declared: #1129 made useModalA11y non-modal
                // here (for the nested Mix→settings sheet fix), so the surface owns
                // its own role — keeps dialog semantics + announces the aria-label.
                role="dialog"
                class={`workspace-studio-surface ${modeClass} workspace-studio-surface--${accent} ${className} is-open`}
                style={surfaceStyle}
            >
                <div class="workspace-studio-surface-header">
                    <div class="workspace-studio-surface-header-copy">
                        <div class="workspace-studio-surface-title-row">
                            <h3>{title}</h3>
                            {meta && <div class="workspace-studio-surface-meta">{meta}</div>}
                        </div>
                        {subtitle && <p class="workspace-studio-surface-summary">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        class="workspace-studio-surface-close"
                        aria-label={closeLabel}
                        onClick={onClose}
                    >
                        ×
                    </button>
                </div>
                <div class="workspace-studio-surface-body">{children}</div>
            </div>
        </div>
    );

    if (typeof document !== 'undefined' && document.body) {
        return createPortal(surfaceLayer, document.body);
    }

    return surfaceLayer;
}

interface StudioBandFeelChooserProps {
    activeGenre: string;
    autoIntensity: boolean;
    anchorElement?: HTMLElement | null;
    bandIntensity: number;
    isCompactViewport: boolean;
    isOpen: boolean;
    onClose: () => void;
    onToggle: () => void;
}

function StudioBandFeelChooser({
    activeGenre,
    autoIntensity,
    anchorElement = null,
    bandIntensity,
    isCompactViewport,
    isOpen,
    onClose,
    onToggle,
}: StudioBandFeelChooserProps) {
    // #1070 — the band's own settings, grouped by musical function: Genre (the
    // language), Feel (band-wide time), Energy (band-wide dynamics), Color
    // (band-wide harmony). Swing/Humanize used to live inside the Drums gear even
    // though swing is the grid geometry every lane is scheduled against and
    // humanize is read by the scheduler for all lanes and by the MIDI export.
    const { swing, swingSub, humanize, timeSignature, harmonyComplexity } = useEnsembleState(
        (s) => ({
            swing: s.groove.swing,
            swingSub: s.groove.swingSub,
            humanize: s.groove.humanize,
            timeSignature: s.arranger.timeSignature,
            harmonyComplexity: s.harmony.complexity,
        }),
    );
    const swingDisabled = SWING_DISABLED_METERS.has(timeSignature);
    const harmonyColor = harmonyColorOf(harmonyComplexity);

    return (
        <div class="workspace-studio-surface-root workspace-studio-genre-chooser">
            <button
                type="button"
                class={`workspace-studio-genre-button ${isOpen ? 'is-open' : ''}`}
                aria-label="Band settings"
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                onClick={onToggle}
            >
                <span class="workspace-studio-genre-button-label">Band</span>
                <span class="workspace-studio-genre-button-right">
                    <span class="workspace-studio-genre-button-value">
                        {getBandFeelValue(activeGenre, autoIntensity, bandIntensity)}
                    </span>
                    <span class="workspace-studio-genre-button-caret" aria-hidden="true">
                        ▾
                    </span>
                </span>
            </button>
            <StudioSurface
                accent="chords"
                anchorElement={anchorElement}
                className="workspace-studio-surface--genre workspace-studio-surface--band-feel"
                closeLabel="Close band settings"
                isCompactViewport={isCompactViewport}
                isOpen={isOpen}
                onClose={onClose}
                subtitle="The groove language, time feel, energy and harmonic color the whole band shares."
                title="Band settings"
            >
                <SettingGroup title="Genre">
                    {/* Single-select toggle group (each option is an aria-pressed
                        button) — role="group", not role="list" (whose required
                        owned element is listitem, which these buttons aren't). #812 */}
                    <div class="workspace-studio-genre-grid" role="group" aria-label="Genre">
                        {GENRE_NAMES.map((genreName) => {
                            const isActive = activeGenre === genreName;
                            return (
                                <button
                                    key={genreName}
                                    type="button"
                                    class={`workspace-studio-genre-option ${isActive ? 'active' : ''}`}
                                    aria-pressed={isActive}
                                    onClick={() => {
                                        setGenre(genreName);
                                        if (!isActive) {
                                            track('genre_changed', { genre: genreName });
                                        }
                                        onClose();
                                    }}
                                >
                                    <span>{genreName}</span>
                                    {isActive && (
                                        <span
                                            class="workspace-studio-genre-option-mark"
                                            aria-hidden="true"
                                        >
                                            <Icon name="check" />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </SettingGroup>
                <SettingGroup title="Feel">
                    <SettingRow
                        label="Swing"
                        id="swingSlider"
                        description={
                            swingDisabled
                                ? `${timeSignature} already notates the shuffle feel, so Swing is disabled here.`
                                : 'Delays the off-beats for a triplet shuffle — every lane, not just drums.'
                        }
                        valueDisplay={`${swing || 0}%`}
                    >
                        <div class="flex-row instrument-settings-swing-controls">
                            <Slider
                                id="swingSlider"
                                min="0"
                                max="100"
                                value={swing || 0}
                                disabled={swingDisabled}
                                onInput={(val) => {
                                    dispatch(ACTIONS.SET_SWING, parseInt(val, 10));
                                }}
                                ariaValueText={`${swing || 0}%`}
                            />
                            <Select
                                id="swingBaseSelect"
                                value={swingSub || '8th'}
                                disabled={swingDisabled}
                                onChange={(val) => {
                                    dispatch(ACTIONS.SET_SWING_SUB, val);
                                }}
                                options={[
                                    { value: '16th', label: '1/16' },
                                    { value: '8th', label: '1/8' },
                                ]}
                            />
                        </div>
                    </SettingRow>
                    <SettingRow
                        label="Humanize"
                        id="humanizeSlider"
                        description="Subtle timing and velocity variation across the whole band."
                        valueDisplay={`${humanize || 0}%`}
                    >
                        <Slider
                            id="humanizeSlider"
                            min="0"
                            max="100"
                            value={humanize || 0}
                            onInput={(val) => {
                                dispatch(ACTIONS.SET_HUMANIZE, parseInt(val, 10));
                            }}
                            ariaValueText={`${humanize || 0}%`}
                        />
                    </SettingRow>
                </SettingGroup>
                <SettingGroup title="Energy">
                    <SettingRow
                        label="Auto intensity"
                        id="bandFeelAutoIntensityToggle"
                        description="Let the conductor shape energy over time."
                    >
                        <Toggle
                            id="bandFeelAutoIntensityToggle"
                            checked={autoIntensity}
                            onChange={(value) => {
                                dispatch(ACTIONS.SET_AUTO_INTENSITY, value);
                            }}
                        />
                    </SettingRow>
                    <SettingRow
                        label="Intensity"
                        id="bandFeelIntensitySlider"
                        description={
                            autoIntensity
                                ? 'Turn off auto to set the band energy manually.'
                                : 'Sets the shared energy for the whole band.'
                        }
                        valueDisplay={formatBandIntensity(bandIntensity)}
                    >
                        <Slider
                            id="bandFeelIntensitySlider"
                            min="0"
                            max="100"
                            step="5"
                            value={Math.round(bandIntensity * 100)}
                            disabled={autoIntensity}
                            onInput={(value) => {
                                dispatch(ACTIONS.SET_BAND_INTENSITY, parseInt(value, 10) / 100);
                            }}
                            ariaValueText={formatBandIntensity(bandIntensity)}
                        />
                    </SettingRow>
                </SettingGroup>
                <SettingGroup title="Color">
                    <SettingRow
                        label="Harmonic color"
                        id="harmonyColorSelect"
                        description="Guide tones keep the Harmony lane to thirds and sevenths; Full lets it play the whole voicing."
                    >
                        <Select
                            id="harmonyColorSelect"
                            value={harmonyColor}
                            onChange={(val) => {
                                dispatch(ACTIONS.SET_PARAM, {
                                    module: 'harmony',
                                    param: 'complexity',
                                    value:
                                        val === 'guide' ? HARMONY_COLOR_GUIDE : HARMONY_COLOR_FULL,
                                });
                            }}
                            options={[
                                { value: 'guide', label: 'Guide tones' },
                                { value: 'full', label: 'Full voicings' },
                            ]}
                        />
                    </SettingRow>
                </SettingGroup>
            </StudioSurface>
        </div>
    );
}

interface StudioMixRowProps {
    instrument: StudioInstrumentConfig;
    isOpen: boolean;
    onToggleSettings: () => void;
    rowRef?: (node: HTMLDivElement | null) => void;
    showSettings: boolean;
    triggerRef?: (node: HTMLButtonElement | null) => void;
}

function StudioMixRow({
    instrument,
    isOpen,
    onToggleSettings,
    rowRef,
    showSettings,
    triggerRef,
}: StudioMixRowProps) {
    const { enabled, sectionOverride } = useEnsembleState((s) => {
        const mod = instrument.module;
        const baseEnabled = (s as any)[mod].enabled as boolean;
        // #981 — read the coarse, change-only currentSectionId (written by the
        // scheduler only on section transitions) instead of the raw per-16th
        // playback.step, so this row doesn't re-render every step.
        const sec = s.arranger.sections?.find((s2) => s2.id === s.playback.currentSectionId);
        const override = sec?.instruments?.[mod as keyof NonNullable<typeof sec.instruments>];
        return { enabled: baseEnabled, sectionOverride: override };
    });
    const overrideActive = typeof sectionOverride === 'boolean' && sectionOverride !== enabled;
    const powerClass = `power-btn ${enabled ? 'active' : ''} ${
        overrideActive ? 'section-override' : ''
    }`;

    return (
        <div
            class={`workspace-studio-mix-row workspace-studio-mix-row--${instrument.accent} ${enabled ? 'is-active' : ''} ${isOpen ? 'is-menu-open' : ''}`}
            id={instrument.id}
            data-id={instrument.module}
            ref={rowRef}
        >
            <div class="workspace-studio-mix-row-main">
                <span class="workspace-studio-mix-row-icon" aria-hidden="true">
                    <Icon name={instrument.icon} />
                </span>
                <div class="workspace-studio-mix-row-copy">
                    <h3>{instrument.label}</h3>
                    {overrideActive && (
                        <span
                            class="workspace-studio-section-override"
                            title={`This section overrides ${instrument.label.toLowerCase()} to ${
                                sectionOverride ? 'on' : 'off'
                            }`}
                        >
                            section: {sectionOverride ? 'on' : 'off'}
                        </span>
                    )}
                </div>
            </div>
            <div class="workspace-studio-mix-row-actions">
                {showSettings && (
                    <button
                        type="button"
                        ref={triggerRef}
                        class={`workspace-studio-mix-menu-trigger ${isOpen ? 'is-open' : ''}`}
                        aria-label={`${instrument.label} settings`}
                        aria-haspopup="dialog"
                        aria-expanded={isOpen}
                        onClick={onToggleSettings}
                    >
                        <Icon name="gear" />
                    </button>
                )}
                <button
                    type="button"
                    class={powerClass}
                    aria-label={`Toggle ${instrument.label}`}
                    aria-pressed={enabled}
                    onClick={() => togglePower(instrument.module)}
                >
                    <Icon name="power" />
                </button>
            </div>
        </div>
    );
}

interface StudioMixerAccordionProps {
    activeCount: number;
}

function StudioMixerAccordion({ activeCount }: StudioMixerAccordionProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div class={`workspace-studio-mixer-accordion ${isOpen ? 'is-open' : ''}`}>
            <button
                type="button"
                class="workspace-studio-mixer-accordion-trigger"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((o) => !o)}
            >
                <span>Mixer</span>
                <span class="workspace-studio-active-count" aria-hidden="true">
                    {activeCount}/{STUDIO_INSTRUMENTS.length} on
                </span>
                <span class="workspace-studio-mixer-accordion-caret" aria-hidden="true">
                    <Icon name="caret" />
                </span>
            </button>
            {isOpen && (
                <div class="workspace-studio-mixer-accordion-body">
                    <div class="workspace-studio-mixer-grid">
                        {STUDIO_INSTRUMENTS.map((instrument) => (
                            <InstrumentMixerStrip
                                key={instrument.module}
                                accent={instrument.accent}
                                iconName={instrument.icon}
                                label={instrument.label}
                                module={instrument.module}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

interface StudioSettingsSurfaceProps {
    anchorElement?: HTMLElement | null;
    instrument: StudioInstrumentConfig | undefined;
    isCompactViewport: boolean;
    isOpen: boolean;
    onClose: () => void;
}

function StudioSettingsSurface({
    anchorElement = null,
    instrument,
    isCompactViewport,
    isOpen,
    onClose,
}: StudioSettingsSurfaceProps) {
    const instrumentState = useEnsembleState((s) => {
        if (!instrument) {
            return {
                enabled: false,
                tradeMode: 'manual',
            };
        }

        const modState = (s as any)[instrument.module];
        return {
            enabled: modState.enabled,
            tradeMode: modState.tradeMode,
        };
    });

    if (!instrument) {
        return null;
    }

    const { stateLabel, stateClass } = getStudioState(
        instrumentState.enabled,
        instrumentState.tradeMode,
        instrument.module,
    );

    return (
        <StudioSurface
            accent={instrument.accent}
            anchorElement={anchorElement}
            className="workspace-studio-surface--settings"
            closeLabel={`Close ${instrument.label} settings`}
            isCompactViewport={isCompactViewport}
            isOpen={isOpen}
            meta={<span class={`workspace-instrument-state ${stateClass}`}>{stateLabel}</span>}
            onClose={onClose}
            subtitle={instrument.summary}
            title={`${instrument.label} settings`}
        >
            <InstrumentSpecificSettings module={instrument.module} />
            {instrument.module === 'soloist' && (
                <div class="workspace-studio-surface-card workspace-studio-surface-card--soloist">
                    <SoloistControls />
                </div>
            )}
        </StudioSurface>
    );
}

export function InstrumentRail() {
    const { groove, bass, chords, harmony, soloist, activeGenre, autoIntensity, bandIntensity } =
        useEnsembleState((s) => ({
            groove: s.groove.enabled,
            bass: s.bass.enabled,
            chords: s.chords.enabled,
            harmony: s.harmony.enabled,
            soloist: s.soloist.enabled,
            activeGenre: s.groove.lastSmartGenre || s.groove.genreFeel,
            autoIntensity: s.playback.autoIntensity,
            bandIntensity: s.playback.bandIntensity,
        }));
    const [activeSurface, setActiveSurface] = useState<ActiveSurface>(getClosedSurface);
    // Below COMPACT_MQ the rail lives inside the Mix bottom sheet (no desktop
    // edge to anchor to), so its nested genre/settings surfaces render
    // full-bleed instead of anchored popovers.
    const isCompactViewport = useMediaQuery(COMPACT_MQ);
    const rowElementsRef = useRef<Record<string, HTMLDivElement | null>>({});
    const settingsTriggerRef = useRef<Record<string, HTMLButtonElement | null>>({});
    const genreTriggerRef = useRef<HTMLDivElement | null>(null);

    const activeCount = [groove, bass, chords, harmony, soloist].filter(Boolean).length;
    const activeInstrument =
        activeSurface.kind === 'settings'
            ? STUDIO_INSTRUMENTS.find((instrument) => instrument.module === activeSurface.module)
            : undefined;

    const closeSurface = () => {
        const focusTarget =
            activeSurface.kind === 'genre'
                ? genreTriggerRef.current
                : activeSurface.module
                  ? settingsTriggerRef.current[activeSurface.module]
                  : null;

        setActiveSurface(getClosedSurface());

        if (focusTarget instanceof HTMLElement) {
            requestAnimationFrame(() => focusTarget.focus());
        }
    };

    const toggleGenreSurface = () => {
        setActiveSurface((current) =>
            current.kind === 'genre' ? getClosedSurface() : { kind: 'genre', module: null },
        );
    };

    const toggleSettingsSurface = (module: string) => {
        setActiveSurface((current) =>
            current.kind === 'settings' && current.module === module
                ? getClosedSurface()
                : { kind: 'settings', module },
        );
    };

    return (
        <div class="panel dashboard-panel workspace-panel workspace-studio-live-mix instrument-rail">
            <div class="workspace-studio-live-mix-header">
                <p class="workspace-kicker">Studio</p>
                <h2 id="studioWorkspaceTitle">Live mix</h2>
            </div>
            <div class="workspace-studio-panel-genre" ref={genreTriggerRef}>
                <StudioBandFeelChooser
                    activeGenre={activeGenre}
                    autoIntensity={autoIntensity}
                    anchorElement={genreTriggerRef.current}
                    bandIntensity={bandIntensity}
                    isCompactViewport={isCompactViewport}
                    isOpen={activeSurface.kind === 'genre'}
                    onClose={closeSurface}
                    onToggle={toggleGenreSurface}
                />
            </div>
            <div class="workspace-studio-live-mix-rows">
                {STUDIO_INSTRUMENTS.map((instrument) => (
                    <StudioMixRow
                        key={instrument.module}
                        instrument={instrument}
                        isOpen={
                            activeSurface.kind === 'settings' &&
                            activeSurface.module === instrument.module
                        }
                        onToggleSettings={() => toggleSettingsSurface(instrument.module)}
                        rowRef={(node) => {
                            if (node) {
                                rowElementsRef.current[instrument.module] = node;
                                return;
                            }

                            delete rowElementsRef.current[instrument.module];
                        }}
                        showSettings={true}
                        triggerRef={(node) => {
                            if (node) {
                                settingsTriggerRef.current[instrument.module] = node;
                                return;
                            }

                            delete settingsTriggerRef.current[instrument.module];
                        }}
                    />
                ))}
            </div>
            <StudioMixerAccordion activeCount={activeCount} />
            <StudioSettingsSurface
                anchorElement={
                    activeSurface.module ? rowElementsRef.current[activeSurface.module] : null
                }
                instrument={activeInstrument}
                isCompactViewport={isCompactViewport}
                isOpen={activeSurface.kind === 'settings'}
                onClose={closeSurface}
            />
        </div>
    );
}
