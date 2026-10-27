import {prisma} from "../../lib/prisma";
import {requireStaff} from "../../middlewares/requireStaff";
import {updatePendingStaffRole} from '../imports/staffImport';
import {sendSuccess} from '../../lib/http';
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { validate } from "../../middlewares/validate";
import { invitationLimiter } from "../../middlewares/rateLimit";
import { createMembershipSchema } from "../memberships/memberships.validation";
import { StaffController } from "./staff.controller";
const c = new StaffController();
const staffRoutes = Router();
staffRoutes.use(authenticate, requireSchool);
staffRoutes.get("/me/assignments", requireStaff, async (req, res, next) => {
  try {
    const organizationId = req.auth!.schoolId!, userId = req.auth!.userId;
    const [classes, subjects] = await Promise.all([
      prisma.class.findMany({ where: { organizationId, isActive: true, classTeacherId: userId }, orderBy: { name: "asc" } }),
      prisma.classSubjectTeacher.findMany({ where: { organizationId, userId, class: { isActive: true }, subject: { isActive: true } }, include: { class: true, subject: true } }),
    ]);
    sendSuccess(res, { classTeacherOf: classes.map(c => ({ id: c.id, name: c.name, arm: c.arm })), assignments: subjects.map(a => ({ classId: a.classId, className: a.class.name, classArm: a.class.arm, subjectId: a.subjectId, subjectName: a.subject.name })) });
  } catch (error) { next(error); }
});
staffRoutes.get("/", requirePermission("staff:read"), c.list);
const inviteStaffSchema = createMembershipSchema.refine(input => input.role !== "PARENT", { path: ["role"], message: "Use parent invitations for parent access" });
staffRoutes.post("/", requirePermission("staff:write"), invitationLimiter, validate(inviteStaffSchema), c.invite);
staffRoutes.patch('/invitations/:id/role',requirePermission('memberships:write'),async(req,res,next)=>{try{sendSuccess(res,await updatePendingStaffRole(req.auth!.schoolId!,req.auth!.userId,req.params.id as string,req.body));}catch(error){next(error);}});
export default staffRoutes;
