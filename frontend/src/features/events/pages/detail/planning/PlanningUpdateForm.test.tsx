import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PlanningUpdateForm,
  toLocalInput,
} from "@/features/events/pages/detail/planning/PlanningUpdateForm";
import { ApiError } from "@/utils/api";
import { formatDateTime } from "@/utils/format";
import type { EventRecord } from "@/types";
import { resetVenueOptions, venueOptionsState } from "@/test/venueOptions";
import {
  ACCESSIBILITY_OPTIONS,
  FACILITY_OPTIONS,
  ROOM_LAYOUT_OPTIONS,
} from "@/features/venues/lib/venueOptions";

// Facility and accessibility choices: the current backend venue-schema lists (src/test/venueOptions.ts).
vi.mock("@/features/venues/api/venue-options-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import("@/test/venueOptions")).venueOptionsModuleMock(),
}));

/**
 * SPM-49 — Coordinator updates event information (PlanningUpdateForm).
 * Contract: props { event, editableFields, lastUpdatedAt, onSave(patch) }; each
 * field shows an "Applies immediately" or "Changes need review" badge; "Save changes"
 * checks required fields, then sends only the changed fields and reports the
 * outcome. Confluence IDs: EVENT-UPDATE-*, EVENT-FLAG-01-A.
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
    venueRequirements: {
      minCapacity: 80,
      layout: "Banquet",
      facilities: ["Catering"],
      accessibility: ["Wheelchair access"],
    },
    equipmentNeeds: "Two microphones",
    registrationEnabled: false,
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-10-04T09:00:00.000Z",
  };
}

// 4 fields apply immediately, 6 need review (a booking exists).
const EDITABLE_FIELDS = [
  ...["name", "purpose", "description", "accessibility"].map((field) => ({
    field,
    mode: "direct" as const,
  })),
  ...[
    "startDateTime",
    "endDateTime",
    "expectedAttendance",
    "layout",
    "facilities",
    "equipmentNeeds",
  ].map((field) => ({
    field,
    mode: "needs_review" as const,
  })),
];

const LAST_UPDATED = "2026-10-04T09:00:00.000Z";

function renderForm(
  onSave = vi.fn().mockResolvedValue(undefined),
  lastUpdatedAt = LAST_UPDATED,
) {
  const props = {
    event: eventRecord(),
    editableFields: EDITABLE_FIELDS,
    lastUpdatedAt,
    onSave,
  };
  const view = render(<PlanningUpdateForm {...props} />);
  return { onSave, ...view, props };
}

afterEach(cleanup);

describe("PlanningUpdateForm", () => {
  // EVENT-UPDATE-01-A: the form opens with the event's current information.
  it("EVENT-UPDATE-01-A pre-fills the current event information", () => {
    renderForm();
    expect(screen.getByLabelText(/event name/i)).toHaveValue("Welcome Evening");
    expect(screen.getByLabelText(/^purpose/i)).toHaveValue(
      "Community building",
    );
    expect(screen.getByLabelText(/expected attendance/i)).toHaveValue(80);
  });

  // EVENT-UPDATE-02-A: direct and review-required fields are visibly different.
  it("EVENT-UPDATE-02-A badges which fields apply immediately and which need review", () => {
    renderForm();
    expect(screen.getAllByText("Applies immediately")).toHaveLength(4);
    expect(screen.getAllByText("Changes need review")).toHaveLength(6);
  });

  /**
   * After a flagged change is resolved, the field's rule badge stays (it describes
   * future edits), and the latest decision for that field is shown under it so a
   * confirmed change no longer reads as pending.
   */
  it("EVENT-FLAG-05-A shows the latest decision under each field after it is resolved", () => {
    const history = [
      {
        id: "h2",
        field: "layout",
        originalValue: "Banquet",
        proposedValue: "Theatre",
        resolvedValue: "Theatre",
        resolvedBy: "Coord Nine",
        resolvedAt: "2026-10-05T10:00:00.000Z",
        status: "Applied" as const,
      },
      {
        id: "h1",
        field: "layout",
        originalValue: "Theatre",
        proposedValue: "Banquet",
        resolvedValue: "Banquet",
        resolvedBy: "Coord One",
        resolvedAt: "2026-10-04T10:00:00.000Z",
        status: "Applied" as const,
      },
      {
        id: "h0",
        field: "equipmentNeeds",
        originalValue: "A",
        proposedValue: "B",
        resolvedValue: "A",
        resolvedBy: "Coord Nine",
        resolvedAt: "2026-10-03T01:00:00.000Z",
        status: "Rejected" as const,
      },
    ];
    render(
      <PlanningUpdateForm
        event={eventRecord()}
        editableFields={EDITABLE_FIELDS}
        lastUpdatedAt={LAST_UPDATED}
        history={history}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByTestId("last-change-layout")).toHaveTextContent(
      "Last change confirmed by Coord Nine on 5 Oct 2026, 6:00 pm.",
    );
    expect(screen.getByTestId("last-change-equipmentNeeds")).toHaveTextContent(
      "Last change rejected by Coord Nine on 3 Oct 2026, 9:00 am.",
    );
    expect(
      screen.queryByTestId("last-change-description"),
    ).not.toBeInTheDocument();
  });

  // SPM-156 EVENT-UPDATE-07-C: a change applied immediately is not described as confirmed.
  it("EVENT-UPDATE-07-C describes a direct update as changed, not confirmed", () => {
    const history = [
      {
        id: "d1",
        kind: "direct_update" as const,
        field: "description",
        originalValue: "A",
        proposedValue: "B",
        resolvedValue: "B",
        resolvedBy: "Coord Nine",
        resolvedAt: "2026-10-05T10:00:00.000Z",
        status: "Applied" as const,
      },
    ];
    render(
      <PlanningUpdateForm
        event={eventRecord()}
        editableFields={EDITABLE_FIELDS}
        lastUpdatedAt={LAST_UPDATED}
        history={history}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByTestId("last-change-description")).toHaveTextContent(
      "Last changed by Coord Nine on 5 Oct 2026, 6:00 pm.",
    );
    expect(screen.getByTestId("last-change-description")).not.toHaveTextContent(
      /confirmed/,
    );
  });

  // SPM-156 EVENT-UPDATE-07-E: a field last changed by an approved change request says so.
  it("EVENT-UPDATE-07-E describes a field changed by an approved change request", () => {
    const history = [
      {
        id: "c1",
        kind: "change_request" as const,
        field: "purpose",
        originalValue: "A",
        proposedValue: "B",
        resolvedValue: "B",
        proposedBy: "Demo Organiser",
        resolvedBy: "Coord Nine",
        resolvedAt: "2026-10-05T10:00:00.000Z",
        status: "Applied" as const,
      },
    ];
    render(
      <PlanningUpdateForm
        event={eventRecord()}
        editableFields={EDITABLE_FIELDS}
        lastUpdatedAt={LAST_UPDATED}
        history={history}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByTestId("last-change-purpose")).toHaveTextContent(
      "Last changed by Demo Organiser's change request, approved by Coord Nine on 5 Oct 2026, 6:00 pm.",
    );
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
    expect(screen.getByLabelText(/^purpose/i)).toHaveValue(
      "Community building",
    );
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
      .mockRejectedValue(
        new ApiError("Please correct the highlighted fields.", {
          purpose: "This field is required.",
        }),
      );
    renderForm(onSave);
    await user.type(screen.getByLabelText(/event name/i), " 2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(
      await screen.findByText("This field is required."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/event name/i)).toHaveValue(
      "Welcome Evening 2",
    );
  });

  // EVENT-UPDATE-06-A: the form shows when the information was last updated, and refreshes.
  it("EVENT-UPDATE-06-A shows when the event information was last updated", () => {
    const { rerender, props } = renderForm();
    expect(screen.getByText(/last updated/i)).toBeInTheDocument();
    expect(
      screen.getByText((content) =>
        content.includes(formatDateTime(LAST_UPDATED)),
      ),
    ).toBeInTheDocument();

    const newer = "2026-10-05T08:00:00.000Z";
    rerender(<PlanningUpdateForm {...props} lastUpdatedAt={newer} />);
    expect(
      screen.getByText((content) => content.includes(formatDateTime(newer))),
    ).toBeInTheDocument();
  });
});
// ---------------------------------------------------------------------------
// Gap coverage: validation, what is sent, saving feedback.
// ---------------------------------------------------------------------------

