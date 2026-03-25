import {
    cloneMeasure,
    saveDrumPreset,
    togglePower,
    updateMeasures,
} from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { syncWorker } from '../worker-client.js';
import { useClickOutside } from './hooks.js';
import { InstrumentSettings } from './InstrumentSettings.jsx';
import { PresetLibrary } from './PresetLibrary.jsx';
import { SequencerGrid } from './SequencerGrid.jsx';
import { SettingRow, Slider, Toggle } from './UIControls.jsx';

/**
 * @typedef {Object} GroovePanelProps
 * @property {boolean} isActiveMobile
 * @property {boolean} [showLaunchAction]
 * @property {boolean} [compactStudio]
 */
/**
 * @param {GroovePanelProps} props
 */
export function GroovePanel({ isActiveMobile, showLaunchAction = true, compactStudio = false }) {
    const { activeTab, enabled, measures, fillActive } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            activeTab: s.groove.activeTab,
            enabled: s.groove.enabled,
            measures: s.groove.measures,
            fillActive: s.groove.fillActive,
        }),
    );

    const [isMenuOpen, setIsMenuOpen, menuRef] = useClickOutside();

    /** @param {string} tab */
    const switchTab = (/** @type {any} */ tab) => {
        dispatch(ACTIONS.SET_ACTIVE_TAB, { module: 'groove', tab });
        syncWorker();
        saveCurrentState();
    };

    return (
        <div
            class={`panel dashboard-panel instrument-panel ${isActiveMobile ? 'active-mobile' : ''} ${compactStudio ? 'studio-compact-panel' : ''}`}
            id="panel-grooves"
            data-id="grooves"
        >
            <div class="panel-header groove-panel-header">
                <div class="panel-header-main">
                    <h2 class={`panel-title ${fillActive ? 'panel-title-accent' : ''}`}>Grooves</h2>
                </div>
                {!compactStudio && (
                    <div class="instrument-tabs">
                        <button
                            class={`instrument-tab-btn ${activeTab === 'classic' ? 'active' : ''}`}
                            aria-pressed={activeTab === 'classic'}
                            onClick={() => switchTab('classic')}
                        >
                            Classic
                        </button>
                        <button
                            class={`instrument-tab-btn ${activeTab === 'smart' ? 'active' : ''}`}
                            aria-pressed={activeTab === 'smart'}
                            onClick={() => switchTab('smart')}
                        >
                            Smart
                        </button>
                    </div>
                )}
                <div class="panel-header-actions" ref={menuRef}>
                    {showLaunchAction && (
                        <button
                            class="panel-menu-btn"
                            aria-label="Open Drum Pad"
                            onClick={() => {
                                if (document.activeElement instanceof HTMLElement) {
                                    document.activeElement.blur();
                                }
                                dispatch(ACTIONS.INIT_AUDIO);
                                setTimeout(() => {
                                    dispatch(ACTIONS.SET_MODAL_OPEN, {
                                        modal: 'drumPad',
                                        open: true,
                                    });
                                }, 0);
                            }}
                        >
                            🥁
                        </button>
                    )}
                    <button
                        class={`panel-menu-btn ${isMenuOpen ? 'active' : ''}`}
                        aria-label="Grooves Settings"
                        aria-expanded={isMenuOpen}
                        aria-haspopup="true"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >
                        ⋮
                    </button>
                    <div
                        class={`panel-settings-menu grooves-settings-menu ${isMenuOpen ? 'open' : ''}`}
                    >
                        <InstrumentSettings module="groove" />
                    </div>
                    <button
                        class={`power-btn desktop-power-btn ${enabled ? 'active' : ''}`}
                        id="groovePowerBtnDesktop"
                        aria-label="Toggle Grooves"
                        aria-pressed={enabled}
                        onClick={() => togglePower('groove')}
                    >
                        ⏻
                    </button>
                </div>
            </div>

            {compactStudio ? (
                <div class="studio-mode-grid">
                    <section class="studio-mode-section studio-mode-section--smart">
                        <div class="studio-mode-section-header">
                            <p class="workspace-kicker">Smart first</p>
                            <h3 class="studio-mode-title">Smart</h3>
                        </div>
                        <GenreSelector />
                        <IntensitySlider />
                        <CreativityToggle />
                    </section>

                    <details
                        class="studio-mode-section studio-mode-section--legacy"
                        open={activeTab === 'classic'}
                    >
                        <summary class="studio-mode-summary">
                            <span>Classic controls</span>
                            <span class="studio-mode-summary-hint">Legacy</span>
                        </summary>
                        <div class="studio-mode-section-body">
                            <div class="smart-control-group--compact">
                                <label class="section-label">Style</label>
                                <PresetLibrary type="drum" />
                            </div>
                            <div class="panel-surface">
                                <div class="panel-surface-header">
                                    <h4 class="panel-surface-title">Step Sequencer</h4>
                                    <select
                                        id="drumBarsSelect"
                                        aria-label="Number of Drum Measures"
                                        value={measures}
                                        onChange={(/** @type {any} */ e) =>
                                            updateMeasures(e.target.value)
                                        }
                                    >
                                        <option value="1">1</option>
                                        <option value="2">2</option>
                                        <option value="4">4</option>
                                        <option value="8">8</option>
                                    </select>
                                </div>
                                <div id="measurePagination" class="panel-pagination-row" />
                                <div class="panel-action-row">
                                    <button
                                        id="cloneMeasureBtn"
                                        class="button-compact"
                                        onClick={cloneMeasure}
                                    >
                                        ⧉ Copy to All
                                    </button>
                                    <button
                                        id="saveDrumBtn"
                                        class="button-compact"
                                        onClick={saveDrumPreset}
                                    >
                                        💾 Save Pattern
                                    </button>
                                </div>
                                <SequencerGrid />
                            </div>
                        </div>
                    </details>
                </div>
            ) : (
                <>
                    <div
                        id="groove-tab-classic"
                        class={`instrument-tab-content ${activeTab === 'classic' ? 'active' : ''}`}
                    >
                        <div class="smart-control-group--compact">
                            <label class="section-label">Style</label>
                            <PresetLibrary type="drum" />
                        </div>
                        <div class="panel-surface">
                            <div class="panel-surface-header">
                                <h4 class="panel-surface-title">Step Sequencer</h4>
                                <select
                                    id="drumBarsSelect"
                                    aria-label="Number of Drum Measures"
                                    value={measures}
                                    onChange={(/** @type {any} */ e) =>
                                        updateMeasures(e.target.value)
                                    }
                                >
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="4">4</option>
                                    <option value="8">8</option>
                                </select>
                            </div>
                            <div id="measurePagination" class="panel-pagination-row" />
                            <div class="panel-action-row">
                                <button
                                    id="cloneMeasureBtn"
                                    class="button-compact"
                                    onClick={cloneMeasure}
                                >
                                    ⧉ Copy to All
                                </button>
                                <button
                                    id="saveDrumBtn"
                                    class="button-compact"
                                    onClick={saveDrumPreset}
                                >
                                    💾 Save Pattern
                                </button>
                            </div>
                            <SequencerGrid />
                        </div>
                    </div>

                    <div
                        id="groove-tab-smart"
                        class={`instrument-tab-content ${activeTab === 'smart' ? 'active' : ''}`}
                    >
                        <GenreSelector />
                        <IntensitySlider />
                        <CreativityToggle />
                    </div>
                </>
            )}
        </div>
    );
}

