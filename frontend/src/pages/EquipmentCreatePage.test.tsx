import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EquipmentCreatePage } from './EquipmentCreatePage';
import { ApiError } from '@/utils/api';

const { createEquipment, navigate } = vi.hoisted(() => ({ createEquipment: vi.fn(), navigate: vi.fn() }));

vi.mock('@/utils/equipment-api', () => ({ createEquipment }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

describe('EquipmentCreatePage', () => {
  beforeEach(() => {
    createEquipment.mockReset();
    navigate.mockReset();
  });

  // SPM-111 EQUIP-CRE-01-A: Technical Support sees the complete creation form.
  it('EQUIP-CRE-01-A renders name, type, quantity, status, and submit controls', () => {
    // Act: open the creation page.
    render(<EquipmentCreatePage />);

    // Assert: each required field and the submit action are available.
    expect(screen.getByLabelText(/equipment name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/equipment type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/maintenance status/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create equipment/i })).toBeInTheDocument();
  });

  // SPM-111 EQUIP-CRE-07-A and EQUIP-CRE-06-A: dropdowns expose exactly the story values.
  it('EQUIP-CRE-06-A/EQUIP-CRE-07-A offers the predefined type and status lists', () => {
    // Act: render the selectable controls.
    render(<EquipmentCreatePage />);

    // Assert: option values exactly match the story's predefined lists.
    const types = screen.getByLabelText(/equipment type/i) as HTMLSelectElement;
    const statuses = screen.getByLabelText(/maintenance status/i) as HTMLSelectElement;
    expect([...types.options].map((option) => option.value).filter(Boolean)).toEqual([
      'Audio', 'Visual', 'Furniture', 'Lighting', 'Other',
    ]);
    expect([...statuses.options].map((option) => option.value).filter(Boolean)).toEqual([
      'Active', 'Under Maintenance', 'Retired',
    ]);
  });

  // SPM-111 EQUIP-CRE-02-A: the UI sends all four values unchanged on valid submit.
  it('EQUIP-CRE-02-A submits equipment name, type, positive quantity, and maintenance status', async () => {
    // Arrange: the API acknowledges a valid record.
    const user = userEvent.setup();
    createEquipment.mockResolvedValue({
      equipment: { id: 'equipment-1', name: 'Conference projector', type: 'Audio', quantity: 5, maintenanceStatus: 'Active' },
      message: 'Equipment record created.',
    });
    render(<EquipmentCreatePage />);

    // Act: complete and submit the form.
    await user.type(screen.getByLabelText(/equipment name/i), 'Conference projector');
    await user.selectOptions(screen.getByLabelText(/equipment type/i), 'Audio');
    await user.type(screen.getByLabelText(/quantity/i), '5');
    await user.selectOptions(screen.getByLabelText(/maintenance status/i), 'Active');
    await user.click(screen.getByRole('button', { name: /create equipment/i }));

    // Assert: the API receives all fields without alteration.
    expect(createEquipment).toHaveBeenCalledWith({
      name: 'Conference projector',
      type: 'Audio',
      quantity: 5,
      maintenanceStatus: 'Active',
    });
  });

  // SPM-111 EQUIP-CRE-03-A/B: incomplete or invalid client input is stopped before POST.
  it.each([
    ['name', { type: 'Audio', quantity: '5', maintenanceStatus: 'Active' }, /equipment name is required/i],
    ['type', { name: 'Conference projector', quantity: '5', maintenanceStatus: 'Active' }, /equipment type is required/i],
    ['quantity', { name: 'Conference projector', type: 'Audio', maintenanceStatus: 'Active' }, /quantity is required/i],
    ['maintenance status', { name: 'Conference projector', type: 'Audio', quantity: '5' }, /maintenance status is required/i],
    ['zero quantity', { name: 'Conference projector', type: 'Audio', quantity: '0', maintenanceStatus: 'Active' }, /positive whole number/i],
    ['negative quantity', { name: 'Conference projector', type: 'Audio', quantity: '-1', maintenanceStatus: 'Active' }, /positive whole number/i],
    ['decimal quantity', { name: 'Conference projector', type: 'Audio', quantity: '1.5', maintenanceStatus: 'Active' }, /positive whole number/i],
    ['non-numeric quantity', { name: 'Conference projector', type: 'Audio', quantity: 'abc', maintenanceStatus: 'Active' }, /positive whole number/i],
    ['mixed quantity', { name: 'Conference projector', type: 'Audio', quantity: '5kg', maintenanceStatus: 'Active' }, /positive whole number/i],
    ['whitespace quantity', { name: 'Conference projector', type: 'Audio', quantity: ' ' }, /positive whole number/i],
  ])('EQUIP-CRE-03-A/B blocks %s and shows a field error', async (_caseName, values, error) => {
    // Arrange: render the blank form and supply only this case's values.
    const user = userEvent.setup();
    render(<EquipmentCreatePage />);
    if ('name' in values) await user.type(screen.getByLabelText(/equipment name/i), values.name);
    if ('type' in values) await user.selectOptions(screen.getByLabelText(/equipment type/i), values.type);
    if ('quantity' in values) await user.type(screen.getByLabelText(/quantity/i), values.quantity);
    if ('maintenanceStatus' in values) await user.selectOptions(screen.getByLabelText(/maintenance status/i), values.maintenanceStatus);

    // Act: attempt submission.
    await user.click(screen.getByRole('button', { name: /create equipment/i }));

    // Assert: local validation explains the error and sends no create request.
    expect(await screen.findByText(error)).toBeInTheDocument();
    expect(createEquipment).not.toHaveBeenCalled();
  });

  // SPM-111 EQUIP-CRE-03-A: other valid entries remain intact when one field fails.
  it('EQUIP-CRE-03-A retains entered type and quantity when maintenance status is missing', async () => {
    // Arrange: fill two valid fields and leave the final required field blank.
    const user = userEvent.setup();
    render(<EquipmentCreatePage />);
    const type = screen.getByLabelText(/equipment type/i) as HTMLSelectElement;
    const quantity = screen.getByLabelText(/quantity/i) as HTMLInputElement;
    await user.type(screen.getByLabelText(/equipment name/i), 'Conference projector');
    await user.selectOptions(type, 'Audio');
    await user.type(quantity, '5');

    // Act: submit the incomplete form.
    await user.click(screen.getByRole('button', { name: /create equipment/i }));

    // Assert: the field error does not discard the valid values already entered.
    expect(await screen.findByText(/maintenance status is required/i)).toBeInTheDocument();
    expect(type.value).toBe('Audio');
    expect(quantity.value).toBe('5');
  });

  // SPM-111 EQUIP-CRE-06-B/EQUIP-CRE-07-B: UI selects contain no unsupported values.
  it('EQUIP-CRE-06-B/EQUIP-CRE-07-B excludes invalid type and status options', () => {
    // Act: inspect the rendered choice values.
    render(<EquipmentCreatePage />);
    const types = screen.getByLabelText(/equipment type/i) as HTMLSelectElement;
    const statuses = screen.getByLabelText(/maintenance status/i) as HTMLSelectElement;

    // Assert: unsupported API values cannot be selected through the UI.
    expect([...types.options].map((option) => option.value)).not.toContain('Projector');
    expect([...types.options].map((option) => option.value)).not.toContain('audio');
    expect([...statuses.options].map((option) => option.value)).not.toContain('Broken');
    expect([...statuses.options].map((option) => option.value)).not.toContain('active');
  });

  // SPM-111 EQUIP-CRE-04-A: a completed save opens a confirmation dialog and returns to availability after acknowledgement.
  it('EQUIP-CRE-04-A displays confirmation and returns to availability after acknowledgement', async () => {
    // Arrange: submit a valid record and return the server confirmation.
    const user = userEvent.setup();
    createEquipment.mockResolvedValue({ message: 'Equipment record created.' });
    render(<EquipmentCreatePage />);
    await user.type(screen.getByLabelText(/equipment name/i), 'Conference projector');
    await user.selectOptions(screen.getByLabelText(/equipment type/i), 'Visual');
    await user.type(screen.getByLabelText(/quantity/i), '10');
    await user.selectOptions(screen.getByLabelText(/maintenance status/i), 'Active');

    // Act: submit the form.
    await user.click(screen.getByRole('button', { name: /create equipment/i }));

    // Assert: the user receives confirmation, then the acknowledgement returns them to availability.
    expect(await screen.findByRole('dialog', { name: /equipment record created/i })).toBeInTheDocument();
    expect(screen.getByText('Equipment record created.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(navigate).toHaveBeenCalledWith('/equipment/availability');
  });

  // SPM-111 EQUIP-CRE-03-C: API validation errors are shown beside the relevant field.
  it('EQUIP-CRE-03-C displays a server-side field validation error', async () => {
    // Arrange: the API rejects an otherwise valid client submission with its field error.
    const user = userEvent.setup();
    createEquipment.mockRejectedValue(
      new ApiError('Invalid equipment record.', { quantity: 'Quantity must be a positive whole number.' }),
    );
    render(<EquipmentCreatePage />);
    await user.type(screen.getByLabelText(/equipment name/i), 'Conference projector');
    await user.selectOptions(screen.getByLabelText(/equipment type/i), 'Audio');
    await user.type(screen.getByLabelText(/quantity/i), '5');
    await user.selectOptions(screen.getByLabelText(/maintenance status/i), 'Active');

    // Act: submit and receive the server-side validation response.
    await user.click(screen.getByRole('button', { name: /create equipment/i }));

    // Assert: server validation is visible to the Technical Support user.
    expect(await screen.findByText(/quantity must be a positive whole number/i)).toBeInTheDocument();
  });

  // SPM-111 resilience: a non-validation API failure is visible and does not imply creation succeeded.
  it('shows a recovery message when the create request fails unexpectedly', async () => {
    // Arrange: simulate a network or otherwise unstructured request failure.
    const user = userEvent.setup();
    createEquipment.mockRejectedValue(new Error('network unavailable'));
    render(<EquipmentCreatePage />);
    await user.type(screen.getByLabelText(/equipment name/i), 'Conference projector');
    await user.selectOptions(screen.getByLabelText(/equipment type/i), 'Audio');
    await user.type(screen.getByLabelText(/quantity/i), '5');
    await user.selectOptions(screen.getByLabelText(/maintenance status/i), 'Active');

    // Act: submit the valid form.
    await user.click(screen.getByRole('button', { name: /create equipment/i }));

    // Assert: the UI gives an actionable failure message rather than confirmation.
    expect(await screen.findByText(/unable to create the equipment record/i)).toBeInTheDocument();
    expect(screen.queryByText('Equipment record created.')).not.toBeInTheDocument();
  });
});
