import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestChangeForm } from "@/features/events/pages/change-requests/RequestChangeForm";
import type { ChangeRequest, EventRecord } from "@/types";
import { ApiError } from "@/utils/api";

/**
 * SPM-64 — the organiser's Request Change form. Test IDs refer to the
 * Confluence pages under SPM-28 > SPM-64 (REQ-CHANGE-NN-X).
 */

function eventRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "evt-1",
    name: "Alumni Networking Night",
    purpose: "Connect students with alumni",
    description: "An evening of networking.",
    organiserId: "org-1",
    organiserName: "Organiser 1",
    status: "planning",
    // 5 Feb 2030, 6:30 pm – 9:30 pm Singapore time.
    startDateTime: "2030-02-05T10:30:00.000Z",
    endDateTime: "2030-02-05T13:30:00.000Z",
    expectedAttendance: 120,
    venueRequirements: { minCapacity: 120, layout: "Banquet", facilities: ["Catering"], accessibility: ["Wheelchair ramps"] },
    equipmentNeeds: "One wireless microphone.",
    registrationEnabled: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const CREATED = { id: "cr-1", status: "Pending" } as ChangeRequest;

function renderForm(event = eventRecord(), onSubmit = vi.fn().mockResolvedValue(CREATED)) {
  const onCancel = vi.fn();
  render(<RequestChangeForm event={event} onSubmit={onSubmit} onCancel={onCancel} />);
  return { onSubmit, onCancel, user: userEvent.setup() };
}

afterEach(cleanup);

