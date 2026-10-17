import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAssignedEvents, getMyEquipmentRequests, submitEquipmentRequest, updateEquipmentRequest,
  type EquipmentRequestEvent, type EquipmentRequestRecord,
} from '../../api/equipment-requests-api';
import { EquipmentRequestEditorPage } from './EquipmentRequestEditorPage';

const mocks = vi.hoisted(() => ({ user: { role: 'coordinator', id: 'coord-1' } }));
vi.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (state: { currentUser: typeof mocks.user }) => unknown) => selector({ currentUser: mocks.user }),
}));
vi.mock('../../api/equipment-requests-api', () => ({
  getAssignedEvents: vi.fn(), getMyEquipmentRequests: vi.fn(), submitEquipmentRequest: vi.fn(), updateEquipmentRequest: vi.fn(),
}));

const event: EquipmentRequestEvent = {
  id: 'event-1', name: 'Showcase', status: 'approved', startDateTime: '2030-02-03T10:00:00.000Z',
  endDateTime: '2030-02-03T12:00:00.000Z', expectedAttendance: 120,
};
const record: EquipmentRequestRecord = {
  id: 'request-1', reference: 'ER-12345678', eventId: event.id, eventName: event.name,
  eventStart: event.startDateTime, eventEnd: event.endDateTime, expectedAttendance: 120,
  status: 'Pending Review', eventStatus: 'Planning', requestedBy: 'coord-1', coordinatorName: 'Coordinator', createdAt: event.startDateTime,
  items: [{ id: 'item-1', equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }],
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderEditor(path: string) {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/equipment/requests/create" element={<EquipmentRequestEditorPage />} />
      <Route path="/equipment/requests/:requestId/update" element={<EquipmentRequestEditorPage />} />
      <Route path="/equipment/requests" element={<p>My Equipment Requests list</p>} />
    </Routes>
    <LocationProbe />
  </MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.role = 'coordinator';
  vi.mocked(getAssignedEvents).mockResolvedValue([event]);
  vi.mocked(getMyEquipmentRequests).mockResolvedValue([]);
  vi.mocked(submitEquipmentRequest).mockResolvedValue({ kind: 'created', id: record.id, requestReference: record.reference, event });
  vi.mocked(updateEquipmentRequest).mockResolvedValue({ kind: 'updated', id: record.id, requestReference: record.reference });
});

