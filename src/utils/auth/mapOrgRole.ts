import { OrgRole } from "@prisma/client";
import { AppRole } from "../../lib/jwt";

export function mapOrgRole(role: OrgRole): AppRole {
  switch (role) {
    case OrgRole.SCHOOL_ADMIN:
      return "school_admin";
    case OrgRole.TEACHER:
      return "teacher";
    case OrgRole.EXAM_OFFICER:
      return "exam_officer";
    default:
      return "teacher";
  }
}