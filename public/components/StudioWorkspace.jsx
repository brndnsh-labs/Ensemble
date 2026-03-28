import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { GENRE_NAMES, SMART_GENRES } from '../data/smart-genres.js';
import { togglePower } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { syncWorker } from '../worker-client.js';
import { InstrumentMixerStrip, InstrumentSpecificSettings } from './InstrumentSettings.jsx';
import { SoloistControls } from './SoloistControls.jsx';
import { SettingGroup, SettingRow, Slider, Toggle } from './UIControls.jsx';

const STUDIO_SURFACE_BREAKPOINT = '(max-width: 700px)';
/** @typedef {'groove' | 'bass' | 'chords' | 'harmony' | 'soloist'} StudioInstrumentModule */
/**
 * @typedef {Object} StudioInstrumentConfig
 * @property {string} id
 * @property {StudioInstrumentModule} module
 * @property {string} label
 * @property {string} icon
 * @property {string} summary
 * @property {string} accent
 */

/** @type {StudioInstrumentConfig[]} */
const STUDIO_INSTRUMENTS = [
    {
        id: 'panel-grooves',
        module: 'groove',
        label: 'Drums',
        icon: '🥁',
        summary: 'Pocket and dynamics',
        accent: 'groove',
    },
    {
        id: 'panel-bass',
        module: 'bass',
        label: 'Bass',
        icon: '🎸',
        summary: 'Roots and motion',
        accent: 'bass',
    },
    {
        id: 'panel-chords',
        module: 'chords',
        label: 'Chords',
        icon: '🎹',
        summary: 'Comping and voicing',
        accent: 'chords',
    },
    {
        id: 'panel-harmonies',
        module: 'harmony',
        label: 'Harmony',
        icon: '🎷',
        summary: 'Pads and color',
        accent: 'harmony',
    },
    {
        id: 'panel-soloist',
        module: 'soloist',
        label: 'Soloist',
        icon: '🎺',
        summary: 'Lead phrasing',
        accent: 'soloist',
    },
];

/**
 * @returns {{ kind: null | 'genre' | 'mixer' | 'settings', module: string | null }}
 */
function getClosedSurface() {
    return {
        kind: null,
        module: null,
    };
}

/**
 * @param {string} genreName
 */
function setGenre(genreName) {
    const config = /** @type {any} */ (SMART_GENRES)[genreName];
    const payload = {
        genreName,
        ...config,
    };
    dispatch(ACTIONS.SET_GENRE_FEEL, payload);
    syncWorker(ACTIONS.SET_GENRE_FEEL, payload);
    saveCurrentState();
}

/**
 * @param {number} bandIntensity
 */
function formatBandIntensity(bandIntensity) {
    return `${Math.round(bandIntensity * 100)}%`;
}

/**
 * @param {string} activeGenre
 * @param {boolean} autoIntensity
 * @param {number} bandIntensity
 */
function getBandFeelValue(activeGenre, autoIntensity, bandIntensity) {
    return `${activeGenre} · ${autoIntensity ? 'Auto' : formatBandIntensity(bandIntensity)}`;
}

/**
 * @param {boolean} enabled
 * @param {string | undefined} tradeMode
 * @param {string} module
 */
function getStudioState(enabled, tradeMode, module) {
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

/** @param {StudioInstrumentModule} module */
function hasStudioInstrumentControls(module) {
    return module !== 'bass';
}

function useIsCompactStudioViewport() {
    const [isCompact, setIsCompact] = useState(() =>
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia(STUDIO_SURFACE_BREAKPOINT).matches
            : false,
    );

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return undefined;
        }

        const mediaQuery = window.matchMedia(STUDIO_SURFACE_BREAKPOINT);
        const update = () => setIsCompact(mediaQuery.matches);

        update();
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', update);
            return () => mediaQuery.removeEventListener('change', update);
        }

        mediaQuery.addListener(update);
        return () => mediaQuery.removeListener(update);
    }, []);

    return isCompact;
}

