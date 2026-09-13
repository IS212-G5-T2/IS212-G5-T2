import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DraftRequestForm } from '@/components/domain/DraftRequestForm';
import { eventRequests, RequestError } from '@/api/eventRequests';
import { emptyDraft } from '@/types/eventRequest';
import type { EventRequest } from '@/types/eventRequest';

vi.mock('@/api/eventRequests', async importOriginal => {
  const original = await importOriginal<typeof import('@/api/eventRequests')>();
  return { ...original, eventRequests: { save: vi.fn() } };
});
const initial: EventRequest = { id: '8c119ec3-7895-4df1-9fea-d884b6770960', organisationId: 'org', organiserId: 'owner',
  status: 'draft', fields: { ...emptyDraft, name: 'Saved draft' }, version: 1, createdAt: '', updatedAt: '' };
beforeEach(() => vi.clearAllMocks());
const show = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DraftRequestForm initial={initial} /></MemoryRouter>);
describe('SPM-37 draft form', () => {
  // Trying to submit an empty form highlights every mandatory field and does not save anything.
  it('AC2 marks required fields and identifies missing values without saving on submission', () => {
    // Display a saved draft whose mandatory fields are mostly empty.
    show();
    // Confirm the event name is marked as mandatory and whitespace does not count as an answer.
    expect(screen.getByLabelText(/Event name/)).toBeRequired();
    fireEvent.change(screen.getByLabelText(/Event name/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit event request' }));
    expect(screen.getByLabelText(/Event name/)).toHaveFocus();
    expect(screen.getByLabelText(/Event name/)).toHaveAccessibleDescription('Please fill in Event name.');
    expect(screen.getByLabelText(/Expected attendance/)).toHaveAttribute('aria-invalid', 'true');
    expect(eventRequests.save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Event name/), { target: { value: 'Fixed' } });
    expect(screen.getByLabelText(/Event name/)).toHaveAttribute('aria-invalid', 'false');
  });
  // An organiser can save unfinished work as a draft even after the form reports missing submission details.
  it('AC2 allows an incomplete draft after a failed submission validation', async () => {
    // Make the test save endpoint return an updated draft.
    vi.mocked(eventRequests.save).mockResolvedValue({ ...initial, version: 2 });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Submit event request' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved successfully.');
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(eventRequests.save).toHaveBeenCalledOnce();
  });
  // Zero attendees and choosing No for registration are valid answers, but the unavailable submission flow must not claim success.
  it('AC2 accepts zero attendance and No registration as filled without claiming submission success', () => {
    // Prepare a request with every mandatory field answered, including valid zero and No values.
    const complete = { ...initial, fields: { name: 'Event', purpose: 'Meeting', description: 'Details', startDateTime: '2026-10-01T10:00', endDateTime: '2026-10-01T11:00', expectedAttendance: 0, venueRequirements: 'Room', accessibilityNeeds: 'None', layout: 'Boardroom', equipmentRequirements: 'None', registrationEnabled: false } };
    render(<MemoryRouter><DraftRequestForm initial={complete} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Submit event request' }));
    expect(screen.getByRole('alert')).toHaveTextContent('event submission is not available yet');
    expect(screen.getByLabelText(/attendees register for event through the system/)).toHaveAttribute('aria-invalid', 'false');
    expect(eventRequests.save).not.toHaveBeenCalled();
  });
  // Reopening an incomplete draft shows its saved values and allows it to be saved again without completing mandatory fields.
  it('AC2/3 prefills and saves with incomplete required fields', async () => {
    // Make the save endpoint return the next version of the same draft.
    vi.mocked(eventRequests.save).mockResolvedValue({ ...initial, version: 2 });
    show();
    expect(screen.getByLabelText(/Event name/)).toHaveValue('Saved draft');
    expect(screen.getByLabelText(/Expected attendance/)).toHaveValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved successfully.');
    expect(eventRequests.save).toHaveBeenCalledWith(initial.id, initial.fields, 1, expect.any(String));
  });
  // Repeated saves update the same draft with the latest values instead of creating another request.
  it('AC4 updates the same id using the returned version', async () => {
    // Save once so the form receives the next draft version.
    vi.mocked(eventRequests.save).mockResolvedValue({ ...initial, version: 2 });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved successfully.');
    fireEvent.change(screen.getByLabelText(/Event name/), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(eventRequests.save).toHaveBeenCalledTimes(2));
    expect(vi.mocked(eventRequests.save).mock.calls[1]).toEqual([initial.id, { ...initial.fields, name: 'Changed' }, 2, expect.any(String)]);
  });
  // If a save response is lost, the organiser's work remains visible and retrying safely repeats the same save.
  it('AC6 retains values and retries the exact operation after network failure', async () => {
    // Make the first save fail like a lost network response and the retry succeed.
    vi.mocked(eventRequests.save).mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({ ...initial, version: 2 });
    show();
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Keep my work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText(/Description/)).toHaveValue('Keep my work');
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await screen.findByText('Draft saved successfully.');
    expect(vi.mocked(eventRequests.save).mock.calls[1]).toEqual(vi.mocked(eventRequests.save).mock.calls[0]);
    expect(screen.getByLabelText(/Description/)).toBeEnabled();
  });
  // The form becomes read-only when the saved request has already been submitted or changed elsewhere.
  it('AC8 disables editing if the server reports a submission or stale version', async () => {
    // Make the server report that this draft can no longer be edited.
    vi.mocked(eventRequests.save).mockRejectedValue(new RequestError(409, 'This request has changed or been submitted. Reopen it before editing.'));
    show(); fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText(/Event name/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  });
  // A failed save surfaces its message in a dismissible pop-up dialog while keeping the entered values.
  it('AC6 shows save errors in a pop-up dialog and retains values for retry', async () => {
    // Make the first save fail so the error dialog appears.
    vi.mocked(eventRequests.save).mockRejectedValueOnce(new Error('Network unavailable'));
    show();
    fireEvent.change(screen.getByLabelText(/Event name/), { target: { value: 'Kept name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    // The error is announced inside a modal dialog.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Network unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable');
    // Clicking OK closes the dialog, keeps the entered values and leaves a retry available.
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText(/Event name/)).toHaveValue('Kept name');
    expect(screen.getByRole('button', { name: 'Retry save' })).toBeEnabled();
  });
  // Every save failure surfaces the correct pop-up message and either offers a retry or locks the form.
  const failures: [string, Error, string, string | null][] = [
    // [label, thrown error, expected dialog text, retry button label or null when the form locks]
    ['network failure (case 1)', new Error('Cannot reach the event request service. Start the backend and try again.'), 'Cannot reach the event request service', 'Retry save'],
    ['unrecognised status 503/500 (case 2)', new RequestError(503, 'The request could not be completed. Please retry.'), 'Something went wrong while saving your draft', 'Retry save'],
    ['invalid payload 400 (case 3)', new RequestError(400, 'Some draft values are invalid. Check your entries and try again.'), 'values are invalid', 'Save draft'],
    ['request not found 404 (case 4)', new RequestError(404, 'Request not found.'), 'Request not found', null],
    ['conflict 409 (cases 5/6/7)', new RequestError(409, 'This request has changed or been submitted. Reopen it before editing.'), 'changed or been submitted', null],
  ];
  it.each(failures)('AC6 shows the right pop-up for %s', async (_label, error, text, retryLabel) => {
    // Reject the save with the error for this case and open the form.
    vi.mocked(eventRequests.save).mockRejectedValue(error);
    show();
    fireEvent.change(screen.getByLabelText(/Event name/), { target: { value: 'Kept name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    // The matching message appears inside the error dialog.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(text);
    // Acknowledge it and confirm values remain, then either a retry is offered or the form is locked.
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText(/Event name/)).toHaveValue('Kept name');
    if (retryLabel) expect(screen.getByRole('button', { name: retryLabel })).toBeEnabled();
    else expect(screen.getByLabelText(/Event name/)).toBeDisabled();
  });
  // A successful save shows a confirmation pop-up whose OK button redirects to the My Requests page.
  it('AC6 confirms a successful save in a pop-up and redirects to My Requests on OK', async () => {
    vi.mocked(eventRequests.save).mockResolvedValue({ ...initial, version: 2 });
    render(<MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<DraftRequestForm initial={initial} />} />
        <Route path="/events" element={<div>My Requests Page</div>} />
      </Routes>
    </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    // The confirmation appears in a dialog and does not navigate away until acknowledged.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Draft saved successfully.');
    expect(screen.queryByText('My Requests Page')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByText('My Requests Page')).toBeInTheDocument();
  });
  // Pressing save more than once while a save is in progress sends only one request.
  it('AC4 does not start duplicate saves while a request is pending', () => {
    // Keep the first save pending so repeated clicks happen while it is still running.
    vi.mocked(eventRequests.save).mockReturnValue(new Promise(() => undefined));
    show();
    fireEvent.submit(screen.getByRole('button', { name: 'Save draft' }).closest('form')!);
    fireEvent.submit(screen.getByRole('button', { name: 'Saving…' }).closest('form')!);
    expect(eventRequests.save).toHaveBeenCalledTimes(1);
  });
});
    // Try to submit and check that errors point to the missing fields without calling the save API.
    // Enter a real value and check that this field's error disappears immediately.
    // First trigger missing-field errors, then choose Save draft instead.
    // Check that the incomplete draft saves successfully and old validation errors are cleared.
    // Try to submit the complete request.
    // Check that no field is rejected and the unfinished submission feature does not claim success or save a draft.
    // Reopen the draft and check that its saved name and missing attendance are shown correctly.
    // Save it again and confirm the same request, values and current version are sent.
    // Change the event name and save the same form again.
    // Confirm the second save uses the same request ID, latest values and returned version.
    // Enter work, save it and check that the failed request leaves the work in the form.
    // Retry and confirm the exact same save operation is sent without disabling the form afterward.
    // Attempt a save and wait for the conflict message.
    // Check that both the fields and save button are locked against further draft edits.
    // Submit the form twice in quick succession.
    // Check that only one save request was sent.
