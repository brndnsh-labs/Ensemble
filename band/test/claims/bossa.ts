import { defineClaims } from '../critique/harness.js';

export const bossa = defineClaims({
    takes: [
        {
            take: {},
            claims: [
                ['claveRim', 0.9, 1, 'the cross-stick plays the bossa clave'],
                ['kickOnOne', 0.95, 1, 'the surdo on one'],
                ['bassKickUnison', 0.7, 1, 'the bass doubles the surdo rhythm'],
                ['bassArrivesOnBass', 0.9, 1, 'root on the arrival'],
                ['compColour', 0.5, 1, 'ninths on the comp'],
                ['compTopVoiceMotion', 0, 3.5, 'smooth voice leading'],
            ],
        },
        {
            take: { comp: 'nylon' },
            claims: [
                ['compColour', 0.5, 1, 'ninths in the grips'],
                ['compTopVoiceMotion', 0, 3.5, 'the grips move by step, not by leap'],
            ],
        },
    ],
});
