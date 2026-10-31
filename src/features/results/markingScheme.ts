import type {Prisma,MarkingScheme} from '@prisma/client';
import {z} from 'zod';
import {AppError} from '../../lib/errors';
import {schoolTransaction} from '../../lib/schoolTransaction';
import {membershipRoles} from '../../auth/rbac';
export const markingSchemeId=z.enum(['CA20_20_EXAM60','CA15_15_EXAM70']);
export const markingSchemeSchema=z.object({schemeId:markingSchemeId}).strict();
export function schemeDetails(id:MarkingScheme){return {id,ca1:id==='CA15_15_EXAM70'?15:20,ca2:id==='CA15_15_EXAM70'?15:20,exam:id==='CA15_15_EXAM70'?70:60};}
export function validateSchemeMarks(id:MarkingScheme,marks:{ca1?:number|null;ca2?:number|null;exam?:number|null}){const limits=schemeDetails(id);for(const field of ['ca1','ca2','exam'] as const){const value=marks[field];if(value!=null&&(!Number.isFinite(value)||value<0||value>limits[field]))throw new AppError(400,'INVALID_SCORE',`${field.toUpperCase()} must be between 0 and ${limits[field]} for this term.`);}}
// Called inside schoolTransaction: scheme changes and score writes serialize together.
export async function termScheme(tx:Prisma.TransactionClient,organizationId:string,termId:string,freeze=false){
 const term=await tx.term.findFirst({where:{id:termId,session:{organizationId}},select:{id:true,markingScheme:true}});
 if(!term)throw new AppError(404,'TERM_NOT_FOUND','Term not found');
 if(term.markingScheme)return term.markingScheme;
 const school=await tx.organization.findUniqueOrThrow({where:{id:organizationId},select:{markingScheme:true}});
 if(freeze)await tx.term.update({where:{id:termId},data:{markingScheme:school.markingScheme}});
 return school.markingScheme;
}
async function configuration(tx:Prisma.TransactionClient,organizationId:string){
 const school=await tx.organization.findUniqueOrThrow({where:{id:organizationId},select:{markingScheme:true}});
 const term=await tx.term.findFirst({where:{isCurrent:true,session:{organizationId,isCurrent:true}},select:{id:true,name:true,markingScheme:true,session:{select:{name:true}}}});
 const locked=term?await tx.score.count({where:{result:{organizationId,termId:term.id}}})>0:false;
 return {defaultScheme:schemeDetails(school.markingScheme),currentTerm:term?{id:term.id,name:term.name,sessionName:term.session.name,scheme:schemeDetails(term.markingScheme??school.markingScheme),locked}:null};
}
export function readMarkingScheme(organizationId:string){return schoolTransaction(organizationId,tx=>configuration(tx,organizationId));}
export function updateMarkingScheme(organizationId:string,actorId:string,raw:unknown){const {schemeId}=markingSchemeSchema.parse(raw);return schoolTransaction(organizationId,async tx=>{
 const actor=await tx.membership.findFirst({where:{organizationId,userId:actorId,isActive:true,user:{isActive:true}}});
 if(!actor||!membershipRoles(actor).includes('PROPRIETOR'))throw new AppError(403,'FORBIDDEN','Only a school owner can change the marking scheme.');
 const before=await configuration(tx,organizationId),term=before.currentTerm;
 if(term?.locked&&term.scheme.id!==schemeId)throw new AppError(409,'MARKING_SCHEME_LOCKED','Score entry has started for this term. Choose a new scheme after starting the next term. Existing marks will remain unchanged.');
 await tx.organization.update({where:{id:organizationId},data:{markingScheme:schemeId}});
 if(term)await tx.term.update({where:{id:term.id},data:{markingScheme:schemeId}});
 await tx.auditLog.create({data:{organizationId,actorId,action:'SETTINGS_CHANGED',entity:'Organization',entityId:organizationId,metadata:{operation:'MARKING_SCHEME_CHANGED',from:before.defaultScheme.id,to:schemeId,termId:term?.id??null}}});
 return configuration(tx,organizationId);
});}
