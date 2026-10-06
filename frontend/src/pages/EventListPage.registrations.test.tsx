/*
 * Story: SPM-63 View Registration Information (Organiser and Coordinator), entry points on the event list.
 * ACs: AC1 (a manager reaches the report from My Events), AC5 (nobody else is offered the link).
 * Test cases: VIEW-REG-INFO-01-A (coordinator link), 01-C (organiser link), 05-A, 05-B (no link for unmanaged
 * events), 05-D (attendees get no link).
 *
 * EventListPage is the "My Events" page for organisers and the event list for coordinators (D14: no separate
 * dashboards exist). HTTP is mocked at the boundary; the store and router are real. The link is a convenience;
 * the server decides access (VIEW-REG-INFO-05-A to 05-D, backend).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { EventListPage } from "./EventListPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord, User } from "@/types";
import { ATT_01, COO_01, COO_02, ORG_01 } from "@/components/registrations/report.fixtures";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

// Suite clock T0 = 2026-09-29T12:00:00+08:00. Only Date is faked, so user-event and promises run normally; the attendee
// "Upcoming" filter reads the faked clock, and every instant below is a fixed literal (never derived from the real clock).
const T0 = new Date("2026-09-29T12:00:00+08:00");

/** A confirmed event on 9 Oct 2026 (ten days after T0), so attendee "Upcoming" filters keep it. */
function buildEvent(overrides: Partial<EventRecord>): EventRecord {
  return {
    id: "EVT-101",
    name: "Tech Talk: Cloud 101",
    purpose: "Learn",
    description: "d",
    organiserId: "ORG-01",
    organiserName: "Farid Rahman",
    coordinatorId: "COO-01",
    status: "confirmed",
    startDateTime: "2026-10-09T10:00:00.000Z",
    endDateTime: "2026-10-09T13:00:00.000Z",
    expectedAttendance: 50,
    venueRequirements: { minCapacity: 50, layout: "", facilities: [], accessibility: [] },
    equipmentNeeds: "",
    registrationEnabled: true,
    changeRequests: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function ReportStub() {
  return <p>Report page for {useParams().id}</p>;
}

function renderList(user: User, events: EventRecord[]) {
  apiMock.mockResolvedValue(events as never);
  useAppStore.setState({ authLoading: false, isAuthenticated: true, currentUser: user, events: [] });
  return render(
    <MemoryRouter initialEntries={["/events"]}>
      <Routes>
        <Route path="/events" element={<EventListPage />} />
        <Route path="/events/:id/registrations/report" element={<ReportStub />} />
        <Route path="/events/:id" element={<p>Event detail</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: T0 });
  apiMock.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SPM-63 AC1: a manager reaches the report from the event list", () => {
  // Oracle (SPEC 01-A): COO-01 sees "View Registrations" on EVT-101 and clicking goes to
  // /events/EVT-101/registrations/report. (The coordinator list defaults to Submitted requests, so Confirmed is selected.)
  // Kills: link missing for the assigned coordinator; link built with the wrong event id.
  it("VIEW-REG-INFO-01-A: the assigned coordinator gets a working View Registrations link", async () => {
    // Arrange
    const user = userEvent.setup();
    renderList(COO_01, [buildEvent({})]);
    await screen.findByText("Pending Requests");
    await user.selectOptions(screen.getByLabelText("Filter by status"), "confirmed");

    // Act
    const link = await screen.findByRole("link", { name: "View Registrations" });
    expect(link).toHaveAttribute("href", "/events/EVT-101/registrations/report");
    await user.click(link);

    // Assert
    expect(await screen.findByText("Report page for EVT-101")).toBeInTheDocument();
  });

  // Oracle (SPEC 01-C): ORG-01 sees the same link on the event they own, under "My Events".
  // Kills: the link built for coordinators only.
  it("VIEW-REG-INFO-01-C: the owning organiser gets a working View Registrations link", async () => {
    // Arrange
    const user = userEvent.setup();
    renderList(ORG_01, [buildEvent({})]);
    expect(await screen.findByRole("heading", { name: "My Events" })).toBeInTheDocument();

    // Act
    await user.click(await screen.findByRole("link", { name: "View Registrations" }));

    // Assert
    expect(await screen.findByText("Report page for EVT-101")).toBeInTheDocument();
  });

  // Oracle (derived from 01-B: "dashboard must list all assigned events"): each managed event has its own link, to its own id.
  // Kills: one link for the whole list; every link pointing at the first event.
  it("VIEW-REG-INFO-01-B: every managed event has a link to its own report", async () => {
    // Arrange
    renderList(ORG_01, [
      buildEvent({ id: "EVT-101" }),
      buildEvent({ id: "EVT-105", name: "Data Science Meetup" }),
    ]);

    // Act
    const links = await screen.findAllByRole("link", { name: "View Registrations" });

    // Assert
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/events/EVT-101/registrations/report",
      "/events/EVT-105/registrations/report",
    ]);
  });
});

describe("SPM-63 AC5: nobody else is offered the link", () => {
  // Oracle (SPEC 05-A FE): COO-02's list does not offer "View Registrations" for EVT-101 (managed by COO-01), even if
  // that event were somehow present in the list.
  // Kills: any coordinator getting the link.
  it("VIEW-REG-INFO-05-A: an unassigned coordinator gets no link", async () => {
    // Arrange
    const user = userEvent.setup();
    renderList(COO_02, [buildEvent({})]);
    await screen.findByText("Pending Requests");
    await user.selectOptions(screen.getByLabelText("Filter by status"), "confirmed");

    // Act
    const card = await screen.findByText("Tech Talk: Cloud 101");

    // Assert
    expect(card).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View Registrations" })).not.toBeInTheDocument();
  });

  // Oracle (SPEC 05-B FE): ORG-01 gets no link on EVT-102 (owned by ORG-02) but does on EVT-101.
  // Kills: any organiser getting the link; ownership compared to the wrong column.
  it("VIEW-REG-INFO-05-B: a non-owning organiser gets no link for that event", async () => {
    // Arrange
    renderList(ORG_01, [
      buildEvent({ id: "EVT-101" }),
      buildEvent({ id: "EVT-102", name: "Annual Networking Night", organiserId: "ORG-02" }),
    ]);

    // Act
    const links = await screen.findAllByRole("link", { name: "View Registrations" });

    // Assert
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/events/EVT-101/registrations/report"]);
    const networking = screen.getByText("Annual Networking Night").closest("a")!;
    expect(within(networking.parentElement!).queryByRole("link", { name: "View Registrations" })).not.toBeInTheDocument();
  });

  // Oracle (SPEC 05-D): an attendee browsing events is never offered the link, even for an event they registered for.
  // Kills: the link shown to attendees.
  it("VIEW-REG-INFO-05-D: an attendee gets no link", async () => {
    // Arrange
    renderList(ATT_01, [buildEvent({ myRegistrationStatus: "registered" })]);

    // Act
    await screen.findByText("Tech Talk: Cloud 101");

    // Assert
    expect(screen.queryByRole("link", { name: "View Registrations" })).not.toBeInTheDocument();
  });
});

// ASSUMPTION index
// A15: the link is offered for every managed event regardless of its status       -> 01-A, 01-C
