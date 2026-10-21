"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentsService = exports.StudentsService = void 0;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const audit_service_1 = require("../audit/audit.service");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const resourceAccess_1 = require("../../auth/resourceAccess");
const admissionNumberHelper_1 = require("../../utils/helpers/admissionNumberHelper");
const studentInclude = {
    class: { select: { id: true, name: true, arm: true, level: true } },
};
class StudentsService {
    async createStudentRecord(organizationId, input) {
        const suppliedAdmissionNumber = input.admissionNumber?.trim();
        const shouldGenerateAdmissionNumber = !suppliedAdmissionNumber;
        for (let attempt = 0; attempt < 5; attempt++) {
            const admissionNumber = shouldGenerateAdmissionNumber
                ? (0, admissionNumberHelper_1.generateAdmissionNumber)()
                : suppliedAdmissionNumber;
            try {
                return await (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
                    const subscription = await tx.subscription.findUnique({ where: { organizationId } });
                    const activeCount = await tx.student.count({ where: { organizationId, isActive: true } });
                    if (activeCount >= (subscription?.studentCap ?? 100)) {
                        throw new errors_1.AppError(403, "STUDENT_CAP_REACHED", "Student subscription limit reached");
                    }
                    const created = await tx.student.create({
                        data: {
                            organizationId,
                            admissionNumber,
                            firstName: input.firstName,
                            lastName: input.lastName,
                            otherNames: input.otherNames ?? null,
                            gender: input.gender ?? null,
                            dateOfBirth: input.dateOfBirth ?? null,
                            classId: input.classId ?? null,
                            parentPhone: input.parentPhone ?? null,
                            parentEmail: input.parentEmail ?? null,
                        },
                        include: studentInclude,
                    });
                    if (input.sessionId && input.classId) {
                        await tx.studentEnrollment.create({
                            data: {
                                organizationId,
                                studentId: created.id,
                                classId: input.classId,
                                sessionId: input.sessionId,
                            },
                        });
                    }
                    return created;
                });
            }
            catch (error) {
                if ((0, admissionNumberHelper_1.isAdmissionNumberConflict)(error)) {
                    if (shouldGenerateAdmissionNumber && attempt < 4) {
                        continue;
                    }
                    throw new errors_1.AppError(409, "ADMISSION_EXISTS", "A student with this admission number already exists");
                }
                throw error;
            }
        }
        throw new errors_1.AppError(500, "ADMISSION_GENERATION_FAILED", "Unable to generate a unique admission number. Please try again.");
    }
    async list(organizationId, query, auth) {
        const where = {
            organizationId,
            ...(auth?.orgRole === "TEACHER" ? { class: (0, resourceAccess_1.teachingClassFilter)(auth) } : {}),
            ...(query.classId ? { classId: query.classId } : {}),
            ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
            ...(query.q
                ? {
                    OR: [
                        { admissionNumber: { contains: query.q, mode: "insensitive" } },
                        { firstName: { contains: query.q, mode: "insensitive" } },
                        { lastName: { contains: query.q, mode: "insensitive" } },
                        { otherNames: { contains: query.q, mode: "insensitive" } },
                    ],
                }
                : {}),
        };
        const skip = (query.page - 1) * query.limit;
        const [rows, total] = await Promise.all([
            prisma_1.prisma.student.findMany({
                where,
                include: studentInclude,
                orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
                skip,
                take: query.limit,
            }),
            prisma_1.prisma.student.count({ where }),
        ]);
        return {
            items: rows,
            meta: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit) || 1,
            },
        };
    }
    async get(organizationId, studentId, auth) {
        const student = await prisma_1.prisma.student.findFirst({
            where: { id: studentId, organizationId, ...(auth?.orgRole === "TEACHER" ? { class: (0, resourceAccess_1.teachingClassFilter)(auth) } : {}) },
            include: {
                ...studentInclude,
                parentLinks: {
                    include: {
                        parent: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                phone: true,
                                email: true,
                                userId: true,
                            },
                        },
                    },
                },
                enrollments: {
                    include: {
                        session: { select: { id: true, name: true } },
                        class: { select: { id: true, name: true, arm: true } },
                    },
                    orderBy: { createdAt: "desc" },
                },
            },
        });
        if (!student) {
            throw new errors_1.AppError(404, "NOT_FOUND", "Student not found");
        }
        return student;
    }
    async create(organizationId, actorId, input, requestId) {
        await this.assertUnderStudentCap(organizationId);
        if (input.classId) {
            await this.assertClassInOrg(organizationId, input.classId);
        }
        if (input.sessionId) {
            await this.assertSessionInOrg(organizationId, input.sessionId);
            if (!input.classId) {
                throw new errors_1.AppError(400, "CLASS_REQUIRED", "classId is required when sessionId is provided for enrollment");
            }
        }
        const student = await this.createStudentRecord(organizationId, input);
        await audit_service_1.auditService.write({
            action: "STUDENT_CREATED",
            actorId,
            organizationId,
            entity: "Student",
            entityId: student.id,
            metadata: {
                admissionNumber: student.admissionNumber,
                admissionNumberGenerated: !input.admissionNumber?.trim(),
            },
            requestId,
        });
        return student;
    }
    async bulkCreate(organizationId, actorId, input, requestId) {
        const results = [];
        for (const [index, studentInput] of input.students.entries()) {
            try {
                await this.assertUnderStudentCap(organizationId);
                if (studentInput.classId) {
                    await this.assertClassInOrg(organizationId, studentInput.classId);
                }
                if (studentInput.sessionId) {
                    await this.assertSessionInOrg(organizationId, studentInput.sessionId);
                    if (!studentInput.classId) {
                        throw new errors_1.AppError(400, "CLASS_REQUIRED", "classId is required when sessionId is provided for enrollment");
                    }
                }
                const student = await this.createStudentRecord(organizationId, studentInput);
                await audit_service_1.auditService.write({
                    action: "STUDENT_CREATED",
                    actorId,
                    organizationId,
                    entity: "Student",
                    entityId: student.id,
                    metadata: {
                        admissionNumber: student.admissionNumber,
                        admissionNumberGenerated: !studentInput.admissionNumber?.trim(),
                        bulkImport: true,
                        row: index + 1,
                    },
                    requestId,
                });
                results.push({
                    index: index + 1,
                    success: true,
                    admissionNumber: student.admissionNumber,
                    studentId: student.id,
                });
            }
            catch (error) {
                let message = "Unable to create student";
                if (error instanceof errors_1.AppError) {
                    message = error.message;
                }
                else {
                    console.error(`Bulk student creation failed on row ${index + 1}:`, error);
                }
                results.push({
                    index: index + 1,
                    success: false,
                    admissionNumber: studentInput.admissionNumber?.trim() || undefined,
                    error: message,
                });
            }
        }
        const createdCount = results.filter((result) => result.success).length;
        return {
            total: results.length,
            createdCount,
            failedCount: results.length - createdCount,
            results,
        };
    }
    // async create(
    //   organizationId: string,
    //   actorId: string,
    //   input: CreateInput,
    //   requestId?: string
    // ) {
    //   await this.assertUnderStudentCap(organizationId);
    //   if (input.classId) {
    //     await this.assertClassInOrg(organizationId, input.classId);
    //   }
    //   if (input.sessionId) {
    //     await this.assertSessionInOrg(organizationId, input.sessionId);
    //     if (!input.classId) {
    //       throw new AppError(
    //         400,
    //         "CLASS_REQUIRED",
    //         "classId is required when sessionId is provided for enrollment"
    //       );
    //     }
    //   }
    //   try {
    //     const student = await prisma.$transaction(async (tx) => {
    //       const created = await tx.student.create({
    //         data: {
    //           organizationId,
    //           admissionNumber: input.admissionNumber ?? "",
    //           firstName: input.firstName,
    //           lastName: input.lastName,
    //           otherNames: input.otherNames ?? null,
    //           gender: input.gender ?? null,
    //           dateOfBirth: input.dateOfBirth ?? null,
    //           classId: input.classId ?? null,
    //           parentPhone: input.parentPhone ?? null,
    //           parentEmail: input.parentEmail ?? null,
    //         },
    //         include: studentInclude,
    //       });
    //       if (input.sessionId && input.classId) {
    //         await tx.studentEnrollment.create({
    //           data: {
    //             organizationId,
    //             studentId: created.id,
    //             classId: input.classId,
    //             sessionId: input.sessionId,
    //           },
    //         });
    //       }
    //       return created;
    //     });
    //     await auditService.write({
    //       action: "STUDENT_CREATED",
    //       actorId,
    //       organizationId,
    //       entity: "Student",
    //       entityId: student.id,
    //       metadata: { admissionNumber: student.admissionNumber },
    //       requestId,
    //     });
    //     return student;
    //   } catch {
    //     throw new AppError(
    //       409,
    //       "ADMISSION_EXISTS",
    //       "A student with this admission number already exists"
    //     );
    //   }
    // }
    // async bulkCreate(
    //   organizationId: string,
    //   actorId: string,
    //   input: BulkCreateStudentsInput,
    //   requestId?: string
    // ) {
    //   const results: Array<{
    //     index: number;
    //     success: boolean;
    //     admissionNumber?: string;
    //     studentId?: string;
    //     error?: string;
    //   }> = [];
    //   for (const [index, studentInput] of input.students.entries()) {
    //     try {
    //       await this.assertUnderStudentCap(organizationId);
    //       if (studentInput.classId) {
    //         await this.assertClassInOrg(organizationId, studentInput.classId);
    //       }
    //       if (studentInput.sessionId) {
    //         await this.assertSessionInOrg(organizationId, studentInput.sessionId);
    //         if (!studentInput.classId) {
    //           throw new AppError(
    //             400,
    //             "CLASS_REQUIRED",
    //             "classId is required when sessionId is provided for enrollment"
    //           );
    //         }
    //       }
    //       const student = await prisma.$transaction(async (tx) => {
    //         const created = await tx.student.create({
    //           data: {
    //             organizationId,
    //             admissionNumber: studentInput.admissionNumber ?? "",
    //             firstName: studentInput.firstName,
    //             lastName: studentInput.lastName,
    //             otherNames: studentInput.otherNames ?? null,
    //             gender: studentInput.gender ?? null,
    //             dateOfBirth: studentInput.dateOfBirth ?? null,
    //             classId: studentInput.classId ?? null,
    //             parentPhone: studentInput.parentPhone ?? null,
    //             parentEmail: studentInput.parentEmail ?? null,
    //           },
    //           include: studentInclude,
    //         });
    //         if (studentInput.sessionId && studentInput.classId) {
    //           await tx.studentEnrollment.create({
    //             data: {
    //               organizationId,
    //               studentId: created.id,
    //               classId: studentInput.classId,
    //               sessionId: studentInput.sessionId,
    //             },
    //           });
    //         }
    //         return created;
    //       });
    //       await auditService.write({
    //         action: "STUDENT_CREATED",
    //         actorId,
    //         organizationId,
    //         entity: "Student",
    //         entityId: student.id,
    //         metadata: {
    //           admissionNumber: student.admissionNumber,
    //           bulkImport: true,
    //           row: index + 1,
    //         },
    //         requestId,
    //       });
    //       results.push({
    //         index: index + 1,
    //         success: true,
    //         admissionNumber: student.admissionNumber,
    //         studentId: student.id,
    //       });
    //     } catch (error) {
    //       let message = "Unable to create student";
    //       if (error instanceof AppError) {
    //         message = error.message;
    //       } else if (
    //         error instanceof Error &&
    //         "code" in error &&
    //         error.code === "P2002"
    //       ) {
    //         message = "A student with this admission number already exists";
    //       } else {
    //         console.error(
    //           `Bulk student creation failed on row ${index + 1}:`,
    //           error
    //         );
    //       }
    //       results.push({
    //         index: index + 1,
    //         success: false,
    //         admissionNumber: studentInput.admissionNumber,
    //         error: message,
    //       });
    //     }
    //   }
    //   const createdCount = results.filter((result) => result.success).length;
    //   const failedCount = results.length - createdCount;
    //   return {
    //     total: results.length,
    //     createdCount,
    //     failedCount,
    //     results,
    //   };
    // }
    async update(organizationId, studentId, actorId, input, requestId) {
        await this.requireStudent(organizationId, studentId);
        if (input.classId) {
            await this.assertClassInOrg(organizationId, input.classId);
        }
        try {
            const student = await prisma_1.prisma.student.update({
                where: { id: studentId },
                data: {
                    admissionNumber: input.admissionNumber,
                    firstName: input.firstName,
                    lastName: input.lastName,
                    otherNames: input.otherNames === undefined ? undefined : input.otherNames,
                    gender: input.gender === undefined ? undefined : input.gender,
                    dateOfBirth: input.dateOfBirth === undefined ? undefined : input.dateOfBirth,
                    classId: input.classId === undefined ? undefined : input.classId,
                    parentPhone: input.parentPhone === undefined ? undefined : input.parentPhone,
                    parentEmail: input.parentEmail === undefined ? undefined : input.parentEmail,
                },
                include: studentInclude,
            });
            await audit_service_1.auditService.write({
                action: "STUDENT_UPDATED",
                actorId,
                organizationId,
                entity: "Student",
                entityId: studentId,
                metadata: { fields: Object.keys(input) },
                requestId,
            });
            return student;
        }
        catch {
            throw new errors_1.AppError(409, "ADMISSION_EXISTS", "A student with this admission number already exists");
        }
    }
    async archive(organizationId, studentId, actorId, requestId) {
        await this.requireStudent(organizationId, studentId);
        const student = await prisma_1.prisma.student.update({
            where: { id: studentId },
            data: { isActive: false },
            include: studentInclude,
        });
        await audit_service_1.auditService.write({
            action: "STUDENT_ARCHIVED",
            actorId,
            organizationId,
            entity: "Student",
            entityId: studentId,
            requestId,
        });
        return student;
    }
    async enroll(organizationId, studentId, input) {
        await this.requireStudent(organizationId, studentId);
        await this.assertClassInOrg(organizationId, input.classId);
        await this.assertSessionInOrg(organizationId, input.sessionId);
        try {
            const [enrollment] = await prisma_1.prisma.$transaction([
                prisma_1.prisma.studentEnrollment.upsert({
                    where: {
                        studentId_sessionId: {
                            studentId,
                            sessionId: input.sessionId,
                        },
                    },
                    create: {
                        organizationId,
                        studentId,
                        classId: input.classId,
                        sessionId: input.sessionId,
                    },
                    update: { classId: input.classId },
                    include: {
                        class: { select: { id: true, name: true, arm: true } },
                        session: { select: { id: true, name: true } },
                    },
                }),
                prisma_1.prisma.student.update({
                    where: { id: studentId },
                    data: { classId: input.classId },
                }),
            ]);
            return enrollment;
        }
        catch {
            throw new errors_1.AppError(400, "ENROLL_FAILED", "Could not enroll student");
        }
    }
    /** Flat rows for Excel/CSV export (frontend can turn into file) */
    async exportRows(organizationId, auth) {
        const rows = await prisma_1.prisma.student.findMany({
            where: { organizationId, ...(auth?.orgRole === "TEACHER" ? { class: (0, resourceAccess_1.teachingClassFilter)(auth) } : {}) },
            include: {
                class: { select: { name: true, arm: true } },
            },
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        });
        return rows.map((s) => ({
            admissionNumber: s.admissionNumber,
            firstName: s.firstName,
            lastName: s.lastName,
            otherNames: s.otherNames ?? "",
            gender: s.gender ?? "",
            dateOfBirth: s.dateOfBirth
                ? s.dateOfBirth.toISOString().slice(0, 10)
                : "",
            className: s.class
                ? [s.class.name, s.class.arm].filter(Boolean).join(" ")
                : "",
            parentPhone: s.parentPhone ?? "",
            parentEmail: s.parentEmail ?? "",
            isActive: s.isActive ? "yes" : "no",
        }));
    }
    async requireStudent(organizationId, studentId) {
        const row = await prisma_1.prisma.student.findFirst({
            where: { id: studentId, organizationId },
            select: { id: true },
        });
        if (!row)
            throw new errors_1.AppError(404, "NOT_FOUND", "Student not found");
        return row;
    }
    async assertClassInOrg(organizationId, classId) {
        const row = await prisma_1.prisma.class.findFirst({
            where: { id: classId, organizationId, isActive: true },
            select: { id: true },
        });
        if (!row)
            throw new errors_1.AppError(400, "INVALID_CLASS", "Class not found");
    }
    async assertSessionInOrg(organizationId, sessionId) {
        const row = await prisma_1.prisma.academicSession.findFirst({
            where: { id: sessionId, organizationId },
            select: { id: true },
        });
        if (!row)
            throw new errors_1.AppError(400, "INVALID_SESSION", "Session not found");
    }
    async assertUnderStudentCap(organizationId) {
        const sub = await prisma_1.prisma.subscription.findUnique({
            where: { organizationId },
        });
        const cap = sub?.studentCap ?? 100;
        const count = await prisma_1.prisma.student.count({
            where: { organizationId, isActive: true },
        });
        if (count >= cap) {
            throw new errors_1.AppError(403, "STUDENT_CAP_REACHED", `Active student limit reached (${cap}). Upgrade your plan to add more.`);
        }
    }
}
exports.StudentsService = StudentsService;
exports.studentsService = new StudentsService();
// // src/features/students/student.service.ts
// import type { Class, Prisma, Student } from "@prisma/client";
// import { prisma } from "../../lib/prisma";
// import {
//   BadRequestError,
//   ConflictError,
//   ForbiddenError,
//   NotFoundError,
// } from "../../common/errors/AppError";
// import type {
//   BulkCreateStudentsBody,
//   CreateStudentBody,
//   ListStudentsQuery,
//   UpdateStudentBody,
// } from "./student.dto";
// import type { StudentPublic } from "./student.types";
// type StudentWithClass = Student & { class: Class | null };
// function requireSchoolId(schoolId: string | null | undefined): string {
//   if (!schoolId) {
//     throw new ForbiddenError("No school context");
//   }
//   return schoolId;
// }
// function classDisplayName(name: string, arm: string | null): string {
//   return arm ? `${name}${arm}` : name;
// }
// function toStudentPublic(row: StudentWithClass): StudentPublic {
//   return {
//     id: row.id,
//     organizationId: row.organizationId,
//     admissionNumber: row.admissionNumber,
//     firstName: row.firstName,
//     lastName: row.lastName,
//     otherNames: row.otherNames,
//     fullName: [row.firstName, row.otherNames, row.lastName]
//       .filter(Boolean)
//       .join(" "),
//     gender: row.gender,
//     classId: row.classId,
//     class: row.class
//       ? {
//           id: row.class.id,
//           name: row.class.name,
//           arm: row.class.arm,
//           level: row.class.level,
//           displayName: classDisplayName(row.class.name, row.class.arm),
//         }
//       : null,
//     parentPhone: row.parentPhone,
//     parentEmail: row.parentEmail,
//     isActive: row.isActive,
//     createdAt: row.createdAt,
//     updatedAt: row.updatedAt,
//   };
// }
// async function assertClassInSchool(
//   organizationId: string,
//   classId: string | null | undefined
// ) {
//   if (!classId) return;
//   const cls = await prisma.class.findFirst({
//     where: { id: classId, organizationId, isActive: true },
//   });
//   if (!cls) {
//     throw new BadRequestError("Class not found in this school");
//   }
// }
// /** e.g. ADM-2026-0001 */
// async function generateAdmissionNumber(
//   organizationId: string
// ): Promise<string> {
//   const year = new Date().getFullYear();
//   const prefix = `ADM-${year}-`;
//   const latest = await prisma.student.findFirst({
//     where: {
//       organizationId,
//       admissionNumber: { startsWith: prefix },
//     },
//     orderBy: { admissionNumber: "desc" },
//     select: { admissionNumber: true },
//   });
//   let next = 1;
//   if (latest?.admissionNumber) {
//     const tail = latest.admissionNumber.slice(prefix.length);
//     const n = parseInt(tail, 10);
//     if (!Number.isNaN(n)) next = n + 1;
//   }
//   // retry-safe unique attempts
//   for (let i = 0; i < 20; i++) {
//     const candidate = `${prefix}${String(next + i).padStart(4, "0")}`;
//     const exists = await prisma.student.findFirst({
//       where: { organizationId, admissionNumber: candidate },
//       select: { id: true },
//     });
//     if (!exists) return candidate;
//   }
//   return `${prefix}${Date.now().toString().slice(-6)}`;
// }
// function isPrismaUniqueViolation(err: unknown): boolean {
//   return (
//     typeof err === "object" &&
//     err !== null &&
//     "code" in err &&
//     (err as { code: string }).code === "P2002"
//   );
// }
// export const studentService = {
//   async list(schoolId: string | null | undefined, query: ListStudentsQuery) {
//     console.log("here 1");
//     const organizationId = requireSchoolId(schoolId);
//     const where: Prisma.StudentWhereInput = { organizationId };
//     if (query.isActive === "true") where.isActive = true;
//     if (query.isActive === "false") where.isActive = false;
//     if (query.classId) where.classId = query.classId;
//     if (query.gender) where.gender = query.gender;
//     if (query.search?.trim()) {
//       const q = query.search.trim();
//       where.OR = [
//         { firstName: { contains: q, mode: "insensitive" } },
//         { lastName: { contains: q, mode: "insensitive" } },
//         { otherNames: { contains: q, mode: "insensitive" } },
//         { admissionNumber: { contains: q, mode: "insensitive" } },
//         { parentPhone: { contains: q, mode: "insensitive" } },
//         { parentEmail: { contains: q, mode: "insensitive" } },
//       ];
//     }
//     const page = query.page ?? 1;
//     const pageSize = query.pageSize ?? 20;
//     const skip = (page - 1) * pageSize;
//     const [total, rows] = await Promise.all([
//       prisma.student.count({ where }),
//       prisma.student.findMany({
//         where,
//         include: { class: true },
//         orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
//         skip,
//         take: Number(pageSize),
//       }),
//     ]);
//     return {
//       items: rows.map(toStudentPublic),
//       meta: {
//         page,
//         pageSize,
//         total,
//         totalPages: Math.ceil(total / pageSize) || 1,
//       },
//     };
//   },
//   async getById(schoolId: string | null | undefined, id: string) {
//     const organizationId = requireSchoolId(schoolId);
//     const row = await prisma.student.findFirst({
//       where: { id, organizationId },
//       include: { class: true },
//     });
//     if (!row) throw new NotFoundError("Student not found");
//     return toStudentPublic(row);
//   },
//   async create(schoolId: string | null | undefined, input: CreateStudentBody) {
//     const organizationId = requireSchoolId(schoolId);
//     await assertClassInSchool(organizationId, input.classId);
//     let admissionNumber =
//       input.admissionNumber?.trim() ||
//       (await generateAdmissionNumber(organizationId));
//     try {
//       const row = await prisma.student.create({
//         data: {
//           organizationId,
//           admissionNumber,
//           firstName: input.firstName,
//           lastName: input.lastName,
//           otherNames: input.otherNames ?? null,
//           gender: input.gender ?? null,
//           classId: input.classId ?? null,
//           parentPhone: input.parentPhone ?? null,
//           parentEmail: input.parentEmail ?? null,
//           isActive: true,
//         },
//         include: { class: true },
//       });
//       return toStudentPublic(row);
//     } catch (err) {
//       if (isPrismaUniqueViolation(err)) {
//         throw new ConflictError(
//           "A student with this admission number already exists in your school"
//         );
//       }
//       throw err;
//     }
//   },
//   async update(
//     schoolId: string | null | undefined,
//     id: string,
//     input: UpdateStudentBody
//   ) {
//     console.log("Final stage updating");
//     const organizationId = requireSchoolId(schoolId);
//     const existing = await prisma.student.findFirst({
//       where: { id, organizationId },
//     });
//     if (!existing) throw new NotFoundError("Student not found");
//     if (input.classId !== undefined) {
//       await assertClassInSchool(organizationId, input.classId);
//     }
//     try {
//       const row = await prisma.student.update({
//         where: { id },
//         data: {
//           ...(input.firstName !== undefined
//             ? { firstName: input.firstName }
//             : {}),
//           ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
//           ...(input.otherNames !== undefined
//             ? { otherNames: input.otherNames }
//             : {}),
//           ...(input.admissionNumber !== undefined
//             ? { admissionNumber: input.admissionNumber }
//             : {}),
//           ...(input.gender !== undefined ? { gender: input.gender } : {}),
//           ...(input.classId !== undefined ? { classId: input.classId } : {}),
//           ...(input.parentPhone !== undefined
//             ? { parentPhone: input.parentPhone }
//             : {}),
//           ...(input.parentEmail !== undefined
//             ? { parentEmail: input.parentEmail }
//             : {}),
//           ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
//         },
//         include: { class: true },
//       });
//       return toStudentPublic(row);
//     } catch (err) {
//       if (isPrismaUniqueViolation(err)) {
//         throw new ConflictError(
//           "A student with this admission number already exists in your school"
//         );
//       }
//       throw err;
//     }
//   },
//   async remove(schoolId: string | null | undefined, id: string) {
//     const organizationId = requireSchoolId(schoolId);
//     const existing = await prisma.student.findFirst({
//       where: { id, organizationId },
//     });
//     if (!existing) throw new NotFoundError("Student not found");
//     const row = await prisma.student.update({
//       where: { id },
//       data: { isActive: false },
//       include: { class: true },
//     });
//     return toStudentPublic(row);
//   },
//   /**
//    * Best-effort bulk create.
//    * Returns created items + per-row errors (does not abort the whole batch).
//    */
//   async bulkCreate(
//     schoolId: string | null | undefined,
//     input: BulkCreateStudentsBody
//   ) {
//     const organizationId = requireSchoolId(schoolId);
//     const created: StudentPublic[] = [];
//     const errors: Array<{ index: number; message: string }> = [];
//     for (let i = 0; i < input.students.length; i++) {
//       const row = input.students[i];
//       try {
//         const student = await this.create(organizationId, row);
//         // create() expects schoolId; organizationId is the same value
//         created.push(student);
//       } catch (err) {
//         const message =
//           err instanceof Error ? err.message : "Failed to create student";
//         errors.push({ index: i, message });
//       }
//     }
//     return {
//       created,
//       errors,
//       meta: {
//         total: input.students.length,
//         successCount: created.length,
//         errorCount: errors.length,
//       },
//     };
//   },
// };
