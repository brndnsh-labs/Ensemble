import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { initAudio } from '../engine/engine.js';
import { togglePower } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { syncWorker } from '../worker-client.js';
import { InstrumentSettings } from './InstrumentSettings.jsx';
import { SoloistSmartTab } from './SoloistSmartTab.jsx';
import { StyleSelector } from './StyleSelector.jsx';

export function InstrumentPanel({ id, module, title, styles, isActiveMobile }) {
    const { activeTab, enabled, tradeMode, performanceOpen } = useEnsembleState((s) => ({
        activeTab: s[module].activeTab,
        enabled: s[module].enabled,
        tradeMode: s[module].tradeMode,
        performanceOpen: s.playback.modals?.performance,
    }));

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!isMenuOpen) {
            return;
        }

        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMenuOpen]);

    const switchTab = (tab) => {
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
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <h2>{title}</h2>
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
                <div style="display: flex; gap: 0.5rem; align-items: center;" ref={menuRef}>
                    {module === 'soloist' && (
                        <button
                            class="panel-menu-btn"
                            aria-label="Open Performance Mode"
                            onClick={() => {
                                if (document.activeElement instanceof HTMLElement) {
                                    document.activeElement.blur();
                                }
                                initAudio();
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

            <div
                id={`${module === 'chords' ? 'chord' : module}-tab-classic`}
                class={`instrument-tab-content ${activeTab === 'classic' ? 'active' : ''}`}
            >
                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">
                    Style
                </label>
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
                {module === 'soloist' ? (
                    <SoloistSmartTab />
                ) : (
                    <div
                        class="smart-status"
                        style={`padding: 0.5rem; background: rgba(var(--${module}-color-rgb), 0.05); border-radius: 8px; border: 1px dashed rgba(var(--${module}-color-rgb), 0.2); text-align: center;`}
                    >
                        <p style="font-size: 0.8rem; margin: 0;">
                            ✨ <strong>Smart Follow</strong> Active
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
