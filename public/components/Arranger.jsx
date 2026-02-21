import { Fragment, h } from 'preact';
import React from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { onSectionUpdate } from '../arranger-controller.js';
import { useEnsembleState } from '../ui-bridge.js';
import { SectionCard } from './SectionCard.jsx';

export function Arranger() {
    const { sections, lastInteractedSectionId } = useEnsembleState((s) => ({
        sections: s.arranger.sections,
        lastInteractedSectionId: s.arranger.lastInteractedSectionId,
    }));

    const sectionRefs = useRef({});

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
        const handleReorder = (e) => {
            const { draggedId, targetId } = e.detail;
            const draggedIdx = sections.findIndex((sec) => sec.id === draggedId);
            const targetIdx = sections.findIndex((sec) => sec.id === targetId);

            if (draggedIdx === -1 || targetIdx === -1) {
                return;
            }

            const newOrder = sections.map((sec) => sec.id);
            newOrder.splice(draggedIdx, 1);
            newOrder.splice(targetIdx, 0, draggedId);

            onSectionUpdate(null, 'reorder', newOrder);
        };

        window.addEventListener('reorder-sections', handleReorder);
        return () => window.removeEventListener('reorder-sections', handleReorder);
    }, [sections]);

    if (!sections) {
        return null;
    }

    const groupedSections = [];
    sections.forEach((section) => {
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
                    const index = sections.findIndex((s) => s.id === section.id);
                    return (
                        <SectionCard
                            key={section.id}
                            ref={(el) => (sectionRefs.current[section.id] = el)}
                            section={section}
                            index={index}
                            totalSections={sections.length}
                        />
                    );
                }

                return (
                    <div className="section-group" key={`group-${group[0].id}`}>
                        {group.map((section) => {
                            const index = sections.findIndex((s) => s.id === section.id);
                            return (
                                <SectionCard
                                    key={section.id}
                                    ref={(el) => (sectionRefs.current[section.id] = el)}
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
