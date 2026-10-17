import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { EquipmentRequest } from "@/types";
import { formatDateRange } from "@/utils/format";

export function EquipmentPage() {
  const equipmentRequests = useAppStore((s) => s.equipmentRequests);

  const reserved = equipmentRequests.filter((r) => r.status === "reserved");

  const columns: Column<EquipmentRequest>[] = [
    { header: "Equipment", render: (r) => <span className="font-medium text-gray-900 dark:text-gray-100">{r.equipmentName}</span> },
    { header: "Quantity", render: (r) => r.quantity },
    { header: "Event", render: (r) => r.eventName },
    { header: "Date / time", render: (r) => formatDateRange(r.start, r.end) },
    { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Equipment Reservations"
        description="Feature 14 — Equipment reserved for events remains associated with the event and reduces quantity available to others."
      />
      <DataTable
        columns={columns}
        rows={reserved}
        rowKey={(r) => r.id}
        emptyMessage="No equipment currently reserved."
      />
    </div>
  );
}
