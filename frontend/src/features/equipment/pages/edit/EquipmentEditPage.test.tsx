import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EquipmentRecord } from '@/types';
import { EquipmentEditPage } from './EquipmentEditPage';
import { ApiError } from '@/utils/api';

const { getEquipment, updateEquipment, navigate } = vi.hoisted(() => ({
  getEquipment: vi.fn(),
  updateEquipment: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/features/equipment/api/equipment-api', () => ({ getEquipment, updateEquipment }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

const record: EquipmentRecord = {
  id: 'equipment-118',
  name: 'Conference projector',
  type: 'Visual',
  location: 'Storage Room A',
  quantity: 5,
  maintenanceStatus: 'Active',
  isAvailable: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function renderEditPage() {
  return render(
    <MemoryRouter initialEntries={['/equipment/equipment-118/edit']}>
      <Routes>
        <Route path="/equipment/:id/edit" element={<EquipmentEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EquipmentEditPage (SPM-118)', () => {
  beforeEach(() => {
    getEquipment.mockReset().mockResolvedValue([record]);
    updateEquipment.mockReset();
    navigate.mockReset();
  });

  /** SPM-118 AC1/AC2: selecting Edit loads all and only the fields present at equipment creation. */
  it('EQUIP-UPDATE-02-A loads the selected record and exposes its five editable fields', async () => {
    renderEditPage();

    expect(await screen.findByRole('heading', { name: 'Edit Equipment Record' })).toBeInTheDocument();
    expect(getEquipment).toHaveBeenCalledWith({ includeUnavailable: true });
    expect(screen.getByLabelText(/equipment name/i)).toHaveValue('Conference projector');
    expect(screen.getByLabelText(/equipment type/i)).toHaveValue('Visual');
    expect(screen.getByLabelText(/location/i)).toHaveValue('Storage Room A');
    expect(screen.getByLabelText(/quantity available/i)).toHaveValue('5');
    expect(screen.getByLabelText(/maintenance status/i)).toHaveValue('Active');
    expect(screen.queryByLabelText(/availability/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/specifications/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /description|specifications/i })).not.toBeInTheDocument();
  });

  /** SPM-118 AC3: required fields block saving and show field-level validation errors. */
  it('EQUIP-UPDATE-03-A blocks empty required values before calling the update API', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await screen.findByLabelText(/equipment name/i);
    await user.clear(screen.getByLabelText(/equipment name/i));
    await user.selectOptions(screen.getByLabelText(/equipment type/i), '');
    await user.clear(screen.getByLabelText(/location/i));
    await user.clear(screen.getByLabelText(/quantity available/i));
    await user.selectOptions(screen.getByLabelText(/maintenance status/i), '');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(screen.getAllByRole('alert')).toHaveLength(5);
    expect(updateEquipment).not.toHaveBeenCalled();
  });

  /** SPM-118 AC3: quantities must be positive whole numbers within the database integer range. */
  it('EQUIP-UPDATE-03-C rejects a quantity below the allowed minimum', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await screen.findByLabelText(/quantity available/i);
    const input = screen.getByLabelText(/quantity available/i);
    await user.clear(input);
    await user.type(input, '0');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/quantity must be a whole number between 1 and/i)).toBeInTheDocument();
    expect(updateEquipment).not.toHaveBeenCalled();
  });

  it('EQUIP-UPDATE-03-C rejects a fractional quantity', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await screen.findByLabelText(/quantity available/i);
    const input = screen.getByLabelText(/quantity available/i);
    await user.clear(input);
    await user.type(input, '1.5');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/quantity must be a whole number between 1 and/i)).toBeInTheDocument();
    expect(updateEquipment).not.toHaveBeenCalled();
  });

  it('EQUIP-UPDATE-03-C rejects a quantity above the allowed maximum', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await screen.findByLabelText(/quantity available/i);
    const input = screen.getByLabelText(/quantity available/i);
    await user.clear(input);
    await user.type(input, '2147483648');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/quantity must be a whole number between 1 and/i)).toBeInTheDocument();
    expect(updateEquipment).not.toHaveBeenCalled();
  });

  /** SPM-118 AC2/AC4/AC5/AC6: a valid save submits the selected record and confirms success. */
  it('EQUIP-UPDATE-04-A saves the edited record and shows the confirmation', async () => {
    const user = userEvent.setup();
    const updated = { ...record, name: 'Updated projector', location: 'Main Hall', quantity: 7 };
    updateEquipment.mockResolvedValue({ equipment: updated, message: 'Equipment record updated.' });
    renderEditPage();
    await screen.findByLabelText(/equipment name/i);
    await user.clear(screen.getByLabelText(/equipment name/i));
    await user.type(screen.getByLabelText(/equipment name/i), updated.name);
    await user.clear(screen.getByLabelText(/location/i));
    await user.type(screen.getByLabelText(/location/i), updated.location);
    await user.clear(screen.getByLabelText(/quantity available/i));
    await user.type(screen.getByLabelText(/quantity available/i), String(updated.quantity));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(updateEquipment).toHaveBeenCalledWith(record.id, {
      name: 'Updated projector',
      type: 'Visual',
      location: 'Main Hall',
      quantity: 7,
      maintenanceStatus: 'Active',
    });
    expect(await screen.findByRole('dialog', { name: 'Equipment Record Updated' })).toBeInTheDocument();
    expect(screen.getByText('Equipment record updated.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(navigate).toHaveBeenCalledWith('/equipment/availability');
  });

  /** SPM-118 AC1: both page navigation controls return to the equipment inventory. */
  it('EQUIP-UPDATE-01-A navigates back or cancels to the inventory', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await screen.findByLabelText(/equipment name/i);

    await user.click(screen.getByRole('button', { name: /back to inventory/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(navigate).toHaveBeenNthCalledWith(1, '/equipment/availability');
    expect(navigate).toHaveBeenNthCalledWith(2, '/equipment/availability');
  });

  /** SPM-118 AC1: a selected id missing from the inventory is presented as an actionable load failure. */
  it('EQUIP-UPDATE-01-B reports when the selected record is absent', async () => {
    getEquipment.mockResolvedValue([]);
    renderEditPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to load this equipment record/i);
  });

  /** SPM-118 AC1: an inventory request failure is shown as a load error. */
  it('EQUIP-UPDATE-01-B reports when inventory cannot be loaded', async () => {
    getEquipment.mockRejectedValue(new Error('offline'));
    renderEditPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to load this equipment record/i);
  });

  /** SPM-118 AC3: server validation errors are shown beside their corresponding fields. */
  it('EQUIP-UPDATE-03-A shows field errors returned by the update API', async () => {
    const user = userEvent.setup();
    updateEquipment.mockRejectedValue(new ApiError('Invalid equipment record.', { name: 'Equipment name is required.' }));
    renderEditPage();
    await screen.findByLabelText(/equipment name/i);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Equipment name is required.')).toBeInTheDocument();
  });

  /** SPM-118 AC3: body-level API validation errors are shown in the form. */
  it('EQUIP-UPDATE-03-A shows general API validation errors', async () => {
    const user = userEvent.setup();
    updateEquipment.mockRejectedValue(new ApiError('Invalid equipment record.', { body: 'Equipment record could not be validated.' }));
    renderEditPage();
    await screen.findByLabelText(/equipment name/i);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Equipment record could not be validated.');
  });

  /** SPM-118 AC4: users can dismiss the successful-save confirmation without navigation. */
  it('EQUIP-UPDATE-04-B closes the update confirmation', async () => {
    const user = userEvent.setup();
    updateEquipment.mockResolvedValue({ equipment: record, message: 'Equipment record updated.' });
    renderEditPage();
    await screen.findByLabelText(/equipment name/i);
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByRole('dialog', { name: 'Equipment Record Updated' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(screen.queryByRole('dialog', { name: 'Equipment Record Updated' })).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  /** SPM-118 AC4: an unexpected save failure is visible and does not claim success. */
  it('EQUIP-UPDATE-04-B reports an unexpected update failure', async () => {
    const user = userEvent.setup();
    updateEquipment.mockRejectedValue(new Error('offline'));
    renderEditPage();
    await screen.findByLabelText(/equipment name/i);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to update the equipment record/i);
    expect(screen.queryByRole('dialog', { name: 'Equipment Record Updated' })).not.toBeInTheDocument();
  });
});
