import {z} from 'zod';
import {createHmac,randomInt,randomUUID,timingSafeEqual} from 'crypto';
import type {AuthContext} from '../../auth/types';
import {prisma} from '../../lib/prisma';
import {schoolTransaction} from '../../lib/schoolTransaction';
import {AppError} from '../../lib/errors';
import {env} from '../../config/env';
import {verifyPassword} from '../../lib/password';
import {assertAuthEmailDeliveryConfigured,enqueueAuthEmail,encryptAuthEmail,decryptAuthEmail} from '../../lib/authEmail';
export const bankDetailsSchema=z.object({bankName:z.string().trim().min(2).max(100),accountName:z.string().trim().min(2).max(150),accountNumber:z.string().regex(/^\d{10}$/,'Enter a 10-digit Nigerian account number.')}).strict();
export const bankRequestSchema=bankDetailsSchema.extend({password:z.string().min(1).max(200)}).strict();
export const bankConfirmSchema=z.object({changeId:z.string().uuid(),code:z.string().regex(/^\d{6}$/)}).strict();
const digest=(id:string,code:string)=>createHmac('sha256',env.JWT_ACCESS_SECRET).update(id+':'+code).digest('hex');
async function owner(auth:AuthContext){if(auth.orgRole!=='PROPRIETOR'||!auth.schoolId)throw new AppError(403,'OWNER_ONLY','Only the school creator can change bank details.');const school=await prisma.organization.findFirst({where:{id:auth.schoolId,createdById:auth.userId,isActive:true}});if(!school)throw new AppError(403,'OWNER_ONLY','Only the school creator can manage bank details.');return school;}
export async function readBankAccount(auth:AuthContext){await owner(auth);const row=await prisma.schoolBankAccount.findUnique({where:{organizationId:auth.schoolId!}});return row?{...bankDetailsSchema.parse(JSON.parse(decryptAuthEmail(row.encryptedDetails))),updatedAt:row.updatedAt,version:row.version}:null;}
export async function requestBankChange(auth:AuthContext,raw:z.infer<typeof bankRequestSchema>){
 const school=await owner(auth),input=bankRequestSchema.parse(raw);const user=await prisma.user.findUniqueOrThrow({where:{id:auth.userId}});if(!user.isActive||!await verifyPassword(input.password,user.passwordHash))throw new AppError(403,'REAUTHENTICATION_FAILED','Your current password is incorrect.');assertAuthEmailDeliveryConfigured();
 const details=bankDetailsSchema.parse({bankName:input.bankName,accountName:input.accountName,accountNumber:input.accountNumber}),id=randomUUID(),code=String(randomInt(100000,1000000)),expiresAt=new Date(Date.now()+10*60_000);
 return schoolTransaction(school.id,async tx=>{
  const existing=await tx.schoolBankAccount.findUnique({where:{organizationId:school.id}});
  if(existing&&existing.updatedAt.getTime()>Date.now()-86400000)throw new AppError(429,'BANK_CHANGE_COOLDOWN','Bank details can be changed once every 24 hours.');
  const recent=await tx.bankAccountChange.findFirst({where:{organizationId:school.id},orderBy:{createdAt:'desc'}});
  if(recent&&recent.createdAt.getTime()>Date.now()-60_000)throw new AppError(429,'OTP_COOLDOWN','Wait one minute before requesting another code.');
  if(await tx.bankAccountChange.count({where:{organizationId:school.id,createdAt:{gte:new Date(Date.now()-3600000)}}})>=5)throw new AppError(429,'OTP_LIMIT','Too many verification requests. Try again in an hour.');
  await tx.bankAccountChange.updateMany({where:{organizationId:school.id,usedAt:null},data:{usedAt:new Date()}});
  await tx.bankAccountChange.create({data:{id,organizationId:school.id,requesterId:auth.userId,email:user.email,encryptedDetails:encryptAuthEmail(JSON.stringify(details)),codeHash:digest(id,code),expectedVersion:existing?.version??0,expiresAt}});
  await enqueueAuthEmail(tx,user.email,school.name+': verify bank account change','Your verification code is '+code+'. It expires in 10 minutes.\n\nProposed account: '+details.bankName+' — '+details.accountName+' — '+details.accountNumber+'.\n\nDo not share this code. If you did not request this, do not approve the change and secure your account.',expiresAt);
  await tx.auditLog.create({data:{organizationId:school.id,actorId:auth.userId,action:'SETTINGS_CHANGED',entity:'SchoolBankAccount',entityId:school.id,metadata:{operation:'BANK_CHANGE_REQUESTED',changeId:id,last4:details.accountNumber.slice(-4)}}});
  const [local,domain]=user.email.split('@');return {changeId:id,expiresAt,emailHint:local.slice(0,2)+'***@'+domain,details};
 });
}
export async function confirmBankChange(auth:AuthContext,raw:z.infer<typeof bankConfirmSchema>){
 const school=await owner(auth),input=bankConfirmSchema.parse(raw);
 const result=await schoolTransaction(school.id,async tx=>{
  const change=await tx.bankAccountChange.findFirst({where:{id:input.changeId,organizationId:school.id,requesterId:auth.userId}});
  if(!change||change.usedAt||change.expiresAt.getTime()<=Date.now()||change.attempts>=5)return {error:'The code expired or is no longer valid. Request a new code.'};
  const user=await tx.user.findUniqueOrThrow({where:{id:auth.userId}});const bank=await tx.schoolBankAccount.findUnique({where:{organizationId:school.id}});
  if(user.email!==change.email||(bank?.version??0)!==change.expectedVersion)return {error:'Account details changed during verification. Request a new code.'};
  const expected=Buffer.from(change.codeHash,'hex'),actual=Buffer.from(digest(change.id,input.code),'hex');
  if(!timingSafeEqual(expected,actual)){await tx.bankAccountChange.update({where:{id:change.id},data:{attempts:{increment:1}}});await tx.auditLog.create({data:{organizationId:school.id,actorId:auth.userId,action:'SETTINGS_CHANGED',entity:'SchoolBankAccount',entityId:school.id,metadata:{operation:'BANK_OTP_REJECTED',changeId:change.id}}});return {error:'Incorrect code. You have '+(4-change.attempts)+' attempts remaining.'};}
  if(bank&&bank.updatedAt.getTime()>Date.now()-86400000)return {error:'Bank details were changed recently. Wait 24 hours.'};
  const details=bankDetailsSchema.parse(JSON.parse(decryptAuthEmail(change.encryptedDetails)));
  await tx.schoolBankAccount.upsert({where:{organizationId:school.id},create:{organizationId:school.id,encryptedDetails:change.encryptedDetails},update:{encryptedDetails:change.encryptedDetails,version:{increment:1}}});
  await tx.bankAccountChange.update({where:{id:change.id},data:{usedAt:new Date(),codeHash:''}});
  await tx.auditLog.create({data:{organizationId:school.id,actorId:auth.userId,action:'SETTINGS_CHANGED',entity:'SchoolBankAccount',entityId:school.id,metadata:{operation:'BANK_ACCOUNT_CHANGED',version:change.expectedVersion+1,last4:details.accountNumber.slice(-4)}}});
  const recipients=new Set([user.email,change.email]);for(const recipient of recipients)await enqueueAuthEmail(tx,recipient,school.name+': bank account updated','Your school bank account was updated to '+details.bankName+', ending '+details.accountNumber.slice(-4)+'. If you did not approve this change, contact your school and secure your account immediately.',new Date(Date.now()+86400000));
  return {details};
 });
 if(result.error)throw new AppError(400,'INVALID_OTP',result.error);return result.details;
}
export async function bankTransferInstructions(organizationId:string){const account=await prisma.schoolBankAccount.findUnique({where:{organizationId}});return account?bankDetailsSchema.parse(JSON.parse(decryptAuthEmail(account.encryptedDetails))):null;}
