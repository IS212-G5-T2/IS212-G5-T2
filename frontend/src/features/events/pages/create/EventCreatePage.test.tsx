import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventCreatePage } from "@/features/events/pages/create/EventCreatePage";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import { MyRequestsPage } from "../drafts/MyRequestsPage";
import { api, ApiError } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import type { EventRecord } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

// Fixed base date (local) so fixtures never depend on the wall clock.
function inputDate(daysFromNow: number) {
  const date = new Date(2031, 2, 10 + daysFromNow);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function eventRecord(): EventRecord {
  const start = new Date(2031, 2, 17, 18, 0, 0, 0);
  const end = new Date(start);
  end.setHours(21, 0, 0, 0);
  return {
    id: "00000000-0000-4000-8000-000000000036",
    name: "Welcome Evening",
    purpose: "Community building",
    description: "A welcome event for new members.",
    organiserId: "current-user",
    organiserName: "Demo Organiser",
    status: "submitted",
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    expectedAttendance: 80,
    venueRequirements: {
      minCapacity: 80,
      layout: "Banquet",
      facilities: ["Catering"],
      accessibility: ["Wheelchair ramps"],
    },
    attachments: [],
    equipmentNeeds: "Two microphones",
    registrationEnabled: false,
    createdAt: "2031-03-01T00:00:00.000Z",
    updatedAt: "2031-03-01T00:00:00.000Z",
  };
}

function renderCreate(initialEntry = "/events/create") {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/events/create" element={<EventCreatePage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/requests" element={<MyRequestsPage />} />
          <Route path="/requests/:id" element={<EventCreatePage />} />
        </Routes>
      </MemoryRouter>,
  );
}

async function enterBasicInformation(
  user: ReturnType<typeof userEvent.setup>,
  name = "Welcome Evening",
) {
  await user.type(screen.getByRole("textbox", { name: /event name/i }), name);
  await user.type(screen.getByRole("textbox", { name: /purpose/i }), "Community building");
  await user.type(
    screen.getByRole("textbox", { name: /description/i }),
    "A welcome event for new members.",
  );
  await user.click(screen.getByRole("button", { name: /continue/i }));
}

async function enterSchedule(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByLabelText(/start date/i), {
    target: { value: inputDate(7) },
  });
  fireEvent.change(screen.getByLabelText(/start time/i), {
    target: { value: "18:00" },
  });
  fireEvent.change(screen.getByLabelText(/end date/i), {
    target: { value: inputDate(7) },
  });
  fireEvent.change(screen.getByLabelText(/end time/i), {
    target: { value: "21:00" },
  });
  await user.type(screen.getByLabelText(/expected attendance/i), "80");
  await user.selectOptions(screen.getByLabelText(/preferred room layout/i), "Banquet");
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  // Freeze only Date, so the date fixtures and "must be in the future" checks do not depend on
  // when the suite runs. Timers stay real, so user-event keeps working.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T10:00:00+08:00"));
  vi.clearAllMocks();
  useAppStore.setState({ events: [] });
});

