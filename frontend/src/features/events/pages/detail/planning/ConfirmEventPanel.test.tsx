import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmEventPanel } from "@/features/events/pages/detail/planning/ConfirmEventPanel";
import { ApiError, api } from "@/utils/api";
import { deferred } from "@/test/deferred";

/*
 * SPM-135 Confirm an Event, frontend. The HTTP layer is mocked (the boundary);
 * the panel, its states and its texts are real. Literals are the catalogue
 * wording (MSG-CF-01, MSG-CF-02) and the matrix texts for 03-C.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000201";

type Routes = {
  arrangements?: { ready: boolean; outstanding: { type: string; label: string; detail: string; state: string }[] };
  confirm?: () => Promise<unknown>;
};

/** Routes the mocked HTTP layer by path; `calls` records every request. */
function route({ arrangements, confirm }: Routes) {
  const calls: { path: string; init?: RequestInit }[] = [];
  apiMock.mockImplementation((path: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path.endsWith("/arrangements-status")) {
      return Promise.resolve({ eventId: EVENT_ID, ready: arrangements?.ready ?? true, outstanding: arrangements?.outstanding ?? [] });
    }
    if (path.endsWith("/status-change")) return (confirm ?? (() => Promise.reject(new Error("unrouted"))))() as never;
    return Promise.reject(new Error(`unexpected ${path}`));
  });
  return calls;
}

const outstandingVenue = (venueName: string, state = "Pending") => ({
  type: "venue",
  label: "Venue booking approval",
  detail: `${venueName} (${state})`,
  state,
});

function renderPanel(overrides: Partial<React.ComponentProps<typeof ConfirmEventPanel>> = {}) {
  const onConfirmed = vi.fn();
  render(
    <ConfirmEventPanel
      eventId={EVENT_ID}
      status="planning"
      isAssignedCoordinator
      onConfirmed={onConfirmed}
      {...overrides}
    />,
  );
  return { onConfirmed };
}

