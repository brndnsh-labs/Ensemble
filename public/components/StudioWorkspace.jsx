import { GENRE_NAMES, SMART_GENRES } from '../data/smart-genres.js';
import { togglePower } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { syncWorker } from '../worker-client.js';
import { useClickOutside } from './hooks.js';
import { InstrumentSettings } from './InstrumentSettings.jsx';
import { SoloistControls } from './SoloistControls.jsx';

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

function StudioGenreChooser() {
    const activeGenre = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) =>
            s.groove.lastSmartGenre || s.groove.genreFeel,
    );
    const [isMenuOpen, setIsMenuOpen, menuRef] = useClickOutside();

    return (
        <div
            class={`workspace-studio-surface-root workspace-studio-genre-chooser ${isMenuOpen ? 'is-open' : ''}`}
            ref={menuRef}
        >
            {isMenuOpen && (
                <button
                    type="button"
                    class="workspace-studio-surface-backdrop"
                    aria-label="Close band feel menu"
                    onClick={() => setIsMenuOpen(false)}
                />
            )}
            <button
                type="button"
                class="workspace-studio-genre-button"
                aria-label="Choose band feel"
                aria-haspopup="dialog"
                aria-expanded={isMenuOpen}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
                <span class="workspace-studio-genre-button-label">Band feel</span>
                <span class="workspace-studio-genre-button-value">{activeGenre}</span>
                <span class="workspace-studio-genre-button-caret" aria-hidden="true">
                    ▾
                </span>
            </button>
            <div
                class={`workspace-studio-surface workspace-studio-surface--genre ${isMenuOpen ? 'is-open' : ''}`}
                aria-hidden={!isMenuOpen}
            >
                <div class="workspace-studio-surface-header">
                    <div>
                        <p class="workspace-kicker">Band feel</p>
                        <h3>Choose groove language</h3>
                    </div>
                    <button
                        type="button"
                        class="workspace-studio-surface-close"
                        aria-label="Close band feel menu"
                        onClick={() => setIsMenuOpen(false)}
                    >
                        ×
                    </button>
                </div>
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
                                    setIsMenuOpen(false);
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
            </div>
        </div>
    );
}

/**
 * @param {{ instrument: typeof STUDIO_INSTRUMENTS[number] }} props
 */
function StudioMixRow({ instrument }) {
    const { enabled, tradeMode } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => {
            const modState = /** @type {any} */ (s)[instrument.module];
            return {
                enabled: modState.enabled,
                tradeMode: modState.tradeMode,
            };
        },
    );
    const [isMenuOpen, setIsMenuOpen, menuRef] = useClickOutside();
    const { stateLabel, stateClass } = getStudioState(enabled, tradeMode, instrument.module);
    const powerClass = `power-btn ${enabled ? 'active' : ''}`;

    return (
        <div
            class={`workspace-studio-mix-row workspace-studio-mix-row--${instrument.accent} ${enabled ? 'is-active' : ''} ${isMenuOpen ? 'is-menu-open' : ''}`}
            id={instrument.id}
            data-id={instrument.module}
            ref={menuRef}
        >
            {isMenuOpen && (
                <button
                    type="button"
                    class="workspace-studio-surface-backdrop"
                    aria-label={`Close ${instrument.label} settings`}
                    onClick={() => setIsMenuOpen(false)}
                />
            )}
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
                <button
                    type="button"
                    class="workspace-actions-trigger workspace-studio-mix-menu-trigger"
                    aria-label={`${instrument.label} settings`}
                    aria-haspopup="dialog"
                    aria-expanded={isMenuOpen}
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                    ⋮
                </button>
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
            <div
                class={`workspace-studio-surface workspace-studio-surface--settings ${isMenuOpen ? 'is-open' : ''}`}
                aria-hidden={!isMenuOpen}
            >
                <div class="workspace-studio-surface-header">
                    <div>
                        <p class="workspace-kicker">Live mix</p>
                        <h3>{instrument.label} settings</h3>
                    </div>
                    <button
                        type="button"
                        class="workspace-studio-surface-close"
                        aria-label={`Close ${instrument.label} settings`}
                        onClick={() => setIsMenuOpen(false)}
                    >
                        ×
                    </button>
                </div>
                <InstrumentSettings module={instrument.module} />
                {instrument.module === 'soloist' && (
                    <div class="divider-top">
                        <SoloistControls />
                    </div>
                )}
            </div>
        </div>
    );
}

function StudioLiveMix() {
    const { groove, bass, chords, harmony, soloist } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            groove: s.groove.enabled,
            bass: s.bass.enabled,
            chords: s.chords.enabled,
            harmony: s.harmony.enabled,
            soloist: s.soloist.enabled,
        }),
    );

    const activeCount = [groove, bass, chords, harmony, soloist].filter(Boolean).length;

    return (
        <div class="panel dashboard-panel workspace-panel workspace-studio-live-mix">
            <div class="workspace-studio-live-mix-header">
                <div>
                    <p class="workspace-kicker">Studio</p>
                    <h2 id="studioWorkspaceTitle">Live mix</h2>
                </div>
                <div class="workspace-studio-live-mix-tools">
                    <span class="workspace-studio-active-count">{activeCount}/5 on</span>
                    <StudioGenreChooser />
                </div>
            </div>
            <div class="workspace-studio-live-mix-rows">
                {STUDIO_INSTRUMENTS.map((instrument) => (
                    <StudioMixRow key={instrument.module} instrument={instrument} />
                ))}
            </div>
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
