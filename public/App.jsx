import { Fragment, h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Arranger } from './components/Arranger.jsx';
import { ChordVisualizer } from './components/ChordVisualizer.jsx';
import { GlobalShortcuts } from './components/GlobalShortcuts.jsx';
import { GroovePanel } from './components/GroovePanel.jsx';
import { InstrumentPanel } from './components/InstrumentPanel.jsx';
import { InstrumentSettings } from './components/InstrumentSettings.jsx';
import { KeySignatureControls } from './components/KeySignatureControls.jsx';
import { Modals } from './components/Modals.jsx';
import { NotificationLayer } from './components/NotificationLayer.jsx';
import { PresetLibrary } from './components/PresetLibrary.jsx';
import { SequencerGrid } from './components/SequencerGrid.jsx';
import { StyleSelector } from './components/StyleSelector.jsx';
import { Transport } from './components/Transport.jsx';
import { APP_VERSION } from './config.js';
import { togglePower } from './instrument-controller.js';
import { parseMusicXML } from './musicxml-parser.js';
import { saveCurrentState } from './persistence.js';
import { BASS_STYLES, CHORD_STYLES, HARMONY_STYLES, SOLOIST_STYLES } from './presets.js';
import { triggerInstall } from './pwa.js';
import { dispatch, getState } from './state.js';
import { ACTIONS } from './types.js';
import { useEnsembleState } from './ui-bridge.js';
import { syncWorker } from './worker-client.js';

export function App() {
    const { vizEnabled, grooveMobileTab } = useEnsembleState((s) => ({
        vizEnabled: s.vizState.enabled,
        grooveMobileTab: s.groove.mobileTab,
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

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = parseMusicXML(event.target.result);
                dispatch(ACTIONS.IMPORT_MUSICXML, parsed);
                // The reducer already sets the style to lead_sheet and enables it
            } catch (err) {
                console.error('Failed to parse MusicXML', err);
                // Optionally show a toast error here if showToast is imported, but it's not imported in App.jsx currently
            }
        };
        reader.readAsText(file);
    };

    return (
        <div class="panel dashboard-panel active-mobile" id="panel-arranger" data-id="arranger">
            <div class="panel-header chord-panel-header">
                <div class="panel-title-group">
                    <h2>Arranger</h2>
                </div>
                <div class="panel-header-controls">
                    <input
                        type="file"
                        id="xml-upload"
                        accept=".xml,.mxl,.musicxml"
                        style="display:none;"
                        onChange={handleFileUpload}
                    />
                    <button
                        class="icon-btn tooltip"
                        aria-label="Import MusicXML"
                        onClick={() => document.getElementById('xml-upload').click()}
                    >
                        📥
                    </button>
                    <KeySignatureControls />
                </div>
            </div>

            <div className="display-area" id="chordVisualizer">
                <ChordVisualizer />
            </div>

            <div id="activeSectionLabel" class="active-section-label" />

            <div style="margin-bottom: 1.5rem;">
                <button
                    id="editArrangementBtn"
                    class="primary-btn"
                    style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1rem;"
                    onClick={openEditor}
                >
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
        <div
            class={`panel dashboard-panel ${!enabled ? 'collapsed' : ''}`}
            id="panel-visualizer"
            data-id="visualizer"
        >
            <div class="panel-header">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <button
                        id="vizPowerBtn"
                        class={`power-btn ${enabled ? 'active' : ''}`}
                        aria-label="Toggle Visualizer"
                        onClick={handleToggle}
                    >
                        ⏻
                    </button>
                    <h2>Visualizer</h2>
                </div>
            </div>

            <div class="viz-graph-area">
                <div id="unifiedVizContainer" />
            </div>
        </div>
    );
}

function Sidebar({ grooveMobileTab }) {
    const activeMobileTab = grooveMobileTab === 'mobile' ? 'grooves' : grooveMobileTab;

    return (
        <div class="layout-column sidebar-column" id="col-sidebar">
            <InstrumentPanel
                id="panel-chords"
                module="chords"
                title="Chords"
                styles={CHORD_STYLES}
                isActiveMobile={activeMobileTab === 'chords'}
            />
            <GroovePanel isActiveMobile={activeMobileTab === 'grooves'} />
            <InstrumentPanel
                id="panel-bass"
                module="bass"
                title="Bass"
                styles={BASS_STYLES}
                isActiveMobile={activeMobileTab === 'bass'}
            />
            <InstrumentPanel
                id="panel-soloist"
                module="soloist"
                title="Soloist"
                styles={SOLOIST_STYLES}
                isActiveMobile={activeMobileTab === 'soloist'}
            />
            <InstrumentPanel
                id="panel-harmonies"
                module="harmony"
                title="Harmony"
                styles={HARMONY_STYLES}
                isActiveMobile={activeMobileTab === 'harmonies'}
            />
        </div>
    );
}

function MobileNavTab({ tab, activeTab, onSwitch }) {
    const isActive = activeTab === tab.id || (activeTab === 'mobile' && tab.id === 'grooves');
    const { enabled, tradeMode } = useEnsembleState((s) => ({
        enabled: s[tab.module].enabled,
        tradeMode: s[tab.module].tradeMode,
    }));

    const isWaiting = tab.module === 'soloist' && !enabled && tradeMode !== 'manual';
    const powerClass = `power-btn ${enabled ? 'active' : isWaiting ? 'waiting' : ''}`;

    return (
        <div
            class={`tab-item ${isActive ? 'active' : ''} tab-${tab.id}`}
            onClick={() => onSwitch(tab.id)}
        >
            <button class={`tab-btn ${isActive ? 'active' : ''}`}>{tab.label}</button>
            <button
                id={`${tab.module === 'chords' ? 'chord' : tab.module}PowerBtn`}
                class={powerClass}
                aria-label={`Toggle ${tab.label}`}
                onClick={(e) => {
                    e.stopPropagation();
                    togglePower(tab.module);
                }}
            >
                ⏻
            </button>
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
                { id: 'harmonies', label: 'Harmony', module: 'harmony' },
            ].map((tab) => (
                <MobileNavTab
                    key={tab.id}
                    tab={tab}
                    activeTab={activeTab}
                    onSwitch={switchMobileTab}
                />
            ))}
        </div>
    );
}
