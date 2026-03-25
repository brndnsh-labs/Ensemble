import { togglePower } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { syncWorker } from '../worker-client.js';
import { useClickOutside } from './hooks.js';
import { InstrumentSettings } from './InstrumentSettings.jsx';
import { SettingRow, Slider, Toggle } from './UIControls.jsx';

/**
 * @param {Object} props
 * @param {boolean} [props.isActiveMobile]
 * @param {boolean} [props.showLaunchAction]
 */
export function GroovePanel({ isActiveMobile = true, showLaunchAction = true }) {
    const grooveState = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            enabled: s.groove.enabled,
            genreFeel: s.groove.genreFeel,
            larsMode: s.groove.larsMode,
            larsIntensity: s.groove.larsIntensity,
            creativity: s.groove.creativity,
            fillActive: s.groove.fillActive,
        }),
    );
    const [isMenuOpen, setIsMenuOpen, menuRef] = useClickOutside();

    const powerClass = `power-btn desktop-power-btn ${grooveState.enabled ? 'active' : ''}`;
    const titleAccent = grooveState.fillActive ? ' panel-title-accent' : '';

    return (
        <div
            class={`panel dashboard-panel instrument-panel smart-active ${isActiveMobile ? 'active-mobile' : ''} ${isMenuOpen ? 'settings-open' : ''} studio-compact-panel`}
            id="panel-grooves"
            data-id="groove"
        >
            <div class="panel-header groove-panel-header">
                <div class="panel-header-main">
                    <h2 class={`panel-title${titleAccent}`}>Groove</h2>
                </div>
                <div class="panel-header-actions" ref={menuRef}>
                    {showLaunchAction && (
                        <button
                            class="panel-menu-btn"
                            aria-label="Launch Groove Pad"
                            onClick={() => {
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
                        aria-label="Groove Settings"
                        aria-expanded={isMenuOpen}
                        aria-haspopup="true"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >
                        ⋮
                    </button>
                    <div
                        class={`panel-settings-menu groove-settings-menu ${isMenuOpen ? 'open' : ''}`}
                    >
                        <InstrumentSettings module="groove" />
                    </div>
                    <button
                        class={powerClass}
                        id="groovePowerBtnDesktop"
                        aria-label="Toggle groove"
                        aria-pressed={grooveState.enabled}
                        onClick={() => togglePower('groove')}
                    >
                        ⏻
                    </button>
                </div>
            </div>

            <div class="studio-mode-section studio-mode-section--smart">
                <GenreSelector genreFeel={grooveState.genreFeel} />
                <IntensitySlider
                    larsMode={grooveState.larsMode}
                    larsIntensity={grooveState.larsIntensity}
                />
                <CreativityToggle creativity={grooveState.creativity} />
            </div>
        </div>
    );
}

/**
 * @param {{ genreFeel: string }} props
 */
function GenreSelector({ genreFeel }) {
    const [isOpen, setIsOpen, menuRef] = useClickOutside();

    return (
        <SettingRow label="Genre" valueDisplay={genreFeel}>
            <div class="header-item genre-item" ref={menuRef}>
                <button
                    class={`dropdown-button ${isOpen ? 'open' : ''}`}
                    onClick={() => setIsOpen(!isOpen)}
                    aria-label="Change groove genre"
                >
                    <span class="genre-text">{genreFeel}</span>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class={`dropdown-arrow ${isOpen ? 'rotate' : ''}`}
                    >
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>
                {isOpen && (
                    <div class="dropdown-content">
                        <div class="genre-list">
                            {[
                                'Rock',
                                'Jazz',
                                'Funk',
                                'Latin',
                                'Reggae',
                                'Pop',
                                'Acoustic',
                                'Ska Punk',
                            ].map((genre) => (
                                <button
                                    type="button"
                                    class={`genre-option ${genreFeel === genre ? 'active' : ''}`}
                                    key={genre}
                                    onClick={() => {
                                        dispatch(ACTIONS.SET_GENRE_FEEL, {
                                            feel: genre,
                                            genreName: genre,
                                        });
                                        syncWorker(ACTIONS.SET_GENRE_FEEL, {
                                            feel: genre,
                                            genreName: genre,
                                        });
                                        saveCurrentState();
                                        setIsOpen(false);
                                    }}
                                >
                                    {genre}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </SettingRow>
    );
}

/**
 * @param {{ larsMode: boolean, larsIntensity: number }} props
 */
function IntensitySlider({ larsMode, larsIntensity }) {
    return (
        <SettingRow
            label="Intensity"
            valueDisplay={`${larsMode ? Math.round(larsIntensity * 100) : 0}%`}
            id="intensitySlider"
        >
            <Slider
                id="intensitySlider"
                min={0}
                max={100}
                value={larsMode ? Math.round(larsIntensity * 100) : 0}
                disabled={!larsMode}
                ariaLabel="Groove intensity"
                onInput={(/** @type {string | number} */ value) => {
                    const normalized = Number(value) / 100;
                    dispatch(ACTIONS.SET_LARS_MODE, true);
                    dispatch(ACTIONS.SET_LARS_INTENSITY, normalized);
                    syncWorker(ACTIONS.SET_LARS_MODE, true);
                    syncWorker(ACTIONS.SET_LARS_INTENSITY, normalized);
                    saveCurrentState();
                }}
            />
        </SettingRow>
    );
}

/**
 * @param {{ creativity: boolean }} props
 */
function CreativityToggle({ creativity }) {
    return (
        <SettingRow
            label="Creativity"
            description="Enable dynamic fills and variation."
            id="creativityCheck"
        >
            <Toggle
                id="creativityCheck"
                ariaLabel="Creativity"
                checked={creativity}
                onChange={(/** @type {boolean} */ checked) => {
                    dispatch(ACTIONS.SET_CREATIVITY, checked);
                    syncWorker(ACTIONS.SET_CREATIVITY, checked);
                    saveCurrentState();
                }}
            />
        </SettingRow>
    );
}
