export function isAccountAmended(approval: Record<string, unknown>): boolean {
  return Boolean(approval.account_amended);
}

/** Lines stamped by account amend flow in `approval_notes`. */
export function accountAmendmentNotes(
  approval: Record<string, unknown>,
): string | undefined {
  const lines = String(approval.approval_notes ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("[Account amend"));
  return lines.length > 0 ? lines.join("\n") : undefined;
}
