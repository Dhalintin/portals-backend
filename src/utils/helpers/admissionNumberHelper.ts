import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

export function generateAdmissionNumber(): string {
  const year = new Date().getFullYear();
  const suffix = randomBytes(4).toString("hex").toUpperCase();

  return `ADM-${year}-${suffix}`;
}

export function isAdmissionNumberConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;

  return Array.isArray(target)
    ? target.some((field) =>
        String(field).toLowerCase().includes("admissionnumber")
      )
    : String(target ?? "")
        .toLowerCase()
        .includes("admissionnumber");
}
