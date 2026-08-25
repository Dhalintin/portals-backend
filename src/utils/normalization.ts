/** Normalize arm for unique constraint (null vs undefined) */
export function normalizeArm(arm: string | null | undefined): string | null {
  if (arm === undefined || arm === null || arm === "") return null;
  return arm;
}