describe("EventCreatePage", () => {
  // SPM-36 Test Case EVE-CRE-02-A
  it("EVE-CRE-02-A exposes every Event Request field with an accessible label", async () => {
    const user = userEvent.setup();
    renderCreate();

    expect(screen.getByRole("textbox", { name: /event name/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /purpose/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /description/i })).toBeTruthy();

    await enterBasicInformation(user);

    for (const label of [
      /start date/i,
      /start time/i,
      /end date/i,
      /end time/i,
      /expected attendance/i,
      /preferred room layout/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByRole("group", { name: /accessibility needs/i })).toBeTruthy();
    expect(screen.getByRole("group", { name: /required facilities/i })).toBeTruthy();
  });

  // SPM-36 Test Cases EVE-CRE-04-A and EVE-CRE-05-A
  it("EVE-CRE-04-A EVE-CRE-05-A blocks blank basic fields with field errors and retains valid input", async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.type(screen.getByRole("textbox", { name: /event name/i }), "   ");
    await user.type(screen.getByRole("textbox", { name: /purpose/i }), "Community building");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByText("Enter an event name.")).toBeTruthy();
    expect(screen.getByText("Enter a description of your event.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /purpose/i })).toHaveProperty(
      "value",
      "Community building",
    );
    expect(screen.getByRole("heading", { name: /create new event request/i })).toBeTruthy();
    expect(apiMock).not.toHaveBeenCalled();
  });

  /**
   * EVE-CRE-05-F: a blank description on its own blocks Continue with the
   * description error, keeps the wizard on Basic Information, and keeps the
   * name the user already entered.
   */
  it("EVE-CRE-05-F blocks a blank description on its own and stays on step 0", async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.type(screen.getByRole("textbox", { name: /event name/i }), "Welcome Evening");
    await user.type(screen.getByRole("textbox", { name: /purpose/i }), "Community building");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByText("Enter a description of your event.")).toBeTruthy();
    expect(screen.queryByText("Enter an event name.")).toBeNull();
    const progress = screen.getByRole("list", { name: /request progress/i });
    expect(progress.querySelector('[aria-current="step"]')?.textContent).toContain(
      "Basic Information",
    );
    expect(screen.queryByLabelText(/start date/i)).toBeNull();
    expect(screen.getByRole("textbox", { name: /event name/i })).toHaveProperty(
      "value",
      "Welcome Evening",
    );
    expect(apiMock).not.toHaveBeenCalled();
  });

  // SPM-36 Test Cases EVE-CRE-04-B, EVE-CRE-04-C, and EVE-CRE-04-D
  it("blocks missing schedule, attendance, and preferred room layout with field-specific errors", async () => {
    const user = userEvent.setup();
    renderCreate();
    await enterBasicInformation(user);

    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getAllByText("This field is required.")).toHaveLength(4);
    expect(screen.getByText("Enter a positive whole number of attendees.")).toBeTruthy();
    expect(screen.getByText("Choose a preferred room layout.")).toBeTruthy();
    expect(screen.getByLabelText(/start date/i)).toBeTruthy();
    expect(apiMock).not.toHaveBeenCalled();
  });

  // SPM-36 Test Cases EVE-CRE-05-B, EVE-CRE-05-C, and EVE-CRE-05-D
  it.each([
    ["EVE-CRE-05-B", "attendance", "1.5", "21:00", /positive whole number/i],
    ["EVE-CRE-05-C", "past start", "80", "21:00", /must be in the future/i],
    ["EVE-CRE-05-D", "end before start", "80", "17:00", /end must be after start/i],
  ])("%s rejects %s and keeps the schedule step open", async (_id, kind, attendance, endTime, error) => {
    const user = userEvent.setup();
    renderCreate();
    await enterBasicInformation(user);

    fireEvent.change(screen.getByLabelText(/start date/i), {
      target: { value: kind === "past start" ? "2020-03-09" : inputDate(7) },
    });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "18:00" } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: inputDate(7) } });
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: endTime } });
    await user.type(screen.getByLabelText(/expected attendance/i), attendance);
    await user.selectOptions(screen.getByLabelText(/preferred room layout/i), "Banquet");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByText(error)).toBeTruthy();
    expect(screen.getByLabelText(/expected attendance/i)).toHaveProperty("value", attendance);
    expect(apiMock).not.toHaveBeenCalled();
  });

  // SPM-36 Test Cases EVE-CRE-03-A and EVE-CRE-07-A
  it("submits a valid request and shows the submission confirmation", async () => {
    const user = userEvent.setup();
    const saved = eventRecord();
    apiMock.mockImplementation(async (_path, init) => {
      if (init?.method === "POST") return { event: saved, message: "Submitted" };
      if (_path === `/events/${saved.id}`) return saved;
      throw new Error(`Unexpected API call: ${String(_path)}`);
    });
    renderCreate();
    await enterBasicInformation(user);
    await enterSchedule(user);
    await user.click(screen.getByLabelText("Catering"));
    await user.click(screen.getByLabelText("Wheelchair ramps"));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.type(screen.getByRole("textbox", { name: /equipment needs/i }), "Two microphones");

    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    await screen.findByText("Your event request was submitted successfully.");
    const submittedBody = JSON.parse(
      apiMock.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body as string,
    );
    expect(submittedBody).toMatchObject({
      name: saved.name,
      purpose: saved.purpose,
      description: saved.description,
      expectedAttendance: 80,
      layout: "Banquet",
      facilities: ["Catering"],
      accessibility: ["Wheelchair ramps"],
      attachments: [],
    });
    expect(submittedBody).not.toHaveProperty("status");
    expect(submittedBody).not.toHaveProperty("organiserId");
  });

  // SPM-36 Test Case EVE-CRE-08-A
  it("keeps registration enabled and appends optional supporting files", async () => {
    const user = userEvent.setup();
    const saved = {
      ...eventRecord(),
      attachments: [
        {
          id: "attachment-1",
          name: "proposal.txt",
          type: "text/plain",
          size: 12,
          dataUrl: "data:text/plain;base64,cHJvcG9zYWw=",
        },
      ],
    };
    apiMock.mockImplementation(async (_path, init) => {
      if (init?.method === "POST") return { event: saved, message: "Submitted" };
      if (_path === `/events/${saved.id}`) return saved;
      throw new Error(`Unexpected API call: ${String(_path)}`);
    });
    renderCreate();
    // Preserve the organiser's registration choice in the submitted request.
    await user.click(screen.getByLabelText("Register through website"));
    await enterBasicInformation(user);
    await enterSchedule(user);

    // Upload files in separate selections to exercise accumulated-size handling.
    await user.upload(
      screen.getByLabelText(/supporting files/i),
      new File(["proposal"], "proposal.txt", { type: "text/plain" }),
    );
    expect(await screen.findByText("proposal.txt")).toBeTruthy();
    await user.upload(
      screen.getByLabelText(/supporting files/i),
      new File(["agenda"], "agenda.txt", { type: "text/plain" }),
    );
    expect(await screen.findByText("agenda.txt")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText("proposal.txt, agenda.txt")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    await screen.findByText("Your event request was submitted successfully.");
    const submittedBody = JSON.parse(
      apiMock.mock.calls.find(([, init]) => init?.method === "POST")![1]!
        .body as string,
    );
    expect(submittedBody.attachments[0]).toMatchObject({
      name: "proposal.txt",
      type: "text/plain",
      size: 8,
    });
    expect(submittedBody.attachments[0].dataUrl).toMatch(/^data:text\/plain/);
    expect(submittedBody.attachments[1]).toMatchObject({
      name: "agenda.txt",
      type: "text/plain",
      size: 6,
    });
    expect(submittedBody.registrationEnabled).toBe(true);
  });

  // SPM-36 Test Case EVE-CRE-05-F: a blank description on its own keeps the wizard on step 0.
  it("EVE-CRE-05-F blocks a blank description on its own and stays on the Basic Information step", async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.type(screen.getByRole("textbox", { name: /event name/i }), "Welcome Evening");
    await user.type(screen.getByRole("textbox", { name: /purpose/i }), "Community building");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByText("Enter a description of your event.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /create new event request/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /event name/i })).toHaveProperty(
      "value",
      "Welcome Evening",
    );
    expect(screen.queryByLabelText(/start date/i)).toBeNull();
    expect(apiMock).not.toHaveBeenCalled();
  });

  // SPM-37 Test Case EVE-DRF-10-A: at most five supporting files per request.
  it("EVE-DRF-10-A keeps five supporting files and rejects a sixth", async () => {
    const user = userEvent.setup();
    renderCreate();
    await enterBasicInformation(user);

    const files = Array.from(
      { length: 6 },
      (_, index) =>
        new File([`note ${index + 1}`], `note-${index + 1}.txt`, { type: "text/plain" }),
    );
    await user.upload(screen.getByLabelText(/supporting files/i), files.slice(0, 5));
    expect(await screen.findByText("note-5.txt")).toBeTruthy();

    await user.upload(screen.getByLabelText(/supporting files/i), files[5]);
    expect(await screen.findByText("Use up to five files.")).toBeTruthy();
    expect(screen.queryByText("note-6.txt")).toBeNull();
    expect(screen.getByText("note-1.txt")).toBeTruthy();
  });

  // SPM-37 Test Case EVE-DRF-10-A: the combined size of all supporting files is capped at 50 MB.
  it("EVE-DRF-10-A rejects a file that takes the combined size past 50 MB", async () => {
    const user = userEvent.setup();
    renderCreate();
    await enterBasicInformation(user);

    const sized = (name: string, megabytes: number) => {
      const file = new File(["x"], name, { type: "application/octet-stream" });
      Object.defineProperty(file, "size", { value: megabytes * 1024 * 1024 });
      return file;
    };
    await user.upload(screen.getByLabelText(/supporting files/i), sized("large-30.bin", 30));
    expect(await screen.findByText("large-30.bin")).toBeTruthy();

    await user.upload(screen.getByLabelText(/supporting files/i), sized("large-21.bin", 21));
    expect(await screen.findByText("Use up to five files, 50 MB total.")).toBeTruthy();
    expect(screen.queryByText("large-21.bin")).toBeNull();
    expect(screen.getByText("large-30.bin")).toBeTruthy();
    expect(apiMock).not.toHaveBeenCalled();
  });

  // SPM-37 Test Case EVE-DRF-10-A: exactly 50 MB combined is accepted.
  it("EVE-DRF-10-A accepts files that total exactly 50 MB", async () => {
    const user = userEvent.setup();
    renderCreate();
    await enterBasicInformation(user);

    const sized = (name: string) => {
      const file = new File(["x"], name, { type: "application/octet-stream" });
      Object.defineProperty(file, "size", { value: 25 * 1024 * 1024 });
      return file;
    };
    await user.upload(screen.getByLabelText(/supporting files/i), [
      sized("half-a.bin"),
      sized("half-b.bin"),
    ]);
    expect(await screen.findByText("half-a.bin")).toBeTruthy();
    expect(screen.getByText("half-b.bin")).toBeTruthy();
    expect(screen.queryByText("Use up to five files, 50 MB total.")).toBeNull();
  });

  // SPM-36 AC9: a selected file the browser cannot read is reported on the attachment step.
  it("SPM-36 AC9 shows an error when a selected file cannot be read", async () => {
    const user = userEvent.setup();
    renderCreate();
    await enterBasicInformation(user);

    // Injected read fault: FileReader fires its error event, as a failed disk read would.
    const readSpy = vi
      .spyOn(FileReader.prototype, "readAsDataURL")
      .mockImplementation(function (this: FileReader) {
        this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
      });
    try {
      await user.upload(
        screen.getByLabelText(/supporting files/i),
        new File(["notes"], "notes.txt", { type: "text/plain" }),
      );
      expect(
        await screen.findByText("Unable to read the selected file. Please try again."),
      ).toBeTruthy();
      expect(screen.queryByText("notes.txt")).toBeNull();
    } finally {
      readSpy.mockRestore();
    }
  });

  // SPM-36 AC9: a server rejection of an attachment returns the user to the attachment step
  // and shows the reason, rather than leaving it hidden on the review step.
  it("SPM-36 AC9 returns to the attachment step and shows the server's attachment error after submit", async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async (path, init) => {
      if (init?.method === "POST")
        throw new ApiError("Invalid event request.", { attachments: "Upload valid files." }, undefined, 400);
      throw new Error(`Unexpected API call: ${String(path)}`);
    });
    renderCreate();
    await enterBasicInformation(user);
    await enterSchedule(user);
    await user.upload(
      screen.getByLabelText(/supporting files/i),
      new File(["proposal"], "proposal.txt", { type: "text/plain" }),
    );
    expect(await screen.findByText("proposal.txt")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    expect((await screen.findAllByText("Upload valid files.")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/supporting files/i)).toBeTruthy();
  });

  // SPM-36 AC9 and AC4: a server rejection of any field returns the user to the step that shows it.
  it.each([
    ["name", "Enter an event name.", /event name/i],
    ["startDateTime", "Start date and time must be in the future.", /start date/i],
    ["attachments", "Upload valid files.", /supporting files/i],
  ] as const)(
    "SPM-36 AC9 returns to the step that shows the rejected %s field",
    async (field, message, visibleControl) => {
      const user = userEvent.setup();
      apiMock.mockImplementation(async (path, init) => {
        if (init?.method === "POST")
          throw new ApiError("Invalid event request.", { [field]: message }, undefined, 400);
        throw new Error(`Unexpected API call: ${String(path)}`);
      });
      renderCreate();
      await enterBasicInformation(user);
      await enterSchedule(user);
      await user.click(screen.getByRole("button", { name: /continue/i }));

      await user.click(screen.getByRole("button", { name: /submit for review/i }));

      expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);
      expect(screen.getByLabelText(visibleControl)).toBeTruthy();
      expect(screen.queryByRole("button", { name: /submit for review/i })).toBeNull();
    },
  );

  // SPM-36 AC9 (routing): with several rejected fields, the user goes to the earliest step that shows one of them.
  it("SPM-36 AC9 goes to the basic information step when a name and an attachment are both rejected", async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async (path, init) => {
      if (init?.method === "POST")
        throw new ApiError(
          "Invalid event request.",
          { name: "Enter an event name.", attachments: "Upload valid files." },
          undefined,
          400,
        );
      throw new Error(`Unexpected API call: ${String(path)}`);
    });
    renderCreate();
    await enterBasicInformation(user);
    await enterSchedule(user);
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    expect(await screen.findByText("Enter an event name.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /event name/i })).toBeTruthy();
    expect(screen.queryByLabelText(/supporting files/i)).toBeNull();
  });

  // SPM-36 AC9 (banner): the submit banner shows the server's message, not a generic one.
  it("SPM-36 AC9 shows the server's message in the submit banner", async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async (path, init) => {
      if (init?.method === "POST")
        throw new ApiError("Invalid event request.", { attachments: "Upload valid files." }, undefined, 400);
      throw new Error(`Unexpected API call: ${String(path)}`);
    });
    renderCreate();
    await enterBasicInformation(user);
    await enterSchedule(user);
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    const banner = (await screen.findAllByRole("alert")).find(
      (alert) => alert.textContent === "Invalid event request.",
    );
    expect(banner).toBeTruthy();
    expect(screen.queryByText("Unable to submit. Please try again.")).toBeNull();
  });

  // SPM-36 AC9 (field): a rejected equipment-needs value is shown next to its input on the review step.
  it("SPM-36 AC9 shows a rejected equipment-needs message next to its input on the review step", async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async (path, init) => {
      if (init?.method === "POST")
        throw new ApiError("Invalid event request.", { equipmentNeeds: "Enter valid text." }, undefined, 400);
      throw new Error(`Unexpected API call: ${String(path)}`);
    });
    renderCreate();
    await enterBasicInformation(user);
    await enterSchedule(user);
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    const field = (await screen.findByRole("textbox", { name: /equipment needs/i })).closest("div");
    expect(field?.textContent).toContain("Enter valid text.");
  });
});

