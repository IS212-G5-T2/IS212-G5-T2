import { describe, expect, it } from "vitest";
import { shouldShowSafetyFeedback } from "@/features/events/pages/detail/planning/safetyFeedbackVisibility";
import type { SafetyCheckFeedback } from "@/utils/arrangements";

const feedback: SafetyCheckFeedback[] = [
  { id: "feedback-1", text: "Provide a fire exit layout", requestedAt: "2026-10-01T00:00:00Z" },
];

describe("safety feedback visibility", () => {
  /** SPM-129 supplementary case: SAFETY-QUEUE-05 rejection feedback stays visible while unresolved. */
  it("SAFETY-QUEUE-05-SUP-REJECT-RESOLUTION shows rejected feedback until coordinator resolution", () => {
    expect(shouldShowSafetyFeedback("rejected", feedback)).toBe(true);
    expect(shouldShowSafetyFeedback("rejected", [])).toBe(false);
    expect(shouldShowSafetyFeedback("rejected", undefined)).toBe(false);
  });

  /** SPM-129 supplementary case: changes-needed feedback remains visible while its resolution is pending. */
  it("keeps changes-needed feedback visible", () => {
    expect(shouldShowSafetyFeedback("changes_needed", feedback)).toBe(true);
    expect(shouldShowSafetyFeedback("changes_needed", [])).toBe(true);
    expect(shouldShowSafetyFeedback("changes_needed", undefined)).toBe(true);
  });

  /** SPM-129 supplementary case: feedback is not displayed for other safety states. */
  it("does not show feedback for unrelated statuses", () => {
    expect(shouldShowSafetyFeedback("pending", feedback)).toBe(false);
    expect(shouldShowSafetyFeedback("approved", feedback)).toBe(false);
  });
});
