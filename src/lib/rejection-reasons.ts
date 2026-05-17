export const REJECTION_REASONS = [
  { key: "role_filled",       label: "Role filled / withdrawn" },
  { key: "underqualified",    label: "Underqualified" },
  { key: "salary_mismatch",   label: "Salary mismatch" },
  { key: "location",          label: "Location / remote policy" },
  { key: "visa",              label: "Visa / work authorization" },
  { key: "failed_technical",  label: "Failed technical screen" },
  { key: "failed_behavioral", label: "Failed behavioral / culture" },
  { key: "ghosted",           label: "Ghosted" },
  { key: "withdrew",          label: "I withdrew" },
  { key: "other",             label: "Other" },
] as const;

export type RejectionReasonKey = (typeof REJECTION_REASONS)[number]["key"];

const REJECTION_REASON_KEYS: ReadonlySet<string> = new Set(
  REJECTION_REASONS.map((r) => r.key),
);

export function isRejectionReasonKey(value: unknown): value is RejectionReasonKey {
  return typeof value === "string" && REJECTION_REASON_KEYS.has(value);
}

export function labelForReason(
  key: RejectionReasonKey | null | undefined,
): string {
  if (!key) return "Unspecified";
  return REJECTION_REASONS.find((r) => r.key === key)?.label ?? "Unspecified";
}
