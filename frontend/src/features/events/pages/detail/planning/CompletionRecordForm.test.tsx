import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompletionRecordForm } from "@/features/events/pages/detail/planning/CompletionRecordForm";
import { ApiError, api } from "@/utils/api";

/*
 * SPM-153 AC5, frontend: the completion record. The HTTP layer is the boundary (mocked); the form and its texts are
 * real. Literals are the catalogue wording (MSG-CP-04, MSG-CP-07) and the test-case document values.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000401";
const SAVED_RECORD = {
  attendanceCount: 120,
  operationalNotes: "Setup started 08:00",
  issues: [{ description: "Projector bulb failed" }],
  updatedAt: "2026-10-12T04:00:00.000Z",
  updatedBy: "coord-a",
};

function route(save?: (body: unknown) => Promise<unknown>) {
  apiMock.mockImplementation((path: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      return (save ?? (async () => ({ ...SAVED_RECORD, message: "Completion details saved." })))(
        JSON.parse(String(init.body)),
      ) as Promise<never>;
    }
    return Promise.resolve(SAVED_RECORD) as Promise<never>;
  });
}

function renderForm(overrides: Partial<Parameters<typeof CompletionRecordForm>[0]> = {}) {
  render(<CompletionRecordForm eventId={EVENT_ID} status="completed" isAssignedCoordinator {...overrides} />);
}

describe("SPM-153 completion record (form)", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  // COMPLETE-EVENT-05-A (FE): the saved record is loaded and a save shows MSG-CP-04.
  it("COMPLETE-EVENT-05-A: loads the saved record and announces a save (MSG-CP-04)", async () => {
    route();
    const user = userEvent.setup();
    renderForm();

    expect(await screen.findByDisplayValue("120")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Setup started 08:00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Projector bulb failed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save completion details" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Completion details saved.");
  });

  // COMPLETE-EVENT-05-B (FE): an edit sends the whole set as entered, with the changed attendance as a number.
  it("COMPLETE-EVENT-05-B: sends the edited attendance as a number and the issues as entered", async () => {
    route();
    const user = userEvent.setup();
    renderForm();
    const attendance = await screen.findByDisplayValue("120");

    await user.clear(attendance);
    await user.type(attendance, "118");
    await user.click(screen.getByRole("button", { name: "Add issue" }));
    await user.type(screen.getByRole("textbox", { name: "Issue 2" }), "Queue at registration desk");
    await user.click(screen.getByRole("button", { name: "Save completion details" }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        `/events/${EVENT_ID}/completion-record`,
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const put = apiMock.mock.calls.find((call) => call[1]?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({
      attendanceCount: 118,
      operationalNotes: "Setup started 08:00",
      issues: [{ description: "Projector bulb failed" }, { description: "Queue at registration desk" }],
    });
  });

  // COMPLETE-EVENT-05-D (FE): a refused value shows the server's message and keeps what was typed.
  it("COMPLETE-EVENT-05-D: shows MSG-CP-07 for an invalid attendance and keeps the entered values", async () => {
    route(async () => {
      throw new ApiError("Please enter a valid attendance, notes and issues.", undefined, "INVALID_COMPLETION_RECORD", 422);
    });
    const user = userEvent.setup();
    renderForm();
    const attendance = await screen.findByDisplayValue("120");

    await user.clear(attendance);
    await user.type(attendance, "12.5");
    await user.click(screen.getByRole("button", { name: "Save completion details" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Please enter a valid attendance, notes and issues.");
    expect(screen.getByDisplayValue("12.5")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Setup started 08:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save completion details" })).toBeEnabled();
  });

  // COMPLETE-EVENT-05-C (FE): the form is not rendered on an event that is not Completed.
  it.each(["confirmed", "planning", "cancelled"])("COMPLETE-EVENT-05-C: is not rendered for a %s event", (status) => {
    renderForm({ status });

    expect(screen.queryByRole("button", { name: "Save completion details" })).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  // COMPLETE-EVENT-05-F (FE): only the assigned coordinator sees the form.
  it("COMPLETE-EVENT-05-F: is not rendered for a user who is not the assigned coordinator", () => {
    renderForm({ isAssignedCoordinator: false });

    expect(screen.queryByRole("button", { name: "Save completion details" })).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });
});
