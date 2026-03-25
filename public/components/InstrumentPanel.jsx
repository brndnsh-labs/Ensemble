import { togglePower } from '../instrument-controller.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { useClickOutside } from './hooks.js';
import { InstrumentSettings } from './InstrumentSettings.jsx';
import { SoloistControls } from './SoloistControls.jsx';

/**
 * @typedef {Object} InstrumentPanelProps
 * @property {string} id
 * @property {string} module
 * @property {string} title
 * @property {boolean} [isActiveMobile]
 * @property {boolean} [showPerformanceAction]
 */
/**
 * @param {InstrumentPanelProps} props
 */
export function InstrumentPanel({
    id,
    module,
    title,
    isActiveMobile = true,
    showPerformanceAction = true,
}) {
    const { enabled, tradeMode, performanceOpen } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => {
            const modState = /** @type {any} */ (s)[module];
            return {
                enabled: modState.enabled,
                tradeMode: modState.tradeMode,
                performanceOpen: s.playback.modals?.performance,
            };
        },
    );

    const [isMenuOpen, setIsMenuOpen, menuRef] = useClickOutside();

    const panelTheme = module === 'chords' ? 'chord' : module;
    const headerClass = `${panelTheme}-panel-header`;
    const isWaiting = module === 'soloist' && !enabled && tradeMode !== 'manual';
    const isPerformanceMode = module === 'soloist' && performanceOpen;
    const powerClass = `power-btn desktop-power-btn ${enabled ? 'active' : isWaiting ? 'waiting' : ''} ${isPerformanceMode ? 'performance-active' : ''}`;
    const hasBody = module === 'soloist';

    return (
        <div
            class={`panel dashboard-panel instrument-panel smart-active ${isActiveMobile ? 'active-mobile' : ''} ${isMenuOpen ? 'settings-open' : ''} studio-compact-panel`}
            id={id}
            data-id={module}
        >
            <div class={`panel-header ${headerClass}`}>
                <div class="panel-header-main">
                    <h2 class="panel-title">{title}</h2>
                </div>
                <div class="panel-header-actions" ref={menuRef}>
                    {module === 'soloist' && showPerformanceAction && (
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

            {hasBody && (
                <div class="studio-mode-section studio-mode-section--smart">
                    <SoloistControls />
                </div>
            )}
        </div>
    );
}
