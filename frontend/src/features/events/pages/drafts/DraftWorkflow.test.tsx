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
  // Kills: two rapid clicks on Save draft sending two requests (no in-flight guard).
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
  // Kills: Back dropping the typed expected attendance, or a server attachment error not shown after the next save.
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
  // Kills: an incomplete draft rejected on save, formStep missing from the PUT body, or a POST issued for a draft save.
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
  // Kills: an undefined, negative, out-of-range or fractional saved step not falling back to Basic Information, or the saved name not prefilled.
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
  // Kills: a failed draft load still rendering editable fields, or the alert text or the Back To My Drafts link changed.
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
  /** EVE-DRF-SUP-31: a late draft load result that arrives after the editor is left does not start another load. */
  it.each(["resolve", "reject"])(
    "EVE-DRF-SUP-31 ignores late load %s after leaving the editor",
    async (outcome) => {
      const pending = deferred<DraftRecord>();
      mocked.mockReturnValue(pending.promise);
      const view = open();
      expect(screen.getByRole("status")).toBeTruthy();
      expect(mocked).toHaveBeenCalledTimes(1);
      view.unmount();
      await act(async () => {
        if (outcome === "resolve") pending.resolve(draft());
        else pending.reject(new Error("late"));
      });
      // After unmount the DOM is gone, so only the load mock is observable: the late result must not start another load.
      expect(mocked).toHaveBeenCalledTimes(1);
    },
  );
  // Kills: the retry after a failed save using a new operation id, or the later edit sent with the original operation id.
  /** EVE-DRF-06-A: a failed save is retried with the same operation before newer edits (EVE-DRF-SUP-48). */
  it("EVE-DRF-SUP-48 retries uncertain operation before saving edits made after failure", async () => {
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
  // Kills: the corrected save reusing the rejected operation id, or the old 'Too long' error still shown after correction.
  /** EVE-DRF-06-B: a field validation error allows a corrected save with a new operation (EVE-DRF-SUP-49). */
  it("EVE-DRF-SUP-49 field validation error allows corrected payload with a new operation", async () => {
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
  // Kills: Save draft enabled while a save is pending, a second request on form submit, or the 'Unable to save draft' fallback missing.
  /** EVE-DRF-06-A: a failed save keeps input and pending controls prevent duplicate submission (EVE-DRF-SUP-50). */
  it("EVE-DRF-SUP-50 save fallback message retains input and pending controls prevent duplicate submission", async () => {
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
  // Kills: the confirmation dialog not preventing the default action on Tab, Escape being default-prevented (the test checks only that Escape is not prevented), or OK not returning to My Drafts.
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
  // Kills: submission sending a version other than the saved one, or the store replacing the wrong event (duplicate or dropped entries).
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
  // Kills: a failed submission clearing the draft or leaving Submit For Review disabled, or the server message not shown.
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
  // Parent AC (SUPPORTING): SPM-37 AC2 (low confidence: submission boundary, closest draft AC)
  // Kills: expected attendance accepted outside 1 to 2147483647, or rejected inside that range (off-by-one at either end).
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
  // Parent AC (SUPPORTING): SPM-37 AC2 (low confidence: submission boundary, closest draft AC)
  // Kills: an end time equal to or before the 10:00 start accepted, or 10:01 rejected.
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
  // Parent AC (SUPPORTING): SPM-37 AC5
  // Kills: a resumed review submitted without its basic fields, or the user not returned to Basic Information.
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
  // Parent AC (SUPPORTING): SPM-37 AC5
  // Kills: a corrupt persisted start date or end time allowed to proceed to the Equipment step.
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
  // Kills: submitted requests listed under My Drafts, or an untitled draft not linking to its editor.
  /** EVE-DRF-03: My Drafts lists only drafts; submitted requests are excluded (EVE-DRF-SUP-51). */
  it("EVE-DRF-SUP-51 list shows only drafts; submitted requests are excluded (moved to My Events)", async () => {
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
  // Kills: the empty-state message missing when every request is submitted, or a submitted request still shown.
  /** EVE-DRF-03: My Drafts shows the empty state when every request is submitted (EVE-DRF-SUP-52). */
  it("EVE-DRF-SUP-52 shows the draft empty state when every request is submitted", async () => {
    mocked.mockResolvedValue([
      { ...draft(), id: "submitted", status: "Submitted", eventId: id },
    ]);
    open("/requests");
    expect(await screen.findByText(/No saved drafts yet/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Workshop" })).toBeNull();
  });
  // Kills: Retry not requesting the list again, or the empty state not shown after a successful retry.
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
  /** EVE-DRF-SUP-40: a late draft list result that arrives after navigation does not start a retry or another list load. */
  it.each(["resolve", "reject"])(
    "EVE-DRF-SUP-40 ignores late list %s after navigation",
    async (outcome) => {
      const pending = deferred<DraftRecord[]>();
      mocked.mockReturnValue(pending.promise);
      const view = open("/requests");
      expect(mocked).toHaveBeenCalledTimes(1);
      view.unmount();
      await act(async () => {
        if (outcome === "resolve") pending.resolve([]);
        else pending.reject("late");
      });
      // After unmount only the list mock is observable: the late result must not start a retry or another list load.
      expect(mocked).toHaveBeenCalledTimes(1);
    },
  );
  // Parent AC (SUPPORTING): SPM-37 AC6 (low confidence: file size error)
  // Kills: a 50 MB file (52428800 bytes) rejected, a file one byte over accepted, or the size and type missing from the payload.
  /** EVE-DRF-10-A: the page enforces the 50 MB limit on a single file (EVE-DRF-SUP-53). */
  it.each([52428799, 52428800, 52428801])(
    "EVE-DRF-SUP-53 file size boundary %s bytes",
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
  // Parent AC (SUPPORTING): SPM-37 AC5 (low confidence: file count, closest draft AC)
  // Kills: a sixth file accepted, or a file set of five or fewer rejected, or Remove failing to drop the selected file.
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
  // Parent AC (SUPPORTING): SPM-37 AC6
  // Kills: a FileReader error that shows no "Unable to read" alert or leaves Save draft disabled (no retry). Null and empty selections are exercised but their outcome is not asserted.
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
