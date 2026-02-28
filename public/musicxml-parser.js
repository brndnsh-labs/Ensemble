/**
 * MusicXML Parser for Ensemble
 */

import { getStepsPerMeasure } from './utils.js';

export function parseMusicXML(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');

    let divisions = 1; // Default to 1 if not found
    const divisionsNode = doc.querySelector('divisions');
    if (divisionsNode) {
        divisions = parseInt(divisionsNode.textContent, 10);
    }

    const measures = doc.querySelectorAll('measure');
    const sections = [];
    const leadSheetMelody = [];
    let currentGlobalStep = 0;
    let currentTimeSignature = '4/4';

    const currentSection = {
        id: `s${Date.now()}`,
        label: 'A',
        value: '',
        color: '#3b82f6',
        repeat: 1,
    };
    let currentChords = [];

    measures.forEach((measureNode, measureIndex) => {
        let measureStep = 0;
        const measureChords = [];

        // Check for time signature in attributes
        const timeNode = measureNode.querySelector('attributes > time');
        if (timeNode) {
            const beats = timeNode.querySelector('beats')?.textContent;
            const beatType = timeNode.querySelector('beat-type')?.textContent;
            if (beats && beatType) {
                currentTimeSignature = `${beats}/${beatType}`;
            }
        }

        // In Ensemble, standard is 16 steps per 4/4 measure (4 steps per beat)
        // 1 quarter note = 4 steps.
        // divisions = divisions per quarter note.
        // So steps = (duration / divisions) * 4
        const durationToSteps = (duration) => (duration / divisions) * 4;

        measureNode.childNodes.forEach((node) => {
            if (node.nodeName === 'harmony') {
                let root = '';
                let kind = '';
                let alter = '';

                const rootStepNode = node.querySelector('root-step');
                if (rootStepNode) {
                    root = rootStepNode.textContent;
                }

                const rootAlterNode = node.querySelector('root-alter');
                if (rootAlterNode) {
                    const alterVal = parseInt(rootAlterNode.textContent, 10);
                    if (alterVal === -1) {
                        alter = 'b';
                    }
                    if (alterVal === 1) {
                        alter = '#';
                    }
                }

                const kindNode = node.querySelector('kind');
                if (kindNode) {
                    const textAttr = kindNode.getAttribute('text');
                    if (textAttr) {
                        kind = textAttr;
                    } else {
                        // Fallback translation if 'text' attribute is missing
                        const kindText = kindNode.textContent;
                        if (kindText === 'major-seventh') {
                            kind = 'maj7';
                        } else if (kindText === 'minor-seventh') {
                            kind = 'm7';
                        } else if (kindText === 'dominant') {
                            kind = '7';
                        } else if (kindText === 'half-diminished') {
                            kind = 'm7b5';
                        } else if (kindText === 'diminished') {
                            kind = 'dim';
                        } else if (kindText === 'minor') {
                            kind = 'm';
                        } else if (kindText === 'major') {
                            kind = '';
                        }
                    }
                }

                // Clean up format to match Ensemble expectations if needed
                let chordString = `${root}${alter}${kind}`;
                // Map common MusicXML text to Ensemble formats
                chordString = chordString
                    .replace(/min7/g, 'm7')
                    .replace(/maj7/g, 'maj7')
                    .replace(/min/g, 'm')
                    .replace(/mi7/g, 'm7')
                    .replace(/ma7/g, 'maj7')
                    .replace(/mi/g, 'm');

                measureChords.push(chordString);
            }

            if (node.nodeName === 'note') {
                const isRest = node.querySelector('rest') !== null;
                const durationNode = node.querySelector('duration');
                let duration = 0;
                if (durationNode) {
                    duration = parseInt(durationNode.textContent, 10);
                }
                const steps = durationToSteps(duration);

                if (!isRest) {
                    const pitchNode = node.querySelector('pitch');
                    if (pitchNode) {
                        const stepNode = pitchNode.querySelector('step');
                        const octaveNode = pitchNode.querySelector('octave');
                        const alterNode = pitchNode.querySelector('alter');

                        const noteStep = stepNode ? stepNode.textContent : 'C';
                        const octave = octaveNode ? parseInt(octaveNode.textContent, 10) : 4;
                        let noteAlter = '';
                        if (alterNode) {
                            const alterVal = parseInt(alterNode.textContent, 10);
                            if (alterVal === -1) {
                                noteAlter = 'b';
                            }
                            if (alterVal === 1) {
                                noteAlter = '#';
                            }
                        }

                        // Translate pitch to MIDI note
                        const _noteString = `${noteStep}${noteAlter}${octave}`;

                        // Very simple mapping for parsing. Let's write a simple midi converter
                        const noteMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
                        let midi = noteMap[noteStep] + (octave + 1) * 12;
                        if (noteAlter === 'b') {
                            midi -= 1;
                        }
                        if (noteAlter === '#') {
                            midi += 1;
                        }

                        leadSheetMelody.push({
                            midi,
                            globalStep: currentGlobalStep + measureStep,
                            durationSteps: steps,
                        });
                    }
                }

                measureStep += steps;
            }

            // Backup handle 'forward' nodes (multiple voices)
            if (node.nodeName === 'forward') {
                const durationNode = node.querySelector('duration');
                if (durationNode) {
                    measureStep += durationToSteps(parseInt(durationNode.textContent, 10));
                }
            }
            // Backup handle 'backup' nodes
            if (node.nodeName === 'backup') {
                const durationNode = node.querySelector('duration');
                if (durationNode) {
                    measureStep -= durationToSteps(parseInt(durationNode.textContent, 10));
                }
            }
        });

        if (measureChords.length === 0 && currentChords.length === 0) {
            // If no chords in measure and we haven't started, default to % or empty
            currentChords.push('%');
        } else if (measureChords.length > 0) {
            currentChords.push(measureChords.join(' '));
        } else {
            currentChords.push('%');
        }

        // Break into sections of 8 measures (or just 1 big section if simple)
        if (currentChords.length === 8 || measureIndex === measures.length - 1) {
            currentSection.value = currentChords.join(' | ');
            sections.push({ ...currentSection });

            // Reset for next section
            currentSection.id = `s${Date.now()}${measureIndex}`;
            currentSection.label = String.fromCharCode(currentSection.label.charCodeAt(0) + 1);
            if (currentSection.label > 'Z') {
                currentSection.label = 'A';
            }
            currentChords = [];
        }

        currentGlobalStep += getStepsPerMeasure(currentTimeSignature);
    });

    return {
        sections,
        leadSheetMelody,
    };
}
