export type SubjectPublic = {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};
