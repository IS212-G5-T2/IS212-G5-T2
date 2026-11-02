import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

  // COMPLETE-EVENT-05-A (empty): a record with nothing saved loads empty fields.
  it("COMPLETE-EVENT-05-A: a record with nothing saved loads empty fields", async () => {
    apiMock.mockResolvedValue({ attendanceCount: null, operationalNotes: null, issues: [], updatedAt: null, updatedBy: null } as never);
    renderForm();

    await waitFor(() => expect(screen.getByRole("button", { name: "Save completion details" })).toBeEnabled());
    expect(screen.getByLabelText("Attendance")).toHaveValue("");
    expect(screen.getByLabelText("Operational notes")).toHaveValue("");
  });

  // COMPLETE-EVENT-05-A (load failure): a record that cannot be read says so and the form stays closed.
  it("COMPLETE-EVENT-05-A: a failed load shows an error and leaves the save disabled", async () => {
    apiMock.mockRejectedValue(new Error("Network down"));
    renderForm();

    expect(await screen.findByRole("alert")).toHaveTextContent("Completion details could not be loaded.");
    expect(screen.getByRole("button", { name: "Save completion details" })).toBeDisabled();
  });

  // COMPLETE-EVENT-05-A (unmount): a record that arrives after the form is closed is ignored.
  it("COMPLETE-EVENT-05-A: a record that arrives after the form is closed is ignored", async () => {
    let deliver: (value: unknown) => void = () => undefined;
    apiMock.mockReturnValue(new Promise((resolve) => { deliver = resolve; }) as never);
    const { unmount } = render(<CompletionRecordForm eventId={EVENT_ID} status="completed" isAssignedCoordinator />);

    unmount();
    deliver(SAVED_RECORD);
    await Promise.resolve();

    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  // COMPLETE-EVENT-05-B (notes): edited notes are sent as entered.
  it("COMPLETE-EVENT-05-B: edited notes are sent as entered", async () => {
    route();
    const user = userEvent.setup();
    renderForm();
    const notes = await screen.findByDisplayValue("Setup started 08:00");

    await user.clear(notes);
    await user.type(notes, "Doors opened late.");
    await user.click(screen.getByRole("button", { name: "Save completion details" }));

    await waitFor(() => expect(apiMock.mock.calls.some((call) => call[1]?.method === "PUT")).toBe(true));
    const put = apiMock.mock.calls.find((call) => call[1]?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body)).operationalNotes).toBe("Doors opened late.");
  });

  // COMPLETE-EVENT-05-B (remove): removing an issue sends the remaining issues only.
  it("COMPLETE-EVENT-05-B: removing an issue sends the remaining issues only", async () => {
    route();
    const user = userEvent.setup();
    renderForm();
    await screen.findByDisplayValue("Projector bulb failed");

    await user.click(screen.getByRole("button", { name: "Add issue" }));
    await user.type(screen.getByRole("textbox", { name: "Issue 2" }), "Queue at registration desk");
    await user.click(screen.getByRole("button", { name: "Remove issue 1" }));
    await user.click(screen.getByRole("button", { name: "Save completion details" }));

    await waitFor(() => expect(apiMock.mock.calls.some((call) => call[1]?.method === "PUT")).toBe(true));
    const put = apiMock.mock.calls.find((call) => call[1]?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body)).issues).toEqual([{ description: "Queue at registration desk" }]);
  });

  // COMPLETE-EVENT-05-A (unmount): a load that fails after the form is closed is ignored.
  it("COMPLETE-EVENT-05-A: a load that fails after the form is closed is ignored", async () => {
    let fail: (reason: unknown) => void = () => undefined;
    apiMock.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }) as never);
    const { unmount } = render(<CompletionRecordForm eventId={EVENT_ID} status="completed" isAssignedCoordinator />);

    unmount();
    fail(new Error("Network down"));
    await Promise.resolve();

    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  // COMPLETE-EVENT-05-D (typed): an attendance that is not a whole number is sent as typed, so the server refuses it.
  it("COMPLETE-EVENT-05-D: an attendance that is not a whole number is sent as typed", async () => {
    route();
    const user = userEvent.setup();
    renderForm();
    const attendance = await screen.findByDisplayValue("120");

    await user.clear(attendance);
    await user.type(attendance, "12.5");
    await user.click(screen.getByRole("button", { name: "Save completion details" }));

    await waitFor(() => expect(apiMock.mock.calls.some((call) => call[1]?.method === "PUT")).toBe(true));
    const put = apiMock.mock.calls.find((call) => call[1]?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body)).attendanceCount).toBe("12.5");
  });

  // COMPLETE-EVENT-05-A (stale): a record for the previous event that arrives after the form has moved on is ignored.
  it("COMPLETE-EVENT-05-A: a load for a previous event that arrives late is ignored", async () => {
    let deliverOld: (value: unknown) => void = () => undefined;
    const NEW_RECORD = { ...SAVED_RECORD, operationalNotes: "New event notes", issues: [] };
    apiMock.mockImplementation(((path: string) =>
      path.includes("00000000-0000-4000-8000-000000000401")
        ? new Promise((resolve) => { deliverOld = resolve; })
        : Promise.resolve(NEW_RECORD)) as never);
    const { rerender } = render(<CompletionRecordForm eventId={EVENT_ID} status="completed" isAssignedCoordinator />);

    rerender(<CompletionRecordForm eventId="00000000-0000-4000-8000-000000000402" status="completed" isAssignedCoordinator />);
    expect(await screen.findByDisplayValue("New event notes")).toBeInTheDocument();
    await act(async () => {
      deliverOld(SAVED_RECORD);
    });

    expect(screen.getByDisplayValue("New event notes")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Setup started 08:00")).not.toBeInTheDocument();
  });

  // COMPLETE-EVENT-05-A (stale failure): a failed load for the previous event does not show its error on the current one.
  it("COMPLETE-EVENT-05-A: a failed load for a previous event that arrives late shows no error", async () => {
    let failOld: (reason: unknown) => void = () => undefined;
    const NEW_RECORD = { ...SAVED_RECORD, operationalNotes: "New event notes", issues: [] };
    apiMock.mockImplementation(((path: string) =>
      path.includes("00000000-0000-4000-8000-000000000401")
        ? new Promise((_resolve, reject) => { failOld = reject; })
        : Promise.resolve(NEW_RECORD)) as never);
    const { rerender } = render(<CompletionRecordForm eventId={EVENT_ID} status="completed" isAssignedCoordinator />);

    rerender(<CompletionRecordForm eventId="00000000-0000-4000-8000-000000000402" status="completed" isAssignedCoordinator />);
    expect(await screen.findByDisplayValue("New event notes")).toBeInTheDocument();
    await act(async () => {
      failOld(new Error("Network down"));
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // COMPLETE-EVENT-05-B (empty): an empty attendance is sent as null, which clears it.
  it("COMPLETE-EVENT-05-B: an empty attendance is sent as null", async () => {
    route();
    const user = userEvent.setup();
    renderForm();
    const attendance = await screen.findByDisplayValue("120");

    await user.clear(attendance);
    await user.click(screen.getByRole("button", { name: "Save completion details" }));

    await waitFor(() => expect(apiMock.mock.calls.some((call) => call[1]?.method === "PUT")).toBe(true));
    const put = apiMock.mock.calls.find((call) => call[1]?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body)).attendanceCount).toBeNull();
  });

  // COMPLETE-EVENT-05-D (plain error): a save that fails with a plain Error shows its message.
  it("COMPLETE-EVENT-05-D: a save that fails with a plain error shows its message", async () => {
    route(async () => {
      throw new Error("Save is unavailable.");
    });
    const user = userEvent.setup();
    renderForm();
    await screen.findByDisplayValue("120");

    await user.click(screen.getByRole("button", { name: "Save completion details" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Save is unavailable.");
  });

  // COMPLETE-EVENT-05-D (fallback): a save that fails with something other than an error shows the fallback text.
  it("COMPLETE-EVENT-05-D: a save that fails with something other than an error shows the fallback message", async () => {
    route(async () => {
      throw "unexpected";
    });
    const user = userEvent.setup();
    renderForm();
    await screen.findByDisplayValue("120");

    await user.click(screen.getByRole("button", { name: "Save completion details" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the completion details.");
  });
});
