import {requireStaffManager} from "../../middlewares/requireStaffManager";
import {AppError} from "../../lib/errors";
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
staffRoutes.get("/me", requireStaff, async (req, res, next) => {
  try {
    const organizationId=req.auth!.schoolId!, userId=req.auth!.userId;
    const membership=await prisma.membership.findFirst({where:{organizationId,userId,isActive:true,user:{isActive:true}},
      select:{id:true,role:true,joinedAt:true,user:{select:{id:true,email:true,firstName:true,lastName:true,phone:true,avatarUrl:true}}}});
    if(!membership)throw new AppError(403,"FORBIDDEN","Your staff record is unavailable.");
    const [classes,subjects]=await Promise.all([
      prisma.class.findMany({where:{organizationId,isActive:true,classTeacherId:userId},select:{id:true,name:true,arm:true}}),
      prisma.classSubjectTeacher.findMany({where:{organizationId,userId,class:{isActive:true},subject:{isActive:true}},select:{class:{select:{id:true,name:true,arm:true}},subject:{select:{id:true,name:true}}}}),
    ]);
    sendSuccess(res,{membershipId:membership.id,role:membership.role,joinedAt:membership.joinedAt,user:membership.user,classTeacherOf:classes,assignments:subjects});
  }catch(error){next(error);}
});

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
staffRoutes.get("/", requireStaffManager, requirePermission("staff:read"), c.list);
const inviteStaffSchema = createMembershipSchema.refine(input => input.role !== "PARENT", { path: ["role"], message: "Use parent invitations for parent access" });
staffRoutes.post("/", requireStaffManager, requirePermission("staff:write"), invitationLimiter, validate(inviteStaffSchema), c.invite);
staffRoutes.patch('/invitations/:id/role',requireStaffManager,requirePermission('memberships:write'),async(req,res,next)=>{try{sendSuccess(res,await updatePendingStaffRole(req.auth!.schoolId!,req.auth!.userId,req.params.id as string,req.body));}catch(error){next(error);}});
export default staffRoutes;
