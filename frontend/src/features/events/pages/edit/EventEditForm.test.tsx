import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventRecord } from "@/types";
import { EventEditForm } from "./EventEditForm";

// Facility and accessibility choices: the current backend venue-schema lists (src/test/venueOptions.ts).
vi.mock("@/features/venues/api/venue-options-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import("@/test/venueOptions")).venueOptionsModuleMock(),
}));

const event: EventRecord = {
  id: "event-1",
  name: "Welcome Evening",
  purpose: "Community building",
  description: "A welcome event.",
  organiserId: "organiser-1",
  organiserName: "Test Organiser",
  status: "submitted",
  startDateTime: "2030-01-10T18:00:00.000Z",
  endDateTime: "2030-01-10T21:00:00.000Z",
  expectedAttendance: 80,
  venueRequirements: {
    minCapacity: 80,
    layout: "Classroom",
    facilities: ["AV System"],
    accessibility: ["Wheelchair access"],
  },
  attachments: [],
  equipmentNeeds: "Two microphones",
  registrationEnabled: false,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EventEditForm", () => {
  // Editing must preserve the shared upload shape when a supporting file is added.
  it("adds a file through the shared reader and includes it when saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<EventEditForm event={event} onSave={onSave} onCancel={vi.fn()} />);

    await user.upload(
      screen.getByLabelText("Supporting files"),
      new File(["agenda"], "agenda.txt", { type: "text/plain" }),
    );
    expect(await screen.findByText("agenda.txt")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            name: "agenda.txt",
            type: "text/plain",
            size: 6,
            dataUrl: expect.stringMatching(/^data:text\/plain/),
          }),
        ],
      }),
    );
  });

  // The shared reader rejection must be translated into a visible, retryable form error.
  it("shows a field-level upload failure when the browser cannot read a selected file", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(
      function (this: FileReader) {
        Object.defineProperty(this, "error", {
          configurable: true,
          value: new DOMException("Read failed", "NotReadableError"),
        });
        this.dispatchEvent(new ProgressEvent("error"));
      },
    );
    render(<EventEditForm event={event} onSave={onSave} onCancel={vi.fn()} />);

    await user.upload(
      screen.getByLabelText("Supporting files"),
      new File(["agenda"], "agenda.txt", { type: "text/plain" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to read the selected file. Please try again.",
    );
    expect(screen.queryByText("agenda.txt")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  /** The read-only Venue field shows the venue text the server sent, unchanged. */
  it("shows the server venue text in the read-only Venue field", () => {
    render(
      <EventEditForm
        event={{ ...event, venueName: "Main Hall (unavailable)" }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const venue = screen.getByLabelText("Venue");
    expect(venue).toHaveValue("Main Hall (unavailable)");
    expect(venue).toHaveAttribute("readonly");
  });

  /** With no booking the read-only Venue field shows the "Not yet booked" fallback. */
  it("shows Not yet booked in the Venue field when the event has no venue", () => {
    render(
      <EventEditForm
        event={{ ...event, venueName: undefined }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Venue")).toHaveValue("Not yet booked");
  });

  // The module-level option extraction must keep the editor's controlled selections available.
  it("offers supported shared facility and room layout choices", () => {
    render(<EventEditForm event={event} onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText("Projector")).toBeTruthy();
    expect(screen.getByLabelText("Wired network")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Theatre" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Hollow square" })).toBeTruthy();
  });

  /** Every editable field's new value is sent to the save handler, with dates as ISO timestamps. */
  it("saves every edited field with its new value", () => {
    const onSave = vi.fn();
    render(<EventEditForm event={event} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/event name/i), {
      target: { value: "Spring Gala" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Dinner and awards." },
    });
    fireEvent.change(screen.getByLabelText(/start date/i), {
      target: { value: "2030-02-01T09:30" },
    });
    fireEvent.change(screen.getByLabelText(/end date/i), {
      target: { value: "2030-02-01T12:00" },
    });
    fireEvent.change(screen.getByLabelText("Expected attendance"), {
      target: { value: "120" },
    });
    fireEvent.change(screen.getByLabelText("Room layout"), {
      target: { value: "Theatre" },
    });
    fireEvent.change(screen.getByLabelText("Equipment needs"), {
      target: { value: "Projector" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Spring Gala",
        description: "Dinner and awards.",
        startDateTime: new Date("2030-02-01T09:30").toISOString(),
        endDateTime: new Date("2030-02-01T12:00").toISOString(),
        expectedAttendance: 120,
        equipmentNeeds: "Projector",
        venueRequirements: expect.objectContaining({
          layout: "Theatre",
          minCapacity: 80,
        }),
      }),
    );
  });

  /** Clearing the end date saves an empty end date rather than an invalid timestamp. */
  it("saves a cleared end date as an empty value", () => {
    const onSave = vi.fn();
    render(<EventEditForm event={event} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/end date/i), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ endDateTime: "" }),
    );
  });

  /**
   * A stored start date that is missing shows an empty start field, and the form cannot be saved until a start date
   * is entered (the start date is required).
   */
  it("shows an empty start date when the stored start date is missing", () => {
    render(
      <EventEditForm
        event={{ ...event, startDateTime: "" }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/start date/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  /**
   * A stored start date that cannot be parsed shows an empty start field, and the form cannot be saved with it (the
   * start date is required). The disabled Save button is the observable result; the empty field alone would also look
   * the same if the date were passed through, because a date input shows an invalid value as empty.
   */
  it("shows an empty start date when the stored start date cannot be parsed", () => {
    render(
      <EventEditForm
        event={{ ...event, startDateTime: "not-a-date" }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/start date/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  /** An event with no stored optional details opens with blank fields and saves blank details. */
  it("opens with blank optional fields and saves them as empty values", () => {
    const onSave = vi.fn();
    const sparse = {
      ...event,
      description: undefined,
      equipmentNeeds: undefined,
      attachments: undefined,
      venueRequirements: undefined,
      expectedAttendance: 0,
    } as unknown as EventRecord;
    render(<EventEditForm event={sparse} onSave={onSave} onCancel={vi.fn()} />);

    expect(screen.getByLabelText("Description")).toHaveValue("");
    expect(screen.getByLabelText("Expected attendance")).toHaveValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      name: sparse.name,
      description: "",
      venueRequirements: {
        minCapacity: 0,
        facilities: [],
        accessibility: [],
        layout: "",
      },
      startDateTime: sparse.startDateTime,
      endDateTime: sparse.endDateTime,
      expectedAttendance: 0,
      equipmentNeeds: "",
      attachments: [],
    });
  });

  /** Saving is blocked and the field stays empty when the event name is blank. */
  it("leaves the name field empty and blocks saving when the event has no name", () => {
    render(
      <EventEditForm
        event={{ ...event, name: "" }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/event name/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  /** A file dialog closed without a choice leaves the attachments unchanged and shows no error. */
  it("ignores a file selection that contains no files", () => {
    const onSave = vi.fn();
    render(<EventEditForm event={event} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Supporting files"), {
      target: { files: [] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [] }),
    );
  });

  /** A sixth supporting file is refused with the five-file message and is not saved. */
  it("refuses a file that would make more than five supporting files", async () => {
    const onSave = vi.fn();
    const fullEvent = {
      ...event,
      attachments: [1, 2, 3, 4, 5].map((n) => ({
        id: `attachment-${n}`,
        name: `brief-${n}.txt`,
        type: "text/plain",
        size: 1,
        dataUrl: "data:text/plain;base64,YQ==",
      })),
    };
    const user = userEvent.setup();
    render(
      <EventEditForm event={fullEvent} onSave={onSave} onCancel={vi.fn()} />,
    );

    await user.upload(
      screen.getByLabelText("Supporting files"),
      new File(["extra"], "extra.txt", { type: "text/plain" }),
    );

    expect(await screen.findByText("Use up to five files.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0][0].attachments).toHaveLength(5);
    expect(
      onSave.mock.calls[0][0].attachments.map((a: { name: string }) => a.name),
    ).not.toContain("extra.txt");
  });

  /** A selection that takes the supporting files past 50 MB in total is refused and not saved. */
  it("refuses a selection that takes the supporting files past 50 MB in total", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    const oversized = new File(["big"], "large.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(oversized, "size", { value: 50 * 1024 * 1024 + 1 });
    render(<EventEditForm event={event} onSave={onSave} onCancel={vi.fn()} />);

    await user.upload(screen.getByLabelText("Supporting files"), oversized);

    expect(
      await screen.findByText("Use up to five files, 50 MB total."),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [] }),
    );
  });

  /** A new file is added after the attachments the event already has, and both are saved. */
  it("keeps the existing supporting files and adds a new one after them", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    const withBrief = {
      ...event,
      attachments: [
        {
          id: "attachment-1",
          name: "brief.pdf",
          type: "application/pdf",
          size: 1024,
          dataUrl: "data:application/pdf;base64,AA==",
        },
      ],
    };
    render(
      <EventEditForm event={withBrief} onSave={onSave} onCancel={vi.fn()} />,
    );

    await user.upload(
      screen.getByLabelText("Supporting files"),
      new File(["agenda"], "agenda.txt", { type: "text/plain" }),
    );
    expect(await screen.findByText("agenda.txt")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save" }));

    const saved = onSave.mock.calls[0][0].attachments;
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ id: "attachment-1", name: "brief.pdf" });
    expect(saved[1]).toMatchObject({ name: "agenda.txt" });
  });

  /** Remove takes a supporting file off the list, so it is not sent when the event is saved. */
  it("removes a supporting file when its Remove button is pressed", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    const withBrief = {
      ...event,
      attachments: [
        {
          id: "attachment-1",
          name: "brief.pdf",
          type: "application/pdf",
          size: 1024,
          dataUrl: "data:application/pdf;base64,AA==",
        },
      ],
    };
    render(
      <EventEditForm event={withBrief} onSave={onSave} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.queryByText("brief.pdf")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [] }),
    );
  });

  /** While a save is in progress the Save button reads Saving... and cannot be pressed again. */
  it("shows Saving... and disables the Save button while a save is in progress", () => {
    render(
      <EventEditForm
        event={event}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        isLoading
      />,
    );

    const saving = screen.getByRole("button", { name: "Saving..." });
    expect(saving).toHaveProperty("disabled", true);
  });
});

describe("EventEditForm: options from the venue schema (SPM-156 follow-up)", () => {
  /** EVENT-UPDATE-08-C (edit form): a retired stored value is not shown and is not saved. */
  it("EVENT-UPDATE-08-C hides retired values and saves only current ones", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EventEditForm
        event={{
          ...event,
          venueRequirements: {
            ...event.venueRequirements,
            facilities: ["PA System", "AV System"],
            accessibility: ["Wheelchair ramps"],
          },
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText("Wheelchair ramps")).not.toBeInTheDocument();
    expect(screen.queryByText("PA System")).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Wheelchair access" }),
    ).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        venueRequirements: expect.objectContaining({
          facilities: ["AV System"],
          accessibility: [],
        }),
      }),
    );
  });
});
