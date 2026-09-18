import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "./EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord, User } from "@/types";

const attendee: User = {
  id: "attendee-1",
  name: "Attendee",
  email: "attendee@example.com",
  role: "attendee",
};

const event: EventRecord = {
  id: "event-1",
  name: "Open event",
  purpose: "Test registrations",
  description: "Test event",
  organiserId: "organiser-1",
  organiserName: "Organiser",
  status: "confirmed",
  startDateTime: "2026-10-01T09:00:00.000Z",
  endDateTime: "2026-10-01T10:00:00.000Z",
  expectedAttendance: 10,
  venueRequirements: { minCapacity: 10, accessibility: [], facilities: [], layout: "" },
  equipmentNeeds: "",
  registrationEnabled: true,
  changeRequests: [],
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

/** Renders an event detail route with the current Zustand test state. */
function renderEventDetail() {
  return render(
    <MemoryRouter initialEntries={[`/events/${event.id}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiMock.mockImplementation((path: string) =>
    path.includes("/comments") ? Promise.resolve([]) : Promise.resolve(event),
  );
  useAppStore.setState({
    authLoading: false,
    isAuthenticated: true,
    currentUser: attendee,
    events: [event],
    registrations: [],
  });
});

describe("EventDetailPage attendee registration", () => {
  it("registers and withdraws only the signed-in attendee's registration", async () => {
    const user = userEvent.setup();
    renderEventDetail();

    await user.click(await screen.findByRole("button", { name: "Register" }));
    expect(useAppStore.getState().registrations).toMatchObject([
      { eventId: event.id, attendeeId: attendee.id, status: "registered" },
    ]);
    expect(screen.getByRole("button", { name: "Withdraw Registration" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Withdraw Registration" }));
    expect(useAppStore.getState().registrations[0]).toMatchObject({
      attendeeId: attendee.id,
      status: "withdrawn",
    });
  });

  it("does not offer registration controls to a different role", async () => {
    useAppStore.setState({ currentUser: { ...attendee, id: "organiser-1", role: "organiser" } });
    renderEventDetail();

    await screen.findByRole("heading", { name: event.name });
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
    expect(screen.queryByText("Registration")).not.toBeInTheDocument();
  });

  it("does not let an attendee withdraw another attendee's registration", () => {
    useAppStore.setState({
      registrations: [
        {
          id: "registration-other-user",
          eventId: event.id,
          attendeeId: "attendee-2",
          attendeeName: "Another attendee",
          status: "registered",
          registeredAt: "2026-09-15T00:00:00.000Z",
        },
      ],
    });

    useAppStore.getState().withdrawRegistration(event.id);

    expect(useAppStore.getState().registrations[0].status).toBe("registered");
  });
});
