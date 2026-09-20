/**
 * Default private-school letter grades (0–100).
 * Swap or make org-configurable later without changing Score storage.
 */
export function gradeFromTotal(
  total: number | null | undefined
): string | null {
  if (total == null || Number.isNaN(total)) return null;
  const t = total;
  if (t >= 70) return "A";
  if (t >= 60) return "B";
  if (t >= 50) return "C";
  if (t >= 45) return "D";
  if (t >= 40) return "E";
  return "F";
}

export function computeScoreTotal(
  ca1?: number | null,
  ca2?: number | null,
  exam?: number | null
): number {
  return (ca1 ?? 0) + (ca2 ?? 0) + (exam ?? 0);
}

/** Remark hint from grade — optional UX, not stored unless caller sets remark */
export function defaultRemarkFromGrade(grade: string | null): string | null {
  if (!grade) return null;
  const map: Record<string, string> = {
    A: "Excellent",
    B: "Very Good",
    C: "Good",
    D: "Fair",
    E: "Pass",
    F: "Fail",
  };
  return map[grade] ?? null;
}
