// SPM-187: proves the clock and date helpers work, so neither ships as an unexercised code path. These need no
// database or login, so they use plain @playwright/test rather than ./fixtures.
import { expect, test } from "@playwright/test";
import { advanceClock, browserNow, freezeClock } from "./clock";
import { atUtcHour, calendarDayFromNow, isoDateFromNow } from "./dates";

test.describe("clock helper", () => {
  test("pins the browser's now and only moves when advanced", async ({ page }) => {
    await freezeClock(page, "2030-01-31T23:30:00.000Z");
    await page.setContent("<p>clock</p>");
    expect(await browserNow(page)).toBe("2030-01-31T23:30:00.000Z");
    await page.waitForTimeout(200);
    expect(await browserNow(page)).toBe("2030-01-31T23:30:00.000Z");
    await advanceClock(page, 60 * 60 * 1000);
    expect(await browserNow(page)).toBe("2030-02-01T00:30:00.000Z");
  });

  test("fires a page timer when the clock is advanced past it, without real waiting", async ({ page }) => {
    await freezeClock(page, "2030-06-01T00:00:00.000Z");
    await page.setContent("<p id='state'>holding</p>");
    await page.evaluate(() => {
      setTimeout(() => { document.getElementById("state")!.textContent = "expired"; }, 15 * 60 * 1000);
    });
    await expect(page.locator("#state")).toHaveText("holding");
    await advanceClock(page, 15 * 60 * 1000 + 1);
    await expect(page.locator("#state")).toHaveText("expired");
  });
});

test.describe("date helper", () => {
  const from = new Date("2030-01-30T22:00:00.000Z");
  test("crosses a month end", () => {
    expect(isoDateFromNow(2, from)).toBe("2030-02-01");
    expect(calendarDayFromNow(1, from)).toEqual({ year: 2030, month: 1, day: 31 });
  });
  test("crosses a year end and a leap day", () => {
    expect(isoDateFromNow(2, new Date("2030-12-30T12:00:00Z"))).toBe("2031-01-01");
    expect(isoDateFromNow(1, new Date("2032-02-28T12:00:00Z"))).toBe("2032-02-29");
  });
  test("is unaffected by a DST change 30 days out", () => {
    expect(isoDateFromNow(30, new Date("2030-03-01T00:00:00Z"))).toBe("2030-03-31");
    expect(isoDateFromNow(30, new Date("2030-10-10T23:59:59Z"))).toBe("2030-11-09");
  });
  test("atUtcHour pins the time of day", () => {
    expect(atUtcHour(2, 10, from).toISOString()).toBe("2030-02-01T10:00:00.000Z");
  });
});
