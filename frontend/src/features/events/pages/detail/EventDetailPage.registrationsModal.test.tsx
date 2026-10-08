/*
 * SPM-63 registrations modal, page level: the People card offers "View registrations" only to the assigned coordinator
 * and the owning organiser, and the button opens the modal for this event. The API is mocked at the boundary.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "./EventDetailPage";
import { ATT_01, COO_01, COO_02, ORG_01, buildReport } from "@/features/registrations/components/report/report.fixtures";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord, User } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

const event: EventRecord = {
  id: "EVT-101",
  name: "Tech Talk: Cloud 101",
  purpose: "Share cloud basics",
  description: "An introductory talk",
  organiserId: ORG_01.id,
  organiserName: ORG_01.name,
  coordinatorId: COO_01.id,
  coordinatorName: COO_01.name,
  status: "confirmed",
  startDateTime: "2026-10-09T10:00:00.000Z",
  endDateTime: "2026-10-09T13:00:00.000Z",
  expectedAttendance: 50,
  venueRequirements: { minCapacity: 50, accessibility: [], facilities: [], layout: "" },
  equipmentNeeds: "",
  registrationEnabled: true,
  registrationOpensAt: "2026-09-20T00:00:00.000Z",
  registrationClosesAt: "2026-10-08T15:59:00.000Z",
  changeRequests: [],
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

function renderAs(user: User) {
  useAppStore.setState({ authLoading: false, isAuthenticated: true, currentUser: user, events: [event], registrations: [] });
  render(
    <MemoryRouter initialEntries={["/events/EVT-101"]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path: string) => {
    if (path.includes("/registrations/report")) return Promise.resolve(buildReport()) as never;
    if (path.includes("/comments")) return Promise.resolve([]) as never;
    return Promise.resolve(event) as never;
  });
});

describe("SPM-63 registrations modal on the event detail page", () => {
  // VIEW-REG-DETAIL-01-A
  // Oracle (SPEC: assigned coordinator and owning organiser only see button)
  // Kills: any coordinator or organiser shown; wrong column compared
  it.each([
    ["assigned coordinator", COO_01, true],
    ["owning organiser", ORG_01, true],
    ["unassigned coordinator", COO_02, false],
    ["attendee", ATT_01, false],
  ])("VIEW-REG-DETAIL-01-A: %s sees button: %s", async (_who, user, shouldSee) => {
    renderAs(user);
    await screen.findByRole("heading", { name: "People" });

    const button = screen.queryByRole("button", { name: "View registrations" });
    if (shouldSee) {
      expect(button).toBeInTheDocument();
    } else {
      expect(button).not.toBeInTheDocument();
    }
  });

  // VIEW-REG-DETAIL-01-A-NON-OWNING
  // Oracle (SPEC: non-owning organiser does not see button)
  // Kills: organiser access check dropped; column matched wrong way
  it("VIEW-REG-DETAIL-01-A-NON-OWNING: a non-owning organiser does not see the button", async () => {
    // Adjust the event to be owned by a different organiser
    const nonOwnedEvent = { ...event, organiserId: "ORG-OTHER" };
    apiMock.mockImplementation((path: string) => {
      if (path.includes("/registrations/report")) return Promise.resolve(buildReport()) as never;
      if (path.includes("/comments")) return Promise.resolve([]) as never;
      if (path.includes("/events")) return Promise.resolve(nonOwnedEvent) as never;
      return Promise.resolve(event) as never;
    });

    useAppStore.setState({
      authLoading: false,
      isAuthenticated: true,
      currentUser: ORG_01, // ORG_01 is not the owner of this event
      events: [],
      registrations: [],
    });

    render(
      <MemoryRouter initialEntries={["/events/EVT-101"]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "People" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View registrations" })).not.toBeInTheDocument();
  });

  // VIEW-REG-DETAIL-02-A
  // Oracle (SPEC: modal opens and closes from the button and x button)
  // Kills: button does nothing; wrong event's data shown
  it("VIEW-REG-DETAIL-02-A: opens modal on button click and closes on x button", async () => {
    const user = userEvent.setup();
    renderAs(COO_01);

    await user.click(await screen.findByRole("button", { name: "View registrations" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Registrations (3)" })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/events/EVT-101/registrations/report");

    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
