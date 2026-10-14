import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PlanningInformationPage } from "@/features/events/pages/detail/planning/PlanningInformationPage";
import { ApiError, api } from "@/utils/api";
import type { PlanningChecklist } from "@/utils/arrangements";
import type { EventRecord, PlanningView } from "@/types";

/*
 * SPM-135 coordinator planning page. The HTTP layer is the boundary and is
 * mocked; tab, card and safety-section rendering follow the server checklist.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000201";

const event = {
  id: EVENT_ID,
  name: "Product Launch Mixer",
  startDateTime: "2026-11-05T02:00:00.000Z",
  endDateTime: "2026-11-05T04:00:00.000Z",
  expectedAttendance: 80,
  venueRequirements: { minCapacity: 80, layout: "Theatre", facilities: ["Projector"], accessibility: [] },
  equipmentNeeds: "None",
} as unknown as EventRecord;

const view: PlanningView = {
  event,
  venueBookings: [],
  equipmentArrangements: [],
  pendingChanges: [],
  readOnly: false,
  editableFields: [],
  lastUpdatedAt: "2026-10-13T09:58:00.000Z",
};

function checklist(over: Partial<PlanningChecklist> = {}): PlanningChecklist {
  return {
    venue: { status: "not_requested", items: [] },
    equipment: { required: false, status: "not_requested", items: [], confirmedByCoordinator: false },
    safetyCheck: { status: "not_requested" },
    canRequestSafetyCheck: false,
    blocking: ["venue", "equipment"],
    ...over,
  };
}

/** Serves `current` for GET arrangements-status; POSTs resolve and are recorded. */
let current: PlanningChecklist;
function routeApi() {
  apiMock.mockImplementation(((path: string, init?: RequestInit) => {
    if (init?.method === "POST") return Promise.resolve({});
    if (path.endsWith("/arrangements-status"))
      return Promise.resolve({ eventId: EVENT_ID, ready: false, outstanding: [], checklist: current });
    return Promise.resolve({});
  }) as typeof api);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PlanningInformationPage view={view} status="planning" onConfirmed={() => undefined} />
    </MemoryRouter>,
  );
}

const postCalls = () => apiMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");

beforeEach(() => {
  apiMock.mockReset();
  current = checklist();
  routeApi();
});
afterEach(cleanup);

