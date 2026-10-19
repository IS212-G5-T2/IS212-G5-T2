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
    expect(screen.queryByRole('combobox', { name: /Event/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Selected event details')).toHaveTextContent(event.name);
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

  /** EQUIP-REQUEST-10-A: an update remains tied to its request event even if it is no longer in the create-event feed. */
  it('keeps the original event fixed when the eligible-events feed no longer returns it', async () => {
    const user = userEvent.setup();
    vi.mocked(getAssignedEvents).mockResolvedValue([]);
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([record]);
    renderEditor(`/equipment/requests/${record.id}/update`);
    expect(await screen.findByLabelText('Selected event details')).toHaveTextContent(event.name);
    expect(screen.queryByRole('combobox', { name: /Event/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Update Event' }));
    await waitFor(() => expect(updateEquipmentRequest).toHaveBeenCalledWith(record.id, {
      eventId: record.eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }],
    }));
  });

  /** EQUIP-REQUEST-10-N: a submitted event is excluded from the create picker and can only be updated. */
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
      { ...event, id: 'confirmed-event', name: 'Confirmed', status: 'confirmed' },
    ]);
    renderEditor('/equipment/requests/create');
    const picker = await screen.findByRole('combobox', { name: /Event/ });
    expect(picker).toHaveValue('');
    expect(picker.querySelectorAll('option')).toHaveLength(2);
    expect(screen.getByRole('option', { name: event.name })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Cancelled' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Rejected' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Confirmed' })).not.toBeInTheDocument();
  });

  /** EQUIP-REQUEST-01-N: if editor data cannot load, the user can return to the request list. */
  it('provides a fallback message when request form data cannot be loaded', async () => {
    vi.mocked(getAssignedEvents).mockRejectedValue('offline');
    renderEditor('/equipment/requests/create');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load equipment request details.');
    expect(screen.getByRole('link', { name: 'Back to My Equipment Requests' })).toBeInTheDocument();
  });

  /** EQUIP-REQUEST-01-SUP-LOAD: API errors preserve their actionable message when the editor event list cannot load. */
  it('shows the API error message when loading editor data rejects with an Error', async () => {
    vi.mocked(getAssignedEvents).mockRejectedValue(new Error('Events unavailable'));
    renderEditor('/equipment/requests/create');
    expect(await screen.findByRole('alert')).toHaveTextContent('Events unavailable');
  });

  /** EQUIP-REQUEST-10-SUP-ACCESS: users without coordinator access cannot load the request form. */
  it('refuses to render the request form for a non-coordinator', () => {
    mocks.user.role = 'technical-support';
    renderEditor('/equipment/requests/create');
    expect(screen.getByRole('alert')).toHaveTextContent('Coordinator access required.');
    expect(screen.queryByRole('combobox', { name: /Event/ })).not.toBeInTheDocument();
  });

  /** EQUIP-REQUEST-01-SUP-LOAD: a late load failure after leaving the editor does not update an unmounted page. */
  it('ignores a load failure that arrives after the editor is unmounted', async () => {
    let rejectEvents!: (reason: unknown) => void;
    vi.mocked(getAssignedEvents).mockImplementation(() => new Promise((_, reject) => { rejectEvents = reject; }));
    vi.mocked(getMyEquipmentRequests).mockImplementation(() => new Promise(() => {}));
    const view = renderEditor('/equipment/requests/create');
    view.unmount();
    rejectEvents(new Error('Late failure'));
    await waitFor(() => expect(getAssignedEvents).toHaveBeenCalled());
  });

  /** EQUIP-REQUEST-01-SUP-LOAD: late successful data is ignored after navigating away from the editor. */
  it('ignores loaded editor data that arrives after the page is unmounted', async () => {
    let resolveEvents!: (value: EquipmentRequestEvent[]) => void;
    let resolveRequests!: (value: EquipmentRequestRecord[]) => void;
    vi.mocked(getAssignedEvents).mockImplementation(() => new Promise((resolve) => { resolveEvents = resolve; }));
    vi.mocked(getMyEquipmentRequests).mockImplementation(() => new Promise((resolve) => { resolveRequests = resolve; }));
    const view = renderEditor('/equipment/requests/create');
    view.unmount();
    resolveEvents([event]);
    resolveRequests([]);
    await waitFor(() => expect(getMyEquipmentRequests).toHaveBeenCalled());
  });

  /** EQUIP-REQUEST-10-A: Cancel from the separate editor returns to My Equipment Requests. */
  it('navigates back to the request list from the separate editor page', async () => {
    const user = userEvent.setup();
    renderEditor('/equipment/requests/create');
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('My Equipment Requests list')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/equipment/requests');
  });

  /** EQUIP-REQUEST-10-SUP-LIFECYCLE: direct navigation cannot expose an editor for a closed event. */
  it.each(['Confirmed', 'Cancelled', 'Rejected'] as const)('refuses to render an update form after the event is %s', async (eventStatus) => {
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([{ ...record, eventStatus }]);
    renderEditor(`/equipment/requests/${record.id}/update`);
    expect(await screen.findByRole('alert')).toHaveTextContent(new RegExp(`event is ${eventStatus.toLowerCase()}`));
    expect(screen.queryByRole('textbox', { name: /Equipment name/ })).not.toBeInTheDocument();
  });

  /** EQUIP-REQUEST-10-SUP-ACCESS: an unknown or non-owned request is not exposed for editing. */
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
