import {principalCanManageRole} from '../../auth/rbac';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {schoolTransaction} from '../../lib/schoolTransaction';
import {AppError} from '../../lib/errors';
import {randomToken,sha256} from '../../lib/token';
import {authLink,encryptAuthEmail} from '../../lib/authEmail';
const rowSchema=z.object({rowNumber:z.number().int().positive(),firstName:z.string().trim().max(80).default(''),lastName:z.string().trim().max(80).default(''),email:z.string().trim().toLowerCase().email().max(254)}).strict();
export const staffImportSchema=z.object({dryRun:z.boolean().default(true),idempotencyKey:z.string().uuid().optional(),defaultRole:z.enum(['TEACHER','STAFF']).default('TEACHER'),rows:z.array(z.unknown()).min(1).max(100)}).strict().superRefine((input,ctx)=>{if(!input.dryRun&&!input.idempotencyKey)ctx.addIssue({code:'custom',path:['idempotencyKey'],message:'Import retry key is required'});});
export async function importStaff(organizationId:string,actorId:string,raw:unknown){
 const input=staffImportSchema.parse(raw),errors:Array<{rowNumber:number;message:string}>=[],rows:Array<z.infer<typeof rowSchema>>=[],emails=new Set<string>(),numbers=new Set<number>();
 input.rows.forEach((row,index)=>{const parsed=rowSchema.safeParse(row);if(!parsed.success){errors.push({rowNumber:index+2,message:parsed.error.issues.map(e=>e.path.join('.')+': '+e.message).join('; ')});return;}if(emails.has(parsed.data.email)||numbers.has(parsed.data.rowNumber)){errors.push({rowNumber:parsed.data.rowNumber,message:'Duplicate email or row number in this file'});return;}emails.add(parsed.data.email);numbers.add(parsed.data.rowNumber);rows.push(parsed.data);});
 const requestHash=createHash('sha256').update(JSON.stringify({defaultRole:input.defaultRole,rows:[...rows].sort((a,b)=>a.rowNumber-b.rowNumber)})).digest('hex');
 return schoolTransaction(organizationId,async tx=>{
  const actor=await tx.membership.findFirst({where:{organizationId,userId:actorId,isActive:true,user:{isActive:true}}});
  if(!actor||!['PROPRIETOR','PRINCIPAL','SCHOOL_ADMIN'].includes(actor.role))throw new AppError(403,'FORBIDDEN','Staff management permission required');
  if(!input.dryRun){
   if(errors.length)throw new AppError(400,'IMPORT_HAS_ERRORS','Fix the spreadsheet errors before importing',{errors});
   const previous=await tx.importBatch.findUnique({where:{organizationId_kind_idempotencyKey:{organizationId,kind:'STAFF_INVITATIONS',idempotencyKey:input.idempotencyKey!}}});
   if(previous){if(previous.requestHash!==requestHash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','This retry key belongs to different rows');return {...previous.result as object,replayed:true};}
  }
  const existing=await tx.membership.findMany({where:{organizationId,user:{email:{in:[...emails]}}},select:{user:{select:{email:true}}}});
  const invitations=await tx.schoolInvitation.findMany({where:{organizationId,email:{in:[...emails]},acceptedAt:null,revokedAt:null,expiresAt:{gt:new Date()}},select:{email:true}});
  const duplicates=new Set([...existing.map(m=>m.user.email.toLowerCase()),...invitations.map(i=>i.email.toLowerCase())]);
  for(const row of rows)if(duplicates.has(row.email))errors.push({rowNumber:row.rowNumber,message:'This email already has a school membership or pending invitation'});
  if(input.dryRun)return {dryRun:true,validCount:input.rows.length-errors.length,errorCount:errors.length,errors,canCommit:errors.length===0,defaultRole:input.defaultRole};
  if(errors.length)throw new AppError(400,'IMPORT_HAS_ERRORS','Fix the spreadsheet errors before importing',{errors});
  const school=await tx.organization.findFirst({where:{id:organizationId,isActive:true},select:{name:true}});
  if(!school)throw new AppError(404,'NOT_FOUND','School not found');
  const expiresAt=new Date(Date.now()+48*3600000);
  const prepared=rows.map(row=>{const token=randomToken(32);return {row,id:randomUUID(),tokenHash:sha256(token),encryptedText:encryptAuthEmail(`You have been invited to ${school.name}.\nAccept within 48 hours: ${authLink('/accept-invitation',token)}\nOpen the link and join with Google or a password using this invited email. If you already have a password, use that password.`)};});
  await tx.schoolInvitation.createMany({data:prepared.map(({row,id,tokenHash})=>({id,organizationId,invitedById:actorId,firstName:row.firstName,lastName:row.lastName,email:row.email,role:input.defaultRole,tokenHash,expiresAt}))});
  await tx.authEmail.createMany({data:prepared.map(({row,encryptedText})=>({recipient:row.email,subject:`Invitation to ${school.name}`,encryptedText,expiresAt}))});
  const result={dryRun:false,created:rows.length,errorCount:0,errors:[],defaultRole:input.defaultRole,replayed:false};
  const batch=await tx.importBatch.create({data:{organizationId,kind:'STAFF_INVITATIONS',idempotencyKey:input.idempotencyKey!,requestHash,result}});
  await tx.auditLog.create({data:{organizationId,actorId,action:'USER_INVITED',entity:'ImportBatch',entityId:batch.id,metadata:{operation:'STAFF_IMPORT',created:rows.length,role:input.defaultRole}}});
  return result;
 });
}
export const pendingStaffRoleSchema=z.object({role:z.enum(['PROPRIETOR','PRINCIPAL','SCHOOL_ADMIN','BURSAR','TEACHER','EXAM_OFFICER','STAFF'])}).strict();
export async function updatePendingStaffRole(organizationId:string,actorId:string,id:string,raw:unknown){
 z.string().uuid().parse(id);const {role}=pendingStaffRoleSchema.parse(raw);
 return schoolTransaction(organizationId,async tx=>{
  const actor=await tx.membership.findFirst({where:{organizationId,userId:actorId,isActive:true,user:{isActive:true}}});
  if(!actor||!['PROPRIETOR','PRINCIPAL','SCHOOL_ADMIN'].includes(actor.role))throw new AppError(403,'FORBIDDEN','Cannot assign staff roles');
  const invitation=await tx.schoolInvitation.findFirst({where:{id,organizationId,acceptedAt:null,revokedAt:null,expiresAt:{gt:new Date()}}});
  if(!invitation||invitation.role==='PARENT')throw new AppError(404,'NOT_FOUND','Pending staff invitation not found');
  if(actor.role==='PRINCIPAL'&&(!principalCanManageRole(role)||!principalCanManageRole(invitation.role)))throw new AppError(403,'FORBIDDEN','Principals may assign academic roles only');
  if((role==='PROPRIETOR'||invitation.role==='PROPRIETOR')&&actor.role!=='PROPRIETOR')throw new AppError(403,'FORBIDDEN','Only an owner can assign owner access');
  await tx.schoolInvitation.update({where:{id},data:{role,invitedById:actorId}});
  await tx.auditLog.create({data:{organizationId,actorId,action:'ROLE_CHANGED',entity:'SchoolInvitation',entityId:id,metadata:{from:invitation.role,to:role}}});
  return {id,role};
 });
}
