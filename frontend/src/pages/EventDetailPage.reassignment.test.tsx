// SPM-46 View a Reassigned Event: the event page for a coordinator who received
// an event by reassignment, and for one who lost it.
// ACs: AC2 (from whom and when), AC3 (full context), AC4 (clear message after it moves away).
// Test cases: REASN-VIEW-02-G, 02-H, 03-A, 04-C.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/pages/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api, ApiError } from "@/utils/api";
import { formatDateTime, formatDateTimeRange } from "@/utils/format";
import type { EventRecord } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

const reassignedAt = "2026-10-07T06:05:00.000Z";

// An approved event that Coordinator 2 (coordinator-2) received from Coordinator 1.
function reassignedEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "event-1",
    name: "Community Welcome Evening",
    purpose: "Community building",
    description: "An evening of introductions.",
    organiserId: "organiser-1",
    organiserName: "Priya Nair",
    coordinatorId: "coordinator-2",
    coordinatorName: "Coordinator 2",
    status: "approved",
    startDateTime: "2026-12-12T18:00:00.000Z",
    endDateTime: "2026-12-12T21:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: [], accessibility: [] },
    equipmentNeeds: "",
    registrationEnabled: false,
    changeRequests: [],
    reassignedFrom: { coordinatorName: "Coordinator 1", reassignedAt },
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-10-07T06:05:00.000Z",
    ...overrides,
  };
}

const coordinator2 = { id: "coordinator-2", name: "Coordinator 2", email: "c2@example.test", role: "coordinator" as const };
const organiser = { id: "organiser-1", name: "Priya Nair", email: "priya@example.test", role: "organiser" as const };

// Serve the event, and an existing clarification for its history.
function serve(event: EventRecord) {
  apiMock.mockImplementation((path: string) => {
    if (path === "/events/event-1/comments")
      return Promise.resolve([
        {
          id: "comment-1",
          eventId: "event-1",
          parentId: null,
          type: "clarification",
          authorId: "coordinator-1",
          authorName: "Coordinator 1",
          authorRole: "coordinator",
          message: "Is the stage still needed?",
          awaitingReply: true,
          resolved: false,
          createdAt: "2026-10-01T09:00:00.000Z",
        },
      ]) as ReturnType<typeof api>;
    return Promise.resolve(event) as ReturnType<typeof api>;
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events/event-1"]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

beforeEach(() => {
  // Fresh API double and a signed-in, loaded session per test.
  vi.clearAllMocks();
  useAppStore.setState({ authLoading: false, isAuthenticated: true, currentUser: coordinator2 });
});

describe("SPM-46 AC2: who the event came from and when", () => {
  // The new coordinator sees a banner naming the previous coordinator and the time.
  // Kills: a banner that drops the previous coordinator, the time, or uses the wrong wording.
  it("REASN-VIEW-02-G tells the new coordinator who the event was reassigned from and when", async () => {
    // Arrange: Coordinator 2 opens an event they received from Coordinator 1.
    serve(reassignedEvent());

    // Act: open the page.
    renderPage();

    // Assert: the banner names Coordinator 1 and the formatted reassignment time.
    expect(
      await screen.findByText(`Reassigned to you from Coordinator 1 on ${formatDateTime(reassignedAt)}`),
    ).toBeInTheDocument();
  });

  // No banner on an event that was never reassigned, or for the organiser.
  // Kills: F2 (banner for everyone), F3 (banner without reassignment data).
  it("REASN-VIEW-02-H shows no reassignment banner for an event never reassigned, or to the organiser", async () => {
    // Arrange + Act: the coordinator opens an event that was never reassigned.
    serve(reassignedEvent({ reassignedFrom: undefined }));
    const { unmount } = renderPage();

    // Assert: no banner.
    await screen.findByRole("heading", { name: "Community Welcome Evening" });
    expect(screen.queryByText(/Reassigned to you/)).not.toBeInTheDocument();
    unmount();

    // Arrange + Act: the organiser opens the reassigned event.
    useAppStore.setState({ currentUser: organiser });
    serve(reassignedEvent());
    renderPage();

    // Assert: no banner for them either.
    await screen.findByRole("heading", { name: "Community Welcome Evening" });
    expect(screen.queryByText(/Reassigned to you/)).not.toBeInTheDocument();
  });
});

describe("SPM-46 AC3: the full context", () => {
  // The new coordinator sees the details, the approval in the status timeline and the earlier clarification.
  // Kills: F7 (clarification history not loaded), F8 (event detail fields swapped).
  it("REASN-VIEW-03-A shows the new coordinator the details, the approval decision and the clarification history", async () => {
    // Arrange: Coordinator 2 opens the approved event, with distinct values in every detail field,
    // carrying Coordinator 1's question.
    serve(
      reassignedEvent({
        expectedAttendance: 137,
        venueRequirements: { minCapacity: 137, layout: "Theatre", facilities: ["Catering", "AV System"], accessibility: ["Wheelchair ramps"] },
        equipmentNeeds: "Two microphones",
      }),
    );

    // Act: open the page.
    renderPage();

    // Assert: the name, purpose and every planning detail the organiser submitted.
    expect(await screen.findByRole("heading", { name: "Community Welcome Evening" })).toBeInTheDocument();
    expect(screen.getByText("Community building")).toBeInTheDocument();
    const detail = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
    expect(detail("Date & time")).toBe(formatDateTimeRange("2026-12-12T18:00:00.000Z", "2026-12-12T21:00:00.000Z"));
    expect(detail("Expected attendance")).toBe("137");
    expect(detail("Room layout")).toBe("Theatre");
    expect(detail("Required facilities")).toBe("Catering, AV System");
    expect(detail("Accessibility needs")).toBe("Wheelchair ramps");
    expect(detail("Equipment needs")).toBe("Two microphones");
    expect(detail("Organiser")).toContain("Priya Nair");
    expect(detail("Coordinator")).toContain("Coordinator 2");

    // Assert: the approval decision in the timeline, and the earlier clarification loaded for them.
    expect(within(screen.getByLabelText("Event status timeline")).getByText(/Approved/i)).toBeInTheDocument();
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/events/event-1/comments"));
    expect(await screen.findAllByText("Is the stage still needed?")).not.toHaveLength(0);
  });
});

describe("SPM-46 AC4: after the event moves away", () => {
  // The previous coordinator sees why they can't open it, not a generic "not found".
  // Kills: F6 (refusal replaced by a generic "Event not found").
  it("REASN-VIEW-04-C tells the previous coordinator the event was reassigned, with a way back", async () => {
    // Arrange: the server refuses the former coordinator with the reassigned message.
    useAppStore.setState({ currentUser: { ...coordinator2, id: "coordinator-1", name: "Coordinator 1" } });
    apiMock.mockRejectedValue(new ApiError("This event has been reassigned to another Coordinator.", undefined, undefined, 403));

    // Act: open the old link.
    renderPage();

    // Assert: the clear message and a link back; no "Event not found".
    expect(await screen.findByRole("alert")).toHaveTextContent("This event has been reassigned to another Coordinator.");
    expect(screen.getByRole("link", { name: /Back to/ })).toHaveAttribute("href", "/events");
    expect(screen.queryByText(/Event not found/)).not.toBeInTheDocument();
  });
});
