import { Card, CardBody } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import type { Booking } from "@/types";
import { formatDateRange } from "@/utils/format";

export function BookingCard({ booking, onReview }: { booking: Booking; onReview: (b: Booking) => void }) {
  return (
    <Card className={booking.conflict ? "border-warning-300 dark:border-warning-700" : undefined}>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{booking.eventName}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{booking.venueName}</p>
          </div>
          <StatusBadge status={booking.status} />
        </div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{formatDateRange(booking.start, booking.end)}</p>
        {booking.conflict && (
          <p className="mt-1 text-xs font-medium text-warning-700 dark:text-warning-300">⚠️ Possible conflict with existing booking</p>
        )}
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => onReview(booking)}>
          Review Details
        </Button>
      </CardBody>
    </Card>
  );
}
