// frontend/src/pages/venue-records/VenueRecordsPage.test.tsx
// SPM-124: AC2/3/4/5/6; VEN-VIEW-02-A/B, 03-A/B/C, 04-A/C, 05-A/B/C/D.
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "@/utils/api";
import { VenueRecordsPage } from "./VenueRecordsPage";
import type { VenueRecord } from "./venue-records";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);
const base: VenueRecord = {
  id: "00000000-0000-4000-8000-000000000124",
  name: "Conference Room",
  location: "North Wing",
  capacity: 80,
  facilities: ["Wi-Fi", "Projector"],
  layouts: ["Boardroom"],
  accessibility: ["Wheelchair access"],
  operatingInformation: "Weekdays",
  operatingDays: ["Monday"],
  operatingStartTime: "09:00",
  operatingEndTime: "18:00",
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
  image: {
    name: "conference.svg",
    type: "image/svg+xml",
    size: 24,
    dataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
  },
  availabilityStatus: "unavailable",
  unavailablePeriods: [
    {
      id: "period-1",
      start: "2026-10-05T00:00:00Z",
      end: "2026-10-06T00:00:00Z",
      reason: "Maintenance",
    },
  ],
  reservations: [
    {
      id: "booking-1",
      eventName: "Welcome Evening",
      start: "2026-10-05T12:00:00Z",
      end: "2026-10-05T14:00:00Z",
      status: "booked",
      affectedByUnavailablePeriod: true,
    },
  ],
};
const second: VenueRecord = {
  ...base,
  id: "00000000-0000-4000-8000-000000000125",
  name: "Auditorium",
  location: "South Wing",
  capacity: 200,
  image: undefined,
  availabilityStatus: "available",
  unavailablePeriods: [],
  reservations: [
    {
      id: "hold-1",
      eventName: "Workshop",
      start: "2026-10-08T12:00:00Z",
      end: "2026-10-08T14:00:00Z",
      status: "tentative",
      affectedByUnavailablePeriod: false,
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  apiMock.mockResolvedValue([base, second]);
});
afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <VenueRecordsPage />
    </MemoryRouter>,
  );
}

function namesInCards(): string[] {
  return within(screen.getByRole("list", { name: "Venue catalogue" }))
    .getAllByRole("listitem")
    .map(
      (card) =>
        within(card).getByRole("heading", { level: 2 }).textContent || "",
    );
}

