import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { StyleObject } from '../ui-types.js';

interface ToolbarPopoverRenderContext {
    closePopover: () => void;
    isOpen: boolean;
}

interface ToolbarPopoverProps {
    buttonId?: string;
    panelId: string;
    triggerAriaLabel: string;
    panelLabel: string;
    triggerClassName?: string;
    panelClassName?: string;
    align?: 'start' | 'end';
    triggerContent: ComponentChildren;
    children: ComponentChildren | ((context: ToolbarPopoverRenderContext) => ComponentChildren);
}

export function ToolbarPopover({
    buttonId,
    panelId,
    triggerAriaLabel,
    panelLabel,
    triggerClassName = '',
    panelClassName = '',
    align = 'end',
    triggerContent,
    children,
}: ToolbarPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [panelStyle, setPanelStyle] = useState<StyleObject | undefined>(undefined);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    const closePopover = () => {
        setIsOpen(false);
    };

    const handleFocusExit = (event: FocusEvent) => {
        const relatedTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;

        if (
            relatedTarget &&
            (rootRef.current?.contains(relatedTarget) || panelRef.current?.contains(relatedTarget))
        ) {
            return;
        }

        closePopover();
    };

    useEffect(() => {
        if (panelRef.current && 'inert' in panelRef.current) {
            (panelRef.current as any).inert = !isOpen;
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target instanceof Node ? event.target : null;
            if (
                !target ||
                rootRef.current?.contains(target) ||
                panelRef.current?.contains(target)
            ) {
                return;
            }

            closePopover();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }

            closePopover();
            triggerRef.current?.focus();
        };

        window.addEventListener('pointerdown', handlePointerDown, true);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('pointerdown', handlePointerDown, true);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    useLayoutEffect(() => {
        if (!isOpen || typeof window === 'undefined') {
            setPanelStyle(undefined);
            return;
        }

        const updatePanelPosition = () => {
            const trigger = triggerRef.current;
            const panel = panelRef.current;
            if (!trigger || !panel) {
                return;
            }

            const triggerRect = trigger.getBoundingClientRect();
            const panelWidth = Math.min(
                Math.max(panel.offsetWidth || 232, 232),
                window.innerWidth - 24,
            );
            const panelHeight = panel.offsetHeight || 0;
            const gap = 8;
            const viewportPadding = 12;
            const spaceBelow = window.innerHeight - triggerRect.bottom - gap - viewportPadding;
            const spaceAbove = triggerRect.top - gap - viewportPadding;
            const shouldOpenUpward = panelHeight > spaceBelow && spaceAbove > spaceBelow;
            const maxHeight = Math.max(
                180,
                shouldOpenUpward ? spaceAbove : Math.max(spaceBelow, 180),
            );
            const left =
                align === 'start'
                    ? Math.min(
                          Math.max(viewportPadding, triggerRect.left),
                          window.innerWidth - panelWidth - viewportPadding,
                      )
                    : Math.min(
                          Math.max(viewportPadding, triggerRect.right - panelWidth),
                          window.innerWidth - panelWidth - viewportPadding,
                      );
            const top = shouldOpenUpward
                ? Math.max(
                      viewportPadding,
                      triggerRect.top - Math.min(panelHeight, maxHeight) - gap,
                  )
                : Math.min(
                      triggerRect.bottom + gap,
                      window.innerHeight - maxHeight - viewportPadding,
                  );

            setPanelStyle({
                position: 'fixed',
                top: `${top}px`,
                left: `${left}px`,
                right: 'auto',
                bottom: 'auto',
                width: `${panelWidth}px`,
                maxHeight: `${maxHeight}px`,
            });
        };

        updatePanelPosition();
        window.addEventListener('resize', updatePanelPosition);
        window.addEventListener('scroll', updatePanelPosition, true);
        return () => {
            window.removeEventListener('resize', updatePanelPosition);
            window.removeEventListener('scroll', updatePanelPosition, true);
        };
    }, [align, isOpen]);

    const panelContent = (
        <div
            ref={panelRef}
            id={panelId}
            class={[
                'workspace-toolbar-panel',
                'workspace-toolbar-panel--fixed',
                panelClassName,
                isOpen ? 'is-open' : '',
            ]
                .filter(Boolean)
                .join(' ')}
            role="dialog"
            aria-label={panelLabel}
            aria-hidden={!isOpen}
            style={panelStyle}
            onBlurCapture={handleFocusExit}
            onClick={(event) => event.stopPropagation()}
        >
            {typeof children === 'function' ? children({ closePopover, isOpen }) : children}
        </div>
    );

    return (
        <>
            <div
                ref={rootRef}
                class={`workspace-toolbar-popover${isOpen ? ' is-open' : ''}`}
                onBlurCapture={handleFocusExit}
            >
                <button
                    ref={triggerRef}
                    id={buttonId}
                    type="button"
                    class={[
                        'workspace-actions-trigger',
                        'workspace-toolbar-trigger',
                        triggerClassName,
                        isOpen ? 'is-open' : '',
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    aria-label={triggerAriaLabel}
                    aria-haspopup="dialog"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={(event) => {
                        event.stopPropagation();
                        setIsOpen((value) => !value);
                    }}
                >
                    {triggerContent}
                </button>
            </div>
            {typeof document !== 'undefined' && document.body
                ? createPortal(panelContent, document.body)
                : panelContent}
        </>
    );
}