describe("PlanningUpdateForm: what is sent", () => {
  // EVENT-UPDATE-03-A: saving without touching anything is not a save.
  it("EVENT-UPDATE-03-A says there is nothing to save when nothing changed", async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("No changes to save.");
    expect(onSave).not.toHaveBeenCalled();
  });

  // EVENT-UPDATE-03-A: surrounding spaces are not a change, and they are trimmed when a field does change.
  it("EVENT-UPDATE-03-A trims text and ignores a change that is only spaces", async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();
    await user.type(screen.getByLabelText(/event name/i), "   ");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/^purpose/i));
    await user.type(
      screen.getByLabelText(/^purpose/i),
      "  Welcome new students  ",
    );
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith({ purpose: "Welcome new students" });
  });

  // EVENT-UPDATE-03-A: lists are sent in full when any option is toggled, and an emptied list is sent as empty.
  it("EVENT-UPDATE-03-A sends the whole facilities and accessibility lists when they change", async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();
    await user.click(screen.getByRole("checkbox", { name: "AV System" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Wheelchair access" }),
    );
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith({
      facilities: ["Catering", "AV System"],
      accessibility: [],
    });
  });

  // EVENT-UPDATE-03-A: several edits travel together in one save.
  it("EVENT-UPDATE-03-A sends several changed fields in one save", async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();
    await user.selectOptions(screen.getByLabelText(/room layout/i), "Theatre");
    await user.clear(screen.getByLabelText(/equipment requirements/i));
    await user.type(
      screen.getByLabelText(/equipment requirements/i),
      "Four microphones",
    );
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith({
      layout: "Theatre",
      equipmentNeeds: "Four microphones",
    });
  });

  // EVENT-UPDATE-03-A: a date change is sent as UTC instants the API accepts.
  it("EVENT-UPDATE-03-A sends changed dates as ISO UTC timestamps", async () => {
    const { onSave } = renderForm();
    fireEvent.change(screen.getByLabelText(/start date & time/i), {
      target: { value: "2026-11-12T09:00" },
    });
    fireEvent.change(screen.getByLabelText(/end date & time/i), {
      target: { value: "2026-11-12T12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith({
      startDateTime: new Date("2026-11-12T09:00").toISOString(),
      endDateTime: new Date("2026-11-12T12:00").toISOString(),
    });
  });
});

