import {passwordSchema} from '../auth/auth.validation';
import {Router} from 'express';
import {z} from 'zod';
import {randomBytes,createHash} from 'crypto';
import {prisma} from '../../lib/prisma';
import {AppError} from '../../lib/errors';
import {hashPassword,verifyPassword} from '../../lib/password';
import {schoolTransaction} from '../../lib/schoolTransaction';
import {authSessions} from '../auth/auth.sessions';
import {feesService} from '../fees/fees.service';
import {resultsService} from '../results/results.service';
import {requirePermission} from '../../middlewares/requirePermission';
import {invitationLimiter} from '../../middlewares/rateLimit';
import {sendSuccess} from '../../lib/http';
import type {AuthContext} from '../../auth/types';
export const studentLoginSchema=z.object({admissionNumber:z.string().trim().min(1).max(100),password:z.string().min(1).max(128),schoolSlug:z.string().trim().max(80).optional(),activationCode:z.string().trim().min(16).max(100).optional()}).strict();
export async function studentLogin(raw:unknown){
 const input=studentLoginSchema.parse(raw);
 if(input.activationCode)return activateStudent(input);
 const candidates=await prisma.student.findMany({where:{admissionNumber:{equals:input.admissionNumber,mode:'insensitive'},isActive:true,portalEnabled:true,organization:{isActive:true,...(input.schoolSlug?{slug:input.schoolSlug}:{})},user:{isActive:true,memberships:{some:{isActive:true,role:'STUDENT'}}}},include:{user:true,organization:{select:{id:true,name:true,slug:true}}},take:51});
 if(candidates.length>50)throw new AppError(400,'SCHOOL_LINK_REQUIRED','Open the student sign-in link provided by your school.');
 const matching=[];
 for(const student of candidates)if(await verifyPassword(input.password,student.user?.passwordHash))matching.push(student);
 if(!matching.length)throw new AppError(401,'INVALID_CREDENTIALS','Admission number or password is incorrect. Check your school sign-in link.');
 if(matching.length>1)throw new AppError(409,'SCHOOL_SELECTION_REQUIRED','Choose your school to continue.',{schools:matching.map(student=>student.organization)});
 const student=matching[0],member=await prisma.membership.findFirst({where:{organizationId:student.organizationId,userId:student.userId!,isActive:true,role:'STUDENT'}});
 if(!member||!student.user)throw new AppError(401,'INVALID_CREDENTIALS','Student access is not enabled. Contact the school office.');
 return authSessions.create(student.user.id,student.organizationId,student.user.authVersion);
}

async function activateStudent(input:z.infer<typeof studentLoginSchema>){
 passwordSchema.parse(input.password);
 const digest=createHash('sha256').update(input.activationCode!).digest('hex');
 const candidate=await prisma.student.findFirst({where:{activationCodeHash:digest,activationCodeExpiresAt:{gt:new Date()},portalEnabled:true,isActive:true,admissionNumber:{equals:input.admissionNumber,mode:'insensitive'},organization:{isActive:true,...(input.schoolSlug?{slug:input.schoolSlug}:{})}},select:{id:true,organizationId:true}});
 if(!candidate)throw new AppError(400,'INVALID_ACTIVATION','The activation code or admission number is incorrect, expired or already used. Ask the school for a new code.');
 const passwordHash=await hashPassword(input.password);
 const user=await schoolTransaction(candidate.organizationId,async tx=>{
  const claimed=await tx.student.updateMany({where:{id:candidate.id,organizationId:candidate.organizationId,isActive:true,portalEnabled:true,activationCodeHash:digest,activationCodeExpiresAt:{gt:new Date()},userId:null},data:{activationCodeHash:null,activationCodeExpiresAt:null}});
  if(claimed.count!==1)throw new AppError(409,'ACTIVATION_USED','This activation code is no longer available. Sign in or ask your school to reset your password.');
  const student=await tx.student.findUniqueOrThrow({where:{id:candidate.id}});
  const user=await tx.user.create({data:{email:'student.'+student.id+'@accounts.schoolos.invalid',firstName:student.firstName,lastName:student.lastName,passwordHash}});
  await tx.membership.create({data:{userId:user.id,organizationId:student.organizationId,role:'STUDENT',roles:['STUDENT']}});
  await tx.student.update({where:{id:student.id},data:{userId:user.id,portalEnabled:true,activationCodeHash:null,activationCodeExpiresAt:null}});
  await tx.auditLog.create({data:{organizationId:student.organizationId,actorId:user.id,action:'SETTINGS_CHANGED',entity:'Student',entityId:student.id,metadata:{operation:'STUDENT_ACTIVATED'}}});
  return user;
 });
 return authSessions.create(user.id,candidate.organizationId,user.authVersion);
}

