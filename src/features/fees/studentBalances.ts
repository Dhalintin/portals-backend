import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

export const studentBalancesQuery = z.object({
  termId: z.string().uuid(),
  search: z.string().trim().max(120).default(''),
  paymentState: z.enum(['owing','unpaid','partial','paid','all']).default('owing'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine(n=>[25,50,100].includes(n),'Choose 25, 50 or 100 rows').default(25),
});
type Bill = {id:string;studentId:string;invoiceNumber:string;totalNgn:number;paidNgn:number;outstandingNgn:number;
  student:{firstName:string;lastName:string;admissionNumber:string;class:{name:string;arm:string|null}|null};items:{description:string;amountNgn:number}[]};
export function groupStudentBalances(bills:Bill[]) {
  const groups=new Map<string,{studentId:string;name:string;admissionNumber:string;className:string;totalNgn:number;paidNgn:number;outstandingNgn:number;items:string[];bills:Omit<Bill,'student'|'studentId'>[]}>();
  for(const bill of bills){
    let row=groups.get(bill.studentId);
    if(!row){row={studentId:bill.studentId,name:[bill.student.lastName,bill.student.firstName].filter(Boolean).join(', '),admissionNumber:bill.student.admissionNumber,className:bill.student.class?[bill.student.class.name,bill.student.class.arm].filter(Boolean).join(' '):'Unassigned',totalNgn:0,paidNgn:0,outstandingNgn:0,items:[],bills:[]};groups.set(bill.studentId,row);}
    row.totalNgn+=bill.totalNgn;row.paidNgn+=bill.paidNgn;row.outstandingNgn+=bill.outstandingNgn;
    for(const item of bill.items)if(!row.items.includes(item.description))row.items.push(item.description);
    row.bills.push({id:bill.id,invoiceNumber:bill.invoiceNumber,totalNgn:bill.totalNgn,paidNgn:bill.paidNgn,outstandingNgn:bill.outstandingNgn,items:bill.items});
  }
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.admissionNumber.localeCompare(b.admissionNumber)||a.studentId.localeCompare(b.studentId));
}
export async function studentBalances(organizationId:string,raw:unknown){
  const query=studentBalancesQuery.parse(raw);
  if(!await prisma.term.findFirst({where:{id:query.termId,session:{organizationId}},select:{id:true}}))throw new AppError(404,'TERM_NOT_FOUND','Term not found');
  const bills=await prisma.invoice.findMany({where:{organizationId,termId:query.termId,status:{notIn:['CANCELLED','DRAFT']}},select:{id:true,studentId:true,invoiceNumber:true,totalNgn:true,paidNgn:true,outstandingNgn:true,student:{select:{firstName:true,lastName:true,admissionNumber:true,class:{select:{name:true,arm:true}}}},items:{select:{description:true,amountNgn:true}}},orderBy:[{issuedAt:'asc'},{id:'asc'}]});
  const all=groupStudentBalances(bills);
  const summary={studentsBilled:all.length,studentsOwing:all.filter(r=>r.outstandingNgn>0).length,fullyPaid:all.filter(r=>r.outstandingNgn<=0).length,unpaid:all.filter(r=>r.outstandingNgn>0&&r.paidNgn===0).length,partlyPaid:all.filter(r=>r.outstandingNgn>0&&r.paidNgn>0).length};
  const q=query.search.toLowerCase();
  const rows=all.filter(row=>{
    const text=[row.name,row.admissionNumber,...row.bills.map(b=>b.invoiceNumber)].join(' ').toLowerCase();
    if(q&&!q.split(/\s+/).every(word=>text.includes(word)))return false;
    if(query.paymentState==='paid')return row.outstandingNgn<=0;
    if(query.paymentState==='unpaid')return row.outstandingNgn>0&&row.paidNgn===0;
    if(query.paymentState==='partial')return row.outstandingNgn>0&&row.paidNgn>0;
    return query.paymentState==='all'||row.outstandingNgn>0;
  });
  const totalPages=Math.max(1,Math.ceil(rows.length/query.pageSize)),page=Math.min(query.page,totalPages);
  return {items:rows.slice((page-1)*query.pageSize,page*query.pageSize),summary,meta:{page,pageSize:query.pageSize,total:rows.length,totalPages}};
}
