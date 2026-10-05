/*
 * Story: SPM-120 Withdraw Registration (attendee), page level.
 * ACs: AC5 (status persists across a reload), AC6 (message confirmation).
 * Story goal (08-A): the freed spot is reflected.
 * Test cases: WITHDRAW-EVENT-REG-06-A (frontend), 06-C (UI), 08-A (frontend), 09-B (frontend).
 * Note: test IDs are from Confluence; AC numbers are Jira.
 *
 * HTTP is mocked at the boundary; the store and router are real. Oracles are
 * literals from the AC text and the Confluence pages. Only Date is faked
 * (suite clock T0 = 2026-10-04 12:00 SGT). The event-list badge and dashboard
 * card named in 08-A do not exist in this app, so they are not asserted (D19).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "./EventDetailPage";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAppStore } from "@/store/useAppStore";
import { ApiError, api } from "@/utils/api";
import type { User } from "@/types";
import { ATT_01, T0, buildEvent, buildRegistration, withdrawalResponse } from "@/components/EventDetail/withdrawal.fixtures";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

const ATT_02: User = { id: "ATT-02", name: "Ben Lim", email: "ben@example.com", role: "attendee" };

function renderPage(eventId: string) {
  return render(
    <MemoryRouter initialEntries={[`/events/${eventId}`]}>
      <Routes>
        <Route path="/events/:id" element={<RequireAuth><EventDetailPage /></RequireAuth>} />
        <Route path="/login" element={<p>Login screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Confirms the withdrawal through the dialog. */
async function withdrawThroughDialog() {
  const u = userEvent.setup();
  await u.click(await screen.findByRole("button", { name: "Withdraw" }));
  await u.click(screen.getByRole("button", { name: "Confirm Withdrawal" }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: T0 });
  apiMock.mockReset();
  useAppStore.setState({ authLoading: false, isAuthenticated: true, currentUser: ATT_01, events: [], registrations: [] });
});
afterEach(() => vi.useRealTimers());

describe("SPM-120 AC5: the withdrawn status survives a reload", () => {
  // Oracle (SPEC 06-A + 06-C UI): a remounted page refetches (first GET returns Registered, second Withdrawn)
  // and shows the grey Withdrawn badge and "Withdrawn today at 12:00" (SGT, not the UTC hour 04).
  // The store is emptied between the two mounts, so the only source of truth is the refetch.
  // Mutants killed: stale client state; UI showing the UTC hour; withdrawn status not shown on reload.
  it("WITHDRAW-EVENT-REG-06-A / 06-C (frontend): remounting shows Withdrawn at 12:00", async () => {
    // Arrange: /me answers Registered first, Withdrawn second.
    const registered = buildRegistration();
    const withdrawn = { ...registered, status: "withdrawn" as const, withdrawnAt: T0.toISOString() };
    let meCalls = 0;
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/events/EVT-101") return Promise.resolve(buildEvent());
      if (path.endsWith("/comments")) return Promise.resolve([]);
      if (path.endsWith("/registrations/me")) return Promise.resolve({ registration: ++meCalls === 1 ? registered : withdrawn });
      if (path.endsWith("/withdraw") && init?.method === "POST") return Promise.resolve(withdrawalResponse(registered));
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const first = renderPage("EVT-101");
    await withdrawThroughDialog();
    expect(await screen.findByText("Withdrawn")).toBeInTheDocument();
    first.unmount();
    useAppStore.setState({ registrations: [], events: [] });

    // Act: a fresh page load.
    renderPage("EVT-101");

    // Assert
    expect(await screen.findByText("Withdrawn")).toBeInTheDocument();
    expect(screen.getByText("Withdrawn today at 12:00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw" })).not.toBeInTheDocument();
    expect(meCalls).toBe(2);
  });
});

