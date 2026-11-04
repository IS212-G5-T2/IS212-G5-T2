import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { fetchRegistrationSettings, saveRegistrationSettings } from "./registration-settings-api";

vi.mock("@/utils/api", () => ({ api: vi.fn() }));
const apiMock = vi.mocked(api);

beforeEach(() => apiMock.mockReset());

describe("SPM-139 registration settings API", () => {
  it("reads the saved settings of one event", () => {
    fetchRegistrationSettings("evt-1");
    expect(apiMock).toHaveBeenCalledWith("/events/evt-1/registration-settings");
  });

  it("saves a partial change with PUT, sending the version the form loaded", () => {
    const body = { registrationEnabled: true, capacity: 50, version: 3 };
    saveRegistrationSettings("evt-1", body as never);
    expect(apiMock).toHaveBeenCalledWith("/events/evt-1/registration-settings", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  });
});
