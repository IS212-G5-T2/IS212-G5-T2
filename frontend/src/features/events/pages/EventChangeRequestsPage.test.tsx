import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventChangeRequestsPage } from "@/features/events/pages/EventChangeRequestsPage";
import {
  fetchEventChangeRequests,
  submitChangeRequest,
  withdrawChangeRequest,
  previewChangeRequestConflicts,
  approveChangeRequest,
  denyChangeRequest,
  markArrangementRechecked,
  fetchChangeRequestAudit,
} from "@/features/events/api/change-requests-api";
import { useAppStore } from "@/store/useAppStore";
import type { ChangeRequest, EventRecord, User } from "@/types";
import { ApiError, api } from "@/utils/api";

vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api: vi.fn() }));
vi.mock("@/features/events/api/change-requests-api", () => ({
  fetchEventChangeRequests: vi.fn(),
  submitChangeRequest: vi.fn(),
  withdrawChangeRequest: vi.fn(),
  previewChangeRequestConflicts: vi.fn(),
  approveChangeRequest: vi.fn(),
  denyChangeRequest: vi.fn(),
  markArrangementRechecked: vi.fn(),
  fetchChangeRequestAudit: vi.fn(),
  markChangeRequestNoticesRead: vi.fn(() => Promise.resolve()),
  fetchNewChangeRequestEventIds: vi.fn(() => Promise.resolve(new Set<string>())),
}));

const apiMock = vi.mocked(api);
const listMock = vi.mocked(fetchEventChangeRequests);
const submitMock = vi.mocked(submitChangeRequest);
const withdrawMock = vi.mocked(withdrawChangeRequest);
const previewMock = vi.mocked(previewChangeRequestConflicts);
const approveMock = vi.mocked(approveChangeRequest);
const denyMock = vi.mocked(denyChangeRequest);
const recheckMock = vi.mocked(markArrangementRechecked);
const auditMock = vi.mocked(fetchChangeRequestAudit);

/**
 * SPM-64 — the Change Requests page: the organiser requests a change, sees the
 * confirmation and the request's status; the coordinator reads the list.
 * Test IDs refer to the Confluence pages under SPM-28 > SPM-64 (REQ-CHANGE-NN-X).
 */

const ORGANISER = { id: "org-1", name: "Organiser 1", email: "o@x.test", role: "organiser", roles: ["organiser"] } as User;
const COORDINATOR = { id: "coord-1", name: "Coordinator 1", email: "c@x.test", role: "coordinator", roles: ["coordinator"] } as User;

function eventRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "evt-1",
    name: "Alumni Networking Night",
    purpose: "Networking",
    description: "An evening of networking.",
    organiserId: "org-1",
    organiserName: "Organiser 1",
    coordinatorId: "coord-1",
    status: "planning",
    startDateTime: "2030-02-05T10:30:00.000Z",
    endDateTime: "2030-02-05T13:30:00.000Z",
    expectedAttendance: 120,
    venueRequirements: { minCapacity: 120, layout: "Banquet", facilities: [], accessibility: [] },
    equipmentNeeds: "",
    registrationEnabled: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const NO_CONFLICTS = {
  requestId: "cr-1",
  venueBookings: [],
  equipment: [],
  registrations: { registered: 0, waitlisted: 0, details: [] },
  hasConflicts: false,
};

function changeRequest(overrides: Partial<ChangeRequest> = {}): ChangeRequest {
  return {
    id: "cr-1",
    eventId: "evt-1",
    eventName: "Alumni Networking Night",
    status: "Pending",
    changes: [{ field: "expectedAttendance", originalValue: 120, proposedValue: 140 }],
    requiresSafetyCheck: true,
    recheck: [],
    safetyCheckReset: false,
    requestedBy: "Organiser 1",
    createdAt: "2026-10-16T02:00:00.000Z",
    ...overrides,
  };
}

