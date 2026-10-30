import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RegistrationSettingsService } from './registration-settings.service.js';

describe('SPM-139 settings service guard', () => {
  it('CONFIG-REG-01-D: refuses a request with no signed-in user before any database read', async () => {
    const service = new RegistrationSettingsService({} as never);
    await expect(service.get(undefined, '00000000-0000-4000-8000-000000000139')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
