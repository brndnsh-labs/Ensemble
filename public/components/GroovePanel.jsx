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
            creativity: s.groove.creativity,
            fillActive: s.groove.fillActive,
            autoIntensity: s.playback.autoIntensity,
            bandIntensity: s.playback.bandIntensity,
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
                <AutoIntensityToggle autoIntensity={grooveState.autoIntensity} />
                <BandIntensitySlider
                    autoIntensity={grooveState.autoIntensity}
                    bandIntensity={grooveState.bandIntensity}
                />
                <CreativityToggle creativity={grooveState.creativity} />
            </div>
        </div>
    );
}

/**
 * @param {{ autoIntensity: boolean }} props
 */
function AutoIntensityToggle({ autoIntensity }) {
    return (
        <SettingRow
            label="Auto intensity"
            description="Starts at 35% and evolves with the performance."
            id="autoIntensityCheck"
        >
            <Toggle
                id="autoIntensityCheck"
                ariaLabel="Auto intensity"
                checked={autoIntensity}
                onChange={(/** @type {boolean} */ checked) => {
                    dispatch(ACTIONS.SET_AUTO_INTENSITY, checked);
                    syncWorker(ACTIONS.SET_AUTO_INTENSITY, checked);
                    if (checked) {
                        dispatch(ACTIONS.SET_BAND_INTENSITY, 0.35);
                        syncWorker(ACTIONS.SET_BAND_INTENSITY, 0.35);
                    }
                    saveCurrentState();
                }}
            />
        </SettingRow>
    );
}

/**
 * @param {{ autoIntensity: boolean, bandIntensity: number }} props
 */
function BandIntensitySlider({ autoIntensity, bandIntensity }) {
    const displayValue = Math.round((bandIntensity || 0.35) * 100);
    return (
        <SettingRow label="Band energy" valueDisplay={`${displayValue}%`} id="bandIntensitySlider">
            <Slider
                id="bandIntensitySlider"
                min={0}
                max={100}
                value={displayValue}
                disabled={autoIntensity}
                ariaLabel="Band energy"
                onInput={(/** @type {string | number} */ value) => {
                    const normalized = Number(value) / 100;
                    dispatch(ACTIONS.SET_BAND_INTENSITY, normalized);
                    syncWorker(ACTIONS.SET_BAND_INTENSITY, normalized);
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
