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
import { EventCreatePage } from "./EventCreatePage";
import { MyRequestsPage } from "./MyRequestsPage";
import { api, ApiError } from "@/utils/api";
import type { DraftRecord } from "@/types/draft";
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
  it("Q2-022 rapid save clicks issue only one request", async () => {
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
  it("Q2-023 back navigation preserves data and server attachment errors are visible", async () => {
    mocked
      .mockResolvedValueOnce(draft({ formStep: 2 }))
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
    "Q2-001 saves incomplete values from wizard step %s",
    async (formStep) => {
      mocked.mockResolvedValue(draft({ formStep, purpose: "", startTime: "" }));
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
    "Q2-002 legacy or invalid saved step %j falls back to basic fields",
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
    "Q2-003 failed draft retrieval hides editing %j",
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
          .getByRole("link", { name: "Back to My drafts" })
          .getAttribute("href"),
      ).toBe("/requests");
    },
  );
  it.each(["resolve", "reject"])(
    "Q2-004 ignores late load %s after leaving the editor",
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
    expect(mocked.mock.calls[1]).toEqual(mocked.mock.calls[0]);
    const first = JSON.parse(mocked.mock.calls[0][1]!.body as string),
      last = JSON.parse(mocked.mock.calls[2][1]!.body as string);
    expect(last).toMatchObject({ version: 1, fields: { name: "After" } });
    expect(last.operationId).not.toBe(first.operationId);
  });
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
  it("Q2-008 confirmation supports keyboard and returns to My drafts", async () => {
    mocked.mockResolvedValueOnce(draft()).mockResolvedValueOnce([]);
    open("/events/create");
    save();
    const dialog = await screen.findByRole("dialog");
    expect(fireEvent.keyDown(dialog, { key: "Tab" })).toBe(false);
    expect(fireEvent.keyDown(dialog, { key: "Escape" })).toBe(true);
    click("OK");
    expect(await screen.findByText(/No saved drafts yet/)).toBeTruthy();
  });
  it("Q2-009 saved draft submits through requests API and replaces existing event in store", async () => {
    const event = { id, name: "Workshop" };
    useAppStore.setState({ events: [event, { id: "other" }] as never });
    mocked
      .mockResolvedValueOnce(draft({ formStep: 2 }))
      .mockResolvedValueOnce({ ...draft(), version: 2 })
      .mockResolvedValueOnce({ event });
    open();
    await screen.findByLabelText("Equipment needs");
    click(/Submit for Review/);
    await screen.findByText("Event submitted");
    expect(mocked.mock.calls[1][1]?.method).toBe("PUT");
    expect(mocked.mock.calls[2][0]).toBe(`/requests/${id}/submit`);
    expect(JSON.parse(mocked.mock.calls[2][1]!.body as string).version).toBe(2);
    expect(useAppStore.getState().events.map((e) => e.id)).toEqual([
      id,
      "other",
    ]);
  });
  it.each([new ApiError("Rejected", { equipmentNeeds: "Invalid" }), "unknown"])(
    "Q2-010 failed submission keeps draft data %j",
    async (error) => {
      mocked
        .mockResolvedValueOnce(draft({ formStep: 2 }))
        .mockResolvedValueOnce({ ...draft(), version: 2 })
        .mockRejectedValueOnce(error);
      open();
      await screen.findByLabelText("Equipment needs");
      click(/Submit for Review/);
      expect((await screen.findByRole("alert")).textContent).toBe(
        error instanceof Error
          ? "Rejected"
          : "Unable to submit. Please try again.",
      );
      expect(screen.getByText("Workshop")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: /Submit for Review/ }),
      ).toHaveProperty("disabled", false);
    },
  );
  it.each(["0", "1", "2", "2147483646", "2147483647", "2147483648"])(
    "Q2-011 attendance boundary %s on submission",
    async (expectedAttendance) => {
      mocked.mockResolvedValue(draft({ formStep: 1, expectedAttendance }));
      open();
      await screen.findByLabelText(/Expected attendance/);
      click(/Continue/);
      const valid =
        Number(expectedAttendance) >= 1 &&
        Number(expectedAttendance) <= 2147483647;
      if (valid) expect(screen.getByLabelText("Equipment needs")).toBeTruthy();
      else expect(screen.getByText(/positive whole number/)).toBeTruthy();
      expect(mocked).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["09:59", "10:00", "10:01"])(
    "Q2-012 end time %s relative to start 10:00",
    async (endTime) => {
      mocked.mockResolvedValue(draft({ formStep: 1, endTime }));
      open();
      await screen.findByLabelText(/End time/);
      click(/Continue/);
      if (endTime === "10:01")
        expect(screen.getByLabelText("Equipment needs")).toBeTruthy();
      else expect(screen.getByText("End must be after start.")).toBeTruthy();
    },
  );
  it("Q2-013 missing required basic fields in resumed review returns to step one", async () => {
    mocked.mockResolvedValue(
      draft({ formStep: 2, name: "", purpose: "", description: "" }),
    );
    open();
    await screen.findByLabelText("Equipment needs");
    click(/Submit for Review/);
    expect(screen.getByText("Enter the purpose of your event.")).toBeTruthy();
    expect(mocked).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["bad-date", "11:00"],
    ["2030-01-02", "bad-time"],
  ])(
    "Q2-014 corrupt persisted schedule %s %s cannot submit",
    async (startDate, endTime) => {
      mocked.mockResolvedValue(draft({ formStep: 1, startDate, endTime }));
      open();
      await screen.findByLabelText(/Start date/);
      click(/Continue/);
      expect(screen.queryByLabelText("Equipment needs")).toBeNull();
      expect(mocked).toHaveBeenCalledTimes(1);
    },
  );
  it("Q2-015 list keeps unnamed drafts and excludes submitted requests", async () => {
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
    expect(
      screen
        .getByRole("link", { name: "Untitled event request" })
        .getAttribute("href"),
    ).toBe(`/requests/${id}`);
    expect(
      screen.queryByRole("link", { name: "Workshop" }),
    ).toBeNull();
    expect(screen.queryByText("Submitted")).toBeNull();
  });
  it.each([new Error("List unavailable"), "unknown"])(
    "Q2-016 failed list retry recovers %j",
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
    "Q2-017 ignores late list %s after navigation",
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
  it.each([52428799, 52428800, 52428801])(
    "Q2-018 file size boundary %s bytes",
    async (size) => {
      mocked.mockResolvedValue(draft({ formStep: 1 }));
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
      if (size > 52428800) expect(await screen.findByRole("alert")).toBeTruthy();
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
  it.each([4, 5, 6])("Q2-019 file count boundary %s", async (count) => {
    mocked.mockResolvedValue(draft({ formStep: 1 }));
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
  it("Q2-020 cancelled file selection is harmless and read failure allows retry", async () => {
    mocked.mockResolvedValue(draft({ formStep: 1 }));
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
