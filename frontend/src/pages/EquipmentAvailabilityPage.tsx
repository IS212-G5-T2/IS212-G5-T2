import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import type { EquipmentItem } from "@/types";

interface Row extends EquipmentItem {
  reserved: number;
  requested: number;
  available: number;
}

export function EquipmentAvailabilityPage() {
  const equipment = useAppStore((s) => s.equipment);
  const equipmentRequests = useAppStore((s) => s.equipmentRequests);

  const rows: Row[] = equipment.map((item) => {
    const relevant = equipmentRequests.filter((r) => r.equipmentId === item.id);
    const reserved = relevant
      .filter((r) => r.status === "reserved")
      .reduce((sum, r) => sum + r.quantity, 0);
    const requested = relevant
      .filter((r) => r.status === "requested" || r.status === "checking")
      .reduce((sum, r) => sum + r.quantity, 0);
    return { ...item, reserved, requested, available: Math.max(item.totalQuantity - reserved, 0) };
  });

  const columns: Column<Row>[] = [
    { header: "Equipment", render: (r) => <span className="font-medium text-gray-900 dark:text-gray-100">{r.name}</span> },
    { header: "Category", render: (r) => r.category },
    { header: "Total quantity", render: (r) => r.totalQuantity },
    { header: "Reserved", render: (r) => r.reserved },
    { header: "Pending requests", render: (r) => r.requested },
    {
      header: "Available now",
      render: (r) => (
        <span className={r.available === 0 ? "font-semibold text-danger-700 dark:text-danger-400" : "font-semibold text-success-700 dark:text-success-300"}>
          {r.available}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Equipment Availability"
        description="Feature 13 — Determine whether sufficient equipment is available, filtering out quantities already committed to overlapping events."
      />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    </div>
  );
}
