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
  activeQuantity: 10,
  underMaintenanceQuantity: 30,
  retiredQuantity: 10,
  quantity: 50,
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

  /** EQUIP-AVAIL-08-B: edits submit the revised per-status quantities while preserving the same equipment record. */
  it('EQUIP-AVAIL-08-B reallocates quantity between Active and Under Maintenance', async () => {
    const user = userEvent.setup();
    updateEquipment.mockResolvedValue({
      equipment: { ...record, activeQuantity: 12, underMaintenanceQuantity: 28 },
      message: 'Equipment record updated.',
    });
    renderEditPage();
    await screen.findByLabelText(/active quantity/i);
    await user.clear(screen.getByLabelText(/active quantity/i));
    await user.type(screen.getByLabelText(/active quantity/i), '12');
    await user.clear(screen.getByLabelText(/under maintenance quantity/i));
    await user.type(screen.getByLabelText(/under maintenance quantity/i), '28');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(updateEquipment).toHaveBeenCalledWith(record.id, {
      name: record.name, type: record.type, location: record.location,
      activeQuantity: 12, underMaintenanceQuantity: 28, retiredQuantity: 10,
    });
    expect(await screen.findByRole('dialog', { name: 'Equipment Record Updated' })).toBeInTheDocument();
  });

  /** EQUIP-AVAIL-08-BND-1: per-status quantities must be non-negative whole numbers and sum within the storage range. */
  it('EQUIP-AVAIL-08-BND-1 blocks negative, fractional, zero-total, and overflow allocations', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await screen.findByLabelText(/active quantity/i);

    const activeInput = screen.getByLabelText(/active quantity/i);
    const maintenanceInput = screen.getByLabelText(/under maintenance quantity/i);
    const retiredInput = screen.getByLabelText(/retired quantity/i);
    await user.clear(activeInput);
    await user.type(activeInput, '-1');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/active quantity must be a non-negative whole number/i)).toBeInTheDocument();

    await user.clear(activeInput);
    await user.type(activeInput, '1.5');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/active quantity must be a non-negative whole number/i)).toBeInTheDocument();

    await user.clear(activeInput);
    await user.type(activeInput, '0');
    await user.clear(maintenanceInput);
    await user.type(maintenanceInput, '0');
    await user.clear(retiredInput);
    await user.type(retiredInput, '0');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/at least one equipment item is required/i)).toBeInTheDocument();

    await user.clear(activeInput);
    await user.type(activeInput, '2147483647');
    await user.clear(maintenanceInput);
    await user.type(maintenanceInput, '1');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/total quantity must not exceed 2147483647/i)).toBeInTheDocument();
    expect(updateEquipment).not.toHaveBeenCalled();
  });

  /** Confluence EQUIP-UPDATE-02-A; SPM-118 AC2: selecting Edit loads all and only the fields present at equipment creation. Kills: FE-118-06 (exposes retired Description). */
  it('EQUIP-UPDATE-02-A loads the selected record and exposes its five editable fields', async () => {
    renderEditPage();

    expect(await screen.findByRole('heading', { name: 'Edit Equipment Record' })).toBeInTheDocument();
    expect(getEquipment).toHaveBeenCalledWith({ includeUnavailable: true });
    expect(screen.getByLabelText(/equipment name/i)).toHaveValue('Conference projector');
    expect(screen.getByLabelText(/equipment type/i)).toHaveValue('Visual');
    expect(screen.getByLabelText(/location/i)).toHaveValue('Storage Room A');
    expect(screen.getByLabelText(/active quantity/i)).toHaveValue('10');
    expect(screen.getByLabelText(/under maintenance quantity/i)).toHaveValue('30');
    expect(screen.getByLabelText(/retired quantity/i)).toHaveValue('10');
        expect(screen.queryByLabelText(/^quantity available$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/specifications/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /description|specifications/i })).not.toBeInTheDocument();
  });

  /** Confluence EQUIP-UPDATE-03-A; SPM-118 AC3: required fields block saving and show field-level validation errors. Kills: FE-118-04 (omits required-name validation). */
  it('EQUIP-UPDATE-03-A blocks empty required values before calling the update API', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await screen.findByLabelText(/equipment name/i);
    await user.clear(screen.getByLabelText(/equipment name/i));
    await user.selectOptions(screen.getByLabelText(/equipment type/i), '');
    await user.clear(screen.getByLabelText(/location/i));
    await user.clear(screen.getByLabelText(/active quantity/i));
        await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(screen.getByLabelText(/equipment name/i)).toHaveAttribute('aria-describedby', 'equipment-name-error');
    expect(screen.getByText('Equipment name is required.')).toHaveAttribute('id', 'equipment-name-error');
    expect(screen.getByText('Equipment type is required.')).toBeInTheDocument();
    expect(screen.getByText('Location is required.')).toBeInTheDocument();
    expect(screen.getByText('Active quantity is required.')).toBeInTheDocument();

    expect(updateEquipment).not.toHaveBeenCalled();
  });

  /** Confluence EQUIP-UPDATE-03-C; SPM-118 AC3: quantities must be positive whole numbers within the database integer range. Kills: FE-118-07 (accepts zero). */
  it('EQUIP-UPDATE-03-C rejects a quantity below the allowed minimum', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await screen.findByLabelText(/active quantity/i);
    const input = screen.getByLabelText(/active quantity/i);
    await user.clear(input);
    await user.type(input, '0');
    for (const label of [/under maintenance quantity/i, /retired quantity/i]) {
      const bucket = screen.getByLabelText(label);
      await user.clear(bucket);
      await user.type(bucket, '0');
    }
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/non-negative whole number|at least one equipment item|total quantity must not exceed/i)).toBeInTheDocument();
    expect(updateEquipment).not.toHaveBeenCalled();
  });

  /** Confluence EQUIP-UPDATE-03-C; SPM-118 AC3: fractional quantities are invalid. Kills: FE-118-09 (accepts fractional quantity). */
  it('EQUIP-UPDATE-03-C rejects a fractional quantity', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await screen.findByLabelText(/active quantity/i);
    const input = screen.getByLabelText(/active quantity/i);
    await user.clear(input);
    await user.type(input, '1.5');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/non-negative whole number|at least one equipment item|total quantity must not exceed/i)).toBeInTheDocument();
    expect(updateEquipment).not.toHaveBeenCalled();
  });

  /** Confluence EQUIP-UPDATE-03-C; SPM-118 AC3: quantities above PostgreSQL integer maximum are invalid. Kills: FE-118-08 (accepts above maximum). */
  it('EQUIP-UPDATE-03-C rejects a quantity above the allowed maximum', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await screen.findByLabelText(/active quantity/i);
    const input = screen.getByLabelText(/active quantity/i);
    await user.clear(input);
    await user.type(input, '2147483648');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/non-negative whole number|at least one equipment item|total quantity must not exceed/i)).toBeInTheDocument();
    expect(updateEquipment).not.toHaveBeenCalled();
  });

  /** Confluence EQUIP-UPDATE-03-C; SPM-118 AC3: both inclusive quantity boundaries are valid update values. Kills: FE-118-17 (rejects minimum), FE-118-18 (rejects maximum). */
  it('EQUIP-UPDATE-03-C accepts the inclusive minimum and maximum quantities', async () => {
    const user = userEvent.setup();
    updateEquipment.mockResolvedValue({ equipment: record, message: 'Equipment record updated.' });

    for (const quantity of [1, 2_147_483_647]) {
      const view = renderEditPage();
      const input = await screen.findByLabelText(/active quantity/i);
      await user.clear(input);
      await user.type(input, String(quantity));
      for (const label of [/under maintenance quantity/i, /retired quantity/i]) {
        const bucket = screen.getByLabelText(label);
        await user.clear(bucket);
        await user.type(bucket, '0');
      }
      await user.click(screen.getByRole('button', { name: /save changes/i }));
      expect(updateEquipment).toHaveBeenLastCalledWith(record.id, expect.objectContaining({ activeQuantity: quantity, underMaintenanceQuantity: 0, retiredQuantity: 0 }));
      view.unmount();
    }
  });

  /** Confluence EQUIP-UPDATE-04-A; SPM-118 AC4: a valid save submits the selected record and confirms success. Kills: FE-118-03 (suppresses confirmation). */
  it('EQUIP-UPDATE-04-A saves the edited record and shows the confirmation', async () => {
    const user = userEvent.setup();
    const updated = { ...record, name: 'Updated projector', location: 'Main Hall', activeQuantity: 7, quantity: 47 };
    updateEquipment.mockResolvedValue({ equipment: updated, message: 'Equipment record updated.' });
    renderEditPage();
    await screen.findByLabelText(/equipment name/i);
    await user.clear(screen.getByLabelText(/equipment name/i));
    await user.type(screen.getByLabelText(/equipment name/i), updated.name);
    await user.clear(screen.getByLabelText(/location/i));
    await user.type(screen.getByLabelText(/location/i), updated.location);
    await user.clear(screen.getByLabelText(/active quantity/i));
    await user.type(screen.getByLabelText(/active quantity/i), String(updated.activeQuantity));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(updateEquipment).toHaveBeenCalledWith(record.id, {
      name: 'Updated projector',
      type: 'Visual',
      location: 'Main Hall',
      activeQuantity: 7,
      underMaintenanceQuantity: 30,
      retiredQuantity: 10,
    });
    expect(await screen.findByRole('dialog', { name: 'Equipment Record Updated' })).toBeInTheDocument();
    expect(screen.getByText('Equipment record updated.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(navigate).toHaveBeenCalledWith('/equipment/inventory');
  });

  /** Confluence EQUIP-UPDATE-01-A; SPM-118 AC1: both page navigation controls return to the equipment inventory. Kills: FE-118-14 (Cancel does not navigate). */
  it('EQUIP-UPDATE-01-A navigates back or cancels to the inventory', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await screen.findByLabelText(/equipment name/i);

    await user.click(screen.getByRole('button', { name: /back to inventory/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(navigate).toHaveBeenNthCalledWith(1, '/equipment/inventory');
    expect(navigate).toHaveBeenNthCalledWith(2, '/equipment/inventory');
  });

  /** Confluence EQUIP-UPDATE-01-B; SPM-118 AC1: a selected id missing from the inventory is presented as an actionable load failure. Kills: FE-118-12 (hides selected-record load error). */
  it('EQUIP-UPDATE-01-B reports when the selected record is absent', async () => {
    getEquipment.mockResolvedValue([]);
    renderEditPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to load this equipment record/i);
  });

  /** Confluence EQUIP-UPDATE-01-B; SPM-118 AC1: an inventory request failure is shown as a load error. Kills: FE-118-13 (silently ignores request failure). */
  it('EQUIP-UPDATE-01-B reports when inventory cannot be loaded', async () => {
    getEquipment.mockRejectedValue(new Error('offline'));
    renderEditPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to load this equipment record/i);
  });

  /** Confluence EQUIP-UPDATE-03-A; SPM-118 AC3: server validation errors are shown beside their corresponding fields. Kills: FE-118-10 (hides field error). */
  it('EQUIP-UPDATE-03-A shows field errors returned by the update API', async () => {
    const user = userEvent.setup();
    updateEquipment.mockRejectedValue(new ApiError('Invalid equipment record.', { name: 'Equipment name is required.' }));
    renderEditPage();
    await screen.findByLabelText(/equipment name/i);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    const error = await screen.findByText('Equipment name is required.');
    expect(error).toHaveAttribute('id', 'equipment-name-error');
    expect(screen.getByLabelText(/equipment name/i)).toHaveAttribute('aria-describedby', 'equipment-name-error');
    expect(screen.getByLabelText(/equipment name/i)).toHaveAttribute('aria-invalid', 'true');
  });

  /** Confluence EQUIP-UPDATE-03-A; SPM-118 AC3: body-level API validation errors are shown in the form. Kills: FE-118-11 (hides form error). */
  it('EQUIP-UPDATE-03-A shows general API validation errors', async () => {
    const user = userEvent.setup();
    updateEquipment.mockRejectedValue(new ApiError('Invalid equipment record.', { body: 'Equipment record could not be validated.' }));
    renderEditPage();
    await screen.findByLabelText(/equipment name/i);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Equipment record could not be validated.');
  });

  /** Confluence EQUIP-UPDATE-04-B; SPM-118 AC4: users can dismiss the successful-save confirmation without navigation. Kills: FE-118-16 (confirmation cannot close). */
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

  /** Confluence EQUIP-UPDATE-04-B; SPM-118 AC4: an unexpected save failure is visible and does not claim success. Kills: FE-118-15 (swallows save failure). */
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
