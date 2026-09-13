import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Routes, Route } from 'react-router-dom';
import { DraftRequestPage } from '@/pages/DraftRequestPage';
import { MyRequestsPage } from '@/pages/MyRequestsPage';
import { eventRequests } from '@/api/eventRequests';
import { emptyDraft } from '@/types/eventRequest';
import type { EventRequest } from '@/types/eventRequest';

vi.mock('@/api/eventRequests', () => ({ eventRequests: { get: vi.fn(), list: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
describe('SPM-37 request routes', () => {
  // Moving to another draft ignores an older response so details from the previous draft cannot replace the current screen.
  it('AC3 ignores a late response from a previously opened draft', async () => {
    // Hold back the first draft response and prepare a second draft that loads immediately.
    let finishFirst!: (value: EventRequest) => void;
    const second: EventRequest = { id: 'second', status: 'draft', fields: { ...emptyDraft, name: 'Current draft' }, version: 1, organisationId: 'org', organiserId: 'owner', createdAt: '', updatedAt: '' };
    vi.mocked(eventRequests.get).mockReturnValueOnce(new Promise(resolve => { finishFirst = resolve; }))
      .mockResolvedValueOnce(second);
    render(<MemoryRouter initialEntries={['/requests/first']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Link to="/requests/second">Open second draft</Link>
      <Routes><Route path="/requests/:id" element={<DraftRequestPage />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(screen.getByText('Open second draft'));
    expect(await screen.findByLabelText(/Event name/)).toHaveValue('Current draft');
    await act(async () => { finishFirst({ ...second, id: 'first', fields: { ...emptyDraft, name: 'Previous draft' } }); });
    expect(screen.getByLabelText(/Event name/)).toHaveValue('Current draft');
    expect(screen.queryByText('Loading request…')).not.toBeInTheDocument();
  });
  const show = () => render(<MemoryRouter initialEntries={['/requests/test']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/requests/:id" element={<DraftRequestPage />} /></Routes>
  </MemoryRouter>);
  // An organiser denied access through a direct link cannot see the draft form or any private request values.
  it('AC7 renders no form or private values on a denied direct URL', async () => {
    // Make the direct request fail as it would for an unrelated organisation.
    vi.mocked(eventRequests.get).mockRejectedValue(new Error('Request not found.'));
    show(); await screen.findByRole('alert');
    expect(screen.queryByLabelText(/Event name/)).not.toBeInTheDocument();
  });
  // A submitted request shows guidance for requesting changes and does not offer draft editing controls.
  it('AC8 does not expose draft controls for a submitted request', async () => {
    // Return a request that has already reached Submitted status.
    vi.mocked(eventRequests.get).mockResolvedValue({ id: 'test', status: 'submitted', fields: emptyDraft, version: 1, organisationId: 'org', organiserId: 'owner', createdAt: '', updatedAt: '' });
    show();
    await screen.findByText(/Further changes must follow/);
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Event name/)).not.toBeInTheDocument();
  });
  // A saved draft appears in My Requests with a link that reopens that specific request.
  it('AC3 lists a saved draft with a reopen link', async () => {
    // Return one saved draft from the organiser's request list.
    vi.mocked(eventRequests.list).mockResolvedValue([{ id: 'test', status: 'draft', fields: { ...emptyDraft, name: 'My workshop' }, version: 1, organisationId: 'org', organiserId: 'owner', createdAt: '', updatedAt: new Date().toISOString() }]);
    render(<MemoryRouter initialEntries={[{ pathname: '/events', state: { saved: true, savedRequestId: 'test' } }]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MyRequestsPage /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /My workshop/ })).toHaveAttribute('href', '/requests/test');
  });
});
    // Open the first route, then move to the second draft before the first response returns.
    // Check that the second draft is displayed.
    // Release the old response and confirm it cannot replace the draft currently on screen.
    // Open the direct route and check that no private form fields are rendered.
    // Open it and check that change guidance appears instead of draft editing controls.
    // Display My Requests and check that the card links to the correct saved draft.
