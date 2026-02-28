/**
 * MusicXML Parser for Ensemble
 */

import { Harmonizer } from './melody-harmonizer.js';
import { getStepsPerMeasure } from './utils.js';

export function parseMusicXML(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');

    let divisions = 1; // Default to 1 if not found
    const divisionsNode = doc.querySelector('divisions');
    if (divisionsNode) {
        divisions = parseInt(divisionsNode.textContent, 10);
    }

    // Extract Key Signature
    let xmlKey = 'C';
    const fifthsNode = doc.querySelector('fifths');
    if (fifthsNode) {
        const fifths = parseInt(fifthsNode.textContent, 10);
        const keys = {
            0: 'C',
            1: 'G',
            2: 'D',
            3: 'A',
            4: 'E',
            5: 'B',
            6: 'F#',
            7: 'C#',
            '-1': 'F',
            '-2': 'Bb',
            '-3': 'Eb',
            '-4': 'Ab',
            '-5': 'Db',
            '-6': 'Gb',
            '-7': 'Cb',
        };
        xmlKey = keys[fifths] || 'C';
    }

    const measures = doc.querySelectorAll('measure');
    const sections = [];
    const leadSheetMelody = [];
    let _currentTimeSignature = '4/4';
    let hasChords = false;

    // First, find which measure is labeled "1" (Step 0)
    let firstMeasureIndex = -1;
    for (let i = 0; i < measures.length; i++) {
        if (measures[i].getAttribute('number') === '1') {
            firstMeasureIndex = i;
            break;
        }
    }

    // If no measure "1" found, assume measure 0 is step 0
    if (firstMeasureIndex === -1) {
        firstMeasureIndex = 0;
    }

    // Calculate the global step for each measure relative to firstMeasureIndex
    // We need to account for time signature changes if they occur before Step 0
    const measureStepOffsets = new Array(measures.length).fill(0);
    let runningStep = 0;

    // Scan for time signature changes to accurately map steps
    let scanTS = '4/4';
    measures.forEach((m, i) => {
        const timeNode = m.querySelector('attributes > time');
        if (timeNode) {
            const beats = timeNode.querySelector('beats')?.textContent;
            const beatType = timeNode.querySelector('beat-type')?.textContent;
            if (beats && beatType) {
                scanTS = `${beats}/${beatType}`;
            }
        }
        measureStepOffsets[i] = runningStep;
        runningStep += getStepsPerMeasure(scanTS);
    });

    const stepZeroOffset = measureStepOffsets[firstMeasureIndex];

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
        const currentGlobalStep = measureStepOffsets[measureIndex] - stepZeroOffset;
        const measureChords = [];

        // Check for time signature in attributes
        const timeNode = measureNode.querySelector('attributes > time');
        if (timeNode) {
            const beats = timeNode.querySelector('beats')?.textContent;
            const beatType = timeNode.querySelector('beat-type')?.textContent;
            if (beats && beatType) {
                _currentTimeSignature = `${beats}/${beatType}`;
            }
        }

        // In Ensemble, standard is 16 steps per 4/4 measure (4 steps per beat)
        // 1 quarter note = 4 steps.
        // divisions = divisions per quarter note.
        // So steps = (duration / divisions) * 4
        const durationToSteps = (duration) => Math.round((duration / divisions) * 4);

        measureNode.childNodes.forEach((node) => {
            if (node.nodeName === 'harmony') {
                hasChords = true;
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
                            globalStep: Math.round(currentGlobalStep + measureStep),
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
            // But only if we are at or after Step 0
            if (currentGlobalStep >= 0) {
                currentChords.push('%');
            }
        } else if (measureChords.length > 0) {
            currentChords.push(measureChords.join(' '));
        } else {
            // After start, empty measure is %
            if (currentGlobalStep >= 0) {
                currentChords.push('%');
            }
        }

        // Break into sections of 8 measures (or just 1 big section if simple)
        // Only start creating sections from Step 0 onwards
        if (currentGlobalStep >= 0) {
            if (currentChords.length === 8 || measureIndex === measures.length - 1) {
                if (currentChords.length > 0) {
                    currentSection.value = currentChords.join(' | ');
                    sections.push({ ...currentSection });

                    // Reset for next section
                    currentSection.id = `s${Date.now()}${measureIndex}`;
                    currentSection.label = String.fromCharCode(
                        currentSection.label.charCodeAt(0) + 1,
                    );
                    if (currentSection.label > 'Z') {
                        currentSection.label = 'A';
                    }
                    currentChords = [];
                }
            }
        }
    });

    return {
        sections,
        leadSheetMelody,
        hasChords,
        xmlKey,
    };
}

/**
 * Re-harmonizes a melody by analyzing the notes and suggesting chords.
 * @param {Array} leadSheetMelody - Array of melody notes.
 * @param {string} key - Current song key.
 * @param {number} totalSteps - Total steps in the arrangement.
 * @returns {Array} Updated sections array.
 */
export function reharmonizeMelody(leadSheetMelody, key, totalSteps) {
    if (!leadSheetMelody || leadSheetMelody.length === 0) {
        return null;
    }

    const harmonizer = new Harmonizer();
    // Convert leadSheetMelody to the format expected by the harmonizer (per beat)
    // Harmonizer expects an array where each index is a beat, containing {midi, energy}
    // We assume 4 steps per beat.
    const numBeats = Math.ceil(totalSteps / 4);
    const melodyByBeat = new Array(numBeats).fill(null).map(() => ({ midi: 0, energy: 0 }));

    leadSheetMelody.forEach((n) => {
        const beatIdx = Math.floor(n.globalStep / 4);
        if (beatIdx < numBeats) {
            // Take the first note or highest midi for the beat
            if (n.midi > melodyByBeat[beatIdx].midi) {
                melodyByBeat[beatIdx] = {
                    midi: n.midi,
                    energy: 1.0,
                };
            }
        }
    });

    // Harmonizer.generateProgression expects melodyLine as array of {midi, energy}
    const progressionStr = harmonizer.generateProgression(melodyByBeat, key, 0.5);

    // Split the progression into measures
    const measures = progressionStr.split(' | ');
    const sections = [];
    const sectionSize = 8;

    for (let i = 0; i < measures.length; i += sectionSize) {
        const sectionMeasures = measures.slice(i, i + sectionSize);
        sections.push({
            id: `reharm-${Date.now()}-${i}`,
            label: String.fromCharCode(65 + Math.floor(i / sectionSize)), // A, B, C...
            value: sectionMeasures.join(' | '),
            color: '#3b82f6',
            repeat: 1,
        });
    }

    return sections;
}