function IntensitySlider() {
    const { bandIntensity, autoIntensity } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            bandIntensity: s.playback.bandIntensity,
            autoIntensity: s.playback.autoIntensity,
        }),
    );

    return (
        <div class="smart-control-group">
            <SettingRow
                label="Intensity (Global)"
                id="intensitySlider"
                valueDisplay={`${Math.round(bandIntensity * 100)}%`}
            >
                <div class="control-stack">
                    <label htmlFor="autoIntensityCheck" class="setting-toggle-label">
                        <Toggle
                            id="autoIntensityCheck"
                            label="Auto Intensity"
                            checked={autoIntensity}
                            onChange={(/** @type {boolean} */ val) => {
                                dispatch(ACTIONS.SET_AUTO_INTENSITY, val);
                                saveCurrentState();
                            }}
                        />{' '}
                        Auto
                    </label>
                    <div class={autoIntensity ? 'disabled-group' : ''}>
                        <Slider
                            id="intensitySlider"
                            min="0"
                            max="100"
                            value={Math.round(bandIntensity * 100)}
                            onInput={(/** @type {string} */ val) => {
                                dispatch(ACTIONS.SET_BAND_INTENSITY, parseInt(val, 10) / 100);
                            }}
                            ariaValueText={`${Math.round(bandIntensity * 100)}%`}
                        />
                    </div>
                </div>
            </SettingRow>
        </div>
    );
}

function CreativityToggle() {
    const creativity = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => s.groove.creativity,
    );

    return (
        <div class="smart-control-group smart-control-group--compact">
            <SettingRow
                label="Creativity"
                description="Enables generative variations and musical risks."
                id="creativityCheck"
            >
                <Toggle
                    id="creativityCheck"
                    label="Creativity"
                    checked={creativity}
                    onChange={(/** @type {boolean} */ val) => {
                        dispatch(ACTIONS.SET_CREATIVITY, val);
                        syncWorker();
                        saveCurrentState();
                    }}
                />
            </SettingRow>
        </div>
    );
}

function GenreSelector() {
    const { lastSmartGenre, pendingGenreFeel, genreSwitchCountdown } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            lastSmartGenre: s.groove.lastSmartGenre,
            pendingGenreFeel: s.groove.pendingGenreFeel,
            genreSwitchCountdown: s.groove.genreSwitchCountdown,
        }),
    );

    const genres = [
        'Rock',
        'Jazz',
        'Funk',
        'Disco',
        'Hip Hop',
        'Blues',
        'Neo-Soul',
        'Reggae',
        'Acoustic',
        'Bossa',
        'Country',
        'Metal',
        'Ska-Punk',
    ];

    /** @param {string} genre */
    const handleGenreClick = (genre) => {
        import('../data/smart-genres.js').then(({ SMART_GENRES }) => {
            const config = /** @type {any} */ (SMART_GENRES)[genre];
            if (config) {
                dispatch(ACTIONS.SET_GENRE_FEEL, {
                    genreName: genre,
                    feel: config.feel,
                    swing: config.swing,
                    sub: config.sub,
                    drum: config.drum,
                    chord: config.chord,
                    bass: config.bass,
                    soloist: config.soloist,
                });
                syncWorker();
                saveCurrentState();
            }
        });
    };

    return (
        <div class="smart-control-group">
            <label class="section-label">Genre</label>
            <div class="genre-selector">
                {genres.map((/** @type {any} */ genre) => {
                    const isActive = genre === lastSmartGenre && !pendingGenreFeel;
                    const isPending = pendingGenreFeel && pendingGenreFeel.genreName === genre;

                    return (
                        <button
                            key={genre}
                            className={`genre-btn ${isActive ? 'active' : ''} ${isPending ? 'pending' : ''}`}
                            data-genre={genre}
                            data-countdown={
                                isPending && genreSwitchCountdown ? genreSwitchCountdown : undefined
                            }
                            onClick={() => handleGenreClick(genre)}
                            aria-pressed={isActive ? 'true' : 'false'}
                        >
                            {genre}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
