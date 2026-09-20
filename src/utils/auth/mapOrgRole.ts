import { OrgRole } from "@prisma/client";
import { AppRole } from "../../lib/jwt";

export function mapOrgRole(role: OrgRole): AppRole {
  switch (role) {
    case OrgRole.SCHOOL_ADMIN:
      return "SCHOOL_ADMIN";
    case OrgRole.TEACHER:
      return "TEACHER";
    case OrgRole.EXAM_OFFICER:
      return "EXAM_OFFICER";
    default:
      return "TEACHER";
  }
}
