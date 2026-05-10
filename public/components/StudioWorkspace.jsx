import { InstrumentRail } from './InstrumentRail.jsx';

export function StudioWorkspace() {
    return (
        <section
            class="workspace-view workspace-view--studio"
            data-workspace="studio"
            aria-labelledby="studioWorkspaceTitle"
        >
            <InstrumentRail />
        </section>
    );
}
