/*
 * SPM-139 coordinator form. The HTTP client is mocked at its boundary; the form, its rules and its messages are real.
 * Oracles are literals from the resolved spec: SET-OK, and the messages in backend registration-settings.messages.ts.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchRegistrationSettings,
  saveRegistrationSettings,
  type RegistrationSettings,
} from "@/features/events/api/registration-settings-api";
import { RegistrationSettingsForm } from "@/features/events/pages/detail/registration/RegistrationSettingsForm";
import { ApiError } from "@/utils/api";

vi.mock("@/features/events/api/registration-settings-api", () => ({
  fetchRegistrationSettings: vi.fn(),
  saveRegistrationSettings: vi.fn(),
}));

const fetchMock = vi.mocked(fetchRegistrationSettings);
const saveMock = vi.mocked(saveRegistrationSettings);
const START = "2026-11-07T10:00:00.000Z";
const EVENT_ID = "00000000-0000-4000-8000-000000000139";

function settings(overrides: Partial<RegistrationSettings> = {}): RegistrationSettings {
  return {
    eventId: EVENT_ID,
    registrationEnabled: false,
    registrationOpensAt: null,
    registrationClosesAt: null,
    capacity: 1,
    confirmedCount: 0,
    version: 0,
    ...overrides,
  };
}

function renderForm(status = "planning", initial = settings(), onSaved = vi.fn()) {
  fetchMock.mockResolvedValue(initial);
  render(<RegistrationSettingsForm eventId={EVENT_ID} startDateTime={START} status={status} onSaved={onSaved} />);
  return { onSaved };
}

async function fillSetOk(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByLabelText("Registration enabled"));
  await user.type(screen.getByLabelText("Registration opens (SGT)"), "2026-10-19T09:00");
  await user.type(screen.getByLabelText("Registration closes (SGT)"), "2026-10-28T23:59");
  await user.clear(screen.getByLabelText("Registration capacity"));
  await user.type(screen.getByLabelText("Registration capacity"), "50");
}

beforeEach(() => {
  fetchMock.mockReset();
  saveMock.mockReset();
});
afterEach(() => cleanup());

describe("SPM-139 coordinator registration settings form", () => {
  // 01-A: enabling and saving SET-OK sends the instants with offsets and the loaded version.
  it("CONFIG-REG-01-A: saves SET-OK with the version it loaded and reports success", async () => {
    const user = userEvent.setup();
    const { onSaved } = renderForm();
    saveMock.mockResolvedValue({
      ...settings({
        registrationEnabled: true,
        registrationOpensAt: "2026-10-19T01:00:00.000Z",
        registrationClosesAt: "2026-10-28T15:59:00.000Z",
        capacity: 50,
        version: 1,
      }),
      message: "Registration settings saved.",
    });

    await fillSetOk(user);
    await user.click(screen.getByRole("button", { name: "Save registration settings" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock).toHaveBeenCalledWith(EVENT_ID, {
      registrationEnabled: true,
      registrationOpensAt: "2026-10-19T09:00:00+08:00",
      registrationClosesAt: "2026-10-28T23:59:00+08:00",
      capacity: 50,
      version: 0,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Registration settings saved.");
    expect(onSaved).toHaveBeenCalled();
  });

  // Editable and read-only statuses (04-A, 04-B): the rule is explained on the field, nothing is sent, and the typed values stay.
  it("CONFIG-REG-06-B: explains a closing time after the start and keeps the typed values without saving", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillSetOk(user);
    await user.clear(screen.getByLabelText("Registration closes (SGT)"));
    await user.type(screen.getByLabelText("Registration closes (SGT)"), "2026-11-07T18:30");

    await user.click(screen.getByRole("button", { name: "Save registration settings" }));

    expect(await screen.findByText("Registration must close on or before the event start time.")).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Registration capacity")).toHaveValue("50");
  });

  // 05-B: a capacity that is not a positive whole number is refused in the form.
  it("CONFIG-REG-07-B: refuses a non-whole capacity with the capacity message", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByLabelText("Registration capacity");
    await user.clear(screen.getByLabelText("Registration capacity"));
    await user.type(screen.getByLabelText("Registration capacity"), "12abc");
    await user.click(screen.getByRole("button", { name: "Save registration settings" }));
    expect(await screen.findByText("Capacity must be a positive whole number.")).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
  });

  // The server's field error is shown on its field, not as a page-level message.
  it("shows a server field error on its field and keeps what was typed", async () => {
    const user = userEvent.setup();
    renderForm();
    saveMock.mockRejectedValue(
      new ApiError("Capacity cannot be lower than the number of Confirmed registrations (5).", { capacity: "Capacity cannot be lower than the number of Confirmed registrations (5)." }, "CAPACITY_BELOW_CONFIRMED", 422),
    );
    await screen.findByLabelText("Registration capacity");
    await user.clear(screen.getByLabelText("Registration capacity"));
    await user.type(screen.getByLabelText("Registration capacity"), "4");
    await user.click(screen.getByRole("button", { name: "Save registration settings" }));

    expect(await screen.findByText("Capacity cannot be lower than the number of Confirmed registrations (5).")).toBeInTheDocument();
    expect(screen.getByLabelText("Registration capacity")).toHaveValue("4");
  });

  // 06-F: a stale save is refused; the form offers a reload and does not overwrite anything.
  it("CONFIG-REG-X-03: shows the conflict message with a Reload action on SETTINGS_CONFLICT", async () => {
    const user = userEvent.setup();
    renderForm();
    saveMock.mockRejectedValue(new ApiError("These settings were changed elsewhere.", undefined, "SETTINGS_CONFLICT", 409));
    await fillSetOk(user);
    await user.click(screen.getByRole("button", { name: "Save registration settings" }));

    expect(await screen.findByText("These settings were changed elsewhere. Reload and try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  // 09-B and 09-C: a cancelled or rejected event shows its saved settings with no Save.
  it.each([
    ["cancelled", "Registration details can only be set while the event is Approved, Planning or Confirmed."],
    ["rejected", "Registration details can only be set while the event is Approved, Planning or Confirmed."],
    ["completed", "Registration details can only be set while the event is Approved, Planning or Confirmed."],
    ["submitted", "Registration details can only be set while the event is Approved, Planning or Confirmed."],
  ])("CONFIG-REG-04-B: a %s event is read-only with its message and no Save", async (status, message) => {
    renderForm(status, settings({ registrationEnabled: true, capacity: 10, registrationOpensAt: "2026-10-19T01:00:00.000Z", registrationClosesAt: "2026-10-28T15:59:00.000Z", version: 2 }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save registration settings" })).not.toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("shows a load failure as an alert", async () => {
    fetchMock.mockRejectedValue(new ApiError("Request failed."));
    render(<RegistrationSettingsForm eventId={EVENT_ID} startDateTime={START} status="planning" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Request failed.");
  });
});

// The registration end may not be after the event start. The warning appears as soon as it is entered and blocks Save.
describe("registration end against the event start (live)", () => {
  const startWarning = "Registration must close on or before the event start time.";

  // Kills: FM2 (the start rule disabled, so the end date is accepted until Save)
  it("CONFIG-REG-06-B: warns as soon as the end is after the start, keeps Save off and sends nothing", async () => {
    const user = userEvent.setup();
    renderForm();
    const closes = await screen.findByLabelText("Registration closes (SGT)");
    await user.type(closes, "2026-11-07T18:30");

    expect(await screen.findByText(startWarning)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save registration settings" })).toBeDisabled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  // No mutant id: guards the live warning staying after the end is corrected to the start.
  it("CONFIG-REG-06-B: clears the warning when the end is moved back to the start instant", async () => {
    const user = userEvent.setup();
    renderForm();
    const closes = await screen.findByLabelText("Registration closes (SGT)");
    await user.type(closes, "2026-11-07T18:30");
    expect(await screen.findByText(startWarning)).toBeInTheDocument();

    await user.clear(closes);
    await user.type(closes, "2026-11-07T18:00");

    expect(screen.queryByText(startWarning)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save registration settings" })).toBeEnabled();
  });
});

// v2.0 AC4: the form is editable in Approved, Planning and Confirmed, and read-only in every other status.
describe("settings form: editable statuses (v2.0 AC4)", () => {
  // No mutant id: guards one editable status left read-only (the other tests render only Planning).
  it.each(["approved", "planning", "confirmed"])("CONFIG-REG-04-A: %s: Save is shown and enabled", async (status) => {
    renderForm(status);
    expect(await screen.findByRole("button", { name: "Save registration settings" })).toBeEnabled();
  });
});

// v2.0 AC1 and AC2: a registration cannot be turned on without its closing time.
describe("settings form: enabling needs the closing time", () => {
  // No mutant id: guards enabling accepted with only the opening time.
  it("CONFIG-REG-01-E: refuses enabling with an opening time but no closing time, and sends nothing", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillSetOk(user);
    await user.clear(screen.getByLabelText("Registration closes (SGT)"));
    await user.click(screen.getByRole("button", { name: "Save registration settings" }));
    expect(await screen.findByText("Set the registration period and capacity before turning registration on.")).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
  });
});

// v2.0 AC5 to AC7 on the form: errors on entry, errors clearing on correction, and whole-number capacity.
describe("settings form: v2.0 closing-time and capacity cases", () => {
  const closingWarning = "Registration closing time must be after the opening time.";
  const startWarning = "Registration must close on or before the event start time.";
  const capacityWarning = "Capacity must be a positive whole number.";

  // Kills: FM3 (the closing error from the last Save persists after the closing time is corrected)
  it("CONFIG-REG-05-A: the closing-time error clears when corrected and the save is accepted", async () => {
    const user = userEvent.setup();
    renderForm();
    saveMock.mockRejectedValueOnce(
      new ApiError(closingWarning, { registrationClosesAt: closingWarning }, "INVALID_PERIOD", 422),
    );
    saveMock.mockResolvedValue({ ...settings({ registrationEnabled: true, registrationOpensAt: "2026-10-19T01:00:00.000Z", registrationClosesAt: "2026-10-28T15:59:00.000Z", capacity: 50, version: 1 }), message: "Registration settings saved." });
    await fillSetOk(user);
    await user.click(screen.getByRole("button", { name: "Save registration settings" }));
    expect(await screen.findByText(closingWarning)).toBeInTheDocument();
    expect(saveMock).toHaveBeenCalledTimes(1);

    const closes = screen.getByLabelText("Registration closes (SGT)");
    await user.clear(closes);
    await user.type(closes, "2026-10-28T23:59");

    expect(screen.queryByText(closingWarning)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save registration settings" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
  });

  // Kills: FM1 (a closing time equal to the opening time accepted by the form)
  it("CONFIG-REG-05-B: the form rejects a closing time not after the opening time and keeps the typed values", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillSetOk(user);
    const closes = screen.getByLabelText("Registration closes (SGT)");
    await user.clear(closes);
    await user.type(closes, "2026-10-19T09:00");
    expect(await screen.findByText(closingWarning)).toBeInTheDocument();
    expect(screen.getByLabelText("Registration opens (SGT)")).toHaveValue("2026-10-19T09:00");
    expect(screen.getByLabelText("Registration capacity")).toHaveValue("50");
    expect(saveMock).not.toHaveBeenCalled();
  });

  // Kills: FM2 (the form accepts a closing time after the event start)
  it("CONFIG-REG-06-B: the form refuses a closing time after the event start and keeps the values", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillSetOk(user);
    const closes = screen.getByLabelText("Registration closes (SGT)");
    await user.clear(closes);
    await user.type(closes, "2026-11-07T18:30");
    expect(await screen.findByText(startWarning)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save registration settings" })).toBeDisabled();
    expect(screen.getByLabelText("Registration opens (SGT)")).toHaveValue("2026-10-19T09:00");
    expect(saveMock).not.toHaveBeenCalled();
  });

  // Kills: FM4 (surrounding spaces not trimmed, so " 25 " is refused)
  it('CONFIG-REG-07-A: capacities "25", " 25 " and "1000" are saved as whole numbers', async () => {
    const user = userEvent.setup();
    const sent: number[] = [];
    saveMock.mockImplementation(async (_eventId, body) => {
      sent.push(body.capacity as number);
      return { ...settings({ registrationEnabled: true, registrationOpensAt: "2026-10-19T01:00:00.000Z", registrationClosesAt: "2026-10-28T15:59:00.000Z", capacity: body.capacity as number, version: 1 }), message: "Registration settings saved." };
    });
    renderForm();
    await fillSetOk(user);
    for (const [index, text] of ["25", " 25 ", "1000"].entries()) {
      const capacity = screen.getByLabelText("Registration capacity");
      await user.clear(capacity);
      await user.type(capacity, text);
      const save = screen.getByRole("button", { name: "Save registration settings" });
      await waitFor(() => expect(save).toBeEnabled());
      await user.click(save);
      await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(index + 1));
    }
    expect(sent).toEqual([25, 25, 1000]);
  });

  // Kills: FM5 (a value with trailing letters accepted, as parseInt would do)
  it("CONFIG-REG-07-B: the form refuses a non-whole capacity and keeps the value typed", async () => {
    const user = userEvent.setup();
    renderForm("planning", settings({ registrationEnabled: true, registrationOpensAt: "2026-10-19T01:00:00.000Z", registrationClosesAt: "2026-10-28T15:59:00.000Z", capacity: 50, version: 1 }));
    const capacity = await screen.findByLabelText("Registration capacity");
    for (const text of ["0", "-5", "2.5", "abc", "12abc"]) {
      await user.clear(capacity);
      await user.type(capacity, text);
      await user.click(screen.getByRole("button", { name: "Save registration settings" }));
      expect(await screen.findByText(capacityWarning)).toBeInTheDocument();
      expect(capacity).toHaveValue(text);
    }
    expect(saveMock).not.toHaveBeenCalled();
  });
});

// Extension case CONFIG-REG-X-03 on the form: a stale save offers Reload, and a save that fails without a server answer shows the fallback.
describe("CONFIG-REG-X-03: settings form stale save and failed save", () => {
  const conflict = "These settings were changed elsewhere. Reload and try again.";

  // Kills: FM6 (Reload clears the conflict but does not fetch the settings again)
  it("CONFIG-REG-X-03: Reload after a stale save fetches the settings again and clears the conflict", async () => {
    const user = userEvent.setup();
    renderForm();
    saveMock.mockRejectedValue(new ApiError(conflict, undefined, "SETTINGS_CONFLICT", 409));
    await fillSetOk(user);
    await user.click(screen.getByRole("button", { name: "Save registration settings" }));
    expect(await screen.findByText(conflict)).toBeInTheDocument();
    const fetchesBefore = fetchMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Reload" }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(fetchesBefore + 1));
    expect(screen.queryByText(conflict)).not.toBeInTheDocument();
  });

  // Kills: FM7 (a save that fails without a server answer shows an empty message instead of the generic one)
  it("CONFIG-REG-X-03: a save that fails without a server answer shows the generic message", async () => {
    const user = userEvent.setup();
    renderForm();
    saveMock.mockRejectedValue(new Error("network down"));
    await fillSetOk(user);
    await user.click(screen.getByRole("button", { name: "Save registration settings" }));
    expect(await screen.findByText("Registration settings could not be saved.")).toBeInTheDocument();
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});

describe("settings form: server and load errors not covered by a field", () => {
  it("shows the generic load message when the settings cannot be fetched", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<RegistrationSettingsForm eventId={EVENT_ID} startDateTime={START} status="planning" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Registration settings could not be loaded.");
  });

  it("shows the server message when a save fails without field errors", async () => {
    const user = userEvent.setup();
    renderForm();
    saveMock.mockRejectedValue(new ApiError("Server is busy, try again.", undefined, undefined, 503));
    await fillSetOk(user);
    await user.click(screen.getByRole("button", { name: "Save registration settings" }));
    expect(await screen.findByText("Server is busy, try again.")).toBeInTheDocument();
  });

  it("shows the server message when its field errors match no field on the form", async () => {
    const user = userEvent.setup();
    renderForm();
    saveMock.mockRejectedValue(new ApiError("Some settings were refused.", { somethingElse: "x" }, undefined, 422));
    await fillSetOk(user);
    await user.click(screen.getByRole("button", { name: "Save registration settings" }));
    expect(await screen.findByText("Some settings were refused.")).toBeInTheDocument();
  });

  it("CONFIG-REG-01-C: shows a disabled event with no dates as Disabled and Not set, read-only", async () => {
    renderForm("completed", settings({ registrationEnabled: false, capacity: 7 }));
    expect(await screen.findByText("Disabled")).toBeInTheDocument();
    expect(screen.getAllByText("Not set")).toHaveLength(2);
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});

describe("settings form: server field errors, in-flight save and stale messages", () => {
  const savedOk = {
    ...settings({
      registrationEnabled: true,
      registrationOpensAt: "2026-10-19T01:00:00.000Z",
      registrationClosesAt: "2026-10-28T15:59:00.000Z",
      capacity: 50,
      version: 1,
    }),
    message: "Registration settings saved.",
  };
  const saveButton = () => screen.getByRole("button", { name: "Save registration settings" });

  it("shows a server registrationOpensAt error on the opening field", async () => {
    const user = userEvent.setup();
    renderForm();
    saveMock.mockRejectedValue(
      new ApiError("Refused.", { registrationOpensAt: "Enter the opening time with an offset." }, "INVALID_DATETIME", 400),
    );
    await fillSetOk(user);
    await user.click(saveButton());
    const opens = screen.getByLabelText("Registration opens (SGT)");
    expect(await screen.findByText("Enter the opening time with an offset.")).toBeInTheDocument();
    expect(opens).toHaveAccessibleDescription(/Enter the opening time with an offset\./);
  });

  it("disables Save while a save is in flight and enables it again when the save ends", async () => {
    const user = userEvent.setup();
    renderForm();
    let finish: (value: typeof savedOk) => void = () => {};
    saveMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await fillSetOk(user);
    await user.click(saveButton());

    const busy = await screen.findByRole("button", { name: "Saving…" });
    expect(busy).toBeDisabled();
    finish(savedOk);
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("removes the saved message when a field is edited afterwards", async () => {
    const user = userEvent.setup();
    renderForm();
    saveMock.mockResolvedValue(savedOk);
    await fillSetOk(user);
    await user.click(saveButton());
    expect(await screen.findByText("Registration settings saved.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Registration capacity"), "1");

    expect(screen.queryByText("Registration settings saved.")).not.toBeInTheDocument();
  });

  it("clears a server form error when the same form is saved again", async () => {
    const user = userEvent.setup();
    renderForm();
    saveMock.mockRejectedValueOnce(new ApiError("Server is busy, try again.", undefined, undefined, 503));
    saveMock.mockResolvedValue(savedOk);
    await fillSetOk(user);
    await user.click(saveButton());
    expect(await screen.findByText("Server is busy, try again.")).toBeInTheDocument();

    await user.click(saveButton());

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Server is busy, try again.")).not.toBeInTheDocument();
  });

  it("clears a server field error when the same form is saved again", async () => {
    const user = userEvent.setup();
    renderForm();
    saveMock.mockRejectedValueOnce(new ApiError("Refused.", { capacity: "Capacity is too big." }, "INVALID_CAPACITY", 422));
    saveMock.mockResolvedValue(savedOk);
    await fillSetOk(user);
    await user.click(saveButton());
    expect(await screen.findByText("Capacity is too big.")).toBeInTheDocument();

    await user.click(saveButton());

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Capacity is too big.")).not.toBeInTheDocument();
  });
});

describe("settings form: a server error on the enabled switch", () => {
  it("shows the server error under the registration switch", async () => {
    const user = userEvent.setup();
    renderForm();
    saveMock.mockRejectedValue(new ApiError("Registration enabled must be true or false.", { registrationEnabled: "Registration enabled must be true or false." }, undefined, 400));
    await fillSetOk(user);
    await user.click(screen.getByRole("button", { name: "Save registration settings" }));
    expect(await screen.findByText("Registration enabled must be true or false.")).toBeInTheDocument();
  });
});
