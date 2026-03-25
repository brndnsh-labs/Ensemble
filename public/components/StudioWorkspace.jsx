import { GroovePanel } from './GroovePanel.jsx';
import { InstrumentPanel } from './InstrumentPanel.jsx';

export function StudioWorkspace() {
    return (
        <section
            class="workspace-view workspace-view--studio"
            data-workspace="studio"
            aria-labelledby="studioWorkspaceTitle"
        >
            <div class="workspace-columns">
                <div class="workspace-stack">
                    <div class="workspace-group-header">
                        <p class="workspace-kicker">Rhythm section</p>
                        <h2 id="studioWorkspaceTitle">Foundation</h2>
                    </div>

                    <GroovePanel isActiveMobile={true} showLaunchAction={false} />
                    <InstrumentPanel
                        id="panel-chords"
                        module="chords"
                        title="Chords"
                        isActiveMobile={true}
                        showPerformanceAction={false}
                    />
                    <InstrumentPanel
                        id="panel-bass"
                        module="bass"
                        title="Bass"
                        isActiveMobile={true}
                        showPerformanceAction={false}
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
                        isActiveMobile={true}
                        showPerformanceAction={false}
                    />
                    <InstrumentPanel
                        id="panel-harmonies"
                        module="harmony"
                        title="Harmony"
                        isActiveMobile={true}
                        showPerformanceAction={false}
                    />
                </div>
            </div>
        </section>
    );
}
