// src/features/classes/class.types.ts
export type ClassPublic = {
  id: string;
  organizationId: string;
  name: string;
  arm: string | null;
  level: string | null;
  isActive: boolean;
  /** e.g. "JSS 2A" or "JSS 2" */
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
};
