import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PlanningInformationPage } from "@/features/events/pages/detail/planning/PlanningInformationPage";
import { ApiError, api } from "@/utils/api";
import { PLANNING_REFRESH_MS } from "@/utils/planning";
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
  venueRequirements: {
    minCapacity: 80,
    layout: "Theatre",
    facilities: ["Projector"],
    accessibility: [],
  },
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
    equipment: {
      required: false,
      status: "not_requested",
      items: [],
      confirmedByCoordinator: false,
    },
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
      return Promise.resolve({
        eventId: EVENT_ID,
        ready: false,
        outstanding: [],
        checklist: current,
      });
    return Promise.resolve({});
  }) as typeof api);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PlanningInformationPage
        view={view}
        status="planning"
        onConfirmed={() => undefined}
      />
    </MemoryRouter>,
  );
}

/** A promise the test settles by hand, so a request can be held in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const postCalls = () =>
  apiMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "POST",
  );

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
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Request For Safety Check" }),
      ).toBeDisabled(),
    );
    expect(
      within(venuesTab).getByLabelText("Action needed"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("tab", { name: /Event Info/ })).getByLabelText(
        "Complete",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pending venue and equipment confirmation to proceed"),
    ).toBeInTheDocument();
  });

  /** The venue section offers the catalogue link until a venue is requested, then shows the request and its request link. */
  it("offers View Venue Catalogue until a venue is requested, then View Venue Request", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));
    const catalogue = await screen.findByRole("link", {
      name: "View Venue Catalogue",
    });
    expect(catalogue).toHaveAttribute("href", `/venues?eventId=${EVENT_ID}`);
    expect(screen.getByText("Venue Yet To Be Requested")).toBeInTheDocument();
    expect(screen.queryByText("Venue Request Pending")).not.toBeInTheDocument();
    cleanup();

    current = checklist({
      venue: {
        status: "pending",
        items: [
          {
            id: "b1",
            venueName: "Main Hall",
            status: "pending",
            requestedDate: "2026-10-10T00:00:00.000Z",
          },
        ],
      },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));
    expect(
      await screen.findByText("Venue Request Pending"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Main Hall/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View Venue Request" }),
    ).toBeInTheDocument();
  });

  /** The equipment section shows the not-yet-requested and pending states, each with its own link, and no checkbox while nothing is requested. */
  it("shows the equipment request states", async () => {
    const user = userEvent.setup();
    current = checklist({
      equipment: {
        required: true,
        status: "not_requested",
        items: [],
        confirmedByCoordinator: false,
      },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Equipment/ }));
    expect(
      await screen.findByText("Equipment Yet To Be Requested"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request Equipment" }),
    ).toHaveAttribute("href", "/equipment/requests");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    cleanup();

    current = checklist({
      equipment: {
        required: true,
        status: "pending",
        items: [
          { id: "e1", name: "Projector", quantity: 1, status: "pending" },
        ],
        confirmedByCoordinator: false,
      },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Equipment/ }));
    expect(
      await screen.findByText("Equipment Request Pending"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View Equipment Request" }),
    ).toBeInTheDocument();
  });

  /** Each venue request is listed with its own badge, and the Venues tab is ticked only when every request is confirmed. */
  it("lists every venue request with its own status and ticks Venues only when all are confirmed", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "pending",
        items: [
          {
            id: "b1",
            venueName: "Main Hall",
            status: "confirmed",
            requestedDate: "2026-10-10T00:00:00.000Z",
          },
          {
            id: "b2",
            venueName: "Breakout Room 1",
            status: "pending",
            requestedDate: "2026-10-11T00:00:00.000Z",
          },
        ],
      },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));
    const list = await screen.findByRole("list", { name: "Requests" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getAllByRole("img", { name: "Complete" })).toHaveLength(
      1,
    );
    expect(list).toHaveTextContent("Main Hall");
    expect(list).toHaveTextContent("Breakout Room 1");
    expect(within(list).getByText("Confirmed")).toBeInTheDocument();
    expect(within(list).getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Venue Request Pending")).toBeInTheDocument();
    expect(
      within(screen.getByRole("tab", { name: /Venues/ })).getByLabelText(
        "Action needed",
      ),
    ).toBeInTheDocument();
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
    expect(
      within(screen.getByRole("tab", { name: /Venues/ })).getByLabelText(
        "Complete",
      ),
    ).toBeInTheDocument();
  });

  /** VEN-BKG-09-A: cancelled venue history remains available in My Bookings but is removed from the active event checklist. */
  it("VEN-BKG-09-A SPM-54 hides cancelled venues from the active Venues checklist while retaining active requests", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "pending",
        items: [
          {
            id: "cancelled",
            venueName: "Cancelled Hall",
            status: "cancelled",
            requestedDate: "2026-10-10T00:00:00.000Z",
          },
          {
            id: "active",
            venueName: "Active Room",
            status: "pending",
            requestedDate: "2026-10-11T00:00:00.000Z",
          },
        ],
      },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));
    const requests = await screen.findByRole("list", { name: "Requests" });
    expect(within(requests).getByText(/Active Room/)).toBeInTheDocument();
    expect(
      within(requests).queryByText(/Cancelled Hall/),
    ).not.toBeInTheDocument();
  });

  /** An unavailable venue shows a yellow caution on the Venues tab (not a red one) and offers a link to request another venue. */
  it("shows a yellow Action needed caution on the Venues tab and a request-another link when the venue is unavailable", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "unavailable",
        items: [{ id: "b1", venueName: "Main Hall", status: "unavailable" }],
      },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));
    expect(await screen.findByText("Venue Unavailable")).toBeInTheDocument();
    expect(
      within(screen.getByRole("tab", { name: /Venues/ })).getByLabelText(
        "Action needed",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request Another Venue" }),
    ).toHaveAttribute("href", `/venues?eventId=${EVENT_ID}`);
    expect(
      screen.queryByText("Venue Yet To Be Requested"),
    ).not.toBeInTheDocument();
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
    const removeButton = await screen.findByRole("button", {
      name: "Remove Seminar Room B From List",
    });
    expect(removeButton).toBeInTheDocument();
    expect(removeButton).toHaveTextContent("Remove From List");
    expect(screen.getAllByRole("button", { name: /From List/ })).toHaveLength(
      1,
    );
    expect(
      within(screen.getByRole("list", { name: "Requests" })).getByText(
        "Unavailable",
      ),
    ).toBeInTheDocument();
  });

  /** Cancelling a venue removal leaves the request listed and sends no DELETE. */
  it("cancelling the removal of a venue request sends no DELETE", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "unavailable",
        items: [
          { id: "b2", venueName: "Seminar Room B", status: "unavailable" },
        ],
      },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));

    await user.click(
      await screen.findByRole("button", {
        name: "Remove Seminar Room B From List",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      await screen.findByRole("button", {
        name: "Remove Seminar Room B From List",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirm Remove" }),
    ).not.toBeInTheDocument();
    expect(
      apiMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toHaveLength(0);
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
      if (
        init?.method === "DELETE" &&
        path === `/events/${EVENT_ID}/venue-requests/b2`
      ) {
        current = checklist({
          venue: {
            status: "confirmed",
            items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }],
          },
        });
        return Promise.resolve({
          eventId: EVENT_ID,
          venueRequestId: "b2",
          removed: true,
        });
      }
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({
          eventId: EVENT_ID,
          ready: false,
          outstanding: [],
          checklist: current,
        });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();
    const venuesTab = await screen.findByRole("tab", { name: /Venues/ });
    await user.click(venuesTab);
    expect(
      within(venuesTab).getByLabelText("Action needed"),
    ).toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", {
        name: "Remove Seminar Room B From List",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm Remove" }));

    expect(
      await screen.findByText("Venue removed from list"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Seminar Room B")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(screen.getByRole("tab", { name: /Venues/ })).getByLabelText(
          "Complete",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      apiMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toHaveLength(1);
  });

  /** A failed venue removal keeps the request listed and shows the server message. */
  it("keeps the unavailable venue listed and shows an error when removal fails", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "unavailable",
        items: [
          { id: "b2", venueName: "Seminar Room B", status: "unavailable" },
        ],
      },
    });
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (init?.method === "DELETE")
        return Promise.reject(
          new ApiError(
            "Only a venue request that is unavailable can be removed.",
            undefined,
            undefined,
            409,
          ),
        );
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({
          eventId: EVENT_ID,
          ready: false,
          outstanding: [],
          checklist: current,
        });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));

    await user.click(
      await screen.findByRole("button", {
        name: "Remove Seminar Room B From List",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm Remove" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only a venue request that is unavailable can be removed.",
    );
    expect(screen.getByText("Seminar Room B")).toBeInTheDocument();
    expect(
      screen.queryByText("Venue removed from list"),
    ).not.toBeInTheDocument();
  });

  /**
   * VEN-BKG-SUP-07 SPM-54: an open venue removal shows "Removing…" and is disabled while another planning request is in flight (planning checklist behaviour owned by SPM-135; parent AC9).
   * Kills: a removal confirmation that stays enabled and reads "Confirm Remove" while its request is still pending.
   */
  it("VEN-BKG-SUP-07 SPM-54 shows Removing… on an open venue removal while the equipment confirmation is in flight", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "unavailable",
        items: [
          { id: "b2", venueName: "Seminar Room B", status: "unavailable" },
        ],
      },
    });
    const confirmNone = deferred<unknown>();
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (init?.method === "POST" && path.endsWith("/confirm-no-equipment"))
        return confirmNone.promise;
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({
          eventId: EVENT_ID,
          ready: false,
          outstanding: [],
          checklist: current,
        });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();

    await user.click(await screen.findByRole("tab", { name: /Venues/ }));
    await user.click(
      await screen.findByRole("button", {
        name: "Remove Seminar Room B From List",
      }),
    );
    await user.click(screen.getByRole("tab", { name: /Equipment/ }));
    await user.click(
      screen.getByRole("checkbox", { name: "Confirm no equipment needed" }),
    );
    await user.click(screen.getByRole("tab", { name: /Venues/ }));

    expect(screen.getByRole("button", { name: "Removing…" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Confirm Remove" }),
    ).not.toBeInTheDocument();
    await act(async () => {
      confirmNone.resolve({});
    });
  });

  /**
   * VEN-BKG-SUP-08 SPM-54: a status response without a checklist shows the loading placeholder, not an error (planning checklist behaviour owned by SPM-135; parent AC9).
   * Kills: a planning page that reports a failure, or renders an empty safety check, when the response omits the checklist.
   */
  it("VEN-BKG-SUP-08 SPM-54 shows the loading placeholder, not an error, when the status response has no checklist", async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(((path: string) => {
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({
          eventId: EVENT_ID,
          ready: false,
          outstanding: [],
        });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();

    await user.click(await screen.findByRole("tab", { name: /Venues/ }));

    expect(screen.getAllByText("Loading…")).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Operational Safety Check" }),
    ).not.toBeInTheDocument();
  });

  /**
   * VEN-BKG-SUP-09 SPM-54: a checklist load or action that finishes after the coordinator has left the planning page is ignored without an error (planning checklist behaviour owned by SPM-135; parent AC9).
   * Kills: a page that logs or throws when a checklist load or action completes after it has unmounted.
   */
  it("VEN-BKG-SUP-09 SPM-54 ignores a checklist response that arrives after the page is left", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const load = deferred<unknown>();
    apiMock.mockImplementation(((path: string) => {
      if (path.endsWith("/arrangements-status")) return load.promise;
      return Promise.resolve({});
    }) as typeof api);
    const { unmount, container } = renderPage();

    unmount();
    await act(async () => {
      load.resolve({
        eventId: EVENT_ID,
        ready: true,
        outstanding: [],
        checklist: current,
      });
    });

    expect(container).toBeEmptyDOMElement();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  /** VEN-BKG-SUP-09 SPM-54: a checklist load that fails after the page is left is ignored without an error. */
  it("VEN-BKG-SUP-09 SPM-54 ignores a checklist failure that arrives after the page is left", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const load = deferred<unknown>();
    apiMock.mockImplementation(((path: string) => {
      if (path.endsWith("/arrangements-status")) return load.promise;
      return Promise.resolve({});
    }) as typeof api);
    const { unmount, container } = renderPage();

    unmount();
    await act(async () => {
      load.reject(new ApiError("Server error", undefined, "SERVER_ERROR", 500));
    });

    expect(container).toBeEmptyDOMElement();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  /** VEN-BKG-SUP-09 SPM-54: a safety-check request that completes after the page is left is ignored without an error. */
  it("VEN-BKG-SUP-09 SPM-54 ignores a safety-check request that completes after the page is left", async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    current = checklist({
      canRequestSafetyCheck: true,
      blocking: [],
      venue: { status: "confirmed", items: [] },
      equipment: {
        required: false,
        status: "confirmed",
        items: [],
        confirmedByCoordinator: true,
      },
    });
    const request = deferred<unknown>();
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (init?.method === "POST" && path.endsWith("/safety-check/request"))
        return request.promise;
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({
          eventId: EVENT_ID,
          ready: false,
          outstanding: [],
          checklist: current,
        });
      return Promise.resolve({});
    }) as typeof api);
    const { unmount, container } = renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Request For Safety Check" }),
    );
    unmount();
    await act(async () => {
      request.resolve({ eventId: EVENT_ID, status: "pending" });
    });

    expect(container).toBeEmptyDOMElement();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  /**
   * VEN-BKG-SUP-05 SPM-54: a venue removal that fails with a non-Error rejection shows the action's own fallback message (planning checklist behaviour owned by SPM-135; parent AC9).
   * Kills: a page that shows nothing, or the raw rejection value, when a removal fails without a reason.
   */
  it("VEN-BKG-SUP-05 SPM-54 shows the venue removal fallback message when the failure carries no reason", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "unavailable",
        items: [
          { id: "b2", venueName: "Seminar Room B", status: "unavailable" },
        ],
      },
    });
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return Promise.reject("boom");
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({
          eventId: EVENT_ID,
          ready: false,
          outstanding: [],
          checklist: current,
        });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Venues/ }));

    await user.click(
      await screen.findByRole("button", {
        name: "Remove Seminar Room B From List",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm Remove" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not remove the venue.",
    );
    expect(screen.getByText("Seminar Room B")).toBeInTheDocument();
  });

  /**
   * VEN-BKG-SUP-06 SPM-54: a checklist refresh error reported by the parent page is shown as an alert above the checklist (planning checklist behaviour owned by SPM-135; parent AC9).
   * Kills: a page that drops the parent's refresh error instead of showing it to the coordinator.
   */
  it("VEN-BKG-SUP-06 SPM-54 shows the parent's refresh error above the planning checklist", async () => {
    render(
      <MemoryRouter>
        <PlanningInformationPage
          view={view}
          status="planning"
          refreshError="Event details could not be refreshed."
          onConfirmed={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Event details could not be refreshed.",
    );
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
    const removeButton = await screen.findByRole("button", {
      name: "Remove Microphone x2 From List",
    });
    expect(removeButton).toHaveTextContent("Remove From List");
    expect(screen.getAllByRole("button", { name: /From List/ })).toHaveLength(
      1,
    );
  });

  /** Cancelling an equipment removal leaves the request listed and sends no DELETE. */
  it("cancelling the removal of an equipment request sends no DELETE", async () => {
    const user = userEvent.setup();
    current = checklist({
      equipment: {
        required: true,
        status: "unavailable",
        items: [
          { id: "e2", name: "Microphone", quantity: 2, status: "unavailable" },
        ],
        confirmedByCoordinator: false,
      },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Equipment/ }));

    await user.click(
      await screen.findByRole("button", {
        name: "Remove Microphone x2 From List",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      await screen.findByRole("button", {
        name: "Remove Microphone x2 From List",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirm Remove" }),
    ).not.toBeInTheDocument();
    expect(
      apiMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toHaveLength(0);
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
      if (
        init?.method === "DELETE" &&
        path === `/events/${EVENT_ID}/equipment-reservations/e2`
      ) {
        current = checklist({
          equipment: {
            required: true,
            status: "confirmed",
            items: [
              { id: "e1", name: "Projector", quantity: 1, status: "confirmed" },
            ],
            confirmedByCoordinator: false,
          },
        });
        return Promise.resolve({
          eventId: EVENT_ID,
          equipmentReservationId: "e2",
          removed: true,
        });
      }
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({
          eventId: EVENT_ID,
          ready: false,
          outstanding: [],
          checklist: current,
        });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();
    const equipmentTab = await screen.findByRole("tab", { name: /Equipment/ });
    await user.click(equipmentTab);
    expect(
      within(equipmentTab).getByLabelText("Unavailable"),
    ).toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", {
        name: "Remove Microphone x2 From List",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm Remove" }));

    expect(
      await screen.findByText("Equipment removed from list"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Microphone x2")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(screen.getByRole("tab", { name: /Equipment/ })).getByLabelText(
          "Complete",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      apiMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toHaveLength(1);
  });

  /** A failed equipment removal keeps the request listed and shows the server message. */
  it("keeps the unavailable equipment listed and shows an error when removal fails", async () => {
    const user = userEvent.setup();
    current = checklist({
      equipment: {
        required: true,
        status: "unavailable",
        items: [
          { id: "e2", name: "Microphone", quantity: 2, status: "unavailable" },
        ],
        confirmedByCoordinator: false,
      },
    });
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (init?.method === "DELETE")
        return Promise.reject(
          new ApiError(
            "Only an equipment request that is unavailable can be removed.",
            undefined,
            undefined,
            409,
          ),
        );
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({
          eventId: EVENT_ID,
          ready: false,
          outstanding: [],
          checklist: current,
        });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Equipment/ }));

    await user.click(
      await screen.findByRole("button", {
        name: "Remove Microphone x2 From List",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm Remove" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only an equipment request that is unavailable can be removed.",
    );
    expect(screen.getByText("Microphone x2")).toBeInTheDocument();
    expect(
      screen.queryByText("Equipment removed from list"),
    ).not.toBeInTheDocument();
  });

  /** An unavailable equipment request shows a red caution on the Equipment tab and a link to request another item. */
  it("shows a red caution and a request-another link when the equipment is unavailable", async () => {
    const user = userEvent.setup();
    current = checklist({
      equipment: {
        required: true,
        status: "unavailable",
        items: [
          { id: "e1", name: "Projector", quantity: 1, status: "unavailable" },
        ],
        confirmedByCoordinator: false,
      },
    });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Equipment/ }));
    expect(
      await screen.findByText("Equipment Unavailable"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("tab", { name: /Equipment/ })).getByLabelText(
        "Unavailable",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request Another Equipment" }),
    ).toHaveAttribute("href", "/equipment/requests");
  });

  /** Ticking the no-equipment box posts the confirmation and refreshes the checklist. */
  it("posts the no-equipment confirmation from the checkbox and refreshes", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("tab", { name: /Equipment/ }));
    expect(
      await screen.findByText("Equipment Yet To Be Requested"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request Equipment" }),
    ).toBeInTheDocument();
    current = checklist({
      equipment: {
        required: false,
        status: "not_requested",
        items: [],
        confirmedByCoordinator: true,
        confirmedDate: "2026-10-13T09:00:00.000Z",
      },
    });
    await user.click(
      screen.getByRole("checkbox", { name: "Confirm no equipment needed" }),
    );
    await waitFor(() =>
      expect(postCalls().map(([path]) => path)).toEqual([
        `/events/${EVENT_ID}/confirm-no-equipment`,
      ]),
    );
    expect(
      await screen.findByText("No Equipment Required"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Confirmed")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  /** Request For Safety Check is enabled only once venue and equipment are both confirmed, and posting it sends the request. */
  it("enables Request For Safety Check once both prerequisites are met and posts it", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "confirmed",
        items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }],
      },
      equipment: {
        required: false,
        status: "not_requested",
        items: [],
        confirmedByCoordinator: true,
      },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    renderPage();
    const button = await screen.findByRole("button", {
      name: "Request For Safety Check",
    });
    await waitFor(() => expect(button).toBeEnabled());
    current = {
      ...current,
      safetyCheck: {
        status: "pending",
        requestedDate: "2026-10-13T10:00:00.000Z",
      },
    };
    await user.click(button);
    await waitFor(() =>
      expect(postCalls().map(([path]) => path)).toEqual([
        `/events/${EVENT_ID}/safety-check/request`,
      ]),
    );
    expect(
      await screen.findByText("Awaiting Safety Officer Check"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request For Safety Check" }),
    ).not.toBeInTheDocument();
  });

  /** Each safety feedback item is listed, and re-request stays disabled while any item is unresolved. */
  it("lists each feedback item and keeps re-request disabled until every item is resolved", async () => {
    current = checklist({
      venue: {
        status: "confirmed",
        items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }],
      },
      equipment: {
        required: false,
        status: "not_requested",
        items: [],
        confirmedByCoordinator: true,
      },
      safetyCheck: {
        status: "changes_needed",
        feedback: [
          {
            id: "f1",
            text: "Add a second fire exit.",
            requestedAt: "2026-10-11T07:00:00.000Z",
          },
          {
            id: "f2",
            text: "Confirm occupancy.",
            requestedAt: "2026-10-11T07:00:00.000Z",
          },
        ],
      },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    renderPage();
    expect(await screen.findByText("Changes needed")).toBeInTheDocument();
    expect(screen.getByText("Add a second fire exit.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "0 of 2 items resolved. Complete all before re-requesting.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Re-Request Safety Check" }),
    ).toBeDisabled();
  });

  /** Ticking a feedback item resolves it, and re-request becomes available once every item is ticked. */
  it("resolves a feedback item when its checkbox is ticked, and enables re-request once all are ticked", async () => {
    const items = [
      {
        id: "f1",
        text: "Add a second fire exit.",
        requestedAt: "2026-10-11T07:00:00.000Z",
      },
      {
        id: "f2",
        text: "Confirm occupancy.",
        requestedAt: "2026-10-11T07:00:00.000Z",
      },
    ];
    current = checklist({
      venue: {
        status: "confirmed",
        items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }],
      },
      equipment: {
        required: false,
        status: "not_requested",
        items: [],
        confirmedByCoordinator: true,
      },
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
            feedback: items.map((item) =>
              item.id === id
                ? {
                    ...item,
                    resolvedByCoordinatorAt: "2026-10-13T10:00:00.000Z",
                  }
                : item,
            ),
          },
        };
        return Promise.resolve({});
      }
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({
          eventId: EVENT_ID,
          ready: false,
          outstanding: [],
          checklist: current,
        });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();
    const user = userEvent.setup();

    await user.click((await screen.findAllByRole("checkbox"))[0]);
    expect(
      await screen.findByText(
        "1 of 2 items resolved. Complete all before re-requesting.",
      ),
    ).toBeInTheDocument();
    expect(postCalls().map(([path]) => path)).toEqual([
      `/events/${EVENT_ID}/safety-check/feedback/f1/resolve`,
    ]);
    expect(
      screen.getByRole("button", { name: "Re-Request Safety Check" }),
    ).toBeDisabled();
  });

  /** Once the safety check is approved, the verifier is shown with the Confirm Event button. */
  it("shows the verifier and the Confirm Event button once approved", async () => {
    current = checklist({
      venue: {
        status: "confirmed",
        items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }],
      },
      equipment: {
        required: false,
        status: "not_requested",
        items: [],
        confirmedByCoordinator: true,
      },
      safetyCheck: { status: "approved", approverName: "Safety Officer 1" },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    renderPage();
    expect(
      await screen.findByText(/Verified by Safety Officer 1/),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Confirm Event" }),
    ).toBeInTheDocument();
  });

  /** A failed action shows its error message instead of failing silently. */
  it("reports a failed action instead of silently doing nothing", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "confirmed",
        items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }],
      },
      equipment: {
        required: false,
        status: "not_requested",
        items: [],
        confirmedByCoordinator: true,
      },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return Promise.reject(
          new Error("Pending venue confirmation to proceed."),
        );
      return Promise.resolve({
        eventId: EVENT_ID,
        ready: false,
        outstanding: [],
        checklist: current,
      });
    }) as typeof api);
    renderPage();
    const button = await screen.findByRole("button", {
      name: "Request For Safety Check",
    });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pending venue confirmation to proceed.",
    );
  });

  /**
   * The page re-reads the checklist every PLANNING_REFRESH_MS while the tab is visible, so a change made elsewhere
   * shows without a reload, and it skips the read while the tab is hidden.
   */
  it("re-reads the checklist every 15 seconds while the page is visible and not while it is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const visibility = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "visibilityState",
    );
    const setVisibility = (value: DocumentVisibilityState) =>
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => value,
      });
    try {
      renderPage();
      await screen.findByRole("tab", { name: /Venues/ });
      const reads = () =>
        apiMock.mock.calls.filter(([path]) =>
          String(path).endsWith("/arrangements-status"),
        ).length;
      const initial = reads();

      // The page and its confirm panel both poll, so assert the direction of change rather than an exact count.
      await vi.advanceTimersByTimeAsync(PLANNING_REFRESH_MS);
      const afterVisibleTick = reads();
      expect(afterVisibleTick).toBeGreaterThan(initial);

      setVisibility("hidden");
      await vi.advanceTimersByTimeAsync(PLANNING_REFRESH_MS);
      expect(reads()).toBe(afterVisibleTick);

      setVisibility("visible");
      await vi.advanceTimersByTimeAsync(PLANNING_REFRESH_MS);
      expect(reads()).toBeGreaterThan(afterVisibleTick);
    } finally {
      if (visibility)
        Object.defineProperty(document, "visibilityState", visibility);
      else delete (document as { visibilityState?: unknown }).visibilityState;
      vi.useRealTimers();
    }
  });

  /** When changes are needed and the server lists no feedback items, the coordinator can still re-request once venue and equipment are confirmed. */
  it("re-requests the safety check when changes are needed and no feedback items are listed", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "confirmed",
        items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }],
      },
      equipment: {
        required: false,
        status: "not_requested",
        items: [],
        confirmedByCoordinator: true,
      },
      safetyCheck: { status: "changes_needed" },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Re-Request Safety Check" }),
    );

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(postCalls()[0][0]).toBe(`/events/${EVENT_ID}/safety-check/request`);
  });

  /** MONITOR-QUEUE-07-C (SPM-48 AC7): a rejected arrangement shows Rejected and can be requested again once ready (SPM-131 AC6). */
  it("MONITOR-QUEUE-07-C labels a rejected safety check and re-requests it", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "confirmed",
        items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }],
      },
      equipment: {
        required: false,
        status: "not_requested",
        items: [],
        confirmedByCoordinator: true,
      },
      safetyCheck: { status: "rejected" },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    renderPage();

    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Re-Request Safety Check" }));

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(postCalls()[0][0]).toBe(`/events/${EVENT_ID}/safety-check/request`);
  });

  /** MONITOR-QUEUE-07-C: while the venue or equipment is not ready, a rejected check cannot be requested again. */
  it("MONITOR-QUEUE-07-C disables the re-request until the arrangements are ready", async () => {
    current = checklist({
      safetyCheck: { status: "rejected" },
      canRequestSafetyCheck: false,
      blocking: ["venue"],
    });
    renderPage();

    expect(await screen.findByRole("button", { name: "Re-Request Safety Check" })).toBeDisabled();
  });

  /** When the checklist cannot be read, the page shows the failure reason, or a generic message when the failure carries none. */
  it.each([
    ["an Error", new Error("Network down"), "Network down"],
    ["a non-Error rejection", "boom", "Could not load the planning checklist."],
  ])(
    "shows a load failure from %s and no checklist",
    async (_label, failure, expected) => {
      apiMock.mockImplementation(((path: string) =>
        path.endsWith("/arrangements-status")
          ? Promise.reject(failure)
          : Promise.resolve({})) as typeof api);
      renderPage();

      const alerts = await screen.findAllByRole("alert");
      expect(alerts.map((alert) => alert.textContent)).toContain(expected);
      expect(
        screen.queryByRole("button", { name: "Request For Safety Check" }),
      ).not.toBeInTheDocument();
    },
  );

  /** MONITOR-QUEUE-07-C: a safety check reset by a later change shows its reason and date, and labels the re-request. */
  it("MONITOR-QUEUE-07-C shows the reset reason and date and labels the re-request as Re-Request For Safety Check", async () => {
    current = checklist({
      canRequestSafetyCheck: true,
      blocking: [],
      safetyCheck: {
        status: "not_requested",
        resetReason: "Venue change",
        resetDate: "2026-10-20T02:00:00.000Z",
      },
    });
    renderPage();

    const notice = await screen.findByText("Re-request needed.");
    expect(notice.closest("p")).toHaveTextContent(
      /Re-request needed\. Venue change on \w{3} \d{1,2}, 2026, [^,]+, so the earlier safety check no longer applies\./,
    );
    expect(
      screen.getByRole("button", { name: "Re-Request For Safety Check" }),
    ).toBeEnabled();
  });

  /** MONITOR-QUEUE-07-C: a reset reason with no reset date shows the reason without a date. */
  it("MONITOR-QUEUE-07-C shows a reset reason without a date as a sentence with no date", async () => {
    current = checklist({
      canRequestSafetyCheck: true,
      blocking: [],
      safetyCheck: { status: "not_requested", resetReason: "Venue change" },
    });
    renderPage();

    const notice = await screen.findByText("Re-request needed.");
    expect(notice.closest("p")).toHaveTextContent(
      "Re-request needed. Venue change, so the earlier safety check no longer applies.",
    );
    expect(
      screen.getByRole("button", { name: "Re-Request For Safety Check" }),
    ).toBeEnabled();
  });

  /** A successful Confirm Event shows the server's confirmation message and tells the parent page the event is confirmed. */
  it("tells the parent when Confirm Event succeeds", async () => {
    const user = userEvent.setup();
    const onConfirmed = vi.fn();
    current = checklist({
      venue: {
        status: "confirmed",
        items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }],
      },
      equipment: {
        required: false,
        status: "not_requested",
        items: [],
        confirmedByCoordinator: true,
      },
      safetyCheck: { status: "approved", approverName: "Safety Officer 1" },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (
        init?.method === "POST" &&
        path === `/events/${EVENT_ID}/status-change`
      )
        return Promise.resolve({
          eventId: EVENT_ID,
          status: "Confirmed",
          message: "Event confirmed.",
        });
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({
          eventId: EVENT_ID,
          ready: true,
          outstanding: [],
          checklist: current,
        });
      return Promise.resolve({});
    }) as typeof api);
    render(
      <MemoryRouter>
        <PlanningInformationPage
          view={view}
          status="planning"
          onConfirmed={onConfirmed}
        />
      </MemoryRouter>,
    );

    const confirm = await screen.findByRole("button", {
      name: "Confirm Event",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Event confirmed.")).toBeInTheDocument();
  });

  /** Unticking a resolved feedback item clears its resolution on the server and the progress count drops back. */
  it("clears a feedback item's resolution when its checkbox is unticked", async () => {
    const user = userEvent.setup();
    const items = [
      {
        id: "f1",
        text: "Add a second fire exit.",
        requestedAt: "2026-10-11T07:00:00.000Z",
        resolvedByCoordinatorAt: "2026-10-13T10:00:00.000Z",
      },
      {
        id: "f2",
        text: "Confirm occupancy.",
        requestedAt: "2026-10-11T07:00:00.000Z",
      },
    ];
    current = checklist({
      venue: {
        status: "confirmed",
        items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }],
      },
      equipment: {
        required: false,
        status: "not_requested",
        items: [],
        confirmedByCoordinator: true,
      },
      safetyCheck: { status: "changes_needed", feedback: items },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    apiMock.mockImplementation(((path: string, init?: RequestInit) => {
      if (
        init?.method === "DELETE" &&
        path === `/events/${EVENT_ID}/safety-check/feedback/f1/resolve`
      ) {
        current = {
          ...current,
          safetyCheck: {
            ...current.safetyCheck,
            feedback: items.map(
              ({ resolvedByCoordinatorAt: _cleared, ...item }) => item,
            ),
          },
        };
        return Promise.resolve({});
      }
      if (path.endsWith("/arrangements-status"))
        return Promise.resolve({
          eventId: EVENT_ID,
          ready: false,
          outstanding: [],
          checklist: current,
        });
      return Promise.resolve({});
    }) as typeof api);
    renderPage();
    expect(
      await screen.findByText(
        "1 of 2 items resolved. Complete all before re-requesting.",
      ),
    ).toBeInTheDocument();

    await user.click((await screen.findAllByRole("checkbox"))[0]);

    expect(
      await screen.findByText(
        "0 of 2 items resolved. Complete all before re-requesting.",
      ),
    ).toBeInTheDocument();
    const deletes = apiMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
    );
    expect(deletes.map(([path]) => path)).toEqual([
      `/events/${EVENT_ID}/safety-check/feedback/f1/resolve`,
    ]);
  });

  /** A failed tick shows the server's message for a known error, or a fallback for any other failure, and the item stays unresolved. */
  it.each([
    [
      "a server error",
      new ApiError(
        "This feedback item was not found for the safety check.",
        undefined,
        undefined,
        404,
      ),
      "This feedback item was not found for the safety check.",
    ],
    ["an unexpected failure", "boom", "Could not update feedback resolution."],
  ])(
    "shows %s when ticking a feedback item fails",
    async (_label, failure, expected) => {
      const user = userEvent.setup();
      current = checklist({
        venue: {
          status: "confirmed",
          items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }],
        },
        equipment: {
          required: false,
          status: "not_requested",
          items: [],
          confirmedByCoordinator: true,
        },
        safetyCheck: {
          status: "changes_needed",
          feedback: [
            {
              id: "f1",
              text: "Add a second fire exit.",
              requestedAt: "2026-10-11T07:00:00.000Z",
            },
          ],
        },
        canRequestSafetyCheck: true,
        blocking: [],
      });
      apiMock.mockImplementation(((path: string, init?: RequestInit) => {
        if (init?.method === "POST" && path.endsWith("/resolve"))
          return Promise.reject(failure);
        if (path.endsWith("/arrangements-status"))
          return Promise.resolve({
            eventId: EVENT_ID,
            ready: false,
            outstanding: [],
            checklist: current,
          });
        return Promise.resolve({});
      }) as typeof api);
      renderPage();

      await user.click(await screen.findByRole("checkbox"));

      expect(await screen.findByRole("alert")).toHaveTextContent(expected);
      expect(
        screen.getByText(
          "0 of 1 items resolved. Complete all before re-requesting.",
        ),
      ).toBeInTheDocument();
    },
  );

  /** Once every feedback item is resolved, Re-Request sends the request and the page reads the checklist again. */
  it("re-requests the safety check once every feedback item is resolved and refreshes the checklist", async () => {
    const user = userEvent.setup();
    current = checklist({
      venue: {
        status: "confirmed",
        items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }],
      },
      equipment: {
        required: false,
        status: "not_requested",
        items: [],
        confirmedByCoordinator: true,
      },
      safetyCheck: {
        status: "changes_needed",
        feedback: [
          {
            id: "f1",
            text: "Add a second fire exit.",
            requestedAt: "2026-10-11T07:00:00.000Z",
            resolvedByCoordinatorAt: "2026-10-13T10:00:00.000Z",
          },
        ],
      },
      canRequestSafetyCheck: true,
      blocking: [],
    });
    renderPage();
    const reads = () =>
      apiMock.mock.calls.filter(([path]) =>
        String(path).endsWith("/arrangements-status"),
      ).length;
    const button = await screen.findByRole("button", {
      name: "Re-Request Safety Check",
    });
    await waitFor(() => expect(button).toBeEnabled());
    const readsBefore = reads();

    await user.click(button);

    await waitFor(() =>
      expect(postCalls().map(([path]) => path)).toEqual([
        `/events/${EVENT_ID}/safety-check/request`,
      ]),
    );
    await waitFor(() => expect(reads()).toBeGreaterThan(readsBefore));
  });

  /** A failed re-request shows the server's message for a known error, or a fallback otherwise. */
  it.each([
    [
      "a server error",
      new ApiError(
        "The safety check is already pending.",
        undefined,
        undefined,
        409,
      ),
      "The safety check is already pending.",
    ],
    ["an unexpected failure", "boom", "Could not request the safety check."],
  ])(
    "shows %s when re-requesting the safety check fails",
    async (_label, failure, expected) => {
      const user = userEvent.setup();
      current = checklist({
        venue: {
          status: "confirmed",
          items: [{ id: "b1", venueName: "Main Hall", status: "confirmed" }],
        },
        equipment: {
          required: false,
          status: "not_requested",
          items: [],
          confirmedByCoordinator: true,
        },
        safetyCheck: {
          status: "changes_needed",
          feedback: [
            {
              id: "f1",
              text: "Add a second fire exit.",
              requestedAt: "2026-10-11T07:00:00.000Z",
              resolvedByCoordinatorAt: "2026-10-13T10:00:00.000Z",
            },
          ],
        },
        canRequestSafetyCheck: true,
        blocking: [],
      });
      apiMock.mockImplementation(((path: string, init?: RequestInit) => {
        if (init?.method === "POST" && path.endsWith("/safety-check/request"))
          return Promise.reject(failure);
        if (path.endsWith("/arrangements-status"))
          return Promise.resolve({
            eventId: EVENT_ID,
            ready: false,
            outstanding: [],
            checklist: current,
          });
        return Promise.resolve({});
      }) as typeof api);
      renderPage();
      const button = await screen.findByRole("button", {
        name: "Re-Request Safety Check",
      });
      await waitFor(() => expect(button).toBeEnabled());

      await user.click(button);

      expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    },
  );

  /** A pending section is not ticked: its card shows no Complete icon even when one of its requests is confirmed. */
  it("CONFIRM-EVENT-SUP-40 does not tick a pending venue section on its card", async () => {
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
    const card = (await screen.findByText("Venue Request Pending")).closest(".rounded-lg") as HTMLElement;
    // The header icon is the first image on the card; the confirmed row further down has its own tick.
    expect(within(card).getAllByRole("img")[0]).not.toHaveAttribute("aria-label", "Complete");
  });
});
