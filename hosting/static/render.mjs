// Materialize the shared recipe for the config-as-code homelab mirror.
// stdout only: this command does not write files, contact hosts, or deploy.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const environment = process.argv[2];
if (!['test', 'prod'].includes(environment)) {
    throw new Error('Usage: render.mjs <test|prod>');
}
const name = environment === 'test' ? 'ensembletest' : 'ensemble';
const env = {
    ...process.env,
    ENSEMBLE_STATIC_PORT: environment === 'test' ? '8090' : '8091',
    ENSEMBLE_STATIC_ROOT: `/srv/ensemble-${environment}/www`,
    ENSEMBLE_NGINX_CONFIG: `/srv/ensemble-${environment}/nginx.conf`,
};
const model = JSON.parse(
    execFileSync(
        'docker',
        [
            'compose',
            '--project-name',
            name,
            '-f',
            path.resolve(import.meta.dirname, 'compose.yml'),
            'config',
            '--format',
            'json',
        ],
        { env, encoding: 'utf8' },
    ),
);
// Preserve the live test stack's Compose identity, so it is replaced rather than
// left orphaned while a new service attempts to bind the same port.
model.services[name] = { ...model.services.static, container_name: name };
delete model.services.static;
const yaml = execFileSync('docker', ['compose', '--project-name', name, '-f', '-', 'config'], {
    input: JSON.stringify(model),
    encoding: 'utf8',
});
console.log(
    `# Generated from Ensemble hosting/static/compose.yml via render.mjs ${environment}.\n# Do not edit independently; regenerate both environment recipes from the shared source.\n${yaml.trim()}`,
);
