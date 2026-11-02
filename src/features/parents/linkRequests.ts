import {Router} from "express";
import {z} from "zod";
import {prisma} from "../../lib/prisma";
import {AppError} from "../../lib/errors";
import {sendSuccess} from "../../lib/http";
import {getSchoolId} from "../../middlewares/requireSchool";
import {requirePermission} from "../../middlewares/requirePermission";
import {invitationLimiter} from "../../middlewares/rateLimit";
import type {Request} from "express";
export const childLinkInput=z.object({childName:z.string().trim().min(3).max(160),className:z.string().trim().max(80).optional(),note:z.string().trim().max(500).optional()});
export const childLinkReview=z.discriminatedUnion('decision',[
 z.object({decision:z.literal('APPROVED'),studentId:z.string().uuid(),reviewNote:z.string().trim().max(500).optional()}),
 z.object({decision:z.literal('DECLINED'),reviewNote:z.string().trim().min(3).max(500)})
]);
export const childNameKey=(name:string)=>name.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g,' ');
async function ownParent(req:Request){
 if(req.auth?.orgRole!=='PARENT'&&!req.auth?.orgRoles?.includes('PARENT'))throw new AppError(403,'FORBIDDEN','Parent membership required');
 const parent=await prisma.parent.findFirst({where:{organizationId:getSchoolId(req),userId:req.auth!.userId,isActive:true},select:{id:true}});
 if(!parent)throw new AppError(403,'NOT_A_PARENT','No active parent profile linked in this school');
 return parent;
}
export const childLinkRoutes=Router();
childLinkRoutes.get('/me/link-requests',async(req,res,next)=>{try{const parent=await ownParent(req);sendSuccess(res,{items:await prisma.childLinkRequest.findMany({where:{organizationId:getSchoolId(req),parentId:parent.id},orderBy:{createdAt:'desc'},take:100})});}catch(e){next(e);}});
childLinkRoutes.post('/me/link-requests',invitationLimiter,async(req,res,next)=>{try{
 const parent=await ownParent(req),input=childLinkInput.parse(req.body),organizationId=getSchoolId(req);
 const where={parentId_childKey:{parentId:parent.id,childKey:childNameKey(input.childName)}};
 // A unique name key makes retries safe after a lost response.
 const request=await prisma.childLinkRequest.upsert({where,create:{...input,organizationId,parentId:parent.id,childKey:where.parentId_childKey.childKey},update:{}});
 sendSuccess(res,request,201);
}catch(e){next(e);}});
childLinkRoutes.get('/link-requests',requirePermission('parents:write'),async(req,res,next)=>{try{
 const page=z.coerce.number().int().min(1).parse(req.query.page??1),where={organizationId:getSchoolId(req),status:'PENDING',parent:{isActive:true}};
 const [items,total]=await Promise.all([prisma.childLinkRequest.findMany({where,include:{parent:{select:{id:true,firstName:true,lastName:true,email:true,phone:true}}},orderBy:{createdAt:'asc'},skip:(page-1)*25,take:25}),prisma.childLinkRequest.count({where})]);
 sendSuccess(res,{items,total,page,totalPages:Math.max(1,Math.ceil(total/25))});
}catch(e){next(e);}});
childLinkRoutes.post('/link-requests/:id/review',requirePermission('parents:write'),async(req,res,next)=>{try{
 const id=z.string().uuid().parse(req.params.id),input=childLinkReview.parse(req.body),organizationId=getSchoolId(req);
 const value=await prisma.$transaction(async tx=>{
  const request=await tx.childLinkRequest.findFirst({where:{id,organizationId,parent:{organizationId,isActive:true}}});
  if(!request)throw new AppError(404,'NOT_FOUND','Child-link request not found');
  if(request.status!=='PENDING')throw new AppError(409,'ALREADY_REVIEWED','This request has already been reviewed. Refresh the list.');
  if(input.decision==='APPROVED'){
   const student=await tx.student.findFirst({where:{id:input.studentId,organizationId,isActive:true},select:{id:true}});
   if(!student)throw new AppError(404,'NOT_FOUND','Choose an active student in this school');
  }
  const updated=await tx.childLinkRequest.updateMany({where:{id,organizationId,status:'PENDING'},data:{status:input.decision,reviewNote:input.reviewNote??null,reviewerId:req.auth!.userId,reviewedAt:new Date(),studentId:input.decision==='APPROVED'?input.studentId:null}});
  if(updated.count!==1)throw new AppError(409,'ALREADY_REVIEWED','Another administrator has reviewed this request.');
  if(input.decision==='APPROVED')await tx.parentStudent.upsert({where:{parentId_studentId:{parentId:request.parentId,studentId:input.studentId}},create:{organizationId,parentId:request.parentId,studentId:input.studentId,isPrimary:false},update:{}});
  return {id,status:input.decision};
 });sendSuccess(res,value);
}catch(e){next(e);}});
