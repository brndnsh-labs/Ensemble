import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Builds the account API bundle once per run, before any worker starts (#1258), so the
 * `accountApi` fixture always runs current source and three workers never race one `dist/`.
 * Skipped when the API's dependencies are not installed: guest specs do not need it, and the
 * fixture names the missing install if an account spec then runs.
 */
export default function globalSetup(): void {
    const api = path.resolve(__dirname, '../../v2-api');
    if (process.env.V2_LIVE_TEST === '1' || !existsSync(path.join(api, 'node_modules'))) {
        return;
    }
    execFileSync(process.execPath, ['build.mjs'], { cwd: api, stdio: 'inherit' });
}
