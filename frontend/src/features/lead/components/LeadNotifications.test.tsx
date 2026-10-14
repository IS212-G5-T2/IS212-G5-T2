// SPM-47 AC10: the Event Coordinator Lead is told when a coordinator with active
// events becomes unavailable, with a link to the reassignment page.
// Test cases: LEAD-REASN-10-E, 10-I, 10-J, 10-K, 10-L.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { LeadNotifications } from "./LeadNotifications";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api }));

const notice = {
  id: "notif-3",
  audienceRole: "coordinator_lead",
  type: "coordinator_unavailable",
  message: "Coordinator 1 is now unavailable and has 3 active events that may need reassignment.",
  read: false,
  createdAt: "2026-10-07T09:00:00.000Z",
};

// Render the panel inside a router (it links to the reassignment page).
function renderPanel() {
  return render(
    <MemoryRouter>
      <LeadNotifications />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // A signed-in Lead and a fresh API double.
  api.mockReset();
  useAppStore.setState({
    currentUser: { id: "lead-1", name: "Coordinator Lead", email: "lead@example.test", role: "coordinator_lead", roles: ["coordinator_lead"] },
  });
});

describe("SPM-47 AC10: the Lead's coordinator-availability notifications", () => {
  // The Lead sees the notice, can go to the reassignment page, and can mark it read.
  it("LEAD-REASN-10-E shows the notice with a link to Reassign Events and lets the Lead mark it read", async () => {
    // Arrange: one unread notice; marking read succeeds.
    const user = userEvent.setup();
    api.mockImplementation((path: string) => Promise.resolve(path === "/notifications" ? [notice] : { success: true }));

    // Act: render the panel.
    renderPanel();

    // Assert: the message and a link to the reassignment page.
    expect(await screen.findByText(notice.message)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review Assigned Events" })).toHaveAttribute("href", "/lead/reassign");

    // Act: mark it read.
    await user.click(screen.getByRole("button", { name: "Mark As Read" }));

    // Assert: the read call is sent and the notice leaves the panel.
    expect(api).toHaveBeenCalledWith("/notifications/notif-3/read", { method: "POST" });
    await waitFor(() => expect(screen.queryByText(notice.message)).not.toBeInTheDocument());
  });

  // Notices already read stay hidden, and other notification types are ignored.
  it("LEAD-REASN-10-I lists only unread coordinator-unavailable notices", async () => {
    // Arrange: one read notice, one unrelated type, one unread notice.
    api.mockResolvedValue([
      { ...notice, id: "notif-old", message: "Coordinator 9 is now unavailable and has 1 active event that may need reassignment.", read: true },
      { ...notice, id: "notif-other", type: "approval", message: "Something else." },
      notice,
    ]);

    // Act: render the panel.
    renderPanel();

    // Assert: only the unread unavailability notice is listed.
    expect(await screen.findByText(notice.message)).toBeInTheDocument();
    expect(screen.queryByText(/Coordinator 9/)).not.toBeInTheDocument();
    expect(screen.queryByText("Something else.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Mark As Read" })).toHaveLength(1);
  });

  // Anyone who isn't the Lead gets no panel and no request.
  it("LEAD-REASN-10-J shows nothing and loads nothing for a user who is not the Lead", () => {
    // Arrange: a coordinator is signed in.
    useAppStore.setState({
      currentUser: { id: "coord-1", name: "Coordinator 1", email: "c1@example.test", role: "coordinator", roles: ["coordinator"] },
    });
    api.mockResolvedValue([notice]);

    // Act: render the panel.
    renderPanel();

    // Assert: no request is made and no panel is shown.
    expect(api).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Coordinator availability" })).not.toBeInTheDocument();
  });

  // If the notices cannot be loaded, the Lead is told inside the panel instead of seeing nothing.
  it("LEAD-REASN-10-K shows a load error inside the panel when the notices cannot be loaded", async () => {
    // Arrange: loading the notifications fails.
    api.mockRejectedValue(new Error("offline"));

    // Act: render the panel.
    renderPanel();

    // Assert: the error is shown in the panel, and no notice or "Mark As Read" button is listed.
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load coordinator availability notices.");
    expect(screen.getByRole("region", { name: "Coordinator availability" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark As Read" })).not.toBeInTheDocument();
  });

  // After a failed load, the error clears and the notice appears once the window regains focus and the reload succeeds.
  it("LEAD-REASN-10-L clears the load error and shows the notice after a focus reload succeeds", async () => {
    // Arrange: the first load fails; every later load returns one unread notice.
    api.mockRejectedValueOnce(new Error("offline")).mockResolvedValue([notice]);

    // Act: render the panel, which fails to load.
    renderPanel();

    // Assert: the load error is shown and no notice is listed yet.
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load coordinator availability notices.");
    expect(screen.queryByText(notice.message)).not.toBeInTheDocument();

    // Act: the window regains focus, which triggers a reload.
    fireEvent.focus(window);

    // Assert: the reload succeeds, the alert disappears, and the notice shows its message, review link and Mark As Read button.
    expect(await screen.findByText(notice.message)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review Assigned Events" })).toHaveAttribute("href", "/lead/reassign");
    expect(screen.getByRole("button", { name: "Mark As Read" })).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
  });
});
