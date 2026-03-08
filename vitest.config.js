export default {
    test: {
        globals: true,
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/cypress/**',
            '**/.{idea,git,cache,output,temp}/**',
            '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,playwright}.config.*',
            'tests/e2e/**',
        ],
    },
    esbuild: {
        jsxFactory: 'h',
        jsxFragment: 'Fragment',
    },
};
