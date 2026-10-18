import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { api, ApiError } from "@/utils/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/FormControls";
import { BookingCard } from "@/features/bookings/pages/requests/BookingCard";
import { BookingDetailModal } from "@/features/bookings/pages/requests/BookingDetailModal";
import type { Booking } from "@/types";

export function BookingsPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const bookings = useAppStore((s) => s.bookings);
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (currentUser.role !== "coordinator") return;
    let active = true;
    api<Array<Booking & { affectedByUnavailablePeriod?: boolean; specialRequests?: string; bookingReference?: string }>>("/venues/my-bookings")
      .then((records) => {
        if (active) {
          useAppStore.setState({ bookings: records.map((record) => ({ ...record, requestedBy: currentUser.name, status: record.status as Booking["status"] })) });
          setLoadError("");
        }
      })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof ApiError ? error.message : "Unable to load your venue bookings."); });
    return () => { active = false; };
  }, [currentUser.name, currentUser.role, reload]);

  const filtered = useMemo(() => {
    let scoped = bookings;
    if (statusFilter) {
      scoped = scoped.filter((b) => b.status === statusFilter);
    }
    return [...scoped].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [bookings, statusFilter]);

  return (
    <div>
      <PageHeader
        title="Venue Booking Requests"
        description={
          currentUser.role === "venue_staff"
            ? "Feature 10, 11 — Review pending requests, approve or reject, and resolve conflicts."
            : "Feature 9 — Track the booking requests you've submitted to Venue Staff."
        }
      />

      {loadError && <p role="alert">{loadError}</p>}
      <div className="mb-4 max-w-xs">
        <Select
          label="Status filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No bookings match this filter.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((b) => (
            <BookingCard key={b.id} booking={b} onReview={setSelected} onCancelled={() => setReload((value) => value + 1)} />
          ))}
        </div>
      )}

      <BookingDetailModal booking={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