describe("SPM-37 drafts in the current event form", () => {
  const emptyFields = {
    name: "",
    purpose: "",
    description: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    expectedAttendance: "",
    layout: "",
    facilities: [],
    accessibility: [],
    attachments: [],
    equipmentNeeds: "",
  };
  const draft = {
    id: "00000000-0000-4000-8000-000000000037",
    fields: { ...emptyFields, name: "Saved name" },
    version: 1,
    status: "Draft",
    eventId: null,
    updatedAt: "2026-09-16T00:00:00Z",
  };
  /**
   * EVE-DRF-10-A: the 50 MB limit applies to all supporting files together, not only to each file. 30 MiB then
   * 21 MiB (51 MiB in total) is refused with the total-size message and keeps no second file; 30 MiB then 20 MiB
   * (exactly 50 MiB) is accepted. Sizes are overridden on the File objects so no real bytes are allocated.
   */
  it("EVE-DRF-10-A refuses supporting files whose combined size exceeds 50 MB and accepts exactly 50 MB", async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async () => {
      throw new Error("Unexpected API call");
    });
    renderCreate();
    await enterBasicInformation(user);
    await enterSchedule(user);
    const sized = (name: string, mib: number) => {
      const file = new File(["x"], name, { type: "text/plain" });
      Object.defineProperty(file, "size", { value: mib * 1024 * 1024 });
      return file;
    };

    await user.upload(screen.getByLabelText(/supporting files/i), sized("first.txt", 30));
    expect(await screen.findByText("first.txt")).toBeTruthy();

    await user.upload(screen.getByLabelText(/supporting files/i), sized("second.txt", 21));
    expect(await screen.findByText("Use up to five files, 50 MB total.")).toBeTruthy();
    expect(screen.queryByText("second.txt")).toBeNull();

    await user.upload(screen.getByLabelText(/supporting files/i), sized("third.txt", 20));
    expect(await screen.findByText("third.txt")).toBeTruthy();
    expect(screen.queryByText("Use up to five files, 50 MB total.")).toBeNull();
  });

  // AC1/2/6: saving is separate from submission and accepts incomplete fields.
  /** EVE-DRF-01-A: a draft saves with incomplete fields and confirms without submitting. */
  it("saves an incomplete request and confirms without submitting", async () => {
    apiMock.mockResolvedValue(draft);
    renderCreate();
    // Save without completing any required fields.
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      await screen.findByRole("dialog", { name: "Draft Saved" }),
    ).toBeTruthy();
    expect(apiMock.mock.calls[0][1]?.method).toBe("PUT");
    expect(apiMock.mock.calls.some(([path]) => path === "/events")).toBe(false);
  });
  // AC3/4: reopens the saved form and updates the same ID/version.
  /** EVE-DRF-02-A (update path): a saved draft reopens and a later save updates the same request. */
  it("prefills an existing draft and saves updates to the same request", async () => {
    apiMock.mockResolvedValue(draft);
    renderCreate(`/requests/${draft.id}`);
    const name = await screen.findByRole("textbox", { name: /event name/i });
    expect((name as HTMLInputElement).value).toBe("Saved name");
    // Change one field without filling remaining required fields.
    fireEvent.change(name, { target: { value: "Updated name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByRole("dialog");
    const [path, init] = apiMock.mock.calls.find(
      ([, init]) => init?.method === "PUT",
    )!;
    expect(path).toBe(`/requests/${draft.id}`);
    expect(JSON.parse(init!.body as string)).toMatchObject({
      version: 1,
      fields: { name: "Updated name" },
    });
  });
  /**
   * EVE-DRF-02-A: reopening a saved draft pre-fills every saved value and resumes on the saved wizard step
   * (formStep 2, Equipment & Review). The values are the Workshop draft from the Confluence case; the test walks
   * back through each step and compares every control with the saved value.
   */
  it("EVE-DRF-02-A pre-fills every saved value and resumes on the saved wizard step", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({
      ...draft,
      fields: {
        ...emptyFields,
        name: "Workshop",
        purpose: "Community building",
        description: "A workshop for new members.",
        startDate: inputDate(7),
        startTime: "18:00",
        endDate: inputDate(7),
        endTime: "21:00",
        expectedAttendance: "25",
        layout: "Theatre",
        facilities: ["Projector"],
        accessibility: ["Hearing loop"],
        equipmentNeeds: "Microphone",
        formStep: 2,
      },
    });
    renderCreate(`/requests/${draft.id}`);

    // Resumes on Equipment & Review: the step-two field is prefilled and the step-one schedule is not on screen.
    expect(((await screen.findByLabelText(/equipment needs/i)) as HTMLTextAreaElement).value).toBe("Microphone");
    expect(screen.queryByLabelText(/start date/i)).toBeNull();

    // Back to Schedule & Venue Needs: every schedule, attendance, layout and selection control is prefilled.
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect((screen.getByLabelText(/start date/i) as HTMLInputElement).value).toBe(inputDate(7));
    expect((screen.getByLabelText(/start time/i) as HTMLInputElement).value).toBe("18:00");
    expect((screen.getByLabelText(/end date/i) as HTMLInputElement).value).toBe(inputDate(7));
    expect((screen.getByLabelText(/end time/i) as HTMLInputElement).value).toBe("21:00");
    expect((screen.getByLabelText(/expected attendance/i) as HTMLInputElement).value).toBe("25");
    expect((screen.getByLabelText(/preferred room layout/i) as HTMLSelectElement).value).toBe("Theatre");
    expect((screen.getByRole("checkbox", { name: "Projector" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Parking" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Hearing loop" }) as HTMLInputElement).checked).toBe(true);

    // Back to Basic Information: name, purpose and description are prefilled.
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect((screen.getByRole("textbox", { name: /event name/i }) as HTMLInputElement).value).toBe("Workshop");
    expect((screen.getByRole("textbox", { name: /purpose/i }) as HTMLInputElement).value).toBe("Community building");
    expect((screen.getByRole("textbox", { name: /description/i }) as HTMLTextAreaElement).value).toBe(
      "A workshop for new members.",
    );
  });

  // AC6: failures retain text and retry the exact save operation.
  it("keeps entered values after failure and retries without a duplicate operation", async () => {
    apiMock
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValue(draft);
    renderCreate();
    fireEvent.change(screen.getByRole("textbox", { name: /event name/i }), {
      target: { value: "Do not lose this" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Network unavailable",
    );
    expect(
      (screen.getByRole("textbox", { name: /event name/i }) as HTMLInputElement)
        .value,
    ).toBe("Do not lose this");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByRole("dialog");
    expect(apiMock.mock.calls[1]).toEqual(apiMock.mock.calls[0]);
  });
  // AC8: direct draft URLs cannot expose editable controls after submission.
  /** EVE-DRF-07-A: the editor is locked when the server reports Submitted. */
  it("blocks the editor when the server returns Submitted", async () => {
    apiMock.mockResolvedValue({ ...draft, status: "Submitted" });
    renderCreate(`/requests/${draft.id}`);
    await screen.findByText(/Further changes must follow/);
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  // AC3: the list shows the persisted Draft status and links back to the editor.
  /** EVE-DRF-03: My Drafts lists drafts with status and a reopen link. */
  it("lists drafts in My Drafts with their status and reopen link", async () => {
    apiMock.mockResolvedValue([draft]);
    renderCreate("/requests");
    const link = await screen.findByRole("link", { name: "Saved name" });
    expect(link.getAttribute("href")).toBe(`/requests/${draft.id}`);
    expect(screen.getByText("Draft")).toBeTruthy();
  });
  // Continuity: saving persists the current wizard step alongside the fields.
  /** EVE-DRF-04-A: saving the current step sends the draft fields to the same request. */
  it("saves the current step with the draft fields", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(draft);
    renderCreate();
    await enterBasicInformation(user);
    await enterSchedule(user);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByRole("dialog", { name: "Draft Saved" });
    const [, init] = apiMock.mock.calls.find(
      ([, init]) => init?.method === "PUT",
    )!;
    expect(JSON.parse(init!.body as string).fields.formStep).toBe(1);
  });
  // Continuity: reopening a draft resumes the step it was saved on.
  it("resumes a draft on the step where it was saved", async () => {
    apiMock.mockResolvedValue({
      ...draft,
      fields: { ...emptyFields, name: "Saved name", formStep: 1 },
    });
    renderCreate(`/requests/${draft.id}`);
    expect(await screen.findByLabelText(/start date/i)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /event name/i })).toBeNull();
  });
});
