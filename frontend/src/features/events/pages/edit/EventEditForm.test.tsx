import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventRecord } from "@/types";
import { EventEditForm } from "./EventEditForm";

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
    accessibility: ["Wheelchair ramps"],
  },
  attachments: [],
  equipmentNeeds: "Two microphones",
  registrationEnabled: false,
  changeRequests: [],
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
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (
      this: FileReader,
    ) {
      Object.defineProperty(this, "error", {
        configurable: true,
        value: new DOMException("Read failed", "NotReadableError"),
      });
      this.dispatchEvent(new ProgressEvent("error"));
    });
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
    render(<EventEditForm event={{ ...event, venueName: undefined }} onSave={vi.fn()} onCancel={vi.fn()} />);

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
});
