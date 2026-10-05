import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/FormControls";
import type { EquipmentRecord } from "@/types";
import { getEquipment } from "@/utils/equipment-api";

type SortField = "type" | "quantity" | "location";
type SortDirection = "ascending" | "descending";

export function EquipmentAvailabilityPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<EquipmentRecord[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("ascending");

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

  function sortBy(field: SortField) {
    if (sortField === field) {
      setSortDirection((current) =>
        current === "ascending" ? "descending" : "ascending",
      );
      return;
    }

    setSortField(field);
    setSortDirection("ascending");
  }

  const visibleRecords = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const filtered = query
      ? records.filter(
          (record) =>
            record.type.toLowerCase().includes(query) ||
            record.location.toLowerCase().includes(query),
        )
      : records;

    if (!sortField) {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      const comparison =
        sortField === "quantity"
          ? left.quantity - right.quantity
          : left[sortField].localeCompare(right[sortField]);

      return sortDirection === "ascending" ? comparison : -comparison;
    });
  }, [records, searchText, sortDirection, sortField]);

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
      onHeaderClick: () => sortBy("type"),
      render: (record) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {record.type}
        </span>
      ),
    },
    {
      header: "Location",
      onHeaderClick: () => sortBy("location"),
      render: (record) => record.location,
    },
    {
      header: "Maintenance status",
      render: (record) => record.maintenanceStatus,
    },
    {
      header: "Quantity",
      onHeaderClick: () => sortBy("quantity"),
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
