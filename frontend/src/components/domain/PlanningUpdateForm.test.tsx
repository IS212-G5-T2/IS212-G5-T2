import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanningUpdateForm } from "@/components/domain/PlanningUpdateForm";
import { ApiError } from "@/utils/api";
import { formatDateTime } from "@/utils/format";
import type { EventRecord } from "@/types";

/**
 * SPM-49 — Coordinator updates event information. RED / TDD: PlanningUpdateForm
 * does not exist yet. Contract: props { event, editableFields, lastUpdatedAt,
 * onSave(patch) }; each field shows an "Applies immediately" or "Needs review"
 * badge; "Save changes" sends only the changed fields.
 */

function eventRecord(): EventRecord {
  return {
    id: "00000000-0000-4000-8000-000000000049",
    name: "Welcome Evening",
    purpose: "Community building",
    description: "A welcome event for new members.",
    organiserId: "organiser-1",
    organiserName: "Demo Organiser",
    coordinatorId: "coordinator-1",
    coordinatorName: "Demo Coordinator",
    status: "planning",
    startDateTime: "2026-11-10T10:00:00.000Z",
    endDateTime: "2026-11-10T13:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: ["Catering"], accessibility: ["Wheelchair ramps"] },
    equipmentNeeds: "Two microphones",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-10-04T09:00:00.000Z",
  };
}

// 4 fields apply immediately, 6 need review (a booking exists).
const EDITABLE_FIELDS = [
  ...["name", "purpose", "description", "accessibility"].map((field) => ({ field, mode: "direct" as const })),
  ...["startDateTime", "endDateTime", "expectedAttendance", "layout", "facilities", "equipmentNeeds"].map((field) => ({
    field,
    mode: "needs_review" as const,
  })),
];

const LAST_UPDATED = "2026-10-04T09:00:00.000Z";

function renderForm(onSave = vi.fn().mockResolvedValue(undefined), lastUpdatedAt = LAST_UPDATED) {
  const props = { event: eventRecord(), editableFields: EDITABLE_FIELDS, lastUpdatedAt, onSave };
  const view = render(<PlanningUpdateForm {...props} />);
  return { onSave, ...view, props };
}

afterEach(cleanup);

describe("PlanningUpdateForm", () => {
  // EVENT-UPDATE-01-A: the form opens with the event's current information.
  it("EVENT-UPDATE-01-A pre-fills the current event information", () => {
    renderForm();
    expect(screen.getByLabelText(/event name/i)).toHaveValue("Welcome Evening");
    expect(screen.getByLabelText(/^purpose/i)).toHaveValue("Community building");
    expect(screen.getByLabelText(/expected attendance/i)).toHaveValue(80);
  });

  // EVENT-UPDATE-02-A: direct and review-required fields are visibly different.
  it("EVENT-UPDATE-02-A badges which fields apply immediately and which need review", () => {
    renderForm();
    expect(screen.getAllByText("Applies immediately")).toHaveLength(4);
    expect(screen.getAllByText("Needs review")).toHaveLength(6);
  });

  // EVENT-UPDATE-03-A: only the fields the coordinator changed are sent.
  it("EVENT-UPDATE-03-A saves only the changed fields", async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();
    await user.clear(screen.getByLabelText(/expected attendance/i));
    await user.type(screen.getByLabelText(/expected attendance/i), "120");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ expectedAttendance: 120 });
  });

  // EVENT-UPDATE-04-A: a blank required field shows an error, keeps other values, and saves nothing.
  it("EVENT-UPDATE-04-A shows an error and does not save when the event name is blank", async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();
    await user.clear(screen.getByLabelText(/event name/i));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(screen.getByText("Event name is required.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^purpose/i)).toHaveValue("Community building");
  });

  // EVENT-UPDATE-04-A: whitespace-only counts as blank.
  it("EVENT-UPDATE-04-A treats a whitespace-only event name as blank", async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();
    await user.clear(screen.getByLabelText(/event name/i));
    await user.type(screen.getByLabelText(/event name/i), "   ");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(screen.getByText("Event name is required.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  // EVENT-UPDATE-04-A: a server-side field error is shown and the typed values stay.
  it("EVENT-UPDATE-04-A shows a server field error and keeps what was typed", async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockRejectedValue(new ApiError("Please correct the highlighted fields.", { purpose: "This field is required." }));
    renderForm(onSave);
    await user.type(screen.getByLabelText(/event name/i), " 2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
    expect(screen.getByLabelText(/event name/i)).toHaveValue("Welcome Evening 2");
  });

  // EVENT-UPDATE-06-A: the form shows when the information was last updated, and refreshes.
  it("EVENT-UPDATE-06-A shows when the event information was last updated", () => {
    const { rerender, props } = renderForm();
    expect(screen.getByText(/last updated/i)).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes(formatDateTime(LAST_UPDATED)))).toBeInTheDocument();

    const newer = "2026-10-05T08:00:00.000Z";
    rerender(<PlanningUpdateForm {...props} lastUpdatedAt={newer} />);
    expect(screen.getByText((content) => content.includes(formatDateTime(newer)))).toBeInTheDocument();
  });
});