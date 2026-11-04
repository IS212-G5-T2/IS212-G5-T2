import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEquipmentRequestQueue, getMyEquipmentRequests, markRequestCannotProvide, reserveEquipmentRequest } from '../../api/equipment-requests-api';
import { EquipmentRequestsPage } from './EquipmentRequestsPage';

const mocks = vi.hoisted(() => ({ user: { role: 'coordinator', id: 'coord-1' } }));
vi.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (state: { currentUser: typeof mocks.user }) => unknown) => selector({ currentUser: mocks.user }),
}));
vi.mock('../../api/equipment-requests-api', () => ({
  getEquipmentRequestQueue: vi.fn(), getMyEquipmentRequests: vi.fn(), reserveEquipmentRequest: vi.fn(), markRequestCannotProvide: vi.fn(),
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
  vi.mocked(markRequestCannotProvide).mockResolvedValue({ kind: 'cannot-provided', id: record.id, requestReference: record.reference });
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

  /** Technical Support opens a request, reviews requested/free quantities, and approves it into reservations. */
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

  /** EQUIP-RESERVE-08-A: Technical Support marks a request Cannot provide, which requires a reason. */
  it('requires a reason before marking a request Cannot provide, then submits it', async () => {
    const user = userEvent.setup();
    setRole('tech_support');
    vi.mocked(getEquipmentRequestQueue).mockResolvedValueOnce([record]).mockResolvedValueOnce([]);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Review request' }));
    await user.click(screen.getByRole('button', { name: 'Cannot provide' }));
    await user.click(screen.getByRole('button', { name: 'Confirm cannot provide' }));
    expect(markRequestCannotProvide).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a reason');
    await user.type(screen.getByLabelText(/Reason/), 'Only 8 available; 10 requested.');
    await user.click(screen.getByRole('button', { name: 'Confirm cannot provide' }));
    expect(markRequestCannotProvide).toHaveBeenCalledWith(record.id, 'Only 8 available; 10 requested.');
    expect(await screen.findByText('No equipment requests to display.')).toBeInTheDocument();
  });

  /** cancelling the Cannot provide prompt closes it without submitting. */
  it('closes the Cannot provide prompt on Cancel without marking the request', async () => {
    const user = userEvent.setup();
    setRole('tech_support');
    vi.mocked(getEquipmentRequestQueue).mockResolvedValue([record]);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Review request' }));
    await user.click(screen.getByRole('button', { name: 'Cannot provide' }));
    expect(screen.getByLabelText(/Reason/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText(/Reason/)).not.toBeInTheDocument();
    expect(markRequestCannotProvide).not.toHaveBeenCalled();
  });

  /** a non-Error rejection shows the generic Cannot provide failure message. */
  it('shows a generic message when Cannot provide rejects with a non-Error value', async () => {
    const user = userEvent.setup();
    setRole('tech_support');
    vi.mocked(getEquipmentRequestQueue).mockResolvedValue([record]);
    vi.mocked(markRequestCannotProvide).mockRejectedValue('offline');
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Review request' }));
    await user.click(screen.getByRole('button', { name: 'Cannot provide' }));
    await user.type(screen.getByLabelText(/Reason/), 'No stock');
    await user.click(screen.getByRole('button', { name: 'Confirm cannot provide' }));
    expect(await screen.findByText('Could not mark this request as Cannot provide.')).toBeInTheDocument();
  });

  /** EQUIP-RESERVE-09-A: the event coordinator sees the Cannot Provide status and its reason on their request. */
  it('shows the Cannot Provide status and reason to the coordinator', async () => {
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([{ ...record, status: 'Cannot Provide', decisionReason: 'Only 8 available; 10 requested.' }]);
    renderPage();
    expect(await screen.findByText('Cannot Provide')).toBeInTheDocument();
    expect(screen.getByText(/Only 8 available; 10 requested\./)).toBeInTheDocument();
  });

  /** the review screen cannot submit approval when an item exceeds available stock. */
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

describe('equipment review queue error and fallback paths', () => {
  const noStockInfoItem = { id: 'item-2', equipmentName: 'Speaker', equipmentType: 'Audio' as const, quantity: 3 };

  async function openReview(user: ReturnType<typeof userEvent.setup>) {
    setRole('tech_support');
    await user.click(await screen.findByRole('button', { name: 'Review request' }));
  }

  /** Approve failure with an Error shows that error's message and keeps the request listed. */
  it('shows the server message when reserving fails with an Error', async () => {
    const user = userEvent.setup();
    vi.mocked(getEquipmentRequestQueue).mockResolvedValue([record]);
    vi.mocked(reserveEquipmentRequest).mockRejectedValue(new Error('Stock changed'));
    setRole('tech_support');
    renderPage();
    await openReview(user);
    await user.click(screen.getByRole('button', { name: 'Approve & reserve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Stock changed');
    expect(screen.getByText(record.reference)).toBeInTheDocument();
  });

  /** Approve failure without an Error shows the generic reserve message. */
  it('shows a generic message when reserving rejects with a non-Error value', async () => {
    const user = userEvent.setup();
    vi.mocked(getEquipmentRequestQueue).mockResolvedValue([record]);
    vi.mocked(reserveEquipmentRequest).mockRejectedValue('offline');
    renderPage();
    await openReview(user);
    await user.click(screen.getByRole('button', { name: 'Approve & reserve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reserve equipment for this event.');
  });

  /** Cannot provide failure with an Error shows that error's message in the prompt. */
  it('shows the server message when Cannot provide fails with an Error', async () => {
    const user = userEvent.setup();
    vi.mocked(getEquipmentRequestQueue).mockResolvedValue([record]);
    vi.mocked(markRequestCannotProvide).mockRejectedValue(new Error('Already decided'));
    renderPage();
    await openReview(user);
    await user.click(screen.getByRole('button', { name: 'Cannot provide' }));
    await user.type(screen.getByLabelText(/Reason/), 'No stock');
    await user.click(screen.getByRole('button', { name: 'Confirm cannot provide' }));
    expect(await screen.findByText('Already decided')).toBeInTheDocument();
  });

  /** The review toggle collapses the details again. */
  it('closes the review details when Close review is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(getEquipmentRequestQueue).mockResolvedValue([record]);
    renderPage();
    await openReview(user);
    expect(screen.getByRole('button', { name: 'Approve & reserve' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close review' }));
    expect(screen.queryByRole('button', { name: 'Approve & reserve' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review request' })).toHaveAttribute('aria-expanded', 'false');
  });

  /** An item without stock figures is treated as fully available: requested quantity is shown and approval is enabled. */
  it('treats an item with no availability figures as sufficient', async () => {
    const user = userEvent.setup();
    vi.mocked(getEquipmentRequestQueue).mockResolvedValue([{ ...record, items: [noStockInfoItem] }]);
    renderPage();
    await openReview(user);
    expect(screen.getByText('3 available for this event period; 3 requested.')).toHaveClass('text-green-700');
    expect(screen.getByRole('button', { name: 'Approve & reserve' })).toBeEnabled();
  });

  /** An item with availableQuantity but no sufficient flag is judged from the quantities. */
  it('derives sufficiency from the available quantity when the flag is absent', async () => {
    const user = userEvent.setup();
    vi.mocked(getEquipmentRequestQueue).mockResolvedValue([{ ...record, items: [{ ...noStockInfoItem, availableQuantity: 1 }] }]);
    renderPage();
    await openReview(user);
    expect(screen.getByText('1 available for this event period; 3 requested.')).toHaveClass('text-red-700');
    expect(screen.getByRole('button', { name: 'Approve & reserve' })).toBeDisabled();
  });
});

// SPM-172 AC3: the bell's equipment decision notice opens /equipment/requests?request=<id>. The Coordinator's own list
// highlights that request (status and, for Cannot Provide, the reason are already on each card). Fixture API, store
// user set directly: frontend unit tests, not a live login.
describe('SPM-172 equipment request opened from a decision notice', () => {
  const other = { ...record, id: 'request-2', reference: 'ER-87654321', eventName: 'Other Fair' };
  const scrollIntoView = vi.fn();
  beforeEach(() => {
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  /**
   * EQUIP-REQ-NOTIF-03-F (SPM-172 AC3): /equipment/requests?request=request-2 highlights that request only (marked
   * aria-current, with the ring highlight), scrolls it into view and leaves the other request unmarked and unringed.
   * Kills: highlighting every card, the first card, or none; no visible ring; not scrolling.
   */
  it('EQUIP-REQ-NOTIF-03-F highlights and scrolls to the linked request only', async () => {
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([record, other]);
    renderPage('/equipment/requests?request=request-2');

    const linked = (await screen.findByText('Other Fair')).closest('[aria-current]')!;
    expect(linked).toHaveAttribute('aria-current', 'true');
    expect(linked).toHaveTextContent('ER-87654321');
    expect(screen.getByText('Showcase').closest('[aria-current]')).toBeNull();
    // The visible highlight (not just the marker) is on the linked card only.
    expect(linked).toHaveClass('ring-2', 'ring-primary-500');
    expect(document.querySelectorAll('.ring-2')).toHaveLength(1);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(linked);
  });

  /**
   * EQUIP-REQ-NOTIF-03-F (continued, SPM-172 AC3): the linked request is scrolled to once; a later refresh (here after
   * Technical Support reserves another request) keeps it highlighted but does not scroll again.
   * Kills: an effect that re-scrolls on every refresh.
   */
  it('EQUIP-REQ-NOTIF-03-F does not scroll to the linked request again after a later refresh', async () => {
    const user = userEvent.setup();
    setRole('tech_support');
    vi.mocked(getEquipmentRequestQueue).mockResolvedValueOnce([record, other]).mockResolvedValueOnce([other]);
    renderPage('/equipment/requests?request=request-2');

    expect(await screen.findByText('Other Fair')).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    await user.click(screen.getAllByRole('button', { name: 'Review request' })[0]);
    await user.click(screen.getByRole('button', { name: 'Approve & reserve' }));
    await waitFor(() => expect(screen.queryByText('Showcase')).not.toBeInTheDocument());
    expect(reserveEquipmentRequest).toHaveBeenCalledWith(record.id);
    expect(screen.getByText('Other Fair').closest('[aria-current]')).toHaveAttribute('aria-current', 'true');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  /**
   * EQUIP-REQ-NOTIF-03-G (SPM-172 AC3): the highlighted Cannot Provide request shows its status and the reason; a
   * highlighted Reserved request shows its status.
   * Kills: a highlight that hides the reason or the status.
   */
  it.each([
    ['Cannot Provide', 'Only 8 available; 10 requested.'],
    ['Reserved', null],
  ] as const)('EQUIP-REQ-NOTIF-03-G shows the %s status on the highlighted request', async (status, reason) => {
    vi.mocked(getMyEquipmentRequests).mockResolvedValue([{ ...record, status, decisionReason: reason }]);
    renderPage('/equipment/requests?request=request-1');

    const card = (await screen.findByText('Showcase')).closest('[aria-current="true"]') as HTMLElement;
    expect(within(card).getByText(status)).toBeInTheDocument();
    if (reason) expect(within(card).getByText(/Only 8 available; 10 requested\./)).toBeInTheDocument();
    else expect(within(card).queryByText(/Cannot provide:/)).not.toBeInTheDocument();
  });

  /**
   * EQUIP-REQ-NOTIF-03-H (SPM-172 AC3, robustness): a link to a request that is not in the Coordinator's list (the event
   * was reassigned) highlights nothing and says so.
   * Kills: highlighting an arbitrary card, a silent blank outcome.
   */
  it('EQUIP-REQ-NOTIF-03-H says the request is no longer available when it is not in the list', async () => {
    renderPage('/equipment/requests?request=request-gone');

    expect(await screen.findByText('That equipment request is no longer available to you.')).toBeInTheDocument();
    expect(screen.getByText('Showcase').closest('[aria-current]')).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  /**
   * EQUIP-REQ-NOTIF-03-I (SPM-172 AC3): without a request parameter nothing is highlighted and no notice is shown; while
   * the list is loading, or after it failed to load, a linked request is not reported as missing.
   * Kills: a permanent highlight, "no longer available" shown before the list arrives or after a failed load.
   */
  it('EQUIP-REQ-NOTIF-03-I shows no highlight or missing notice when the page has no request link', async () => {
    renderPage();
    expect(await screen.findByText('Showcase')).toBeInTheDocument();
    expect(document.querySelector('[aria-current]')).toBeNull();
    expect(screen.queryByText(/no longer available to you/)).not.toBeInTheDocument();
  });

  /** EQUIP-REQ-NOTIF-03-I (loading and failed-load half): the missing-request notice waits for a list that loaded. */
  it('EQUIP-REQ-NOTIF-03-I does not report a linked request missing while loading or when the list failed to load', async () => {
    vi.mocked(getMyEquipmentRequests).mockReturnValue(new Promise(() => {}));
    const view = renderPage('/equipment/requests?request=request-1');
    expect(await screen.findByRole('status')).toHaveTextContent('Loading equipment requests');
    expect(screen.queryByText(/no longer available to you/)).not.toBeInTheDocument();
    view.unmount();

    vi.mocked(getMyEquipmentRequests).mockRejectedValue(new Error('Boom'));
    renderPage('/equipment/requests?request=request-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    expect(screen.queryByText(/no longer available to you/)).not.toBeInTheDocument();
  });
});
