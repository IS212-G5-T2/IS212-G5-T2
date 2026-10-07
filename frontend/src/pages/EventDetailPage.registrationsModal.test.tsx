/*
 * SPM-63 registrations modal, page level: the People card offers "View registrations" only to the assigned coordinator
 * and the owning organiser, and the button opens the modal for this event. The API is mocked at the boundary.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "./EventDetailPage";
import { ATT_01, COO_01, COO_02, ORG_01, buildReport } from "@/components/registrations/report.fixtures";
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
  // The assigned coordinator opens the modal from the People card and sees this event's registrations.
  it("lets the assigned coordinator open the registrations modal from the People card", async () => {
    const user = userEvent.setup();
    renderAs(COO_01);

    await user.click(await screen.findByRole("button", { name: "View registrations" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Registrations (3)" })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/events/EVT-101/registrations/report");

    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // The owning organiser is offered the same button.
  it("offers the button to the owning organiser", async () => {
    renderAs(ORG_01);

    expect(await screen.findByRole("button", { name: "View registrations" })).toBeInTheDocument();
  });

  // A coordinator who is not assigned to this event, and an attendee, are not offered the button.
  it("does not offer the button to an unassigned coordinator or an attendee", async () => {
    renderAs(COO_02);
    expect(await screen.findByRole("heading", { name: "People" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View registrations" })).not.toBeInTheDocument();
  });

  it("does not offer the button to an attendee", async () => {
    renderAs(ATT_01);
    expect(await screen.findByRole("heading", { name: "People" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View registrations" })).not.toBeInTheDocument();
  });
});