describe("VenueRecordsPage (SPM-124)", () => {
  // VEN-VIEW-02-A (AC2): every seeded venue keeps its own required row fields.
  it("VEN-VIEW-02-A: shows all three venues with correct fields and status", async () => {
    // Arrange: use the three concrete records from the published test case.
    apiMock.mockResolvedValueOnce([
      {
        ...base,
        name: "Orchid Hall Test",
        capacity: 120,
        location: "Test Building Level 3",
        facilities: ["AV System", "Wi-Fi"],
        layouts: ["Classroom", "Theatre"],
      },
      {
        ...second,
        name: "Marina Auditorium Test",
        capacity: 300,
        location: "Main Building Level 1",
        facilities: ["Stage", "Wi-Fi"],
        layouts: ["Theatre"],
      },
      {
        ...second,
        id: "00000000-0000-4000-8000-000000000126",
        name: "Seminar Room 2 Test",
        capacity: 40,
        location: "Annex Level 2",
        facilities: ["Whiteboard", "Wi-Fi"],
        layouts: ["Classroom"],
      },
    ]);

    // Act: load the catalogue as Venue Staff.
    renderPage();
    await screen.findByRole("link", { name: "Orchid Hall Test" });

    // Assert: all three rows appear once and retain their own required values.
    expect(namesInCards()).toEqual([
      "Marina Auditorium Test",
      "Orchid Hall Test",
      "Seminar Room 2 Test",
    ]);
    const cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("300")).toBeInTheDocument();
    expect(
      within(cards[0]).getByText("Main Building Level 1"),
    ).toBeInTheDocument();
    expect(within(cards[0]).getByText("Stage")).toBeInTheDocument();
    expect(
      within(cards[0]).getByText("Layout options: Theatre"),
    ).toBeInTheDocument();
    expect(within(cards[0]).getByText("available")).toBeInTheDocument();
    expect(within(cards[1]).getByText("120")).toBeInTheDocument();
    expect(
      within(cards[1]).getByText("Test Building Level 3"),
    ).toBeInTheDocument();
    expect(within(cards[1]).getByText("AV System")).toBeInTheDocument();
    expect(
      within(cards[1]).getByText("Layout options: Classroom, Theatre"),
    ).toBeInTheDocument();
    expect(within(cards[1]).getByText("unavailable")).toBeInTheDocument();
    expect(within(cards[2]).getByText("40")).toBeInTheDocument();
    expect(within(cards[2]).getByText("Annex Level 2")).toBeInTheDocument();
    expect(within(cards[2]).getByText("Whiteboard")).toBeInTheDocument();
    expect(
      within(cards[2]).getByText("Layout options: Classroom"),
    ).toBeInTheDocument();
    expect(within(cards[2]).getByText("available")).toBeInTheDocument();
  });

  // AC4/6: the staff catalogue shows persistent schedule summaries.
  it("shows availability reasons, booking counts and tentative hold counts", async () => {
    // Arrange: two records include a closure, a booking and a tentative hold.
    renderPage();

    // Act: wait for the authenticated catalogue request to finish.
    expect(
      await screen.findByRole("link", { name: "Conference Room" }),
    ).toBeInTheDocument();

    // Assert: both venue records and their schedule data are visible.
    expect(apiMock).toHaveBeenCalledWith("/venues");
    expect(screen.getByText("North Wing")).toBeInTheDocument();
    expect(screen.getAllByText("Wi-Fi")).toHaveLength(2);
    expect(screen.getAllByText("Projector")).toHaveLength(2);
    expect(screen.getAllByText("Layout options: Boardroom")).toHaveLength(2);
    expect(
      screen.getByRole("img", { name: "Conference Room venue" }),
    ).toHaveAttribute("src", base.image?.dataUrl);
    expect(screen.getByText("No venue image")).toBeInTheDocument();
    expect(screen.getByText(/Maintenance/)).toBeInTheDocument();
    expect(
      screen.getByText("1 bookings · 0 tentative holds"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("0 bookings · 1 tentative holds"),
    ).toBeInTheDocument();
  });

  // VEN-VIEW-04-A (AC4): an active blockout makes its venue unavailable with a reason.
  it("VEN-VIEW-04-A: shows the current unavailable period and Maintenance reason", async () => {
    // Arrange: the API has already classified the fixed-time active period.
    apiMock.mockResolvedValueOnce([{ ...base, name: "Orchid Hall Test" }]);

    // Act: open the catalogue and wait for the venue row.
    renderPage();
    const card = (await screen.findByRole("link", { name: "Orchid Hall Test" }))
      .parentElement;

    // Assert: the unavailable state and its period reason belong to Orchid Hall.
    expect(card).not.toBeNull();
    expect(within(card!).getByText("unavailable")).toBeInTheDocument();
    expect(within(card!).getByText(/Maintenance/)).toBeInTheDocument();
    expect(within(card!).queryByText("available")).not.toBeInTheDocument();
  });

  // VEN-VIEW-04-C (AC4): a venue without blockouts has no invented reason.
  it("VEN-VIEW-04-C: shows no unavailable period for an available venue", async () => {
    // Arrange: Seminar Room 2 has no current or scheduled unavailable period.
    apiMock.mockResolvedValueOnce([
      {
        ...second,
        name: "Seminar Room 2 Test",
        unavailablePeriods: [],
      },
    ]);

    // Act: open the catalogue and wait for its only venue row.
    renderPage();
    const card = (
      await screen.findByRole("link", {
        name: "Seminar Room 2 Test",
      })
    ).parentElement;

    // Assert: the venue remains available and shows no fabricated period.
    expect(card).not.toBeNull();
    expect(within(card!).getByText("available")).toBeInTheDocument();
    expect(within(card!).queryByText(/Unavailable/)).not.toBeInTheDocument();
    expect(within(card!).queryByText(/Maintenance/)).not.toBeInTheDocument();
  });

  // SPM-124: selecting any part of a venue card opens that venue's details.
  it("opens the venue detail route when the card image is clicked", async () => {
    // Arrange: render the catalogue with a detail route for the selected venue.
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/venues"]}>
        <Routes>
          <Route path="/venues" element={<VenueRecordsPage />} />
          <Route
            path={`/venues/${base.id}`}
            element={<p>Venue detail opened</p>}
          />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("link", { name: "Conference Room" });

    // Act: click the image, outside the venue name.
    await user.click(
      screen.getByRole("img", { name: "Conference Room venue" }),
    );

    // Assert: the card link navigates to the venue detail route.
    expect(screen.getByText("Venue detail opened")).toBeInTheDocument();
  });

  // VEN-VIEW-03-A (AC3): the exact seeded venue name narrows the catalogue.
  it("VEN-VIEW-03-A: searches by venue name", async () => {
    // Arrange: load the three venues in the published test case.
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce([
      { ...base, name: "Orchid Hall Test" },
      { ...second, name: "Marina Auditorium Test" },
      {
        ...second,
        id: "00000000-0000-4000-8000-000000000126",
        name: "Seminar Room 2 Test",
      },
    ]);
    renderPage();
    await screen.findByRole("link", { name: "Orchid Hall Test" });

    // Act: a name search narrows the list.
    await user.type(
      screen.getByRole("textbox", { name: "Search by name or location" }),
      "Orchid Hall Test",
    );

    // Assert: only Orchid Hall remains and its data stays attached.
    expect(namesInCards()).toEqual(["Orchid Hall Test"]);
    expect(screen.getByText("North Wing")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
  });

  // VEN-VIEW-03-B (AC3): location search excludes records at other locations.
  it("VEN-VIEW-03-B: searches by venue location", async () => {
    // Arrange: the three venues have distinct published locations.
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce([
      { ...base, name: "Orchid Hall Test", location: "Test Building Level 3" },
      {
        ...second,
        name: "Marina Auditorium Test",
        location: "Main Building Level 1",
      },
      {
        ...second,
        id: "00000000-0000-4000-8000-000000000126",
        name: "Seminar Room 2 Test",
        location: "Annex Level 2",
      },
    ]);
    renderPage();
    await screen.findByRole("link", { name: "Seminar Room 2 Test" });

    // Act: search by the exact location from the case specification.
    await user.type(
      screen.getByRole("textbox", { name: "Search by name or location" }),
      "Annex Level 2",
    );

    // Assert: only the Annex venue remains; other location rows disappear.
    expect(namesInCards()).toEqual(["Seminar Room 2 Test"]);
    expect(screen.getByText("Annex Level 2")).toBeInTheDocument();
  });

  // VEN-VIEW-03-C (AC3): an unmatched query leaves no stale rows.
  it("VEN-VIEW-03-C: shows no venue rows for an unmatched search", async () => {
    // Arrange: a populated catalogue has loaded.
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "Conference Room" });

    // Act: enter the specified no-match search.
    await user.type(
      screen.getByRole("textbox", { name: "Search by name or location" }),
      "Nonexistent Venue 999",
    );

    // Assert: no old record is presented as a match and search remains usable.
    expect(
      screen.queryByRole("list", { name: "Venue catalogue" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Conference Room" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Search by name or location" }),
    ).toBeEnabled();
  });

  // VEN-VIEW-02-B (AC2): an empty data source must not invent catalogue rows.
  it("VEN-VIEW-02-B: shows no venue rows for an empty catalogue", async () => {
    // Arrange: the API returns no records.
    apiMock.mockResolvedValueOnce([]);

    // Act: load the catalogue.
    renderPage();
    await screen.findByText("No venue records yet.");

    // Assert: no previous or fabricated venue record remains.
    expect(
      screen.queryByRole("list", { name: "Venue catalogue" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Conference Room" }),
    ).not.toBeInTheDocument();
  });

  // VEN-VIEW-05-A (AC5): name order reverses without losing a venue.
  it("VEN-VIEW-05-A: sorts names in both directions", async () => {
    // Arrange: three distinct venue names arrive out of alphabetical order.
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce([
      { ...base, name: "Orchid Hall Test" },
      { ...second, name: "Marina Auditorium Test" },
      {
        ...base,
        id: "00000000-0000-4000-8000-000000000126",
        name: "Seminar Room 2 Test",
      },
    ]);
    renderPage();
    await screen.findByRole("link", { name: "Orchid Hall Test" });

    // Act and assert: the default ascending order reverses and can be restored.
    expect(namesInCards()).toEqual([
      "Marina Auditorium Test",
      "Orchid Hall Test",
      "Seminar Room 2 Test",
    ]);
    await user.click(screen.getByRole("button", { name: /^Name/ }));
    expect(namesInCards()).toEqual([
      "Seminar Room 2 Test",
      "Orchid Hall Test",
      "Marina Auditorium Test",
    ]);
    await user.click(screen.getByRole("button", { name: /^Name/ }));
    expect(namesInCards()).toEqual([
      "Marina Auditorium Test",
      "Orchid Hall Test",
      "Seminar Room 2 Test",
    ]);
  });

  // VEN-VIEW-05-B (AC5): capacity ordering is numeric, including single-digit values.
  it("VEN-VIEW-05-B: sorts capacities numerically in both directions", async () => {
    // Arrange: the specified capacities defeat lexicographic sorting.
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce([
      { ...base, capacity: 120 },
      { ...second, capacity: 3 },
      {
        ...base,
        id: "00000000-0000-4000-8000-000000000126",
        name: "Seminar Room",
        capacity: 300,
      },
      {
        ...base,
        id: "00000000-0000-4000-8000-000000000127",
        name: "Small Room",
        capacity: 40,
      },
    ]);
    renderPage();
    await screen.findByRole("link", { name: "Small Room" });

    // Act and assert: both directions retain all four distinct records.
    await user.click(screen.getByRole("button", { name: /^Capacity/ }));
    expect(namesInCards()).toEqual([
      "Auditorium",
      "Small Room",
      "Conference Room",
      "Seminar Room",
    ]);
    await user.click(screen.getByRole("button", { name: /^Capacity/ }));
    expect(namesInCards()).toEqual([
      "Seminar Room",
      "Conference Room",
      "Small Room",
      "Auditorium",
    ]);
  });

  // VEN-VIEW-05-C (AC5): location order reverses while records stay attached to rows.
  it("VEN-VIEW-05-C: sorts locations in both directions", async () => {
    // Arrange: known locations arrive out of order.
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce([
      { ...base, location: "Test Building Level 3" },
      { ...second, location: "Main Building Level 1" },
      {
        ...base,
        id: "00000000-0000-4000-8000-000000000126",
        name: "Seminar Room",
        location: "Annex Level 2",
      },
    ]);
    renderPage();
    await screen.findByRole("link", { name: "Seminar Room" });

    // Act and assert: the specified alphabetical orders are rendered.
    await user.click(screen.getByRole("button", { name: /^Location/ }));
    expect(namesInCards()).toEqual([
      "Seminar Room",
      "Auditorium",
      "Conference Room",
    ]);
    await user.click(screen.getByRole("button", { name: /^Location/ }));
    expect(namesInCards()).toEqual([
      "Conference Room",
      "Auditorium",
      "Seminar Room",
    ]);
  });

  // VEN-VIEW-05-D (AC5): status ordering must differ from the alphabetical name order.
  it("VEN-VIEW-05-D: sorts an asymmetric three-venue status fixture", async () => {
    // Arrange: names and statuses deliberately produce different orderings.
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce([
      { ...base, id: "00000000-0000-4000-8000-000000000129", name: "Alpha Hall", availabilityStatus: "unavailable" },
      { ...second, id: "00000000-0000-4000-8000-000000000127", name: "Zulu Room", availabilityStatus: "available" },
      { ...second, id: "00000000-0000-4000-8000-000000000128", name: "Mike Studio", availabilityStatus: "available" },
    ]);
    renderPage();
    await screen.findByRole("link", { name: "Alpha Hall" });

    // Act and assert: status order is independent from the default name order.
    expect(namesInCards()).toEqual(["Alpha Hall", "Mike Studio", "Zulu Room"]);
    await user.click(screen.getByRole("button", { name: /^Status/ }));
    expect(namesInCards()).toEqual(["Zulu Room", "Mike Studio", "Alpha Hall"]);
    await user.click(screen.getByRole("button", { name: /^Status/ }));
    expect(namesInCards()).toEqual(["Alpha Hall", "Mike Studio", "Zulu Room"]);
  });

  // M3: surrounding whitespace is ignored, but name/location terms cannot be joined across fields.
  it("trims partial searches without allowing a cross-field false match", async () => {
    // Arrange: the two query fragments occur only in separate venue fields.
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce([{ ...base, name: "Hall", location: "Test Building" }]);
    renderPage();
    await screen.findByRole("link", { name: "Hall" });
    const search = screen.getByRole("textbox", { name: "Search by name or location" });

    // Act: first prove a padded partial term works, then join the two fields.
    await user.type(search, "  hall  ");
    expect(namesInCards()).toEqual(["Hall"]);
    await user.clear(search);
    await user.type(search, "Hall Test Building");

    // Assert: no record matches a phrase split between name and location.
    expect(screen.getByText("No venues match your search.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Hall" })).not.toBeInTheDocument();
  });

  // M5: changing sort keys after descending order starts the new key ascending.
  it("resets a newly selected sort key to ascending after a descending sort", async () => {
    // Arrange: name and capacity orders are intentionally different.
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce([
      { ...base, name: "Alpha", capacity: 300 },
      { ...second, name: "Zulu", capacity: 20 },
    ]);
    renderPage();
    await screen.findByRole("link", { name: "Alpha" });

    // Act: reverse names, then select capacity once.
    await user.click(screen.getByRole("button", { name: /^Name/ }));
    expect(namesInCards()).toEqual(["Zulu", "Alpha"]);
    await user.click(screen.getByRole("button", { name: /^Capacity/ }));

    // Assert: capacity begins ascending rather than inheriting descending state.
    expect(namesInCards()).toEqual(["Zulu", "Alpha"]);
    expect(screen.getByRole("button", { name: /^Capacity/ })).toHaveTextContent("↑");
  });

  // AC1: failed loading is distinguishable from a genuine empty catalogue.
  it("retries a failed catalogue load for Venue Staff", async () => {
    // Arrange: the first request fails and the retry succeeds.
    const user = userEvent.setup();
    apiMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([base]);
    renderPage();

    // Act: retry after the visible error.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load venue records.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    // Assert: the retry displays the persisted record.
    expect(
      await screen.findByRole("link", { name: "Conference Room" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No venue records yet.")).not.toBeInTheDocument();
  });
});
