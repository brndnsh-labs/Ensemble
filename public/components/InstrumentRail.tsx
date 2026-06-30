import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { GENRE_NAMES, SMART_GENRES } from '../data/smart-genres.js';
import { sectionAtStep } from '../engine/section-overrides.js';
import { togglePower } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS, type InstrumentModule } from '../types.js';
import { useEnsembleState, useMediaQuery } from '../ui-bridge.js';
import type { StyleObject } from '../ui-types.js';
import { syncWorker } from '../worker-client.js';
import { Icon, type IconName } from './Icon.jsx';
import { InstrumentMixerStrip, InstrumentSpecificSettings } from './InstrumentSettings.jsx';
import { SoloistControls } from './SoloistControls.jsx';
import { SettingGroup, SettingRow, Slider, Toggle } from './UIControls.jsx';
import { useModalA11y } from './use-modal-a11y.js';

const STUDIO_SURFACE_BREAKPOINT = '(max-width: 700px)';

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
    const config = (SMART_GENRES as any)[genreName];
    const payload = {
        genreName,
        ...config,
    };
    dispatch(ACTIONS.SET_GENRE_FEEL, payload);
    syncWorker(ACTIONS.SET_GENRE_FEEL, payload);
    // #856 — the soloist phrasing mode is now derived from the lead voice + genre
    // by `resolveAutoVoices` (the SET_GENRE_FEEL effect), which respects the user's
    // Auto/pin flag. The old #567 explicit `SET_SOLOIST_MODE` dispatch here is gone:
    // it force-set the mode and would have overridden a user's pin. The derived
    // mode dispatches from the effect, which the global subscriber syncs to the
    // worker — so Neo-Soul → guitar still holds, via the genre fallback.
    saveCurrentState();
}

function formatBandIntensity(bandIntensity: number) {
    return `${Math.round(bandIntensity * 100)}%`;
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

    useModalA11y(surfaceRef, isOpen, onClose, title);

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
    return (
        <div class="workspace-studio-surface-root workspace-studio-genre-chooser">
            <button
                type="button"
                class={`workspace-studio-genre-button ${isOpen ? 'is-open' : ''}`}
                aria-label="Choose genre"
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                onClick={onToggle}
            >
                <span class="workspace-studio-genre-button-label">Genre</span>
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
                closeLabel="Close genre"
                isCompactViewport={isCompactViewport}
                isOpen={isOpen}
                onClose={onClose}
                subtitle="Choose the groove language and shared energy for the whole band."
                title="Choose genre"
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
                                saveCurrentState();
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
                                saveCurrentState();
                            }}
                            ariaValueText={formatBandIntensity(bandIntensity)}
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
        const sec = sectionAtStep(s.arranger, s.playback.step || 0);
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

interface InstrumentRailProps {
    orientation?: 'vertical' | 'horizontal';
}

export function InstrumentRail({ orientation = 'vertical' }: InstrumentRailProps) {
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
    const isCompactViewport = useMediaQuery(STUDIO_SURFACE_BREAKPOINT);
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
        <div
            class={`panel dashboard-panel workspace-panel workspace-studio-live-mix instrument-rail instrument-rail--${orientation}`}
        >
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