describe('SPM-57 separate equipment request editor routes', () => {
  /** EQUIP-REQUEST-03-A: create is a separate page and preserves an event preselected by its caller. */
  it('renders a dedicated create form with event context and returns after submission', async () => {
    const user = userEvent.setup();
    renderEditor(`/equipment/requests/create?eventId=${event.id}`);
    expect(await screen.findByRole('heading', { name: 'Create Equipment Request' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'My Equipment Requests' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Event/ })).toHaveValue(event.id);
    await user.type(screen.getByRole('textbox', { name: /Equipment name/ }), 'Microphone');
    await user.selectOptions(screen.getByRole('combobox', { name: /Equipment type/ }), 'Audio');
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    await waitFor(() => expect(submitEquipmentRequest).toHaveBeenCalledWith({
      eventId: event.id, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }],
    }));
    expect(await screen.findByText('My Equipment Requests list')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`/equipment/requests?submitted=${record.reference}`);
    expect(updateEquipmentRequest).not.toHaveBeenCalled();
  });

  /** EQUIP-REQUEST-04-N: server submission errors stay visible and do not navigate to a false confirmation. */
  it('keeps the create editor open when the submit endpoint refuses the request', async () => {
    vi.mocked(submitEquipmentRequest).mockRejectedValue(new Error('Request refused'));
    const user = userEvent.setup();
    renderEditor('/equipment/requests/create');
    await user.selectOptions(await screen.findByRole('combobox', { name: /Event/ }), event.id);
    await user.type(screen.getByRole('textbox', { name: /Equipment name/ }), 'Microphone');
    await user.selectOptions(screen.getByRole('combobox', { name: /Equipment type/ }), 'Audio');
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Request refused');
    expect(screen.getByRole('heading', { name: 'Create Equipment Request' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Equipment name/ })).toHaveValue('Microphone');
    expect(screen.getByTestId('location')).toHaveTextContent('/equipment/requests/create');
  });

  /** EQUIP-REQUEST-04-N: create failures use a safe message and do not fabricate success. */
  it('shows a safe create failure message when the submit endpoint rejects with a non-Error value', async () => {
    vi.mocked(submitEquipmentRequest).mockRejectedValue('offline');
    const user = userEvent.setup();
    renderEditor('/equipment/requests/create');
    await user.selectOptions(await screen.findByRole('combobox', { name: /Event/ }), event.id);
    await user.type(screen.getByRole('textbox', { name: /Equipment name/ }), 'Microphone');
    await user.selectOptions(screen.getByRole('combobox', { name: /Equipment type/ }), 'Audio');
    await user.click(screen.getByRole('button', { name: 'Submit Request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not submit equipment request.');
  });

  /** EQUIP-REQUEST-10-A: the update route preloads the selected request and preserves its identity/reference. */
  it('renders a prefilled update page and updates by request ID without submitting a new request', async () => {
    const user = userEvent.setup();
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([record]);
    renderEditor(`/equipment/requests/${record.id}/update`);
    expect(await screen.findByRole('heading', { name: 'Update Equipment Request' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Event/ })).toHaveValue(event.id);
    expect(screen.getByRole('combobox', { name: /Event/ })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /Equipment name/ })).toHaveValue('Microphone');
    expect(screen.getByRole('combobox', { name: /Equipment type/ })).toHaveValue('Audio');
    expect(screen.getByRole('spinbutton', { name: /Quantity/ })).toHaveValue(1);
    await user.clear(screen.getByRole('textbox', { name: /Equipment name/ }));
    await user.type(screen.getByRole('textbox', { name: /Equipment name/ }), 'Wireless microphone');
    await user.click(screen.getByRole('button', { name: 'Update Event' }));
    await waitFor(() => expect(updateEquipmentRequest).toHaveBeenCalledWith(record.id, {
      eventId: event.id, items: [{ equipmentName: 'Wireless microphone', equipmentType: 'Audio', quantity: 1 }],
    }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/equipment/requests?updated=${record.reference}`);
    expect(submitEquipmentRequest).not.toHaveBeenCalled();
  });

  /** EQUIP-REQUEST-11-N: a submitted event is excluded from the create picker and can only be updated. */
  it('prevents creating another request for an event already in My Equipment Requests', async () => {
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([record]);
    renderEditor('/equipment/requests/create');
    expect(await screen.findByText(/Each event can have one equipment request/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Event/ })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Submit Request' })).toBeDisabled();
  });

  /** EQUIP-REQUEST-01-N and EQUIP-REQUEST-08-N: closed events are filtered out of the separate create form. */
  /** EQUIP-REQUEST-01-N: only eligible events are exposed by the create-page event picker. */
  it('offers only request-eligible events on the create page', async () => {
    vi.mocked(getAssignedEvents).mockResolvedValue([
      event,
      { ...event, id: 'cancelled-event', name: 'Cancelled', status: 'cancelled' },
      { ...event, id: 'rejected-event', name: 'Rejected', status: 'rejected' },
    ]);
    renderEditor('/equipment/requests/create');
    const picker = await screen.findByRole('combobox', { name: /Event/ });
    expect(picker).toHaveValue('');
    expect(picker.querySelectorAll('option')).toHaveLength(2);
    expect(screen.getByRole('option', { name: event.name })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Cancelled' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Rejected' })).not.toBeInTheDocument();
  });

  /** EQUIP-REQUEST-10-A: if editor data cannot load, the user can return to the request list. */
  it('provides a fallback message when request form data cannot be loaded', async () => {
    vi.mocked(getAssignedEvents).mockRejectedValue('offline');
    renderEditor('/equipment/requests/create');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load equipment request details.');
    expect(screen.getByRole('link', { name: 'Back to My Equipment Requests' })).toBeInTheDocument();
  });

  /** EQUIP-REQUEST-10-A: Cancel from the separate editor returns to My Equipment Requests. */
  it('navigates back to the request list from the separate editor page', async () => {
    const user = userEvent.setup();
    renderEditor('/equipment/requests/create');
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('My Equipment Requests list')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/equipment/requests');
  });

  /** EQUIP-REQUEST-10-BND-1: direct navigation cannot expose an editor after confirmation. */
  it('refuses to render an update form after the event is Confirmed', async () => {
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([{ ...record, eventStatus: 'Confirmed' }]);
    renderEditor(`/equipment/requests/${record.id}/update`);
    expect(await screen.findByRole('alert')).toHaveTextContent(/event is confirmed/);
    expect(screen.queryByRole('textbox', { name: /Equipment name/ })).not.toBeInTheDocument();
  });

  /** EQUIP-REQUEST-10-N: an unknown or non-owned request is not exposed for editing. */
  it('does not render an editor when the request is absent from the coordinator list', async () => {
    renderEditor('/equipment/requests/not-owned/update');
    expect(await screen.findByRole('alert')).toHaveTextContent('Equipment request not found.');
    expect(screen.queryByRole('textbox', { name: /Equipment name/ })).not.toBeInTheDocument();
  });

  /** EQUIP-REQUEST-10-N: update errors retain the prefilled editor instead of silently navigating away. */
  it('keeps the update form available when the update endpoint rejects', async () => {
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([record]);
    vi.mocked(updateEquipmentRequest).mockRejectedValue(new Error('Request update refused'));
    const user = userEvent.setup();
    renderEditor(`/equipment/requests/${record.id}/update`);
    await user.click(await screen.findByRole('button', { name: 'Update Event' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Request update refused');
    expect(screen.getByRole('textbox', { name: /Equipment name/ })).toHaveValue('Microphone');
    expect(screen.getByTestId('location')).toHaveTextContent(`/equipment/requests/${record.id}/update`);
  });

  /** EQUIP-REQUEST-10-A: update failures use a safe message and retain the editor. */
  it('shows a safe update failure message when the update endpoint rejects with a non-Error value', async () => {
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([record]);
    vi.mocked(updateEquipmentRequest).mockRejectedValue('offline');
    const user = userEvent.setup();
    renderEditor(`/equipment/requests/${record.id}/update`);
    await user.click(await screen.findByRole('button', { name: 'Update Event' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update equipment request.');
  });
});
