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
  it("saves SET-OK with the version it loaded and reports success", async () => {
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

  // 04-B and 04-C: the rule is explained on the field, nothing is sent, and the typed values stay.
  it("explains a closing time after the start and keeps the typed values without saving", async () => {
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
  it("refuses a non-whole capacity with the capacity message", async () => {
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
  it("shows the conflict message with a Reload action on SETTINGS_CONFLICT", async () => {
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
  ])("a %s event is read-only with its message and no Save", async (status, message) => {
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

  // Kills: RSF-LIVE-M1 (the rule checked only on Save, so the end date is accepted until then)
  it("warns as soon as the end is after the start, keeps Save off and sends nothing", async () => {
    const user = userEvent.setup();
    renderForm();
    const closes = await screen.findByLabelText("Registration closes (SGT)");
    await user.type(closes, "2026-11-07T18:30");

    expect(await screen.findByText(startWarning)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save registration settings" })).toBeDisabled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  // Kills: RSF-LIVE-M2 (the warning stays after the end is corrected to the start)
  it("clears the warning when the end is moved back to the start instant", async () => {
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
