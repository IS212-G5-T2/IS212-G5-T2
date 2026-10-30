import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEquipmentRequestQueue, getMyEquipmentRequests, reserveEquipmentRequest } from '../../api/equipment-requests-api';
import { EquipmentRequestsPage } from './EquipmentRequestsPage';

const mocks = vi.hoisted(() => ({ user: { role: 'coordinator', id: 'coord-1' } }));
vi.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (state: { currentUser: typeof mocks.user }) => unknown) => selector({ currentUser: mocks.user }),
}));
vi.mock('../../api/equipment-requests-api', () => ({
  getEquipmentRequestQueue: vi.fn(), getMyEquipmentRequests: vi.fn(), reserveEquipmentRequest: vi.fn(),
}));

const record = {
  id: 'request-1', reference: 'ER-12345678', eventId: 'event-1', eventName: 'Showcase',
  eventStart: '2030-02-03T10:00:00.000Z', eventEnd: '2030-02-03T12:00:00.000Z', expectedAttendance: 120,
  status: 'Pending Review' as const, eventStatus: 'Planning' as const, requestedBy: 'coord-1', coordinatorName: 'Coordinator', createdAt: '2030-02-03T10:00:00.000Z',
  items: [{ id: 'item-1', equipmentName: 'Microphone', equipmentType: 'Audio' as const, quantity: 1, availableQuantity: 2, sufficient: true }],
};

function renderPage(path = '/equipment/requests') {
  return render(<MemoryRouter initialEntries={[path]}><EquipmentRequestsPage /></MemoryRouter>);
}
function setRole(role: string) { mocks.user.role = role; }

beforeEach(() => {
  vi.clearAllMocks();
  setRole('coordinator');
  vi.mocked(getMyEquipmentRequests).mockResolvedValue([record]);
  vi.mocked(getEquipmentRequestQueue).mockResolvedValue([]);
  vi.mocked(reserveEquipmentRequest).mockResolvedValue({ kind: 'reserved', id: record.id, requestReference: record.reference });
});

