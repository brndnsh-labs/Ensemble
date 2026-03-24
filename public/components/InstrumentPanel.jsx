import { flushBuffers, togglePower } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { syncWorker } from '../worker-client.js';
import { useClickOutside } from './hooks.js';
import { InstrumentSettings } from './InstrumentSettings.jsx';
import { SoloistControls } from './SoloistControls.jsx';
import { StyleSelector } from './StyleSelector.jsx';

/**
 * @typedef {Object} InstrumentPanelProps
 * @property {string} id
 * @property {string} module
 * @property {string} title
 * @property {any} styles
 * @property {boolean} isActiveMobile
 */
/**
 * @param {InstrumentPanelProps} props
 */
export function InstrumentPanel({ id, module, title, styles, isActiveMobile }) {
    const { activeTab, enabled, tradeMode, performanceOpen } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => {
            const modState = /** @type {any} */ (s)[module];
            return {
                activeTab: modState.activeTab,
                enabled: modState.enabled,
                tradeMode: modState.tradeMode,
                performanceOpen: s.playback.modals?.performance,
            };
        },
    );

    const [isMenuOpen, setIsMenuOpen, menuRef] = useClickOutside();

    const switchTab = (/** @type {any} */ tab) => {
        if (tab === 'smart') {
            dispatch(ACTIONS.SET_STYLE, { module, style: 'smart' });
            flushBuffers();
            dispatch(ACTIONS.RESTORE_GAINS);
        }

        dispatch(ACTIONS.SET_ACTIVE_TAB, { module, tab });
        syncWorker();
        saveCurrentState();
    };

    const headerClass = `${module === 'chords' ? 'chord' : module === 'harmony' ? 'harmony' : module}-panel-header`;
    const isWaiting = module === 'soloist' && !enabled && tradeMode !== 'manual';
    const isPerformanceMode = module === 'soloist' && performanceOpen;
    const powerClass = `power-btn desktop-power-btn ${enabled ? 'active' : isWaiting ? 'waiting' : ''} ${isPerformanceMode ? 'performance-active' : ''}`;

    return (
        <div
            class={`panel dashboard-panel instrument-panel ${activeTab === 'smart' ? 'smart-active' : ''} ${isActiveMobile ? 'active-mobile' : ''} ${isMenuOpen ? 'settings-open' : ''}`}
            id={id}
            data-id={module}
        >
            <div class={`panel-header ${headerClass}`}>
                <div class="panel-header-main">
                    <h2 class="panel-title">{title}</h2>
                </div>
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
                <div class="panel-header-actions" ref={menuRef}>
                    {module === 'soloist' && (
                        <button
                            class="panel-menu-btn"
                            aria-label="Open Performance Mode"
                            onClick={() => {
                                if (document.activeElement instanceof HTMLElement) {
                                    document.activeElement.blur();
                                }
                                dispatch(ACTIONS.INIT_AUDIO);
                                setTimeout(() => {
                                    dispatch(ACTIONS.SET_MODAL_OPEN, {
                                        modal: 'performance',
                                        open: true,
                                    });
                                }, 0);
                            }}
                        >
                            🎵
                        </button>
                    )}
                    <button
                        class={`panel-menu-btn ${isMenuOpen ? 'active' : ''}`}
                        aria-label={`${title} Settings`}
                        aria-expanded={isMenuOpen}
                        aria-haspopup="true"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >
                        ⋮
                    </button>
                    <div
                        class={`panel-settings-menu ${module}-settings-menu ${isMenuOpen ? 'open' : ''}`}
                    >
                        <InstrumentSettings module={module} />
                    </div>
                    <button
                        class={powerClass}
                        id={`${module === 'chords' ? 'chord' : module}PowerBtnDesktop`}
                        aria-label={`Toggle ${title}`}
                        aria-pressed={enabled}
                        onClick={() => togglePower(module)}
                    >
                        ⏻
                    </button>
                </div>
            </div>

            {module === 'soloist' && <SoloistControls />}

            <div
                id={`${module === 'chords' ? 'chord' : module}-tab-classic`}
                class={`instrument-tab-content ${activeTab === 'classic' ? 'active' : ''}`}
            >
                <label class="section-label">Style</label>
                <div
                    id={`${module === 'harmony' ? 'harmony' : module}StylePresets`}
                    class="presets-container"
                >
                    <StyleSelector module={module} styles={styles} />
                </div>
            </div>

            <div
                id={`${module === 'chords' ? 'chord' : module}-tab-smart`}
                class={`instrument-tab-content ${activeTab === 'smart' ? 'active' : ''}`}
            >
                <div class="smart-status" style={`--module-color-rgb: var(--${module}-color-rgb);`}>
                    <p class="smart-status-copy">
                        ✨ <strong>Smart Follow</strong> Active
                    </p>
                </div>
            </div>
        </div>
    );
}
