import type {RequestHandler} from 'express';
import {createHash} from 'node:crypto';
import {authenticate} from './authenticate';
import {inPrismaTransaction} from '../lib/prisma';
import {schoolTransaction} from '../lib/schoolTransaction';
import {AppError} from '../lib/errors';
export function offlineWritePermission(path:string,method:string){
 if(['GET','HEAD','OPTIONS'].includes(method))return null;
 if(/^\/students(\/|$)/.test(path))return 'students:write';
 if(/^\/parents(\/|$)/.test(path))return 'parents:write';
 if(/^\/(classes|subjects)(\/|$)/.test(path))return 'classes:write';
 if(/^\/academic(\/|$)/.test(path))return 'settings:write';
 if(/^\/schools\/(profile|branding|marking-scheme|onboarding)(\/|$)/.test(path))return 'settings:write';
 if(/^\/communication\/announcements(\/|$)/.test(path)&&!path.endsWith('/read'))return 'announcements:write';
 if(/^\/results(\/|$)/.test(path))return /publish|grade-scale/.test(path)?'results:publish':'results:write';
 if(/^\/exams\/timetable(\/|$)/.test(path))return /publish/.test(path)?'exams:publish':'exams:write';
 if(/^\/fees\/(categories|structures|assignments|invoices)(\/|$)/.test(path))return 'fees:write';
 if(/^\/(staff|memberships)(\/|$)/.test(path))return 'staff:write';
 if(/^\/imports\/(staff|students|parents)$/.test(path))return path.endsWith('/staff')?'staff:write':path.endsWith('/parents')?'parents:write':'students:write';
 return null;
}
export const offlineOperation:RequestHandler=(req,res,next)=>{
 const id=req.get('x-schoolos-operation');if(!id)return next();
 const permission=offlineWritePermission(req.path,req.method);
 if(!permission)return next(new AppError(400,'OFFLINE_ACTION_UNSUPPORTED','This action requires an online workflow.'));
 if(!/^[a-f0-9-]{36}$/i.test(id))return next(new AppError(400,'INVALID_OPERATION','Invalid offline operation key.'));
 authenticate(req,res,async error=>{
  if(error)return next(error);const auth=req.auth!;
  if(!auth.schoolId||!auth.permissions.some(item=>item===permission))return next(new AppError(403,'FORBIDDEN','Your current permissions do not allow this saved change. It remains on the device for review.'));
  const hash=createHash('sha256').update(JSON.stringify([req.method,req.originalUrl,req.body])).digest('hex'),json=res.json.bind(res);
  let captured:{status:number;body:unknown}|undefined;
  try{
   const receipt=await schoolTransaction(auth.schoolId,tx=>inPrismaTransaction(tx,async()=>{
    const previous=await tx.offlineOperation.findUnique({where:{id}});
    if(previous){if(previous.organizationId!==auth.schoolId||previous.actorId!==auth.userId||previous.requestHash!==hash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','This operation key belongs to different work.');return previous;}
    const body=await new Promise<unknown>((resolve,reject)=>{
     const timer=setTimeout(()=>reject(new AppError(503,'OFFLINE_SYNC_TIMEOUT','Sync did not finish. Retry the same saved change.')),25000);
     res.json=((value:unknown)=>{clearTimeout(timer);captured={status:res.statusCode,body:value};if(res.statusCode>=400)reject(new AppError(res.statusCode,'SYNC_REJECTED','Saved change was rejected.'));else resolve(JSON.parse(JSON.stringify(value)));return res;}) as typeof res.json;
     res.once('close',()=>{clearTimeout(timer);reject(new Error('Connection closed before sync completed'));});
     next();
    });
    return tx.offlineOperation.create({data:{id,organizationId:auth.schoolId!,actorId:auth.userId,requestHash:hash,status:res.statusCode,response:body as never}});
   }));
   res.json=json;if(!res.destroyed)res.status(receipt.status).json(receipt.response);
  }catch(cause){res.json=json;if(res.destroyed)return;if(captured&&captured.status>=400){res.status(captured.status).json(captured.body);return;}next(cause);}
 });
};
