/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: 'no-direct-engine-import-from-ui',
            comment:
                'UI components should not import directly from the engine. Use ui-bridge or specific controllers.',
            severity: 'warn',
            from: { path: '^public/components/' },
            to: { path: '^public/engine/' },
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
            to: {},
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