describe("PlanningUpdateForm: validation", () => {
  // EVENT-UPDATE-04-A: every required text field has its own message, and the form says what to do.
  it.each([
    [/event name/i, "Event name is required."],
    [/^purpose/i, "Purpose is required."],
    [/^description/i, "Description is required."],
  ])(
    "EVENT-UPDATE-04-A shows a message when %s is blank",
    async (label, message) => {
      const user = userEvent.setup();
      const { onSave } = renderForm();
      await user.clear(screen.getByLabelText(label));
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(
        screen.getByText("Please correct the highlighted fields."),
      ).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    },
  );

  // EVENT-UPDATE-04-A: attendance must be a whole number of at least 1.
  it.each([
    ["", "Expected attendance is required."],
    ["0", "Enter a positive whole number of attendees."],
    ["1.5", "Enter a positive whole number of attendees."],
    ["-3", "Enter a positive whole number of attendees."],
  ])("EVENT-UPDATE-04-A rejects attendance %j", (value, message) => {
    const { onSave } = renderForm();
    fireEvent.change(screen.getByLabelText(/expected attendance/i), {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  // EVENT-UPDATE-04-A: an end that is not after the start is refused before anything is sent.
  it("EVENT-UPDATE-04-A refuses an end that is not after the start", () => {
    const { onSave } = renderForm();
    fireEvent.change(screen.getByLabelText(/start date & time/i), {
      target: { value: "2026-11-12T10:00" },
    });
    fireEvent.change(screen.getByLabelText(/end date & time/i), {
      target: { value: "2026-11-12T10:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(screen.getByText("End must be after start.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  // EVENT-UPDATE-04-A: a cleared date is reported as required, not as an ordering problem.
  it("EVENT-UPDATE-04-A reports a cleared start date as required", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/start date & time/i), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(
      screen.getByText("Start date & time is required."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("End must be after start."),
    ).not.toBeInTheDocument();
  });

  // EVENT-UPDATE-04-A: after fixing the problem the next save goes through and the errors clear.
  it("EVENT-UPDATE-04-A clears the errors once the field is fixed", async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();
    await user.clear(screen.getByLabelText(/event name/i));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await user.type(screen.getByLabelText(/event name/i), "Orientation");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith({ name: "Orientation" });
    expect(
      screen.queryByText("Event name is required."),
    ).not.toBeInTheDocument();
  });
});

describe("PlanningUpdateForm: saving feedback", () => {
  // EVENT-UPDATE-05-A: a save that applied everything says so.
  it("EVENT-UPDATE-05-A confirms a save that applied immediately", async () => {
    const user = userEvent.setup();
    renderForm(vi.fn().mockResolvedValue({ applied: ["name"], flagged: [] }));
    await user.type(screen.getByLabelText(/event name/i), " 2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Changes saved.",
    );
  });

  /** SAFETY-RESET-UPDATE-04 (SPM-135 AC2): when the saved change reset the safety check, the confirmation says it must be requested again. */
  it("SAFETY-RESET-UPDATE-04 says the safety check was reset after a save that reset it", async () => {
    const user = userEvent.setup();
    renderForm(
      vi.fn().mockResolvedValue({
        applied: ["name"],
        flagged: [],
        safetyCheckReset: true,
      }),
    );
    await user.type(screen.getByLabelText(/event name/i), " 2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Changes saved. The safety check was reset, so it must be requested again before the event can be confirmed.",
    );
  });

  // EVENT-FLAG-01-A: a save that held some fields for review says how many and why.
  it("EVENT-FLAG-01-A tells the coordinator how many changes were sent for review", async () => {
    const user = userEvent.setup();
    renderForm(
      vi
        .fn()
        .mockResolvedValue({ applied: ["name"], flagged: [{ id: "chg-1" }] }),
    );
    await user.type(screen.getByLabelText(/event name/i), " 2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved. 1 change(s) applied; 1 sent for review because they affect existing bookings.",
    );
  });

  // EVENT-UPDATE-03-A: while saving the button is disabled, so a double click cannot send twice.
  it("EVENT-UPDATE-03-A disables the button while a save is in progress", async () => {
    const user = userEvent.setup();
    let finish: (value?: unknown) => void = () => {};
    const onSave = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    renderForm(onSave);
    await user.type(screen.getByLabelText(/event name/i), " 2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    finish();
    expect(
      await screen.findByRole("button", { name: /save changes/i }),
    ).toBeEnabled();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  // EVENT-UPDATE-04-A: the server's message is shown, and nothing the coordinator typed is lost.
  it("EVENT-UPDATE-04-A shows the server message for a refused save and keeps the typed values", async () => {
    const user = userEvent.setup();
    renderForm(
      vi
        .fn()
        .mockRejectedValue(
          new ApiError("A change to this field is already awaiting review.", {
            expectedAttendance: "A change is already awaiting review.",
          }),
        ),
    );
    await user.clear(screen.getByLabelText(/expected attendance/i));
    await user.type(screen.getByLabelText(/expected attendance/i), "120");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(
      await screen.findByText("A change is already awaiting review."),
    ).toBeInTheDocument();
    // The server's message also appears as the form-level alert.
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toContain(
      "A change to this field is already awaiting review.",
    );
    expect(screen.getByLabelText(/expected attendance/i)).toHaveValue(120);
  });

  // EVENT-UPDATE-04-A: an unexpected failure gets a generic, retryable message.
  it("EVENT-UPDATE-04-A shows a generic message for an unexpected failure and allows a retry", async () => {
    const user = userEvent.setup();
    renderForm(vi.fn().mockRejectedValue(new Error("boom")));
    await user.type(screen.getByLabelText(/event name/i), " 2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(
      await screen.findByText("Could not save changes. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
    expect(screen.getByLabelText(/event name/i)).toHaveValue(
      "Welcome Evening 2",
    );
  });
});

describe("PlanningUpdateForm: impact-based field labels (SPM-49 AC2/AC5)", () => {
  // A booking for 10:00–13:00 UTC in a 200-seat hall; equipment is reserved.
  const CONDITIONAL_FIELDS = [
    ...["name", "purpose", "description", "accessibility"].map((field) => ({
      field,
      mode: "direct" as const,
    })),
    ...(["startDateTime", "endDateTime"] as const).map((field) => ({
      field,
      mode: "conditional" as const,
      condition: {
        kind: "within_window" as const,
        start: "2026-11-10T10:00:00.000Z",
        end: "2026-11-10T13:00:00.000Z",
      },
    })),
    {
      field: "expectedAttendance",
      mode: "conditional" as const,
      condition: { kind: "max_attendance" as const, max: 200 },
    },
    { field: "layout", mode: "needs_review" as const },
    {
      field: "facilities",
      mode: "conditional" as const,
      condition: { kind: "remove_only" as const },
    },
    { field: "equipmentNeeds", mode: "needs_review" as const },
  ];
  const renderConditional = (onSave = vi.fn().mockResolvedValue(undefined)) =>
    render(
      <PlanningUpdateForm
        event={eventRecord()}
        editableFields={CONDITIONAL_FIELDS}
        lastUpdatedAt={LAST_UPDATED}
        onSave={onSave}
      />,
    );

  // EVENT-UPDATE-02-B: three labels distinguish always-direct, conditional and always-review fields.
  it("EVENT-UPDATE-02-B labels direct, conditional and review fields differently", () => {
    renderConditional();
    expect(screen.getAllByText("Applies immediately")).toHaveLength(4);
    expect(screen.getAllByText("Review if it affects bookings")).toHaveLength(
      4,
    );
    expect(screen.getAllByText("Changes need review")).toHaveLength(2);
  });

  // EVENT-UPDATE-02-B: each conditional field states its rule.
  it("EVENT-UPDATE-02-B explains when a conditional change applies immediately", () => {
    renderConditional();
    expect(
      screen.getByText(/applies immediately up to 200 attendees/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/removing facilities applies immediately/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/applies immediately while the event stays within/i),
    ).toHaveLength(2);
  });

  // EVENT-UPDATE-05-B: the form predicts the outcome of an attendance edit before saving.
  it.each([
    ["70", "This change will apply immediately."],
    ["200", "This change will apply immediately."],
    ["250", "This change will be sent for review."],
  ])(
    "EVENT-UPDATE-05-B predicts the outcome for attendance %s",
    (value, message) => {
      renderConditional();
      fireEvent.change(screen.getByLabelText(/expected attendance/i), {
        target: { value },
      });
      expect(screen.getByText(message)).toBeInTheDocument();
    },
  );

  // EVENT-UPDATE-05-B: removing a facility is predicted to apply; adding one is not.
  it("EVENT-UPDATE-05-B predicts facility removals apply and additions need review", async () => {
    const user = userEvent.setup();
    renderConditional();
    await user.click(screen.getByRole("checkbox", { name: "Catering" }));
    expect(
      screen.getByText("This change will apply immediately."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Stage" }));
    expect(
      screen.getByText("This change will be sent for review."),
    ).toBeInTheDocument();
  });

  // EVENT-UPDATE-05-B: nothing is predicted for an untouched field.
  it("EVENT-UPDATE-05-B shows no prediction until the field is edited", () => {
    renderConditional();
    expect(screen.queryByText(/this change will/i)).not.toBeInTheDocument();
  });
});

describe("PlanningUpdateForm: authoritative values and pending proposals (SPM-49 / SPM-85)", () => {
  const PENDING = {
    id: "chg-1",
    kind: "booking_conflict" as const,
    field: "expectedAttendance",
    currentValue: 80,
    proposedValue: 250,
    status: "Needs Review" as const,
  };

  // EVENT-FLAG-01-E: a field awaiting review shows the current value, the
  // proposal separately, and cannot be edited.
  it("EVENT-FLAG-01-E locks a field awaiting review and shows its proposal separately", () => {
    render(
      <PlanningUpdateForm
        event={eventRecord()}
        editableFields={EDITABLE_FIELDS}
        lastUpdatedAt={LAST_UPDATED}
        pendingChanges={[PENDING]}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/expected attendance/i)).toHaveValue(80);
    expect(screen.getByLabelText(/expected attendance/i)).toBeDisabled();
    expect(screen.getByTestId("pending-expectedAttendance")).toHaveTextContent(
      "proposed: 250",
    );
    // Other fields stay editable.
    expect(screen.getByLabelText(/room layout/i)).toBeEnabled();
  });

  // EVENT-FLAG-01-E: a locked checkbox field disables every option.
  it("EVENT-FLAG-01-E disables every facility option while facilities await review", () => {
    render(
      <PlanningUpdateForm
        event={eventRecord()}
        editableFields={EDITABLE_FIELDS}
        lastUpdatedAt={LAST_UPDATED}
        pendingChanges={[
          {
            ...PENDING,
            field: "facilities",
            proposedValue: ["Catering", "Stage"],
          },
        ]}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Catering" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Stage" })).toBeDisabled();
    // Accessibility is a separate field and stays editable.
    expect(
      screen.getByRole("checkbox", { name: "Hearing loop" }),
    ).toBeEnabled();
  });

  // EVENT-FLAG-01-E: after a flagged-only save, the field returns to the event the server returned.
  it("EVENT-FLAG-01-E resets to the server's event after a flagged-only save", async () => {
    const user = userEvent.setup();
    renderForm(
      vi
        .fn()
        .mockResolvedValue({
          event: eventRecord(),
          applied: [],
          flagged: [{ ...PENDING }],
        }),
    );
    await user.clear(screen.getByLabelText(/expected attendance/i));
    await user.type(screen.getByLabelText(/expected attendance/i), "250");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 change(s) sent for review because they affect existing bookings (Expected attendance). The current values stay in place until you confirm.",
    );
    expect(screen.getByLabelText(/expected attendance/i)).toHaveValue(80);
  });

  // EVENT-FLAG-01-E: without the server's event, flagged fields still revert and applied ones keep the saved value.
  it("EVENT-FLAG-01-E reverts only the flagged fields when the response has no event", async () => {
    const user = userEvent.setup();
    renderForm(
      vi
        .fn()
        .mockResolvedValue({ applied: ["name"], flagged: [{ ...PENDING }] }),
    );
    await user.type(screen.getByLabelText(/event name/i), " 2");
    await user.clear(screen.getByLabelText(/expected attendance/i));
    await user.type(screen.getByLabelText(/expected attendance/i), "250");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await screen.findByRole("status");
    expect(screen.getByLabelText(/expected attendance/i)).toHaveValue(80);
    expect(screen.getByLabelText(/event name/i)).toHaveValue(
      "Welcome Evening 2",
    );
  });

  // EVENT-VIEW-05-A: a newer event from the parent updates untouched fields
  // without losing an edit in progress.
  it("EVENT-VIEW-05-A takes newer values for untouched fields and keeps edits in progress", () => {
    const { rerender, props } = renderForm();
    fireEvent.change(screen.getByLabelText(/^purpose/i), {
      target: { value: "Typed purpose" },
    });
    rerender(
      <PlanningUpdateForm
        {...props}
        event={{
          ...eventRecord(),
          expectedAttendance: 150,
          purpose: "Server purpose",
        }}
      />,
    );
    expect(screen.getByLabelText(/expected attendance/i)).toHaveValue(150);
    expect(screen.getByLabelText(/^purpose/i)).toHaveValue("Typed purpose");
  });
});

describe("PlanningUpdateForm: unusual inputs and server replies (SPM-49)", () => {
  const WINDOW = {
    kind: "within_window" as const,
    start: "2026-11-10T10:00:00.000Z",
    end: "2026-11-10T13:00:00.000Z",
  };
  const DATE_FIELDS = (["startDateTime", "endDateTime"] as const).map(
    (field) => ({
      field,
      mode: "conditional" as const,
      condition: WINDOW,
    }),
  );

  /**
   * EVENT-UPDATE-01-E: an event whose stored date cannot be read opens with
   * that date input empty instead of showing an invalid value. This checks the
   * outcome the coordinator sees; browsers (and jsdom) also clear an invalid
   * datetime-local value, so it does not by itself prove the form's guard.
   */
  it("EVENT-UPDATE-01-E opens with an empty date input when the stored date is unreadable", () => {
    const event = { ...eventRecord(), startDateTime: "not-a-date" };
    render(
      <PlanningUpdateForm
        event={event}
        editableFields={EDITABLE_FIELDS}
        lastUpdatedAt={LAST_UPDATED}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/start date & time/i)).toHaveValue("");
    expect(screen.getByLabelText(/end date & time/i)).not.toHaveValue("");
  });

  it("EVENT-UPDATE-01-E toLocalInput returns an empty string for an unreadable date", () => {
    expect(toLocalInput("not-a-date")).toBe("");
    expect(toLocalInput("")).toBe("");
  });

  /**
   * EVENT-UPDATE-02-C: a field the server sent no edit policy for shows no
   * badge, rather than a wrong one.
   */
  it("EVENT-UPDATE-02-C shows no badge for a field without an edit policy", () => {
    render(
      <PlanningUpdateForm
        event={eventRecord()}
        editableFields={[{ field: "name", mode: "direct" }]}
        lastUpdatedAt={LAST_UPDATED}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Applies immediately")).toHaveLength(1);
    expect(screen.queryByText("Changes need review")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Review if it affects bookings"),
    ).not.toBeInTheDocument();
  });

  /**
   * EVENT-UPDATE-05-C: clearing a date that must stay inside the booked
   * window is predicted to need review, because an empty time cannot be shown
   * to fit the booking.
   */
  it("EVENT-UPDATE-05-C predicts review when a booked date is cleared", () => {
    render(
      <PlanningUpdateForm
        event={eventRecord()}
        editableFields={DATE_FIELDS}
        lastUpdatedAt={LAST_UPDATED}
        onSave={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/start date & time/i), {
      target: { value: "" },
    });
    expect(
      screen.getAllByText("This change will be sent for review.").length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("This change will apply immediately."),
    ).not.toBeInTheDocument();
  });

  /**
   * EVENT-UPDATE-04-H: server errors for the facilities and accessibility
   * lists are shown under those lists, and the coordinator's other edits stay.
   */
  it("EVENT-UPDATE-04-H shows server errors for the facility and accessibility lists", async () => {
    const user = userEvent.setup();
    renderForm(
      vi.fn().mockRejectedValue(
        new ApiError("Please correct the highlighted fields.", {
          facilities: "Choose valid facilities.",
          accessibility: "Choose valid accessibility needs.",
        }),
      ),
    );
    await user.type(screen.getByLabelText(/event name/i), " 2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await screen.findByText("Choose valid facilities.");
    // Each error is the first note in the block directly after its own list, not under the other one.
    const errorAfter = (groupName: string) =>
      screen.getByRole("group", { name: groupName }).nextElementSibling
        ?.firstElementChild;
    expect(errorAfter("Required facilities")).toHaveTextContent(
      "Choose valid facilities.",
    );
    expect(errorAfter("Required facilities")).toHaveAttribute("role", "alert");
    expect(errorAfter("Accessibility needs")).toHaveTextContent(
      "Choose valid accessibility needs.",
    );
    expect(errorAfter("Accessibility needs")).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText(/event name/i)).toHaveValue(
      "Welcome Evening 2",
    );
  });

  /**
   * EVENT-UPDATE-04-H: a refusal with a message but no field errors shows the
   * message, marks no field, and keeps what was typed.
   */
  it("EVENT-UPDATE-04-H shows a refusal that has no field errors without marking any field", async () => {
    const user = userEvent.setup();
    renderForm(
      vi
        .fn()
        .mockRejectedValue(
          new ApiError("Event information can only be changed after approval."),
        ),
    );
    await user.type(screen.getByLabelText(/event name/i), " 2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    const alerts = (await screen.findAllByRole("alert")).map(
      (a) => a.textContent,
    );
    expect(alerts).toEqual([
      "Event information can only be changed after approval.",
    ]);
    expect(screen.getByLabelText(/event name/i)).toHaveValue(
      "Welcome Evening 2",
    );
    expect(screen.getByLabelText(/event name/i)).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});

describe("PlanningUpdateForm: options from the venue schema (SPM-156 follow-up)", () => {
  afterEach(resetVenueOptions);

  const withStored = (accessibility: string[], facilities: string[]) => ({
    ...eventRecord(),
    venueRequirements: {
      ...eventRecord().venueRequirements,
      accessibility,
      facilities,
    },
  });

  /** EVENT-UPDATE-08-B: every current layout, facility and accessibility need is offered, and nothing retired. */
  it("EVENT-UPDATE-08-B offers every current venue-schema option and no retired one", () => {
    renderForm();
    const layout = screen.getByLabelText(/room layout/i);
    for (const option of ROOM_LAYOUT_OPTIONS)
      expect(
        within(layout).getByRole("option", { name: option }),
      ).toBeInTheDocument();
    const facilities = screen.getByRole("group", {
      name: "Required facilities",
    });
    for (const option of FACILITY_OPTIONS)
      expect(
        within(facilities).getByRole("checkbox", { name: option }),
      ).toBeInTheDocument();
    const accessibility = screen.getByRole("group", {
      name: "Accessibility needs",
    });
    for (const option of ACCESSIBILITY_OPTIONS)
      expect(
        within(accessibility).getByRole("checkbox", { name: option }),
      ).toBeInTheDocument();
    expect(screen.queryByText("Wheelchair ramps")).not.toBeInTheDocument();
  });

  /**
   * EVENT-UPDATE-08-C: a stored value the schema no longer has is not shown; it is not sent while
   * its list is untouched, and is dropped from the list sent once the coordinator edits it.
   */
  it("EVENT-UPDATE-08-C hides a retired stored value and drops it only when the list is edited", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <PlanningUpdateForm
        event={withStored(
          ["Wheelchair ramps", "Hearing loop"],
          ["PA System", "Catering"],
        )}
        editableFields={EDITABLE_FIELDS}
        lastUpdatedAt={LAST_UPDATED}
        onSave={onSave}
      />,
    );
    expect(screen.queryByText("Wheelchair ramps")).not.toBeInTheDocument();
    expect(screen.queryByText("PA System")).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Hearing loop" }),
    ).toBeChecked();

    await user.type(screen.getByLabelText(/event name/i), " 2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenLastCalledWith({ name: "Welcome Evening 2" });

    await user.click(
      screen.getByRole("checkbox", { name: "Wheelchair access" }),
    );
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accessibility: ["Hearing loop", "Wheelchair access"],
      }),
    );
  });

  /** EVENT-UPDATE-08-D: while the options load, or after they fail, the lists cannot be changed; Try again reloads them. */
  it("EVENT-UPDATE-08-D disables the lists while options load or after a failure, with a retry", async () => {
    const user = userEvent.setup();
    venueOptionsState.current = {
      status: "loading",
      facilities: [],
      accessibility: [],
      error: "",
    };
    const view = renderForm();
    expect(screen.getAllByText("Loading options…")).toHaveLength(2);
    expect(
      screen.getByRole("group", { name: "Required facilities" }),
    ).toBeDisabled();
    view.unmount();

    const retry = vi.fn();
    venueOptionsState.current = {
      status: "error",
      facilities: [],
      accessibility: [],
      error: "Network down",
    };
    venueOptionsState.retry = retry;
    renderForm();
    expect(
      screen.getByRole("group", { name: "Accessibility needs" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        /Could not load the accessibility needs options\. Network down/,
      ),
    ).toHaveAttribute("role", "alert");
    await user.click(screen.getAllByRole("button", { name: "Try again" })[0]);
    expect(retry).toHaveBeenCalled();
  });

  /** EVENT-UPDATE-08-E: a field's error and its "Last changed" note are stacked in one block, so they never overlap. */
  it("EVENT-UPDATE-08-E stacks a list error and the last-change note under the field", async () => {
    const user = userEvent.setup();
    const history = [
      {
        id: "d1",
        kind: "direct_update" as const,
        field: "accessibility",
        originalValue: [],
        proposedValue: ["Hearing loop"],
        resolvedValue: ["Hearing loop"],
        resolvedBy: "Coordinator 1",
        resolvedAt: "2026-10-29T08:39:00.000Z",
        status: "Applied" as const,
      },
    ];
    render(
      <PlanningUpdateForm
        event={eventRecord()}
        editableFields={EDITABLE_FIELDS}
        lastUpdatedAt={LAST_UPDATED}
        history={history}
        onSave={vi
          .fn()
          .mockRejectedValue(
            new ApiError("Please correct the highlighted fields.", {
              accessibility: "Choose valid options.",
            }),
          )}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Hearing loop" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    const error = await screen.findByText("Choose valid options.");
    const note = screen.getByTestId("last-change-accessibility");
    expect(error.parentElement).toBe(note.parentElement);
    expect(error.nextElementSibling).toBe(note);
    expect(error.className).not.toMatch(/-mt-/);
    expect(note.className).not.toMatch(/-mt-/);
  });
});
