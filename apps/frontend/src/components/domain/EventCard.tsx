import { Link } from "react-router-dom";
import { Card, CardBody } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { EventRecord } from "@/types";
import { formatDateRange } from "@/utils/format";

export function EventCard({ event }: { event: EventRecord }) {
  return (
    <Link to={`/events/${event.id}`} className="block">
      <Card className="transition-shadow hover:shadow-md">
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{event.name}</h3>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{event.purpose}</p>
            </div>
            <StatusBadge status={event.status} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 sm:grid-cols-4">
            <div>
              <dt className="text-gray-400 dark:text-gray-500">When</dt>
              <dd>{formatDateRange(event.startDateTime, event.endDateTime)}</dd>
            </div>
            <div>
              <dt className="text-gray-400 dark:text-gray-500">Attendance</dt>
              <dd>{event.expectedAttendance}</dd>
            </div>
            <div>
              <dt className="text-gray-400 dark:text-gray-500">Venue</dt>
              <dd>{event.venueName ?? "Not booked"}</dd>
            </div>
            <div>
              <dt className="text-gray-400 dark:text-gray-500">Coordinator</dt>
              <dd>{event.coordinatorName ?? "Unassigned"}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>
    </Link>
  );
}
