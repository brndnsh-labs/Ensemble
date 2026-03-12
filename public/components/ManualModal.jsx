import { Fragment, h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { injectManualMetadata } from '../utils/manual-metadata.js';

/**
 * A tiny, zero-dependency Markdown-to-HTML converter.
 * Handles just enough for the Ensemble manual.
 */
function simpleMarkdown(text) {
    if (!text) {
        return '';
    }

    return (
        text
            // Headers
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Inline Code
            .replace(/`(.*?)`/g, '<code>$1</code>')
            // Links
            .replace(
                /\[(.*?)\]\((.*?)\)/g,
                '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
            )
            // Horizontal Rule
            .replace(/^---$/gm, '<hr />')
            // Lists (Simple unordered)
            .replace(/^- (.*$)/gm, '<li>$1</li>')
            // Wrap <li> in <ul> (This is a simplified approach)
            .replace(/(<li>.*<\/li>)/gms, (match) => `<ul>${match}</ul>`)
            // Paragraphs (Very simple: double newline)
            // But avoid double wrapping headers/lists
            .split(/\n\n+/)
            .map((p) => {
                if (
                    p.trim().startsWith('<h') ||
                    p.trim().startsWith('<ul') ||
                    p.trim().startsWith('<hr') ||
                    p.trim().startsWith('<div')
                ) {
                    return p;
                }
                return `<p>${p.trim().replace(/\n/g, '<br>')}</p>`;
            })
            .join('')
    );
}

export function ManualModal() {
    const [content, setContent] = useState('Loading manual...');

    useEffect(() => {
        const loadManual = async () => {
            try {
                const response = await fetch('MANUAL.md');
                const rawText = await response.text();
                const processedText = injectManualMetadata(rawText);
                setContent(simpleMarkdown(processedText));
            } catch (error) {
                console.error('Failed to load manual:', error);
                setContent('<p class="error">Error loading manual. Please try again later.</p>');
            }
        };

        loadManual();
    }, []);

    const close = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'manual', open: false });
    };

    return (
        <div class="modal-overlay active" onClick={close}>
            <div
                class="settings-content"
                onClick={(e) => e.stopPropagation()}
                style="max-width: 900px; height: 90vh;"
            >
                <div class="modal-header-shared">
                    <h2>Ensemble Manual</h2>
                    <button class="close-btn" onClick={close} aria-label="Close">
                        ×
                    </button>
                </div>

                <div class="manual-content" dangerouslySetInnerHTML={{ __html: content }} />

                <div class="modal-footer" style="margin-top: 2rem;">
                    <div class="footer-primary-actions">
                        <button class="footer-main-btn active" onClick={close}>
                            Back to Ensemble
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
