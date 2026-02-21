import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { useEnsembleState } from './ui-bridge.js';
import { Transport } from './components/Transport.jsx';
import { Arranger } from './components/Arranger.jsx';
import { SequencerGrid } from './components/SequencerGrid.jsx';
import { ChordVisualizer } from './components/ChordVisualizer.jsx';
import { InstrumentSettings } from './components/InstrumentSettings.jsx';
import { StyleSelector } from './components/StyleSelector.jsx';
import { PresetLibrary } from './components/PresetLibrary.jsx';
import { GroovePanel } from './components/GroovePanel.jsx';
import { KeySignatureControls } from './components/KeySignatureControls.jsx';
import { Modals } from './components/Modals.jsx';
import { NotificationLayer } from './components/NotificationLayer.jsx';
import { CHORD_STYLES, BASS_STYLES, SOLOIST_STYLES, HARMONY_STYLES } from './presets.js';
import { dispatch, getState } from './state.js';
const { groove } = getState();
import { ACTIONS } from './types.js';
import { syncWorker } from './worker-client.js';
import { saveCurrentState } from './persistence.js';
import { togglePower } from './instrument-controller.js';
import { triggerInstall } from './pwa.js';
import { APP_VERSION } from './config.js';
import { GlobalShortcuts } from './components/GlobalShortcuts.jsx';

export function App() {
    const { 
        vizEnabled,
        grooveMobileTab
    } = useEnsembleState(s => ({
        vizEnabled: s.vizState.enabled,
        grooveMobileTab: s.groove.mobileTab
    }));

    return (
        <Fragment>
            <GlobalShortcuts />
            <div class="app-container">
                <Header />
                <main class="app-main-layout loaded" id="dashboardGrid">
                    <ArrangerPanel />
                    <VisualizerPanel enabled={vizEnabled} />
                    <Sidebar grooveMobileTab={grooveMobileTab} />
                    <MobileNav activeTab={grooveMobileTab} />
                </main>
            </div>

            <Modals />
            <NotificationLayer />
        </Fragment>
    );
}

function Header() {
    return (
        <header>
            <h1>Ensemble</h1>
            <Transport />
        </header>
    );
}

function ArrangerPanel() {
    const openEditor = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: true });
    };

    return (
        <div class="panel dashboard-panel active-mobile" id="panel-arranger" data-id="arranger">
            <div class="panel-header chord-panel-header">
                <div class="panel-title-group">
                    <h2>Arranger</h2>
                </div>
                <div class="panel-header-controls">
                    <KeySignatureControls />
                </div>
            </div>

            <div className="display-area" id="chordVisualizer">
                <ChordVisualizer />
            </div>
            
            <div id="activeSectionLabel" class="active-section-label"></div>

            <div style="margin-bottom: 1.5rem;">
                <button id="editArrangementBtn" class="primary-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1rem;" onClick={openEditor}>
                    <span>✏️</span> Edit Arrangement
                </button>
            </div>

            <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 0.5rem; min-height: 100px;">
                <label class="library-label">Library</label>
                <PresetLibrary type="chord" />
            </div>
        </div>
    );
}

function VisualizerPanel({ enabled }) {
    const handleToggle = () => {
        togglePower('viz');
    };

    return (
        <div class={`panel dashboard-panel ${!enabled ? 'collapsed' : ''}`} id="panel-visualizer" data-id="visualizer">
            <div class="panel-header">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <button id="vizPowerBtn" class={`power-btn ${enabled ? 'active' : ''}`} aria-label="Toggle Visualizer" onClick={handleToggle}>⏻</button>
                    <h2>Visualizer</h2>
                </div>
            </div>
            
            <div class="viz-graph-area">
                <div id="unifiedVizContainer"></div>
            </div>
        </div>
    );
}

function Sidebar({ grooveMobileTab }) {
    const activeMobileTab = grooveMobileTab === 'mobile' ? 'grooves' : grooveMobileTab;

    return (
        <div class="layout-column sidebar-column" id="col-sidebar">
            <InstrumentPanel id="panel-chords" module="chords" title="Chords" styles={CHORD_STYLES} isActiveMobile={activeMobileTab === 'chords'} />
            <GroovePanel isActiveMobile={activeMobileTab === 'grooves'} />
            <InstrumentPanel id="panel-bass" module="bass" title="Bass" styles={BASS_STYLES} isActiveMobile={activeMobileTab === 'bass'} />
            <InstrumentPanel id="panel-soloist" module="soloist" title="Soloist" styles={SOLOIST_STYLES} isActiveMobile={activeMobileTab === 'soloist'} />
            <InstrumentPanel id="panel-harmonies" module="harmony" title="Harmony" styles={HARMONY_STYLES} isActiveMobile={activeMobileTab === 'harmonies'} />
        </div>
    );
}

