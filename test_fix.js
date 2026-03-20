import { binarySearchMap } from './public/utils.js';

const stepMap = [
    { start: 0, end: 16, chord: 'C' },
    { start: 16, end: 32, chord: 'F' },
];

const match = binarySearchMap(stepMap, 16);
console.log(match);
