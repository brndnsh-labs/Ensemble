/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: 'no-direct-engine-import-from-ui',
            comment:
                'UI components should not import directly from the engine. Exception: manual performance triggers (playSoloNote, etc) which are currently being refactored.',
            severity: 'warn',
            from: { path: '^public/components/' },
            to: { path: '^public/engine/' },
        },
        {
            name: 'no-state-import-from-engine',
            comment:
                'Engine should receive state via parameters or specific modular state slices, not the global state manager.',
            severity: 'warn',
            from: { path: '^public/engine/' },
            to: { path: '^public/state\\.(js|ts)$' },
        },
        {
            name: 'no-circular-dependencies',
            severity: 'warn',
            from: {},
            to: { circular: true },
        },
        {
            name: 'no-orphans',
            comment: 'This module is not used anywhere.',
            severity: 'info',
            from: { orphan: true },
            to: {
                pathNot: ['^public/sw\\.ts$', '^tests/', '^scripts/'],
            },
        },
    ],
    options: {
        doNotFollow: {
            path: 'node_modules',
        },
        tsPreCompilationDeps: true,
        progress: { type: 'cli-feedback' },
    },
};