describe("SPM-120 (story goal): the freed spot shows on the event page", () => {
  // Oracle (SPEC 08-A frontend): EVT-105 is full (0 spots); after ATT-02 withdraws, the refetched event shows
  // 1 spot and the Register button, in SPM-61's existing "Available 1 spot" format. The mock only returns the
  // freed count after the withdraw POST, so a missing refetch leaves the page on "fully booked".
  // Mutants killed: spot not released in the UI; stale cache; no refetch after withdrawal.
  it("WITHDRAW-EVENT-REG-08-A (frontend): the refetched event shows 1 available spot", async () => {
    // Arrange
    useAppStore.setState({ currentUser: ATT_02 });
    const event = buildEvent({ id: "EVT-105", name: "Data Science Meetup", expectedAttendance: 2 });
    const reg9010 = buildRegistration({ id: "REG-9010", eventId: "EVT-105", attendeeId: ATT_02.id, attendeeName: "Ben Lim", fullName: "Ben Lim" });
    let released = false;
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/events/EVT-105") return Promise.resolve({ ...event, availableRegistrationSpots: released ? 1 : 0 });
      if (path.endsWith("/comments")) return Promise.resolve([]);
      if (path.endsWith("/registrations/me")) return Promise.resolve({ registration: reg9010 });
      if (path.endsWith("/withdraw") && init?.method === "POST") {
        released = true;
        return Promise.resolve(withdrawalResponse(reg9010));
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    renderPage("EVT-105");

    // Act
    await withdrawThroughDialog();

    // Assert
    expect(await screen.findByRole("button", { name: "Register" })).toBeEnabled();
    const available = screen.getByText("Available").parentElement!;
    expect(within(available).getByText("1 spot")).toBeInTheDocument();
    expect(screen.queryByText("This event is fully booked.")).not.toBeInTheDocument();
  });
});

describe("SPM-120 cross-cutting: an unauthenticated withdraw attempt", () => {
  // Oracle (Added 09-B frontend, 401 sign-out narrowed to this call): a 401 from the withdraw call clears the
  // session so the route guard redirects to /login, and no success banner appears.
  // Mutants killed: M13 withdraw bypassing the 401 handling; success shown after a 401.
  it("WITHDRAW-EVENT-REG-09-B (frontend): a 401 signs the user out and redirects to login", async () => {
    // Arrange
    const registered = buildRegistration();
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/events/EVT-101") return Promise.resolve(buildEvent());
      if (path.endsWith("/comments")) return Promise.resolve([]);
      if (path.endsWith("/registrations/me")) return Promise.resolve({ registration: registered });
      if (path.endsWith("/withdraw") && init?.method === "POST")
        return Promise.reject(new ApiError("Missing session", undefined, undefined, 401));
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    renderPage("EVT-101");

    // Act
    await withdrawThroughDialog();

    // Assert
    expect(await screen.findByText("Login screen")).toBeInTheDocument();
    expect(useAppStore.getState().isAuthenticated).toBe(false);
    expect(screen.queryByText(/has been processed/)).not.toBeInTheDocument();
  });

  // Oracle (DERIVED, narrow scope): only a 401 signs the user out; a 403 or other error does not.
  // Mutants killed: session cleared on any failure.
  it("WITHDRAW-EVENT-REG-09-B (frontend): a 500 keeps the user signed in", async () => {
    const registered = buildRegistration();
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/events/EVT-101") return Promise.resolve(buildEvent());
      if (path.endsWith("/comments")) return Promise.resolve([]);
      if (path.endsWith("/registrations/me")) return Promise.resolve({ registration: registered });
      if (path.endsWith("/withdraw") && init?.method === "POST")
        return Promise.reject(new ApiError("The service is temporarily unavailable. Please try again.", undefined, undefined, 500));
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    renderPage("EVT-101");

    await withdrawThroughDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent("The service is temporarily unavailable. Please try again.");
    expect(useAppStore.getState().isAuthenticated).toBe(true);
    expect(screen.queryByText("Login screen")).not.toBeInTheDocument();
  });
});
