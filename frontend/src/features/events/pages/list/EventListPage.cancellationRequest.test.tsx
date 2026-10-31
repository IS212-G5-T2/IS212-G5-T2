import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { EventListPage } from "@/features/events/pages/list/EventListPage";
import type { CancellationRequest } from "@/features/events/types/cancellationRequest";
import { useAppStore } from "@/store/useAppStore";
import { deferred } from "@/test/deferred";
import { api } from "@/utils/api";
import type { EventRecord } from "@/types";

/*
 * SPM-155 D13b: the Organiser's event list (EventListPage) shows the cancellation request indicator beside each
 * event that has a request (AC2), and loading it never blocks or breaks the list. The HTTP layer is the boundary.
 * Mutant IDs in each "Kills:" line are defined in frontend/scripts/testing/mutation/spm155.mutants.mjs.
 */

vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api: vi.fn() }));
const apiMock = vi.mocked(api);

const T0 = "2026-10-12T04:00:00.000Z";
const eventOf = (id: string, name: string): EventRecord =>
  ({
    id,
    name,
    purpose: "Purpose",
    description: "",
    organiserId: "org-01",
    organiserName: "Organiser",
    status: "approved",
    startDateTime: "2026-11-05T02:00:00.000Z",
    endDateTime: "2026-11-05T04:00:00.000Z",
    expectedAttendance: 40,
    venueRequirements: { minCapacity: 40, layout: "Banquet", facilities: [], accessibility: [] },
    attachments: [],
    equipmentNeeds: "",
    registrationEnabled: false,
    createdAt: T0,
    updatedAt: T0,
  }) as EventRecord;

const request = (eventId: string, over: Partial<CancellationRequest>): CancellationRequest => ({
  id: `req-${eventId}`,
  eventId,
  eventName: "x",
  status: "pending",
  displayStatus: "pending",
  reason: null,
  requestedBy: "Farid Rahman",
  requestedAt: T0,
  ...over,
});

function serve(requests: CancellationRequest[] | Error | null) {
  apiMock.mockImplementation(((path: string) => {
    if (path === "/events") return Promise.resolve([eventOf("evt-a", "Hack Night"), eventOf("evt-b", "Career Fair")]);
    if (path === "/requests") return Promise.resolve([]);
    if (path === "/cancellation-requests") return requests instanceof Error ? Promise.reject(requests) : Promise.resolve(requests);
    return Promise.resolve([]);
  }) as typeof api);
}

function renderList(role: "organiser" | "attendee" | "coordinator" = "organiser") {
  useAppStore.setState({
    currentUser: { id: role === "organiser" ? "org-01" : "u-1", role, roles: [role], name: "U", email: "u@example.test" } as never,
    events: [],
    eventListFilters: { attendee: "upcoming", status: null },
  });
  return render(
    <MemoryRouter>
      <EventListPage />
    </MemoryRouter>,
  );
}

const cardOf = async (name: string) => (await screen.findByRole("heading", { name })).closest("a") as HTMLElement;

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SPM-155 Organiser event list indicator (D13b)", () => {
  // Kills: FM37, FM38, FM39, FM47
  /** CANCEL-REQUEST-02-A (list): EVT-1103's row shows Cancellation requested; the other event's row shows nothing. */
  it("CANCEL-REQUEST-02-A: the pending event's card shows Cancellation requested and the other card does not", async () => {
    // Arrange
    serve([request("evt-a", {})]);

    // Act
    renderList();

    // Assert
    expect(within(await cardOf("Hack Night")).getByText("Cancellation requested")).toBeInTheDocument();
    expect(within(await cardOf("Career Fair")).queryByText(/Cancellation/)).not.toBeInTheDocument();
  });

  // Kills: FM37, FM39, FM40, FM47, FM51
  /** CANCEL-REQUEST-02-B and 02-C (list): Accepted and Declined are shown on the list too. */
  it("CANCEL-REQUEST-02-B: accepted and declined requests are labelled on their cards", async () => {
    // Arrange
    serve([request("evt-a", { status: "accepted", displayStatus: "accepted" }), request("evt-b", { status: "declined", displayStatus: "declined" })]);

    // Act
    renderList();

    // Assert
    expect(within(await cardOf("Hack Night")).getByText("Cancellation accepted")).toBeInTheDocument();
    expect(within(await cardOf("Career Fair")).getByText("Cancellation declined")).toBeInTheDocument();
  });

  // Kills: FM38, FM41
  /** CANCEL-REQUEST-02-A: if the requests cannot load, the events still show without an indicator. */
  it("CANCEL-REQUEST-02-A: a failed request load leaves the event list intact", async () => {
    // Arrange
    serve(new Error("Unable to reach the server."));

    // Act
    renderList();

    // Assert
    expect(await cardOf("Hack Night")).toBeInTheDocument();
    expect(screen.queryByText(/Cancellation request/)).not.toBeInTheDocument();
  });

  // Kills: FM42
  /** CANCEL-REQUEST-02-D (list): an attendee's list never asks for cancellation requests. */
  it("CANCEL-REQUEST-02-D: an attendee's list does not fetch cancellation requests", async () => {
    // Arrange
    serve([request("evt-a", {})]);

    // Act
    renderList("attendee");
    await vi.waitFor(() => expect(apiMock).toHaveBeenCalledWith("/events"));

    // Assert
    expect(apiMock.mock.calls.some(([path]) => path === "/cancellation-requests")).toBe(false);
  });
});

describe("SPM-155 Organiser event list indicator: unexpected replies", () => {
  // Kills: FM38
  /** CANCEL-REQUEST-02-A: a reply that is not a list is treated as no requests, so the cards render without an indicator. */
  it("CANCEL-REQUEST-02-A: a reply that is not an array shows the cards with no indicator", async () => {
    // Arrange
    serve(null);

    // Act
    renderList();

    // Assert
    expect(await cardOf("Hack Night")).toBeInTheDocument();
    expect(screen.queryByText(/Cancellation request/)).not.toBeInTheDocument();
  });
});

describe("SPM-155 Organiser event list indicator: out-of-order replies", () => {
  // Kills: FM37, FM44, FM47
  /** CANCEL-REQUEST-02-F: after Retry reloads the page, an older, slower indicator reply must not replace the newer one. */
  it("CANCEL-REQUEST-02-F: a stale indicator reply that arrives after Retry is ignored", async () => {
    // Arrange: the first events load fails (so Retry shows); the first indicator reply is held back
    const stale = deferred<CancellationRequest[]>();
    let eventLoads = 0;
    let requestLoads = 0;
    apiMock.mockImplementation(((path: string) => {
      if (path === "/events") return ++eventLoads === 1 ? Promise.reject(new Error("Unable to reach the server.")) : Promise.resolve([eventOf("evt-a", "Hack Night")]);
      if (path === "/cancellation-requests") return ++requestLoads === 1 ? stale.promise : Promise.resolve([request("evt-a", {})]);
      return Promise.resolve([]);
    }) as typeof api);
    renderList();

    // Act: Retry reloads (the newer indicator reply says pending), then the older reply (accepted) arrives last
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(within(await cardOf("Hack Night")).getByText("Cancellation requested")).toBeInTheDocument();
    await act(async () => {
      stale.resolve([request("evt-a", { status: "accepted", displayStatus: "accepted" })]);
      await stale.promise;
    });

    // Assert: still the newer reply
    expect(within(await cardOf("Hack Night")).getByText("Cancellation requested")).toBeInTheDocument();
    expect(screen.queryByText("Cancellation accepted")).not.toBeInTheDocument();
  });
});
