import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

  it("CONFIRM-EVENT-02-A (FE): EVT-202 with the venue Pending shows the pending venue and safety bullets, with Confirm greyed out", async () => {
    // Arrange: EVT-202 (venue Pending)
    const calls = route({ arrangements: { ready: false, outstanding: [outstandingVenue("Main Hall")] } });
    const { onConfirmed } = renderPanel();
    const user = userEvent.setup();

    // Act: a click on the greyed-out button does nothing
    const button = await screen.findByRole("button", { name: "Confirm Event" });
    await user.click(button);

    // Assert: one pending bullet, disabled, no request, no confirmation text, no status change
    expect(within(screen.getByRole("list", { name: "Pending" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Pending venue booking",
      "Pending safety check",
    ]);
    expect(button).toBeDisabled();
    expect(calls.some((c) => c.path.endsWith("/status-change"))).toBe(false);
    expect(screen.queryByText(/has been confirmed/)).not.toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
  });
  it("CONFIRM-EVENT-02-C (FE): EVT-206 shows only the pending venue bullet; no venue name or other detail is shown", async () => {
    // Arrange: Breakout Room 1 Pending (Main Hall Approved)
    route({ arrangements: { ready: false, outstanding: [outstandingVenue("Breakout Room 1")] } });

    // Act
    renderPanel();

    // Assert
    const list = await screen.findByRole("list", { name: "Pending" });
    expect(list).toHaveTextContent("Pending venue booking");
    expect(screen.queryByText(/Breakout Room 1|Main Hall/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Event" })).toBeDisabled();
  });
  it("CONFIRM-EVENT-02-D (FE): the page loaded with nothing pending; the server then refuses and the pending bullet appears without a refresh", async () => {
    // Arrange: nothing pending at page load; Main Hall is flagged unavailable before the click
    const calls = route({ arrangements: { ready: true, outstanding: [] } });
    apiMock.mockImplementation((path: string) => {
      calls.push({ path });
      if (path.endsWith("/arrangements-status")) {
        const refreshed = calls.filter((c) => c.path.endsWith("/arrangements-status")).length > 1;
        return Promise.resolve({
          eventId: EVENT_ID,
          ready: !refreshed,
          outstanding: refreshed ? [{ type: "venue", label: "Venue booking approval", detail: "Main Hall (Venue unavailable)", state: "Venue unavailable" }] : [],
        });
      }
      return Promise.reject(new ApiError("This event cannot be confirmed yet. Outstanding: Venue booking approval: Main Hall (Venue unavailable)", undefined, "CONFIRM_BLOCKED", 422));
    });
    renderPanel();
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "Confirm Event" });
    expect(screen.queryByRole("list", { name: "Pending" })).not.toBeInTheDocument();

    // Act
    await user.click(screen.getByRole("button", { name: "Confirm Event" }));

    // Assert: the pending venue bullet now shows
    expect(await screen.findByRole("list", { name: "Pending" })).toHaveTextContent("Pending venue booking");
  });
  it("CONFIRM-EVENT-03-A (FE): EVT-205 shows one pending bullet per category, in venue, equipment, safety order", async () => {
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
    const items = within(await screen.findByRole("list", { name: "Pending" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Pending venue booking",
      "Pending equipment request",
      "Pending safety check",
    ]);
  });
  it("SAFETY-RESET-CONFIRM (FE): a safety check reset moves the safety check back to pending in the Confirm section", async () => {
    // Arrange: safety approved, nothing outstanding, Confirm enabled
    route({ arrangements: { ready: true, outstanding: [] } });
    const { rerender } = render(
      <ConfirmEventPanel eventId={EVENT_ID} status="planning" isAssignedCoordinator onConfirmed={() => undefined} refreshKey="approved" />,
    );
    expect(await screen.findByRole("button", { name: "Confirm Event" })).toBeEnabled();

    // Act: the safety check is reset (no record) and the page signals the change
    route({
      arrangements: {
        ready: false,
        outstanding: [{ type: "safety", label: "Safety Officer approval", detail: "Awaiting check", state: "No record" }],
      },
    });
    rerender(
      <ConfirmEventPanel eventId={EVENT_ID} status="planning" isAssignedCoordinator onConfirmed={() => undefined} refreshKey="not_requested" />,
    );

    // Assert: the safety check is listed as pending and Confirm is greyed out
    expect(await screen.findByText("Pending safety check")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Event" })).toBeDisabled();
  });

  it("CONFIRM-EVENT-03-D (FE): equipment pending also lists the safety check, and Confirm is greyed out", async () => {
    // Arrange: EVT-203 (equipment Requested, venue approved, safety approved but reset by the change)
    route({
      arrangements: {
        ready: false,
        outstanding: [{ type: "equipment", label: "Equipment reservation", detail: "Projector x1 (Requested)", state: "Requested" }],
      },
    });

    // Act
    renderPanel();

    // Assert
    const items = within(await screen.findByRole("list", { name: "Pending" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["Pending equipment request", "Pending safety check"]);
    expect(screen.getByRole("button", { name: "Confirm Event" })).toBeDisabled();
  });

  it("CONFIRM-EVENT-03-B (FE): only the pending venue shows; after it is approved a fresh load enables Confirm and it succeeds", async () => {
    // Arrange: EVT-202 with the venue Pending; one pending bullet and Confirm greyed out
    let approved = false;
    route({ arrangements: { ready: false, outstanding: [outstandingVenue("Main Hall")] } });
    apiMock.mockImplementation((path: string) => {
      if (path.endsWith("/arrangements-status")) {
        return Promise.resolve(
          approved
            ? { eventId: EVENT_ID, ready: true, outstanding: [] }
            : { eventId: EVENT_ID, ready: false, outstanding: [outstandingVenue("Main Hall")] },
        );
      }
      return Promise.resolve({ eventId: EVENT_ID, status: "Confirmed", message: "Event has been confirmed." });
    });
    renderPanel();
    const list = await screen.findByRole("list", { name: "Pending" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Confirm Event" })).toBeDisabled();
    cleanup();
    const user = userEvent.setup();

    // Act: the venue is approved (SPM-55 fixture) and the page reloads the readiness answer
    approved = true;
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Confirm Event" }));

    // Assert
    expect(await screen.findByRole("status")).toHaveTextContent("Event has been confirmed.");
  });
  it("CONFIRM-EVENT-03-C (FE): the pending bullets name the category only, for EVT-206 and EVT-210", async () => {
    // Arrange: EVT-206 with the Breakout Room 1 booking Pending
    route({ arrangements: { ready: false, outstanding: [outstandingVenue("Breakout Room 1")] } });

    // Act
    const { unmount } = render(
      <ConfirmEventPanel eventId={EVENT_ID} status="planning" isAssignedCoordinator onConfirmed={() => undefined} />,
    );

    // Assert: the venue bullet, and no venue name
    const list = await screen.findByRole("list", { name: "Pending" });
    expect(within(list).getByText("Pending venue booking")).toBeInTheDocument();
    expect(list).not.toHaveTextContent("Breakout Room 1");
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
    expect(await screen.findByText("Pending safety check")).toBeInTheDocument();
  });
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

/** The onClick the DOM button currently holds (the handler a click would run, as of the last render). */
function currentOnClick(button: HTMLElement): (() => void) | undefined {
  const key = Object.keys(button).find((name) => name.startsWith("__reactProps$"));
  return key ? (button as unknown as Record<string, { onClick?: () => void }>)[key].onClick : undefined;
}

const confirmCalls = (calls: { path: string }[]) => calls.filter((c) => c.path.endsWith("/status-change")).length;

describe("SPM-135 TR-13: the confirm panel's remaining branches", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  afterEach(cleanup);

  it("SPM-135 AC4 (FE, re-entrancy): a confirm invoked again while one is in flight sends no second request", async () => {
    // Arrange: the first confirm is held open until the test releases it
    const gate = deferred<unknown>();
    const calls = route({ arrangements: { ready: true, outstanding: [] }, confirm: () => gate.promise });
    const { onConfirmed } = renderPanel();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Confirm Event" }));
    expect(confirmCalls(calls)).toBe(1);

    // Act: the handler the button holds while pending runs again (a re-entrant call; the disabled button hides it from a click)
    await act(async () => {
      currentOnClick(screen.getByRole("button", { name: "Confirm Event" }))?.();
    });

    // Assert: still one request; releasing the first request announces success once
    expect(confirmCalls(calls)).toBe(1);
    gate.resolve({ eventId: EVENT_ID, status: "Confirmed", message: "Product Launch Mixer has been confirmed." });
    expect(await screen.findByRole("status")).toHaveTextContent("Product Launch Mixer has been confirmed.");
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("SPM-135 AC4 (FE, other error): a 409 EVENT_ALREADY_CONFIRMED shows its message in an alert, keeps the button, and changes nothing else", async () => {
    // Arrange: the server answers 409 for an event that is already Confirmed (backend status.messages.ts)
    const calls = route({
      arrangements: { ready: true, outstanding: [] },
      confirm: () => Promise.reject(new ApiError("This event is already confirmed.", undefined, "EVENT_ALREADY_CONFIRMED", 409)),
    });
    const { onConfirmed } = renderPanel();
    const user = userEvent.setup();

    // Act
    await user.click(await screen.findByRole("button", { name: "Confirm Event" }));

    // Assert: the exact message in the alert; no success, no outstanding list, no status change; the button is usable again
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("This event is already confirmed.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Outstanding arrangements" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Event" })).toBeEnabled();
    expect(onConfirmed).not.toHaveBeenCalled();
    // Only the error is not a blocked answer, so the readiness list is not requested again (only the load-time request)
    expect(calls.filter((c) => c.path.endsWith("/arrangements-status"))).toHaveLength(1);
  });

  it("SPM-135 AC4 (FE, unexpected failure): a non-Error failure shows the fallback text in an alert and changes nothing", async () => {
    // Arrange: the confirm rejects with a value that is not an Error
    route({
      arrangements: { ready: true, outstanding: [] },
      confirm: () => Promise.reject("connection reset"),
    });
    const { onConfirmed } = renderPanel();
    const user = userEvent.setup();

    // Act
    await user.click(await screen.findByRole("button", { name: "Confirm Event" }));

    // Assert
    expect((await screen.findByRole("alert")).textContent).toBe("Could not confirm the event.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("SPM-135 AC2 (FE, load): a readiness request that fails on load keeps Confirm greyed out and shows no list", async () => {
    // Arrange: the readiness request is refused when the panel loads
    apiMock.mockImplementation((path: string) => {
      if (path.endsWith("/arrangements-status")) return Promise.reject(new ApiError("Service unavailable", undefined, undefined, 503));
      return Promise.reject(new Error(`unexpected ${path}`));
    });

    // Act
    renderPanel();

    // Assert: readiness is unknown, so Confirm is not offered; no list and no alert
    expect(await screen.findByRole("button", { name: "Confirm Event" })).toBeDisabled();
    expect(screen.queryByRole("list", { name: "Outstanding arrangements" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("SPM-135 AC3 (FE, stale response): a readiness answer for the previous event is ignored once the event changes", async () => {
    // Arrange: the readiness request for EVT-201 is held open; EVT-202 answers at once with a venue item
    const OTHER_EVENT_ID = "00000000-0000-4000-8000-000000000202";
    const previous = deferred<unknown>();
    apiMock.mockImplementation((path: string) => {
      if (path === `/events/${EVENT_ID}/arrangements-status`) return previous.promise;
      if (path === `/events/${OTHER_EVENT_ID}/arrangements-status`) {
        return Promise.resolve({ eventId: OTHER_EVENT_ID, ready: false, outstanding: [outstandingVenue("Breakout Room 1")] });
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const { rerender } = render(
      <ConfirmEventPanel eventId={EVENT_ID} status="planning" isAssignedCoordinator onConfirmed={() => undefined} />,
    );
    rerender(<ConfirmEventPanel eventId={OTHER_EVENT_ID} status="planning" isAssignedCoordinator onConfirmed={() => undefined} />);
    expect(await screen.findByText("Pending venue booking")).toBeInTheDocument();

    // Act: the late answer for EVT-201 (an equipment item) arrives
    await act(async () => {
      previous.resolve({
        eventId: EVENT_ID,
        ready: false,
        outstanding: [{ type: "equipment", label: "Equipment reservation", detail: "Projector x1 (Requested)", state: "Requested" }],
      });
    });

    // Assert: EVT-202's bullets stay; EVT-201's equipment bullet is never shown
    expect(screen.queryByText("Pending equipment request")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Pending" })).toHaveTextContent("Pending venue booking");
  });
  it("SPM-135 AC3 (FE, unmount): a readiness answer that arrives after unmount is dropped without an error", async () => {
    // Arrange: the readiness request is still open when the panel unmounts
    const late = deferred<unknown>();
    apiMock.mockImplementation((path: string) => {
      if (path.endsWith("/arrangements-status")) return late.promise;
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const { container, unmount } = render(
      <ConfirmEventPanel eventId={EVENT_ID} status="planning" isAssignedCoordinator onConfirmed={() => undefined} />,
    );
    unmount();

    // Act: the answer arrives after unmount
    await act(async () => {
      late.resolve({ eventId: EVENT_ID, ready: false, outstanding: [outstandingVenue("Main Hall")] });
    });

    // Assert: nothing is rendered into the container and nothing throws
    expect(container).toBeEmptyDOMElement();
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