function renderPage(user: User = ORGANISER, state?: unknown) {
  useAppStore.setState({ currentUser: user, isAuthenticated: true, authLoading: false });
  render(
    <MemoryRouter initialEntries={[{ pathname: "/events/evt-1/change-requests", state }]}>
      <Routes>
        <Route path="/events/:id/change-requests" element={<EventChangeRequestsPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  apiMock.mockReset();
  auditMock.mockReset();
  auditMock.mockResolvedValue([]);
  previewMock.mockReset();
  previewMock.mockResolvedValue(NO_CONFLICTS);
  approveMock.mockReset();
  denyMock.mockReset();
  recheckMock.mockReset();
  listMock.mockReset();
  submitMock.mockReset();
  withdrawMock.mockReset();
  apiMock.mockResolvedValue(eventRecord());
  listMock.mockResolvedValue([]);
});
afterEach(cleanup);

describe("EventChangeRequestsPage", () => {
  /**
   * REQ-CHANGE-01-A, 04-A, 05-A: the organiser opens the form, submits a change,
   * sees the confirmation message and the new request as Pending, and cannot open
   * a second request while it is pending.
   */
  it("REQ-CHANGE-04-A submits a request, confirms it and lists it as pending", async () => {
    submitMock.mockResolvedValue(changeRequest());
    const user = renderPage();
    expect(await screen.findByText("No change requests for this event.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request Change" }));
    const form = screen.getByRole("form", { name: "Request a change" });
    await user.clear(within(form).getByLabelText(/expected attendance/i));
    await user.type(within(form).getByLabelText(/expected attendance/i), "140");
    await user.click(within(form).getByRole("button", { name: "Submit Change Request" }));

    expect(submitMock).toHaveBeenCalledWith("evt-1", { changes: { expectedAttendance: 140 } });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your change request for Alumni Networking Night has been submitted for review.",
    );
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveTextContent("Pending review");
    expect(screen.getByText(/awaiting the coordinator's review/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request Change" })).not.toBeInTheDocument();

    // The confirmation can be dismissed.
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/has been submitted for review/)).not.toBeInTheDocument();
  });

  /** REQ-CHANGE-01-A: arriving from the event page's Request Change button opens the form directly; Cancel closes it. */
  it("opens the form directly when asked by the event page", async () => {
    const user = renderPage(ORGANISER, { openForm: true });
    expect(await screen.findByRole("form", { name: "Request a change" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request Change" })).toBeInTheDocument();
  });

  /** REQ-CHANGE-01-F: a closed or started event offers no form. */
  it.each([eventRecord({ status: "cancelled" }), eventRecord({ startDateTime: "2020-01-01T00:00:00.000Z" })])(
    "REQ-CHANGE-01-F offers no form when the event can no longer change",
    async (event) => {
      apiMock.mockResolvedValue(event);
      renderPage(ORGANISER, { openForm: true });
      expect(await screen.findByText("This event can no longer be changed.")).toBeInTheDocument();
      expect(screen.queryByRole("form")).not.toBeInTheDocument();
    },
  );

  /** REQ-CHANGE-09-C: withdrawing a pending request refreshes the list and allows a new request. */
  it("REQ-CHANGE-09-C withdraws the pending request and allows a new one", async () => {
    listMock.mockResolvedValueOnce([changeRequest()]).mockResolvedValueOnce([changeRequest({ status: "Withdrawn", decidedBy: "Organiser 1", decidedAt: "2026-10-16T03:00:00.000Z" })]);
    withdrawMock.mockResolvedValue(changeRequest({ status: "Withdrawn" }));
    const user = renderPage();
    await user.click(await screen.findByRole("button", { name: "Withdraw Request" }));
    expect(withdrawMock).toHaveBeenCalledWith("evt-1", "cr-1");
    expect(await screen.findByRole("status")).toHaveTextContent("Your change request was withdrawn.");
    expect(screen.getByRole("article")).toHaveTextContent("Withdrawn");
    expect(screen.getByRole("button", { name: "Request Change" })).toBeInTheDocument();
  });

  /** REQ-CHANGE-09-B: a request decided meanwhile cannot be withdrawn; the page shows the error and the request's current state. */
  it("REQ-CHANGE-09-B shows the refusal and the current state when withdrawal fails", async () => {
    listMock
      .mockResolvedValueOnce([changeRequest()])
      .mockResolvedValueOnce([
        changeRequest({ status: "Denied", decidedBy: "Coordinator 1", decidedAt: "2026-10-16T03:00:00.000Z", decisionReason: "No room." }),
      ]);
    withdrawMock.mockRejectedValue(new Error("This change request has already been decided."));
    const user = renderPage();
    await user.click(await screen.findByRole("button", { name: "Withdraw Request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This change request has already been decided.");
    expect(screen.getByRole("article")).toHaveTextContent("Denied");
    expect(screen.queryByRole("button", { name: "Withdraw Request" })).not.toBeInTheDocument();
    expect(screen.queryByText("Your change request was withdrawn.")).not.toBeInTheDocument();
  });

  /** REQ-CHANGE-03-A: the assigned coordinator reads the list without the form or withdraw action. */
  it("REQ-CHANGE-03-A shows the assigned coordinator the request, without the organiser's actions", async () => {
    listMock.mockResolvedValue([changeRequest()]);
    renderPage(COORDINATOR);
    expect(await screen.findByRole("article")).toHaveTextContent("Pending review");
    expect(screen.queryByRole("heading", { name: "Request a Change" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw Request" })).not.toBeInTheDocument();
    // SPM-65: the assigned coordinator now reviews the request on this page.
    expect(
      screen.getByText("Review the changes the organiser has requested. Check for conflicts, then approve or deny each request."),
    ).toBeInTheDocument();
  });

  /** REQ-CHANGE-03-A: anyone else the server lets read the list sees it read-only. */
  it("REQ-CHANGE-03-A shows other readers a read-only list", async () => {
    listMock.mockResolvedValue([changeRequest()]);
    renderPage({ ...COORDINATOR, id: "coord-9" } as User);
    expect(await screen.findByRole("article")).toHaveTextContent("Pending review");
    expect(screen.getByText("Changes the organiser has requested for this event.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve Change" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Audit Log" })).not.toBeInTheDocument();
  });

  /** REQ-CHANGE-05-C: someone the server refuses sees its message and a way back. */
  it("REQ-CHANGE-05-C shows the server's refusal", async () => {
    apiMock.mockRejectedValue(new Error("Event not found."));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Event not found.");
    expect(screen.getByRole("link", { name: "Back To Events" })).toHaveAttribute("href", "/events");
  });

  /** REQ-CHANGE-09-B: if the list cannot be refreshed after a failed withdrawal, the refusal is still shown. */
  it("REQ-CHANGE-09-B still shows the refusal when the refresh also fails", async () => {
    listMock.mockResolvedValueOnce([changeRequest()]).mockRejectedValueOnce(new Error("offline"));
    withdrawMock.mockRejectedValue(new Error("This change request has already been decided."));
    const user = renderPage();
    await user.click(await screen.findByRole("button", { name: "Withdraw Request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This change request has already been decided.");
    expect(screen.getByRole("article")).toHaveTextContent("Pending review");
  });

  /** A load that finishes after leaving the page changes nothing. */
  it("ignores a load that settles after unmounting", async () => {
    let resolveEvent!: (event: EventRecord) => void;
    apiMock.mockImplementationOnce(() => new Promise((r) => (resolveEvent = r)) as never);
    useAppStore.setState({ currentUser: ORGANISER, isAuthenticated: true, authLoading: false });
    const first = render(
      <MemoryRouter initialEntries={["/events/evt-1/change-requests"]}>
        <Routes>
          <Route path="/events/:id/change-requests" element={<EventChangeRequestsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    first.unmount();
    resolveEvent(eventRecord());
    let rejectEvent!: (error: unknown) => void;
    apiMock.mockImplementationOnce(() => new Promise((_, r) => (rejectEvent = r)) as never);
    const second = render(
      <MemoryRouter initialEntries={["/events/evt-1/change-requests"]}>
        <Routes>
          <Route path="/events/:id/change-requests" element={<EventChangeRequestsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    second.unmount();
    rejectEvent(new Error("late"));
    await Promise.resolve();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  /** An empty event response shows "Event not found." with a way back. */
  it("shows Event not found when the event is missing", async () => {
    apiMock.mockResolvedValue(undefined as never);
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Event not found.");
  });

  /** A non-Error failure still shows a readable message. */
  it("shows a generic message when loading fails without an Error", async () => {
    listMock.mockRejectedValue("offline");
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load change requests.");
  });

  // ------------------------------------------------------------------ SPM-65

  /** REVIEW-CHANGE-04-A, 06-A, 08-A, 09-A, 10-A: approving updates the list, confirms it and reloads the audit log. */
  it("REVIEW-CHANGE-06-A confirms an approval, says the safety check was reset and lists the re-checks", async () => {
    listMock.mockResolvedValue([changeRequest()]);
    const approved = changeRequest({
      status: "Approved",
      decidedBy: "Coordinator 1",
      decidedAt: "2026-10-18T02:00:00.000Z",
      safetyCheckReset: true,
      recheck: [{ id: "i1", kind: "venue", refId: "b1", name: "Hall", details: ["Attendance 140 exceeds capacity 120"] }],
    });
    approveMock.mockResolvedValue({ request: approved, eventStatus: "planning", safetyCheckReset: true });
    recheckMock.mockResolvedValue({ ...approved, recheck: [{ ...approved.recheck[0], checkedAt: "2026-10-18T03:00:00.000Z", checkedBy: "Coordinator 1" }] });
    const user = renderPage(COORDINATOR);
    await user.click(await screen.findByRole("button", { name: "Approve Change" }));
    await user.click(screen.getByRole("button", { name: "Confirm Approval" }));
    const confirmation = await screen.findByText(/The change request was approved and Alumni Networking Night has been updated\./);
    expect(confirmation).toHaveTextContent("The safety check was reset; request a new safety check. Re-check the affected arrangements below.");
    expect(screen.getByRole("article")).toHaveTextContent("Approved by Coordinator 1");
    expect(screen.queryByRole("button", { name: "Approve Change" })).not.toBeInTheDocument();
    await waitFor(() => expect(auditMock).toHaveBeenCalledTimes(2));
    // AC9: tick the arrangement off.
    await user.click(screen.getByRole("button", { name: "Mark As Re-checked" }));
    expect(await screen.findByText(/Re-checked by Coordinator 1 on/)).toBeInTheDocument();
    expect(recheckMock).toHaveBeenCalledWith("evt-1", "cr-1", "i1");
  });

  it("confirms an approval without a reset or re-checks", async () => {
    // An older decided request stays as it was.
    listMock.mockResolvedValue([changeRequest(), changeRequest({ id: "cr-0", status: "Denied", decisionReason: "Earlier reason." })]);
    approveMock.mockResolvedValue({ request: changeRequest({ status: "Approved" }), eventStatus: "planning", safetyCheckReset: false });
    const user = renderPage(COORDINATOR);
    await user.click(await screen.findByRole("button", { name: "Approve Change" }));
    await user.click(screen.getByRole("button", { name: "Confirm Approval" }));
    expect(await screen.findByText(/^The change request was approved and Alumni Networking Night has been updated\.$/)).toBeInTheDocument();
    expect(screen.getAllByRole("article")[1]).toHaveTextContent("Earlier reason.");
  });

  /** REVIEW-CHANGE-05-A, 06-B: denying confirms it and shows the reason in the list. */
  it("REVIEW-CHANGE-06-B confirms a denial", async () => {
    listMock.mockResolvedValue([changeRequest()]);
    denyMock.mockResolvedValue({
      request: changeRequest({ status: "Denied", decidedBy: "Coordinator 1", decidedAt: "2026-10-18T02:00:00.000Z", decisionReason: "The hall is too small." }),
    });
    const user = renderPage(COORDINATOR);
    await user.click(await screen.findByRole("button", { name: "Deny Change" }));
    await user.type(screen.getByLabelText(/Reason for denying/), "The hall is too small.");
    await user.click(screen.getByRole("button", { name: "Confirm Denial" }));
    expect(await screen.findByText("The change request was denied. The organiser has been told why.")).toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveTextContent("Coordinator’s reason: “The hall is too small.”");
    await waitFor(() => expect(auditMock).toHaveBeenCalledTimes(2));
  });

  /** REVIEW-CHANGE-12-C (AC11): a request withdrawn meanwhile is closed; the server's message shows and the list reloads. */
  it("REVIEW-CHANGE-12-C reloads when the request was withdrawn meanwhile", async () => {
    listMock
      .mockResolvedValueOnce([changeRequest()])
      .mockResolvedValueOnce([changeRequest({ status: "Withdrawn", decidedBy: "Organiser 1", decidedAt: "2026-10-18T02:00:00.000Z" })]);
    approveMock.mockRejectedValue(new ApiError("The organiser has withdrawn this change request.", undefined, "change_request_withdrawn", 409));
    const user = renderPage(COORDINATOR);
    await user.click(await screen.findByRole("button", { name: "Approve Change" }));
    await user.click(screen.getByRole("button", { name: "Confirm Approval" }));
    expect(await screen.findByText("Withdrawn by Organiser 1", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm Approval" })).not.toBeInTheDocument();
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("still shows the request when the reload after a stale decision fails", async () => {
    listMock.mockResolvedValueOnce([changeRequest()]).mockRejectedValueOnce(new Error("offline"));
    approveMock.mockRejectedValue(new ApiError("This change request has already been decided.", undefined, "change_request_decided", 409));
    const user = renderPage(COORDINATOR);
    await user.click(await screen.findByRole("button", { name: "Approve Change" }));
    await user.click(screen.getByRole("button", { name: "Confirm Approval" }));
    expect(await screen.findByText("This change request has already been decided.")).toBeInTheDocument();
    expect(within(screen.getByRole("article")).getByText("Pending review")).toBeInTheDocument();
  });

  /** REVIEW-CHANGE-10-B: the owner reads the audit log too, and a withdrawal reloads it. */
  it("REVIEW-CHANGE-10-B shows the owner the audit log and reloads it after withdrawing", async () => {
    listMock.mockResolvedValueOnce([changeRequest()]).mockResolvedValueOnce([changeRequest({ status: "Withdrawn" })]);
    withdrawMock.mockResolvedValue(changeRequest({ status: "Withdrawn" }));
    const user = renderPage();
    expect(await screen.findByRole("heading", { name: "Audit Log" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Withdraw Request" }));
    await waitFor(() => expect(auditMock).toHaveBeenCalledTimes(2));
  });
});
