import type { SafetyCheckFeedback } from "@/utils/arrangements";

/** Rejected feedback remains visible until the coordinator resolves it. */
export function shouldShowSafetyFeedback(
  status: string,
  feedback: SafetyCheckFeedback[] | undefined,
): status is "changes_needed" | "rejected" {
  return status === "changes_needed" || (status === "rejected" && !!feedback?.length);
}
