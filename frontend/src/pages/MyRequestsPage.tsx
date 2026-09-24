import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/utils/api";
import type { DraftRecord } from "@/types/draft";

export function MyRequestsPage() {
  const [requests, setRequests] = useState<DraftRecord[]>([]);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailure("");
    api<DraftRecord[]>("/requests")
      .then((value) => {
        if (active) setRequests(value);
      })
      .catch((error) => {
        if (active)
          setFailure(
            error instanceof Error ? error.message : "Unable to load requests.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  // Only unsubmitted drafts belong here. Once a draft is submitted it becomes an
  // event and is surfaced under "My Events" instead, so it drops out of this list.
  const drafts = requests.filter((request) => request.status === "Draft");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="My drafts"
        description="Continue a saved draft. Submitted requests move to My Events."
      />
      {loading ? (
        <p role="status">Loading drafts…</p>
      ) : failure ? (
        <div role="alert">
          <p>{failure}</p>
          <Button onClick={() => setRetry((v) => v + 1)}>Retry</Button>
        </div>
      ) : drafts.length === 0 ? (
        <Card>
          <CardBody>
            No saved drafts yet. Save a draft from the event form to continue
            it later.
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-3">
          {drafts.map((request) => (
            <li key={request.id}>
              <Card>
                <CardBody>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Link
                        className="font-semibold text-primary-700"
                        to={`/requests/${request.id}`}
                      >
                        {request.fields.name.trim() || "Untitled event request"}
                      </Link>
                      <p className="mt-1 text-xs text-gray-500">
                        Saved {new Date(request.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"
                    >
                      {request.status}
                    </span>
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
