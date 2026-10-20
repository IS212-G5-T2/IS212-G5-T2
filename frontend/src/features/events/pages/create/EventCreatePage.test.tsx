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
const venueFacilityOptions = [
  "Catering", "AV System", "Parking", "Stage", "Projector", "Whiteboard",
  "Wi-Fi", "Wired network", "Video conferencing", "Lectern", "Power outlets",
].map((value) => ({ label: value, value }));
const venueAccessibilityOptions = [
  "Wheelchair access", "Accessible restrooms", "Hearing loop", "Elevator access",
].map((value) => ({ label: value, value }));

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
      accessibility: ["Wheelchair access"],
    },
    attachments: [],
    equipmentNeeds: "Two microphones",
    registrationEnabled: false,
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mockImplementation(async (path) =>
    path === "/venues/options" ? { facilities: venueFacilityOptions, accessibility: venueAccessibilityOptions } : undefined,
  );
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
    expect(apiMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
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
    expect(apiMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
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
    expect(apiMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  // SPM-36 AC6-7: successful request and submission confirmation.
  it("EVE-FAC-06-A submits the selected facility and shows the submission confirmation", async () => {
    const user = userEvent.setup();
    const saved = eventRecord();
    apiMock.mockImplementation(async (_path, init) => {
      if (_path === "/venues/options") return { facilities: venueFacilityOptions, accessibility: venueAccessibilityOptions };
      if (init?.method === "POST") return { event: saved, message: "Submitted" };
      if (_path === `/events/${saved.id}`) return saved;
      throw new Error(`Unexpected API call: ${String(_path)}`);
    });
    useAppStore.setState({ events: [saved] });
    renderCreate();
    await enterBasicInformation(user);
    await enterSchedule(user);
    await user.click(screen.getByLabelText("Catering"));
    await user.click(screen.getByLabelText("Wheelchair access"));
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
      accessibility: ["Wheelchair access"],
      attachments: [],
    });
    expect(submittedBody).not.toHaveProperty("status");
    expect(submittedBody).not.toHaveProperty("organiserId");
  });

  it("keeps the request review card readable in light and dark mode", async () => {
    const user = userEvent.setup();
    renderCreate();
    await enterBasicInformation(user);
    await enterSchedule(user);
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const heading = screen.getByRole("heading", { name: "Review Your Request" });
    const card = heading.parentElement;
    expect(card?.className).toContain("bg-gray-50");
    expect(card?.className).toContain("dark:bg-gray-800");
    expect(card?.className).toContain("text-gray-900");
    expect(card?.className).toContain("dark:text-gray-100");
    expect(heading.className).toContain("dark:text-gray-100");
    expect(screen.getByText("Event name").className).toContain("dark:text-gray-400");
  });

  /** EVE-FAC-01-A and EVE-ACC-02-ALIGN-01: both catalogues, labels, and submitted values come from venue schemas. */
  it("EVE-FAC-01-A fetches facility and accessibility options from the backend", async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async (path) =>
      path === "/venues/options"
        ? {
            facilities: [{ label: "Backend display", value: "Backend facility" }],
            accessibility: [{ label: "Backend access label", value: "Wheelchair access" }],
          }
        : undefined,
    );
    renderCreate();
    await enterBasicInformation(user);
    expect(await screen.findByLabelText("Backend display")).toBeTruthy();
    expect(screen.getByLabelText("Backend access label")).toBeTruthy();
    expect(screen.queryByLabelText("Catering")).toBeNull();
    expect(screen.queryByLabelText("Wheelchair access")).toBeNull();
    expect(apiMock.mock.calls.filter(([path]) => path === "/venues/options")).toHaveLength(1);
    expect(apiMock.mock.calls.some(([path]) => String(path).includes("facilityNames"))).toBe(false);
  });

  /** EVE-FAC-03-A: selecting two backend values submits both values while rendering their distinct labels. */
  it("EVE-FAC-03-A submits two backend facility values selected by their labels", async () => {
    const user = userEvent.setup();
    const saved = eventRecord();
    const options = [
      { label: "Venue label one", value: "Wired network" },
      { label: "Venue label two", value: "Power outlets" },
    ];
    apiMock.mockImplementation(async (path, init) => {
      if (path === "/venues/options") return {
        facilities: options,
        accessibility: [{ label: "Venue access label", value: "Hearing loop" }],
      };
      if (init?.method === "POST") return { event: saved, message: "Submitted" };
      if (path === `/events/${saved.id}`) return saved;
      throw new Error(`Unexpected API call: ${String(path)}`);
    });
    renderCreate();
    await enterBasicInformation(user);
    await enterSchedule(user);
    expect(screen.getByLabelText("Venue label one")).toBeTruthy();
    await user.click(screen.getByLabelText("Venue label one"));
    await user.click(screen.getByLabelText("Venue label two"));
    await user.click(screen.getByLabelText("Venue access label"));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /submit for review/i }));
    await screen.findByText("Your event request was submitted successfully.");
    const submittedBody = JSON.parse(
      apiMock.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body as string,
    );
    expect(submittedBody.facilities).toEqual(["Wired network", "Power outlets"]);
    expect(submittedBody.accessibility).toEqual(["Hearing loop"]);
  });

  /** EVE-FAC-04-B: a server rejection keeps the selected value and renders the facility field error for correction. */
  it("EVE-FAC-04-B retains valid fields after backend facility rejection and permits corrected submission", async () => {
    const user = userEvent.setup();
    const saved = eventRecord();
    let rejected = false;
    apiMock.mockImplementation(async (path, init) => {
      if (path === "/venues/options") return { facilities: venueFacilityOptions, accessibility: venueAccessibilityOptions };
      if (init?.method === "POST" && !rejected) {
        rejected = true;
        throw new ApiError("Please correct the highlighted fields.", { facilities: "Choose valid options." }, undefined, 400);
      }
      if (init?.method === "POST") return { event: saved, message: "Submitted" };
      if (path === `/events/${saved.id}`) return saved;
      return undefined;
    });
    renderCreate();
    await enterBasicInformation(user);
    await enterSchedule(user);
    await user.click(screen.getByLabelText("Wired network"));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(await screen.findByText("Choose valid options.")).toBeTruthy();
    expect(screen.getByLabelText("Wired network")).toHaveProperty("checked", true);
    await user.click(screen.getByLabelText("Wheelchair access"));
    expect(screen.getByLabelText(/start date/i)).toHaveProperty("value", inputDate(7));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(await screen.findByText("Your event request was submitted successfully.")).toBeTruthy();
    const bodies = apiMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(JSON.parse(bodies[1][1]!.body as string)).toMatchObject({
      name: "Welcome Evening",
      purpose: "Community building",
      facilities: ["Wired network"],
      accessibility: ["Wheelchair access"],
    });
  });

  /** EVE-FAC-04-B: an accessibility rejection returns to that field, preserves the request, and permits correction. */
  it("EVE-FAC-04-B retains valid fields after backend accessibility rejection", async () => {
    const user = userEvent.setup();
    const saved = eventRecord();
    let rejected = false;
    apiMock.mockImplementation(async (path, init) => {
      if (path === "/venues/options") return { facilities: venueFacilityOptions, accessibility: venueAccessibilityOptions };
      if (init?.method === "POST" && !rejected) {
        rejected = true;
        throw new ApiError("Please correct the highlighted fields.", { accessibility: "Choose valid options." }, undefined, 400);
      }
      if (init?.method === "POST") return { event: saved, message: "Submitted" };
      if (path === `/events/${saved.id}`) return saved;
      return undefined;
    });
    renderCreate();
    await enterBasicInformation(user);
    await enterSchedule(user);
    await user.click(screen.getByLabelText("Wheelchair access"));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(await screen.findByText("Choose valid options.")).toBeTruthy();
    expect(screen.getByLabelText("Wheelchair access")).toHaveProperty("checked", true);
    expect(screen.getByLabelText(/start date/i)).toHaveProperty("value", inputDate(7));
    await user.click(screen.getByLabelText("Wheelchair access"));
    await user.click(screen.getByLabelText("Hearing loop"));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(await screen.findByText("Your event request was submitted successfully.")).toBeTruthy();
    const bodies = apiMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(JSON.parse(bodies[1][1]!.body as string)).toMatchObject({
      name: "Welcome Evening",
      accessibility: ["Hearing loop"],
    });
  });

  /** EVE-FAC-04-B: combined invalid event fields remain blocked with supported facility and accessibility choices selected, then submit after correction. */
  it("EVE-FAC-04-B corrects combined invalid fields before submitting supported venue choices", async () => {
    const user = userEvent.setup();
    const saved = eventRecord();
    apiMock.mockImplementation(async (path, init) => {
      if (path === "/venues/options") return { facilities: venueFacilityOptions, accessibility: venueAccessibilityOptions };
      if (init?.method === "POST") return { event: saved, message: "Submitted" };
      if (path === `/events/${saved.id}`) return saved;
      return undefined;
    });
    renderCreate();

    await user.type(screen.getByRole("textbox", { name: /purpose/i }), "Community building");
    await user.type(screen.getByRole("textbox", { name: /description/i }), "A welcome event for new members.");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText("Enter an event name.")).toBeTruthy();
    expect(apiMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    await user.type(screen.getByRole("textbox", { name: /event name/i }), "Welcome Evening");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: inputDate(7) } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "18:00" } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: inputDate(7) } });
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: "18:00" } });
    await user.type(screen.getByLabelText(/expected attendance/i), "0");
    await user.selectOptions(screen.getByLabelText(/preferred room layout/i), "Banquet");
    await user.click(screen.getByLabelText("Wired network"));
    await user.click(screen.getByLabelText("Wheelchair access"));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText("Enter a positive whole number of attendees.")).toBeTruthy();
    expect(screen.getByText("End must be after start.")).toBeTruthy();
    expect(apiMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

    await user.clear(screen.getByLabelText(/expected attendance/i));
    await user.type(screen.getByLabelText(/expected attendance/i), "40");
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: "21:00" } });
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    expect(await screen.findByText("Your event request was submitted successfully.")).toBeTruthy();
    const submitted = apiMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(submitted[1]!.body as string)).toMatchObject({
      name: "Welcome Evening", expectedAttendance: 40,
      facilities: ["Wired network"], accessibility: ["Wheelchair access"],
    });
  });

  /** EVE-FAC-05-A: unresolved options announce loading and prevent progressing or submitting until loaded. */
  it("EVE-FAC-05-A blocks progression and submission while facility options are pending", async () => {
    const user = userEvent.setup();
    let resolveOptions!: (value: { facilities: typeof venueFacilityOptions; accessibility: typeof venueAccessibilityOptions }) => void;
    apiMock.mockImplementation((path) => path === "/venues/options"
      ? new Promise((resolve) => { resolveOptions = resolve; })
      : Promise.resolve(undefined));
    renderCreate();
    await enterBasicInformation(user);
    expect(await screen.findByRole("status")).toHaveTextContent("Loading facility and accessibility options");
    expect(screen.queryByLabelText("Catering")).toBeNull();
    expect(screen.queryByLabelText("Wheelchair access")).toBeNull();
    await enterSchedule(user);
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByLabelText(/start date/i)).toBeTruthy();
    expect(apiMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    resolveOptions({ facilities: venueFacilityOptions, accessibility: venueAccessibilityOptions });
    expect(await screen.findByLabelText("Catering")).toBeTruthy();
    expect(screen.getByLabelText("Wheelchair access")).toBeTruthy();
  });

  /** EVE-FAC-01-B and EVE-FAC-05-B: a malformed backend set is an error, never an empty or local fallback. */
  it.each(["facilities", "accessibility"] as const)(
    "EVE-FAC-01-B EVE-FAC-05-B rejects malformed %s options",
    async (field) => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async (path) => {
      if (path !== "/venues/options") return undefined;
      return field === "facilities"
        ? { facilities: "Catering", accessibility: venueAccessibilityOptions }
        : { facilities: venueFacilityOptions, accessibility: "Wheelchair access" };
    });
    renderCreate();
    await enterBasicInformation(user);
    expect(await screen.findByText("Facility and accessibility options response is invalid.")).toBeTruthy();
    expect(screen.queryByLabelText("Catering")).toBeNull();
    expect(screen.queryByLabelText("Wheelchair access")).toBeNull();
    },
  );

  /** EVE-FAC-01-B and EVE-FAC-05-B: a failed request has no fallback, then retry loads the current catalogue. */
  it("EVE-FAC-01-B EVE-FAC-05-B has no fallback after a failed fetch and recovers on retry", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    let rejectFirst!: (error: Error) => void;
    apiMock.mockImplementation(async (path) => {
      if (path === "/venues/options") {
        attempts += 1;
        if (attempts === 1) return new Promise((_, reject) => { rejectFirst = reject; });
        return {
          facilities: [{ label: "Current label", value: "Current value" }],
          accessibility: [{ label: "Current access", value: "Hearing loop" }],
        };
      }
      return undefined;
    });
    renderCreate();
    await enterBasicInformation(user);
    expect(await screen.findByRole("status")).toHaveTextContent("Loading facility and accessibility options");
    await enterSchedule(user);
    rejectFirst(new Error("Facilities unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Facilities unavailable");
    expect(screen.queryByLabelText("Catering")).toBeNull();
    expect(screen.queryByLabelText("Wheelchair access")).toBeNull();
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(attempts).toBe(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Facilities unavailable");
    vi.useRealTimers();
    await user.click(screen.getByRole("button", { name: "Retry facility and accessibility options" }));
    expect(await screen.findByLabelText("Current label")).toBeTruthy();
    expect(screen.getByLabelText("Current access")).toBeTruthy();
    await user.click(screen.getByLabelText("Current label"));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByRole("textbox", { name: /equipment needs/i })).toBeTruthy();
    expect(apiMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(attempts).toBe(2);
  });

  /** EVE-FAC-05-C: an empty catalogue identifies stale restored values and blocks submission. */
  it("EVE-FAC-05-C shows empty states and blocks submission with stale restored choices", async () => {
    const user = userEvent.setup();
    const draft = {
      id: "00000000-0000-4000-8000-000000000037",
      fields: {
        name: "Saved name", purpose: "Purpose", description: "Description",
        startDate: inputDate(7), startTime: "18:00", endDate: inputDate(7), endTime: "21:00",
        expectedAttendance: "80", layout: "Banquet", facilities: ["Retired facility"],
        accessibility: ["Hearing loop"], attachments: [], equipmentNeeds: "", registrationEnabled: false, formStep: 1,
      },
      version: 1, status: "Draft", eventId: null, updatedAt: "2026-09-16T00:00:00Z",
    };
    const saved = eventRecord();
    apiMock.mockImplementation(async (path, init) => {
      if (path === "/venues/options") return { facilities: [], accessibility: [] };
      if (path === `/requests/${draft.id}`) return draft;
      if (init?.method === "PUT") return draft;
      if (init?.method === "POST") return { event: saved, message: "Submitted" };
      if (path === `/events/${saved.id}`) return saved;
      return undefined;
    });
    renderCreate(`/requests/${draft.id}`);
    await screen.findByLabelText(/start date/i);
    expect(await screen.findByText("No facility options are currently available.")).toBeTruthy();
    expect(await screen.findByText("No accessibility options are currently available.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: /required facilities/i })).toBeNull();
    expect(screen.queryByRole("group", { name: /accessibility needs/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/unsupported facilities: Retired facility/i)).toBeTruthy();
    expect(await screen.findByText(/unsupported accessibility options: Hearing loop/i)).toBeTruthy();
    expect(screen.getByLabelText(/expected attendance/i)).toHaveProperty("value", "80");
    expect(apiMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  /** EVE-FAC-02-B and EVE-FAC-05-D: reopening a draft reflects the changed catalogue and allows correcting a stale saved choice. */
  it("EVE-FAC-02-B EVE-FAC-05-D refreshes a stale draft selection against the changed catalogue", async () => {
    const user = userEvent.setup();
    const draft = {
      id: "00000000-0000-4000-8000-000000000037",
      fields: {
        name: "Saved name", purpose: "Purpose", description: "Description",
        startDate: inputDate(7), startTime: "18:00", endDate: inputDate(7), endTime: "21:00",
        expectedAttendance: "80", layout: "Banquet", facilities: ["Old facility value"],
        accessibility: ["Wheelchair access"], attachments: [], equipmentNeeds: "", registrationEnabled: false, formStep: 1,
      },
      version: 1, status: "Draft", eventId: null, updatedAt: "2026-09-16T00:00:00Z",
    };
    const saved = eventRecord();
    apiMock.mockImplementation(async (path, init) => path === "/venues/options"
      ? {
          facilities: [{ label: "Current label", value: "Current value" }],
          accessibility: [{ label: "Current access label", value: "Accessible restrooms" }],
        }
      : path === `/requests/${draft.id}` && init?.method === "PUT" ? { ...draft, version: draft.version + 1 }
        : path === `/requests/${draft.id}` ? draft
        : init?.method === "POST" ? { event: saved, message: "Submitted" }
          : path === `/events/${saved.id}` ? saved : undefined);
    renderCreate(`/requests/${draft.id}`);
    await screen.findByLabelText("Current label");
    expect(screen.getByLabelText("Current label")).toHaveProperty("checked", false);
    expect(screen.queryByLabelText("Old facility value")).toBeNull();
    expect(screen.queryByLabelText("Wheelchair access")).toBeNull();
    expect(screen.getByLabelText("Current access label")).toHaveProperty("checked", false);
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/unsupported facilities: Old facility value/i)).toBeTruthy();
    expect(await screen.findByText(/unsupported accessibility options: Wheelchair access/i)).toBeTruthy();
    expect(apiMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(screen.getByLabelText(/expected attendance/i)).toHaveProperty("value", "80");
    await user.click(screen.getByLabelText("Current label"));
    await user.click(screen.getByLabelText("Current access label"));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(await screen.findByText("Your event request was submitted successfully.")).toBeTruthy();
    const submitted = apiMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(submitted[1]!.body as string)).toMatchObject({
      name: "Saved name", purpose: "Purpose", description: "Description",
      expectedAttendance: 80, layout: "Banquet",
      facilities: ["Current value"], accessibility: ["Accessible restrooms"],
    });
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
      if (_path === "/venues/options") return { facilities: venueFacilityOptions, accessibility: venueAccessibilityOptions };
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
      await screen.findByRole("dialog", { name: "Draft Saved" }),
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
    apiMock.mockImplementation(async (path) =>
      path === "/venues/options" ? { facilities: venueFacilityOptions, accessibility: venueAccessibilityOptions } : draft,
    );
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
    apiMock.mockImplementation(async (path) => path === "/venues/options"
      ? { facilities: venueFacilityOptions, accessibility: venueAccessibilityOptions }
      : { ...draft, fields: { ...emptyFields, name: "Saved name", formStep: 1 } });
    renderCreate(`/requests/${draft.id}`);
    expect(await screen.findByLabelText(/start date/i)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /event name/i })).toBeNull();
  });
});
