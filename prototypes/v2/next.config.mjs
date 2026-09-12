import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();

export default {
    output: 'export',
    basePath: '/v2',
    trailingSlash: true,
    outputFileTracingRoot: path.resolve(directory, '../..'),
    reactStrictMode: true,
    experimental: { externalDir: true },
    env: { NEXT_PUBLIC_SOURCE_REV: revision },
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
