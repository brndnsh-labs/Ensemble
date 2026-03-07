import fs from 'fs';

const file = 'public/soloist-config.js';
let content = fs.readFileSync(file, 'utf8');

// Helper to inject properties into an object definition
function injectProperties(genre, props) {
    const regex = new RegExp(`(${genre}:\\s*{[\\s\\S]*?)(},|})`);
    content = content.replace(regex, `$1${props}$2`);
}

// Probability matrix and contour skeletons
const scalarProps = `
        rhythmicDensity: 0.5,
        syncopationLikelihood: 0.2,
        targetAnchoring: 0.8,
        chromaticism: 0.1,
        contourSkeletons: [
            [{ interval: 1, durationSteps: 2 }, { interval: 2, durationSteps: 2 }, { interval: 0, durationSteps: 4 }],
            [{ interval: 2, durationSteps: 4 }, { interval: -1, durationSteps: 2 }, { interval: 1, durationSteps: 2 }],
            [{ interval: -1, durationSteps: 2 }, { interval: -2, durationSteps: 2 }, { interval: 0, durationSteps: 4 }]
        ],
`;

const shredProps = `
        rhythmicDensity: 0.9,
        syncopationLikelihood: 0.4,
        targetAnchoring: 0.4,
        chromaticism: 0.5,
        contourSkeletons: [
            [{ interval: 1, durationSteps: 1 }, { interval: 2, durationSteps: 1 }, { interval: 3, durationSteps: 1 }, { interval: 4, durationSteps: 1 }],
            [{ interval: -1, durationSteps: 1 }, { interval: 1, durationSteps: 1 }, { interval: -2, durationSteps: 1 }, { interval: 0, durationSteps: 1 }],
            [{ interval: 2, durationSteps: 2 }, { interval: 4, durationSteps: 2 }, { interval: 6, durationSteps: 2 }, { interval: 7, durationSteps: 2 }]
        ],
`;

const bluesProps = `
        rhythmicDensity: 0.6,
        syncopationLikelihood: 0.8,
        targetAnchoring: 0.9,
        chromaticism: 0.6,
        contourSkeletons: [
            [{ interval: 3, durationSteps: 2 }, { interval: 4, durationSteps: 2 }, { interval: 0, durationSteps: 4 }],
            [{ interval: 0, durationSteps: 2 }, { interval: -2, durationSteps: 2 }, { interval: -3, durationSteps: 4 }],
            [{ interval: 5, durationSteps: 2 }, { interval: 6, durationSteps: 1 }, { interval: 7, durationSteps: 5 }]
        ],
`;

const neoProps = `
        rhythmicDensity: 0.5,
        syncopationLikelihood: 0.9,
        targetAnchoring: 0.6,
        chromaticism: 0.4,
        contourSkeletons: [
            [{ interval: 2, durationSteps: 3 }, { interval: 4, durationSteps: 1 }, { interval: 6, durationSteps: 4 }],
            [{ interval: 1, durationSteps: 2 }, { interval: 3, durationSteps: 4 }, { interval: 0, durationSteps: 2 }],
            [{ interval: 4, durationSteps: 4 }, { interval: 2, durationSteps: 2 }, { interval: -1, durationSteps: 2 }]
        ],
`;

const funkProps = `
        rhythmicDensity: 0.8,
        syncopationLikelihood: 0.9,
        targetAnchoring: 0.7,
        chromaticism: 0.3,
        contourSkeletons: [
            [{ interval: 0, durationSteps: 1 }, { interval: 0, durationSteps: 1 }, { interval: 2, durationSteps: 2 }],
            [{ interval: 3, durationSteps: 1 }, { interval: 0, durationSteps: 1 }, { interval: -2, durationSteps: 2 }],
            [{ interval: 2, durationSteps: 2 }, { interval: 1, durationSteps: 1 }, { interval: 0, durationSteps: 1 }]
        ],
`;

const hiphopProps = `
        rhythmicDensity: 0.6,
        syncopationLikelihood: 0.7,
        targetAnchoring: 0.8,
        chromaticism: 0.2,
        contourSkeletons: [
            [{ interval: 0, durationSteps: 2 }, { interval: 2, durationSteps: 2 }, { interval: 0, durationSteps: 4 }],
            [{ interval: 2, durationSteps: 4 }, { interval: 1, durationSteps: 2 }, { interval: 0, durationSteps: 2 }],
            [{ interval: -1, durationSteps: 2 }, { interval: 0, durationSteps: 6 }]
        ],
`;

const minimalProps = `
        rhythmicDensity: 0.3,
        syncopationLikelihood: 0.3,
        targetAnchoring: 0.95,
        chromaticism: 0.1,
        contourSkeletons: [
            [{ interval: 0, durationSteps: 8 }],
            [{ interval: 2, durationSteps: 4 }, { interval: 0, durationSteps: 4 }],
            [{ interval: -1, durationSteps: 4 }, { interval: 0, durationSteps: 4 }]
        ],
`;

const birdProps = `
        rhythmicDensity: 0.95,
        syncopationLikelihood: 0.7,
        targetAnchoring: 0.3,
        chromaticism: 0.9,
        contourSkeletons: [
            [{ interval: 1, durationSteps: 2 }, { interval: 3, durationSteps: 2 }, { interval: 5, durationSteps: 2 }, { interval: 7, durationSteps: 2 }],
            [{ interval: 2, durationSteps: 1 }, { interval: 1, durationSteps: 1 }, { interval: 0, durationSteps: 1 }, { interval: -1, durationSteps: 1 }],
            [{ interval: -2, durationSteps: 2 }, { interval: 0, durationSteps: 2 }, { interval: 2, durationSteps: 2 }, { interval: 4, durationSteps: 2 }]
        ],
`;