describe("RequestChangeForm", () => {
  /** REQ-CHANGE-01-A, 02-A: permitted fields are pre-filled inputs; name and organiser are read-only text. */
  it("REQ-CHANGE-02-A shows the event name and organiser read-only and pre-fills the permitted fields", () => {
    renderForm();
    expect(screen.getByText("Event name").nextElementSibling).toHaveTextContent("Alumni Networking Night");
    expect(screen.getByText("Organiser").nextElementSibling).toHaveTextContent("Organiser 1");
    expect(screen.queryByRole("textbox", { name: /event name/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /organiser/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toHaveValue("An evening of networking.");
    // Date inputs are Singapore wall time.
    expect(screen.getByLabelText(/start date/i)).toHaveValue("2030-02-05T18:30");
    expect(screen.getByLabelText(/end date/i)).toHaveValue("2030-02-05T21:30");
    expect(screen.getByLabelText(/expected attendance/i)).toHaveValue(120);
    expect(screen.getByLabelText(/room layout/i)).toHaveValue("Banquet");
    expect(screen.getByRole("group", { name: /accessibility \/ special requirements/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/equipment requirements/i)).toHaveValue("One wireless microphone.");
  });

  /** REQ-CHANGE-01-E: nothing can be submitted until a detail differs from the current value. */
  it("REQ-CHANGE-01-E keeps Submit disabled until something changes", async () => {
    const { user } = renderForm();
    const submit = screen.getByRole("button", { name: "Submit Change Request" });
    expect(submit).toBeDisabled();
    expect(screen.getByText("Change at least one detail to submit a request.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/expected attendance/i));
    await user.type(screen.getByLabelText(/expected attendance/i), "140");
    expect(submit).toBeEnabled();
  });

  /** REQ-CHANGE-01-B: only changed fields are sent, dates converted from Singapore time, with the optional reason. */
  it("REQ-CHANGE-01-B sends only the changed fields and the reason", async () => {
    const { user, onSubmit } = renderForm();
    await user.clear(screen.getByLabelText(/expected attendance/i));
    await user.type(screen.getByLabelText(/expected attendance/i), "140");
    await user.selectOptions(screen.getByLabelText(/room layout/i), "Theatre");
    await user.click(screen.getByRole("checkbox", { name: "Projector" }));
    await user.click(screen.getByRole("checkbox", { name: "Hearing loop" }));
    await user.clear(screen.getByLabelText(/equipment requirements/i));
    await user.type(screen.getByLabelText(/equipment requirements/i), "  Two microphones.  ");
    await user.clear(screen.getByLabelText(/start date/i));
    await user.type(screen.getByLabelText(/start date/i), "2030-02-05T19:00");
    await user.type(screen.getByLabelText(/reason/i), "  More guests.  ");
    await user.click(screen.getByRole("button", { name: "Submit Change Request" }));
    expect(onSubmit).toHaveBeenCalledWith({
      changes: {
        expectedAttendance: 140,
        layout: "Theatre",
        facilities: ["Catering", "Projector"],
        accessibility: ["Wheelchair ramps", "Hearing loop"],
        equipmentNeeds: "Two microphones.",
        startDateTime: "2030-02-05T11:00:00.000Z",
      },
      reason: "More guests.",
    });
  });

  /** REQ-CHANGE-01-C: a value that is not a whole number is sent as typed so the server names the problem; a cleared date is sent empty. */
  it("REQ-CHANGE-01-C passes invalid attendance and a cleared date through for server validation", async () => {
    const { user, onSubmit } = renderForm();
    await user.clear(screen.getByLabelText(/expected attendance/i));
    await user.clear(screen.getByLabelText(/end date/i));
    await user.click(screen.getByRole("button", { name: "Submit Change Request" }));
    expect(onSubmit).toHaveBeenCalledWith({ changes: { expectedAttendance: "", endDateTime: "" } });
  });

  /** REQ-CHANGE-06-A, 04-B: server errors are shown, including fields that are not inputs here; typed values are kept. */
  it("REQ-CHANGE-06-A shows the server's message and field errors and keeps the typed values", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError("Event name and organiser cannot be changed. Remove these changes and try again.", {
        name: "Event name cannot be changed.",
        expectedAttendance: "Enter a positive whole number of attendees.",
      }),
    );
    const { user } = renderForm(eventRecord(), onSubmit);
    await user.clear(screen.getByLabelText(/expected attendance/i));
    await user.type(screen.getByLabelText(/expected attendance/i), "0");
    await user.click(screen.getByRole("button", { name: "Submit Change Request" }));
    // The form-level alert carries the message; field errors render their own alerts.
    const alert = (await screen.findAllByRole("alert")).find((a) => a.textContent?.includes("Remove these changes"))!;
    expect(alert).toHaveTextContent("Event name and organiser cannot be changed. Remove these changes and try again.");
    expect(within(alert).getByText("Event name cannot be changed.")).toBeInTheDocument();
    expect(screen.getByText("Enter a positive whole number of attendees.")).toBeInTheDocument();
    expect(screen.getByLabelText(/expected attendance/i)).toHaveValue(0);
    expect(screen.getByRole("button", { name: "Submit Change Request" })).toBeEnabled();
  });

  /** REQ-CHANGE-04-B: an unexpected failure shows a generic retry message. */
  it("REQ-CHANGE-04-B shows a generic message for a non-API failure", async () => {
    const { user } = renderForm(eventRecord(), vi.fn().mockRejectedValue(new Error("boom")));
    await user.type(screen.getByLabelText(/description/i), " More.");
    await user.click(screen.getByRole("button", { name: "Submit Change Request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not submit your change request. Please try again.");
  });

  /** REQ-CHANGE-04-B: facility and accessibility errors from the server are shown under their groups. */
  it("REQ-CHANGE-04-B shows choice-list errors under their groups", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError("Please correct the highlighted fields.", { facilities: "Choose valid options.", accessibility: "Choose valid options." }),
    );
    const { user } = renderForm(eventRecord(), onSubmit);
    await user.click(screen.getByRole("checkbox", { name: "Stage" }));
    await user.click(screen.getByRole("button", { name: "Submit Change Request" }));
    expect(await screen.findAllByText("Choose valid options.")).toHaveLength(2);
  });

  /** REQ-CHANGE-04-C: the request is sent once while saving. */
  it("REQ-CHANGE-04-C disables Submit while the request is saving", async () => {
    let resolve!: (value: ChangeRequest) => void;
    const onSubmit = vi.fn(() => new Promise<ChangeRequest>((r) => (resolve = r)));
    const { user } = renderForm(eventRecord(), onSubmit);
    await user.type(screen.getByLabelText(/description/i), " More.");
    await user.click(screen.getByRole("button", { name: "Submit Change Request" }));
    expect(screen.getByRole("button", { name: "Submitting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    resolve(CREATED);
    expect(await screen.findByRole("button", { name: "Submit Change Request" })).toBeEnabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  /** REQ-CHANGE-07-A: past approval the organiser is told a new safety check may be needed; a Submitted event has none. */
  it("REQ-CHANGE-07-A shows the safety check note only for events past approval", () => {
    renderForm();
    expect(screen.getByRole("note")).toHaveTextContent("the event will need a new safety check");
    cleanup();
    renderForm(eventRecord({ status: "submitted" }));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  /** Cancel closes the form without submitting. */
  it("calls onCancel without submitting", async () => {
    const { user, onCancel, onSubmit } = renderForm();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
