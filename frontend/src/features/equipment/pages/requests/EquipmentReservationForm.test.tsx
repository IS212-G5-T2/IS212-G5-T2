import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EventRecord } from '@/types';
import { EquipmentReservationForm } from './EquipmentReservationForm';

const event: EventRecord = {
  id: 'event-1', name: 'Student Showcase', purpose: 'Showcase', description: '',
  organiserId: 'organiser-1', organiserName: 'Organiser', coordinatorId: 'coordinator-1',
  status: 'approved', startDateTime: '2030-02-03T10:00:00.000Z', endDateTime: '2030-02-03T12:00:00.000Z',
  expectedAttendance: 120, venueRequirements: { minCapacity: 120, accessibility: [], facilities: [], layout: '' },
  equipmentNeeds: '', registrationEnabled: false, changeRequests: [], createdAt: '', updatedAt: '',
};

describe('SPM-57 equipment request form', () => {
  /** EQUIP-REQUEST-01-A: an assigned eligible event opens the request form with its details prefilled. */
  it('EQUIP-REQUEST-01-A shows the selected event name, date, time, and expected attendance', () => {
    render(<EquipmentReservationForm events={[event]} initialEventId={event.id} submitting={false} onSubmit={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Request equipment' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Event/ })).toHaveValue(event.id);
    expect(within(document.querySelector('dl')!).getByText(event.name)).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(within(document.querySelector('dl')!).getByText('3 Feb 2030')).toBeInTheDocument();
    expect(within(document.querySelector('dl')!).getByText(`${new Date(event.startDateTime).toLocaleTimeString()} – ${new Date(event.endDateTime).toLocaleTimeString()}`)).toBeInTheDocument();
  });

  /** EQUIP-REQUEST-02-A: changing the event selection updates the event context displayed above its equipment items. */
  it('EQUIP-REQUEST-02-A updates the prefilled event context after selection changes', async () => {
    const second = { ...event, id: 'event-2', name: 'Second Showcase', startDateTime: '2031-11-24T14:30:00.000Z', endDateTime: '2031-11-25T01:45:00.000Z', expectedAttendance: 47 };
    render(<EquipmentReservationForm events={[event, second]} initialEventId={event.id} submitting={false} onSubmit={vi.fn()} />);
    const details = within(document.querySelector('dl')!);
    expect(details.getByText('3 Feb 2030')).toBeInTheDocument();
    expect(details.getByText(`${new Date(event.startDateTime).toLocaleTimeString()} – ${new Date(event.endDateTime).toLocaleTimeString()}`)).toBeInTheDocument();
    expect(details.getByText('120')).toBeInTheDocument();
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: /Event/ }), second.id);
    const updatedDetails = within(document.querySelector('dl')!);
    expect(updatedDetails.getByText(second.name)).toBeInTheDocument();
    expect(updatedDetails.getByText('24 Nov 2031')).toBeInTheDocument();
    expect(updatedDetails.getByText(`${new Date(second.startDateTime).toLocaleTimeString()} – ${new Date(second.endDateTime).toLocaleTimeString()}`)).toBeInTheDocument();
    expect(updatedDetails.getByText('47')).toBeInTheDocument();
  });

  /** EQUIP-REQUEST-03-A, EQUIP-REQUEST-05-A: one or more item rows preserve distinct name, type, and quantity values. */
  it('EQUIP-REQUEST-03-A submits multiple independently populated equipment items', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EquipmentReservationForm events={[event]} initialEventId={event.id} submitting={false} onSubmit={onSubmit} />);
    expect(screen.queryByRole('textbox', { name: /technical requirements/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/technical requirements/i)).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /Equipment name/ }), '  Wireless microphones  ');
    await user.selectOptions(screen.getByRole('combobox', { name: /Equipment type/ }), 'Audio');
    await user.clear(screen.getByRole('spinbutton', { name: /Quantity/ }));
    await user.type(screen.getByRole('spinbutton', { name: /Quantity/ }), '2');
    await user.click(screen.getByRole('button', { name: 'Add another item' }));
    const item = screen.getByText('Equipment item 2').closest('fieldset')!;
    await user.type(within(item).getByRole('textbox', { name: /Equipment name/ }), 'Projector');
    await user.selectOptions(within(item).getByRole('combobox', { name: /Equipment type/ }), 'Visual');
    await user.clear(within(item).getByRole('spinbutton', { name: /Quantity/ }));
    await user.type(within(item).getByRole('spinbutton', { name: /Quantity/ }), '1');
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(event.id, [
      { equipmentName: 'Wireless microphones', equipmentType: 'Audio', quantity: 2 },
      { equipmentName: 'Projector', equipmentType: 'Visual', quantity: 1 },
    ]));
  });

  /** EQUIP-REQUEST-03-BND-1: the maximum PostgreSQL integer quantity is accepted without imposing a lower business cap. */
  it('EQUIP-REQUEST-03-BND-1 submits the maximum PostgreSQL integer quantity', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EquipmentReservationForm events={[event]} initialEventId={event.id} submitting={false} onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: /Equipment name/ }), 'Microphone');
    await user.selectOptions(screen.getByRole('combobox', { name: /Equipment type/ }), 'Audio');
    fireEvent.change(screen.getByRole('spinbutton', { name: /Quantity/ }), { target: { value: '2147483647' } });
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(event.id, [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 2_147_483_647 }]));
  });

  /** EQUIP-REQUEST-03-BND-1 and EQUIP-REQUEST-04-BND-1: quantity one is valid and zero, fractional, or over-limit quantities are rejected. */
  it.each(['0', '-1', '1.5', '2147483648'])('EQUIP-REQUEST-03-BND-1 blocks invalid quantity %s without submitting', async (quantity) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EquipmentReservationForm events={[event]} initialEventId={event.id} submitting={false} onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: /Equipment name/ }), 'Microphone');
    await user.selectOptions(screen.getByRole('combobox', { name: /Equipment type/ }), 'Audio');
    fireEvent.change(screen.getByRole('spinbutton', { name: /Quantity/ }), { target: { value: quantity } });
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(await screen.findByText('Enter a positive whole number.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /** EQUIP-REQUEST-04-BND-1: quantity one submits, while zero is rejected and the entered type and quantity remain visible. */
  it('EQUIP-REQUEST-04-BND-1 accepts quantity one and retains the zero boundary input on rejection', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EquipmentReservationForm events={[event]} initialEventId={event.id} submitting={false} onSubmit={onSubmit} />);
    const type = screen.getByRole('combobox', { name: /Equipment type/ });
    const quantity = screen.getByRole('spinbutton', { name: /Quantity/ });
    await user.type(screen.getByRole('textbox', { name: /Equipment name/ }), 'Microphone');
    await user.selectOptions(type, 'Audio');
    expect(quantity).toHaveValue(1);
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(event.id, [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }]));

    fireEvent.change(quantity, { target: { value: '0' } });
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(await screen.findByText('Enter a positive whole number.')).toBeInTheDocument();
    expect(type).toHaveValue('Audio');
    expect(quantity).toHaveValue(0);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  /** EQUIP-REQUEST-04-A: missing equipment type and quantity show field errors and prevent request submission. */
  it('reports a missing type without submitting', async () => {
    const onSubmit = vi.fn();
    render(<EquipmentReservationForm events={[event]} initialEventId={event.id} submitting={false} onSubmit={onSubmit} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(screen.getByText('Choose an equipment type.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /** EQUIP-REQUEST-04-A: an omitted quantity is identified without persisting a request. */
  it('reports a missing quantity without submitting', async () => {
    const onSubmit = vi.fn();
    render(<EquipmentReservationForm events={[event]} initialEventId={event.id} submitting={false} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: /Quantity/ }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: /Equipment type/ }), { target: { value: 'Audio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(screen.getByText('Quantity is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /** EQUIP-REQUEST-03-N: a blank equipment name is identified and blocks submission. */
  it('requires a nonblank equipment name before submission', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EquipmentReservationForm events={[event]} initialEventId={event.id} submitting={false} onSubmit={onSubmit} />);
    await user.selectOptions(screen.getByRole('combobox', { name: /Equipment type/ }), 'Audio');
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(screen.getByText('Equipment name is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /** EQUIP-REQUEST-03-N: a whitespace-only name is invalid, while a nonblank name is trimmed before submission. */
  it('rejects whitespace-only equipment names and trims valid names', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EquipmentReservationForm events={[event]} initialEventId={event.id} submitting={false} onSubmit={onSubmit} />);
    const name = screen.getByRole('textbox', { name: /Equipment name/ });
    await user.type(name, '   ');
    await user.selectOptions(screen.getByRole('combobox', { name: /Equipment type/ }), 'Audio');
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(screen.getByText('Equipment name is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.clear(name);
    await user.type(name, '  Microphone  ');
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(event.id, [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }]));
  });

  /** EQUIP-REQUEST-01-N: without an eligible event, no event data is exposed and submission remains unavailable. */
  it('EQUIP-REQUEST-01-N does not allow a request when no eligible event can be selected', () => {
    render(<EquipmentReservationForm events={[]} initialEventId="missing" submitting={false} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('definition')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit Request' })).toBeDisabled();
  });

  /** EQUIP-REQUEST-02-N: an unavailable event id does not populate event details or permit submission. */
  it('EQUIP-REQUEST-02-N does not expose details or submit for an unknown event id', async () => {
    const onSubmit = vi.fn();
    render(<EquipmentReservationForm events={[event]} initialEventId="unknown-event" submitting={false} onSubmit={onSubmit} />);
    expect(screen.queryByLabelText('Selected event details')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Event/ })).toHaveValue('');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(screen.getByText('Choose an eligible event.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /** EQUIP-REQUEST-01-N: submitting without a selected event displays a validation error and does not call the submission handler. */
  it('requires an event to be selected before submission', async () => {
    const onSubmit = vi.fn();
    render(<EquipmentReservationForm events={[event]} initialEventId="missing" submitting={false} onSubmit={onSubmit} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(screen.getByText('Choose an eligible event.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /** EQUIP-REQUEST-03-A: users can remove an extra equipment row before submitting the remaining item. */
  it('removes an additional equipment item from the request form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EquipmentReservationForm events={[event]} initialEventId={event.id} submitting={false} onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: /Equipment name/ }), 'Microphone');
    await user.click(screen.getByRole('button', { name: 'Add another item' }));
    await user.click(screen.getByRole('button', { name: 'Remove item 2' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /Equipment type/ }), 'Audio');
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(event.id, [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }]));
  });
});
