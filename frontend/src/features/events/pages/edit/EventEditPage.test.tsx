import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { EventEditPage } from "@/features/events/pages/edit/EventEditPage";
import { useAppStore } from "@/store/useAppStore";
import type { EventRecord } from "@/types";

function editableEvent(): EventRecord {
  return {
    id: "event-1",
    name: "Welcome Evening",
    purpose: "Community building",
    description: "A welcome event.",
    organiserId: "organiser-1",
    organiserName: "Test Organiser",
    status: "submitted",
    startDateTime: "2030-01-10T18:00:00.000Z",
    endDateTime: "2030-01-10T21:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Classroom", facilities: [], accessibility: [] },
    equipmentNeeds: "Two microphones",
    registrationEnabled: false,
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
  };
}

// Shows where the router ended up, so the tests can assert navigation.
function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

function renderAt(entries: string[], index: number) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Routes>
        <Route
          path="/events/:id/edit"
          element={
            <>
              <EventEditPage />
              <LocationProbe />
            </>
          }
        />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

beforeEach(() => {
  useAppStore.setState({ events: [editableEvent()] });
});

describe("EventEditPage", () => {
  /** Saving writes the edited details into the event and returns the organiser to the event page. */
  it("saves the edits to the event and returns to the event page", () => {
    renderAt(["/events/event-1/edit"], 0);

    fireEvent.change(screen.getByLabelText(/event name/i), { target: { value: "Spring Gala" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(useAppStore.getState().events.find((event) => event.id === "event-1")).toMatchObject({
      name: "Spring Gala",
    });
    expect(screen.getByTestId("location").textContent).toBe("/events/event-1");
  });

  /** Cancel leaves the event unchanged and returns to the page the user came from. */
  it("returns to the previous page without saving when Cancel is pressed", () => {
    renderAt(["/dashboard", "/events/event-1/edit"], 1);

    fireEvent.change(screen.getByLabelText(/event name/i), { target: { value: "Discarded Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByTestId("location").textContent).toBe("/dashboard");
    expect(useAppStore.getState().events.find((event) => event.id === "event-1")).toMatchObject({
      name: "Welcome Evening",
    });
  });
});
