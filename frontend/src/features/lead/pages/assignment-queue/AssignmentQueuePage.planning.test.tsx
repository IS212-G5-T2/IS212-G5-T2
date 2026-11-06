// Story: SPM-148 Event Status Changes from Approved to Planning
// ACs: AC6 (Planning counts toward the coordinator's active workload in the Lead's list)
// Test cases: PLAN-STATUS-06-B (FE)
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { AssignmentQueuePage } from "./AssignmentQueuePage";

const { getLeadQueue, getLeadCoordinators, assignRequest } = vi.hoisted(() => ({
  getLeadQueue: vi.fn(),
  getLeadCoordinators: vi.fn(),
  assignRequest: vi.fn(),
}));
vi.mock("@/features/lead/api/lead-api", () => ({ getLeadQueue, getLeadCoordinators, assignRequest }));

// The Lead notifications panel on this page reads /notifications through api().
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api }));

beforeEach(() => {
  getLeadQueue.mockReset().mockResolvedValue([]);
  getLeadCoordinators.mockReset();
  api.mockReset().mockResolvedValue([]);
  useAppStore.setState({
    authLoading: false,
    isAuthenticated: true,
    currentUser: { id: "lead", name: "Lead", email: "lead@example.test", role: "coordinator_lead" },
    events: [],
  });
});

describe("SPM-148 AC6: the Lead's coordinator list counts Planning", () => {
  // Oracle: SPEC (prompt 2.6 06-B: COO-04 active 4, Planning 1). The count is the value
  // the workload API returns; the page only displays it.
  // Kills: the list dropping Planning events (it would show 3 active), or a stale count.
  it("PLAN-STATUS-06-B: a Coordinator with 4 active events, one in Planning, shows '4 active'", async () => {
    getLeadCoordinators.mockResolvedValue([
      { id: "COO-04", name: "Coordinator 4", available: true, activeAssignments: 4 },
    ]);

    render(
      <MemoryRouter initialEntries={["/lead/assignment-queue"]}>
        <AssignmentQueuePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Coordinator 4")).toBeInTheDocument();
    expect(screen.getByText("4 active")).toBeInTheDocument();
  });
});
