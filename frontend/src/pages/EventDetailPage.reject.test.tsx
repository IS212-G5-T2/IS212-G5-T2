import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/pages/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord, UserRole } from "@/types";

/**
 * SPM-83 — Reject a request. Frontend UI unit tests (Confluence: EVENT-REJECT-01
 * A-H and the UI authorization guard EVENT-REJECT-04-A). These are RED / TDD:
 * the reject decision controls behind the existing "Review Event" button are not
 * implemented yet (today it only surfaces "Event review is not available yet."),
 * so the cases fail until the feature lands. Intended UI contract:
 *
 *   - Clicking "Review Event" reveals decision controls: an Approve and a Reject
 *     option, a reason textbox, and a "Submit Decision" button.
 *   - On any invalid reason the FULL requirements block is shown (three lines),
 *     the reason field is aria-invalid, and no reject request fires.
 *   - A valid reason submits the rejection (POST /events/:id/reject).
 *
 * Reason rule: trimmed 10-500 chars, >=3 words, must contain letters.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function assignedEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "00000000-0000-4000-8000-000000000036",
    name: "Welcome Evening",
    purpose: "Community building",
    description: "A welcome event for new members.",
    organiserId: "organiser-9",
    organiserName: "Demo Organiser",
    coordinatorId: "coordinator-1",
    coordinatorName: "Demo Coordinator",
    status: "submitted",
    startDateTime: "2026-12-12T18:00:00.000Z",
    endDateTime: "2026-12-12T21:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: [], accessibility: [] },
    equipmentNeeds: "",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

function setUser(role: UserRole, id = "coordinator-1") {
  useAppStore.setState({
    currentUser: { id, name: "Test User", email: "user@example.test", role },
  });
}

function renderDetail(event: EventRecord) {
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(String(path).includes("/comments") ? [] : event),
  );
  return render(
    <MemoryRouter initialEntries={[`/events/${event.id}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openReview() {
  fireEvent.click(await screen.findByRole("button", { name: "Review Event" }));
  // Choosing Reject reveals the reason field / Submit Decision control.
  fireEvent.click(screen.getByRole("radio", { name: /reject/i }));
}

function fillReason(value: string) {
  fireEvent.change(screen.getByRole("textbox", { name: /reason/i }), {
    target: { value },
  });
}

function submitDecision() {
  fireEvent.click(screen.getByRole("button", { name: "Submit Decision" }));
}

function expectRequirementsBlock() {
  expect(screen.getByText(/between 10 and 500 characters/i)).toBeTruthy();
  expect(screen.getByText(/at least 3 words/i)).toBeTruthy();
  expect(screen.getByText(/real words, not just numbers or symbols/i)).toBeTruthy();
}

function rejectRequestFired() {
  return apiMock.mock.calls.some(([p]) => String(p).includes("/reject"));
}

function reasonOfLength(n: number): string {
  const words: string[] = [];
  let len = 0;
  while (len < n) {
    if (words.length) len += 1;
    words.push("ab");
    len += 2;
  }
  return words.join(" ").slice(0, n);
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ events: [], notifications: [] });
  setUser("coordinator");
});

describe("EventDetailPage — reject workflow (SPM-83)", () => {
  // EVENT-REJECT-01-A — happy path (entry)
  it("lets the assigned coordinator open reject decision controls from Review Event", async () => {
    renderDetail(assignedEvent());

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review Event" }));

    expect(screen.getByRole("radio", { name: /reject/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /approve/i })).toBeTruthy();
  });

  // EVENT-REJECT-01-B — happy path (submit)
  it("submits a valid rejection and fires the reject request", async () => {
    renderDetail(assignedEvent());
    await openReview();

    fillReason("  Clashes with exam period.  ");
    submitDecision();

    expect(rejectRequestFired()).toBe(true);
    expect(screen.queryByText(/between 10 and 500 characters/i)).toBeNull();
  });

  // EVENT-REJECT-01-C — empty / whitespace-only
  it("blocks an empty or whitespace-only reason with the requirements block", async () => {
    renderDetail(assignedEvent());
    await openReview();

    submitDecision();
    expectRequirementsBlock();
    expect(screen.getByRole("textbox", { name: /reason/i })).toHaveProperty("ariaInvalid", "true");

    fillReason("   ");
    submitDecision();
    expectRequirementsBlock();
    expect(rejectRequestFired()).toBe(false);
  });

  // EVENT-REJECT-01-D — below minimum length (<10)
  it("blocks a reason under 10 characters and accepts exactly 10", async () => {
    renderDetail(assignedEvent());
    await openReview();

    fillReason("no fit ok"); // 9 chars
    submitDecision();
    expectRequirementsBlock();
    expect(rejectRequestFired()).toBe(false);

    fillReason("No fit yet"); // 10 chars, 3 words
    submitDecision();
    expect(rejectRequestFired()).toBe(true);
  });

  // EVENT-REJECT-01-E — above maximum length (>500)
  it("accepts exactly 500 characters and blocks 501", async () => {
    renderDetail(assignedEvent());
    await openReview();

    fillReason(reasonOfLength(501));
    submitDecision();
    expectRequirementsBlock();
    expect(rejectRequestFired()).toBe(false);

    fillReason(reasonOfLength(500));
    submitDecision();
    expect(rejectRequestFired()).toBe(true);
  });

  // EVENT-REJECT-01-F — fewer than 3 words
  it("blocks a reason with fewer than 3 words with the requirements block", async () => {
    renderDetail(assignedEvent());
    await openReview();

    fillReason("Reason today"); // 2 words
    submitDecision();
    expectRequirementsBlock();

    fillReason("aaaaaaaaaa"); // 1 word (single repeated char)
    submitDecision();
    expectRequirementsBlock();
    expect(rejectRequestFired()).toBe(false);

    fillReason("Venue is not available"); // 4 words
    submitDecision();
    expect(rejectRequestFired()).toBe(true);
  });

  // EVENT-REJECT-01-G — no letters (numbers / symbols only)
  it("blocks a letter-less reason with the requirements block", async () => {
    renderDetail(assignedEvent());
    await openReview();

    fillReason("123 456 7890");
    submitDecision();
    expectRequirementsBlock();

    fillReason("!!! ??? ...");
    submitDecision();
    expectRequirementsBlock();
    expect(rejectRequestFired()).toBe(false);

    fillReason("Venue is not available");
    submitDecision();
    expect(rejectRequestFired()).toBe(true);
  });

  // EVENT-REJECT-01-H — special characters preserved & rendered safely
  it("accepts a special-character reason and renders it safely to the organiser", async () => {
    const reason = 'Room too small & date clashed <not a tag> "quoted" — 🚫';
    renderDetail(assignedEvent());
    await openReview();

    fillReason(reason);
    submitDecision();
    expect(rejectRequestFired()).toBe(true);

    // Rendered to the organiser as literal text (no markup interpretation).
    cleanup();
    setUser("organiser", "organiser-9");
    renderDetail(assignedEvent({ status: "rejected", rejectionReason: reason }));
    expect(await screen.findByText(reason)).toBeTruthy();
  });

  // EVENT-REJECT-04-A — authorization (UI): reject controls only for the assigned coordinator
  it("shows reject controls only to the assigned coordinator", async () => {
    // Unassigned coordinator: no Review Event entrypoint.
    setUser("coordinator", "coordinator-2");
    renderDetail(assignedEvent());
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review Event" })).toBeNull();
    cleanup();

    // Organiser (owner): no reject controls.
    setUser("organiser", "organiser-9");
    renderDetail(assignedEvent());
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /reject/i })).toBeNull();
    cleanup();

    // Assigned coordinator: reject controls are available.
    setUser("coordinator", "coordinator-1");
    renderDetail(assignedEvent());
    fireEvent.click(await screen.findByRole("button", { name: "Review Event" }));
    expect(screen.getByRole("radio", { name: /reject/i })).toBeTruthy();
  });

  // AC5 visual: a rejected request shows a draft → submitted → rejected timeline,
  // not the normal approval pipeline.
  it("shows a draft → submitted → rejected status timeline for a rejected request", async () => {
    setUser("organiser", "organiser-9");
    renderDetail(
      assignedEvent({ status: "rejected", rejectionReason: "Venue is not available" }),
    );

    const timeline = await screen.findByRole("list", { name: /Event status timeline/i });
    expect(within(timeline).getByText("draft")).toBeTruthy();
    expect(within(timeline).getByText("submitted")).toBeTruthy();
    expect(within(timeline).getByText("rejected")).toBeTruthy();
    // The approval pipeline steps are not part of a rejected request's timeline.
    expect(within(timeline).queryByText("approved")).toBeNull();
    expect(within(timeline).queryByText("under review")).toBeNull();
  });
});