describe('SPM-57 equipment request list and queue', () => {
  /** EQUIP-REQUEST-05-A: the request list offers a prominent link to a dedicated create page. */
  it('shows submitted requests and a prominent create link without rendering a form inline', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'My Equipment Requests' })).toBeInTheDocument();
    expect(await screen.findByText(record.reference)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create Equipment Request/ })).toHaveAttribute('href', '/equipment/requests/create');
    expect(screen.queryByRole('textbox', { name: /Equipment name/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Event/ })).not.toBeInTheDocument();
  });

  /** EQUIP-REQUEST-01-A: an explicitly selected event is preserved while navigating to create. */
  it('carries a preselected event through the create-page link', async () => {
    renderPage('/equipment/requests?eventId=event%20%26%201');
    expect(await screen.findByRole('link', { name: /Create Equipment Request/ }))
      .toHaveAttribute('href', '/equipment/requests/create?eventId=event%20%26%201');
  });

  /** EQUIP-REQUEST-10-A: Update Event opens the request-specific editor route. */
  it('links the existing request to its separate prefilled update route', async () => {
    renderPage();
    expect(await screen.findByText(record.reference)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Update Event' })).toHaveAttribute('href', `/equipment/requests/${record.id}/update`);
    expect(screen.queryByRole('textbox', { name: /Equipment name/ })).not.toBeInTheDocument();
  });

  /** EQUIP-REQUEST-10-SUP-LIFECYCLE: an existing request remains editable after review status changes while its event is still open. */
  it('shows Update Event when the request is Reserved and its event is still Planning', async () => {
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([{ ...record, status: 'Reserved' as never, eventStatus: 'Planning' }]);
    renderPage();
    expect(await screen.findByText(record.reference)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Update Event' })).toHaveAttribute('href', `/equipment/requests/${record.id}/update`);
  });

  /** EQUIP-REQUEST-10-SUP-LIFECYCLE: only open event statuses can be opened from the update action. */
  it.each(['Confirmed', 'Cancelled', 'Rejected'] as const)('hides Update Event once the event is %s', async (eventStatus) => {
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([{ ...record, eventStatus }]);
    renderPage();
    expect(await screen.findByText(record.reference)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Update Event' })).not.toBeInTheDocument();
  });

  /** EQUIP-REQUEST-10-A: an existing request is changed through Update Event, never a second inline submission form. */
  it('provides an update path for an existing request and not a second inline submission form', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Update Event' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create Equipment Request/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit Request' })).not.toBeInTheDocument();
  });

  /** EQUIP-REQUEST-07-A: Technical Support sees the review queue, not coordinator actions. */
  it('loads the Technical Support review queue without coordinator actions', async () => {
    setRole('tech_support');
    vi.mocked(getEquipmentRequestQueue).mockResolvedValue([record]);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Equipment Review Queue' })).toBeInTheDocument();
    expect(await screen.findByText('Pending Review')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Review request' }));
    expect(screen.getByText(/Microphone · Audio × 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close review' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('link', { name: /Create Equipment Request/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Update Event' })).not.toBeInTheDocument();
    expect(getEquipmentRequestQueue).toHaveBeenCalledOnce();
    expect(getMyEquipmentRequests).not.toHaveBeenCalled();
  });

  /** SPM-58: Technical Support opens a request, reviews requested/free quantities, and approves it into reservations. */
  it('opens the request review and approves the request for reservation', async () => {
    const user = userEvent.setup();
    setRole('tech_support');
    vi.mocked(getEquipmentRequestQueue).mockResolvedValueOnce([record]).mockResolvedValueOnce([]);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Review request' }));
    expect(screen.getByRole('region', { name: 'Technical Support review queue' })).toHaveTextContent('2 available for this event period; 1 requested.');
    await user.click(screen.getByRole('button', { name: 'Approve & reserve' }));
    expect(reserveEquipmentRequest).toHaveBeenCalledWith(record.id);
    expect(await screen.findByText('No equipment requests to display.')).toBeInTheDocument();
  });

  /** SPM-58: the review screen cannot submit approval when an item exceeds available stock. */
  it('disables approval when requested quantity exceeds event-period availability', async () => {
    const user = userEvent.setup();
    setRole('tech_support');
    vi.mocked(getEquipmentRequestQueue).mockResolvedValue([{ ...record, items: [{ ...record.items[0], availableQuantity: 0, sufficient: false }] }]);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Review request' }));
    expect(screen.getByRole('button', { name: 'Approve & reserve' })).toBeDisabled();
  });

  /** EQUIP-REQUEST-06-A: an empty coordinator list gives a useful empty state. */
  it('shows the empty request state', async () => {
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No equipment requests to display.')).toBeInTheDocument();
  });

  /** EQUIP-REQUEST-06-SUP-READ: list read failures are visible and do not present fabricated request data. */
  /** EQUIP-REQUEST-06-SUP-READ: a list read failure displays an error without an inline form. */
  it('shows an error when the request list cannot load', async () => {
    vi.mocked(getMyEquipmentRequests).mockRejectedValue(new Error('List failed'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('List failed');
    expect(screen.queryByText(record.reference)).not.toBeInTheDocument();
  });

  /** EQUIP-REQUEST-06-SUP-READ: non-Error failures also receive a safe list fallback. */
  it('shows a safe fallback when the request list fails without an Error object', async () => {
    vi.mocked(getMyEquipmentRequests).mockRejectedValue('offline');
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load equipment requests.');
  });

  /** EQUIP-REQUEST-06-SUP-READ: a failed list refresh clears the previous content after the view's data source changes. */
  it('clears previously loaded request cards when a role-specific refresh fails', async () => {
    const { rerender } = renderPage();
    expect(await screen.findByText(record.reference)).toBeInTheDocument();
    vi.mocked(getEquipmentRequestQueue).mockRejectedValue(new Error('Queue failed'));
    setRole('tech_support');
    rerender(<MemoryRouter initialEntries={['/equipment/requests']}><EquipmentRequestsPage /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Queue failed');
    expect(screen.queryByText(record.reference)).not.toBeInTheDocument();
    expect(screen.getByText('No equipment requests to display.')).toBeInTheDocument();
  });

  /** EQUIP-REQUEST-05-A: submission opens a reference-bearing dialog that closes only on OK. */
  it('keeps the submitted confirmation dialog open until OK is clicked', async () => {
    const user = userEvent.setup();
    renderPage('/equipment/requests?submitted=ER-12345678');
    const dialog = await screen.findByRole('dialog', { name: 'Equipment request submitted' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('ER-12345678')).toBeInTheDocument();
    expect(within(dialog).getByText('Status: Pending Review.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'OK' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'OK' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'OK' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Equipment request submitted' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /** EQUIP-REQUEST-10-A: update confirmation exposes the unchanged reference and requires OK. */
  it('keeps the updated confirmation dialog open until OK is clicked', async () => {
    const user = userEvent.setup();
    renderPage('/equipment/requests?updated=ER-12345678');
    const dialog = await screen.findByRole('dialog', { name: 'Equipment request updated' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('ER-12345678')).toBeInTheDocument();
    expect(within(dialog).queryByText('Status: Pending Review.')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
