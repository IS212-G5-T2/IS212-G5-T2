import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/pages/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function assignedEvent(): EventRecord {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start);
  end.setHours(21, 0, 0, 0);

  return {
    id: "00000000-0000-4000-8000-000000000036",
    name: "Welcome Evening",
    purpose: "Community building",
    description: "A welcome event for new members.",
    organiserId: "current-user",
    organiserName: "Demo Organiser",
    coordinatorId: "coordinator-1",
    coordinatorName: "Demo Coordinator",
    status: "submitted",
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    expectedAttendance: 80,
    venueRequirements: {
      minCapacity: 80,
      layout: "Banquet",
      facilities: ["Catering"],
      accessibility: ["Wheelchair ramps"],
    },
    attachments: [
      {
        id: "attachment-1",
        name: "proposal.txt",
        type: "text/plain",
        size: 8,
        dataUrl: "data:text/plain;base64,cHJvcG9zYWw=",
      },
    ],
    equipmentNeeds: "Two microphones",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    currentUser: {
      id: "coordinator-1",
      name: "Demo Coordinator",
      email: "coordinator@example.test",
      role: "coordinator",
    },
    events: [],
  });
  // jsdom does not implement the Blob-object-URL APIs the fixed "View" action
  // relies on (see EventDetailPage.tsx's openAttachmentPreview).
  window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
  window.URL.revokeObjectURL = vi.fn();
});

