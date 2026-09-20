import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { basePathFromEnv } from './scripts/base-path.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
// `/v2` today, `''` (the site root) once ENSEMBLE_V2_BASE=/ is the cutover build. Published to
// the browser as NEXT_PUBLIC_BASE_PATH so `lib/base-path.ts` reads the same one value; Next
// rewrites its own links and `_next/*` assets from `basePath` alone.
const basePath = basePathFromEnv();

export default {
    output: 'export',
    basePath,
    trailingSlash: true,
    outputFileTracingRoot: path.resolve(directory, '../..'),
    reactStrictMode: true,
    experimental: { externalDir: true },
    env: { NEXT_PUBLIC_SOURCE_REV: revision, NEXT_PUBLIC_BASE_PATH: basePath },
    webpack(config, { webpack }) {
        config.resolve.alias['@engine'] = path.resolve(directory, '../../public');
        config.resolve.alias.deepsignal$ = path.resolve(
            directory,
            '../../node_modules/deepsignal/dist/deepsignal.mjs',
        );
        config.resolve.extensionAlias = {
            '.js': ['.ts', '.js'],
            '.jsx': ['.tsx', '.jsx'],
            '.mjs': ['.mjs'],
        };
        // The prototype imports the real browser engine, never the old page bootstrap.
        // Isolate its legacy persistence calls at compile time. Preview saves must not
        // reach ensemble_currentState, including calls inside the conductor/effects.
        config.plugins.push(
            new webpack.NormalModuleReplacementPlugin(/persistence\.js$/, (resource) => {
                if (
                    path.resolve(resource.context, resource.request) ===
                    path.resolve(directory, '../../public/state/persistence.js')
                ) {
                    resource.request = path.join(directory, 'lib/legacy-persistence.ts');
                }
            }),
        );
        config.plugins.push(
            new webpack.DefinePlugin({
                'import.meta.env': JSON.stringify({ MODE: 'test', DEV: false }),
                __APP_VERSION__: JSON.stringify('v2-preview'),
                __BUILD_REV__: JSON.stringify(revision),
            }),
        );
        return config;
    },
};
