// SPM-64 frontend mutants (Request a Change to a Submitted Event, Organiser), run by run.mjs:
//   node scripts/testing/mutation/run.mjs --mutants spm64.mutants.mjs
//   node scripts/testing/mutation/run.mjs --mutants spm64.mutants.mjs --only K3
// Written under SPM-175 (4 Nov 2026). Each edit is [from, to]; `from` must occur exactly once in the file.
// No mutant is claimed equivalent. The backend mutants are in backend/scripts/mutation/spm64.mutants.mjs.
export const SUITES = {
  spm64: {
    args: [
      'run',
      'src/features/events/pages/change-requests',
      'src/features/events/pages/EventChangeRequestsPage.test.tsx',
      'src/features/events/pages/detail/EventDetailPage.changeRequest.test.tsx',
      'src/features/events/pages/list/EventListPage.test.tsx',
      'src/features/events/lib/changeRequests.test.ts',
      'src/features/events/api/change-requests-api.test.ts',
      'src/components/notifications/NotificationItem.test.tsx',
      'src/utils/sgtDate.test.ts',
    ],
  },
};

const FORM = 'src/features/events/pages/change-requests/RequestChangeForm.tsx';
const PAGE = 'src/features/events/pages/EventChangeRequestsPage.tsx';
const LIST_PAGE = 'src/features/events/pages/list/EventListPage.tsx';
const CARD = 'src/features/events/pages/list/EventCard.tsx';
const RULES = 'src/features/events/lib/changeRequests.ts';
const SGT = 'src/utils/sgtDate.ts';
const NOTICE = 'src/components/notifications/NotificationItem.tsx';
const LIST = 'src/features/events/pages/change-requests/ChangeRequestList.tsx';
const SUMMARY = 'src/features/events/pages/change-requests/ChangeRequestSummary.tsx';
const s = ['spm64'];

