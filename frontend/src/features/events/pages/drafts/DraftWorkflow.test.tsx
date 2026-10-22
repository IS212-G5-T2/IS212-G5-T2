import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventCreatePage } from "../create/EventCreatePage";
import { MyRequestsPage } from "./MyRequestsPage";
import { api, ApiError } from "@/utils/api";
import type { DraftRecord } from "@/features/events/types/draft";
import { useAppStore } from "@/store/useAppStore";

vi.mock("@/utils/api", async (original) => ({
  ...(await original<object>()),
  api: vi.fn(),
}));
const mocked = vi.mocked(api);
const id = "00000000-0000-4000-8000-000000000037";
const fields = {
  name: "Workshop",
  purpose: "Learning",
  description: "A workshop",
  startDate: "2030-01-02",
  startTime: "10:00",
  endDate: "2030-01-02",
  endTime: "11:00",
  expectedAttendance: "25",
  layout: "Theatre",
  facilities: [],
  accessibility: [],
  attachments: [],
  equipmentNeeds: "",
};
const draft = (overrides = {}): DraftRecord => ({
  id,
  fields: { ...fields, ...overrides },
  version: 1,
  status: "Draft",
  eventId: null,
  updatedAt: "2030-01-01T00:00:00Z",
});
const facilityOptions = {
  facilities: [{ label: "Catering", value: "Catering" }],
  accessibility: [{ label: "Wheelchair access", value: "Wheelchair access" }],
};
function mockDraftWithFacilityOptions(record: DraftRecord) {
  mocked.mockImplementation(async (path, init) => {
    if (path === "/venues/options") return facilityOptions;
    if (path === `/requests/${id}` && init?.method === "PUT") {
      return { ...record, version: record.version + 1 };
    }
    if (path === `/requests/${id}`) return record;
    return undefined;
  });
}
function mockResumedDraftFlow(
  record: DraftRecord,
  submit: () => unknown = () => undefined,
) {
  const options = deferred<typeof facilityOptions>();
  mocked.mockImplementation(async (path, init) => {
    if (path === "/venues/options") return options.promise;
    if (path === `/requests/${id}` && init?.method === "PUT") {
      return { ...record, version: record.version + 1 };
    }
    if (path === `/requests/${id}/submit`) return submit();
    if (path === `/requests/${id}`) return record;
    return undefined;
  });
  return { resolveOptions: () => options.resolve(facilityOptions) };
}
function open(path = `/requests/${id}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/requests/:id" element={<EventCreatePage />} />
        <Route path="/events/create" element={<EventCreatePage />} />
        <Route path="/requests" element={<MyRequestsPage />} />
        <Route path="/events/:id" element={<p>Event submitted</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));
const save = () => click("Save draft");
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks();
  useAppStore.setState({ events: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SPM-37 Q2 functional cases", () => {
  it("EVE-DRF-SUP-26 rapid save clicks issue only one request", async () => {
    const pending = deferred<DraftRecord>();
    mocked.mockReturnValue(pending.promise);
    open("/events/create");
    const button = screen.getByRole("button", { name: "Save draft" });
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mocked).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(draft()));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("EVE-DRF-SUP-27 back navigation preserves data and server attachment errors are visible", async () => {
    mocked
      .mockResolvedValueOnce(draft({ formStep: 2 }))
      .mockResolvedValueOnce(facilityOptions)
      .mockRejectedValueOnce(
        new ApiError("Correct attachments", {
          attachments: "Invalid attachment metadata",
        }),
      );
    open();
    await screen.findByLabelText("Equipment needs");
    click(/Back/);
    expect(screen.getByLabelText(/Expected attendance/)).toHaveProperty(
      "value",
      "25",
    );
    save();
    expect(await screen.findByText("Invalid attachment metadata")).toBeTruthy();
    expect(screen.getByLabelText(/Expected attendance/)).toHaveProperty(
      "value",
      "25",
    );
  });
  it.each([0, 1, 2])(
    "EVE-DRF-SUP-28 saves incomplete values from wizard step %s",
    async (formStep) => {
      mockDraftWithFacilityOptions(draft({ formStep, purpose: "", startTime: "" }));
      open();
      await screen.findByRole("heading", { name: "Edit Draft Request" });
      save();
      await screen.findByRole("dialog");
      const call = mocked.mock.calls.find(
        ([, init]) => init?.method === "PUT",
      )!;
      expect(JSON.parse(call[1]!.body as string)).toMatchObject({
        version: 1,
        fields: { formStep, purpose: "", startTime: "" },
      });
      expect(
        mocked.mock.calls.some(([, init]) => init?.method === "POST"),
      ).toBe(false);
    },
  );
  it.each([undefined, -1, 3, 1.5])(
    "EVE-DRF-SUP-29 legacy or invalid saved step %j falls back to basic fields",
    async (formStep) => {
      mocked.mockResolvedValue(draft({ formStep }));
      open();
      expect(await screen.findByLabelText(/Event name/)).toHaveProperty(
        "value",
        "Workshop",
      );
    },
  );
  it.each([new Error("Not found"), "unknown failure"])(
    "EVE-DRF-SUP-30 failed draft retrieval hides editing %j",
    async (error) => {
      mocked.mockRejectedValue(error);
      open();
      expect(await screen.findByRole("alert")).toHaveProperty(
        "textContent",
        error instanceof Error ? error.message : "Unable to load this request.",
      );
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(
        screen
          .getByRole("link", { name: "Back To My Drafts" })
          .getAttribute("href"),
      ).toBe("/requests");
    },
  );
  it.each(["resolve", "reject"])(
    "EVE-DRF-SUP-31 ignores late load %s after leaving the editor",
    async (outcome) => {
      const pending = deferred<DraftRecord>();
      mocked.mockReturnValue(pending.promise);
      const view = open();
      expect(screen.getByRole("status")).toBeTruthy();
      view.unmount();
      await act(async () => {
        if (outcome === "resolve") pending.resolve(draft());
        else pending.reject(new Error("late"));
      });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("textbox")).toBeNull();
    },
  );
  /** EVE-DRF-06-A: a failed save is retried with the same operation before newer edits (Q2-005). */
  it("Q2-005 retries uncertain operation before saving edits made after failure", async () => {
    mocked
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(draft())
      .mockResolvedValueOnce({ ...draft(), version: 2 });
    open("/events/create");
    fireEvent.change(screen.getByLabelText(/Event name/), {
      target: { value: "Before" },
    });
    save();
    await screen.findByRole("alert");
    fireEvent.change(screen.getByLabelText(/Event name/), {
      target: { value: "After" },
    });
    save();
    await screen.findByRole("dialog");
    const puts = mocked.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(puts[1]).toEqual(puts[0]);
    const first = JSON.parse(puts[0][1]!.body as string),
      last = JSON.parse(puts[2][1]!.body as string);
    expect(last).toMatchObject({ version: 1, fields: { name: "After" } });
    expect(last.operationId).not.toBe(first.operationId);
  });
  /** EVE-DRF-06-B: a field validation error allows a corrected save with a new operation (Q2-006). */
  it("Q2-006 field validation error allows corrected payload with a new operation", async () => {
    mocked
      .mockRejectedValueOnce(
        new ApiError("Correct fields", { name: "Too long" }),
      )
      .mockResolvedValue(draft());
    open("/events/create");
    save();
    await screen.findByText("Too long");
    fireEvent.change(screen.getByLabelText(/Event name/), {
      target: { value: "Corrected" },
    });
    save();
    await screen.findByRole("dialog");
    const calls = mocked.mock.calls.map(([, init]) =>
      JSON.parse(init!.body as string),
    );
    expect(calls[1].fields.name).toBe("Corrected");
    expect(calls[1].operationId).not.toBe(calls[0].operationId);
    expect(screen.queryByText("Too long")).toBeNull();
  });
  /** EVE-DRF-06-A: a failed save keeps input and pending controls prevent duplicate submission (Q2-007). */
  it("Q2-007 save fallback message retains input and pending controls prevent duplicate submission", async () => {
    const pending = deferred<DraftRecord>();
    mocked.mockReturnValue(pending.promise);
    open("/events/create");
    save();
    expect(screen.getByRole("button", { name: /Saving/ })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.submit(document.querySelector("form")!);
    expect(mocked).toHaveBeenCalledTimes(1);
    await act(async () => pending.reject("offline"));
    expect(screen.getByRole("alert").textContent).toContain(
      "Unable to save draft",
    );
  });
  it("EVE-DRF-SUP-32 confirmation supports keyboard and returns to My Drafts", async () => {
    mocked.mockResolvedValueOnce(draft()).mockResolvedValueOnce([]);
    open("/events/create");
    save();
    const dialog = await screen.findByRole("dialog");
    expect(fireEvent.keyDown(dialog, { key: "Tab" })).toBe(false);
    expect(fireEvent.keyDown(dialog, { key: "Escape" })).toBe(true);
    click("OK");
    expect(await screen.findByText(/No saved drafts yet/)).toBeTruthy();
  });
  it("EVE-DRF-SUP-33 saved draft submits through requests API and replaces existing event in store", async () => {
    const event = { id, name: "Workshop" };
    useAppStore.setState({ events: [event, { id: "other" }] as never });
    const flow = mockResumedDraftFlow(draft({ formStep: 2 }), () => ({ event }));
    open();
    await screen.findByLabelText("Equipment needs");
    await waitFor(() => expect(mocked).toHaveBeenCalledWith("/venues/options"));
    await act(async () => flow.resolveOptions());
    click(/Submit For Review/);
    await screen.findByText("Event submitted");
    const requestCalls = mocked.mock.calls.filter(
      ([path]) => path !== "/venues/options",
    );
    expect(requestCalls[1][1]?.method).toBe("PUT");
    expect(requestCalls[2][0]).toBe(`/requests/${id}/submit`);
    expect(JSON.parse(requestCalls[2][1]!.body as string).version).toBe(2);
    expect(useAppStore.getState().events.map((e) => e.id)).toEqual([
      id,
      "other",
    ]);
  });
  it.each([new ApiError("Rejected", { equipmentNeeds: "Invalid" }), "unknown"])(
    "EVE-DRF-SUP-34 failed submission keeps draft data %j",
    async (error) => {
      const flow = mockResumedDraftFlow(draft({ formStep: 2 }), () => {
        throw error;
      });
      open();
      await screen.findByLabelText("Equipment needs");
      await waitFor(() => expect(mocked).toHaveBeenCalledWith("/venues/options"));
      await act(async () => flow.resolveOptions());
      click(/Submit For Review/);
      // The banner shows the server's message; a rejected field also shows its own alert next to its input.
      const expected = error instanceof Error ? "Rejected" : "Unable to submit. Please try again.";
      const alerts = await screen.findAllByRole("alert");
      expect(alerts.map((alert) => alert.textContent)).toContain(expected);
      expect(screen.getByText("Workshop")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: /Submit For Review/ }),
      ).toHaveProperty("disabled", false);
    },
  );
  it.each(["0", "1", "2", "2147483646", "2147483647", "2147483648"])(
    "EVE-DRF-SUP-35 attendance boundary %s on submission",
    async (expectedAttendance) => {
      mockDraftWithFacilityOptions(draft({ formStep: 1, expectedAttendance }));
      open();
      await screen.findByLabelText(/Expected attendance/);
      await screen.findByLabelText("Catering");
      click(/Continue/);
      const valid =
        Number(expectedAttendance) >= 1 &&
        Number(expectedAttendance) <= 2147483647;
      if (valid) expect(screen.getByLabelText("Equipment needs")).toBeTruthy();
      else expect(screen.getByText(/positive whole number/)).toBeTruthy();
      expect(mocked.mock.calls.filter(([path]) => path !== "/venues/options")).toHaveLength(1);
    },
  );
  it.each(["09:59", "10:00", "10:01"])(
    "EVE-DRF-SUP-36 end time %s relative to start 10:00",
    async (endTime) => {
      mockDraftWithFacilityOptions(draft({ formStep: 1, endTime }));
      open();
      await screen.findByLabelText(/End time/);
      await screen.findByLabelText("Catering");
      click(/Continue/);
      if (endTime === "10:01")
        expect(screen.getByLabelText("Equipment needs")).toBeTruthy();
      else expect(screen.getByText("End must be after start.")).toBeTruthy();
    },
  );
  it("EVE-DRF-SUP-37 missing required basic fields in resumed review returns to step one", async () => {
    const flow = mockResumedDraftFlow(
      draft({ formStep: 2, name: "", purpose: "", description: "" }),
    );
    open();
    await screen.findByLabelText("Equipment needs");
    await waitFor(() => expect(mocked).toHaveBeenCalledWith("/venues/options"));
    await act(async () => flow.resolveOptions());
    click(/Submit For Review/);
    expect(screen.getByText("Enter the purpose of your event.")).toBeTruthy();
    expect(
      mocked.mock.calls.filter(([path]) => path !== "/venues/options"),
    ).toHaveLength(1);
  });
  it.each([
    ["bad-date", "11:00"],
    ["2030-01-02", "bad-time"],
  ])(
    "EVE-DRF-SUP-38 corrupt persisted schedule %s %s cannot submit",
    async (startDate, endTime) => {
      mockDraftWithFacilityOptions(draft({ formStep: 1, startDate, endTime }));
      open();
      await screen.findByLabelText(/Start date/);
      await screen.findByLabelText("Catering");
      click(/Continue/);
      expect(screen.queryByLabelText("Equipment needs")).toBeNull();
      expect(mocked.mock.calls.filter(([path]) => path !== "/venues/options")).toHaveLength(1);
    },
  );
  /** EVE-DRF-03: My Drafts lists only drafts; submitted requests are excluded (Q2-015). */
  it("Q2-015 list shows only drafts; submitted requests are excluded (moved to My Events)", async () => {
    const pending = deferred<DraftRecord[]>();
    mocked.mockReturnValue(pending.promise);
    open("/requests");
    expect(screen.getByRole("status")).toBeTruthy();
    await act(async () =>
      pending.resolve([
        draft({ name: "  " }),
        { ...draft(), id: "submitted", status: "Submitted", eventId: id },
      ]),
    );
    // The unnamed draft renders and links back into the draft editor.
    expect(
      screen
        .getByRole("link", { name: "Untitled event request" })
        .getAttribute("href"),
    ).toBe(`/requests/${id}`);
    // The submitted request is filtered out of My Drafts — it now lives under My Events.
    expect(screen.queryByRole("link", { name: "Workshop" })).toBeNull();
    expect(screen.queryByText("Submitted")).toBeNull();
  });
  // A response containing only submitted requests must behave like an empty draft list.
  /** EVE-DRF-03: My Drafts shows the empty state when every request is submitted (Q2-015B). */
  it("Q2-015B shows the draft empty state when every request is submitted", async () => {
    mocked.mockResolvedValue([
      { ...draft(), id: "submitted", status: "Submitted", eventId: id },
    ]);
    open("/requests");
    expect(await screen.findByText(/No saved drafts yet/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Workshop" })).toBeNull();
  });
  it.each([new Error("List unavailable"), "unknown"])(
    "EVE-DRF-SUP-39 failed list retry recovers %j",
    async (error) => {
      mocked.mockRejectedValueOnce(error).mockResolvedValueOnce([]);
      open("/requests");
      await screen.findByRole("alert");
      click("Retry");
      expect(await screen.findByText(/No saved drafts yet/)).toBeTruthy();
      expect(mocked).toHaveBeenCalledTimes(2);
    },
  );
  it.each(["resolve", "reject"])(
    "EVE-DRF-SUP-40 ignores late list %s after navigation",
    async (outcome) => {
      const pending = deferred<DraftRecord[]>();
      mocked.mockReturnValue(pending.promise);
      const view = open("/requests");
      view.unmount();
      await act(async () => {
        if (outcome === "resolve") pending.resolve([]);
        else pending.reject("late");
      });
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );
  /** EVE-DRF-10-A: the page enforces the 50 MB limit on a single file (Q2-018). */
  it.each([52428799, 52428800, 52428801])(
    "Q2-018 file size boundary %s bytes",
    async (size) => {
      mockDraftWithFacilityOptions(draft({ formStep: 1 }));
      open();
      const input = await screen.findByLabelText("Supporting files");
      // Override size instead of allocating ~50MB of real bytes: the total
      // check runs off file.size, and oversized files are rejected before the
      // file is ever read.
      const file = new File([new Uint8Array(1)], "size.txt");
      Object.defineProperty(file, "size", { value: size });
      fireEvent.change(input, {
        target: { files: [file] },
      });
      if (size > 52428800) {
        // EVE-DRF-10-A: an oversize file shows the documented total-size message.
        expect((await screen.findByRole("alert")).textContent).toContain(
          "Use up to five files, 50 MB total.",
        );
      }
      else {
        await screen.findByText("size.txt");
        save();
        await screen.findByRole("dialog");
        const call = mocked.mock.calls.find(
          ([, init]) => init?.method === "PUT",
        )!;
        expect(
          JSON.parse(call[1]!.body as string).fields.attachments[0],
        ).toMatchObject({ size, type: "application/octet-stream" });
      }
    },
  );
  it.each([4, 5, 6])("EVE-DRF-SUP-41 file count boundary %s", async (count) => {
    mockDraftWithFacilityOptions(draft({ formStep: 1 }));
    open();
    const input = await screen.findByLabelText("Supporting files");
    fireEvent.change(input, {
      target: {
        files: Array.from(
          { length: count },
          (_, i) => new File(["x"], `file-${i}.txt`, { type: "text/plain" }),
        ),
      },
    });
    if (count > 5) expect(await screen.findByRole("alert")).toBeTruthy();
    else {
      await screen.findByText("file-0.txt");
      expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(
        count,
      );
      fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
      expect(screen.queryByText("file-0.txt")).toBeNull();
    }
  });
  it("EVE-DRF-SUP-42 cancelled file selection is harmless and read failure allows retry", async () => {
    mockDraftWithFacilityOptions(draft({ formStep: 1 }));
    open();
    const input = await screen.findByLabelText("Supporting files");
    fireEvent.change(input, { target: { files: null } });
    fireEvent.change(input, { target: { files: [] } });
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(
      function (this: FileReader) {
        this.dispatchEvent(new Event("error"));
      },
    );
    fireEvent.change(input, {
      target: { files: [new File(["x"], "bad.txt")] },
    });
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Unable to read",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save draft" })).toHaveProperty(
        "disabled",
        false,
      ),
    );
  });
});