/**
 * @param {{
 *   accent: string,
 *   anchorElement?: HTMLElement | null,
 *   className?: string,
 *   closeLabel: string,
 *   isCompactViewport: boolean,
 *   isOpen: boolean,
 *   kicker: string,
 *   meta?: import('../ui-types.js').ComponentChildren,
 *   onClose: () => void,
 *   subtitle?: string,
 *   title: string,
 *   children: import('../ui-types.js').ComponentChildren
 * }} props
 */
function StudioSurface({
    accent,
    anchorElement = null,
    className = '',
    closeLabel,
    isCompactViewport,
    isOpen,
    kicker,
    meta,
    onClose,
    subtitle,
    title,
    children,
}) {
    /** @type {import('preact/hooks').MutableRef<HTMLDivElement | null>} */
    const surfaceRef = useRef(null);
    const [surfaceStyle, setSurfaceStyle] = useState(
        /** @type {import('preact').JSX.CSSProperties | undefined} */ (undefined),
    );

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        const handleKeyDown = (/** @type {KeyboardEvent} */ event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

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
            const preferredWidth = isBandFeelSurface ? 420 : isGenreSurface ? 360 : 560;
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
                        <p class="workspace-kicker">{kicker}</p>
                        <h3>{title}</h3>
                        {subtitle && <p class="workspace-studio-surface-summary">{subtitle}</p>}
                        {meta && <div class="workspace-studio-surface-meta">{meta}</div>}
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

/**
 * @param {{
 *   activeGenre: string,
 *   autoIntensity: boolean,
 *   anchorElement?: HTMLElement | null,
 *   bandIntensity: number,
 *   isCompactViewport: boolean,
 *   isOpen: boolean,
 *   onClose: () => void,
 *   onToggle: () => void
 * }} props
 */
function StudioBandFeelChooser({
    activeGenre,
    autoIntensity,
    anchorElement = null,
    bandIntensity,
    isCompactViewport,
    isOpen,
    onClose,
    onToggle,
}) {
    return (
        <div class="workspace-studio-surface-root workspace-studio-genre-chooser">
            <button
                type="button"
                class={`workspace-studio-genre-button ${isOpen ? 'is-open' : ''}`}
                aria-label="Choose band feel"
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                onClick={onToggle}
            >
                <span class="workspace-studio-genre-button-label">Band feel</span>
                <span class="workspace-studio-genre-button-value">
                    {getBandFeelValue(activeGenre, autoIntensity, bandIntensity)}
                </span>
                <span class="workspace-studio-genre-button-caret" aria-hidden="true">
                    ▾
                </span>
            </button>
            <StudioSurface
                accent="chords"
                anchorElement={anchorElement}
                className="workspace-studio-surface--genre workspace-studio-surface--band-feel"
                closeLabel="Close band feel menu"
                isCompactViewport={isCompactViewport}
                isOpen={isOpen}
                kicker="Band feel"
                onClose={onClose}
                subtitle="Choose the groove language and shared energy for the whole band."
                title="Shape band feel"
            >
                <SettingGroup title="Genre">
                    <div class="workspace-studio-genre-grid" role="list">
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
                                            ✓
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

/**
 * @param {{
 *   instrument: typeof STUDIO_INSTRUMENTS[number],
 *   isOpen: boolean,
 *   onToggleSettings: () => void,
 *   rowRef?: (node: HTMLDivElement | null) => void,
 *   showSettings: boolean,
 *   triggerRef?: (node: HTMLButtonElement | null) => void
 * }} props
 */
function StudioMixRow({ instrument, isOpen, onToggleSettings, rowRef, showSettings, triggerRef }) {
    const { enabled, tradeMode } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => {
            const modState = /** @type {any} */ (s)[instrument.module];
            return {
                enabled: modState.enabled,
                tradeMode: modState.tradeMode,
            };
        },
    );
    const { stateLabel, stateClass } = getStudioState(enabled, tradeMode, instrument.module);
    const powerClass = `power-btn ${enabled ? 'active' : ''}`;

    return (
        <div
            class={`workspace-studio-mix-row workspace-studio-mix-row--${instrument.accent} ${enabled ? 'is-active' : ''} ${isOpen ? 'is-menu-open' : ''}`}
            id={instrument.id}
            data-id={instrument.module}
            ref={rowRef}
        >
            <div class="workspace-studio-mix-row-main">
                <span class="workspace-studio-mix-row-icon" aria-hidden="true">
                    {instrument.icon}
                </span>
                <div class="workspace-studio-mix-row-copy">
                    <div class="workspace-studio-mix-row-heading">
                        <h3>{instrument.label}</h3>
                        <span class={`workspace-instrument-state ${stateClass}`}>{stateLabel}</span>
                    </div>
                    <p>{instrument.summary}</p>
                </div>
            </div>
            <div class="workspace-studio-mix-row-actions">
                {showSettings && (
                    <button
                        type="button"
                        ref={triggerRef}
                        class={`workspace-actions-trigger workspace-studio-mix-menu-trigger ${isOpen ? 'is-open' : ''}`}
                        aria-label={`${instrument.label} settings`}
                        aria-haspopup="dialog"
                        aria-expanded={isOpen}
                        onClick={onToggleSettings}
                    >
                        <span class="workspace-studio-mix-menu-label">Controls</span>
                        <span class="workspace-studio-mix-menu-caret" aria-hidden="true">
                            ›
                        </span>
                    </button>
                )}
                <button
                    type="button"
                    class={powerClass}
                    aria-label={`Toggle ${instrument.label}`}
                    aria-pressed={enabled}
                    onClick={() => togglePower(instrument.module)}
                >
                    ⏻
                </button>
            </div>
        </div>
    );
}

/**
 * @param {{
 *   activeCount: number,
 *   anchorElement?: HTMLElement | null,
 *   isCompactViewport: boolean,
 *   isOpen: boolean,
 *   onClose: () => void
 * }} props
 */
function StudioMixerSurface({
    activeCount,
    anchorElement = null,
    isCompactViewport,
    isOpen,
    onClose,
}) {
    return (
        <StudioSurface
            accent="mixer"
            anchorElement={anchorElement}
            className="workspace-studio-surface--settings workspace-studio-surface--mixer-panel"
            closeLabel="Close mixer"
            isCompactViewport={isCompactViewport}
            isOpen={isOpen}
            kicker="Studio mixer"
            meta={<span class="workspace-studio-active-count">{activeCount}/5 on</span>}
            onClose={onClose}
            subtitle="Quick volume and reverb moves for the whole band."
            title="Mixer"
        >
            <div class="workspace-studio-mixer-grid">
                {STUDIO_INSTRUMENTS.map((instrument) => (
                    <InstrumentMixerStrip
                        key={instrument.module}
                        accent={instrument.accent}
                        icon={instrument.icon}
                        label={instrument.label}
                        module={instrument.module}
                    />
                ))}
            </div>
        </StudioSurface>
    );
}

/**
 * @param {{
 *   anchorElement?: HTMLElement | null,
 *   instrument: typeof STUDIO_INSTRUMENTS[number] | undefined,
 *   isCompactViewport: boolean,
 *   isOpen: boolean,
 *   onClose: () => void
 * }} props
 */
function StudioSettingsSurface({
    anchorElement = null,
    instrument,
    isCompactViewport,
    isOpen,
    onClose,
}) {
    const instrumentState = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => {
            if (!instrument) {
                return {
                    enabled: false,
                    tradeMode: 'manual',
                };
            }

            const modState = /** @type {any} */ (s)[instrument.module];
            return {
                enabled: modState.enabled,
                tradeMode: modState.tradeMode,
            };
        },
    );

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
            kicker="Live mix"
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

function StudioLiveMix() {
    const { groove, bass, chords, harmony, soloist, activeGenre, autoIntensity, bandIntensity } =
        useEnsembleState((/** @type {import('../types.js').EnsembleState} */ s) => ({
            groove: s.groove.enabled,
            bass: s.bass.enabled,
            chords: s.chords.enabled,
            harmony: s.harmony.enabled,
            soloist: s.soloist.enabled,
            activeGenre: s.groove.lastSmartGenre || s.groove.genreFeel,
            autoIntensity: s.playback.autoIntensity,
            bandIntensity: s.playback.bandIntensity,
        }));
    const [activeSurface, setActiveSurface] = useState(getClosedSurface);
    const isCompactViewport = useIsCompactStudioViewport();
    /** @type {import('preact/hooks').MutableRef<Record<string, HTMLDivElement | null>>} */
    const rowElementsRef = useRef({});
    /** @type {import('preact/hooks').MutableRef<Record<string, HTMLButtonElement | null>>} */
    const settingsTriggerRef = useRef({});
    /** @type {import('preact/hooks').MutableRef<HTMLDivElement | null>} */
    const genreTriggerRef = useRef(null);
    /** @type {import('preact/hooks').MutableRef<HTMLDivElement | null>} */
    const mixerTriggerRef = useRef(null);

    const activeCount = [groove, bass, chords, harmony, soloist].filter(Boolean).length;
    const activeInstrument =
        activeSurface.kind === 'settings'
            ? STUDIO_INSTRUMENTS.find((instrument) => instrument.module === activeSurface.module)
            : undefined;

    const closeSurface = () => {
        const focusTarget =
            activeSurface.kind === 'genre'
                ? genreTriggerRef.current
                : activeSurface.kind === 'mixer'
                  ? mixerTriggerRef.current
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

    const toggleMixerSurface = () => {
        setActiveSurface((current) =>
            current.kind === 'mixer' ? getClosedSurface() : { kind: 'mixer', module: null },
        );
    };

    /**
     * @param {string} module
     */
    const toggleSettingsSurface = (module) => {
        setActiveSurface((current) =>
            current.kind === 'settings' && current.module === module
                ? getClosedSurface()
                : { kind: 'settings', module },
        );
    };

    return (
        <div class="panel dashboard-panel workspace-panel workspace-studio-live-mix">
            <div class="workspace-studio-live-mix-header">
                <div>
                    <p class="workspace-kicker">Studio</p>
                    <h2 id="studioWorkspaceTitle">Live mix</h2>
                </div>
                <div class="workspace-studio-live-mix-tools">
                    <div ref={mixerTriggerRef}>
                        <button
                            type="button"
                            class={`workspace-actions-trigger workspace-studio-mixer-button ${activeSurface.kind === 'mixer' ? 'is-open' : ''}`}
                            aria-label="Open mixer"
                            aria-haspopup="dialog"
                            aria-expanded={activeSurface.kind === 'mixer'}
                            onClick={toggleMixerSurface}
                        >
                            <span class="workspace-studio-mixer-button-label">Mixer</span>
                            <span class="workspace-studio-mixer-button-caret" aria-hidden="true">
                                ▾
                            </span>
                        </button>
                    </div>
                    <div ref={genreTriggerRef}>
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
                </div>
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
                        showSettings={hasStudioInstrumentControls(instrument.module)}
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
            <StudioMixerSurface
                activeCount={activeCount}
                anchorElement={mixerTriggerRef.current}
                isCompactViewport={isCompactViewport}
                isOpen={activeSurface.kind === 'mixer'}
                onClose={closeSurface}
            />
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

export function StudioWorkspace() {
    return (
        <section
            class="workspace-view workspace-view--studio"
            data-workspace="studio"
            aria-labelledby="studioWorkspaceTitle"
        >
            <StudioLiveMix />
        </section>
    );
}
