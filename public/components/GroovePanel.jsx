import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useEnsembleState } from '../ui-bridge.js';
import { ACTIONS } from '../types.js';
import { dispatch } from '../state.js';
import { syncWorker } from '../worker-client.js';
import { saveCurrentState } from '../persistence.js';
import { togglePower, updateMeasures, cloneMeasure, saveDrumPreset } from '../instrument-controller.js';
import { InstrumentSettings } from './InstrumentSettings.jsx';
import { PresetLibrary } from './PresetLibrary.jsx';
import { SequencerGrid } from './SequencerGrid.jsx';

export function GroovePanel({ isActiveMobile }) {
    const { activeTab, enabled, measures, fillActive } = useEnsembleState(s => ({
        activeTab: s.groove.activeTab,
        enabled: s.groove.enabled,
        measures: s.groove.measures,
        fillActive: s.groove.fillActive
    }));

    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const switchTab = (tab) => {
        dispatch(ACTIONS.SET_ACTIVE_TAB, { module: 'groove', tab });
        syncWorker();
        saveCurrentState();
    };

    return (
        <div class={`panel dashboard-panel instrument-panel ${isActiveMobile ? 'active-mobile' : ''}`} id="panel-grooves" data-id="grooves">
            <div class="panel-header groove-panel-header">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <h2 style={{ color: fillActive ? 'var(--soloist-color)' : '' }}>Grooves</h2>
                </div>
                <div class="instrument-tabs">
                    <button
                        class={`instrument-tab-btn ${activeTab === 'classic' ? 'active' : ''}`}
                        onClick={() => switchTab('classic')}
                    >Classic</button>
                    <button
                        class={`instrument-tab-btn ${activeTab === 'smart' ? 'active' : ''}`}
                        onClick={() => switchTab('smart')}
                    >Smart</button>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button
                        class={`panel-menu-btn ${isMenuOpen ? 'active' : ''}`}
                        aria-label="Settings"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >⋮</button>
                    <button
                        class={`power-btn desktop-power-btn ${enabled ? 'active' : ''}`}
                        id="groovePowerBtnDesktop"
                        aria-label="Toggle Grooves"
                        onClick={() => togglePower('groove')}
                    >⏻</button>
                </div>
            </div>

            <div id="groove-tab-classic" class={`instrument-tab-content ${activeTab === 'classic' ? 'active' : ''}`}>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">Style</label>
                    <PresetLibrary type="drum" />
                </div>
                <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; margin-bottom: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h4 style="margin: 0; font-size: 0.9rem; color: var(--accent-color);">Step Sequencer</h4>
                        <select
                            id="drumBarsSelect"
                            aria-label="Number of Drum Measures"
                            value={measures}
                            onChange={(e) => updateMeasures(e.target.value)}
                        >
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="4">4</option>
                            <option value="8">8</option>
                        </select>
                    </div>
                    <div id="measurePagination" style="display: flex; gap: 0.4rem; margin-bottom: 1rem; align-items: center;"></div>
                    <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                        <button id="cloneMeasureBtn" style="font-size: 0.75rem; padding: 0.3rem 0.6rem; flex: 1;" onClick={cloneMeasure}>⧉ Copy to All</button>
                        <button id="saveDrumBtn" style="font-size: 0.75rem; padding: 0.3rem 0.6rem; flex: 1;" onClick={saveDrumPreset}>💾 Save Pattern</button>
                    </div>
                    <div className="sequencer-grid" id="sequencerGrid">
                        <SequencerGrid />
                    </div>
                </div>
            </div>

            <div id="groove-tab-smart" class={`instrument-tab-content ${activeTab === 'smart' ? 'active' : ''}`}>
                <GenreSelector />
                <IntensitySlider />
                <ComplexitySlider />
            </div>

            <div class={`panel-settings-menu grooves-settings-menu ${isMenuOpen ? 'open' : ''}`}>
                <InstrumentSettings module="groove" />
            </div>
        </div>
    );
}