describe("SPM-135 AC1: the assigned coordinator can confirm a fully arranged Planning event", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  afterEach(cleanup);

  it("CONFIRM-EVENT-01-A (FE): the button is shown, nothing is outstanding, and a click shows MSG-CF-01 and changes the status", async () => {
    // Arrange: EVT-201 "Product Launch Mixer" is ready
    const calls = route({
      arrangements: { ready: true, outstanding: [] },
      confirm: () => Promise.resolve({ eventId: EVENT_ID, status: "Confirmed", message: "Product Launch Mixer has been confirmed." }),
    });
    const { onConfirmed } = renderPanel();
    const user = userEvent.setup();

    // Act
    const button = await screen.findByRole("button", { name: "Confirm Event" });
    expect(screen.queryByRole("list", { name: "Outstanding arrangements" })).not.toBeInTheDocument();
    await user.click(button);

    // Assert: the request, the confirmation region, and the badge callback
    expect(calls.find((c) => c.path.endsWith("/status-change"))?.init?.body).toBe(JSON.stringify({ targetStatus: "Confirmed" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Product Launch Mixer has been confirmed.");
    expect(screen.queryByRole("button", { name: "Confirm Event" })).not.toBeInTheDocument();
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });
});

describe("SPM-135 AC1 (F9): nothing is offered to anyone but the assigned coordinator", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  afterEach(cleanup);

  it("CONFIRM-EVENT-01-C (FE): a coordinator who is not assigned sees no Confirm Event action and makes no request", () => {
    // Arrange
    const calls = route({});

    // Act
    renderPanel({ isAssignedCoordinator: false });

    // Assert
    expect(screen.queryByRole("button", { name: "Confirm Event" })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});

describe("SPM-135 AC2 and AC3: too-early clicks show what is outstanding", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  afterEach(cleanup);

  it("CONFIRM-EVENT-02-A (FE): EVT-202 with the venue Pending shows exactly one outstanding item and the badge does not change", async () => {
    // Arrange: EVT-202 (venue Pending); the server refuses the confirm
    route({
      arrangements: { ready: false, outstanding: [outstandingVenue("Main Hall")] },
      confirm: () => Promise.reject(new ApiError("This event cannot be confirmed yet. Outstanding: Venue booking approval: Main Hall (Pending)", undefined, "CONFIRM_BLOCKED", 422)),
    });
    const { onConfirmed } = renderPanel();
    const user = userEvent.setup();

    // Act
    await user.click(await screen.findByRole("button", { name: "Confirm Event" }));

    // Assert: MSG-CF-02 and one item; no confirmation text; no status change
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This event cannot be confirmed yet. Outstanding:");
    expect(within(screen.getByRole("list", { name: "Outstanding arrangements" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText(/has been confirmed/)).not.toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("CONFIRM-EVENT-02-C (FE): EVT-206 names Breakout Room 1 and does not name Main Hall", async () => {
    // Arrange
    route({
      arrangements: { ready: false, outstanding: [outstandingVenue("Breakout Room 1")] },
      confirm: () =>
        Promise.reject(new ApiError("This event cannot be confirmed yet. Outstanding: Venue booking approval: Breakout Room 1 (Pending)", undefined, "CONFIRM_BLOCKED", 422)),
    });
    renderPanel();
    const user = userEvent.setup();

    // Act
    await user.click(await screen.findByRole("button", { name: "Confirm Event" }));

    // Assert
    const list = await screen.findByRole("list", { name: "Outstanding arrangements" });
    expect(list).toHaveTextContent("Breakout Room 1");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Main Hall");
  });

  it("CONFIRM-EVENT-02-D (FE): the page loaded with nothing outstanding; the server then refuses and the list appears without a refresh", async () => {
    // Arrange: nothing outstanding at page load; Main Hall is flagged unavailable before the click
    const calls = route({ arrangements: { ready: true, outstanding: [] } });
    apiMock.mockImplementation((path: string) => {
      calls.push({ path });
      if (path.endsWith("/arrangements-status")) {
        const refreshed = calls.filter((c) => c.path.endsWith("/arrangements-status")).length > 1;
        return Promise.resolve({
          eventId: EVENT_ID,
          ready: !refreshed ? true : false,
          outstanding: refreshed ? [{ type: "venue", label: "Venue booking approval", detail: "Main Hall (Venue unavailable)", state: "Venue unavailable" }] : [],
        });
      }
      return Promise.reject(new ApiError("This event cannot be confirmed yet. Outstanding: Venue booking approval: Main Hall (Venue unavailable)", undefined, "CONFIRM_BLOCKED", 422));
    });
    renderPanel();
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "Confirm Event" });
    expect(screen.queryByRole("list", { name: "Outstanding arrangements" })).not.toBeInTheDocument();

    // Act
    await user.click(screen.getByRole("button", { name: "Confirm Event" }));

    // Assert: the list now shows the flagged venue
    expect(await screen.findByRole("list", { name: "Outstanding arrangements" })).toHaveTextContent(
      "Venue booking approval: Main Hall (Venue unavailable)",
    );
  });
});

describe("SPM-135 AC3: the outstanding list matches the server and names each item", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  afterEach(cleanup);

  it("CONFIRM-EVENT-03-A (FE): EVT-205 lists the same three items, in the order the server gives", async () => {
    // Arrange: EVT-205 (venue Pending, equipment Requested, safety Awaiting Check)
    const outstanding = [
      outstandingVenue("Breakout Room 1"),
      { type: "equipment", label: "Equipment reservation", detail: "Projector x1 (Requested)", state: "Requested" },
      { type: "safety", label: "Safety Officer approval", detail: "Awaiting check", state: "Awaiting Check" },
    ];
    route({ arrangements: { ready: false, outstanding } });

    // Act
    renderPanel();

    // Assert
    const items = within(await screen.findByRole("list", { name: "Outstanding arrangements" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Venue booking approval: Breakout Room 1 (Pending)",
      "Equipment reservation: Projector x1 (Requested)",
      "Safety Officer approval: Awaiting check",
    ]);
  });

  it("CONFIRM-EVENT-03-B (FE): the list shows only the Pending venue; after it is approved the next confirm succeeds", async () => {
    // Arrange: EVT-202 with the venue Pending; the first list has one item
    let approved = false;
    const calls = route({ arrangements: { ready: false, outstanding: [outstandingVenue("Main Hall")] } });
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.endsWith("/arrangements-status")) {
        return Promise.resolve(
          approved
            ? { eventId: EVENT_ID, ready: true, outstanding: [] }
            : { eventId: EVENT_ID, ready: false, outstanding: [outstandingVenue("Main Hall")] },
        );
      }
      if (approved) return Promise.resolve({ eventId: EVENT_ID, status: "Confirmed", message: "Event has been confirmed." });
      return Promise.reject(new ApiError("This event cannot be confirmed yet. Outstanding: Venue booking approval: Main Hall (Pending)", undefined, "CONFIRM_BLOCKED", 422));
    });
    renderPanel();
    const user = userEvent.setup();
    const list = await screen.findByRole("list", { name: "Outstanding arrangements" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);

    // Act: approve the venue (SPM-55 fixture), then confirm
    approved = true;
    await user.click(screen.getByRole("button", { name: "Confirm Event" }));

    // Assert
    expect(await screen.findByRole("status")).toHaveTextContent("Event has been confirmed.");
  });

  it("CONFIRM-EVENT-03-C (FE): the literal texts for EVT-206 and EVT-210 are shown", async () => {
    // Arrange: EVT-206 with the Breakout Room 1 booking Pending
    route({ arrangements: { ready: false, outstanding: [outstandingVenue("Breakout Room 1")] } });

    // Act
    const { unmount } = render(
      <ConfirmEventPanel eventId={EVENT_ID} status="planning" isAssignedCoordinator onConfirmed={() => undefined} />,
    );

    // Assert: exact text; "Main Hall" absent
    const list = await screen.findByRole("list", { name: "Outstanding arrangements" });
    expect(within(list).getByText("Venue booking approval: Breakout Room 1 (Pending)")).toBeInTheDocument();
    expect(list).not.toHaveTextContent("Main Hall");
    unmount();

    // Arrange: EVT-210 with the safety outcome Changes Requested
    apiMock.mockReset();
    route({
      arrangements: {
        ready: false,
        outstanding: [{ type: "safety", label: "Safety Officer approval", detail: "Changes requested", state: "Changes Requested" }],
      },
    });

    // Act
    renderPanel();

    // Assert
    expect(await screen.findByText("Safety Officer approval: Changes requested")).toBeInTheDocument();
  });
});

describe("SPM-135 AC4 and AC5: success is announced once, and a double click is safe", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  afterEach(cleanup);

  it("CONFIRM-EVENT-04-B (C, FE): a double click sends one request, disables the button while pending and shows one message", async () => {
    // Arrange: the confirm is in flight until released
    const gate = deferred<unknown>();
    const calls = route({
      arrangements: { ready: true, outstanding: [] },
      confirm: () => gate.promise,
    });
    const { onConfirmed } = renderPanel();
    const user = userEvent.setup();
    const button = await screen.findByRole("button", { name: "Confirm Event" });

    // Act: two clicks in quick succession
    await user.dblClick(button);

    // Assert: exactly one request; the button is disabled and busy while pending
    expect(calls.filter((c) => c.path.endsWith("/status-change"))).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Confirm Event" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirm Event" })).toHaveAttribute("aria-busy", "true");

    // Release the request and check the single success message
    gate.resolve({ eventId: EVENT_ID, status: "Confirmed", message: "Product Launch Mixer has been confirmed." });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Product Launch Mixer has been confirmed."));
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });
});

describe("SPM-135 AC6: a rejected or cancelled event offers no confirm action (D13)", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  afterEach(cleanup);

  it.each(["rejected", "cancelled", "confirmed"])("CONFIRM-EVENT-06 (FE): no Confirm Event button on a %s event, and no request", (status) => {
    // Arrange
    const calls = route({});

    // Act
    renderPanel({ status });

    // Assert
    expect(screen.queryByRole("button", { name: "Confirm Event" })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
