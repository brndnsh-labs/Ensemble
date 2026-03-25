import {
    BASS_STYLES,
    CHORD_STYLES,
    HARMONY_STYLES,
    SOLOIST_STYLES,
} from '../data/instrument-styles.js';
import { GroovePanel } from './GroovePanel.jsx';
import { InstrumentPanel } from './InstrumentPanel.jsx';

export function StudioWorkspace() {
    return (
        <section class="workspace-view workspace-view--studio" data-workspace="studio">
            <div class="workspace-columns">
                <div class="workspace-stack">
                    <div class="workspace-group-header">
                        <p class="workspace-kicker">Rhythm section</p>
                        <h2>Foundation</h2>
                    </div>

                    <GroovePanel
                        isActiveMobile={true}
                        showLaunchAction={false}
                        compactStudio={true}
                    />
                    <InstrumentPanel
                        id="panel-chords"
                        module="chords"
                        title="Chords"
                        styles={CHORD_STYLES}
                        isActiveMobile={true}
                        compactStudio={true}
                    />
                    <InstrumentPanel
                        id="panel-bass"
                        module="bass"
                        title="Bass"
                        styles={BASS_STYLES}
                        isActiveMobile={true}
                        compactStudio={true}
                    />
                </div>

                <div class="workspace-stack">
                    <div class="workspace-group-header">
                        <p class="workspace-kicker">Melodic layers</p>
                        <h2>Lead and texture</h2>
                    </div>

                    <InstrumentPanel
                        id="panel-soloist"
                        module="soloist"
                        title="Soloist"
                        styles={SOLOIST_STYLES}
                        isActiveMobile={true}
                        showPerformanceAction={false}
                        compactStudio={true}
                    />
                    <InstrumentPanel
                        id="panel-harmonies"
                        module="harmony"
                        title="Harmony"
                        styles={HARMONY_STYLES}
                        isActiveMobile={true}
                        compactStudio={true}
                    />
                </div>
            </div>
        </section>
    );
}
