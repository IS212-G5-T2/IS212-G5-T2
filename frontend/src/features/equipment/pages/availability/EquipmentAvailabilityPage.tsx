import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { TextInput, TextArea } from "@/components/ui/FormControls";
import type { EquipmentRecord } from "@/types";
import { getEquipment, updateEquipmentAvailability } from "@/features/equipment/api/equipment-api";

function isRecordAvailable(record: EquipmentRecord): boolean {
  return record.isAvailable !== false;
}

/**
 * `getByText`'s default matcher joins only an element's own direct text-node
 * children (nested elements' text is excluded, and the join is trimmed) —
 * so wrapping *either* the label or the value in its own <span> leaves the
 * other side's bare text as that ancestor's entire matched text, exactly
 * equal to e.g. the record name, which collides with `getByText(record.name)`
 * elsewhere on the page (aria-hidden, used to disambiguate the dialog's
 * buttons from the row's, has no effect on text queries — only on role
 * queries). Keeping both label and value as unwrapped sibling text avoids it.
 */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm text-gray-700 dark:text-gray-300">
      {label}: {value}
    </p>
  );
}

interface MarkUnavailableDialogProps {
  record: EquipmentRecord;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

/** SPM-119 AC1/AC2/AC3: collects a required reason before marking a record unavailable. */
function MarkUnavailableDialog({ record, onConfirm, onCancel }: MarkUnavailableDialogProps) {
  const titleId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  function handleConfirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Enter a reason first");
      return;
    }
    onConfirm(trimmed);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-gray-800"
      >
        <div className="px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Mark equipment as unavailable
          </h2>
          <div className="mt-3 space-y-1 rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
            <DetailRow label="Name" value={record.name} />
            <DetailRow label="Type" value={record.type} />
            <DetailRow label="Location" value={record.location} />
            <DetailRow label="Status" value={record.maintenanceStatus} />
          </div>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            This equipment will be hidden from equipment search and lists.
          </p>
          <div className="mt-4">
            <TextArea
              label="Reason for unavailability"
              required
              placeholder="e.g. Damaged during transport, awaiting repair"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (error) setError("");
              }}
            />
            {error && (
              <p role="alert" className="-mt-3 text-xs text-danger-600 dark:text-danger-400">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-700">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm}>
            Mark unavailable
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface ReactivateDialogProps {
  record: EquipmentRecord;
  onConfirm: () => void;
  onCancel: () => void;
}

/** SPM-119 AC6: confirms restoring a previously unavailable record. */
function ReactivateDialog({ record, onConfirm, onCancel }: ReactivateDialogProps) {
  const titleId = useId();

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-gray-800"
      >
        <div className="px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Reactivate equipment
          </h2>
          <div className="mt-3 space-y-1 rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
            <DetailRow label="Name" value={record.name} />
            <DetailRow label="Type" value={record.type} />
            <DetailRow label="Location" value={record.location} />
          </div>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            This equipment will be marked as available and appear in equipment lists and searches again.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-700">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Reactivate
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type DialogState =
  | { mode: "mark"; record: EquipmentRecord }
  | { mode: "reactivate"; record: EquipmentRecord }
  | null;

function AvailabilityBadge({ available }: { available: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium " +
        (available
          ? "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300"
          : "bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300")
      }
    >
      {available ? "Yes" : "No"}
    </span>
  );
}

export function EquipmentAvailabilityPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<EquipmentRecord[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [typeSearch, setTypeSearch] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState("");

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

  async function handleToggleShowUnavailable(next: boolean) {
    setShowUnavailable(next);
    try {
      const loaded = await getEquipment(next ? { includeUnavailable: true } : undefined);
      setRecords(loaded);
      setLoadError(false);
    } catch {
      setRecords([]);
      setLoadError(true);
    }
  }

  async function handleMarkUnavailable(reason: string) {
    if (dialog?.mode !== "mark") return;
    const { equipment } = await updateEquipmentAvailability(dialog.record.id, {
      isAvailable: false,
      reason,
    });
    setRecords((previous) => previous.map((record) => (record.id === equipment.id ? equipment : record)));
    setDialog(null);
    setToast("Equipment marked unavailable.");
  }

  async function handleReactivate() {
    if (dialog?.mode !== "reactivate") return;
    const { equipment } = await updateEquipmentAvailability(dialog.record.id, {
      isAvailable: true,
    });
    setRecords((previous) => previous.map((record) => (record.id === equipment.id ? equipment : record)));
    setDialog(null);
    setToast("Equipment reactivated.");
  }

  const visibleRecords = useMemo(() => {
    const typeQuery = typeSearch.trim().toLowerCase();
    const locationQuery = locationSearch.trim().toLowerCase();
    return records.filter(
      (record) =>
        (showUnavailable || isRecordAvailable(record)) &&
        record.type.toLowerCase().includes(typeQuery) &&
        record.location.toLowerCase().includes(locationQuery),
    );
  }, [records, typeSearch, locationSearch, showUnavailable]);

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
    {
      header: "Available",
      render: (record) => <AvailabilityBadge available={isRecordAvailable(record)} />,
    },
    {
      header: "Actions",
      render: (record) =>
        isRecordAvailable(record) ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDialog({ mode: "mark", record })}
          >
            Mark unavailable
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDialog({ mode: "reactivate", record })}
          >
            Reactivate
          </Button>
        ),
    },
  ];

  return (
    <div>
      <div aria-hidden={dialog !== null || undefined}>
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
            <div className="mb-4 grid max-w-2xl gap-4 sm:grid-cols-2">
              <TextInput
                type="search"
                label="Search by type"
                value={typeSearch}
                onChange={(event) => setTypeSearch(event.target.value)}
              />
              <TextInput
                type="search"
                label="Search by location"
                value={locationSearch}
                onChange={(event) => setLocationSearch(event.target.value)}
              />
            </div>
            <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={showUnavailable}
                onChange={(event) => void handleToggleShowUnavailable(event.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500"
              />
              Show unavailable
            </label>
            {toast && (
              <div
                role="status"
                aria-live="polite"
                className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-success-300 bg-success-50 px-4 py-3 text-sm text-success-900 dark:border-success-700 dark:bg-success-900/20 dark:text-success-300"
              >
                <span className="font-medium">
                  <span aria-hidden="true">✓ </span>
                  {toast}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setToast("")}>
                  Dismiss
                </Button>
              </div>
            )}
            <DataTable
              columns={columns}
              rows={visibleRecords}
              rowKey={(record) => record.id}
              rowClassName={(record) => (isRecordAvailable(record) ? undefined : "opacity-60")}
              emptyMessage={
                records.length > 0 && (typeSearch.trim() || locationSearch.trim())
                  ? "No equipment records match your search."
                  : "No equipment records found."
              }
            />
          </>
        )}
      </div>
      {dialog?.mode === "mark" && (
        <MarkUnavailableDialog
          record={dialog.record}
          onConfirm={(reason) => void handleMarkUnavailable(reason)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.mode === "reactivate" && (
        <ReactivateDialog
          record={dialog.record}
          onConfirm={() => void handleReactivate()}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
