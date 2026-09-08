import { Link, useParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/utils/format";

export function EventChangeRequestsPage() {
  const { id } = useParams();
  const events = useAppStore((s) => s.events);
  const reviewChangeRequest = useAppStore((s) => s.reviewChangeRequest);

  const event = events.find((e) => e.id === id);

  if (!event) return <p className="text-sm text-gray-500 dark:text-gray-400">Event not found.</p>;

  return (
    <div>
      <PageHeader
        title={`Change Requests — ${event.name}`}
        description="Feature 15 — Event Change Requests. Approving a change to date/time, venue, or equipment notifies Venue Staff and Technical Support to re-check their bookings."
        actions={
          <Link to={`/events/${event.id}`}>
            <Button variant="secondary">Back to Event</Button>
          </Link>
        }
      />

      {event.changeRequests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No change requests for this event.
        </div>
      ) : (
        <div className="space-y-3">
          {event.changeRequests.map((cr) => (
            <Card key={cr.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{cr.summary}</p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Requested by {cr.requestedBy} on {formatDateTime(cr.createdAt)}
                    </p>
                    {cr.reason && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">"{cr.reason}"</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {cr.fields.map((f) => (
                        <span
                          key={f}
                          className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-400"
                        >
                          {f.replace("_", " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      cr.status === "pending"
                        ? "bg-warning-100 dark:bg-warning-900/30 text-warning-800 dark:text-warning-300"
                        : cr.status === "approved"
                        ? "bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-300"
                        : "bg-danger-100 dark:bg-danger-900/30 text-danger-800 dark:text-danger-300"
                    }`}
                  >
                    {cr.status}
                  </span>
                </div>
                {cr.status === "pending" && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => reviewChangeRequest(event.id, cr.id, "approved")}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => reviewChangeRequest(event.id, cr.id, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
