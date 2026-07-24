import { useEffect, useRef, useState } from 'preact/hooks';
import { escapeHTML } from '../sanitize.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { injectManualMetadata } from '../utils/manual-metadata.js';
import { useModalA11y } from './use-modal-a11y.js';

/**
 * A tiny, zero-dependency Markdown-to-HTML converter.
 * Handles just enough for the Ensemble manual.
 */
function simpleMarkdown(text: string): string {
    if (!text) {
        return '';
    }

    // Apply full HTML escaping to mitigate XSS (attribute injection, raw tags, entity evasion).
    // The simpleMarkdown parser handles headers, bold, code, lists, and links, none
    // of which require raw HTML characters (<, >, &, ", ', `).
    const sanitizedText = escapeHTML(text);

    return (
        sanitizedText
            // Headers
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Inline Code
            .replace(/`(.*?)`/g, '<code>$1</code>')
            // Links
            .replace(/\[(.*?)\]\((.*?)\)/g, (_match, linkText, url) => {
                // Prevent javascript: and data: URIs in links.
                // Strip control characters and spaces before scheme validation to prevent evasion.
                // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional removal of control chars for XSS prevention
                const cleanUrl = url.replace(/[\x00-\x20]+/g, '').toLowerCase();
                if (
                    cleanUrl.startsWith('javascript:') ||
                    cleanUrl.startsWith('data:') ||
                    cleanUrl.startsWith('vbscript:')
                ) {
                    return linkText;
                }
                return `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
            })
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
                const markdownHtml = simpleMarkdown(rawText);

                // 🛡️ Sentinel: Security Fix - XSS Prevention via Injection Ordering
                // By processing the Markdown first (`simpleMarkdown`) and then injecting metadata
                // (`injectManualMetadata`), we prevent malicious payloads within the metadata
                // from being evaluated as Markdown syntax (e.g. converting injected text into links or headers).
                // The `simpleMarkdown` function has its own `escapeHTML` logic for raw text, ensuring
                // the base Markdown is safe before we inject the dynamic UI tables.
                setContent(injectManualMetadata(markdownHtml));
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

    const overlayRef = useRef<HTMLDivElement | null>(null);
    useModalA11y(overlayRef, true, close, 'Ensemble manual');

    return (
        <div class="modal-overlay active" ref={overlayRef} onClick={close}>
            <div class="settings-content manual-modal" onClick={(e) => e.stopPropagation()}>
                <div class="modal-header-shared">
                    <h2>Ensemble Manual</h2>
                    <button class="close-btn" onClick={close} aria-label="Close">
                        ×
                    </button>
                </div>

                <div class="manual-content" dangerouslySetInnerHTML={{ __html: content }} />

                <div class="modal-footer manual-modal-footer">
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
