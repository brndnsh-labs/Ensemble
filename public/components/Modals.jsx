import { Fragment, h } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { useEnsembleState } from '../ui-bridge.js';

// Lazy load heavy components to reduce initial bundle size
const Settings = lazy(() => import('./Settings.jsx').then((m) => ({ default: m.Settings })));
const EditorModal = lazy(() =>
    import('./EditorModal.jsx').then((m) => ({ default: m.EditorModal })),
);
const GenerateSongModal = lazy(() =>
    import('./GenerateSongModal.jsx').then((m) => ({ default: m.GenerateSongModal })),
);
const ExportModal = lazy(() =>
    import('./ExportModal.jsx').then((m) => ({ default: m.ExportModal })),
);
const TemplatesModal = lazy(() =>
    import('./TemplatesModal.jsx').then((m) => ({ default: m.TemplatesModal })),
);
const AnalyzerModal = lazy(() =>
    import('./AnalyzerModal.jsx').then((m) => ({ default: m.AnalyzerModal })),
);

/**
 * AnimatedModalWrapper handles the entrance and exit lifecycle for modals.
 * It ensures the component stays in the DOM long enough for exit animations to play.
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is globally open
 * @param {Component} props.component - The modal component to render
 */
function AnimatedModalWrapper({ isOpen, component: Component }) {
    const [shouldRender, setShouldRender] = useState(isOpen);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
            setIsClosing(false);
        } else if (shouldRender) {
            setIsClosing(true);
            const timer = setTimeout(() => {
                setShouldRender(false);
                setIsClosing(false);
            }, 300); // Matches --anim-normal duration + buffer
            return () => clearTimeout(timer);
        }
    }, [isOpen, shouldRender]);

    if (!shouldRender) {
        return null;
    }

    return (
        <div class={isClosing ? 'closing' : ''}>
            <Component />
        </div>
    );
}

export function Modals() {
    // Get modal visibility state from global store
    const { settingsOpen, editorOpen, generateSongOpen, exportOpen, templatesOpen, analyzerOpen } =
        useEnsembleState((s) => ({
            settingsOpen: s.playback.modals.settings,
            editorOpen: s.playback.modals.editor,
            generateSongOpen: s.playback.modals.generateSong,
            exportOpen: s.playback.modals.export,
            templatesOpen: s.playback.modals.templates,
            analyzerOpen: s.playback.modals.analyzer,
        }));

    useEffect(() => {
        const anyOpen =
            settingsOpen ||
            editorOpen ||
            generateSongOpen ||
            exportOpen ||
            templatesOpen ||
            analyzerOpen;
        if (anyOpen) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
    }, [settingsOpen, editorOpen, generateSongOpen, exportOpen, templatesOpen, analyzerOpen]);

    return (
        <Fragment>
            <Suspense fallback={null}>
                <AnimatedModalWrapper isOpen={settingsOpen} component={Settings} />
                <AnimatedModalWrapper isOpen={editorOpen} component={EditorModal} />
                <AnimatedModalWrapper isOpen={generateSongOpen} component={GenerateSongModal} />
                <AnimatedModalWrapper isOpen={exportOpen} component={ExportModal} />
                <AnimatedModalWrapper isOpen={templatesOpen} component={TemplatesModal} />
                <AnimatedModalWrapper isOpen={analyzerOpen} component={AnalyzerModal} />
            </Suspense>
        </Fragment>
    );
}
