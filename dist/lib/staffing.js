"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEACHING_ROLES = void 0;
exports.requireTeachingMember = requireTeachingMember;
exports.requireCurriculum = requireCurriculum;
exports.clearStaffAssignments = clearStaffAssignments;
const errors_1 = require("./errors");
exports.TEACHING_ROLES = ["TEACHER", "EXAM_OFFICER", "PRINCIPAL", "SCHOOL_ADMIN", "PROPRIETOR", "STAFF"];
async function requireTeachingMember(tx, organizationId, userId) {
    const membership = await tx.membership.findFirst({ where: { organizationId, userId, isActive: true,
            user: { isActive: true }, role: { in: [...exports.TEACHING_ROLES] } } });
    if (!membership)
        throw new errors_1.AppError(400, "INVALID_TEACHER", "User is not an active teaching staff member of this school");
    return membership;
}
async function requireCurriculum(tx, organizationId, classId, subjectId) {
    const linked = await tx.classSubject.findFirst({ where: { organizationId, classId, subjectId,
            class: { organizationId, isActive: true }, subject: { organizationId, isActive: true } } });
    if (!linked)
        throw new errors_1.AppError(400, "SUBJECT_NOT_LINKED", "An active class and subject on its curriculum are required");
    return linked;
}
async function clearStaffAssignments(tx, organizationId, userId) {
    await tx.class.updateMany({ where: { organizationId, classTeacherId: userId }, data: { classTeacherId: null } });
    await tx.classSubjectTeacher.deleteMany({ where: { organizationId, userId } });
}
