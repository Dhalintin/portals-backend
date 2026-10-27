/* Creates additional test accounts only. Refuses to reset or overwrite existing users. */
require('dotenv').config({quiet:true});
const {randomBytes}=require('node:crypto');
const {prisma}=require('../dist/lib/prisma');
const {hashPassword,verifyPassword}=require('../dist/lib/password');
const schoolId=process.argv[2];
if(!/^[a-f0-9-]{36}$/i.test(schoolId||''))throw new Error('Pass the exact school UUID.');
(async()=>{
 try{
 const school=await prisma.organization.findFirst({where:{id:schoolId,isActive:true},select:{id:true,name:true,createdById:true}});
 if(!school)throw new Error('School not found');
 const definitions=[['PROPRIETOR','owner','Owner'],['PRINCIPAL','principal','Principal'],['SCHOOL_ADMIN','admin','SchoolAdmin'],['BURSAR','bursar','Bursar'],['TEACHER','teacher','Teacher'],['EXAM_OFFICER','exams','ExamOfficer'],['STAFF','staff','Staff'],['PARENT','parent','Parent']];
 const users=[];
 for(const [role,label,lastName] of definitions){const password='T7!'+randomBytes(9).toString('base64url')+'aA';users.push({role,lastName,email:`test.${label}.${schoolId.slice(0,8)}@portal.test`,password,passwordHash:await hashPassword(password)});}
 const result=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId})::bigint)`;
  if(await tx.user.count({where:{email:{in:users.map(user=>user.email)}}}))throw new Error('A test email already exists. No accounts changed.');
  const created=[];
  for(const record of users){const user=await tx.user.create({data:{email:record.email,firstName:'Test',lastName:record.lastName,passwordHash:record.passwordHash,isActive:true,globalRole:'USER'}});await tx.membership.create({data:{organizationId:schoolId,userId:user.id,role:record.role,isActive:true}});created.push({...record,id:user.id});await tx.auditLog.create({data:{organizationId:schoolId,actorId:school.createdById,action:'OTHER',entity:'User',entityId:user.id,metadata:{operation:'TEST_ACCOUNT_PROVISIONED',role:record.role}}});}
  const student=await tx.student.findFirst({where:{organizationId:schoolId,isActive:true},orderBy:{createdAt:'asc'},select:{id:true,classId:true}});
  const parentUser=created.find(record=>record.role==='PARENT');
  const parent=await tx.parent.create({data:{organizationId:schoolId,userId:parentUser.id,firstName:'Test',lastName:'Parent',email:parentUser.email}});
  if(student)await tx.parentStudent.create({data:{organizationId:schoolId,parentId:parent.id,studentId:student.id,isPrimary:true,relation:'Test guardian'}});
  let teachingAssignments=0;
  if(student?.classId){const subjects=await tx.classSubject.findMany({where:{organizationId:schoolId,classId:student.classId,subject:{isActive:true},class:{isActive:true}},select:{subjectId:true}});const teacher=created.find(record=>record.role==='TEACHER');for(const subject of subjects){if(!await tx.classSubjectTeacher.findUnique({where:{classId_subjectId:{classId:student.classId,subjectId:subject.subjectId}}})){await tx.classSubjectTeacher.create({data:{organizationId:schoolId,classId:student.classId,subjectId:subject.subjectId,userId:teacher.id}});teachingAssignments++;}}}
  return {school:school.name,parentLinked:!!student,teachingAssignments,users:created.map(({role,email,password,id})=>({role,email,password,id}))};
 },{maxWait:10000,timeout:30000});
 for(const user of result.users){const saved=await prisma.user.findUniqueOrThrow({where:{id:user.id}});if(!await verifyPassword(user.password,saved.passwordHash))throw new Error('Saved password verification failed');}
 console.log(JSON.stringify({...result,verified:true,users:result.users.map(({id,...user})=>user)}));
 }catch(error){console.error(error.code||error.message);process.exitCode=1;}finally{await prisma.$disconnect();}
})();