describe("PlanningInformationPage", () => {
  /** The Venues and Equipment tabs show the warning icon and the safety check stays disabled with its blocking reason while nothing is confirmed. */
  it("shows warning icons on Venues and Equipment and a disabled safety check with the blocking reason", async () => {
    renderPage();
    const venuesTab = await screen.findByRole("tab", { name: /Venues/ });
    await waitFor(() => expect(screen.getByRole("button", { name: "Request For Safety Check" })).toBeDisabled());
    expect(within(venuesTab).getByLabelText("Action needed")).toBeInTheDocument();
    expect(within(screen.getByRole("tab", { name: /Event Info/ })).getByLabelText("Complete")).toBeInTheDocument();
    expect(screen.getByText("Pending venue and equipment confirmation to proceed")).toBeInTheDocument();
  });

  /** The venue section offers the catalogue link until a venue is requested, then shows the request and its request link. */
  it("offers View Venue Catalogue until a venue is requested, then View Venue Request", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));
    const catalogue = await screen.findByRole("link", { name: "View Venue Catalogue" });
    expect(catalogue).toHaveAttribute("href", `/venues?eventId=${EVENT_ID}`);
    expect(screen.getByText("Venue Yet To Be Requested")).toBeInTheDocument();
    expect(screen.queryByText("Venue Request Pending")).not.toBeInTheDocument();
    cleanup();

    current = checklist({ venue: { status: "pending", items: [{ id: "b1", venueName: "Main Hall", status: "pending", requestedDate: "2026-10-10T00:00:00.000Z" }] } });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));
    expect(await screen.findByText("Venue Request Pending")).toBeInTheDocument();
    expect(screen.getByText(/Main Hall/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Venue Request" })).toBeInTheDocument();
  });

  /** The equipment section shows the not-yet-requested and pending states, each with its own link, and no checkbox while nothing is requested. */
  it("shows the equipment request states", async () => {
    const user = userEvent.setup();
    current = checklist({ equipment: { required: true, status: "not_requested", items: [], confirmedByCoordinator: false } });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Equipment/ }));
    expect(await screen.findByText("Equipment Yet To Be Requested")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request Equipment" })).toHaveAttribute("href", "/equipment/requests");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    cleanup();

    current = checklist({
      equipment: { required: true, status: "pending", items: [{ id: "e1", name: "Projector", quantity: 1, status: "pending" }], confirmedByCoordinator: false },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Equipment/ }));
    expect(await screen.findByText("Equipment Request Pending")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Equipment Request" })).toBeInTheDocument();
  });

  /** Each venue request is listed with its own badge, and the Venues tab is ticked only when every request is confirmed. */
  it("lists every venue request with its own status and ticks Venues only when all are confirmed", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "pending",
        items: [
          { id: "b1", venueName: "Main Hall", status: "confirmed", requestedDate: "2026-10-10T00:00:00.000Z" },
          { id: "b2", venueName: "Breakout Room 1", status: "pending", requestedDate: "2026-10-11T00:00:00.000Z" },
        ],
      },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));
    const list = await screen.findByRole("list", { name: "Requests" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getAllByRole("img", { name: "Complete" })).toHaveLength(1);
    expect(list).toHaveTextContent("Main Hall");
    expect(list).toHaveTextContent("Breakout Room 1");
    expect(within(list).getByText("Confirmed")).toBeInTheDocument();
    expect(within(list).getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Venue Request Pending")).toBeInTheDocument();
    expect(within(screen.getByRole("tab", { name: /Venues/ })).getByLabelText("Action needed")).toBeInTheDocument();
    cleanup();

    current = checklist({
      venue: {
        status: "confirmed",
        items: [
          { id: "b1", venueName: "Main Hall", status: "confirmed" },
          { id: "b2", venueName: "Breakout Room 1", status: "confirmed" },
        ],
      },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));
    expect(await screen.findByText("Venue Confirmed")).toBeInTheDocument();
    expect(within(screen.getByRole("tab", { name: /Venues/ })).getByLabelText("Complete")).toBeInTheDocument();
  });

  /** An unavailable venue shows a yellow caution on the Venues tab (not a red one) and offers a link to request another venue. */
  it("shows a yellow Action needed caution on the Venues tab and a request-another link when the venue is unavailable", async () => {
    const user = userEvent.setup();
    current = checklist({ venue: { status: "unavailable", items: [{ id: "b1", venueName: "Main Hall", status: "unavailable" }] } });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));
    expect(await screen.findByText("Venue Unavailable")).toBeInTheDocument();
    expect(within(screen.getByRole("tab", { name: /Venues/ })).getByLabelText("Action needed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request Another Venue" })).toHaveAttribute("href", `/venues?eventId=${EVENT_ID}`);
    expect(screen.queryByText("Venue Yet To Be Requested")).not.toBeInTheDocument();
  });

  /** Only unavailable venue requests offer Remove From List; confirmed and pending ones do not. */
  it("offers Remove From List only on unavailable venue requests", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "unavailable",
        items: [
          { id: "b1", venueName: "Main Hall", status: "confirmed" },
          { id: "b2", venueName: "Seminar Room B", status: "unavailable" },
          { id: "b3", venueName: "Breakout Room 1", status: "pending" },
        ],
      },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));
    const removeButton = await screen.findByRole("button", { name: "Remove Seminar Room B From List" });
    expect(removeButton).toBeInTheDocument();
    expect(removeButton).toHaveTextContent("Remove From List");
    expect(screen.getAllByRole("button", { name: /From List/ })).toHaveLength(1);
    expect(within(screen.getByRole("list", { name: "Requests" })).getByText("Unavailable")).toBeInTheDocument();
  });

  /** Cancelling a venue removal leaves the request listed and sends no DELETE. */
  it("cancelling the removal of a venue request sends no DELETE", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: { status: "unavailable", items: [{ id: "b2", venueName: "Seminar Room B", status: "unavailable" }] },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));

    await user.click(await screen.findByRole("button", { name: "Remove Seminar Room B From List" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByRole("button", { name: "Remove Seminar Room B From List" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm Remove" })).not.toBeInTheDocument();
    expect(apiMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toHaveLength(0);
  });

  /** Removing an unavailable venue after confirmation sends one DELETE, drops it from the list, and ticks Venues once only confirmed requests remain. */
  it("removes an unavailable venue, confirms it, and ticks Venues once only confirmed requests remain", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "unavailable",
        items: [
          { id: "b1", venueName: "Main Hall", status: "confirmed" },
          { id: "b2", venueName: "Seminar Room B", status: "unavailable" },
        ],
      },
    });
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (init?.method === "DELETE" && path === `/events/${EVENT_ID}/venue-requests/b2`) {
        current = checklist({ venue: { status: "confirmed", items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }] } });
        return Promise.resolve({ eventId: EVENT_ID, venueRequestId: "b2", removed: true });
      }
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({ eventId: EVENT_ID, ready: false, outstanding: [], checklist: current });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();
    const venuesTab = await screen.findByRole("tab", { name: /Venues/ });
    await user.click(venuesTab);
    expect(within(venuesTab).getByLabelText("Action needed")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Remove Seminar Room B From List" }));
    await user.click(screen.getByRole("button", { name: "Confirm Remove" }));

    expect(await screen.findByText("Venue removed from list")).toBeInTheDocument();
    expect(screen.queryByText("Seminar Room B")).not.toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole("tab", { name: /Venues/ })).getByLabelText("Complete")).toBeInTheDocument());
    expect(apiMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toHaveLength(1);
  });

  /** A failed venue removal keeps the request listed and shows the server message. */
  it("keeps the unavailable venue listed and shows an error when removal fails", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: { status: "unavailable", items: [{ id: "b2", venueName: "Seminar Room B", status: "unavailable" }] },
    });
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return Promise.reject(new ApiError("Only a venue request that is unavailable can be removed.", undefined, undefined, 409));
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({ eventId: EVENT_ID, ready: false, outstanding: [], checklist: current });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));

    await user.click(await screen.findByRole("button", { name: "Remove Seminar Room B From List" }));
    await user.click(screen.getByRole("button", { name: "Confirm Remove" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Only a venue request that is unavailable can be removed.");
    expect(screen.getByText("Seminar Room B")).toBeInTheDocument();
    expect(screen.queryByText("Venue removed from list")).not.toBeInTheDocument();
  });

  /** Only unavailable equipment requests offer Remove From List; confirmed and pending ones do not. */
  it("offers Remove From List only on unavailable equipment requests", async () => {
    const user = userEvent.setup();
    current = checklist({
      equipment: {
        required: true,
        status: "unavailable",
        items: [
          { id: "e1", name: "Projector", quantity: 1, status: "confirmed" },
          { id: "e2", name: "Microphone", quantity: 2, status: "unavailable" },
          { id: "e3", name: "Speakers", quantity: 1, status: "pending" },
        ],
        confirmedByCoordinator: false,
      },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Equipment/ }));
    const removeButton = await screen.findByRole("button", { name: "Remove Microphone x2 From List" });
    expect(removeButton).toHaveTextContent("Remove From List");
    expect(screen.getAllByRole("button", { name: /From List/ })).toHaveLength(1);
  });

  /** Cancelling an equipment removal leaves the request listed and sends no DELETE. */
  it("cancelling the removal of an equipment request sends no DELETE", async () => {
    const user = userEvent.setup();
    current = checklist({
      equipment: { required: true, status: "unavailable", items: [{ id: "e2", name: "Microphone", quantity: 2, status: "unavailable" }], confirmedByCoordinator: false },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Equipment/ }));

    await user.click(await screen.findByRole("button", { name: "Remove Microphone x2 From List" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByRole("button", { name: "Remove Microphone x2 From List" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm Remove" })).not.toBeInTheDocument();
    expect(apiMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toHaveLength(0);
  });

  /** Removing an unavailable equipment request after confirmation drops it from the list and ticks Equipment once only confirmed requests remain. */
  it("removes an unavailable equipment request, confirms it, and ticks Equipment once only confirmed requests remain", async () => {
    const user = userEvent.setup();
    current = checklist({
      equipment: {
        required: true,
        status: "unavailable",
        items: [
          { id: "e1", name: "Projector", quantity: 1, status: "confirmed" },
          { id: "e2", name: "Microphone", quantity: 2, status: "unavailable" },
        ],
        confirmedByCoordinator: false,
      },
    });
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (init?.method === "DELETE" && path === `/events/${EVENT_ID}/equipment-reservations/e2`) {
        current = checklist({
          equipment: { required: true, status: "confirmed", items: [{ id: "e1", name: "Projector", quantity: 1, status: "confirmed" }], confirmedByCoordinator: false },
        });
        return Promise.resolve({ eventId: EVENT_ID, equipmentReservationId: "e2", removed: true });
      }
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({ eventId: EVENT_ID, ready: false, outstanding: [], checklist: current });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();
    const equipmentTab = await screen.findByRole("tab", { name: /Equipment/ });
    await user.click(equipmentTab);
    expect(within(equipmentTab).getByLabelText("Unavailable")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Remove Microphone x2 From List" }));
    await user.click(screen.getByRole("button", { name: "Confirm Remove" }));

    expect(await screen.findByText("Equipment removed from list")).toBeInTheDocument();
    expect(screen.queryByText("Microphone x2")).not.toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole("tab", { name: /Equipment/ })).getByLabelText("Complete")).toBeInTheDocument());
    expect(apiMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toHaveLength(1);
  });

  /** A failed equipment removal keeps the request listed and shows the server message. */
  it("keeps the unavailable equipment listed and shows an error when removal fails", async () => {
    const user = userEvent.setup();
    current = checklist({
      equipment: { required: true, status: "unavailable", items: [{ id: "e2", name: "Microphone", quantity: 2, status: "unavailable" }], confirmedByCoordinator: false },
    });
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return Promise.reject(new ApiError("Only an equipment request that is unavailable can be removed.", undefined, undefined, 409));
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({ eventId: EVENT_ID, ready: false, outstanding: [], checklist: current });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Equipment/ }));

    await user.click(await screen.findByRole("button", { name: "Remove Microphone x2 From List" }));
    await user.click(screen.getByRole("button", { name: "Confirm Remove" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Only an equipment request that is unavailable can be removed.");
    expect(screen.getByText("Microphone x2")).toBeInTheDocument();
    expect(screen.queryByText("Equipment removed from list")).not.toBeInTheDocument();
  });

  /** An unavailable equipment request shows a red caution on the Equipment tab and a link to request another item. */
  it("shows a red caution and a request-another link when the equipment is unavailable", async () => {
    const user = userEvent.setup();
    current = checklist({ equipment: { required: true, status: "unavailable", items: [{ id: "e1", name: "Projector", quantity: 1, status: "unavailable" }], confirmedByCoordinator: false } });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Equipment/ }));
    expect(await screen.findByText("Equipment Unavailable")).toBeInTheDocument();
    expect(within(screen.getByRole("tab", { name: /Equipment/ })).getByLabelText("Unavailable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request Another Equipment" })).toHaveAttribute("href", "/equipment/requests");
  });

  /** Ticking the no-equipment box posts the confirmation and refreshes the checklist. */
  it("posts the no-equipment confirmation from the checkbox and refreshes", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Equipment/ }));
    expect(await screen.findByText("Equipment Yet To Be Requested")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request Equipment" })).toBeInTheDocument();
    current = checklist({
      equipment: { required: false, status: "not_requested", items: [], confirmedByCoordinator: true, confirmedDate: "2026-10-13T09:00:00.000Z" },
    });
    await user.click(screen.getByRole("checkbox", { name: "Confirm no equipment needed" }));
    await waitFor(() => expect(postCalls().map(([path]) => path)).toEqual([`/events/${EVENT_ID}/confirm-no-equipment`]));
    expect(await screen.findByText("No Equipment Required")).toBeInTheDocument();
    expect(await screen.findByText("Confirmed")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  /** Request For Safety Check is enabled only once venue and equipment are both confirmed, and posting it sends the request. */
  it("enables Request For Safety Check once both prerequisites are met and posts it", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: { status: "confirmed", items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }] },
      equipment: { required: false, status: "not_requested", items: [], confirmedByCoordinator: true },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    renderPage();
    const button = await screen.findByRole("button", { name: "Request For Safety Check" });
    await waitFor(() => expect(button).toBeEnabled());
    current = { ...current, safetyCheck: { status: "pending", requestedDate: "2026-10-13T10:00:00.000Z" } };
    await user.click(button);
    await waitFor(() => expect(postCalls().map(([path]) => path)).toEqual([`/events/${EVENT_ID}/safety-check/request`]));
    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request For Safety Check" })).not.toBeInTheDocument();
  });

  /** Each safety feedback item is listed, and re-request stays disabled while any item is unresolved. */
  it("lists each feedback item and keeps re-request disabled until every item is resolved", async () => {
    current = checklist({
      venue: { status: "confirmed", items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }] },
      equipment: { required: false, status: "not_requested", items: [], confirmedByCoordinator: true },
      safetyCheck: {
        status: "changes_needed",
        feedback: [
          { id: "f1", text: "Add a second fire exit.", requestedAt: "2026-10-11T07:00:00.000Z" },
          { id: "f2", text: "Confirm occupancy.", requestedAt: "2026-10-11T07:00:00.000Z" },
        ],
      },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    renderPage();
    expect(await screen.findByText("Changes needed")).toBeInTheDocument();
    expect(screen.getByText("Add a second fire exit.")).toBeInTheDocument();
    expect(screen.getByText("0 of 2 items resolved. Complete all before re-requesting.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-Request Safety Check" })).toBeDisabled();
  });

  /** Ticking a feedback item resolves it, and re-request becomes available once every item is ticked. */
  it("resolves a feedback item when its checkbox is ticked, and enables re-request once all are ticked", async () => {
    const items = [
      { id: "f1", text: "Add a second fire exit.", requestedAt: "2026-10-11T07:00:00.000Z" },
      { id: "f2", text: "Confirm occupancy.", requestedAt: "2026-10-11T07:00:00.000Z" },
    ];
    current = checklist({
      venue: { status: "confirmed", items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }] },
      equipment: { required: false, status: "not_requested", items: [], confirmedByCoordinator: true },
      safetyCheck: { status: "changes_needed", feedback: items },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (init?.method === "POST" && path.endsWith("/resolve")) {
        const parts = path.split("/");
        const id = parts[parts.length - 2];
        current = {
          ...current,
          safetyCheck: {
            ...current.safetyCheck,
            feedback: items.map((item) => (item.id === id ? { ...item, resolvedByCoordinatorAt: "2026-10-13T10:00:00.000Z" } : item)),
          },
        };
        return Promise.resolve({});
      }
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({ eventId: EVENT_ID, ready: false, outstanding: [], checklist: current });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();
    const user = userEvent.setup();

    await user.click((await screen.findAllByRole("checkbox"))[0]);
    expect(await screen.findByText("1 of 2 items resolved. Complete all before re-requesting.")).toBeInTheDocument();
    expect(postCalls().map(([path]) => path)).toEqual([`/events/${EVENT_ID}/safety-check/feedback/f1/resolve`]);
    expect(screen.getByRole("button", { name: "Re-Request Safety Check" })).toBeDisabled();
  });

  /** Once the safety check is approved, the verifier is shown with the Confirm Event button. */
  it("shows the verifier and the Confirm Event button once approved", async () => {
    current = checklist({
      venue: { status: "confirmed", items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }] },
      equipment: { required: false, status: "not_requested", items: [], confirmedByCoordinator: true },
      safetyCheck: { status: "approved", approverName: "Safety Officer 1" },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    renderPage();
    expect(await screen.findByText(/Verified by Safety Officer 1/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Confirm Event" })).toBeInTheDocument();
  });

  /** A failed action shows its error message instead of failing silently. */
  it("reports a failed action instead of silently doing nothing", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: { status: "confirmed", items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }] },
      equipment: { required: false, status: "not_requested", items: [], confirmedByCoordinator: true },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.reject(new Error("Pending venue confirmation to proceed."));
      return Promise.resolve({ eventId: EVENT_ID, ready: false, outstanding: [], checklist: current });
    }) as typeof api);
    renderPage();
    const button = await screen.findByRole("button", { name: "Request For Safety Check" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Pending venue confirmation to proceed.");
  });
});
