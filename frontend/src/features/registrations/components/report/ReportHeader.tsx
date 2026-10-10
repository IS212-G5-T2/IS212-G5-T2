import { attendeeCountLine, spotsLine } from "@/features/registrations/lib/registrationReport";

interface ReportHeaderProps {
  eventName: string;
  totalConfirmed: number;
  capacity: number;
  availableSpots: number;
}

/** SPM-63 AC2: the report title, the Confirmed count against capacity, and the spots left. */
export function ReportHeader({ eventName, totalConfirmed, capacity, availableSpots }: ReportHeaderProps) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{eventName} - Registration Report</h1>
      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{attendeeCountLine(totalConfirmed, capacity)}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{spotsLine(availableSpots)}</p>
    </div>
  );
}
