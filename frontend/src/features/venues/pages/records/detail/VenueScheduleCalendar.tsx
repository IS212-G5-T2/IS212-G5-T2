import { useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import type { CalendarRef } from "@fullcalendar/react";
import breezyThemePlugin from "@fullcalendar/react/themes/breezy";
import interactionPlugin from "@fullcalendar/react/interaction";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import type { VenueRecord, VenueReservation } from "../venue-records";
import { getFreeVenueIntervals } from "../availability";
import { formatVenueInstant } from "../availability";
import { sgtDayKey, sgtLocalDateTimeToDate } from "@/utils/sgtDate";
import { Modal } from "@/components/ui/Modal";

export type ScheduleCategory =
  "booking" | "hold" | "unavailable" | "free" | "buffer" | "selected";

export interface VenueScheduleEntry {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  display?: "auto" | "background";
  extendedProps: { detail: string; category: ScheduleCategory };
}

/** Selection validity depends on a positive time range, not venue operating hours. */
export function isValidVenueSelection(start: Date, end: Date): boolean {
  return (
    Number.isFinite(start.getTime()) &&
    Number.isFinite(end.getTime()) &&
    start < end
  );
}

function bookingEvents(
  reservation: VenueReservation,
  venue: VenueRecord,
): VenueScheduleEntry[] {
  const isBooked = reservation.status === "booked";
  const category: ScheduleCategory = isBooked ? "booking" : "hold";
  const title = isBooked ? "Confirmed booking" : "Tentative hold";
  const color = isBooked ? "#2563eb" : "#b7791f";
  const details = `${reservation.eventName}${reservation.holdExpiresAt ? ` · Hold expires ${formatVenueInstant(reservation.holdExpiresAt)}` : ""}`;
  const events: VenueScheduleEntry[] = [
    {
      id: reservation.id,
      title,
      start: reservation.start,
      end: reservation.end,
      backgroundColor: color,
      borderColor: color,
      extendedProps: { detail: details, category },
    },
  ];
  const setupStart =
    Date.parse(reservation.start) - venue.setupTimeMinutes * 60_000;
  if (venue.setupTimeMinutes > 0) {
    events.push({
      id: `${reservation.id}-setup-buffer`,
      title: "Setup buffer",
      start: new Date(setupStart).toISOString(),
      end: reservation.start,
      backgroundColor: "rgba(100, 116, 139, 0.12)",
      borderColor: "rgba(100, 116, 139, 0.4)",
      extendedProps: {
        detail: `${reservation.eventName} · ${venue.setupTimeMinutes} minutes before`,
        category: "buffer",
      },
    });
  }
  if (venue.turnaroundTimeMinutes > 0) {
    events.push({
      id: `${reservation.id}-turnaround-buffer`,
      title: "Turnaround buffer",
      start: reservation.end,
      end: new Date(
        Date.parse(reservation.end) + venue.turnaroundTimeMinutes * 60_000,
      ).toISOString(),
      backgroundColor: "rgba(100, 116, 139, 0.12)",
      borderColor: "rgba(100, 116, 139, 0.4)",
      extendedProps: {
        detail: `${reservation.eventName} · ${venue.turnaroundTimeMinutes} minutes after`,
        category: "buffer",
      },
    });
  }
  return events;
}

function visibleFreeEvents(
  venue: VenueRecord,
  start: Date,
  end: Date,
): VenueScheduleEntry[] {
  const firstDay = sgtDayKey(start);
  const lastDay = sgtDayKey(new Date(end.getTime() - 1));
  const events: VenueScheduleEntry[] = [];
  for (
    let day = new Date(`${firstDay}T12:00:00Z`);
    day <= new Date(`${lastDay}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const dayKey = day.toISOString().slice(0, 10);
    const nextDay = new Date(day);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const open = sgtLocalDateTimeToDate(`${dayKey}T00:00`).toISOString();
    const close = sgtLocalDateTimeToDate(
      `${nextDay.toISOString().slice(0, 10)}T00:00`,
    ).toISOString();
    for (const [index, interval] of getFreeVenueIntervals(
      venue,
      open,
      close,
    ).entries()) {
      events.push({
        id: `free-${dayKey}-${index}`,
        title: "Available",
        start: interval.start,
        end: interval.end,
        backgroundColor: "rgba(16, 185, 129, 0.07)",
        borderColor: "rgba(16, 185, 129, 0.07)",
        display: "background",
        extendedProps: {
          detail: "No conflicting booking, hold, or unavailable period",
          category: "free",
        },
      });
    }
  }
  return events;
}

export function getVenueScheduleEntries(
  venue: VenueRecord,
  start: Date,
  end: Date,
): VenueScheduleEntry[] {
  const unavailable: VenueScheduleEntry[] = venue.unavailablePeriods.map(
    (period) => ({
      id: period.id,
      title: "Unavailable",
      start: period.start,
      end: period.end,
      backgroundColor: "#b4534b",
      borderColor: "#a3433c",
      extendedProps: { detail: period.reason, category: "unavailable" },
    }),
  );
  const bookings = venue.reservations.flatMap((reservation) =>
    bookingEvents(reservation, venue),
  );
  return [
    ...unavailable,
    ...bookings,
    ...visibleFreeEvents(venue, start, end),
  ].sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
}

interface VenueScheduleCalendarProps {
  venue: VenueRecord;
  initialDate: string;
  selectedRange?: { start: string; end: string };
  onSelectRange?: (start: Date, end: Date) => void;
  onClearSelection?: () => void;
}

/** The entry opened by clicking a calendar block, shown in full in a dialog. */
interface OpenScheduleEntry {
  title: string;
  detail: string;
  start: string | null;
  end: string | null;
}

function describeWhen(start: string | null, end: string | null): string {
  if (!start || !end) return "Time not available";
  return `${formatVenueInstant(start)} to ${formatVenueInstant(end)}`;
}

export function VenueScheduleCalendar({
  venue,
  initialDate,
  selectedRange,
  onSelectRange,
  onClearSelection,
}: VenueScheduleCalendarProps) {
  const calendarRef = useRef<CalendarRef | null>(null);
  const [openEntry, setOpenEntry] = useState<OpenScheduleEntry | null>(null);
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 639px)").matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const breakpoint = window.matchMedia("(max-width: 639px)");
    const updateView = () => {
      setIsPhone(breakpoint.matches);
      calendarRef.current?.getApi().changeView(
        breakpoint.matches ? "timeGridDay" : "timeGridWeek",
      );
    };
    breakpoint.addEventListener("change", updateView);
    calendarRef.current?.getApi().changeView(
      breakpoint.matches ? "timeGridDay" : "timeGridWeek",
    );
    return () => breakpoint.removeEventListener("change", updateView);
  }, []);
  const events = (
    range: { start: Date; end: Date },
    success: (events: VenueScheduleEntry[]) => void,
  ) => {
    const selectedEvent = selectedRange
      ? [
          {
            id: "selected-event-time",
            title: "Selected event time",
            start: sgtLocalDateTimeToDate(selectedRange.start).toISOString(),
            end: sgtLocalDateTimeToDate(selectedRange.end).toISOString(),
            backgroundColor: "rgba(37, 99, 235, 0.18)",
            borderColor: "#2563eb",
            extendedProps: {
              detail: "Requested event time",
              category: "selected" as const,
            },
          },
        ]
      : [];
    success([
      ...getVenueScheduleEntries(venue, range.start, range.end),
      ...selectedEvent,
    ]);
  };

  useEffect(() => {
    if (initialDate) calendarRef.current?.getApi().gotoDate(initialDate);
  }, [initialDate]);

  return (
    <section
      className="venue-schedule-calendar"
      aria-label="Venue schedule calendar"
    >
      <div aria-label="Schedule legend" className="venue-schedule-legend">
        <span>
          <i className="schedule-legend-dot bg-blue-700" />
          Confirmed booking
        </span>
        <span>
          <i className="schedule-legend-dot bg-yellow-700" />
          Tentative hold
        </span>
        <span>
          <i className="schedule-legend-dot bg-red-700" />
          Unavailable
        </span>
        <span>
          <i className="schedule-legend-dot bg-green-700" />
          Available
        </span>
        <span>
          <i className="schedule-legend-dot bg-slate-500" />
          Setup and turnaround buffer
        </span>
      </div>
      <p className="venue-schedule-caption">
        Times are shown in Singapore Time (SGT). Green periods are clear of
        bookings, holds, unavailable periods, setup, and turnaround buffers;
        check availability before submitting.
      </p>
      <div className="venue-schedule-calendar-scroll">
        <FullCalendar
          ref={calendarRef}
          plugins={[breezyThemePlugin, timeGridPlugin, interactionPlugin]}
          initialView={isPhone ? "timeGridDay" : "timeGridWeek"}
          initialDate={initialDate || undefined}
          timeZone="Asia/Singapore"
          allDaySlot={false}
          borderlessTop
          borderlessBottom
          borderlessX
          height="auto"
          expandRows
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          slotDuration="01:00:00"
          slotHeaderInterval="01:00:00"
          slotMinHeight={56}
          slotEventOverlap={false}
          eventMinHeight={32}
          scrollTime="08:00:00"
          headerToolbar={{
            left: "title",
            center: "",
            right: "prev,next today",
          }}
          dayHeaderFormat={{
            weekday: "short",
            month: "numeric",
            day: "numeric",
          }}
          tableHeaderSticky
          nowIndicator
          events={events}
          selectable={Boolean(onSelectRange)}
          selectMirror
          selectAllow={(selection) =>
            isValidVenueSelection(selection.start, selection.end)
          }
          select={
            onSelectRange
              ? (selection) => onSelectRange(selection.start, selection.end)
              : undefined
          }
          eventClick={(click) => {
            const { event } = click;
            if (event.id === "selected-event-time") {
              onClearSelection?.();
              return;
            }
            if (event.extendedProps?.category === "free") return;
            setOpenEntry({
              title: event.title ?? "",
              detail: event.extendedProps?.detail ?? "",
              start: event.start?.toISOString() ?? null,
              end: event.end?.toISOString() ?? null,
            });
          }}
          eventContent={(info) =>
            info.event.extendedProps.category === "selected" ? (
              <div
                className="venue-schedule-event"
                title="Click to clear the selected event time"
              >
                {info.timeText}
              </div>
            ) : (
              <div
                className="venue-schedule-event"
                title={`${info.event.title}: ${info.event.extendedProps.detail} (click for full details)`}
              >
                {info.timeText && (
                  <span className="venue-schedule-event-time">
                    {info.timeText}
                  </span>
                )}
                <span className="venue-schedule-event-title">
                  {info.event.title}
                </span>
                {info.event.extendedProps.category !== "buffer" && (
                  <span className="venue-schedule-event-detail">
                    {info.event.extendedProps.detail}
                  </span>
                )}
              </div>
            )
          }
          eventClass={(info) =>
            `venue-schedule-${info.event.extendedProps.category}`
          }
        />
      </div>
      <Modal
        open={openEntry !== null}
        onClose={() => setOpenEntry(null)}
        title={openEntry?.title ?? "Schedule entry"}
      >
        {openEntry && (
          <dl className="venue-schedule-entry-details">
            <dt>When</dt>
            <dd>{describeWhen(openEntry.start, openEntry.end)}</dd>
            <dt>Details</dt>
            <dd>{openEntry.detail || "No further details"}</dd>
          </dl>
        )}
      </Modal>
    </section>
  );
}
