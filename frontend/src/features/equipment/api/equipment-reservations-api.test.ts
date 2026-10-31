import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/utils/api';
import { getEquipmentReservations } from './equipment-reservations-api';

vi.mock('@/utils/api', () => ({ api: vi.fn() }));
const apiMock = vi.mocked(api);

beforeEach(() => apiMock.mockReset());

describe('SPM-58 equipment reservations API', () => {
  /** reads persisted Reserved equipment from the reservations endpoint. */
  it('loads reservations from the reservations endpoint and returns the result', async () => {
    const rows = [{ id: 'res-1' }];
    apiMock.mockResolvedValue(rows);
    await expect(getEquipmentReservations()).resolves.toBe(rows);
    expect(apiMock).toHaveBeenCalledWith('/equipment/requests/reservations');
  });
});
