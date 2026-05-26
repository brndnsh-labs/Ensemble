import { Fragment } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { onSectionUpdate } from '../arranger-controller.js';
import type { Section } from '../state/arranger.js';
import { useEnsembleState } from '../ui-bridge.js';
import { SectionCard } from './SectionCard.jsx';

export function Arranger() {
    const { sections, lastInteractedSectionId } = useEnsembleState((s) => ({
        sections: s.arranger.sections,
        lastInteractedSectionId: s.arranger.lastInteractedSectionId,
    }));

    const sectionRefs = useRef<Record<string, any>>({});

    useEffect(() => {
        if (lastInteractedSectionId) {
            const handle = sectionRefs.current[lastInteractedSectionId];
            if (handle) {
                // Delay slightly to allow modal transition
                setTimeout(() => {
                    if (handle.scrollIntoView) {
                        handle.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    if (handle.focusInput) {
                        handle.focusInput();
                    }
                }, 150);
            }
        }
    }, [lastInteractedSectionId]);

    useEffect(() => {
        const handleReorder = (e: Event) => {
            const { draggedId, targetId, position } = (e as CustomEvent).detail as {
                draggedId: string;
                targetId: string;
                position?: 'before' | 'after';
            };
            const draggedIdx = sections.findIndex((sec: Section) => sec.id === draggedId);
            const targetIdx = sections.findIndex((sec: Section) => sec.id === targetId);

            if (draggedIdx === -1 || targetIdx === -1) {
                return;
            }

            // Compute the insertion index in the post-removal list so the
            // dragged section lands above or below the target as indicated.
            const newOrder = sections.map((sec: Section) => sec.id);
            newOrder.splice(draggedIdx, 1);
            const targetIdxAfterRemove = targetIdx > draggedIdx ? targetIdx - 1 : targetIdx;
            const insertIdx =
                position === 'after' ? targetIdxAfterRemove + 1 : targetIdxAfterRemove;
            newOrder.splice(insertIdx, 0, draggedId);

            onSectionUpdate(null as any, 'reorder', newOrder);
        };

        window.addEventListener('reorder-sections', handleReorder);
        return () => window.removeEventListener('reorder-sections', handleReorder);
    }, [sections]);

    if (!sections) {
        return null;
    }

    const groupedSections: Section[][] = [];
    sections.forEach((section: Section) => {
        if (section.seamless && groupedSections.length > 0) {
            groupedSections[groupedSections.length - 1].push(section);
        } else {
            groupedSections.push([section]);
        }
    });

    return (
        <Fragment>
            {groupedSections.map((group) => {
                if (group.length === 1) {
                    const section = group[0];
                    const index = sections.findIndex((s: Section) => s.id === section.id);
                    return (
                        <SectionCard
                            key={section.id}
                            ref={(el: any) => (sectionRefs.current[section.id] = el)}
                            section={section}
                            index={index}
                            totalSections={sections.length}
                        />
                    );
                }

                return (
                    <div className="section-group" key={`group-${group[0].id}`}>
                        {group.map((section) => {
                            const index = sections.findIndex((s: Section) => s.id === section.id);
                            return (
                                <SectionCard
                                    key={section.id}
                                    ref={(el: any) => (sectionRefs.current[section.id] = el)}
                                    section={section}
                                    index={index}
                                    totalSections={sections.length}
                                />
                            );
                        })}
                    </div>
                );
            })}
        </Fragment>
    );
}
