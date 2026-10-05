import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/FormControls";
import type { EquipmentRecord } from "@/types";
import { getEquipment } from "@/utils/equipment-api";

export function EquipmentAvailabilityPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<EquipmentRecord[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    void getEquipment()
      .then((loaded) => {
        setRecords(loaded);
        setLoadError(false);
      })
      .catch(() => {
        setRecords([]);
        setLoadError(true);
      });
  }, []);

  const visibleRecords = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return query
      ? records.filter(
          (record) =>
            record.type.toLowerCase().includes(query) ||
            record.location.toLowerCase().includes(query),
        )
      : records;
  }, [records, searchText]);

  const columns: Column<EquipmentRecord>[] = [
    {
      header: "Equipment name",
      render: (record) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {record.name}
        </span>
      ),
    },
    {
      header: "Equipment type",
      render: (record) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {record.type}
        </span>
      ),
    },
    {
      header: "Location",
      render: (record) => record.location,
    },
    {
      header: "Maintenance status",
      render: (record) => record.maintenanceStatus,
    },
    {
      header: "Quantity",
      render: (record) => record.quantity,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Equipment Availability"
        description="Technical Support inventory records."
        actions={
          <Button onClick={() => navigate("/equipment/create")}>
            + Create Equipment Record
          </Button>
        }
      />
      {loadError ? (
        <p
          role="alert"
          className="text-sm text-danger-600 dark:text-danger-400"
        >
          Unable to load equipment records. Please try again.
        </p>
      ) : (
        <>
          <div className="mb-4 max-w-sm">
            <TextInput
              type="search"
              label="Search by type or location"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>
          <DataTable
            columns={columns}
            rows={visibleRecords}
            rowKey={(record) => record.id}
            emptyMessage={
              records.length > 0 && searchText.trim()
                ? "No equipment records match your search."
                : "No equipment records found."
            }
          />
        </>
      )}
    </div>
  );
}