const discoProps = `
        rhythmicDensity: 0.7,
        syncopationLikelihood: 0.6,
        targetAnchoring: 0.8,
        chromaticism: 0.2,
        contourSkeletons: [
            [{ interval: 0, durationSteps: 2 }, { interval: 2, durationSteps: 2 }, { interval: 4, durationSteps: 4 }],
            [{ interval: 2, durationSteps: 2 }, { interval: 4, durationSteps: 2 }, { interval: 2, durationSteps: 4 }],
            [{ interval: 4, durationSteps: 4 }, { interval: 2, durationSteps: 2 }, { interval: 0, durationSteps: 2 }]
        ],
`;

const bossaProps = `
        rhythmicDensity: 0.6,
        syncopationLikelihood: 0.8,
        targetAnchoring: 0.7,
        chromaticism: 0.5,
        contourSkeletons: [
            [{ interval: 2, durationSteps: 3 }, { interval: 0, durationSteps: 3 }, { interval: -1, durationSteps: 2 }],
            [{ interval: 1, durationSteps: 2 }, { interval: 2, durationSteps: 2 }, { interval: 4, durationSteps: 4 }],
            [{ interval: 4, durationSteps: 4 }, { interval: 2, durationSteps: 2 }, { interval: 1, durationSteps: 2 }]
        ],
`;

const countryProps = `
        rhythmicDensity: 0.7,
        syncopationLikelihood: 0.4,
        targetAnchoring: 0.9,
        chromaticism: 0.3,
        contourSkeletons: [
            [{ interval: 0, durationSteps: 2 }, { interval: 1, durationSteps: 2 }, { interval: 2, durationSteps: 4 }],
            [{ interval: 2, durationSteps: 2 }, { interval: -1, durationSteps: 2 }, { interval: 0, durationSteps: 4 }],
            [{ interval: -2, durationSteps: 2 }, { interval: -1, durationSteps: 2 }, { interval: 0, durationSteps: 4 }]
        ],
`;

const metalProps = `
        rhythmicDensity: 0.9,
        syncopationLikelihood: 0.3,
        targetAnchoring: 0.5,
        chromaticism: 0.6,
        contourSkeletons: [
            [{ interval: 0, durationSteps: 1 }, { interval: 1, durationSteps: 1 }, { interval: 2, durationSteps: 1 }, { interval: 3, durationSteps: 1 }],
            [{ interval: 4, durationSteps: 2 }, { interval: 3, durationSteps: 2 }, { interval: 2, durationSteps: 2 }, { interval: 0, durationSteps: 2 }],
            [{ interval: 0, durationSteps: 2 }, { interval: -1, durationSteps: 2 }, { interval: -2, durationSteps: 4 }]
        ],
`;

const reggaeProps = `
        rhythmicDensity: 0.5,
        syncopationLikelihood: 0.9,
        targetAnchoring: 0.8,
        chromaticism: 0.2,
        contourSkeletons: [
            [{ interval: 0, durationSteps: 3 }, { interval: 2, durationSteps: 1 }, { interval: 0, durationSteps: 4 }],
            [{ interval: 2, durationSteps: 2 }, { interval: 4, durationSteps: 2 }, { interval: 2, durationSteps: 4 }],
            [{ interval: 4, durationSteps: 4 }, { interval: 2, durationSteps: 2 }, { interval: 0, durationSteps: 2 }]
        ],
`;

const acousticProps = `
        rhythmicDensity: 0.6,
        syncopationLikelihood: 0.4,
        targetAnchoring: 0.8,
        chromaticism: 0.2,
        contourSkeletons: [
            [{ interval: 0, durationSteps: 4 }, { interval: 1, durationSteps: 2 }, { interval: 2, durationSteps: 2 }],
            [{ interval: 2, durationSteps: 4 }, { interval: 0, durationSteps: 4 }],
            [{ interval: -1, durationSteps: 2 }, { interval: 0, durationSteps: 6 }]
        ],
`;

const skaProps = `
        rhythmicDensity: 0.8,
        syncopationLikelihood: 0.8,
        targetAnchoring: 0.7,
        chromaticism: 0.4,
        contourSkeletons: [
            [{ interval: 0, durationSteps: 2 }, { interval: 2, durationSteps: 2 }, { interval: 4, durationSteps: 2 }, { interval: 2, durationSteps: 2 }],
            [{ interval: 4, durationSteps: 2 }, { interval: 2, durationSteps: 2 }, { interval: 0, durationSteps: 4 }],
            [{ interval: 2, durationSteps: 2 }, { interval: 3, durationSteps: 2 }, { interval: 4, durationSteps: 4 }]
        ],
`;

injectProperties('scalar', scalarProps);
injectProperties('shred', shredProps);
injectProperties('blues', bluesProps);
injectProperties('neo', neoProps);
injectProperties('funk', funkProps);
injectProperties('hiphop', hiphopProps);
injectProperties('minimal', minimalProps);
injectProperties('bird', birdProps);
injectProperties('disco', discoProps);
injectProperties('bossa', bossaProps);
injectProperties('country', countryProps);
injectProperties('metal', metalProps);
injectProperties('reggae', reggaeProps);
injectProperties('acoustic', acousticProps);
injectProperties('ska', skaProps);

fs.writeFileSync(file, content);
