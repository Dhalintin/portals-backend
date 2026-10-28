import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { schoolTransaction } from "../../lib/schoolTransaction";
import { AppError } from "../../lib/errors";

export function publishedNotices(organizationId:string):Prisma.AnnouncementWhereInput {
 return {organizationId,isActive:true,isPublished:true,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]};
}
export async function withReadStatus<T extends {id:string}>(items:T[],userId:string) {
 if(!items.length)return [];
 const reads=await prisma.announcementRead.findMany({where:{userId,announcementId:{in:items.map(item=>item.id)}},select:{announcementId:true,readAt:true}});
 const byId=new Map(reads.map(read=>[read.announcementId,read.readAt]));
 return items.map(item=>({...item,readAt:byId.get(item.id)??null}));
}
export async function unreadAnnouncements(organizationId:string,userId:string) {
 const where:Prisma.AnnouncementWhereInput={...publishedNotices(organizationId),reads:{none:{userId}}};
 const [count,items]=await prisma.$transaction([
  prisma.announcement.count({where}),
  prisma.announcement.findMany({where,select:{id:true,title:true,publishedAt:true,isPinned:true},orderBy:[{isPinned:"desc"},{publishedAt:"desc"},{id:"asc"}],take:20}),
 ],{isolationLevel:"RepeatableRead"});
 return {count,items};
}
export async function markAnnouncementRead(organizationId:string,userId:string,id:string) {
 return schoolTransaction(organizationId,async tx=>{
  const notice=await tx.announcement.findFirst({where:{id,...publishedNotices(organizationId)},select:{id:true}});
  if(!notice)throw new AppError(404,"NOT_FOUND","Announcement not found");
  return tx.announcementRead.upsert({where:{announcementId_userId:{announcementId:id,userId}},create:{announcementId:id,userId},update:{},select:{announcementId:true,readAt:true}});
 });
}