function IntensitySlider() {
    const { bandIntensity, autoIntensity } = useEnsembleState(s => ({
        bandIntensity: s.playback.bandIntensity,
        autoIntensity: s.playback.autoIntensity
    }));

    return (
        <div class="smart-control-group" style="margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; align-items: center;">
                <label htmlFor="intensitySlider" style="font-size: 0.9rem; color: #94a3b8;">Intensity (Global)</label>
                <div style="display: flex; gap: 1rem; align-items: center;">
                    <label style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.3rem; cursor: pointer;">
                        <input
                            type="checkbox"
                            checked={autoIntensity}
                            onChange={(e) => {
                                dispatch(ACTIONS.SET_AUTO_INTENSITY, e.target.checked);
                                saveCurrentState();
                            }}
                        /> Auto
                    </label>
                    <span style="color: var(--accent-color); font-weight: bold; font-size: 0.9rem;">{Math.round(bandIntensity * 100)}%</span>
                </div>
            </div>
            <input
                id="intensitySlider"
                type="range"
                min="0"
                max="100"
                value={Math.round(bandIntensity * 100)}
                onInput={(e) => {
                    dispatch(ACTIONS.SET_BAND_INTENSITY, parseInt(e.target.value) / 100);
                }}
                disabled={autoIntensity}
                style={{ width: '100%', height: '6px', opacity: autoIntensity ? 0.5 : 1 }}
            />
        </div>
    );
}

function ComplexitySlider() {
    const complexity = useEnsembleState(s => s.playback.complexity);

    let label = 'Low';
    if (complexity > 0.33) label = 'Medium';
    if (complexity > 0.66) label = 'High';

    return (
        <div class="smart-control-group" style="margin-bottom: 1rem;">
            <label htmlFor="complexitySlider" style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">
                <span>Complexity</span>
                <span style="color: var(--accent-color); font-weight: bold;">{label}</span>
            </label>
            <input
                id="complexitySlider"
                type="range"
                min="0"
                max="100"
                value={Math.round(complexity * 100)}
                aria-valuetext={label}
                onInput={(e) => {
                    dispatch(ACTIONS.SET_COMPLEXITY, parseInt(e.target.value) / 100);
                }}
                style="width: 100%; height: 6px;"
            />
        </div>
    );
}

function GenreSelector() {
    const { lastSmartGenre, pendingGenreFeel } = useEnsembleState(s => ({
        lastSmartGenre: s.groove.lastSmartGenre,
        pendingGenreFeel: s.groove.pendingGenreFeel
    }));

    const genres = [
        'Rock', 'Jazz', 'Funk', 'Disco', 'Hip Hop', 'Blues',
        'Neo-Soul', 'Reggae', 'Acoustic', 'Bossa', 'Country', 'Metal'
    ];

    const handleGenreClick = (genre) => {
        import('../presets.js').then(({ SMART_GENRES }) => {
            const config = SMART_GENRES[genre];
            if (config) {
                import('../state.js').then(({ groove }) => {
                    Object.assign(groove, { lastSmartGenre: genre });
                    dispatch(ACTIONS.SET_GENRE_FEEL, {
                        genreName: genre,
                        feel: config.feel,
                        swing: config.swing,
                        sub: config.sub,
                        drum: config.drum,
                        chord: config.chord,
                        bass: config.bass,
                        soloist: config.soloist
                    });
                    syncWorker();
                    saveCurrentState();
                });
            }
        });
    };

    return (
        <div class="smart-control-group" style="margin-bottom: 1.5rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">Genre</label>
            <div class="genre-selector">
                {genres.map(genre => {
                    const isActive = genre === lastSmartGenre && !pendingGenreFeel;
                    const isPending = pendingGenreFeel && (pendingGenreFeel.genreName === genre);

                    return (
                        <button
                            key={genre}
                            className={`genre-btn ${isActive ? 'active' : ''} ${isPending ? 'pending' : ''}`}
                            data-genre={genre}
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
