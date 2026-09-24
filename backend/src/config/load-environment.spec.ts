import { existsSync } from 'node:fs';
import { loadEnvironment } from './load-environment.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

describe('loadEnvironment', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
  });

  it('loads an existing local environment file', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const loadEnvFile = vi.fn();

    loadEnvironment('/workspace/backend/.env', loadEnvFile);

    expect(loadEnvFile).toHaveBeenCalledWith('/workspace/backend/.env');
  });

  it('does not attempt to load a missing environment file', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const loadEnvFile = vi.fn();

    loadEnvironment('/workspace/backend/.env', loadEnvFile);

    expect(loadEnvFile).not.toHaveBeenCalled();
  });
});
