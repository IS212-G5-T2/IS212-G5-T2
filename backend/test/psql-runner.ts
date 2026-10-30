import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';

type PsqlEnvironment = Record<string, string | undefined>;

/** Run a migration with psql's per-statement transaction behavior, using the
 * configured local executable or the PostgreSQL container used by the E2E harness. */
export function runPsql(
  databaseUrl: string,
  sql: string,
  environment: PsqlEnvironment = {},
): SpawnSyncReturns<string> {
  const psqlArgs = [databaseUrl, '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-'];
  const env = { ...process.env, ...environment };
  const executable = process.env.PSQL_PATH || 'psql';
  const direct = spawnSync(executable, psqlArgs, {
    encoding: 'utf8',
    env,
    input: sql,
  });
  if (direct.error?.code !== 'ENOENT') return direct;

  const container = process.env.PSQL_DOCKER_CONTAINER || findPostgresContainer();
  if (!container) return direct;

  const dockerEnvironment = Object.entries(environment).flatMap(([key, value]) =>
    value === undefined ? [] : ['-e', `${key}=${value}`],
  );
  return spawnSync(
    process.env.DOCKER_PATH || 'docker',
    [
      'exec',
      '-i',
      ...dockerEnvironment,
      container,
      'psql',
      ...psqlArgs,
    ],
    { encoding: 'utf8', env, input: sql },
  );
}

function findPostgresContainer(): string | undefined {
  const result = spawnSync(
    process.env.DOCKER_PATH || 'docker',
    ['ps', '--filter', 'status=running', '--format', '{{.Names}} {{.Image}}'],
    { encoding: 'utf8' },
  );
  if (result.error || result.status !== 0) return undefined;
  const matches = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/, 2))
    .filter(([name, image]) => /postgres/i.test(`${name} ${image}`));
  return matches.length === 1 ? matches[0][0] : undefined;
}