describe("EventDetailPage", () => {
  // SPM-38 Test Case EVE-REV-03-A
  it("shows attached files with view and download actions", async () => {
    const event = assignedEvent();
    apiMock.mockImplementation((path: string) =>
      path.includes("/comments") ? Promise.resolve([]) : Promise.resolve(event),
    );

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.getByText("Attached files")).toBeTruthy();
    expect(screen.getByText("proposal.txt")).toBeTruthy();
    expect(screen.getByRole("button", { name: "View" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Download" })).toHaveProperty(
      "download",
      "proposal.txt",
    );
    expect(screen.getByRole("link", { name: "Download" })).toHaveProperty(
      "href",
      "data:text/plain;base64,cHJvcG9zYWw=",
    );
  });

  // SPM-38 Test Case EVE-REV-03-B: Chrome/Firefox block top-level navigation
  // of a link to a data: URL, so "View" previously opened nothing in a real
  // browser (only jsdom's laxer <a href> checks made the old test pass). The
  // fix converts the attachment to a Blob object URL before opening it.
  it("EVE-REV-03-B opens the attachment as a Blob object URL instead of navigating to the raw data: URL", async () => {
    const event = assignedEvent();
    apiMock.mockImplementation((path: string) =>
      path.includes("/comments") ? Promise.resolve([]) : Promise.resolve(event),
    );
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View" }));

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    const [blob] = vi.mocked(window.URL.createObjectURL).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe("text/plain");
    expect(openSpy).toHaveBeenCalledWith("blob:mock-url", "_blank", "noopener,noreferrer");
  });

  // SPM-38 Test Case EVE-REV-03-C: an event with no attachments shows a plain
  // fallback and never renders View/Download controls.
  it("EVE-REV-03-C shows None specified and no view/download controls when there are no attachments", async () => {
    const event = { ...assignedEvent(), attachments: [] };
    apiMock.mockImplementation((path: string) =>
      path.includes("/comments") ? Promise.resolve([]) : Promise.resolve(event),
    );

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.getByText("Attached files").nextElementSibling).toHaveTextContent(
      "None specified",
    );
    expect(screen.queryByRole("button", { name: "View" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Download" })).toBeNull();
  });

  // SPM-38 Test Case EVE-REV-03-D: openAttachmentPreview falls back to the
  // attachment's own `type` field when the data: URL header doesn't carry a
  // recognizable `;base64` marker to extract a MIME type from.
  it("EVE-REV-03-D falls back to the attachment's type when the data URL has no extractable MIME type", async () => {
    const event = {
      ...assignedEvent(),
      attachments: [
        {
          id: "attachment-2",
          name: "notes.bin",
          type: "application/octet-stream",
          size: 4,
          dataUrl: "data:base64,cHJvcG9zYWw=",
        },
      ],
    };
    apiMock.mockImplementation((path: string) =>
      path.includes("/comments") ? Promise.resolve([]) : Promise.resolve(event),
    );
    vi.spyOn(window, "open").mockReturnValue(null);

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View" }));

    const [blob] = vi.mocked(window.URL.createObjectURL).mock.calls[0];
    expect((blob as Blob).type).toBe("application/octet-stream");
  });

  // SPM-38 AC5: round-robin now assigns a coordinator automatically at
  // submission time, so there is no manual "claim this request" control for
  // coordinators to see or use.
  it("SPM-38 EVE-REV-05-E never renders a manual coordinator-assignment control", async () => {
    const event = assignedEvent();
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path.includes("/comments") ? [] : event),
    );

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Assign Myself/i })).toBeNull();
  });

  // The coordinator "Edit" button only updated local browser state (no
  // backend persistence existed for it), so an organiser viewing the same
  // event never saw the change. Removed for this sprint; real post-submission
  // editing is tracked separately under "Edit Event Details".
  it("does not show an Edit control to the assigned coordinator on a submitted request", async () => {
    const event = assignedEvent();
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path.includes("/comments") ? [] : event),
    );

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  // SPM-37 follow-up: submitting a draft must not pick a coordinator.
  it("leaves a submitted draft unassigned and sends only a submission notification", () => {
    // Start with a new draft and an empty notification list.
    useAppStore.setState({ events: [], notifications: [] });
    const draft = useAppStore.getState().createDraftEvent({ name: "Manual assignment" });
    // Submit without taking the separate assignment action.
    useAppStore.getState().submitEvent(draft.id);
    // Submission is visible to coordinators without an assignment notification.
    const state = useAppStore.getState();
    expect(state.events[0].status).toBe("submitted");
    expect(state.events[0].coordinatorId).toBeUndefined();
    expect(state.events[0].coordinatorName).toBeUndefined();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({
      type: "submission", message: '"Manual assignment" was submitted for review.',
    });
  });

  // SPM-38 Test Case EVE-REV-04-E: the backend now returns a real 404 for a
  // coordinator the event isn't assigned to (see events.service.spec.ts for
  // the server-side enforcement), so the page must surface that as an error
  // rather than rendering event details it should never have received.
  it("EVE-REV-04-E shows an error instead of event details when the backend denies access", async () => {
    apiMock.mockRejectedValue(new Error("Event not found."));

    useAppStore.setState({
      currentUser: {
        id: "coordinator-other",
        name: "Other Coordinator",
        email: "other@example.test",
        role: "coordinator",
      },
    });

    render(
      <MemoryRouter initialEntries={["/events/00000000-0000-4000-8000-000000000036"]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Event not found.");
    expect(screen.queryByRole("heading", { name: "Welcome Evening" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review Event" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Assign Myself/i })).toBeNull();
  });

  // SPM-37 shows a Review Event entrypoint that surfaces a not-available notice,
  // with no approval/rejection workflow behind it.
  it("shows a Review Event button that surfaces a not-available notice and no decision controls", async () => {
    // Load a request already assigned to the signed-in coordinator.
    const event = assignedEvent();
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path.includes("/comments") ? [] : event),
    );

    useAppStore.setState({
      currentUser: {
        id: "coordinator-1",
        name: "Demo Coordinator",
        email: "coordinator@example.test",
        role: "coordinator",
      },
    });

    // Open the event detail page.
    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    // The review entrypoint is present and enabled, but clicking it only surfaces
    // a not-available notice — there are no decision controls.
    const reviewButton = screen.getByRole("button", { name: "Review Event" });
    expect(reviewButton).toHaveProperty("disabled", false);
    fireEvent.click(reviewButton);
    expect(screen.getByText("Event review is not available yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit Decision" })).toBeNull();
    expect(screen.queryByRole("radio", { name: /Approve|Reject/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Assign Myself/i })).toBeNull();
  });

  it("restricts venue staff from accessing unapproved submitted requests", async () => {
    const event = assignedEvent();
    apiMock.mockResolvedValue(event);

    useAppStore.setState({
      currentUser: {
        id: "venue-1",
        name: "Venue Staff",
        email: "venue@example.test",
        role: "venue_staff",
      },
    });

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Access restricted: Venue and technical support staff cannot access unapproved submitted requests/i),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Welcome Evening" })).toBeNull();
  });

  it("restricts tech support staff from accessing unapproved submitted requests", async () => {
    const event = assignedEvent();
    apiMock.mockResolvedValue(event);

    useAppStore.setState({
      currentUser: {
        id: "tech-1",
        name: "Tech Support",
        email: "tech@example.test",
        role: "tech_support",
      },
    });

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Access restricted: Venue and technical support staff cannot access unapproved submitted requests/i),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Welcome Evening" })).toBeNull();
  });
});

