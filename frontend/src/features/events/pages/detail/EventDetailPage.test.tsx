import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { deferred } from "@/test/deferred";
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

  // SPM-38 Test Case EVE-REV-03-E: when the data URL has no MIME type, the
  // preview uses the attachment's recorded type, not the generic default. A
  // distinctive type makes it obvious if the recorded type is ignored.
  it("EVE-REV-03-E opens the attachment with its recorded type when the data URL has no MIME type", async () => {
    // Arrange: an attachment with a distinctive recorded type and a data URL with no MIME type.
    const event = {
      ...assignedEvent(),
      attachments: [
        {
          id: "attachment-5",
          name: "notes.x-notes",
          type: "application/x-notes",
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

    // Act: open the attachment.
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View" }));

    // Assert: the Blob handed to the browser carries the recorded type.
    const [blob] = vi.mocked(window.URL.createObjectURL).mock.calls[0];
    expect((blob as Blob).type).toBe("application/x-notes");
  });

  // SPM-38 Test Case EVE-REV-03-F: when the data URL has no MIME type and the
  // attachment records no type either, the preview uses the generic
  // application/octet-stream type. The upload helper always records a type, so
  // this covers an event record returned by the API without one.
  it("EVE-REV-03-F uses the generic application/octet-stream type when neither the data URL nor the attachment has a type", async () => {
    // Arrange: an attachment with an empty recorded type and a data URL with no MIME type.
    const event = {
      ...assignedEvent(),
      attachments: [
        {
          id: "attachment-3",
          name: "unknown.dat",
          type: "",
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

    // Act: open the attachment.
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View" }));

    // Assert: the Blob handed to the browser has the generic type.
    const [blob] = vi.mocked(window.URL.createObjectURL).mock.calls[0];
    expect((blob as Blob).type).toBe("application/octet-stream");
  });

  // SPM-38 Test Case EVE-REV-03-G: the temporary link made for the preview is
  // released 60 seconds after opening, not sooner and not never.
  it("EVE-REV-03-G releases the preview's temporary link 60 seconds after the attachment opens", async () => {
    // Arrange: render the event and open its attachment on the real clock.
    const event = assignedEvent();
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

    // Take control of the timer before the click so the 60-second release can be advanced by hand.
    vi.useFakeTimers();
    try {
      // Act: open the attachment.
      fireEvent.click(screen.getByRole("button", { name: "View" }));

      // Assert: the link is still in use just before 60 seconds have passed.
      vi.advanceTimersByTime(59_999);
      expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();

      // Assert: at 60 seconds the same link that was opened is released.
      vi.advanceTimersByTime(1);
      expect(window.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    } finally {
      // Restore real timers so the fake clock cannot leak into other tests.
      vi.useRealTimers();
    }
  });

  // SPM-38 Test Case EVE-REV-01-C: StrictMode runs the load effect twice, so
  // the first event load is superseded. If that stale load succeeds late, its
  // event data must not replace what the user is waiting for.
  it("EVE-REV-01-C ignores a superseded event load that succeeds after a newer load", async () => {
    // Arrange: two pending event loads; the first one is superseded by the second.
    const event = assignedEvent();
    const stale = deferred<EventRecord>();
    const current = deferred<EventRecord>();
    const eventLoads: Promise<EventRecord>[] = [stale.promise, current.promise];
    apiMock.mockImplementation((path: string) => {
      if (path !== `/events/${event.id}`) return Promise.resolve([]);
      return eventLoads.shift() ?? Promise.resolve(event);
    });

    render(
      <StrictMode>
        <MemoryRouter initialEntries={[`/events/${event.id}`]}>
          <Routes>
            <Route path="/events/:id" element={<EventDetailPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );
    expect(apiMock.mock.calls.filter(([path]) => path === `/events/${event.id}`)).toHaveLength(2);

    // Act: settle only the superseded load with a different event name.
    await act(async () => {
      stale.resolve({ ...event, name: "Superseded Event" });
      await stale.promise;
    });

    // Assert: the page still shows loading, and the stale data is neither shown nor stored.
    expect(screen.getByText("Loading event…")).toBeTruthy();
    expect(screen.queryByText("Superseded Event")).toBeNull();
    expect(useAppStore.getState().events).toEqual([]);

    // Act: settle the current load.
    await act(async () => {
      current.resolve(event);
      await current.promise;
    });

    // Assert: the current event is shown.
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByText("Superseded Event")).toBeNull();
  });

  // SPM-38 Test Case EVE-REV-01-D: if a superseded event load fails late, its
  // error must not be shown while the current load is still in progress.
  it("EVE-REV-01-D does not show a load error from a superseded event load that fails late", async () => {
    // Arrange: two pending event loads; the first one is superseded by the second.
    const event = assignedEvent();
    const stale = deferred<EventRecord>();
    const current = deferred<EventRecord>();
    const eventLoads: Promise<EventRecord>[] = [stale.promise, current.promise];
    apiMock.mockImplementation((path: string) => {
      if (path !== `/events/${event.id}`) return Promise.resolve([]);
      return eventLoads.shift() ?? Promise.resolve(event);
    });

    render(
      <StrictMode>
        <MemoryRouter initialEntries={[`/events/${event.id}`]}>
          <Routes>
            <Route path="/events/:id" element={<EventDetailPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );
    expect(apiMock.mock.calls.filter(([path]) => path === `/events/${event.id}`)).toHaveLength(2);

    // Act: settle only the superseded load with a failure.
    await act(async () => {
      stale.reject(new Error("Network offline."));
      await stale.promise.catch(() => undefined);
    });

    // Assert: the page still shows loading and no alert is shown.
    expect(screen.getByText("Loading event…")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    // Act: settle the current load.
    await act(async () => {
      current.resolve(event);
      await current.promise;
    });

    // Assert: the current event is shown with no error.
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // SPM-36 EVE-CRE-07-C: straight after submitting, the page must not offer "← Back": history -1 is
  // the form that was just submitted. The success banner links on instead.
  it("EVE-CRE-07-C hides the Back button right after a request is submitted", async () => {
    // Arrive the way EventCreatePage navigates after a successful submit.
    const event = assignedEvent();
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path.includes("/comments") ? [] : event),
    );
    render(
      <MemoryRouter initialEntries={[{ pathname: `/events/${event.id}`, state: { submitted: true } }]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // The success banner and its link are shown, but no Back button.
    expect(await screen.findByText("Your event request was submitted successfully.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View My Events" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Back/ })).toBeNull();
  });

  // Opening an event normally (not straight from submitting) keeps "← Back".
  it("EVE-CRE-07-D keeps the Back button when the event is opened normally", async () => {
    // Arrive without the post-submission state.
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

    // No success banner, and Back is available.
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByText("Your event request was submitted successfully.")).toBeNull();
    expect(screen.getByRole("button", { name: /Back/ })).toBeTruthy();
  });

  // "← Back" returns to whichever page the user came from.
  it("EVE-CRE-07-E takes the user back to the previous page when Back is clicked", async () => {
    // Arrange: history is the events list, then this event's detail page.
    const event = assignedEvent();
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path.includes("/comments") ? [] : event),
    );
    render(
      <MemoryRouter initialEntries={["/events", `/events/${event.id}`]} initialIndex={1}>
        <Routes>
          <Route path="/events" element={<p>Events list page</p>} />
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();

    // Act: click Back.
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));

    // Assert: the previous page (the events list) is shown again.
    expect(await screen.findByText("Events list page")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Welcome Evening" })).toBeNull();
  });

  // SPM-38 AC5 / SPM-123: coordinators are assigned by the Event Coordinator
  // Lead from the Assignment Queue, so there is no manual "claim this request"
  // control for coordinators to see or use on the event page.
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

  // SPM-83 builds the approve/reject decision controls behind the Review Event
  // entrypoint, replacing the SPM-37 "not available yet" placeholder. Full
  // coverage of the reject workflow lives in EventDetailPage.decision.test.tsx.
  it("reveals approve/reject decision controls when the assigned coordinator opens Review Event", async () => {
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
    // The review entrypoint is present and enabled; clicking it now reveals the
    // approve/reject decision controls (no more "not available yet" placeholder).
    const reviewButton = screen.getByRole("button", { name: "Review Event" });
    expect(reviewButton).toHaveProperty("disabled", false);
    fireEvent.click(reviewButton);
    expect(screen.queryByText("Event review is not available yet.")).toBeNull();
    expect(screen.getByRole("radio", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Reject" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit Decision" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Assign Myself/i })).toBeNull();
  });

  it("persists an approval and updates the event after Submit Decision", async () => {
    const event = assignedEvent();
    apiMock.mockImplementation((path: string) => {
      if (path.includes("/comments")) return Promise.resolve([]);
      if (path.endsWith("/approve")) return Promise.resolve({ ...event, status: "approved" });
      return Promise.resolve(event);
    });

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Review Event" }));
    fireEvent.click(screen.getByRole("radio", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Decision" }));

    expect(apiMock).toHaveBeenCalledWith(
      `/events/${event.id}/approve`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText("approved")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit Decision" })).toBeNull();
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

  /** The detail page's Venue field shows the venue text the server sent, including the "(pending)" label. */
  it("shows the server venue text, including a pending label, in the Venue field", async () => {
    const event = { ...assignedEvent(), venueName: "Breakout Room 1 (pending)" };
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
    const venueTerm = screen.getByText("Venue", { selector: "dt" });
    expect(venueTerm.nextElementSibling).toHaveTextContent("Breakout Room 1 (pending)");
  });
});