export const MUTANTS = [
  // AC1: the form sends only the fields that changed, with the reason; nothing to send keeps Submit disabled.
  { id: 'K1', name: 'unchanged text fields are sent too (01-B)', file: FORM,
    edits: [['    if (values[key].trim() !== baseline[key].trim()) changes[key] = values[key].trim();', '    changes[key] = values[key].trim();']], suites: s },
  { id: 'K2', name: 'the reason is not sent (01-B)', file: FORM,
    edits: [['      await onSubmit({ changes, ...(reason ? { reason } : {}) });', '      await onSubmit({ changes });']], suites: s },
  { id: 'K3', name: 'Submit enabled with nothing changed (01-E)', file: FORM,
    edits: [['        <Button type="submit" disabled={!hasChanges || saving}>', '        <Button type="submit" disabled={saving}>']], suites: s },
  { id: 'K4', name: 'invalid attendance is coerced instead of sent as typed (01-C)', file: FORM,
    edits: [['    changes.expectedAttendance = /^\\d+$/.test(text) ? Number(text) : text;', '    changes.expectedAttendance = Number(text);']], suites: s },
  // AC4: confirmation after submitting; Submit disabled while saving.
  { id: 'K5', name: 'no confirmation after submitting (04-A)', file: PAGE,
    edits: [['    setConfirmation(`Your change request for ${event!.name} has been submitted for review.`);', '']], suites: s },
  { id: 'K6', name: 'Submit stays enabled while saving (04-C)', file: FORM,
    edits: [['    if (!hasChanges || saving) return;', '    if (!hasChanges) return;'], ['        <Button type="submit" disabled={!hasChanges || saving}>', '        <Button type="submit" disabled={!hasChanges}>']], suites: s },
  { id: 'K7', name: 'a non-API failure shows no message (04-B)', file: FORM,
    edits: [['      } else setMessage("Could not submit your change request. Please try again.");', '      }']], suites: s },
  // AC6: server errors shown per field, values kept.
  { id: 'K8', name: 'server field errors are dropped (06-A)', file: FORM,
    edits: [['        setErrors(error.errors ?? {});', '        setErrors({});']], suites: s },
  // AC5, AC7, AC8: status shown on the dashboard; only open, not-started events; one pending request.
  { id: 'K9', name: 'the pending change request badge is never shown on the event card (05-A)', file: CARD,
    edits: [['              {changeRequestPending && (', '              {false && (']], suites: s },
  { id: 'K10', name: 'the pending requests load failure is hidden (05-F)', file: LIST_PAGE,
    edits: [['      {changeRequestError && !error && (', '      {false && (']], suites: s },
  { id: 'K11', name: 'a started event still offers a change request (01-F)', file: RULES,
    edits: [['  return CHANGE_REQUEST_OPEN_STATUSES.includes(event.status) && Date.parse(event.startDateTime) > now;', '  return CHANGE_REQUEST_OPEN_STATUSES.includes(event.status);']], suites: s },
  { id: 'K12', name: 'a Confirmed event is not offered a change request (01-F)', file: RULES,
    edits: [['export const CHANGE_REQUEST_OPEN_STATUSES: readonly EventStatus[] = ["submitted", "approved", "planning", "confirmed"];', 'export const CHANGE_REQUEST_OPEN_STATUSES: readonly EventStatus[] = ["submitted", "approved", "planning"];']], suites: s },
  { id: 'K13', name: 'a new request is offered while one is pending (01-H)', file: PAGE,
    edits: [['  const canRequest = isOwner && acceptsChangeRequests(event) && !pending;', '  const canRequest = isOwner && acceptsChangeRequests(event);']], suites: s },
  { id: 'K14', name: 'no confirmation after withdrawing (09-C)', file: PAGE,
    edits: [['    setConfirmation("Your change request was withdrawn.");', '']], suites: s },
  // REQ-CHANGE-07-A: the safety-check note only past approval.
  { id: 'K15', name: 'the safety check note shown for a Submitted event (07-A)', file: RULES,
    edits: [['const SAFETY_CHECK_STATUSES: readonly EventStatus[] = ["approved", "planning", "confirmed"];', 'const SAFETY_CHECK_STATUSES: readonly EventStatus[] = ["submitted", "approved", "planning", "confirmed"];']], suites: s },
  // AC3: the coordinator's notice opens the Change Requests page.
  { id: 'K16', name: 'the coordinator change request notice opens the event page (03-A)', file: NOTICE,
    edits: [['  "coordinator_change_request",\n', '']], suites: s },
  // REQ-CHANGE-01-SUP-SGT: times shown and entered in Singapore time.
  { id: 'K17', name: 'displayed times are not shifted to Singapore time (01-SUP-SGT)', file: SGT,
    edits: [['  const d = new Date(new Date(value).getTime() + SGT_OFFSET_MS);', '  const d = new Date(new Date(value).getTime());']], suites: s },
  { id: 'K18', name: 'noon shown as am (01-SUP-SGT boundary)', file: SGT,
    edits: [['${hours < 12 ? "am" : "pm"}', '${hours <= 12 ? "am" : "pm"}']], suites: s },
  { id: 'K19', name: 'a cross-midnight range names the date once (01-SUP-SGT)', file: SGT,
    edits: [['  return sgtDayKey(start) === sgtDayKey(end)\n', '  return true\n']], suites: s },
  { id: 'K20', name: 'form inputs are pre-filled in UTC, not Singapore time (01-SUP-SGT)', file: SGT,
    edits: [['  return new Date(date.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 16);', '  return new Date(date.getTime()).toISOString().slice(0, 16);']], suites: s },
  // REQ-CHANGE-05-SUP-LOAD: a superseded load never replaces the newer result (probe for the unmount-only tests).
  { id: 'K21', name: 'a superseded summary load still updates the event page (05-SUP-LOAD)', file: 'src/features/events/pages/change-requests/ChangeRequestSummary.tsx',
    edits: [['        if (active) setLatest(found);', '        setLatest(found);']], suites: s },
  { id: 'K22', name: 'a superseded Change Requests page load still updates the page (05-SUP-LOAD)', file: PAGE,
    edits: [['        if (!active) return;', '']], suites: s },
  { id: 'K23', name: 'a superseded pending-requests failure still shows the notice (05-F)', file: LIST_PAGE,
    edits: [['        if (!active) return;\n        setPendingChangeRequests(null);', '        setPendingChangeRequests(null);']], suites: s },
  { id: 'K24', name: 'a superseded summary failure is still shown (05-SUP-LOAD)', file: 'src/features/events/pages/change-requests/ChangeRequestSummary.tsx',
    edits: [['        if (active) setError("Could not load your change requests.");', '        setError("Could not load your change requests.");']], suites: s },
  { id: 'K25', name: 'a superseded Change Requests page failure is still shown (05-SUP-LOAD)', file: PAGE,
    edits: [['        if (active) setLoadError(', '        setLoadError(']], suites: s },
  // Added under SPM-175 so every SPM-64 test kills at least one measured mutant (G3).
  { id: 'K26', name: 'an empty request history says nothing (05-E)', file: LIST,
    edits: [['    return <p className="text-sm text-gray-500 dark:text-gray-400">No change requests for this event.</p>;', '    return <p className="text-sm text-gray-500 dark:text-gray-400"></p>;']], suites: s },
  { id: 'K27', name: 'a failed withdrawal shows no message (09-B)', file: LIST,
    edits: [['      setError(e instanceof Error ? e.message : "Could not withdraw this change request.");', '      setError("");']], suites: s },
  { id: 'K28', name: 'the event page shows a block before any request (05-E)', file: SUMMARY,
    edits: [['  if (!latest) return null;', '  if (!latest) return <p>No change requests yet.</p>;']], suites: s },
  { id: 'K29', name: 'a summary load failure shows no message (05-SUP-LOAD)', file: SUMMARY,
    edits: [['        if (active) setError("Could not load your change requests.");', '        if (active) setError("");']], suites: s },
  { id: 'K30', name: 'the server’s message is not shown on the form (06-A)', file: FORM,
    edits: [['        setMessage(error.message);', '        setMessage("");']], suites: s },
  { id: 'K31', name: 'Cancel does not leave the form (04-SUP-CANCEL)', file: FORM,
    edits: [['        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>', '        <Button type="button" variant="secondary" disabled={saving} onClick={() => undefined}>']], suites: s },
];
