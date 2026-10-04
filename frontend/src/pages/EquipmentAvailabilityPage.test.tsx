import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EquipmentAvailabilityPage } from './EquipmentAvailabilityPage';

const { getEquipment, navigate } = vi.hoisted(() => ({ getEquipment: vi.fn(), navigate: vi.fn() }));

vi.mock('@/utils/equipment-api', () => ({ getEquipment }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

describe('EquipmentAvailabilityPage', () => {
  beforeEach(() => {
    getEquipment.mockReset();
    navigate.mockReset();
  });

  // SPM-111 EQUIP-CRE-05-A: inventory displays all persisted details, including location.
  it('EQUIP-CRE-05-A displays the equipment location in the inventory', async () => {
    // Arrange: the Technical Support inventory API returns a named equipment record.
    getEquipment.mockResolvedValue([
      {
        id: 'equipment-1',
        name: 'Conference projector',
        type: 'Visual',
        quantity: 10,
        maintenanceStatus: 'Active',
        location: 'Storage Room A',
        createdAt: '2026-10-03T00:00:00.000Z',
        updatedAt: '2026-10-03T00:00:00.000Z',
      },
    ]);

    // Act: load the Technical Support equipment inventory.
    render(<EquipmentAvailabilityPage />);

    // Assert: the persisted location is visible with the rest of the record details.
    expect(await screen.findByText('Conference projector')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /equipment name/i })).toBeInTheDocument();
    expect(screen.getByText('Visual')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /location/i })).toBeInTheDocument();
    expect(screen.getByText('Storage Room A')).toBeInTheDocument();
  });
});
