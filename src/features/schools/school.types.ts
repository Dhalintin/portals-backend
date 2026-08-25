// src/features/schools/school.types.ts
export type SchoolPublic = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  motto: string | null;
  schoolType: string | null;
  isActive: boolean;
  onBoarded: boolean;
  createdAt: Date;
  updatedAt: Date;
};
