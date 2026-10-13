import { useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import type { CalendarRef } from "@fullcalendar/react";
import breezyThemePlugin from "@fullcalendar/react/themes/breezy";
import interactionPlugin from "@fullcalendar/react/interaction";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import type { VenueRecord, VenueReservation } from "../venue-records";
import { getFreeVenueIntervals } from "../availability";
import { formatVenueInstant } from "../availability";
import { sgtDayKey, sgtLocalDateTimeToDate } from "@/utils/sgtDate";

export type ScheduleCategory = "booking" | "hold" | "unavailable" | "free" | "buffer" | "selected";

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

function minutesIntoSgtDay(instant: string | Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant instanceof Date ? instant : new Date(instant));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function venueCalendarHours(venue: VenueRecord): { start: string; end: string } {
  let start = Number(venue.operatingStartTime.slice(0, 2)) * 60 + Number(venue.operatingStartTime.slice(3, 5));
  let end = Number(venue.operatingEndTime.slice(0, 2)) * 60 + Number(venue.operatingEndTime.slice(3, 5));

  for (const reservation of venue.reservations) {
    start = Math.min(start, minutesIntoSgtDay(reservation.start) - venue.setupTimeMinutes);
    end = Math.max(end, minutesIntoSgtDay(reservation.end) + venue.turnaroundTimeMinutes);
  }
  for (const period of venue.unavailablePeriods) {
    start = Math.min(start, minutesIntoSgtDay(period.start));
    end = Math.max(end, minutesIntoSgtDay(period.end));
  }

  const startHour = Math.max(0, Math.floor(start / 60));
  const endHour = Math.min(24, Math.ceil(end / 60));
  return {
    start: `${String(startHour).padStart(2, "0")}:00:00`,
    end: `${String(endHour).padStart(2, "0")}:00:00`,
  };
}

/** Allows drag selections across open venue days when both endpoints fall within operating hours. */
export function isVenueOperatingSelection(venue: VenueRecord, start: Date, end: Date): boolean {
  const firstDayKey = sgtDayKey(start);
  const lastDayKey = sgtDayKey(end);
  if (start >= end) return false;

  const firstDay = new Date(`${firstDayKey}T12:00:00Z`);
  const lastDay = new Date(`${lastDayKey}T12:00:00Z`);
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (const day = new Date(firstDay); day <= lastDay; day.setUTCDate(day.getUTCDate() + 1)) {
    const dayName = dayNames[day.getUTCDay()];
    if (!venue.operatingDays.some((operatingDay) => operatingDay.toLowerCase() === dayName.toLowerCase())) return false;
  }

  const opening = Number(venue.operatingStartTime.slice(0, 2)) * 60 + Number(venue.operatingStartTime.slice(3, 5));
  const closing = Number(venue.operatingEndTime.slice(0, 2)) * 60 + Number(venue.operatingEndTime.slice(3, 5));
  const startMinute = minutesIntoSgtDay(start);
  const endMinute = minutesIntoSgtDay(end);
  return startMinute >= opening && startMinute <= closing && endMinute >= opening && endMinute <= closing;
}

function bookingEvents(reservation: VenueReservation, venue: VenueRecord): VenueScheduleEntry[] {
  const isBooked = reservation.status === "booked";
  const category: ScheduleCategory = isBooked ? "booking" : "hold";
  const title = isBooked ? "Confirmed booking" : "Tentative hold";
  const color = isBooked ? "#2563eb" : "#b7791f";
  const details = `${reservation.eventName}${reservation.holdExpiresAt ? ` · Hold expires ${formatVenueInstant(reservation.holdExpiresAt)}` : ""}`;
  const events: VenueScheduleEntry[] = [{
    id: reservation.id,
    title,
    start: reservation.start,
    end: reservation.end,
    backgroundColor: color,
    borderColor: color,
    extendedProps: { detail: details, category },
  }];
  const setupStart = Date.parse(reservation.start) - venue.setupTimeMinutes * 60_000;
  if (venue.setupTimeMinutes > 0) {
    events.push({
      id: `${reservation.id}-setup-buffer`,
      title: "Setup buffer",
      start: new Date(setupStart).toISOString(),
      end: reservation.start,
      backgroundColor: "rgba(100, 116, 139, 0.12)",
      borderColor: "rgba(100, 116, 139, 0.4)",
      extendedProps: { detail: `${reservation.eventName} · ${venue.setupTimeMinutes} minutes before`, category: "buffer" },
    });
  }
  if (venue.turnaroundTimeMinutes > 0) {
    events.push({
      id: `${reservation.id}-turnaround-buffer`,
      title: "Turnaround buffer",
      start: reservation.end,
      end: new Date(Date.parse(reservation.end) + venue.turnaroundTimeMinutes * 60_000).toISOString(),
      backgroundColor: "rgba(100, 116, 139, 0.12)",
      borderColor: "rgba(100, 116, 139, 0.4)",
      extendedProps: { detail: `${reservation.eventName} · ${venue.turnaroundTimeMinutes} minutes after`, category: "buffer" },
    });
  }
  return events;
}

function visibleFreeEvents(venue: VenueRecord, start: Date, end: Date): VenueScheduleEntry[] {
  const firstDay = sgtDayKey(start);
  const lastDay = sgtDayKey(new Date(end.getTime() - 1));
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const events: VenueScheduleEntry[] = [];
  for (let day = new Date(`${firstDay}T12:00:00Z`); day <= new Date(`${lastDay}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    const dayKey = day.toISOString().slice(0, 10);
    if (!venue.operatingDays.some((name) => name.toLocaleLowerCase() === dayNames[day.getUTCDay()].toLocaleLowerCase())) continue;
    const open = sgtLocalDateTimeToDate(`${dayKey}T${venue.operatingStartTime.slice(0, 5)}`).toISOString();
    const close = sgtLocalDateTimeToDate(`${dayKey}T${venue.operatingEndTime.slice(0, 5)}`).toISOString();
    for (const [index, interval] of getFreeVenueIntervals(venue, open, close).entries()) {
      events.push({
        id: `free-${dayKey}-${index}`,
        title: "Available",
        start: interval.start,
        end: interval.end,
        backgroundColor: "rgba(16, 185, 129, 0.07)",
        borderColor: "rgba(16, 185, 129, 0.07)",
        display: "background",
        extendedProps: { detail: "Free during venue operating hours", category: "free" },
      });
    }
  }
  return events;
}

export function getVenueScheduleEntries(venue: VenueRecord, start: Date, end: Date): VenueScheduleEntry[] {
  const unavailable: VenueScheduleEntry[] = venue.unavailablePeriods.map((period) => ({
    id: period.id,
    title: "Unavailable",
    start: period.start,
    end: period.end,
    backgroundColor: "#b4534b",
    borderColor: "#a3433c",
    extendedProps: { detail: period.reason, category: "unavailable" },
  }));
  const bookings = venue.reservations.flatMap((reservation) => bookingEvents(reservation, venue));
  return [...unavailable, ...bookings, ...visibleFreeEvents(venue, start, end)]
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
}

interface VenueScheduleCalendarProps {
  venue: VenueRecord;
  initialDate: string;
  selectedRange?: { start: string; end: string };
  onSelectRange?: (start: Date, end: Date) => void;
  onClearSelection?: () => void;
}

export function VenueScheduleCalendar({ venue, initialDate, selectedRange, onSelectRange, onClearSelection }: VenueScheduleCalendarProps) {
  const calendarRef = useRef<CalendarRef | null>(null);
  const calendarHours = venueCalendarHours(venue);
  const events = (range: { start: Date; end: Date }, success: (events: VenueScheduleEntry[]) => void) => {
    const selectedEvent = selectedRange
      ? [{
          id: "selected-event-time",
          title: "Selected event time",
          start: sgtLocalDateTimeToDate(selectedRange.start).toISOString(),
          end: sgtLocalDateTimeToDate(selectedRange.end).toISOString(),
          backgroundColor: "rgba(37, 99, 235, 0.18)",
          borderColor: "#2563eb",
          extendedProps: { detail: "Requested event time", category: "selected" as const },
        }]
      : [];
    success([...getVenueScheduleEntries(venue, range.start, range.end), ...selectedEvent]);
  };

  useEffect(() => {
    if (initialDate) calendarRef.current?.getApi().gotoDate(initialDate);
  }, [initialDate]);

  return (
    <section className="venue-schedule-calendar" aria-label="Venue schedule calendar">
      <div aria-label="Schedule legend" className="venue-schedule-legend">
        <span><i className="schedule-legend-dot bg-blue-700" />Confirmed booking</span>
        <span><i className="schedule-legend-dot bg-yellow-700" />Tentative hold</span>
        <span><i className="schedule-legend-dot bg-red-700" />Unavailable</span>
        <span><i className="schedule-legend-dot bg-green-700" />Available</span>
        <span><i className="schedule-legend-dot bg-slate-500" />Setup and turnaround buffer</span>
      </div>
      <p className="venue-schedule-caption">Times are shown in Singapore Time (SGT). Shaded green hours are available; use Check availability before submitting a request.</p>
      <div className="venue-schedule-calendar-scroll">
        <FullCalendar
        ref={calendarRef}
          plugins={[breezyThemePlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        initialDate={initialDate || undefined}
        timeZone="Asia/Singapore"
        allDaySlot={false}
        borderlessTop
        borderlessBottom
        borderlessX
        height="auto"
        expandRows
        slotMinTime={calendarHours.start}
        slotMaxTime={calendarHours.end}
        slotDuration="01:00:00"
        slotHeaderInterval="01:00:00"
        scrollTime={venue.operatingStartTime.length === 5 ? `${venue.operatingStartTime}:00` : "08:00:00"}
        headerToolbar={{ left: "title", center: "", right: "prev,next today timeGridWeek,timeGridDay" }}
        dayHeaderFormat={{ weekday: "short", month: "numeric", day: "numeric" }}
        tableHeaderSticky
        nowIndicator
        events={events}
        selectable
        selectMirror
        selectAllow={(selection) => isVenueOperatingSelection(venue, selection.start, selection.end)}
        select={onSelectRange ? (selection) => onSelectRange(selection.start, selection.end) : undefined}
        eventClick={(click) => {
          if (click.event.id === "selected-event-time") onClearSelection?.();
        }}
        eventContent={(info) => (
          info.event.extendedProps.category === "selected" ? (
            <div className="venue-schedule-event" title="Click to clear the selected event time">
              {info.timeText}
            </div>
          ) : (
          <div className="venue-schedule-event" title={`${info.event.title}: ${info.event.extendedProps.detail}`}>
            <strong>{info.timeText && <span className="venue-schedule-event-time">{info.timeText}</span>} {info.event.title}</strong>
            {info.event.extendedProps.category !== "buffer" && <span>{info.event.extendedProps.detail}</span>}
          </div>
          )
        )}
        eventClass={(info) => `venue-schedule-${info.event.extendedProps.category}`}
        />
      </div>
    </section>
  );
}
