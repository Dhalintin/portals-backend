// src/features/students/student.types.ts
import type { GenderType } from "@prisma/client";

export type StudentClassSummary = {
  id: string;
  name: string;
  arm: string | null;
  level: string | null;
  displayName: string;
} | null;

export type StudentPublic = {
  id: string;
  organizationId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  fullName: string;
  gender: GenderType | null;
  classId: string | null;
  class: StudentClassSummary;
  parentPhone: string | null;
  parentEmail: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};
