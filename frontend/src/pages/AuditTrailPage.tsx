import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import type { EquipmentAuditEntry } from "@/types";
import { getEquipmentAuditTrail } from "@/utils/equipment-api";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function ChangeTypeBadge({
  changeType,
}: {
  changeType: EquipmentAuditEntry["changeType"];
}) {
  const isReactivated = changeType === "Reactivated";
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium " +
        (isReactivated
          ? "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300"
          : "bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300")
      }
    >
      {changeType}
    </span>
  );
}

/** SPM-119 AC5/AC7: the shared, read-only history of every equipment availability change. */
export function AuditTrailPage() {
  const [entries, setEntries] = useState<EquipmentAuditEntry[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    void getEquipmentAuditTrail()
      .then((loaded) => {
        setEntries(loaded);
        setLoadError(false);
      })
      .catch(() => {
        setEntries([]);
        setLoadError(true);
      });
  }, []);

  const columns: Column<EquipmentAuditEntry>[] = [
    {
      header: "Timestamp",
      render: (entry) => (
        <span className="whitespace-nowrap">
          {formatTimestamp(entry.timestamp)}
        </span>
      ),
    },
    {
      header: "Equipment name",
      render: (entry) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {entry.equipmentName}
        </span>
      ),
    },
    {
      header: "Type",
      render: (entry) => entry.equipmentType,
    },
    {
      header: "Location",
      render: (entry) => entry.location,
    },
    {
      header: "Maintenance",
      render: (entry) => entry.maintenanceStatus,
    },
    {
      header: "Qty",
      render: (entry) => entry.quantity,
    },
    {
      header: "Availability",
      render: (entry) => (entry.isAvailable ? "Available" : "Unavailable"),
    },
    {
      header: "Change",
      render: (entry) => <ChangeTypeBadge changeType={entry.changeType} />,
    },
    {
      header: "Reason",
      render: (entry) => entry.reason ?? "—",
    },
    {
      header: "Changed by",
      render: (entry) => (
        <span className="whitespace-nowrap">{entry.changedBy}</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        description="History of all equipment availability changes."
      />
      {loadError ? (
        <p
          role="alert"
          className="text-sm text-danger-600 dark:text-danger-400"
        >
          Unable to load the audit trail. Please try again.
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={entries}
          rowKey={(entry) => entry.id}
          emptyMessage="No entries yet. Mark equipment as unavailable or reactivate equipment to see entries here."
        />
      )}
    </div>
  );
}
