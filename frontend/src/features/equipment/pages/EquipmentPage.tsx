import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { getEquipmentReservations, type EquipmentReservation } from "@/features/equipment/api/equipment-reservations-api";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

interface EventReservations {
  eventId: string;
  eventName: string;
  eventStart: string;
  eventEnd: string;
  status: string;
  coordinatorEmail: string;
  items: EquipmentReservation[];
}

function groupReservationsByEvent(reservations: EquipmentReservation[]): EventReservations[] {
  const grouped = new Map<string, EventReservations>();
  for (const reservation of reservations) {
    const group = grouped.get(reservation.eventId);
    if (group) group.items.push(reservation);
    else grouped.set(reservation.eventId, {
      eventId: reservation.eventId,
      eventName: reservation.eventName,
      eventStart: reservation.eventStart,
      eventEnd: reservation.eventEnd,
      status: reservation.status,
      coordinatorEmail: reservation.coordinatorEmail,
      items: [reservation],
    });
  }
  return [...grouped.values()];
}

/** SPM-58 AC7: Technical Support sees each persisted reservation and its event. */
export function EquipmentPage() {
  const [reservations, setReservations] = useState<EquipmentReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getEquipmentReservations()
      .then((loaded) => { if (active) setReservations(loaded); })
      .catch(() => { if (active) setError("Unable to load equipment reservations. Please try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const eventReservations = groupReservationsByEvent(reservations);
  const columns: Column<EventReservations>[] = [
    { header: "Event", render: (row) => <span className="font-bold text-gray-900 dark:text-gray-100">{row.eventName}</span> },
    { header: "Coordinator", render: (row) => <span className="text-gray-700 dark:text-gray-300">{row.coordinatorEmail}</span> },
    { header: "Equipment", render: (row) => <ul className="space-y-1">{row.items.map((item) => <li key={item.id}>
      <span className="font-bold text-gray-900 dark:text-gray-100">{item.equipmentName}</span>
      <span className="ml-2 text-gray-600 dark:text-gray-300">Type: {item.equipmentType} · Qty: {item.quantity}</span>
    </li>)}</ul> },
    { header: "Date / time", render: (row) => `${formatDateTime(row.eventStart)} – ${formatDateTime(row.eventEnd)}` },
    { header: "Status", render: (row) => <span className="inline-flex rounded-full bg-success-100 px-2.5 py-0.5 text-xs font-medium text-success-800 dark:bg-success-900/30 dark:text-success-300">{row.status}</span> },
  ];

  return (
    <div>
      <PageHeader title="Equipment Reservations" description="Reserved equipment and the event it belongs to." />
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading equipment reservations…</p>}
      {error && <p role="alert" className="text-sm text-danger-600 dark:text-danger-400">{error}</p>}
      {!loading && !error && <DataTable columns={columns} rows={eventReservations} rowKey={(row) => row.eventId} emptyMessage="No equipment currently reserved." />}
    </div>
  );
}