export async function ownStudent(auth:AuthContext){
 if(auth.orgRole!=='STUDENT')throw new AppError(403,'FORBIDDEN','Student account required');
 const student=await prisma.student.findFirst({where:{organizationId:auth.schoolId!,userId:auth.userId,isActive:true,portalEnabled:true},include:{class:{select:{name:true,arm:true}},organization:{select:{name:true,slug:true,logoUrl:true}}}});
 if(!student)throw new AppError(404,'NOT_FOUND','Student record not found');
 return student;
}
export async function manageStudentAccount(organizationId:string,studentId:string,actorId:string,raw:unknown){
 const {action}=z.object({action:z.enum(['activation','enable','reset','disable'])}).strict().parse(raw);
 return schoolTransaction(organizationId,async tx=>{
  const student=await tx.student.findFirst({where:{id:studentId,organizationId},include:{organization:{select:{slug:true}},user:true}});
  if(!student)throw new AppError(404,'NOT_FOUND','Student not found');
  if(!student.isActive&&action!=='disable')throw new AppError(400,'INACTIVE_STUDENT','Activate the student record first');
  if(action==='activation'){
   if(student.userId)throw new AppError(409,'ACCOUNT_EXISTS','This student already has an account. Use Reset password instead.');
   const activationCode=randomBytes(18).toString('base64url'),expiresAt=new Date(Date.now()+7*24*60*60*1000);
   await tx.student.update({where:{id:student.id},data:{portalEnabled:true,activationCodeHash:createHash('sha256').update(activationCode).digest('hex'),activationCodeExpiresAt:expiresAt}});
   await tx.auditLog.create({data:{organizationId,actorId,action:'SETTINGS_CHANGED',entity:'Student',entityId:student.id,metadata:{operation:'STUDENT_ACTIVATION_ISSUED'}}});
   return {enabled:true,admissionNumber:student.admissionNumber,schoolSlug:student.organization.slug,activationCode,expiresAt};
  }
  if(action==='disable'){
   await tx.student.update({where:{id:student.id},data:{portalEnabled:false,activationCodeHash:null,activationCodeExpiresAt:null}});
   if(student.userId){await tx.user.update({where:{id:student.userId},data:{isActive:false,authVersion:{increment:1}}});await tx.membership.updateMany({where:{organizationId,userId:student.userId,role:'STUDENT'},data:{isActive:false}});await tx.authSession.updateMany({where:{userId:student.userId,revokedAt:null},data:{revokedAt:new Date()}});}
   await tx.auditLog.create({data:{organizationId,actorId,action:'SETTINGS_CHANGED',entity:'Student',entityId:student.id,metadata:{operation:'STUDENT_LOGIN_DISABLED'}}});
   return {enabled:false,admissionNumber:student.admissionNumber,schoolSlug:student.organization.slug};
  }
  if(student.portalEnabled&&student.user&&action==='enable'&&student.user.isActive){
   const membership=await tx.membership.findUnique({where:{userId_organizationId:{userId:student.user.id,organizationId}}});
   if(membership?.isActive&&membership.role==='STUDENT')return {enabled:true,admissionNumber:student.admissionNumber,schoolSlug:student.organization.slug};
  }
  const temporaryPassword=randomBytes(15).toString('base64url')+'a1',passwordHash=await hashPassword(temporaryPassword);
  const user=student.userId?await tx.user.update({where:{id:student.userId},data:{passwordHash,isActive:true,authVersion:{increment:1}}}):await tx.user.create({data:{email:'student.'+student.id+'@accounts.schoolos.invalid',firstName:student.firstName,lastName:student.lastName,passwordHash}});
  await tx.membership.upsert({where:{userId_organizationId:{userId:user.id,organizationId}},create:{userId:user.id,organizationId,role:'STUDENT',roles:['STUDENT']},update:{role:'STUDENT',roles:['STUDENT'],isActive:true}});
  await tx.student.update({where:{id:student.id},data:{userId:user.id,portalEnabled:true,activationCodeHash:null,activationCodeExpiresAt:null}});
  await tx.authSession.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});
  await tx.auditLog.create({data:{organizationId,actorId,action:'SETTINGS_CHANGED',entity:'Student',entityId:student.id,metadata:{operation:action==='reset'?'STUDENT_PASSWORD_RESET':'STUDENT_LOGIN_ENABLED'}}});
  return {enabled:true,admissionNumber:student.admissionNumber,schoolSlug:student.organization.slug,temporaryPassword};
 });
}
export const studentPortal=Router();
studentPortal.get('/me',async(req,res,next)=>{try{const s=await ownStudent(req.auth!);sendSuccess(res,{id:s.id,firstName:s.firstName,lastName:s.lastName,admissionNumber:s.admissionNumber,contactEmail:s.contactEmail,class:s.class,school:s.organization});}catch(e){next(e);}});
studentPortal.patch('/me',async(req,res,next)=>{try{const s=await ownStudent(req.auth!),input=z.object({contactEmail:z.string().trim().email().max(320).transform(v=>v.toLowerCase())}).strict().parse(req.body);sendSuccess(res,await prisma.student.update({where:{id:s.id},data:input,select:{id:true,contactEmail:true}}));}catch(e){next(e);}});
studentPortal.get('/fees',async(req,res,next)=>{try{const s=await ownStudent(req.auth!);sendSuccess(res,await feesService.familyFees(s.organizationId,req.auth!.userId,[s.id]));}catch(e){next(e);}});
studentPortal.get('/results',async(req,res,next)=>{try{const s=await ownStudent(req.auth!);sendSuccess(res,await prisma.result.findMany({where:{organizationId:s.organizationId,studentId:s.id,isPublished:true,status:'PUBLISHED'},include:{student:{select:{id:true,firstName:true,lastName:true,admissionNumber:true}},term:{select:{id:true,name:true,markingScheme:true,session:{select:{name:true}}}},class:{select:{id:true,name:true,arm:true}},scores:{include:{subject:{select:{name:true,code:true}}}}},orderBy:{publishedAt:'desc'}}));}catch(e){next(e);}});
studentPortal.get('/results/:id/report-card',async(req,res,next)=>{try{const s=await ownStudent(req.auth!),id=z.string().uuid().parse(req.params.id);const visible=await prisma.result.findFirst({where:{id,organizationId:s.organizationId,studentId:s.id,isPublished:true,status:'PUBLISHED'},select:{id:true}});if(!visible)throw new AppError(404,'NOT_FOUND','Published result not found');const report=await resultsService.reportCardPayload(s.organizationId,id);if(!report.result.isPublished||report.result.status!=='PUBLISHED')throw new AppError(404,'NOT_FOUND','Published result not found');sendSuccess(res,report);}catch(e){next(e);}});
studentPortal.get('/parent-requests',async(req,res,next)=>{try{const s=await ownStudent(req.auth!);sendSuccess(res,{items:await prisma.studentParentRequest.findMany({where:{studentId:s.id,organizationId:s.organizationId},orderBy:{createdAt:'desc'},take:100})});}catch(e){next(e);}});
studentPortal.post('/parent-requests',invitationLimiter,async(req,res,next)=>{try{const s=await ownStudent(req.auth!),{email}=z.object({email:z.string().trim().email().max(320).transform(v=>v.toLowerCase())}).strict().parse(req.body);sendSuccess(res,await prisma.studentParentRequest.upsert({where:{studentId_email:{studentId:s.id,email}},create:{organizationId:s.organizationId,studentId:s.id,email},update:{}}),201);}catch(e){next(e);}});
export const studentParentReviews=Router();
studentParentReviews.get('/student-parent-requests',requirePermission('parents:write'),async(req,res,next)=>{try{const page=z.coerce.number().int().min(1).parse(req.query.page??1),where={organizationId:req.auth!.schoolId!,status:'PENDING',student:{isActive:true}};const [items,total]=await Promise.all([prisma.studentParentRequest.findMany({where,include:{student:{select:{id:true,firstName:true,lastName:true,admissionNumber:true}}},orderBy:{createdAt:'asc'},take:25,skip:(page-1)*25}),prisma.studentParentRequest.count({where})]);sendSuccess(res,{items,total,page,totalPages:Math.max(1,Math.ceil(total/25))});}catch(e){next(e);}});
studentParentReviews.post('/student-parent-requests/:id/review',requirePermission('parents:write'),async(req,res,next)=>{try{const id=z.string().uuid().parse(req.params.id),input=z.discriminatedUnion('decision',[z.object({decision:z.literal('APPROVED'),firstName:z.string().trim().min(1).max(80),lastName:z.string().trim().min(1).max(80)}),z.object({decision:z.literal('DECLINED'),reviewNote:z.string().trim().min(3).max(500)})]).parse(req.body),organizationId=req.auth!.schoolId!;
 const result=await schoolTransaction(organizationId,async tx=>{
  const request=await tx.studentParentRequest.findFirst({where:{id,organizationId,student:{organizationId,isActive:true}}});if(!request)throw new AppError(404,'NOT_FOUND','Parent request not found');if(request.status!=='PENDING')throw new AppError(409,'ALREADY_REVIEWED','This request has already been reviewed');
  let parentId:string|undefined;
  if(input.decision==='APPROVED'){
   const matches=await tx.parent.findMany({where:{organizationId,email:{equals:request.email,mode:'insensitive'},isActive:true},take:2});
   if(matches.length>1)throw new AppError(409,'DUPLICATE_PARENTS','More than one parent has this email. Resolve the duplicate parent records first.');
   const parent=matches[0]??await tx.parent.create({data:{organizationId,email:request.email,firstName:input.firstName,lastName:input.lastName}});parentId=parent.id;
   await tx.parentStudent.upsert({where:{parentId_studentId:{parentId:parent.id,studentId:request.studentId}},create:{organizationId,parentId:parent.id,studentId:request.studentId,isPrimary:false},update:{}});
  }
  await tx.studentParentRequest.update({where:{id},data:{status:input.decision,reviewNote:input.decision==='DECLINED'?input.reviewNote:null,reviewerId:req.auth!.userId,reviewedAt:new Date()}});
  await tx.auditLog.create({data:{organizationId,actorId:req.auth!.userId,action:'SETTINGS_CHANGED',entity:'StudentParentRequest',entityId:id,metadata:{decision:input.decision,studentId:request.studentId}}});return {id,status:input.decision,parentId};
 });sendSuccess(res,result);
}catch(e){next(e);}});