function InstrumentPanel({ id, module, title, styles, isActiveMobile }) {
    const { activeTab, enabled, tradeMode } = useEnsembleState(s => ({
        activeTab: s[module].activeTab,
        enabled: s[module].enabled,
        tradeMode: s[module].tradeMode
    }));

    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const switchTab = (tab) => {
        dispatch(ACTIONS.SET_ACTIVE_TAB, { module, tab });
        syncWorker();
        saveCurrentState();
    };

    const headerClass = `${module === 'chords' ? 'chord' : (module === 'harmony' ? 'harmony' : module)}-panel-header`;
    const isWaiting = module === 'soloist' && !enabled && tradeMode !== 'manual';
    const powerClass = `power-btn desktop-power-btn ${enabled ? 'active' : (isWaiting ? 'waiting' : '')}`;

    return (
        <div class={`panel dashboard-panel instrument-panel ${activeTab === 'smart' ? 'smart-active' : ''} ${isActiveMobile ? 'active-mobile' : ''}`} id={id} data-id={module}>
            <div class={`panel-header ${headerClass}`}>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <h2>{title}</h2>
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
                        class={powerClass}
                        id={`${module === 'chords' ? 'chord' : module}PowerBtnDesktop`} 
                        aria-label={`Toggle ${title}`}
                        onClick={() => togglePower(module)}
                    >⏻</button>
                </div>
            </div>

            <div id={`${module === 'chords' ? 'chord' : module}-tab-classic`} class={`instrument-tab-content ${activeTab === 'classic' ? 'active' : ''}`}>
                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;">Style</label>
                <div id={`${module === 'harmony' ? 'harmony' : module}StylePresets`} class="presets-container">
                    <StyleSelector module={module} styles={styles} />
                </div>
            </div>

            <div id={`${module === 'chords' ? 'chord' : module}-tab-smart`} class={`instrument-tab-content ${activeTab === 'smart' ? 'active' : ''}`}>
                {module === 'soloist' ? (
                    <SoloistSmartTab />
                ) : (
                    <div class="smart-status" style={`padding: 0.5rem; background: rgba(var(--${module}-color-rgb), 0.05); border-radius: 8px; border: 1px dashed rgba(var(--${module}-color-rgb), 0.2); text-align: center;`}>
                        <p style="font-size: 0.8rem; margin: 0;">✨ <strong>Smart Follow</strong> Active</p>
                    </div>
                )}
            </div>

            <div class={`panel-settings-menu ${isMenuOpen ? 'open' : ''}`}>
                <InstrumentSettings module={module} />
            </div>
        </div>
    );
}

function MobileNavTab({ tab, activeTab, onSwitch }) {
    const isActive = (activeTab === tab.id) || (activeTab === 'mobile' && tab.id === 'grooves');
    const { enabled, tradeMode } = useEnsembleState(s => ({ 
        enabled: s[tab.module].enabled,
        tradeMode: s[tab.module].tradeMode
    }));

    const isWaiting = tab.module === 'soloist' && !enabled && tradeMode !== 'manual';
    const powerClass = `power-btn ${enabled ? 'active' : (isWaiting ? 'waiting' : '')}`;

    return (
        <div class={`tab-item ${isActive ? 'active' : ''} tab-${tab.id}`} onClick={() => onSwitch(tab.id)}>
            <button
                class={`tab-btn ${isActive ? 'active' : ''}`}
            >{tab.label}</button>
            <button
                id={`${tab.module === 'chords' ? 'chord' : tab.module}PowerBtn`}
                class={powerClass}
                aria-label={`Toggle ${tab.label}`}
                onClick={(e) => { e.stopPropagation(); togglePower(tab.module); }}
            >⏻</button>
        </div>
    );
}

function MobileNav({ activeTab }) {
    const switchMobileTab = (tab) => {
        if (tab === 'grooves') {
            dispatch(ACTIONS.SET_ACTIVE_TAB, { module: 'groove', tab: 'smart' });
        }
        const { groove } = getState();
        groove.mobileTab = tab;
        dispatch('MOBILE_TAB_SWITCH');
        syncWorker();
        saveCurrentState();
    };

    return (
        <div class="mobile-tabs-nav">
            {[
                { id: 'chords', label: 'Chords', module: 'chords' },
                { id: 'grooves', label: 'Grooves', module: 'groove' },
                { id: 'bass', label: 'Bass', module: 'bass' },
                { id: 'soloist', label: 'Soloist', module: 'soloist' },
                { id: 'harmonies', label: 'Harmony', module: 'harmony' }
            ].map(tab => (
                <MobileNavTab key={tab.id} tab={tab} activeTab={activeTab} onSwitch={switchMobileTab} />
            ))}
        </div>
    );
}

function SoloistSmartTab() {
    const { tradeMode, enabled } = useEnsembleState(s => ({
        tradeMode: s.soloist.tradeMode,
        enabled: s.soloist.enabled
    }));

    const setTradeMode = (mode) => {
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'tradeMode', value: mode });
        saveCurrentState();
    };

    return (
        <div class="soloist-smart-controls" style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0.25rem 0;">
            <div class="trade-mode-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                    <label style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Trade Mode</label>
                    <span style="font-size: 0.7rem; opacity: 0.5; font-style: italic;">{tradeMode === 'manual' ? 'Manual Control' : `Autoswitch: ${tradeMode}`}</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.25rem;">
                    {['manual', 'sections', 'loops'].map(mode => (
                        <button 
                            class={`mini-toggle-btn ${tradeMode === mode ? 'active' : ''}`}
                            style="text-transform: capitalize;"
                            onClick={() => setTradeMode(mode)}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}