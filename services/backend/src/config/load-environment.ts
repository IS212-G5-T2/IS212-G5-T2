import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads the backend's local environment file before Nest creates providers.
 *
 * Explicit process environment variables retain precedence, which allows CI
 * and deployed environments to provide configuration without a local file.
 */
export function loadEnvironment(
  environmentFile = resolve(process.cwd(), '.env'),
  loadEnvFile: typeof process.loadEnvFile = process.loadEnvFile,
): void {
  if (existsSync(environmentFile)) {
    loadEnvFile(environmentFile);
  }
}
