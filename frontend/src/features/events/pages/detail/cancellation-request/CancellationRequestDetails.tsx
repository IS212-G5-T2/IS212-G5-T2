/*
 * SPM-155: the lines both cancellation panels show for a request (requested, closed note, decided, reason). The
 * Coordinator panel also names who asked (`showRequester`). Reasons are rendered as text only (React escapes them).
 */
import type { CancellationRequest } from "@/features/events/types/cancellationRequest";
import { formatSingaporeDateTime } from "@/utils/format";

interface Props {
  request: CancellationRequest;
  /** True on the Coordinator panel: "Requested by NAME on DATE" instead of "Requested DATE". */
  showRequester?: boolean;
}

export function CancellationRequestDetails({ request, showRequester = false }: Props) {
  return (
    <>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {showRequester
          ? `Requested by ${request.requestedBy} on ${formatSingaporeDateTime(request.requestedAt)}`
          : `Requested ${formatSingaporeDateTime(request.requestedAt)}`}
      </p>
      {request.closedNote && <p className="text-sm text-gray-700 dark:text-gray-300">{request.closedNote}</p>}
      {request.decidedAt && request.decidedBy && (
        <p className="text-sm text-gray-700 dark:text-gray-300">{`Decided by ${request.decidedBy} on ${formatSingaporeDateTime(request.decidedAt)}`}</p>
      )}
      {request.reason && (
        <p className="text-sm text-gray-900 dark:text-gray-100">
          <span className="font-medium">Reason:</span> <span className="whitespace-pre-wrap">{request.reason}</span>
        </p>
      )}
    </>
  );
}
