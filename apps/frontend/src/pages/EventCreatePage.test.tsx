import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventCreatePage } from "@/pages/EventCreatePage";
import { EventDetailPage } from "@/pages/EventDetailPage";
import { MyRequestsPage } from "./MyRequestsPage";
import { api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import type { EventRecord } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function inputDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function eventRecord(): EventRecord {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(18, 0, 0, 0);
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
    changeRequests: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

afterEach(cleanup);

beforeEach(() => {
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
      target: { value: inputDate(kind === "past start" ? -1 : 7) },
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
  // AC1/2/6: saving is separate from submission and accepts incomplete fields.
  it("saves an incomplete request and confirms without submitting", async () => {
    apiMock.mockResolvedValue(draft);
    renderCreate();
    // Save without completing any required fields.
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      await screen.findByRole("dialog", { name: "Draft saved" }),
    ).toBeTruthy();
    expect(apiMock.mock.calls[0][1]?.method).toBe("PUT");
    expect(apiMock.mock.calls.some(([path]) => path === "/events")).toBe(false);
  });
  // AC3/4: reopens the saved form and updates the same ID/version.
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
  it("blocks the editor when the server returns Submitted", async () => {
    apiMock.mockResolvedValue({ ...draft, status: "Submitted" });
    renderCreate(`/requests/${draft.id}`);
    await screen.findByText(/Further changes must follow/);
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  // AC3: the list shows the persisted Draft status and links back to the editor.
  it("lists drafts in My Drafts with their status and reopen link", async () => {
    apiMock.mockResolvedValue([draft]);
    renderCreate("/requests");
    const link = await screen.findByRole("link", { name: "Saved name" });
    expect(link.getAttribute("href")).toBe(`/requests/${draft.id}`);
    expect(screen.getByText("Draft")).toBeTruthy();
  });
  // Continuity: saving persists the current wizard step alongside the fields.
  it("saves the current step with the draft fields", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(draft);
    renderCreate();
    await enterBasicInformation(user);
    await enterSchedule(user);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByRole("dialog", { name: "Draft saved" });
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
